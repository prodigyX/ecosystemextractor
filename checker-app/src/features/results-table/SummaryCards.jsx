const DEEP_CARDS = [
  { key: 'total', field: 'total', cls: 'total', label: 'Total' },
  { key: 'active', field: 'active', cls: 'alive', label: 'Active' },
  { key: 'likelyActive', field: 'likelyActive', cls: 'likely-active', label: 'Likely Active' },
  { key: 'unclear', field: 'unclear', cls: 'maybe', label: 'Unclear' },
  { key: 'likelyDead', field: 'likelyDead', cls: 'possibly-dead', label: 'Likely Dead' },
  { key: 'dead', field: 'dead', cls: 'dead', label: 'Dead' },
]

const QUICK_CARDS = [
  { key: 'total', field: 'total', cls: 'total', label: 'Total' },
  { key: 'alive', field: 'alive', cls: 'alive', label: 'Alive' },
  { key: 'maybe', field: 'maybe', cls: 'maybe', label: 'Maybe' },
  { key: 'possiblyDead', field: 'possiblyDead', cls: 'possibly-dead', label: 'Possibly Dead' },
  { key: 'dead', field: 'dead', cls: 'dead', label: 'Dead' },
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
          <span className="summary-num">{counts[c.field]}</span>
          <span className="summary-label">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
