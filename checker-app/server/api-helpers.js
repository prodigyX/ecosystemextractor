const MAX_BODY_BYTES = 1024 * 1024
const MAX_PROJECTS_PER_RUN = 500

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^169\.254\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.local$/i,
  /\.internal$/i,
]

function sanitizeCheckUrl(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) return null
    return url.href
  } catch {
    return null
  }
}

export function sanitizeProjects(raw) {
  if (!Array.isArray(raw)) throw new Error('projects must be an array')
  if (raw.length === 0) throw new Error('No projects provided')
  if (raw.length > MAX_PROJECTS_PER_RUN) throw new Error(`Too many projects (max ${MAX_PROJECTS_PER_RUN})`)
  return raw.map((project) => ({
    id: String(project?.id ?? ''),
    name: String(project?.name ?? '').slice(0, 200),
    website: sanitizeCheckUrl(project?.website),
    x: sanitizeCheckUrl(project?.x),
  }))
}

/**
 * Rejects any request that isn't verifiably from this app's own frontend.
 * A same-origin fetch()/XHR call from our own JS always carries an Origin
 * header (browsers send it on same-origin requests too, not just
 * cross-origin ones) or, failing that, a Referer pointing back at this
 * host. A bare script/curl/Postman call typically sends neither — treating
 * "no Origin header" as automatically same-origin (the previous behavior)
 * let any such direct call bypass the UI entirely, which is exactly what
 * this check exists to prevent.
 */
export function isSameOrigin(req) {
  const host = req.headers.host
  const origin = req.headers.origin
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  const referer = req.headers.referer
  if (referer) {
    try {
      return new URL(referer).host === host
    } catch {
      return false
    }
  }
  return false
}

export async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body)

  let data = ''
  for await (const chunk of req) {
    data += chunk
    if (data.length > limit) throw new Error('Request body too large')
  }
  return JSON.parse(data)
}

export function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validate before it ever reaches a query — a malformed id would otherwise surface a raw Postgres type-cast error to the client. */
export function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** Best-effort client IP for rate-limiting purposes — trusts the platform-set header, not meaningful outside Vercel/a reverse proxy that sets it. */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return first?.trim() || req.socket?.remoteAddress || 'unknown'
}

/**
 * Sends a safe 500: never echoes a raw internal error message (DB
 * connection strings, query fragments, stack details) back to the client.
 * Known/expected validation failures should be sent with sendJson(res, 400,
 * {error}) directly using their own specific message instead of this.
 */
export function sendSafeServerError(res, error, publicMessage) {
  console.error(publicMessage, error)
  sendJson(res, 500, { error: publicMessage })
}
