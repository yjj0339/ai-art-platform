/**
 * 验证：后台把 doubao-seedream-5-0-flash-260915 加进「火山方舟 · 支持出图的模型」后，
 * 学生端 AI 绘画页的模型下拉里能真正看到并选中它。
 *
 * 只读验证：不发起付费出图，只打开下拉读选项 + 选中后核对按钮文案。
 * 用法：node scripts/verify-seedream5-in-paint.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const TARGET_MODEL = 'doubao-seedream-5-0-flash-260915'
const base = process.env.PAINT_BASE || 'http://127.0.0.1:5173'
const route = '/student/paint'
const shotDir = 'docs/mockups/shots'

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

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

// 模型 chip 可能藏在「提示词工具条」里，先确认存在
const chip = page.locator('.model-chip').first()
check((await chip.count()) > 0, '绘画页有模型选择按钮')
const chipText = (await chip.count()) ? (await chip.innerText()).trim() : ''
console.log(`[当前模型] ${chipText}`)

await chip.click()
await page.waitForTimeout(600)
const options = (await page.locator('.model-panel button strong').allTextContents()).map((s) => s.trim()).filter(Boolean)
console.log('[下拉里的模型]')
options.forEach((item) => console.log('  · ' + item))
check(options.length > 0, '下拉有模型选项', `${options.length} 个`)
check(options.some((item) => item.includes(TARGET_MODEL)), '下拉里能看到 seedream 5.0', TARGET_MODEL)
check(options.some((item) => item.includes('doubao-seedream-4-0-250828')), '原有 4.0 模型没被弄丢')

await page.screenshot({ path: `${shotDir}/paint-model-dropdown-seedream5.png`, fullPage: false })

// 真的选中它，确认按钮文案跟着变（不发请求）
const target = page.locator(`.model-panel button:has(strong:text-is("${options.find((item) => item.includes(TARGET_MODEL)) || ''}"))`).first()
if (await target.count()) {
  await target.click()
  await page.waitForTimeout(600)
  const after = (await chip.innerText()).trim()
  console.log(`[选中后按钮文案] ${after}`)
  check(after.includes(TARGET_MODEL), '选中 5.0 后按钮上显示的就是 5.0')
  await page.screenshot({ path: `${shotDir}/paint-model-selected-seedream5.png`, fullPage: false })
} else {
  check(false, '下拉里的 5.0 选项可点击')
}

await browser.close()
console.log(fails.length ? `\n结果：${fails.length} 项未通过` : '\n结果：全部通过')
process.exit(fails.length ? 1 : 0)
