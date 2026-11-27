/**
 * 验证：学生端左下角人物 → 点一下打开智能体 → 说一句 → 看它怎么回。
 *
 * 只验证「听 + 整理」，故意用一句模糊的话（不会触发真的出图，不花钱）。
 * 用法：node scripts/verify-student-agent-dock.mjs [page路径]
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const base = 'http://127.0.0.1:5173'
const route = process.argv[2] || '/student/paint'
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
console.log('[登录后地址]', page.url())

// 绘画页的侧栏人物只在专业版出现
await page.evaluate(() => localStorage.setItem('art-studio-difficulty', 'pro'))
await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await page.evaluate(() => document.querySelectorAll('.el-message, .el-notification').forEach((n) => n.remove()))

const figure = page.locator('.sa-figure-btn')

// 绘画页可能会弹「发现上次没做完的作品」，先把遮罩关掉，否则人物点不动
for (let i = 0; i < 4; i += 1) {
  const overlay = page.locator('.el-overlay').first()
  if (!(await overlay.count())) break
  const closer = page.locator('.el-dialog__headerbtn, .el-overlay-dialog button:has-text("取消"), .el-overlay-dialog button:has-text("不要了")').first()
  if (await closer.count()) await closer.click({ force: true }).catch(() => {})
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}
if (await page.locator('.el-overlay').count()) {
  await page.evaluate(() => document.querySelectorAll('.el-overlay').forEach((n) => n.remove()))
  await page.waitForTimeout(300)
}

const figureCount = await figure.count()
check(figureCount > 0, '左下角人物存在', `找到 ${figureCount} 个`)
if (!figureCount) {
  await page.screenshot({ path: `${shotDir}/agent-dock-missing.png` })
  await browser.close()
  process.exit(1)
}

const boxBefore = await figure.first().boundingBox()
console.log('[人物位置]', JSON.stringify(boxBefore))
check(!!boxBefore && boxBefore.width > 30, '人物有可点击尺寸', boxBefore ? `${Math.round(boxBefore.width)}×${Math.round(boxBefore.height)}` : '无')
await page.screenshot({ path: `${shotDir}/agent-1-closed.png` })

// 点一下 = 打开智能体
await figure.first().click()
await page.waitForTimeout(700)
const panel = page.locator('.sa-panel')
check(await panel.count() > 0, '点人物后弹出对话面板')
const headName = await page.locator('.sa-who strong').first().textContent().catch(() => '')
console.log('[面板上的名字]', (headName || '').trim())
check(!!(headName || '').trim() && !/项目创作报告智能体/.test(headName), '学生看到的是他能懂的名字', (headName || '').trim())
await page.screenshot({ path: `${shotDir}/agent-2-open.png` })

// 故意说一句模糊的：只验证「听 + 整理 + 反问」，不触发出图
const said = process.env.AGENT_SAY || '我想画恐龙，但不知道背景画什么'
await page.locator('.sa-input').fill(said)
await page.locator('.sa-input').press('Enter')
await page.waitForTimeout(600)
check(await page.locator('.sa-bubble.is-thinking').count() > 0, '等待期间显示「正在想」', '学生不会以为卡死')
await page.screenshot({ path: `${shotDir}/agent-3-thinking.png` })

// 等智能体回话（模型 5~40 秒）。判定必须看「气泡里真有字」，
// 只数气泡个数会被刚插入的空气泡骗到，误报成失败。
let replied = false
for (let i = 0; i < 60; i += 1) {
  await page.waitForTimeout(1000)
  const thinking = await page.locator('.sa-bubble.is-thinking').count()
  const texts = await page.locator('.sa-bubble.is-agent').allTextContents()
  if (!thinking && texts.some((t) => t.trim().length > 0) && texts.length >= 2) { replied = true; break }
}
check(replied, '智能体给出了回话')

const bubbles = await page.locator('.sa-bubble.is-agent').allTextContents()
console.log('[对话内容]')
bubbles.forEach((t, i) => console.log(`  agent-${i + 1}: ${t.replace(/\s+/g, ' ').slice(0, 90)}`))
const studentBubbles = await page.locator('.sa-bubble.is-student').allTextContents()
console.log('[学生说的]', studentBubbles.join(' | '))

const detail = page.locator('.sa-detail')
if (await detail.count()) {
  console.log('[详情块]', (await detail.first().textContent()).replace(/\s+/g, ' ').slice(0, 220))
}
await page.screenshot({ path: `${shotDir}/agent-4-replied.png` })

console.log(`\n${fails.length ? '有失败项：' + fails.join('、') : '全部通过'}`)
await browser.close()
process.exit(fails.length ? 1 : 0)
