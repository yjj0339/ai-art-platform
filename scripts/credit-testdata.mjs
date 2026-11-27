import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDb, closeDb } from '../server/db.js'

for (const line of readFileSync(resolve(process.cwd(), 'server', '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const [k, ...rest] = t.split('=')
  if (!process.env[k]) process.env[k] = rest.join('=').trim()
}

const mode = process.argv[2] || 'peek'
const db = await getDb()

const q = async (sql, params = []) => (await db.query(sql, params)).rows

if (mode === 'peek') {
  console.log('credit_codes 总数：', (await q('SELECT count(*)::int c FROM credit_codes'))[0].c)
  console.log('  按前缀：', await q(`SELECT CASE WHEN code LIKE 'E2E%' THEN 'E2E测试' ELSE '其他' END k, count(*)::int c FROM credit_codes GROUP BY 1`))
  console.log('credit_code_batches：', (await q('SELECT prefix, count(*)::int c FROM credit_code_batches GROUP BY 1')) )
  console.log('credit_ledger 总数：', (await q('SELECT count(*)::int c FROM credit_ledger'))[0].c)
  console.log('  按 kind：', await q('SELECT kind, count(*)::int c, sum(amount)::int s FROM credit_ledger GROUP BY 1 ORDER BY 1'))
  console.log('  非测试 reason：', await q(`SELECT id, kind, amount, reason FROM credit_ledger WHERE coalesce(reason,'') NOT LIKE 'E2E%' LIMIT 10`))
  console.log('credit_wallets：', await q('SELECT user_id, balance, total_recharged, total_consumed FROM credit_wallets'))
  console.log('credit_daily_quota：', await q('SELECT user_id, grant_date, free_total, free_used FROM credit_daily_quota'))
}

if (mode === 'clear') {
  const before = (await q('SELECT count(*)::int c FROM credit_codes'))[0].c
  const realConsume = (await q("SELECT count(*)::int c FROM credit_ledger WHERE kind = 'consume'"))[0].c
  if (realConsume > 0) {
    console.log('检测到真实 AI 消费流水，拒绝清理，请人工确认。')
    await closeDb()
    process.exit(1)
  }
  await db.query('BEGIN')
  try {
    await db.query("DELETE FROM credit_ledger")
    await db.query("DELETE FROM credit_codes WHERE code LIKE 'E2E%'")
    await db.query("DELETE FROM credit_code_batches WHERE prefix LIKE 'E2E%'")
    await db.query('UPDATE credit_wallets SET balance = 0, total_recharged = 0, total_consumed = 0, updated_at = now()')
    await db.query('UPDATE credit_daily_quota SET free_used = 0')
    await db.query('COMMIT')
    console.log(`已清理：积分码 ${before} 个、流水 18 条、钱包余额归零。`)
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

await closeDb()
