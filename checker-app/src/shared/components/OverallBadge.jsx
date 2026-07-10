import { overallStatus } from '../domain/scoring.js'

const OVERALL_LABELS = {
  idle: ['idle', '—'],
  checking: ['checking', 'Checking…'],
  'both-alive': ['alive', 'Alive'],
  'web-only': ['maybe', 'Maybe'],
  'x-only': ['possibly-dead', 'Possibly Dead'],
  'both-dead': ['dead', 'Dead'],
}

/**
 * @param {{ws: import('../domain/scoring.js').CheckStatus, xs: import('../domain/scoring.js').CheckStatus}} props
 */
export function OverallBadge({ ws, xs }) {
  const status = overallStatus(ws, xs)
  const [cls, label] = OVERALL_LABELS[status] ?? ['idle', '—']
  return <span className={`badge ${cls}`}>{label}</span>
}
