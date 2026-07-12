import { jsonApiResponse } from '../../shared/lib/apiResponse.js'

/**
 * @typedef {Object} SavedRunMeta
 * @property {string} id
 * @property {string} savedAt ISO timestamp
 * @property {string|null} fileName
 * @property {number} count
 * @property {'quick'|'deep'} checkType
 */

/**
 * @typedef {Object} SavedRunSnapshot
 * @property {string} id
 * @property {string} savedAt
 * @property {string|null} fileName
 * @property {'quick'|'deep'} checkType
 * @property {import('../../shared/domain/projects.js').Project[]} projects
 * @property {Record<string, unknown>} deep
 */

/**
 * Durable, server-side saved-run history (Postgres-backed — see
 * server/savedRuns.js): the same across every browser/device hitting this
 * deployment, unlike the old per-browser localStorage version.
 * @returns {Promise<SavedRunMeta[]>}
 */
export async function fetchSavedHistoryMeta() {
  return jsonApiResponse(await fetch('/api/saved-runs'))
}

/**
 * Loads one full run by id, or the newest one when id is omitted — the
 * server treats the literal id "latest" as "the newest full snapshot"
 * (a plain `/api/saved-runs` GET with no id returns the metadata list
 * instead, so there has to be an explicit way to ask for a single full run
 * without already knowing its id).
 * @param {string|null} [id]
 * @returns {Promise<SavedRunSnapshot|null>}
 */
export async function fetchSavedRun(id = null) {
  const res = await fetch(`/api/saved-runs?id=${encodeURIComponent(id ?? 'latest')}`)
  if (res.status === 404) return null
  return jsonApiResponse(res)
}

/**
 * Saves a completed run. The server trims history to the newest 10.
 * @param {{fileName: string|null, projects: import('../../shared/domain/projects.js').Project[], deep: Record<string, unknown>, checkType: 'quick'|'deep'}} run
 * @returns {Promise<{id: string, savedAt: string, fileName: string|null, checkType: string, count: number}>}
 */
export async function saveRunSnapshot({ fileName, projects, deep, checkType }) {
  const res = await fetch('/api/saved-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, projects, deep, checkType }),
  })
  return jsonApiResponse(res)
}
