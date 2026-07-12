import { UA } from './util.js'
import { classifyLink } from './signals/content.js'

/**
 * Last-resort fallback for JS-rendered sites (client-side React/Next apps
 * etc.) where content.js's plain fetch() only ever sees an empty HTML shell
 * — the real content, including any Discord/Telegram links, only exists
 * after JS actually runs. Renders the page with a real (headless) browser
 * and re-scans the fully hydrated DOM using classifyLink, the exact same
 * rule content.js's primary scrape uses, so results are consistent either
 * way.
 *
 * Deliberately last-resort, not primary: server/pipeline.js only calls this
 * once the plain-fetch scrape *and* the X-bio/Linktree fallback have both
 * already been tried and a link is still missing — launching a full browser
 * per project is expensive, and X checks were deliberately moved away from
 * this same approach earlier for reliability reasons (X specifically served
 * headless sessions a stale decoy page). A general project homepage doesn't
 * have that same incentive to detect and evade headless browsers, so the
 * risk profile here is different — but errors are still swallowed and
 * treated as "found nothing" rather than failing the whole check.
 *
 * @param {string} url
 * @param {() => Promise<import('puppeteer-core').Browser>} launchBrowser
 * @returns {Promise<{github: string|null, discord: string|null, telegram: string|null, x: string|null}>}
 */
export async function scrapeRenderedLinks(url, launchBrowser) {
  const links = { github: null, discord: null, telegram: null, x: null }
  if (!url || !launchBrowser) return links

  let browser
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.setUserAgent(UA)
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 })
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map((a) => a.href)
    )
    for (const href of hrefs) {
      const kind = classifyLink(href)
      if (kind && !links[kind]) links[kind] = href
    }
  } catch (err) {
    console.error('[domScrape] rendered-page scan failed:', err.message)
  } finally {
    await browser?.close().catch(() => {})
  }
  return links
}
