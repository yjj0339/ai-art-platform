/**
 * 验证课程学习页「视频学习」区域：
 * 1) 顶部不再出现「课程学习已完成 / 我已完成课程学习」那一行提示
 * 2) 视频区域紧贴标签栏，中间没有多余空白（提示行被删后不留空位）
 * 3) 视频区域高度足够（没被挤压）
 *
 * 优先挑一门「有本地视频文件」的课（能找到真实播放器），
 * 找不到就挑有占位画面的课，但仍检查空白与提示行。
 * 只看界面，不生成内容，不花钱。
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

/* 逐门课进去，优先找带 <video> 播放器的那门 */
const cards = page.locator('.course-card .start-btn')
const total = await cards.count()
console.log(`[列表] 共 ${total} 门可进入的课`)
const pick = []
for (let i = 0; i < total; i++) {
  const name = (await page.locator('.course-card').nth(i).innerText().catch(() => '')).split('\n')[0]
  pick.push({ i, name })
}

let enteredWithPlayer = false
for (const { i, name } of pick) {
  const btn = page.locator('.course-card .start-btn').nth(i)
  if (!(await btn.count()) || !(await btn.isEnabled())) continue
  await btn.click()
  await page.waitForTimeout(1800)
  if (await page.locator('.lesson-shell').count()) {
    if (await page.locator('video.course-video-player').count()) {
      console.log(`[选中] 第 ${i + 1} 门「${name}」有真实视频播放器`)
      enteredWithPlayer = true
      break
    }
    console.log(`[跳过] 第 ${i + 1} 门「${name}」没有视频文件`)
    await page.locator('.icon-back').first().click().catch(() => {})
    await page.waitForTimeout(1200)
  }
}
if (!enteredWithPlayer) {
  console.log('[提示] 这个学生名下没有带视频文件的课程，改验占位画面')
  const btn = page.locator('.course-card .start-btn').first()
  if ((await btn.count()) && (await btn.isEnabled())) {
    await btn.click()
    await page.waitForTimeout(1800)
  }
}

check((await page.locator('.lesson-shell').count()) > 0, '已进入课程学习页')
const videoTab = page.locator('.panel-tabs button', { hasText: '视频学习' }).first()
if ((await videoTab.count()) > 0) {
  await videoTab.click()
  await page.waitForTimeout(600)
}
check((await page.locator('.video-stage').count()) > 0, '视频学习区域已渲染')
if (enteredWithPlayer) check((await page.locator('video.course-video-player').count()) === 1, '真实视频播放器已加载')

/* 1) 提示行彻底消失 */
const bodyText = await page.locator('.media-panel').innerText()
check(!bodyText.includes('课程学习已完成'), '不再出现「课程学习已完成」提示')
check(!bodyText.includes('我已完成课程学习'), '不再出现「我已完成课程学习」按钮')
check((await page.locator('.lesson-learning-save').count()) === 0, '提示行容器已移除')

/* 2) 标签栏和视频之间没有多余空隙 */
const tabsBox = await page.locator('.panel-tabs').first().boundingBox()
const stageBox = await page.locator('.video-stage').first().boundingBox()
const gap = Math.round(stageBox.y - (tabsBox.y + tabsBox.height))
console.log(`[间距] 标签栏底部 ${Math.round(tabsBox.y + tabsBox.height)}，视频顶部 ${Math.round(stageBox.y)}，空隙 ${gap}px`)
check(gap <= 24, '标签栏与视频之间没有多余空白', `${gap}px`)

if (enteredWithPlayer) {
  console.log(`[视频] 宽 ${Math.round(stageBox.width)} 高 ${Math.round(stageBox.height)}`)
  check(stageBox.height >= 320, '视频区域高度足够，没有被挤压', `${Math.round(stageBox.height)}px`)
} else {
  console.log(`[占位] 宽 ${Math.round(stageBox.width)} 高 ${Math.round(stageBox.height)}（无视频文件，只验空白）`)
}

await page.screenshot({ path: 'docs/mockups/shots/course-video-space.png' })

check(errors.length === 0, '页面无 JS 报错', errors.slice(0, 2).join(' | '))

await browser.close()
console.log(fails.length ? `\n${fails.length} 项失败：${fails.join('、')}` : '\n全部通过')
process.exit(fails.length ? 1 : 0)
