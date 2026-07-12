import process from 'node:process'
import { getSql } from '../server/db.js'
import { listSavedRunsMeta, getSavedRun, saveSnapshot } from '../server/savedRuns.js'
import { getClientIp, isSameOrigin, isValidUuid, readJsonBody, sendJson, sendSafeServerError } from '../server/api-helpers.js'
import { isRateLimited } from '../server/rateLimiter.js'

const MAX_PROJECTS_PER_RUN = 500
// Saved-run snapshots carry full check evidence for every project, not just
// the lightweight id/name/website/x the deep-check request uses — a full
// 500-project deep-check result can genuinely exceed the 1MB default.
const MAX_SAVED_RUN_BODY_BYTES = 8 * 1024 * 1024

class ValidationError extends Error {}

function sanitizeSnapshotBody(body) {
  const projects = body?.projects
  const deep = body?.deep
  if (!Array.isArray(projects)) throw new ValidationError('projects must be an array')
  if (projects.length === 0) throw new ValidationError('No projects provided')
  if (projects.length > MAX_PROJECTS_PER_RUN) throw new ValidationError(`Too many projects (max ${MAX_PROJECTS_PER_RUN})`)
  if (!deep || typeof deep !== 'object' || Array.isArray(deep)) throw new ValidationError('deep must be an object')
  const checkType = body?.checkType === 'deep' ? 'deep' : body?.checkType === 'quick' ? 'quick' : null
  if (!checkType) throw new ValidationError("checkType must be 'quick' or 'deep'")
  const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 200) : null
  return { projects, deep, checkType, fileName }
}

/**
 * Durable saved-run history, backed by Postgres (see server/savedRuns.js) —
 * unlike the in-memory signal cache, this is meant to survive restarts and
 * be the same across every browser/device hitting this deployment.
 * GET               -> list of up to 10 run summaries, newest first
 * GET ?id=<uuid>    -> one full run (projects + deep results)
 * GET ?id=latest    -> the newest full run
 * POST              -> save a new run, trimming to the newest 10
 */
export default async function handler(req, res) {
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin requests are not allowed' })
    return
  }

  if (isRateLimited(`saved-runs:${getClientIp(req)}`, { limit: 30, windowMs: 60_000 })) {
    sendJson(res, 429, { error: 'Too many requests — please slow down.' })
    return
  }

  const sql = getSql(process.env)
  if (!sql) {
    sendJson(res, 503, {
      error: 'Saved-run history is not configured yet — link a Postgres database to this project in the Vercel dashboard.',
    })
    return
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const id = url.searchParams.get('id')
      if (id) {
        if (id !== 'latest' && !isValidUuid(id)) {
          sendJson(res, 400, { error: 'Invalid id' })
          return
        }
        const run = await getSavedRun(sql, id === 'latest' ? null : id)
        if (!run) {
          sendJson(res, 404, { error: 'Saved run not found' })
          return
        }
        sendJson(res, 200, run)
        return
      }
      sendJson(res, 200, await listSavedRunsMeta(sql))
      return
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req, MAX_SAVED_RUN_BODY_BYTES)
      const snapshot = sanitizeSnapshotBody(body)
      const saved = await saveSnapshot(sql, snapshot)
      sendJson(res, 200, saved)
      return
    }

    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'GET or POST only' })
  } catch (error) {
    if (error instanceof ValidationError) {
      sendJson(res, 400, { error: error.message })
      return
    }
    sendSafeServerError(res, error, 'Saved-run request failed')
  }
}
