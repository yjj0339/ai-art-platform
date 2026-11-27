import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { closeDb, isDatabaseConfigured, withTransaction } from '../server/db.js'
import { hashPassword } from '../server/auth.js'

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
  throw new Error('缺少 DATABASE_URL。请先完成数据库配置。')
}

const organizationCode = String(process.env.DEFAULT_ORGANIZATION_CODE || '').trim()
const organizationName = String(process.env.DEFAULT_ORGANIZATION_NAME || '').trim()
const campusCode = String(process.env.DEFAULT_CAMPUS_CODE || '').trim()
const campusName = String(process.env.DEFAULT_CAMPUS_NAME || '').trim()
const account = String(process.env.BOOTSTRAP_ADMIN_ACCOUNT || '').trim()
const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '')
const displayName = String(process.env.BOOTSTRAP_ADMIN_NAME || '平台管理员').trim()
const adminScope = process.env.BOOTSTRAP_ADMIN_SCOPE === 'campus' ? 'campus' : 'organization'

if (!organizationCode || !organizationName || !campusCode || !campusName || !account || !password) {
  throw new Error('请在 server/.env 中填写 DEFAULT_* 和 BOOTSTRAP_ADMIN_* 的所有字段。')
}

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

try {
  await withTransaction(async (client) => {
    const organization = await client.query('SELECT id FROM organizations WHERE code = $1', [organizationCode])
    const organizationId = organization.rows[0]?.id || newId('org')
    if (!organization.rows[0]) {
      await client.query('INSERT INTO organizations (id, code, name) VALUES ($1, $2, $3)', [organizationId, organizationCode, organizationName])
    }

    const campus = await client.query('SELECT id FROM campuses WHERE organization_id = $1 AND code = $2', [organizationId, campusCode])
    const campusId = campus.rows[0]?.id || newId('camp')
    if (!campus.rows[0]) {
      await client.query('INSERT INTO campuses (id, organization_id, code, name) VALUES ($1, $2, $3, $4)', [campusId, organizationId, campusCode, campusName])
    }

    const existing = await client.query('SELECT id FROM users WHERE organization_id = $1 AND account = $2', [organizationId, account])
    if (existing.rows[0]) {
      console.log('管理员账号已存在，未覆盖原密码。')
      return
    }
    const adminId = newId('usr')
    await client.query(
      `INSERT INTO users (id, organization_id, campus_id, account, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'admin')`,
      [adminId, organizationId, adminScope === 'campus' ? campusId : null, account, await hashPassword(password), displayName],
    )
    await client.query(
      `INSERT INTO admin_scopes (id, admin_user_id, organization_id, campus_id, scope_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId('scope'), adminId, organizationId, adminScope === 'campus' ? campusId : null, adminScope],
    )
    console.log('首个管理员账号已创建。请妥善保存密码，并在首次登录后通过正式后台修改。')
  })
} finally {
  await closeDb()
}
