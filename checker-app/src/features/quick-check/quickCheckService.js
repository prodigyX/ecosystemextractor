import { xHandleFromUrl } from '../../shared/lib/xHandle.js'

const TIMEOUT_MS = 10000

/**
 * Fetch-based alive/dead probe of a project's website. Uses mode:'no-cors'
 * so a same-origin-policy-opaque-but-reachable response still counts as
 * alive; only a network failure or timeout counts as dead.
 * @param {string} url
 * @returns {Promise<'alive'|'dead'>}
 */
export async function checkWebsite(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal })
    return 'alive'
  } catch {
    return 'dead'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch-based existence probe of an X/Twitter profile, routed through the
 * Vite dev server's /x-proxy middleware to dodge CORS on the raw domain.
 * @param {string} xUrl
 * @returns {Promise<'alive'|'not-found'|'dead'>}
 */
export async function checkXProfile(xUrl) {
  const handle = xHandleFromUrl(xUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`/x-proxy/${handle}`, { signal: controller.signal })
    return res.ok ? 'alive' : 'not-found'
  } catch {
    return 'dead'
  } finally {
    clearTimeout(timer)
  }
}
