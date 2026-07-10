import { Modal } from '../../shared/components/Modal.jsx'
import { ScoreGauge } from './ScoreGauge.jsx'
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
 * Per-project "dashboard" view: banner + header (icon, tagline, category
 * tags, links, favorite star, featured flag), an About section sourced from
 * the ecosystem extract's own write-up, a screenshot strip, score gauge +
 * real history chart, category sub-scores, and three panels built from the
 * actual deep-check evidence — activity overview, filterable recent
 * signals, and a risk checklist. The About/screenshots content comes from
 * the source extract JSON and renders even before a project has been deep
 * checked; the score/evidence sections only appear once it has.
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

  return (
    <Modal title={project.name} onClose={onClose} size="xl">
      {project.banner && (
        <img src={project.banner} alt="" className="detail-banner" />
      )}

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

      {!hasDeepResult ? (
        <p className="empty detail-empty">
          {result?.status === 'checking'
            ? 'Deep check in progress…'
            : 'No deep-check evidence yet — run Deep Check to populate this project\'s summary.'}
        </p>
      ) : (
        <>
          <div className="detail-score-row">
            <ScoreGauge score={result.score} verdict={result.verdict} />
            <div className="detail-history">
              <div className="detail-history-title">Score History</div>
              {history.length >= 2 ? (
                <ScoreHistoryChart history={history} />
              ) : (
                <p className="empty detail-history-empty">
                  Not enough history yet — run Deep Check again on this project to build a trend.
                </p>
              )}
            </div>
          </div>

          <CategoryTiles evidence={evidence} />

          <div className="detail-panels">
            <div className="detail-panel">
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
    </Modal>
  )
}
