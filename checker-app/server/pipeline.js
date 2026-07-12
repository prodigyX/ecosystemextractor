import { checkHttp } from './signals/http.js'
import { checkDnsSsl } from './signals/dns-ssl.js'
import { checkDomain } from './signals/domain.js'
import { checkSitemap } from './signals/sitemap.js'
import { checkContent } from './signals/content.js'
import { checkGithub } from './signals/github.js'
import { checkDiscord } from './signals/discord.js'
import { checkTelegram } from './signals/telegram.js'
import { checkDefillama } from './signals/defillama.js'
import { checkX } from './signals/x.js'
import { domainOf } from './util.js'

const PROJECT_CONCURRENCY = 4
const MAX_HISTORY_ENTRIES = 10

/**
 * Appends this run's score to the project's persisted history (keyed by
 * domain, falling back to name) and returns the updated history array.
 * Real data only: one entry per actual Deep Check run, not synthetic points.
 */
function recordScoreHistory(store, storeKey, score, verdict) {
  if (!store) return []
  const key = `history:${storeKey}`
  const prev = store.get(key) ?? []
  const next = [...prev, { ts: new Date().toISOString(), score, verdict }].slice(-MAX_HISTORY_ENTRIES)
  store.set(key, next)
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
    getBrowser: shared.getBrowser,
    xState: shared.xState,
    xTimelineQueue: shared.xTimelineQueue,
    xBrowserQueue: shared.xBrowserQueue,
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

  const stageA = [
    httpPromise,
    safeRun('dns-ssl', () => checkDnsSsl(project)).then(collect),
    safeRun('domain', () => checkDomain(project)).then(collect),
    safeRun('defillama', () => checkDefillama(project)).then(collect),
    safeRun('x', () => checkX(project, ctx)).then(collect),
  ]

  // Stage B: needs the HTML / discovered links
  await httpPromise
  const contentResult = await safeRun('content', () => checkContent(project, ctx))
  ctx.links = contentResult.facts.links || {}
  collect(contentResult)

  const stageB = [
    safeRun('sitemap', () => checkSitemap(project, ctx)).then(collect),
    safeRun('github', () => checkGithub(project, ctx)).then(collect),
    safeRun('discord', () => checkDiscord(project, ctx)).then(collect),
    safeRun('telegram', () => checkTelegram(project, ctx)).then(collect),
  ]

  await Promise.all([...stageA, ...stageB])

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

  const history = recordScoreHistory(shared.store, ctx.storeKey, score, verdict)

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
  let browserPromise = null
  const getBrowser = () => {
    if (!browserPromise) {
      browserPromise = launchBrowser().catch((err) => {
        console.error('[pipeline] browser launch failed:', err.message)
        return null
      })
    }
    return browserPromise
  }

  // Profile lookups can run with the normal project concurrency. Only timeline
  // syndication is serialized/paced; logged-out browser fallbacks are also
  // bounded so a throttled batch does not open many X tabs at once.
  const shared = {
    env,
    store,
    getBrowser,
    xTimelineQueue: makeQueue(1),
    xBrowserQueue: makeQueue(2),
    xState: { syndicationBlocked: false },
  }
  const projectQueue = makeQueue(PROJECT_CONCURRENCY)

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

  if (browserPromise) {
    const browser = await browserPromise
    await browser?.close().catch(() => {})
  }
  emit({ type: 'done' })
}
