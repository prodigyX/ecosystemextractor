import { getSql } from './db.js'

/**
 * Durable, Postgres-backed "last known good" X result per handle — a
 * separate table from server/store.js's signal cache, and deliberately
 * never touched by "Clear check cache" (see api/clear-cache.js). It exists
 * as a hard floor on how often X gets a live call: even right after the
 * regular cache is cleared, this table's own X_FALLBACK_REFETCH_DAYS window
 * (see server/config.js) still blocks a live retry, so clearing the cache
 * can never be used to bypass X's own rate limits.
 *
 * Only ever overwritten when a live fetch actually produces a usable result
 * (a genuine official-api/syndication success) — never with a lesser or
 * empty one, so this table only ever moves forward with real data.
 */

let schemaReady = null

function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS x_fallback (
        handle TEXT PRIMARY KEY,
        result JSONB NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL
      )
    `.catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

/** @returns {Promise<{result: object, fetchedAt: string}|null>} */
export async function getXFallback(handle) {
  const sql = getSql()
  if (!sql) return null
  try {
    await ensureSchema(sql)
    const rows = await sql`SELECT result, fetched_at FROM x_fallback WHERE handle = ${handle} LIMIT 1`
    if (!rows[0]) return null
    const fetchedAt = rows[0].fetched_at
    return { result: rows[0].result, fetchedAt: fetchedAt instanceof Date ? fetchedAt.toISOString() : fetchedAt }
  } catch (err) {
    console.error('[xFallback] read failed:', err.message)
    return null
  }
}

/** Overwrites the durable record for a handle — call only with a genuinely fresh, successful live result. */
export async function saveXFallback(handle, result) {
  const sql = getSql()
  if (!sql) return
  try {
    await ensureSchema(sql)
    await sql`
      INSERT INTO x_fallback (handle, result, fetched_at)
      VALUES (${handle}, ${JSON.stringify(result)}::jsonb, ${new Date().toISOString()})
      ON CONFLICT (handle) DO UPDATE SET result = EXCLUDED.result, fetched_at = EXCLUDED.fetched_at
    `
  } catch (err) {
    console.error('[xFallback] write failed:', err.message)
  }
}
