import { readFileSync } from 'node:fs'
for (const line of readFileSync('server/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { getDb, closeDb } = await import('../server/db.js')
const db = await getDb()
const p = await db.query('SELECT code, label, credits, ability, provider, model, daily_free FROM credit_prices ORDER BY sort_order')
console.table(p.rows)
const u = await db.query('SELECT COUNT(*) AS c FROM credit_usage_daily')
console.log('usage_daily rows:', u.rows[0].c)
const s = await db.query('SELECT COUNT(*) AS c FROM credit_settings')
console.log('credit_settings rows:', s.rows[0].c)
await closeDb()
