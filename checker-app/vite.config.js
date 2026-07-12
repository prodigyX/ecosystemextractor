import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { runPipeline } from './server/pipeline.js'
import { createStore } from './server/store.js'
import { loadEnv } from './server/util.js'
import { BERACHAIN_DIRECTORY_URL } from './server/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
}

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB — the project list is small; anything bigger is abuse
const MAX_PROJECTS_PER_RUN = 500

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > limit) {
        req.destroy()
        reject(new Error('Request body too large'))
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// Hostnames the check pipeline must never be pointed at — the deep check
// fetches attacker-suppliable URLs server-side, so block loopback/private
// ranges to keep it from probing the local machine or LAN (SSRF guard).
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
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (BLOCKED_HOST_PATTERNS.some((re) => re.test(url.hostname))) return null
    return url.href
  } catch {
    return null
  }
}

function sanitizeProjects(raw) {
  if (!Array.isArray(raw)) throw new Error('projects must be an array')
  if (raw.length === 0) throw new Error('No projects provided')
  if (raw.length > MAX_PROJECTS_PER_RUN) throw new Error(`Too many projects (max ${MAX_PROJECTS_PER_RUN})`)
  return raw.map((p) => ({
    id: String(p?.id ?? ''),
    name: String(p?.name ?? '').slice(0, 200),
    website: sanitizeCheckUrl(p?.website),
    x: sanitizeCheckUrl(p?.x),
  }))
}

function securityHeadersPlugin() {
  return {
    name: 'security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('X-Frame-Options', 'DENY')
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        // script/style 'unsafe-inline' is required by Vite's dev HMR preamble and
        // React inline style attributes; img/connect stay broad because the app's
        // whole job is loading third-party project icons and probing external sites.
        res.setHeader(
          'Content-Security-Policy',
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' https: data:",
            "connect-src 'self' https: http: ws: wss:",
            "font-src 'self' data:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; ')
        )

        // CSRF guard for the API: a cross-site page can't be allowed to trigger
        // server-side checks (or Puppeteer runs) through the user's browser.
        if (req.url?.startsWith('/api/')) {
          const origin = req.headers.origin
          if (origin && new URL(origin).host !== req.headers.host) {
            res.statusCode = 403
            res.end('Cross-origin requests are not allowed')
            return
          }
        }
        next()
      })
    },
  }
}

function berachainExtractPlugin() {
  return {
    name: 'berachain-extract',
    configureServer(server) {
      // ── Live extraction from explore.berachain.com ──
      server.middlewares.use('/api/extract', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('GET only')
          return
        }
        let browser
        try {
          browser = await launchBrowser()
          const page = await browser.newPage()
          await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          )
          await page.goto(BERACHAIN_DIRECTORY_URL, { waitUntil: 'networkidle0', timeout: 45000 })
          await new Promise((r) => setTimeout(r, 3000))

          const projects = await page.evaluate(() => {
            let masterArray = null
            try {
              for (const el of document.querySelectorAll('*')) {
                const key = Object.keys(el).find(
                  (k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber')
                )
                if (!key) continue
                let node = el[key]
                while (node) {
                  const props = node.memoizedProps
                  if (props && typeof props === 'object') {
                    for (const p in props) {
                      if (Array.isArray(props[p]) && props[p].length > 7) {
                        const sample = JSON.stringify(props[p][0] ?? '')
                        if (sample.includes('twitter') || sample.includes('external_url')) {
                          masterArray = props[p]
                          break
                        }
                      }
                    }
                  }
                  if (masterArray) break
                  node = node.return
                }
                if (masterArray) break
              }
            } catch {
              /* fiber scan failed — fall through to the __next_f strategy */
            }

            if (masterArray) return masterArray

            if (window.__next_f && Array.isArray(window.__next_f)) {
              const combined = window.__next_f
                .map((c) => (Array.isArray(c) && c[1] ? c[1] : ''))
                .join('\n')
              const matches = []
              const re = /\{"id":"[0-9a-f-]{36}","name":"[^"]+","slogan":/g
              let m
              while ((m = re.exec(combined)) !== null) {
                try {
                  let depth = 0, i = m.index
                  for (; i < combined.length; i++) {
                    if (combined[i] === '{') depth++
                    else if (combined[i] === '}') { depth--; if (depth === 0) break }
                  }
                  matches.push(JSON.parse(combined.slice(m.index, i + 1)))
                } catch {
                  /* malformed fragment — skip this match */
                }
              }
              if (matches.length > 0) return matches
            }
            return null
          })

          if (!projects || projects.length === 0) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Could not extract project data from page.' }))
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(projects))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        } finally {
          await browser?.close()
        }
      })

      // ── Deep liveness check: streams NDJSON progress events ──
      server.middlewares.use('/api/deep-check', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }
        try {
          const body = JSON.parse(await readBody(req))
          const projects = sanitizeProjects(body.projects)

          res.setHeader('Content-Type', 'application/x-ndjson')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('X-Accel-Buffering', 'no')

          const env = loadEnv(__dirname)
          const store = createStore()
          const emit = (event) => res.write(JSON.stringify(event) + '\n')

          await runPipeline(projects, { env, store, launchBrowser }, emit)
          res.end()
        } catch (err) {
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          } else {
            res.write(JSON.stringify({ type: 'error', error: err.message }) + '\n')
            res.end()
          }
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [securityHeadersPlugin(), react(), berachainExtractPlugin()],
  server: {
    proxy: {
      '/x-proxy': {
        target: 'https://x.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/x-proxy/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      },
    },
  },
})
