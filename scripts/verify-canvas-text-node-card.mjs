// 画布「文本节点编辑卡片」端到端验收脚本
// 用法：node scripts/verify-canvas-text-node-card.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
//
// 覆盖目标（用户诉求）：
//   文本节点点「编辑」弹出的卡片，必须与图像/视频节点同一套卡片：
//   ① 上游节点小图标  ② @ 引用到提示词输入框  ③ 智能体模型只列文本模型
//   并验证：卡片外观（宽度/背景/圆角/内边距）与图像节点卡片逐项一致；
//   发送时把「引用片 + 上游文本 + 原文」真正送进助手，并把结果写回节点。
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
const STUB_PORT = 3233
const WEB_PORT = 5178
const OUT_DIR = path.join(projectDir, '.text-card-verify')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = {}
const failures = []
const captured = { assistant: [], health: 0, urls: [] }

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// 后台已配置的文本模型：卡片下拉必须严格来自这里（而不是写死的「创作 Agent / 提示词专家」）。
const TEXT_MODELS = ['gpt-4o-mini', 'doubao-seed-1-6-250615']

// ---------------- stub AI server ----------------
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { /* 忽略非 JSON */ }
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    captured.urls.push(`${req.method} ${url}`)
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
    if (req.method === 'POST' && url === '/api/ai/canvas/assistant') {
      captured.assistant.push(body)
      return send(200, {
        ok: true,
        reply: '改写后的文字：小猫咪在阳光里打呼噜。',
        proposals: [{ type: 'set_node_text', targetNodeId: body?.selectedNode?.id || '', summary: '写入生成的文字', payload: { text: '改写后的文字：小猫咪在阳光里打呼噜。' } }],
        actions: [],
        warnings: [],
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

  // ==================== 静态断言：卡片结构必须与图像节点同源 ====================
  {
    const source = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
    const panelStart = source.indexOf('v-if="selected && textAgentNodeId === id"')
    // 卡片跨度约 5000 字符（含上游缩略图 + 引用片 + 模型下拉）。原先写死 4500 的窗口会把
    // 末尾的模型下拉切掉，导致「下拉是否来自 textAgentModels」误判失败 —— 改为读到面板收尾标签为止。
    const panelEnd = source.indexOf('</Teleport>', panelStart)
    const head = source.slice(panelStart, panelEnd > panelStart ? panelEnd : panelStart + 7000)
    check('静态：文本节点卡片复用 image-composer-panel 类（与图像节点同一套卡片样式）',
      head.includes('class="node-follow-panel image-composer-panel text-agent-panel nodrag nopan"'), { head: head.slice(0, 160) })
    check('静态：卡片含上游小图标容器 node-upstream-thumbs', head.includes('class="node-upstream-thumbs'), { ok: true })
    check('静态：@ 按钮走既有 insertReferenceToPrompt（同一套引用插入链路）', head.includes('@click.stop="insertReferenceToPrompt(id, reference)"'), { ok: true })
    check('静态：提示词输入框为 inlinePromptParts 渲染的引用片编辑器',
      head.includes('inlinePromptParts(data, id, false, true, false)') && head.includes('class="node-prompt-input inline-prompt-editor"'), { ok: true })
    check('静态：提示词输入框挂 handlePromptEditorClick（记录光标，供 @ 插到光标处）', head.includes('@click="handlePromptEditorClick"'), { ok: true })
    check('静态：模型下拉来自 textAgentModels（文本模型），不再写死「创作 Agent / 提示词专家」',
      head.includes('v-for="model in textAgentModels"') && !head.includes('创作 Agent') && !head.includes('提示词专家'), { ok: true })
    check('静态：旧 textarea 卡片结构已彻底移除', !source.includes('v-model="textAgentInput"') && !source.includes('textAgentInput'), { ok: true })
    check('静态：文本生成节点的模型来源改为已配置文本模型（generatorModels / defaultTextModel）',
      source.includes("node?.data?.mode === 'text-generation' || node?.type === 'text') return configuredTextModels.value") && source.includes('function defaultTextModel()'), { ok: true })
  }

  // ==================== 种子画布：上游图片 + 上游文本 + 文本节点 + 图像节点 ====================
  const buildSeed = () => {
    const canvas = {
      version: 2,
      nodes: [
        { id: 'upload-1', type: 'upload', position: { x: 40, y: 330 }, data: { title: '图片', originalName: '上游素材图', image: window.__tinyPng } },
        {
          id: 'text-0', type: 'text', position: { x: 260, y: 330 },
          data: { title: '文案', mode: 'text-generation', text: '上游文案内容', prompt: '上游文案内容', status: 'succeeded', output: { text: '上游文案内容' }, config: { model: 'gpt-4o-mini' } },
        },
        {
          id: 'text-1', type: 'text', position: { x: 200, y: 90 },
          data: {
            title: '文字生成', mode: 'text-generation',
            text: '小猫在睡觉', prompt: '把这段文字写得更活泼',
            // 故意用历史上写死的「创作 Agent」：验证老画布也能被纠正成真实文本模型。
            status: 'succeeded', output: { text: '小猫在睡觉' }, config: { model: '创作 Agent' },
          },
        },
        {
          id: 'image-1', type: 'image', position: { x: 520, y: 90 },
          data: {
            title: '图像生成', mode: 'image-generation', prompt: '一只小狗走在草地上', status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1', resolution: '1080P' },
            output: { url: window.__tinyPng, imageData: window.__tinyPng, originalName: '输出图' },
          },
        },
      ],
      edges: [
        { id: 'edge-upload-text1', source: 'upload-1', target: 'text-1', type: 'default', interactionWidth: 28 },
        { id: 'edge-text0-text1', source: 'text-0', target: 'text-1', type: 'default', interactionWidth: 28 },
      ],
      settings: {},
      edgesVisible: true,
    }
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas))
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const ignoreConsole = (text, url = '') => /favicon|Devtools|Development mode|\[Vue warn\]/i.test(`${text} ${url}`) === false
  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } })
  await context.addInitScript((png) => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '文本卡片验收', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
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

  // 「编辑」是开关式按钮：卡片已开时再点会关掉，所以只在未打开时点击。
  const openTextCard = async () => {
    await selectNode('text-1')
    const panel = page.locator('.vue-flow__node[data-id="text-1"] .text-agent-panel')
    if (!(await panel.isVisible().catch(() => false))) {
      await page.locator('.vue-flow__node[data-id="text-1"] .smart-node-actions button').filter({ hasText: /^编辑$/ }).first().click()
    }
    await page.waitForSelector('.vue-flow__node[data-id="text-1"] .text-agent-panel', { timeout: 15000 })
    await delay(300)
  }

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="text-1"]', { timeout: 30000 })
  await delay(900)
  const paletteClose = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await paletteClose.count()) await paletteClose.first().click().catch(() => {})
  await delay(300)

  // vite 首次访问要按需编译大量模块，浏览器对同一 origin 的并发连接被占满，
  // /api/ai/health 会排在后面才发出 —— 不能固定 delay 后就断言，必须轮询等待。
  for (let i = 0; i < 80; i += 1) {
    if (captured.health > 0) break
    await delay(250)
  }
  console.error(`[stub] 收到请求：${JSON.stringify(captured.urls.slice(0, 40))}`)
  check('前置：已配置文本模型被前端读到（/api/ai/health 被请求）', captured.health > 0, { health: captured.health })

  // ---------- 打开文本节点编辑卡片 ----------
  await selectNode('text-1')
  const editBtn = page.locator('.vue-flow__node[data-id="text-1"] .smart-node-actions button').filter({ hasText: /^编辑$/ })
  check('前置：文本节点选中后出现「编辑」按钮', await editBtn.count() >= 1, { count: await editBtn.count() })
  await editBtn.first().click()
  await page.waitForSelector('.vue-flow__node[data-id="text-1"] .text-agent-panel', { timeout: 15000 })
  // 模型下拉要等 /api/ai/health 回来才会填充，等它真的有选项再断言，避免"数据还在路上"的假失败。
  await page.waitForFunction(() => {
    const select = document.querySelector('.vue-flow__node[data-id="text-1"] .text-agent-panel select')
    return Boolean(select && Array.from(select.options).some((o) => o.value))
  }, undefined, { timeout: 20000 }).catch(() => {})
  await delay(400)
  await page.screenshot({ path: path.join(OUT_DIR, '01-text-card-open.png') })

  const card = await page.evaluate(() => {
    const panel = document.querySelector('.vue-flow__node[data-id="text-1"] .text-agent-panel')
    const editor = panel?.querySelector('.inline-prompt-editor')
    const select = panel?.querySelector('select')
    return {
      isComposer: Boolean(panel?.classList.contains('image-composer-panel')),
      hasThumbs: Boolean(panel?.querySelector('.node-upstream-thumbs')),
      thumbCount: panel ? panel.querySelectorAll('.upstream-thumb').length : -1,
      thumbImages: panel ? panel.querySelectorAll('.upstream-thumb img').length : -1,
      thumbIcons: panel ? panel.querySelectorAll('.upstream-thumb svg').length : -1,
      mentionCount: panel ? panel.querySelectorAll('.upstream-thumb-mention').length : -1,
      hasEditor: Boolean(editor),
      editorPlaceholder: panel?.querySelector('.inline-prompt-text:only-child')?.getAttribute('data-placeholder') || '',
      editorText: editor?.textContent?.trim() || '',
      selectOptions: select ? Array.from(select.options).map((o) => o.value) : [],
      selectValue: select?.value || '',
      hasTextarea: Boolean(panel?.querySelector('textarea')),
      style: panel ? {
        width: getComputedStyle(panel).width,
        background: getComputedStyle(panel).backgroundColor,
        radius: getComputedStyle(panel).borderRadius,
        padding: getComputedStyle(panel).padding,
        borderColor: getComputedStyle(panel).borderTopColor,
      } : null,
    }
  })

  check('卡片：与图像节点同为 image-composer-panel（同一套卡片）', card.isComposer === true, card)
  check('卡片：不再是旧 textarea 结构', card.hasTextarea === false, card)
  check('① 上游小图标：出现 2 个上游缩略图（图片 1 + 文本 1）并可点击放大', card.hasThumbs && card.thumbCount === 2, card)
  check('① 上游小图标：图片类上游渲染真实缩略图，文本类上游渲染图标', card.thumbImages === 1 && card.thumbIcons >= 1, card)
  check('① 每个上游小图标都带 @ 引用按钮', card.mentionCount === 2, card)
  check('② 提示词输入框存在，且沿用其它节点的 data-placeholder 呈现', card.hasEditor && card.editorPlaceholder.includes('告诉智能体如何修改这段文字'), card)
  check('② 输入框初始显示节点的提示词内容', card.editorText.includes('把这段文字写得更活泼'), card)
  check('③ 模型下拉只列后台已配置的文本模型（老配置里的「创作 Agent」被纠正）',
    JSON.stringify(card.selectOptions) === JSON.stringify(TEXT_MODELS), card)
  check('③ 模型下拉当前值等于第一个文本模型', card.selectValue === TEXT_MODELS[0], card)

  // ---------- 卡片外观与图像节点卡片逐项一致 ----------
  await selectNode('image-1')
  await page.waitForSelector('.vue-flow__node[data-id="image-1"] .image-composer-panel', { timeout: 15000 })
  await delay(400)
  const imageCardStyle = await page.evaluate(() => {
    const panel = document.querySelector('.vue-flow__node[data-id="image-1"] .image-composer-panel')
    return {
      width: getComputedStyle(panel).width,
      background: getComputedStyle(panel).backgroundColor,
      radius: getComputedStyle(panel).borderRadius,
      padding: getComputedStyle(panel).padding,
      borderColor: getComputedStyle(panel).borderTopColor,
    }
  })
  check('卡片外观：与图像节点卡片逐项一致（宽度/背景/圆角/内边距/描边）',
    JSON.stringify(card.style) === JSON.stringify(imageCardStyle), { text: card.style, image: imageCardStyle })

  // ---------- @ 引用：点 @ 后引用片进入输入框（数据层 promptParts 同步） ----------
  await openTextCard()
  await page.locator('.vue-flow__node[data-id="text-1"] .upstream-thumb').first().locator('.upstream-thumb-mention').click()
  await delay(400)
  const afterMention = await page.evaluate(() => {
    const panel = document.querySelector('.vue-flow__node[data-id="text-1"] .text-agent-panel')
    const editor = panel.querySelector('.inline-prompt-editor')
    return {
      chipCount: editor.querySelectorAll('.inline-prompt-reference').length,
      chipText: editor.querySelector('.inline-prompt-reference')?.textContent?.trim() || '',
      editorText: editor.textContent.trim(),
      panelStillOpen: Boolean(panel),
    }
  })
  check('② 点 @ 后输入框内出现引用片（与图像节点同一套 chip）', afterMention.chipCount === 1 && afterMention.chipText.startsWith('@'), afterMention)
  check('② 插入引用片后卡片保持打开、原文字不丢', afterMention.panelStillOpen && afterMention.editorText.includes('把这段文字写得更活泼'), afterMention)
  await page.screenshot({ path: path.join(OUT_DIR, '02-mention-inserted.png') })

  // ---------- 发送：模型 / 上游文本 / 原文都要真的送出去，结果要写回节点 ----------
  await page.locator('.vue-flow__node[data-id="text-1"] .text-agent-controls .node-run-button').click()
  for (let i = 0; i < 40; i += 1) {
    if (captured.assistant.length) break
    await delay(250)
  }
  await delay(600)
  const sent = captured.assistant[0] || {}
  const nodeAfter = await page.evaluate(() => {
    const node = document.querySelector('.vue-flow__node[data-id="text-1"]')
    return {
      body: node?.querySelector('.smart-text-editor')?.textContent?.trim() || '',
      stored: JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}'),
    }
  })
  const storedText1 = (nodeAfter.stored.nodes || []).find((n) => n.id === 'text-1') || {}
  check('发送：请求打到画布助手，operation=generate-text', sent.operation === 'generate-text', { operation: sent.operation })
  check('③ 发送：使用下拉里选中的文本模型（而不是写死的智能体名）', sent.model === TEXT_MODELS[0], { model: sent.model })
  check('③ 发送：同时带上该模型所属供应商，避免模型落到别家平台',
    sent.provider === 'agnes', { provider: sent.provider })
  check('① 发送：上游文本内容被拼进消息（上游图/文本真的参与了这个节点的生成）',
    String(sent.message || '').includes('上游文案内容'), { message: String(sent.message || '').slice(0, 300) })
  check('发送：已有文字时带「原文」，实现「改这段文字」而不是从零重写',
    String(sent.message || '').includes('原文') && String(sent.message || '').includes('小猫在睡觉'), { message: String(sent.message || '').slice(0, 300) })
  check('发送：把上游节点上下文一并提交给助手', Array.isArray(sent.upstream) && sent.upstream.length === 2, { upstream: sent.upstream })
  check('发送：智能体返回的文字被写回节点（界面上能看到变化）',
    nodeAfter.body.includes('改写后的文字') && String(storedText1.data?.output?.text || '').includes('改写后的文字'),
    { body: nodeAfter.body, outputText: storedText1.data?.output?.text })
  await page.screenshot({ path: path.join(OUT_DIR, '03-after-send.png') })

  check('运行期：无控制台错误', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })

  await browser.close()

  const report = { pass: failures.length === 0, failures, results, capturedSummary: { assistant: captured.assistant.length, health: captured.health } }
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.error(`\n==== 结果：${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`} ====`)
  if (failures.length) console.error(failures.join('\n'))
  process.exitCode = failures.length === 0 ? 0 : 1
} finally {
  killTree(vite)
  stub.close()
}
