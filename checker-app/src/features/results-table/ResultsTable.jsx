import { StatusBadge } from '../../shared/components/StatusBadge.jsx'
import { VerdictBadge } from '../../shared/components/VerdictBadge.jsx'
import { OverallBadge } from '../../shared/components/OverallBadge.jsx'
import { QualityBadge } from '../../shared/components/QualityBadge.jsx'
import { EvidenceList } from './EvidenceList.jsx'

const COLUMN_COUNT = 11

/**
 * @param {{
 *   projects: import('../../shared/domain/projects.js').Project[],
 *   deep: Record<string, {status: string, score?: number, verdict?: string, facts?: object, evidence?: Array}>,
 *   expanded: Set<string>,
 *   onToggleExpand: (id: string) => void,
 *   selectedProjectId: string|null,
 *   onOpenDetail: (id: string) => void,
 *   sort?: {key: 'project'|'score', direction: 'asc'|'desc'}|null,
 *   onSort?: (key: 'project'|'score') => void,
 * }} props
 */
export function ResultsTable({ projects, deep, expanded, onToggleExpand, selectedProjectId, onOpenDetail, sort, onSort }) {
  const sortIndicator = (key) => {
    if (sort?.key !== key) return null
    return <span className={`chevron sort-chevron ${sort.direction === 'asc' ? 'chevron-up' : ''}`} aria-hidden="true" />
  }
  const ariaSort = (key) => (sort?.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none')

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="col-num">#</th>
            <th
              className="col-sortable"
              aria-sort={ariaSort('project')}
              onClick={() => onSort?.('project')}
            >
              <span className="th-sort-label">Project{sortIndicator('project')}</span>
            </th>
            <th>Website</th>
            <th className="col-status">Website Status</th>
            <th>X (Twitter)</th>
            <th className="col-status">X Status</th>
            <th className="col-status col-overall">Overall</th>
            <th
              className="col-score col-sortable"
              aria-sort={ariaSort('score')}
              onClick={() => onSort?.('score')}
            >
              <span className="th-sort-label">Score{sortIndicator('score')}</span>
            </th>
            <th className="col-status">Verdict</th>
            <th className="col-detail"></th>
            <th className="col-expand"></th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => {
            const d = deep[p.id]
            const isExpanded = expanded.has(p.id)
            const isSelected = selectedProjectId === p.id
            // Stripe by array index, not CSS nth-child: an expanded row injects
            // an extra sibling <tr> that would otherwise shift nth-child parity
            // for every row below it.
            const rowClasses = [
              i % 2 === 1 && 'row-alt',
              isExpanded && 'row-expanded',
              isSelected && 'row-selected',
            ].filter(Boolean).join(' ')
            return [
              <tr key={p.id} className={rowClasses}>
                <td className="col-num">{i + 1}</td>
                <td className="col-name">{p.name}</td>
                <td className="col-url">
                  {p.website ? (
                    <a href={p.website} target="_blank" rel="noopener noreferrer">
                      {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  ) : (
                    <span className="empty">—</span>
                  )}
                </td>
                <td className="col-status"><StatusBadge status={p.websiteStatus} /></td>
                <td className="col-url">
                  {p.x ? (
                    <a href={p.x} target="_blank" rel="noopener noreferrer">
                      {p.x.replace('https://x.com/', '@').replace('https://twitter.com/', '@')}
                    </a>
                  ) : (
                    <span className="empty">—</span>
                  )}
                </td>
                <td className="col-status"><StatusBadge status={p.xStatus} /></td>
                <td className="col-status col-overall">
                  {d?.status === 'done' ? (
                    <QualityBadge verdict={d.verdict} />
                  ) : d?.status === 'checking' ? (
                    <span className="badge checking">Checking…</span>
                  ) : (
                    <OverallBadge ws={p.websiteStatus} xs={p.xStatus} />
                  )}
                </td>
                <td className="col-score">
                  {d?.status === 'done' ? (
                    <span className={`score score-${d.verdict}`}>
                      {d.score}
                      <span className="score-max">/100</span>
                    </span>
                  ) : d?.status === 'checking' ? (
                    <span className="score checking-dots">…</span>
                  ) : (
                    <span className="empty">—</span>
                  )}
                </td>
                <td className="col-status">
                  <VerdictBadge verdict={d?.status === 'checking' ? 'checking' : d?.verdict} />
                </td>
                <td className="col-detail">
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => onOpenDetail(p.id)}
                    aria-label={`View dashboard summary for ${p.name}`}
                    title="View dashboard summary"
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="1.5" y="8.5" width="3" height="6" rx="1" fill="currentColor" />
                      <rect x="6.5" y="4.5" width="3" height="10" rx="1" fill="currentColor" />
                      <rect x="11.5" y="1.5" width="3" height="13" rx="1" fill="currentColor" />
                    </svg>
                  </button>
                </td>
                <td className="col-expand">
                  {d?.evidence?.length > 0 && (
                    <button
                      type="button"
                      className="btn-expand"
                      onClick={() => onToggleExpand(p.id)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Collapse details for ${p.name}` : `Expand details for ${p.name}`}
                    >
                      <span className={`chevron ${isExpanded ? 'chevron-up' : ''}`} aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>,
              isExpanded && d?.evidence?.length > 0 && (
                <tr key={`${p.id}-detail`} className="detail-row">
                  <td colSpan={COLUMN_COUNT}>
                    <EvidenceList evidence={d.evidence} />
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
