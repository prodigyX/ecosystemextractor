import process from 'node:process'
import { runPipeline } from '../server/pipeline.js'
import { store } from '../server/store.js'
import { getClientIp, isSameOrigin, readJsonBody, sanitizeProjects, sendJson } from '../server/api-helpers.js'
import { isRateLimited } from '../server/rateLimiter.js'
import { launchServerlessBrowser } from '../server/serverless-browser.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'POST only' })
    return
  }
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin requests are not allowed' })
    return
  }
  // Each run can launch Puppeteer and burn real GitHub/X API quota across
  // up to 500 projects, so this is the single most expensive endpoint here.
  if (isRateLimited(`deep-check:${getClientIp(req)}`, { limit: 5, windowMs: 60_000 })) {
    sendJson(res, 429, { error: 'Too many requests — please slow down.' })
    return
  }

  try {
    const body = await readJsonBody(req)
    const projects = sanitizeProjects(body.projects)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    // `store` is the process-wide in-memory singleton (see server/store.js):
    // shared across every request handled by this warm process, never
    // persisted to disk, and cleared automatically on a process restart.
    const emit = (event) => {
      if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`)
    }

    await runPipeline(
      projects,
      { env: process.env, store, launchBrowser: launchServerlessBrowser },
      emit
    )
    if (!res.writableEnded) res.end()
  } catch (error) {
    console.error('[api/deep-check]', error)
    if (!res.headersSent) {
      sendJson(res, 500, { error: error.message || 'Deep check failed' })
    } else if (!res.writableEnded) {
      res.write(`${JSON.stringify({ type: 'error', error: error.message || 'Deep check failed' })}\n`)
      res.end()
    }
  }
}
