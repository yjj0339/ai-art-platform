// 诊断脚本：节点内「标记」与「@ 引用」是否失效（对照组 vs 分组内成员）
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy node scripts/repro-marking-at-in-group.mjs
//
// 目的：P2 新增的「分组」用了 @pointerdown.capture（onGroupPointerDown）。
//       若成员节点在 DOM 上是组框的子元素，则点组内任何节点都会先触发它，
//       可能导致成员节点选不中 → 节点内联面板打不开 → 「标记」「@」都点不到。
// 做法：同一张画布上放两组「上传图 → 图像生成」：
//       gen-a 一组（不分组，对照）、gen-b（在 group-1 内），分别测 @ 与 标记。
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
const STUB_PORT = 3241
const WEB_PORT = 5179
const OUT_DIR = path.join(projectDir, '.repro-marking-at')
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []

function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition), detail })
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}

// ---------------- stub AI server ----------------
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = (req.url || '').split('?')[0]
    if (url === '/api/ai/image/describe-region') {
      return send(200, { description: '图示物体', candidates: ['图示物体', '物体A'], provider: 'stub', model: 'stub-vision' })
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

let exitCode = 0
try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
  const ignoreConsole = (text, url = '') => !/favicon|Devtools|Development mode|\[Vue warn\]/i.test(`${text} ${url}`)
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })

  await context.addInitScript(({ png }) => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '诊断', role: 'student', avatar: '诊' }, token: 'mock-token-project-new-art-studio' }))
    if (sessionStorage.getItem('repro-seeded') === '1') return
    sessionStorage.setItem('repro-seeded', '1')
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify({
      version: 2,
      nodes: [
        { id: 'up-a', type: 'upload', position: { x: 60, y: 60 }, data: { title: '素材A', image: png, originalName: 'a.png' } },
        {
          id: 'gen-a', type: 'image', position: { x: 60, y: 420 },
          data: { title: '图像生成A', mode: 'image-generation', status: 'idle', error: '', prompt: '参考画一张图', config: { model: '', ratio: '1:1', resolution: '1080P' }, output: { url: png } },
        },
        {
          id: 'group-1', type: 'group', position: { x: 420, y: 60 }, width: 520, height: 360,
          style: { width: '520px', height: '360px' },
          data: { mode: 'group', title: '素材组', width: 520, height: 360 },
        },
        { id: 'up-b', type: 'upload', position: { x: 40, y: 40 }, parentNode: 'group-1', extent: 'parent', data: { title: '素材B', image: png, originalName: 'b.png' } },
        {
          id: 'gen-b', type: 'image', position: { x: 40, y: 210 }, parentNode: 'group-1', extent: 'parent',
          data: { title: '图像生成B', mode: 'image-generation', status: 'idle', error: '', prompt: '参考画一张图', config: { model: '', ratio: '1:1', resolution: '1080P' }, output: { url: png } },
        },
      ],
      edges: [
        { id: 'e-a', source: 'up-a', target: 'gen-a', type: 'default', interactionWidth: 28 },
        { id: 'e-b', source: 'up-b', target: 'gen-b', type: 'default', interactionWidth: 28 },
      ],
      settings: {},
      edgesVisible: true,
    }))
  }, { png: TINY_PNG })

  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text(), m.location()?.url || '')) consoleErrors.push(`${m.text()} @ ${m.location()?.url || ''}`) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="gen-a"]', { timeout: 30000 })
  await delay(900)
  const paletteClose = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await paletteClose.count()) await paletteClose.first().click().catch(() => {})
  await delay(300)

  // ---- 前置：DOM 上成员节点是否嵌在组框内部（决定 capture 事件是否会先打到组）----
  const nesting = await page.evaluate(() => {
    const member = document.querySelector('.vue-flow__node[data-id="gen-b"]')
    const groupWrap = document.querySelector('.vue-flow__node-group[data-id="group-1"]') || document.querySelector('.vue-flow__node[data-id="group-1"]')
    const ancestorGroup = member ? member.closest('.vue-flow__node-group, .vue-flow__node[data-id="group-1"]') : null
    return {
      memberExists: Boolean(member),
      groupExists: Boolean(groupWrap),
      memberInsideGroupDom: Boolean(member && ancestorGroup),
      groupNodeType: document.querySelector('.vue-flow__node[data-id="group-1"]')?.getAttribute('data-type') || '',
    }
  })
  check('前置：分组与成员都已渲染', nesting.memberExists && nesting.groupExists, nesting)
  console.error(`INFO  DOM 嵌套：成员节点是否在组框 DOM 内 = ${nesting.memberInsideGroupDom}`)

  // ---- 打开节点内联面板（沿用标记验收脚本的可用手法）----
  const openComposer = async (nodeId) => {
    const pane = await page.locator('.flow-canvas').boundingBox()
    if (pane) await page.mouse.click(pane.x + pane.width - 60, pane.y + pane.height - 60)
    await delay(250)
    await page.evaluate((id) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, nodeId)
    await delay(600)
    return page.locator(`.vue-flow__node[data-id="${nodeId}"] .image-composer-panel`).count()
  }

  const readNodeData = (nodeId) => page.evaluate((id) => {
    try {
      const raw = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}')
      const node = (raw.nodes || []).find((n) => n.id === id)
      const parts = node?.data?.promptParts || []
      const dom = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      return {
        hasNode: Boolean(node),
        parts: parts.map((p) => p.type),
        refs: parts.filter((p) => p.type === 'reference').length,
        elements: parts.filter((p) => p.type === 'element').length,
        refChipsInDom: dom ? dom.querySelectorAll('[data-reference-id]').length : -1,
        elemChipsInDom: dom ? dom.querySelectorAll('[data-element-id]').length : -1,
      }
    } catch (error) { return { error: String(error) } }
  }, nodeId)

  const probe = async (label, nodeId) => {
    console.error(`\n===== ${label}：${nodeId} =====`)
    const panelOpened = await openComposer(nodeId)
    await page.screenshot({ path: path.join(OUT_DIR, `${label}-1-panel.png`) })

    if (!panelOpened) {
      check(`${label}：点节点能打开内联编辑面板`, false, { panelOpened })
      check(`${label}：面板内「@」按钮可用`, false, { reason: '面板未打开' })
      check(`${label}：面板内「标记」按钮可用`, false, { reason: '面板未打开' })
      return
    }
    check(`${label}：点节点能打开内联编辑面板`, panelOpened > 0, { panelOpened })

    // ---- @ 按钮 ----
    const atBtn = page.locator(`.vue-flow__node[data-id="${nodeId}"] .upstream-thumb-mention`).first()
    const atCount = await atBtn.count()
    if (!atCount) {
      check(`${label}：上游缩略图带「@」按钮`, false, { atCount })
    } else {
      check(`${label}：上游缩略图带「@」按钮`, true, { atCount })
      const before = await readNodeData(nodeId)
      await atBtn.click().catch((e) => console.error('  @ click error:', String(e).slice(0, 200)))
      await delay(1100)
      const after = await readNodeData(nodeId)
      check(`${label}：点「@」后 promptParts 新增 reference 片`,
        after.refs > before.refs, { before: before.refs, after: after.refs, parts: after.parts })
      check(`${label}：点「@」后输入框里出现引用片`,
        after.refChipsInDom > before.refChipsInDom, { before: before.refChipsInDom, after: after.refChipsInDom })
      await page.screenshot({ path: path.join(OUT_DIR, `${label}-2-at.png`) })
    }

    // ---- 标记按钮 ----
    const markBtn = page.locator(`.vue-flow__node[data-id="${nodeId}"] .image-composer-controls button[title="标记"]`)
    const markCount = await markBtn.count()
    if (!markCount) {
      check(`${label}：面板里有「标记」按钮`, false, { markCount })
      return
    }
    check(`${label}：面板里有「标记」按钮`, true, { markCount })

    // 关键诊断：按钮是否被别的东西盖住 / 不可见 / 不可点
    const markState = await page.evaluate((id) => {
      const btn = document.querySelector(`.vue-flow__node[data-id="${id}"] .image-composer-controls button[title="标记"]`)
      if (!btn) return { exists: false }
      const r = btn.getBoundingClientRect()
      const cs = getComputedStyle(btn)
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const top = document.elementFromPoint(cx, cy)
      const chain = []
      let cur = top
      for (let i = 0; i < 4 && cur; i += 1) { chain.push(`${cur.tagName}.${String(cur.className || '').split(' ').slice(0, 2).join('.')}`); cur = cur.parentElement }
      return {
        exists: true,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        display: cs.display, visibility: cs.visibility, opacity: cs.opacity, pointerEvents: cs.pointerEvents,
        coveredBy: top && top !== btn && !btn.contains(top) ? chain.join(' < ') : null,
      }
    }, nodeId)
    console.error(`INFO  「标记」按钮状态：${JSON.stringify(markState)}`)

    await markBtn.click({ timeout: 8000 }).catch(async (e) => {
      console.error('  标记 click error:', e?.message || String(e))
      await markBtn.click({ force: true, timeout: 8000 }).catch((e2) => console.error('  标记 force click error:', e2?.message || String(e2)))
    })
    await delay(700)
    const modeBar = await page.locator('.mark-mode-bar').count()
    check(`${label}：点「标记」后进入元素选择模式（顶部模式条出现）`, modeBar > 0, { modeBar })
    await page.screenshot({ path: path.join(OUT_DIR, `${label}-3-marking.png`) })
    const back = page.locator('.mark-mode-back')
    if (await back.count()) {
      await back.first().click().catch(() => {})
      await delay(400)
    }
  }

  await probe('A-未分组', 'gen-a')
  await probe('B-组内成员', 'gen-b')

  check('运行期：无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 5))
  check('运行期：无 console error', consoleErrors.length === 0, consoleErrors.slice(0, 5))

  await page.screenshot({ path: path.join(OUT_DIR, 'final.png') })
  await browser.close()
} catch (error) {
  console.error('REPRO CRASH:', error?.stack || String(error))
  exitCode = 2
} finally {
  killTree(vite)
  try { stub.close() } catch { /* ignore */ }
}

const failed = results.filter((r) => !r.pass)
console.error(`\n==== 诊断结果：${results.length - failed.length}/${results.length} 通过 ====`)
if (failed.length) {
  console.error('失败项：')
  for (const f of failed) console.error(`  - ${f.name}`)
}
process.exit(failed.length || exitCode ? 1 : 0)
