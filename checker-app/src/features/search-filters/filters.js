/**
 * @typedef {'checked'|'running'|'pending'} DeepCheckStatus
 */

/**
 * A project's deep-check lifecycle state, independent of whether a run is
 * currently in progress — used to drive the status filter pills.
 * @param {import('../../shared/domain/projects.js').Project} project
 * @param {Record<string, {status?: string}>} deep
 * @returns {DeepCheckStatus}
 */
export function deepCheckStatus(project, deep) {
  const status = deep[project.id]?.status
  if (status === 'done') return 'checked'
  if (status === 'checking') return 'running'
  return 'pending'
}

/**
 * @param {import('../../shared/domain/projects.js').Project[]} projects
 * @param {Record<string, {status?: string}>} deep
 * @returns {{all: number, checked: number, running: number, pending: number}}
 */
export function computeStatusCounts(projects, deep) {
  const counts = { all: projects.length, checked: 0, running: 0, pending: 0 }
  for (const p of projects) counts[deepCheckStatus(p, deep)]++
  return counts
}

/**
 * @param {import('../../shared/domain/projects.js').Project[]} projects
 * @param {Record<string, {status?: string, verdict?: string}>} deep
 * @param {{search: string, statusFilter: 'all'|DeepCheckStatus, verdictFilter: Set<string>}} filters
 */
export function filterProjects(projects, deep, { search, statusFilter, verdictFilter }) {
  const q = search.trim().toLowerCase()
  return projects.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false
    if (statusFilter !== 'all' && deepCheckStatus(p, deep) !== statusFilter) return false
    if (verdictFilter.size > 0) {
      const v = deep[p.id]?.verdict
      if (!v || !verdictFilter.has(v)) return false
    }
    return true
  })
}
