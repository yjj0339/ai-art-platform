/**
 * 验证课程中心两页的智能体位置：
 * 1) 课程列表页：不出现小画师（用户在挑课，人物挡左栏）
 * 2) 进入课程学习页：小画师出现，并且在屏幕右侧
 *
 * 只看界面位置，不生成任何内容，不花钱。
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const base = 'http://127.0.0.1:5173'
const fails = []
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e?.message || e)))

await page.goto(`${base}/login?redirect=/student/courses`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
const inputs = page.locator('.el-input__inner')
await inputs.nth(0).fill('ceshi2')
await inputs.nth(1).fill('demo-school')
await inputs.nth(2).fill('123456789')
await page.getByRole('button', { name: /进入学生工作台/ }).click()
await page.waitForTimeout(3000)

await page.goto(`${base}/student/courses`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

/* —— 列表页 —— */
check((await page.locator('.course-list-shell').count()) > 0, '进入的是课程列表页')
check((await page.locator('.sa-dock').count()) === 0, '课程列表页没有小画师')
await page.screenshot({ path: 'docs/mockups/shots/course-agent-list.png' })

/* —— 进课程学习页 —— */
const startBtn = page.locator('.course-card .start-btn').first()
const canEnter = (await startBtn.count()) > 0 && (await startBtn.isEnabled())
check(canEnter, '列表里有一门可进入的课')
await startBtn.click()
await page.waitForTimeout(2000)
check((await page.locator('.lesson-shell').count()) > 0, '已进入课程学习页')

const dock = page.locator('.sa-dock').first()
check((await page.locator('.sa-dock').count()) === 1, '学习页有小画师')
const box = await dock.boundingBox()
const vw = page.viewportSize().width
const rightGap = vw - (box.x + box.width)
console.log(`[位置] 人物左边 ${Math.round(box.x)}，距右边缘 ${Math.round(rightGap)}（屏宽 ${vw}）`)
check(box.x > vw / 2, '小画师在屏幕右半边')
check(rightGap < 80, '小画师贴近右边缘', `距右 ${Math.round(rightGap)}px`)

/* 打开面板，确认面板朝着屏幕内侧展开、没有跑出屏外 */
await page.locator('.sa-figure-btn').first().click()
await page.waitForTimeout(700)
const panel = page.locator('.sa-panel').first()
check((await panel.count()) > 0, '面板能打开')
const pb = await panel.boundingBox()
console.log(`[面板] x=${Math.round(pb.x)} w=${Math.round(pb.width)} 右边界=${Math.round(pb.x + pb.width)}`)
check(pb.x >= 0 && pb.x + pb.width <= vw, '面板完整落在屏幕内（向右展开）')
await page.screenshot({ path: 'docs/mockups/shots/course-agent-lesson.png' })

check(errors.length === 0, '页面无 JS 报错', errors.slice(0, 2).join(' | '))

await browser.close()
console.log(fails.length ? `\n${fails.length} 项失败：${fails.join('、')}` : '\n全部通过')
process.exit(fails.length ? 1 : 0)
