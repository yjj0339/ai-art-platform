import { promisify } from 'node:util'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'

const scrypt = promisify(scryptCallback)
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'ai_art_session'
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14)

function authError(message = '请先登录。', statusCode = 401) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function hashToken(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      }),
  )
}

export function sessionCookie(value, maxAge = SESSION_TTL_DAYS * 24 * 60 * 60) {
  const parts = [`${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (process.env.SESSION_COOKIE_SECURE === 'true') parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie() {
  return sessionCookie('', 0)
}

export async function hashPassword(password) {
  const normalized = String(password || '')
  if (normalized.length < 8) throw authError('密码至少需要 8 位。', 400)
  const salt = randomBytes(16).toString('base64url')
  const derived = await scrypt(normalized, salt, 64)
  return `scrypt$${salt}$${Buffer.from(derived).toString('base64url')}`
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, salt, expected] = String(storedHash || '').split('$')
  if (algorithm !== 'scrypt' || !salt || !expected) return false
  const actual = Buffer.from(await scrypt(String(password || ''), salt, 64))
  const expectedBuffer = Buffer.from(expected, 'base64url')
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
}

function userPayload(row) {
  return {
    id: row.id,
    account: row.account,
    name: row.display_name,
    role: row.role,
    avatar: row.avatar || '',
    className: row.class_name || '',
    organization: { id: row.organization_id, code: row.organization_code, name: row.organization_name },
    campus: row.campus_id ? { id: row.campus_id, code: row.campus_code, name: row.campus_name } : null,
    permissions: row.permissions || {},
  }
}

const userSelect = `
  SELECT u.id, u.account, u.password_hash, u.display_name, u.role, u.avatar, u.class_name, u.permissions,
    o.id AS organization_id, o.code AS organization_code, o.name AS organization_name,
    c.id AS campus_id, c.code AS campus_code, c.name AS campus_name
  FROM users u
  JOIN organizations o ON o.id = u.organization_id
  LEFT JOIN campuses c ON c.id = u.campus_id
`

// 账号不存在时也做一次同样耗时的密码校验，避免通过"响应快慢"判断某个账号是否存在。
const DUMMY_PASSWORD_HASH = `scrypt$${'A'.repeat(22)}$${'A'.repeat(86)}`

/** options.beforeSession(user)：密码校验通过、创建会话之前调用（例如检查账号是否被暂停登录），抛错即拒绝登录。 */
export async function loginWithPassword(account, password, organizationCode, options = {}) {
  const normalizedAccount = String(account || '').trim()
  const normalizedOrganizationCode = String(
    organizationCode || process.env.LOGIN_DEFAULT_ORGANIZATION_CODE || process.env.DEFAULT_ORGANIZATION_CODE || '',
  ).trim()
  if (!normalizedAccount || !String(password || '')) throw authError('账号和密码不能为空。', 400)
  if (!normalizedOrganizationCode) throw authError('请输入机构代码。', 400)
  const result = await query(
    // 机构代码不分大小写：平板输入法常把首字母自动变大写（Demo-school），以前会被当成密码错误。
    // 新建机构时代码统一存小写；万一有只差大小写的老代码，优先完全一致的那个。
    `${userSelect} WHERE lower(u.account) = lower($1) AND lower(o.code) = lower($2) AND u.status = 'active' ORDER BY (o.code = $2) DESC LIMIT 1`,
    [normalizedAccount, normalizedOrganizationCode],
  )
  const row = result.rows[0]
  const passwordOk = await verifyPassword(password, row?.password_hash || DUMMY_PASSWORD_HASH)
  if (!row || !passwordOk) {
    throw authError('账号或密码错误。')
  }
  if (options.beforeSession) await options.beforeSession(userPayload(row))

  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await query(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [newId('ses'), row.id, hashToken(rawToken), expiresAt],
  )
  await logAudit(row.id, row.organization_id, 'auth.login', 'session', null, {})
  return { token: rawToken, user: userPayload(row) }
}

export async function getCurrentUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]
  if (!token) return null
  const result = await query(`${userSelect}
    JOIN sessions s ON s.user_id = u.id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'
    LIMIT 1`, [hashToken(token)])
  const row = result.rows[0]
  if (!row) return null
  await query('UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1', [hashToken(token)])
  return userPayload(row)
}

export async function requireUser(req) {
  const user = await getCurrentUser(req)
  if (!user) throw authError()
  return user
}

export function requireRole(user, allowedRoles) {
  if (!allowedRoles.includes(user.role)) throw authError('当前账号没有此操作权限。', 403)
}

export async function logoutRequest(req, user = null) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  if (user) await logAudit(user.id, user.organization.id, 'auth.logout', 'session', null, {})
}

export async function logAudit(actorUserId, organizationId, action, resourceType, resourceId, detail = {}) {
  await query(
    'INSERT INTO audit_logs (id, organization_id, actor_user_id, action, resource_type, resource_id, detail) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)',
    [newId('aud'), organizationId, actorUserId, action, resourceType, resourceId, JSON.stringify(detail)],
  )
}
