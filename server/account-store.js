import { randomBytes } from 'node:crypto'
import { hashPassword, logAudit } from './auth.js'
import { withTransaction, withUserContext } from './db.js'
import { normalizeAccount, requireValidAccount } from './account-rules.js'

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function httpError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizePermissions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([key, enabled]) => [String(key).slice(0, 80), Boolean(enabled)]))
}

async function adminAccess(client, admin) {
  const result = await client.query(
    `SELECT scope_type, campus_id FROM admin_scopes
     WHERE admin_user_id = $1 AND organization_id = $2`,
    [admin.id, admin.organization.id],
  )
  return {
    organizationWide: result.rows.some((row) => row.scope_type === 'organization'),
    campusIds: result.rows.filter((row) => row.scope_type === 'campus' && row.campus_id).map((row) => row.campus_id),
  }
}

function scopeClause(access, alias = 'u', startIndex = 2) {
  if (access.organizationWide) return { sql: '', values: [] }
  if (!access.campusIds.length) return { sql: ' AND FALSE', values: [] }
  return { sql: ` AND ${alias}.campus_id = ANY($${startIndex}::text[])`, values: [access.campusIds] }
}

async function assertCampusAccess(client, admin, campusId, { allowOrganization = false } = {}) {
  const access = await adminAccess(client, admin)
  if (!campusId && allowOrganization && access.organizationWide) return access
  if (!campusId) throw httpError('必须选择授权分部。', 400)
  const campus = await client.query(
    'SELECT id FROM campuses WHERE id = $1 AND organization_id = $2 AND status = \'active\'',
    [campusId, admin.organization.id],
  )
  if (!campus.rows[0] || (!access.organizationWide && !access.campusIds.includes(campusId))) {
    throw httpError('当前管理员无权管理该机构分部。', 403)
  }
  return access
}

async function assertAccountAccess(client, admin, accountId) {
  const access = await adminAccess(client, admin)
  const scope = scopeClause(access, 'u', 3)
  const result = await client.query(
    `SELECT u.* FROM users u
     WHERE u.id = $1 AND u.organization_id = $2${scope.sql}
     LIMIT 1`,
    [accountId, admin.organization.id, ...scope.values],
  )
  if (!result.rows[0]) throw httpError('未找到该账号，或当前管理员没有权限。', 404)
  return { account: result.rows[0], access }
}

function toAccount(row, relations = {}) {
  return {
    id: row.id,
    role: row.role,
    name: row.display_name,
    account: row.account,
    avatar: row.avatar || '',
    className: row.class_name || '',
    status: row.status === 'active' ? 'enabled' : 'disabled',
    organization: { id: row.organization_id, code: row.organization_code, name: row.organization_name },
    campus: row.campus_id ? { id: row.campus_id, code: row.campus_code, name: row.campus_name } : null,
    permissions: row.permissions || {},
    classIds: relations.classIds || [],
    groupIds: relations.groupIds || [],
    adminScopes: relations.adminScopes || [],
    documentCounts: relations.documentCounts || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listAccounts(admin, filters = {}) {
  return withUserContext(admin, async (client) => {
    const access = await adminAccess(client, admin)
    const values = [admin.organization.id]
    const clauses = ['u.organization_id = $1']
    if (!access.organizationWide) {
      if (!access.campusIds.length) return []
      values.push(access.campusIds)
      clauses.push(`u.campus_id = ANY($${values.length}::text[])`)
    }
    if (filters.role && ['student', 'teacher', 'admin'].includes(filters.role)) {
      values.push(filters.role)
      clauses.push(`u.role = $${values.length}`)
    }
    if (filters.status && ['active', 'disabled'].includes(filters.status)) {
      values.push(filters.status)
      clauses.push(`u.status = $${values.length}`)
    }
    if (filters.campusId) {
      if (!access.organizationWide && !access.campusIds.includes(filters.campusId)) throw httpError('当前管理员无权查看该机构分部。', 403)
      values.push(filters.campusId)
      clauses.push(`u.campus_id = $${values.length}`)
    }
    if (filters.keyword) {
      values.push(`%${String(filters.keyword).trim().slice(0, 80)}%`)
      clauses.push(`(u.display_name ILIKE $${values.length} OR u.account ILIKE $${values.length})`)
    }
    const accounts = await client.query(
      `SELECT u.*, o.code AS organization_code, o.name AS organization_name,
        c.code AS campus_code, c.name AS campus_name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN campuses c ON c.id = u.campus_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY u.role, u.display_name`,
      values,
    )
    const ids = accounts.rows.map((row) => row.id)
    if (!ids.length) return []
    const [classes, groups, scopes, counts] = await Promise.all([
      client.query(
        `SELECT tc.teacher_user_id AS user_id, tc.class_id FROM teacher_classes tc WHERE tc.organization_id = $1 AND tc.teacher_user_id = ANY($2::text[])
         UNION ALL
         SELECT cs.student_user_id AS user_id, cs.class_id FROM class_students cs WHERE cs.organization_id = $1 AND cs.student_user_id = ANY($2::text[])`,
        [admin.organization.id, ids],
      ),
      client.query(
        `SELECT pgm.user_id, pgm.group_id FROM permission_group_members pgm
         WHERE pgm.organization_id = $1 AND pgm.user_id = ANY($2::text[])`,
        [admin.organization.id, ids],
      ),
      client.query(
        `SELECT admin_user_id, scope_type, campus_id FROM admin_scopes
         WHERE organization_id = $1 AND admin_user_id = ANY($2::text[])`,
        [admin.organization.id, ids],
      ),
      client.query(
        `SELECT owner_user_id, document_type, count(*)::integer AS count FROM user_documents
         WHERE organization_id = $1 AND owner_user_id = ANY($2::text[]) AND deleted_at IS NULL
         GROUP BY owner_user_id, document_type`,
        [admin.organization.id, ids],
      ),
    ])
    return accounts.rows.map((row) => {
      const documentCounts = Object.fromEntries(counts.rows.filter((item) => item.owner_user_id === row.id).map((item) => [item.document_type, item.count]))
      return toAccount(row, {
        classIds: classes.rows.filter((item) => item.user_id === row.id).map((item) => item.class_id),
        groupIds: groups.rows.filter((item) => item.user_id === row.id).map((item) => item.group_id),
        adminScopes: scopes.rows.filter((item) => item.admin_user_id === row.id).map((item) => ({ type: item.scope_type, campusId: item.campus_id || null })),
        documentCounts,
      })
    })
  })
}

export async function listAccountOptions(admin) {
  return withTransaction(async (client) => {
    const access = await adminAccess(client, admin)
    const scope = scopeClause(access, 'c', 2)
    const campuses = await client.query(
      `SELECT c.id, c.code, c.name FROM campuses c
       WHERE c.organization_id = $1 AND c.status = 'active'${scope.sql}
       ORDER BY c.name`,
      [admin.organization.id, ...scope.values],
    )
    const classScope = scopeClause(access, 'sc', 2)
    const classes = await client.query(
      `SELECT sc.id, sc.name, sc.campus_id FROM school_classes sc
       WHERE sc.organization_id = $1 AND sc.status = 'active'${classScope.sql}
       ORDER BY sc.name`,
      [admin.organization.id, ...classScope.values],
    )
    return { campuses: campuses.rows, classes: classes.rows, organizationWide: access.organizationWide }
  })
}

async function replaceClassLinks(client, admin, account, classIds = []) {
  const table = account.role === 'teacher' ? 'teacher_classes' : account.role === 'student' ? 'class_students' : ''
  const userColumn = account.role === 'teacher' ? 'teacher_user_id' : 'student_user_id'
  if (!table) return
  const uniqueIds = [...new Set((Array.isArray(classIds) ? classIds : []).filter(Boolean))]
  if (uniqueIds.length) {
    const valid = await client.query(
      'SELECT id, campus_id FROM school_classes WHERE organization_id = $1 AND id = ANY($2::text[]) AND status = \'active\'',
      [account.organization_id, uniqueIds],
    )
    if (valid.rows.length !== uniqueIds.length) throw httpError('班级不属于当前机构。')
    for (const schoolClass of valid.rows) await assertCampusAccess(client, admin, schoolClass.campus_id)
  }
  await client.query(`DELETE FROM ${table} WHERE ${userColumn} = $1 AND organization_id = $2`, [account.id, account.organization_id])
  for (const classId of uniqueIds) {
    await client.query(
      `INSERT INTO ${table} (${userColumn}, class_id, organization_id) VALUES ($1, $2, $3)`,
      [account.id, classId, account.organization_id],
    )
  }
}

/**
 * 检查登录账号在本机构内是否可用（不区分大小写）。
 * 登录用 lower(account) 匹配，所以查重也必须用 lower，否则只差大小写的两个账号
 * 会同时存在，登录时随机登进别人的账号。
 * excludeUserId 用于改名时排除自己。
 *
 * 格式校验也放在这里：创建账号必走本函数，改名只要账号变了也必走本函数，
 * 一处拦截等于两个入口都拦住了。
 */
async function assertAccountAvailable(client, organizationId, account, excludeUserId = '') {
  const { account: normalized, message } = requireValidAccount(account)
  if (message) throw httpError(message)
  const existing = await client.query(
    'SELECT 1 FROM users WHERE organization_id = $1 AND lower(account) = lower($2) AND id <> $3 LIMIT 1',
    [organizationId, normalized, excludeUserId],
  )
  if (existing.rows[0]) throw httpError('该登录账号已被使用，请换一个。', 409)
}

async function replaceGroupLinks(client, account, groupIds = []) {
  const uniqueIds = [...new Set((Array.isArray(groupIds) ? groupIds : []).filter(Boolean))]
  if (uniqueIds.length) {
    const valid = await client.query(
      'SELECT id FROM permission_groups WHERE organization_id = $1 AND id = ANY($2::text[])',
      [account.organization_id, uniqueIds],
    )
    if (valid.rows.length !== uniqueIds.length) throw httpError('权限组不属于当前机构。')
  }
  await client.query('DELETE FROM permission_group_members WHERE user_id = $1 AND organization_id = $2', [account.id, account.organization_id])
  for (const groupId of uniqueIds) {
    await client.query(
      'INSERT INTO permission_group_members (group_id, user_id, organization_id) VALUES ($1, $2, $3)',
      [groupId, account.id, account.organization_id],
    )
  }
}

export async function createAccount(admin, payload = {}) {
  const role = ['student', 'teacher', 'admin'].includes(payload.role) ? payload.role : ''
  if (!role) throw httpError('账号角色无效。')
  // 账号统一转小写后入库：登录不区分大小写，库里存两份大小写不同的同名字段只会制造歧义。
  const account = normalizeAccount(payload.account).slice(0, 120)
  const name = String(payload.name || '').trim().slice(0, 120)
  if (!account || !name || !payload.password) throw httpError('账号、姓名和初始密码不能为空。')
  const created = await withTransaction(async (client) => {
    const access = await assertCampusAccess(client, admin, payload.campusId, { allowOrganization: role === 'admin' })
    if (role === 'admin' && !access.organizationWide) throw httpError('只有机构管理员可以创建管理员账号。', 403)
    // 登录时账号不区分大小写匹配，这里也必须不区分大小写查重，否则 'Ceshi2' 和 'ceshi2'
    // 会同时存在、登录撞成同一个人。数据库还有 idx_users_org_account_ci_unique 兜底。
    await assertAccountAvailable(client, admin.organization.id, account)
    const id = newId('usr')
    const result = await client.query(
      `INSERT INTO users (id, organization_id, campus_id, account, password_hash, display_name, role, class_name, status, permissions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING *`,
      [id, admin.organization.id, payload.campusId || null, account, await hashPassword(payload.password), name, role,
        String(payload.className || '').trim().slice(0, 160), payload.status === 'disabled' ? 'disabled' : 'active', JSON.stringify(normalizePermissions(payload.permissions))],
    )
    const row = result.rows[0]
    await replaceClassLinks(client, admin, row, payload.classIds)
    await replaceGroupLinks(client, row, payload.groupIds)
    if (role === 'admin') {
      await client.query(
        `INSERT INTO admin_scopes (id, admin_user_id, organization_id, campus_id, scope_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [newId('scope'), id, admin.organization.id, payload.adminScopeType === 'organization' ? null : payload.campusId, payload.adminScopeType === 'organization' ? 'organization' : 'campus'],
      )
    }
    return row
  })
  await logAudit(admin.id, admin.organization.id, 'account.create', 'user', created.id, { role: created.role })
  return { id: created.id }
}

export async function updateAccount(admin, accountId, payload = {}) {
  const updated = await withTransaction(async (client) => {
    const { account } = await assertAccountAccess(client, admin, accountId)
    if (payload.campusId !== undefined) await assertCampusAccess(client, admin, payload.campusId, { allowOrganization: account.role === 'admin' })
    const nextName = payload.name === undefined ? account.display_name : String(payload.name || '').trim().slice(0, 120)
    const nextAccount = payload.account === undefined ? account.account : normalizeAccount(payload.account).slice(0, 120)
    if (!nextName || !nextAccount) throw httpError('账号和姓名不能为空。')
    // 改名同样要查重（排除自己），否则可以改成与别人只差大小写的账号，制造登录歧义。
    if (nextAccount !== account.account) await assertAccountAvailable(client, account.organization_id, nextAccount, account.id)
    await client.query(
      `UPDATE users SET display_name = $1, account = $2, campus_id = $3, class_name = $4,
        status = $5, permissions = $6::jsonb, updated_at = now()
       WHERE id = $7 AND organization_id = $8`,
      [nextName, nextAccount, payload.campusId === undefined ? account.campus_id : payload.campusId || null,
        payload.className === undefined ? account.class_name : String(payload.className || '').trim().slice(0, 160),
        payload.status === 'disabled' ? 'disabled' : payload.status === 'enabled' ? 'active' : account.status,
        JSON.stringify(payload.permissions === undefined ? account.permissions || {} : normalizePermissions(payload.permissions)), account.id, account.organization_id],
    )
    if (payload.classIds !== undefined) await replaceClassLinks(client, admin, account, payload.classIds)
    if (payload.groupIds !== undefined) await replaceGroupLinks(client, account, payload.groupIds)
    return account
  })
  await logAudit(admin.id, admin.organization.id, 'account.update', 'user', updated.id, {})
}

export async function disableAccount(admin, accountId) {
  if (accountId === admin.id) throw httpError('不能停用当前登录的管理员账号。')
  await withTransaction(async (client) => {
    const { account } = await assertAccountAccess(client, admin, accountId)
    await client.query('UPDATE users SET status = \'disabled\', updated_at = now() WHERE id = $1', [account.id])
    await client.query('DELETE FROM sessions WHERE user_id = $1', [account.id])
  })
  await logAudit(admin.id, admin.organization.id, 'account.disable', 'user', accountId, {})
}

export async function resetAccountPassword(admin, accountId, password) {
  await withTransaction(async (client) => {
    const { account } = await assertAccountAccess(client, admin, accountId)
    await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [await hashPassword(password), account.id])
    await client.query('DELETE FROM sessions WHERE user_id = $1', [account.id])
  })
  await logAudit(admin.id, admin.organization.id, 'account.password_reset', 'user', accountId, {})
}

export async function revokeAccountSessions(admin, accountId) {
  await withTransaction(async (client) => {
    const { account } = await assertAccountAccess(client, admin, accountId)
    await client.query('DELETE FROM sessions WHERE user_id = $1', [account.id])
  })
  await logAudit(admin.id, admin.organization.id, 'account.sessions_revoke', 'user', accountId, {})
}

export async function setAccountClasses(admin, accountId, classIds = []) {
  await withTransaction(async (client) => {
    const { account } = await assertAccountAccess(client, admin, accountId)
    await replaceClassLinks(client, admin, account, classIds)
  })
  await logAudit(admin.id, admin.organization.id, 'account.classes_update', 'user', accountId, { classIds })
}

export async function setAdminScopes(admin, accountId, scopes = []) {
  if (accountId === admin.id) throw httpError('不能在当前会话中修改自己的授权范围。', 400)
  await withTransaction(async (client) => {
    const access = await adminAccess(client, admin)
    if (!access.organizationWide) throw httpError('只有机构管理员可以调整管理员授权范围。', 403)
    const { account } = await assertAccountAccess(client, admin, accountId)
    if (account.role !== 'admin') throw httpError('目标账号不是管理员。')
    const normalized = Array.isArray(scopes) ? scopes : []
    if (!normalized.length) throw httpError('管理员必须至少拥有一个明确授权范围。')
    const preparedScopes = []
    for (const scope of normalized) {
      const type = scope.type === 'organization' ? 'organization' : 'campus'
      const campusId = type === 'organization' ? null : String(scope.campusId || '')
      if (type === 'campus') await assertCampusAccess(client, admin, campusId)
      preparedScopes.push({ type, campusId })
    }
    await client.query('DELETE FROM admin_scopes WHERE admin_user_id = $1 AND organization_id = $2', [account.id, admin.organization.id])
    for (const { type, campusId } of preparedScopes) {
      await client.query(
        'INSERT INTO admin_scopes (id, admin_user_id, organization_id, campus_id, scope_type) VALUES ($1, $2, $3, $4, $5)',
        [newId('scope'), account.id, admin.organization.id, campusId, type],
      )
    }
  })
  await logAudit(admin.id, admin.organization.id, 'account.admin_scopes_update', 'user', accountId, { scopes })
}

export async function listPermissionGroups(admin) {
  return withTransaction(async (client) => {
    const access = await adminAccess(client, admin)
    const scope = scopeClause(access, 'pg', 2)
    const result = await client.query(
      `SELECT pg.*, COALESCE(array_agg(pgm.user_id) FILTER (WHERE pgm.user_id IS NOT NULL), '{}') AS member_ids
       FROM permission_groups pg
       LEFT JOIN permission_group_members pgm ON pgm.group_id = pg.id
       WHERE pg.organization_id = $1${scope.sql}
       GROUP BY pg.id ORDER BY pg.name`,
      [admin.organization.id, ...scope.values],
    )
    return result.rows.map((row) => ({
      id: row.id, name: row.name, description: row.description, status: row.status,
      campusId: row.campus_id, permissions: row.permissions || {}, memberIds: row.member_ids || [],
    }))
  })
}

export async function savePermissionGroup(admin, payload = {}, groupId = '') {
  const name = String(payload.name || '').trim().slice(0, 120)
  if (!name) throw httpError('权限组名称不能为空。')
  const savedId = await withTransaction(async (client) => {
    await assertCampusAccess(client, admin, payload.campusId, { allowOrganization: true })
    const id = groupId || newId('grp')
    if (groupId) {
      const current = await client.query('SELECT id FROM permission_groups WHERE id = $1 AND organization_id = $2', [id, admin.organization.id])
      if (!current.rows[0]) throw httpError('未找到该权限组。', 404)
      await client.query(
        `UPDATE permission_groups SET name = $1, description = $2, status = $3, permissions = $4::jsonb, campus_id = $5, updated_at = now()
         WHERE id = $6 AND organization_id = $7`,
        [name, String(payload.description || '').slice(0, 500), payload.status === 'disabled' ? 'disabled' : 'enabled',
          JSON.stringify(normalizePermissions(payload.permissions)), payload.campusId || null, id, admin.organization.id],
      )
    } else {
      await client.query(
        `INSERT INTO permission_groups (id, organization_id, campus_id, name, description, status, permissions)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [id, admin.organization.id, payload.campusId || null, name, String(payload.description || '').slice(0, 500),
          payload.status === 'disabled' ? 'disabled' : 'enabled', JSON.stringify(normalizePermissions(payload.permissions))],
      )
    }
    const members = [...new Set((Array.isArray(payload.memberIds) ? payload.memberIds : []).filter(Boolean))]
    await client.query('DELETE FROM permission_group_members WHERE group_id = $1', [id])
    for (const userId of members) {
      await assertAccountAccess(client, admin, userId)
      await client.query('INSERT INTO permission_group_members (group_id, user_id, organization_id) VALUES ($1, $2, $3)', [id, userId, admin.organization.id])
    }
    return id
  })
  await logAudit(admin.id, admin.organization.id, groupId ? 'permission_group.update' : 'permission_group.create', 'permission_group', savedId, {})
  return { id: savedId }
}

export async function deletePermissionGroup(admin, groupId) {
  await withTransaction(async (client) => {
    const current = await client.query('SELECT id, campus_id FROM permission_groups WHERE id = $1 AND organization_id = $2', [groupId, admin.organization.id])
    if (!current.rows[0]) throw httpError('未找到该权限组。', 404)
    await assertCampusAccess(client, admin, current.rows[0].campus_id, { allowOrganization: true })
    // 课程 / 技能授权表引用权限组但没设级联：组里授权过课程或技能时，直接删组会被外键挡住（接口 500）。先删掉这些授权。
    await client.query('DELETE FROM course_assignments WHERE permission_group_id = $1 AND organization_id = $2', [groupId, admin.organization.id])
    await client.query('DELETE FROM ai_skill_assignments WHERE permission_group_id = $1 AND organization_id = $2', [groupId, admin.organization.id])
    await client.query('DELETE FROM permission_groups WHERE id = $1 AND organization_id = $2', [groupId, admin.organization.id])
  })
  await logAudit(admin.id, admin.organization.id, 'permission_group.delete', 'permission_group', groupId, {})
}
