import puppeteer from 'puppeteer-core'

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.setViewport({ width: 1200, height: 800 })
  await page.goto('http://localhost:5192', { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 800))

  const buttons = await page.$$('button')
  let reuseBtn = null
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b)
    if (/use last project list/i.test(text)) { reuseBtn = b; break }
  }
  console.log('button found:', Boolean(reuseBtn))
  await reuseBtn.click()
  await new Promise((r) => setTimeout(r, 1000))

  console.log('page errors:', errors.length, errors)

  const projectCount = await page.evaluate(() => document.querySelectorAll('.col-name').length)
  console.log('projects loaded:', projectCount)

  const showsCheckPrompt = await page.evaluate(() => Boolean(document.querySelector('.check-mode-prompt')))
  console.log('shows fresh check-mode prompt (not stale results):', showsCheckPrompt)

  const subtitle = await page.evaluate(() => document.querySelector('.subtitle')?.textContent)
  console.log('header subtitle:', subtitle)

  const anyScoreCells = await page.evaluate(() =>
    [...document.querySelectorAll('.col-score')].some((el) => /\d/.test(el.textContent))
  )
  console.log('any score data present (should be false — fresh list, not restored results):', anyScoreCells)

  await page.screenshot({ path: '/private/tmp/claude-501/-Users-prodigyx-Documents-CODES-ecosystem-extractor/05ed0809-0ea3-4cdd-ac30-2206533cf80e/scratchpad/ui-11-reuse-list.png' })

  await browser.close()
}

main().catch((err) => { console.error('ERROR', err); process.exit(1) })
