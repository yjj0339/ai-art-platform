/**
 * 验收：AI 绘画页作品卡「引用」按钮 + 参考图条的自动收起。
 *
 * 验的是真交互，但出图接口被 route 拦成假图，不调用真实模型、不花钱。
 * 检查项：
 *  1. 作品卡第一格是「引用」，不再是没接线的「重新编辑」
 *  2. 点引用 → 这张图进参考图，左侧数字角标 +1，参考图条展开
 *  3. 点参考图条以外的地方（提示词框）→ 参考图条自动收起
 *  4. 点左侧小卡片 → 又能展开
 *  5. 引用不往提示词里塞任何字（用户明确不要说明文字）
 *
 * 用法：node scripts/verify-reference-quote.mjs
 */
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const base = process.env.PROBE_BASE || 'http://127.0.0.1:5173'
const route = '/student/paint'
const TAG = `引用验收${Date.now().toString().slice(-6)}`
// 假图用项目里真实存在的静态图 + 本次标记：每次跑都是「一张没引用过的图」，
// 否则会被「已在参考图里」的去重逻辑挡掉，验不到角标 +1
const FAKE_PNG = `${base}/assets/model3d/work-sneaker.png?probe=${TAG}`

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const submitted = []
  await page.route('**/api/ai/image/generate', async (handler) => {
    let body = {}
    try { body = handler.request().postDataJSON() || {} } catch { body = {} }
    submitted.push(String(body.prompt || ''))
    await handler.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { provider: 'stub', model: 'stub-model', images: [{ imageUrl: FAKE_PNG, prompt: body.prompt || '' }] } }),
    })
  })

  const fails = []
  const check = (ok, label, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
    if (!ok) fails.push(label)
  }

  const editorText = async () => (await page.locator('.pro-prompt-textarea').evaluate((el) => el.textContent || '')).trim()
  const stripVisible = async () => {
    const strip = page.locator('.reference-strip')
    if (!(await strip.count())) return false
    return strip.first().isVisible()
  }
  const thumbCount = async () => page.locator('.reference-strip .reference-thumb').count()
  const badgeCount = async () => {
    const badge = page.locator('.reference-card b').first()
    if (!(await badge.count())) return 0
    return Number((await badge.innerText()).trim()) || 0
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

    // 先造一批作品（假图），否则「引用」按钮是灰的
    await page.locator('.pro-prompt-textarea').click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.insertText(`${TAG}：一只戴帽子的橘猫`)
    await page.waitForTimeout(200)
    await page.locator('.pro-action-stack button[title="发送生成"]').click()
    const deadline = Date.now() + 25000
    while (Date.now() < deadline && !submitted.length) await page.waitForTimeout(300)
    check(submitted.length > 0, '先造出一批作品（假图）')

    // —— ① 按钮已经是「引用」 ——
    const batch = page.locator('.generation-batch:not(.generation-pending-batch)').last()
    const firstAction = batch.locator('.generation-batch-actions button').first()
    const firstLabel = (await firstAction.innerText().catch(() => '')).trim()
    check(firstLabel === '引用', '作品卡第一格是「引用」', firstLabel || '没找到按钮')
    check(!(await page.locator('button:has-text("重新编辑")').count()), '页面上已没有「重新编辑」这个假按钮')

    // 收起状态，先记下当前参考图数量
    const beforeThumbs = await thumbCount()
    const beforeBadge = await badgeCount()
    const promptBefore = await editorText()

    // —— ② 点引用 ——
    await firstAction.click()
    await page.waitForTimeout(900)
    check(await stripVisible(), '点引用后参考图条自动展开')
    const afterThumbs = await thumbCount()
    const afterBadge = await badgeCount()
    check(afterThumbs === beforeThumbs + 1 || afterThumbs >= 1, '参考图条里多了这张图', `${beforeThumbs} → ${afterThumbs}`)
    check(afterBadge > beforeBadge, '左侧小卡片数字角标加了 1', `${beforeBadge} → ${afterBadge}`)
    const promptAfter = await editorText()
    check(promptAfter === promptBefore, '引用不往提示词里塞说明文字', promptAfter.slice(0, 40) || '空')

    // —— ③ 点页面别处 → 自动收起 ——
    await page.locator('.pro-prompt-textarea').click()
    await page.waitForTimeout(500)
    check(!(await stripVisible()), '点提示词框后参考图条自动收起')

    // —— ④ 再点左侧小卡片 → 展开 ——
    await page.locator('.reference-card').click()
    await page.waitForTimeout(500)
    check(await stripVisible(), '点左侧小卡片又能展开')

    // —— ⑤ 再点一次卡片 → 收起（原有 toggle 不能被破坏）——
    await page.locator('.reference-card').click()
    await page.waitForTimeout(500)
    check(!(await stripVisible()), '再点一次卡片能收起')

    await page.locator('.reference-card').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'docs/mockups/shots/paint-reference-quote.png' })
    console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join(' / ')}` : '全部通过'}`)
    process.exitCode = fails.length ? 1 : 0
  } finally {
    await browser.close()
  }
}

main()
