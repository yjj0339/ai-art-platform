/**
 * 课程中心的服务端存储。
 *
 * 落点说明：
 *  - 课程本体写 organization_documents（document_type='course'，resource_key=课程ID）。
 *    不能用 user_documents：那张表开了 FORCE RLS，策略硬要求 app.user_role='student'，
 *    而课程作者是老师/管理员，写不进去。
 *  - 课程授权写 course_assignments，四级范围照搬 ai_skill_assignments（已在生产跑），
 *    另加 student 单发。老数据里的 authorizedClasses / authorizedStudents 是纯字符串，
 *    迁移时按名字与库里班级/学生比对，只认唯一命中，重名一律不猜。
 *  - 素材文件落盘，course_assets 只登记归属，读权限在路由层判定。
 *
 * 权限模型：
 *  - 管理员：本机构全部课程。
 *  - 教师：自己建的课程；跨教师可见需要课程显式授权到教师所在权限组
 *    （course_assignments.scope_type='permission_group' 且该组拥有 courseLibraryView）。
 *  - 学生：published + 至少命中一条授权（机构/分部/班级/权限组/单发）。
 */
import { randomBytes } from 'node:crypto'
import { basename } from 'node:path'
import { logAudit } from './auth.js'
import { query, withTransaction } from './db.js'

const DOCUMENT_TYPE = 'course'
const MAX_TITLE = 120
const MAX_KEY = 160
const BUILTIN_CATEGORIES = [
  { id: 'logo', label: 'LOGO设计' },
  { id: 'storefront', label: '门头设计' },
  { id: 'fashion', label: '服装设计' },
  { id: 'product', label: '产品设计' },
  { id: 'ip', label: 'IP形象' },
  { id: 'anime', label: '动漫人物' },
  { id: 'project', label: '综合项目' },
]
const COURSE_STATUSES = new Set(['published', 'draft', 'offline'])
const ASSIGN_SCOPES = new Set(['organization', 'campus', 'class', 'permission_group', 'student'])
const ASSET_KINDS = new Set(['cover', 'video', 'ppt', 'pdf'])

function fail(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function text(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function toCourse(row) {
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {}
  return {
    ...data,
    id: row.resource_key,
    title: data.title || row.title || '',
    status: data.status || 'draft',
    version: Number(row.version || 1),
    createdAt: data.createdAt || row.created_at,
    updatedAt: data.updatedAt || row.updated_at,
  }
}

// 学生拿课程不需要授权名单：别的小画家的名字、班级、权限组一律不下发
function forViewer(user, course) {
  if (isAdmin(user) || user?.role === 'teacher') return course
  const { authorizedStudents, authorizedStudentIds, authorizedClasses, authorizedClassIds, authorizedGroupIds, authorizedOrganization, ...rest } = course
  return rest
}

function requireOrganization(user) {
  if (!user?.id || !user?.organization?.id) throw fail('请先登录。', 401)
}

function isAdmin(user) {
  return user?.role === 'admin'
}

/** 教师能编辑的课程范围：自己建的。管理员不限。 */
function canWriteCourse(user, course) {
  if (isAdmin(user)) return true
  if (user?.role !== 'teacher') return false
  return Boolean(course?.ownerId) && String(course.ownerId) === String(user.id)
}

// 讲师只能把自己的课发给班级 / 单个学员，并且要有「发放课程」权限；
// 全机构授权、权限组授权是后台「课程授权」的事，只有管理员能改（讲师传了也不认，沿用原值）。
const ADMIN_ONLY_ASSIGNMENT_FIELDS = ['authorizedOrganization', 'authorizedGroupIds']
const DISTRIBUTE_FIELDS = ['authorizedClassIds', 'authorizedClasses', 'authorizedStudentIds', 'authorizedStudents']
const NO_DISTRIBUTE_MESSAGE = '当前账号所在权限组没有发放课程的权限，请联系管理员开通。'

function sameTextList(a, b) {
  const left = uniqueTexts(a, 80, 500).sort()
  const right = uniqueTexts(b, 80, 500).sort()
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function normalizeCoursePayload(payload = {}, user) {
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {}
  // 服务端字段不进 data，避免学生拿到别人的文档编号。
  delete data.version
  const title = text(data.title, MAX_TITLE)
  if (!title) throw fail('请填写课程名称。')
  data.title = title
  data.status = COURSE_STATUSES.has(String(data.status || '')) ? String(data.status) : 'draft'
  data.ownerId = text(data.ownerId, 80) || user.id
  data.ownerName = text(data.ownerName, 80) || user.name || ''
  data.ownerRole = text(data.ownerRole, 20) || user.role || 'teacher'
  // 右侧智能体的人设：auto（按课程类型自动判断）/ client（甲方）/ teacher（老师）。
  // 后台可手动覆盖；写脏值一律折回 auto，由对话引擎兜底判定。
  const persona = String(data.agentPersona || 'auto')
  data.agentPersona = ['auto', 'client', 'teacher'].includes(persona) ? persona : 'auto'
  // 对话轮次硬上限。不是「聊满就结束」，而是「到顶了必须收尾」——防止学生无限扯。
  const maxRounds = Number(data.dialogMaxRounds)
  data.dialogMaxRounds = Number.isFinite(maxRounds) && maxRounds > 0 ? Math.min(Math.floor(maxRounds), 20) : 8
  data.updatedAt = new Date().toISOString()
  return data
}

/** 学生可见性 SQL：published + 至少命中一条授权。参数顺序必须与调用方一致。 */
function studentVisibleClause(alias = 'd', startIndex = 3) {
  return `EXISTS (
    SELECT 1 FROM course_assignments a
    WHERE a.course_id = ${alias}.resource_key AND a.organization_id = ${alias}.organization_id
      AND a.status = 'enabled' AND (
        a.scope_type = 'organization'
        OR (a.scope_type = 'campus' AND a.campus_id = $${startIndex})
        OR (a.scope_type = 'class' AND EXISTS (
          SELECT 1 FROM class_students cs
          WHERE cs.class_id = a.class_id AND cs.student_user_id = $${startIndex + 1} AND cs.organization_id = ${alias}.organization_id))
        OR (a.scope_type = 'permission_group' AND EXISTS (
          SELECT 1 FROM permission_group_members pgm
          WHERE pgm.group_id = a.permission_group_id AND pgm.user_id = $${startIndex + 1} AND pgm.organization_id = ${alias}.organization_id))
        OR (a.scope_type = 'student' AND a.student_user_id = $${startIndex + 1})
      )
  )`
}

async function assertCourseVisible(user, courseId) {
  const result = await query(
    `SELECT 1 FROM organization_documents d
     WHERE d.organization_id = $1 AND d.document_type = '${DOCUMENT_TYPE}'
       AND d.resource_key = $2 AND d.deleted_at IS NULL AND ${studentVisibleClause('d', 3)}
     LIMIT 1`,
    [user.organization.id, courseId, user.campus?.id || '', user.id],
  )
  if (!result.rows[0]) throw fail('未找到该课程，或当前账号没有权限。', 404)
}

/** 能读到这门课的素材：学生靠授权，教师/管理员靠课程库权限。 */
export async function canReadCourseAssets(user, courseId) {
  requireOrganization(user)
  if (isAdmin(user)) {
    const admin = await query(
      `SELECT 1 FROM organization_documents
       WHERE organization_id = $1 AND document_type = '${DOCUMENT_TYPE}' AND resource_key = $2 AND deleted_at IS NULL LIMIT 1`,
      [user.organization.id, courseId],
    )
    return Boolean(admin.rows[0])
  }
  if (user.role === 'teacher') {
    const own = await query(
      `SELECT 1 FROM organization_documents
       WHERE organization_id = $1 AND document_type = '${DOCUMENT_TYPE}' AND resource_key = $2 AND deleted_at IS NULL
         AND (data->>'ownerId' = $3 OR EXISTS (
           SELECT 1 FROM course_assignments a
           WHERE a.course_id = $2 AND a.organization_id = $1 AND a.status = 'enabled'
             AND a.scope_type = 'permission_group' AND EXISTS (
               SELECT 1 FROM permission_group_members pgm
               JOIN permission_groups pg ON pg.id = pgm.group_id
               WHERE pgm.group_id = a.permission_group_id AND pgm.user_id = $3
                 AND pgm.organization_id = $1 AND pg.status = 'enabled'
                 AND COALESCE((pg.permissions->>'courseLibraryView')::boolean, false)
             )
         )) LIMIT 1`,
      [user.organization.id, courseId, user.id],
    )
    return Boolean(own.rows[0])
  }
  await assertCourseVisible(user, courseId)
  return true
}

export async function listCourses(user) {
  requireOrganization(user)
  const params = [user.organization.id]
  let where = `d.organization_id = $1 AND d.document_type = '${DOCUMENT_TYPE}' AND d.deleted_at IS NULL`

  if (isAdmin(user)) {
    // 管理员看全量
  } else if (user.role === 'teacher') {
    // 自己建的 + 被授权到所在权限组的
    params.push(user.id)
    where += ` AND (d.data->>'ownerId' = $2 OR EXISTS (
      SELECT 1 FROM course_assignments a
      WHERE a.course_id = d.resource_key AND a.organization_id = d.organization_id AND a.status = 'enabled'
        AND a.scope_type = 'permission_group' AND EXISTS (
          SELECT 1 FROM permission_group_members pgm
          JOIN permission_groups pg ON pg.id = pgm.group_id
          WHERE pgm.group_id = a.permission_group_id AND pgm.user_id = $2
            AND pgm.organization_id = d.organization_id AND pg.status = 'enabled'
            AND COALESCE((pg.permissions->>'courseLibraryView')::boolean, false)
        )
    ))`
  } else {
    // 这里的参数位置：$1=机构，$2=校区，$3=学生。studentVisibleClause 默认从 $3 开始，
    // 那是 assertCourseVisible 的排法（$1 机构 / $2 课程 / $3 校区 / $4 学生）。
    // 本函数少了「课程 ID」这一位，所以起始位必须传 2，否则 $2 变成没人引用的空参数，
    // Postgres 会直接报「无法确定参数 $2 的数据类型」，整个 /api/courses 500、课程列表变空。
    params.push(user.campus?.id || '', user.id)
    where += ` AND COALESCE(d.data->>'status', 'draft') = 'published' AND ${studentVisibleClause('d', 2)}`
  }

  const result = await query(
    `SELECT d.id, d.resource_key, d.title, d.data, d.version, d.created_at, d.updated_at
     FROM organization_documents d
     WHERE ${where}
     ORDER BY d.updated_at DESC`,
    params,
  )
  return result.rows.map((row) => forViewer(user, toCourse(row)))
}

export async function getCourse(user, courseId) {
  requireOrganization(user)
  const result = await query(
    `SELECT id, resource_key, title, data, version, created_at, updated_at
     FROM organization_documents
     WHERE organization_id = $1 AND document_type = '${DOCUMENT_TYPE}'
       AND resource_key = $2 AND deleted_at IS NULL LIMIT 1`,
    [user.organization.id, text(courseId, MAX_KEY)],
  )
  const course = result.rows[0] ? toCourse(result.rows[0]) : null
  if (!course) throw fail('未找到该课程，或当前账号没有权限。', 404)
  if (isAdmin(user) || canWriteCourse(user, course)) return course
  if (user.role === 'teacher') {
    // 以前这里没判断返回值：别的讲师的、没授权给他的课也能按 ID 读到
    if (!await canReadCourseAssets(user, course.id)) throw fail('未找到该课程，或当前账号没有权限。', 404)
    return course
  }
  await assertCourseVisible(user, course.id)
  return forViewer(user, course)
}

const COURSE_PERMISSION_KEYS = ['courseLibraryView', 'courseUse', 'courseUpload', 'courseDistribute']

/**
 * 当前账号的课程权限：账号自己的开关 + 所在的已启用权限组（任一处打开就算有）。管理员全有。
 * 讲师端靠它决定能不能上传 / 使用 / 发放课程（以前讲师端读的是只有管理员能调的接口，服务端模式下永远是「没权限」）。
 */
export async function getMyCourseAccess(user) {
  requireOrganization(user)
  if (isAdmin(user)) {
    return { permissions: Object.fromEntries(COURSE_PERMISSION_KEYS.map((key) => [key, true])), groups: [] }
  }
  const own = (await query('SELECT permissions FROM users WHERE id = $1 AND organization_id = $2', [user.id, user.organization.id])).rows[0]?.permissions || {}
  const groups = (await query(
    `SELECT pg.id, pg.name, pg.permissions FROM permission_groups pg
     JOIN permission_group_members pgm ON pgm.group_id = pg.id
     WHERE pgm.user_id = $1 AND pgm.organization_id = $2 AND pg.organization_id = $2 AND pg.status = 'enabled'
     ORDER BY pg.name`,
    [user.id, user.organization.id],
  )).rows.map((row) => ({ id: row.id, name: row.name, permissions: row.permissions || {} }))
  const permissions = {}
  for (const key of COURSE_PERMISSION_KEYS) {
    permissions[key] = Boolean(own[key]) || groups.some((group) => Boolean(group.permissions?.[key]))
  }
  return { permissions, groups }
}

export async function createCourse(user, payload = {}) {
  requireOrganization(user)
  if (!['teacher', 'admin'].includes(user.role)) throw fail('只有讲师或管理员可以创建课程。', 403)
  if (!isAdmin(user)) {
    const access = await getMyCourseAccess(user)
    if (!access.permissions.courseUpload) throw fail('当前账号所在权限组没有上传课程的权限，请联系管理员开通。', 403)
    // 讲师只能以自己的名义建课，不能把课挂到别人名下（那样会出现在别的讲师的课程库里）
    payload = { ...payload, ownerId: user.id, ownerName: user.name || '', ownerRole: user.role, authorizedOrganization: false, authorizedGroupIds: [] }
    if (!access.permissions.courseDistribute) {
      for (const key of DISTRIBUTE_FIELDS) payload[key] = []
    }
  }
  const data = normalizeCoursePayload({ ...payload, id: undefined }, user)
  const courseId = text(payload.id, MAX_KEY) || `course-${Date.now()}-${randomBytes(4).toString('hex')}`
  data.createdAt = data.createdAt || new Date().toISOString()
  data.id = courseId

  // 先查后写：同一个课程 ID 已存在（前端网络重试、或本地课程迁移重复点）时按更新处理，
  // 不要因为唯一键冲突把老师刚填的内容丢掉。
  const existing = await query(
    `SELECT id FROM organization_documents
     WHERE organization_id = $1 AND document_type = '${DOCUMENT_TYPE}' AND resource_key = $2 AND deleted_at IS NULL LIMIT 1`,
    [user.organization.id, courseId],
  )
  if (existing.rows[0]) return updateCourse(user, courseId, payload, { allowMissingVersion: true })

  const result = await query(
    `INSERT INTO organization_documents
       (id, organization_id, campus_id, document_type, resource_key, title, data, version, created_by_user_id)
     VALUES ($1, $2, $3, '${DOCUMENT_TYPE}', $4, $5, $6::jsonb, 1, $7)
     RETURNING id, resource_key, title, data, version, created_at, updated_at`,
    [newId('doc'), user.organization.id, user.campus?.id || null, courseId, data.title, JSON.stringify(data), user.id],
  )
  await logAudit(user.id, user.organization.id, 'course.create', 'course', courseId, {})
  return toCourse(result.rows[0])
}

export async function updateCourse(user, courseId, payload = {}, options = {}) {
  requireOrganization(user)
  const existing = await getCourse(user, courseId)
  if (!canWriteCourse(user, existing)) throw fail('只能修改自己创建的课程。', 403)
  if (!isAdmin(user)) {
    payload = { ...payload }
    for (const key of ADMIN_ONLY_ASSIGNMENT_FIELDS) delete payload[key]
    const changed = DISTRIBUTE_FIELDS.some((key) => payload[key] !== undefined && !sameTextList(payload[key], existing[key]))
    if (changed && !(await getMyCourseAccess(user)).permissions.courseDistribute) throw fail(NO_DISTRIBUTE_MESSAGE, 403)
  }

  const merged = normalizeCoursePayload({
    ...existing,
    ...payload,
    id: courseId,
    createdAt: existing.createdAt,
    ownerId: existing.ownerId,
    ownerName: existing.ownerName,
    ownerRole: existing.ownerRole,
  }, user)
  const expectedVersion = payload.version === undefined || options.allowMissingVersion ? null : Number(payload.version)

  const result = await query(
    `UPDATE organization_documents
     SET title = $1, data = $2::jsonb, version = version + 1, updated_at = now()
     WHERE organization_id = $3 AND document_type = '${DOCUMENT_TYPE}' AND resource_key = $4
       AND deleted_at IS NULL AND ($5::integer IS NULL OR version = $5)
     RETURNING id, resource_key, title, data, version, created_at, updated_at`,
    [merged.title, JSON.stringify(merged), user.organization.id, courseId, Number.isInteger(expectedVersion) ? expectedVersion : null],
  )
  if (!result.rows[0]) {
    throw fail('课程已被其他人修改，请刷新页面后重试。', 409)
  }
  await logAudit(user.id, user.organization.id, 'course.update', 'course', courseId, {})
  return toCourse(result.rows[0])
}

export async function deleteCourse(user, courseId) {
  requireOrganization(user)
  const existing = await getCourse(user, courseId)
  if (!canWriteCourse(user, existing)) throw fail('只能删除自己创建的课程。', 403)
  await query(
    `UPDATE organization_documents SET deleted_at = now(), updated_at = now()
     WHERE organization_id = $1 AND document_type = '${DOCUMENT_TYPE}' AND resource_key = $2 AND deleted_at IS NULL`,
    [user.organization.id, courseId],
  )
  await query(
    `UPDATE course_assignments SET status = 'disabled'
     WHERE course_id = $1 AND organization_id = $2`,
    [courseId, user.organization.id],
  )
  await logAudit(user.id, user.organization.id, 'course.delete', 'course', courseId, {})
  return true
}

export async function deleteCourses(user, courseIds = []) {
  const list = (Array.isArray(courseIds) ? courseIds : []).map((id) => text(id, MAX_KEY)).filter(Boolean).slice(0, 200)
  let removed = 0
  for (const courseId of list) {
    try {
      await deleteCourse(user, courseId)
      removed += 1
    } catch {
      // 单门失败不影响其它：可能是别人的课，或已被删。返回精确删除数量，不假装全成功。
    }
  }
  return removed
}

export async function bulkUpdateCourseStatus(user, courseIds = [], status = '') {
  const nextStatus = COURSE_STATUSES.has(String(status)) ? String(status) : ''
  if (!nextStatus) throw fail('课程状态不正确。')
  const list = (Array.isArray(courseIds) ? courseIds : []).map((id) => text(id, MAX_KEY)).filter(Boolean).slice(0, 200)
  let updated = 0
  for (const courseId of list) {
    try {
      await updateCourse(user, courseId, { status: nextStatus })
      updated += 1
    } catch {
      // 跳过无权限/不存在的，返回真实成功数
    }
  }
  return updated
}

/** 课程授权：读。 */
export async function listCourseAssignments(user, courseId) {
  requireOrganization(user)
  const course = await getCourse(user, courseId)
  if (!isAdmin(user) && !canWriteCourse(user, course)) throw fail('只能查看自己创建课程的授权情况。', 403)
  const result = await query(
    `SELECT id, scope_type, campus_id, class_id, permission_group_id, student_user_id, status, created_at
     FROM course_assignments
     WHERE organization_id = $1 AND course_id = $2 AND status = 'enabled'
     ORDER BY created_at`,
    [user.organization.id, courseId],
  )
  return result.rows
}

/** 课程授权：整组替换。老库里同课程同范围的记录会保留，不重复插。 */
export async function replaceCourseAssignments(user, courseId, payload = {}) {
  requireOrganization(user)
  if (!isAdmin(user)) throw fail('只有管理员可以直接修改课程授权；讲师请在课程库里用「发放」。', 403)
  await getCourse(user, courseId)
  const orgId = user.organization.id
  const existingIds = async (sql, ids) => (ids.length ? new Set((await query(sql, [orgId, ids])).rows.map((row) => row.id)) : new Set())
  const validCampuses = await existingIds(`SELECT id FROM campuses WHERE organization_id = $1 AND id = ANY($2::text[])`, uniqueTexts([payload.campusId]))
  const validClasses = await existingIds(`SELECT id FROM school_classes WHERE organization_id = $1 AND id = ANY($2::text[])`, uniqueTexts(payload.classIds))
  const validGroups = await existingIds(`SELECT id FROM permission_groups WHERE organization_id = $1 AND id = ANY($2::text[])`, uniqueTexts(payload.permissionGroupIds))
  const validStudents = await existingIds(`SELECT id FROM users WHERE organization_id = $1 AND role = 'student' AND id = ANY($2::text[])`, uniqueTexts(payload.studentIds, 80, 500))

  const rows = []
  const push = (scopeType, fields) => {
    if (!ASSIGN_SCOPES.has(scopeType)) return
    rows.push({ scopeType, ...fields })
  }
  if (payload.organization === true) push('organization', {})
  if (validCampuses.size) push('campus', { campusId: [...validCampuses][0] })
  for (const classId of validClasses) push('class', { classId })
  for (const permissionGroupId of validGroups) push('permission_group', { permissionGroupId })
  for (const studentUserId of validStudents) push('student', { studentUserId })

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM course_assignments WHERE organization_id = $1 AND course_id = $2`, [user.organization.id, courseId])
    for (const row of rows) {
      await client.query(
        `INSERT INTO course_assignments
           (id, course_id, organization_id, campus_id, class_id, permission_group_id, student_user_id, scope_type, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [newId('ca'), courseId, user.organization.id, row.campusId || null, row.classId || null,
          row.permissionGroupId || null, row.studentUserId || null, row.scopeType, user.id],
      )
    }
  })
  await logAudit(user.id, user.organization.id, 'course.assign', 'course', courseId, { count: rows.length })
  return listCourseAssignments(user, courseId)
}

function uniqueTexts(list, maxLength = 80, limit = 200) {
  return [...new Set((Array.isArray(list) ? list : []).map((item) => text(item, maxLength)).filter(Boolean))].slice(0, limit)
}

/**
 * 按课程数据重算授权（建课、保存、改授权时调用），课程数据是唯一来源：
 *  - authorizedOrganization: true → 全机构学生可见；
 *  - authorizedClassIds（后台按真实班级勾选）+ authorizedClasses（老数据 / 讲师端填的班级名，只认唯一命中）→ 班级；
 *  - authorizedStudents（名字，只认唯一命中）→ 单发；
 *  - authorizedGroupIds → 权限组（讲师靠它在课程库里看到别人建的课；不存在的组跳过，不能因为脏数据整单失败）。
 * 只替换这四类，管理接口单独设的「分部」授权保留。以前只认班级名，清空授权时也不删旧记录，权限组授权根本不落库。
 */
export async function syncAssignmentsFromCourse(user, courseId, course) {
  requireOrganization(user)
  const orgId = user.organization.id
  const classNames = uniqueTexts(course?.authorizedClasses)
  const studentNames = uniqueTexts(course?.authorizedStudents, 80, 500)
  const wantedClassIds = uniqueTexts(course?.authorizedClassIds)
  const wantedGroupIds = uniqueTexts(course?.authorizedGroupIds)
  const wantedStudentIds = uniqueTexts(course?.authorizedStudentIds, 80, 500)

  const classIds = new Set()
  if (wantedClassIds.length) {
    const hits = await query(`SELECT id FROM school_classes WHERE organization_id = $1 AND id = ANY($2::text[]) AND status = 'active'`, [orgId, wantedClassIds])
    hits.rows.forEach((row) => classIds.add(row.id))
  }
  for (const name of classNames) {
    const hit = await query(
      `SELECT id FROM school_classes WHERE organization_id = $1 AND name = $2 AND status = 'active' LIMIT 2`,
      [orgId, name],
    )
    // 只认唯一命中：重名一律不授权，宁可漏也不敢给错班。
    if (hit.rows.length === 1) classIds.add(hit.rows[0].id)
  }
  const studentIds = new Set()
  if (wantedStudentIds.length) {
    const hits = await query(`SELECT id FROM users WHERE organization_id = $1 AND role = 'student' AND status = 'active' AND id = ANY($2::text[])`, [orgId, wantedStudentIds])
    hits.rows.forEach((row) => studentIds.add(row.id))
  }
  for (const name of studentNames) {
    const hit = await query(
      `SELECT id FROM users WHERE organization_id = $1 AND role = 'student' AND display_name = $2 AND status = 'active' LIMIT 2`,
      [orgId, name],
    )
    if (hit.rows.length === 1) studentIds.add(hit.rows[0].id)
  }
  const groupIds = wantedGroupIds.length
    ? (await query('SELECT id FROM permission_groups WHERE organization_id = $1 AND id = ANY($2::text[])', [orgId, wantedGroupIds])).rows.map((row) => row.id)
    : []

  const rows = [
    ...(course?.authorizedOrganization === true ? [{ scopeType: 'organization' }] : []),
    ...[...classIds].map((classId) => ({ scopeType: 'class', classId })),
    ...[...studentIds].map((studentUserId) => ({ scopeType: 'student', studentUserId })),
    ...groupIds.map((permissionGroupId) => ({ scopeType: 'permission_group', permissionGroupId })),
  ]
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM course_assignments WHERE organization_id = $1 AND course_id = $2 AND scope_type IN ('organization', 'class', 'student', 'permission_group')`,
      [orgId, courseId],
    )
    for (const row of rows) {
      await client.query(
        `INSERT INTO course_assignments
           (id, course_id, organization_id, campus_id, class_id, permission_group_id, student_user_id, scope_type, created_by_user_id)
         VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8)`,
        [newId('ca'), courseId, orgId, row.classId || null, row.permissionGroupId || null, row.studentUserId || null, row.scopeType, user.id],
      )
    }
  })
  await logAudit(user.id, orgId, 'course.assign', 'course', courseId, { count: rows.length, source: 'course-data' })
  return rows.length
}

/** 课程数据里和授权有关的字段：PATCH 带了其中任何一个，就要重算授权。 */
export const COURSE_ASSIGNMENT_FIELDS = ['authorizedOrganization', 'authorizedClassIds', 'authorizedClasses', 'authorizedStudentIds', 'authorizedStudents', 'authorizedGroupIds']

/**
 * 讲师端「发放课程」面板的名单：本机构在用的班级、学员（只给名字和所在班级，不给账号 / 手机号）。
 * 没有发放权限的讲师拿到空名单。
 */
export async function listDistributionOptions(user) {
  requireOrganization(user)
  if (!['teacher', 'admin'].includes(user.role)) throw fail('没有权限。', 403)
  if (!isAdmin(user) && !(await getMyCourseAccess(user)).permissions.courseDistribute) return { classes: [], students: [] }
  const orgId = user.organization.id
  const classes = (await query(
    `SELECT c.id, c.name, (SELECT count(*)::int FROM class_students cs WHERE cs.class_id = c.id) AS student_count
     FROM school_classes c WHERE c.organization_id = $1 AND c.status = 'active' ORDER BY c.name`,
    [orgId],
  )).rows.map((row) => ({ id: row.id, name: row.name, studentCount: row.student_count }))
  const students = (await query(
    `SELECT u.id, u.display_name AS name,
       COALESCE(array_agg(cs.class_id) FILTER (WHERE cs.class_id IS NOT NULL), '{}') AS class_ids
     FROM users u LEFT JOIN class_students cs ON cs.student_user_id = u.id AND cs.organization_id = u.organization_id
     WHERE u.organization_id = $1 AND u.role = 'student' AND u.status = 'active'
     GROUP BY u.id, u.display_name ORDER BY u.display_name LIMIT 2000`,
    [orgId],
  )).rows.map((row) => ({ id: row.id, name: row.name, classIds: row.class_ids || [] }))
  return { classes, students }
}

/** 课程分类：内置 7 个 + 机构自定义。首次访问自动补种内置项，不覆盖机构改过的名字。 */
export async function listCourseCategories(user) {
  requireOrganization(user)
  for (const [index, item] of BUILTIN_CATEGORIES.entries()) {
    await query(
      `INSERT INTO org_course_categories (organization_id, id, label, sort_order, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [user.organization.id, item.id, item.label, index],
    )
  }
  const result = await query(
    `SELECT id, label, sort_order, status FROM org_course_categories
     WHERE organization_id = $1 AND status = 'active' ORDER BY sort_order, id`,
    [user.organization.id],
  )
  return result.rows.map((row) => ({ value: row.id, label: row.label }))
}

export async function saveCourseCategory(user, payload = {}) {
  requireOrganization(user)
  if (!isAdmin(user)) throw fail('只有管理员可以维护课程分类。', 403)
  const id = text(payload.id, 60).toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const label = text(payload.label, 40)
  if (!id || !label) throw fail('请填写分类标识和名称。')
  await query(
    `INSERT INTO org_course_categories (organization_id, id, label, sort_order, status, updated_at)
     VALUES ($1, $2, $3, $4, 'active', now())
     ON CONFLICT (organization_id, id) DO UPDATE SET label = EXCLUDED.label, status = 'active', updated_at = now()`,
    [user.organization.id, id, label, Number(payload.sortOrder) || 0],
  )
  return listCourseCategories(user)
}

export async function deleteCourseCategory(user, categoryId) {
  requireOrganization(user)
  if (!isAdmin(user)) throw fail('只有管理员可以维护课程分类。', 403)
  const id = text(categoryId, 60)
  const used = await query(
    `SELECT 1 FROM organization_documents
     WHERE organization_id = $1 AND document_type = '${DOCUMENT_TYPE}' AND deleted_at IS NULL
       AND data->>'category' = $2 LIMIT 1`,
    [user.organization.id, id],
  )
  if (used.rows[0]) throw fail('这个分类下还有课程，请先把课程改到其它分类。', 409)
  await query(
    `UPDATE org_course_categories SET status = 'archived', updated_at = now()
     WHERE organization_id = $1 AND id = $2`,
    [user.organization.id, id],
  )
  return listCourseCategories(user)
}

/** 素材登记。文件由调用方落盘后把 storageKey/大小传进来。 */
export async function registerCourseAsset(user, payload = {}) {
  requireOrganization(user)
  const kind = String(payload.assetKind || '').trim()
  if (!ASSET_KINDS.has(kind)) throw fail('素材类型不正确。')
  const storageKey = text(payload.storageKey, 400)
  if (!storageKey) throw fail('缺少素材存储路径。')
  const id = newId('casset')
  const result = await query(
    `INSERT INTO course_assets
       (id, organization_id, campus_id, owner_user_id, asset_kind, original_name, mime_type, storage_key, byte_size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, asset_kind, original_name, mime_type, storage_key, byte_size, owner_user_id, organization_id`,
    [id, user.organization.id, user.campus?.id || null, user.id, kind,
      basename(String(payload.originalName || 'file')).slice(0, 200),
      text(payload.mimeType, 120) || 'application/octet-stream', storageKey, Number(payload.byteSize) || 0],
  )
  return result.rows[0]
}

export async function getCourseAssetRecord(user, assetId) {
  requireOrganization(user)
  const result = await query(
    `SELECT id, organization_id, owner_user_id, asset_kind, original_name, mime_type, storage_key, byte_size
     FROM course_assets
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [text(assetId, 120), user.organization.id],
  )
  if (!result.rows[0]) throw fail('未找到该素材。', 404)
  return result.rows[0]
}

export async function deleteCourseAsset(user, assetId) {
  requireOrganization(user)
  const record = await getCourseAssetRecord(user, assetId)
  if (!isAdmin(user) && String(record.owner_user_id) !== String(user.id)) {
    throw fail('只能删除自己上传的素材。', 403)
  }
  await query(`UPDATE course_assets SET deleted_at = now() WHERE id = $1`, [record.id])
  return true
}

/**
 * 判断当前用户能不能读这个素材。
 *
 * 顺序很重要：
 *  1. 上传者本人 —— 老师刚传完、课程还没保存时，他自己必须能预览；
 *  2. 管理员 —— 机构内全部素材；
 *  3. 其他老师 —— 素材挂在一门他有权限的课上（courseLibraryView）；
 *  4. 学生 —— 素材挂在一门已发布且授权给他自己的课上。
 *
 * 第 3、4 步都靠「课程数据里引用了这个 assetId」来反查，所以哪怕学生拿到了别人的
 * assetId，只要那份素材不在他能看的课上，一样读不到。
 */
export async function assertCanReadCourseAsset(user, assetRecord) {
  requireOrganization(user)
  if (!assetRecord) throw fail('未找到该素材。', 404)
  if (String(assetRecord.owner_user_id) === String(user.id)) return true
  if (isAdmin(user)) return true
  const referenced = await query(
    `SELECT d.resource_key FROM organization_documents d
     WHERE d.organization_id = $1 AND d.document_type = '${DOCUMENT_TYPE}' AND d.deleted_at IS NULL
       AND (d.data->>'coverAssetId' = $2 OR d.data->>'videoAssetId' = $2 OR d.data->>'pptAssetId' = $2)
     LIMIT 1`,
    [user.organization.id, assetRecord.id],
  )
  const courseId = referenced.rows[0]?.resource_key
  if (!courseId) throw fail('未找到该素材，或当前账号没有权限。', 404)
  await canReadCourseAssets(user, courseId)
  return true
}

export { DOCUMENT_TYPE as COURSE_DOCUMENT_TYPE, BUILTIN_CATEGORIES }
