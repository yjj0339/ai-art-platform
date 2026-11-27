// AI 创作台（/student/board）横屏闸门回归
// 用法：node scripts/verify-paint-landscape.mjs
// 可选环境变量：WEB（默认 http://127.0.0.1:5173）、API（默认 http://127.0.0.1:3000）
//
// 背景：右栏 AI 出图区在 1020px 以下会被整块隐藏，平板竖屏正好落在这个盲区，
// 老师看到的就是「没有 AI 区」的残缺界面。与其做三档降级排版，不如直接请他横过来，
// 这些断言就是守住这个闸门（顺带守住「转回横屏后画纸内容还在」）。
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const WEB = process.env.WEB || 'http://127.0.0.1:5173'
const API = process.env.API || 'http://127.0.0.1:3000'
const ACCOUNT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }
const OUT_DIR = '.paint-board-verify'

const results = []
function check(name, pass, detail) {
  results.push({ name, pass: Boolean(pass) })
  console.error(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `  ::  ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(label, fn, timeout = 12000, step = 150) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last } catch (e) { last = String(e?.message || e) }
    await delay(step)
  }
  throw new Error(`超时：${label}（${JSON.stringify(last)}）`)
}

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ACCOUNT),
})
const session = (login.headers.getSetCookie?.() || []).map((v) => v.split(';')[0]).find((v) => v.startsWith('ai_art_session='))
if (!session) throw new Error('没拿到会话 Cookie（后端是否已启动？）')

await mkdir(OUT_DIR, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 })
  await context.addCookies([{ name: 'ai_art_session', value: session.split('=')[1], url: WEB }])
  const page = await context.newPage()
  await page.goto(`${WEB}/student/board`, { waitUntil: 'domcontentloaded' })
  await waitFor('画板就绪', () => page.$('.paint-gen-btn'))

  const probe = () => page.evaluate(() => {
    const mask = document.querySelector('.paint-rotate-mask')
    const ai = document.querySelector('.paint-ai')
    return {
      mask: Boolean(mask) && getComputedStyle(mask).display !== 'none',
      maskText: mask ? mask.innerText.replace(/\s+/g, ' ').trim() : '',
      aiVisible: Boolean(ai) && getComputedStyle(ai).display !== 'none' && ai.getBoundingClientRect().width > 100,
      aiWidth: ai ? Math.round(ai.getBoundingClientRect().width) : 0,
      vw: window.innerWidth,
      vh: window.innerHeight,
    }
  })

  // ① 平板竖屏
  await page.setViewportSize({ width: 768, height: 1024 })
  await waitFor('竖屏遮罩出现', async () => (await probe()).mask)
  let s = await probe()
  check('768×1024 竖屏 → 出现遮罩', s.mask, s)
  check('竖屏文案含「请横屏使用」', s.maskText.includes('请横屏使用'), s.maskText)
  check('竖屏文案提到 AI 出图区', s.maskText.includes('AI 出图区'), s.maskText)
  await page.screenshot({ path: `${OUT_DIR}/landscape-portrait.png` })

  // ② 平板横屏：右栏必须回来
  await page.setViewportSize({ width: 1024, height: 768 })
  await waitFor('遮罩消失', async () => !(await probe()).mask)
  s = await probe()
  check('1024×768 横屏 → 无遮罩', !s.mask, s)
  check('1024×768 横屏 → 右栏 AI 区可见（宽>300）', s.aiVisible && s.aiWidth > 300, s)

  // ③ 常见笔记本
  await page.setViewportSize({ width: 1366, height: 768 })
  await delay(200)
  s = await probe()
  check('1366×768 → 无遮罩，右栏可见', !s.mask && s.aiVisible, s)

  // ④ 安卓平板竖屏
  await page.setViewportSize({ width: 800, height: 1280 })
  await waitFor('窄竖屏遮罩', async () => (await probe()).mask)
  check('800×1280 → 遮罩', (await probe()).mask, await probe())

  // ⑤ 手机横屏：宽高都不够，应提示换设备
  await page.setViewportSize({ width: 844, height: 390 })
  await waitFor('矮屏遮罩', async () => (await probe()).mask)
  s = await probe()
  check('844×390 横屏太矮 → 遮罩', s.mask, s)
  check('手机横屏文案提示换设备', s.maskText.includes('屏幕太小'), s.maskText)

  // ⑥ 遮罩只是盖住，不销毁画布
  await page.setViewportSize({ width: 1366, height: 768 })
  await waitFor('遮罩消失', async () => !(await probe()).mask)
  const inkReadable = await page.evaluate(() => {
    const c = document.querySelector('.paint-board canvas')
    if (!c) return false
    try { c.getContext('2d').getImageData(0, 0, 1, 1); return true } catch { return false }
  })
  check('横竖切换后画布仍在 DOM 且可读像素', inkReadable, { inkReadable })

  // ⑦ 遮罩里的出口
  await page.setViewportSize({ width: 768, height: 1024 })
  await waitFor('遮罩出现', async () => (await probe()).mask)
  await page.click('.paint-rotate-mask button')
  await waitFor('跳回工作台', async () => page.url().includes('/student/workbench'))
  check('遮罩按钮 → 返回工作台', page.url().includes('/student/workbench'), page.url())

  const failed = results.filter((r) => !r.pass)
  console.error(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`)
  process.exitCode = failed.length ? 1 : 0
} finally {
  await browser.close()
}
