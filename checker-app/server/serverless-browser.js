import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

chromium.setGraphicsMode = false

export async function launchServerlessBrowser() {
  const headless = 'shell'
  const args = await puppeteer.defaultArgs({ args: chromium.args, headless })
  return puppeteer.launch({
    args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless,
  })
}
