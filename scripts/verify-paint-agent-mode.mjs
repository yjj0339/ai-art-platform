/**
 * 验证绘画页「一个输入框，两种模式」：点头像切智能体模式，大框 + 旁边的语音/发送跟着变。
 *
 * 验收重点（零花费，不出图）：
 * 1. 默认是图像模式，面板不显示；
 * 2. 点头像 → 面板展开、出现「智能体模式」标签、大框变色、占位文字变；
 * 3. 面板里不再有自己的输入框 / 麦克风 / 发送键；
 * 4. 再点头像 → 退出智能体模式，面板收起、大框恢复；
 * 5. 面板的 × 也能退出模式（不会出现「面板关了但模式还开着」）；
 * 6. 图像模式下发送键仍是原来的出图，智能体模式下发送键变成「交给老师理解」。
 *
 * 用法：node scripts/verify-paint-agent-mode.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const base = 'http://127.0.0.1:5173'
const route = '/student/paint'
const shotDir = 'docs/mockups/shots'

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// 阻止一切真实出图/联网请求：这次只验界面和分流，不花钱
await page.route('**/api/student/agent/understand', (r) => r.abort())
await page.route('**/api/**/generate**', (r) => r.abort())

await page.goto(`${base}/login?redirect=${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
const inputs = page.locator('.el-input__inner')
await inputs.nth(0).fill('ceshi2')
await inputs.nth(1).fill('demo-school')
await inputs.nth(2).fill('123456789')
await page.getByRole('button', { name: /进入学生工作台/ }).click()
await page.waitForTimeout(3000)

await page.evaluate(() => {
  localStorage.setItem('art-studio-difficulty', 'pro')
})
await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await page.evaluate(() => document.querySelectorAll('.el-message, .el-notification').forEach((n) => n.remove()))

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

// ① 默认：图像模式
check(await page.locator('.paint-page').count() > 0, '绘画页已加载')
check(await page.locator('.sa-panel').count() === 0, '默认不展开面板（是图像生成模式）')
const tagIdle = await page.locator('.sa-mode-tag').innerText().catch(() => '')
check(/点我切智能体/.test(tagIdle), '头像上有「点我切智能体」提示', tagIdle)
const composerIdle = page.locator('.prompt-composer').first()
check(!(await composerIdle.evaluate((n) => n.classList.contains('is-agent-mode'))), '大框默认不是智能体配色')
check(
  (await page.locator('.pro-prompt-textarea').first().getAttribute('data-placeholder')) === '提示词输入',
  '大框占位文字是「提示词输入」',
)
check(
  (await page.locator('.pro-action-stack button:has-text("发送")').getAttribute('title')) === '发送生成',
  '发送键仍是「发送生成」',
)
await page.screenshot({ path: `${shotDir}/agent-mode-1-image.png` })

// ② 点头像 → 进智能体模式
await page.locator('.sa-figure-btn').first().click()
await page.waitForTimeout(700)
check(await page.locator('.sa-panel').count() === 1, '点头像后对话面板展开')
check(await page.locator('.sa-mode-tag.is-on').count() === 1, '头像标签变成「智能体模式」并高亮', await page.locator('.sa-mode-tag').innerText())
check(await page.locator('.prompt-composer.is-agent-mode').count() === 1, '大框切成智能体配色')
const agentPlaceholder = await page.locator('.pro-prompt-textarea').first().getAttribute('data-placeholder')
check(/跟老师说/.test(agentPlaceholder || ''), '大框占位文字变成「跟老师说…」', agentPlaceholder || '')
const sendTitle = await page.locator('.pro-action-stack button:has-text("发送")').getAttribute('title')
check(/智能体/.test(sendTitle || ''), '发送键的提示变成交给智能体', sendTitle || '')
const voiceTitle = await page.locator('.voice-action-btn').getAttribute('title')
check(/语音/.test(voiceTitle || ''), '语音键还在（并用同一套识别）', voiceTitle || '')

// ③ 面板里不能再有第二套输入
check(await page.locator('.sa-input').count() === 0, '面板里没有自己的小输入框')
check(await page.locator('.sa-mic').count() === 0, '面板里没有自己的麦克风')
check(await page.locator('.sa-send').count() === 0, '面板里没有自己的「说」按钮')
check(await page.locator('.sa-foot-hint').count() === 1, '面板底部有「去大框说」的指引', await page.locator('.sa-foot-hint').innerText())
check(await page.locator('.sa-sound').count() === 1, '面板保留朗读开关')
await page.screenshot({ path: `${shotDir}/agent-mode-2-agent.png` })

// ③·2 大框里说一句 + 点发送：应该走智能体理解，而不是直接出图
await page.locator('.pro-prompt-textarea').first().click()
await page.keyboard.type('帮我画一只月球上的猫')
await page.waitForTimeout(300)
const understandHit = page.waitForRequest('**/api/student/agent/understand', { timeout: 8000 }).catch(() => null)
await page.locator('.pro-action-stack button:has-text("发送")').click()
const req = await understandHit
check(!!req, '智能体模式下点发送，确实先去「理解」，没有直接开画')
if (req) {
  const body = JSON.parse(req.postData() || '{}')
  check(String(body.text || '').includes('月球上的猫'), '送进理解的就是大框里那句话', String(body.text || ''))
}
await page.waitForTimeout(1500)
const bubbles = await page.locator('.sa-bubble.is-student').allTextContents()
check(bubbles.some((t) => t.includes('月球上的猫')), '学生那句话进了对话流（面板像聊天一样有来有回）', bubbles.join(' | ').slice(0, 60))

// ④ 再点头像 → 回到图像模式
await page.locator('.sa-figure-btn').first().click()
await page.waitForTimeout(600)
check(await page.locator('.sa-panel').count() === 0, '再点头像，面板收起')
check(await page.locator('.sa-mode-tag.is-on').count() === 0, '标签回到「点我切智能体」')
check(!(await page.locator('.prompt-composer').first().evaluate((n) => n.classList.contains('is-agent-mode'))), '大框恢复原来的配色')
check(
  (await page.locator('.pro-action-stack button:has-text("发送")').getAttribute('title')) === '发送生成',
  '发送键回到「发送生成」',
)
await page.screenshot({ path: `${shotDir}/agent-mode-3-back-to-image.png` })

// ⑤ 面板的 × 也要能退出模式，不能「面板关了模式还开着」
await page.locator('.sa-figure-btn').first().click()
await page.waitForTimeout(600)
await page.locator('.sa-close').click()
await page.waitForTimeout(600)
check(await page.locator('.sa-panel').count() === 0, '点 × 收起面板')
check(await page.locator('.prompt-composer.is-agent-mode').count() === 0, '点 × 之后大框也退出智能体模式（模式没被卡住）')
check(await page.locator('.sa-mode-tag.is-on').count() === 0, '点头像的标签也同步回图像模式')

// ⑥ 核心闭环（零花费）：AI 说「理好了」→ 描述写回大框 → 用整理后的描述出图
// 先把出图接口换成假响应（不真花钱），再重新进入智能体模式
await page.unroute('**/api/**/generate**').catch(() => {})
await page.route('**/api/ai/image/generate', (r) => r.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ source: 'blocked', results: [] }),
}))
await page.locator('.sa-figure-btn').first().click()
await page.waitForTimeout(600)
check(await page.locator('.prompt-composer.is-agent-mode').count() === 1, '重新进入智能体模式')
await page.unroute('**/api/student/agent/understand').catch(() => {})
await page.route('**/api/student/agent/understand', (r) => r.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    agentName: 'AI 小画师',
    reply: '好，我按这个来画。',
    readyToRun: true,
    prompt: '一只橘猫坐在月球环形山上，深蓝星空背景，柔和水彩质感',
    additions: [{ label: '背景', value: '月球', why: '把地点说清楚了' }],
    missing: [],
    questions: [],
  }),
}))
const generateReq = page.waitForRequest('**/api/ai/image/generate', { timeout: 15000 }).catch(() => null)
await page.locator('.pro-prompt-textarea').first().click()
await page.keyboard.press('Control+A')
await page.keyboard.press('Delete')
await page.keyboard.type('画只猫在月亮上')
await page.locator('.pro-action-stack button:has-text("发送")').click()
const genReq = await generateReq
check(!!genReq, 'AI 理好之后确实接着出了图（没有停在理解这一步）')
if (genReq) {
  const body = JSON.parse(genReq.postData() || '{}')
  check(
    String(body.prompt || '').includes('月球环形山'),
    '出图用的是「整理后的描述」，不是学生原话',
    String(body.prompt || '').slice(0, 40),
  )
}
await page.waitForTimeout(1200)

// ⑦ 视觉：模式标签不能压住人物、大框不能被挤变形
const layout = await page.evaluate(() => {
  const tag = document.querySelector('.sa-mode-tag')
  const figure = document.querySelector('.sa-figure')
  const composer = document.querySelector('.prompt-composer')
  const box = (el) => (el ? el.getBoundingClientRect() : null)
  return { tag: box(tag), figure: box(figure), composer: box(composer), vw: window.innerWidth }
})
check(layout.composer && layout.composer.width > 200, '大框宽度正常', `${Math.round(layout.composer?.width || 0)}px`)
check(layout.composer.width <= layout.vw, '大框没有横向溢出')
check(!!layout.tag && !!layout.figure, '模式标签和人物都在')

console.log(`\n${fails.length ? '有失败项：' + fails.join('、') : '全部通过'}`)
await browser.close()
