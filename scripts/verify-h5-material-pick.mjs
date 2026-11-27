// 验收：H5 报告页「素材确认」交互（勾选 / 全选 / 已选计数），不发起任何付费出图调用。
// 用法：node scripts/verify-h5-material-pick.mjs
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3000'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// 每张图必须是完全不同的地址：页面会按地址去重，重复地址只会显示一张
const img = (tag) => {
  const hue = [...tag].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="hsl(${hue},70%,55%)"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
const projectId = `verify-pick-${Date.now().toString(36)}`

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
if (!login.ok) throw new Error(`登录失败 ${login.status}`)
const cookieHeader = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
const cookies = cookieHeader.split('; ').map((pair) => {
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1), domain: '127.0.0.1', path: '/' }
})

const projectData = {
  id: projectId,
  title: '素材勾选验收项目',
  difficulty: 'pro',
  prompt: '水彩风格的下雨城市',
  sketchOriginal: img('sketch-1'),
  sketchOptimized: img('sketch-2'),
  referenceImages: [{ id: 'ref1', preview: img('ref-1') }, { id: 'ref2', preview: img('ref-2') }],
  versions: [{ id: 'v1', imageUrl: img('v-1') }, { id: 'v2', imageUrl: img('v-2') }, { id: 'v3', imageUrl: img('v-3') }],
  videos: [],
  models3d: [],
  finalVersionId: 'v3',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies(cookies)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()) })

  // 素材来自本地草稿/项目缓存，验收时直接种一份带 7 张图的草稿
  await page.addInitScript((seed) => {
    localStorage.setItem('art-studio-difficulty', 'pro')
    localStorage.setItem('art-studio-current-draft', JSON.stringify(seed))
    localStorage.setItem('art-studio-projects', JSON.stringify([seed]))
  }, projectData)
  await page.goto(`${BASE}/student/h5-report`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  let thumbs = 0
  for (let i = 0; i < 100; i += 1) {
    thumbs = await page.locator('.ar-th').count()
    if (thumbs > 0) break
    await delay(250)
  }
  check('左栏渲染出素材缩略图', thumbs > 0, `${thumbs} 张`)

  const onCount = await page.locator('.ar-th-check.is-on').count()
  check('默认全部勾选', onCount === thumbs, `勾选 ${onCount} / 共 ${thumbs}`)

  const headerText = await page.locator('.ar-left .ar-panel-h em').innerText().catch(() => '')
  check('头部显示已选/总数', /已选\s*\d+\s*\/\s*共\s*\d+/.test(headerText), headerText)

  const before = headerText
  await page.locator('.ar-th').first().click()
  await delay(250)
  const after = await page.locator('.ar-left .ar-panel-h em').innerText().catch(() => '')
  check('点缩略图可取消勾选', before !== after, `${before} -> ${after}`)
  check('取消后出现淡化态', (await page.locator('.ar-th.is-off').count()) === 1)

  await page.locator('.ar-pick-all').first().click()
  await delay(250)
  check('按钮可一键恢复全选', (await page.locator('.ar-th-check.is-on').count()) === thumbs)

  await page.locator('.ar-pick-all').first().click()
  await delay(250)
  const allOff = await page.locator('.ar-th-check.is-on').count()
  check('全不选可清空勾选', allOff === 0, `剩余勾选 ${allOff}`)
  const emptyPickWarn = await page.locator('.ar-pick-all').first().innerText()
  check('按钮文案切换为全选', /全选/.test(emptyPickWarn), emptyPickWarn)

  await page.locator('.ar-pick-all').first().click()
  await delay(250)
  const restored = await page.locator('.ar-th-check.is-on').count()
  check('全选可恢复全部', restored === thumbs, `勾选 ${restored}`)

  await page.screenshot({ path: 'logs/verify-h5-material-pick.png', fullPage: false })
  check('页面无脚本报错', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.pass)
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
process.exit(failed.length ? 1 : 0)
