/**
 * 验收：AI 视频页、3D 页点「发送 / 开始生成」之后提示词输入框必须空出来。
 *
 * 出图/出视频/出3D 的接口全部 route 拦成假数据，不调用真实模型、不花钱，
 * 但走的是页面真实流程（校验 → 提交 → 清空），能验到真交互。
 *
 * 用法：node scripts/verify-video-3d-prompt-clear.mjs
 */
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const base = process.env.PROBE_BASE || 'http://127.0.0.1:5173'
const TAG = `清空${Date.now().toString().slice(-6)}`
const VIDEO_PROMPT = `${TAG}：小兔子在草地上蹦跳`
const MODEL3D_PROMPT = `${TAG}：一只圆头小陶罐`

const fails = []
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

async function login(page, route) {
  await page.goto(`${base}/login?redirect=${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const inputs = page.locator('.el-input__inner')
  await inputs.nth(0).fill('ceshi2')
  await inputs.nth(1).fill('demo-school')
  await inputs.nth(2).fill('123456789')
  await page.getByRole('button', { name: /进入学生工作台/ }).click()
  await page.waitForTimeout(3000)
}

async function closeOverlays(page) {
  for (let i = 0; i < 4; i += 1) {
    if (!(await page.locator('.el-overlay').count())) break
    const closer = page
      .locator('.el-dialog__headerbtn, .el-overlay-dialog button:has-text("取消"), .el-message-box__btns button:has-text("取消"), .el-overlay-dialog button:has-text("继续创作")')
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

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const videoBodies = []
  const model3dBodies = []
  await page.route('**/api/ai/video/generate', async (handler) => {
    let body = {}
    try { body = handler.request().postDataJSON() || {} } catch { body = {} }
    videoBodies.push(body)
    await handler.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { taskId: `stub-video-${Date.now()}`, status: 'succeeded', videoUrl: '', previewUrl: '', description: 'stub' } }),
    })
  })
  await page.route('**/api/ai/model3d/generate', async (handler) => {
    let body = {}
    try { body = handler.request().postDataJSON() || {} } catch { body = {} }
    model3dBodies.push(body)
    await handler.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ taskId: `stub-3d-${Date.now()}`, edition: 'rapid' }),
    })
  })
  await page.route('**/api/ai/model3d/tasks/**', async (handler) => {
    await handler.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'fail', errorMessage: '验收用：不真正生成' }),
    })
  })

  try {
    await login(page, '/student/video')
    await page.evaluate(() => {
      localStorage.setItem('art-studio-difficulty', 'pro')
      localStorage.setItem('ai-agent-voice-muted', '1')
      localStorage.setItem('art-studio-muted', '1')
    })

    // ================= 视频页 =================
    await page.goto(`${base}/student/video`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    await closeOverlays(page)

    const editor = page.locator('.video-prompt-editor')
    if (!(await editor.count())) {
      check(false, '视频页提示词输入框存在')
    } else {
      await editor.first().click()
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(150)
      await page.keyboard.insertText(VIDEO_PROMPT)
      await page.waitForTimeout(300)

      // 视频页必须有素材才允许生成；没素材就先加一条「纯文字创作」。
      // 注意：素材可能来自已打开的项目，此时面板里不一定有 .material-card，
      // 真正算数的是「接下来能不能提交成功」，所以这里只做提示，后面的请求断言才是硬标准。
      if (!(await page.locator('.material-card').count())) {
        const blank = page.locator('button:has-text("纯文字创作")').first()
        if (await blank.count()) {
          await blank.click()
          await page.waitForTimeout(400)
        }
      }
      const materialHint = await page.locator('.soft-empty').count()
      console.log(`[说明] 素材卡 ${await page.locator('.material-card').count()} 个，空白提示 ${materialHint} 处`)

      const beforeText = (await editor.first().evaluate((el) => el.textContent || '')).trim()
      check(beforeText.includes(TAG), '输入的文字进了视频页输入框', beforeText.slice(0, 40))

      await page.locator('button[title="发送生成"]').first().click()
      let ok = false
      const deadline = Date.now() + 25000
      while (Date.now() < deadline) {
        if (videoBodies.length) { ok = true; break }
        await page.waitForTimeout(300)
      }
      await closeOverlays(page)
      check(ok, '视频页点发送后请求真的发出去了')
      const sentPrompt = JSON.stringify(videoBodies[0] || {})
      check(sentPrompt.includes(TAG), '视频请求里带的就是刚输入的提示词')

      await page.waitForTimeout(800)
      const afterText = (await editor.first().evaluate((el) => el.textContent || '')).trim()
      check(afterText === '', '视频页生成后输入框清空了', afterText ? `还留着「${afterText.slice(0, 40)}」` : '空')
      await page.screenshot({ path: 'docs/mockups/shots/video-prompt-clear.png' })
    }

    // ================= 3D 页 =================
    await page.goto(`${base}/student/model3d`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    await closeOverlays(page)

    const textarea = page.locator('textarea').first()
    if (!(await textarea.count())) {
      check(false, '3D 页描述输入框存在')
    } else {
      await textarea.fill(MODEL3D_PROMPT)
      await page.waitForTimeout(300)
      check((await textarea.inputValue()) === MODEL3D_PROMPT, '输入的文字进了3D页输入框')

      await page.locator('button:has-text("开始生成")').first().click()
      let ok = false
      const deadline = Date.now() + 25000
      while (Date.now() < deadline) {
        if (model3dBodies.length) { ok = true; break }
        await page.waitForTimeout(300)
      }
      check(ok, '3D 页点开始生成后请求真的发出去了')
      check(String((model3dBodies[0] || {}).prompt || '').includes(TAG), '3D 请求里带的就是刚输入的描述', String((model3dBodies[0] || {}).prompt || '').slice(0, 40))

      await page.waitForTimeout(1200)
      const afterValue = await textarea.inputValue()
      check(afterValue === '', '3D 页提交后输入框清空了', afterValue ? `还留着「${afterValue.slice(0, 40)}」` : '空')
      await page.screenshot({ path: 'docs/mockups/shots/model3d-prompt-clear.png' })
    }

    console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join(' / ')}` : '全部通过'}`)
    process.exitCode = fails.length ? 1 : 0
  } finally {
    await browser.close()
  }
}

main()
