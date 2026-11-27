// 诊断脚本（只读，不改业务代码）：复现「点了节点的生成按钮后节点无法拖拽」
// 用法：node scripts/diagnose-node-generate-lock.mjs
// 输出：终端诊断 + .diag-generate-lock/*.png
//
// 探针思路：
//   1) 基线：未生成过的节点能否拖动
//   2) 生成中（status=running）：能否拖动
//   3) 生成完成后：能否拖动
//   4) 拖不动时，用 elementFromPoint 抓出「按下的那一点上最上层的元素」是什么，
//      并打印它的 z-index / pointer-events / 尺寸，以及节点自身与卡片的几何关系。
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
const WEB_PORT = 5184
const OUT_DIR = path.join(projectDir, '.diag-generate-lock')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const lines = []
const log = (text) => { lines.push(text); console.log(text) }

let generateDelayMs = 1600
const generatedRequests = []

// 让「生成结果图」与「原有图」尺寸明显不同（16:9 宽扁），便于观察节点尺寸变化
const STUB_IMAGE = (() => {
  const w = 640
  const h = 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect x="0" y="0" width="${w / 2}" height="${h / 2}" fill="rgb(255,138,0)"/>` +
    `<rect x="${w / 2}" y="0" width="${w / 2}" height="${h / 2}" fill="rgb(0,122,255)"/>` +
    `<rect x="0" y="${h / 2}" width="${w / 2}" height="${h / 2}" fill="rgb(0,200,120)"/>` +
    `<rect x="${w / 2}" y="${h / 2}" width="${w / 2}" height="${h / 2}" fill="rgb(220,40,90)"/>` +
    `<text x="20" y="${h - 20}" font-size="36" fill="#111">GENERATED</text>` +
    `</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
})()

// ---------------- stub AI server ----------------
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { /* ignore */ }
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    if (req.method === 'POST' && url === '/api/ai/image/generate') {
      generatedRequests.push({ at: Date.now(), prompt: body.prompt })
      return setTimeout(() => send(200, {
        provider: 'stub',
        images: [{ imageUrl: STUB_IMAGE, title: 'stub', provider: 'stub', model: 'stub-image' }],
      }), generateDelayMs)
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

try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })

  const buildSeed = () => {
    if (sessionStorage.getItem('canvas-mode-seeded') === '1') return
    sessionStorage.setItem('canvas-mode-seeded', '1')
    const makeImage = (base, quad, center) => {
      const c = document.createElement('canvas')
      c.width = 480
      c.height = 480
      const ctx = c.getContext('2d')
      ctx.fillStyle = base; ctx.fillRect(0, 0, 480, 480)
      ctx.fillStyle = quad; ctx.fillRect(0, 0, 240, 240)
      ctx.fillStyle = center
      ctx.beginPath(); ctx.arc(240, 240, 60, 0, Math.PI * 2); ctx.fill()
      return c.toDataURL('image/png')
    }
    const imgA = makeImage('#f4f4f4', '#d5d5d5', '#ffd400')
    const imgB = makeImage('#eeeeee', '#8e44ad', '#e67e22')
    const imgC = makeImage('#2ecc71', '#27ae60', '#f1c40f')
    const canvas = {
      version: 2,
      nodes: [
        { id: 'upload-1', type: 'upload', position: { x: 20, y: 340 }, data: { title: '图片', originalName: '上游素材图', image: imgB } },
        {
          id: 'image-1', type: 'image', position: { x: 80, y: -20 },
          data: {
            title: '图像生成', mode: 'image-generation', prompt: '一只小狗走在草地上', status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1', resolution: '1080P' },
            output: { url: imgA, imageData: imgA, assetId: '', originalName: '编辑中的输出图', provider: 'seed', model: 'seed-image' },
            outputAspectRatio: 1, error: '',
          },
        },
        {
          id: 'image-2', type: 'image', position: { x: 520, y: -20 },
          data: {
            title: '图像生成', mode: 'image-generation', prompt: '一颗青苹果', status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1', resolution: '1080P' },
            output: { url: imgC, imageData: imgC, assetId: '', originalName: '对照图', provider: 'seed', model: 'seed-image' },
            outputAspectRatio: 1, error: '',
          },
        },
        {
          // 专门放在 image-1 正下方：用来验证「卡片是否盖住下方节点」
          id: 'image-3', type: 'image', position: { x: 80, y: 250 },
          data: {
            title: '图像生成', mode: 'image-generation', prompt: '下方的节点', status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1', resolution: '1080P' },
            output: { url: imgC, imageData: imgC, assetId: '', originalName: '下方节点图', provider: 'seed', model: 'seed-image' },
            outputAspectRatio: 1, error: '',
          },
        },
        {
          // 「生成配置」节点：它的按钮文字就是「生成」，最贴近用户描述
          id: 'config-1', type: 'config', position: { x: 620, y: 300 },
          data: {
            mode: 'generation-config', title: '生成配置', generationType: 'image',
            prompt: '一只橘猫坐在窗台上', model: 'agnes-image-2.0-flash', ratio: '1:1',
          },
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
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '诊断学生', role: 'student', className: '诊断班', avatar: '诊' }, token: 'mock-token-project-new-art-studio' }))
  })
  await context.addInitScript(buildSeed)
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Devtools|Development mode|\[Vue warn\]/i.test(m.text())) consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e)))

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
  await delay(900)
  const paletteClose = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await paletteClose.count()) await paletteClose.first().click().catch(() => {})
  await delay(300)

  // 主线程长任务观察器：卡顿型「拖不动」会表现为大量 longtask
  await page.evaluate(() => {
    window.__longTasks = []
    if (window.PerformanceObserver) {
      try {
        new PerformanceObserver((list) => {
          list.getEntries().forEach((e) => window.__longTasks.push({ dur: Math.round(e.duration), at: Math.round(e.startTime) }))
        }).observe({ entryTypes: ['longtask'] })
      } catch { /* 不支持则忽略 */ }
    }
  })

  // 快照体量探针：生成前后画布数据的体量与序列化开销（大图 base64 会把这里撑爆）
  const measureSnapshot = async (label) => {
    const info = await page.evaluate(() => {
      const raw = localStorage.getItem('ai-workflow-canvas-stage1-v2') || ''
      let serializeMs = 0
      try { const t0 = performance.now(); JSON.stringify(JSON.parse(raw)); serializeMs = performance.now() - t0 } catch { /* ignore */ }
      let writeMs = -1
      try { const t1 = performance.now(); localStorage.setItem('__diag_probe__', raw); writeMs = performance.now() - t1; localStorage.removeItem('__diag_probe__') } catch { writeMs = -1 }
      let imageBytes = 0
      try {
        const parsed = JSON.parse(raw)
        for (const n of parsed.nodes || []) {
          for (const k of ['imageData', 'image']) if (typeof n.data?.[k] === 'string') imageBytes += n.data[k].length
          if (typeof n.data?.output?.imageData === 'string') imageBytes += n.data.output.imageData.length
          for (const v of n.data?.outputVariants || []) if (typeof v.imageData === 'string') imageBytes += v.imageData.length
        }
      } catch { /* ignore */ }
      return { bytes: raw.length, serializeMs: Math.round(serializeMs * 10) / 10, writeMs: Math.round(writeMs * 10) / 10, imageBytes }
    })
    const mb = (n) => (n / 1048576).toFixed(2)
    log(`[快照体量] ${label} → localStorage=${info.bytes}B(${mb(info.bytes)}MB)，其中图片 base64=${mb(info.imageBytes)}MB | JSON 反+序列化=${info.serializeMs}ms | localStorage 写入=${info.writeMs}ms`)
    return info
  }

  const readLongTasks = async (label) => {
    const tasks = await page.evaluate(() => (window.__longTasks || []).slice(-12))
    const total = tasks.reduce((sum, t) => sum + t.dur, 0)
    log(`[长任务] ${label} → 共 ${tasks.length} 条（合计 ${total}ms）：${JSON.stringify(tasks)}`)
    return tasks
  }

  // ---------- 工具函数 ----------

  // 读节点在「画布坐标系」里的位置：节点 wrapper 的 style.transform = translate(Xpx, Ypx)
  // ⚠️ 必须用画布坐标判断是否被拖动：屏幕坐标(boundingBox)会因右侧面板开合使画布平移而变化，产生假阳性
  const readCanvasPos = (nodeId) => page.evaluate((id) => {
    const el = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
    if (!el) return null
    const raw = el.style.transform || ''
    const m = /translate\(\s*(-?[\d.]+)px[,\s]+(-?[\d.]+)px/.exec(raw)
    return { x: m ? Math.round(parseFloat(m[1]) * 100) / 100 : null, y: m ? Math.round(parseFloat(m[2]) * 100) / 100 : null, raw }
  }, nodeId)

  // 拖拽探针：在节点上按相对位置取一点按下，水平拖 120px，用「画布坐标」判断节点是否真的移动
  const probeDrag = async (nodeId, label, rx = 0.12, ry = 0.62) => {
    const sel = `.vue-flow__node[data-id="${nodeId}"]`
    const boxBefore = await page.locator(sel).boundingBox()
    const posBefore = await readCanvasPos(nodeId)
    if (!boxBefore) {
      log(`[拖拽探针] ${label} → 找不到节点 ${nodeId}`)
      return { moved: null }
    }
    const startX = boxBefore.x + boxBefore.width * rx
    const startY = boxBefore.y + boxBefore.height * ry
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      const chain = []
      let cur = el
      for (let i = 0; i < 6 && cur; i += 1) {
        const cs = getComputedStyle(cur)
        chain.push({
          tag: cur.tagName.toLowerCase(),
          cls: String(cur.className || '').slice(0, 110),
          z: cs.zIndex,
          pe: cs.pointerEvents,
          pos: cs.position,
        })
        cur = cur.parentElement
      }
      return chain
    }, { x: startX, y: startY })
    const hitsNoDrag = Array.isArray(hit) && hit.some((h) => /\bnodrag\b/.test(h.cls))

    // 事件级记录：pointerdown / pointermove / pointerup 是否真的到达节点，是否被 preventDefault
    await page.evaluate(() => {
      window.__dragLog = []
      if (!window.__dragRecorder) {
        window.__dragRecorder = true
        const rec = (type) => (e) => {
          window.__dragLog.push({
            t: type,
            target: String(e.target?.className || e.target?.tagName || '').slice(0, 52),
            prevented: Boolean(e.defaultPrevented),
            buttons: e.buttons,
            x: Math.round(e.clientX), y: Math.round(e.clientY),
          })
        }
        ;['pointerdown', 'pointermove', 'pointerup'].forEach((tp) => document.addEventListener(tp, rec(tp), true))
      }
    })

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 40, startY, { steps: 6 })
    const midPos = await readCanvasPos(nodeId)
    await page.mouse.move(startX + 120, startY, { steps: 8 })
    await page.mouse.up()
    await delay(320)
    const posAfter = await readCanvasPos(nodeId)
    const boxAfter = await page.locator(sel).boundingBox()
    const dragLog = await page.evaluate(() => (window.__dragLog || []).slice(0, 12))
    const vueFlowCls = await page.evaluate(() => document.querySelector('.vue-flow')?.className || '')
    const paneCls = await page.evaluate(() => document.querySelector('.vue-flow__pane')?.className || '')
    const selectedCount = await page.evaluate(() => document.querySelectorAll('.vue-flow__node.selected').length)
    const dxCanvas = posAfter && posBefore && posAfter.x !== null && posBefore.x !== null ? Math.round((posAfter.x - posBefore.x) * 100) / 100 : null
    const dxScreen = boxAfter ? Math.round(boxAfter.x - boxBefore.x) : null
    const moved = dxCanvas !== null && Math.abs(dxCanvas) >= 40
    log(`[拖拽探针] ${label} → 相对(${rx},${ry}) 绝对(${Math.round(startX)},${Math.round(startY)}) 画布坐标 dx=${dxCanvas}（屏幕 dx=${dxScreen}） ${moved ? '可拖动 ✓' : '拖不动 ✗'}${hitsNoDrag ? '  ← 按下点命中 nodrag 元素' : ''}`)
    log(`          transform: 前=${posBefore?.raw} 中=${midPos?.raw} 后=${posAfter?.raw}`)
    log(`          vue-flow class=${vueFlowCls} | pane class=${paneCls} | 选中节点数=${selectedCount}`)
    log(`          事件记录：${JSON.stringify(dragLog)}`)
    log(`          按下点命中链：${JSON.stringify(hit)}`)
    return { moved, dxCanvas, dxScreen, hit, hitsNoDrag, posBefore, posAfter, dragLog }
  }

  // 在节点上扫 3x3 网格，报告每个位置的按下点归属（是否仍在节点内）
  const scanDragSpots = async (nodeId, label) => {
    const sel = `.vue-flow__node[data-id="${nodeId}"]`
    const box = await page.locator(sel).boundingBox()
    if (!box) return
    log(`\n[网格命中扫描] ${label} · 节点盒子 ${JSON.stringify({ x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) })}`)
    const grid = [[0.15, 0.2], [0.5, 0.2], [0.85, 0.2], [0.15, 0.5], [0.5, 0.5], [0.85, 0.5], [0.15, 0.85], [0.5, 0.85], [0.85, 0.85]]
    const rows = []
    for (const [rx, ry] of grid) {
      const x = box.x + box.width * rx
      const y = box.y + box.height * ry
      const desc = await page.evaluate(({ x, y, id }) => {
        const el = document.elementFromPoint(x, y)
        if (!el) return 'null'
        const cls = cls2 => String(cls2 || '').split(' ').filter(Boolean).slice(0, 2).join('.')
        const owner = el.closest('.vue-flow__node')
        const nodrag = el.closest('.nodrag')
        return `${el.tagName.toLowerCase()}.${cls(el.className)} | 属于节点=${owner?.getAttribute('data-id') || '无'} | nodrag=${nodrag ? cls(nodrag.className) : '否'}`
      }, { x, y, id: nodeId })
      rows.push(`  (${rx},${ry}) → ${desc}`)
    }
    log(rows.join('\n'))
  }

  // 抓节点区域内的所有「悬浮层」（absolute/fixed 定位的子元素），复现覆盖问题
  const dumpOverlays = async (nodeId, label) => {
    const info = await page.evaluate((id) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      if (!wrap) return null
      const wrapRect = wrap.getBoundingClientRect()
      const article = wrap.firstElementChild
      const artRect = article ? article.getBoundingClientRect() : wrapRect
      const overlays = []
      wrap.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el)
        if (cs.position !== 'absolute' && cs.position !== 'fixed') return
        const r = el.getBoundingClientRect()
        if (r.width < 4 || r.height < 4) return
        overlays.push({
          cls: String(el.className || '').slice(0, 90),
          pos: cs.position,
          z: cs.zIndex,
          pe: cs.pointerEvents,
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          coversNode: r.left <= artRect.left + 2 && r.top <= artRect.top + 2 && r.right >= artRect.right - 2 && r.bottom >= artRect.bottom - 2,
        })
      })
      const scrims = [...document.querySelectorAll('.prompt-zoom-scrim, [class*="scrim"], [class*="mask-layer"], [class*="overlay"]')]
        .map((el) => ({ cls: String(el.className || '').slice(0, 80), rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] })(), pe: getComputedStyle(el).pointerEvents, z: getComputedStyle(el).zIndex }))
      const articleStyle = article ? { w: Math.round(artRect.width), h: Math.round(artRect.height), cls: String(article.className).slice(0, 90) } : null
      const flowPane = document.querySelector('.vue-flow__pane')
      return { articleStyle, overlays, scrims, wrapCls: String(wrap.className).slice(0, 90), flowPanePointerEvents: flowPane ? getComputedStyle(flowPane).pointerEvents : '' }
    }, nodeId)
    log(`\n[覆盖层快照] ${label}`)
    log(JSON.stringify(info, null, 1))
    return info
  }

  const dumpNodeState = async (nodeId, label) => {
    const state = await page.evaluate((id) => {
      const raw = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}')
      const node = (raw.nodes || []).find((n) => n.id === id)
      const wrap = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      return {
        status: node?.data?.status,
        error: node?.data?.error || '',
        position: node?.position,
        wrapTransform: wrap?.style?.transform || '',
        draggableAttr: wrap?.getAttribute('draggable'),
        nodesDraggableProp: wrap?.closest('.vue-flow')?.className || '',
      }
    }, nodeId)
    log(`[节点状态] ${label} → ${JSON.stringify(state)}`)
    return state
  }

  const clickGenerateOnCard = async (nodeId) => {
    // 先选中节点，让卡片出现
    await page.evaluate((id) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${id}"]`)
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, nodeId)
    await delay(500)
    const btn = page.locator(`.vue-flow__node[data-id="${nodeId}"] .node-run-button`)
    const count = await btn.count()
    log(`\n[动作] 节点 ${nodeId} 卡片内 .node-run-button 数量 = ${count}`)
    if (!count) return false
    await btn.first().click()
    return true
  }

  log('================ 0. 卡片遮挡对照：卡片常驻后，下方节点还能拖吗 ================')
  await page.evaluate(() => {
    const wrap = document.querySelector('.vue-flow__node[data-id="image-1"]')
    if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await delay(700)
  const cover0 = await page.evaluate(() => {
    const panel = document.querySelector('.vue-flow__node[data-id="image-1"] .node-follow-panel')
    const target = document.querySelector('.vue-flow__node[data-id="image-3"]')?.firstElementChild
    if (!panel || !target) return null
    const p = panel.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    const ow = Math.max(0, Math.min(p.right, t.right) - Math.max(p.left, t.left))
    const oh = Math.max(0, Math.min(p.bottom, t.bottom) - Math.max(p.top, t.top))
    return {
      panelRect: [Math.round(p.x), Math.round(p.y), Math.round(p.width), Math.round(p.height)],
      nodeRect: [Math.round(t.x), Math.round(t.y), Math.round(t.width), Math.round(t.height)],
      overlapPx: [Math.round(ow), Math.round(oh)],
      coveredPercent: t.height ? Math.round((oh / t.height) * 100) : 0,
    }
  })
  log(`[卡片遮挡] image-1 卡片 vs 正下方 image-3 → ${JSON.stringify(cover0)}`)
  await page.screenshot({ path: path.join(OUT_DIR, '00-card-covers-node.png') })
  await probeDrag('image-3', '被卡片覆盖的下方节点·上半 15%', 0.5, 0.15)
  await probeDrag('image-3', '被卡片覆盖的下方节点·下半 85%', 0.5, 0.85)
  await probeDrag('image-1', '卡片所属节点自身·62%', 0.5, 0.62)
  await page.mouse.click(1050, 900)
  await delay(500)
  await probeDrag('image-3', '卡片收起后（点空白）·image-3', 0.5, 0.15)

  log('================ 1. 基线：未生成的对照组节点 ================')
  await measureSnapshot('生成前（画布 baseline）')
  await probeDrag('image-2', '基线·image-2（未点生成）')
  await probeDrag('image-2', '基线重试·image-2（同一点再来一次）')
  await delay(1500)
  await probeDrag('image-2', '基线·image-2（再等 1.5s 后·换 0.5/0.62 位置）', 0.5, 0.62)
  await dumpOverlays('image-2', '基线·image-2')

  log('\n================ 2. 点 image-1 卡片内的生成按钮 ================')
  await dumpNodeState('image-1', '点击前')
  const clicked = await clickGenerateOnCard('image-1')
  if (!clicked) {
    log('!! 卡片里没有找到生成按钮，改用右侧设置面板的「开始生成」')
    await page.evaluate(() => {
      const wrap = document.querySelector('.vue-flow__node[data-id="image-1"]')
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })
    await delay(400)
    await page.locator('.generate-button').first().click()
  }

  await delay(400)
  await dumpNodeState('image-1', '点击后 ~0.4s（应为 running）')
  await dumpOverlays('image-1', '生成中（running）')
  await probeDrag('image-1', '生成中·image-1')
  await page.screenshot({ path: path.join(OUT_DIR, '01-during-running.png') })

  // 等生成完成
  for (let i = 0; i < 30; i += 1) {
    const st = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}')
      return (raw.nodes || []).find((n) => n.id === 'image-1')?.data?.status
    })
    if (st && st !== 'running') break
    await delay(300)
  }
  await delay(800)
  log('\n================ 3. 生成完成后 ================')
  await dumpNodeState('image-1', '生成完成')
  await measureSnapshot('生成后（结果图已写入 data.output.imageData）')
  await readLongTasks('生成完成后')
  await dumpOverlays('image-1', '生成完成后')
  await probeDrag('image-1', '生成完成后·image-1')
  await page.screenshot({ path: path.join(OUT_DIR, '02-after-generated.png') })

  log('\n================ 4. 追加对照：点击画布空白后再拖 ================')
  await page.mouse.click(1050, 900)
  await delay(500)
  await dumpNodeState('image-1', '取消选中后')
  await probeDrag('image-1', '取消选中后·image-1')

  log('\n================ 5. 对照：卡片是否盖住「下方节点」 ================')
  await page.mouse.click(1050, 900)
  await delay(400)
  // 让 image-1 卡片常驻（点生成时就是常驻的），再去拖下方的 image-3
  await page.evaluate(() => {
    const wrap = document.querySelector('.vue-flow__node[data-id="image-1"]')
    if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await delay(500)
  const coverInfo = await page.evaluate(() => {
    const panel = document.querySelector('.vue-flow__node[data-id="image-1"] .node-follow-panel')
    const target = document.querySelector('.vue-flow__node[data-id="image-3"]')?.firstElementChild
    if (!panel || !target) return null
    const p = panel.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    const overlapW = Math.max(0, Math.min(p.right, t.right) - Math.max(p.left, t.left))
    const overlapH = Math.max(0, Math.min(p.bottom, t.bottom) - Math.max(p.top, t.top))
    return {
      panelRect: [Math.round(p.x), Math.round(p.y), Math.round(p.width), Math.round(p.height)],
      nodeRect: [Math.round(t.x), Math.round(t.y), Math.round(t.width), Math.round(t.height)],
      overlapPx: [Math.round(overlapW), Math.round(overlapH)],
      coveredPercent: t.height ? Math.round((overlapH / t.height) * 100) : 0,
    }
  })
  log(`[卡片遮挡] image-1 卡片 vs 下方 image-3 → ${JSON.stringify(coverInfo)}`)
  await probeDrag('image-3', '被卡片盖住的下方节点 image-3（上方 30% 位置）', 0.5, 0.15)
  await probeDrag('image-3', '被卡片盖住的下方节点 image-3（下方 85% 位置）', 0.5, 0.85)
  await page.screenshot({ path: path.join(OUT_DIR, '03-card-covers-node.png') })

  log('\n================ 6. 对照：进入「标记」模式后拖拽 ================')
  await page.mouse.click(1050, 900)
  await delay(400)
  // 把 image-1 拖回画布左侧：卡片 626px 宽，节点靠右时卡片会伸到右侧面板下面，按钮点不到
  {
    const boxNow = await page.locator('.vue-flow__node[data-id="image-1"]').boundingBox()
    if (boxNow && boxNow.x > 380) {
      await page.mouse.move(boxNow.x + boxNow.width / 2, boxNow.y + boxNow.height * 0.85)
      await page.mouse.down()
      await page.mouse.move(boxNow.x + boxNow.width / 2 - 420, boxNow.y + boxNow.height * 0.85, { steps: 10 })
      await page.mouse.up()
      await delay(400)
      log('[动作] 已把 image-1 拖回画布左侧，便于点卡片按钮')
    }
  }
  await page.evaluate(() => {
    const wrap = document.querySelector('.vue-flow__node[data-id="image-1"]')
    if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await delay(500)
  const markBtn = page.locator('.vue-flow__node[data-id="image-1"] .composer-asset-button[title="标记"]')
  log(`[动作] 卡片里「标记」按钮数量 = ${await markBtn.count()}`)
  if (await markBtn.count()) {
    try { await markBtn.first().click({ timeout: 5000 }) } catch (e) { log(`!! 「标记」按钮点击失败（可能被右侧面板遮挡）：${String(e).slice(0, 160)}`) }
    await delay(500)
    const st = await page.evaluate(() => ({
      markModeBar: Boolean(document.querySelector('.mark-mode-bar')),
      modeBarText: document.querySelector('.mark-mode-bar')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 90) || '',
      canvasAreaClass: document.querySelector('.canvas-area')?.className,
    }))
    log(`[标记模式已进入] ${JSON.stringify(st)}`)
    await probeDrag('image-1', '标记模式下·image-1', 0.5, 0.12)
    await page.screenshot({ path: path.join(OUT_DIR, '04-marking-mode.png') })

    log('\n================ 7. 在标记模式下点「生成图像」再拖 ================')
    const runBtn = page.locator('.vue-flow__node[data-id="image-1"] .node-run-button')
    if (await runBtn.count()) {
      try { await runBtn.first().click({ timeout: 5000 }) } catch (e) { log(`!! 生成按钮点击失败：${String(e).slice(0, 160)}`) }
      log('[动作] 已在标记模式下点击「生成图像」')
      for (let i = 0; i < 30; i += 1) {
        const s = await page.evaluate(() => JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}').nodes?.find((n) => n.id === 'image-1')?.data?.status)
        if (s && s !== 'running') break
        await delay(300)
      }
      await delay(600)
      const afterGen = await page.evaluate(() => ({
        status: JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}').nodes?.find((n) => n.id === 'image-1')?.data?.status,
        markModeBar: Boolean(document.querySelector('.mark-mode-bar')),
      }))
      log(`[生成完成后状态] ${JSON.stringify(afterGen)}`)
      await probeDrag('image-1', '标记模式下·生成完成后·image-1', 0.5, 0.12)
      await page.screenshot({ path: path.join(OUT_DIR, '05-marking-then-generated.png') })
    } else {
      log('!! 未找到生成按钮')
    }

    // Esc 退出标记模式，确认恢复
    await page.keyboard.press('Escape')
    await delay(500)
    const left = await page.evaluate(() => ({ markModeBar: Boolean(document.querySelector('.mark-mode-bar')) }))
    log(`[Esc 之后] ${JSON.stringify(left)}`)
    await probeDrag('image-1', '退出标记模式后·image-1', 0.5, 0.62)
  }

  log('\n================ 8. 对照：放大提示词卡片（放大态）后拖拽 ================')
  await page.mouse.click(1050, 900)
  await delay(400)
  await page.evaluate(() => {
    const wrap = document.querySelector('.vue-flow__node[data-id="image-1"]')
    if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await delay(500)
  const zoomBtn = page.locator('.vue-flow__node[data-id="image-1"] .composer-zoom-button')
  if (await zoomBtn.count()) {
    try { await zoomBtn.first().click({ timeout: 5000 }) } catch (e) { log(`!! 放大按钮点击失败（大概率被右侧面板遮挡）：${String(e).slice(0, 160)}`) }
    await delay(600)
    const zoomState = await page.evaluate(() => ({
      scrim: Boolean(document.querySelector('.prompt-zoom-scrim')),
      canvasAreaClass: document.querySelector('.canvas-area')?.className,
      panelParent: document.querySelector('.node-follow-panel')?.parentElement?.tagName || '',
    }))
    log(`[放大态] ${JSON.stringify(zoomState)}`)
    await probeDrag('image-1', '放大态·image-1（画布被遮罩冻结）', 0.5, 0.62)
    await page.screenshot({ path: path.join(OUT_DIR, '06-zoom-open.png') })
    await page.keyboard.press('Escape')
    await delay(500)
    await probeDrag('image-1', 'Esc 退出放大态后·image-1', 0.5, 0.62)
  } else {
    log('!! 未找到放大按钮')
  }

  log('\n================ 11. 「生成配置」节点的「生成」按钮（按钮文字就是「生成」） ================')
  await page.mouse.click(1050, 900)
  await delay(400)
  await probeDrag('config-1', '点击前·config-1')
  const nodesBefore = await page.evaluate(() => Array.from(document.querySelectorAll('.vue-flow__node')).map((el) => el.getAttribute('data-id')))
  log(`[节点清单] 生成前：${JSON.stringify(nodesBefore)}`)
  const run2 = page.locator('.vue-flow__node[data-id="config-1"] .generation-config-run')
  log(`[动作] config-1 的「生成」按钮数量 = ${await run2.count()}`)
  if (await run2.count()) {
    try { await run2.first().click({ timeout: 5000 }) } catch (e) { log(`!! 「生成」按钮点击失败：${String(e).slice(0, 160)}`) }
    await delay(1500)
    const nodesAfter = await page.evaluate(() => Array.from(document.querySelectorAll('.vue-flow__node')).map((el) => el.getAttribute('data-id')))
    log(`[节点清单] 生成后：${JSON.stringify(nodesAfter)}`)
    const newId = nodesAfter.find((id) => !nodesBefore.includes(id))
    log(`[新节点] ${newId || '(无新节点)'}`)
    await measureSnapshot('config 生成后')
    await readLongTasks('config 生成后')
    if (newId) await probeDrag(newId, `新建节点 ${newId}`)
    await probeDrag('config-1', '生成后·config-1（原配置节点）')
    await probeDrag('image-1', '生成后·image-1')
  }

  log('\n================ 12. 「生成配置」节点哪些位置能拖（3×3 网格逐点真拖） ================')
  const scanNodeGrid = async (nodeId, label) => {
    const sel = `.vue-flow__node[data-id="${nodeId}"]`
    const box = await page.locator(sel).boundingBox()
    if (!box) { log(`[网格扫描] ${label} → 找不到节点`); return }
    log(`\n[网格扫描] ${label} · 屏幕盒子 x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}（画布可视区大约 x 86~1110）`)
    const grid = [[0.1, 0.08], [0.5, 0.08], [0.9, 0.08], [0.1, 0.5], [0.5, 0.5], [0.9, 0.5], [0.1, 0.92], [0.5, 0.92], [0.9, 0.92]]
    const rows = []
    for (const [rx, ry] of grid) {
      const before = await readCanvasPos(nodeId)
      const x = box.x + box.width * rx
      const y = box.y + box.height * ry
      const info = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        if (!el) return { hit: 'null', nodrag: '否' }
        const nd = el.closest('.nodrag')
        return {
          hit: `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')}`,
          nodrag: nd ? String(nd.className).split(' ').slice(0, 2).join('.') : '否',
          inCanvas: x >= 86 && x <= 1110,
        }
      }, { x, y })
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 60, y, { steps: 8 })
      await page.mouse.up()
      await delay(220)
      const after = await readCanvasPos(nodeId)
      const dx = after && before ? Math.round((after.x - before.x) * 10) / 10 : null
      const ok = Math.abs(dx || 0) > 20
      rows.push(`  (${rx},${ry}) 绝对(${Math.round(x)},${Math.round(y)}) 画布dx=${dx} ${ok ? '可拖 ✓' : '拖不动 ✗'} | 命中=${info.hit} | nodrag层=${info.nodrag} | 在画布内=${info.inCanvas}`)
      if (ok) {
        // 复位，避免后续点位偏移
        const cur = await page.locator(sel).boundingBox()
        if (cur) {
          const cx = cur.x + cur.width * rx
          const cy = cur.y + cur.height * ry
          await page.mouse.move(cx, cy)
          await page.mouse.down()
          await page.mouse.move(cx - 60, cy, { steps: 8 })
          await page.mouse.up()
          await delay(200)
        }
      }
    }
    log(rows.join('\n'))
  }
  await scanNodeGrid('config-1', '「生成配置」节点 config-1')
  await page.screenshot({ path: path.join(OUT_DIR, '07-config-node-grid.png') })
  await scanNodeGrid('image-1', '对照组：普通图片节点 image-1')

  log('\n================ 13. 「生成配置」→ 新建节点的落点 ================')
  const newPos = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('.vue-flow__node')).map((el) => el.getAttribute('data-id'))
    const id = ids.find((v) => /^image-\d{6,}-/.test(String(v)))
    const el = id ? document.querySelector(`.vue-flow__node[data-id="${id}"]`) : null
    if (!el) return { id: null }
    const r = el.getBoundingClientRect()
    const area = document.querySelector('.canvas-area').getBoundingClientRect()
    const panel = document.querySelector('.right-panel')?.getBoundingClientRect()
    return {
      id,
      transform: el.style.transform,
      screenRect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      canvasArea: [Math.round(area.x), Math.round(area.right)],
      rightPanelLeft: panel ? Math.round(panel.left) : null,
      visibleWidthPx: Math.round(Math.max(0, Math.min(r.right, area.right) - Math.max(r.left, area.x))),
      coveredByPanelPx: panel ? Math.round(Math.max(0, Math.min(r.right, panel.right) - Math.max(r.left, panel.left))) : 0,
    }
  })
  log(`[新节点落点] ${JSON.stringify(newPos)}`)

  log('\n================ 14. 其它可能相关的全局状态 ================')
  const globals = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return { sel, cls: String(el.className).slice(0, 80), pe: cs.pointerEvents, z: cs.zIndex, display: cs.display, pos: cs.position, rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] })() }
    }
    const area = document.querySelector('.canvas-area')?.getBoundingClientRect()
    const panel = document.querySelector('.right-panel')?.getBoundingClientRect()
    const overlap = area && panel
      ? {
          overlapW: Math.round(Math.max(0, Math.min(area.right, panel.right) - Math.max(area.left, panel.left))),
          panelCoversCanvasRight: panel.left < area.right,
          canvasRight: Math.round(area.right),
          panelLeft: Math.round(panel.left),
        }
      : null
    return {
      canvasArea: pick('.canvas-area'),
      flowCanvas: pick('.flow-canvas'),
      vueFlow: pick('.vue-flow'),
      pane: pick('.vue-flow__pane'),
      nodesLayer: pick('.vue-flow__nodes'),
      scrim: pick('.prompt-zoom-scrim'),
      elMessage: pick('.el-message'),
      zoomBtn: pick('.composer-zoom-button'),
      markingBar: pick('.mark-mode-bar'),
      marqueeHint: pick('.marquee-hint'),
      rightPanel: pick('.right-panel'),
      assistantContent: pick('.assistant-content'),
      nodeSettings: pick('.node-settings, .settings-panel, .panel-settings'),
      canvasAreaOverflow: (() => { const el = document.querySelector('.canvas-area'); return el ? getComputedStyle(el).overflow : '' })(),
      workflowShellOverflow: (() => { const el = document.querySelector('.canvas-area')?.parentElement; return el ? `${el.className} overflow=${getComputedStyle(el).overflow}` : '' })(),
      overlap,
    }
  })
  log(JSON.stringify(globals, null, 1))

  log('\n================ 10. 面板开合是否会平移画布（假拖动风险） ================')
  const geoA = await page.evaluate(() => {
    const a = document.querySelector('.canvas-area')?.getBoundingClientRect()
    const w = document.querySelector('.vue-flow__viewport')?.style.transform || ''
    return { canvas: a ? [Math.round(a.x), Math.round(a.width)] : null, viewport: w }
  })
  await page.evaluate(() => {
    const wrap = document.querySelector('.vue-flow__node[data-id="image-1"]')
    if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await delay(500)
  const runBtn2 = page.locator('.vue-flow__node[data-id="image-1"] .node-run-button')
  if (await runBtn2.count()) {
    try { await runBtn2.first().click({ timeout: 4000 }) } catch { log('!! 生成按钮点击失败') }
    await delay(1600)
  }
  const geoB = await page.evaluate(() => {
    const a = document.querySelector('.canvas-area')?.getBoundingClientRect()
    const w = document.querySelector('.vue-flow__viewport')?.style.transform || ''
    return { canvas: a ? [Math.round(a.x), Math.round(a.width)] : null, viewport: w }
  })
  log(`[几何] 点生成前 画布=[x,宽]=${JSON.stringify(geoA.canvas)} viewport=${geoA.viewport}`)
  log(`[几何] 点生成后 画布=[x,宽]=${JSON.stringify(geoB.canvas)} viewport=${geoB.viewport}`)

  log(`\n[控制台错误] ${consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 8), null, 1) : '（无）'}`)
  log(`[stub 收到的生成请求数] ${generatedRequests.length}`)

  await browser.close()
} finally {
  killTree(vite)
  stub.close()
}

console.log('\n诊断结束，截图见 .diag-generate-lock/')
