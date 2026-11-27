// 真实后端 + PostgreSQL + 浏览器验收；模型由隔离 HTTP 测试服务提供，不是付费 AI 效果验收。
// 必须提供专用 TEST_DATABASE_URL（库名包含 test）。可选 PLAYWRIGHT_MODULE、PLAYWRIGHT_EXECUTABLE_PATH。
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { applyArtworkAdjustments } from '../src/utils/artworkAdjust.js'

const testUrl = process.env.TEST_DATABASE_URL || ''
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('请设置名称包含 test 的专用 TEST_DATABASE_URL，禁止使用业务库。')
process.env.DATABASE_URL = testUrl
const { query, closeDb } = await import('../server/db.js')
const { hashPassword } = await import('../server/auth.js')
const suffix = randomBytes(6).toString('hex'), org = `edit_test_${suffix}`, password = randomBytes(16).toString('hex')
const evidenceDir = resolve('.workbuddy/evidence/artwork-edit', suffix), dataDir = join(evidenceDir, 'data')
await mkdir(dataDir, { recursive: true })
const results = []
function check(label, value = true) { assert.ok(value, label); results.push(label); console.log(`通过：${label}`) }
const width = 180, height = 120, raw = Buffer.alloc(width * height * 4)
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const n = (y * width + x) * 4; raw[n] = x; raw[n + 1] = y + 40; raw[n + 2] = 90; raw[n + 3] = 255 }
const original = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()
const maskRaw = Buffer.alloc(width * height * 4, 255)
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const n = (y * width + x) * 4; const selected = x >= 50 && x < 120 && y >= 25 && y < 90; maskRaw[n] = maskRaw[n + 1] = maskRaw[n + 2] = selected ? 255 : 0 }
const png = async (data, w = width, h = height) => sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
const imageData = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`
const mask = imageData(await png(maskRaw))
let upstreamMode = 'success', upstreamCalls = 0, lastMultipart = ''
const generated = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ec4a38' } }).png().toBuffer()
const upstream = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  lastMultipart = Buffer.concat(chunks).toString('latin1'); upstreamCalls++
  if (upstreamMode === 'timeout') { setTimeout(() => res.end('{}'), 1600); return }
  res.setHeader('Content-Type', 'application/json')
  if (upstreamMode === 'limit') { res.writeHead(429); res.end(JSON.stringify({ error: { code: 'rate_limit' } })); return }
  if (upstreamMode === 'balance') { res.writeHead(402); res.end(JSON.stringify({ error: { code: 'insufficient_balance' } })); return }
  if (upstreamMode === 'safety') { res.writeHead(400); res.end(JSON.stringify({ error: { code: 'content_policy_violation' } })); return }
  if (upstreamMode === 'failure') { res.writeHead(500); res.end(JSON.stringify({ error: { code: 'internal_error' } })); return }
  if (upstreamMode === 'empty') { res.end(JSON.stringify({ data: [] })); return }
  res.end(JSON.stringify({ data: [{ b64_json: generated.toString('base64') }] }))
})
await new Promise((done) => upstream.listen(0, '127.0.0.1', done))
const baseUrl = `http://127.0.0.1:${upstream.address().port}/v1`
await writeFile(join(dataDir, 'ai-providers.json'), JSON.stringify({ defaultProvider: 'openai', hiddenProviders: ['agnes', 'volcengine', 'deepseek', 'hunyuan3d'], providers: { openai: { label: '隔离选区测试模型', baseUrl, apiKey: 'isolated-test-key', imageModel: 'edit-fixture', imageModels: ['edit-fixture'], imageEdit: { protocol: 'openai-mask', models: ['edit-fixture'], size: '1024x1024' } } } }))
let server, web, browser, port, webPort, logs = '', projectDocument, originalVersion
const users = {}, cookies = {}
async function freePort() { const instance = http.createServer(); await new Promise((done) => instance.listen(0, '127.0.0.1', done)); const p = instance.address().port; await new Promise((done) => instance.close(done)); return p }
async function startServer(rate = 100, timeoutMs = 1000) {
  port ||= await freePort()
  webPort ||= await freePort()
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), AUTH_MODE: 'server', DATABASE_URL: testUrl, AI_DATA_DIR: dataDir, APP_ORIGIN: `http://127.0.0.1:${webPort}`, ARTWORK_EDIT_RATE_PER_MINUTE: String(rate), ARTWORK_EDIT_TIMEOUT_MS: String(timeoutMs), OPENAI_API_KEY: 'isolated-test-key' }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', (chunk) => { logs += chunk }); server.stderr.on('data', (chunk) => { logs += chunk })
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return } catch {} if (server.exitCode !== null) throw new Error('隔离后端启动失败'); await new Promise((done) => setTimeout(done, 100)) }
  throw new Error('隔离后端启动超时')
}
async function stopServer() { const exit = once(server, 'exit'); server.kill(); await exit }
async function request(route, body, cookie = cookies.student) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), headers: { 'Content-Type': 'application/json', Cookie: cookie || '' } })
  const content = response.headers.get('content-type') || ''
  const data = content.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer())
  return { status: response.status, data, response }
}
async function expectStatus(label, route, body, status, cookie) { const result = await request(route, body, cookie); assert.equal(result.status, status, `${label}：${JSON.stringify(result.data)}`); check(label); return result }
const editBody = (operation = 'repaint') => ({ documentId: projectDocument.id, versionId: 'v-original', operation, provider: 'openai', model: 'edit-fixture', prompt: '在选区添加一顶红帽子', mask })
try {
  await query(await readFile('server/schema.sql', 'utf8'))
  const hash = await hashPassword(password)
  await query('INSERT INTO organizations (id,code,name) VALUES ($1,$1,$1)', [org])
  for (const role of ['student', 'other', 'teacher', 'parent', 'admin']) {
    users[role] = `${role}_${suffix}`
    await query('INSERT INTO users (id,organization_id,account,password_hash,display_name,role,permissions) VALUES ($1,$2,$1,$3,$1,$4,$5)', [users[role], org, hash, role === 'other' ? 'student' : role, JSON.stringify({ studentAccess: true, aiCreate: true })])
  }
  await startServer()
  for (const role of Object.keys(users)) {
    const result = await request('/api/auth/login', { account: users[role], password, organizationCode: org }, '')
    assert.equal(result.status, 200); cookies[role] = result.response.headers.get('set-cookie').split(';')[0]
  }
  const initial = await request('/api/me/documents', { type: 'project', resourceKey: `project_${suffix}`, title: '选区修改验收作品', data: { id: `project_${suffix}`, title: '选区修改验收作品', difficulty: 'pro', finalVersionId: 'v-original', versions: [{ id: 'v-original', title: 'V1 原图', prompt: '一只小狗坐在暖色客厅，柔和阳光，真实摄影。', imageUrl: imageData(original), ratio: '3:2', model: 'edit-fixture', provider: 'openai' }] } })
  assert.equal(initial.status, 201); projectDocument = initial.data.document; originalVersion = projectDocument.data.versions[0]
  const endpoint = '/api/ai/image/edit'
  const legacy = await request('/api/me/documents', { type: 'project', title: '旧版作品兼容验收', data: { thumbnails: [{ id: 'legacy-original', preview: imageData(original) }], finalVersionId: 'legacy-original' } })
  assert.equal(legacy.status, 201)
  const legacyBody = { documentId: legacy.data.document.id, versionId: 'legacy-original', operation: 'adjust', adjustments: { brightness: 5 } }
  await expectStatus('旧版 thumbnails 和 preview 图片可读取', `${endpoint}/source?documentId=${legacyBody.documentId}&versionId=legacy-original`, undefined, 200)
  const legacyEdit = await expectStatus('旧版作品可生成调整结果', endpoint, legacyBody, 200)
  const legacySaved = await request(`${endpoint}/save`, { pendingId: legacyEdit.data.pendingId, expectedVersion: legacy.data.document.version })
  check('旧版保存兼容版本列表并保留最终版', legacySaved.status === 200 && legacySaved.data.document.data.versions.length === 2 && legacySaved.data.document.data.thumbnails.length === 2 && legacySaved.data.document.data.finalVersionId === 'legacy-original')
  const foreignSource = await request('/api/me/documents', { type: 'project', title: '资产隔离验收', data: { versions: [{ id: 'foreign-asset', imageUrl: legacyEdit.data.version.imageUrl }] } }, cookies.other)
  await expectStatus('本人项目引用他人私有图片仍拒绝编辑', endpoint, { ...legacyBody, documentId: foreignSource.data.document.id, versionId: 'foreign-asset' }, 403, cookies.other)
  await expectStatus('未登录禁止编辑', endpoint, editBody(), 401, '')
  for (const role of ['teacher', 'parent', 'admin']) await expectStatus(`${role}不能代改学生作品`, endpoint, editBody(), 403, cookies[role])
  await expectStatus('另一学生不能读取或修改来源作品', endpoint, editBody(), 404, cookies.other)
  const capabilities = await request(`${endpoint}/capabilities`); check('仅显示声明遮罩能力的模型', capabilities.data.models.length === 1)
  const adminConfig = await request('/api/admin/ai-providers', undefined, cookies.admin)
  check('后台读取遮罩协议和模型配置', adminConfig.data.providers.openai.imageEdit.protocol === 'openai-mask' && adminConfig.data.providers.openai.imageEdit.models.includes('edit-fixture'))
  await request('/api/admin/ai-providers/model-status', { provider: 'openai', model: 'edit-fixture', enabled: false }, cookies.admin)
  check('停用的编辑模型不会出现在选项中', (await request(`${endpoint}/capabilities`)).data.models.length === 0)
  await request('/api/admin/ai-providers/model-status', { provider: 'openai', model: 'edit-fixture', enabled: true }, cookies.admin)
  await expectStatus('未知编辑模型拒绝调用', endpoint, { ...editBody(), model: 'unconfigured' }, 409)
  await expectStatus('空选区拒绝提交', endpoint, { ...editBody(), mask: imageData(await png(Buffer.alloc(raw.length))) }, 400)
  await expectStatus('全选拒绝提交', endpoint, { ...editBody(), mask: imageData(await png(Buffer.alloc(raw.length, 255))) }, 400)
  await expectStatus('遮罩尺寸不一致拒绝提交', endpoint, { ...editBody(), mask: imageData(await png(Buffer.alloc(4, 255), 1, 1)) }, 400)
  await expectStatus('空描述拒绝重绘', endpoint, { ...editBody(), prompt: '' }, 400)
  await expectStatus('基础内容安全校验生效', endpoint, { ...editBody(), prompt: '儿童色情' }, 400)
  await expectStatus('调整参数越界拒绝保存', endpoint, { ...editBody('adjust'), adjustments: { brightness: 101 } }, 400)
  const beforeAdjustCalls = upstreamCalls
  const adjusted = await expectStatus('整体调整生成真实图片', endpoint, { ...editBody('adjust'), adjustments: { brightness: 15, contrast: 10, saturation: 25, warmth: 30 } }, 200)
  check('基础调整不调用 AI', beforeAdjustCalls === upstreamCalls)
  const adjustedAsset = await request(adjusted.data.version.imageUrl)
  const adjustedRaw = await sharp(adjustedAsset.data).ensureAlpha().raw().toBuffer()
  assert.deepEqual(adjustedRaw, applyArtworkAdjustments(Buffer.from(raw), { brightness: 15, contrast: 10, saturation: 25, warmth: 30 })); check('预览与服务端调整算法逐像素一致')
  const savedAdjust = await expectStatus('结果保存到当前项目新版本', `${endpoint}/save`, { pendingId: adjusted.data.pendingId, expectedVersion: projectDocument.version }, 200)
  projectDocument = savedAdjust.data.document
  check('原图和最终版标记保持不变', projectDocument.data.finalVersionId === 'v-original' && projectDocument.data.versions[0].imageUrl === originalVersion.imageUrl)
  const duplicate = await request(`${endpoint}/save`, { pendingId: adjusted.data.pendingId, expectedVersion: 1 }); check('保存重试不新增重复版本', duplicate.status === 200 && duplicate.data.document.data.versions.length === 2)
  let repaint
  for (const operation of ['repaint', 'erase', 'background']) {
    const result = await expectStatus(`${operation}真实接口链路成功（测试模型）`, endpoint, editBody(operation), 200)
    if (operation === 'repaint') repaint = result.data
    check(`${operation}上传原图、遮罩并仅生成一张`, lastMultipart.includes('name="image"') && lastMultipart.includes('name="mask"') && /name="n"\r\n\r\n1/.test(lastMultipart))
    const asset = await request(result.data.version.imageUrl), pixels = await sharp(asset.data).ensureAlpha().raw().toBuffer()
    let changed = 0
    for (let i = 0; i < width * height; i++) { if (!maskRaw[i * 4]) assert.deepEqual(pixels.subarray(i * 4, i * 4 + 4), raw.subarray(i * 4, i * 4 + 4)); else if (pixels[i * 4] !== raw[i * 4]) changed++ }
    check(`${operation}选区外像素完全一致且选区内发生修改`, changed > 100)
  }
  await expectStatus('其他学生不能保存本人的修改结果', `${endpoint}/save`, { pendingId: repaint.pendingId, expectedVersion: projectDocument.version }, 404, cookies.other)
  await expectStatus('旧文档版本保存返回冲突', `${endpoint}/save`, { pendingId: repaint.pendingId, expectedVersion: 1 }, 409)
  const saved = await request(`${endpoint}/save`, { pendingId: repaint.pendingId, expectedVersion: projectDocument.version }); assert.equal(saved.status, 200); projectDocument = saved.data.document
  for (const [failure, status] of [['limit', 429], ['balance', 402], ['safety', 422], ['empty', 502], ['failure', 502], ['timeout', 504]]) {
    upstreamMode = failure; await expectStatus(`上游${failure}错误明确返回且不伪造成功`, endpoint, editBody(), status)
  }
  upstreamMode = 'success'
  await stopServer(); await startServer(1)
  const restored = await request(`/api/me/documents/${projectDocument.id}`)
  check('重启服务后版本仍存在', restored.data.document.data.versions.length === 3)
  const restoredAsset = await request(repaint.version.imageUrl); check('重启服务后图片资产仍可读取', restoredAsset.status === 200 && restoredAsset.data.length > 0)
  await request(endpoint, editBody()); await expectStatus('服务端频率限制生效', endpoint, editBody(), 429)
  await stopServer(); await startServer(100, 10000)
  if (process.env.ARTWORK_BROWSER_TEST === '1') {
    const require = createRequire(import.meta.url)
    const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright-core')
    web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { env: { ...process.env, VITE_AUTH_MODE: 'server', VITE_AI_MODE: 'api', VITE_API_PROXY_TARGET: `http://127.0.0.1:${port}` }, stdio: ['ignore', 'pipe', 'pipe'] })
    web.stdout.on('data', () => {}); web.stderr.on('data', (chunk) => { logs += chunk })
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${webPort}`)).ok) break } catch {} await new Promise((done) => setTimeout(done, 100)) }
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addCookies([{ name: cookies.student.split('=')[0], value: cookies.student.slice(cookies.student.indexOf('=') + 1), url: `http://127.0.0.1:${webPort}` }])
    await context.addInitScript(() => { localStorage.setItem('art-studio-difficulty', 'pro'); localStorage.setItem('art-studio-muted', 'true') })
    const page = await context.newPage(), errors = [], failedRequests = [], httpErrors = []
    page.setDefaultTimeout(60000)
    page.on('pageerror', (error) => errors.push(error.stack || error.message)); page.on('requestfailed', (req) => failedRequests.push(req.url()))
    page.on('response', (response) => {
      if (response.status() < 400) return
      const req = response.request()
      const version = req.method() === 'PATCH' ? req.postDataJSON()?.version : undefined
      httpErrors.push({ status: response.status(), url: req.url(), method: req.method(), version, after: results.at(-1) })
    })
    await page.goto(`http://127.0.0.1:${webPort}/student/paint?projectId=${projectDocument.data.id}&versionId=v-original&edit=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const editor = page.locator('.artwork-editor')
    await editor.waitFor(); await editor.locator('.edit-mask').waitFor(); await page.waitForFunction(() => !document.querySelector('.artwork-editor .el-loading-mask'))
    check('真实页面按项目与版本打开统一修改面板', await editor.locator('h2').textContent().then((text) => text.includes('V1 原图')))
    check('无选区时生成按钮禁用', await editor.getByRole('button', { name: '生成修改', exact: true }).isDisabled())
    const canvas = editor.locator('.edit-mask'), box = await canvas.boundingBox()
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .4); await page.mouse.down(); await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5, { steps: 8 }); await page.mouse.up()
    check('画笔实际绘制紫色遮罩', await canvas.evaluate((node) => node.getContext('2d').getImageData(0, 0, node.width, node.height).data.some((value, index) => index % 4 === 3 && value > 0)))
    await editor.getByRole('button', { name: '撤销选区', exact: true }).click(); check('撤销后选区消失', await editor.getByRole('button', { name: '重做选区', exact: true }).isEnabled())
    await editor.getByRole('button', { name: '重做选区', exact: true }).click()
    await editor.locator('textarea').fill('给选区添加一顶红色帽子')
    await editor.getByRole('button', { name: '放大画面', exact: true }).click()
    await editor.getByRole('button', { name: '拖动画面', exact: true }).click()
    const panBox = await canvas.boundingBox(); await page.mouse.move(panBox.x + panBox.width / 2, panBox.y + panBox.height / 2); await page.mouse.down(); await page.mouse.move(panBox.x + panBox.width / 2 + 25, panBox.y + panBox.height / 2 + 15); await page.mouse.up()
    check('放大和平移生效', await editor.locator('.edit-image-plane').getAttribute('style').then((text) => text.includes('25px') && text.includes('1.25')))
    await editor.getByRole('button', { name: '适应画面', exact: true }).click()
    await editor.getByRole('button', { name: '查看原图', exact: true }).click(); await editor.getByRole('button', { name: '返回修改视图', exact: true }).click()
    await editor.getByRole('button', { name: '生成修改', exact: true }).click()
    await editor.locator('.edit-pending').waitFor(); check('真实页面生成待保存结果（测试模型）')
    await editor.getByRole('button', { name: '保存为新版本', exact: true }).click()
    await editor.locator('.edit-pending').waitFor({ state: 'hidden' }); await page.waitForFunction(() => !document.querySelector('.artwork-editor .el-loading-mask'))
    check('真实页面保存并重新读取新版本', await editor.locator('.edit-history button').count() === 4)
    const formalAfterDraft = await request(`/api/me/documents/${projectDocument.id}`)
    check('自动保存草稿不覆盖正式项目内容', formalAfterDraft.data.document.type === 'project' && formalAfterDraft.data.document.data.versions.length === 4)
    const drafts = await request('/api/me/documents?type=draft')
    check('草稿独立保存且没有重复创建', drafts.data.documents.length === 1 && drafts.data.documents[0].id !== projectDocument.id)
    await editor.getByRole('button', { name: '整体调整', exact: true }).click()
    await editor.getByRole('button', { name: '更明亮', exact: true }).click()
    check('基础调整预览实时更新', await editor.locator('.edit-image-plane img').getAttribute('src').then((source) => source.startsWith('data:image/png')))
    await editor.getByRole('button', { name: '恢复默认', exact: true }).click(); check('恢复默认后调整按钮禁用', await editor.getByRole('button', { name: '生成调整预览', exact: true }).isDisabled())
    await editor.getByRole('button', { name: '更换背景', exact: true }).click()
    await editor.getByRole('button', { name: '画笔', exact: true }).first().click()
    const backgroundBox = await canvas.boundingBox(); await page.mouse.click(backgroundBox.x + backgroundBox.width / 2, backgroundBox.y + backgroundBox.height / 2)
    await editor.getByRole('button', { name: '选择其余背景', exact: true }).click(); await editor.locator('textarea').fill('阳光下的草地')
    check('手动选主体后可反选背景', await editor.getByRole('button', { name: '生成新背景', exact: true }).isEnabled())
    upstreamMode = 'failure'
    await editor.getByRole('button', { name: '生成新背景', exact: true }).click()
    await editor.locator('.edit-error').waitFor()
    check('生成失败保留描述和选区并恢复按钮', await editor.locator('textarea').inputValue() === '阳光下的草地' && await editor.getByRole('button', { name: '生成新背景', exact: true }).isEnabled())
    upstreamMode = 'success'
    await page.screenshot({ path: join(evidenceDir, 'desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 920, height: 621 }); await page.screenshot({ path: join(evidenceDir, 'tablet.png'), fullPage: true })
    check('平板横屏无横向溢出', await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 2))
    await page.setViewportSize({ width: 390, height: 844 }); check('竖屏限制保留', await page.locator('.landscape-notice').isVisible()); await page.screenshot({ path: join(evidenceDir, 'portrait.png'), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await editor.getByRole('button', { name: '清空', exact: true }).click(); await editor.locator('textarea').fill('')
    await page.locator('.artwork-editor-dialog .el-dialog__headerbtn').click()
    await page.goto(`http://127.0.0.1:${webPort}/student/portfolio`, { waitUntil: 'domcontentloaded' })
    await page.locator('.portfolio-card').filter({ hasText: 'V1 原图' }).click()
    await page.getByRole('button', { name: '作品修改', exact: true }).click()
    await editor.locator('.edit-mask').waitFor()
    check('作品集入口打开所选原图版本', await editor.locator('h2').textContent().then((text) => text.includes('V1 原图')))
    await page.waitForFunction(() => !document.querySelector('.artwork-editor .el-loading-mask'))
    await editor.getByRole('button', { name: '整体调整', exact: true }).click()
    await editor.getByRole('button', { name: '更温暖', exact: true }).click()
    await editor.getByRole('button', { name: '生成调整预览', exact: true }).click()
    await editor.locator('.edit-pending').waitFor()
    // 模拟另一窗口更新正式文档，验证浏览器无需再次出图即可解决保存冲突。
    const latestDocument = (await request(`/api/me/documents/${projectDocument.id}`)).data.document
    await fetch(`http://127.0.0.1:${port}/api/me/documents/${latestDocument.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookies.student }, body: JSON.stringify({ version: latestDocument.version, title: latestDocument.title }) })
    await editor.getByRole('button', { name: '保存为新版本', exact: true }).click()
    await editor.getByRole('button', { name: '重新加载版本后保存', exact: true }).waitFor()
    const callsBeforeResave = upstreamCalls
    await editor.getByRole('button', { name: '重新加载版本后保存', exact: true }).click()
    await editor.getByRole('button', { name: '保存为新版本', exact: true }).click()
    await editor.locator('.edit-pending').waitFor({ state: 'hidden' })
    check('保存冲突重新加载后成功保存且不再调用模型', upstreamCalls === callsBeforeResave)
    await page.waitForFunction(() => !document.querySelector('.artwork-editor .el-loading-mask'))
    await page.locator('.artwork-editor-dialog .el-dialog__headerbtn').click()
    await page.goto(`http://127.0.0.1:${webPort}/student/workbench?tab=portfolio`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: '选择我的素材库', exact: true }).click()
    await page.getByRole('button', { name: '打开我的素材库', exact: true }).click()
    await page.locator('.portfolio-card').filter({ hasText: 'V1 原图' }).click()
    await page.getByRole('button', { name: '作品修改', exact: true }).click()
    await editor.locator('.edit-mask').waitFor()
    check('工作台入口进入同一修改面板并保留最终原图', await editor.locator('h2').textContent().then((text) => text.includes('V1 原图')))
    await page.waitForFunction(() => !document.querySelector('.artwork-editor .el-loading-mask'))
    await page.locator('.artwork-editor-dialog .el-dialog__headerbtn').click()
    const paintUrl = page.url(), countBeforeClick = await page.locator('.generation-image-card').count(), editCallsBeforeClick = upstreamCalls
    await page.getByRole('button', { name: '重新编辑', exact: true }).first().click()
    check('重新编辑保留显示且不路由或打开弹窗', page.url() === paintUrl && await editor.count() === 0 && await page.locator('.single-image-editor').count() === 0)
    const imageCard = page.locator('.generation-image-card').first()
    await imageCard.click()
    const singleEditor = page.locator('.single-image-editor'), singleDialog = page.getByRole('dialog', { name: '单张图片编辑', exact: true }).locator('.el-dialog')
    await singleEditor.waitFor()
    check('点击生成图片展示图像提示词且不进入作品修改', page.url() === paintUrl && await singleEditor.locator('h3').textContent() === '图像提示词' && await editor.count() === 0 && upstreamCalls === editCallsBeforeClick)
    check('默认显示该图原提示词且没有修改输入框', await singleEditor.locator('.single-original-prompt').textContent() === originalVersion.prompt && await singleEditor.locator('textarea').count() === 0)
    check('只保留三个紧凑操作按钮并移除返回画布及说明', await singleEditor.locator('.single-edit-actions button').count() === 3 && await singleEditor.getByRole('button', { name: '返回画布', exact: true }).count() === 0 && !(await singleEditor.innerText()).includes('原图会保留'))
    check('弹窗圆角和标题分隔线生效', await singleDialog.evaluate((node) => getComputedStyle(node).borderRadius === '20px' && getComputedStyle(node.querySelector('.el-dialog__header')).borderBottomWidth === '1px'))
    check('提示词区大于操作区且三个按钮同排', await singleEditor.evaluate((node) => { const prompt = node.querySelector('.single-original-prompt').getBoundingClientRect(), buttons = [...node.querySelectorAll('.single-edit-actions button')].map((button) => button.getBoundingClientRect()); return prompt.height > buttons[0].height * 5 && buttons.every((button) => Math.abs(button.top - buttons[0].top) < 2 && button.height <= 50) }))
    await singleEditor.getByRole('button', { name: '全屏查看', exact: true }).click()
    const fullscreen = page.getByRole('dialog', { name: '图像全屏', exact: true })
    await fullscreen.waitFor()
    check('图片全屏覆盖窗口且保持图片比例', await fullscreen.evaluate((node) => { const rect = node.querySelector('.el-dialog').getBoundingClientRect(); return rect.width >= innerWidth - 2 && rect.height >= innerHeight - 2 && getComputedStyle(node.querySelector('img')).objectFit === 'contain' }))
    await fullscreen.getByRole('button', { name: '退出全屏', exact: true }).click()
    await fullscreen.waitFor({ state: 'hidden' })
    check('退出全屏回到原提示词并保留单张弹窗', await singleEditor.locator('.single-original-prompt').isVisible())
    await singleEditor.getByRole('button', { name: '全屏查看', exact: true }).click()
    await fullscreen.waitFor(); await page.keyboard.press('Escape'); await fullscreen.waitFor({ state: 'hidden' })
    check('Esc只退出图片全屏不关闭单张弹窗', await singleEditor.isVisible())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.screenshot({ path: join(evidenceDir, 'single-image-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 920, height: 621 })
    check('原单张编辑弹窗横屏无横向溢出', await singleDialog.evaluate((node) => node.getBoundingClientRect().left >= 0 && node.getBoundingClientRect().right <= innerWidth + 1 && node.scrollWidth <= node.clientWidth + 2))
    check('平板横屏按钮可见且提示词不撑破布局', await singleEditor.evaluate((node) => { const buttons = [...node.querySelectorAll('.single-edit-actions button')]; return buttons.every((button) => { const rect = button.getBoundingClientRect(); return rect.bottom <= innerHeight && rect.width >= button.scrollWidth - 2; }) && node.scrollWidth <= node.clientWidth + 2 }))
    await page.screenshot({ path: join(evidenceDir, 'single-image-tablet.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    check('单张预览竖屏无横向溢出并保留横屏提示', await singleDialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 2) && await page.locator('.landscape-notice').isVisible())
    await page.screenshot({ path: join(evidenceDir, 'single-image-portrait.png'), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    let singleRequest, singleResponseFails = true, singleCalls = 0, holdSingleResponse = false, releaseSingleResponse
    await page.route('**/api/ai/image/generate', async (route) => {
      singleCalls++
      singleRequest = route.request().postDataJSON()
      if (holdSingleResponse) await new Promise((done) => { releaseSingleResponse = done })
      await route.fulfill({ status: singleResponseFails ? 503 : 200, contentType: 'application/json', body: JSON.stringify(singleResponseFails ? { message: '单张编辑测试失败' } : { provider: 'openai', images: [{ imageUrl: imageData(original), model: 'edit-fixture' }] }) })
    })
    await singleEditor.getByRole('button', { name: '生成新版本', exact: true }).focus(); await page.keyboard.press('Enter')
    check('点击生成新版本只切换输入框且不发起模型请求', await singleEditor.locator('textarea').isVisible() && singleCalls === 0 && await singleEditor.getByRole('button', { name: '确认生成', exact: true }).isDisabled())
    check('修改输入框自动获焦且限制2000字', await singleEditor.locator('textarea').evaluate((node) => node === document.activeElement && node.maxLength === 2000))
    await singleEditor.locator('textarea').fill('把小帽子改成蓝色')
    await singleEditor.getByRole('button', { name: '查看原提示词', exact: true }).click()
    check('切回原提示词不改写原内容', await singleEditor.locator('.single-original-prompt').textContent() === originalVersion.prompt)
    await singleEditor.getByRole('button', { name: '生成新版本', exact: true }).click()
    check('重新进入修改模式保留本次输入', await singleEditor.locator('textarea').inputValue() === '把小帽子改成蓝色')
    await singleEditor.getByRole('button', { name: '确认生成', exact: true }).click()
    await page.getByText('单张编辑测试失败', { exact: true }).waitFor()
    check('原弹窗修改失败保留说明和原版本', await singleEditor.locator('textarea').inputValue() === '把小帽子改成蓝色' && await page.locator('.generation-image-card').count() === countBeforeClick)
    check('单张修改复用原生图接口且带入点击图片', singleRequest.count === 1 && singleRequest.images.length === 1 && singleRequest.prompt.includes('把小帽子改成蓝色') && !singleRequest.referenceImage)
    singleResponseFails = false
    await singleEditor.getByRole('button', { name: '确认生成', exact: true }).click()
    await singleEditor.waitFor({ state: 'hidden' })
    check('原弹窗生成后保留原图并增加版本', await page.locator('.generation-image-card').count() === countBeforeClick + 1)
    await imageCard.click()
    await singleEditor.waitFor()
    holdSingleResponse = true
    await singleEditor.getByRole('button', { name: '再次生成', exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('.single-edit-actions button')].every((button) => button.disabled))
    check('再次生成处理时禁止重复操作', await singleEditor.locator('.single-edit-actions button:disabled').count() === 3)
    for (let i = 0; !releaseSingleResponse && i < 150; i++) await new Promise((done) => setTimeout(done, 20))
    assert.ok(releaseSingleResponse, '等待再次生成请求到达隔离响应处理器')
    check('再次生成使用原图提示词而非修改说明并只请求一张', singleRequest.prompt === originalVersion.prompt && singleRequest.count === 1 && singleRequest.images.length === 0 && !singleRequest.referenceImage)
    releaseSingleResponse()
    await singleEditor.waitFor({ state: 'hidden' })
    check('再次生成增加新版本且原图及最终版保持', await page.locator('.generation-image-card').count() === countBeforeClick + 2 && (await request(`/api/me/documents/${projectDocument.id}`)).data.document.data.finalVersionId === 'v-original')
    await imageCard.click(); await singleEditor.waitFor()
    await singleEditor.getByRole('button', { name: '作品修改', exact: true }).click()
    await editor.locator('.edit-mask').waitFor()
    await singleEditor.waitFor({ state: 'detached' })
    check('单张弹窗作品修改按钮打开所选原图的现有面板', await singleEditor.count() === 0 && await editor.locator('h2').textContent().then((text) => text.includes('V1 原图')))
    await page.waitForFunction(() => !document.querySelector('.artwork-editor .el-loading-mask'))
    await page.locator('.artwork-editor-dialog .el-dialog__headerbtn').click()
    await imageCard.click(); await singleEditor.waitFor()
    await page.locator('.single-image-dialog .el-dialog__headerbtn').click(); await singleEditor.waitFor({ state: 'hidden' })
    check('右上角关闭返回画布且不改变路由', page.url() === paintUrl && await page.locator('.generation-image-card').count() === countBeforeClick + 2)
    await page.unroute('**/api/ai/image/generate')
    await page.locator('.batch-more-trigger').first().click()
    await page.getByRole('menuitem', { name: '修图', exact: true }).click()
    await editor.locator('.edit-mask').waitFor()
    check('更多菜单修图继续打开作品修改面板', await singleEditor.count() === 0 && await editor.isVisible())
    await page.waitForFunction(() => !document.querySelector('.artwork-editor .el-loading-mask'))
    await page.locator('.artwork-editor-dialog .el-dialog__headerbtn').click()
    const savedSingleImages = (await request(`/api/me/documents/${projectDocument.id}`)).data.document
    check('连续生成的两个新版本均保存到服务端', savedSingleImages.data.versions.length === countBeforeClick + 2)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.generation-image-card').nth(countBeforeClick + 1).waitFor()
    check('刷新后两个新版本和原图均恢复', await page.locator('.generation-image-card').count() === countBeforeClick + 2)
    const missingPromptId = `missing_prompt_${suffix}`
    const missingPromptDoc = await request('/api/me/documents', { type: 'project', resourceKey: missingPromptId, title: '旧图空提示词验收', data: { id: missingPromptId, title: '旧图空提示词验收', versions: [{ ...originalVersion, prompt: '', batchPrompt: '' }], finalVersionId: originalVersion.id } })
    assert.equal(missingPromptDoc.status, 201)
    await page.goto(`http://127.0.0.1:${webPort}/student/paint?projectId=${missingPromptId}`, { waitUntil: 'domcontentloaded' }); await imageCard.click(); await singleEditor.waitFor()
    check('旧图缺少提示词时显示真实空状态并禁用再次生成', (await singleEditor.locator('.single-original-prompt').textContent()).includes('暂未记录') && await singleEditor.getByRole('button', { name: '再次生成', exact: true }).isDisabled())
    await singleEditor.getByRole('button', { name: '生成新版本', exact: true }).click()
    check('旧图仍可输入修改要求生成新版本', await singleEditor.locator('textarea').isVisible())
    await writeFile(join(evidenceDir, 'browser-diagnostics.json'), JSON.stringify({ errors, failedRequests, httpErrors }, null, 2))
    if (errors.length || failedRequests.length) console.log('浏览器检测明细：', JSON.stringify({ errors, failedRequests, httpErrors }))
    check('浏览器无运行错误', errors.length === 0); check('浏览器无失败网络请求', failedRequests.length === 0)
    await browser.close(); browser = null
  }
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify({ date: new Date().toISOString(), checks: results, model: '隔离测试模型；真实 AI 效果未验证' }, null, 2))
  console.log(`验收通过 ${results.length} 项；证据：${evidenceDir}`)
} finally {
  if (browser) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      console.log('浏览器失败现场：', await page.title().catch(() => '不可读取'))
      await page.screenshot({ path: join(evidenceDir, 'failure.png'), fullPage: true, timeout: 10000 }).catch(() => {})
      await writeFile(join(evidenceDir, 'failure.txt'), await page.locator('body').innerText().catch(() => '页面未加载'))
    }
    await browser.close()
  }
  if (web) { const done = once(web, 'exit'); web.kill(); await done }
  if (server && server.exitCode === null) await stopServer()
  await new Promise((done) => upstream.close(done))
  await writeFile(join(evidenceDir, 'server.log'), logs)
  await closeDb()
}
