import { checkHttp } from './signals/http.js'
import { checkDnsSsl } from './signals/dns-ssl.js'
import { checkDomain } from './signals/domain.js'
import { checkSitemap } from './signals/sitemap.js'
import { checkContent } from './signals/content.js'
import { checkGithub } from './signals/github.js'
import { checkDiscord } from './signals/discord.js'
import { checkTelegram } from './signals/telegram.js'
import { checkDefillama } from './signals/defillama.js'
import { checkX, xHandleFromUrl } from './signals/x.js'
import { domainOf, ev, daysAgo, fmtDateTime } from './util.js'
import { SCORE_WEIGHTS, TELEGRAM_MESSAGE_AGE_DAYS, DOM_SCRAPE_REFETCH_MS, DOM_SCRAPE_REFETCH_DAYS } from './config.js'
import { scrapeRenderedLinks } from './domScrape.js'
import { getDomScrapeFallback, saveDomScrapeFallback } from './domScrapeFallback.js'

const PROJECT_CONCURRENCY = 4
const MAX_HISTORY_ENTRIES = 10

/**
 * Appends this run's score to the project's persisted history (keyed by
 * domain, falling back to name) and returns the updated history array.
 * Real data only: one entry per actual Deep Check run, not synthetic points.
 */
async function recordScoreHistory(store, storeKey, score, verdict) {
  if (!store) return []
  const key = `history:${storeKey}`
  const prev = (await store.get(key)) ?? []
  const next = [...prev, { ts: new Date().toISOString(), score, verdict }].slice(-MAX_HISTORY_ENTRIES)
  await store.set(key, next)
  return next
}

export function scoreVerdict(evidence) {
  const raw = 50 + evidence.reduce((sum, e) => sum + (e.delta || 0), 0)
  // A single bad-level finding (e.g. an abandoned-looking X account) must
  // stay visible in the final score, not get outweighed to invisibility by
  // enough unrelated positives. A bad finding keeps the score out of the
  // "active" band; a warn finding keeps it just short of a perfect 100.
  const hasBad = evidence.some((e) => e.level === 'bad')
  const hasWarn = evidence.some((e) => e.level === 'warn')
  const ceiling = hasBad ? 74 : hasWarn ? 89 : 100
  const score = Math.max(0, Math.min(ceiling, raw))
  let verdict
  if (score >= 75) verdict = 'active'
  else if (score >= 60) verdict = 'likely-active'
  else if (score >= 40) verdict = 'unclear'
  else if (score >= 25) verdict = 'likely-dead'
  else verdict = 'dead'
  return { score, verdict }
}

async function safeRun(name, fn) {
  try {
    const { facts = {}, evidence = [] } = (await fn()) || {}
    return { name, facts, evidence: evidence.map((e) => ({ ...e, signal: name })) }
  } catch (err) {
    return {
      name,
      facts: {},
      evidence: [{ signal: name, level: 'info', label: `${name} check crashed`, detail: err.message, delta: 0 }],
    }
  }
}

async function checkProject(project, shared, emit) {
  const ctx = {
    env: shared.env,
    store: shared.store,
    storeKey: domainOf(project.website) || project.name,
    xState: shared.xState,
    xTimelineQueue: shared.xTimelineQueue,
    launchBrowser: shared.launchBrowser,
    html: null,
    finalUrl: null,
    links: {},
  }

  const allEvidence = []
  const allFacts = {}
  const collect = (r) => {
    allEvidence.push(...r.evidence)
    Object.assign(allFacts, r.facts)
    emit({ type: 'signal', projectId: project.id, signal: r.name, evidence: r.evidence })
  }

  // Stage A: signals that don't need homepage HTML — run all at once, HTTP first in the same batch
  const httpPromise = safeRun('website', () => checkHttp(project)).then((r) => {
    ctx.html = r.facts.html
    ctx.finalUrl = r.facts.finalUrl
    delete r.facts.html // don't ship megabytes to the client
    collect(r)
  })

  // If the project's source data already lists an X URL, check it
  // concurrently with http/dns-ssl/domain/defillama as before — its result
  // is only *awaited* further down, once content.js needs it to fill in any
  // Discord/Telegram link the homepage scrape didn't find (see
  // server/signals/x.js's findSocialLinksInBio). By the time content.js is
  // ready this has almost always already resolved, so this adds no latency.
  //
  // If the source data has no X URL at all, don't declare "no X link" yet —
  // the homepage itself might link to it (see content.js's findLinks, which
  // now also looks for an x.com/twitter.com profile link). That check is
  // deferred until after content.js runs, below.
  const xPromise = project.x ? safeRun('x', () => checkX(project, ctx)) : null

  const stageA = [
    httpPromise,
    safeRun('dns-ssl', () => checkDnsSsl(project)).then(collect),
    safeRun('domain', () => checkDomain(project)).then(collect),
    safeRun('defillama', () => checkDefillama(project)).then(collect),
    ...(xPromise ? [xPromise.then(collect)] : []),
  ]

  // Stage B: needs the HTML / discovered links
  await httpPromise
  const [contentResult, xResultFromStageA] = await Promise.all([
    safeRun('content', () => checkContent(project, ctx)),
    xPromise,
  ])
  ctx.links = { ...contentResult.facts.links }

  // project.x was missing — now that the homepage has actually been
  // scanned, retry with whatever X link (if any) content.js found there
  // before falling through to checkX's own "no X link" penalty.
  const xResult = xResultFromStageA ??
    await safeRun('x', () => checkX({ ...project, x: ctx.links.x }, ctx)).then((r) => {
      collect(r)
      return r
    })

  // The homepage scrape is the primary source — the X bio is only a
  // fallback for whichever of Discord/Telegram it didn't find.
  if (!ctx.links.discord && xResult.facts.xDiscordLink) ctx.links.discord = xResult.facts.xDiscordLink
  if (!ctx.links.telegram && xResult.facts.xTelegramLink) ctx.links.telegram = xResult.facts.xTelegramLink
  collect(contentResult)

  // Last resort: the plain fetch()+X-bio chain above still found neither
  // community link, but the site itself did respond (ctx.html present) —
  // it may be a JS-rendered app (React/Next client components etc.) hiding
  // its real content behind an empty HTML shell that a plain fetch can
  // never see into (see server/domScrape.js). Only pays for a real browser
  // render when it's actually needed, and never overwrites a link the
  // cheaper sources already found.
  //
  // A real Chromium launch+render is far more expensive (and a timeout risk
  // on constrained environments) than any of the other sources above, so
  // the attempt itself — found something or not — is cached durably per URL
  // (server/domScrapeFallback.js) and reused for DOM_SCRAPE_REFETCH_DAYS
  // instead of relaunching a browser on every single check.
  const scrapeUrl = ctx.finalUrl || project.website
  if (ctx.html && scrapeUrl && (!ctx.links.discord || !ctx.links.telegram)) {
    const domFallback = await getDomScrapeFallback(scrapeUrl)
    const domFallbackAgeMs = domFallback?.fetchedAt ? Date.now() - new Date(domFallback.fetchedAt).getTime() : Infinity
    const domFallbackIsFresh = Boolean(domFallback?.result) && domFallbackAgeMs < DOM_SCRAPE_REFETCH_MS

    let rendered = null
    let renderedAt = null
    if (domFallbackIsFresh) {
      rendered = domFallback.result
      renderedAt = domFallback.fetchedAt
    } else if (ctx.launchBrowser) {
      rendered = await scrapeRenderedLinks(scrapeUrl, ctx.launchBrowser)
      renderedAt = new Date().toISOString()
      await saveDomScrapeFallback(scrapeUrl, rendered)
    }

    if (rendered) {
      if (!ctx.links.discord && rendered.discord) ctx.links.discord = rendered.discord
      if (!ctx.links.telegram && rendered.telegram) ctx.links.telegram = rendered.telegram
      const renderedAtMs = new Date(renderedAt).getTime()
      collect({
        name: 'telegram',
        facts: {},
        evidence: [
          {
            ...ev(
              'info',
              'Rendered-page scan (Discord/Telegram)',
              `${domFallbackIsFresh ? 'cached · ' : ''}last scanned ${fmtDateTime(renderedAtMs)} · next scan due ${fmtDateTime(renderedAtMs + DOM_SCRAPE_REFETCH_MS)} (every ${DOM_SCRAPE_REFETCH_DAYS}d)`,
              0
            ),
            signal: 'telegram',
          },
        ],
      })
    }
  }

  // Cross-signal: having just one of Discord/Telegram is normal and isn't
  // penalized by either signal on its own (see server/signals/discord.js,
  // server/signals/telegram.js) — but having neither at all is a real red
  // flag, scored once here rather than as two stacked per-signal penalties.
  // Only applies once the homepage was actually scanned for links (ctx.html
  // present) — if the site itself was unreachable, that's inconclusive, not
  // a confirmed absence, and http.js's own penalty already covers it.
  if (ctx.html && !ctx.links.discord && !ctx.links.telegram) {
    collect({
      name: 'telegram',
      facts: {},
      evidence: [
        { ...ev('bad', 'No Discord or Telegram community link found', null, SCORE_WEIGHTS.community.noSocialLink), signal: 'telegram' },
      ],
    })
  }

  const stageB = [
    safeRun('sitemap', () => checkSitemap(project, ctx)).then(collect),
    safeRun('github', () => checkGithub(project, ctx)).then(collect),
    safeRun('discord', () => checkDiscord(project, ctx)).then(collect),
    safeRun('telegram', () => checkTelegram(project, ctx)).then(collect),
  ]

  await Promise.all([...stageA, ...stageB])

  // Cross-signal: no Discord at all, and the only other community channel
  // (Telegram) has gone dead — on top of Telegram's own per-signal "dead"
  // finding above, not instead of it. Only fires when there actually is a
  // Telegram link with a real last-message date (the "neither link found"
  // case above already covers the no-link scenario).
  if (!ctx.links.discord && allFacts.telegramLastPost) {
    const age = daysAgo(allFacts.telegramLastPost)
    if (age != null && age > TELEGRAM_MESSAGE_AGE_DAYS.inactive) {
      collect({
        name: 'telegram',
        facts: {},
        evidence: [
          { ...ev('bad', 'No Discord and Telegram is dead', null, SCORE_WEIGHTS.community.noDiscordDeadTelegram), signal: 'telegram' },
        ],
      })
    }
  }

  const { score, verdict } = scoreVerdict(allEvidence)
  // Group by signal first (in a fixed order, matching the category grouping
  // in src/shared/domain/scoring.js's CATEGORIES) so a signal's own multiple
  // findings — e.g. X's follower-count and last-post evidence, DNS-SSL's
  // resolve and cert checks — always land next to each other and every row
  // reads in the same order, regardless of which signal happened to resolve
  // first. Severity only breaks ties within the same signal.
  const signalOrder = ['website', 'dns-ssl', 'domain', 'sitemap', 'content', 'github', 'x', 'discord', 'telegram', 'defillama']
  const levelOrder = { bad: 0, warn: 1, good: 2, info: 3 }
  allEvidence.sort((a, b) => {
    const signalDiff = signalOrder.indexOf(a.signal) - signalOrder.indexOf(b.signal)
    if (signalDiff !== 0) return signalDiff
    return levelOrder[a.level] - levelOrder[b.level]
  })

  const history = await recordScoreHistory(shared.store, ctx.storeKey, score, verdict)

  emit({
    type: 'project-done',
    projectId: project.id,
    score,
    verdict,
    facts: allFacts,
    evidence: allEvidence,
    history,
  })
}

function makeQueue(concurrency) {
  let active = 0
  const waiting = []
  const next = () => {
    if (active >= concurrency || !waiting.length) return
    active++
    const { fn, resolve, reject } = waiting.shift()
    fn().then(resolve, reject).finally(() => {
      active--
      next()
    })
  }
  return (fn) =>
    new Promise((resolve, reject) => {
      waiting.push({ fn, resolve, reject })
      next()
    })
}

/**
 * Runs the full deep-check pipeline over all projects.
 * emit(event) is called with NDJSON-able progress events.
 */
export async function runPipeline(projects, { env, store, launchBrowser }, emit) {
  // Profile lookups can run with the normal project concurrency. Only
  // timeline syndication is serialized/paced.
  const shared = {
    env,
    store,
    launchBrowser,
    xTimelineQueue: makeQueue(1),
    xState: { syndicationBlocked: false },
  }
  const projectQueue = makeQueue(PROJECT_CONCURRENCY)

  // X's cache key is derivable from every project's `x` field up front, so
  // it can be bulk-loaded in one query before the run starts — unlike
  // GitHub's cache key, which is only discovered at runtime by scraping
  // each project's site for a GitHub link (see server/store.js).
  if (store) {
    const xKeys = projects
      .map((p) => p.x && xHandleFromUrl(p.x))
      .filter(Boolean)
      .map((handle) => `x:${handle.toLowerCase()}`)
    await store.preload([...new Set(xKeys)])
  }

  emit({ type: 'start', total: projects.length })
  await Promise.all(
    projects.map((p) =>
      projectQueue(() =>
        checkProject(p, shared, emit).catch((err) =>
          emit({ type: 'project-done', projectId: p.id, score: 0, verdict: 'error', facts: {}, evidence: [{ signal: 'pipeline', level: 'bad', label: 'Check failed', detail: err.message, delta: 0 }] })
        )
      )
    )
  )

  emit({ type: 'done' })
}
