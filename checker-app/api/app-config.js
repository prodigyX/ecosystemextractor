import { UPLOAD_JSON_ENABLED } from '../server/config.js'
import { isSameOrigin, sendJson } from '../server/api-helpers.js'

/**
 * Exposes the small set of server-side feature flags (server/config.js) that
 * the client needs to know about — e.g. whether "Upload JSON" should be
 * offered at all. Keeps the on/off switch in one place (config.js) instead
 * of duplicating a hardcoded flag in the frontend.
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
  sendJson(res, 200, { uploadJsonEnabled: UPLOAD_JSON_ENABLED })
}
