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

/** Accent color per verdict tier, shared by the gauge and breakdown bars. */
export const TIER_COLORS = {
  active: '#00b894',
  'likely-active': '#00cec9',
  unclear: '#fedb71',
  'likely-dead': '#ec8a19',
  dead: '#f3527f',
  error: '#f3527f',
}

/** One-line plain-language summary per verdict tier, shown under the gauge. */
export const VERDICT_BLURBS = {
  active: 'Healthy ecosystem with consistent activity and solid fundamentals.',
  'likely-active': 'Mostly healthy signals with a few gaps worth watching.',
  unclear: 'Mixed signals — some checks healthy, others quiet or unverifiable.',
  'likely-dead': 'Multiple negative signals suggest activity has stalled.',
  dead: 'Nearly all signals negative — the project appears abandoned.',
  error: 'The check failed to complete for this project.',
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
  {
    key: 'infra', label: 'Website & Infra', icon: '◧',
    signals: ['website', 'dns-ssl', 'domain', 'sitemap', 'content'],
    statusWords: { active: 'Healthy', 'likely-active': 'Stable', unclear: 'Degraded', 'likely-dead': 'Failing', dead: 'Down' },
  },
  {
    key: 'development', label: 'Development', icon: '⌥',
    signals: ['github'],
    statusWords: { active: 'Active', 'likely-active': 'Recent', unclear: 'Quiet', 'likely-dead': 'Stale', dead: 'Inactive' },
  },
  {
    key: 'social', label: 'Social Activity', icon: '𝕏',
    signals: ['x'],
    statusWords: { active: 'Active', 'likely-active': 'Recent', unclear: 'Moderate', 'likely-dead': 'Quiet', dead: 'Silent' },
  },
  {
    key: 'community', label: 'Community', icon: '◍',
    signals: ['discord', 'telegram'],
    statusWords: { active: 'Active', 'likely-active': 'Healthy', unclear: 'Moderate', 'likely-dead': 'Quiet', dead: 'Inactive' },
  },
  {
    key: 'onchain', label: 'On-chain Activity', icon: '⛓',
    signals: ['defillama'],
    statusWords: { active: 'Very Active', 'likely-active': 'Active', unclear: 'Moderate', 'likely-dead': 'Low', dead: 'None' },
  },
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
    const verdict = verdictFromScore(score)
    return {
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      score,
      verdict,
      statusWord: cat.statusWords[verdict] ?? '',
    }
  })
}

/**
 * How much of the score is backed by conclusive data: the share of distinct
 * signal checks that produced at least one actionable (good/warn/bad) finding
 * rather than only "unknown/info" results. Derived entirely from the real
 * evidence — an account X couldn't be scraped for, an unlisted DefiLlama
 * project, etc. all lower confidence without inventing anything.
 * @param {Array<{signal: string, level: string}>} evidence
 * @returns {{level: 'high'|'medium'|'low', label: string, detail: string}}
 */
export function computeConfidence(evidence) {
  const seen = new Set()
  const actionable = new Set()
  for (const e of evidence) {
    seen.add(e.signal)
    if (e.level !== 'info') actionable.add(e.signal)
  }
  const total = seen.size || 1
  const ratio = actionable.size / total
  const level = ratio >= 0.7 ? 'high' : ratio >= 0.4 ? 'medium' : 'low'
  const label = level === 'high' ? 'High confidence' : level === 'medium' ? 'Medium confidence' : 'Low confidence'
  return {
    level,
    label,
    detail: `${actionable.size} of ${total} signal checks returned conclusive data`,
  }
}
