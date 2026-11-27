// 验收：无限画布顶栏已移除「撤销 / 重做」按钮与图标，且相邻控件仍正常
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy node scripts/verify-canvas-topbar-no-undo.mjs
//
// 自带 vite（AUTH_MODE=mock），不依赖本地是否已起 5173/3000。
// 覆盖：顶栏无 history-action 按钮 → 无「撤销/重做」文案与 aria → 相邻全屏/菜单按钮仍在
//       → 画布菜单可打开 → Ctrl+Z 不抛异常（历史栈未破坏）→ 顶栏高度未塌陷 → 无控制台报错
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const WEB_PORT = Number(process.env.VERIFY_WEB_PORT || 5178)
const WEB = `http://127.0.0.1:${WEB_PORT}`

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const failures = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures.push(`${name} :: ${JSON.stringify(detail)}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ::  ${JSON.stringify(detail).slice(0, 400)}`}`)
}

// ---------------- 静态断言（源码级，最稳） ----------------
{
  const source = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
  const topbarBlock = source.slice(source.indexOf('<header class="workflow-topbar">'), source.indexOf('</header>'))
  check('源码：顶栏模板内无 history-action 按钮', !topbarBlock.includes('history-action'), topbarBlock.slice(0, 200))
  check('源码：顶栏模板内无撤销/重做文案', !/撤销|重做/.test(topbarBlock), topbarBlock.slice(0, 200))
  check('源码：不再引入 RefreshLeft/RefreshRight 图标', !/RefreshLeft|RefreshRight/.test(source), 'icons')
  check('源码：无 history-action 样式残留', !source.includes('history-action'), 'css')
}

// ---------------- 启动独立 vite（mock 鉴权） ----------------
{
  const busy = await fetch(`${WEB}/`).then(() => true).catch(() => false)
  if (busy) throw new Error(`vite 端口 ${WEB_PORT} 已被占用（可能残留进程），请换 VERIFY_WEB_PORT 或先关闭`)
}

const vite = spawn(path.join(projectDir, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
  cwd: projectDir,
  shell: true,
  env: { ...process.env, VITE_AUTH_MODE: 'mock', VITE_AI_MODE: 'api', VITE_API_BASE_URL: '/api' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let viteLog = ''
vite.stdout.on('data', (c) => { viteLog += c })
vite.stderr.on('data', (c) => { viteLog += c })
function killTree(child) {
  if (!child || child.killed) return
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGKILL')
  } catch { /* ignore */ }
}

let browser
try {
  for (let i = 0; i < 200; i += 1) {
    try { const r = await fetch(`${WEB}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 199) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({
      user: { id: 'stu-001', name: '顶栏验收学生', role: 'student', className: '验收班级', avatar: '验' },
      token: 'mock-token-project-new-art-studio',
    }))
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify({
      nodes: [
        { id: 'text-verify', type: 'text', position: { x: 120, y: 120 }, data: { title: '文案', mode: 'text', text: '顶栏验收文案', prompt: '顶栏验收文案', promptParts: [{ type: 'text', text: '顶栏验收文案' }] } },
      ],
      edges: [],
      settings: {},
    }))
  })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  await page.goto(`${WEB}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.workflow-topbar', { timeout: 30000 })
  await page.waitForTimeout(1200)

  // 用户看的是右下角（floating 模式）——真实顶栏
  check('顶栏无 history-action 按钮', (await page.locator('.workflow-topbar .history-action').count()) === 0, await page.locator('.workflow-topbar .topbar-actions').innerText())

  const topbarText = (await page.locator('.workflow-topbar').innerText()).replace(/\s+/g, '')
  check('顶栏文案不含撤销', !topbarText.includes('撤销'), topbarText)
  check('顶栏文案不含重做', !topbarText.includes('重做'), topbarText)
  check('无撤销 aria-label', (await page.locator('.workflow-topbar [aria-label="撤销"]').count()) === 0, 'aria 撤销')
  check('无重做 aria-label', (await page.locator('.workflow-topbar [aria-label="重做"]').count()) === 0, 'aria 重做')

  // 相邻控件仍在
  check('全屏按钮仍在', (await page.locator('.workflow-topbar [aria-label="全屏"]').count()) === 1, '全屏')
  // 2026-10-31：学生画布的三项画布操作已并入左上角「文件」下拉，右上角三个点不再出现在学生画布。
  check('右上角「•••」画布菜单已移出学生画布', (await page.locator('.workflow-topbar [aria-label="画布菜单"]').count()) === 0, '画布菜单')
  check('左上角「文件」下拉入口存在', (await page.locator('.workflow-topbar .file-menu-trigger').count()) === 1, '文件')

  // 「文件」下拉能打开（确认迁移后布局与事件未受影响）
  await page.locator('.workflow-topbar .file-menu-trigger').click()
  await page.waitForTimeout(400)
  const menuItems = await page.locator('.workflow-topbar .file-menu button').allInnerTexts()
  check('「文件」下拉可打开', menuItems.length >= 1, menuItems)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 历史栈未破坏：Ctrl+Z / Ctrl+Y 不抛异常
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(300)
  check('Ctrl+Z / Ctrl+Y 不抛异常', !consoleErrors.some((t) => /undo|redo/i.test(t)), consoleErrors.slice(0, 3))

  // 顶栏高度未塌陷 + 右侧动作区仍贴右
  const metrics = await page.locator('.workflow-topbar').evaluate((el) => {
    const actions = el.querySelector('.topbar-actions')
    const r = el.getBoundingClientRect()
    const a = actions ? actions.getBoundingClientRect() : null
    return { height: r.height, rightGap: a ? Math.round(r.right - a.right) : null, actionWidth: a ? Math.round(a.width) : null }
  })
  check('顶栏高度正常(>50px)', metrics.height > 50, metrics.height)
  check('动作区仍靠右（右侧留白 < 40px）', metrics.rightGap !== null && metrics.rightGap < 40, metrics)

  // 无控制台报错（忽略与本改动无关的资源噪音）
  const realErrors = consoleErrors.filter((t) => !/favicon|404|Failed to load resource|401|Unauthorized|ECONNREFUSED|Failed to fetch/i.test(t))
  check('无前端控制台报错', realErrors.length === 0, realErrors.slice(0, 4))

  await page.screenshot({ path: '.verify-topbar-no-undo.png' })
  await context.close()
} finally {
  if (browser) await browser.close().catch(() => {})
  killTree(vite)
}

console.log(`\n==== ${results.length - failures.length} / ${results.length} 通过 ====`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((f) => console.log(' - ' + f))
  process.exit(1)
}
