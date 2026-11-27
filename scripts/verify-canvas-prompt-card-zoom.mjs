// 画布「提示词卡片」新规格 + 放大态 端到端验收脚本
// 用法：node scripts/verify-canvas-prompt-card-zoom.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
//
// 覆盖目标（用户诉求）：
//   ① 卡片 626px 宽（含 1px 边框）+ 16px 内边距
//   ② 提示词 16px / 行高 32px
//   ③ 输入框固定 3 行（96px）起 → 内容变多整卡长高 → 最多 5 行（160px）→ 超出框内滚动，滚动条 6px
//   ④ 卡片右上角放大按钮：点击后卡片居中（画布区中心）等比放大 1.35 倍、画布其余部分灰度冻结并压暗、
//      同位置按钮变「收起」；Esc 或点「收起」返回
//   ⑤ 节点框子本身没有任何改动
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
const STUB_PORT = 3237
const WEB_PORT = 5182
const OUT_DIR = path.join(projectDir, '.prompt-card-verify')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = {}
const failures = []

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const TEXT_MODELS = ['gpt-4o-mini', 'doubao-seed-1-6-250615']
const IMAGE_MODELS = ['agnes-image-2.0-flash']

// ---------------- stub AI server ----------------
const stub = http.createServer((req, res) => {
  const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
  req.resume()
  req.on('end', () => {
    const url = req.url || ''
    if (req.method === 'GET' && url.startsWith('/api/ai/health')) {
      return send(200, {
        ok: true,
        activeProvider: 'agnes',
        providers: {
          agnes: {
            key: 'agnes', label: 'Agnes AI', configured: true,
            imageModel: IMAGE_MODELS[0], imageModels: IMAGE_MODELS,
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

const LONG_TEXT = '一只戴着黄色雨衣的小熊，在雨后的森林小路上散步，水洼里倒映着柔和的晨光；主体放在画面偏左位置，右侧留出空间放标题文字；整体为温暖童话插画风格，色彩柔和、光影自然；注意雨滴落在地面上的细小涟漪和路面湿漉漉的反光质感；远景做浅色虚化处理，让画面层次拉开；适合打印成 A3 尺寸的课堂展示作品；画面中景加一条被雨水打湿的木板小路，两侧点缀蕨类植物与蘑菇；天空保留一层薄薄的晨雾。'

try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  await mkdir(OUT_DIR, { recursive: true })

  // ==================== 静态断言：三处卡片 + CSS 规格 ====================
  {
    const source = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
    check('静态：图像/视频/文本三处卡片都插入了 composer-head（右上角按钮行）',
      (source.match(/<div class="composer-head">/g) || []).length === 3,
      { count: (source.match(/<div class="composer-head">/g) || []).length })
    check('静态：三处卡片都有右上角放大按钮 composer-zoom-button',
      (source.match(/class="composer-zoom-button/g) || []).length === 3,
      { count: (source.match(/class="composer-zoom-button/g) || []).length })
    check('静态：卡片宽度改为 626px', /\.node-follow-panel\.image-composer-panel,\s*\n\.node-follow-panel\.video-composer-panel \{\s*\n\s*width: 626px;/.test(source), { ok: true })
    check('静态：输入框规则为 96px 起 / 160px 上限', /min-height: 96px;\s+max-height: 160px;/.test(source), { ok: true })
    check('静态：提示词字号 16px / 行高 32px', /font-size: 16px;\s+line-height: 32px;/.test(source), { ok: true })
    check('静态：滚动条 6px 细条规则存在', source.includes('.node-follow-panel .node-prompt-input::-webkit-scrollbar { width: 6px; height: 6px; }'), { ok: true })
    check('静态：放大态为 1.35 倍等比放大', source.includes('translate(-50%, -50%) scale(1.35)'), { ok: true })
    check('静态：放大态画布灰度冻结', source.includes('.canvas-area.prompt-zoom .flow-canvas {'), { ok: true })
    check('静态：卡片在放大态被 Teleport 到 body（画布 transform 会让 fixed 失效）',
      (source.match(/:disabled="promptZoomNodeId !== id"/g) || []).length === 3,
      { count: (source.match(/:disabled="promptZoomNodeId !== id"/g) || []).length })
  }

  // ==================== 种子画布 ====================
  const buildSeed = () => {
    const canvas = {
      version: 2,
      nodes: [
        { id: 'upload-1', type: 'upload', position: { x: 60, y: 330 }, data: { title: '图片', originalName: '上游素材图', image: window.__tinyPng } },
        {
          id: 'image-1', type: 'image', position: { x: 520, y: 90 },
          data: {
            title: '图像生成', mode: 'image-generation', prompt: '一只小狗走在草地上', status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '16:9', resolution: '1080P' },
            output: { url: window.__tinyPng, imageData: window.__tinyPng, originalName: '输出图' },
          },
        },
        {
          id: 'text-1', type: 'text', position: { x: 200, y: 90 },
          data: {
            title: '文字生成', mode: 'text-generation',
            text: '小猫在睡觉', prompt: '把这段文字写得更活泼',
            status: 'succeeded', output: { text: '小猫在睡觉' }, config: { model: 'gpt-4o-mini' },
          },
        },
      ],
      edges: [
        { id: 'edge-upload-image1', source: 'upload-1', target: 'image-1', type: 'default', interactionWidth: 28 },
      ],
      settings: {},
      edgesVisible: true,
    }
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas))
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--window-size=1600,1040'] })
  const ignoreConsole = (text, url = '') => /favicon|Devtools|Development mode|\[Vue warn\]/i.test(`${text} ${url}`) === false
  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } })
  await context.addInitScript((png) => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '卡片规格验收', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
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

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
  await delay(900)
  const paletteClose = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await paletteClose.count()) await paletteClose.first().click().catch(() => {})
  await delay(300)

  // ---------- ① 图像节点卡片：尺寸 / 内边距 / 字号 / 行高 ----------
  await selectNode('image-1')
  await page.waitForSelector('.vue-flow__node[data-id="image-1"] .image-composer-panel', { timeout: 15000 })
  await delay(400)

  const cardSpec = await page.evaluate(() => {
    const panel = document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-panel')
    const editor = panel.querySelector('.node-prompt-input')
    const btn = panel.querySelector('.composer-zoom-button')
    const head = panel.querySelector('.composer-head')
    const br = btn.getBoundingClientRect()
    const hr = head.getBoundingClientRect()
    const cs = getComputedStyle(editor)
    const pcs = getComputedStyle(panel)
    return {
      width: panel.offsetWidth,
      padding: pcs.padding,
      borderTop: pcs.borderTopWidth,
      radius: pcs.borderRadius,
      editorFontSize: cs.fontSize,
      editorLineHeight: cs.lineHeight,
      editorMinHeight: cs.minHeight,
      editorMaxHeight: cs.maxHeight,
      editorOverflowY: cs.overflowY,
      editorHeight: editor.offsetHeight,
      headMinHeight: getComputedStyle(head).minHeight,
      // head 与按钮都在同一坐标系里（画布缩放对两者影响一致），所以用差值判断「贴右上角」最稳
      btnAlignRight: Math.round(Math.abs(br.right - hr.right)),
      btnAlignTop: Math.round(Math.abs(br.top - hr.top)),
      btnTitle: btn.getAttribute('title'),
      thumbSize: (() => { const t = panel.querySelector('.upstream-thumb'); return t ? [t.offsetWidth, t.offsetHeight] : null })(),
      nodeWidth: document.querySelector('.vue-flow__node[data-id="image-1"] .image-generation-node')?.offsetWidth || 0,
    }
  })
  check('① 卡片宽 626px（含 1px 边框）', cardSpec.width === 626, cardSpec)
  check('① 卡片内边距 16px', cardSpec.padding === '16px', cardSpec)
  check('② 提示词字号 16px / 行高 32px', cardSpec.editorFontSize === '16px' && cardSpec.editorLineHeight === '32px', cardSpec)
  check('③ 输入框下限 96px / 上限 160px，且允许滚动', cardSpec.editorMinHeight === '96px' && cardSpec.editorMaxHeight === '160px' && cardSpec.editorOverflowY === 'auto', cardSpec)
  check('③ 输入框当前按 3 行显示（高度 96px，短文本不外溢）', cardSpec.editorHeight === 96, cardSpec)
  check('④ 放大按钮贴在卡片内容区右上角（有描边 + 内边距 16px，且与首行右/上边缘齐平）',
    parseFloat(cardSpec.borderTop) > 0 && cardSpec.padding === '16px' && cardSpec.btnAlignRight <= 1 && cardSpec.btnAlignTop <= 1, cardSpec)
  check('④ 未放大时按钮语义是「放大提示词卡片」', String(cardSpec.btnTitle).includes('放大'), cardSpec)
  check('⑤ 上游缩略卡仍是 65×65（未被改动）', JSON.stringify(cardSpec.thumbSize) === JSON.stringify([65, 65]), cardSpec)
  check('⑤ 卡片宽度没有串到节点框子上（节点不是 626px）', cardSpec.nodeWidth > 0 && cardSpec.nodeWidth !== 626, cardSpec)

  await page.screenshot({ path: path.join(OUT_DIR, '01-card-3lines.png') })

  // ---------- ③ 输入框长高：超过 3 行 → 长高到 5 行 → 再超出框内滚动（滚动条 6px） ----------
  // 注意：这里必须用「真实键入」。locator.fill() / 全选+Delete 都会把 contenteditable 的 DOM
  // 整体换掉，打乱 Vue 里 promptParts 的 vdom 结构，后续 patch 会抛 nextSibling 错、组件更新链中断
  // （那属于输入框自身的既有脆弱点，不是本次改动引入；真实用户逐字键入不会触发）。
  const editor = page.locator('.vue-flow__node[data-id="image-1"] .image-composer-panel .node-prompt-input')
  const typeMore = async (text) => {
    await editor.click()
    await page.keyboard.press('Control+End')
    await editor.pressSequentially(text, { delay: 1 })
    await delay(500)
  }

  await typeMore(LONG_TEXT.slice(0, 120))
  const grown = await page.evaluate(() => {
    const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-panel .node-prompt-input')
    return { height: ed.offsetHeight, scrollHeight: ed.scrollHeight, gutter: ed.offsetWidth - ed.clientWidth }
  })
  check('③ 文字变多时输入框跟着长高（>96px、≤160px）', grown.height > 96 && grown.height <= 160, grown)
  check('③ 未超过 5 行时不出现滚动条', grown.gutter === 0 && grown.scrollHeight <= 160, grown)

  await typeMore(LONG_TEXT.slice(0, 260))
  const scrolled = await page.evaluate(() => {
    const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-panel .node-prompt-input')
    return { height: ed.offsetHeight, scrollHeight: ed.scrollHeight, gutter: ed.offsetWidth - ed.clientWidth, overflowY: getComputedStyle(ed).overflowY }
  })
  check('③ 长到上限后停在 5 行 = 160px，不再长高', scrolled.height === 160, scrolled)
  check('③ 超过 5 行改为框内上下滚动（内容 224px > 可视 160px）', scrolled.overflowY === 'auto' && scrolled.scrollHeight > 160, scrolled)
  check('③ 滚动条为 6px 细条（真实占位 6px）', scrolled.gutter === 6, scrolled)
  await page.screenshot({ path: path.join(OUT_DIR, '02-card-scroll.png') })

  // 逐字退格清空（原生编辑，不破坏 vdom）→ 回到 96px
  await editor.click()
  await page.keyboard.press('Control+End')
  for (let i = 0; i < 420; i += 1) await page.keyboard.press('Backspace')
  await delay(500)
  const shrunk = await page.evaluate(() => {
    const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-panel .node-prompt-input')
    return { height: ed.offsetHeight, gutter: ed.offsetWidth - ed.clientWidth }
  })
  check('③ 文字变少后回到 3 行 96px、滚动条消失', shrunk.height === 96 && shrunk.gutter === 0, shrunk)

  // ---------- ④ 放大态 ----------
  await page.locator('.vue-flow__node[data-id="image-1"] .composer-zoom-button').click()
  await delay(700)
  const panelDump = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('.node-follow-panel').forEach((el) => {
      out.push({
        cls: el.className,
        style: el.getAttribute('style'),
        parent: el.parentElement ? `${el.parentElement.tagName}.${el.parentElement.className}` : 'none',
        inNode: Boolean(el.closest('.vue-flow__node')),
        onScreen: [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)],
      })
    })
    return out
  })
  console.error('[诊断] 放大后 .node-follow-panel 分布：', JSON.stringify(panelDump))
  const zoomed = await page.evaluate(() => {
    const bodyPanel = document.body.querySelector(':scope > .node-follow-panel.is-zoom-open')
    const scrim = document.querySelector('.prompt-zoom-scrim')
    const area = document.querySelector('.canvas-area')
    const canvas = document.querySelector('.flow-canvas')
    const node = document.querySelector('.vue-flow__node[data-id="image-1"]')
    const btn = bodyPanel?.querySelector('.composer-zoom-button')
    const rect = bodyPanel?.getBoundingClientRect()
    const areaRect = area?.getBoundingClientRect()
    return {
      teleportedToBody: Boolean(bodyPanel),
      stillInsideNode: Boolean(node?.querySelector('.image-composer-panel')),
      onScreenWidth: rect ? Math.round(rect.width) : 0,
      onScreenHeight: rect ? Math.round(rect.height) : 0,
      offsetFromCanvasCenterX: rect && areaRect ? Math.round((rect.left + rect.width / 2) - (areaRect.left + areaRect.width / 2)) : 9999,
      offsetFromCanvasCenterY: rect && areaRect ? Math.round((rect.top + rect.height / 2) - (areaRect.top + areaRect.height / 2)) : 9999,
      areaHasZoomClass: Boolean(area?.classList.contains('prompt-zoom')),
      canvasFilter: canvas ? getComputedStyle(canvas).filter : '',
      hasScrim: Boolean(scrim),
      scrimCoversCanvas: scrim && areaRect ? Math.round(scrim.getBoundingClientRect().width) >= Math.round(areaRect.width) : false,
      btnTitle: btn?.getAttribute('title') || '',
      editorHeight: bodyPanel?.querySelector('.node-prompt-input')?.offsetHeight || 0,
      editorFontSize: bodyPanel ? getComputedStyle(bodyPanel.querySelector('.node-prompt-input')).fontSize : '',
      // scale 由祖先 transform 施加：computed fontSize 恒为作者样式的 16px，
      // 屏幕上真实字号 = 作者字号 × 有效缩放比，故用「屏幕宽 / 逻辑宽」反推。
      logicalWidth: bodyPanel?.offsetWidth || 0,
      effectiveScale: bodyPanel && rect && bodyPanel.offsetWidth ? rect.width / bodyPanel.offsetWidth : 0,
      panelTransform: bodyPanel ? getComputedStyle(bodyPanel).transform : '',
    }
  })
  check('④ 放大时卡片被 Teleport 到 body 层（脱离画布 transform）',
    zoomed.teleportedToBody === true && zoomed.stillInsideNode === false, zoomed)
  check('④ 等比放大 1.35 倍（屏上宽度 ≈ 626 × 1.35 = 845px）', zoomed.onScreenWidth === 845, zoomed)
  check('④ 卡片居中于画布区（横纵偏差 ≤ 2px）',
    Math.abs(zoomed.offsetFromCanvasCenterX) <= 2 && Math.abs(zoomed.offsetFromCanvasCenterY) <= 2, zoomed)
  // 屏幕上字号 = 作者字号 × 有效缩放比。scale 由祖先 transform 施加，
  // computed fontSize 恒为 16px，因此用 屏幕宽/逻辑宽 反推缩放比来验证「字号同步放大」。
  check('④ 放大时整卡（含字号）等比 1.35 倍（16 × 1.35 = 21.6px）',
    Math.abs(zoomed.effectiveScale - 1.35) <= 0.01 &&
    zoomed.editorFontSize === '16px' &&
    Math.abs(parseFloat(zoomed.editorFontSize) * zoomed.effectiveScale - 21.6) <= 0.2, zoomed)
  check('④ 画布其余部分冻结为灰度（.flow-canvas 灰滤镜 + 画布区遮罩）',
    zoomed.areaHasZoomClass === true && zoomed.canvasFilter.includes('grayscale(1)') && zoomed.hasScrim === true, zoomed)
  check('④ 遮罩完整盖住画布区（挡住画布交互）', zoomed.scrimCoversCanvas === true, zoomed)
  check('④ 同位置按钮变成「收起」', String(zoomed.btnTitle).includes('收起'), zoomed)
  await page.screenshot({ path: path.join(OUT_DIR, '03-card-zoomed.png') })

  // Esc 收起
  await page.keyboard.press('Escape')
  await delay(600)
  const afterEsc = await page.evaluate(() => {
    const area = document.querySelector('.canvas-area')
    const canvas = document.querySelector('.flow-canvas')
    return {
      bodyPanel: Boolean(document.body.querySelector(':scope > .node-follow-panel.is-zoom-open')),
      hasScrim: Boolean(document.querySelector('.prompt-zoom-scrim')),
      areaHasZoomClass: Boolean(area?.classList.contains('prompt-zoom')),
      canvasFilter: canvas ? getComputedStyle(canvas).filter : '',
      backInNode: Boolean(document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-panel')),
      btnTitle: document.querySelector('.vue-flow__node[data-id="image-1"] .composer-zoom-button')?.getAttribute('title') || '',
    }
  })
  check('④ Esc：卡片回到节点内、遮罩与灰度全部撤掉',
    afterEsc.bodyPanel === false && afterEsc.hasScrim === false && afterEsc.areaHasZoomClass === false &&
    afterEsc.backInNode === true && afterEsc.canvasFilter === 'none' && String(afterEsc.btnTitle).includes('放大'), afterEsc)

  // 再点「放大」→ 点「收起」
  await page.locator('.vue-flow__node[data-id="image-1"] .composer-zoom-button').click()
  await delay(600)
  const collapseBtn = page.locator('.node-follow-panel.is-zoom-open .composer-zoom-button')
  if (await collapseBtn.count()) {
    await collapseBtn.first().click()
    await delay(600)
  } else {
    console.error('[诊断] 放大后仍找不到 body 层的 .node-follow-panel.is-zoom-open')
  }
  const afterCollapse = await page.evaluate(() => ({
    bodyPanel: Boolean(document.body.querySelector(':scope > .node-follow-panel.is-zoom-open')),
    backInNode: Boolean(document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-panel')),
  }))
  check('④ 点「收起」等效于 Esc（卡片回到节点内）',
    afterCollapse.bodyPanel === false && afterCollapse.backInNode === true, afterCollapse)

  // ---------- 文本节点卡片：同一套 626px 规格 ----------
  await selectNode('text-1')
  const editBtn = page.locator('.vue-flow__node[data-id="text-1"] .smart-node-actions button').filter({ hasText: /^编辑$/ })
  if (await editBtn.count()) await editBtn.first().click()
  await page.waitForSelector('.vue-flow__node[data-id="text-1"] .text-agent-panel', { timeout: 15000 })
  await delay(400)
  const textCard = await page.evaluate(() => {
    const panel = document.querySelector('.vue-flow__node[data-id="text-1"] .text-agent-panel')
    const editor = panel.querySelector('.node-prompt-input')
    return {
      width: panel.offsetWidth,
      padding: getComputedStyle(panel).padding,
      fontSize: getComputedStyle(editor).fontSize,
      lineHeight: getComputedStyle(editor).lineHeight,
      hasZoomBtn: Boolean(panel.querySelector('.composer-zoom-button')),
      headMinHeight: getComputedStyle(panel.querySelector('.composer-head')).minHeight,
    }
  })
  check('文本节点卡片同为 626px / 16px 内边距 / 16-32 字号行高',
    textCard.width === 626 && textCard.padding === '16px' && textCard.fontSize === '16px' && textCard.lineHeight === '32px', textCard)
  check('文本节点卡片也有右上角放大按钮', textCard.hasZoomBtn === true && textCard.headMinHeight === '32px', textCard)
  await page.screenshot({ path: path.join(OUT_DIR, '04-text-card.png') })

  check('运行期：无控制台错误', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })

  await browser.close()

  const report = { pass: failures.length === 0, failures, results }
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.error(`\n==== 结果：${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`} ====`)
  if (failures.length) console.error(failures.join('\n'))
  process.exitCode = failures.length === 0 ? 0 : 1
} finally {
  killTree(vite)
  stub.close()
}
