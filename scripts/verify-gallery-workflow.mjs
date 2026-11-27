// 专用测试库、真实后端；审核模型仅使用本地 HTTP 夹具，绝不调用付费服务。
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { galleryDefaultRules } from '../src/utils/galleryRules.js'

const testUrl = process.env.TEST_DATABASE_URL || ''
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('必须指定名称包含 test 的 TEST_DATABASE_URL，禁止连接业务库。')
process.env.DATABASE_URL = testUrl
const { query, closeDb } = await import('../server/db.js')
const { hashPassword } = await import('../server/auth.js')
const suffix = randomBytes(6).toString('hex'), org = `gallery_test_${suffix}`, org2 = `gallery_other_${suffix}`
const evidence = resolve('.workbuddy/evidence/content-audit', suffix), dataDir = join(evidence, 'data')
await mkdir(dataDir, { recursive: true })
const checks = [], users = {}, cookies = {}, password = randomBytes(18).toString('hex')
let server, port, webPort, serverEnv, logs = '', held, modelMode = 'success', rules, sequence = 0
const seen = [], pause = ms => new Promise(done => setTimeout(done, ms))
function check(label, value = true) { assert.ok(value, label); checks.push(label); console.log(`通过：${label}`) }
async function until(fn, label, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { const value = await fn(); if (value) return value; await pause(100) }; throw new Error(`等待超时：${label}`) }
async function freePort() { const s = http.createServer(); await new Promise(done => s.listen(0, '127.0.0.1', done)); const value = s.address().port; await new Promise(done => s.close(done)); return value }
const upstream = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString()); seen.push(body)
  const title = JSON.parse(body.messages[1].content[0].text).title, mode = modelMode
  res.setHeader('Content-Type', 'application/json')
  const finish = () => {
    if (res.destroyed || mode === 'timeout') return
    if (['limit','balance','failure','safety_error'].includes(mode)) { res.statusCode = ({ limit:429,balance:402,failure:500,safety_error:400 })[mode]; res.end('{}'); return }
    if (mode === 'empty') { res.end(JSON.stringify({ choices:[] })); return }
    const safety = title.includes('不安全') ? 'unsafe' : title.includes('不确定') ? 'uncertain' : 'safe'
    const result = mode === 'malformed' ? { safety:'safe',score:999 } : { safety,riskCategories:safety === 'safe' ? [] : ['other'],recommendation:title.includes('低分') ? 'not_recommended' : 'recommended',reason:`隔离判断：${safety}`,imageDescription:'隔离图片夹具，用于验证结构化看图链路',score:title.includes('低分') ? 40 : 96,dimensions:[{ name:'创意表达',score:90,reason:'隔离评分依据' }] }
    res.end(JSON.stringify({ choices:[{ message:{ content:JSON.stringify(result) } }],usage:{ prompt_tokens:100,completion_tokens:100 } }))
  }
  if (mode === 'hold') held = finish; else finish()
})
await new Promise(done => upstream.listen(0,'127.0.0.1',done))
await writeFile(join(dataDir,'ai-providers.json'),JSON.stringify({ defaultProvider:'openai',hiddenProviders:['agnes','volcengine','deepseek','hunyuan3d'],providers:{ openai:{ label:'隔离审核测试模型',apiKey:'isolated-test-key',baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`,textModel:'gallery-fixture',textModels:['gallery-fixture'],imageModel:'',imageModels:[] } } }))
async function startServer(budget = 0) {
  port ||= await freePort(); webPort ||= await freePort()
  serverEnv = { ...process.env,DATABASE_URL:testUrl,AI_DATA_DIR:dataDir,AUTH_MODE:'server',PORT:String(port),APP_ORIGIN:`http://127.0.0.1:${webPort}`,GALLERY_DAILY_BUDGET_CNY:String(budget),GALLERY_TIMEOUT_MS:'2000',GALLERY_WORKER_ENABLED:'true',OPENAI_API_KEY:'isolated-test-key' }
  server = spawn(process.execPath,['server/index.js'],{ env:serverEnv,stdio:['ignore','pipe','pipe'] })
  server.stdout.on('data',chunk => { logs += chunk }); server.stderr.on('data',chunk => { logs += chunk })
  await until(async () => { if (server.exitCode !== null) throw new Error('隔离后端启动失败，请检查证据日志'); try { return (await fetch(`http://127.0.0.1:${port}/api/health`)).ok } catch { return false } },'后端启动')
}
async function stopServer() { if (!server || server.exitCode !== null) return; const ended = once(server,'exit'); server.kill(); await ended }
async function request(route,{ method,body,role = 'student',status = 200 } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`,{ method:method || (body === undefined ? 'GET' : 'POST'),headers:{ 'Content-Type':'application/json',Cookie:cookies[role] || '' },...(body === undefined ? {} : { body:JSON.stringify(body) }) })
  const data = response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer())
  assert.equal(response.status,status,`${route}：${JSON.stringify(data).slice(0,700)}`); return { data,response }
}
async function saveRules(patch = {}) { const current = (await request('/api/admin/gallery-audit-settings',{ role:'admin' })).data.settings; rules = (await request('/api/admin/gallery-audit-settings',{ method:'PUT',role:'admin',body:{ ...current,...patch } })).data.settings; return rules }
async function consent(role = 'student',granted = true) { return request(`/api/admin/gallery-consents/${users[role]}`,{ role:'admin',method:'PUT',body:{ granted,evidence:'学校授权登记测试编号，仅限隔离验收' } }) }
async function makeDoc(title,{ role = 'student',image,final = true,data = {} } = {}) {
  const png = image || `data:image/png;base64,${(await sharp(randomBytes(64*64*3),{ raw:{ width:64,height:64,channels:3 } }).png().toBuffer()).toString('base64')}`
  return (await request('/api/me/documents',{ role,status:201,body:{ type:'project',resourceKey:`project_${suffix}_${++sequence}`,title,data:{ id:`project_${suffix}_${sequence}`,title,difficulty:'pro',finalVersionId:final ? 'final' : '',versions:[{ id:'final',title,imageUrl:png,ratio:'1:1',createdAt:new Date().toISOString() }],...data } } })).data.document
}
async function submit(doc,extra = {},status = 201) { return (await request('/api/me/gallery-submissions',{ body:{ documentId:doc.id,acceptPublication:true,...extra },status })).data.submission }
async function own(doc) { return (await request('/api/me/gallery-submissions')).data.works.find(work => work.documentId === doc.id) }
async function waitState(doc,state) { return until(async () => { const row = await own(doc); return row?.status === state && row },`${doc.title} -> ${state}`) }
async function waitJob(doc) { return until(async () => { const row = (await query('SELECT * FROM gallery_jobs WHERE document_id=$1 ORDER BY created_at DESC LIMIT 1',[doc.id])).rows[0]; return ['done','error','waiting_budget'].includes(row?.state) && row },`任务结束：${doc.title}`) }
async function review(id,action,status = 200,expectedUpdatedAt) { return request(`/api/admin/gallery-submissions/${id}`,{ role:'admin',method:'PATCH',body:{ action,reason:'隔离人工核对并确认',expectedUpdatedAt },status }) }
async function updateDoc(doc,patch) { return (await request(`/api/me/documents/${doc.id}`,{ method:'PATCH',body:{ version:doc.version,...patch } })).data.document }

try {
  await query(await readFile('server/schema.sql','utf8')); await query(await readFile('server/gallery-schema.sql','utf8')); await query(await readFile('server/gallery-schema.sql','utf8')); check('增量迁移可重复执行')
  const hash = await hashPassword(password)
  for (const organization of [org,org2]) await query('INSERT INTO organizations(id,code,name) VALUES($1,$1,$1)',[organization])
  for (const campus of ['campus_a','campus_b']) await query('INSERT INTO campuses(id,organization_id,code,name) VALUES($1,$2,$1,$1)',[`${campus}_${suffix}`,org])
  for (const role of ['student','other','teacher','parent','admin','campusAdmin','outsider']) {
    users[role] = `${role}_${suffix}`
    const realRole = role === 'other' ? 'student' : ['campusAdmin','outsider'].includes(role) ? 'admin' : role
    await query('INSERT INTO users(id,organization_id,campus_id,account,password_hash,display_name,role,permissions) VALUES($1,$2,$3,$1,$4,$5,$6,$7)',[users[role],role === 'outsider' ? org2 : org,role === 'outsider' ? null : `${role === 'other' ? 'campus_b' : 'campus_a'}_${suffix}`,hash,`验收${role}`,realRole,JSON.stringify({ studentAccess:true,adminAccess:true,teacherAccess:true,parentAccess:true,aiCreate:true,reports:true,courses:true })])
    if (realRole === 'admin') await query('INSERT INTO admin_scopes(id,admin_user_id,organization_id,campus_id,scope_type) VALUES($1,$2,$3,$4,$5)',[`scope_${role}_${suffix}`,users[role],role === 'outsider' ? org2 : org,role === 'campusAdmin' ? `campus_a_${suffix}` : null,role === 'campusAdmin' ? 'campus' : 'organization'])
  }
  await startServer()
  for (const role of Object.keys(users)) { const { response } = await request('/api/auth/login',{ body:{ account:users[role],password,organizationCode:role === 'outsider' ? org2 : org },role:'' }); cookies[role] = response.headers.get('set-cookie').split(';')[0] }
  check('学生、教师、家长、管理员真实登录成功')
  await request('/api/admin/gallery-audit-settings',{ role:'',status:401 }); for (const role of ['student','teacher','parent']) await request('/api/admin/gallery-audit-settings',{ role,status:403 }); check('配置接口禁止未登录与非管理员访问')
  const defaults = (await request('/api/admin/gallery-audit-settings',{ role:'admin' })).data.settings
  check('AI、精选、自动上架默认关闭',!defaults.aiAudit && !defaults.autoSelect && !defaults.autoPublish)
  check('学生没有伪造学校授权与默认参与',!(await request('/api/me/gallery-consent')).data.consent.granted)
  const manual = await makeDoc('人工投稿最终作品'); await submit(manual,{},409); check('未登记学校授权不能投稿')
  await consent(); await consent('other'); await submit(manual,{ acceptPublication:false },400); check('投稿必须确认公开说明')
  for (const role of ['teacher','parent','admin']) await request('/api/me/gallery-submissions',{ role,body:{ documentId:manual.id,acceptPublication:true },status:403 })
  await request('/api/me/gallery-submissions',{ role:'other',body:{ documentId:manual.id,acceptPublication:true },status:404 }); check('其他学生、教师、家长、管理员不能代投')
  await submit(await makeDoc('缺最终版',{ final:false }),{},400); await submit(await makeDoc('无真实图片',{ image:'linear-gradient(red,blue)' }),{},400); check('缺最终版或无真实图片明确失败')
  const submission = await submit(manual), again = await submit(manual); check('AI关闭进入人工复核，重复投稿幂等',submission.status === 'review' && submission.id === again.id)
  for (const role of ['teacher','parent']) await request(`/api/gallery/submissions/${submission.id}/image?review=1`,{ role,status:403 })
  for (const role of ['other','outsider']) await request(`/api/gallery/submissions/${submission.id}/image?review=1`,{ role,status:404 }); check('待审图片权限隔离')
  await review(submission.id,'approved')
  const publicWork = (await request('/api/gallery/public')).data.works.find(work => work.id === submission.id)
  check('人工通过后公开状态正确且不泄露私有字段',publicWork?.status === 'published' && !publicWork.prompt && !publicWork.description && !publicWork.aiResult && publicWork.author === '小画家')
  check('独立快照图片可真实解码',(await sharp((await request(publicWork.cover)).data).metadata()).format === 'jpeg')
  await request(`/api/me/documents/${manual.id}`,{ role:'other',status:404 }); check('上架不放开原始文档权限')
  const edited = await updateDoc(manual,{ title:'未经审核的新标题' })
  check('原作品修改不改变已发布快照',(await request('/api/gallery/public')).data.works.find(work => work.id === submission.id).title === manual.title)
  await review(submission.id,'approved',409); check('源作品变化后旧记录不能直接通过')
  await submit(edited); await review(submission.id,'approved'); await review(submission.id,'offline'); await request(publicWork.cover,{ status:404 }); await submit(edited,{},409); check('下架同步停止取图且不能自动重发')
  await review(submission.id,'approved'); await request(`/api/me/gallery-submissions/${submission.id}/withdraw`,{ body:{} }); await review(submission.id,'approved',409); check('学生撤回不可被管理员越过')
  const otherDoc = await makeDoc('另一校区作品',{ role:'other' })
  const otherSub = (await request('/api/me/gallery-submissions',{ role:'other',body:{ documentId:otherDoc.id,acceptPublication:true },status:201 })).data.submission
  await request(`/api/admin/gallery-submissions/${otherSub.id}`,{ role:'campusAdmin',method:'PATCH',body:{ action:'approved',reason:'越权测试' },status:404 })
  await request('/api/admin/gallery-audit-settings',{ role:'campusAdmin',method:'PUT',body:defaults,status:403 }); check('校区管理员不越界处理或修改全校规则')
  const draft = { ...galleryDefaultRules,provider:'openai',model:'gallery-fixture',customAudit:true,auditRequirements:'额外审核要求甲',customSelection:true,selectionRequirements:'优秀作品标准乙',dailyBudget:10,requestCostCeiling:0.01 }
  await request('/api/admin/gallery-trials',{ role:'admin',body:{ documentId:otherDoc.id,rules:draft },status:409 }); check('预算为0时试审也不会发出请求',seen.length === 0)
  await saveRules(draft); await request('/api/admin/gallery-audit-settings',{ role:'admin',method:'PUT',body:{ ...rules,aiAudit:true },status:409 }); check('未验证视觉模型不能开启自动审核')
  await stopServer(); await startServer(20); check('服务重启保留配置、授权与投稿',(await request('/api/admin/gallery-audit-settings',{ role:'admin' })).data.settings.auditRequirements === draft.auditRequirements && (await own(manual)).status === 'withdrawn')
  const trial = (await request('/api/admin/gallery-trials',{ role:'admin',body:{ documentId:otherDoc.id,rules:draft },status:202 })).data.job
  await until(async () => (await request(`/api/admin/gallery-jobs/${trial.id}`,{ role:'admin' })).data.job.state === 'done','试审完成')
  check('隔离模型收到真实图片内容与两类自定义要求',seen.at(-1).messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,') && seen.at(-1).messages[0].content.includes(draft.auditRequirements) && seen.at(-1).messages[0].content.includes(draft.selectionRequirements))
  check('试审不发布作品',!(await request('/api/gallery/public')).data.works.some(work => work.documentId === otherDoc.id))
  await request('/api/me/gallery-consent',{ method:'PUT',body:{ optedIn:true } }); await saveRules({ ...draft,aiAudit:true,autoSelect:true,autoPublish:true })
  const automatic = await makeDoc('系统精选优秀作品'), autoWork = await waitState(automatic,'published'); check('无需主动投稿，最终版保存后服务端自动精选上架',autoWork.source === '系统精选')
  const events = (await query('SELECT count(*)::int AS n FROM gallery_events WHERE document_id=$1',[automatic.id])).rows[0].n
  await updateDoc(automatic,{ data:{ ...automatic.data,uiPanelOpen:true } }); check('无关字段保存不触发审核',(await query('SELECT count(*)::int AS n FROM gallery_events WHERE document_id=$1',[automatic.id])).rows[0].n === events)
  const low = await makeDoc('低分但安全的最终作品'); await waitState(low,'not_selected'); const lowCalls = seen.length
  check('未入选作品主动投稿复用安全结果且不受精选门槛限制',(await submit(low)).status === 'published' && seen.length === lowCalls)
  const unsafe = await makeDoc('不安全高分作品'); await waitState(unsafe,'rejected'); check('高分不抵消不安全结论',(await own(unsafe)).qualityScore === 96)
  const uncertain = await makeDoc('不确定作品'); await waitState(uncertain,'review'); check('不确定结果转人工')
  const duplicateCalls = seen.length, duplicate = await makeDoc('重复图片',{ image:automatic.data.versions[0].imageUrl }); await waitState(duplicate,'review'); check('精确重复先转人工，不调用模型',seen.length === duplicateCalls)
  for (const mode of ['empty','malformed','limit','balance','failure','safety_error','timeout']) {
    modelMode = mode; const doc = await makeDoc(`模型异常-${mode}`), before = seen.length, job = await waitJob(doc)
    check(`${mode}不伪造成功、不重试、转人工`,job.state === 'error' && (await own(doc)).status === 'review' && seen.length === before + 1)
    if (mode === 'empty') { const row = await own(doc); await request(`/api/admin/gallery-submissions/${row.id}/retry`,{ role:'admin',body:{},status:400 }); modelMode = 'success'; await request(`/api/admin/gallery-submissions/${row.id}/retry`,{ role:'admin',body:{ confirmExtraCost:true },status:202 }); await waitState(doc,'published'); check('管理员明确确认费用后重审并记录次数',(await query('SELECT attempts FROM gallery_jobs WHERE id=$1',[job.id])).rows[0].attempts === 2) }
  }
  modelMode = 'hold'; held = null; const race = await makeDoc('人工纠错竞态'); await until(() => held,'模型接收人工纠错作品'); await review((await own(race)).id,'rejected'); held(); modelMode = 'success'; await waitJob(race); check('迟到AI不能覆盖人工决定',(await own(race)).status === 'rejected')
  modelMode = 'hold'; held = null; const switchRace = await makeDoc('关闭发布竞态'); await until(() => held,'模型接收发布开关作品'); await saveRules({ autoPublish:false }); held(); modelMode = 'success'; await waitJob(switchRace); check('审核中关闭自动上架立即限制发布',(await own(switchRace)).status === 'review')
  await saveRules({ autoPublish:true,customAudit:false,customSelection:false }); const ordinary = await makeDoc('关闭自定义要求'); await waitState(ordinary,'published'); check('关闭要求开关保留输入但不发送自定义要求',rules.auditRequirements === draft.auditRequirements && !seen.at(-1).messages[0].content.includes(draft.auditRequirements) && !seen.at(-1).messages[0].content.includes(draft.selectionRequirements))
  modelMode = 'hold'; held = null; const revoke = await makeDoc('撤销授权竞态'); await until(() => held,'模型接收撤销授权作品'); await consent('student',false); held(); modelMode = 'success'; await waitJob(revoke); check('审核中撤回学校授权立即撤下作品',(await own(revoke)).status === 'withdrawn' && !(await request('/api/gallery/public')).data.works.some(work => work.id === autoWork.id)); await request(`/api/gallery/submissions/${autoWork.id}/image`,{ status:404 })
  await consent(); await request('/api/me/gallery-consent',{ method:'PUT',body:{ optedIn:true } })
  const usage = (await request('/api/admin/gallery-meta',{ role:'admin' })).data.usage; await saveRules({ dailyLimit:usage.calls }); const budgetDoc = await makeDoc('超过当日额度'), beforeBudget = seen.length; await waitState(budgetDoc,'waiting_budget'); check('额度不足原子暂停且不发送请求',seen.length === beforeBudget)
  await saveRules({ aiAudit:false,autoSelect:false,autoPublish:false,dailyLimit:100,dailyBudget:0,requestCostCeiling:0 }); await query("UPDATE gallery_jobs SET updated_at=now()-interval '2 minutes' WHERE document_id=$1",[budgetDoc.id]); await pause(3500); check('关闭审核后等待任务不再调用',seen.length === beforeBudget)
  const browserDoc = await makeDoc('浏览器待审作品'); await submit(browserDoc); const studentDoc = await makeDoc('浏览器学生投稿作品')
  const deleted = await makeDoc('删除应撤下的作品'), deletedSub = await submit(deleted); await review(deletedSub.id,'approved'); await request(`/api/me/documents/${deleted.id}`,{ method:'DELETE' }); await request(`/api/gallery/submissions/${deletedSub.id}/image`,{ status:404 }); check('删除原作品同步撤下图片')
  const first = (await request('/api/admin/gallery-submissions?pageSize=2',{ role:'admin' })).data, second = (await request('/api/admin/gallery-submissions?pageSize=2&page=2',{ role:'admin' })).data
  check('后台真实分页和全量统计',first.works.length === 2 && second.works.length === 2 && first.total > 4 && first.stats.total === first.total && first.works[0].id !== second.works[0].id)
  check('状态筛选真实生效',(await request('/api/admin/gallery-submissions?status=review',{ role:'admin' })).data.works.every(work => work.status === 'review'))
  check('跨机构后台列表隔离',(await request('/api/admin/gallery-submissions',{ role:'outsider' })).data.total === 0)
  const current = (await request('/api/admin/gallery-audit-settings',{ role:'admin' })).data.settings; await saveRules({ qualityThreshold:86 }); await request('/api/admin/gallery-audit-settings',{ role:'admin',method:'PUT',body:current,status:409 }); check('并发配置冲突返回409')
  await stopServer(); await startServer(); check('再次重启保留待审与学校授权',(await own(browserDoc)).status === 'review' && (await request('/api/me/gallery-consent')).data.consent.granted)
  if (process.env.GALLERY_BROWSER_TEST !== '0') { const { verifyGalleryBrowser } = await import('./verify-gallery-browser.mjs'); await verifyGalleryBrowser({ webPort,port,cookies,evidence,check,request,saveRules,studentDoc }) }
  await writeFile(join(evidence,'results.json'),JSON.stringify({ date:new Date().toISOString(),checks,model:'本地隔离HTTP夹具；真实AI效果未验证' },null,2)); console.log(`隔离验收通过 ${checks.length} 项；证据：${evidence}`)
} finally {
  await stopServer(); upstream.closeAllConnections(); await new Promise(done => upstream.close(done)); await writeFile(join(evidence,'server.log'),logs); await writeFile(join(evidence,'partial-results.json'),JSON.stringify({ checks },null,2)); await closeDb()
}
