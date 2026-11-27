// 端到端验收：文字节点「发送」时，上游图片地址必须真的带给后端；且后端只报警告不出正文时，节点正文不能被污染。
// 用法：node scripts/verify-canvas-text-upstream-image.mjs
// 依赖：playwright-core + ms-playwright chromium（与其它画布验收脚本一致）
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3244
const WEB_PORT = 5181
const OUT_DIR = path.join(projectDir, '.text-vision-ui-verify')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const failures = []
const captured = { assistant: [], health: 0 }

function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition) })
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail).slice(0, 400)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const TEXT_MODELS = ['deepseek-v4.1-flash', 'agnes-2.5-flash']

// stub：第一轮返回正文，第二轮只报警告（模拟"模型回自述被拦截"），用来验证前端不会把说明写进节点。
let assistantCallCount = 0
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { /* 忽略非 JSON */ }
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    if (req.method === 'GET' && url.startsWith('/api/ai/health')) {
      captured.health += 1
      return send(200, {
        ok: true,
        activeProvider: 'deepseek',
        providers: {
          deepseek: {
            key: 'deepseek', label: 'deepseek-v4.1-flash', configured: true,
            imageModel: '', imageModels: [],
            textModel: TEXT_MODELS[0], textModels: TEXT_MODELS,
            videoModel: '', videoModels: [],
          },
        },
      })
    }
    if (req.method === 'POST' && url === '/api/ai/canvas/assistant') {
      assistantCallCount += 1
      captured.assistant.push(body)
      if (assistantCallCount === 1) {
        return send(200, {
          ok: true,
          reply: '品类：休闲运动跑鞋。外观：白色鞋身、浅灰拼接、网眼鞋面。卖点：透气、轻便。',
          proposals: [{ type: 'set_node_text', targetNodeId: body?.selectedNode?.id || '', summary: '写入生成的文字', payload: { text: '品类：休闲运动跑鞋。外观：白色鞋身、浅灰拼接、网眼鞋面。卖点：透气、轻便。' } }],
          actions: [], warnings: [], vision: { images: 1, dropped: 0 },
        })
      }
      // 第二轮：模型只回了自述，服务端拦截后 proposals 为空
      return send(200, {
        ok: true,
        reply: '',
        proposals: [],
        actions: [],
        warnings: ['模型返回的是操作说明而不是正文，已拦截。请把要求写得更具体后重试。'],
      })
    }
    if (url.startsWith('/api/')) return send(200, { ok: true })
    return send(404, { ok: false })
  })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

{
  const busy = await fetch(`http://127.0.0.1:${WEB_PORT}/`).then(() => true).catch(() => false)
  if (busy) throw new Error(`vite 端口 ${WEB_PORT} 已被占用（可能残留进程），请先关闭后重跑`)
}

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

  // ---------- 静态断言：两处文字写入链路都不能用 reply 兜底 ----------
  {
    const source = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
    check('静态：runGenerator 文字分支只在有正文时写入（无正文则抛错，不写自述）',
      source.includes("if (!produced) {") && source.includes('模型没有返回可用正文'), { ok: true })
    check('静态：requestTextAgent 同样收紧兜底（空内容提示重试而不写入）',
      source.includes('智能体没有返回可用文字，请换个说法再试'), { ok: true })
    check('静态：assistantNodeContext 携带图片地址字段',
      source.includes('image: node?.data?.image || node?.data?.output?.url'), { ok: true })
    check('静态：文字分支把 warnings 透传给用户（不静默）',
      source.includes('if (Array.isArray(result.warnings) && result.warnings.length) ElMessage.warning(result.warnings[0])'), { ok: true })
  }

  const buildSeed = () => {
    const canvas = {
      version: 2,
      nodes: [
        { id: 'upload-1', type: 'upload', position: { x: 20, y: 300 }, data: { title: '鞋子参考图', originalName: '鞋子.png', image: window.__tinyPng, assetId: 'asset-abc' } },
        {
          id: 'text-1', type: 'text', position: { x: 420, y: 300 },
          data: {
            title: '商品信息整理', mode: 'text-generation',
            text: '', prompt: '整理这张图的商品信息：品类、外观、卖点，分三段。',
            status: 'idle', output: {}, config: { model: 'deepseek-v4.1-flash' },
          },
        },
      ],
      edges: [{ id: 'edge-upload-text1', source: 'upload-1', target: 'text-1', type: 'default', interactionWidth: 28 }],
      settings: {},
      edgesVisible: true,
    }
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas))
  }

  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const ignoreConsole = (text, url = '') => /favicon|Devtools|Development mode|\[Vue warn\]/i.test(`${text} ${url}`) === false
  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } })
  await context.addInitScript((png) => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '读图验收', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    window.__tinyPng = png
  }, TINY_PNG)
  await context.addInitScript(buildSeed)

  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text(), m.location()?.url || '')) consoleErrors.push({ text: m.text() }) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="text-1"]', { timeout: 30000 })
  await delay(900)
  const paletteClose = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await paletteClose.count()) await paletteClose.first().click().catch(() => {})
  await delay(300)

  const selectNode = async (nodeId) => {
    await page.evaluate((id) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, nodeId)
    await delay(400)
  }

  const openTextCard = async () => {
    await selectNode('text-1')
    const panel = page.locator('.vue-flow__node[data-id="text-1"] .text-agent-panel')
    if (!(await panel.isVisible().catch(() => false))) {
      await page.locator('.vue-flow__node[data-id="text-1"] .smart-node-actions button').filter({ hasText: /^编辑$/ }).first().click()
    }
    await page.waitForSelector('.vue-flow__node[data-id="text-1"] .text-agent-panel', { timeout: 15000 })
    await delay(300)
  }

  const sendOnce = async () => {
    await page.locator('.vue-flow__node[data-id="text-1"] .text-agent-controls .node-run-button').click()
    const target = captured.assistant.length + 1
    for (let i = 0; i < 60; i += 1) {
      if (captured.assistant.length >= target) break
      await delay(250)
    }
    await delay(500)
  }

  // ---------- 第一轮：正常出正文 ----------
  await openTextCard()
  await sendOnce()
  const sent1 = captured.assistant[0] || {}
  const upstreamUpload = (sent1.upstream || []).find((item) => item.id === 'upload-1') || {}
  check('请求：operation=generate-text 且打到画布助手接口', sent1.operation === 'generate-text', { operation: sent1.operation })
  check('请求：上游图片节点把 image 地址一起提交（不再是只有 assetId）',
    String(upstreamUpload.image || '').startsWith('data:image/') || String(upstreamUpload.image || '').startsWith('/api/'),
    { image: String(upstreamUpload.image || '').slice(0, 80), upstreamUpload })
  check('请求：assetId 仍然保留（两种引用形态都可用）', upstreamUpload.assetId === 'asset-abc', upstreamUpload)
  const body1 = await page.evaluate(() => {
    const node = document.querySelector('.vue-flow__node[data-id="text-1"]')
    return node?.querySelector('.smart-text-editor')?.textContent?.trim() || ''
  })
  check('第一轮：正文含真实商品描述（写回节点，界面可见）', /品类/.test(body1) && /跑鞋/.test(body1), { body1: body1.slice(0, 200) })
  await page.screenshot({ path: path.join(OUT_DIR, '01-after-first-send.png') })

  // ---------- 第二轮：服务端只报警告、无正文 → 节点正文必须保持上一轮内容，不能被"说明文字"覆盖 ----------
  await openTextCard()
  await sendOnce()
  const body2 = await page.evaluate(() => {
    const node = document.querySelector('.vue-flow__node[data-id="text-1"]')
    const toast = Array.from(document.querySelectorAll('.el-message, .el-message__content')).map((el) => el.textContent.trim()).join(' | ')
    return { text: node?.querySelector('.smart-text-editor')?.textContent?.trim() || '', toast }
  })
  check('第二轮：无正文时不覆盖已有内容（自述不会被写进节点）',
    /跑鞋/.test(body2.text) && !/我打算|已拦截|请把要求/.test(body2.text), { body2 })
  check('第二轮：把拦截原因作为提示显示给用户（不静默失败）',
    /拦截|更具体|没有返回/.test(body2.toast), { toast: body2.toast })
  await page.screenshot({ path: path.join(OUT_DIR, '02-after-blocked-send.png') })

  check('运行期：无控制台错误', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })
} catch (error) {
  console.error('EXCEPTION:', error.message)
  check('脚本执行未抛异常', false, { error: error.message })
} finally {
  if (browser) await browser.close().catch(() => {})
  killTree(vite)
  try { stub.close() } catch { /* ignore */ }
  const passed = results.filter((item) => item.pass).length
  console.error(`\n=== ${passed}/${results.length} 通过 ===`)
  if (failures.length) console.error(`失败项：\n${failures.join('\n')}`)
  process.exit(passed === results.length && results.length > 0 ? 0 : 1)
}
