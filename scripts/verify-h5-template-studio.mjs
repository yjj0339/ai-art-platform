// 独立数据库、真实后端和浏览器验收；本机测试模型不代表真实AI效果。
// TEST_DATABASE_URL 必须包含 test；H5_TEST_CREATE_DATABASE=1 可在本机创建并清理专用测试库。
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import pg from 'pg'
import sharp from 'sharp'
import { createH5HandbookDesign, compileH5Layout, validateH5Design, applyH5LayoutProposal, cloneLayout } from '../src/utils/h5Layout.js'

const suffix = randomBytes(5).toString('hex'), evidence = resolve('.workbuddy/evidence/h5-template-studio', suffix), dataDir = join(evidence, 'data')
await mkdir(dataDir, { recursive: true })
const results = [], diagnostics = [], credentials = {}, users = {}, cookies = {}
const check = (label, result = true) => { assert.ok(result, label); results.push(label); console.log(`通过：${label}`) }
const root = process.cwd(), password = randomBytes(16).toString('hex'), org = `h5_test_${suffix}`, foreignOrg = `${org}_other`
const localEnv = Object.fromEntries((await readFile('server/.env', 'utf8')).split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]))
let connectionString = process.env.TEST_DATABASE_URL, createdDatabase, master, db, server, web, browser, serverPort, webPort, serverLogs = '', mode = 'success', calls = 0, lastPrompt = '', pendingTimer, activePage
const design = createH5HandbookDesign()
check('首套八章模板通过发布布局校验', validateH5Design(design).length === 0)
const longCopy = ('观察自然，然后画下想法。\n').repeat(150)
const longLayout = compileH5Layout(design, [{ type: 'idea', body: longCopy }], { title: '创意设计', cover: '/assets/h5-report/product-design-story.png' })
check('包含换行的长正文自动续页且全文保留', longLayout.pages.filter(p => p.chapter === 'inspiration').flatMap(p => p.elements.filter(e => e.binding === 'page.body').map(e => e.text)).join('') === longCopy)
check('缺少草图和3D时跳过对应章节', !longLayout.pages.some(p => ['sketch', 'model'].includes(p.chapter)))
const manyImages = Array.from({ length: 7 }, (_, i) => ({ id: `v${i}`, imageUrl: `/assets/fixture-${i}.png` }))
const manyLayout = compileH5Layout(design, [{ type: 'ai', title: '方案比较', body: '我保存的方案。' }], { title: '我的设计', finalVersionId: 'v0', versions: manyImages })
check('多图自动续页且不会丢失后续版本', new Set(manyLayout.pages.filter(p => p.chapter === 'ai').flatMap(p => p.elements.filter(e => e.type === 'image').map(e => e.src))).size === 7)
const locked = compileH5Layout(design, [{ type: 'cover', title: '创意空间', body: '这是我的设计。' }], { title: '创意空间', cover: '/assets/h5-report/product-design-story.png' }); locked.pages = [locked.pages[0]]; locked.pages[0].elements[0].locked = true
const moved = applyH5LayoutProposal(locked, { pages: [{ id: locked.pages[0].id, elements: [{ id: locked.pages[0].elements[0].id, x: 500 }] }] })
check('AI无法移动已锁定元素', moved.pages[0].elements[0].x === locked.pages[0].elements[0].x)
assert.throws(() => applyH5LayoutProposal(locked, { pages: [{ id: 'foreign-page', elements: [] }] })); check('拒绝AI引用不存在的页面')
const image = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#76a9ef' } }).png().toBuffer()
const imageData = `data:image/png;base64,${image.toString('base64')}`
const upstream = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString()); calls++
  lastPrompt = body.messages?.map(m => m.content).join('\n') || ''
  res.setHeader('Content-Type', 'application/json')
  if (mode === 'failure') { res.writeHead(503); return res.end(JSON.stringify({ error: { message: '隔离测试：供应商不可用' } })) }
  if (mode === 'slow' || mode === 'timeout') { await new Promise(done => { pendingTimer = setTimeout(done, mode === 'timeout' ? 1600 : 500) }) }
  if (mode === 'empty') return res.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))
  let output
  if (lastPrompt.includes('页面：')) {
    const pages = JSON.parse(lastPrompt.slice(lastPrompt.lastIndexOf('页面：') + 3))
    output = { pages: pages.map(page => ({ id: page.id, elements: page.elements.map(e => ({ id: e.id, x: e.role === 'title' && !e.locked ? e.x + 4 : e.x, y: e.y, w: e.w, h: e.h, fontSize: e.fontSize, rotation: e.rotation })) })) }
  } else output = { reportTitle: '隔离验收创作报告', pages: [{ type: 'cover', title: '创意生态空间', body: '这是我完成的设计。' }, { type: 'inspiration', title: '我的灵感', body: '我观察自然并记录想法。' }, { type: 'sketch', title: '我的草图', body: '我用草图表达想法。' }, { type: 'ai', title: '方案比较', body: '我比较了两个生成版本。' }, { type: 'reflection', title: '我的收获', body: '我学会了观察和修改。' }] }
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }))
})
await new Promise(done => upstream.listen(0, '127.0.0.1', done))
const baseUrl = `http://127.0.0.1:${upstream.address().port}/v1`
await writeFile(join(dataDir, 'ai-providers.json'), JSON.stringify({ defaultProvider: 'openai', defaultTextProvider: 'openai', hiddenProviders: ['agnes', 'deepseek', 'volcengine', 'hunyuan3d'], providers: { openai: { label: '隔离排版测试模型', baseUrl, apiKey: 'isolated-test-key', textModel: 'layout-fixture', textModels: ['layout-fixture'], models: ['layout-fixture'] } } }))
const protectedFiles = ['server/data/h5-report-config.json', 'server/data/h5-report-draft-config.json', 'server/data/h5-reports.json', 'server/data/ai-providers.json']
const digest = async file => { try { return createHash('sha256').update(await readFile(file)).digest('hex') } catch { return 'missing' } }
const before = await Promise.all(protectedFiles.map(digest))
async function freePort() { const s = http.createServer(); await new Promise(done => s.listen(0, '127.0.0.1', done)); const port = s.address().port; await new Promise(done => s.close(done)); return port }
async function boot() {
  serverPort ||= await freePort(); webPort ||= await freePort()
  server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, DATABASE_URL: connectionString, AUTH_MODE: 'server', PORT: String(serverPort), APP_ORIGIN: `http://127.0.0.1:${webPort}`, AI_DATA_DIR: dataDir, H5_LAYOUT_TIMEOUT_MS: '1000', GALLERY_WORKER_ENABLED: 'false', OPENAI_API_KEY: 'isolated-test-key', OPENAI_BASE_URL: baseUrl, OPENAI_TEXT_MODEL: 'layout-fixture' }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', b => { serverLogs += b }); server.stderr.on('data', b => { serverLogs += b })
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${serverPort}/api/health`)).ok) return } catch {} if (server.exitCode !== null) throw new Error('隔离后端启动失败'); await new Promise(done => setTimeout(done, 100)) }
  throw new Error('隔离后端启动超时')
}
async function stopServer() { if (server && server.exitCode === null) { const exit = once(server, 'exit'); server.kill(); await exit } }
async function request(route, body, role = 'admin', method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`http://127.0.0.1:${serverPort}${route}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookies[role] || '' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const data = response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer())
  return { status: response.status, data, response }
}
async function expect(label, route, body, status, role, method) { const r = await request(route, body, role, method); assert.equal(r.status, status, `${label}：${JSON.stringify(r.data)}`); check(label); return r }
try {
  if (!connectionString && process.env.H5_TEST_CREATE_DATABASE === '1') {
    const source = new URL(localEnv.DATABASE_URL || '')
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname), '仅允许在本机自动创建测试库')
    master = new pg.Client({ connectionString: source.href }); await master.connect()
    createdDatabase = `h5_studio_test_${suffix}`
    await master.query(`CREATE DATABASE "${createdDatabase}"`)
    source.pathname = `/${createdDatabase}`; connectionString = source.href
  }
  assert.ok(connectionString && /test/i.test(new URL(connectionString).pathname), '必须使用独立测试数据库')
  db = new pg.Client({ connectionString }); await db.connect()
  await db.query(await readFile('server/schema.sql', 'utf8')); await db.query(await readFile('server/gallery-schema.sql', 'utf8'))
  process.env.DATABASE_URL = connectionString
  const { hashPassword } = await import('../server/auth.js'); const hash = await hashPassword(password)
  await db.query('INSERT INTO organizations (id,code,name) VALUES ($1,$1,$1),($2,$2,$2)', [org, foreignOrg])
  for (const role of ['admin', 'student', 'other', 'teacher', 'parent', 'foreignAdmin', 'foreignStudent']) {
    users[role] = `${role}_${suffix}`; const actualRole = role.includes('Admin') ? 'admin' : role === 'other' || role.includes('Student') ? 'student' : role
    const organization = role.startsWith('foreign') ? foreignOrg : org
    await db.query('INSERT INTO users (id,organization_id,account,password_hash,display_name,role,permissions) VALUES ($1,$2,$1,$3,$1,$4,$5)', [users[role], organization, hash, actualRole, JSON.stringify({ adminAccess: true, studentAccess: true, aiCreate: true, reports: true })])
    if (actualRole === 'admin') await db.query('INSERT INTO admin_scopes (id,admin_user_id,organization_id,scope_type) VALUES ($1,$2,$3,$4)', [`scope_${users[role]}`, users[role], organization, 'organization'])
    credentials[role] = { account: users[role], password, organizationCode: organization }
  }
  await boot()
  for (const role of Object.keys(users)) { const r = await request('/api/auth/login', credentials[role], ''); assert.equal(r.status, 200); cookies[role] = r.response.headers.get('set-cookie').split(';')[0] }
  await expect('未登录不能读取模板草稿', '/api/admin/h5-report-config', undefined, 401, '')
  for (const role of ['student', 'parent', 'teacher']) await expect(`${role}不能管理模板`, '/api/admin/h5-report-config', undefined, 403, role)
  const initial = (await request('/api/admin/h5-report-config')).data
  check('未落地配置的修订号稳定', initial.revision === (await request('/api/admin/h5-report-config')).data.revision)
  let template = { ...initial.draft.templates[0], id: `h5_test_${suffix}`, name: '蓝白创意手账验收', builtIn: false, strategyId: 'h5-standard', layout: 'product-design-story', designDocument: design, officialUrl: 'https://example.com', status: 'draft' }
  const uploaded = await expect('真实PNG上传并持久化', '/api/admin/h5-visual-template-assets', { templateId: template.id, pageId: 'cover', imageData }, 201)
  await expect('拒绝伪装PNG的非图片文件', '/api/admin/h5-visual-template-assets', { templateId: template.id, pageId: 'cover', imageData: 'data:image/png;base64,aGVsbG8=' }, 400)
  template.designDocument.pages[0].backgroundImage = uploaded.data.assetUrl
  let state = (await expect('保存当前模板草稿', '/api/admin/h5-report-config/template', { template, revision: initial.revision }, 200)).data
  check('草稿与发布分离', !state.published.templates.some(t => t.id === template.id))
  await expect('拒绝过期配置覆盖', '/api/admin/h5-report-config/template', { template, revision: initial.revision }, 409)
  state = (await expect('发布当前模板', '/api/admin/h5-report-config/template', { template, revision: state.revision, action: 'publish' }, 200)).data
  template = state.template
  const secondDraft = { ...cloneLayout(template), id: `h5_draft_${suffix}`, name: '不应被同时发布的草稿', status: 'draft' }
  await expect('其他机构无法读取新模板素材', uploaded.data.assetUrl, undefined, 404, 'foreignAdmin')
  check('其他机构模板列表不含本机构模板', !(await request('/api/admin/h5-report-config', undefined, 'foreignAdmin')).data.draft.templates.some(t => t.id === template.id))
  const foreignState = (await request('/api/admin/h5-report-config', undefined, 'foreignAdmin')).data
  await expect('其他机构保存整份草稿不删除本机构模板', '/api/admin/h5-report-config/draft', foreignState.draft, 200, 'foreignAdmin')
  check('整份草稿保存后本机构模板仍保留', (await request('/api/admin/h5-report-config')).data.draft.templates.some(t => t.id === template.id))
  const config = state.published; config.editions.pro.allowedTemplateIds.push(template.id); config.editions.pro.defaultTemplateId = template.id
  config.strategies.find(s => s.id === 'h5-canvas-workflow').studentSelectable = false
  await expect('沿用原版本授权接口开放新模板', '/api/admin/h5-report-config', config, 200)
  await expect('原配置接口也拒绝带旧修订号覆盖', '/api/admin/h5-report-config/draft', { ...config, configRevision: initial.revision }, 409)
  state = (await request('/api/admin/h5-report-config')).data
  await expect('另一个模板单独保存草稿', '/api/admin/h5-report-config/template', { template: secondDraft, revision: state.revision }, 200)
  check('高级版学生可选择新模板', (await request('/api/h5-report/runtime-config?difficulty=pro', undefined, 'student')).data.templates.some(t => t.id === template.id))
  check('入门版没有越权获得高级模板', !(await request('/api/h5-report/runtime-config?difficulty=starter', undefined, 'student')).data.templates.some(t => t.id === template.id))
  const asset = (await expect('保存学生真实私有作品资产', '/api/me/assets', { originalName: '学生测试作品.png', mimeType: 'image/png', kind: 'image', base64: image.toString('base64') }, 201, 'student')).data.asset
  const assetUrl = `/api/assets/${asset.id}`
  let project = { id: `project_${suffix}`, title: '创意生态空间', difficulty: 'pro', idea: '观察自然，构思生态空间。', prompt: '用蓝色表达空间结构', finalVersionId: 'v1', h5TemplateId: template.id, sketchOriginal: assetUrl, versions: [{ id: 'v1', imageUrl: assetUrl }, { id: 'v2', imageUrl: uploaded.data.assetUrl }] }
  const document = (await expect('保存学生创作项目', '/api/me/documents', { type: 'project', resourceKey: project.id, title: project.title, data: project }, 201, 'student')).data.document
  const samples = (await expect('管理员读取授权样例列表', '/api/admin/h5-report-layout/samples', undefined, 200)).data.samples
  const sample = samples.find(item => item.id.endsWith(`:${document.id}`)); check('真实项目可作为后台绑定样例', Boolean(sample))
  check('后台样例读取保留实际作品', (await request(`/api/admin/h5-report-layout/samples?id=${encodeURIComponent(sample.id)}`)).data.project.versions.length === 2)
  await expect('其他机构不能读取样例项目', `/api/admin/h5-report-layout/samples?id=${encodeURIComponent(sample.id)}`, undefined, 404, 'foreignAdmin')
  const pages = [{ type: 'cover', title: '创意生态空间', body: '这是我完成的设计。' }, { type: 'inspiration', title: '我的灵感', body: '我观察自然并记录想法。' }, { type: 'sketch', title: '我的草图', body: '我用草图表达想法。' }, { type: 'ai', title: '方案比较', body: '我比较了两个生成版本。' }, { type: 'reflection', title: '我的收获', body: '我学会了观察和修改。' }]
  const layoutBody = { projectId: project.id, projectDocumentId: document.id, templateId: template.id, pages }
  const onlyFinal = { id: `only_final_${suffix}`, title: '只保存成品图的项目', difficulty: 'pro', finalArtworkUrl: assetUrl }
  const onlyFinalDocument = (await request('/api/me/documents', { type: 'project', resourceKey: onlyFinal.id, data: onlyFinal }, 'student')).data.document
  const onlyFinalResult = (await expect('只有成品图也可生成基础布局', '/api/h5-report/layout', { ...layoutBody, projectId: onlyFinal.id, projectDocumentId: onlyFinalDocument.id, useBasic: true }, 200, 'student')).data
  check('只有成品图不会生成虚构草图或3D章节', !onlyFinalResult.layout.pages.some(p => ['sketch', 'model'].includes(p.chapter)))
  const emptyProject = (await request('/api/me/documents', { type: 'project', resourceKey: `empty_${suffix}`, data: { id: `empty_${suffix}`, difficulty: 'pro', title: '空项目' } }, 'student')).data.document
  await expect('空项目明确提示先保存创作记录', '/api/h5-report/layout', { ...layoutBody, projectId: `empty_${suffix}`, projectDocumentId: emptyProject.id }, 400, 'student')
  await expect('超长文案明确拒绝而非静默截断', '/api/h5-report/layout', { ...layoutBody, pages: [{ type: 'cover', body: '字'.repeat(6001) }] }, 413, 'student')
  for (const role of ['admin', 'teacher', 'parent']) await expect(`${role}不能代学生生成报告`, '/api/h5-report/layout', layoutBody, 403, role)
  await expect('另一学生不能读取项目生成报告', '/api/h5-report/layout', layoutBody, 404, 'other')
  await expect('其他机构不能引用项目', '/api/h5-report/layout', layoutBody, 404, 'foreignStudent')
  await expect('指定错误文档时不回退读取同名项目', '/api/h5-report/layout', { ...layoutBody, projectDocumentId: 'missing-document' }, 404, 'student')
  const beforeCalls = calls
  const generated = (await expect('学生调用真实排版链路（本机测试模型）', '/api/h5-report/layout', layoutBody, 200, 'student')).data
  check('每次排版仅调用一次上游', calls === beforeCalls + 1)
  check('没有向排版模型发送私有图片地址', !lastPrompt.includes(assetUrl) && !lastPrompt.includes('data:image'))
  const repeat = (await request('/api/h5-report/layout', layoutBody, 'student')).data
  check('同内容重复生成复用结果且不重复付费', repeat.generationToken === generated.generationToken && calls === beforeCalls + 1)
  await expect('学生不能伪造布局快照保存', '/api/h5-reports', { report: { layoutSnapshot: generated.layout, pages } }, 409, 'student')
  await expect('另一学生不能保存他人的生成结果', '/api/h5-reports', { report: { generationToken: generated.generationToken } }, 409, 'other')
  const saveBody = { submit: true, report: { title: '隔离验收创作报告', studentName: '测试学生', generationToken: generated.generationToken, layoutSnapshot: { malicious: true }, pages: [] } }
  const report = (await expect('服务器使用可信布局保存并提交审核', '/api/h5-reports', saveBody, 200, 'student')).data.report
  check('图片报告进入人工审核且布局完整', report.status === 'pending' && report.layoutSnapshot.pages.length === generated.layout.pages.length)
  const again = (await request('/api/h5-reports', saveBody, 'student')).data.report
  check('重试保存不会创建重复报告', again.id === report.id && (await request('/api/h5-reports', undefined, 'student')).data.reports.length === 1)
  await stopServer(); await boot()
  await expect('服务重启后生成结果仍可重试保存', '/api/h5-reports', saveBody, 200, 'student')
  check('服务重启后模板布局保留', (await request('/api/admin/h5-report-config')).data.published.templates.find(t => t.id === template.id).designDocument.pages.length === 8)
  check('服务重启后报告仍保存', (await request('/api/h5-reports', undefined, 'student')).data.reports[0].layoutSnapshot.pages.length > 0)
  const originalSnapshot = JSON.stringify(report.layoutSnapshot)
  const updatedState = (await request('/api/admin/h5-report-config')).data
  const changedTemplate = cloneLayout(template); changedTemplate.designDocument.pages[0].background = '#e1f3ff'
  await expect('模板新版本单独发布', '/api/admin/h5-report-config/template', { template: changedTemplate, revision: updatedState.revision, action: 'publish' }, 200)
  const afterPublish = (await request('/api/admin/h5-report-config')).data
  check('发布当前模板不连带发布其他草稿', afterPublish.draft.templates.some(t => t.id === secondDraft.id) && !afterPublish.published.templates.some(t => t.id === secondDraft.id))
  check('模板更新不改变已保存报告快照', JSON.stringify((await request('/api/h5-reports', undefined, 'student')).data.reports[0].layoutSnapshot) === originalSnapshot)
  const approved = (await expect('管理员审核后发布报告', `/api/admin/h5-reports/${report.id}/audit`, { status: 'published' }, 200, 'admin', 'PATCH')).data.report
  const publicRoute = `/api/public/h5-reports/${approved.shareToken}`
  const publicReport = (await expect('公开报告按已保存快照读取', publicRoute, undefined, 200, '')).data.report
  check('公开接口不包含模板提示词或草稿', !publicReport.templateSnapshot.designDocument && !publicReport.templateSnapshot.pageDesigns)
  const publicImage = publicReport.layoutSnapshot.pages.flatMap(p => [p.backgroundImage, ...p.elements.map(e => e.src)]).find(src => src?.includes('/media/'))
  await expect('分享资源无需登录且只读当前报告引用', publicImage, undefined, 200, '')
  await expect('分享资源不能任意枚举文件', `${publicRoute}/media/999`, undefined, 404, '')
  await expect('其他机构不能审核本报告', `/api/admin/h5-reports/${report.id}/audit`, { status: 'offline' }, 404, 'foreignAdmin', 'PATCH')
  const aiDesign = cloneLayout(locked)
  mode = 'empty'; await expect('空模型结果保留原稿并返回可读错误', '/api/admin/h5-report-layout/generate', { design: aiDesign }, 502)
  mode = 'timeout'; await expect('真实HTTP请求超时后结束且保留原稿', '/api/admin/h5-report-layout/generate', { design: aiDesign }, 502)
  mode = 'failure'; const failedCalls = calls; await expect('模型服务失败不伪装成功', '/api/admin/h5-report-layout/generate', { design: aiDesign }, 503); check('供应商失败只请求一次，不自动重复计费', calls === failedCalls + 1)
  mode = 'slow'; const running = request('/api/admin/h5-report-layout/generate', { design: aiDesign }); await new Promise(done => setTimeout(done, 150)); await expect('同账号并发任务被限制', '/api/admin/h5-report-layout/generate', { design: aiDesign }, 429); assert.equal((await running).status, 200); mode = 'success'

  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) })
  web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { env: { ...process.env, VITE_AUTH_MODE: 'server', VITE_API_PROXY_TARGET: `http://127.0.0.1:${serverPort}` }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${webPort}`)).ok) break } catch {} await new Promise(done => setTimeout(done, 100)) }
  const base = `http://127.0.0.1:${webPort}`
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  context.setDefaultNavigationTimeout(60000)
  const page = await context.newPage(); activePage = page; page.on('pageerror', e => diagnostics.push({ kind: 'pageerror', message: e.message })); page.on('console', m => { if (m.type() === 'error') diagnostics.push({ kind: 'console', message: m.text() }) }); page.on('response', async r => { if (r.url().includes('h5-report-config/template')) diagnostics.push({ kind: 'save-response', status: r.status(), templateId: r.request().postDataJSON()?.template?.id, message: (await r.json()).message }) })
  const [cookieName, cookieValue] = cookies.admin.split('='); await context.addCookies([{ name: cookieName, value: cookieValue, url: base }])
  await page.goto(`${base}/admin/h5-reports`, { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: '视觉风格', exact: true }).click(); await page.getByRole('heading', { name: 'H5 模板设计器' }).waitFor(); await page.locator('.studio-workspace:not([inert])').waitFor()
  await page.locator('.studio-template-switch select').selectOption(template.id)
  await page.getByRole('button', { name: '全屏编辑', exact: true }).click()
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) { await page.setViewportSize({ width, height }); await page.screenshot({ path: join(evidence, `模板设计器-${width}.png`) }); const bounds = await page.locator('.studio-workspace').evaluate(el => ({ w: el.scrollWidth, c: el.clientWidth })); check(`${width}横屏工作区无横向溢出`, bounds.w <= bounds.c + 1) }
  const title = page.locator('.studio-paper-wrap .h5-layout-element').filter({ hasText: '这是我的设计' }).first()
  await title.click(); await page.getByLabel('元素名称', { exact: true }).fill('验收标题')
  await page.getByLabel('水平位置', { exact: true }).fill('100'); await page.getByLabel('水平位置', { exact: true }).blur()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await page.getByText('草稿已保存到服务端', { exact: false }).first().waitFor()
  await page.reload(); await page.getByRole('button', { name: '视觉风格', exact: true }).click(); await page.locator('.studio-template-switch select').selectOption(template.id); await page.locator('.studio-workspace:not([inert])').waitFor()
  check('浏览器编辑、保存和刷新回读成功', await page.locator('.studio-paper-wrap [aria-label="验收标题"]').count() === 1)
  await page.getByRole('button', { name: '全屏编辑', exact: true }).click()
  const box = await page.locator('.studio-paper-wrap [aria-label="验收标题"]').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 15); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 20, box.y + 25, { steps: 6 }); await page.mouse.up()
  check('真实浏览器拖动改变元素位置', Number(await page.getByLabel('水平位置', { exact: true }).inputValue()) !== 100)
  await page.getByRole('button', { name: '撤销', exact: true }).click(); check('拖动可以撤销', Number(await page.getByLabel('水平位置', { exact: true }).inputValue()) === 100)
  const resizeHandle = page.locator('.studio-paper-wrap .h5-layout-resize'), handleBox = await resizeHandle.boundingBox()
  const originalHeight = Number(await page.getByLabel('高度', { exact: true }).inputValue())
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2); await page.mouse.down(); await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 15, { steps: 5 }); await page.mouse.up()
  check('浏览器手柄缩放改变高度', Number(await page.getByLabel('高度', { exact: true }).inputValue()) > originalHeight)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByLabel('锁定位置与大小', { exact: true }).check()
  const lockedBox = await page.locator('.studio-paper-wrap [aria-label="验收标题"]').boundingBox()
  await page.mouse.move(lockedBox.x + 30, lockedBox.y + 15); await page.mouse.down(); await page.mouse.move(lockedBox.x + 65, lockedBox.y + 25, { steps: 4 }); await page.mouse.up()
  check('手动锁定后拖动无效且数值禁用', await page.getByLabel('水平位置', { exact: true }).isDisabled() && Number(await page.getByLabel('水平位置', { exact: true }).inputValue()) === 100)
  await page.getByLabel('锁定位置与大小', { exact: true }).uncheck()
  await page.getByRole('tab', { name: '图层', exact: true }).click(); const titleLayer = page.locator('.studio-layer').filter({ hasText: '验收标题' })
  await titleLayer.getByRole('button', { name: '隐藏图层', exact: true }).click(); check('图层隐藏后画布元素消失', await page.locator('.studio-paper-wrap [aria-label="验收标题"]').count() === 0)
  await page.getByRole('button', { name: '撤销', exact: true }).click(); check('隐藏图层可以撤销', await page.locator('.studio-paper-wrap [aria-label="验收标题"]').count() === 1)
  await page.getByRole('tab', { name: '添加', exact: true }).click(); await page.getByRole('button', { name: '生成排版建议', exact: true }).click(); await page.getByRole('button', { name: '应用排版', exact: true }).waitFor(); await page.getByRole('button', { name: '应用排版', exact: true }).click(); check('浏览器AI建议预览并应用成功')
  await page.locator('.studio-file').setInputFiles({ name: '浏览器上传.png', mimeType: 'image/png', buffer: image }); await page.locator('.studio-paper-wrap img').last().waitFor(); check('浏览器上传并添加图片成功')
  await page.getByRole('button', { name: '撤销', exact: true }).click(); check('上传插入可以一次撤销', await page.locator('.studio-paper-wrap img').count() === 0)
  const publishingResponse = page.waitForResponse(r => r.url().includes('/api/admin/h5-report-config/template') && r.request().postDataJSON()?.action === 'publish')
  await page.getByRole('button', { name: '发布模板', exact: true }).click(); await page.getByRole('button', { name: '发布', exact: true }).click(); check('真实浏览器可单独发布模板', (await publishingResponse).status() === 200)
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: join(evidence, '模板设计器-390.png') }); check('后台窄屏布局没有横向溢出', await page.locator('.h5-studio').evaluate(el => el.scrollWidth <= el.clientWidth + 1)); await page.setViewportSize({ width: 1280, height: 800 })
  const studentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const [studentCookieName, studentCookie] = cookies.student.split('='); await studentContext.addCookies([{ name: studentCookieName, value: studentCookie, url: base }])
  const studentPage = await studentContext.newPage(); studentPage.on('pageerror', e => diagnostics.push({ kind: 'pageerror', message: e.message, stack: e.stack })); studentPage.on('response', async r => { if (r.status() >= 400 && r.url().includes('/api/')) diagnostics.push({ kind: 'student-request-error', status: r.status(), route: new URL(r.url()).pathname, message: (await r.json().catch(() => ({}))).message }) }); studentPage.on('request', r => { if (r.url().endsWith('/api/h5-report/layout')) { const body = r.postDataJSON(); diagnostics.push({ kind: 'student-layout-source', projectId: body.projectId, projectDocumentId: body.projectDocumentId }) } })
  await studentPage.goto(`${base}/student/workbench`, { waitUntil: 'domcontentloaded' })
  await studentPage.waitForFunction(id => { const store = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia._s.get('project'); return store?.hydrated && store.projects.some(p => p.id === id) }, project.id)
  const openedProject = await studentPage.evaluate(async id => { const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project'); const availableIds = store.projects.map(p => p.id); store.openProject(id); await store.flushServerWrites(true); return { requestedId: id, availableIds, currentId: store.currentProject?.id, draftId: store.draft?.id, serverId: store.draft?._serverDocumentId, hasPrompt: Boolean(store.draft?.prompt) } }, project.id)
  diagnostics.push({ kind: 'student-opened-project', ...openedProject }); check('学生选中实际项目后草稿保留素材并落库', openedProject.draftId === project.id && openedProject.hasPrompt && openedProject.serverId)
  diagnostics.push({ kind: 'student-documents-before-report', documents: (await request('/api/me/documents', undefined, 'student')).data.documents.map(d => ({ type: d.type, id: d.id, projectId: d.data.id, hasPrompt: Boolean(d.data.prompt), versions: d.data.versions?.length })) })
  await studentPage.goto(`${base}/student/h5-report?difficulty=pro&action=generate`, { waitUntil: 'domcontentloaded' })
  try { await studentPage.getByRole('dialog', { name: '自动排版报告预览' }).waitFor({ timeout: 20000 }) } catch (error) { console.log(JSON.stringify(diagnostics)); await studentPage.screenshot({ path: join(evidence, '学生失败状态.png') }); throw error }
  check('学生页面复用资料整理并自动排版预览', await studentPage.locator('.h5-designed-preview .h5-layout-paper').count() === 1)
  await studentPage.screenshot({ path: join(evidence, '学生自动排版预览.png') })
  await studentPage.getByRole('button', { name: '保存并提交审核', exact: true }).click(); await studentPage.getByRole('button', { name: '已提交审核', exact: true }).waitFor()
  check('学生页面保存并提交审核成功')
  const studentReports = (await request('/api/h5-reports', undefined, 'student')).data.reports; const studentReport = studentReports.find(r => r.id !== report.id) || studentReports[0]
  const savedCalls = calls
  await studentPage.goto(`${base}/student/reports`, { waitUntil: 'domcontentloaded' }); const reportCard = studentPage.locator('.report-card').filter({ hasText: studentReport.title }); await reportCard.getByRole('button', { name: '查看预览', exact: true }).click(); await studentPage.getByRole('dialog', { name: '自动排版报告预览' }).waitFor(); check('报告列表可重新打开服务端已保存报告', calls === savedCalls)
  await request(`/api/admin/h5-reports/${studentReport.id}/audit`, { status: 'published' }, 'admin', 'PATCH')
  await studentPage.reload(); await studentPage.getByRole('button', { name: '生成分享海报', exact: true }).click(); await studentPage.getByAltText('分享海报，点击下载', { exact: true }).waitFor(); check('审核通过后生成带对应报告二维码的海报')
  const publicPage = await browser.newPage({ viewport: { width: 390, height: 844 } }); await publicPage.goto(`${base}/h5-report/public/${approved.shareToken}`); await publicPage.locator('.h5-layout-paper').waitFor(); await publicPage.screenshot({ path: join(evidence, '手机报告.png') }); check('手机公开页渲染真实布局且只有官网功能按钮', await publicPage.locator('.report-actions button').count() === 1)
  await publicPage.getByRole('button', { name: '下一页', exact: true }).click(); check('手机报告章节切换成功')
  const overflow = await publicPage.locator('.h5-layout-text').evaluateAll(nodes => nodes.some(n => n.scrollHeight > n.clientHeight + 2)); check('手机页面文字没有溢出', !overflow)
  const disableState = (await request('/api/admin/h5-report-config')).data
  await expect('管理员停用模板', '/api/admin/h5-report-config/template', { template: { ...disableState.draft.templates.find(t => t.id === template.id), status: 'disabled' }, revision: disableState.revision, action: 'publish' }, 200)
  await expect('停用后不能用该模板新生成', '/api/h5-report/layout', layoutBody, 403, 'student')
  await expect('停用模板后已发布报告快照仍可读', publicRoute, undefined, 200, '')
  for (const layout of ['kids-classroom', 'product-design-story']) {
    const legacy = (await expect(`保存旧版${layout}报告`, '/api/h5-reports', { report: { id: `legacy_${layout}_${suffix}`, title: `旧版报告${layout}`, difficulty: 'pro', pages: [{ id: 'cover', storyStep: 'cover', type: 'cover', title: '历史创作记录', text: '历史报告正文', src: '/assets/h5-report/product-design-story.png' }], templateSnapshot: { layout } } }, 200, 'student')).data.report
    const published = (await request(`/api/admin/h5-reports/${legacy.id}/audit`, { status: 'published' }, 'admin', 'PATCH')).data.report
    await publicPage.goto(`${base}/h5-report/public/${published.shareToken}`); await publicPage.locator(layout === 'product-design-story' ? '.story-page' : '.report-page').waitFor(); check(`旧版${layout}报告仍可阅读且不用重新生成`, !((await request(`/api/public/h5-reports/${published.shareToken}`, undefined, '')).data.report.layoutSnapshot))
  }
  const legacyImageId = `legacy_image_${suffix}`
  await expect('旧整页图片上传接口保持兼容', `/api/h5-reports/${legacyImageId}/pages`, { pageId: 'page1', imageData }, 201, 'student')
  const imageReport = (await request('/api/h5-reports', { report: { id: legacyImageId, title: '旧整页图片报告', difficulty: 'pro', pages, pageImages: [{ id: 'page1', label: '旧报告第一页' }] } }, 'student')).data.report
  const imagePublished = (await request(`/api/admin/h5-reports/${imageReport.id}/audit`, { status: 'published' }, 'admin', 'PATCH')).data.report
  await publicPage.goto(`${base}/h5-report/public/${imagePublished.shareToken}`); await publicPage.locator('.h5-page-image-viewer img').waitFor(); await publicPage.locator('.h5-page-image-viewer img').evaluate(img => img.decode()); check('旧整页图片报告仍可读取', await publicPage.locator('.h5-page-image-viewer img').evaluate(img => img.complete && img.naturalWidth > 0))
  await expect('管理员下架报告', `/api/admin/h5-reports/${report.id}/audit`, { status: 'offline' }, 200, 'admin', 'PATCH')
  await expect('下架后旧分享链接失效', publicRoute, undefined, 404, '')
  await expect('下架后旧分享资源失效', publicImage, undefined, 404, '')
  check('浏览器没有未捕获运行错误', !diagnostics.some(d => d.kind === 'pageerror'))
  check('正式配置和报告文件未被改动', JSON.stringify(before) === JSON.stringify(await Promise.all(protectedFiles.map(digest))))
} finally {
  if (activePage && !activePage.isClosed()) { diagnostics.push({ kind: 'final-state', text: await activePage.locator('.studio-header').innerText().catch(() => '') }); await activePage.screenshot({ path: join(evidence, '最后状态.png') }).catch(() => {}) }
  clearTimeout(pendingTimer); await browser?.close(); if (web) web.kill(); await stopServer(); upstream.closeAllConnections(); await new Promise(done => upstream.close(done)); await db?.end()
  if (master && createdDatabase) { await master.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [createdDatabase]); await master.query(`DROP DATABASE "${createdDatabase}"`); await master.end() }
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ passed: results.length, results, diagnostics, ai: '本机隔离测试模型；真实AI另行验证' }, null, 2)); await writeFile(join(evidence, 'server.log'), serverLogs)
  console.log(`证据：${evidence}`)
}
