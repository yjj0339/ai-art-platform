/**
 * 账号、权限与数据隔离回归脚本。
 * 仅允许连接名称包含 test 的专用 PostgreSQL 数据库；不会清理任何非本脚本前缀数据。
 * 使用：$env:TEST_DATABASE_URL='postgres://.../ai_art_test'; node scripts/test-isolation.mjs
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim()
if (!testUrl || !/test/i.test(testUrl)) {
  throw new Error('必须设置名称包含 test 的 TEST_DATABASE_URL；脚本拒绝连接非专用测试库。')
}
process.env.DATABASE_URL = testUrl

const suffix = `isolation_${Date.now()}_${randomBytes(4).toString('hex')}`
const id = (prefix) => `${prefix}_${suffix}`
const password = 'Isolate-Password-2026'

const { closeDb, query } = await import('../server/db.js')
const { hashPassword, loginWithPassword, getCurrentUser, logoutRequest } = await import('../server/auth.js')
const { createOwnDocument, getOwnDocument, getStudentDocument, listStudentDocuments, updateOwnDocument } = await import('../server/document-store.js')

const org1 = id('org')
const org2 = id('org')
const campus1 = id('camp')
const campus2 = id('camp')
const campusOther = id('camp')
const class1 = id('class')
const class2 = id('class')
const users = {
  a: id('student_a'), b: id('student_b'), c: id('student_c'), parent: id('parent'),
  teacher: id('teacher'), campusAdmin: id('campus_admin'), orgAdmin: id('org_admin'), outsider: id('outsider'),
}

function user(idValue, role, organizationId = org1, campusId = campus1) {
  return {
    id: idValue, role, name: idValue, account: idValue,
    organization: { id: organizationId, code: organizationId, name: organizationId },
    campus: campusId ? { id: campusId, code: campusId, name: campusId } : null,
  }
}

async function expectStatus(promise, status) {
  await assert.rejects(promise, (error) => error?.statusCode === status)
}

async function setup() {
  const passwordHash = await hashPassword(password)
  await query('INSERT INTO organizations (id, code, name) VALUES ($1, $1, $1), ($2, $2, $2)', [org1, org2])
  await query(
    `INSERT INTO campuses (id, organization_id, code, name) VALUES
      ($1, $3, $1, $1), ($2, $3, $2, $2), ($4, $5, $4, $4)`,
    [campus1, campus2, org1, campusOther, org2],
  )
  await query('INSERT INTO school_classes (id, organization_id, campus_id, name) VALUES ($1, $3, $4, $1), ($2, $3, $5, $2)', [class1, class2, org1, campus1, campus2])
  const records = [
    [users.a, 'student', campus1], [users.b, 'student', campus1], [users.c, 'student', campus2],
    [users.parent, 'parent', campus1], [users.teacher, 'teacher', campus1], [users.campusAdmin, 'admin', campus1],
    [users.orgAdmin, 'admin', null], [users.outsider, 'student', campusOther, org2],
  ]
  for (const [userId, role, campusId, organizationId = org1] of records) {
    await query(
      'INSERT INTO users (id, organization_id, campus_id, account, password_hash, display_name, role) VALUES ($1, $2, $3, $1, $4, $1, $5)',
      [userId, organizationId, campusId, passwordHash, role],
    )
  }
  await query('INSERT INTO guardian_students (guardian_user_id, student_user_id, organization_id) VALUES ($1, $2, $3)', [users.parent, users.a, org1])
  await query('INSERT INTO teacher_classes (teacher_user_id, class_id, organization_id) VALUES ($1, $2, $3)', [users.teacher, class1, org1])
  await query(
    `INSERT INTO class_students (class_id, student_user_id, organization_id) VALUES
      ($1, $2, $3), ($1, $4, $3), ($5, $6, $3)`,
    [class1, users.a, org1, users.b, class2, users.c],
  )
  await query(
    `INSERT INTO admin_scopes (id, admin_user_id, organization_id, campus_id, scope_type) VALUES
      ($1, $2, $3, $4, 'campus'), ($5, $6, $3, NULL, 'organization')`,
    [id('scope'), users.campusAdmin, org1, campus1, id('scope'), users.orgAdmin],
  )
}

async function cleanup() {
  const organizationIds = [org1, org2]
  for (const table of ['audit_logs', 'ai_tasks', 'user_assets', 'gallery_submissions', 'user_documents', 'permission_group_members', 'permission_groups', 'admin_scopes', 'guardian_students', 'teacher_classes', 'class_students', 'sessions']) {
    await query(`DELETE FROM ${table} WHERE organization_id = ANY($1::text[])`, [organizationIds]).catch(() => {})
  }
  await query('DELETE FROM users WHERE id = ANY($1::text[])', [Object.values(users)]).catch(() => {})
  await query('DELETE FROM school_classes WHERE id = ANY($1::text[])', [[class1, class2]]).catch(() => {})
  await query('DELETE FROM campuses WHERE id = ANY($1::text[])', [[campus1, campus2, campusOther]]).catch(() => {})
  await query('DELETE FROM organizations WHERE id = ANY($1::text[])', [organizationIds]).catch(() => {})
}

try {
  await setup()
  const a = user(users.a, 'student')
  const b = user(users.b, 'student')
  const c = user(users.c, 'student', org1, campus2)
  const parent = user(users.parent, 'parent')
  const teacher = user(users.teacher, 'teacher')
  const campusAdmin = user(users.campusAdmin, 'admin')
  const orgAdmin = user(users.orgAdmin, 'admin', org1, null)

  const documentA = await createOwnDocument(a, { type: 'project', resourceKey: 'a-work', title: 'A 的作品', data: { works: ['A'] } })
  const documentB = await createOwnDocument(b, { type: 'project', resourceKey: 'b-work', title: 'B 的作品', data: { works: ['B'] } })
  const documentC = await createOwnDocument(c, { type: 'project', resourceKey: 'c-work', title: 'C 的作品', data: { works: ['C'] } })

  await assert.doesNotReject(getOwnDocument(a, documentA.id))
  await expectStatus(getOwnDocument(b, documentA.id), 404)
  await expectStatus(updateOwnDocument(b, documentA.id, { title: '越权修改' }), 404)
  await expectStatus(getStudentDocument(parent, users.b, documentB.id), 404)
  await assert.doesNotReject(getStudentDocument(parent, users.a, documentA.id))
  await assert.doesNotReject(getStudentDocument(teacher, users.a, documentA.id))
  await expectStatus(getStudentDocument(teacher, users.c, documentC.id), 404)
  await assert.doesNotReject(getStudentDocument(campusAdmin, users.b, documentB.id))
  await expectStatus(getStudentDocument(campusAdmin, users.c, documentC.id), 404)
  await assert.doesNotReject(getStudentDocument(orgAdmin, users.c, documentC.id))
  await expectStatus(updateOwnDocument(parent, documentA.id, { title: '家长越权' }), 403)
  await expectStatus(updateOwnDocument(teacher, documentA.id, { title: '教师越权' }), 403)
  await assert.equal((await listStudentDocuments(parent, users.a, 'project')).length, 1)

  // 退出、重登和独立 Cookie 容器（另一浏览器/设备）均从服务端恢复同一作品。
  const firstLogin = await loginWithPassword(users.a, password, org1)
  const deviceOne = await getCurrentUser({ headers: { cookie: `ai_art_session=${firstLogin.token}` } })
  assert.equal(deviceOne.id, users.a)
  const secondLogin = await loginWithPassword(users.a, password, org1)
  const deviceTwo = await getCurrentUser({ headers: { cookie: `ai_art_session=${secondLogin.token}` } })
  assert.equal(deviceTwo.id, users.a)
  await assert.doesNotReject(getOwnDocument(deviceTwo, documentA.id))
  await logoutRequest({ headers: { cookie: `ai_art_session=${firstLogin.token}` } }, deviceOne)
  assert.equal(await getCurrentUser({ headers: { cookie: `ai_art_session=${firstLogin.token}` } }), null)
  assert.equal((await getOwnDocument(deviceTwo, documentA.id)).id, documentA.id)

  console.log(`隔离回归通过：${suffix}`)
} finally {
  await cleanup()
  await closeDb()
}
