// 审核费用、租约恢复、模型停用和数据库权限的补充隔离验证。
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { mkdir,writeFile,readFile } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import sharp from 'sharp'
import { galleryDefaultRules } from '../src/utils/galleryRules.js'
if (!/test/i.test(new URL(process.env.TEST_DATABASE_URL || 'postgres://invalid/invalid').pathname)) throw new Error('仅允许专用 TEST_DATABASE_URL')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.GALLERY_DAILY_BUDGET_CNY = '20'
const { query,closeDb,withTransaction } = await import('../server/db.js')
const service = await import('../server/gallery-service.js')
const { configureGalleryRuntime } = await import('../server/gallery-engine.js')
const { runGalleryWorkerOnce } = await import('../server/gallery-worker.js')
const { createOwnAsset } = await import('../server/asset-store.js')
const suffix = randomBytes(6).toString('hex'), org = `guards_test_${suffix}`, adminId = `admin_${suffix}`, studentId = `student_${suffix}`, otherId = `other_${suffix}`
const evidence = resolve('.workbuddy/evidence/content-audit',`guards-${suffix}`); await mkdir(evidence,{ recursive:true })
const admin = { id:adminId,role:'admin',organization:{ id:org } }, student = { id:studentId,role:'student',organization:{ id:org } }, other = { ...student,id:otherId }
let calls = 0,enabled = true,number = 0,rules
const checks = [], response = { safety:'safe',riskCategories:[],recommendation:'recommended',reason:'本地隔离安全结果',imageDescription:'纯色测试图片',score:95,dimensions:[{ name:'创意',score:95,reason:'隔离依据' }] }
function check(label,value = true) { assert.ok(value,label); checks.push(label); console.log(`通过：${label}`) }
const upstream = http.createServer(async(req,res) => { for await (const chunk of req) {} calls++; await new Promise(done => setTimeout(done,200)); res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(response)) })
await new Promise(done => upstream.listen(0,'127.0.0.1',done))
const endpoint = `http://127.0.0.1:${upstream.address().port}`
configureGalleryRuntime({ dataDir:evidence,models:() => enabled ? [{ provider:'fixture',model:'vision',configKey:'local-fixture' }] : [],call:async(_rules,messages) => ({ json:await(await fetch(endpoint,{ method:'POST',body:JSON.stringify(messages) })).json() }) })
async function setting(patch) { rules = await service.saveAuditSettings(admin,{ ...(await service.getAuditSettings(org)),...patch }); return rules }
async function doc(title,color = '#ef482b') { const png = await sharp({ create:{ width:64,height:64,channels:3,background:color } }).png().toBuffer(), id = `doc_${suffix}_${++number}`; await query("INSERT INTO user_documents(id,organization_id,owner_user_id,document_type,title,data) VALUES($1,$2,$3,'project',$4,$5)",[id,org,student.id,title,JSON.stringify({ id,finalVersionId:'f',versions:[{ id:'f',imageUrl:`data:image/png;base64,${png.toString('base64')}` }] })]); return { id,png } }
async function submit(value) { return service.submitOwnGalleryDocument(student,value.id,{ acceptPublication:true }) }
const jobFor = async value => (await query('SELECT * FROM gallery_jobs WHERE document_id=$1 ORDER BY created_at DESC LIMIT 1',[value.id])).rows[0]
async function workers() {
  const source = `import{configureGalleryRuntime}from'./server/gallery-engine.js';import{runGalleryWorkerOnce}from'./server/gallery-worker.js';import{closeDb}from'./server/db.js';configureGalleryRuntime({dataDir:process.env.FIXTURE_DATA,models:()=>[{provider:'fixture',model:'vision',configKey:'local-fixture'}],call:async(r,m)=>({json:await(await fetch(process.env.FIXTURE_ENDPOINT,{method:'POST',body:JSON.stringify(m)})).json()})});try{await runGalleryWorkerOnce()}finally{await closeDb()}`
  const children = Array.from({ length:2 },() => spawn(process.execPath,['--input-type=module','-e',source],{ env:{ ...process.env,FIXTURE_DATA:evidence,FIXTURE_ENDPOINT:endpoint },stdio:['ignore','pipe','pipe'] }))
  for (const child of children) child.stderr.on('data',chunk => console.error(String(chunk)))
  const results = await Promise.all(children.map(child => once(child,'exit'))); assert.ok(results.every(([code]) => code === 0))
}
let roleCreated = false; const dbRole = `gallery_guard_${suffix}`
try {
  await query(await readFile('server/gallery-schema.sql','utf8'))
  for (const value of ['错误预算','Infinity','-1']) { process.env.GALLERY_DAILY_BUDGET_CNY = value; assert.equal(service.platformBudget(),0) }
  process.env.GALLERY_DAILY_BUDGET_CNY = '20'; check('非法平台预算按0处理，不能绕过付费限制')
  await query('INSERT INTO organizations(id,code,name) VALUES($1,$1,$1)',[org])
  for (const [id,role] of [[adminId,'admin'],[studentId,'student'],[otherId,'student']]) await query('INSERT INTO users(id,organization_id,account,password_hash,display_name,role) VALUES($1,$2,$1,$3,$1,$4)',[id,org,'isolated-disabled-login',role])
  await query("INSERT INTO admin_scopes(id,admin_user_id,organization_id,scope_type) VALUES($1,$2,$3,'organization')",[`scope_${suffix}`,adminId,org])
  await service.setGalleryConsent(admin,studentId,{ granted:true,evidence:'学校授权隔离验证' })
  await query("INSERT INTO gallery_model_checks(organization_id,provider,model,config_key) VALUES($1,'fixture','vision','local-fixture')",[org])
  await setting({ ...galleryDefaultRules,aiAudit:true,autoPublish:true,autoSelect:false,provider:'fixture',model:'vision',dailyLimit:1,dailyBudget:0.01,requestCostCeiling:0.01 })
  for (const patch of [{ qualityThreshold:-1 },{ qualityThreshold:1.5 },{ qualityThreshold:101 },{ customAudit:true,auditRequirements:'' },{ auditRequirements:'字'.repeat(2001) },{ aiAudit:'true' }]) await assert.rejects(service.saveAuditSettings(admin,{ ...rules,...patch }),error => error.statusCode === 400)
  check('负数、小数、越界、空要求、超长文字和错误开关类型被拒绝')
  const a = await doc('并发作品甲'), b = await doc('并发作品乙','#28c68b'); await submit(a); await submit(b)
  await workers(); await runGalleryWorkerOnce()
  const usage = await service.galleryUsage(admin)
  check('两个真实进程并发领取任务只调用一次，机构额度原子限制',calls === 1 && usage.calls === 1 && usage.reservedCost === 0.01 && [await jobFor(a),await jobFor(b)].some(job => job.state === 'waiting_budget'))
  await query("UPDATE gallery_daily_usage SET day=day-1 WHERE organization_id=$1",[org]); await query("UPDATE gallery_jobs SET updated_at=now()-interval '2 minutes' WHERE organization_id=$1 AND state='waiting_budget'",[org]); await runGalleryWorkerOnce(); check('跨自然日额度恢复后继续处理未发请求的任务',calls === 2)
  const uncertain = await doc('收费结果不明','#b148cf'), uncertainSub = await submit(uncertain), uncertainJob = await jobFor(uncertain)
  await query("UPDATE gallery_jobs SET state='running',request_sent=TRUE,lease_until=now()-interval '1 minute' WHERE id=$1",[uncertainJob.id]); const beforeUnknown = calls; await runGalleryWorkerOnce()
  check('租约过期且请求已发出时转人工，不重复计费',calls === beforeUnknown && (await jobFor(uncertain)).state === 'error' && (await service.accessibleSubmission(student,uncertainSub.id)).review_state === 'review')
  const unsent = await doc('未发请求的中断任务','#48a5cf'); await submit(unsent); const unsentJob = await jobFor(unsent)
  await query("UPDATE gallery_jobs SET state='running',request_sent=FALSE,lease_until=now()-interval '1 minute' WHERE id=$1",[unsentJob.id]); await query("DELETE FROM gallery_daily_usage WHERE organization_id=$1 AND day=(now() AT TIME ZONE 'Asia/Shanghai')::date",[org]); await runGalleryWorkerOnce(); check('请求尚未发出的过期租约可恢复处理',(await jobFor(unsent)).state === 'done' && calls === beforeUnknown+1)
  await setting({ dailyLimit:100,dailyBudget:10,duplicateCheck:true })
  const similar = await doc('近似图片','#cfa548'); const similarSub = await submit(similar), beforeSimilar = calls; await runGalleryWorkerOnce()
  check('近似检查开启后疑似相似只转人工并节省调用',calls === beforeSimilar && (await service.accessibleSubmission(student,similarSub.id)).review_state === 'review')
  await setting({ duplicateCheck:false })
  const different = await doc('近似检查关闭','#cfa549'); await submit(different); await runGalleryWorkerOnce(); check('近似检查关闭后不同图片继续审核',calls === beforeSimilar+1)
  const stale = await doc('待审旧标题','#347894'); const staleSub = await submit(stale); await query("UPDATE user_documents SET title='审核期间修改后的标题',version=version+1 WHERE id=$1",[stale.id]); const beforeStale = calls; await runGalleryWorkerOnce(); check('审核前修改来源会阻止旧任务调用和公开',calls === beforeStale && !(await service.accessibleSubmission(student,staleSub.id)).published_at)
  const disabled = await doc('停用模型前排队','#a0b0c0'); await submit(disabled); enabled = false; await runGalleryWorkerOnce(); check('模型停用后旧排队任务不再发起调用',calls === beforeStale && (await jobFor(disabled)).state === 'error'); enabled = true
  const foreignAsset = await createOwnAsset(other,{ originalName:'测试.png',mimeType:'image/png',base64:a.png.toString('base64') },evidence)
  const foreign = await doc('不能挪用他人私有资产'); await query('UPDATE user_documents SET data=jsonb_set(data,$2,$3::jsonb) WHERE id=$1',[foreign.id,'{versions,0,imageUrl}',JSON.stringify(`/api/assets/${foreignAsset.id}`)])
  await assert.rejects(submit(foreign),error => error.statusCode === 403); check('同机构其他学生的私有图片也不能借地址投稿')
  await query(`CREATE ROLE ${dbRole} NOLOGIN`); roleCreated = true; await query(`GRANT SELECT ON user_documents TO ${dbRole}`)
  await withTransaction(async client => { await client.query(`SET LOCAL ROLE ${dbRole}`); await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.user_role','student',true),set_config('app.organization_id',$2,true)",[otherId,org]); const rows = await client.query('SELECT id FROM user_documents WHERE id=$1',[a.id]); check('非超级用户实际执行RLS时也不能读取已上架作品的原文档',rows.rowCount === 0) })
  await writeFile(join(evidence,'results.json'),JSON.stringify({ checks,model:'隔离HTTP夹具；未进行真实AI调用' },null,2)); console.log(`补充隔离验收 ${checks.length} 项通过；证据：${evidence}`)
} finally { if (roleCreated) { await query(`REVOKE SELECT ON user_documents FROM ${dbRole}`); await query(`DROP ROLE ${dbRole}`) }; upstream.closeAllConnections(); await new Promise(done => upstream.close(done)); await closeDb() }
