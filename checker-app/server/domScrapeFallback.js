import { getSql } from './db.js'

/**
 * Durable, Postgres-backed cache of headless-browser DOM scans per URL (see
 * server/domScrape.js) — a separate table from server/store.js's signal
 * cache, and deliberately never touched by "Clear check cache" (see
 * api/clear-cache.js). Same pattern as server/xFallback.js and
 * server/githubFallback.js, but unlike those two, this one is overwritten
 * on *every* attempt, successful or not — a real Chromium launch+render is
 * expensive and a timeout risk on constrained environments (e.g. Vercel's
 * free tier), so the goal here is purely to avoid repeating that attempt on
 * every single check, not to only move forward on genuinely better data.
 */

let schemaReady = null

function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS dom_scrape_fallback (
        url TEXT PRIMARY KEY,
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
export async function getDomScrapeFallback(url) {
  const sql = getSql()
  if (!sql) return null
  try {
    await ensureSchema(sql)
    const rows = await sql`SELECT result, fetched_at FROM dom_scrape_fallback WHERE url = ${url} LIMIT 1`
    if (!rows[0]) return null
    const fetchedAt = rows[0].fetched_at
    return { result: rows[0].result, fetchedAt: fetchedAt instanceof Date ? fetchedAt.toISOString() : fetchedAt }
  } catch (err) {
    console.error('[domScrapeFallback] read failed:', err.message)
    return null
  }
}

/** Overwrites the durable record for a URL — called after every real render attempt, regardless of outcome. */
export async function saveDomScrapeFallback(url, result) {
  const sql = getSql()
  if (!sql) return
  try {
    await ensureSchema(sql)
    await sql`
      INSERT INTO dom_scrape_fallback (url, result, fetched_at)
      VALUES (${url}, ${JSON.stringify(result)}::jsonb, ${new Date().toISOString()})
      ON CONFLICT (url) DO UPDATE SET result = EXCLUDED.result, fetched_at = EXCLUDED.fetched_at
    `
  } catch (err) {
    console.error('[domScrapeFallback] write failed:', err.message)
  }
}
