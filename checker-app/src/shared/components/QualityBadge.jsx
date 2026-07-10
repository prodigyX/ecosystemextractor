import { QUALITY_LABELS } from '../domain/scoring.js'

/**
 * Verdict-derived quality word (Excellent/Good/Fair/Poor) for the "Overall"
 * column once a project has a deep-check result. Falls back to `OverallBadge`
 * (quick-check-derived) when no deep-check result exists yet.
 * @param {{verdict: import('../domain/scoring.js').Verdict|null|undefined}} props
 */
export function QualityBadge({ verdict }) {
  if (!verdict) return <span className="badge idle">—</span>
  const [cls, label] = QUALITY_LABELS[verdict] ?? ['idle', verdict]
  return <span className={`badge ${cls}`}>{label}</span>
}
