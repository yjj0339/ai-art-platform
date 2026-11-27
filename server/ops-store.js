// 后台「异常管理」：记录服务器意外错误（5xx）和 AI 调用失败，管理员可以按时间、类型查看并标记已处理。
// 只记录排查需要的信息：请求方法、路径（不含查询参数）、状态码、错误摘要和代码位置；
// 不记录请求内容、密码、提示词原文；错误信息里像连接串、密钥的部分会先打码。
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { query } from './db.js'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(here, '..')
// 错误堆栈里项目目录可能以几种写法出现（反斜杠、正斜杠、file:// 地址），都换成「.」，不把服务器目录写进日志。
const projectRootForms = [...new Set([
  pathToFileURL(projectRoot).href.replace(/\/$/, ''),
  projectRoot,
  projectRoot.replace(/\\/g, '/'),
])].filter((form) => form.length > 3)
const RETENTION_DAYS = 90
const MAX_WRITES_PER_MINUTE = 60
const MERGE_WINDOW_MS = 10 * 60 * 1000

let schemaPromise = null
export function ensureOpsSchema() {
  if (!schemaPromise) {
    schemaPromise = query(readFileSync(join(here, 'ops-schema.sql'), 'utf8')).catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  return schemaPromise
}

/** 程序或数据库的意外错误（相对于代码里主动抛出、带友好提示的错误）。原文不返回给用户。 */
export function isUnexpectedError(error) {
  if (!error) return true
  if (error.statusCode) return false
  if (error.severity && /^[0-9A-Z]{5}$/.test(String(error.code || ''))) return true // PostgreSQL
  if (error.syscall || error.errno) return true // 文件、网络等系统错误
  if (error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError || error instanceof RangeError) return true
  return !/[一-龥]/.test(String(error.message || ''))
}

function sanitize(text, max) {
  let output = String(text || '')
    .replace(/(postgres(?:ql)?:\/\/)[^\s@/]+@/gi, '$1***@')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***')
    .replace(/\b(sk|ak|key|token|secret)[-_][A-Za-z0-9]{8,}/gi, '$1-***')
    .replace(/([?&](?:key|token|signature|secret|access_token)=)[^&\s]+/gi, '$1***')
  for (const form of projectRootForms) output = output.split(form).join('.')
  return output.slice(0, max)
}

function shortStack(error) {
  const lines = String(error?.stack || '').split('\n').slice(1, 7).map((line) => line.trim())
  return sanitize(lines.join('\n'), 1200)
}

let windowStart = 0
let windowWrites = 0
let lastPurge = 0
const recent = new Map()

/** 记录一条异常。永远不抛错：记录失败只打日志，不能影响正常请求。 */
export async function recordAppError({ req = null, error = null, status = 500, user = null, kind = 'server', path = '', message = '' } = {}) {
  try {
    const now = Date.now()
    if (now - windowStart > 60_000) { windowStart = now; windowWrites = 0 }
    if (windowWrites >= MAX_WRITES_PER_MINUTE) return
    windowWrites += 1
    const method = String(req?.method || '').slice(0, 10)
    const cleanPath = String(path || String(req?.url || '').split('?')[0]).slice(0, 200)
    const text = sanitize(message || (error ? `${error.name && error.name !== 'Error' ? `${error.name}: ` : ''}${error.message || error}` : ''), 600)
    const organizationId = user?.organization?.id || user?.organizationId || null
    // 同一个错误短时间内反复出现时合并成一条，计数加一，避免刷屏。
    const key = `${organizationId}|${kind}|${method}|${cleanPath}|${status}|${text}`
    const merged = recent.get(key)
    if (merged && now - merged.at < MERGE_WINDOW_MS) {
      await ensureOpsSchema()
      // 只合并到「还没处理」的那条：管理员已标记处理（或记录已被清理）后又出现，要新记一条，不能藏进已处理里
      const updated = await query('UPDATE app_error_logs SET repeat_count = repeat_count + 1, last_seen_at = now() WHERE id = $1 AND resolved_at IS NULL', [merged.id])
      if (updated?.rowCount) {
        merged.at = now
        return
      }
      recent.delete(key)
    }
    await ensureOpsSchema()
    const id =`err_${randomBytes(12).toString('base64url')}`
    await query(
      `INSERT INTO app_error_logs (id, organization_id, user_id, kind, method, path, status, message, code, stack)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, organizationId, user?.id || null, kind === 'ai' ? 'ai' : 'server', method, cleanPath, Number(status) || 500, text, String(error?.code || '').slice(0, 40), error ? shortStack(error) : ''],
    )
    recent.set(key, { id, at: now })
    if (recent.size > 500) recent.delete(recent.keys().next().value)
    if (now - lastPurge > 24 * 3600 * 1000) {
      lastPurge = now
      await query(`DELETE FROM app_error_logs WHERE created_at < now() - make_interval(days => ${RETENTION_DAYS})`)
    }
  } catch (recordError) {
    console.error('[ops] 异常记录写入失败：', recordError?.message || recordError)
  }
}

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function assertAdmin(user) {
  if (!user || user.role !== 'admin' || !user.organization?.id) throw fail('只有管理员可以查看异常记录。', 403)
  return user.organization.id
}

const KIND_LABELS = { server: '服务器错误', ai: 'AI 调用失败' }

function errorView(row) {
  return {
    id: row.id, kind: row.kind, kindLabel: KIND_LABELS[row.kind] || row.kind, method: row.method, path: row.path, status: row.status,
    message: row.message, code: row.code, stack: row.stack, repeatCount: row.repeat_count,
    user: row.user_id ? { id: row.user_id, account: row.account || '', name: row.display_name || '' } : null,
    createdAt: row.created_at, lastSeenAt: row.last_seen_at, resolvedAt: row.resolved_at, resolved: Boolean(row.resolved_at),
  }
}

/** 本机构的记录 + 未登录请求（没有机构）的记录。 */
export async function listAppErrors(user, params = {}) {
  const organizationId = assertAdmin(user)
  await ensureOpsSchema()
  const days = Math.min(90, Math.max(1, Math.round(Number(params.days) || 7)))
  const page = Math.max(1, Math.round(Number(params.page) || 1))
  const pageSize = Math.min(100, Math.max(5, Math.round(Number(params.pageSize) || 20)))
  const where = ['(e.organization_id = $1 OR e.organization_id IS NULL)', 'e.created_at > now() - make_interval(days => $2)']
  const values = [organizationId, days]
  if (KIND_LABELS[params.kind]) { values.push(params.kind); where.push(`e.kind = $${values.length}`) }
  if (params.status === 'open') where.push('e.resolved_at IS NULL')
  if (params.status === 'resolved') where.push('e.resolved_at IS NOT NULL')
  const keyword = String(params.keyword || '').trim().slice(0, 50)
  if (keyword) { values.push(`%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); where.push(`(e.path ILIKE $${values.length} OR e.message ILIKE $${values.length})`) }
  const whereSql = where.join(' AND ')
  const [rows, total, stats] = await Promise.all([
    query(
      `SELECT e.*, u.account, u.display_name FROM app_error_logs e LEFT JOIN users u ON u.id = e.user_id
       WHERE ${whereSql} ORDER BY e.last_seen_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      values,
    ),
    query(`SELECT count(*)::int AS n FROM app_error_logs e WHERE ${whereSql}`, values),
    query(
      `SELECT
         COALESCE(sum(repeat_count) FILTER (WHERE last_seen_at > now() - interval '1 day'), 0)::int AS day,
         count(*) FILTER (WHERE resolved_at IS NULL)::int AS open,
         count(*) FILTER (WHERE resolved_at IS NULL AND kind = 'ai')::int AS open_ai,
         count(*) FILTER (WHERE resolved_at IS NULL AND kind = 'server')::int AS open_server
       FROM app_error_logs WHERE (organization_id = $1 OR organization_id IS NULL) AND created_at > now() - interval '90 days'`,
      [organizationId],
    ),
  ])
  const s = stats.rows[0] || {}
  return {
    items: rows.rows.map(errorView), total: total.rows[0].n, page, pageSize,
    stats: { last24h: s.day || 0, open: s.open || 0, openAi: s.open_ai || 0, openServer: s.open_server || 0 },
  }
}

export async function resolveAppErrors(user, body = {}) {
  const organizationId = assertAdmin(user)
  await ensureOpsSchema()
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String).filter((id) => /^err_[A-Za-z0-9_-]{8,40}$/.test(id)))].slice(0, 500)
  if (!ids.length) throw fail('请先选择记录')
  const resolved = body.resolved !== false
  const result = await query(
    `UPDATE app_error_logs SET resolved_at = CASE WHEN $3 THEN now() ELSE NULL END, resolved_by_user_id = CASE WHEN $3 THEN $4 ELSE NULL END
     WHERE id = ANY($2::text[]) AND (organization_id = $1 OR organization_id IS NULL)`,
    [organizationId, ids, resolved, user.id],
  )
  return { updated: result.rowCount }
}

/* ---------------- 数据看板 ---------------- */

// 接口可用率：按小时统计 /api 请求数和 5xx 数（只在内存里，服务重启后重新计数）。
const startedAt = new Date().toISOString()
const hourBuckets = new Map()
export function trackRequest(req, status) {
  if (!String(req?.url || '').startsWith('/api/')) return
  const hour = Math.floor(Date.now() / 3600000)
  const bucket = hourBuckets.get(hour) || { total: 0, errors: 0 }
  bucket.total += 1
  if (Number(status) >= 500) bucket.errors += 1
  hourBuckets.set(hour, bucket)
  if (hourBuckets.size > 30) for (const key of hourBuckets.keys()) if (key < hour - 24) hourBuckets.delete(key)
}

function apiAvailability() {
  const hour = Math.floor(Date.now() / 3600000)
  let total = 0
  let errors = 0
  const trend = []
  for (let h = hour - 23; h <= hour; h += 1) {
    const bucket = hourBuckets.get(h) || { total: 0, errors: 0 }
    total += bucket.total
    errors += bucket.errors
    trend.push({ hour: new Date(h * 3600000).toISOString(), total: bucket.total, errors: bucket.errors })
  }
  return { total, errors, rate: total ? Math.round((1 - errors / total) * 10000) / 100 : 100, trend, since: startedAt }
}

const TASK_LABELS = { image: '出图', video: '视频', model3d: '3D 模型', report: '报告' }

/** 后台首页「数据看板」：今天的新增与活跃、积分、AI 调用、接口可用率、待处理异常。 */
export async function opsOverview(user) {
  const organizationId = assertAdmin(user)
  await ensureOpsSchema()
  const timezone = /^[A-Za-z_]+\/[A-Za-z_]+$/.test(String(process.env.APP_TIMEZONE || '')) ? process.env.APP_TIMEZONE : 'Asia/Shanghai'
  const startSql = `(date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`
  const safe = (promise) => promise.then((result) => result.rows).catch(() => null)
  const [users, active, credits, codes, tasks, errors] = await Promise.all([
    safe(query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at >= ${startSql})::int AS new_today,
        count(*) FILTER (WHERE role = 'student')::int AS creators, count(*) FILTER (WHERE status = 'disabled')::int AS disabled
      FROM users WHERE organization_id = $1`, [organizationId, timezone])),
    safe(query(`SELECT count(DISTINCT s.user_id)::int AS n FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE u.organization_id = $1 AND s.last_seen_at >= ${startSql}`, [organizationId, timezone])),
    safe(query(`SELECT COALESCE(sum(amount) FILTER (WHERE direction = 'in' AND kind IN ('recharge', 'redeem')), 0)::int AS recharged,
        COALESCE(sum(amount) FILTER (WHERE direction = 'out' AND kind = 'consume'), 0)::int AS consumed,
        count(DISTINCT user_id) FILTER (WHERE direction = 'out' AND kind = 'consume')::int AS payers
      FROM credit_ledger WHERE organization_id = $1 AND created_at >= ${startSql}`, [organizationId, timezone])),
    safe(query(`SELECT count(*)::int AS issued, COALESCE(sum(face_value), 0)::int AS face_value,
        count(*) FILTER (WHERE status = 'redeemed')::int AS redeemed
      FROM credit_codes WHERE organization_id = $1 AND status <> 'void' AND created_at >= ${startSql}`, [organizationId, timezone])),
    safe(query(`SELECT task_type, count(*)::int AS total, count(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM ai_tasks WHERE organization_id = $1 AND created_at >= ${startSql} GROUP BY task_type`, [organizationId, timezone])),
    safe(query(`SELECT count(*) FILTER (WHERE resolved_at IS NULL)::int AS open,
        COALESCE(sum(repeat_count) FILTER (WHERE kind = 'ai' AND last_seen_at >= ${startSql}), 0)::int AS ai_today,
        COALESCE(sum(repeat_count) FILTER (WHERE kind = 'server' AND last_seen_at >= ${startSql}), 0)::int AS server_today
      FROM app_error_logs WHERE (organization_id = $1 OR organization_id IS NULL) AND created_at > now() - interval '90 days'`, [organizationId, timezone])),
  ])
  const taskRows = tasks || []
  const aiTotal = taskRows.reduce((sum, row) => sum + row.total, 0)
  const aiFailed = taskRows.reduce((sum, row) => sum + row.failed, 0)
  const u = users?.[0] || null
  return {
    generatedAt: new Date().toISOString(), timezone,
    users: u ? { total: u.total, newToday: u.new_today, creators: u.creators, disabled: u.disabled, activeToday: active?.[0]?.n ?? null } : null,
    credits: credits ? { rechargedToday: credits[0].recharged, consumedToday: credits[0].consumed, payersToday: credits[0].payers } : null,
    codes: codes ? { issuedToday: codes[0].issued, faceValueToday: codes[0].face_value, redeemedToday: codes[0].redeemed } : null,
    ai: {
      totalToday: aiTotal, failedToday: aiFailed, successRate: aiTotal ? Math.round((1 - aiFailed / aiTotal) * 10000) / 100 : null,
      byType: taskRows.map((row) => ({ type: row.task_type, label: TASK_LABELS[row.task_type] || row.task_type, total: row.total, failed: row.failed })),
    },
    api: apiAvailability(),
    errors: errors ? { open: errors[0].open, aiToday: errors[0].ai_today, serverToday: errors[0].server_today } : null,
  }
}
