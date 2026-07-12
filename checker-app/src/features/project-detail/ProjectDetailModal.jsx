import { Modal } from '../../shared/components/Modal.jsx'
import { VERDICT_BLURBS, computeConfidence } from '../../shared/domain/scoring.js'
import { ScoreGauge } from './ScoreGauge.jsx'
import { ScoreHistoryChart } from './ScoreHistoryChart.jsx'
import { CategoryTiles } from './CategoryTiles.jsx'
import { ActivityOverview } from './ActivityOverview.jsx'
import { RecentSignals } from './RecentSignals.jsx'
import { RiskIndicators } from './RiskIndicators.jsx'
import { SimpleMarkdown } from './SimpleMarkdown.jsx'

function fmtCheckedAt(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? 'recently'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
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

  return (
    <Modal title="Project health report" onClose={onClose} size="xl">
      <div className="detail-header">
        {project.icon ? (
          <img src={project.icon} alt="" className="detail-icon" />
        ) : (
          <div className="detail-icon detail-icon-fallback">{project.name.charAt(0).toUpperCase()}</div>
        )}
        <div className="detail-header-text">
          <div className="detail-eyebrow">Project intelligence</div>
          <div className="detail-header-title-row">
            <h3 className="detail-name">{project.name}</h3>
            {project.featured && <span className="detail-featured">★ Featured</span>}
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
                <span aria-hidden="true">◎</span> Website <span aria-hidden="true">↗</span>
              </a>
            )}
            {project.x && (
              <a href={project.x} target="_blank" rel="noopener noreferrer">
                <span aria-hidden="true">𝕏</span> {xHandle(project.x)} <span aria-hidden="true">↗</span>
              </a>
            )}
            {facts.githubUrl && (
              <a href={facts.githubUrl} target="_blank" rel="noopener noreferrer">
                <span aria-hidden="true">⌘</span> GitHub <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>
        <div className="detail-header-actions">
          <button
            type="button"
            className={`btn-watchlist ${isFavorite ? 'btn-watchlist-active' : ''}`}
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remove ${project.name} from watchlist` : `Add ${project.name} to watchlist`}
          >
            <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
            {isFavorite ? 'Watching' : 'Watchlist'}
          </button>
          {result?.checkedAt && (
            <time className="detail-checked" dateTime={result.checkedAt}>
              <span aria-hidden="true">●</span> Checked {fmtCheckedAt(result.checkedAt)}
            </time>
          )}
        </div>
      </div>

      {!hasDeepResult ? (
        <p className="empty detail-empty">
          {result?.status === 'checking'
            ? 'Deep check in progress…'
            : 'No deep-check evidence yet — run Deep Check to populate this project\'s summary.'}
        </p>
      ) : (
        <>
          <section className="detail-section" aria-labelledby="detail-overview-heading">
            <div className="detail-section-heading">
              <div>
                <div className="detail-section-kicker">Deep check overview</div>
                <h4 id="detail-overview-heading">Ecosystem health</h4>
              </div>
              <p>Live signals grouped into a single vitality score.</p>
            </div>

            <div className="detail-score-row">
              <div className="detail-card detail-score-card">
                <div className="detail-card-heading">
                  <div>
                    <span className="detail-card-kicker">Overall vitality</span>
                    <h5>Health score</h5>
                  </div>
                  {confidence && (
                    <div
                      className={`detail-confidence confidence-${confidence.level}`}
                      title={confidence.detail}
                      aria-label={`${confidence.label}. ${confidence.detail}`}
                    >
                      <span aria-hidden="true">●</span> {confidence.label}
                    </div>
                  )}
                </div>
                <div className="detail-score-card-body">
                  <div className="detail-score-gauge-col">
                    <ScoreGauge score={result.score} verdict={result.verdict} />
                    <p className="detail-verdict-blurb">{VERDICT_BLURBS[result.verdict]}</p>
                  </div>
                </div>
              </div>

              <div className="detail-card detail-trend-card">
                <div className="detail-card-heading">
                  <div>
                    <span className="detail-card-kicker">Score history</span>
                    <h5>Vitality trend</h5>
                  </div>
                  {history.length >= 2 && <span className="detail-trend-count">{history.length} checks</span>}
                </div>
                {history.length >= 2 ? (
                  <>
                    <ScoreHistoryChart history={history} />
                    <div className="detail-trend-meta">Each point represents a completed deep check.</div>
                  </>
                ) : (
                  <div className="detail-history-empty">
                    <div className="detail-history-icon" aria-hidden="true">↗</div>
                    <strong>Your trend starts here</strong>
                    <p>Run Deep Check again later to compare this score with a new snapshot.</p>
                    <span>1 of 2 checks recorded</span>
                  </div>
                )}
              </div>
            </div>

            <CategoryTiles evidence={evidence} facts={facts} />
          </section>

          <section className="detail-section" aria-labelledby="detail-signals-heading">
            <div className="detail-section-heading detail-section-heading-compact">
              <div>
                <div className="detail-section-kicker">Evidence</div>
                <h4 id="detail-signals-heading">Signal detail</h4>
              </div>
              <p>What the latest check found across the project.</p>
            </div>
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
          </section>
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
