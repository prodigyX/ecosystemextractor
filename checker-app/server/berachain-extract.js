import { UA } from './util.js'

const BERACHAIN_URL = 'https://explore.berachain.com/'

/** Extracts the live project array with a caller-provided browser launcher. */
export async function extractBerachainProjects(launchBrowser) {
  let browser
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.setUserAgent(UA)
    await page.goto(BERACHAIN_URL, { waitUntil: 'networkidle0', timeout: 45000 })
    await new Promise((resolve) => setTimeout(resolve, 3000))

    return await page.evaluate(() => {
      let masterArray = null
      try {
        for (const el of document.querySelectorAll('*')) {
          const key = Object.keys(el).find(
            (value) => value.startsWith('__reactContainer') || value.startsWith('__reactFiber')
          )
          if (!key) continue
          let node = el[key]
          while (node) {
            const props = node.memoizedProps
            if (props && typeof props === 'object') {
              for (const prop in props) {
                if (Array.isArray(props[prop]) && props[prop].length > 7) {
                  const sample = JSON.stringify(props[prop][0] ?? '')
                  if (sample.includes('twitter') || sample.includes('external_url')) {
                    masterArray = props[prop]
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
        // Fall through to Next.js's streamed page data.
      }

      if (masterArray) return masterArray

      if (window.__next_f && Array.isArray(window.__next_f)) {
        const combined = window.__next_f
          .map((chunk) => (Array.isArray(chunk) && chunk[1] ? chunk[1] : ''))
          .join('\n')
        const matches = []
        const pattern = /\{"id":"[0-9a-f-]{36}","name":"[^"]+","slogan":/g
        let match
        while ((match = pattern.exec(combined)) !== null) {
          try {
            let depth = 0
            let index = match.index
            for (; index < combined.length; index++) {
              if (combined[index] === '{') depth++
              else if (combined[index] === '}') {
                depth--
                if (depth === 0) break
              }
            }
            matches.push(JSON.parse(combined.slice(match.index, index + 1)))
          } catch {
            // Skip malformed fragments.
          }
        }
        if (matches.length > 0) return matches
      }
      return null
    })
  } finally {
    await browser?.close().catch(() => {})
  }
}
