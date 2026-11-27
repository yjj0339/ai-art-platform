/**
 * 只看一件事：在 AI 绘画创作页点左下角人物、说一句话之后，
 * 画布上到底有没有真的出图。
 *
 * 上一个脚本（verify-student-agent-dock.mjs）只验到「智能体回话」，
 * 回话成功但出图失败是两种完全不同的故障，必须分开验。
 *
 * 用法：node scripts/verify-agent-paint-generate.mjs
 *      AGENT_SAY='帮我画一只月球上的猫' node scripts/verify-agent-paint-generate.mjs
 */
import { createRequire } from 'node:module'

// playwright-core 装在 WorkBuddy 的 node 工作区，不在本项目 node_modules 里。
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const base = process.env.PROBE_BASE || 'http://127.0.0.1:5173'
const route = '/student/paint'
const say = process.env.AGENT_SAY || '帮我画一只月球上的猫'

async function main() {
const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// 出图失败时页面上的错误文案可能是空的，网络层才是真相
page.on('response', async (res) => {
  const u = res.url()
  if (!/generat|images/i.test(u) || u.includes('node_modules')) return
  let body = ''
  try { body = (await res.text()).slice(0, 600) } catch { body = '' }
  console.log(`[net] ${res.status()} ${u.replace(/^http:\/\/[^/]+/, '')} ${body}`)
})
page.on('requestfailed', (req) => {
  if (/generat|images/i.test(req.url())) console.log(`[net-fail] ${req.url().slice(0, 120)} ${req.failure()?.errorText || ''}`)
})
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log(`[console] ${msg.text().slice(0, 200)}`)
})
const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

try {
  await page.goto(`${base}/login?redirect=${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const inputs = page.locator('.el-input__inner')
  await inputs.nth(0).fill('ceshi2')
  await inputs.nth(1).fill('demo-school')
  await inputs.nth(2).fill('123456789')
  await page.getByRole('button', { name: /进入学生工作台/ }).click()
  await page.waitForTimeout(3000)
  // 专业版才有左下角人物
  await page.evaluate(() => localStorage.setItem('art-studio-difficulty', 'pro'))
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  // 「发现上次没做完的作品」这类弹窗会挡住人物按钮
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

  const before = await page.locator('.generation-batch:not(.generation-pending-batch)').count()

  await page.locator('.sa-figure-btn').first().click()
  await page.waitForTimeout(700)
  await page.locator('.sa-input').fill(say)
  await page.locator('.sa-input').press('Enter')
  console.log(`[学生说的] ${say}`)

  // 出图 8~15 秒，给到 120 秒；中途有排队
  const deadline = Date.now() + 120000
  let sawPending = false
  let failedText = ''
  let done = false
  while (Date.now() < deadline) {
    const pending = await page.locator('.generation-pending-batch').count()
    if (pending) sawPending = true
    if (!pending && sawPending) { done = true; break }
    const err = page.locator('.generation-job-error strong, .pro-empty-state.is-error strong').first()
    if (await err.count()) { failedText = (await err.innerText()).trim(); break }
    await page.waitForTimeout(1000)
  }

  const after = await page.locator('.generation-batch:not(.generation-pending-batch)').count()
  const errBox = page.locator('.generation-job-error, .pro-empty-state.is-error').first()
  const errDetail = await errBox.innerText().catch(() => '')

  check(sawPending, '点人物说完话后真的开始出图了')
  check(!failedText, '出图没有失败', failedText || (errDetail ? `详情：${errDetail.replace(/\s+/g, ' ')}` : ''))
  check(after > before, '画布上多出了作品', `批次 ${before} → ${after}`)

  await page.screenshot({ path: 'docs/mockups/shots/agent-5-generated.png', fullPage: false })
  console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join(' / ')}` : '全部通过'}`)
  process.exitCode = fails.length ? 1 : 0
} finally {
  await browser.close()
}
}

main()
