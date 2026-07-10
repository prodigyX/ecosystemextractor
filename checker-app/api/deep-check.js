import process from 'node:process'
import { runPipeline } from '../server/pipeline.js'
import { createStore } from '../server/store.js'
import { isSameOrigin, readJsonBody, sanitizeProjects, sendJson } from '../server/api-helpers.js'
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

  try {
    const body = await readJsonBody(req)
    const projects = sanitizeProjects(body.projects)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    // Vercel only guarantees writable disk space under /tmp. This store is a
    // warm-instance cache; durable run history remains in browser localStorage.
    const store = createStore('/tmp/ecosystem-checker-store.json')
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
