import { getSql } from './db.js'

let schemaReady = null

/** Idempotent; memoized so it only runs once per warm process. Resets itself on failure so a transient error doesn't wedge every future call. */
function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS signal_cache (
        cache_key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `.catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

/**
 * Durable, Postgres-backed key/value cache shared by every signal check
 * (X/GitHub lookups, content-hash baselines) and score history — one row
 * per key, "when was this last fetched" living in `updated_at`. Survives
 * restarts and is the same across every browser/device/serverless instance
 * hitting this deployment, unlike a per-process in-memory or local-disk
 * store. If no database is configured, every method degrades to a no-op
 * (get returns null, set does nothing) rather than throwing — a signal
 * check without a working cache should still complete, just without reuse.
 *
 * `preload(keys)` bulk-fetches a batch of keys in a single query up front —
 * runPipeline uses this for every project's X cache key, since those are
 * all known before a run starts (derived from each project's `x` field),
 * unlike GitHub's cache key, which is only discovered at runtime by
 * scraping each project's site for a GitHub link. Preloaded keys resolve
 * from memory with zero further round trips; anything not preloaded still
 * resolves correctly through its own query.
 */
export function createStore() {
  const preloaded = new Map()

  return {
    async preload(keys) {
      const sql = getSql()
      if (!sql || keys.length === 0) return
      try {
        await ensureSchema(sql)
        const rows = await sql`SELECT cache_key, value FROM signal_cache WHERE cache_key = ANY(${keys})`
        for (const row of rows) preloaded.set(row.cache_key, row.value)
      } catch (err) {
        console.error('[store] preload failed:', err.message)
      }
    },

    async get(key) {
      if (preloaded.has(key)) return preloaded.get(key)
      const sql = getSql()
      if (!sql) return null
      try {
        await ensureSchema(sql)
        const rows = await sql`SELECT value FROM signal_cache WHERE cache_key = ${key} LIMIT 1`
        return rows[0]?.value ?? null
      } catch (err) {
        console.error('[store] get failed:', err.message)
        return null
      }
    },

    async set(key, value) {
      preloaded.set(key, value)
      const sql = getSql()
      if (!sql) return
      try {
        await ensureSchema(sql)
        await sql`
          INSERT INTO signal_cache (cache_key, value, updated_at)
          VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${new Date().toISOString()})
          ON CONFLICT (cache_key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        `
      } catch (err) {
        console.error('[store] set failed:', err.message)
      }
    },
  }
}
