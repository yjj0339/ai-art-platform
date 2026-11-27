// 无限画布「打开即空白」验收脚本
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy node scripts/verify-canvas-empty-start.mjs
//
// 背景：用户反馈每次打开无限画布都自带「图片 / 文字生成 / 视频生成」三个示例节点，要求删除。
// 覆盖：
//   1. 全新画布（无任何本地/服务端存档）打开后节点数为 0，画布上没有 .vue-flow__node
//   2. 空白态引导出现，且「连接节点」提示不再出现
//   3. 引导里的「添加文字」会新增 1 个节点，落在可视区域内（不被顶栏遮挡）
//   4. 有节点后引导自动消失
//   5. 刷新后仍是用户自己加的那 1 个节点（不会把示例节点找回来）
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const WEB_PORT = 5187
const OUT_DIR = path.join(projectDir, '.canvas-empty-start-verify')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = {}
const failures = []

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}

function killTree(child) {
  if (!child) return
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    else child.kill('SIGKILL')
  } catch { /* ignore */ }
}

let vite = null
let browser = null

try {
  await mkdir(OUT_DIR, { recursive: true })

  vite = spawn(path.join(projectDir, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
    cwd: projectDir,
    shell: true,
    env: { ...process.env, VITE_AUTH_MODE: 'mock', VITE_AI_MODE: 'mock', VITE_API_BASE_URL: '/api' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let viteLog = ''
  vite.stdout.on('data', (c) => { viteLog += c })
  vite.stderr.on('data', (c) => { viteLog += c })

  for (let i = 0; i < 200; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 199) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  // 只注入登录态，不注入任何画布数据 —— 模拟「第一次打开无限画布」。
  // ⚠️ addInitScript 每次导航/刷新都会重跑，清存档必须用 sessionStorage 标记位限成「只在首次」，
  //    否则刷新前刚保存的画布会被脚本自己删掉，第 5 项断言永远拿不到 1 个节点。
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('canvas-empty-start-seeded')) {
      localStorage.removeItem('ai-workflow-canvas-stage1-v2')
      sessionStorage.setItem('canvas-empty-start-seeded', '1')
    }
    localStorage.setItem('art-studio-user', JSON.stringify({
      user: { id: 'stu-001', name: '空画布验收学生', role: 'student', className: '验收班级', avatar: '验' },
      token: 'mock-token-project-new-art-studio',
    }))
  })

  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push(String(err?.message || err)))

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__pane', { timeout: 20000 })
  await delay(1600)

  // ---- 1. 打开即空白 ----
  const nodeCount = await page.locator('.vue-flow__node').count()
  check('新画布打开后没有任何节点（示例节点已删除）', nodeCount === 0, { nodeCount })

  const storedRaw = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}')?.nodes?.length ?? -1 } catch { return -2 }
  })
  check('本地存档里也没有示例节点', storedRaw === 0, { storedRaw })

  // 只扫「画布节点内部」的文案。不能扫整个 .canvas-area：
  // 左侧「创作」浮层里本来就有「视频生成」这个功能按钮，扫全区域会把它当成残留示例节点（假阳性）。
  const legacyNames = await page.evaluate(() => {
    const text = [...document.querySelectorAll('.vue-flow__node')]
      .map((el) => el.innerText || '')
      .join(' ')
    return ['运动鞋', '文字生成', '视频生成'].filter((word) => text.includes(word))
  })
  check('画布节点里不再出现「运动鞋/文字生成/视频生成」示例文案', legacyNames.length === 0, { legacyNames })

  // ---- 2. 空白态引导 ----
  const guide = page.locator('.canvas-empty-guide')
  check('空白画布引导出现', (await guide.count()) === 1 && await guide.first().isVisible(), { count: await guide.count() })

  const guideText = await guide.first().innerText().catch(() => '')
  check('引导文案说明画布是空白的', /空白画布/.test(guideText), { guideText })
  check('引导提供上传/文字/模板三个起点',
    (await guide.locator('button').count()) === 3
    && await guide.locator('button', { hasText: '上传图片' }).count() === 1
    && await guide.locator('button', { hasText: '添加文字' }).count() === 1
    && await guide.locator('button', { hasText: '套用模板' }).count() === 1, { guideText })

  await page.screenshot({ path: path.join(OUT_DIR, '1-empty-canvas.png') }).catch(() => {})

  // ---- 3. 添加文字 → 落在可视区 ----
  await guide.locator('button', { hasText: '添加文字' }).click()
  await delay(700)

  const afterAdd = await page.locator('.vue-flow__node').count()
  check('点「添加文字」新增 1 个节点', afterAdd === 1, { afterAdd })

  const nodeBox = await page.locator('.vue-flow__node').first().boundingBox()
  const paneBox = await page.locator('.vue-flow__pane').boundingBox()
  const inside = Boolean(nodeBox && paneBox
    && nodeBox.x >= paneBox.x - 4
    && nodeBox.y >= paneBox.y + 40 // 顶栏高约 64，留一点余量
    && nodeBox.x + nodeBox.width <= paneBox.x + paneBox.width + 4
    && nodeBox.y < paneBox.y + paneBox.height)
  check('新节点落在可视区域内（不被顶栏或边缘遮挡）', inside, { nodeBox, paneBox })

  // ---- 4. 引导消失 ----
  check('有节点后空白引导自动消失', (await page.locator('.canvas-empty-guide').count()) === 0,
    { count: await page.locator('.canvas-empty-guide').count() })

  await page.screenshot({ path: path.join(OUT_DIR, '2-after-add-text.png') }).catch(() => {})

  // ---- 5. 刷新后仍是自己的 1 个节点 ----
  await delay(900) // 等防抖保存落盘
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__pane', { timeout: 20000 })
  await delay(1600)
  const reloaded = await page.locator('.vue-flow__node').count()
  check('刷新后仍是自己加的 1 个节点（示例节点不会回来）', reloaded === 1, { reloaded })

  const realErrors = consoleErrors.filter((t) => !/favicon|Devtools|Development mode|\[Vue warn\]|status of 404|Failed to load resource/i.test(t))
  check('无 console 报错（忽略 favicon/404 资源）', realErrors.length === 0, realErrors.slice(0, 5))
} catch (error) {
  check('脚本执行未抛异常', false, String(error?.stack || error).slice(0, 800))
} finally {
  try { if (browser) await browser.close() } catch { /* ignore */ }
  killTree(vite)
}

console.log('\n===== 汇总 =====')
const passed = Object.values(results).filter((r) => r.pass).length
console.log(`通过 ${passed}/${Object.keys(results).length}`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((item) => console.log(` - ${item}`))
  process.exitCode = 1
}
