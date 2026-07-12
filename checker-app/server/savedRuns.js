import { randomUUID } from 'node:crypto'

const MAX_SAVED_RUNS = 10

let schemaReady = null

/** Idempotent; memoized so it only runs once per warm process. Resets itself on failure so a transient error doesn't wedge every future call. */
function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS saved_runs (
          id UUID PRIMARY KEY,
          saved_at TIMESTAMPTZ NOT NULL,
          file_name TEXT,
          check_type TEXT NOT NULL,
          project_count INTEGER NOT NULL,
          projects JSONB NOT NULL,
          deep JSONB NOT NULL
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS saved_runs_saved_at_idx ON saved_runs (saved_at DESC)`
    })().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value
}

/** JSONB columns normally come back already parsed, but tolerate a raw string just in case. */
function parseJsonColumn(value, fallback) {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

function toMeta(row) {
  return {
    id: row.id,
    savedAt: toIso(row.saved_at),
    fileName: row.file_name,
    count: row.project_count,
    checkType: row.check_type,
  }
}

function toSnapshot(row) {
  return {
    id: row.id,
    savedAt: toIso(row.saved_at),
    fileName: row.file_name,
    checkType: row.check_type,
    projects: parseJsonColumn(row.projects, []),
    deep: parseJsonColumn(row.deep, {}),
  }
}

/** Newest first, up to MAX_SAVED_RUNS — metadata only, not the full projects/deep payload. */
export async function listSavedRunsMeta(sql) {
  await ensureSchema(sql)
  const rows = await sql`
    SELECT id, saved_at, file_name, check_type, project_count
    FROM saved_runs
    ORDER BY saved_at DESC
    LIMIT ${MAX_SAVED_RUNS}
  `
  return rows.map(toMeta)
}

/** Loads one full run by id, or the newest one when id is omitted. */
export async function getSavedRun(sql, id = null) {
  await ensureSchema(sql)
  const rows = id
    ? await sql`SELECT * FROM saved_runs WHERE id = ${id} LIMIT 1`
    : await sql`SELECT * FROM saved_runs ORDER BY saved_at DESC LIMIT 1`
  return rows[0] ? toSnapshot(rows[0]) : null
}

/**
 * Inserts a new run, then trims to the newest MAX_SAVED_RUNS rows — the same
 * rolling-window rule the old localStorage-based history used.
 */
export async function saveSnapshot(sql, { fileName, projects, deep, checkType }) {
  await ensureSchema(sql)
  const id = randomUUID()
  const savedAt = new Date().toISOString()
  await sql`
    INSERT INTO saved_runs (id, saved_at, file_name, check_type, project_count, projects, deep)
    VALUES (
      ${id}, ${savedAt}, ${fileName}, ${checkType}, ${projects.length},
      ${JSON.stringify(projects)}::jsonb, ${JSON.stringify(deep)}::jsonb
    )
  `
  await sql`
    DELETE FROM saved_runs
    WHERE id NOT IN (SELECT id FROM saved_runs ORDER BY saved_at DESC LIMIT ${MAX_SAVED_RUNS})
  `
  return { id, savedAt, fileName, checkType, count: projects.length }
}
