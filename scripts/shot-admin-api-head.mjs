// 后台「页头大标题去掉 + API配置页补新建按钮」验收截图（只读，不保存任何配置）
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const OUT_DIR = path.join(process.cwd(), '.admin-head')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, detail) {
  results.push({ name, pass: Boolean(ok), detail })
  console.error(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  :: ${JSON.stringify(detail).slice(0, 300)}`}`)
}

await mkdir(OUT_DIR, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
  })
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.admin-nav', { timeout: 30000 })
  await delay(1200)

  // ① 页头大标题整体消失
  check('① 页头大标题区已移除', (await page.locator('.admin-topbar').count()) === 0, '仍有 .admin-topbar')
  const strayH1 = await page.$$eval('.admin-main h1', (els) => els.map((e) => e.textContent.trim()))
  check('① 主区域没有残留整页大标题 h1', strayH1.length === 0, strayH1)

  // ② 数据大盘自身内容还在（别把页面主体删空）
  const summaryCards = await page.locator('.admin-summary article').count()
  check('② 数据大盘卡片仍在', summaryCards >= 4, `卡片数=${summaryCards}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-01-dashboard.png') })

  // ③ 进入 API 配置
  await page.locator('.admin-nav .nav-group-toggle', { hasText: '功能管理' }).click()
  await delay(400)
  await page.locator('.admin-nav .nav-child', { hasText: 'API 配置' }).click()
  await delay(1200)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-02-api-list.png') })

  const createBtn = page.locator('.provider-list-actions button', { hasText: '新建' })
  const createCount = await createBtn.count()
  check('③ API 列表工具栏有「新建 API 配置」按钮', createCount >= 1, `按钮数=${createCount}`)
  if (createCount) {
    const box = await createBtn.first().boundingBox()
    check('③ 按钮尺寸正常（不是被拉成满宽/压扁）', Boolean(box) && box.height >= 28 && box.height <= 56 && box.width < 260, box)
  }

  // ④ 点一下能进入新建表单（不保存）
  if (createCount) {
    await createBtn.first().click()
    await delay(900)
    const formVisible = await page.locator('input[placeholder*="名称"], .api-form input, .provider-form input').count()
    check('④ 点「新建」能进入填写表单', formVisible >= 1, `输入框数=${formVisible}`)
    await page.screenshot({ path: path.join(OUT_DIR, 'admin-03-api-create.png') })
  }

  // ⑤ 其它页面也正常（抽两个不应报错的页）
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
  await delay(800)
  await page.locator('.admin-nav > button', { hasText: '账号权限' }).click()
  await delay(1000)
  const accountRows = await page.locator('.account-table-surface .permission-row').count()
  check('⑤ 账号权限页账号行仍在', accountRows >= 2, `行数=${accountRows}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-04-accounts.png') })

  // 401 是首屏未登录态的正常探测（登录前 /api 会拒绝一次），不算缺陷
  const realErrors = errors.filter((t) => !/401|Unauthorized/i.test(t))
  check('页面无 JS 报错（忽略首屏 401 探测）', realErrors.length === 0, realErrors.slice(0, 3))

  const pass = results.filter((r) => r.pass).length
  console.error(`\n==== ${pass}/${results.length} PASS ====`)
  process.exitCode = pass === results.length ? 0 : 1
} finally {
  await browser.close()
}
