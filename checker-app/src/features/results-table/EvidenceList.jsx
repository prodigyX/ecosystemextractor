const EVIDENCE_ICON = { good: '●', warn: '●', bad: '●', info: '○' }

/**
 * @param {{evidence: Array<{signal: string, level: 'good'|'warn'|'bad'|'info', label: string, detail?: string, delta: number}>}} props
 */
export function EvidenceList({ evidence }) {
  return (
    <div className="evidence-list">
      {evidence.map((e, j) => (
        <div key={j} className={`evidence-item ev-${e.level}`}>
          <span className="ev-dot">{EVIDENCE_ICON[e.level]}</span>
          <span className="ev-signal">{e.signal}</span>
          <span className="ev-label">{e.label}</span>
          {e.detail && <span className="ev-detail">{e.detail}</span>}
          {e.delta !== 0 && (
            <span className={`ev-delta ${e.delta > 0 ? 'pos' : 'neg'}`}>
              {e.delta > 0 ? `+${e.delta}` : e.delta}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
