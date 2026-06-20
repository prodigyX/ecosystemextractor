import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BERACHAIN_URL = 'https://explore.berachain.com/'

function berachainExtractPlugin() {
  return {
    name: 'berachain-extract',
    configureServer(server) {
      server.middlewares.use('/api/extract', async (req, res) => {
        let browser
        try {
          browser = await puppeteer.launch({
            executablePath: CHROME,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
          })

          const page = await browser.newPage()
          await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          )

          await page.goto(BERACHAIN_URL, { waitUntil: 'networkidle0', timeout: 45000 })

          // Give React time to fully hydrate
          await new Promise((r) => setTimeout(r, 3000))

          const projects = await page.evaluate(() => {
            // Strategy 1: scan React fiber tree for the full project array
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

            // Strategy 2: parse window.__next_f streaming payload
            if (window.__next_f && Array.isArray(window.__next_f)) {
              const combined = window.__next_f
                .map((c) => (Array.isArray(c) && c[1] ? c[1] : ''))
                .join('\n')

              // Find JSON blobs that look like project objects
              const matches = []
              const re = /\{"id":"[0-9a-f-]{36}","name":"[^"]+","slogan":/g
              let m
              while ((m = re.exec(combined)) !== null) {
                try {
                  // Walk forward to find closing brace
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
