// 验收：保存按钮藏进「文件」菜单后，脏着直接点「返回」会不会悄悄丢改动。
// 期望：弹一次确认框（保存并离开 / 不保存，直接离开 / 关闭留下）。
// 本脚本只制造界面态、不点真实测试、不落库（选「不保存」离开）。
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`PASS  ${name}${detail ? `  — ${detail}` : ''}`) }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`) }
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function waitFor(fn, timeout = 12000, step = 150) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await fn()) return true
    await delay(step)
  }
  return false
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e?.message || e)))

  try {
    const res = await page.request.post(`${BASE}/api/auth/login`, {
      data: { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' },
    })
    check('管理员登录成功', res.status() === 200, `status=${res.status()}`)

    const listRes = await page.request.get(`${BASE}/api/admin/h5-report-workflows`)
    const listJson = await listRes.json().catch(() => ({}))
    const rows = listJson.workflows || listJson.items || []
    const target = rows.find((row) => row?.id)
    check('找到一条 H5 工作流', Boolean(target), target?.title || '无')
    if (!target) return

    await page.goto(`${BASE}/admin/ai-skills/${encodeURIComponent(target.id)}/workflow?returnTo=h5-report&from=h5WorkflowLibrary`, { waitUntil: 'domcontentloaded' })
    check('画布页打开', await waitFor(async () => (await page.locator('.file-menu-trigger').count()) > 0, 30000))

    // 无改动时点返回：不该弹框，应直接回到库里。
    await page.locator('.file-menu-trigger').first().click()
    await page.locator('.file-menu').first().waitFor({ state: 'visible', timeout: 6000 })
    await page.locator('.file-menu [role="menuitem"]', { hasText: '返回工作流库' }).first().click()
    const leftDirectly = await waitFor(async () => /\/admin\/h5-report-workflows/.test(page.url()), 12000)
    check('无改动时点「返回」不弹框、直接回库', leftDirectly, page.url())

    // 回到画布，制造一次脏态：改一个节点的标题文字。
    await page.goto(`${BASE}/admin/ai-skills/${encodeURIComponent(target.id)}/workflow?returnTo=h5-report&from=h5WorkflowLibrary`, { waitUntil: 'domcontentloaded' })
    await waitFor(async () => (await page.locator('.vue-flow__node').count()) > 0, 30000)
    const nodes = page.locator('.vue-flow__node')
    const nodeCount = await nodes.count()
    check('画布上有节点可操作', nodeCount > 0, `${nodeCount} 个`)

    // 拖第一个节点 40/30px，产生真实改动（和顶栏验收用的是同一套拖动方式，不依赖节点类型）。
    await page.keyboard.press('Escape')
    await delay(500)
    const box = await nodes.first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 12)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 30, { steps: 12 })
    await page.mouse.up()

    const dotShown = await waitFor(async () => (await page.locator('.file-menu-dot').count()) > 0, 12000)
    check('拖动后「文件」上出现未保存橙点', dotShown)

    await page.locator('.file-menu-trigger').first().click()
    await page.locator('.file-menu').first().waitFor({ state: 'visible', timeout: 6000 })
    await page.locator('.file-menu [role="menuitem"]', { hasText: '返回工作流库' }).first().click()

    const box1 = page.locator('.el-message-box').first()
    const dialogShown = await waitFor(async () => (await box1.count()) > 0 && await box1.isVisible(), 8000)
    check('脏着点「返回」会弹未保存确认框', dialogShown)
    const dialogText = dialogShown ? await box1.innerText() : ''
    check('确认框说明是「有未保存的改动」', /未保存/.test(dialogText), dialogText.replace(/\n+/g, ' ').slice(0, 90))
    check('提供「保存并离开」', /保存并离开/.test(dialogText))
    check('提供「不保存，直接离开」', /不保存/.test(dialogText))

    await delay(700)
    await page.screenshot({ path: path.join(OUT_DIR, 'admin-canvas-leave-guard.png') }).catch(() => {})

    // 点「不保存，直接离开」→ 应当离开回库，且不该产生保存。
    await page.locator('.el-message-box__btns button', { hasText: '不保存' }).first().click()
    const leftAfterSkip = await waitFor(async () => /\/admin\/h5-report-workflows/.test(page.url()), 12000)
    check('选「不保存直接离开」后回到工作流库', leftAfterSkip, page.url())

    check('无前端控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '))
  } finally {
    await browser.close()
  }
  console.log(`\n==== ${passed} / ${passed + failed} 通过 ====`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('脚本异常：', error?.message || error)
  process.exitCode = 1
})
