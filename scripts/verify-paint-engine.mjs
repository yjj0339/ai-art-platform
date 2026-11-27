// 引擎逻辑验收：不连后端、不调出图接口，只在浏览器里跑绘制内核的断言。
// 用法：node scripts/verify-paint-engine.mjs
//
// 说明：用 page.route 伪造一个 http 源（http://paint.test），把 paintEngine.js
// 直接喂给页面 import。这样不需要 Vite dev server，也不需要登录态。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const here = dirname(fileURLToPath(import.meta.url))
const ENGINE_SOURCE = readFileSync(join(here, '..', 'src', 'utils', 'paintEngine.js'), 'utf8')

const PAGE_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>paint engine test</title></head><body></body></html>'

const TEST_SCRIPT = `
import { PaintDocument, BRUSH_LIST, BRUSH_MAP, ERASER_BRUSH, PALETTE, BLEND_LIST } from '/engine.js'

const results = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })
}

function ink(doc, { brushId = 'ink', color = '#000000', size = 12, from = [30, 60], to = [170, 60], steps = 24, pressure = 0.9, opacity } = {}) {
  doc.beginStroke({ x: from[0], y: from[1], pressure, brushId, color, size, opacity })
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    doc.pushPoint(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, pressure)
  }
  return doc.endStroke()
}

function pixel(doc, x, y) {
  const canvas = doc.composeToCanvas()
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
  return [d[0], d[1], d[2], d[3]]
}

/** 16x16 亮度指纹，用来判断两种笔刷画出来是不是一个样 */
function signature(doc) {
  const canvas = doc.composeToCanvas(64, 64)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const data = ctx.getImageData(0, 0, 64, 64).data
  const cells = []
  for (let gy = 0; gy < 16; gy += 1) {
    for (let gx = 0; gx < 16; gx += 1) {
      let sum = 0
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const i = ((gy * 4 + y) * 64 + (gx * 4 + x)) * 4
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3
        }
      }
      cells.push(Math.round(sum / 16))
    }
  }
  return cells.join(',')
}

function darkCount(doc) {
  const canvas = doc.composeToCanvas(200, 250)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const data = ctx.getImageData(0, 0, 200, 250).data
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 200) count += 1
  }
  return count
}

/**
 * 数「与纯白有可见差异」的像素。
 * 喷枪 opacity 只有 0.14、水彩 0.3，压在白纸上亮度仍在 220 以上，
 * 用 darkCount 的 <200 阈值会把它们误判成「没画出东西」。
 */
function tintCount(doc, threshold = 246) {
  const canvas = doc.composeToCanvas(200, 250)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const data = ctx.getImageData(0, 0, 200, 250).data
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < threshold) count += 1
  }
  return count
}

try {
  // ---------- 0. 导出面 ----------
  check('导出 BRUSH_LIST 为 11 种笔刷', BRUSH_LIST.length === 11, BRUSH_LIST.length)
  check('BRUSH_MAP 含橡皮', BRUSH_MAP.eraser === ERASER_BRUSH)
  check('调色板 7 色', PALETTE.length === 7, PALETTE.length)
  check('混合模式 6 种', BLEND_LIST.length === 6, BLEND_LIST.length)
  const doc0 = new PaintDocument({ width: 200, height: 250 })
  ;['fill', 'pickColor', 'layerThumbnail', 'addImageLayer', 'exportDataUrl', 'setLayerProp', 'reorderLayer', 'compose', 'composeToCanvas']
    .forEach((name) => check('引擎有 ' + name + ' 方法', typeof doc0[name] === 'function'))

  // ---------- 1. 基础绘制 ----------
  const doc1 = new PaintDocument({ width: 200, height: 250 })
  ink(doc1)
  const center = pixel(doc1, 100, 60)
  check('画一笔中心处出墨', center[0] < 80 && center[3] === 255, center.join('/'))
  check('画一笔两端外仍是白纸', pixel(doc1, 100, 150)[0] > 250, pixel(doc1, 100, 150).join('/'))

  // ---------- 2. 橡皮不擦穿白纸 ----------
  const doc2 = new PaintDocument({ width: 200, height: 250 })
  ink(doc2, { color: '#000000', size: 30 })
  doc2.beginStroke({ x: 60, y: 60, pressure: 1, brushId: 'eraser', size: 40 })
  for (let i = 1; i <= 12; i += 1) doc2.pushPoint(60 + i * 6, 60, 1)
  doc2.endStroke()
  const erased = pixel(doc2, 100, 60)
  check('橡皮擦过之后是不透明白纸（不是透明洞）', erased[3] === 255 && erased[0] > 245, erased.join('/'))

  // ---------- 3. 撤销 / 重做 ----------
  const doc3 = new PaintDocument({ width: 200, height: 250 })
  ink(doc3)
  const afterDraw = pixel(doc3, 100, 60)
  doc3.undo()
  const afterUndo = pixel(doc3, 100, 60)
  doc3.redo()
  const afterRedo = pixel(doc3, 100, 60)
  check('撤销后画面回到白纸', afterUndo[0] > 250, afterUndo.join('/'))
  check('重做后恢复原样', Math.abs(afterRedo[0] - afterDraw[0]) <= 1, afterRedo[0] + ' vs ' + afterDraw[0])
  check('撤销到空后 canUndo=false', doc3.undo() === true && doc3.historyState.canUndo === false)

  // ---------- 4. 连画 130 笔触发历史上限 ----------
  const doc4 = new PaintDocument({ width: 200, height: 250 })
  for (let i = 0; i < 130; i += 1) {
    const y = 8 + i * 1.6
    ink(doc4, { from: [20, y], to: [180, y], steps: 6, size: 6, color: '#1f2937' })
  }
  check('史上限 120 生效', doc4.ops.length === 120, doc4.ops.length)
  const many = darkCount(doc4)
  check('超出上限后画面仍然完整（不是只剩最后几笔）', many > 500, many)
  doc4.undo()
  const afterTrimUndo = darkCount(doc4)
  check('超过上限后撤销仍然只退一笔', Math.abs(afterTrimUndo - many) < many * 0.2, afterTrimUndo + ' vs ' + many)

  // ---------- 5. 致命 bug 回归：填充 + 历史截断 + 撤销 ----------
  const doc5 = new PaintDocument({ width: 100, height: 100, maxOps: 3 })
  const fillOk = doc5.fill(50, 50, '#ff7a00')
  check('油漆桶填充生效', fillOk === true)
  const filledPixel = pixel(doc5, 10, 10)
  check('填充后角落是填充色', filledPixel[0] > 240 && filledPixel[1] > 110 && filledPixel[1] < 135, filledPixel.join('/'))
  // 再画 6 笔（超过 maxOps=3），把「填充」挤出历史、烘焙进 baseCanvas
  for (let i = 0; i < 6; i += 1) ink(doc5, { from: [10, 20 + i * 8], to: [90, 20 + i * 8], steps: 4, size: 4 })
  doc5.undo()
  doc5.undo()
  doc5.undo()
  doc5.undo()
  const survived = pixel(doc5, 10, 10)
  check('填充被挤出历史后撤销，底色依旧是填充色（不是纯黑/纯白）', survived[0] > 240 && survived[1] > 110 && survived[1] < 135, survived.join('/'))
  const cornerStill = pixel(doc5, 95, 95)
  check('撤销不会把整层刷成同色', cornerStill.join('/') === survived.join('/'), cornerStill.join('/'))

  // ---------- 6. 撤销重放使用记录里的透明度 ----------
  const doc6 = new PaintDocument({ width: 200, height: 250 })
  ink(doc6, { color: '#000000', size: 40, opacity: 0.25 })
  const halfTone = pixel(doc6, 100, 60)
  doc6.undo()
  doc6.redo()
  const halfTone2 = pixel(doc6, 100, 60)
  check('自定义透明度撤销重做后不变', Math.abs(halfTone[0] - halfTone2[0]) <= 1, halfTone[0] + ' vs ' + halfTone2[0])
  check('0.25 透明度确实比实心浅', halfTone[0] > 150, halfTone[0])

  // ---------- 7. 压缩感与画笔差异 ----------
  const doc7 = new PaintDocument({ width: 200, height: 250 })
  doc7.beginStroke({ x: 60, y: 40, pressure: 0.3, brushId: 'ink', color: '#000000', size: 20 })
  doc7.pushPoint(60, 80, 0.3)
  doc7.endStroke()
  const thinCount = darkCount(doc7)
  const doc7b = new PaintDocument({ width: 200, height: 250 })
  doc7b.beginStroke({ x: 60, y: 40, pressure: 1, brushId: 'ink', color: '#000000', size: 20 })
  doc7b.pushPoint(60, 80, 1)
  doc7b.endStroke()
  const thickCount = darkCount(doc7b)
  check('压感：压力大笔画更粗', thickCount > thinCount * 1.3, thinCount + ' vs ' + thickCount)

  // ---------- 8. 11 种笔刷各不相同 ----------
  const signatures = new Map()
  BRUSH_LIST.forEach((brush) => {
    const doc = new PaintDocument({ width: 200, height: 250 })
    ink(doc, { brushId: brush.id, color: '#2b3440', size: brush.size })
    const dark = darkCount(doc)
    const tint = tintCount(doc)
    signatures.set(brush.id, { sig: signature(doc), dark })
    check('笔刷「' + brush.name + '」能画出东西', tint > 20, tint)
  })
  const unique = new Set([...signatures.values()].map((v) => v.sig))
  check('11 种笔刷的指纹互不相同', unique.size === BRUSH_LIST.length, unique.size + '/' + BRUSH_LIST.length)
  if (unique.size !== BRUSH_LIST.length) {
    const seen = new Map()
    for (const [id, v] of signatures) {
      if (seen.has(v.sig)) results.push({ name: '  ↳ 撞脸：' + seen.get(v.sig) + ' 与 ' + id, ok: false, detail: '' })
      else seen.set(v.sig, id)
    }
  }

  // ---------- 9. 毛笔：快画更细 ----------
  const fast = new PaintDocument({ width: 200, height: 250 })
  fast.beginStroke({ x: 20, y: 60, pressure: 0.7, brushId: 'brushpen', color: '#000000', size: 24 })
  for (let i = 1; i <= 6; i += 1) fast.pushPoint(20 + i * 26, 60, 0.7)
  fast.endStroke()
  const slow = new PaintDocument({ width: 200, height: 250 })
  slow.beginStroke({ x: 20, y: 60, pressure: 0.7, brushId: 'brushpen', color: '#000000', size: 24 })
  for (let i = 1; i <= 40; i += 1) slow.pushPoint(20 + i * 4, 60, 0.7)
  slow.endStroke()
  check('毛笔快画比慢画细', darkCount(fast) < darkCount(slow), darkCount(fast) + ' vs ' + darkCount(slow))

  // ---------- 10. 吸管 ----------
  const doc10 = new PaintDocument({ width: 200, height: 250 })
  doc10.fill(100, 120, '#36bffa')
  const picked = doc10.pickColor(100, 120)
  check('吸管取到填充色', picked === '#36bffa', picked)
  // 注意：空透明图层上做洪水填充会整张铺满，所以「取纸面」必须换一个干净文档验，不能用 doc10
  const docBlank = new PaintDocument({ width: 200, height: 250 })
  check('吸管取纸面是白色', docBlank.pickColor(5, 5) === '#ffffff', docBlank.pickColor(5, 5))
  check('吸管越界返回 null', doc10.pickColor(-5, 5) === null)

  // ---------- 11. 锁定 / 隐藏图层不可画 ----------
  const doc11 = new PaintDocument({ width: 200, height: 250 })
  const layer11 = doc11.activeLayer
  doc11.setLayerProp(layer11.id, { locked: true })
  check('锁定图层不能起笔', doc11.beginStroke({ x: 10, y: 10, pressure: 1, brushId: 'ink' }) === false)
  check('锁定图层不能填充', doc11.fill(10, 10, '#ff0000') === false)
  check('锁定图层不能清空', doc11.clearActiveLayer() === false)
  doc11.setLayerProp(layer11.id, { locked: false, visible: false })
  check('隐藏图层不能起笔', doc11.canPaint() === false)

  // ---------- 12. 图层：增删 / 重排 / 透明度 / 混合 ----------
  const doc12 = new PaintDocument({ width: 200, height: 250 })
  const first = doc12.activeLayer
  const second = doc12.addLayer('第二层')
  check('新建图层插到最上面并成为活动层', doc12.layers[0].id === second.id && doc12.activeLayerId === second.id)
  check('重排图层生效', doc12.reorderLayer(second.id, 1) === true && doc12.layers[1].id === second.id, doc12.layers.map((l) => l.name).join('>'))
  doc12.reorderLayer(second.id, 0)
  check('透明度可设置', doc12.setLayerProp(second.id, { opacity: 0.4 }) === true && doc12.layers[0].opacity === 0.4)
  check('混合模式可设置', doc12.setLayerProp(second.id, { blend: 'multiply' }) === true && doc12.layers[0].blend === 'multiply')
  check('非法混合模式被拒', doc12.setLayerProp(second.id, { blend: 'nope' }) === false)
  check('只剩一层时不能删', doc12.removeLayer(first.id) === true && doc12.removeLayer(doc12.layers[0].id) === false)
  check('删层后画布尺寸归零释放显存', first.canvas.width === 0 && first.baseCanvas.width === 0, first.canvas.width)

  // ---------- 13. 贴图层 ----------
  const doc13 = new PaintDocument({ width: 200, height: 250 })
  const src = document.createElement('canvas')
  src.width = 300
  src.height = 300
  const sctx = src.getContext('2d')
  sctx.fillStyle = '#34d399'
  sctx.fillRect(0, 0, 300, 300)
  const imageLayer = doc13.addImageLayer('AI 图层', src, { fit: 'cover' })
  check('addImageLayer 返回新图层并置顶', imageLayer && doc13.layers[0].id === imageLayer.id)
  const coverPixel = pixel(doc13, 100, 120)
  check('贴图铺满画纸（cover）', coverPixel[1] > 180 && coverPixel[1] < 235, coverPixel.join('/'))
  doc13.undo()
  check('贴图层可以撤销', pixel(doc13, 100, 120)[0] > 250)

  // ---------- 14. 缩略图 / 导出 ----------
  const doc14 = new PaintDocument({ width: 200, height: 250 })
  ink(doc14)
  const thumb = doc14.layerThumbnail(doc14.activeLayerId, 56, 42)
  check('图层缩略图尺寸正确', thumb.width === 56 && thumb.height === 42)
  const dataUrl = doc14.exportDataUrl({ maxSize: 100, type: 'image/jpeg', quality: 0.7 })
  check('exportDataUrl 产出 jpeg dataURL', /^data:image\\/jpeg;base64,/.test(dataUrl), dataUrl.slice(0, 24))
  const blob = await doc14.exportBlob()
  check('exportBlob 产出 PNG', blob && blob.type === 'image/png' && blob.size > 100, blob && blob.size)

  // ---------- 15. 进行中的笔画不会写脏图层 ----------
  const doc15 = new PaintDocument({ width: 200, height: 250 })
  doc15.beginStroke({ x: 30, y: 60, pressure: 1, brushId: 'ink', size: 20 })
  doc15.pushPoint(170, 60, 1)
  const duringStroke = pixel(doc15, 100, 60)
  check('绘制中就能看到笔迹（预览）', duringStroke[0] < 80, duringStroke.join('/'))
  doc15.cancelStroke()
  check('cancelStroke 丢弃半成品笔画', pixel(doc15, 100, 60)[0] > 250 && doc15.ops.length === 0)

  // ---------- 16. 大画纸 smoke ----------
  const big = new PaintDocument({ width: 1200, height: 1500 })
  const t0 = performance.now()
  ink(big, { from: [100, 300], to: [1100, 300], steps: 60, size: 20 })
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = 600
  const ctx = canvas.getContext('2d')
  for (let i = 0; i < 10; i += 1) big.render(ctx, 480, 600, 1, { scale: 0.4, tx: 0, ty: 0 })
  const elapsed = performance.now() - t0
  check('1200×1500 连合 10 帧 < 1500ms', elapsed < 1500, Math.round(elapsed) + 'ms')
} catch (error) {
  results.push({ name: '测试脚本自身抛错', ok: false, detail: error && (error.stack || error.message) })
}

window.__paintEngineResults = results
`

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.route('http://paint.test/**', (route) => {
    const url = route.request().url()
    if (url.endsWith('/engine.js')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: ENGINE_SOURCE })
    }
    if (url.endsWith('/test.js')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: TEST_SCRIPT })
    }
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE_HTML })
  })
  await page.goto('http://paint.test/index.html', { waitUntil: 'domcontentloaded' })
  await page.addScriptTag({ type: 'module', url: 'http://paint.test/test.js' })
  await page.waitForFunction(() => Array.isArray(window.__paintEngineResults), null, { timeout: 120000 })
  const results = await page.evaluate(() => window.__paintEngineResults)

  const failed = results.filter((r) => !r.ok)
  results.forEach((r) => {
    const mark = r.ok ? 'PASS' : 'FAIL'
    const detail = r.detail ? `  (${r.detail})` : ''
    console.log(`${mark}  ${r.name}${detail}`)
  })
  if (consoleErrors.length) {
    console.log('\n页面运行时错误：')
    consoleErrors.forEach((e) => console.log('  ' + e))
  }
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`)
  if (failed.length || consoleErrors.length) process.exitCode = 1
} finally {
  await browser.close()
}
