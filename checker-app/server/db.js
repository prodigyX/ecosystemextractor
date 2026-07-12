import process from 'node:process'
import { neon } from '@neondatabase/serverless'

let cachedSql = null
let cachedUrl = null

/**
 * Returns a memoized Neon Postgres client, or null if no connection string
 * is configured yet. Every durable server-side table (signal cache, saved
 * runs, etc.) shares this one client.
 *
 * Provision a Postgres database via the Vercel dashboard's Storage tab (the
 * Neon integration) and link it to this project; Vercel injects a
 * connection string automatically. This checks both DATABASE_URL (Neon's
 * current naming) and POSTGRES_URL (the legacy name from the old
 * @vercel/postgres integration) so either works.
 * @param {Record<string, string|undefined>} [env] defaults to process.env
 */
export function getSql(env = process.env) {
  const url = env.DATABASE_URL || env.POSTGRES_URL || null
  if (!url) return null
  if (cachedSql && cachedUrl === url) return cachedSql
  cachedSql = neon(url)
  cachedUrl = url
  return cachedSql
}
