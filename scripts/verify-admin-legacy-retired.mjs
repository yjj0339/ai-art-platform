// 后台旧方案下线验收：
//   ① 左侧菜单不再有「报告模板风格库」，但「报告工作流库」必须还在（别删错）
//   ② H5 报告中心里「生成方案 / 版本与模板 / 视觉风格」变成不可点的「已停用」
//   ③ 进 H5 报告中心默认落在「文案与智能体」
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/verify-admin-legacy-retired.mjs
// 输出：.workbuddy/evidence/admin-legacy-retired-*.png

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
let pass = 0
const fails = []
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fails.push(name)
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const consoleErrors = []
  // 登录前首页会先用匿名身份打接口，401 是正常现象（还没登录），不该算前端异常。
  const isNoise = (text) => /Failed to load resource|401 \(Unauthorized\)/i.test(text)
  page.on('console', (msg) => { if (msg.type() === 'error' && !isNoise(msg.text())) consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const login = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
    return res.status
  })
  check('管理员登录成功', login === 200, `HTTP ${login}`)

  // ① 左侧菜单
  // 注意：「报告工作流库」现在收在「功能管理」折叠组里，收起时 innerText 读不到，
  // 这里用 textContent（含隐藏节点）判断菜单项是否还存在。
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  let navText = ''
  for (let i = 0; i < 40; i += 1) {
    navText = await page.locator('.admin-nav').evaluate((el) => el.textContent || '').catch(() => '')
    if (navText.includes('H5')) break
    await delay(250)
  }
  const navLabels = navText.split('\n').map((s) => s.trim()).filter(Boolean)
  check('菜单里没有「报告模板风格库」', !navText.includes('报告模板风格库'), navLabels.join(' / '))
  check('「报告工作流库」还在（没删错）', navText.includes('报告工作流库'))
  check('「H5报告中心」还在', navText.includes('H5报告中心'))
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-legacy-retired-nav.png') })

  // ② 直接开 H5 报告中心网址
  await page.goto(`${BASE}/admin/h5-reports`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  let tabs = []
  for (let i = 0; i < 60; i += 1) {
    tabs = await page.locator('.h5-center-tabs button').allTextContents().catch(() => [])
    if (tabs.length >= 5) break
    await delay(250)
  }
  const tabInfo = await page.evaluate(() => [...document.querySelectorAll('.h5-center-tabs button')].map((b) => ({
    label: b.innerText.replace(/\s+/g, ' ').trim(),
    disabled: b.disabled,
    active: b.classList.contains('active'),
    cursor: getComputedStyle(b).cursor,
    color: getComputedStyle(b).color,
  })))
  console.log('TABS', JSON.stringify(tabInfo, null, 2))
  const byLabel = (key) => tabInfo.find((t) => t.label.includes(key))
  const retiredKeys = ['生成方案', '版本与模板', '视觉风格']
  check('三个旧页签都在（只是禁用，没有删）', retiredKeys.every((k) => Boolean(byLabel(k))), tabInfo.map((t) => t.label).join(' | '))
  check('「生成方案」不可点', Boolean(byLabel('生成方案')?.disabled))
  check('「版本与模板」不可点', Boolean(byLabel('版本与模板')?.disabled))
  check('「视觉风格」不可点', Boolean(byLabel('视觉风格')?.disabled))
  check('旧页签带「已停用」角标', retiredKeys.every((k) => byLabel(k)?.label.includes('已停用')))
  check('旧页签鼠标是禁止符号', retiredKeys.every((k) => byLabel(k)?.cursor === 'not-allowed'))
  check('「文案与智能体」仍可点', byLabel('文案与智能体')?.disabled === false)
  check('「审核与发布」仍可点', byLabel('审核与发布')?.disabled === false)
  check('默认落在「文案与智能体」', Boolean(byLabel('文案与智能体')?.active), tabInfo.find((t) => t.active)?.label || '(无)')

  const notice = await page.locator('.h5-retired-notice').innerText().catch(() => '')
  check('页面上有「旧方案已停用」说明', notice.includes('旧方案已停用'), notice.replace(/\s+/g, ' ').slice(0, 60))
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-legacy-retired-h5-tabs.png') })

  // ③ 强行点旧页签不能切走
  const strategiesBtn = page.locator('.h5-center-tabs button', { hasText: '生成方案' }).first()
  await strategiesBtn.click({ force: true }).catch(() => {})
  await delay(300)
  const stillAgent = await page.locator('.h5-center-tabs button.active').innerText().catch(() => '')
  check('硬点「生成方案」也切不过去', stillAgent.includes('文案与智能体'), stillAgent.replace(/\s+/g, ' '))
  const agentCard = await page.locator('.h5-agent-status-card').isVisible().catch(() => false)
  check('页面主体还是「文案与智能体」内容', agentCard)

  check('前端无 JS 异常', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' ; '))
} finally {
  await browser.close()
}

console.log(`\n${pass} PASS / ${fails.length} FAIL`)
if (fails.length) {
  console.log('FAILED:', fails.join(' | '))
  process.exit(1)
}
