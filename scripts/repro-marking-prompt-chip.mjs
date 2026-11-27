// 复现：画布「局部标记（元素选择模式）」后，标记元素 chip 是否出现在【发起标记节点】的提示词输入框里。
// 目标：覆盖 verify-canvas-marking-mode.mjs / repro-ref-chip-scenarios.mjs 覆盖不到的 8 个真实用户场景。
//
// 用法（Windows，必须剥离代理，否则 localhost 被劫持）：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     node scripts/repro-marking-prompt-chip.mjs
//
// 输出截图目录：.mark-chip-repro/
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
const STUB_PORT = 3221
const WEB_PORT = 5181
const OUT_DIR = path.join(projectDir, '.mark-chip-repro')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const CANDIDATES = ['画面里的绿苹果', '绿色水果', '苹果上的水珠']

// ---------------- stub AI server ----------------
let describeDelayMs = 220
const captured = { describe: 0, generate: 0 }
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    if (req.method === 'POST' && url === '/__control') {
      try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (typeof body.describeDelayMs === 'number') describeDelayMs = body.describeDelayMs } catch { /* ignore */ }
      return send(200, { ok: true, describeDelayMs })
    }
    if (req.method === 'POST' && url === '/api/ai/image/describe-region') {
      captured.describe += 1
      return setTimeout(() => send(200, { description: CANDIDATES[0], candidates: CANDIDATES, provider: 'stub', model: 'stub-vision' }), describeDelayMs)
    }
    if (req.method === 'POST' && url === '/api/ai/image/generate') {
      captured.generate += 1
      return send(200, { provider: 'stub', taskId: 'task-stub', model: 'stub-image', images: [{ imageUrl: TINY_PNG, title: 'stub', provider: 'stub', model: 'stub-image' }] })
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
function killTree(child) { if (!child || child.killed) return; try { if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL') } catch { /* ignore */ } }

// ---------------- 种子画布 ----------------
// 节点布局（world 坐标，默认 viewport {x:24,y:110,zoom:0.92}，保证互不遮挡）：
//   image-1(60,-30)  result-1(470,-30)  image-2(880,-30)
//   upload-1(520,420) video-1(920,420)
const makeSeed = (opts) => `
  if (!sessionStorage.getItem('mark-chip-seeded')) {
  sessionStorage.setItem('mark-chip-seeded', '1');
  const makeImage = (spec) => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 480;
    const ctx = c.getContext('2d');
    ctx.fillStyle = spec.base; ctx.fillRect(0, 0, 480, 480);
    ctx.fillStyle = spec.quad; ctx.fillRect(0, 0, 240, 240);
    ctx.fillStyle = spec.center; ctx.beginPath(); ctx.arc(300, 300, 70, 0, Math.PI * 2); ctx.fill();
    return c.toDataURL('image/png');
  };
  const imgA = makeImage({ base: '#f4f4f4', quad: '#d5d5d5', center: '#ffd400' }); // image-1 输出
  const imgB = makeImage({ base: '#eeeeee', quad: '#8e44ad', center: '#e67e22' }); // upload-1 自带（上游）
  const imgC = makeImage({ base: '#2ecc71', quad: '#27ae60', center: '#f1c40f' }); // image-2 输出（画布其它）
  const imgD = makeImage({ base: '#34495e', quad: '#2980b9', center: '#e74c3c' }); // result-1（画布其它）
  const baseImage = { title: '图像生成', mode: 'image-generation', status: 'succeeded', config: { model: 'agnes-image-2.0-flash', ratio: '1:1', resolution: '1080P' }, outputAspectRatio: 1, error: '' };
  const image1 = Object.assign({}, baseImage, { prompt: '一只小狗走在草地上', output: { url: imgA, imageData: imgA, originalName: '编辑中的输出图', provider: 'seed', model: 'seed' } });
  image1.promptParts = [{ type: 'text', text: '一只小狗走在草地上' }];
  const image2 = Object.assign({}, baseImage, { prompt: '一颗青苹果', output: { url: imgC, imageData: imgC, originalName: '画布另一张图', provider: 'seed', model: 'seed' } });
  image2.promptParts = [{ type: 'text', text: '一颗青苹果' }];
  const video1 = { title: '视频生成', mode: 'video-generation', prompt: '一段测试视频提示词', status: 'idle', config: { model: '', resolution: '720P', ratio: '16:9', duration: 6 }, output: null, error: '' };
  video1.promptParts = [{ type: 'text', text: '一段测试视频提示词' }];
  if (${Boolean(opts.videoElementSeed)}) {
    video1.elements = [{ id: 'el-video-seed', nodeId: 'result-1', imageRef: 'canvas', label: '种子元素', content: '种子元素', thumb: imgD, candidates: [], point: { x: 100, y: 100 }, fx: 0.3, fy: 0.3 }];
    video1.promptParts = [{ type: 'element', id: 'el-video-seed' }, { type: 'text', text: '一段测试视频提示词' }];
  }
  const nodes = [
    { id: 'upload-1', type: 'upload', position: { x: 520, y: 420 }, data: { title: '图片', originalName: '上游素材图', image: imgB } },
    { id: 'image-1', type: 'image', position: { x: 60, y: -30 }, data: image1 },
    { id: 'image-2', type: 'image', position: { x: 880, y: -30 }, data: image2 },
    { id: 'result-1', type: 'result', position: { x: 470, y: -30 }, data: { title: '生成结果', mode: 'image-result', image: imgD, originalName: '画布结果图', state: 'done' } },
    { id: 'video-1', type: 'video', position: { x: 920, y: 420 }, data: video1 }
  ];
  if (${Boolean(opts.rightEdgeNode)}) {
    nodes.push({ id: 'image-4', type: 'image', position: { x: 1020, y: 620 }, data: Object.assign({}, baseImage, { prompt: '靠右的节点', output: { url: imgC, imageData: imgC, originalName: '靠右节点输出图', provider: 'seed', model: 'seed' }, promptParts: [{ type: 'text', text: '靠右的节点' }] }) });
  }
  const canvas = {
    version: 2,
    nodes,
    edges: [{ id: 'e-u-i', source: 'upload-1', target: 'image-1', type: 'default', interactionWidth: 28 }],
    settings: {}, edgesVisible: true,
  };
  localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas));
  }
`

// ---------------- 结果收集 ----------------
const results = {}
const failures = []
let scenarioName = ''
function log(line) { console.error(line) }
function record(key, value) {
  results[scenarioName] = results[scenarioName] || {}
  results[scenarioName][key] = value
}

// ---------------- 场景 ----------------
// 每个场景：fresh context → 播种 → 打开 image-1 面板 → 点「标记」进入元素选择模式 → 在图上点击 → 记录事实。
const scenarios = [
  {
    id: 'S1-image-self',
    title: '图片节点对自己输出图标记 → chip 应出现在本节点输入框',
    build: async (h) => {
      await h.openComposer('image-1')
      await h.enterMarking('image-1')
      await h.clickImage('image-1', 0.5, 0.5)
      await h.waitRecognized('image-1')
      record('afterMark', await h.snap('image-1'))
      await h.screenshot('S1-image-self_after-mark')
      await h.exitMarking()
      record('afterReturn', await h.snap('image-1'))
      await h.screenshot('S1-image-self_after-return')
    },
  },
  {
    id: 'S2-image-other',
    title: '图片节点发起，标记【画布其它节点】的图 → chip 应出现在本节点输入框',
    build: async (h) => {
      await h.openComposer('image-1')
      await h.enterMarking('image-1')
      await h.clickImage('image-2', 0.5, 0.5)
      await h.waitRecognized('image-1')
      record('afterMark', await h.snap('image-1'))
      record('targetNodeEditorChips', await h.countChips('image-2'))
      await h.screenshot('S2-image-other_after-mark')
      await h.exitMarking()
      record('afterReturn', await h.snap('image-1'))
    },
  },
  {
    id: 'S3-upload-upstream',
    title: '标记【上游 upload 节点】的图 → chip 应出现在发起节点输入框',
    build: async (h) => {
      await h.openComposer('image-1')
      await h.enterMarking('image-1')
      await h.clickImage('upload-1', 0.5, 0.5)
      await h.waitRecognized('image-1')
      record('afterMark', await h.snap('image-1'))
      await h.screenshot('S3-upload-upstream_after-mark')
      await h.exitMarking()
      record('afterReturn', await h.snap('image-1'))
    },
  },
  {
    id: 'S4-video-node',
    title: '视频节点：是否存在「标记」入口；元素片模板是否可渲染',
    build: async (h) => {
      await h.openComposer('video-1')
      record('videoPanelMarkButtons', await h.countMarkButtons('video-1'))
      record('videoPanelButtons', await h.listPanelButtons('video-1'))
      record('videoPanelElementChips', await h.countChips('video-1'))
      await h.screenshot('S4-video-node_panel')
    },
    extraSeed: { videoElementSeed: true },
    extraAssert: (facts) => {
      // 视频节点带元素片种子时，模板 :279 的元素分支应当渲染出 chip
      record('note', facts.videoPanelElementChips > 0
        ? '视频模板元素分支可渲染（种子元素片渲染成功）'
        : '视频模板元素分支未渲染出 chip（种子元素片）')
    },
  },
  {
    id: 'S5-after-generate',
    title: '标记后调用节点生成（runGenerator）→ chip 是否还在',
    build: async (h) => {
      await h.openComposer('image-1')
      await h.enterMarking('image-1')
      await h.clickImage('image-2', 0.5, 0.5)
      await h.waitRecognized('image-1')
      record('beforeGenerate', await h.snap('image-1'))
      const gen = await h.runGenerate('image-1')
      record('generateResult', gen)
      record('afterGenerate', await h.snap('image-1'))
      await h.screenshot('S5-after-generate')
      await h.reopenComposer('image-1')
      record('afterGenerateReopen', await h.snap('image-1'))
    },
  },
  {
    id: 'S6-panel-closed',
    title: '编辑器卸载（面板关闭）→ 重新打开 → chip 是否可见（返回节点可见性）',
    build: async (h) => {
      await h.openComposer('image-1')
      await h.enterMarking('image-1')
      // 事实记录：标记态下 elements-selectable=false，点空白/点其它节点都无法把选中态切走
      // → 发起节点面板在整个标记过程中始终打开，编辑器不会卸载。
      record('markingModeCloseAttempt', await h.closePanel('image-1'))
      record('markingModeSelectedNodes', await h.selectedNodeIds())
      await h.clickImage('image-2', 0.5, 0.5)
      record('whileMarking', await h.snap('image-1'))
      await h.screenshot('S6_panel-closed_while-marking')
      await h.exitMarking() // 点「返回节点」
      record('afterReturn', await h.snap('image-1'))
      // 退出标记模式后（普通态）真正把面板关掉 → 编辑器卸载 → 再打开，验证 chip 从数据重建
      record('normalModeCloseAttempt', await h.closePanel('image-1'))
      record('whilePanelUnmounted', await h.snap('image-1'))
      await h.screenshot('S6_panel-closed_unmounted')
      await h.reopenComposer('image-1')
      record('afterReopen', await h.snap('image-1'))
      await h.screenshot('S6_panel-closed_after-reopen')
    },
  },
  {
    id: 'S7-type-after-mark',
    title: '标记后在输入框继续打字 → chip 是否被降级成纯文本',
    build: async (h) => {
      await h.openComposer('image-1')
      await h.enterMarking('image-1')
      await h.clickImage('image-2', 0.5, 0.5)
      await h.waitRecognized('image-1')
      await h.exitMarking()
      record('beforeTyping', await h.snap('image-1'))
      await h.typeInEditor('image-1', '再加一点光晕')
      record('afterTyping', await h.snap('image-1'))
      await h.switchAwayBack('image-1', 'image-2')
      record('afterSwitchBack', await h.snap('image-1'))
      // 已知降级陷阱：把光标放进文字 span 内部再打字，chip 可能被压进文本外壳并永久降级。
      await h.placeCaretInTextSpan('image-1', 3)
      await h.typeRaw('甲')
      record('afterTypeInTextSpan', await h.snap('image-1'))
      await h.switchAwayBack('image-1', 'image-2')
      record('afterTypeInTextSpanSwitchBack', await h.snap('image-1'))
      await h.screenshot('S7-type-after-mark')
    },
  },
  {
    id: 'S8-drag-chip',
    title: '标记后拖拽 chip 换位 → chip 是否还在',
    build: async (h) => {
      await h.openComposer('image-1')
      await h.enterMarking('image-1')
      await h.clickImage('image-2', 0.5, 0.5)
      await h.waitRecognized('image-1')
      await h.clickImage('result-1', 0.5, 0.5)
      await h.waitRecognizedCount('image-1', 2)
      await h.exitMarking()
      const before = await h.snap('image-1')
      record('beforeDrag', { chipCount: before.chipCount, order: before.elementIdsInDom })
      await h.dragFirstChipToEditorStart('image-1')
      record('afterDrag', await h.snap('image-1'))
      await h.screenshot('S8-drag-chip')
    },
  },
  {
    id: 'S9-right-edge-overflow',
    title: '发起节点靠近画布右边界（面板 390px 溢出被裁）→ 标记入口/输入框/chip 是否可达',
    build: async (h) => {
      await h.openComposer('image-4')
      record('geometry', await h.rectsAndHits('image-4'))
      let entered = true
      try { await h.enterMarking('image-4') } catch (error) { entered = false; record('enterMarkingError', String(error?.message || error)) }
      record('enteredMarking', entered)
      if (entered) {
        await h.clickImage('image-2', 0.5, 0.5)
        await h.waitRecognized('image-4')
        record('afterMark', await h.snap('image-4'))
      }
      await h.screenshot('S9-right-edge-overflow')
    },
    extraSeed: { rightEdgeNode: true },
  },
]

// ---------------- 主流程 ----------------
try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }
  await mkdir(OUT_DIR, { recursive: true })

  // ---- 静态事实：模板里「标记」入口只有一处 ----
  {
    const source = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
    const videoBlock = source.slice(source.indexOf('class="video-composer-controls"'), source.indexOf('class="video-composer-controls"') + 1400)
    const staticFact = {
      openMarkingInTemplate: (source.match(/@click\.stop="openMarking\(id\)"/g) || []).length,
      videoControlsHasMarkButton: videoBlock.includes('openMarking('),
      elementBranchCount: (source.match(/part\.type === 'element' && part\.element/g) || []).length,
    }
    results.__static = staticFact
    log(`[STATIC] 模板中 openMarking 入口数=${staticFact.openMarkingInTemplate}，视频控制区含标记按钮=${staticFact.videoControlsHasMarkButton}，element chip 模板分支数=${staticFact.elementBranchCount}`)
    if (!staticFact.videoControlsHasMarkButton) log('        → 视频节点编辑面板【没有】「标记」按钮：无法从视频节点发起局部标记')
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })

  for (const sc of scenarios) {
    scenarioName = sc.id
    results[scenarioName] = { title: sc.title }
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
    await context.addInitScript(() => {
      localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '验收学生', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    })
    await context.addInitScript((s) => { /* eslint-disable-next-line no-new-func */ new Function(s)() }, makeSeed(sc.extraSeed || {}))
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    const h = makeHelpers(page)

    await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
    await delay(800)
    const closePalette = page.locator('button[aria-label="关闭创建节点面板"]')
    if (await closePalette.count()) await closePalette.first().click().catch(() => {})
    await delay(250)
    record('seeded', await page.evaluate(() => ({
      images: document.querySelectorAll('.image-generation-node').length,
      uploads: document.querySelectorAll('.upload-node').length,
      results: document.querySelectorAll('.result-node').length,
      videos: document.querySelectorAll('.video-generation-node').length,
      edges: document.querySelectorAll('.vue-flow__edge').length,
    })))

    try {
      await sc.build(h)
    } catch (error) {
      record('scenarioError', String(error?.stack || error))
      failures.push(`${sc.id}: ${error?.message || error}`)
      await page.screenshot({ path: path.join(OUT_DIR, `${sc.id}_ERROR.png`) }).catch(() => {})
    }
    sc.extraAssert?.(results[scenarioName])
    results[scenarioName].pageErrors = pageErrors
    await context.close()

    // 打印结论
    const r = results[scenarioName]
    // 取最后一次记录的快照作为「终态」
    const snaps = Object.values(r).filter((v) => v && typeof v === 'object' && 'chipCount' in v)
    const key = snaps.length ? snaps[snaps.length - 1] : null
    const chip = key ? key.chipCount : (r.videoPanelElementChips ?? '?')
    const extra = []
    if (r.videoPanelMarkButtons !== undefined) extra.push(`视频面板标记按钮=${r.videoPanelMarkButtons}`)
    if (r.geometry) extra.push(`标记按钮命中=${r.geometry.markButtonHit} 面板溢出画布右=${r.geometry.panelOverflowsCanvasRightPx}px 进入标记=${r.enteredMarking}`)
    log(`[${sc.id}] 终态 chip=${chip}${key ? ` visible=${(key.chips || []).filter((c) => c.visible).length} hit=${(key.chips || []).map((c) => c.hit).join('/')} elements=${key.elementsLen} refs=${JSON.stringify(key.elementRefs)} parts=${JSON.stringify(key.promptPartsSummary)} panelOpen=${key.panelOpen}` : ''}${extra.length ? '  ' + extra.join(' ') : ''}${r.scenarioError ? '  ERROR!' : ''}`)
  }

  await browser.close()

  await writeFile(path.join(OUT_DIR, 'scenarios.json'), JSON.stringify(results, null, 2))
  const errored = Object.entries(results).filter(([, v]) => v && v.scenarioError).map(([k]) => k)
  log(`\n==== 复现结果写入 ${path.join(OUT_DIR, 'scenarios.json')} ====`)
  if (errored.length) log(`场景执行异常：${errored.join(', ')}`)
  if (failures.length) { log(`执行失败：\n${failures.join('\n')}`); process.exitCode = 1 }
} catch (error) {
  log('REPRO_ERROR ' + (error?.stack || error))
  process.exitCode = 1
} finally {
  killTree(vite)
  stub.close()
}

// ---------------- helpers ----------------
function makeHelpers(page) {
  const nodeSel = (id) => `.vue-flow__node[data-id="${id}"]`

  const snap = (id) => page.evaluate((nid) => {
    const wrap = document.querySelector(`.vue-flow__node[data-id="${nid}"]`)
    const ed = wrap?.querySelector('.inline-prompt-editor') || null
    let data = null
    try { data = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}').nodes.find((n) => n.id === nid)?.data || null } catch { /* ignore */ }
    const canvas = document.querySelector('.flow-canvas')
    const cr = canvas?.getBoundingClientRect()
    const chips = ed ? Array.from(ed.querySelectorAll('.inline-prompt-element')).map((c) => {
      const r = c.getBoundingClientRect()
      const er = ed.getBoundingClientRect()
      const style = getComputedStyle(c)
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      return {
        index: c.querySelector('.inline-element-index')?.textContent?.trim() || '',
        name: c.querySelector('.inline-element-name')?.textContent?.trim() || '',
        hasThumb: Boolean(c.querySelector('img')),
        dataElementId: c.dataset.elementId || '',
        rect: { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top) },
        visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && Boolean(c.offsetParent),
        insideEditor: er.width > 0 && r.left >= er.left - 2 && r.right <= er.right + 2,
        // 命中测试：真实用户能不能「看到并点到」这个 chip（被侧栏盖住 / 裁掉会返回非 self）
        hit: (() => {
          if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return 'offscreen'
          const el = document.elementFromPoint(cx, cy)
          if (!el) return 'none'
          if (el === c || c.contains(el)) return 'self'
          return `covered:${String(el.className || el.tagName).slice(0, 40)}`
        })(),
        withinCanvas: cr ? r.left >= cr.left && r.right <= cr.right && r.top >= cr.top && r.bottom <= cr.bottom : null,
      }
    }) : null
    const parts = data?.promptParts || null
    return {
      editorExists: Boolean(ed),
      panelOpen: Boolean(wrap?.querySelector('.image-composer-panel, .video-composer-panel')),
      markingActive: Boolean(document.querySelector('.mark-mode-bar')),
      chipCount: ed ? (chips ? chips.length : 0) : null,
      chips,
      elementIdsInDom: ed ? Array.from(ed.querySelectorAll('.inline-prompt-element')).map((c) => c.dataset.elementId || '') : null,
      elementsLen: Array.isArray(data?.elements) ? data.elements.length : null,
      elementNodeIds: Array.isArray(data?.elements) ? data.elements.map((e) => e.nodeId) : null,
      elementRefs: Array.isArray(data?.elements) ? data.elements.map((e) => e.imageRef) : null,
      elementLabels: Array.isArray(data?.elements) ? data.elements.map((e) => e.label) : null,
      canvasRect: cr ? { left: Math.round(cr.left), right: Math.round(cr.right), top: Math.round(cr.top), bottom: Math.round(cr.bottom) } : null,
      promptPartsSummary: Array.isArray(parts) ? parts.map((p) => (p.type === 'text' ? `text:${String(p.text || '').slice(0, 24)}` : `${p.type}:${p.id || ''}`)) : null,
      prompt: data?.prompt ?? null,
    }
  }, id)

  const countChips = (id) => page.evaluate((nid) => {
    const ed = document.querySelector(`.vue-flow__node[data-id="${nid}"] .inline-prompt-editor`)
    return ed ? ed.querySelectorAll('.inline-prompt-element').length : null
  }, id)

  const panelState = (id) => page.evaluate((nid) => {
    const wrap = document.querySelector(`.vue-flow__node[data-id="${nid}"]`)
    return {
      imagePanel: Boolean(wrap?.querySelector('.image-composer-panel')),
      videoPanel: Boolean(wrap?.querySelector('.video-composer-panel')),
      editor: Boolean(wrap?.querySelector('.inline-prompt-editor')),
      nodeSelectedClass: Boolean(wrap?.querySelector('.image-generation-node.selected, .video-generation-node.selected')),
      markingBar: Boolean(document.querySelector('.mark-mode-bar')),
    }
  }, id)

  const selectedNodeIds = () => page.evaluate(() => Array.from(document.querySelectorAll('.vue-flow__node.selected')).map((n) => n.dataset.id))

  const countMarkButtons = (id) => page.evaluate((nid) => document.querySelectorAll(`.vue-flow__node[data-id="${nid}"] button[title="标记"], .vue-flow__node[data-id="${nid}"] button[aria-label="标记图片局部元素"]`).length, id)

  const listPanelButtons = (id) => page.evaluate((nid) => {
    const panel = document.querySelector(`.vue-flow__node[data-id="${nid}"] .image-composer-panel, .vue-flow__node[data-id="${nid}"] .video-composer-panel`)
    return panel ? Array.from(panel.querySelectorAll('button')).map((b) => (b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean) : null
  }, id)

  const openComposer = async (id) => {
    await page.waitForSelector(nodeSel(id), { timeout: 30000 })
    await delay(500)
    await page.evaluate((nid) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${nid}"]`)
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, id)
    await page.waitForSelector(`${nodeSel(id)} .image-composer-panel, ${nodeSel(id)} .video-composer-panel`, { timeout: 15000 })
    await delay(400)
  }

  const reopenComposer = async (id) => {
    await page.evaluate((nid) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${nid}"]`)
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, id)
    await page.waitForSelector(`${nodeSel(id)} .image-composer-panel, ${nodeSel(id)} .video-composer-panel`, { timeout: 15000 })
    await delay(450)
  }

  // 关闭发起节点编辑面板的两种真实手段：① 点画布空白（pane-click）；② 点另一个节点把选中态切走。
  // 返回诊断，确认面板是否真的关了（否则场景 6 等于没测到）。
  const closePanel = async (id) => {
    const diag = {}
    const box = await page.locator('.flow-canvas').boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width - 40, box.y + box.height - 40)
      await delay(400)
    }
    diag.afterPaneClick = await panelState(id)
    if (diag.afterPaneClick.imagePanel || diag.afterPaneClick.videoPanel || diag.afterPaneClick.editor) {
      await page.evaluate(() => {
        const label = document.querySelector('.vue-flow__node[data-id="result-1"] .node-display-name')
        if (label) label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      })
      await delay(500)
      diag.afterFallbackSelectResult = await panelState(id)
    }
    return diag
  }

  const enterMarking = async (id) => {
    const btn = page.locator(`${nodeSel(id)} .image-composer-controls button[title="标记"]`)
    await btn.waitFor({ timeout: 10000 })
    await btn.click()
    await page.waitForSelector('.mark-mode-bar', { timeout: 10000 })
    await delay(400)
  }

  const exitMarking = async () => {
    await page.locator('.mark-mode-back').click()
    await page.waitForSelector('.mark-mode-bar', { state: 'detached', timeout: 8000 }).catch(() => {})
    await delay(700)
  }

  const clickImage = async (id, rx, ry) => {
    const box = await page.locator(`${nodeSel(id)} img.mark-target`).boundingBox()
    if (!box) throw new Error(`找不到节点 ${id} 的 .mark-target 图片`)
    await page.mouse.click(box.x + box.width * rx, box.y + box.height * ry)
    await delay(500)
  }

  const waitRecognized = async (id, timeout = 12000) => {
    await page.waitForFunction((nid) => {
      const names = Array.from(document.querySelectorAll(`.vue-flow__node[data-id="${nid}"] .inline-element-name`)).map((n) => n.textContent.trim())
      return names.length > 0 && names.every((n) => n && n !== '识别中')
    }, id, { timeout }).catch(() => {})
    await delay(300)
  }

  const waitRecognizedCount = async (id, count, timeout = 12000) => {
    await page.waitForFunction(({ nid, want }) => {
      const chips = document.querySelectorAll(`.vue-flow__node[data-id="${nid}"] .inline-prompt-element`)
      if (chips.length < want) return false
      const names = Array.from(document.querySelectorAll(`.vue-flow__node[data-id="${nid}"] .inline-element-name`)).map((n) => n.textContent.trim())
      return names.length >= want && names.every((n) => n && n !== '识别中')
    }, { nid: id, want: count }, { timeout }).catch(() => {})
    await delay(400)
  }

  const runGenerate = async (id) => {
    const before = captured.generate
    await page.locator(`${nodeSel(id)} .image-composer-controls .node-run-button`).click()
    await page.waitForFunction((nid) => {
      let data = null
      try { data = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}').nodes.find((n) => n.id === nid)?.data } catch { /* ignore */ }
      return data && data.status && data.status !== 'running'
    }, id, { timeout: 30000 }).catch(() => {})
    await delay(700)
    return { generateRequests: captured.generate - before }
  }

  const typeInEditor = async (id, text) => {
    const ed = page.locator(`${nodeSel(id)} .inline-prompt-editor`)
    const box = await ed.boundingBox()
    if (box) {
      // 点输入框右下角，把光标落到文字末尾附近（真实用户行为）
      await page.mouse.click(box.x + box.width - 8, box.y + box.height - 8)
      await delay(150)
    }
    await page.keyboard.type(text)
    await delay(300)
    await page.keyboard.press('Escape').catch(() => {})
    await delay(200)
  }

  // 把光标放进「渲染出来的文本 span」内部（等价于用户先在提示词框文字里点了一下定位光标），再打字。
  // 这是已知的引用片降级陷阱（chip 可能被压进 <span class="inline-prompt-text"> 外壳）。
  const placeCaretInTextSpan = async (id, offset) => {
    await page.evaluate(({ nid, off }) => {
      const ed = document.querySelector(`.vue-flow__node[data-id="${nid}"] .inline-prompt-editor`)
      const span = ed?.querySelector('.inline-prompt-text')
      const tn = span?.firstChild
      if (!ed || !tn) return
      ed.focus()
      const r = document.createRange()
      r.setStart(tn, Math.min(off, tn.textContent.length))
      r.collapse(true)
      const s = window.getSelection()
      s.removeAllRanges(); s.addRange(r)
    }, { nid: id, off: offset })
    await delay(200)
  }

  const typeRaw = async (text) => { await page.keyboard.type(text); await delay(350) }

  const switchAwayBack = async (id, otherId) => {
    await reopenComposer(otherId)
    await delay(400)
    await reopenComposer(id)
    await delay(500)
  }

  // 量测「标记」按钮 / 面板 / 输入框的位置与命中情况（用于判断靠右节点的面板被裁影响）。
  const rectsAndHits = (id) => page.evaluate((nid) => {
    const wrap = document.querySelector(`.vue-flow__node[data-id="${nid}"]`)
    const canvas = document.querySelector('.flow-canvas')
    const cr = canvas?.getBoundingClientRect()
    const btn = wrap?.querySelector('.image-composer-controls button[title="标记"]')
    const panel = wrap?.querySelector('.image-composer-panel')
    const ed = wrap?.querySelector('.inline-prompt-editor')
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width) } }
    const hitAt = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return 'offscreen'
      const t = document.elementFromPoint(x, y)
      if (!t) return 'none'
      return t === el || el.contains(t) ? 'self' : `covered:${String(t.className || t.tagName).slice(0, 40)}`
    }
    return {
      canvas: R(canvas),
      panel: R(panel),
      editor: R(ed),
      markButton: R(btn),
      markButtonHit: hitAt(btn),
      panelOverflowsCanvasRightPx: panel && cr ? Math.round(panel.getBoundingClientRect().right - cr.right) : null,
      markButtonOverflowsCanvasRightPx: btn && cr ? Math.round(btn.getBoundingClientRect().right - cr.right) : null,
    }
  }, id)

  const dragFirstChipToEditorStart = async (id) => {
    await page.evaluate((nid) => {
      const ed = document.querySelector(`.vue-flow__node[data-id="${nid}"] .inline-prompt-editor`)
      const chip = ed?.querySelectorAll('.inline-prompt-element')[0]
      if (!ed || !chip) return
      const dt = new DataTransfer()
      const opts = (extra) => Object.assign({ bubbles: true, cancelable: true, view: window, dataTransfer: dt }, extra)
      chip.dispatchEvent(new DragEvent('dragstart', opts({})))
      const er = ed.getBoundingClientRect()
      const target = { clientX: Math.round(er.left + 6), clientY: Math.round(er.top + 16) }
      ed.dispatchEvent(new DragEvent('dragover', opts(target)))
      ed.dispatchEvent(new DragEvent('drop', opts(target)))
      chip.dispatchEvent(new DragEvent('dragend', opts({})))
    }, id)
    await delay(500)
  }

  const screenshot = async (name) => {
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) })
  }

  return { snap, countChips, panelState, selectedNodeIds, countMarkButtons, listPanelButtons, openComposer, reopenComposer, closePanel, enterMarking, exitMarking, clickImage, waitRecognized, waitRecognizedCount, runGenerate, typeInEditor, placeCaretInTextSpan, typeRaw, switchAwayBack, rectsAndHits, dragFirstChipToEditorStart, screenshot }
}
