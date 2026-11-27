/**
 * 验证学生端智能体记忆：一个账号一份、五页共用、存在服务器（不是浏览器）。
 *
 * 验收重点（零花费：/understand 用假回包，不调用真实模型、不出图）：
 * 1. 干净账号进页面，历史为空；
 * 2. 在视频页说一句，学生+老师两条都进对话流；
 * 3. 这两条已经落到服务端（接口能读到），不是只存在内存；
 * 4. 刷新页面（组件重建）后历史还在；
 * 5. 切到绘画页（另一个页面的组件实例）也看到同一份记忆；
 * 6. 点「清空」后刷新不再出现，服务端也归零。
 *
 * 用法：node scripts/verify-agent-memory.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const base = 'http://127.0.0.1:5173'
const studentText = '我想做一个关于鲸鱼的短视频'
const agentText = '好，鲸鱼浮在云上，我记下了'

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// 假回包：只验记忆链路，绝不调用真实模型
await page.route('**/api/student/agent/understand', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    agentName: 'AI 小画师',
    reply: agentText,
    readyToRun: false,
    prompt: '',
    additions: [],
    missing: [],
    questions: [],
    actionKey: '',
  }),
}))

async function readMemory() {
  const res = await page.request.get(`${base}/api/student/agent/memory?limit=50`)
  if (!res.ok()) return { ok: false, status: res.status(), messages: [], total: 0 }
  return await res.json()
}

async function openPanel(route, waitMs = 2600) {
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(waitMs)
  const figure = page.locator('.sa-figure-btn').first()
  await figure.waitFor({ state: 'visible', timeout: 20000 })
  const opened = await page.locator('.sa-panel').first().isVisible().catch(() => false)
  if (!opened) await figure.click({ force: true })
  await page.waitForTimeout(800)
}

async function streamText() {
  const stream = page.locator('.sa-panel .sa-stream').first()
  if (!(await stream.count())) return ''
  return (await stream.innerText()).replace(/\s+/g, ' ')
}

// —— 登录 ——
await page.goto(`${base}/login?redirect=/student/video`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
const inputs = page.locator('.el-input__inner')
await inputs.nth(0).fill('ceshi2')
await inputs.nth(1).fill('demo-school')
await inputs.nth(2).fill('123456789')
await page.getByRole('button', { name: /进入学生工作台/ }).click()
await page.waitForTimeout(3000)
// 绘画页的玩法卡按难度分流，不设这个会停在选难度那层，人物点不到
await page.evaluate(() => localStorage.setItem('art-studio-difficulty', 'pro'))

// —— 0. 清成干净状态 ——
await page.request.delete(`${base}/api/student/agent/memory`)
let memory = await readMemory()
check(memory.total === 0, '起点是干净记忆', `total=${memory.total}`)

// —— 1. 视频页：无历史时不显示旧气泡 ——
await openPanel('/student/video')
let text = await streamText()
check(text.length > 0, '视频页面板能打开', text.slice(0, 20))

// —— 2. 说一句，两条都进对话流 ——
const input = page.locator('.sa-panel .sa-input').first()
await input.fill(studentText)
await page.locator('.sa-panel .sa-send, .sa-panel button:has-text("发送")').first().click({ force: true })
await page.waitForTimeout(1600)
text = await streamText()
check(text.includes(studentText), '学生这句进了对话流')
check(text.includes(agentText), '老师回话进了对话流')

// —— 3. 已经落到服务端 ——
memory = await readMemory()
const contents = (memory.messages || []).map((item) => item.content)
check(memory.total === 2, '服务端记下 2 条', `total=${memory.total}`)
check(contents.includes(studentText) && contents.includes(agentText), '两条内容都对', contents.join(' | '))
const pageTag = (memory.messages || [])[0]?.page
check(pageTag === 'video', '记了来源页面', `page=${pageTag}`)

// —— 4. 刷新后还在（组件是重建的，不存在本地） ——
await openPanel('/student/video')
text = await streamText()
check(text.includes(studentText) && text.includes(agentText), '刷新视频页后记忆还在')

// —— 5. 切到绘画页，同一份记忆 ——
await openPanel('/student/paint', 3600)
text = await streamText()
check(text.includes(studentText) && text.includes(agentText), '绘画页看到的是同一份记忆')

// —— 6. 清空 ——
page.once('dialog', (dialog) => dialog.accept())
await page.locator('.sa-panel .sa-forget').first().click({ force: true })
await page.waitForTimeout(1200)
memory = await readMemory()
check(memory.total === 0, '清空后服务端归零', `total=${memory.total}`)
await openPanel('/student/video')
text = await streamText()
check(!text.includes(studentText) && !text.includes(agentText), '清空后刷新不再出现旧记忆')

await browser.close()
console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join('、')}` : '全部通过'}`)
process.exit(fails.length ? 1 : 0)
