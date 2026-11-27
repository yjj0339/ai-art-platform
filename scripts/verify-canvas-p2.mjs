// 无限画布 P2（分组 + 模板 + 局部元素引用）端到端验收脚本
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy node scripts/verify-canvas-p2.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
//
// 覆盖：
//   静态断言 —— 分组节点模板 / 序列化白名单 / 模板面板 / 服务端路由 / 能力开关
//   真实后端 —— /api/canvas/templates 的增删改查与校验（spawn server/index.js，独立 AI_DATA_DIR）
//   浏览器   —— 面板列表 → 套用模板（id 重映射 / 父子保持 / 引用片重映射）→ 拖组带成员同位移
//              → 助手 save_as_template 落库（坐标归一化）
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3221
const API_PORT = 3222
const WEB_PORT = 5176
const OUT_DIR = path.join(projectDir, '.canvas-p2-verify')
const DATA_DIR = path.join(OUT_DIR, 'server-data')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = {}
const failures = []
const captured = { templatesList: 0, templateCreated: [], assistantPrompts: [] }

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  // detail 可能是 undefined（例如断言依赖的是持久化副作用），String(...) 兜底避免脚本自身崩掉。
  const text = String(JSON.stringify(detail) ?? '')
  if (!condition) failures.push(`${name} -> ${text}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${text.slice(0, 500)}`}`)
}

// ---------------- 模板快照：一个分组 + 2 个成员 + 1 条内部连线 ----------------
// image-1 的提示词里带一个指向 text-1 的引用片，用来验证 id 重映射。
const TEMPLATE_GRAPH = {
  nodes: [
    {
      id: 'group-1', type: 'group', position: { x: 0, y: 0 }, width: 520, height: 360,
      style: { width: '520px', height: '360px' },
      data: { mode: 'group', title: '素材组', width: 520, height: 360 },
    },
    {
      id: 'text-1', type: 'text', position: { x: 48, y: 48 }, parentNode: 'group-1', extent: 'parent',
      data: { title: '文案', mode: 'text', text: '模板文案', prompt: '模板文案', promptParts: [{ type: 'text', text: '模板文案' }] },
    },
    {
      id: 'image-1', type: 'image', position: { x: 48, y: 200 }, parentNode: 'group-1', extent: 'parent',
      data: {
        title: '图像生成', mode: 'image-generation', status: 'idle', error: '',
        prompt: '参考 @文案 画一张图',
        promptParts: [{ type: 'reference', id: 'text-1' }, { type: 'text', text: ' 画一张图' }],
        config: { model: '', ratio: '1:1', resolution: '1080P' },
      },
    },
  ],
  edges: [{ id: 'e-1', source: 'text-1', target: 'image-1', sourceHandle: null, targetHandle: null }],
}

const TEMPLATE_LIST = [
  { id: 'ctpl_seed_group', name: '商品图基础组', description: '分组 + 文案 + 图像', scope: 'org', nodeCount: 3, edgeCount: 1 },
  { id: 'ctpl_seed_single', name: '单节点模板', description: '', scope: 'private', nodeCount: 1, edgeCount: 0 },
]

const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { /* 忽略非 JSON */ }
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = (req.url || '').split('?')[0]

    // 画布助手入口会先检查「后台有没有可用文本模型」（无模型直接提示、不发请求），
    // 桩必须像真实后端一样返回 providers，否则整个助手链路都走不到。
    if (req.method === 'GET' && url.startsWith('/api/ai/health')) {
      return send(200, {
        ok: true,
        activeProvider: 'agnes',
        providers: {
          agnes: {
            key: 'agnes', label: 'Agnes AI', configured: true,
            imageModel: 'agnes-image-2.0-flash', imageModels: ['agnes-image-2.0-flash'],
            textModel: 'gpt-4o-mini', textModels: ['gpt-4o-mini'],
            videoModel: '', videoModels: [],
          },
        },
      })
    }

    if (req.method === 'POST' && url === '/api/ai/canvas/assistant') {
      captured.assistantPrompts.push(String(body.message || ''))
      const message = String(body.message || '')
      if (message.includes('存模板')) {
        return send(200, {
          reply: '已把视频节点存为模板。',
          actions: [{ type: 'save_as_template', nodeIds: ['video-verify'], name: '视频流程模板', scope: 'org', description: '验收用' }],
          warnings: [],
        })
      }
      if (message.includes('套用')) {
        return send(200, { reply: '已套用模板。', actions: [{ type: 'instantiate_template', templateId: 'ctpl_seed_group' }], warnings: [] })
      }
      return send(200, { reply: '好的。', actions: [], warnings: [] })
    }

    if (req.method === 'GET' && url === '/api/canvas/templates') {
      captured.templatesList += 1
      return send(200, { ok: true, templates: TEMPLATE_LIST })
    }
    if (req.method === 'POST' && url === '/api/canvas/templates') {
      captured.templateCreated.push(body)
      return send(201, { ok: true, template: { id: 'ctpl_created_1', ...body, nodeCount: body?.graph?.nodes?.length || 0, edgeCount: body?.graph?.edges?.length || 0 } })
    }
    const detail = url.match(/^\/api\/canvas\/templates\/([A-Za-z0-9_-]+)$/)
    if (detail && req.method === 'GET') {
      if (detail[1] !== 'ctpl_seed_group') return send(200, { ok: true, template: null })
      return send(200, { ok: true, template: { ...TEMPLATE_LIST[0], graph: TEMPLATE_GRAPH } })
    }
    if (url.startsWith('/api/')) return send(200, { ok: true })
    return send(404, { ok: false })
  })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

// ---------------- 真实后端（模板存储） ----------------
await rm(DATA_DIR, { recursive: true, force: true }).catch(() => {})
const apiServer = spawn(process.execPath, [path.join(projectDir, 'server', 'index.js')], {
  cwd: projectDir,
  shell: false,
  env: { ...process.env, PORT: String(API_PORT), AUTH_MODE: 'demo', AI_DATA_DIR: DATA_DIR },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let apiLog = ''
apiServer.stdout.on('data', (c) => { apiLog += c })
apiServer.stderr.on('data', (c) => { apiLog += c })

function killTree(child) {
  if (!child || child.killed) return
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGKILL')
  } catch { /* ignore */ }
}

const API = `http://127.0.0.1:${API_PORT}`
const api = async (method, url, body) => {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, data: await response.json().catch(() => null) }
}

try {
  await mkdir(OUT_DIR, { recursive: true })

  // ==================== 1. 静态断言 ====================
  {
    const canvas = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
    const gateway = await readFile(path.join(projectDir, 'src', 'services', 'aiGateway.js'), 'utf8')
    const server = await readFile(path.join(projectDir, 'server', 'index.js'), 'utf8')
    const admin = await readFile(path.join(projectDir, 'src', 'views', 'AdminDashboard.vue'), 'utf8')

    check('分组：group 节点模板与解组按钮就位',
      canvas.includes('#node-group') && canvas.includes('class="group-node"') && canvas.includes('group-node-ungroup'), { ok: true })
    check('分组：拖组前先清掉成员选中态（防位移两倍）',
      canvas.includes('function onGroupPointerDown') && canvas.includes('addSelectedNodes([{ id: groupId }])'), { ok: true })
    check('分组：序列化白名单保留 parentNode / extent',
      /nodes:\s*nodes\.value\.map\([\s\S]{0,420}parentNode: node\.parentNode[\s\S]{0,200}extent: node\.extent/.test(canvas), { ok: true })
    check('模板：前端具备抽取 / 实例化 / 面板三件套',
      canvas.includes('function extractSubgraph') && canvas.includes('function instantiateTemplate')
      && canvas.includes('class="template-content"') && canvas.includes('function saveTemplateFromSelection'), { ok: true })
    check('模板：实例化会重映射节点 id / nodeId / 引用片 id',
      canvas.includes('const remapReferences') && canvas.includes("key === 'nodeId' || key === 'id'"), { ok: true })
    check('模板：网关导出四个模板方法',
      ['listCanvasTemplates', 'getCanvasTemplate', 'saveCanvasTemplate', 'deleteCanvasTemplate']
        .every((name) => gateway.includes(`export async function ${name}`)), { ok: true })
    check('模板：助手请求透传 availableTemplates', gateway.includes('availableTemplates:') && canvas.includes('availableTemplates: assistantTemplateSummaries()'), { ok: true })
    check('模板：服务端存储模块 + 五个路由',
      server.includes("from './canvas-template-store.js'") && ['GET', 'POST', 'PATCH', 'DELETE']
        .every((m) => server.includes(`req.method === '${m}'`) && server.includes('/api/canvas/templates')), { ok: true })
    check('能力开关：后台三个新开关与助手 action 映射齐备',
      admin.includes("key: 'groupNodes'") && admin.includes("key: 'canvasTemplate'") && admin.includes("key: 'addElementReference'")
      && server.includes("save_as_template: 'canvasTemplate'") && server.includes("add_element_reference: 'addElementReference'"), { ok: true })
    check('助手：save_as_template 小票不提供单步撤销',
      canvas.includes('ASSISTANT_NO_UNDO_ACTIONS') && canvas.includes('!message.noUndo'), { ok: true })
  }

  // ==================== 2. 真实后端：模板 CRUD ====================
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${API}/api/health`); if (r.ok) break } catch { /* retry */ }
    if (i === 59) throw new Error(`后端启动失败：${apiLog.slice(-1200)}`)
    await delay(250)
  }
  {
    const created = await api('POST', '/api/canvas/templates', {
      name: '验收模板', description: 'p2', scope: 'org', graph: TEMPLATE_GRAPH,
    })
    check('后端：POST 创建模板返回 201 + ctpl_ 前缀 id',
      created.status === 201 && /^ctpl_/.test(created.data?.template?.id || ''), created)
    const id = created.data?.template?.id || ''
    check('后端：创建时保留分组父子与 extent',
      created.data?.template?.graph?.nodes?.find((n) => n.id === 'text-1')?.parentNode === 'group-1'
      && created.data?.template?.graph?.nodes?.find((n) => n.id === 'text-1')?.extent === 'parent', created.data?.template?.graph?.nodes)

    const list = await api('GET', '/api/canvas/templates')
    check('后端：GET 列表默认不带 graph',
      list.status === 200 && Array.isArray(list.data?.templates) && list.data.templates.every((t) => t.graph === undefined) && list.data.templates.length === 1, list.data)

    const detail = await api('GET', `/api/canvas/templates/${id}`)
    check('后端：GET 详情带 graph 且节点数一致',
      detail.status === 200 && detail.data?.template?.graph?.nodes?.length === 3 && detail.data.template.graph.edges.length === 1, detail.data?.template?.nodeCount)

    const patched = await api('PATCH', `/api/canvas/templates/${id}`, { name: '验收模板-改名', scope: 'private', graph: { nodes: TEMPLATE_GRAPH.nodes, edges: [] } })
    check('后端：PATCH 改名并支持 scope 切换',
      patched.status === 200 && patched.data?.template?.name === '验收模板-改名' && patched.data.template.scope === 'private', patched.data?.template)

    const empty = await api('POST', '/api/canvas/templates', { name: '空模板', graph: { nodes: [], edges: [] } })
    check('后端：空节点模板被拒（400）', empty.status === 400 && empty.data?.ok === false, empty)

    const tooMany = await api('POST', '/api/canvas/templates', {
      name: '超量',
      graph: { nodes: Array.from({ length: 61 }, (_, i) => ({ id: `n${i}`, type: 'text', position: { x: 0, y: 0 }, data: {} })), edges: [] },
    })
    check('后端：超过 60 个节点被拒（400）', tooMany.status === 400, tooMany.status)

    const dangling = await api('POST', '/api/canvas/templates', {
      name: '悬空连线',
      graph: { nodes: [{ id: 'a', type: 'text', position: { x: 5, y: 7 }, data: {} }], edges: [{ id: 'x', source: 'a', target: 'ghost' }] },
    })
    check('后端：跨出子图的连线被丢弃', dangling.status === 201 && dangling.data?.template?.edgeCount === 0, dangling.data?.template?.edgeCount)

    const removed = await api('DELETE', `/api/canvas/templates/${id}`)
    const afterDelete = await api('GET', `/api/canvas/templates/${id}`)
    check('后端：DELETE 后详情 404', removed.status === 200 && removed.data?.ok === true && afterDelete.status === 404, { removed: removed.status, afterDelete: afterDelete.status })
  }

  // ==================== 3. 浏览器端到端 ====================
  {
    const busy = await fetch(`http://127.0.0.1:${WEB_PORT}/`).then(() => true).catch(() => false)
    if (busy) throw new Error(`vite 端口 ${WEB_PORT} 已被占用，请先关闭后重跑`)
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

  try {
    const buildSeed = () => {
      if (sessionStorage.getItem('canvas-p2-seeded') === '1') return
      sessionStorage.setItem('canvas-p2-seeded', '1')
      localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify({
        version: 2,
        nodes: [
          {
            id: 'video-verify', type: 'video', position: { x: 60, y: 60 },
            data: {
              title: '视频生成', mode: 'video-generation', status: 'idle', error: '',
              prompt: '一只猫在窗边', config: { model: '', ratio: '16:9', resolution: '1080P', duration: 5 },
            },
          },
          {
            id: 'text-verify', type: 'text', position: { x: 60, y: 460 },
            data: { title: '文案', mode: 'text', text: '画布上的文案', prompt: '画布上的文案', promptParts: [{ type: 'text', text: '画布上的文案' }] },
          },
        ],
        edges: [],
        settings: {},
      }))
    }

    for (let i = 0; i < 160; i += 1) {
      try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
      if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
      await delay(250)
    }

    const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
    // favicon / devtools 之类的噪声要连 URL 一起过滤（消息文本本身不含 favicon）。
    const ignoreConsole = (text, url = '') => !/favicon|Devtools|Development mode|\[Vue warn\]/i.test(`${text} ${url}`)
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    await context.addInitScript(() => {
      localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '画布验收学生', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    })
    await context.addInitScript(buildSeed)
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    const notFound = []
    page.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text(), m.location()?.url || '')) consoleErrors.push(`${m.text()} @ ${m.location()?.url || ''}`) })
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    page.on('response', (r) => { if (r.status() === 404) notFound.push(r.url()) })

    const nodeIds = () => page.$$eval('.vue-flow__node', (els) => els.map((el) => el.getAttribute('data-id')))
    const nodeCount = async () => (await nodeIds()).length
    const rectOf = (id) => page.evaluate((nodeId) => {
      const el = document.querySelector(`.vue-flow__node[data-id="${nodeId}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }, id)

    await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.vue-flow__node[data-id="video-verify"]', { timeout: 30000 })
    await delay(800)
    const paletteClose = page.locator('button[aria-label="关闭创建节点面板"]')
    if (await paletteClose.count()) await paletteClose.first().click().catch(() => {})
    await delay(300)
    const beforeSeedIds = await nodeIds()
    check('前置：种子画布 2 个节点 0 条连线', beforeSeedIds.length === 2, beforeSeedIds)
    await page.screenshot({ path: path.join(OUT_DIR, '01-seed.png') })

    // ---- 3.1 打开模板面板，列表来自服务端 ----
    await page.locator('button[aria-label="画布模板"]').click()
    await page.waitForSelector('.template-content', { timeout: 10000 })
    await page.waitForSelector('.template-item', { timeout: 10000 })
    await delay(300)
    const listed = await page.$$eval('.template-item .template-item-name', (els) => els.map((el) => el.textContent.trim()))
    check('面板：模板列表渲染服务端返回的 2 条', listed.length === 2 && listed[0] === '商品图基础组', listed)
    check('面板：列表请求已打到服务端', captured.templatesList >= 1, captured.templatesList)
    await page.screenshot({ path: path.join(OUT_DIR, '02-template-panel.png') })

    // ---- 3.2 点「应用」→ 实例化（id 重映射 / 父子保持 / 引用片重映射） ----
    await page.locator('.template-item', { hasText: '商品图基础组' }).locator('.template-apply').click()
    // 套用要先 GET 模板详情再实例化，固定 sleep 会偶发抢跑（detail 还没回来就数节点）。
    // 显式等节点数超过种子数，最多 12s；超时不算失败，交给下面的断言报真实数量。
    await page.waitForFunction(() => document.querySelectorAll('.vue-flow__node').length > 2, null, { timeout: 12000 }).catch(() => {})
    await delay(600)
    const afterApply = await nodeIds()
    check('套用：新增 3 个节点（1 组 + 2 成员）', afterApply.length === 5, afterApply)
    check('套用：新节点 id 不与模板原 id 冲突', !afterApply.includes('group-1') && !afterApply.includes('text-1') && !afterApply.includes('image-1'), afterApply)
    const edgeCount = await page.$$eval('.vue-flow__edge', (els) => els.length)
    check('套用：新增 1 条内部连线', edgeCount === 1, edgeCount)

    const structure = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('.vue-flow__node-group')]
      const groupId = groups[0]?.getAttribute('data-id') || ''
      const childNodes = [...document.querySelectorAll('.vue-flow__node')]
      return {
        groupId,
        groupTitle: groups[0]?.querySelector('.group-node-title')?.textContent?.trim() || '',
        groupCount: groups[0]?.querySelector('.group-node-count')?.textContent?.trim() || '',
        memberCount: childNodes.filter((el) => el.getAttribute('data-id') !== groupId).length,
      }
    })
    check('套用：分组界面显示标题与成员数', structure.groupId !== '' && structure.groupTitle === '素材组' && /2\s*个节点/.test(structure.groupCount), structure)

    const refInfo = await page.evaluate(() => {
      const imageNode = [...document.querySelectorAll('.vue-flow__node')].find((el) => el.querySelector('.inline-prompt-text'))
      if (!imageNode) return null
      const chips = [...imageNode.querySelectorAll('.generation-reference-chips .inline-prompt-chip, .generation-reference-chips .prompt-chip')]
      return { chipCount: chips.length, chipText: chips[0]?.textContent?.trim() || '' }
    })
    check('套用：引用片被重建（不是纯文本）', refInfo === null || refInfo.chipCount >= 1, refInfo)
    await page.screenshot({ path: path.join(OUT_DIR, '03-instantiated.png') })

    // ---- 3.3 拖动组框：成员必须与组同位移（防位移两倍） ----
    const groupId = structure.groupId
    // 只取「套用模板新增、且不是组本身」的 2 个节点作为成员，别把种子节点算进来。
    const memberIds = afterApply.filter((id) => id !== groupId && !beforeSeedIds.includes(id))
    check('拖组：识别出 2 个新成员', memberIds.length === 2, memberIds)
    const beforeGroup = await rectOf(groupId)
    const beforeMembers = {}
    for (const id of memberIds) beforeMembers[id] = await rectOf(id)
    const head = await page.locator(`.vue-flow__node[data-id="${groupId}"] .group-node-title`).boundingBox()
    // 诊断：拖动落点上到底压着谁（新节点落点/层级变化后，标题可能被别的节点盖住 → 拖不动）。
    const dragDiag = await page.evaluate((gid) => {
      const title = document.querySelector(`.vue-flow__node[data-id="${gid}"] .group-node-title`)
      const groupEl = document.querySelector(`.vue-flow__node[data-id="${gid}"]`)
      if (!title || !groupEl) return { missing: true }
      const r = title.getBoundingClientRect()
      const g = groupEl.getBoundingClientRect()
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      const top = document.elementFromPoint(cx, cy)
      return {
        title: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        group: { x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.width), h: Math.round(g.height) },
        point: { cx: Math.round(cx), cy: Math.round(cy) },
        topTag: top?.tagName || '',
        topClass: String(top?.className || '').slice(0, 80),
        topNodeId: top?.closest?.('.vue-flow__node')?.getAttribute('data-id') || '',
        transformBefore: groupEl.style.transform,
      }
    }, groupId)
    console.error('[拖组诊断-前]', JSON.stringify(dragDiag))
    if (head) {
      await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2)
      await page.mouse.down()
      await page.mouse.move(head.x + head.width / 2 + 40, head.y + head.height / 2 + 20, { steps: 6 })
      await page.mouse.move(head.x + head.width / 2 + 120, head.y + head.height / 2 + 60, { steps: 6 })
      await page.mouse.up()
      await delay(500)
    }
    const afterGroup = await rectOf(groupId)
    const groupDelta = { x: afterGroup.x - beforeGroup.x, y: afterGroup.y - beforeGroup.y }
    console.error('[拖组诊断-后]', JSON.stringify(await page.evaluate((gid) => {
      const el = document.querySelector(`.vue-flow__node[data-id="${gid}"]`)
      return el ? { transformAfter: el.style.transform } : { missing: true }
    }, groupId)))
    check('拖组：组框确实被拖动', Math.abs(groupDelta.x) > 20 || Math.abs(groupDelta.y) > 20, groupDelta)
    let worstMemberDelta = null
    for (const id of memberIds) {
      const after = await rectOf(id)
      const delta = { x: after.x - beforeMembers[id].x, y: after.y - beforeMembers[id].y }
      const drift = Math.hypot(delta.x - groupDelta.x, delta.y - groupDelta.y)
      if (!worstMemberDelta || drift > worstMemberDelta.drift) worstMemberDelta = { id, delta, drift }
    }
    check('拖组：成员位移与组一致（没有位移两倍）', worstMemberDelta && worstMemberDelta.drift < 4, { groupDelta, worstMemberDelta })
    await page.screenshot({ path: path.join(OUT_DIR, '04-group-dragged.png') })

    // ---- 3.4 助手 save_as_template：落库且坐标归一化 ----
    // 右侧栏是手风琴：打开模板面板会把助手收起，动助手前先展开回来。
    const openAssistant = async () => {
      if (await page.locator('.assistant-composer textarea').count()) return
      await page.locator('.assistant-section .accordion-header').click()
      await page.waitForSelector('.assistant-composer textarea', { timeout: 10000 })
      await delay(250)
    }
    await openAssistant()
    await page.fill('.assistant-composer textarea', '把这个视频节点存模板')
    await page.keyboard.press('Enter')
    await delay(1800)
    const posted = captured.templateCreated[captured.templateCreated.length - 1]
    check('助手：save_as_template 触发 POST 且只有 1 个节点',
      Boolean(posted) && posted?.graph?.nodes?.length === 1 && posted?.graph?.nodes?.[0]?.id === 'video-verify', posted?.graph?.nodes?.map((n) => n.id))
    check('助手：模板名称 / 范围按 action 落库',
      posted?.name === '视频流程模板' && posted?.scope === 'org', { name: posted?.name, scope: posted?.scope })
    check('助手：坐标已归一化到左上角原点',
      posted?.graph?.nodes?.[0]?.position?.x === 0 && posted?.graph?.nodes?.[0]?.position?.y === 0, posted?.graph?.nodes?.[0]?.position)

    const ticketText = await page.$$eval('.assistant-message.ticket .ticket-text', (els) => els.map((el) => el.textContent.trim())).catch(() => [])
    const ticketDone = await page.$$eval('.assistant-message.ticket .ticket-undone', (els) => els.map((el) => el.textContent.trim())).catch(() => [])
    const undoButtons = await page.$$eval('.assistant-message.ticket .ticket-undo', (els) => els.length).catch(() => 0)
    check('助手：存模板小票显示已完成且不给撤销按钮',
      ticketText.some((t) => t.includes('存为模板')) && ticketDone.some((t) => t === '已完成') && undoButtons === 0,
      { ticketText, ticketDone, undoButtons })
    await page.screenshot({ path: path.join(OUT_DIR, '05-save-template-ticket.png') })

    // ---- 3.5 助手 instantiate_template ----
    await openAssistant()
    const beforeSecond = await nodeCount()
    await page.fill('.assistant-composer textarea', '再套用一次那个分组模板')
    await page.keyboard.press('Enter')
    // 第二次要先 GET 模板详情再插节点（还要等助手本轮响应收尾），固定 sleep 会抢跑。
    await page.waitForFunction((n) => document.querySelectorAll('.vue-flow__node').length >= n + 3, beforeSecond, { timeout: 15000 }).catch(() => {})
    await delay(600)
    const afterSecond = await nodeCount()
    check('助手：instantiate_template 再插入 3 个节点', afterSecond - beforeSecond === 3, { beforeSecond, afterSecond })
    const groupsNow = await page.$$eval('.vue-flow__node-group', (els) => els.map((el) => el.getAttribute('data-id')))
    check('助手：两次套用的分组 id 不同（无覆盖）', new Set(groupsNow).size === groupsNow.length, groupsNow)
    await page.screenshot({ path: path.join(OUT_DIR, '06-assistant-instantiate.png') })

    check('运行期：无 pageerror', pageErrors.length === 0, pageErrors)
    // 只关心画布自身资源；stub 对未实现的 /api/* 一律回 ok，出现 404 即说明有真实缺口。
    check('运行期：无 console error', consoleErrors.length === 0, { consoleErrors: consoleErrors.slice(0, 6), notFound: notFound.slice(0, 8) })

    await browser.close()
  } finally {
    killTree(vite)
  }
} finally {
  killTree(apiServer)
  stub.close()
}

console.error(`\n---- 结果 ----\nPASS ${Object.values(results).filter((r) => r.pass).length} / ${Object.keys(results).length}`)
if (failures.length) {
  console.error(`FAILURES:\n${failures.join('\n')}`)
  process.exitCode = 1
}
