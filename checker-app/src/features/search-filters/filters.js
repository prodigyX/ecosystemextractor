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

/**
 * @typedef {{key: 'project'|'score', direction: 'asc'|'desc'}} SortState
 */

/**
 * Sorts projects for the results table. Unchecked projects have no score yet,
 * so a 'score' sort always pushes them to the end regardless of direction —
 * otherwise every unrun project would tie at the top of an ascending sort.
 * @param {import('../../shared/domain/projects.js').Project[]} projects
 * @param {Record<string, {score?: number}>} deep
 * @param {SortState|null} sort
 */
export function sortProjects(projects, deep, sort) {
  if (!sort) return projects
  const dir = sort.direction === 'desc' ? -1 : 1
  return [...projects].sort((a, b) => {
    if (sort.key === 'project') {
      return a.name.localeCompare(b.name) * dir
    }
    const scoreA = deep[a.id]?.score
    const scoreB = deep[b.id]?.score
    if (scoreA == null && scoreB == null) return 0
    if (scoreA == null) return 1
    if (scoreB == null) return -1
    return (scoreA - scoreB) * dir
  })
}
