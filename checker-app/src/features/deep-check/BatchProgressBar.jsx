import { useCallback, useSyncExternalStore } from 'react'

function formatElapsed(startedAt) {
  if (!startedAt) return ''
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  return secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`
}

function subscribeToClockTick(callback) {
  const id = setInterval(callback, 1000)
  return () => clearInterval(id)
}

/**
 * Reads the wall-clock-derived "Started Xs ago" label via useSyncExternalStore
 * — the correct way to read a value (current time) that changes outside of
 * React's own state, without calling the impure `Date.now()` directly during
 * render (see server-mismatches / tearing: react.dev/reference/react/useSyncExternalStore).
 */
function useElapsedLabel(startedAt) {
  const getSnapshot = useCallback(() => formatElapsed(startedAt), [startedAt])
  return useSyncExternalStore(subscribeToClockTick, getSnapshot)
}

/**
 * Fixed bottom-docked panel shown while a deep check is running: live
 * per-project progress (derived from signal-completion counts), aggregate
 * completed/running/pending/issues stats, and a link to the full activity
 * feed.
 *
 * @param {{
 *   projects: import('../../shared/domain/projects.js').Project[],
 *   deep: Record<string, {status: string}>,
 *   signalProgress: Record<string, number>,
 *   totalSignals: number,
 *   startedAt: number|null,
 *   statusCounts: {checked: number, running: number, pending: number},
 *   issuesCount: number,
 *   onViewActivity: () => void,
 * }} props
 */
export function BatchProgressBar({
  projects,
  deep,
  signalProgress,
  totalSignals,
  startedAt,
  statusCounts,
  issuesCount,
  onViewActivity,
}) {
  const elapsed = useElapsedLabel(startedAt)
  const running = projects.filter((p) => deep[p.id]?.status === 'checking')

  return (
    <div className="batch-bar" role="status" aria-live="polite">
      <div className="batch-bar-inner">
        <div className="batch-header">
          <span className="batch-pulse" aria-hidden="true">◉</span>
          <span className="batch-title">Batch Check Progress</span>
          <span className="batch-meta">{statusCounts.running} Running · Started {elapsed}</span>
        </div>

        {running.length > 0 && (
          <div className="batch-running-list">
            {running.slice(0, 4).map((p) => {
              const pct = Math.min(100, Math.round(((signalProgress[p.id] ?? 0) / totalSignals) * 100))
              return (
                <div key={p.id} className="batch-running-item">
                  <div className="batch-running-name">{p.name}</div>
                  <div className="batch-running-sub">Deep Check · {pct}%</div>
                  <div className="progress-bar batch-mini-bar">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="batch-stats">
          <div className="batch-stat batch-stat-good">
            <span className="batch-stat-num">{statusCounts.checked}</span>
            <span className="batch-stat-label">Completed</span>
          </div>
          <div className="batch-stat batch-stat-running">
            <span className="batch-stat-num">{statusCounts.running}</span>
            <span className="batch-stat-label">Running</span>
          </div>
          <div className="batch-stat">
            <span className="batch-stat-num">{statusCounts.pending}</span>
            <span className="batch-stat-label">Pending</span>
          </div>
          <div className="batch-stat batch-stat-issues">
            <span className="batch-stat-num">{issuesCount}</span>
            <span className="batch-stat-label">Issues</span>
          </div>
          <button type="button" className="btn btn-secondary batch-view-btn" onClick={onViewActivity}>
            View Activity
          </button>
        </div>
      </div>
    </div>
  )
}
