import process from 'node:process'
import { createStore } from '../server/store.js'
import { getSql } from '../server/db.js'
import { clearAllSavedRuns } from '../server/savedRuns.js'
import { getClientIp, isSameOrigin, sendJson } from '../server/api-helpers.js'
import { isRateLimited } from '../server/rateLimiter.js'

/**
 * Wipes the server's Postgres-backed signal cache (X/GitHub lookups,
 * content-hash baselines, score history) AND all saved run history
 * ("Restore last run" / "Select from history") — a full reset, not just a
 * force-refresh. User-triggered from the "Clear check cache" button.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'POST only' })
    return
  }
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin requests are not allowed' })
    return
  }
  if (isRateLimited(`clear-cache:${getClientIp(req)}`, { limit: 10, windowMs: 60_000 })) {
    sendJson(res, 429, { error: 'Too many requests — please slow down.' })
    return
  }
  await createStore().clear()
  const sql = getSql(process.env)
  if (sql) await clearAllSavedRuns(sql)
  sendJson(res, 200, { cleared: true })
}
