import { extractBerachainProjects } from '../server/berachain-extract.js'
import { getClientIp, isSameOrigin, sendJson, sendSafeServerError } from '../server/api-helpers.js'
import { isRateLimited } from '../server/rateLimiter.js'
import { launchServerlessBrowser } from '../server/serverless-browser.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { error: 'GET only' })
    return
  }
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin requests are not allowed' })
    return
  }
  // Every call launches a real headless browser — expensive, worth guarding.
  if (isRateLimited(`extract:${getClientIp(req)}`, { limit: 5, windowMs: 60_000 })) {
    sendJson(res, 429, { error: 'Too many requests — please slow down.' })
    return
  }

  try {
    const projects = await extractBerachainProjects(launchServerlessBrowser)
    if (!projects?.length) {
      sendJson(res, 502, { error: 'Could not extract project data from the Berachain page.' })
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    sendJson(res, 200, projects)
  } catch (error) {
    sendSafeServerError(res, error, 'Berachain extraction failed')
  }
}
