import { fetchTimeout, ev, daysAgo, fmtDate } from '../util.js'
import {
  X_RESULT_CACHE_ENABLED,
  X_RESULT_CACHE_TTL_MS,
  X_LAST_POST_CACHE_ENABLED,
  X_LAST_POST_CACHE_TTL_MS,
  X_LAST_POST_AGE_DAYS,
  X_STALE_POST_CACHE_TTL_MS,
  X_SYNDICATION_COOLDOWN_MS,
  X_SYNDICATION_INTERVAL_MS,
} from '../config.js'

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
let nextAllowedAt = 0
let syndicationBlockedUntil = 0
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
  const blockedUntil = Math.max(syndicationBlockedUntil, xState?.syndicationBlockedUntil ?? 0)
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
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after')
    const retrySeconds = Number(retryAfter)
    const cooldownMs = Number.isFinite(retrySeconds) && retrySeconds > 0
      ? retrySeconds * 1000
      : X_SYNDICATION_COOLDOWN_MS
    syndicationBlockedUntil = Date.now() + cooldownMs
    if (xState) {
      xState.syndicationBlocked = true
      xState.syndicationBlockedUntil = syndicationBlockedUntil
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

/** Puppeteer logged-out profile scrape (best effort). */
async function viaPuppeteer(handle, getBrowser) {
  const browser = await getBrowser()
  if (!browser) {
    return { result: null, attempt: attempt('puppeteer', 'browser-unavailable') }
  }
  const page = await browser.newPage()
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await new Promise((resolve) => setTimeout(resolve, 4500))

    const result = await page.evaluate((h) => {
      const body = document.body.innerText
      if (/this account doesn.t exist/i.test(body)) return { exists: false, suspended: false }
      if (/account suspended/i.test(body)) return { exists: false, suspended: true }

      const profileRendered =
        document.querySelector('[data-testid="UserName"]') !== null ||
        new RegExp(`@${h}\\b`, 'i').test(body)
      if (!profileRendered) return null

      const dates = [...document.querySelectorAll('time')]
        .map((time) => time.getAttribute('datetime'))
        .filter(Boolean)
        .map((date) => new Date(date).getTime())
        .filter((time) => !Number.isNaN(time) && time <= Date.now())
      const protectedPosts = /posts are protected/i.test(body)
      const noPosts = /hasn.t posted/i.test(body)
      return {
        exists: true,
        suspended: false,
        latestPost: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        postIssue: dates.length
          ? null
          : protectedPosts
            ? 'protected'
            : noPosts
              ? 'no-public-posts'
              : 'timeline-not-rendered',
      }
    }, handle)

    if (!result) {
      return {
        result: null,
        attempt: attempt('puppeteer', 'blocked', 'X did not render the logged-out profile'),
      }
    }
    const status = result.latestPost ? 'success' : result.postIssue || 'timeline-not-rendered'
    delete result.postIssue
    return { result, attempt: attempt('puppeteer', status) }
  } finally {
    await page.close().catch(() => {})
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
  if (followers >= 20000) {
    return metricEvidence('x-followers', 'good', 'X established audience (20K+ followers)', detail, 8)
  }
  if (followers >= 5000) {
    return metricEvidence('x-followers', 'good', 'X decent audience (5K+ followers)', detail, 4)
  }
  if (followers >= 1000) {
    return metricEvidence('x-followers', 'info', 'X small audience (1K+ followers)', detail, 2)
  }
  return metricEvidence('x-followers', 'warn', 'X tiny audience (<1K followers)', detail, -2)
}

export function lastPostEvidence(handle, latestPost, unavailableDetail = null) {
  if (!latestPost) {
    return metricEvidence(
      'x-last-post',
      'info',
      'X last post unavailable',
      unavailableDetail || `@${handle} · no public post timestamp returned`,
      0
    )
  }

  const age = daysAgo(latestPost)
  if (age == null) {
    return metricEvidence('x-last-post', 'info', 'X last post date invalid', `@${handle}`, 0)
  }
  if (age <= X_LAST_POST_AGE_DAYS.active) {
    return metricEvidence('x-last-post', 'good', `X active (posted ≤${X_LAST_POST_AGE_DAYS.active}d)`, `@${handle} · ${fmtDate(latestPost)}`, 15)
  }
  if (age <= X_LAST_POST_AGE_DAYS.recent) {
    return metricEvidence('x-last-post', 'good', `X recent (posted ≤${X_LAST_POST_AGE_DAYS.recent}d)`, `@${handle} · ${fmtDate(latestPost)}`, 8)
  }
  if (age <= X_LAST_POST_AGE_DAYS.quiet) {
    return metricEvidence('x-last-post', 'warn', `X quiet (${X_LAST_POST_AGE_DAYS.recent + 1}–${X_LAST_POST_AGE_DAYS.quiet}d)`, `@${handle} · ${fmtDate(latestPost)}`, -5)
  }
  if (age <= X_LAST_POST_AGE_DAYS.silent) {
    return metricEvidence('x-last-post', 'bad', `X silent >${X_LAST_POST_AGE_DAYS.quiet}d — likely no progress`, `@${handle} · last post ${fmtDate(latestPost)}`, -18)
  }
  return metricEvidence('x-last-post', 'bad', `X silent >${X_LAST_POST_AGE_DAYS.silent}d — project likely abandoned`, `@${handle} · last post ${fmtDate(latestPost)}`, -25)
}

function unavailablePostSummary(result, attempts) {
  if (result?.protected) {
    return { status: 'protected', detail: 'This account protects its posts.' }
  }
  if (attempts.some((item) => item.status === 'rate-limited')) {
    return {
      status: 'rate-limited',
      detail: 'X rate-limited the timeline request, and the logged-out fallback exposed no post timestamps.',
    }
  }
  if (attempts.some((item) => item.status === 'no-public-posts')) {
    return { status: 'no-public-posts', detail: 'No public posts were returned for this account.' }
  }
  if (attempts.some((item) => item.status === 'timeline-not-rendered')) {
    return {
      status: 'unavailable',
      detail: 'The profile loaded, but X did not expose its timeline to the logged-out browser.',
    }
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

  const cacheKey = `x:${handle.toLowerCase()}`
  const cached = ctx.store?.get(cacheKey)
  const profileCheckedAt = new Date(cached?.checkedAt ?? 0).getTime()
  const postCheckedAt = new Date(cached?.postCheckedAt ?? cached?.checkedAt ?? 0).getTime()
  const profileAge = Number.isNaN(profileCheckedAt) ? Infinity : Date.now() - profileCheckedAt
  const cachedAge = Number.isNaN(postCheckedAt) ? Infinity : Date.now() - postCheckedAt
  const recentResultCached = X_RESULT_CACHE_ENABLED &&
    cached?.result?.exists != null && profileAge < X_RESULT_CACHE_TTL_MS
  const recentLastPostCached = X_LAST_POST_CACHE_ENABLED &&
    Boolean(cached?.result?.latestPost) && cachedAge < X_LAST_POST_CACHE_TTL_MS
  const cacheHit = recentResultCached || recentLastPostCached
  const freshProfileCached = cacheHit
  // A recent general result caches negative results briefly; a successful
  // last-post record gets the longer independently configurable TTL.
  const freshPostCached = cacheHit
  const staleCached = X_RESULT_CACHE_ENABLED &&
    cached?.result?.latestPost && cachedAge < X_STALE_POST_CACHE_TTL_MS
    ? cached.result
    : null

  let profile = freshProfileCached ? profileSnapshot(cached.result) : null
  let postResult = freshPostCached ? cached.result : null
  let profileSource = freshProfileCached ? 'cache' : null
  let postSource = freshPostCached ? 'cache' : null
  const postAttempts = []

  if (freshPostCached) {
    postAttempts.push(attempt('cache', cached.result.latestPost ? 'success' : 'cached'))
  }

  if (!postResult) {
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

    const needsProfile = profile?.exists == null ||
      (profile.exists !== false && profile.followers == null)
    const needsPost = !postResult?.latestPost && profile?.exists !== false && !profile?.protected
    if (needsProfile || needsPost) {
      const profilePromise = needsProfile
        ? viaFxTwitter(handle).catch(() => null)
        : Promise.resolve(null)
      const browserPromise = needsPost
        ? runQueued(ctx.xBrowserQueue, () => viaPuppeteer(handle, ctx.getBrowser))
            .catch((error) => ({ result: null, attempt: attempt('puppeteer', 'failed', error.message) }))
        : Promise.resolve(null)

      // When the combined syndication call is unavailable, fetch the audience
      // fallback and logged-out timeline concurrently.
      const [fx, browser] = await Promise.all([profilePromise, browserPromise])
      if (fx) {
        profile = mergeProfile(profile, profileSnapshot(fx))
        profileSource = 'fxtwitter'
      }
      if (browser) {
        postAttempts.push(browser.attempt)
        if (browser.result && profile?.exists !== false && !profile?.protected) {
          postResult = browser.result
          if (browser.result.latestPost) postSource = 'puppeteer'
        }
      }
    }
  }

  let result
  if (profile?.exists === false) {
    result = profile
  } else if (postResult?.exists === false) {
    result = { ...profile, ...postResult }
  } else if (postResult?.latestPost) {
    result = { ...profile, ...postResult }
  } else if (staleCached && profile?.exists !== false) {
    result = { ...staleCached, ...profile, ...postResult, latestPost: staleCached.latestPost }
    postSource = 'stale-cache'
    postAttempts.push(attempt('stale-cache', 'success', 'live timeline sources were unavailable'))
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

  if (ctx.store && result.exists != null && !cacheHit) {
    const livePost = result.latestPost && ['official-api', 'syndication', 'puppeteer'].includes(postSource)
    ctx.store.set(cacheKey, {
      result,
      checkedAt: new Date().toISOString(),
      postCheckedAt: livePost ? new Date().toISOString() : cached?.postCheckedAt ?? null,
    })
  }

  if (!result.exists) {
    facts.xPostStatus = 'not-applicable'
    const suspended = result.suspended === true
    evidence.push(
      ev(
        'bad',
        suspended ? 'X account suspended' : 'X account does not exist',
        `@${handle} · confirmed unavailable`,
        suspended ? -25 : -20
      )
    )
    return { facts, evidence }
  }

  if (result.latestPost) {
    facts.xPostStatus = ['cache', 'stale-cache'].includes(postSource) ? 'cached' : 'available'
    if (postSource === 'cache') {
      facts.xPostDetail = 'Using the existing last-post record; X network requests were skipped.'
    } else if (postSource === 'stale-cache') {
      facts.xPostDetail = 'Live timeline sources were unavailable; using a last-post date cached within the past 7 days.'
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
  evidence.push(lastPostEvidence(handle, result.latestPost, facts.xPostDetail))
  return { facts, evidence }
}
