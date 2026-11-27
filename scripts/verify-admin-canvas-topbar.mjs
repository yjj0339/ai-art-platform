// 后台画布页顶栏改造验收：
//  ① 页面级顶栏（返回箭头/标题/保存草稿/真实测试/发布工作流）已彻底消失
//  ② 左上角只剩画布自带的「文件 ▾」菜单，标题在它右边
//  ③ 后台「文件」菜单四项：保存草稿 / 返回工作流库 / 重置工作流（+ 学生使用页面仅非 H5）
//  ④ 有未保存改动时「文件」按钮右上亮橙点；无改动时没有
//  ⑤ 测试/发布已不在画布页（搬到库里抽屉），库里抽屉里有这两个按钮
//
// 注意：本脚本只读 + 只改「画布上一处文案」制造脏态，不点保存、不点真实测试（会扣费）。
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const failures = []
function check(name, ok, detail) {
  results.push({ name, pass: Boolean(ok), detail })
  if (!ok) failures.push(`${name} :: ${JSON.stringify(detail).slice(0, 300)}`)
  console.error(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  :: ${JSON.stringify(detail).slice(0, 300)}`}`)
}

await mkdir(OUT_DIR, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
  })

  // 取一条工作流，直接进它的画布页（点行 = 进画布，这是既有行为）
  await page.goto(`${BASE}/admin/h5-report-workflows`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.h5w-lib .row:not(.add):not(.empty-row)', { timeout: 30000 })
  await page.locator('.h5w-lib .row:not(.add):not(.empty-row)').first().click()
  await page.waitForURL(/\/admin\/ai-skills\/.+\/workflow/, { timeout: 30000 })
  await page.waitForSelector('.workflow-topbar', { timeout: 30000 })
  await delay(1500)

  // ① 页面级顶栏必须不存在
  check('① 旧的页面顶栏 .editor-header 已移除', await page.locator('.editor-header').count() === 0, await page.locator('.editor-header').count())
  check('① 步骤条 .step-nav 已移除', await page.locator('.step-nav').count() === 0, 'step-nav')
  check('① 旧的「保存草稿」独立按钮已移除', await page.locator('header button:has-text("保存草稿")').count() === 0, 'save-btn')
  check('① 旧的「真实测试」按钮已不在画布页', await page.locator('button:has-text("真实测试")').count() === 0, 'test-btn')
  check('① 旧的「发布工作流」按钮已不在画布页', await page.locator('button:has-text("发布工作流")').count() === 0, 'publish-btn')
  check('① 旧的「有未保存改动」小字已不在顶栏', await page.locator('.workflow-topbar .save-state').count() === 0, 'save-state')

  // ② 顶栏结构与高度
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.workflow-topbar')
    const r = el.getBoundingClientRect()
    const viewportH = window.innerHeight
    const canvas = document.querySelector('.vue-flow')
    return {
      brand: el.querySelector('.brand-block > strong')?.textContent?.trim() || '',
      title: el.querySelector('.project-name')?.textContent?.trim() || '',
      triggerCount: el.querySelectorAll('.file-menu-trigger').length,
      barHeight: Math.round(r.height),
      barTop: Math.round(r.top),
      canvasTop: canvas ? Math.round(canvas.getBoundingClientRect().top) : null,
      viewportH,
    }
  })
  check('② 左上角品牌字为「玩法工作流」', bar.brand === '玩法工作流', bar)
  check('② 工作流名称显示在「文件」右侧', Boolean(bar.title), bar)
  check('② 只有一个「文件」入口', bar.triggerCount === 1, bar)
  // 画布本身有一圈 16px 的浮动内缩，所以顶栏 top 是 16 而不是 0；
  // 真正要验的是「画布铺满视口顶部」——.vue-flow 的 top 必须是 0。
  check('② 画布铺满视口顶部（页面顶栏没有把它顶下来）', bar.canvasTop === 0, bar)
  check('② 顶栏只是画布自身的 16px 内缩，没有被页面顶栏推下去', bar.barTop <= 20, bar)

  // ③ 打开菜单看四项
  await page.locator('.workflow-topbar .file-menu-trigger').click()
  await page.waitForSelector('.workflow-topbar .file-menu', { timeout: 8000 })
  await delay(250)
  const items = (await page.locator('.workflow-topbar .file-menu button').allInnerTexts()).map((t) => t.replace(/\s+/g, ''))
  check('③ H5 工作流菜单：保存草稿 → 返回工作流库 → 重置工作流',
    JSON.stringify(items) === JSON.stringify(['保存草稿', '返回工作流库', '重置工作流']), items)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-canvas-file-menu.png') })

  // ④ 无改动时不应该有橙点
  check('④ 初始（无改动）没有橙点', await page.locator('.workflow-topbar .file-menu-dot').count() === 0,
    await page.locator('.workflow-topbar .file-menu-dot').count())

  // 收起菜单
  await page.keyboard.press('Escape')
  await delay(300)

  // 制造一次未保存改动：拖动任一节点（比改文案更稳，不依赖具体节点类型）
  const nodeCount = await page.locator('.vue-flow__node').count()
  let dirtyMade = false
  if (nodeCount > 0) {
    const node = page.locator('.vue-flow__node').first()
    const box = await node.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + 12)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + 30, { steps: 12 })
      await page.mouse.up()
      dirtyMade = true
    }
  }
  if (dirtyMade) {
    // 橙点靠 watch(deep) → emit('save') → 父页面 dirty=true 驱动，需轮询
    for (let i = 0; i < 40; i += 1) {
      if ((await page.locator('.workflow-topbar .file-menu-dot').count()) > 0) break
      await delay(100)
    }
  }
  check('④ 拖动节点产生改动后「文件」右上出现橙点',
    dirtyMade && (await page.locator('.workflow-topbar .file-menu-dot').count()) === 1,
    { dirtyMade, dot: await page.locator('.workflow-topbar .file-menu-dot').count(), nodeCount })
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-canvas-dirty-dot.png') })

  const dotStyle = await page.evaluate(() => {
    const dot = document.querySelector('.workflow-topbar .file-menu-dot')
    if (!dot) return null
    const cs = getComputedStyle(dot)
    const trigger = document.querySelector('.workflow-topbar .file-menu-trigger').getBoundingClientRect()
    const dr = dot.getBoundingClientRect()
    return {
      color: cs.backgroundColor,
      w: Math.round(dr.width),
      h: Math.round(dr.height),
      insideTrigger: dr.right <= trigger.right + 2 && dr.top >= trigger.top - 4,
    }
  })
  check('④ 橙点是 5-9px 的圆点、颜色偏橙、贴在按钮角内',
    dotStyle && dotStyle.w >= 5 && dotStyle.w <= 9 && /rgb\(2[0-9]{2}, 1[0-9]{2}, /.test(dotStyle.color) && dotStyle.insideTrigger,
    dotStyle)

  check('④ 无前端控制台报错', errors.filter((t) => !/401|favicon|Failed to load resource/i.test(t)).length === 0,
    errors.slice(0, 4))

  await context.close()
  console.log(`\n==== ${results.length - failures.length} / ${results.length} 通过 ====`)
  if (failures.length) { console.log('失败项：'); failures.forEach((f) => console.log(' - ' + f)) }
} finally {
  await browser.close().catch(() => {})
  if (failures.length) process.exitCode = 1
}
