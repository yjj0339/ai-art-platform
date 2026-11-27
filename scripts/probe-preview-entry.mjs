// 临时排查：高级版学生点各个「预览」，实际落到哪个界面、有没有手机框。
// 用法：node scripts/probe-preview-entry.mjs
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3000'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
const cookies = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).map((pair) => {
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1), domain: '127.0.0.1', path: '/' }
})

const img = (tag, w = 864, h = 1536) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#4a9"/><text x="${w / 2}" y="${h / 2}" font-size="90" text-anchor="middle" fill="#fff">${tag}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// 高级版 + 已经出过结果图的项目
const project = {
  id: 'probe-pro-project',
  title: '高级版预览排查',
  difficulty: 'pro',
  prompt: '水彩城市',
  sketchOriginal: img('sketch', 600, 800),
  versions: [{ id: 'v1', imageUrl: img('v1', 864, 1536) }],
  finalVersionId: 'v1',
  videos: [],
  models3d: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addCookies(cookies)
await context.addInitScript((seed) => {
  localStorage.setItem('art-studio-difficulty', 'pro')
  localStorage.setItem('art-studio-current-draft', JSON.stringify(seed))
  localStorage.setItem('art-studio-projects', JSON.stringify([seed]))
}, project)

const page = await context.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto(`${BASE}/student/h5-report`, { waitUntil: 'domcontentloaded' })
await delay(4000)
console.log('生成页 URL：', page.url())
const probes = {
  '高级版工作台 .advanced-report-workbench': '.advanced-report-workbench',
  '右下 .ar-prev 预览按钮': '.ar-prev',
  '入门版工作台 .junior-report-workbench': '.junior-report-workbench',
  '顶部/工具条 预览按钮 .h5-preview-stage': '.h5-preview-stage',
}
for (const [name, sel] of Object.entries(probes)) console.log(`  ${name}: ${await page.locator(sel).count()}`)
await page.screenshot({ path: 'logs/probe-pro-generate.png' })

if (await page.locator('.ar-prev').count()) {
  await page.locator('.ar-prev').first().click()
  await delay(3000)
  console.log('点右下「预览」后 URL：', page.url())
  console.log('  手机外壳：', await page.locator('.phone-shell').count(), '| 空状态：', await page.locator('.phone-empty').count(), '| 旧弹窗：', await page.locator('.h5-designed-preview').count())
  await page.screenshot({ path: 'logs/probe-pro-after-preview.png' })
}

// 再试：点「生成 H5 报告」后再看
await page.goto(`${BASE}/student/h5-report`, { waitUntil: 'domcontentloaded' })
await delay(3500)
if (await page.locator('.ar-go').count()) {
  console.log('找到 .ar-go 生成按钮，点了会真调模型，本次不点。')
} else {
  console.log('没找到 .ar-go 生成按钮')
}

await browser.close()
