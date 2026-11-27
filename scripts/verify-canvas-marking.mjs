// 画布「局部元素提取引用（标记）」端到端验收脚本
// 用法：node scripts/verify-canvas-marking.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3211
const WEB_PORT = 5175
const OUT_DIR = path.join(projectDir, '.marking-verify')
const SOURCE_IMAGE = path.join(projectDir, 'public', 'canvas-demo-sneaker.png')
const STORAGE_KEY = 'ai-workflow-canvas-stage1-v2'

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const captured = { describe: [], generate: [], other: [] }
const results = {}
const failures = []

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}`)
}

// ---------------- stub AI server ----------------
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch {}
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    if (req.method === 'POST' && url === '/api/ai/image/describe-region') {
      captured.describe.push(body)
      return send(200, { description: '橘猫头部', provider: 'stub', model: 'stub-vision' })
    }
    if (req.method === 'POST' && url === '/api/ai/image/generate') {
      captured.generate.push(body)
      return send(200, { provider: 'stub', taskId: 'task-stub', images: [{ imageUrl: TINY_PNG, title: 'stub', provider: 'stub', model: 'stub-image' }] })
    }
    captured.other.push({ method: req.method, url })
    if (url.startsWith('/api/')) return send(200, { ok: true })
    return send(404, { ok: false })
  })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
  cwd: projectDir,
  env: { ...process.env, VITE_AUTH_MODE: 'local', VITE_AI_MODE: 'api', VITE_API_BASE_URL: '/api', VITE_SERVER_PORT: String(STUB_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let viteLog = ''
vite.stdout.on('data', (c) => { viteLog += c })
vite.stderr.on('data', (c) => { viteLog += c })

for (let i = 0; i < 100; i += 1) {
  try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
  if (i === 99) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
  await delay(250)
}

await mkdir(OUT_DIR, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })

const ignoreConsole = (text) => /favicon|Devtools|Development mode|\[Vue warn\]/i.test(text) === false

try {
  // ================= 主流程（Context A） =================
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.clearCookies()
  // 全新 context 的 localStorage 天然是空的；initScript 每次导航都会执行，因此不能在这里清空画布，
  // 否则 AC-08 的刷新校验会把已保存画布清掉。
  await context.addInitScript(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '画布验收学生', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
  })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  const failedResponses = []
  page.on('response', (r) => { if (r.status() >= 400) failedResponses.push(`${r.status()} ${r.url()}`) })
  page.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text())) consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.rail-action', { timeout: 30000 })
  await delay(600)

  // ---- 阶段 1：创建图像生成节点 ----
  if (!(await page.locator('.create-options').count())) {
    await page.locator('.rail-action').first().click()
    await page.waitForSelector('.create-options button', { timeout: 8000 })
  }
  await page.locator('.create-options button').nth(2).click()
  await page.waitForSelector('.image-generation-node', { timeout: 15000 })
  await delay(400)

  // ---- 阶段 2：给节点一张真实图片（走「替换图片」上传） ----
  await page.locator('.image-generation-node').last().click({ position: { x: 20, y: 12 } })
  await page.waitForSelector('.image-composer-panel', { timeout: 10000 })
  await page.evaluate(() => { Array.from(document.querySelectorAll('.image-action-toolbar button')).find((b) => b.textContent.includes('替换图片'))?.click() })
  await delay(200)
  const fileInputs = page.locator('input[type=file]')
  check('文件输入框数量>=2（fileInput/referenceFileInput）', (await fileInputs.count()) >= 2, { count: await fileInputs.count() })
  await fileInputs.nth(1).setInputFiles(SOURCE_IMAGE)
  await page.waitForFunction(() => { const img = document.querySelector('.image-generation-preview img'); return Boolean(img && img.complete && img.naturalWidth > 0) }, { timeout: 25000 })
  await delay(400)

  const markButtonCount = await page.locator('.image-composer-controls button[title="标记"]').count()
  check('图像节点编辑面板出现「标记」按钮', markButtonCount === 1, { markButtonCount })

  // ================= AC-07：标记模式禁用拖拽/平移 =================
  const nodeTransformBefore = await page.evaluate(() => {
    const wrap = document.querySelector('.image-generation-node').closest('.vue-flow__node')
    return wrap ? getComputedStyle(wrap).transform : ''
  })
  const viewportBefore = await page.evaluate(() => document.querySelector('.vue-flow__viewport')?.style.transform || '')

  // ---- 阶段 3：打开标记浮层 ----
  await page.locator('.image-composer-controls button[title="标记"]').click()
  await page.waitForSelector('.mark-panel', { timeout: 10000 })
  await delay(500)

  const nodeRect = await page.locator('.image-generation-node').boundingBox()
  if (nodeRect) {
    await page.mouse.move(nodeRect.x + nodeRect.width / 2, nodeRect.y + nodeRect.height / 2)
    await page.mouse.down()
    await page.mouse.move(nodeRect.x + nodeRect.width / 2 + 80, nodeRect.y + nodeRect.height / 2 + 60, { steps: 6 })
    await page.mouse.up()
  }
  const backdrop = await page.locator('.mark-backdrop').boundingBox()
  if (backdrop) {
    await page.mouse.move(backdrop.x + 40, backdrop.y + backdrop.height - 40)
    await page.mouse.down()
    await page.mouse.move(backdrop.x + 160, backdrop.y + backdrop.height - 100, { steps: 6 })
    await page.mouse.up()
  }
  await delay(300)
  const nodeTransformAfter = await page.evaluate(() => {
    const wrap = document.querySelector('.image-generation-node').closest('.vue-flow__node')
    return wrap ? getComputedStyle(wrap).transform : ''
  })
  const viewportAfter = await page.evaluate(() => document.querySelector('.vue-flow__viewport')?.style.transform || '')
  check('AC-07 标记模式下节点未被拖动', nodeTransformBefore === nodeTransformAfter, { nodeTransformBefore, nodeTransformAfter })
  check('AC-07 标记模式下画布未平移', viewportBefore === viewportAfter, { viewportBefore, viewportAfter })

  // 在 backdrop 上拖动会触发其 click 关闭浮层（属预期交互），这里重新打开以继续后续校验。
  if (!(await page.locator('.mark-panel').count())) {
    await page.locator('.image-composer-controls button[title="标记"]').click()
    await page.waitForSelector('.mark-panel', { timeout: 10000 })
    await delay(500)
  }

  // ---- 阶段 4：浮层尺寸/坐标基准校验 ----
  const stageReady = await page.evaluate(() => {
    const img = document.querySelector('.mark-stage-image')
    return {
      panelOpen: Boolean(document.querySelector('.mark-panel')),
      imgExists: Boolean(img),
      imgComplete: Boolean(img?.complete),
      naturalWidth: img?.naturalWidth || 0,
      src: (img?.getAttribute('src') || '').slice(0, 24),
      toast: Array.from(document.querySelectorAll('.el-message')).map((el) => el.textContent.trim()).slice(0, 4),
    }
  })
  check('标记浮层内图片已渲染', stageReady.imgExists && stageReady.imgComplete && stageReady.naturalWidth > 0, stageReady)
  if (!stageReady.imgExists) throw new Error(`标记浮层图片未渲染：${JSON.stringify(stageReady)}`)

  const stageInfo = await page.evaluate(() => {
    const img = document.querySelector('.mark-stage-image')
    const mask = document.querySelector('.mark-mask')
    const imgRect = img.getBoundingClientRect()
    const maskRect = mask.getBoundingClientRect()
    return {
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      display: { w: imgRect.width, h: imgRect.height },
      canvasAttr: { w: mask.width, h: mask.height },
      maskRect: { w: maskRect.width, h: maskRect.height },
      stageRect: { w: document.querySelector('.mark-stage').getBoundingClientRect().width, h: document.querySelector('.mark-stage').getBoundingClientRect().height },
    }
  })
  check('浮层 canvas 内部分辨率 == 原图分辨率', stageInfo.canvasAttr.w === stageInfo.natural.w && stageInfo.canvasAttr.h === stageInfo.natural.h, stageInfo)
  check('浮层按原图比例渲染', Math.abs((stageInfo.natural.w / stageInfo.natural.h) - (stageInfo.display.w / stageInfo.display.h)) < 0.02, stageInfo)
  check('canvas 显示尺寸 == stage 尺寸', Math.abs(stageInfo.maskRect.w - stageInfo.stageRect.w) < 1.5 && Math.abs(stageInfo.maskRect.h - stageInfo.stageRect.h) < 1.5, stageInfo)
  await page.screenshot({ path: path.join(OUT_DIR, '01-mark-overlay.png') })

  // ---- 阶段 5：涂抹画笔（一条粗斜线：bbox 超过 512 → 顺便验证上限；斜线留下大量透明像素） ----
  const maskBox = await page.locator('.mark-mask').boundingBox()
  const brushSize = Number(await page.locator('.mark-size input').inputValue()) || 48
  const brushRadius = brushSize / 2
  const p0 = { x: maskBox.x + maskBox.width * 0.12, y: maskBox.y + maskBox.height * 0.15 }
  const p1 = { x: maskBox.x + maskBox.width * 0.88, y: maskBox.y + maskBox.height * 0.85 }
  const onLine = (t) => ({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t })
  const sampleAlpha = (point) => page.evaluate(({ dx, dy }) => {
    const mask = document.querySelector('.mark-mask')
    const rect = mask.getBoundingClientRect()
    const sx = Math.round(dx * (mask.width / rect.width))
    const sy = Math.round(dy * (mask.height / rect.height))
    const x = Math.max(0, Math.min(mask.width - 7, sx - 3))
    const y = Math.max(0, Math.min(mask.height - 7, sy - 3))
    const d = mask.getContext('2d').getImageData(x, y, 7, 7).data
    let maxA = 0
    for (let i = 3; i < d.length; i += 4) maxA = Math.max(maxA, d[i])
    return maxA
  }, { dx: point.x - maskBox.x, dy: point.y - maskBox.y })

  await page.mouse.move(p0.x, p0.y)
  await page.mouse.down()
  await page.mouse.move(p1.x, p1.y, { steps: 26 })
  await page.mouse.up()
  await delay(250)
  const undoEnabled = await page.locator('.mark-tool', { hasText: '撤销' }).isEnabled()
  check('画笔涂抹后可撤销（说明产生了路径）', undoEnabled, { undoEnabled })
  await page.screenshot({ path: path.join(OUT_DIR, '02-mark-painted.png') })

  // 橡皮擦：切到橡皮擦掉中间一段，验证 destination-out 生效（alpha 下降）
  const probe = onLine(0.41)
  const alphaBeforeErase = await sampleAlpha(probe)
  await page.locator('.mark-tool', { hasText: '橡皮' }).click()
  const e0 = onLine(0.30)
  const e1 = onLine(0.52)
  await page.mouse.move(e0.x, e0.y)
  await page.mouse.down()
  await page.mouse.move(e1.x, e1.y, { steps: 8 })
  await page.mouse.up()
  await delay(200)
  const alphaAfterErase = await sampleAlpha(probe)
  check('橡皮擦能擦除涂抹（alpha 下降）', alphaBeforeErase > 0 && alphaAfterErase < alphaBeforeErase, { alphaBeforeErase, alphaAfterErase })

  // 撤销以恢复被擦掉的中间段
  await page.locator('.mark-tool', { hasText: '撤销' }).click()
  await delay(150)

  // ---- 阶段 6：确认选区 -> 裁剪 -> 识别 ----
  await page.locator('.mark-panel-footer button', { hasText: '确认选区' }).click()
  await page.waitForFunction(() => {
    const img = document.querySelector('.mark-result-thumb img')
    return Boolean(img && img.complete && img.naturalWidth > 0)
  }, { timeout: 20000 })
  await page.waitForFunction(() => { const i = document.querySelector('.mark-name input'); return Boolean(i && i.value.length > 0) }, { timeout: 20000 })
  await delay(200)

  const describePayload = captured.describe[captured.describe.length - 1]
  check('AC-02 调用了 /ai/image/describe-region', Boolean(describePayload), { describeCount: captured.describe.length })
  check('AC-02 请求体 image 为 PNG dataURL', typeof describePayload?.image === 'string' && describePayload.image.startsWith('data:image/png;base64,'), { prefix: describePayload?.image?.slice(0, 30) })

  const nameValue = await page.locator('.mark-name input').inputValue()
  check('AC-02 识别结果填入名称输入框', nameValue === '橘猫头部', { nameValue })
  check('AC-02 名称输入框可编辑', await page.locator('.mark-name input').isEditable(), {})
  await page.screenshot({ path: path.join(OUT_DIR, '03-mark-name.png') })

  // ---- 阶段 7：裁剪正确性（内容比对，验证「无偏移」） ----
  const stageScale = stageInfo.natural.w / stageInfo.display.w // 显示 -> 原图（浮层隐藏后 rect 会归零，必须提前取）
  const cropCheck = await page.evaluate(async ({ painted, scale, brushRadius }) => {
    const img = document.querySelector('.mark-stage-image')
    const preview = document.querySelector('.mark-result-thumb img')
    // 涂抹蒙版 = 笔画中心线外扩 brushRadius，再外扩 pad（与应用内 markSelectionBounds 一致）
    const pad = Math.round(Math.max(2, Math.min(img.naturalWidth, img.naturalHeight) * 0.012))
    const grow = brushRadius + pad
    const ex = Math.max(0, Math.round(painted.x * scale) - grow)
    const ey = Math.max(0, Math.round(painted.y * scale) - grow)
    const ew = Math.max(1, Math.min(img.naturalWidth - ex, Math.round(painted.w * scale) + grow * 2))
    const eh = Math.max(1, Math.min(img.naturalHeight - ey, Math.round(painted.h * scale) + grow * 2))

    const outW = preview.naturalWidth
    const outH = preview.naturalHeight
    const k = Math.min(1, 512 / Math.max(ew, eh))

    // 把「期望区域」重采样到裁剪结果的实际尺寸后再逐像素比对，排除缩放系数带来的干扰
    const expect = document.createElement('canvas')
    expect.width = outW
    expect.height = outH
    const ectx = expect.getContext('2d')
    ectx.drawImage(img, ex, ey, ew, eh, 0, 0, outW, outH)
    const expectData = ectx.getImageData(0, 0, outW, outH).data

    const actual = document.createElement('canvas')
    actual.width = outW
    actual.height = outH
    const actx = actual.getContext('2d')
    actx.drawImage(preview, 0, 0)
    const actualData = actx.getImageData(0, 0, outW, outH).data

    let diffSum = 0
    let samples = 0
    let opaque = 0
    for (let y = 0; y < outH; y += 1) {
      for (let x = 0; x < outW; x += 1) {
        const i = (y * outW + x) * 4
        if (actualData[i + 3] > 16 && expectData[i + 3] > 16) {
          opaque += 1
          diffSum += Math.abs(actualData[i] - expectData[i]) + Math.abs(actualData[i + 1] - expectData[i + 1]) + Math.abs(actualData[i + 2] - expectData[i + 2])
          samples += 1
        }
      }
    }
    return {
      naturalSize: { w: img.naturalWidth, h: img.naturalHeight },
      scale: Number(scale.toFixed(3)),
      expectedBBox: { x: ex, y: ey, w: Math.round(ew), h: Math.round(eh) },
      cropSize: { w: outW, h: outH },
      expectedCropSize: { w: Math.max(1, Math.round(ew * k)), h: Math.max(1, Math.round(eh * k)) },
      opaqueSamples: samples,
      transparentRatio: Number((1 - (opaque / Math.max(1, outW * outH))).toFixed(3)),
      meanColorDiff: samples ? Number((diffSum / samples / 3).toFixed(2)) : -1,
    }
  }, { painted: { x: p0.x - maskBox.x, y: p0.y - maskBox.y, w: p1.x - p0.x, h: p1.y - p0.y }, scale: stageScale, brushRadius })

  check('裁剪尺寸与原图涂抹区域一致（无偏移）', Math.abs(cropCheck.cropSize.w - cropCheck.expectedCropSize.w) <= 8 && Math.abs(cropCheck.cropSize.h - cropCheck.expectedCropSize.h) <= 8, cropCheck)
  check('裁剪内容与原始图像素一致（无偏移，均值色差<25）', cropCheck.meanColorDiff >= 0 && cropCheck.meanColorDiff < 25, cropCheck)
  check('AC-01 裁剪保留涂抹形状 + 透明背景（透明像素占比>0.4）', cropCheck.transparentRatio > 0.4, cropCheck)
  check('裁剪图最大边长<=512（本用例触发缩放上限）', Math.max(cropCheck.cropSize.w, cropCheck.cropSize.h) <= 512, cropCheck.cropSize)

  // ---- 阶段 8：编辑名称 -> 插入提示词 ----
  await page.locator('.mark-name input').fill('测试元素')
  await page.locator('.mark-panel-footer button', { hasText: '插入提示词' }).click()
  await page.waitForSelector('.mark-panel', { state: 'detached', timeout: 8000 })
  await delay(400)

  const chip = await page.evaluate(() => {
    const editor = document.querySelector('.image-generation-node .inline-prompt-editor')
    const el = editor?.querySelector('.inline-prompt-element')
    return {
      exists: Boolean(el),
      text: el?.textContent?.trim() || '',
      hasImg: Boolean(el?.querySelector('img')),
      imgPrefix: (el?.querySelector('img')?.getAttribute('src') || '').slice(0, 24),
      draggable: el?.getAttribute('draggable'),
      contenteditable: el?.getAttribute('contenteditable'),
      isReferenceClass: Boolean(el?.classList.contains('inline-prompt-reference')),
      totalElementChips: document.querySelectorAll('.inline-prompt-element').length,
      elementChipsInHiddenClass: document.querySelectorAll('.generation-reference-chips .inline-prompt-element').length,
    }
  })
  check('AC-04 提示词输入框插入 element 标签', chip.exists, chip)
  check('AC-04 标签文本为 @名称', chip.text === '@测试元素', chip)
  check('AC-04 标签含裁剪缩略图', chip.hasImg && chip.imgPrefix.startsWith('data:image/png'), chip)
  check('标签显式设置 contenteditable/draggable', chip.contenteditable === 'false' && chip.draggable === 'true', chip)
  check('标签复用 inline-prompt-reference 视觉体系', chip.isReferenceClass, chip)
  await page.screenshot({ path: path.join(OUT_DIR, '04-tag-inserted.png') })

  // 老画布外观未变：默认视频节点无 element 片
  const legacyCheck = await page.evaluate(() => {
    const videoEditor = document.querySelector('.video-generation-node .inline-prompt-editor')
    return {
      videoHasElement: Boolean(videoEditor?.querySelector('.inline-prompt-element')),
      videoParts: videoEditor ? Array.from(videoEditor.children).map((c) => c.className) : [],
      totalElementChips: document.querySelectorAll('.inline-prompt-element').length,
    }
  })
  check('AC-06 未标记节点不出现 element 片', !legacyCheck.videoHasElement && legacyCheck.totalElementChips === 1, legacyCheck)

  // ---- 阶段 9：AC-05 生成时裁剪图并入参考图 ----
  await page.evaluate(() => {
    const editor = document.querySelector('.image-generation-node .inline-prompt-editor')
    editor?.focus()
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    sel.removeAllRanges(); sel.addRange(range)
  })
  await page.keyboard.type('生成参考图')
  await delay(200)
  await page.locator('.image-composer-controls .node-run-button').click()
  for (let i = 0; i < 60; i += 1) {
    if (captured.generate.length) break
    await delay(300)
  }
  const genPayload = captured.generate[captured.generate.length - 1]
  const chipImgSrc = await page.evaluate(() => document.querySelector('.image-generation-node .inline-prompt-element img')?.getAttribute('src') || '')
  check('AC-05 生成了图像请求', Boolean(genPayload), { generateCount: captured.generate.length })
  check('AC-05 裁剪小图并入参考图数组（images 含 element thumb）', Array.isArray(genPayload?.images) && genPayload.images.includes(chipImgSrc), { imagesCount: genPayload?.images?.length, matched: Array.isArray(genPayload?.images) && genPayload.images.includes(chipImgSrc) })
  check('AC-05 referenceImage 为 element thumb', genPayload?.referenceImage === chipImgSrc, { referenceImagePrefix: (genPayload?.referenceImage || '').slice(0, 24) })
  await delay(1200)
  await page.screenshot({ path: path.join(OUT_DIR, '05-after-generate.png') })

  // ---- 阶段 10：AC-08 刷新后仍可查看 ----
  const urlBeforeReload = page.url()
  const savedRaw = await page.evaluate(() => localStorage.getItem('ai-workflow-canvas-stage1-v2') || '')
  await writeFile(path.join(OUT_DIR, 'canvas-saved-before-reload.json'), savedRaw)
  const reloadAndWait = async () => {
    await page.goto(urlBeforeReload, { waitUntil: 'domcontentloaded' })
    return page.waitForSelector('.image-generation-node', { timeout: 12000 }).then(() => true).catch(() => false)
  }
  // 恢复后的节点可能落在左侧工具条下方，直接按坐标点击会被 tool-rail 拦截，这里扫描节点内部未被遮挡的点。
  const clickInsideNode = async (selector) => {
    const point = await page.evaluate((sel) => {
      const el = Array.from(document.querySelectorAll(sel)).at(-1)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      for (let fy = 0.2; fy <= 0.8; fy += 0.1) {
        for (let fx = 0.2; fx <= 0.8; fx += 0.1) {
          const x = rect.left + rect.width * fx
          const y = rect.top + rect.height * fy
          if (x < 12 || y < 12) continue
          const hit = document.elementFromPoint(x, y)
          if (hit && el.contains(hit)) return { x, y }
        }
      }
      return null
    }, selector)
    if (!point) throw new Error(`找不到可点击的节点内部点：${selector}`)
    await page.mouse.click(point.x, point.y)
    return point
  }
  let reloadOk = await reloadAndWait()
  if (!reloadOk) {
    await delay(1500)
    reloadOk = await reloadAndWait()
  }
  let reloadDump = null
  if (!reloadOk) {
    reloadDump = await page.evaluate(() => {
      const el = document.querySelector('.workflow-page')
      const state = el?.__vueParentComponent?.setupState
      const raw = state?.nodes
      const list = raw && raw.value !== undefined ? raw.value : raw
      return {
        url: location.href,
        flowNodes: document.querySelectorAll('.vue-flow__node').length,
        stateNodes: Array.isArray(list) ? list.map((n) => `${n.type}:${n.id}`) : String(list),
        stateNodeCount: Array.isArray(list) ? list.length : -1,
        localStorageKeys: Object.keys(localStorage),
        savedTypes: (() => { try { const raw2 = localStorage.getItem('ai-workflow-canvas-stage1-v2'); if (!raw2) return 'no-key'; return JSON.parse(raw2).nodes.map((n) => `${n.type}:${n.id}`) } catch (e) { return `parse-error:${e.message}` } })(),
      }
    })
    reloadDump.pageErrors = pageErrors
    reloadDump.consoleErrors = consoleErrors.slice(0, 6)
  }
  await delay(600)
  // 面板只在选中/展开时渲染，先选中节点再校验标签。
  let ac08Pass = false
  let ac08Detail = null
  if (reloadOk) {
    await clickInsideNode('.image-generation-node')
    await page.waitForSelector('.image-composer-panel', { timeout: 10000 })
    await page.waitForSelector('.image-generation-node .inline-prompt-element', { timeout: 15000 }).catch(() => {})
    const afterReload = await page.evaluate(() => ({
      elementChips: document.querySelectorAll('.inline-prompt-element').length,
      text: document.querySelector('.image-generation-node .inline-prompt-element')?.textContent?.trim() || '',
      hasThumb: (document.querySelector('.image-generation-node .inline-prompt-element img')?.getAttribute('src') || '').startsWith('data:image/png'),
    }))
    ac08Detail = afterReload
    ac08Pass = afterReload.elementChips === 1 && afterReload.text === '@测试元素' && afterReload.hasThumb
  } else {
    ac08Detail = reloadDump
  }
  check('AC-08 刷新后 element 标签仍在（含缩略图）', ac08Pass, ac08Detail)

  // ---- 阶段 11：AC-09 元素上限 3 ----
  if (reloadOk) {
    let limitBlocked = false
    for (let round = 0; round < 4; round += 1) {
      await clickInsideNode('.image-generation-node').catch(() => {})
      await page.waitForSelector('.image-composer-panel', { timeout: 8000 }).catch(() => {})
      const markBtn = page.locator('.image-composer-controls button[title="标记"]')
      if (!(await markBtn.count())) break
      await markBtn.click()
      const opened = await page.waitForSelector('.mark-panel', { timeout: 4000 }).then(() => true).catch(() => false)
      if (!opened) { limitBlocked = true; break }
      const box = await page.locator('.mark-mask').boundingBox().catch(() => null)
      if (!box) { limitBlocked = true; break }
      for (let i = 0; i <= 8; i += 1) {
        const y = box.y + box.height * 0.2 + (box.height * 0.2 * i) / 8
        await page.mouse.move(box.x + box.width * 0.3, y)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.45, y, { steps: 3 })
        await page.mouse.up()
      }
      await page.locator('.mark-panel-footer button', { hasText: '确认选区' }).click()
      await page.waitForFunction(() => { const i = document.querySelector('.mark-name input'); return Boolean(i && i.value.length > 0) }, { timeout: 15000 }).catch(() => {})
      await page.locator('.mark-panel-footer button', { hasText: '插入提示词' }).click()
      await page.waitForSelector('.mark-panel', { state: 'detached', timeout: 6000 }).catch(() => {})
      await delay(300)
    }
    const finalChipCount = await page.evaluate(() => document.querySelectorAll('.image-generation-node .inline-prompt-element').length)
    check('AC-09 元素数量被限制在 3 个', finalChipCount === 3, { finalChipCount, limitBlocked })
  } else {
    check('AC-09 元素数量被限制在 3 个', false, 'skipped: 刷新未恢复，另一路验证见持久化数据断言')
  }
  const persistedShape = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('ai-workflow-canvas-stage1-v2')
      if (!raw) return { ok: false, reason: 'no-key' }
      const saved = JSON.parse(raw)
      const imageNodes = saved.nodes.filter((n) => n.type === 'image')
      const node = imageNodes.find((n) => Array.isArray(n.data?.elements) && n.data.elements.length)
      if (!node) return { ok: false, reason: 'no-elements-persisted' }
      const el = node.data.elements[0]
      const parts = (node.data.promptParts || []).filter((p) => p.type === 'element')
      return {
        ok: true,
        elementCount: node.data.elements.length,
        label: el.label,
        hasThumbDataUrl: String(el.thumb || '').startsWith('data:image/png;base64,'),
        hasRect: Boolean(el.rect && el.rect.w > 0 && el.rect.h > 0),
        imageRef: el.imageRef,
        nodeIdMatches: el.nodeId === node.id,
        promptPartElementIds: parts.map((p) => p.id),
        partIdMatchesElement: parts.some((p) => p.id === el.id),
      }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
  })
  check('AC-08 元素数据模型已完整持久化（含 thumb/rect/label/nodeId）', persistedShape.ok && persistedShape.hasThumbDataUrl && persistedShape.hasRect && persistedShape.partIdMatchesElement && persistedShape.nodeIdMatches, persistedShape)

  const appFailedResponses = failedResponses.filter((entry) => !/favicon/i.test(entry))
  check('控制台无未处理异常', pageErrors.length === 0, { pageErrors })
  check('无应用相关的失败请求（favicon 除外）', appFailedResponses.length === 0, { appFailedResponses, failedResponses })
  check('控制台无 error 级日志（资源加载噪声除外）', consoleErrors.filter((t) => !/Failed to load resource/.test(t)).length === 0, { consoleErrors: consoleErrors.slice(0, 8) })

  results.capturedSummary = { describe: captured.describe.length, generate: captured.generate.length, otherApi: captured.other.slice(0, 10) }
  await context.close()

  // ================= AC-06 安全性：老画布含未知 type（Context B） =================
  const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await legacyContext.addInitScript(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '画布验收学生', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify({
      version: 2,
      nodes: [
        { id: 'legacy-upload', type: 'upload', position: { x: 40, y: 200 }, data: { title: '图片', image: '/canvas-demo-sneaker.png', originalName: '历史图片' } },
        {
          id: 'legacy-image',
          type: 'image',
          position: { x: 360, y: 200 },
          data: {
            mode: 'image-generation',
            title: '图像生成',
            prompt: '历史提示词文本',
            promptParts: [
              { type: 'reference', id: 'legacy-upload' },
              { type: 'legacy-marker', note: '历史遗留类型' },
              { type: 'element', id: 'missing-element-999' },
              { type: 'text', text: '历史提示词文本' },
            ],
            status: 'idle',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1' },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'legacy-upload', target: 'legacy-image' }],
      settings: {},
      edgesVisible: true,
    }))
  })
  const legacyPage = await legacyContext.newPage()
  const legacyErrors = []
  legacyPage.on('pageerror', (e) => legacyErrors.push(String(e)))
  legacyPage.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text())) legacyErrors.push(m.text()) })
  await legacyPage.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await legacyPage.waitForSelector('.image-generation-node', { timeout: 20000 })
  await delay(800)
  // 面板仅在选中/展开时渲染，先选中节点再读取输入框
  {
    const point = await legacyPage.evaluate(() => {
      const el = document.querySelector('.image-generation-node')
      if (!el) return null
      const rect = el.getBoundingClientRect()
      for (let fy = 0.2; fy <= 0.8; fy += 0.1) {
        for (let fx = 0.2; fx <= 0.8; fx += 0.1) {
          const x = rect.left + rect.width * fx
          const y = rect.top + rect.height * fy
          if (x < 12 || y < 12) continue
          const hit = document.elementFromPoint(x, y)
          if (hit && el.contains(hit)) return { x, y }
        }
      }
      return null
    })
    if (point) await legacyPage.mouse.click(point.x, point.y)
  }
  await legacyPage.waitForSelector('.image-generation-node .inline-prompt-editor', { timeout: 10000 }).catch(() => {})
  await delay(300)
  const legacyRender = await legacyPage.evaluate(() => {
    const editor = document.querySelector('.image-generation-node .inline-prompt-editor')
    return {
      flowNodes: document.querySelectorAll('.vue-flow__node').length,
      editorExists: Boolean(editor),
      childrenClasses: editor ? Array.from(editor.children).map((c) => c.className) : [],
      textContent: editor?.textContent?.trim() || '',
      elementChips: document.querySelectorAll('.inline-prompt-element').length,
      referenceChips: document.querySelectorAll('.inline-prompt-reference').length,
    }
  })
  check('AC-06 老画布（含未知 type + 失效 element id）不崩溃', legacyErrors.length === 0, { legacyErrors })
  check('AC-06 老画布渲染：未知/失效类型被安全跳过，仅渲染文本', legacyRender.textContent.includes('历史提示词文本') && legacyRender.elementChips === 0, legacyRender)
  await legacyPage.screenshot({ path: path.join(OUT_DIR, '06-legacy-canvas.png') })
  await legacyContext.close()
} catch (error) {
  failures.push(`EXCEPTION: ${error?.message}`)
  results.exception = error?.stack || String(error)
  console.error('捕获到异常：', error)
} finally {
  await browser.close().catch(() => {})
  vite.kill()
  stub.close()
}

const report = { pass: failures.length === 0, failures, results }
await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(failures.length === 0 ? 0 : 1)
