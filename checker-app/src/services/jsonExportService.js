/**
 * Builds and downloads a machine-readable JSON export of the current
 * results: every project's core fields plus its full deep-check result
 * (score, verdict, facts, evidence trail, score history), mirroring the same
 * data the CSV export flattens (see csvExportService.js) without lossy
 * flattening.
 * @param {import('../shared/domain/projects.js').Project[]} projects
 * @param {Record<string, {score?: number, verdict?: string, facts?: object, evidence?: Array, history?: Array, checkedAt?: string}>} deep
 */
export function downloadJson(projects, deep) {
  const payload = {
    generatedAt: new Date().toISOString(),
    scoringNote:
      'Score = 50 base + sum of evidence points, clamped 0-100 (capped below the "active" band if any evidence is bad, and below a perfect score if any evidence is a warning). Verdicts: >=75 Active, 60-74 Likely Active, 40-59 Unclear, 25-39 Likely Dead, <25 Dead.',
    projects: projects.map((p) => {
      const result = deep[p.id] ?? null
      return {
        id: p.id,
        name: p.name,
        website: p.website ?? null,
        x: p.x ?? null,
        websiteStatus: p.websiteStatus,
        xStatus: p.xStatus,
        deepCheck: result
          ? {
              score: result.score ?? null,
              verdict: result.verdict ?? null,
              checkedAt: result.checkedAt ?? null,
              facts: result.facts ?? {},
              evidence: result.evidence ?? [],
              history: result.history ?? [],
            }
          : null,
      }
    }),
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ecosystem-status.json'
  a.click()
  URL.revokeObjectURL(url)
}
