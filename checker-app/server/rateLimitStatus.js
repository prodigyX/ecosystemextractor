import { fetchTimeout } from './util.js'
import { getSql } from './db.js'

/**
 * Postgres-backed X syndication / GitHub API rate-limit snapshots (one row
 * per source — see server/savedRuns.js for the same getSql()/ensureSchema
 * pattern used for saved-run history). This is meant to survive restarts
 * and be the same across every browser/device hitting this deployment,
 * same reasoning as saved-run history: unlike server/store.js's signal
 * result cache (intentionally reset on restart for freshness), knowing the
 * last-observed quota doesn't go stale just because the process restarted.
 *
 * Snapshots are only written when a *live* network call is actually made
 * (see server/signals/x.js's `viaSyndication` and server/signals/github.js's
 * `ghJson`) — a cache hit skips the live call entirely and therefore tells
 * us nothing new about the current quota.
 *
 * If no database is configured, every function here degrades to a no-op /
 * empty snapshot rather than throwing — quota tracking is diagnostic, not
 * required for the app's core checks to work.
 */

let schemaReady = null

function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS rate_limit_status (
        source TEXT PRIMARY KEY,
        limit_value INTEGER,
        remaining INTEGER,
        reset_at TIMESTAMPTZ,
        observed_at TIMESTAMPTZ NOT NULL
      )
    `.catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

function toFiniteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

async function recordRateLimit(source, headers, limitHeader, remainingHeader, resetHeader) {
  const sql = getSql()
  if (!sql) return
  const limit = toFiniteNumber(headers?.get?.(limitHeader))
  const remaining = toFiniteNumber(headers?.get?.(remainingHeader))
  const resetSeconds = toFiniteNumber(headers?.get?.(resetHeader))
  if (limit == null && remaining == null && resetSeconds == null) return
  const resetAt = resetSeconds != null ? new Date(resetSeconds * 1000).toISOString() : null
  try {
    await ensureSchema(sql)
    await sql`
      INSERT INTO rate_limit_status (source, limit_value, remaining, reset_at, observed_at)
      VALUES (${source}, ${limit}, ${remaining}, ${resetAt}, ${new Date().toISOString()})
      ON CONFLICT (source) DO UPDATE SET
        limit_value = EXCLUDED.limit_value,
        remaining = EXCLUDED.remaining,
        reset_at = EXCLUDED.reset_at,
        observed_at = EXCLUDED.observed_at
    `
  } catch {
    // Best-effort — a failed quota write must never break the actual check.
  }
}

/** @param {Headers} headers response headers from a live syndication.twitter.com call */
export async function recordXRateLimit(headers) {
  await recordRateLimit('x', headers, 'x-rate-limit-limit', 'x-rate-limit-remaining', 'x-rate-limit-reset')
}

/** @param {Headers} headers response headers from a live api.github.com call */
export async function recordGithubRateLimit(headers) {
  await recordRateLimit('github', headers, 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset')
}

/** Returns the last-seen snapshot for each source, or null per source if none observed yet / no database configured. */
export async function getRateLimitSnapshot() {
  const empty = { x: null, github: null }
  const sql = getSql()
  if (!sql) return empty
  try {
    await ensureSchema(sql)
    const rows = await sql`SELECT * FROM rate_limit_status`
    const result = { ...empty }
    for (const row of rows) {
      if (row.source !== 'x' && row.source !== 'github') continue
      result[row.source] = {
        limit: row.limit_value,
        remaining: row.remaining,
        resetAt: row.reset_at ? new Date(row.reset_at).getTime() : null,
        observedAt: new Date(row.observed_at).getTime(),
      }
    }
    return result
  } catch {
    return empty
  }
}

/**
 * Proactively refreshes the GitHub snapshot via the dedicated /rate_limit
 * endpoint, which GitHub explicitly excludes from counting against quota —
 * safe to call any time, unlike a real repo/user API request. This means
 * GitHub's quota can be shown immediately, even before any project's own
 * check happens to make a live call (e.g. every project hit the 5-day
 * per-record cache this run).
 *
 * X has no equivalent no-cost endpoint — any request that would reveal its
 * quota also spends from that same quota — so there is no safe way to
 * pre-warm the X snapshot the same way; it stays populated only by an
 * actual live syndication call.
 */
export async function refreshGithubRateLimit(token) {
  try {
    const headers = { Accept: 'application/vnd.github+json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetchTimeout('https://api.github.com/rate_limit', { headers }, 8000)
    if (res.ok) await recordGithubRateLimit(res.headers)
  } catch {
    // Best-effort only; the footer just keeps showing the last known snapshot.
  }
}
