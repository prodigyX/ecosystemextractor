import { computeCategoryScores, TIER_COLORS } from '../../shared/domain/scoring.js'

/**
 * Horizontal per-category score bars shown beside the gauge — the same real
 * sub-scores as the category tiles, rendered as a compact breakdown.
 * @param {{evidence: Array<{signal: string, delta: number}>, facts?: {githubUrl?: string|null}}} props
 */
export function ScoreBreakdown({ evidence, facts }) {
  const categories = computeCategoryScores(evidence, facts)
  return (
    <div className="score-breakdown">
      <div className="score-breakdown-title">Score Breakdown</div>
      {categories.map((c) => (
        <div key={c.key} className="score-breakdown-row">
          <span className="score-breakdown-label">{c.label}</span>
          <span className="score-breakdown-bar">
            <span
              className="score-breakdown-fill"
              style={{ width: `${c.score}%`, background: TIER_COLORS[c.verdict] }}
            />
          </span>
          <span className="score-breakdown-value">{c.score}/100</span>
        </div>
      ))}
    </div>
  )
}
