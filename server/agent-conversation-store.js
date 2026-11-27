/* 智能体会话与消息：严格按 owner_user_id 隔离，所有查询都带本人条件，不提供按 ID 读他人数据的入口。 */
import { randomBytes } from 'node:crypto'
import { query } from './db.js'
import { ensureAgentSchema } from './agent-skill-store.js'

const MAX_CONVERSATIONS_LISTED = 60
const MAX_MESSAGES_LOADED = 200

function fail(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function requireUser(user) {
  if (!user?.id || !user?.organization?.id) throw fail('请先登录。', 401)
}

function toConversation(row) {
  return {
    id: row.id,
    title: row.title || '新的对话',
    skillSlug: row.skill_slug || '',
    messageCount: row.message_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content || '',
    parts: Array.isArray(row.parts) ? row.parts : [],
    status: row.status,
    createdAt: row.created_at,
  }
}

export async function listConversations(user) {
  requireUser(user)
  await ensureAgentSchema()
  const result = await query(
    `SELECT * FROM agent_conversations WHERE owner_user_id = $1 AND organization_id = $2 AND deleted_at IS NULL
     ORDER BY updated_at DESC LIMIT ${MAX_CONVERSATIONS_LISTED}`,
    [user.id, user.organization.id],
  )
  return result.rows.map(toConversation)
}

export async function getOwnConversation(user, id) {
  requireUser(user)
  await ensureAgentSchema()
  const result = await query(
    'SELECT * FROM agent_conversations WHERE id = $1 AND owner_user_id = $2 AND organization_id = $3 AND deleted_at IS NULL',
    [String(id || ''), user.id, user.organization.id],
  )
  if (!result.rows[0]) throw fail('对话不存在或已删除', 404)
  return toConversation(result.rows[0])
}

export async function createConversation(user, { title = '', skillSlug = '' } = {}) {
  requireUser(user)
  await ensureAgentSchema()
  const id = newId('aconv')
  const result = await query(
    `INSERT INTO agent_conversations (id, organization_id, owner_user_id, title, skill_slug)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, user.organization.id, user.id, String(title || '').slice(0, 60), String(skillSlug || '').slice(0, 64)],
  )
  return toConversation(result.rows[0])
}

export async function renameConversation(user, id, title) {
  const conversation = await getOwnConversation(user, id)
  const next = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!next) throw fail('标题不能为空')
  await query('UPDATE agent_conversations SET title = $2, updated_at = now() WHERE id = $1 AND owner_user_id = $3', [conversation.id, next, user.id])
  return { ...conversation, title: next }
}

export async function deleteConversation(user, id) {
  const conversation = await getOwnConversation(user, id)
  await query('UPDATE agent_conversations SET deleted_at = now() WHERE id = $1 AND owner_user_id = $2', [conversation.id, user.id])
  return { id: conversation.id }
}

export async function listMessages(user, conversationId, { limit = MAX_MESSAGES_LOADED } = {}) {
  const conversation = await getOwnConversation(user, conversationId)
  const result = await query(
    `SELECT * FROM (
       SELECT * FROM agent_messages WHERE conversation_id = $1 AND owner_user_id = $2
       ORDER BY created_at DESC LIMIT $3
     ) recent ORDER BY created_at ASC`,
    [conversation.id, user.id, Math.max(1, Math.min(MAX_MESSAGES_LOADED, Number(limit) || MAX_MESSAGES_LOADED))],
  )
  return result.rows.map(toMessage)
}

/** 今天本人发出的消息条数（用于每日条数上限，控制 AI 费用）。 */
export async function countUserMessagesToday(user) {
  requireUser(user)
  await ensureAgentSchema()
  const result = await query(
    `SELECT count(*)::int AS total FROM agent_messages
     WHERE owner_user_id = $1 AND organization_id = $2 AND role = 'user' AND created_at >= date_trunc('day', now())`,
    [user.id, user.organization.id],
  )
  return result.rows[0]?.total || 0
}

export async function appendMessage(user, conversationId, message = {}) {
  requireUser(user)
  const id = message.id || newId('amsg')
  const role = message.role === 'assistant' ? 'assistant' : 'user'
  const status = ['done', 'error', 'stopped'].includes(message.status) ? message.status : 'done'
  await query(
    `INSERT INTO agent_messages (id, conversation_id, organization_id, owner_user_id, role, content, parts, status, provider, model, usage)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb)`,
    [id, conversationId, user.organization.id, user.id, role, String(message.content || '').slice(0, 40000),
      JSON.stringify(Array.isArray(message.parts) ? message.parts : []), status,
      String(message.provider || '').slice(0, 80), String(message.model || '').slice(0, 120), JSON.stringify(message.usage || {})],
  )
  await query(
    `UPDATE agent_conversations SET message_count = message_count + 1, updated_at = now(),
       title = CASE WHEN title = '' AND $3 = 'user' THEN $4 ELSE title END
     WHERE id = $1 AND owner_user_id = $2`,
    [conversationId, user.id, role, String(message.content || '').replace(/\s+/g, ' ').trim().slice(0, 24)],
  )
  return id
}
