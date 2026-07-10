/**
 * @typedef {'idle'|'checking'|'alive'|'dead'|'not-found'|'skip'} CheckStatus
 * @typedef {'active'|'likely-active'|'unclear'|'likely-dead'|'dead'|'error'|'checking'} Verdict
 */

/** Badge class + label for every verdict the deep-check pipeline can return. */
export const VERDICTS = {
  active: ['alive', 'Active'],
  'likely-active': ['likely-active', 'Likely Active'],
  unclear: ['maybe', 'Unclear'],
  'likely-dead': ['not-found', 'Likely Dead'],
  dead: ['dead', 'Dead'],
  error: ['dead', 'Error'],
  checking: ['checking', 'Checking…'],
}

/** Badge class + short quality word per verdict, for the per-row "Overall" column. */
export const QUALITY_LABELS = {
  active: ['alive', 'Excellent'],
  'likely-active': ['likely-active', 'Good'],
  unclear: ['maybe', 'Fair'],
  'likely-dead': ['not-found', 'Poor'],
  dead: ['dead', 'Poor'],
  error: ['dead', 'Poor'],
  checking: ['checking', 'Checking…'],
}

/** Badge class + risk-tier label per verdict, for the "Verdict" column. */
export const RISK_LABELS = {
  active: ['alive', 'Low Risk'],
  'likely-active': ['likely-active', 'Low Risk'],
  unclear: ['maybe', 'Medium'],
  'likely-dead': ['not-found', 'High Risk'],
  dead: ['dead', 'High Risk'],
  error: ['dead', 'High Risk'],
  checking: ['checking', 'Checking…'],
}

/** @param {CheckStatus} s */
export function isAlive(s) {
  return s === 'alive'
}

/** @param {CheckStatus} s */
export function isDone(s) {
  return s !== 'idle' && s !== 'checking'
}

/**
 * Combines a project's website and X quick-check statuses into one overall status.
 * @param {CheckStatus} ws website status
 * @param {CheckStatus} xs X (Twitter) status
 * @returns {'idle'|'checking'|'both-alive'|'web-only'|'x-only'|'both-dead'}
 */
export function overallStatus(ws, xs) {
  if (!isDone(ws) || !isDone(xs)) {
    if (ws === 'idle' || xs === 'idle') return 'idle'
    return 'checking'
  }
  const webAlive = isAlive(ws)
  const xAlive = isAlive(xs)
  if (webAlive && xAlive) return 'both-alive'
  if (webAlive && !xAlive) return 'web-only'
  if (!webAlive && xAlive) return 'x-only'
  return 'both-dead'
}

/**
 * Tallies deep-check verdicts across all projects, for the summary strip.
 * @param {import('./projects.js').Project[]} projects
 * @param {Record<string, {verdict?: Verdict}>} deep
 */
export function computeVerdictCounts(projects, deep) {
  return {
    total: projects.length,
    active: projects.filter((p) => deep[p.id]?.verdict === 'active').length,
    likelyActive: projects.filter((p) => deep[p.id]?.verdict === 'likely-active').length,
    unclear: projects.filter((p) => deep[p.id]?.verdict === 'unclear').length,
    likelyDead: projects.filter((p) => deep[p.id]?.verdict === 'likely-dead').length,
    dead: projects.filter((p) => ['dead', 'error'].includes(deep[p.id]?.verdict)).length,
  }
}

/**
 * Tallies quick-check overall statuses across all projects, for the summary strip.
 * @param {import('./projects.js').Project[]} projects
 */
export function computeQuickCounts(projects) {
  return {
    total: projects.length,
    alive: projects.filter((p) => overallStatus(p.websiteStatus, p.xStatus) === 'both-alive').length,
    maybe: projects.filter((p) => overallStatus(p.websiteStatus, p.xStatus) === 'web-only').length,
    possiblyDead: projects.filter((p) => overallStatus(p.websiteStatus, p.xStatus) === 'x-only').length,
    dead: projects.filter((p) => overallStatus(p.websiteStatus, p.xStatus) === 'both-dead').length,
  }
}

/**
 * Real signal-check names (see server/pipeline.js) grouped into the
 * categories shown as sub-score tiles on the project detail modal. Every
 * signal the pipeline runs is accounted for in exactly one bucket.
 */
export const CATEGORIES = [
  { key: 'infra', label: 'Website & Infra', icon: '◧', signals: ['website', 'dns-ssl', 'domain', 'sitemap', 'content'] },
  { key: 'development', label: 'Development', icon: '⌥', signals: ['github'] },
  { key: 'social', label: 'Social Activity', icon: '𝕏', signals: ['x'] },
  { key: 'community', label: 'Community', icon: '◍', signals: ['discord', 'telegram'] },
  { key: 'onchain', label: 'On-chain Activity', icon: '⛓', signals: ['defillama'] },
]

function verdictFromScore(score) {
  if (score >= 75) return 'active'
  if (score >= 60) return 'likely-active'
  if (score >= 40) return 'unclear'
  if (score >= 25) return 'likely-dead'
  return 'dead'
}

/**
 * Re-aggregates a project's real evidence into the category buckets above.
 * Each category's score uses the exact same formula as the overall score
 * (50 base + sum of that category's evidence deltas, clamped 0-100) — just
 * scoped to a subset of signals, not a separately invented metric.
 * @param {Array<{signal: string, delta: number}>} evidence
 * @returns {Array<{key: string, label: string, icon: string, score: number, verdict: Verdict}>}
 */
export function computeCategoryScores(evidence) {
  return CATEGORIES.map((cat) => {
    const delta = evidence
      .filter((e) => cat.signals.includes(e.signal))
      .reduce((sum, e) => sum + (e.delta || 0), 0)
    const score = Math.max(0, Math.min(100, 50 + delta))
    return { key: cat.key, label: cat.label, icon: cat.icon, score, verdict: verdictFromScore(score) }
  })
}
