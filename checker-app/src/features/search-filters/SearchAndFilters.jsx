import { useEffect, useRef, useState } from 'react'

const STATUS_PILLS = [
  { key: 'all', label: 'All' },
  { key: 'checked', label: 'Checked' },
  { key: 'running', label: 'Running' },
  { key: 'pending', label: 'Pending' },
]

const VERDICT_OPTIONS = [
  { key: 'active', label: 'Excellent' },
  { key: 'likely-active', label: 'Good' },
  { key: 'unclear', label: 'Fair' },
  { key: 'likely-dead', label: 'Poor (Likely Dead)' },
  { key: 'dead', label: 'Poor (Dead)' },
]

/**
 * The search bar + status pills + verdict-quality filter dropdown shown
 * above the results table.
 *
 * @param {{
 *   search: string,
 *   onSearchChange: (value: string) => void,
 *   statusFilter: 'all'|'checked'|'running'|'pending',
 *   onStatusFilterChange: (key: string) => void,
 *   statusCounts: {all: number, checked: number, running: number, pending: number},
 *   verdictFilter: Set<string>,
 *   onToggleVerdict: (key: string) => void,
 *   onClearVerdictFilter: () => void,
 * }} props
 */
export function SearchAndFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  verdictFilter,
  onToggleVerdict,
  onClearVerdictFilter,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!filtersOpen) return
    const onPointerDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setFiltersOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [filtersOpen])

  return (
    <div className="filters-bar">
      <div className="search-wrap">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search projects"
        />
      </div>

      <div className="pill-row">
        {STATUS_PILLS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`pill ${statusFilter === p.key ? 'pill-active' : ''}`}
            onClick={() => onStatusFilterChange(p.key)}
            aria-pressed={statusFilter === p.key}
          >
            {p.label} ({statusCounts[p.key] ?? 0})
          </button>
        ))}
      </div>

      <div className="filters-dropdown-wrap" ref={popoverRef}>
        <button
          type="button"
          className="btn btn-secondary filters-btn"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
        >
          Filters{verdictFilter.size > 0 ? ` (${verdictFilter.size})` : ''}
        </button>
        {filtersOpen && (
          <div className="filters-popover" role="menu">
            <div className="filters-popover-title">Filter by quality</div>
            {VERDICT_OPTIONS.map((v) => (
              <label key={v.key} className="filters-checkbox">
                <input
                  type="checkbox"
                  checked={verdictFilter.has(v.key)}
                  onChange={() => onToggleVerdict(v.key)}
                />
                {v.label}
              </label>
            ))}
            {verdictFilter.size > 0 && (
              <button type="button" className="filters-clear" onClick={onClearVerdictFilter}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
