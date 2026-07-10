export const STORAGE_KEY = 'ecosystem-checker:last-run'
export const HISTORY_STORAGE_KEY = 'ecosystem-checker:run-history'
export const MAX_SAVED_RUNS = 10

/**
 * @typedef {Object} SavedRunMeta
 * @property {string} id
 * @property {string} savedAt ISO timestamp
 * @property {string} [fileName]
 * @property {number} count
 * @property {'quick'|'deep'} checkType
 */

/**
 * @typedef {Object} SavedRunSnapshot
 * @property {string} id
 * @property {string} savedAt
 * @property {string} [fileName]
 * @property {'quick'|'deep'} checkType
 * @property {import('../../shared/domain/projects.js').Project[]} projects
 * @property {Record<string, unknown>} deep
 */

function normalizeSnapshot(value) {
  if (!value?.savedAt || !Array.isArray(value.projects)) return null
  const deep = value.deep && typeof value.deep === 'object' ? value.deep : {}
  return {
    ...value,
    id: String(value.id ?? value.savedAt),
    checkType: ['quick', 'deep'].includes(value.checkType)
      ? value.checkType
      : Object.keys(deep).length > 0 ? 'deep' : 'quick',
    deep,
  }
}

function newestFirst(runs) {
  return [...runs].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
}

/** Reads valid history plus the legacy single snapshot, without mutating storage. */
export function readSavedHistory() {
  const runs = []
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      for (const value of parsed) {
        const snapshot = normalizeSnapshot(value)
        if (snapshot) runs.push(snapshot)
      }
    }
  } catch {
    // A malformed history should not hide a still-valid legacy snapshot.
  }

  try {
    const legacyRaw = localStorage.getItem(STORAGE_KEY)
    const legacy = legacyRaw ? normalizeSnapshot(JSON.parse(legacyRaw)) : null
    if (legacy) runs.push(legacy)
  } catch {
    // Ignore malformed legacy data.
  }

  const seen = new Set()
  return newestFirst(runs)
    .filter((run) => {
      if (seen.has(run.id)) return false
      seen.add(run.id)
      return true
    })
    .slice(0, MAX_SAVED_RUNS)
}

/** @returns {SavedRunMeta[]} */
export function readSavedHistoryMeta() {
  return readSavedHistory().map((run) => ({
    id: run.id,
    savedAt: run.savedAt,
    fileName: run.fileName,
    count: run.projects.length,
    checkType: run.checkType,
  }))
}

/** Reads metadata for the newest historical run. */
export function readSavedMeta() {
  return readSavedHistoryMeta()[0] ?? null
}

function persistAsManyAsPossible(runs) {
  const limited = runs.slice(0, MAX_SAVED_RUNS)
  let lastError = null
  for (let count = limited.length; count >= 1; count--) {
    try {
      const stored = limited.slice(0, count)
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(stored))
      // The historical array now owns the migrated legacy snapshot; removing
      // the duplicate leaves more quota available for future runs.
      localStorage.removeItem(STORAGE_KEY)
      return stored
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('Unable to save run history')
}

/**
 * Adds a completed run to the front of history. The newest 10 are attempted;
 * if localStorage quota is smaller, older entries are progressively trimmed.
 * @param {{fileName: string|null, projects: import('../../shared/domain/projects.js').Project[], deep: Record<string, unknown>, checkType: 'quick'|'deep'}} run
 * @returns {SavedRunSnapshot}
 */
export function saveSnapshot({ fileName, projects, deep, checkType }) {
  const snapshot = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    fileName,
    checkType,
    projects,
    deep,
  }
  persistAsManyAsPossible([snapshot, ...readSavedHistory()])
  return snapshot
}

/** Loads the selected historical run, defaulting to the newest. */
export function loadSnapshot(id = null) {
  const history = readSavedHistory()
  return id ? history.find((run) => run.id === id) ?? null : history[0] ?? null
}

export function clearSnapshot() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(HISTORY_STORAGE_KEY)
}
