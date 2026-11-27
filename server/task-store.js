import { randomBytes } from 'node:crypto'
import { logAudit } from './auth.js'
import { queryAsUser } from './db.js'

function newId() {
  return `ait_${randomBytes(18).toString('base64url')}`
}

function notFound() {
  const error = new Error('未找到该任务，或当前账号没有权限。')
  error.statusCode = 404
  return error
}

function toTask(row) {
  return {
    id: row.id,
    taskType: row.task_type,
    provider: row.provider,
    status: row.status,
    result: row.result || {},
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createAiTask(user, payload = {}) {
  const providerTaskId = String(payload.providerTaskId || '').trim()
  if (!providerTaskId) throw new Error('供应商任务编号不能为空。')
  const id = newId()
  const result = await queryAsUser(user,
    `INSERT INTO ai_tasks (id, organization_id, campus_id, owner_user_id, task_type, provider, provider_task_id, status, result)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [id, user.organization.id, user.campus?.id || null, user.id, payload.taskType, payload.provider,
      providerTaskId, String(payload.status || 'queued').slice(0, 32), JSON.stringify(payload.result || {})],
  )
  await logAudit(user.id, user.organization.id, 'ai_task.create', payload.taskType, id, { provider: payload.provider })
  return toTask(result.rows[0])
}

export async function getOwnAiTask(user, taskId, taskType = '') {
  const values = [taskId, user.organization.id, user.id]
  const filters = ['id = $1', 'organization_id = $2', 'owner_user_id = $3']
  if (taskType) {
    values.push(taskType)
    filters.push(`task_type = $${values.length}`)
  }
  const result = await queryAsUser(user, `SELECT * FROM ai_tasks WHERE ${filters.join(' AND ')} LIMIT 1`, values)
  if (!result.rows[0]) throw notFound()
  return { ...toTask(result.rows[0]), providerTaskId: result.rows[0].provider_task_id }
}

/**
 * 原子地给本人的任务打一个时间戳标记，同一时刻只有一个请求能拿到（用于"只转存一次""只退款一次"）。
 * staleMs 为正数时，超过这个时长的旧标记视为失效（处理中途进程重启也不会卡死）；不传则标记永久有效。
 * 拿到返回最新任务，没拿到返回 null。
 */
export async function claimOwnAiTaskFlag(user, taskId, flag, staleMs = 0) {
  const key = String(flag || '')
  if (!/^[a-zA-Z]+$/.test(key)) throw new Error('任务标记名无效')
  const now = Date.now()
  const values = [key, now, taskId, user.organization.id, user.id]
  let freshness = 'NOT (result ? $1)'
  if (staleMs > 0) {
    values.push(now - staleMs)
    freshness = `(NOT (result ? $1) OR COALESCE(NULLIF(result->>$1, '')::bigint, 0) < $${values.length})`
  }
  const result = await queryAsUser(user,
    `UPDATE ai_tasks SET result = result || jsonb_build_object($1::text, $2::bigint), updated_at = now()
     WHERE id = $3 AND organization_id = $4 AND owner_user_id = $5 AND ${freshness}
     RETURNING *`,
    values,
  )
  return result.rows[0] ? toTask(result.rows[0]) : null
}

export async function updateOwnAiTask(user, taskId, patch = {}) {
  // 退款 / 关闭标记一旦写入，后续的进度更新不会把它们覆盖掉：并发轮询时一个慢请求晚到，
  // 也不会抹掉"已退款"让下一次轮询再退一遍；已关闭（失败收尾）的任务状态固定为 failed。
  const result = await queryAsUser(user,
    `UPDATE ai_tasks SET
       status = CASE WHEN result ? 'closedAt' THEN 'failed' ELSE $1 END,
       result = $2::jsonb || jsonb_strip_nulls(jsonb_build_object('closedAt', result->'closedAt', 'refundedAt', result->'refundedAt', 'refund', result->'refund')),
       error_message = CASE WHEN result ? 'closedAt' AND error_message <> '' THEN error_message ELSE $3 END,
       updated_at = now()
     WHERE id = $4 AND organization_id = $5 AND owner_user_id = $6
     RETURNING *`,
    [String(patch.status || 'queued').slice(0, 32), JSON.stringify(patch.result || {}),
      String(patch.errorMessage || '').slice(0, 1000), taskId, user.organization.id, user.id],
  )
  if (!result.rows[0]) throw notFound()
  return toTask(result.rows[0])
}
