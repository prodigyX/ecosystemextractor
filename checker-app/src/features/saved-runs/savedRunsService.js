export const STORAGE_KEY = 'ecosystem-checker:last-run'

/**
 * @typedef {Object} SavedRunMeta
 * @property {string} savedAt ISO timestamp
 * @property {string} [fileName]
 * @property {number} count
 */

/**
 * @typedef {Object} SavedRunSnapshot
 * @property {string} savedAt
 * @property {string} [fileName]
 * @property {import('../../shared/domain/projects.js').Project[]} projects
 * @property {Record<string, unknown>} deep
 */

/**
 * Reads just the metadata of the last saved run, without loading the full payload.
 * @returns {SavedRunMeta|null}
 */
export function readSavedMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved?.savedAt || !Array.isArray(saved.projects)) return null
    return { savedAt: saved.savedAt, fileName: saved.fileName, count: saved.projects.length }
  } catch {
    return null
  }
}

/**
 * Persists a run snapshot to localStorage. Throws if storage is full or unavailable.
 * @param {{fileName: string|null, projects: import('../../shared/domain/projects.js').Project[], deep: Record<string, unknown>}} run
 * @returns {SavedRunSnapshot}
 */
export function saveSnapshot({ fileName, projects, deep }) {
  const snapshot = { savedAt: new Date().toISOString(), fileName, projects, deep }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  return snapshot
}

/**
 * Loads the full last-run snapshot. Throws if the stored payload is corrupted.
 * @returns {SavedRunSnapshot|null}
 */
export function loadSnapshot() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const saved = JSON.parse(raw)
  if (!Array.isArray(saved.projects)) throw new Error('bad snapshot')
  return saved
}

export function clearSnapshot() {
  localStorage.removeItem(STORAGE_KEY)
}
