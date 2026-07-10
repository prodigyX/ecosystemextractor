import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

chromium.setGraphicsMode = false

export async function launchServerlessBrowser() {
  const headless = 'shell'
  return puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless }),
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless,
  })
}
