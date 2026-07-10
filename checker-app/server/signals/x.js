import { fetchTimeout, ev, daysAgo, fmtDate } from '../util.js'

export function xHandleFromUrl(url) {
  const m = url.match(/(?:x\.com|twitter\.com)\/@?([\w]+)/i)
  const handle = m?.[1]
  if (!handle) return null
  if (['home', 'search', 'explore', 'intent', 'share', 'i'].includes(handle.toLowerCase())) return null
  return handle
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Global pacing: X throttles bursts hard, so keep ~4s between syndication calls
let nextAllowedAt = 0
async function paced() {
  const wait = nextAllowedAt - Date.now()
  nextAllowedAt = Math.max(Date.now(), nextAllowedAt) + 4000
  if (wait > 0) await sleep(wait)
}

/** Strategy 0: FxTwitter user API — reliable existence + profile stats, no post dates. */
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
    followers: data.user.followers ?? null,
    tweetCount: data.user.tweets ?? null,
  }
}

/** Strategy 1: Twitter syndication endpoint (no auth; heavily rate-limited). */
async function viaSyndication(handle, xState) {
  let res
  // X's throttle window is ~a minute — short retries are useless
  for (const backoff of [0, 30000, 65000]) {
    if (backoff) await sleep(backoff)
    await paced()
    res = await fetchTimeout(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
      {},
      10000
    )
    if (res.status !== 429) break
  }
  if (res.status === 429) {
    // Exhausted retries — count it; pipeline disables syndication after repeated failures
    if (xState) xState.throttleFailures = (xState.throttleFailures || 0) + 1
    return null
  }
  if (!res.ok) return null
  const html = await res.text()
  const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!jsonMatch) return null
  const data = JSON.parse(jsonMatch[1])
  const entries = data?.props?.pageProps?.timeline?.entries || []
  const dates = entries
    .map((e) => e?.content?.tweet?.created_at)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t))
  // Empty timeline could mean protected, no posts, OR nonexistent account —
  // treat as unknown so the Puppeteer strategy decides.
  if (!dates.length) return null
  return { exists: true, latestPost: new Date(Math.max(...dates)).toISOString() }
}

/** Strategy 2: Puppeteer logged-out profile scrape (best effort). */
async function viaPuppeteer(handle, getBrowser) {
  const browser = await getBrowser()
  if (!browser) return null
  const page = await browser.newPage()
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 4500))

    return await page.evaluate((h) => {
      const body = document.body.innerText
      if (/this account doesn.t exist/i.test(body)) return { exists: false, suspended: false }
      if (/account suspended/i.test(body)) return { exists: false, suspended: true }

      // Only claim existence if the profile header actually rendered
      const profileRendered =
        document.querySelector('[data-testid="UserName"]') !== null ||
        new RegExp(`@${h}\\b`, 'i').test(body)
      if (!profileRendered) return null // login wall / blocked — unknown

      const dates = [...document.querySelectorAll('time')]
        .map((t) => t.getAttribute('datetime'))
        .filter(Boolean)
        .map((d) => new Date(d).getTime())
        .filter((t) => !Number.isNaN(t) && t <= Date.now())
      return {
        exists: true,
        suspended: false,
        latestPost: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
      }
    }, handle)
  } finally {
    await page.close().catch(() => {})
  }
}

export async function checkX(project, ctx) {
  const evidence = []
  const facts = { xHandle: null, xExists: null, xLatestPost: null, xSource: null }
  if (!project.x) return { facts, evidence: [ev('info', 'No X link', null, 0)] }

  const handle = xHandleFromUrl(project.x)
  if (!handle) return { facts, evidence: [ev('info', 'Could not parse X handle', project.x, 0)] }
  facts.xHandle = handle

  // Reuse a recent successful result to avoid re-hitting X's rate limits
  const cacheKey = `x:${handle.toLowerCase()}`
  const cached = ctx.store?.get(cacheKey)
  const CACHE_MS = 6 * 60 * 60 * 1000
  let result = null

  if (cached?.result?.latestPost && Date.now() - new Date(cached.checkedAt).getTime() < CACHE_MS) {
    result = cached.result
    facts.xSource = 'cache'
  }

  if (!result) {
    // Existence + profile stats via FxTwitter (reliable, not rate-limited like syndication)
    let fx = null
    try {
      fx = await viaFxTwitter(handle)
    } catch { /* ignore */ }

    if (fx && !fx.exists) {
      result = fx
      facts.xSource = 'fxtwitter'
    } else {
      // Post dates: syndication first, Puppeteer as last resort
      const xState = ctx.xState
      const syndicationDisabled = xState && (xState.throttleFailures || 0) >= 3
      let dated = null
      if (!syndicationDisabled) {
        try {
          dated = await viaSyndication(handle, xState)
          if (dated) facts.xSource = 'syndication'
        } catch { /* fall through */ }
      }

      if (!dated) {
        try {
          dated = await viaPuppeteer(handle, ctx.getBrowser)
          if (dated) facts.xSource = 'puppeteer'
        } catch { /* fall through */ }
      }

      if (dated) {
        result = { ...fx, ...dated }
      } else if (fx) {
        result = fx
        facts.xSource = 'fxtwitter'
      }
    }
  }

  if (!result) {
    evidence.push(ev('info', 'X activity unknown (blocked from checking)', `@${handle}`, 0))
    return { facts, evidence }
  }

  if (ctx.store && result.exists && facts.xSource !== 'cache') {
    ctx.store.set(cacheKey, { result, checkedAt: new Date().toISOString() })
  }

  facts.xExists = result.exists
  facts.xLatestPost = result.latestPost ?? null
  facts.xFollowers = result.followers ?? null

  if (!result.exists) {
    evidence.push(
      ev('bad', result.suspended ? 'X account suspended' : 'X account does not exist', `@${handle}`, -15)
    )
    return { facts, evidence }
  }

  if (!result.latestPost) {
    const f = result.followers
    const detail = f != null
      ? `@${handle} · ${f.toLocaleString()} followers, ${result.tweetCount?.toLocaleString() ?? '?'} posts`
      : `@${handle}`
    // No activity dates — use audience size as a weaker proxy signal
    if (f == null) {
      evidence.push(ev('info', 'X account exists, post dates unavailable', detail, 2))
    } else if (f >= 20000) {
      evidence.push(ev('good', 'X established audience (20K+ followers)', detail, 8))
    } else if (f >= 5000) {
      evidence.push(ev('good', 'X decent audience (5K+ followers)', detail, 4))
    } else if (f >= 1000) {
      evidence.push(ev('info', 'X small audience (1K+ followers)', detail, 2))
    } else {
      evidence.push(ev('warn', 'X tiny audience (<1K followers)', detail, -2))
    }
    return { facts, evidence }
  }

  const age = daysAgo(result.latestPost)
  if (age <= 30) {
    evidence.push(ev('good', 'X active (posted <30d)', `@${handle} · ${fmtDate(result.latestPost)}`, 15))
  } else if (age <= 90) {
    evidence.push(ev('good', 'X recent (posted <90d)', `@${handle} · ${fmtDate(result.latestPost)}`, 8))
  } else if (age <= 180) {
    evidence.push(ev('warn', 'X quiet (3–6 months)', `@${handle} · ${fmtDate(result.latestPost)}`, -5))
  } else if (age <= 365) {
    evidence.push(ev('bad', 'X silent >6 months — likely no progress', `@${handle} · last post ${fmtDate(result.latestPost)}`, -18))
  } else {
    evidence.push(ev('bad', 'X silent >1 year — project likely abandoned', `@${handle} · last post ${fmtDate(result.latestPost)}`, -25))
  }

  return { facts, evidence }
}
