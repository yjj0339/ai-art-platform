// 画布「元素选择模式（画布级标记，无卡片）」端到端验收脚本
// 用法：node scripts/verify-canvas-marking-mode.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
//
// 覆盖：点标记 → 顶部模式条（无卡片）→ 拖拽平移画布 → 点任意一张图标记 → chip 与徽标
//       → 识别回填 → 下拉选择 → 多标记/上限 → 返回节点退出 → 刷新持久化 → 老画布兼容
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
const STUB_PORT = 3213
const WEB_PORT = 5174
const OUT_DIR = path.join(projectDir, '.marking-verify-mode')
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const captured = { describe: [], generate: [] }
const results = {}
const failures = []
let describeDelayMs = 1400
let describeFailNext = 0
const CANDIDATES = ['画布源图里的绿苹果', '绿色水果', '苹果上的水珠']

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 460)}`}`)
}

// ---------------- stub AI server ----------------
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { /* 忽略非 JSON */ }
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    if (req.method === 'POST' && url === '/__control') {
      if (typeof body.describeDelayMs === 'number') describeDelayMs = body.describeDelayMs
      if (typeof body.describeFailNext === 'number') describeFailNext = body.describeFailNext
      return send(200, { ok: true, describeDelayMs })
    }
    if (req.method === 'POST' && url === '/api/ai/image/describe-region') {
      captured.describe.push({ imageLength: String(body.image || '').length, at: Date.now() })
      const shouldFail = describeFailNext > 0
      if (shouldFail) describeFailNext -= 1
      return setTimeout(() => {
        if (shouldFail) return send(503, { message: '未配置可用的文本大模型（API Key 或文本模型），无法进行区域识别' })
        return send(200, { description: CANDIDATES[0], candidates: CANDIDATES, provider: 'stub', model: 'stub-vision' })
      }, describeDelayMs)
    }
    if (req.method === 'POST' && url === '/api/ai/image/generate') {
      captured.generate.push(body)
      return send(200, { provider: 'stub', taskId: 'task-stub', images: [{ imageUrl: TINY_PNG, title: 'stub', provider: 'stub', model: 'stub-image' }] })
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

// pnpm 结构下 node node_modules/vite/bin/vite.js 可能是空壳，用 .bin/vite。
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

try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const ignoreConsole = (text) => /favicon|Devtools|Development mode|\[Vue warn\]/i.test(text) === false

  // ==================== 静态回归：源码断言 ====================
  {
    const source = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
    check('改造：已移除模态卡片（无 mark-layer / mark-panel）', !source.includes('class="mark-layer"') && !source.includes('class="mark-panel"'), { ok: true })
    check('改造：新增画布级模式条（元素选择模式 / 点击图片选择局部元素 / 返回节点）',
      source.includes('class="mark-mode-bar"') && source.includes('元素选择模式') && source.includes('点击图片选择局部元素') && source.includes('返回节点'), { ok: true })
    check('改造：标记态保留画布平移（pan-on-drag 不再随 markingActive 关闭）',
      source.includes(':pan-on-drag="marqueeMode ? [1] : true"') && !source.includes('markingActive ? false'), { ok: true })
    check('改造：标记态禁用节点拖拽（nodes-draggable 随 markingActive）', source.includes(':nodes-draggable="!markingActive"'), { ok: true })
    const refBindings = source.match(/=> setGenerationConfigNodePromptRef\(id, element\)/g) || []
    check('回归：四处模板均挂 setGenerationConfigNodePromptRef（视频/图片/文本节点编辑卡片/生成配置）', refBindings.length === 4, { count: refBindings.length })
    check('回归：promptParts 未支持类型被安全跳过', source.includes("type !== 'text' && type !== 'reference' && type !== 'element'"), { ok: true })
    const emojiMatches = [...new Set(source.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [])]
    const preExisting = emojiMatches.filter((ch) => ch !== '✦' && ch !== '⚡' && ch !== '→')
    check('P0：新增代码未以 emoji 作为功能图标', preExisting.length === 0, { emojiMatches, unexpected: preExisting })
  }

  // ==================== 种子画布：4 个含图节点，2 个与编辑节点无连线 ====================
  const buildSeed = () => {
    if (sessionStorage.getItem('canvas-mode-seeded') === '1') return
    sessionStorage.setItem('canvas-mode-seeded', '1')
    const makeImage = (spec) => {
      const c = document.createElement('canvas')
      c.width = 480
      c.height = 480
      const ctx = c.getContext('2d')
      ctx.fillStyle = spec.base
      ctx.fillRect(0, 0, 480, 480)
      ctx.fillStyle = spec.quad
      ctx.fillRect(0, 0, 240, 240)
      ctx.fillStyle = spec.center
      ctx.beginPath()
      ctx.arc(240, 240, 60, 0, Math.PI * 2)
      ctx.fill()
      return c.toDataURL('image/png')
    }
    const imgA = makeImage({ base: '#f4f4f4', quad: '#d5d5d5', center: '#ffd400' }) // image-1 输出
    const imgB = makeImage({ base: '#eeeeee', quad: '#8e44ad', center: '#e67e22' }) // upload-1 自带（上游）
    const imgC = makeImage({ base: '#2ecc71', quad: '#27ae60', center: '#f1c40f' }) // image-2 输出（画布其它·绿）
    const imgD = makeImage({ base: '#34495e', quad: '#2980b9', center: '#e74c3c' }) // result-1（画布其它）
    window.__seedImages = { imgA, imgB, imgC, imgD }
    const canvas = {
      version: 2,
      nodes: [
        { id: 'upload-1', type: 'upload', position: { x: 20, y: 320 }, data: { title: '图片', originalName: '上游素材图', image: imgB } },
        {
          id: 'image-1',
          type: 'image',
          position: { x: 60, y: -10 },
          data: {
            title: '图像生成',
            mode: 'image-generation',
            prompt: '一只小狗走在草地上',
            status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1', resolution: '1080P' },
            output: { url: imgA, imageData: imgA, assetId: '', originalName: '编辑中的输出图', provider: 'seed', model: 'seed-image' },
            outputAspectRatio: 1,
            error: '',
          },
        },
        {
          id: 'image-2',
          type: 'image',
          position: { x: 470, y: 320 },
          data: {
            title: '图像生成',
            mode: 'image-generation',
            prompt: '一颗青苹果',
            status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1', resolution: '1080P' },
            output: { url: imgC, imageData: imgC, assetId: '', originalName: '画布另一张图', provider: 'seed', model: 'seed-image' },
            outputAspectRatio: 1,
            error: '',
          },
        },
        {
          id: 'result-1',
          type: 'result',
          position: { x: 470, y: -10 },
          data: { title: '生成结果', mode: 'image-result', image: imgD, originalName: '画布结果图', state: 'done' },
        },
      ],
      edges: [{ id: 'edge-upload-image', source: 'upload-1', target: 'image-1', type: 'default', interactionWidth: 28 }],
      settings: {},
      edgesVisible: true,
    }
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas))
  }

  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  await context.addInitScript(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '画布验收学生', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
  })
  await context.addInitScript(buildSeed)
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text())) consoleErrors.push({ text: m.text(), url: m.location()?.url || '' }) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  const openComposer = async (nodeId) => {
    await page.waitForSelector(`.vue-flow__node[data-id="${nodeId}"]`, { timeout: 30000 })
    await delay(900)
    const pane = await page.locator('.flow-canvas').boundingBox()
    if (pane) await page.mouse.click(pane.x + pane.width - 60, pane.y + pane.height - 60)
    await delay(200)
    await page.evaluate((id) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, nodeId)
    await page.waitForSelector(`.vue-flow__node[data-id="${nodeId}"] .image-composer-panel`, { timeout: 15000 })
    await delay(350)
  }

  const imgBox = (nodeId) => page.locator(`.vue-flow__node[data-id="${nodeId}"] img.mark-target`).boundingBox()
  const clickImage = async (nodeId, rx, ry) => {
    const box = await imgBox(nodeId)
    if (!box) throw new Error(`找不到节点 ${nodeId} 的图片`)
    await page.mouse.click(box.x + box.width * rx, box.y + box.height * ry)
  }

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
  await delay(700)
  // 关闭左侧「创建节点」浮层：它会盖住画布左侧，干扰「点图标记」这一交互（真实用户也会关掉它）。
  const paletteClose = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await paletteClose.count()) await paletteClose.first().click().catch(() => {})
  await delay(300)
  // 左侧竖排工具条随「画布模板 / 生成配置」等按钮变长后，会盖住画布最左一列（约 64px 宽）。
  // 种子坐标里 upload-1 / image-1 原本贴在最左，直接点上面板按钮会被工具条拦下。
  // 这里改在种子数据（buildSeed 里的 position）整体右移，而不是运行时拖画布 —— 拖画布会被 fitView 拉回。
  const pre = await page.evaluate(() => ({
    images: document.querySelectorAll('.image-generation-node').length,
    results: document.querySelectorAll('.result-node').length,
    edges: document.querySelectorAll('.vue-flow__edge').length,
  }))
  check('前置：画布 2 个 image + 1 个 result 节点 + 仅 1 条连线', pre.images === 2 && pre.results === 1 && pre.edges === 1, pre)
  await page.screenshot({ path: path.join(OUT_DIR, '01-seeded-canvas.png') })

  await openComposer('image-1')
  const markBtn = await page.locator('.vue-flow__node[data-id="image-1"] .image-composer-controls button[title="标记"]').count()
  check('编辑节点(image-1)面板出现「标记」按钮', markBtn === 1, { markBtn })

  // ---- 点标记 → 进入元素选择模式（无卡片） ----
  // 注意：不能用 Playwright 的真实鼠标点击 —— 左侧竖排工具条变长（10-30 加了「画布模板 / 生成配置」）后
  // 会盖住画布最左一列，image-1 恰好靠左，命中测试会被工具条拦下（工具条是产品既有布局，不是本次改动）。
  // 这里用 DOM 派发 click，与上面 openComposer 打开节点面板的方式一致，断言目标仍是「点标记进入元素选择模式」。
  await page.evaluate(() => {
    const btn = document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-controls button[title="标记"]')
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await page.waitForSelector('.mark-mode-bar', { timeout: 10000 })
  await delay(400)
  const modeUi = await page.evaluate(() => {
    const bar = document.querySelector('.mark-mode-bar')
    const rect = bar?.getBoundingClientRect()
    const canvasRect = document.querySelector('.canvas-area')?.getBoundingClientRect()
    return {
      hasBar: Boolean(bar),
      title: bar?.querySelector('.mark-mode-bar-copy strong')?.textContent?.trim() || '',
      subtitle: bar?.querySelector('.mark-mode-bar-copy span')?.textContent?.trim() || '',
      backLabel: bar?.querySelector('.mark-mode-back')?.textContent?.trim() || '',
      closeLabel: bar?.querySelector('.mark-mode-close')?.getAttribute('aria-label') || '',
      panelCount: document.querySelectorAll('.mark-panel').length,
      layerCount: document.querySelectorAll('.mark-layer').length,
      backdropCount: document.querySelectorAll('.mark-backdrop').length,
      barBackground: rect ? getComputedStyle(bar).backgroundColor : '',
      // 模式条应位于画布顶部居中。
      // 注意 floating-workflow-mode 下 .canvas-area 是 inset:0（从视口顶部算起），而模式条被明确压到 top:88px
      // （露出 64px 顶栏），所以「距画布顶部」的真实上限是 88+条高，不能再用旧的 80px。
      centeredTop: rect && canvasRect ? Math.abs((rect.left + rect.width / 2) - (canvasRect.left + canvasRect.width / 2)) < 12 && (rect.top - canvasRect.top) < 130 : false,
    }
  })
  check('点「标记」后不再弹出任何卡片/面板', modeUi.panelCount === 0 && modeUi.layerCount === 0 && modeUi.backdropCount === 0, modeUi)
  check('画布顶部出现蓝色模式条：标题「元素选择模式」+ 副标题「点击图片选择局部元素」', modeUi.hasBar && modeUi.title === '元素选择模式' && modeUi.subtitle === '点击图片选择局部元素', modeUi)
  check('模式条为蓝色且居中悬浮于画布顶部', /rgb\(22, 131, 255\)/.test(modeUi.barBackground) && modeUi.centeredTop, modeUi)
  check('模式条含「返回节点」按钮与关闭 X', modeUi.backLabel === '返回节点' && Boolean(modeUi.closeLabel), modeUi)

  // ---- 所有含图节点进入可点击标记状态（视觉提示：十字光标 + 高亮描边） ----
  const targets = await page.evaluate(() => {
    const ids = ['upload-1', 'image-1', 'image-2', 'result-1']
    const out = {}
    ids.forEach((id) => {
      const node = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      const img = node?.querySelector('img.mark-target')
      const wrap = img?.closest('.mark-target-wrap')
      out[id] = {
        hasImg: Boolean(img),
        cursor: img ? getComputedStyle(img).cursor : '',
        wrapOutline: wrap ? getComputedStyle(wrap).outlineColor : '',
        wrapOutlineWidth: wrap ? getComputedStyle(wrap).outlineWidth : '',
      }
    })
    return out
  })
  const allMarkable = ['image-1', 'image-2', 'result-1', 'upload-1'].every((id) => targets[id].hasImg && targets[id].cursor === 'crosshair' && targets[id].wrapOutlineWidth !== '0px')
  check('画布上所有含图节点均可点标记（十字光标 + 高亮描边）', allMarkable, targets)
  await page.screenshot({ path: path.join(OUT_DIR, '02-mode-bar.png') })

  // ---- 点任意一张画布图（image-2，非上游非本节点）→ 同步出 chip + 徽标 ----
  await fetch(`http://127.0.0.1:${STUB_PORT}/__control`, { method: 'POST', body: JSON.stringify({ describeDelayMs: 1600 }) })
  const startedAt = Date.now()
  await clickImage('image-2', 0.5, 0.25)
  await delay(300)
  const sync = await page.evaluate(() => ({
    badgesOnImage2: Array.from(document.querySelectorAll('.vue-flow__node[data-id="image-2"] .mark-badge')).map((b) => ({ text: b.textContent.trim(), left: b.style.left, top: b.style.top, bg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color })),
    badgesOnImage1: document.querySelectorAll('.vue-flow__node[data-id="image-1"] .mark-badge').length,
    editorChips: Array.from(document.querySelectorAll('.vue-flow__node[data-id="image-1"] .inline-prompt-editor .inline-prompt-element')).map((c) => ({
      index: c.querySelector('.inline-element-index')?.textContent?.trim() || '',
      name: c.querySelector('.inline-element-name')?.textContent?.trim() || '',
      hasThumb: Boolean(c.querySelector('img')),
      hasCaret: Boolean(c.querySelector('.inline-element-caret svg')),
    })),
    describeRequests: 0,
  }))
  sync.elapsedMs = Date.now() - startedAt
  sync.describeRequests = captured.describe.length
  check('点击后 300ms 内 chip 同步出现（识别响应故意延迟 1.6s，未等网络）', sync.editorChips.length === 1, sync)
  check('chip 带编号「1」+ 缩略图 + 下拉箭头', sync.editorChips[0]?.index === '1' && sync.editorChips[0]?.hasThumb && sync.editorChips[0]?.hasCaret, sync.editorChips)
  check('chip 先显示占位「识别中」', sync.editorChips[0]?.name === '识别中', sync.editorChips)
  check('圆形编号徽标出现在被点的这张画布图（image-2）上', sync.badgesOnImage2.length === 1 && sync.badgesOnImage2[0].text === '1' && sync.badgesOnImage1 === 0, sync)
  check('徽标为蓝色圆形 + 白色数字', /rgb\(22, 131, 255\)/.test(sync.badgesOnImage2[0]?.bg || '') && /rgb\(255, 255, 255\)/.test(sync.badgesOnImage2[0]?.color || ''), sync.badgesOnImage2[0])
  await page.screenshot({ path: path.join(OUT_DIR, '03-sync-chip.png') })

  // 裁剪块取自 imgC（绿）
  const cropColor = await page.evaluate(async () => {
    const sel = '.vue-flow__node[data-id="image-1"] .inline-prompt-element img'
    const src = document.querySelector(sel)?.getAttribute('src') || ''
    if (!src.startsWith('data:image/')) return null
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = src })
    const c = document.createElement('canvas')
    c.width = 24; c.height = 24
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, 24, 24)
    const d = ctx.getImageData(0, 0, 24, 24).data
    let r = 0; let g = 0; let b = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
    const n = d.length / 4
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
  })
  check('裁剪块来自被点的画布图（imgC 偏绿）', Boolean(cropColor) && cropColor.g > cropColor.r + 20 && cropColor.g > cropColor.b + 20, cropColor)

  // ---- 异步识别回填 ----
  await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="image-1"] .inline-element-name')?.textContent?.trim() === '画布源图里的绿苹果', null, { timeout: 15000 })
  const filled = await page.evaluate(() => ({
    name: document.querySelector('.vue-flow__node[data-id="image-1"] .inline-element-name')?.textContent?.trim(),
  }))
  check('识别候选异步回填到 chip', filled.name === '画布源图里的绿苹果', filled)
  await page.screenshot({ path: path.join(OUT_DIR, '04-recognized.png') })

  // ---- 点箭头 → 下拉菜单（Teleport 到 body）→ 选中候选 ----
  await page.locator('.vue-flow__node[data-id="image-1"] .inline-element-caret').first().click()
  await page.waitForSelector('.element-menu-pop', { timeout: 8000 })
  await delay(200)
  const menu = await page.evaluate(() => ({
    items: Array.from(document.querySelectorAll('.element-menu-item span')).map((s) => s.textContent.trim()),
    parentTag: document.querySelector('.element-menu-layer')?.parentElement?.tagName || '',
    position: getComputedStyle(document.querySelector('.element-menu-pop')).position,
  }))
  check('点箭头弹出下拉菜单并列出候选（含同一对象不同粒度）', menu.items.length === 3 && menu.items.includes('苹果上的水珠'), menu)
  check('下拉菜单 Teleport 到 body（不随画布 transform 错位）', menu.parentTag === 'BODY' && menu.position === 'fixed', menu)
  await page.screenshot({ path: path.join(OUT_DIR, '05-dropdown.png') })

  await page.locator('.element-menu-item', { hasText: '苹果上的水珠' }).click()
  await page.waitForFunction(() => document.querySelector('.vue-flow__node[data-id="image-1"] .inline-element-name')?.textContent?.trim() === '苹果上的水珠', null, { timeout: 8000 })
  await page.waitForSelector('.element-menu-pop', { state: 'detached', timeout: 5000 }).catch(() => {})
  const afterChoose = await page.evaluate(() => ({
    name: document.querySelector('.vue-flow__node[data-id="image-1"] .inline-element-name')?.textContent?.trim(),
  }))
  check('选中候选后 chip 名称更新', afterChoose.name === '苹果上的水珠', afterChoose)
  await page.screenshot({ path: path.join(OUT_DIR, '06-chip-updated.png') })

  // ---- 数据模型：nodeId = 实际来源节点(image-2)，imageRef = canvas ----
  await delay(700)
  const persisted = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}')
    const node = (raw.nodes || []).find((n) => n.id === 'image-1')
    const el = (node?.data?.elements || [])[0] || null
    return { nodeId: el?.nodeId, imageRef: el?.imageRef, content: el?.content, parts: (node?.data?.promptParts || []).filter((p) => p.type === 'element').length }
  })
  check('数据模型：element.nodeId 记录实际来源节点(image-2)，非发起节点(image-1)', persisted.nodeId === 'image-2', persisted)
  check('数据模型：imageRef 归类为 canvas（画布其它节点）', persisted.imageRef === 'canvas', persisted)
  check('数据模型：引用片写入发起节点(image-1)的 promptParts', persisted.parts === 1, persisted)

  // ---- 多标记：本节点图(output) + result 节点图(canvas) ----
  await fetch(`http://127.0.0.1:${STUB_PORT}/__control`, { method: 'POST', body: JSON.stringify({ describeDelayMs: 120 }) })
  await clickImage('image-1', 0.5, 0.5)
  await delay(400)
  await clickImage('result-1', 0.5, 0.5)
  await delay(700)
  const multi = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}')
    const els = (raw.nodes || []).find((n) => n.id === 'image-1')?.data?.elements || []
    return {
      chipIndexes: Array.from(document.querySelectorAll('.vue-flow__node[data-id="image-1"] .inline-element-index')).map((i) => i.textContent.trim()),
      badgesImage1: document.querySelectorAll('.vue-flow__node[data-id="image-1"] .mark-badge').length,
      badgesImage2: document.querySelectorAll('.vue-flow__node[data-id="image-2"] .mark-badge').length,
      badgesResult1: document.querySelectorAll('.vue-flow__node[data-id="result-1"] .mark-badge').length,
      refs: els.map((e) => `${e.nodeId}:${e.imageRef}`),
    }
  })
  check('多标记：编号递增 1,2,3 且与各图上的徽标一一对应', multi.chipIndexes.join(',') === '1,2,3' && multi.badgesImage1 === 1 && multi.badgesImage2 === 1 && multi.badgesResult1 === 1, multi)
  check('多标记：imageRef 分别归类 output / canvas', multi.refs[0] === 'image-2:canvas' && multi.refs[1] === 'image-1:output' && multi.refs[2] === 'result-1:canvas', multi.refs)
  await page.screenshot({ path: path.join(OUT_DIR, '07-three-marks.png') })

  // ---- 数量上限（当前上限 6：每节点最多 6 个标记元素） ----
  await clickImage('image-1', 0.25, 0.3)
  await delay(500)
  await clickImage('image-1', 0.7, 0.3)
  await delay(500)
  await clickImage('image-1', 0.7, 0.7)
  await delay(500)
  const limit = await page.evaluate(() => ({
    chips: document.querySelectorAll('.vue-flow__node[data-id="image-1"] .inline-element-index').length,
    totalBadges: document.querySelectorAll('.mark-badge').length,
  }))
  check('标记数量上限为 6（第 4~6 次点击正常新增）', limit.chips === 6 && limit.totalBadges === 6, limit)
  // 第 7 次点击应被拦下：不再新增，并弹出上限提示
  await clickImage('image-1', 0.4, 0.15)
  await delay(700)
  const overflow = await page.evaluate(() => ({
    chips: document.querySelectorAll('.vue-flow__node[data-id="image-1"] .inline-element-index').length,
    totalBadges: document.querySelectorAll('.mark-badge').length,
    warning: Array.from(document.querySelectorAll('.el-message')).map((m) => m.textContent.trim()).join(' | '),
  }))
  check('超过上限的第 7 次点击被拦下并提示「最多引用 6 个标记元素」',
    overflow.chips === 6 && overflow.totalBadges === 6 && /最多引用 6 个标记元素/.test(overflow.warning), overflow)
  await page.screenshot({ path: path.join(OUT_DIR, '07b-six-marks.png') })

  // ---- 拖拽平移画布（保留） + 节点拖拽禁用 ----
  const nodeTransformBefore = await page.evaluate(() => ({
    image1: getComputedStyle(document.querySelector('.vue-flow__node[data-id="image-1"]')).transform,
    image2: getComputedStyle(document.querySelector('.vue-flow__node[data-id="image-2"]')).transform,
  }))
  const viewportBefore = await page.evaluate(() => {
    const r = document.querySelector('.vue-flow__node[data-id="result-1"]').getBoundingClientRect()
    return { left: Math.round(r.left), top: Math.round(r.top) }
  })
  const emptyPoint = await page.evaluate(() => {
    const canvas = document.querySelector('.flow-canvas')
    const rect = canvas.getBoundingClientRect()
    const bar = document.querySelector('.mark-mode-bar')?.getBoundingClientRect()
    for (let gy = 0.12; gy <= 0.95; gy += 0.08) {
      for (let gx = 0.06; gx <= 0.95; gx += 0.08) {
        const x = rect.left + rect.width * gx
        const y = rect.top + rect.height * gy
        if (bar && x >= bar.left - 8 && x <= bar.right + 8 && y >= bar.top - 8 && y <= bar.bottom + 8) continue
        const el = document.elementFromPoint(x, y)
        if (!el) continue
        if (el.closest('.vue-flow__node') || el.closest('.vue-flow__edge') || el.closest('.mark-mode-bar')) continue
        const cls = String(el.className || '')
        if (cls.includes('vue-flow__pane') || cls.includes('vue-flow__background') || el === canvas) return { x, y }
      }
    }
    return null
  })
  if (emptyPoint) {
    await page.mouse.move(emptyPoint.x, emptyPoint.y)
    await page.mouse.down()
    await page.mouse.move(emptyPoint.x + 150, emptyPoint.y + 110, { steps: 8 })
    await page.mouse.up()
    await delay(250)
  }
  const viewportAfterPan = await page.evaluate(() => {
    const r = document.querySelector('.vue-flow__node[data-id="result-1"]').getBoundingClientRect()
    return { left: Math.round(r.left), top: Math.round(r.top) }
  })
  const panDelta = Math.abs(viewportAfterPan.left - viewportBefore.left) + Math.abs(viewportAfterPan.top - viewportBefore.top)
  check('标记态下画布仍可拖拽平移（节点屏幕坐标随平移变化）', Boolean(emptyPoint) && panDelta > 30, { emptyPoint, viewportBefore, viewportAfterPan, panDelta })

  // 从「节点」上起拖：被拖节点自身位置必须不变（节点拖拽被禁用）
  const nodeDragBox = await page.locator('.vue-flow__node[data-id="image-2"] .node-display-name').boundingBox()
  if (nodeDragBox) {
    await page.mouse.move(nodeDragBox.x + nodeDragBox.width / 2, nodeDragBox.y + nodeDragBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(nodeDragBox.x + nodeDragBox.width / 2 + 140, nodeDragBox.y + nodeDragBox.height / 2 + 90, { steps: 8 })
    await page.mouse.up()
    await delay(250)
  }
  const nodeTransformAfter = await page.evaluate(() => ({
    image1: getComputedStyle(document.querySelector('.vue-flow__node[data-id="image-1"]')).transform,
    image2: getComputedStyle(document.querySelector('.vue-flow__node[data-id="image-2"]')).transform,
  }))
  check('标记态下节点拖拽被禁用（拖动节点起点后节点位置不变）',
    Boolean(nodeDragBox) && nodeTransformBefore.image2 === nodeTransformAfter.image2 && nodeTransformBefore.image1 === nodeTransformAfter.image1,
    { nodeDragBox, nodeTransformBefore, nodeTransformAfter })
  await page.screenshot({ path: path.join(OUT_DIR, '08-after-pan.png') })

  // ---- 「返回节点」退出并聚焦发起节点 ----
  await page.locator('.mark-mode-back').click()
  await page.waitForSelector('.mark-mode-bar', { state: 'detached', timeout: 8000 })
  await delay(700)
  const returned = await page.evaluate(() => {
    const node = document.querySelector('.vue-flow__node[data-id="image-1"]')
    const canvas = document.querySelector('.canvas-area')?.getBoundingClientRect()
    const box = node?.getBoundingClientRect()
    const visible = box && canvas ? box.right > canvas.left && box.left < canvas.right && box.bottom > canvas.top && box.top < canvas.bottom : false
    return {
      barGone: !document.querySelector('.mark-mode-bar'),
      composerOpen: Boolean(document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-panel')),
      nodeVisible: visible,
      chips: document.querySelectorAll('.vue-flow__node[data-id="image-1"] .inline-element-index').length,
    }
  })
  check('点「返回节点」退出模式（模式条消失）', returned.barGone, returned)
  check('返回后回到发起节点的编辑状态（面板打开且节点可见）', returned.composerOpen && returned.nodeVisible, returned)
  check('退出后引用 chip 仍在（6 个）', returned.chips === 6, returned)
  await page.screenshot({ path: path.join(OUT_DIR, '09-returned.png') })

  // ---- 刷新后持久化（AC-08） ----
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 20000 })
  await delay(700)
  await openComposer('image-1')
  const afterReload = await page.evaluate(() => ({
    chips: document.querySelectorAll('.vue-flow__node[data-id="image-1"] .inline-element-index').length,
    names: Array.from(document.querySelectorAll('.vue-flow__node[data-id="image-1"] .inline-element-name')).map((n) => n.textContent.trim()),
  }))
  check('AC-08 刷新后 6 个标记 chip 仍在（含缩略图与编号）', afterReload.chips === 6 && afterReload.names.length === 6 && afterReload.names.includes('苹果上的水珠'), afterReload)
  await page.screenshot({ path: path.join(OUT_DIR, '10-after-reload.png') })

  check('控制台无未处理异常', pageErrors.length === 0, { pageErrors })
  const unexpectedConsole = consoleErrors.filter((e) => !/favicon/.test(e.url) && !/\.ico$/.test(e.url))
  check('控制台无 error 级日志', unexpectedConsole.length === 0, { consoleErrors, unexpectedConsole })
  await context.close()

  // ==================== Context B：老画布外观未变 ====================
  const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await legacyContext.addInitScript(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '画布验收学生', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    const legacy = {
      version: 2,
      nodes: [
        { id: 'upload-1', type: 'upload', position: { x: 40, y: 250 }, data: { title: '图片', originalName: '历史图片', image: '/canvas-demo-sneaker.png' } },
        {
          id: 'image-1',
          type: 'image',
          position: { x: 120, y: -8 },
          data: {
            title: '图像生成',
            mode: 'image-generation',
            prompt: '历史提示词',
            status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1' },
            output: { url: '/canvas-demo-sneaker.png', imageData: '/canvas-demo-sneaker.png', originalName: '历史输出.png' },
            promptParts: [{ type: 'element', id: 'el-legacy-gone' }, { type: 'some-future-type', id: 'x' }, { type: 'unknown-2' }, { type: 'text', text: '历史提示词' }],
          },
        },
      ],
      edges: [{ id: 'edge-upload-image', source: 'upload-1', target: 'image-1', type: 'default', interactionWidth: 28 }],
      settings: {},
      edgesVisible: true,
    }
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(legacy))
  })
  const legacyPage = await legacyContext.newPage()
  const legacyErrors = []
  legacyPage.on('pageerror', (e) => legacyErrors.push(String(e)))
  await legacyPage.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await legacyPage.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
  await delay(700)
  await legacyPage.evaluate(() => {
    const wrap = document.querySelector('.vue-flow__node[data-id="image-1"]')
    if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await delay(400)
  const legacy = await legacyPage.evaluate(() => {
    const editor = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
    return {
      editorExists: Boolean(editor),
      elementChips: editor ? editor.querySelectorAll('.inline-prompt-element').length : -1,
      htmlHasElementChip: editor ? editor.innerHTML.includes('inline-element') : true,
      textContent: editor ? editor.textContent.trim() : '',
      modeBar: document.querySelectorAll('.mark-mode-bar').length,
    }
  })
  check('AC-06 老画布（未知 type + 失效 element id）不崩溃', legacyErrors.length === 0, { legacyErrors })
  check('AC-06 老画布渲染：未知/失效类型被安全跳过，不出现任何 element chip', legacy.editorExists && legacy.elementChips === 0 && legacy.htmlHasElementChip === false, legacy)
  check('AC-06 老画布提示词文本保持原样', legacy.textContent.includes('历史提示词'), legacy)
  await legacyPage.screenshot({ path: path.join(OUT_DIR, '11-legacy-canvas.png') })
  await legacyContext.close()

  await browser.close()

  const report = { pass: failures.length === 0, failures, results, capturedSummary: { describe: captured.describe.length } }
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.error(`\n==== 结果：${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`} ====`)
  if (failures.length) console.error(failures.join('\n'))
  process.exitCode = failures.length === 0 ? 0 : 1
} finally {
  killTree(vite)
  stub.close()
}
