/**
 * 验证：学生端 AI 绘画页「真的点一次生成」能出图（针对 doubao-seedream-5-0-flash-260915）。
 *
 * 为什么需要这个：seedream 5.0-flash 曾因后端无条件带 sequential_image_generation 而整单 400，
 * 页面能选中模型 ≠ 能出图。这个脚本走完整链路：登录 → 绘画页 → 选中 5.0 → 填提示词 → 点「发送生成」→ 等结果图。
 *
 * ⚠️ 会真实消耗 1 张出图额度，仅在需要验收时手动运行。
 * 用法：node scripts/verify-seedream5-generate.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const TARGET_MODEL = 'doubao-seedream-5-0-flash-260915'
const base = process.env.PAINT_BASE || 'http://127.0.0.1:5173'
const route = '/student/paint'
const shotDir = 'docs/mockups/shots'
const PROMPT = '一只戴着草帽的橘猫坐在窗台上，水彩风格，背景是夏日海面'
const WAIT_MS = 120000

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// 收集页面上的失败提示，便于把「为什么没出图」说清楚
const errorTexts = new Set()
page.on('response', async (res) => {
  if (!res.url().includes('/api/ai/image/generate')) return
  try {
    const body = await res.json()
    if (body && (body.error || body.message)) errorTexts.add(String(body.error || body.message))
  } catch { /* 非 JSON 忽略 */ }
})

await page.goto(`${base}/login?redirect=${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
const inputs = page.locator('.el-input__inner')
await inputs.nth(0).fill('ceshi2')
await inputs.nth(1).fill('demo-school')
await inputs.nth(2).fill('123456789')
await page.getByRole('button', { name: /进入学生工作台/ }).click()
await page.waitForTimeout(3000)

await page.evaluate(() => localStorage.setItem('art-studio-difficulty', 'pro'))
await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await page.evaluate(() => document.querySelectorAll('.el-message, .el-notification').forEach((n) => n.remove()))
for (let i = 0; i < 3; i += 1) {
  if (!(await page.locator('.el-overlay').count())) break
  const closer = page.locator('.el-dialog__headerbtn, .el-overlay-dialog button:has-text("取消"), .el-overlay-dialog button:has-text("不要了")').first()
  if (await closer.count()) await closer.click({ force: true }).catch(() => {})
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

// 1) 选中 seedream 5.0
const chip = page.locator('.model-chip').first()
check((await chip.count()) > 0, '绘画页有模型选择按钮')
if (!(await chip.count())) {
  await browser.close()
  process.exit(1)
}
await chip.click()
await page.waitForTimeout(600)
const labels = (await page.locator('.model-panel button strong').allTextContents()).map((s) => s.trim())
const targetLabel = labels.find((item) => item.includes(TARGET_MODEL))
check(Boolean(targetLabel), '下拉里能找到 seedream 5.0', targetLabel || labels.join(' / '))
if (targetLabel) {
  await page.locator('.model-panel button').filter({ hasText: targetLabel }).first().click()
  await page.waitForTimeout(500)
  check((await chip.innerText()).includes(TARGET_MODEL), '已选中 5.0')
}

// 2) 填提示词
const promptBox = page.locator('.pro-prompt-textarea').first()
check((await promptBox.count()) > 0, '找到提示词输入框')
if (await promptBox.count()) {
  await promptBox.fill(PROMPT)
  await page.waitForTimeout(200)
}

// 3) 点「发送生成」
const sendBtn = page.locator('button[title="发送生成"]').first()
check((await sendBtn.count()) > 0, '找到「发送生成」按钮')
await page.screenshot({ path: `${shotDir}/seedream5-before-generate.png`, fullPage: false })
await sendBtn.click()

// 4) 等结果图（或明确的失败提示）
let resultCount = 0
let failed = false
const started = Date.now()
while (Date.now() - started < WAIT_MS) {
  await page.waitForTimeout(2000)
  resultCount = await page.locator('.result-index').count()
  if (resultCount > 0) break
  failed = await page.getByText(/这一批作品生成失败|^生成失败$/).first().isVisible().catch(() => false)
  if (failed) break
}

const elapsed = Math.round((Date.now() - started) / 1000)
check(resultCount > 0, '页面真的出图了（出现结果卡片）', resultCount > 0 ? `${resultCount} 张 / 用时 ${elapsed}s` : `等待 ${elapsed}s 仍无结果`)
if (!resultCount && errorTexts.size) {
  console.log('[接口报错内容] ' + [...errorTexts].join(' | '))
}
await page.screenshot({ path: `${shotDir}/seedream5-generate-result.png`, fullPage: false })

// 5) 结果图确实是上游返回的图（不是占位/渐变封面）
if (resultCount > 0) {
  const srcs = await page.locator('.result-index').first().evaluate((el) => {
    const card = el.closest('article, li, div')
    const img = (card || el.parentElement)?.querySelector('img')
    return img ? img.getAttribute('src') || '' : ''
  })
  console.log(`[结果图地址] ${srcs.slice(0, 100)}`)
}

await browser.close()
console.log(fails.length ? `\n结果：${fails.length} 项未通过 → ${fails.join('；')}` : '\n结果：全部通过')
process.exit(fails.length ? 1 : 0)
