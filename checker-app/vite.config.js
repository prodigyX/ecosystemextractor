import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runPipeline } from './server/pipeline.js'
import { createStore } from './server/store.js'
import { loadEnv } from './server/util.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BERACHAIN_URL = 'https://explore.berachain.com/'

function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function berachainExtractPlugin() {
  return {
    name: 'berachain-extract',
    configureServer(server) {
      // ── Live extraction from explore.berachain.com ──
      server.middlewares.use('/api/extract', async (req, res) => {
        let browser
        try {
          browser = await launchBrowser()
          const page = await browser.newPage()
          await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          )
          await page.goto(BERACHAIN_URL, { waitUntil: 'networkidle0', timeout: 45000 })
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
            } catch (_) {}

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
                } catch (_) {}
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
          const projects = body.projects || []
          if (!projects.length) throw new Error('No projects provided')

          res.setHeader('Content-Type', 'application/x-ndjson')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('X-Accel-Buffering', 'no')

          const env = loadEnv(__dirname)
          const store = createStore(join(__dirname, '.checker-store.json'))
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
  plugins: [react(), berachainExtractPlugin()],
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
