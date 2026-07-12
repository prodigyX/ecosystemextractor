import process from 'node:process'
import { getRateLimitSnapshot, refreshGithubRateLimit } from '../server/rateLimitStatus.js'
import { isSameOrigin, sendJson } from '../server/api-helpers.js'

/**
 * Diagnostic endpoint: returns the last-observed X syndication and GitHub
 * API rate-limit snapshots (see server/rateLimitStatus.js). GitHub's
 * snapshot is refreshed on every call via its free /rate_limit endpoint
 * first, so it's populated even before any project check has made a live
 * GitHub call. X has no equivalent free endpoint, so its snapshot only
 * reflects what a real deep-check run has actually observed.
 */
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
  await refreshGithubRateLimit(process.env.GITHUB_TOKEN)
  sendJson(res, 200, await getRateLimitSnapshot())
}
