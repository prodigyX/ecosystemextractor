import { RISK_LABELS } from '../domain/scoring.js'

/**
 * @param {{verdict: import('../domain/scoring.js').Verdict|null|undefined}} props
 */
export function VerdictBadge({ verdict }) {
  if (!verdict) return <span className="badge idle">—</span>
  const [cls, label] = RISK_LABELS[verdict] ?? ['idle', verdict]
  return <span className={`badge ${cls}`}>{label}</span>
}
