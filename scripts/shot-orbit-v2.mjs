// 学生工作台 CREATIVE ORBIT 精修效果图截图
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/shot-orbit-v2.mjs
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const target = path.join(process.cwd(), 'docs', 'mockups', 'student-orbit-workbench-v2.html')
const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const issues = []
page.on('console', (m) => { if (m.type() === 'error') issues.push(m.text()) })
page.on('requestfailed', (r) => issues.push(`FAIL ${r.url()}`))
await page.goto(`file:///${target.replace(/\\/g, '/')}`)
await page.waitForTimeout(2200)
await page.screenshot({ path: 'logs-orbit-v2-1440.png' })
await page.setViewportSize({ width: 1280, height: 800 })
await page.waitForTimeout(500)
await page.screenshot({ path: 'logs-orbit-v2-1280.png' })
console.log('issues:', JSON.stringify(issues))
await browser.close()
