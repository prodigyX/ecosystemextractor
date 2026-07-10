import { Modal } from '../../shared/components/Modal.jsx'
import { QUALITY_LABELS, TIER_COLORS, VERDICT_BLURBS, computeConfidence } from '../../shared/domain/scoring.js'
import { ScoreGauge } from './ScoreGauge.jsx'
import { ScoreBreakdown } from './ScoreBreakdown.jsx'
import { ScoreHistoryChart } from './ScoreHistoryChart.jsx'
import { CategoryTiles } from './CategoryTiles.jsx'
import { ActivityOverview } from './ActivityOverview.jsx'
import { RecentSignals } from './RecentSignals.jsx'
import { RiskIndicators } from './RiskIndicators.jsx'
import { SimpleMarkdown } from './SimpleMarkdown.jsx'

function fmtRelative(iso) {
  if (!iso) return null
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function xHandle(url) {
  return url ? url.replace('https://x.com/', '@').replace('https://twitter.com/', '@') : null
}

/**
 * Per-project "dashboard" view laid out like a health console: header (icon,
 * tagline, category tags, links, watchlist star, featured flag), a score card
 * (gauge + verdict blurb + data-confidence line + per-category breakdown
 * bars) beside the vitality trend chart, category status tiles, then a
 * three-panel row — activity overview table, filterable recent signals, and
 * a risk checklist — with the source extract's About write-up and screenshots
 * at the bottom. Everything is derived from the loaded extract data and the
 * project's real deep-check evidence; nothing is synthesized.
 *
 * @param {{
 *   project: import('../../shared/domain/projects.js').Project,
 *   result: {status?: string, score?: number, verdict?: string, facts?: object, evidence?: Array, history?: Array, checkedAt?: string}|undefined,
 *   isFavorite: boolean,
 *   onToggleFavorite: () => void,
 *   onClose: () => void,
 * }} props
 */
export function ProjectDetailModal({ project, result, isFavorite, onToggleFavorite, onClose }) {
  const hasDeepResult = result?.status === 'done'
  const facts = result?.facts ?? {}
  const evidence = result?.evidence ?? []
  const history = result?.history ?? []
  const confidence = hasDeepResult ? computeConfidence(evidence) : null
  const [, qualityWord] = hasDeepResult ? (QUALITY_LABELS[result.verdict] ?? [null, '']) : [null, '']

  return (
    <Modal title={project.name} onClose={onClose} size="xl">
      <div className="detail-header">
        {project.icon ? (
          <img src={project.icon} alt="" className="detail-icon" />
        ) : (
          <div className="detail-icon detail-icon-fallback">{project.name.charAt(0).toUpperCase()}</div>
        )}
        <div className="detail-header-text">
          <div className="detail-header-title-row">
            <h3 className="detail-name">{project.name}</h3>
            {project.featured && <span className="detail-featured">★ Featured</span>}
            <button
              type="button"
              className={`btn-star ${isFavorite ? 'btn-star-active' : ''}`}
              onClick={onToggleFavorite}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? `Remove ${project.name} from watchlist` : `Add ${project.name} to watchlist`}
              title={isFavorite ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {isFavorite ? '★' : '☆'}
            </button>
          </div>
          {project.description && <p className="detail-description">{project.description}</p>}
          {project.categories?.length > 0 && (
            <div className="detail-tags">
              {project.categories.map((c) => (
                <span key={c} className="detail-tag">{c}</span>
              ))}
            </div>
          )}
          <div className="detail-links">
            {project.website && (
              <a href={project.website} target="_blank" rel="noopener noreferrer">
                Website ↗
              </a>
            )}
            {project.x && (
              <a href={project.x} target="_blank" rel="noopener noreferrer">
                X (Twitter) {xHandle(project.x)} ↗
              </a>
            )}
            {facts.githubUrl && (
              <a href={facts.githubUrl} target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            )}
          </div>
        </div>
        {result?.checkedAt && (
          <div className="detail-checked">Last checked: {fmtRelative(result.checkedAt)}</div>
        )}
      </div>

      {!hasDeepResult ? (
        <p className="empty detail-empty">
          {result?.status === 'checking'
            ? 'Deep check in progress…'
            : 'No deep-check evidence yet — run Deep Check to populate this project\'s summary.'}
        </p>
      ) : (
        <>
          <div className="detail-score-row">
            <div className="detail-card detail-score-card">
              <div className="detail-score-gauge-col">
                <ScoreGauge score={result.score} verdict={result.verdict} />
                <div className="detail-verdict-word" style={{ color: TIER_COLORS[result.verdict] }}>
                  {qualityWord}
                </div>
                <p className="detail-verdict-blurb">{VERDICT_BLURBS[result.verdict]}</p>
                {confidence && (
                  <div className={`detail-confidence confidence-${confidence.level}`} title={confidence.detail}>
                    {confidence.label} ⓘ
                  </div>
                )}
              </div>
              <ScoreBreakdown evidence={evidence} />
            </div>

            <div className="detail-card detail-trend-card">
              <div className="detail-card-title">Vitality Score Trend</div>
              {history.length >= 2 ? (
                <>
                  <ScoreHistoryChart history={history} />
                  <div className="detail-trend-meta">{history.length} checks recorded</div>
                </>
              ) : (
                <p className="empty detail-history-empty">
                  Not enough history yet — run Deep Check again on this project to build a trend.
                </p>
              )}
            </div>
          </div>

          <CategoryTiles evidence={evidence} />

          <div className="detail-panels">
            <div className="detail-panel detail-panel-activity">
              <h4 className="detail-panel-title">Activity Overview</h4>
              <ActivityOverview facts={facts} />
            </div>
            <div className="detail-panel">
              <h4 className="detail-panel-title">Recent Signals</h4>
              <RecentSignals evidence={evidence} />
            </div>
            <div className="detail-panel">
              <RiskIndicators evidence={evidence} verdict={result.verdict} />
            </div>
          </div>
        </>
      )}

      {(project.aboutUs || project.longDescription) && (
        <div className="detail-panel detail-about">
          <h4 className="detail-panel-title">About</h4>
          {project.aboutUs ? (
            <SimpleMarkdown text={project.aboutUs} />
          ) : (
            <p>{project.longDescription}</p>
          )}
        </div>
      )}

      {project.screenshots?.length > 0 && (
        <div className="detail-screenshots">
          {project.screenshots.map((src, i) => (
            <a key={src} href={src} target="_blank" rel="noopener noreferrer">
              <img src={src} alt={`${project.name} screenshot ${i + 1}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </Modal>
  )
}
