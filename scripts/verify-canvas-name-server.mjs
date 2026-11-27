// 画布名称「服务端模式」端到端验收脚本
// 用法：node scripts/verify-canvas-name-server.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
//
// 为什么不连真后端：真实库里没有已知密码的学生账号，插入测试数据会污染机构数据。
// 这里用一个内存 stub 后端（与 verify-canvas-text-node-card 同一套做法）+ VITE_AUTH_MODE=server，
// 专门验证「用户点了名字之后，服务端模式到底有没有真的把 title 存下去」这条链路：
//   ① 首次保存 POST /me/documents 的 title == 顶栏名字（不是项目名「电商广告视频」）
//   ② 之后改名 PATCH /me/documents/:id 带新 title（沿用乐观锁 version）
//   ③ 刷新页面 GET 回来后顶栏显示改名后的名字
//   ④ 素材库列表页显示同一个名字（这就是「后期能找到自己想要的画布」）
//   ⑤ 同 resourceKey 不会被重复建文档（改名不能变成新建）
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
const STUB_PORT = 3234
const WEB_PORT = 5180
const OUT_DIR = path.join(projectDir, '.canvas-name-server-verify')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = {}
const failures = []

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 600)}`}`)
}

// ---------------- 内存 stub 后端 ----------------
const store = { documents: [], seq: 0 }
const captured = { posts: [], patches: [], lists: 0, trace: [] }
const t0 = Date.now()
const trace = (entry) => captured.trace.push({ at: Date.now() - t0, ...entry })

const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { /* 忽略非 JSON */ }
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    const pathname = url.split('?')[0]
    const query = new URLSearchParams(url.split('?')[1] || '')
    trace({ method: req.method, path: pathname, title: body?.title, resourceKey: body?.resourceKey })

    if (pathname === '/api/auth/me') {
      return send(200, { user: { id: 'stu-server-1', name: '服务端模式验收', role: 'student', className: '验收班级', avatar: '验', organizationId: 'org-1' } })
    }
    if (pathname === '/api/auth/login') {
      return send(200, { user: { id: 'stu-server-1', name: '服务端模式验收', role: 'student', className: '验收班级', avatar: '验' } })
    }
    if (pathname === '/api/ai/health') {
      return send(200, {
        ok: true, activeProvider: 'agnes',
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

    if (pathname === '/api/me/documents' && req.method === 'GET') {
      captured.lists += 1
      const type = query.get('type')
      const documents = store.documents.filter((d) => !type || d.type === type)
      return send(200, { documents: documents.map((d) => ({ ...d })) })
    }
    if (pathname === '/api/me/documents' && req.method === 'POST') {
      captured.posts.push(body)
      store.seq += 1
      const document = {
        id: `doc-${store.seq}`,
        type: body.type || 'canvas',
        resourceKey: body.resourceKey || '',
        title: String(body.title || '').trim().slice(0, 160),
        data: body.data || {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      store.documents.push(document)
      return send(201, { document: { ...document } })
    }
    const match = pathname.match(/^\/api\/me\/documents\/([^/]+)$/)
    if (match) {
      const document = store.documents.find((d) => d.id === match[1])
      if (!document) return send(404, { message: 'document not found' })
      if (req.method === 'PATCH') {
        captured.patches.push({ id: match[1], body })
        if (body.title !== undefined) document.title = String(body.title || '').trim().slice(0, 160)
        if (body.data !== undefined) document.data = body.data
        if (body.version !== undefined && Number(body.version) === Number(document.version)) document.version += 1
        document.updatedAt = new Date().toISOString()
        return send(200, { document: { ...document } })
      }
      if (req.method === 'GET') return send(200, { document: { ...document } })
      if (req.method === 'DELETE') {
        store.documents = store.documents.filter((d) => d.id !== match[1])
        return send(200, { ok: true })
      }
    }

    // 其余接口（素材库审核状态等）给个空成功，避免噪声。
    if (pathname.startsWith('/api/')) return send(200, { ok: true, documents: [], works: [], items: [], records: [] })
    return send(404, { message: 'not found' })
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
  env: { ...process.env, VITE_AUTH_MODE: 'server', VITE_AI_MODE: 'api', VITE_API_BASE_URL: '/api', VITE_SERVER_PORT: String(STUB_PORT) },
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
  const ignoreConsole = (text = '') => /favicon|Devtools|Development mode|\[Vue warn\]|Failed to load resource|ERR_|401/i.test(text) === false
  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text())) consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('dialog', (d) => d.accept().catch(() => {}))

  const nameButton = page.locator('.canvas-name-action')
  const nameInput = page.locator('.canvas-name-input')
  const nameText = () => page.locator('.canvas-name-action .canvas-name-text').innerText()
  // 等保存落地必须轮询，不能固定 sleep：vite 首次按需编译 + 首屏那几个请求会把同源连接占满，
  // 首次 POST 实测要 1.2s 之后才发得出去，固定 1.5s 的窗口正好卡在「正在保存」上，
  // 于是 A 段四条断言全部读到一个还没有任何 POST 的空状态（明明产品是对的）。
  const saveSettled = async (timeout = 20000) => {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      const state = await page.evaluate(() => document.querySelector('.save-state')?.textContent?.trim() || '')
      if (state && !/正在保存/.test(state)) return state
      await delay(200)
    }
    return '等待保存超时'
  }
  const waitSaved = () => saveSettled()

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.canvas-name-action', { timeout: 30000 })
  await delay(1000)

  // ===== 场景 A：第一次命名，名字必须真的落到服务端 =====
  // 产品的真实时序有两段，脚本必须按这个时序断言，否则会跟「自动保存」抢跑（实测连跑三次能挂两次）：
  //   ① 刚进画布、用户还没起名 → 自动建一份文档，title 是默认名「未命名无限画布」；
  //   ② 用户起名 → 走 PATCH 把 title 改成他的名字。
  // 所以「首次 POST 的 title 就等于用户名字」这个断言是错的——那份文档在用户起名之前就存在了。
  // 真正该守住的底线是：不管链路先建后改还是直接带名字，库里最终的 title 必须是用户名字，
  // 并且任何时候都不能是项目名（「电商广告视频」），那正是修复前的 bug。
  const DEFAULT_NAME = '未命名无限画布'
  const NAME_A = '五年级版画单元 · 第一版'
  // 请求监听：A 段一旦失败，靠它就能一眼分清「请求压根没出浏览器」和「后端没落库」。
  const wire = []
  page.on('request', (req) => {
    if (req.method() === 'GET') return
    let title = ''
    try { title = JSON.parse(req.postData() || '{}')?.title || '' } catch { /* 忽略非 JSON */ }
    wire.push(`${req.method()} ${new URL(req.url()).pathname} title=${title}`)
  })

  // 先等「进画布自动建文档」这一步落地（最多 15s）。等不到也不算失败：
  // 产品哪天改成「用户起名时才建文档」，链路依然合法，下面的断言同样成立。
  for (let i = 0; i < 75 && captured.posts.length === 0; i += 1) await delay(200)
  const autoPost = captured.posts[0] || null

  await nameButton.click()
  await page.waitForSelector('.canvas-name-input', { timeout: 8000 })
  await nameInput.fill(NAME_A)
  const draftInDom = await page.evaluate(() => document.querySelector('.canvas-name-input')?.value || '')
  await nameInput.press('Enter')
  // 等「库里的名字变成用户名字」，而不是等固定时长：改名走 PATCH，往返时间不确定。
  const startedA = Date.now()
  while (Date.now() - startedA < 20000 && store.documents[0]?.title !== NAME_A) await delay(200)
  const settledA = await waitSaved()
  if (store.documents[0]?.title !== NAME_A) {
    const afterA = await page.evaluate(() => ({
      topbarName: document.querySelector('.canvas-name-action .canvas-name-text')?.textContent?.trim() || '',
      stillEditing: Boolean(document.querySelector('.canvas-name-input')),
      saveState: document.querySelector('.save-state')?.textContent?.trim() || '',
    }))
    console.error(`  [A 段诊断] draftInDom=${JSON.stringify(draftInDom)} settled=${JSON.stringify(settledA)} ${JSON.stringify(afterA)} wire=${JSON.stringify(wire)}`)
  }

  const storedName = store.documents[0]?.title || ''
  const anyTitleOk = [DEFAULT_NAME, NAME_A].includes(autoPost?.title || '')
  check('A① 进入画布后服务端确实建了一份画布文档（不是只存在浏览器里）', store.documents.length === 1, { documents: store.documents.map((d) => d.title) })
  check('A② 建文档的 title 是画布自己的名字，不是项目名「电商广告视频」',
    anyTitleOk && autoPost?.title !== '电商广告视频', { sentTitle: autoPost?.title, allowed: [DEFAULT_NAME, NAME_A], projectNameGuessed: '电商广告视频' })
  check('A③ 建文档时带上 type=canvas 与 data 快照', autoPost?.type === 'canvas' && Boolean(autoPost?.data), { type: autoPost?.type, hasData: Boolean(autoPost?.data) })
  check('A④ 起名之后，库里那份文档的 title 就是用户起的名字（会自动改名，不会新建）',
    storedName === NAME_A && store.documents.length === 1, { storedName, expected: NAME_A, count: store.documents.length })

  // ===== 场景 B：改名后应走 PATCH（同一份画布，不是新建）=====
  const NAME_B = '五年级版画单元 · 第二版（定稿）'
  const postsBefore = captured.posts.length
  await nameButton.click()
  await page.waitForSelector('.canvas-name-input', { timeout: 8000 })
  await nameInput.fill(NAME_B)
  await nameInput.press('Enter')
  await delay(400)
  await waitSaved()

  const patch = captured.patches[captured.patches.length - 1] || {}
  check('B① 改名走 PATCH 更新同一份文档，没有又新建一份', captured.posts.length === postsBefore, { postsBefore, postsAfter: captured.posts.length })
  check('B② PATCH 带上了新名字', patch.body?.title === NAME_B, { sentTitle: patch.body?.title, expected: NAME_B })
  check('B③ PATCH 带上了乐观锁 version（避免覆盖别人改动）', Number.isFinite(Number(patch.body?.version)), { version: patch.body?.version })
  check('B④ 库里只有一份画布、名字已更新', store.documents.length === 1 && store.documents[0].title === NAME_B,
    { count: store.documents.length, titles: store.documents.map((d) => d.title) })
  await page.screenshot({ path: path.join(OUT_DIR, '01-canvas-renamed.png') })

  // ===== 场景 C：刷新后名字从服务端读回来 =====
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.canvas-name-action', { timeout: 30000 })
  await delay(1200)
  check('C① 刷新页面后顶栏名字来自服务端（真正「保存后保留名字」）', (await nameText()).trim() === NAME_B, { text: await nameText() })

  // ===== 场景 D：素材库能看到同一个名字 =====
  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/portfolio`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.portfolio-grid, .portfolio-empty', { timeout: 30000 })
  await delay(1500)
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.portfolio-card')).map((card) => ({
    title: card.querySelector('.portfolio-cover-info strong')?.textContent?.trim() || '',
    kind: card.querySelector('.kind-chip')?.textContent?.trim() || '',
  })))
  const canvasCard = cards.find((c) => c.kind === '无限画布') || {}
  check('D① 素材库列表里能按这个名字找到画布', canvasCard.title === NAME_B, { cards })
  await page.screenshot({ path: path.join(OUT_DIR, '02-portfolio.png') })

  // ===== 场景 E：不带 canvasId 重新进入画布，应命中同一份而不是再建一份 =====
  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.canvas-name-action', { timeout: 30000 })
  await delay(1500)
  const postsBeforeReenter = captured.posts.length
  await waitSaved()
  check('E① 再次进入画布按 resourceKey 复用同一份文档，不会重复新建', captured.posts.length === postsBeforeReenter,
    { postsBeforeReenter, postsAfter: captured.posts.length })
  check('E② 名字仍是服务端那份（没被重置成默认名）', (await nameText()).trim() === NAME_B, { text: await nameText() })

  check('运行期：无控制台错误', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })

  await browser.close()

  const report = {
    pass: failures.length === 0,
    failures,
    results,
    stub: { documents: store.documents.map((d) => ({ id: d.id, title: d.title, resourceKey: d.resourceKey, version: d.version })), posts: captured.posts.length, patches: captured.patches.length, trace: captured.trace },
  }
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.error(`\n==== 结果：${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`} ====`)
  if (failures.length) console.error(failures.join('\n'))
  process.exitCode = failures.length === 0 ? 0 : 1
} finally {
  killTree(vite)
  stub.close()
}
