import { computeCategoryScores, TIER_COLORS } from '../../shared/domain/scoring.js'

/**
 * Sub-score tiles re-aggregating a project's real evidence into 5 signal
 * categories (Website & Infra, Development, Social, Community, On-chain).
 * @param {{evidence: Array<{signal: string, delta: number}>, facts?: {githubUrl?: string|null, llamaSlug?: string|null}}} props
 */
export function CategoryTiles({ evidence, facts }) {
  const categories = computeCategoryScores(evidence, facts)
  return (
    <div className="category-tiles">
      {categories.map((c) => {
        const tooltip = c.verdict === 'unknown' ? c.basis : `Based on: ${c.basis}`
        return (
          <div key={c.key} className={`category-tile score-${c.verdict}`} title={tooltip}>
            <div className="category-tile-header">
              <span className="category-tile-icon" aria-hidden="true">{c.icon}</span>
              <span className={`category-tile-status status-${c.verdict}`}>{c.statusWord}</span>
            </div>
            <span className="category-tile-label">
              {c.label}
              <span className="category-tile-info" title={tooltip} aria-hidden="true">ⓘ</span>
            </span>
            <span className="category-tile-score">{c.score}<span className="category-tile-max"> / 100</span></span>
            <span
              className="category-tile-bar"
              role="progressbar"
              aria-label={`${c.label} score`}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={c.score}
            >
              <span style={{ width: `${c.score}%`, background: TIER_COLORS[c.verdict] }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
