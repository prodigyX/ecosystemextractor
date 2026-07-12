import { getSql } from './db.js'

/**
 * Durable, Postgres-backed "last known good" GitHub result per repo — a
 * separate table from server/store.js's signal cache, and deliberately
 * never touched by "Clear check cache" (see api/clear-cache.js). Same
 * pattern as server/xFallback.js, but with a much shorter floor (see
 * GITHUB_FALLBACK_REFETCH_DAYS in server/config.js) since GitHub's API is
 * reliable and has a generous quota — this is a light debounce, not a hard
 * rate-limit workaround like X's.
 *
 * Only ever overwritten when a live fetch actually produces a usable result
 * — never with a lesser or empty one, so this table only ever moves forward
 * with real data.
 */

let schemaReady = null

function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS github_fallback (
        repo_key TEXT PRIMARY KEY,
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
export async function getGithubFallback(repoKey) {
  const sql = getSql()
  if (!sql) return null
  try {
    await ensureSchema(sql)
    const rows = await sql`SELECT result, fetched_at FROM github_fallback WHERE repo_key = ${repoKey} LIMIT 1`
    if (!rows[0]) return null
    const fetchedAt = rows[0].fetched_at
    return { result: rows[0].result, fetchedAt: fetchedAt instanceof Date ? fetchedAt.toISOString() : fetchedAt }
  } catch (err) {
    console.error('[githubFallback] read failed:', err.message)
    return null
  }
}

/** Overwrites the durable record for a repo — call only with a genuinely fresh, successful live result. */
export async function saveGithubFallback(repoKey, result) {
  const sql = getSql()
  if (!sql) return
  try {
    await ensureSchema(sql)
    await sql`
      INSERT INTO github_fallback (repo_key, result, fetched_at)
      VALUES (${repoKey}, ${JSON.stringify(result)}::jsonb, ${new Date().toISOString()})
      ON CONFLICT (repo_key) DO UPDATE SET result = EXCLUDED.result, fetched_at = EXCLUDED.fetched_at
    `
  } catch (err) {
    console.error('[githubFallback] write failed:', err.message)
  }
}
