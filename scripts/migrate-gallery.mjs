// 审核模块受控增量迁移：先备份受影响记录和访问策略，再验证旧字段未变化。
// 默认只备份并检查；--apply 执行迁移。备份目录在 Git 忽略范围内。
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { getDb, closeDb } from '../server/db.js'

try {
  for (const line of (await readFile('server/.env','utf8')).split(/\r?\n/)) {
    const match = line.match(/^(DATABASE_URL|DATABASE_SSL)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g,'')
  }
} catch (error) { if (!process.env.DATABASE_URL) throw error }
const directory = resolve('backups','content-audit',new Date().toISOString().replace(/[:.]/g,'-'))
const quote = value => `"${String(value).replaceAll('"','""')}"`
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const client = await getDb().connect()
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  await client.query("SELECT pg_advisory_xact_lock(hashtext('gallery-migration'))")
  const policy = (await client.query("SELECT policyname,cmd,qual,with_check,permissive,roles::text[] AS roles FROM pg_policies WHERE schemaname='public' AND tablename='user_documents'")).rows
  const triggers = (await client.query("SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='user_documents' AND t.tgname='gallery_final_save'")).rows
  const functions = (await client.query("SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('gallery_record_final_save','gallery_source_content')")).rows
  const tables = {}
  for (const table of ['gallery_audit_settings','gallery_submissions','gallery_consents','gallery_jobs','gallery_daily_usage','gallery_events']) {
    if (!(await client.query('SELECT to_regclass($1) AS name',[`public.${table}`])).rows[0].name) continue
    const columns = (await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',['public',table])).rows.map(row => row.column_name)
    const rows = (await client.query(`SELECT row_to_json(record) AS data FROM (SELECT ${columns.map(quote).join(',')} FROM public.${quote(table)}) record`)).rows.map(row => row.data).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    tables[table] = { columns,rows,hash:hash(rows) }
  }
  await mkdir(directory,{ recursive:true })
  await writeFile(join(directory,'审核迁移前备份.json'),JSON.stringify({ time:new Date().toISOString(),tables,policy,triggers,functions },null,2))
  await writeFile(join(directory,'gallery-schema.sql'),await readFile('server/gallery-schema.sql','utf8'))
  let rollback = 'BEGIN;\nDROP TRIGGER IF EXISTS gallery_final_save ON public.user_documents;\nDROP POLICY IF EXISTS user_documents_select_policy ON public.user_documents;\n'
  const original = policy.find(row => row.policyname === 'user_documents_select_policy')
  if (original) rollback += `CREATE POLICY user_documents_select_policy ON public.user_documents AS ${original.permissive} FOR ${original.cmd} TO ${original.roles.map(quote).join(',')} USING (${original.qual});\n`
  for (const fn of functions) rollback += `${fn.definition};\n`
  for (const trigger of triggers) rollback += `${trigger.definition};\n`
  rollback += 'COMMIT;\n-- 保留新增字段、任务和授权记录；不删除任何业务数据。\n'
  await writeFile(join(directory,'恢复原访问策略.sql'),rollback)
  if (process.argv.includes('--apply')) {
    const oldPublished = tables.gallery_submissions?.rows.filter(row => row.automatic_review_status === 'passed' && row.manual_review_status === 'approved' && row.published_at && !row.published_snapshot) || []
    if (oldPublished.length) throw new Error(`存在 ${oldPublished.length} 件没有审核快照的历史已发布作品，需人工核对后再迁移。已备份，未执行结构变更。`)
    await client.query(await readFile('server/gallery-schema.sql','utf8'))
    for (const [table,before] of Object.entries(tables)) {
      const rows = (await client.query(`SELECT row_to_json(record) AS data FROM (SELECT ${before.columns.map(quote).join(',')} FROM public.${quote(table)}) record`)).rows.map(row => row.data).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      if (hash(rows) !== before.hash) throw new Error(`${table} 原字段发生变化，事务已中止，请检查迁移。`)
    }
  }
  await client.query('COMMIT')
  console.log(`${process.argv.includes('--apply') ? '增量迁移通过，原有记录全部保持一致' : '迁移前备份与检查完成，尚未修改结构'}。备份位置：${directory}`)
  await writeFile(join(directory,'验证结果.json'),JSON.stringify({ applied:process.argv.includes('--apply'),unchangedTables:Object.keys(tables),submissionCount:tables.gallery_submissions?.rows.length || 0 },null,2))
} catch (error) { await client.query('ROLLBACK'); console.error(error.message); process.exitCode = 1 }
finally { client.release(); await closeDb() }
