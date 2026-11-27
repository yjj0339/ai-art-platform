// 本地开发用：一键创建测试账号（已存在则跳过，不覆盖密码）。
// 用法：node scripts/seed-dev-accounts.mjs
// 正式环境（NODE_ENV=production）拒绝执行，避免把弱密码测试账号带上线。
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { closeDb, isDatabaseConfigured, withTransaction } from '../server/db.js'
import { hashPassword } from '../server/auth.js'

const DEV_ACCOUNTS = [
  { account: 'guanliyuan88', name: '测试管理员', role: 'admin', password: '123456789' },
  { account: 'jiangshi1', name: '测试讲师', role: 'teacher', password: '123456789' },
  { account: 'ceshi2', name: '测试用户二', role: 'student', password: '123456789' },
  { account: 'ceshi3', name: '测试用户三', role: 'student', password: '123456789' },
]

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
if (process.env.NODE_ENV === 'production') throw new Error('正式环境禁止创建测试账号。')
if (!isDatabaseConfigured()) throw new Error('缺少 DATABASE_URL。')

const organizationCode = String(process.env.DEFAULT_ORGANIZATION_CODE || '').trim()
const campusCode = String(process.env.DEFAULT_CAMPUS_CODE || '').trim()
const newId = (prefix) => `${prefix}_${randomBytes(18).toString('base64url')}`

try {
  await withTransaction(async (client) => {
    const org = (await client.query('SELECT id FROM organizations WHERE code = $1', [organizationCode])).rows[0]
    if (!org) throw new Error('机构不存在，请先运行 pnpm db:bootstrap-admin。')
    const campus = (await client.query('SELECT id FROM campuses WHERE organization_id = $1 AND code = $2', [org.id, campusCode])).rows[0]
    for (const item of DEV_ACCOUNTS) {
      const exists = await client.query('SELECT id FROM users WHERE organization_id = $1 AND lower(account) = lower($2)', [org.id, item.account])
      if (exists.rows[0]) { console.log(`跳过（已存在）：${item.account}`); continue }
      const id = newId('usr')
      await client.query(
        `INSERT INTO users (id, organization_id, campus_id, account, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, org.id, item.role === 'admin' ? null : campus?.id || null, item.account, await hashPassword(item.password), item.name, item.role],
      )
      if (item.role === 'admin') {
        await client.query(
          `INSERT INTO admin_scopes (id, admin_user_id, organization_id, campus_id, scope_type) VALUES ($1, $2, $3, NULL, 'organization')`,
          [newId('scope'), id, org.id],
        )
      }
      console.log(`已创建：${item.account}（${item.role}）`)
    }
  })
} finally {
  await closeDb()
}
