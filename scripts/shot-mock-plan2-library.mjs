// 截图静态样张 docs/h5-mockups/plan2-workflow-library.html，作为视觉基准。
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
await mkdir(OUT_DIR, { recursive: true })
const target = pathToFileURL(path.join(process.cwd(), 'docs', 'h5-mockups', 'plan2-workflow-library.html')).href

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(target, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT_DIR, 'mock-plan2-library.png') })
  const info = await page.evaluate(() => {
    const row = document.querySelector('.row:not(.add)')
    const cs = row ? getComputedStyle(row) : null
    return {
      rowColumns: cs?.gridTemplateColumns || '',
      bodyWidth: document.body.getBoundingClientRect().width,
      rows: document.querySelectorAll('.row').length,
    }
  })
  console.log(JSON.stringify(info, null, 2))
} finally {
  await browser.close()
}
