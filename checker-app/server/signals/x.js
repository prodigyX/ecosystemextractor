import { fetchTimeout, ev, daysAgo, fmtDate, fmtDateTime } from '../util.js'
import {
  X_RESULT_CACHE_ENABLED,
  X_LAST_POST_AGE_DAYS,
  X_SYNDICATION_COOLDOWN_MS,
  X_SYNDICATION_INTERVAL_MS,
  SIGNAL_FRESH_FETCH_MS,
  SIGNAL_FRESH_FETCH_DAYS,
  X_FALLBACK_REFETCH_MS,
  X_FALLBACK_REFETCH_DAYS,
  X_FOLLOWER_THRESHOLDS,
  SCORE_WEIGHTS,
} from '../config.js'
import { recordXRateLimit, recordXOfficialRateLimit } from '../rateLimitStatus.js'
import { getXFallback, saveXFallback } from '../xFallback.js'

const W = SCORE_WEIGHTS.x

export function xHandleFromUrl(url) {
  const m = url.match(/(?:x\.com|twitter\.com)\/@?([\w]+)/i)
  const handle = m?.[1]
  if (!handle) return null
  if (['home', 'search', 'explore', 'intent', 'share', 'i'].includes(handle.toLowerCase())) return null
  return handle
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The unauthenticated syndication endpoint throttles sustained batches. Keeping
// requests to about six per minute lets more projects complete before that
// happens, while the optional official API below avoids this limit entirely.
// Pacing state is process-wide (harmless: worst case is an extra short wait),
// but the 429 cooldown itself lives only on the per-run xState below. A
// module-level cooldown would survive on a warm serverless instance across
// unrelated requests and silently skip the network call on a fresh run/IP —
// and "Clear check cache" would not reset it either, since it's separate
// from the signal-result store.
let nextAllowedAt = 0
async function paced() {
  const wait = nextAllowedAt - Date.now()
  nextAllowedAt = Math.max(Date.now(), nextAllowedAt) + X_SYNDICATION_INTERVAL_MS
  if (wait > 0) await sleep(wait)
}

function attempt(source, status, detail = null) {
  return { source, status, detail }
}

const DISCORD_LINK_RE = /https?:\/\/[^\s"'<>]*(?:discord\.gg|discord\.com\/invite)\/[\w-]+/i
const TELEGRAM_LINK_RE = /https?:\/\/[^\s"'<>]*t\.me\/[\w+]+/i
const LINK_AGGREGATOR_RE = /(?:linktr\.ee|bio\.link|beacons\.ai|lnk\.bio|solo\.to|campsite\.bio|taplink\.cc|msha\.ke|direct\.me|allmylinks\.com)\/[\w-]+/i

function scanTextForSocialLinks(text) {
  return {
    discordLink: text.match(DISCORD_LINK_RE)?.[0] ?? null,
    telegramLink: text.match(TELEGRAM_LINK_RE)?.[0] ?? null,
  }
}

/**
 * Some projects put a Linktree (or similar link-in-bio aggregator) as their
 * one X profile link instead of a direct Discord/Telegram invite. Fetches
 * that page and scans it the same way. Linktree itself server-renders its
 * link list into a `__NEXT_DATA__` JSON blob (like X's own syndication
 * page) — parsed for precision when present; otherwise falls back to a raw
 * text scan, which still works fine for simpler link-list services.
 */
async function scanLinkAggregatorPage(url) {
  try {
    const res = await fetchTimeout(url, {}, 8000)
    if (!res.ok) return { discordLink: null, telegramLink: null }
    const html = await res.text()
    const nextData = html.match(/__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (nextData) {
      try {
        const links = JSON.parse(nextData[1])?.props?.pageProps?.links
        if (Array.isArray(links)) {
          return scanTextForSocialLinks(links.map((l) => l?.url).filter(Boolean).join(' '))
        }
      } catch {
        // Malformed/unexpected JSON — fall through to the raw HTML scan below.
      }
    }
    return scanTextForSocialLinks(html)
  } catch {
    return { discordLink: null, telegramLink: null }
  }
}

/**
 * Scans an fxtwitter user object's bio (description text, its t.co-expanded
 * "facets", and the profile's pinned website link) for a Discord/Telegram
 * invite — some projects only ever put these in their X bio, never on the
 * homepage. If the only link found is a link-aggregator page (Linktree etc.)
 * rather than a direct invite, follows it one level to look there too. Only
 * a supplementary source: server/pipeline.js prefers whatever the homepage
 * scrape (server/signals/content.js) already found.
 */
async function findSocialLinksInBio(user) {
  // Bio and website are the obvious spots, but some projects repurpose the
  // profile's "location" field as a link slot too (X only gives you one
  // prominent link field, so location is a common workaround) — scan all
  // three plus any expanded link entities in the bio.
  const candidates = [user?.website?.url, user?.description, user?.location]
  for (const facet of user?.raw_description?.facets || []) {
    if (facet?.type === 'url' && facet.replacement) candidates.push(facet.replacement)
  }
  let discordLink = null
  let telegramLink = null
  let aggregatorUrl = null
  for (const text of candidates) {
    if (!text) continue
    const found = scanTextForSocialLinks(text)
    discordLink ??= found.discordLink
    telegramLink ??= found.telegramLink
    if (!aggregatorUrl) aggregatorUrl = text.match(LINK_AGGREGATOR_RE)?.[0] ?? null
  }
  if ((!discordLink || !telegramLink) && aggregatorUrl) {
    const fromAggregator = await scanLinkAggregatorPage(`https://${aggregatorUrl}`)
    discordLink ??= fromAggregator.discordLink
    telegramLink ??= fromAggregator.telegramLink
  }
  return { discordLink, telegramLink }
}

/** FxTwitter user API: reliable existence/profile stats, but no post dates. */
async function viaFxTwitter(handle) {
  const res = await fetchTimeout(
    `https://api.fxtwitter.com/${handle}`,
    { redirect: 'manual' },
    10000
  )
  if (res.status === 302 || res.status === 404) return { exists: false }
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.user) return null
  return {
    exists: true,
    userId: data.user.id ?? null,
    followers: data.user.followers ?? null,
    tweetCount: data.user.tweets ?? null,
    protected: data.user.protected === true,
    ...(await findSocialLinksInBio(data.user)),
  }
}

/** Official X user timeline. Used when X_BEARER_TOKEN is configured. */
async function viaOfficialX(userId, token) {
  const params = new URLSearchParams({ max_results: '5', 'tweet.fields': 'created_at' })
  const res = await fetchTimeout(
    `https://api.x.com/2/users/${userId}/tweets?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
    12000
  )
  // Capture the live quota headers regardless of outcome — this is a genuine
  // live call against this app's own reserved API quota, tracked separately
  // from syndication's shared public quota (see server/rateLimitStatus.js).
  await recordXOfficialRateLimit(res.headers)
  if (res.status === 401 || res.status === 403) {
    return { result: null, attempt: attempt('official-api', 'auth-error', `HTTP ${res.status}`) }
  }
  if (res.status === 429) {
    return { result: null, attempt: attempt('official-api', 'rate-limited', 'HTTP 429') }
  }
  if (!res.ok) {
    return { result: null, attempt: attempt('official-api', 'http-error', `HTTP ${res.status}`) }
  }

  const data = await res.json()
  const dates = (data?.data ?? [])
    .map((post) => post?.created_at)
    .filter(Boolean)
    .map((date) => new Date(date).getTime())
    .filter((time) => !Number.isNaN(time) && time <= Date.now())
  if (!dates.length) {
    return { result: null, attempt: attempt('official-api', 'no-public-posts') }
  }
  return {
    result: { exists: true, latestPost: new Date(Math.max(...dates)).toISOString() },
    attempt: attempt('official-api', 'success'),
  }
}

/** Unauthenticated Twitter syndication timeline. */
async function viaSyndication(handle, xState) {
  const blockedUntil = xState?.syndicationBlockedUntil ?? 0
  if (xState?.syndicationBlocked || blockedUntil > Date.now()) {
    const detail = blockedUntil > Date.now()
      ? `cooldown until ${new Date(blockedUntil).toISOString()}`
      : 'skipped after an earlier HTTP 429 in this batch'
    return {
      result: null,
      attempt: attempt('syndication', 'rate-limited', detail),
    }
  }
  await paced()
  const res = await fetchTimeout(
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
    {},
    10000
  )
  // Capture the live quota headers regardless of outcome (including 429) —
  // this is a genuine live call, unlike a cache hit, so it's the only place
  // that can tell the footer anything new about the current X quota.
  await recordXRateLimit(res.headers)
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after')
    const retrySeconds = Number(retryAfter)
    const cooldownMs = Number.isFinite(retrySeconds) && retrySeconds > 0
      ? retrySeconds * 1000
      : X_SYNDICATION_COOLDOWN_MS
    if (xState) {
      xState.syndicationBlocked = true
      xState.syndicationBlockedUntil = Date.now() + cooldownMs
    }
    return {
      result: null,
      attempt: attempt('syndication', 'rate-limited', retryAfter ? `HTTP 429 · retry after ${retryAfter}s` : 'HTTP 429'),
    }
  }
  if (!res.ok) {
    return { result: null, attempt: attempt('syndication', 'http-error', `HTTP ${res.status}`) }
  }

  const html = await res.text()
  const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!jsonMatch) {
    return { result: null, attempt: attempt('syndication', 'unexpected-response') }
  }

  let data
  try {
    data = JSON.parse(jsonMatch[1])
  } catch {
    return { result: null, attempt: attempt('syndication', 'unexpected-response', 'Invalid timeline JSON') }
  }
  const entries = data?.props?.pageProps?.timeline?.entries || []
  const tweets = entries.map((entry) => entry?.content?.tweet).filter(Boolean)
  const dates = tweets
    .map((tweet) => tweet.created_at)
    .filter(Boolean)
    .map((date) => new Date(date).getTime())
    .filter((time) => !Number.isNaN(time) && time <= Date.now())
  // Every timeline tweet carries the owning profile snapshot, so one
  // syndication response can provide both the last-post date and audience
  // statistics. Prefer a matching owner in case an entry embeds a retweet.
  const user = tweets.find(
    (tweet) => tweet?.user?.screen_name?.toLowerCase() === handle.toLowerCase()
  )?.user ?? tweets.find((tweet) => tweet?.user)?.user
  const profile = user
    ? {
        exists: true,
        userId: user.id_str ?? null,
        followers: user.followers_count ?? user.normal_followers_count ?? null,
        tweetCount: user.statuses_count ?? null,
        protected: user.protected === true,
      }
    : null

  if (!dates.length) {
    return { result: profile, attempt: attempt('syndication', 'no-public-posts') }
  }
  return {
    result: {
      ...profile,
      exists: true,
      latestPost: new Date(Math.max(...dates)).toISOString(),
    },
    attempt: attempt('syndication', 'success'),
  }
}

function metricEvidence(metric, level, label, detail, delta) {
  return { ...ev(level, label, detail, delta), metric }
}

export function followerEvidence(handle, result) {
  const followers = result.followers
  const postCount = result.tweetCount?.toLocaleString() ?? '?'
  const detail = followers == null
    ? `@${handle}`
    : `@${handle} · ${followers.toLocaleString()} followers, ${postCount} posts`

  if (followers == null) {
    return metricEvidence('x-followers', 'info', 'X follower count unavailable', detail, 0)
  }
  // X is one of the two primary "is this project alive at all" signals (with
  // website liveness), so its deltas are weighted higher than secondary
  // community signals like Discord/Telegram. Below X_FOLLOWER_THRESHOLDS.veryLow,
  // a real project's account rarely has that thin an audience — it reads as a
  // possible clone/scam rather than just a weak one, so it's a 'bad' signal
  // (caps the overall score) instead of a 'warn'.
  const { veryLow, weak, decent, established } = X_FOLLOWER_THRESHOLDS
  if (followers >= established) {
    return metricEvidence('x-followers', 'good', `X established audience (${established / 1000}K+ followers)`, detail, W.followerEstablished)
  }
  if (followers >= decent) {
    return metricEvidence('x-followers', 'good', `X decent audience (${decent / 1000}K+ followers)`, detail, W.followerDecent)
  }
  if (followers > weak) {
    return metricEvidence('x-followers', 'info', `X small audience (${weak / 1000}K+ followers)`, detail, W.followerSmall)
  }
  if (followers >= veryLow) {
    return metricEvidence('x-followers', 'warn', `X weak audience (${veryLow / 1000}K–${weak / 1000}K followers)`, detail, W.followerWeak)
  }
  return metricEvidence(
    'x-followers',
    'bad',
    `X very low audience (<${veryLow / 1000}K followers) — possible clone/scam`,
    detail,
    W.followerVeryLow
  )
}

/** Short "(live)" / "(cached)" / "(stale cache)" / "(fallback)" tag so a shown date's trustworthiness is visible at a glance, not just inferred. */
function freshnessTag(postSource) {
  if (postSource === 'cache') return ' (cached)'
  if (postSource === 'stale-cache') return ' (stale cache)'
  if (postSource === 'x-fallback') return ' (fallback)'
  if (postSource === 'official-api' || postSource === 'syndication') return ' (live)'
  return ''
}

/**
 * " · last fetched <when> · next fetch due <when>" suffix so a cached/fallback
 * date's own freshness is visible right on the evidence line, not just
 * inferred from the "(cached)"/"(fallback)" tag. `fetchedAt` is when postSource's
 * underlying record was actually written (signal_cache's checkedAt, x_fallback's
 * fetchedAt, or "now" for a live call this run).
 */
function freshnessDetail(postSource, fetchedAt) {
  if (!fetchedAt) return ''
  const fetchedMs = new Date(fetchedAt).getTime()
  if (Number.isNaN(fetchedMs)) return ''
  if (postSource === 'stale-cache') {
    return ` · last fetched ${fmtDateTime(fetchedMs)} · next fetch: retried live on the next run`
  }
  const windowMs = postSource === 'x-fallback' ? X_FALLBACK_REFETCH_MS : SIGNAL_FRESH_FETCH_MS
  return ` · last fetched ${fmtDateTime(fetchedMs)} · next fetch due ${fmtDateTime(fetchedMs + windowMs)}`
}

export function lastPostEvidence(handle, latestPost, postSource, unavailableDetail = null, fetchedAt = null) {
  if (!latestPost) {
    return metricEvidence(
      'x-last-post',
      'info',
      'X last post unavailable',
      unavailableDetail || `@${handle} · no public post timestamp returned`,
      0
    )
  }

  const tag = freshnessTag(postSource)
  const freshness = freshnessDetail(postSource, fetchedAt)
  const age = daysAgo(latestPost)
  if (age == null) {
    return metricEvidence('x-last-post', 'info', 'X last post date invalid', `@${handle}`, 0)
  }
  if (age <= X_LAST_POST_AGE_DAYS.active) {
    return metricEvidence('x-last-post', 'good', `X active (posted ≤${X_LAST_POST_AGE_DAYS.active}d)`, `@${handle} · ${fmtDate(latestPost)}${tag}${freshness}`, W.postActive)
  }
  if (age <= X_LAST_POST_AGE_DAYS.recent) {
    return metricEvidence('x-last-post', 'good', `X recent (posted ≤${X_LAST_POST_AGE_DAYS.recent}d)`, `@${handle} · ${fmtDate(latestPost)}${tag}${freshness}`, W.postRecent)
  }
  if (age <= X_LAST_POST_AGE_DAYS.quiet) {
    return metricEvidence('x-last-post', 'warn', `X quiet (${X_LAST_POST_AGE_DAYS.recent + 1}–${X_LAST_POST_AGE_DAYS.quiet}d)`, `@${handle} · ${fmtDate(latestPost)}${tag}${freshness}`, W.postQuiet)
  }
  if (age <= X_LAST_POST_AGE_DAYS.silent) {
    return metricEvidence('x-last-post', 'bad', `X silent >${X_LAST_POST_AGE_DAYS.quiet}d — likely no progress`, `@${handle} · last post ${fmtDate(latestPost)}${tag}${freshness}`, W.postSilentOverQuiet)
  }
  return metricEvidence('x-last-post', 'bad', `X silent >${X_LAST_POST_AGE_DAYS.silent}d — project likely abandoned`, `@${handle} · last post ${fmtDate(latestPost)}${tag}${freshness}`, W.postSilentOverSilent)
}

function unavailablePostSummary(result, attempts) {
  if (result?.protected) {
    return { status: 'protected', detail: 'This account protects its posts.' }
  }
  if (attempts.some((item) => item.status === 'rate-limited')) {
    return {
      status: 'rate-limited',
      detail: 'X rate-limited the timeline request; no other live source had a post timestamp.',
    }
  }
  if (attempts.some((item) => item.status === 'no-public-posts')) {
    return { status: 'no-public-posts', detail: 'No public posts were returned for this account.' }
  }
  const failed = attempts.filter((item) => item.status !== 'success')
  const detail = failed.length
    ? failed.map((item) => `${item.source}: ${item.status}${item.detail ? ` (${item.detail})` : ''}`).join(' · ')
    : 'No public post timestamp was returned.'
  return { status: 'unavailable', detail }
}

function profileSnapshot(result) {
  if (!result) return null
  return {
    exists: result.exists,
    userId: result.userId ?? null,
    followers: result.followers ?? null,
    tweetCount: result.tweetCount ?? null,
    protected: result.protected === true,
    suspended: result.suspended === true,
    discordLink: result.discordLink ?? null,
    telegramLink: result.telegramLink ?? null,
  }
}

function mergeProfile(current, next) {
  if (!next) return current
  return {
    exists: next.exists ?? current?.exists,
    userId: next.userId ?? current?.userId ?? null,
    followers: next.followers ?? current?.followers ?? null,
    tweetCount: next.tweetCount ?? current?.tweetCount ?? null,
    protected: next.protected ?? current?.protected ?? false,
    suspended: next.suspended ?? current?.suspended ?? false,
    discordLink: next.discordLink ?? current?.discordLink ?? null,
    telegramLink: next.telegramLink ?? current?.telegramLink ?? null,
  }
}

function runQueued(queue, fn) {
  return queue ? queue(fn) : fn()
}

export async function checkX(project, ctx) {
  const evidence = []
  const facts = {
    xHandle: null,
    xExists: null,
    xLatestPost: null,
    xFollowers: null,
    xProfileSource: null,
    xPostSource: null,
    xPostStatus: null,
    xPostDetail: null,
    xPostAttempts: [],
    xSource: null,
    // Discord/Telegram invites discovered in the X bio (see viaFxTwitter /
    // findSocialLinksInBio above) — a supplementary source for
    // server/pipeline.js, used only when the homepage scrape found nothing.
    xDiscordLink: null,
    xTelegramLink: null,
  }
  // No X presence at all is a real red flag for a crypto/Web3 project, not
  // just missing data — same severity class as a near-empty audience.
  if (!project.x) return { facts, evidence: [ev('bad', 'No X link found', null, W.noLink)] }

  const handle = xHandleFromUrl(project.x)
  if (!handle) return { facts, evidence: [ev('info', 'Could not parse X handle', project.x, 0)] }
  facts.xHandle = handle

  // Rate-limit protection: this record (this exact handle) only gets a live
  // API call if it's been more than SIGNAL_FRESH_FETCH_DAYS since its own
  // last *successful* fetch — otherwise reuse the cached result outright and
  // skip every live source below. Each handle's cache entry is independent.
  const cacheKey = `x:${handle.toLowerCase()}`
  const cached = (await ctx.store?.get(cacheKey)) ?? null
  const lastFetchedAt = cached?.checkedAt ? new Date(cached.checkedAt).getTime() : NaN
  const cacheAgeMs = Number.isNaN(lastFetchedAt) ? Infinity : Date.now() - lastFetchedAt
  // A last-post date that only ever came from the logged-out Puppeteer scrape
  // isn't trustworthy enough to skip a live retry for the full cache window:
  // X sometimes serves that scrape a stale/decoy snapshot with zero live data
  // behind it (confirmed — no real timeline API call fires at all), so a
  // puppeteer-sourced date can be silently wrong by months. Don't let it
  // block a live retry once syndication/the official API might be available
  // again; other sources' results are trusted for the full window as normal.
  const cachedPostIsTrustworthy = cached?.postSource !== 'puppeteer'
  const freshCache = X_RESULT_CACHE_ENABLED && Boolean(cached?.result) &&
    cacheAgeMs < SIGNAL_FRESH_FETCH_MS && cachedPostIsTrustworthy

  // Durable fallback (server/xFallback.js): consulted only once the regular
  // cache above is stale or was cleared. If it's still within its own
  // (longer, clear-immune) window, reuse it instead of hitting X again —
  // this is the hard floor that survives "Clear check cache".
  const fallback = freshCache ? null : await getXFallback(handle.toLowerCase())
  const fallbackAgeMs = fallback?.fetchedAt ? Date.now() - new Date(fallback.fetchedAt).getTime() : Infinity
  const fallbackIsFresh = Boolean(fallback?.result) && fallbackAgeMs < X_FALLBACK_REFETCH_MS

  let profile = freshCache ? profileSnapshot(cached.result) : null
  let postResult = freshCache ? cached.result : null
  let profileSource = freshCache ? 'cache' : null
  let postSource = freshCache ? 'cache' : null
  const postAttempts = []

  if (freshCache) {
    postAttempts.push(attempt('cache', cached.result.latestPost ? 'success' : 'cached'))
  } else if (fallbackIsFresh) {
    profile = profileSnapshot(fallback.result)
    postResult = fallback.result
    profileSource = 'x-fallback'
    postSource = 'x-fallback'
    postAttempts.push(attempt(
      'x-fallback',
      fallback.result.latestPost ? 'success' : 'cached',
      `Reusing the durable fallback record from ${fmtDate(fallback.fetchedAt)} (within the ${X_FALLBACK_REFETCH_DAYS}-day floor).`
    ))
  } else {
    // The official API needs a user ID, so its configured path starts with the
    // lightweight profile lookup. The default unauthenticated path skips that
    // request and lets syndication return profile + timeline data together.
    if (ctx.env?.X_BEARER_TOKEN) {
      if (!profile?.userId && profile?.exists !== false) {
        try {
          const fx = await viaFxTwitter(handle)
          if (fx) {
            profile = profileSnapshot(fx)
            profileSource = 'fxtwitter'
          }
        } catch {
          // Fall through to public sources.
        }
      }

      if (profile?.exists !== false && !profile?.protected && profile?.userId) {
        try {
          const official = await viaOfficialX(profile.userId, ctx.env.X_BEARER_TOKEN)
          postAttempts.push(official.attempt)
          if (official.result) {
            postResult = official.result
            postSource = 'official-api'
          }
        } catch (error) {
          postAttempts.push(attempt('official-api', 'failed', error.message))
        }
      }
    }

    // Once an official API token is configured, syndication is never used at
    // all: it's an unauthenticated public endpoint sharing one rate-limit
    // pool with every other caller on the same IP (the exact fragility this
    // whole cache/fallback design exists to work around), while the official
    // API is reliable and reserved to this app's own quota. If a live
    // official-api attempt above didn't produce a result, the stale-cache
    // fallback further below reuses whatever this handle's last successful
    // official-api fetch found — even past the normal freshness window —
    // rather than ever risking syndication as a substitute.
    if (!postResult && !ctx.env?.X_BEARER_TOKEN && profile?.exists !== false && !profile?.protected) {
      try {
        const syndication = await runQueued(
          ctx.xTimelineQueue,
          () => viaSyndication(handle, ctx.xState)
        )
        postAttempts.push(syndication.attempt)
        if (syndication.result) {
          const syndicationProfile = profileSnapshot(syndication.result)
          profile = mergeProfile(profile, syndicationProfile)
          if (syndicationProfile.followers != null) profileSource = 'syndication'
          postResult = syndication.result
          if (syndication.result.latestPost) postSource = 'syndication'
        }
      } catch (error) {
        postAttempts.push(attempt('syndication', 'failed', error.message))
      }
    }

    // No logged-out-browser fallback for the post date: X reliably serves
    // that scrape a stale/decoy snapshot for many accounts (confirmed — the
    // page never fires a single live timeline API call), so a puppeteer-
    // sourced date can be silently wrong by months. If official-api and
    // syndication both come up empty, the post is honestly "unavailable"
    // rather than risking a wrong-but-confident-looking answer. Profile data
    // still gets one more attempt via fxtwitter if still missing.
    const needsProfile = profile?.exists == null ||
      (profile.exists !== false && profile.followers == null)
    if (needsProfile) {
      try {
        const fx = await viaFxTwitter(handle)
        if (fx) {
          profile = mergeProfile(profile, profileSnapshot(fx))
          profileSource = 'fxtwitter'
        }
      } catch {
        // Profile just stays whatever was already resolved above.
      }
    }
  }

  // If a live fetch was attempted but came back with no definitive answer,
  // fall back to displaying the last known cached result (of any age) rather
  // than reporting nothing — but this does *not* count as a fresh successful
  // fetch, so the next run still retries live sources immediately.
  let result
  if (profile?.exists === false) {
    result = profile
  } else if (postResult?.exists === false) {
    result = { ...profile, ...postResult }
  } else if (postResult?.latestPost) {
    result = { ...profile, ...postResult }
  } else if (!freshCache && !fallbackIsFresh && cached?.result && profile?.exists !== false) {
    result = { ...cached.result, ...profile, ...postResult, latestPost: cached.result.latestPost }
    postSource = 'stale-cache'
    postAttempts.push(attempt('stale-cache', 'success', 'live X sources were unavailable; showing the last known result'))
  } else {
    result = { ...profile, ...postResult }
  }

  facts.xPostAttempts = postAttempts
  if (!result || result.exists == null) {
    facts.xPostStatus = 'unavailable'
    facts.xPostDetail = 'X blocked both profile and timeline checks.'
    evidence.push(ev('info', 'X activity unknown (blocked from checking)', `@${handle}`, 0))
    return { facts, evidence }
  }

  facts.xExists = result.exists
  facts.xLatestPost = result.latestPost ?? null
  facts.xFollowers = result.followers ?? null
  facts.xDiscordLink = result.discordLink ?? null
  facts.xTelegramLink = result.telegramLink ?? null
  facts.xProfileSource = profileSource
  facts.xPostSource = postSource
  facts.xSource = postSource || profileSource

  // Only a genuinely live, definitive determination counts as a "successful
  // fetch" that resets the SIGNAL_FRESH_FETCH_DAYS cooldown for this handle —
  // a stale-cache fallback (live sources were unavailable) does not, and
  // reusing the durable x-fallback record doesn't either (it's not a new
  // fetch, just a replay of a possibly-days-old result) — so the very next
  // run still retries live sources instead of waiting out either window.
  const isLiveResult = postSource !== 'stale-cache' && postSource !== 'x-fallback'
  const checkedAtIso = new Date().toISOString()
  if (ctx.store && result.exists != null && !freshCache && isLiveResult) {
    await ctx.store.set(cacheKey, { result, postSource, checkedAt: checkedAtIso })
  }

  // The durable fallback (server/xFallback.js) only ever moves forward on a
  // genuine live official-api/syndication success — never overwritten with
  // a stale-cache replay or a reuse of itself — so it stays a trustworthy
  // "last known good" floor even after "Clear check cache" wipes the
  // regular cache above.
  if (result.exists != null && (postSource === 'official-api' || postSource === 'syndication')) {
    await saveXFallback(handle.toLowerCase(), result)
  }

  if (!result.exists) {
    facts.xPostStatus = 'not-applicable'
    const suspended = result.suspended === true
    evidence.push(
      ev(
        'bad',
        suspended ? 'X account suspended' : 'X account does not exist',
        `@${handle} · confirmed unavailable`,
        suspended ? -30 : -26
      )
    )
    return { facts, evidence }
  }

  if (result.latestPost) {
    facts.xPostStatus = ['cache', 'stale-cache', 'x-fallback'].includes(postSource) ? 'cached' : 'available'
    if (postSource === 'cache') {
      facts.xPostDetail = `Using the existing last-post record (fetched within the last ${SIGNAL_FRESH_FETCH_DAYS} days); X network requests were skipped.`
    } else if (postSource === 'stale-cache') {
      facts.xPostDetail = 'Live X sources were unavailable this run; showing the last known last-post date.'
    } else if (postSource === 'x-fallback') {
      facts.xPostDetail = `Using the durable fallback record (last fetched ${fmtDateTime(fallback.fetchedAt)}, within the ${X_FALLBACK_REFETCH_DAYS}-day floor); X network requests were skipped.`
    }
  } else {
    const summary = postSource === 'cache'
      ? { status: 'cached-unavailable', detail: `Using a recent cached X result; no public post timestamp was available. (last fetch ${fmtDateTime(cached.checkedAt)})` }
      : postSource === 'x-fallback'
        ? { status: 'cached-unavailable', detail: `Using a durable fallback X result; no public post timestamp was available. (last fetch ${fmtDateTime(fallback.fetchedAt)})` }
        : unavailablePostSummary(result, postAttempts)
    facts.xPostStatus = summary.status
    facts.xPostDetail = summary.detail
  }

  // Audience size and posting recency are deliberately independent score
  // entries. A large but abandoned account (or a small active one) now shows
  // both facts and receives both deltas instead of one replacing the other.
  const evidenceFetchedAt = postSource === 'x-fallback' ? fallback?.fetchedAt
    : postSource === 'official-api' || postSource === 'syndication' ? checkedAtIso
    : cached?.checkedAt ?? null
  evidence.push(followerEvidence(handle, result))
  evidence.push(lastPostEvidence(handle, result.latestPost, postSource, facts.xPostDetail, evidenceFetchedAt))
  return { facts, evidence }
}
