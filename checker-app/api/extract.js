import { extractBerachainProjects } from '../server/berachain-extract.js'
import { isSameOrigin, sendJson } from '../server/api-helpers.js'
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

  try {
    const projects = await extractBerachainProjects(launchServerlessBrowser)
    if (!projects?.length) {
      sendJson(res, 502, { error: 'Could not extract project data from the Berachain page.' })
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    sendJson(res, 200, projects)
  } catch (error) {
    console.error('[api/extract]', error)
    sendJson(res, 500, { error: error.message || 'Berachain extraction failed' })
  }
}
