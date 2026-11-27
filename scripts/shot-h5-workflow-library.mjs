// 后台「报告工作流库」页面截图，用于和 docs/h5-mockups/plan2-workflow-library.html 做视觉比对。
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/shot-h5-workflow-library.mjs
// 输出：.workbuddy/evidence/h5-workflow-library-*.png

import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
await mkdir(OUT_DIR, { recursive: true })

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const consoleErrors = []
  const badResponses = []
  page.on('response', (res) => {
    if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const login = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  })
  console.log('LOGIN', JSON.stringify(login).slice(0, 200))

  await page.goto(`${BASE}/admin/h5-report-workflows`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // 等列表渲染完成：轮询，不用固定 sleep（vite 首次按需编译会拖慢首帧）。
  let rowCount = 0
  for (let i = 0; i < 60; i += 1) {
    rowCount = await page.locator('.row:not(.add):not(.empty-row)').count()
    if (rowCount > 0) break
    await delay(300)
  }
  await delay(600)

  const info = await page.evaluate(() => {
    const toolbar = document.querySelector('.toolbar')
    const list = document.querySelector('.list')
    const firstRow = document.querySelector('.row:not(.add):not(.empty-row)')
    const rect = (el) => (el ? el.getBoundingClientRect().toJSON() : null)
    return {
      hasPanel: Boolean(document.querySelector('.h5-workflow-library')),
      toolbar: rect(toolbar),
      list: rect(list),
      firstRow: rect(firstRow),
      rowColumns: firstRow ? getComputedStyle(firstRow).gridTemplateColumns : '',
      toolbarText: toolbar ? toolbar.innerText.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
      rows: document.querySelectorAll('.row:not(.add):not(.empty-row)').length,
      title: document.querySelector('h1')?.innerText || '',
    }
  })
  console.log('PANEL', JSON.stringify(info, null, 2))

  await page.screenshot({ path: path.join(OUT_DIR, 'h5-workflow-library-full.png'), fullPage: false })

  // 多选态
  const multiBtn = page.locator('.toolbar button', { hasText: '多选' }).first()
  if (await multiBtn.count()) {
    await multiBtn.click()
    await delay(400)
    await page.screenshot({ path: path.join(OUT_DIR, 'h5-workflow-library-selecting.png') })
  }

  // 抽屉：点行即可打开（工具条上的「设置」需要先选中一行，非多选态是禁用的）
  if (await multiBtn.count()) {
    const cancel = page.locator('.toolbar button', { hasText: '取消多选' }).first()
    if (await cancel.count()) await cancel.click()
    await delay(300)
  }
  const firstRow = page.locator('.row:not(.add):not(.empty-row)').first()
  if (await firstRow.count()) {
    await firstRow.locator('.info .nm span').first().click()
    let drawerOpen = false
    for (let i = 0; i < 30; i += 1) {
      drawerOpen = await page.locator('.drawer').isVisible().catch(() => false)
      if (drawerOpen) break
      await delay(100)
    }
    await delay(500)
    const drawerInfo = await page.evaluate(() => {
      const drawer = document.querySelector('.drawer')
      if (!drawer) return null
      return {
        width: drawer.getBoundingClientRect().width,
        coverOps: [...drawer.querySelectorAll('.cover-ops button')].map((b) => b.innerText.trim()),
        fields: [...drawer.querySelectorAll('label, .field')].map((n) => n.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)),
        text: drawer.innerText.replace(/\s+/g, ' ').slice(0, 400),
      }
    })
    console.log('DRAWER', JSON.stringify(drawerInfo, null, 2))
    await page.screenshot({ path: path.join(OUT_DIR, 'h5-workflow-library-drawer.png') })
  }

  console.log('ROWS', rowCount)
  console.log('BAD_RESPONSES', JSON.stringify([...new Set(badResponses)], null, 2))
  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors.slice(0, 10), null, 2))
} finally {
  await browser.close()
}
