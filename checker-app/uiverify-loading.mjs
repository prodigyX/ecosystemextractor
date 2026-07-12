import puppeteer from 'puppeteer-core'

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 800 })
  await page.goto('http://localhost:5201', { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 1200))

  // Dropzone should show "Load historical data" now
  const buttons = await page.$$('button')
  let historyBtn = null
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b)
    if (/load historical data/i.test(text)) { historyBtn = b; break }
  }
  console.log('Load historical data button found:', Boolean(historyBtn))
  await historyBtn.click()
  await new Promise((r) => setTimeout(r, 300))

  // Click the one saved run row and immediately check for the spinner
  const runRow = await page.$('.history-run-list button');
  await runRow.click()
  await new Promise((r) => setTimeout(r, 50)) // catch it mid-flight
  const spinnerVisible = await page.evaluate(() => Boolean(document.querySelector('.history-run-list .spinner-ring')))
  const loadingText = await page.evaluate(() => document.querySelector('.history-run-list small')?.textContent)
  console.log('spinner visible mid-load:', spinnerVisible)
  console.log('row text mid-load:', loadingText)

  await browser.close()
}

main().catch((err) => { console.error('ERROR', err); process.exit(1) })
