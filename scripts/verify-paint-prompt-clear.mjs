/**
 * 验收：AI 绘画页点「发送」生成之后，提示词输入框必须空出来。
 *
 * 为什么要专门一个脚本：
 * - 提示词框是 contenteditable，数据清空和 DOM 清空是两件事，
 *   出现过「form.prompt 空了、屏幕上字还在」的情况，只能靠真浏览器看。
 * - 出图接口用 route 拦下来返回假图，不调用真实模型、不产生费用，
 *   但走的是页面完整流程（提交 → 排队 → 入历史），所以能验到真实交互。
 *
 * 用法：node scripts/verify-paint-prompt-clear.mjs
 *      PROBE_BASE=http://127.0.0.1:5174 node scripts/verify-paint-prompt-clear.mjs
 */
import { createRequire } from 'node:module'

// playwright-core 装在 WorkBuddy 的 node 工作区，不在本项目 node_modules 里。
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const base = process.env.PROBE_BASE || 'http://127.0.0.1:5173'
const route = '/student/paint'
// 带时间戳的标记，避免命中上一次验收留在草稿里的旧批次
const TAG = `验收清空${Date.now().toString().slice(-6)}`
const TYPED = `${TAG}：一只戴帽子的橘猫`
const AGENT_SAY = '帮我画一只月球上的猫'

// 1x1 透明 png，够页面渲染 background 用，不触发任何外部请求
const FAKE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const submitted = []
  // 拦在浏览器层：真前端、假模型，既验到交互也不花钱
  await page.route('**/api/ai/image/generate', async (routeHandler) => {
    let body = {}
    try { body = routeHandler.request().postDataJSON() || {} } catch { body = {} }
    submitted.push(String(body.prompt || ''))
    await routeHandler.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          provider: 'stub',
          model: 'stub-model',
          images: [{ imageUrl: FAKE_PNG, prompt: body.prompt || '' }],
        },
      }),
    })
  })

  const fails = []
  function check(ok, label, extra = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
    if (!ok) fails.push(label)
  }

  const editorText = async () => (await page.locator('.pro-prompt-textarea').evaluate((el) => el.textContent || '')).trim()
  const waitForSubmit = async (count, timeout = 25000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (submitted.length >= count) return true
      await page.waitForTimeout(300)
    }
    return false
  }
  const closeOverlays = async () => {
    for (let i = 0; i < 4; i += 1) {
      if (!(await page.locator('.el-overlay').count())) break
      const closer = page
        .locator('.el-dialog__headerbtn, .el-overlay-dialog button:has-text("取消"), .el-overlay-dialog button:has-text("不要了"), .el-overlay-dialog button:has-text("继续创作")')
        .first()
      if (await closer.count()) await closer.click({ force: true }).catch(() => {})
      else await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
    if (await page.locator('.el-overlay').count()) {
      await page.evaluate(() => document.querySelectorAll('.el-overlay').forEach((n) => n.remove()))
      await page.waitForTimeout(300)
    }
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

    await page.evaluate(() => {
      localStorage.setItem('art-studio-difficulty', 'pro')
      localStorage.setItem('ai-agent-voice-muted', '1')
      localStorage.setItem('art-studio-muted', '1')
    })
    await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    await closeOverlays()

    if (!(await page.locator('.pro-prompt-textarea').count())) {
      check(false, '绘画页提示词输入框存在')
      return
    }

    // —— ① 手动输入 → 点发送 ——
    // 页面会从草稿恢复上次的提示词，先清干净再输入，否则断言会被旧文字干扰
    await page.locator('.pro-prompt-textarea').click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
    await page.keyboard.insertText(TYPED)
    await page.waitForTimeout(200)
    const typedShown = await editorText()
    check(typedShown === TYPED, '输入的文字进了输入框', typedShown.slice(0, 40))

    await page.locator('.pro-action-stack button[title="发送生成"]').click()
    const sent1 = await waitForSubmit(1)
    check(sent1, '点发送后请求真的发出去了', submitted[0] ? submitted[0].slice(0, 40) : '没有请求')
    check((submitted[0] || '').includes('橘猫'), '请求里带的就是刚输入的提示词')

    await page.waitForTimeout(900)
    const afterSend = await editorText()
    check(afterSend === '', '生成后输入框清空了', afterSend ? `还留着「${afterSend.slice(0, 40)}」` : '空')

    // 历史批次要能看回提示词，别清出个「未记录提示词」。
    // 注意：批次列表是按时间从早到晚排的，最新一组在最后，不能只看第一个。
    const allBatchPrompts = async () =>
      (await page.locator('.generation-batch:not(.generation-pending-batch) strong').allInnerTexts()).map((t) => t.trim())
    let batchPrompts = []
    const batchDeadline = Date.now() + 20000
    while (Date.now() < batchDeadline) {
      batchPrompts = await allBatchPrompts()
      if (batchPrompts.some((t) => t.includes(TAG))) break
      await page.waitForTimeout(500)
    }
    check(batchPrompts.some((t) => t.includes(TAG)), '历史批次仍显示这句提示词', batchPrompts.slice(-1)[0]?.slice(0, 40) || '空')
    check(!batchPrompts.some((t) => t.includes('未记录提示词')), '历史批次没有被清成「未记录提示词」')

    // —— ② 智能体说一句话（用户报的正是这条路径）——
    await closeOverlays()
    if (await page.locator('.sa-figure-btn').count()) {
      await page.locator('.sa-figure-btn').first().click()
      await page.waitForTimeout(700)
      await page.locator('.sa-input').fill(AGENT_SAY)
      await page.locator('.sa-input').press('Enter')
      console.log(`[学生说的] ${AGENT_SAY}`)
      const sent2 = await waitForSubmit(2, 60000)
      check(sent2, '智能体听懂后真的提交了生成', sent2 ? (submitted[1] || '').slice(0, 40) : '没有第二个请求')
      await page.waitForTimeout(900)
      const afterAgent = await editorText()
      check(afterAgent === '', '智能体生成后输入框同样清空', afterAgent ? `还留着「${afterAgent.slice(0, 40)}」` : '空')
    } else {
      check(false, '找到左下角智能体人物按钮')
    }

    await page.screenshot({ path: 'docs/mockups/shots/paint-prompt-clear.png', fullPage: false })
    console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join(' / ')}` : '全部通过'}`)
    process.exitCode = fails.length ? 1 : 0
  } finally {
    await browser.close()
  }
}

main()
