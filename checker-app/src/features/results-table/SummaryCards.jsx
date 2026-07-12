const DEEP_CARDS = [
  { key: 'total', field: 'total', cls: 'total', label: 'Total', icon: '▦' },
  { key: 'active', field: 'active', cls: 'alive', label: 'Active', icon: '✓' },
  { key: 'likelyActive', field: 'likelyActive', cls: 'likely-active', label: 'Likely Active', icon: '◐' },
  { key: 'unclear', field: 'unclear', cls: 'maybe', label: 'Unclear', icon: '?' },
  { key: 'likelyDead', field: 'likelyDead', cls: 'possibly-dead', label: 'Likely Dead', icon: '⚠' },
  { key: 'dead', field: 'dead', cls: 'dead', label: 'Dead', icon: '✕' },
]

const QUICK_CARDS = [
  { key: 'total', field: 'total', cls: 'total', label: 'Total', icon: '▦' },
  { key: 'alive', field: 'alive', cls: 'alive', label: 'Alive', icon: '✓' },
  { key: 'maybe', field: 'maybe', cls: 'maybe', label: 'Maybe', icon: '?' },
  { key: 'possiblyDead', field: 'possiblyDead', cls: 'possibly-dead', label: 'Possibly Dead', icon: '⚠' },
  { key: 'dead', field: 'dead', cls: 'dead', label: 'Dead', icon: '✕' },
]

/**
 * Summary strip of count cards, shown above the results table. `variant`
 * selects which card set (and thus which fields of `counts` are read):
 * 'deep' for verdict counts from the deep check, 'quick' for overall-status
 * counts from the quick check.
 *
 * @param {{variant: 'deep'|'quick', counts: Record<string, number>}} props
 */
export function SummaryCards({ variant, counts }) {
  const cards = variant === 'deep' ? DEEP_CARDS : QUICK_CARDS
  return (
    <div className="summary">
      {cards.map((c) => (
        <div key={c.key} className={`summary-card ${c.cls}`}>
          <span className="summary-icon" aria-hidden="true">{c.icon}</span>
          <div className="summary-text">
            <span className="summary-num">{counts[c.field]}</span>
            <span className="summary-label">{c.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
