import { randomBytes } from 'node:crypto'
import { hashPassword, logAudit } from './auth.js'
import { query, withTransaction, withUserContext } from './db.js'
import { accountFormatError, normalizeAccount } from './account-rules.js'

const newId = (prefix) => `${prefix}_${randomBytes(18).toString('base64url')}`
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })
const clean = (value, max = 120) => String(value || '').trim().slice(0, max)

async function organizationAdmin(client, user) {
  const result = await client.query('SELECT 1 FROM admin_scopes WHERE admin_user_id = $1 AND organization_id = $2 AND scope_type = \'organization\' LIMIT 1', [user.id, user.organization.id])
  if (!result.rows[0]) throw fail('只有机构管理员可以管理机构分部和邀请码。', 403)
}

export async function listOrganizationSetup(user) {
  return withUserContext(user, async (client) => {
    await organizationAdmin(client, user)
    const [campuses, classes, codes] = await Promise.all([
      client.query('SELECT id, code, name, status FROM campuses WHERE organization_id = $1 ORDER BY created_at', [user.organization.id]),
      client.query('SELECT sc.id, sc.name, sc.campus_id, sc.status FROM school_classes sc WHERE sc.organization_id = $1 ORDER BY sc.created_at', [user.organization.id]),
      client.query('SELECT id, code, label, role, campus_id, class_id, max_uses, used_count, expires_at, status FROM enrollment_codes WHERE organization_id = $1 ORDER BY created_at DESC', [user.organization.id]),
    ])
    return { campuses: campuses.rows, classes: classes.rows, codes: codes.rows }
  })
}

export async function saveCampus(user, payload = {}, campusId = '') {
  return withTransaction(async (client) => {
    await organizationAdmin(client, user)
    const name = clean(payload.name); const code = clean(payload.code, 48).toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (!name || !code) throw fail('请填写机构分部名称和机构分部代码。')
    if (campusId) {
      const updated = await client.query('UPDATE campuses SET name = $1, code = $2, status = $3, updated_at = now() WHERE id = $4 AND organization_id = $5 RETURNING id, code, name, status', [name, code, payload.status === 'disabled' ? 'disabled' : 'active', campusId, user.organization.id])
      if (!updated.rows[0]) throw fail('未找到机构分部。', 404)
      await logAudit(user.id, user.organization.id, 'campus.update', 'campus', campusId, {})
      return updated.rows[0]
    }
    const created = await client.query('INSERT INTO campuses (id, organization_id, code, name) VALUES ($1,$2,$3,$4) RETURNING id, code, name, status', [newId('camp'), user.organization.id, code, name])
    await logAudit(user.id, user.organization.id, 'campus.create', 'campus', created.rows[0].id, {}); return created.rows[0]
  })
}

export async function disableCampus(user, campusId) {
  return withTransaction(async (client) => {
    await organizationAdmin(client, user)
    const result = await client.query('UPDATE campuses SET status = \'disabled\', updated_at = now() WHERE id = $1 AND organization_id = $2 RETURNING id, code, name, status', [campusId, user.organization.id])
    if (!result.rows[0]) throw fail('未找到机构分部。', 404)
    await logAudit(user.id, user.organization.id, 'campus.disable', 'campus', campusId, {})
    return result.rows[0]
  })
}

export async function saveClass(user, payload = {}, classId = '') {
  return withTransaction(async (client) => {
    await organizationAdmin(client, user)
    const name = clean(payload.name); const campusId = clean(payload.campusId)
    if (!name || !campusId) throw fail('请选择机构分部并填写班级名称。')
    const valid = await client.query('SELECT id FROM campuses WHERE id = $1 AND organization_id = $2 AND status = \'active\'', [campusId, user.organization.id]); if (!valid.rows[0]) throw fail('机构分部不可用。')
    if (classId) {
      const updated = await client.query('UPDATE school_classes SET name=$1,campus_id=$2,status=$3,updated_at=now() WHERE id=$4 AND organization_id=$5 RETURNING id,name,campus_id,status', [name,campusId,payload.status === 'archived' ? 'archived' : 'active',classId,user.organization.id])
      if (!updated.rows[0]) throw fail('未找到班级。', 404)
      await logAudit(user.id, user.organization.id, 'class.update', 'class', classId, {})
      return updated.rows[0]
    }
    const created = await client.query('INSERT INTO school_classes (id,organization_id,campus_id,name) VALUES ($1,$2,$3,$4) RETURNING id,name,campus_id,status', [newId('cls'),user.organization.id,campusId,name])
    await logAudit(user.id, user.organization.id, 'class.create', 'class', created.rows[0].id, {})
    return created.rows[0]
  })
}

export async function createEnrollmentCode(user, payload = {}) {
  return withTransaction(async (client) => {
    await organizationAdmin(client, user)
    const campusId = clean(payload.campusId); const role = clean(payload.role); const classId = clean(payload.classId)
    if (!campusId || !['student','teacher'].includes(role)) throw fail('请选择机构分部和可注册角色。')
    const campus = await client.query('SELECT id FROM campuses WHERE id = $1 AND organization_id = $2 AND status = \'active\'', [campusId, user.organization.id])
    if (!campus.rows[0]) throw fail('机构分部不可用。')
    if (classId) {
      const schoolClass = await client.query('SELECT id FROM school_classes WHERE id = $1 AND organization_id = $2 AND campus_id = $3 AND status = \'active\'', [classId, user.organization.id, campusId])
      if (!schoolClass.rows[0]) throw fail('班级不属于所选机构分部或已停用。')
    }
    const code = `JOIN-${randomBytes(5).toString('hex').toUpperCase()}`
    const result = await client.query('INSERT INTO enrollment_codes (id,organization_id,campus_id,class_id,role,code,label,max_uses,expires_at,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,code,label,role,campus_id,class_id,max_uses,used_count,expires_at,status', [newId('invite'),user.organization.id,campusId,classId || null,role,code,clean(payload.label),Math.max(1,Math.min(Number(payload.maxUses)||1,1000)),payload.expiresAt || null,user.id])
    await logAudit(user.id, user.organization.id, 'enrollment_code.create', 'enrollment_code', result.rows[0].id, { role, campusId, classId: classId || null })
    return result.rows[0]
  })
}

export async function registerWithEnrollment(payload = {}) {
  return withTransaction(async (client) => {
    const code = clean(payload.code).toUpperCase(); const account=normalizeAccount(payload.account); const name=clean(payload.name); const password=String(payload.password||'')
    if (!code || !account || !name || !password) throw fail('请完整填写邀请码、姓名、账号和密码。')
    // 与后台建号同一套规则：3–20 位、只允许字母和数字（可直接用手机号）。前端也拦一道，但服务端才是最终判据。
    const accountMessage = accountFormatError(account)
    if (accountMessage) throw fail(accountMessage)
    if (password.length < 8) throw fail('密码至少需要 8 位。')
    const invite = (await client.query('SELECT * FROM enrollment_codes WHERE code=$1 AND status=\'active\' AND used_count < max_uses AND (expires_at IS NULL OR expires_at > now()) FOR UPDATE',[code])).rows[0]
    if (!invite) throw fail('邀请码无效、已用完或已过期。')
    const exists = await client.query('SELECT 1 FROM users WHERE organization_id=$1 AND lower(account)=lower($2)',[invite.organization_id,account]); if(exists.rows[0]) throw fail('该登录账号已被使用。')
    const userId=newId('usr'); await client.query('INSERT INTO users (id,organization_id,campus_id,account,password_hash,display_name,role) VALUES ($1,$2,$3,$4,$5,$6,$7)',[userId,invite.organization_id,invite.campus_id,account,await hashPassword(password),name,invite.role])
    if (invite.role === 'student' && invite.class_id) await client.query('INSERT INTO class_students (class_id,student_user_id,organization_id) VALUES ($1,$2,$3)',[invite.class_id,userId,invite.organization_id])
    await client.query('UPDATE enrollment_codes SET used_count=used_count+1,updated_at=now() WHERE id=$1',[invite.id])
    const organization = await client.query('SELECT code FROM organizations WHERE id = $1', [invite.organization_id])
    return { role: invite.role, organizationCode: organization.rows[0]?.code || '' }
  })
}
