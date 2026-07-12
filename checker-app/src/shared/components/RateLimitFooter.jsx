import { useEffect, useState } from 'react'

/**
 * @param {number|null} resetAt epoch ms
 * @returns {string|null}
 */
function formatResetIn(resetAt) {
  if (!resetAt) return null
  const ms = resetAt - Date.now()
  if (ms <= 0) return 'now'
  const mins = Math.round(ms / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return remMins ? `${hours}h ${remMins}m` : `${hours}h`
}

/**
 * @param {{label: string, snapshot: {limit: number|null, remaining: number|null, resetAt: number|null}|null|undefined}} props
 */
function QuotaStatus({ label, snapshot }) {
  if (!snapshot) {
    return (
      <span className="rate-limit-item rate-limit-item-unknown">
        <span className="rate-limit-dot" aria-hidden="true" />
        {label}: no data yet
      </span>
    )
  }

  const { limit, remaining, resetAt } = snapshot
  const low = remaining != null && limit != null && limit > 0 && remaining / limit <= 0.2
  const resetIn = formatResetIn(resetAt)

  return (
    <span className={`rate-limit-item ${low ? 'rate-limit-item-low' : ''}`}>
      <span className="rate-limit-dot" aria-hidden="true" />
      {label}: {remaining ?? '?'}/{limit ?? '?'} remaining
      {resetIn && ` · resets ${resetIn}`}
    </span>
  )
}

/**
 * Footer showing the last-observed X syndication and GitHub API rate-limit
 * quota, read from the server's in-memory snapshot (server/rateLimitStatus.js)
 * via GET /api/rate-limits. This component never calls X or GitHub itself —
 * it only reports what a real deep-check run has already observed, so it is
 * safe to fetch on mount without contributing to rate-limit pressure.
 *
 * Refetches once on mount and again whenever `refreshToken` changes (the
 * dashboard passes the deep-check hook's `completedAt` timestamp, which
 * changes each time a run finishes) — no background polling, to avoid
 * hammering the endpoint.
 * @param {{refreshToken?: unknown}} props
 */
export function RateLimitFooter({ refreshToken }) {
  const [snapshot, setSnapshot] = useState(null)
  // formatResetIn reads Date.now() at render time, so nothing re-renders
  // this component as real time passes unless something changes state —
  // without this, "resets 12m" would freeze at whatever it said on the last
  // fetch instead of counting down toward "now" as the window actually clears.
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/rate-limits')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setSnapshot(data)
      })
      .catch(() => {
        // Informational footer only — keep showing whatever was last known.
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <footer className="app-footer">
      <span className="app-footer-label">API quota</span>
      <QuotaStatus label="X (API)" snapshot={snapshot?.xOfficial} />
      <QuotaStatus label="X (syndication)" snapshot={snapshot?.x} />
      <QuotaStatus label="GitHub" snapshot={snapshot?.github} />
    </footer>
  )
}
