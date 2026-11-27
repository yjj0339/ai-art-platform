// 截图 docs/mockups/slot-on-node-v1.html，作为「节点卡槽绑定」效果图基准。
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const OUT_DIR = path.join(process.cwd(), 'docs', 'mockups', 'shots')
await mkdir(OUT_DIR, { recursive: true })
const target = pathToFileURL(path.join(process.cwd(), 'docs', 'mockups', 'slot-on-node-v1.html')).href

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
  await page.goto(target, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT_DIR, 'slot-on-node-v1.png') })
  const info = await page.evaluate(() => {
    const pill = document.querySelector('.slot-pill.is-image')
    const menu = document.querySelector('.slot-menu')
    const r = pill?.getBoundingClientRect()
    const m = menu?.getBoundingClientRect()
    return {
      pillRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
      menuRect: m ? { x: Math.round(m.x), y: Math.round(m.y), w: Math.round(m.width), h: Math.round(m.height) } : null,
      overlap: r && m ? !(r.right < m.left || r.left > m.right || r.bottom < m.top || r.top > m.bottom) : null,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      opts: document.querySelectorAll('.slot-menu .opt').length,
    }
  })
  console.log(JSON.stringify(info, null, 2))
} finally {
  await browser.close()
}
