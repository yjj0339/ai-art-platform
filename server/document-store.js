import { randomBytes } from 'node:crypto'
import { queryAsUser, withUserContext } from './db.js'
import { logAudit } from './auth.js'

function newId() {
  return `doc_${randomBytes(18).toString('base64url')}`
}

function normalizeType(value) {
  const type = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(type)) {
    const error = new Error('文档类型仅允许小写字母、数字、下划线和中横线。')
    error.statusCode = 400
    throw error
  }
  return type
}

function toDocument(row) {
  return {
    id: row.id,
    type: row.document_type,
    resourceKey: row.resource_key || '',
    title: row.title,
    data: row.data,
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listOwnDocuments(user, type) {
  const clauses = ['organization_id = $1', 'owner_user_id = $2', 'deleted_at IS NULL']
  const values = [user.organization.id, user.id]
  if (type) {
    values.push(normalizeType(type))
    clauses.push(`document_type = $${values.length}`)
  }
  const result = await queryAsUser(user,
    `SELECT id, document_type, resource_key, title, data, version, created_at, updated_at
     FROM user_documents WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC`,
    values,
  )
  return result.rows.map(toDocument)
}

export async function createOwnDocument(user, payload = {}) {
  if (user.role !== 'student') {
    const error = new Error('只有小画家账号可以创建个人创作数据。')
    error.statusCode = 403
    throw error
  }
  const type = normalizeType(payload.type)
  const resourceKey = String(payload.resourceKey || '').trim().slice(0, 160)
  const title = String(payload.title || '').trim().slice(0, 160)
  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : {}
  const id = newId()
  let result
  try {
    result = await queryAsUser(user,
      `INSERT INTO user_documents (id, organization_id, campus_id, owner_user_id, document_type, resource_key, title, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, document_type, resource_key, title, data, version, created_at, updated_at`,
      [id, user.organization.id, user.campus?.id || null, user.id, type, resourceKey, title, JSON.stringify(data)],
    )
  } catch (error) {
    // 同一份数据重复提交（前端本地丢了文档编号、或两次保存抢跑）时，
    // (org, owner, type, resource_key) 已经有行。这里改成更新既有行，
    // 不能把唯一键冲突直接抛回前端——那会把学生刚写的内容丢掉。
    if (error?.code !== '23505' || !resourceKey) throw error
    result = await queryAsUser(user,
      `UPDATE user_documents
       SET title = $1, data = $2::jsonb, version = version + 1, updated_at = now()
       WHERE organization_id = $3 AND owner_user_id = $4 AND document_type = $5
         AND resource_key = $6 AND deleted_at IS NULL
       RETURNING id, document_type, resource_key, title, data, version, created_at, updated_at`,
      [title, JSON.stringify(data), user.organization.id, user.id, type, resourceKey],
    )
    if (!result.rows[0]) {
      // 极端情况：冲突来自其它唯一约束，按原样报错，不要静默成功。
      const conflict = new Error('这份数据已存在但无法更新，请刷新页面后重试。')
      conflict.statusCode = 409
      throw conflict
    }
  }
  await logAudit(user.id, user.organization.id, 'document.create', type, result.rows[0].id, {})
  return toDocument(result.rows[0])
}

export async function updateOwnDocument(user, id, payload = {}) {
  if (user.role !== 'student') {
    const error = new Error('代管账号只能查看小画家数据，不能修改。')
    error.statusCode = 403
    throw error
  }
  const title = payload.title === undefined ? undefined : String(payload.title || '').trim().slice(0, 160)
  const data = payload.data === undefined ? undefined : payload.data
  if (data !== undefined && (!data || typeof data !== 'object' || Array.isArray(data))) {
    const error = new Error('文档数据必须是对象。')
    error.statusCode = 400
    throw error
  }
  const expectedVersion = payload.version === undefined ? null : Number(payload.version)
  const result = await queryAsUser(user,
    `UPDATE user_documents
     SET title = COALESCE($1, title), data = COALESCE($2::jsonb, data), version = version + 1, updated_at = now()
     WHERE id = $3 AND organization_id = $4 AND owner_user_id = $5 AND deleted_at IS NULL
       AND ($6::integer IS NULL OR version = $6)
     RETURNING id, document_type, resource_key, title, data, version, created_at, updated_at`,
    [title, data === undefined ? null : JSON.stringify(data), id, user.organization.id, user.id, Number.isInteger(expectedVersion) ? expectedVersion : null],
  )
  if (!result.rows[0]) {
    const error = new Error('未找到该数据，或当前账号没有权限。')
    error.statusCode = 404
    throw error
  }
  await logAudit(user.id, user.organization.id, 'document.update', result.rows[0].document_type, id, {})
  return toDocument(result.rows[0])
}

export async function deleteOwnDocument(user, id) {
  if (user.role !== 'student') {
    const error = new Error('代管账号只能查看小画家数据，不能删除。')
    error.statusCode = 403
    throw error
  }
  const result = await queryAsUser(user,
    `UPDATE user_documents SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND organization_id = $2 AND owner_user_id = $3 AND deleted_at IS NULL
     RETURNING document_type`,
    [id, user.organization.id, user.id],
  )
  if (!result.rows[0]) {
    const error = new Error('未找到该数据，或当前账号没有权限。')
    error.statusCode = 404
    throw error
  }
  await logAudit(user.id, user.organization.id, 'document.delete', result.rows[0].document_type, id, {})
}

export async function getOwnDocument(user, id) {
  const result = await queryAsUser(user,
    `SELECT id, document_type, resource_key, title, data, version, created_at, updated_at
     FROM user_documents
     WHERE id = $1 AND organization_id = $2 AND owner_user_id = $3 AND deleted_at IS NULL
     LIMIT 1`,
    [id, user.organization.id, user.id],
  )
  if (!result.rows[0]) {
    const error = new Error('未找到该数据，或当前账号没有权限。')
    error.statusCode = 404
    throw error
  }
  return toDocument(result.rows[0])
}

function studentPayload(row) {
  return {
    id: row.id,
    name: row.display_name,
    avatar: row.avatar || '',
    className: row.class_name || '',
    campus: row.campus_id ? { id: row.campus_id, code: row.campus_code, name: row.campus_name } : null,
  }
}

export async function listAccessibleStudents(user) {
  return withUserContext(user, async (client) => {
    const result = await client.query(
      `SELECT DISTINCT u.id, u.display_name, u.avatar, u.class_name, u.campus_id, c.code AS campus_code, c.name AS campus_name
       FROM users u
       LEFT JOIN campuses c ON c.id = u.campus_id
       WHERE u.organization_id = $1 AND u.role = 'student' AND u.status = 'active'
         AND app_can_read_student(u.id, u.organization_id, u.campus_id)
       ORDER BY u.display_name`,
      [user.organization.id],
    )
    return result.rows.map(studentPayload)
  })
}

async function assertAccessibleStudent(client, user, studentId) {
  const result = await client.query(
    `SELECT u.id FROM users u
     WHERE u.id = $1 AND u.organization_id = $2 AND u.role = 'student'
       AND app_can_read_student(u.id, u.organization_id, u.campus_id)
     LIMIT 1`,
    [studentId, user.organization.id],
  )
  if (!result.rows[0]) {
    const error = new Error('未找到该小画家，或当前账号没有权限。')
    error.statusCode = 404
    throw error
  }
}

export async function listStudentDocuments(user, studentId, type) {
  return withUserContext(user, async (client) => {
    await assertAccessibleStudent(client, user, studentId)
    const values = [user.organization.id, studentId]
    const clauses = ['organization_id = $1', 'owner_user_id = $2', 'deleted_at IS NULL']
    if (type) {
      values.push(normalizeType(type))
      clauses.push(`document_type = $${values.length}`)
    }
    const result = await client.query(
      `SELECT id, document_type, resource_key, title, data, version, created_at, updated_at
       FROM user_documents WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC`,
      values,
    )
    return result.rows.map(toDocument)
  })
}

export async function getStudentDocument(user, studentId, documentId) {
  return withUserContext(user, async (client) => {
    await assertAccessibleStudent(client, user, studentId)
    const result = await client.query(
      `SELECT id, document_type, resource_key, title, data, version, created_at, updated_at
       FROM user_documents
       WHERE id = $1 AND organization_id = $2 AND owner_user_id = $3 AND deleted_at IS NULL
       LIMIT 1`,
      [documentId, user.organization.id, studentId],
    )
    if (!result.rows[0]) {
      const error = new Error('未找到该数据，或当前账号没有权限。')
      error.statusCode = 404
      throw error
    }
    return toDocument(result.rows[0])
  })
}
