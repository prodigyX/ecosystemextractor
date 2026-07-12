import { fetchTimeout, ev, daysAgo, fmtDate } from '../util.js'
import {
  X_RESULT_CACHE_ENABLED,
  X_LAST_POST_AGE_DAYS,
  X_SYNDICATION_COOLDOWN_MS,
  X_SYNDICATION_INTERVAL_MS,
  SIGNAL_FRESH_FETCH_MS,
  SIGNAL_FRESH_FETCH_DAYS,
} from '../config.js'
import { recordXRateLimit } from '../rateLimitStatus.js'

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
  // community signals like Discord/Telegram. A meaningful audience requires
  // more than 2,000 followers — below that line reads as a weak signal.
  if (followers >= 20000) {
    return metricEvidence('x-followers', 'good', 'X established audience (20K+ followers)', detail, 10)
  }
  if (followers >= 5000) {
    return metricEvidence('x-followers', 'good', 'X decent audience (5K+ followers)', detail, 6)
  }
  if (followers > 2000) {
    return metricEvidence('x-followers', 'info', 'X small audience (2K+ followers)', detail, 3)
  }
  return metricEvidence('x-followers', 'warn', 'X weak audience (≤2K followers)', detail, -4)
}

/** Short "(live)" / "(cached)" / "(stale cache)" tag so a shown date's trustworthiness is visible at a glance, not just inferred. */
function freshnessTag(postSource) {
  if (postSource === 'cache') return ' (cached)'
  if (postSource === 'stale-cache') return ' (stale cache)'
  if (postSource === 'official-api' || postSource === 'syndication') return ' (live)'
  return ''
}

export function lastPostEvidence(handle, latestPost, postSource, unavailableDetail = null) {
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
  const age = daysAgo(latestPost)
  if (age == null) {
    return metricEvidence('x-last-post', 'info', 'X last post date invalid', `@${handle}`, 0)
  }
  if (age <= X_LAST_POST_AGE_DAYS.active) {
    return metricEvidence('x-last-post', 'good', `X active (posted ≤${X_LAST_POST_AGE_DAYS.active}d)`, `@${handle} · ${fmtDate(latestPost)}${tag}`, 20)
  }
  if (age <= X_LAST_POST_AGE_DAYS.recent) {
    return metricEvidence('x-last-post', 'good', `X recent (posted ≤${X_LAST_POST_AGE_DAYS.recent}d)`, `@${handle} · ${fmtDate(latestPost)}${tag}`, 12)
  }
  if (age <= X_LAST_POST_AGE_DAYS.quiet) {
    return metricEvidence('x-last-post', 'warn', `X quiet (${X_LAST_POST_AGE_DAYS.recent + 1}–${X_LAST_POST_AGE_DAYS.quiet}d)`, `@${handle} · ${fmtDate(latestPost)}${tag}`, -8)
  }
  if (age <= X_LAST_POST_AGE_DAYS.silent) {
    return metricEvidence('x-last-post', 'bad', `X silent >${X_LAST_POST_AGE_DAYS.quiet}d — likely no progress`, `@${handle} · last post ${fmtDate(latestPost)}${tag}`, -25)
  }
  return metricEvidence('x-last-post', 'bad', `X silent >${X_LAST_POST_AGE_DAYS.silent}d — project likely abandoned`, `@${handle} · last post ${fmtDate(latestPost)}${tag}`, -32)
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
  }
  if (!project.x) return { facts, evidence: [ev('info', 'No X link', null, 0)] }

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

  let profile = freshCache ? profileSnapshot(cached.result) : null
  let postResult = freshCache ? cached.result : null
  let profileSource = freshCache ? 'cache' : null
  let postSource = freshCache ? 'cache' : null
  const postAttempts = []

  if (freshCache) {
    postAttempts.push(attempt('cache', cached.result.latestPost ? 'success' : 'cached'))
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

    if (!postResult && profile?.exists !== false && !profile?.protected) {
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
  } else if (!freshCache && cached?.result && profile?.exists !== false) {
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
  facts.xProfileSource = profileSource
  facts.xPostSource = postSource
  facts.xSource = postSource || profileSource

  // Only a genuinely live, definitive determination counts as a "successful
  // fetch" that resets the SIGNAL_FRESH_FETCH_DAYS cooldown for this handle —
  // a stale-cache fallback (live sources were unavailable) does not, so the
  // very next run retries live sources instead of waiting out the window.
  if (ctx.store && result.exists != null && !freshCache && postSource !== 'stale-cache') {
    await ctx.store.set(cacheKey, { result, postSource, checkedAt: new Date().toISOString() })
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
    facts.xPostStatus = ['cache', 'stale-cache'].includes(postSource) ? 'cached' : 'available'
    if (postSource === 'cache') {
      facts.xPostDetail = `Using the existing last-post record (fetched within the last ${SIGNAL_FRESH_FETCH_DAYS} days); X network requests were skipped.`
    } else if (postSource === 'stale-cache') {
      facts.xPostDetail = 'Live X sources were unavailable this run; showing the last known last-post date.'
    }
  } else {
    const summary = postSource === 'cache'
      ? { status: 'cached-unavailable', detail: 'Using a recent cached X result; no public post timestamp was available.' }
      : unavailablePostSummary(result, postAttempts)
    facts.xPostStatus = summary.status
    facts.xPostDetail = summary.detail
  }

  // Audience size and posting recency are deliberately independent score
  // entries. A large but abandoned account (or a small active one) now shows
  // both facts and receives both deltas instead of one replacing the other.
  evidence.push(followerEvidence(handle, result))
  evidence.push(lastPostEvidence(handle, result.latestPost, postSource, facts.xPostDetail))
  return { facts, evidence }
}
