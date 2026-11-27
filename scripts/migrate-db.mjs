import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDb, isDatabaseConfigured, closeDb } from '../server/db.js'

function loadLocalEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), 'server', '.env'), 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [key, ...rest] = trimmed.split('=')
    if (!process.env[key]) process.env[key] = rest.join('=').trim()
    }
  } catch {}
}

loadLocalEnv()

if (!isDatabaseConfigured()) {
  throw new Error('缺少 DATABASE_URL。请先复制 server/.env.example 为 server/.env 并填写 PostgreSQL 连接地址。')
}

const sql = await readFile(resolve(process.cwd(), 'server', 'schema.sql'), 'utf8')
const gallerySql = await readFile(resolve(process.cwd(), 'server', 'gallery-schema.sql'), 'utf8')
const creditSql = await readFile(resolve(process.cwd(), 'server', 'credit-schema.sql'), 'utf8')
const agentSql = await readFile(resolve(process.cwd(), 'server', 'agent-schema.sql'), 'utf8')
const riskSql = await readFile(resolve(process.cwd(), 'server', 'risk-schema.sql'), 'utf8')
const opsSql = await readFile(resolve(process.cwd(), 'server', 'ops-schema.sql'), 'utf8')
try {
  const client = await getDb().connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(gallerySql)
    await client.query(creditSql)
    await client.query(agentSql)
    await client.query(riskSql)
    await client.query(opsSql)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
  console.log('数据库结构已建立或已更新。')
} finally {
  await closeDb()
}
