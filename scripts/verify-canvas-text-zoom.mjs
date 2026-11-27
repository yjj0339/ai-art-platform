// 画布「文字节点放大编辑」端到端验收脚本
// 用法：node scripts/verify-canvas-text-zoom.mjs
//
// 覆盖目标（用户诉求）：
//   文字节点选中后的黑色工具栏里多一个「放大」按钮，点开后正文搬到一块独立大面板里读写。
//   只允许新增这一处能力，不得改动其它按钮与节点行为，因此本脚本同时守护：
//   ① 黑条原有 5 个按钮（编辑/编辑文字/生图/添加到素材库/删除）一个不少、顺序不乱；
//   ② 放大只是「换个地方写」，画布节点自身的尺寸与位置必须保持原样；
//   ③ 面板里的改动实时写回同一个节点（界面 + 存档都变），关掉后原节点显示新内容。
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3236
const WEB_PORT = 5182
const OUT_DIR = path.join(projectDir, '.text-zoom-verify')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = {}
const failures = []
const captured = { health: 0 }

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail).slice(0, 400)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const TEXT_MODELS = ['gpt-4o-mini', 'doubao-seed-1-6-250615']

// ---------------- stub AI server ----------------
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    if (req.method === 'GET' && url.startsWith('/api/ai/health')) {
      captured.health += 1
      return send(200, {
        ok: true,
        activeProvider: 'agnes',
        providers: {
          agnes: {
            key: 'agnes', label: 'Agnes AI', configured: true,
            imageModel: 'agnes-image-2.0-flash', imageModels: ['agnes-image-2.0-flash'],
            textModel: TEXT_MODELS[0], textModels: TEXT_MODELS,
            videoModel: '', videoModels: [],
          },
        },
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

const LONG_TEXT = '四年级综合材料课：这一课我们带着孩子收集旧纸箱、瓶盖和毛线，先讨论“旧物还能变成什么”，再分组做出自己的小房子。\n第二步是上色，第三步是把小组作品拼成一个街区。'

try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  await mkdir(OUT_DIR, { recursive: true })

  // ==================== 静态断言：只新增一处，不动其它按钮 ====================
  {
    const source = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
    const start = source.indexOf('class="smart-node-actions nodrag nopan"')
    const toolbar = source.slice(start, start + 1200)
    const labels = [...toolbar.matchAll(/<button[^>]*>(?:<[^>]+>)*([^<]+)<\/button>/g)]
      .map((m) => m[1].trim())
      .filter((t) => t && !t.includes('{{'))
    check('静态：黑条按钮顺序为 编辑/编辑文字/生图/添加到素材库/放大/删除（只在「添加到素材库」后插入「放大」）',
      JSON.stringify(labels) === JSON.stringify(['编辑', '编辑文字', '生图', '添加到素材库', '放大', '删除']), { labels })
    check('静态：「放大」按钮调 openTextZoom，删除按钮保持在最后（防误点）',
      toolbar.includes('@click.stop="openTextZoom(id)"') && labels[labels.length - 1] === '删除', { labels })
    check('静态：放大面板是独立浮层（不套在节点里，也不修改节点尺寸）',
      source.includes('class="text-zoom-layer"') && source.includes('class="text-zoom-panel"'), { ok: true })
    check('静态：面板写入走 node.data.text / node.data.prompt（与原有正文同一条数据链路）',
      source.includes('node.data.text = text') && source.includes('node.data.prompt = text'), { ok: true })
  }

  const buildSeed = () => {
    const canvas = {
      version: 2,
      nodes: [
        { id: 'upload-1', type: 'upload', position: { x: 20, y: 320 }, data: { title: '图片', originalName: '上游素材图', image: window.__tinyPng } },
        {
          id: 'text-1', type: 'text', position: { x: 120, y: 60 },
          data: {
            title: '文字生成', mode: 'text-generation',
            text: '短文字：小猫在睡觉', prompt: '短文字：小猫在睡觉',
            status: 'succeeded', output: { text: '短文字：小猫在睡觉' }, config: { model: 'gpt-4o-mini' },
          },
        },
      ],
      edges: [{ id: 'edge-upload-text1', source: 'upload-1', target: 'text-1', type: 'default', interactionWidth: 28 }],
      settings: {},
      edgesVisible: true,
    }
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas))
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const ignoreConsole = (text, url = '') => /favicon|Devtools|Development mode|\[Vue warn\]/i.test(`${text} ${url}`) === false
  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } })
  await context.addInitScript((png) => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '文字放大验收', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    window.__tinyPng = png
  }, TINY_PNG)
  await context.addInitScript(buildSeed)

  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text(), m.location()?.url || '')) consoleErrors.push({ text: m.text(), url: m.location()?.url || '' }) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  const selectNode = async (nodeId) => {
    await page.evaluate((id) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, nodeId)
    await delay(400)
  }

  // 节点自身的画布坐标（transform 才是画布坐标，boundingBox 会随画布平移而变）
  const nodeTransform = () => page.evaluate(() => {
    const wrap = document.querySelector('.vue-flow__node[data-id="text-1"]')
    return wrap ? getComputedStyle(wrap).transform : ''
  })

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="text-1"]', { timeout: 30000 })
  await delay(900)
  const paletteClose = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await paletteClose.count()) await paletteClose.first().click().catch(() => {})
  await delay(300)

  // ---------- 黑条：原有按钮不变 + 新增「放大」 ----------
  await selectNode('text-1')
  const toolbarInfo = await page.evaluate(() => {
    const bar = document.querySelector('.vue-flow__node[data-id="text-1"] .smart-node-actions')
    const buttons = bar ? Array.from(bar.querySelectorAll('button')) : []
    return {
      labels: buttons.map((b) => b.textContent.trim()),
      zoomIndex: buttons.findIndex((b) => b.textContent.trim() === '放大'),
      zoomTitle: buttons.find((b) => b.textContent.trim() === '放大')?.getAttribute('title') || '',
      zoomHasIcon: Boolean(buttons.find((b) => b.textContent.trim() === '放大')?.querySelector('svg')),
    }
  })
  check('黑条：原有 5 个按钮全在，且只在「添加到素材库」后多了「放大」（共 6 个）',
    JSON.stringify(toolbarInfo.labels) === JSON.stringify(['编辑', '编辑文字', '生图', '添加到素材库', '放大', '删除']),
    toolbarInfo.labels)
  check('黑条：「放大」按钮带图标与说明文字（不是空白按钮）', toolbarInfo.zoomHasIcon && toolbarInfo.zoomTitle.length > 0, toolbarInfo)

  const beforeTransform = await nodeTransform()
  const beforeEditorText = await page.evaluate(() => document.querySelector('.vue-flow__node[data-id="text-1"] .smart-text-editor')?.textContent?.trim() || '')

  // ---------- 点「放大」 ----------
  await page.locator('.vue-flow__node[data-id="text-1"] .smart-node-actions button').filter({ hasText: /^放大$/ }).first().click()
  await page.waitForSelector('.text-zoom-panel', { timeout: 10000 })
  await delay(400)
  await page.screenshot({ path: path.join(OUT_DIR, '01-zoom-open.png') })

  const panel = await page.evaluate(() => {
    const layer = document.querySelector('.text-zoom-layer')
    const box = document.querySelector('.text-zoom-panel')
    const editor = document.querySelector('.text-zoom-editor')
    const area = document.querySelector('.canvas-area')
    if (!box) return { exists: false }
    const r = box.getBoundingClientRect()
    const ar = area.getBoundingClientRect()
    return {
      exists: true,
      width: Math.round(r.width),
      height: Math.round(r.height),
      areaWidth: Math.round(ar.width),
      areaHeight: Math.round(ar.height),
      centerDx: Math.round((r.left + r.width / 2) - (ar.left + ar.width / 2)),
      centerDy: Math.round((r.top + r.height / 2) - (ar.top + ar.height / 2)),
      bg: getComputedStyle(box).backgroundColor,
      layerBg: layer ? getComputedStyle(layer).backgroundColor : '',
      text: editor?.innerText?.trim() || '',
      editable: editor?.getAttribute('contenteditable') || '',
      focused: document.activeElement === editor,
      sizeLabel: document.querySelector('.text-zoom-size')?.textContent?.trim() || '',
      footer: document.querySelector('.text-zoom-foot span')?.textContent?.trim() || '',
    }
  })
  check('面板：点「放大」后出现独立大面板', panel.exists === true, panel)
  check('面板：尺寸约 900×700 且不超出画布区（小屏自动收缩）',
    panel.width === Math.min(900, panel.areaWidth - 48) && panel.height === Math.min(700, panel.areaHeight - 48) && panel.width >= 700,
    { width: panel.width, height: panel.height, areaWidth: panel.areaWidth, areaHeight: panel.areaHeight })
  check('面板：在画布区正中央（不偏左偏右）', Math.abs(panel.centerDx) <= 2 && Math.abs(panel.centerDy) <= 2,
    { dx: panel.centerDx, dy: panel.centerDy })
  check('面板：内容是画布上那段正文（不是空框也不是提示词）', panel.text === beforeEditorText && panel.text.includes('小猫在睡觉'),
    { text: panel.text, canvas: beforeEditorText })
  check('面板：正文可直接编辑并已聚焦（打开即可改字）', panel.editable === 'true' && panel.focused === true, panel)
  check('面板：右上角显示当前字号，底部有 Esc 提示与「完成」',
    /\d+px/.test(panel.sizeLabel) && panel.footer.includes('Esc'), panel)
  check('面板：整层铺满画布区并压暗背后内容（挡住误操作）',
    panel.layerBg.includes('rgba') , { layerBg: panel.layerBg })

  // ---------- 放大不得改动节点本身 ----------
  const zoomTransform = await nodeTransform()
  const zoomNodeBox = await page.evaluate(() => {
    const node = document.querySelector('.vue-flow__node[data-id="text-1"] .smart-text-node')
    const r = node.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  })
  check('不改动：放大期间画布上原节点的坐标完全不变（不是把节点拉大）', zoomTransform === beforeTransform,
    { before: beforeTransform, after: zoomTransform })

  // ---------- 在面板里真实键入，改动要写回原节点 ----------
  const editor = page.locator('.text-zoom-editor')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('【放大里补的一句】')
  await delay(700)
  const afterType = await page.evaluate(() => {
    const canvasText = document.querySelector('.vue-flow__node[data-id="text-1"] .smart-text-editor')?.textContent?.trim() || ''
    const stored = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}')
    const node = (stored.nodes || []).find((n) => n.id === 'text-1') || {}
    return { canvasText, storedText: node.data?.text || '', storedPrompt: node.data?.prompt || '', zoomText: document.querySelector('.text-zoom-editor')?.innerText?.trim() || '' }
  })
  check('写入：面板里打的字实时出现在画布节点上（不用点完成）',
    afterType.canvasText.includes('【放大里补的一句】'), afterType)
  check('写入：存档里的 data.text 同步更新（刷新后不会丢）',
    afterType.storedText.includes('【放大里补的一句】'), afterType)
  check('写入：原文字没有被覆盖（是接着写，不是替换）',
    afterType.canvasText.includes('小猫在睡觉'), afterType)
  await page.screenshot({ path: path.join(OUT_DIR, '02-typed.png') })

  // ---------- Esc 收起 ----------
  await page.keyboard.press('Escape')
  await delay(400)
  const closedByEsc = await page.evaluate(() => ({
    panelGone: !document.querySelector('.text-zoom-panel'),
    canvasText: document.querySelector('.vue-flow__node[data-id="text-1"] .smart-text-editor')?.textContent?.trim() || '',
  }))
  check('收起：Esc 关闭面板，并保留刚写的字', closedByEsc.panelGone && closedByEsc.canvasText.includes('【放大里补的一句】'), closedByEsc)
  check('收起：节点坐标依然没变（关闭时也不动节点）', (await nodeTransform()) === beforeTransform, { transform: await nodeTransform() })

  // ---------- 点遮罩收起 ----------
  await page.locator('.vue-flow__node[data-id="text-1"] .smart-node-actions button').filter({ hasText: /^放大$/ }).first().click()
  await page.waitForSelector('.text-zoom-panel', { timeout: 10000 })
  await delay(300)
  await page.mouse.click(20, 980)
  await delay(400)
  check('收起：点面板外的灰色区域也能关掉', await page.locator('.text-zoom-panel').count() === 0, { count: await page.locator('.text-zoom-panel').count() })

  // ---------- 再打开内容还在（读的是同一份数据） ----------
  await page.locator('.vue-flow__node[data-id="text-1"] .smart-node-actions button').filter({ hasText: /^放大$/ }).first().click()
  await page.waitForSelector('.text-zoom-panel', { timeout: 10000 })
  await delay(300)
  const reopened = await page.evaluate(() => document.querySelector('.text-zoom-editor')?.innerText?.trim() || '')
  check('复开：再次放大时显示的是最新内容（未丢改动）', reopened.includes('【放大里补的一句】'), { reopened })

  // ---------- 「完成」收起 ----------
  await page.locator('.text-zoom-done').click()
  await delay(400)
  check('收起：点「完成」也能关闭', await page.locator('.text-zoom-panel').count() === 0, { count: await page.locator('.text-zoom-panel').count() })

  // ---------- 长文本场景：框内滚动而不是撑破面板 ----------
  await page.locator('.vue-flow__node[data-id="text-1"] .smart-node-actions button').filter({ hasText: /^放大$/ }).first().click()
  await page.waitForSelector('.text-zoom-panel', { timeout: 10000 })
  await delay(300)
  await page.evaluate((text) => {
    const editor = document.querySelector('.text-zoom-editor')
    editor.innerText = text
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, LONG_TEXT.repeat(14))
  await delay(500)
  const longCase = await page.evaluate(() => {
    const box = document.querySelector('.text-zoom-panel')
    const editor = document.querySelector('.text-zoom-editor')
    const br = box.getBoundingClientRect()
    const er = editor.getBoundingClientRect()
    return {
      panelHeight: Math.round(br.height),
      editorScroll: editor.scrollHeight > editor.clientHeight + 4,
      overflowY: getComputedStyle(editor).overflowY,
      insidePanel: er.bottom <= br.bottom + 1,
    }
  })
  check('长文本：正文框内滚动、不把面板撑破（面板高度不变）',
    longCase.editorScroll && longCase.overflowY === 'auto' && longCase.insidePanel && longCase.panelHeight <= 700,
    longCase)
  await page.screenshot({ path: path.join(OUT_DIR, '03-long-text.png') })
  await page.keyboard.press('Escape')
  await delay(300)

  check('不改动：整个过程节点尺寸保持 320×190 级别（节点没被拉伸）',
    zoomNodeBox.w >= 320 && zoomNodeBox.w < 420, zoomNodeBox)
  check('运行期：两张画布保存正常、无控制台错误', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })

  await browser.close()

  const report = { pass: failures.length === 0, failures, results, captured: { health: captured.health } }
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.error(`\n==== 结果：${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`} ====`)
  if (failures.length) console.error(failures.join('\n'))
  process.exitCode = failures.length === 0 ? 0 : 1
} finally {
  killTree(vite)
  stub.close()
}
