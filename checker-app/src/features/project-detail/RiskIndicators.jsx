import { VerdictBadge } from '../../shared/components/VerdictBadge.jsx'

const MAX_ITEMS = 6

/**
 * A compact ✓/✗ checklist built from the project's real evidence — the
 * most severe findings first, reformatted for a quick scan rather than
 * duplicating the full evidence trail shown in Recent Signals.
 * @param {{evidence: Array<{level: string, label: string}>, verdict: string|undefined}} props
 */
export function RiskIndicators({ evidence, verdict }) {
  const severity = { bad: 0, warn: 1 }
  const items = [...evidence]
    .filter((e) => e.level === 'bad' || e.level === 'warn')
    .sort((a, b) => severity[a.level] - severity[b.level])
    .slice(0, MAX_ITEMS)

  return (
    <div className="risk-indicators">
      <div className="risk-header">
        <span className="risk-title">Risk Indicators</span>
        <VerdictBadge verdict={verdict} />
      </div>
      {items.length === 0 ? (
        <div className="risk-empty">
          <span aria-hidden="true">✓</span>
          <div><strong>No material risks detected</strong><p>The latest check found no warning or critical signals.</p></div>
        </div>
      ) : (
        <div className="risk-list">
          {items.map((e, i) => (
            <div key={i} className={`risk-item risk-${e.level}`}>
              <span className="risk-mark" aria-hidden="true">!</span>
              <span>{e.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
