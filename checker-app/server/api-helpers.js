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

export function isSameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body)

  let data = ''
  for await (const chunk of req) {
    data += chunk
    if (data.length > MAX_BODY_BYTES) throw new Error('Request body too large')
  }
  return JSON.parse(data)
}

export function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}
