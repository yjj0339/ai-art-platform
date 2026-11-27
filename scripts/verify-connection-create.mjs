// 验收脚本：拖线 → 松手弹创建卡片 → 选类型创建新节点，连线必须保留
// 用法：node scripts/verify-connection-create.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3215
const WEB_PORT = 5176
const OUT_DIR = path.join(projectDir, '.connection-verify')
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const results = {}
const failures = []
function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}

// ---------------- stub AI server ----------------
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    if (req.method === 'POST' && url === '/api/ai/image/generate') {
      return send(200, { provider: 'stub', taskId: 'task-stub', images: [{ imageUrl: TINY_PNG, title: 'stub', provider: 'stub', model: 'stub-image' }] })
    }
    if (req.method === 'GET' && url.startsWith('/api/ai/health')) {
      return send(200, { ok: true, providers: { stub: { configured: true, label: 'Stub', imageModels: ['agnes-image-2.1-flash'], videoModels: ['agnes-video-v2.0'], textModels: ['创作 Agent'] } } })
    }
    if (url.startsWith('/api/')) return send(200, { ok: true })
    return send(404, { ok: false })
  })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

const busy = await fetch(`http://127.0.0.1:${WEB_PORT}/`).then(() => true).catch(() => false)
if (busy) { console.error(`vite 端口 ${WEB_PORT} 被占用，请先关闭`); process.exit(1) }

const vite = spawn(path.join(projectDir, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
  cwd: projectDir,
  shell: true,
  env: { ...process.env, VITE_AUTH_MODE: 'mock', VITE_AI_MODE: 'api', VITE_API_BASE_URL: '/api', VITE_SERVER_PORT: String(STUB_PORT) },
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
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }
  await mkdir(OUT_DIR, { recursive: true })
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const consoleErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))

  // mock 免登录会话
  await page.addInitScript(() => {
    // mock 模式 isLoggedIn 需要 user + token（见 userStore.js:15）
    localStorage.setItem('art-studio-user', JSON.stringify({
      user: { id: 'stu-1', name: '小画家阿橙', role: 'student', className: '向日葵班' },
      token: 'mock-token',
    }))
  })

  // 画布不再自带示例节点，本脚本自己注入一个带 source handle 的上游图片节点。
  // 用 sessionStorage 标记位限成「只在首次」注入，避免刷新时覆盖被测行为。
  await page.addInitScript(() => {
    if (sessionStorage.getItem('connection-create-seeded') === '1') return
    sessionStorage.setItem('connection-create-seeded', '1')
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify({
      version: 2,
      nodes: [{
        id: 'upload-1',
        type: 'upload',
        position: { x: 240, y: 300 },
        data: {
          title: '图片',
          originalName: '上游素材图',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        },
      }],
      edges: [],
      settings: {},
      edgesVisible: true,
    }))
  })

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'networkidle' })
  await delay(1500)

  // 关掉连接引导，避免遮挡
  const guideBtn = page.locator('.connection-guide button')
  if (await guideBtn.count()) { await guideBtn.first().click().catch(() => {}) }
  await delay(300)

  // 找到第一个含 source handle 的节点，记录其 id 与 handle 位置
  const info = await page.evaluate(() => {
    const nodeEl = document.querySelector('.vue-flow__node')
    if (!nodeEl) return { error: 'no node' }
    const id = nodeEl.getAttribute('data-id')
    const handle = nodeEl.querySelector('.vue-flow__handle.source')
    if (!handle) return { error: 'no source handle', id }
    const r = handle.getBoundingClientRect()
    return { id, x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  check('前置：画布存在节点且带 source handle', !info.error, info)
  if (info.error) throw new Error('前置失败：' + JSON.stringify(info))

  const edgesBefore = await page.locator('.vue-flow__edge').count()
  // 拖线前先记下画布上已有的节点 id，后面靠差集找出新建的那个
  const nodeIdsBeforeCreate = await page.evaluate(() =>
    [...document.querySelectorAll('.vue-flow__node')].map((el) => el.getAttribute('data-id')))

  // 拖拽：从 source handle 拖到画布空白处（右下方向）
  const canvas = await page.locator('.vue-flow__pane').boundingBox()
  const dropX = Math.min(canvas.x + canvas.width - 120, info.x + 320)
  const dropY = Math.min(canvas.y + canvas.height - 120, info.y + 180)
  await page.mouse.move(info.x, info.y)
  await page.mouse.down()
  await page.mouse.move(info.x + 60, info.y + 30, { steps: 6 })
  await page.mouse.move(dropX, dropY, { steps: 10 })
  await page.mouse.up()
  await delay(500)

  // 创建卡片应出现
  const menu = page.locator('.connection-create-menu')
  check('拖线松手后弹出创建节点卡片', await menu.count() > 0 && await menu.first().isVisible(), { count: await menu.count() })

  // 点"图像生成"创建节点
  const imgBtn = menu.locator('button', { hasText: '图像生成' })
  const btnCount = await imgBtn.count()
  check('创建卡片含"图像生成"选项', btnCount > 0, { btnCount })
  if (btnCount) { await imgBtn.first().click() }
  await delay(900)

  // 读取所有边的 aria-label（"Edge from X to Y"）与画布节点 id
  const readEdges = () => page.evaluate(() => {
    const labels = [...document.querySelectorAll('.vue-flow__edge')]
      .map((el) => el.getAttribute('aria-label') || '')
      .filter(Boolean)
    const nodeIds = [...document.querySelectorAll('.vue-flow__node')].map((el) => el.getAttribute('data-id'))
    return { labels, nodeIds }
  })

  const after = await readEdges()
  check('创建节点后边数量增加（连线保留）', after.labels.length > edgesBefore, { edgesBefore, edgesAfter: after.labels.length })

  // 新节点 id = 画布上不在初始节点集合里的那个
  // （画布不再自带示例节点，初始集合改为「注入前实际读到的节点」，不再硬编码 upload-1/prompt-1/video-1）
  const initialNodeIds = nodeIdsBeforeCreate
  const newNodeId = after.nodeIds.find((id) => !initialNodeIds.includes(id))
  check('画布新增了一个节点', Boolean(newNodeId), { nodeIds: after.nodeIds, newNodeId })

  // 关键断言：存在一条 edge "from 原节点 to 新节点"
  const edgeFromSource = newNodeId ? after.labels.some((l) => l === `Edge from ${info.id} to ${newNodeId}`) : false
  check('存在"原节点 → 新节点"的连线', edgeFromSource, { sourceId: info.id, newNodeId, labels: after.labels })

  // 稳定性：等 1.5s 后该边不应消失（排除"创建瞬间闪现又被丢弃"）
  await delay(1500)
  const stable = await readEdges()
  const edgeStillThere = newNodeId ? stable.labels.some((l) => l === `Edge from ${info.id} to ${newNodeId}`) : false
  check('1.5s 后连线仍然存在（不闪断）', edgeStillThere, { sourceId: info.id, newNodeId, labels: stable.labels })

  const realErrors = consoleErrors.filter((t) => !/favicon|Devtools|Development mode|\[Vue warn\]|status of 404|Failed to load resource/i.test(t))
  check('无 console 报错（忽略 favicon/404 资源）', realErrors.length === 0, realErrors.slice(0, 5))

  await page.screenshot({ path: path.join(OUT_DIR, 'after-create.png') }).catch(() => {})
} catch (error) {
  check('脚本执行未抛异常', false, String(error?.stack || error).slice(0, 800))
} finally {
  try { if (browser) await browser.close() } catch { /* ignore */ }
  killTree(vite)
  try { stub.close() } catch { /* ignore */ }
}

console.log('\n===== 汇总 =====')
const passed = Object.values(results).filter((r) => r.pass).length
console.log(`通过 ${passed}/${Object.keys(results).length}`)
if (failures.length) { console.log('失败项：'); failures.forEach((f) => console.log(' - ' + f)) }
process.exit(failures.length ? 1 : 0)
