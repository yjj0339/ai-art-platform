// 生成素材库「批量操作」下拉菜单的静态效果图（PNG）。
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/shot-portfolio-batch.mjs
// 输出：.batch-menu-layer/static-full.png（整页）、static-menu.png（菜单聚焦）

import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const OUT_DIR = path.join(projectDir, '.batch-menu-layer')
const TARGET = path.join(projectDir, '.workbuddy', 'preview', 'portfolio-batch-ops.html')

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1180 }, deviceScaleFactor: 2 })
  await page.goto(pathToFileUrl(TARGET))
  await page.waitForTimeout(400)
  await page.click('#batchBtn')
  await page.waitForTimeout(600) // 等过渡动画结束

  await page.screenshot({ path: path.join(OUT_DIR, 'static-full.png'), fullPage: true })

  const box = await page.locator('.portfolio-toolbar').boundingBox()
  if (box) {
    await page.screenshot({
      path: path.join(OUT_DIR, 'static-menu.png'),
      clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: box.width + 48, height: 560 },
    })
  }
  console.log('OK ->', OUT_DIR)
} finally {
  await browser.close()
}

function pathToFileUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/')
}
