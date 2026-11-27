// 只读探针：学生端实际能看到哪些玩法卡片，以及卡片点进去落到哪个页面。
import { createRequire } from 'node:module'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
function loadPlaywright() {
  const candidates = [
    'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core',
    'playwright-core', 'playwright',
  ]
  for (const name of candidates) { try { return require(name) } catch {} }
  throw new Error('找不到 playwright-core')
}
const { chromium } = loadPlaywright()

const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3000'
const SHOT_DIR = path.resolve(process.cwd(), 'scripts/tmp-shots')
mkdirSync(SHOT_DIR, { recursive: true })
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
const cookieHeader = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')

// 1. 学生端接口到底返回几条玩法
const listRes = await fetch(`${API}/api/ai-skills`, { headers: { Cookie: cookieHeader } })
const listJson = await listRes.json().catch(() => ({}))
const skills = listJson.skills || []
console.log(`学生端接口返回玩法 ${skills.length} 条`)
for (const s of skills) {
  const blocks = s.configuration?.studentPage?.blocks || []
  console.log(`  - ${s.id} | ${s.title} | ${s.status} | 组件 ${blocks.length} 个 | 封面 ${s.configuration?.presentation?.coverUrl ? '有' : '无'}`)
}

const browser = await chromium.launch({ executablePath: EXE, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addCookies(cookieHeader.split('; ').map((pair) => {
  const idx = pair.indexOf('=')
  return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: '127.0.0.1', path: '/' }
}))
await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
const page = await context.newPage()

await page.goto(`${BASE}/student/paint`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: path.join(SHOT_DIR, 'student-paint.png'), fullPage: false })

const cards = await page.locator('.paint-skill-card').all()
console.log(`\n前台 AI 绘画页卡片数量: ${cards.length}`)
for (let i = 0; i < cards.length; i += 1) {
  const title = (await cards[i].innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 40)
  console.log(`  [${i}] ${title}`)
}

// 先关掉「发现上次没做完的作品」浮层，否则卡片点不动
for (const label of ['新建', '新建作品', '新建空白作品']) {
  const btn = page.locator(`button:has-text("${label}")`).first()
  if (await btn.count()) { await btn.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1200); break }
}

// 找「童话绘本封面」那张卡，看点击去哪
const target = page.locator('.paint-skill-card', { hasText: '绘本' }).first()
if (await target.count()) {
  console.log('\n找到含「绘本」的卡片，尝试点击…')
  await target.click({ timeout: 5000 }).catch((e) => console.log('  点击异常:', e.message.split('\n')[0]))
  await page.waitForTimeout(2500)
  console.log('  当前 URL:', page.url())
  const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
  console.log('  页面文字片段:', bodyText.slice(0, 300))
  await page.screenshot({ path: path.join(SHOT_DIR, 'student-paint-clicked.png'), fullPage: false })
} else {
  console.log('\n前台没有找到含「绘本」的卡片，改为点第一张卡验证已发布玩法')
  const fallback = cards[0]
  if (fallback) {
    await fallback.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(2500)
    console.log('  点了第一张卡后 URL:', page.url())
    const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
    console.log('  页面文字片段:', bodyText.slice(0, 400))
    await page.screenshot({ path: path.join(SHOT_DIR, 'student-paint-clicked.png'), fullPage: false })
  }
}

await browser.close()
