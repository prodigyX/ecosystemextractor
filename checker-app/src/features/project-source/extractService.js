/**
 * Fetches the live Berachain ecosystem extract from the dev server's
 * Puppeteer-backed /api/extract endpoint.
 * @returns {Promise<import('../../shared/domain/projects.js').SourceProject[]>}
 */
export async function fetchBerachainExtract() {
  const res = await fetch('/api/extract')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Extraction failed')
  return Array.isArray(json) ? json : [json]
}
