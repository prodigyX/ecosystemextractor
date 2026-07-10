import { useState } from 'react'

const EVIDENCE_ICON = { good: '●', warn: '●', bad: '●', info: '○' }

function tabOf(level) {
  if (level === 'good') return 'positive'
  if (level === 'info') return 'neutral'
  return 'negative' // warn + bad
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'positive', label: 'Positive' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'negative', label: 'Negative' },
]

/**
 * The project's real evidence trail, filterable by All/Positive/Neutral/Negative.
 * @param {{evidence: Array<{signal: string, level: string, label: string, detail?: string}>}} props
 */
export function RecentSignals({ evidence }) {
  const [tab, setTab] = useState('all')
  const filtered = tab === 'all' ? evidence : evidence.filter((e) => tabOf(e.level) === tab)

  return (
    <div className="recent-signals">
      <div className="signals-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`signals-tab ${tab === t.key ? 'signals-tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No signals in this category.</p>
      ) : (
        <div className="signals-list">
          {filtered.map((e, i) => (
            <div key={i} className={`signals-item ev-${e.level}`}>
              <span className="ev-dot">{EVIDENCE_ICON[e.level] ?? '○'}</span>
              <div className="signals-item-text">
                <span className="ev-label">{e.label}</span>
                {e.detail && <span className="signals-item-detail">{e.detail}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
