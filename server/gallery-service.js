import { randomBytes } from 'node:crypto'
import { query, queryAsUser, withTransaction, withUserContext } from './db.js'
import { galleryDefaultRules, validateGalleryRules } from '../src/utils/galleryRules.js'
import { galleryError as error, galleryRuntime, imageDistance, modelIdentity, prepareGalleryArtwork, sourceIdentity } from './gallery-engine.js'
import { checkContent } from './risk-store.js'

export const galleryId = (prefix = 'gal') => `${prefix}_${randomBytes(16).toString('hex')}`
export const adminOnly = (user) => { if (user?.role !== 'admin') throw error('只有管理员可以执行此操作。', 403) }
export const studentOnly = (user) => { if (user?.role !== 'student') throw error('只有小画家可以操作自己的投稿。', 403) }
export const platformBudget = () => {
  const value = Number(process.env.GALLERY_DAILY_BUDGET_CNY || 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}
export async function lockGalleryStudent(client, organizationId, studentId) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gallery-student:${organizationId}:${studentId}`])
}
export async function galleryLog(client, user, action, resourceId, detail = {}) {
  await client.query('INSERT INTO audit_logs(id,organization_id,actor_user_id,action,resource_type,resource_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [galleryId('aud'), user.organization.id, user.id || null, action, 'gallery', resourceId, JSON.stringify(detail)])
}
export async function galleryDocument(user, documentId) {
  const { rows } = await queryAsUser(user, `SELECT * FROM user_documents WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL
    AND app_can_read_student(owner_user_id,organization_id,campus_id)`, [documentId, user.organization.id])
  if (!rows[0] || (user.role === 'student' && rows[0].owner_user_id !== user.id)) throw error('未找到作品或没有权限。', 404)
  return rows[0]
}
export async function galleryOwner(userId) {
  const { rows } = await query("SELECT id,display_name,organization_id,campus_id FROM users WHERE id=$1 AND role='student' AND status='active'", [userId])
  const row = rows[0]
  if (!row) throw error('作品所属账号已停用。', 409)
  return { id: row.id, role: 'student', name: row.display_name, organization: { id: row.organization_id }, campus: row.campus_id ? { id: row.campus_id } : null }
}
export async function getAuditSettings(organizationId) {
  try {
    const { rows } = await query('SELECT rules,version,activated_at FROM gallery_audit_settings WHERE organization_id=$1', [organizationId])
    return { ...galleryDefaultRules, ...(rows[0]?.rules || {}), version: rows[0]?.version || 0, activatedAt: rows[0]?.activated_at || null }
  } catch (e) {
    if (['42703', '42P01'].includes(e.code)) throw error('内容审核需要更新数据库，请先备份后执行 pnpm db:migrate。', 503)
    throw e
  }
}
export async function galleryModelOptions(user) {
  adminOnly(user)
  const { rows } = await query('SELECT * FROM gallery_model_checks WHERE organization_id=$1', [user.organization.id])
  return galleryRuntime().models().map(({ configKey, ...model }) => ({ ...model, verified: rows.some((r) => r.provider === model.provider && r.model === model.model && r.config_key === configKey) }))
}
export async function saveAuditSettings(user, patch) {
  adminOnly(user)
  const scope = await query("SELECT 1 FROM admin_scopes WHERE admin_user_id=$1 AND organization_id=$2 AND scope_type='organization'", [user.id, user.organization.id])
  if (!scope.rows.length) throw error('只有机构管理范围的管理员可以修改全校审核规则。', 403)
  const rules = validateGalleryRules(patch)
  if (!Number.isInteger(patch.version) || patch.version < 0) throw error('缺少设置版本，请刷新后重试。', 409)
  if (rules.aiAudit) {
    const selected = modelIdentity(rules)
    const { rows } = await query('SELECT 1 FROM gallery_model_checks WHERE organization_id=$1 AND provider=$2 AND model=$3 AND config_key=$4', [user.organization.id, rules.provider, rules.model, selected.configKey])
    if (!rows.length) throw error('请先试审，验证此模型能读取图片。', 409)
    if (platformBudget() <= 0) throw error('平台审核费用上限尚未配置，暂不能启用自动付费调用。', 409)
  }
  return withUserContext(user, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gallery-settings:${user.organization.id}`])
    const current = (await client.query('SELECT version FROM gallery_audit_settings WHERE organization_id=$1 FOR UPDATE', [user.organization.id])).rows[0]
    if ((current?.version || 0) !== patch.version) throw error('设置已被其他管理员修改，请刷新后重新编辑。', 409)
    const { rows } = await client.query(`INSERT INTO gallery_audit_settings(organization_id,rules,version,activated_at,updated_by)
      VALUES($1,$2,1,now(),$3) ON CONFLICT(organization_id) DO UPDATE SET rules=EXCLUDED.rules,version=gallery_audit_settings.version+1,
      activated_at=now(),updated_at=now(),updated_by=EXCLUDED.updated_by RETURNING version,activated_at`, [user.organization.id, JSON.stringify(rules), user.id])
    await galleryLog(client, user, 'gallery.settings', user.organization.id, { version: rows[0].version, rules })
    return { ...rules, version: rows[0].version, activatedAt: rows[0].activated_at }
  })
}
export async function getGalleryConsent(user, studentId = user.id) {
  if (!['admin', 'student'].includes(user.role) || (user.role === 'student' && studentId !== user.id)) throw error('没有授权管理权限。', 403)
  const accessible = await queryAsUser(user, `SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='student'
    AND app_can_read_student(id,organization_id,campus_id)`, [studentId, user.organization.id])
  if (!accessible.rows.length) throw error('未找到该小画家，或没有权限。', 404)
  const { rows } = await query('SELECT granted,opted_in,authority,evidence,policy_version,updated_at FROM gallery_consents WHERE organization_id=$1 AND student_id=$2', [user.organization.id, studentId])
  return { granted: false, opted_in: false, ...(rows[0] || {}), ...(user.role === 'student' ? { evidence: undefined } : {}) }
}
export async function setGalleryConsent(user, studentId, body) {
  await getGalleryConsent(user, studentId)
  const isAdmin = user.role === 'admin'
  if (isAdmin && typeof body.granted !== 'boolean') throw error('请选择授权状态。')
  if (!isAdmin && typeof body.optedIn !== 'boolean') throw error('请选择是否参与自动精选。')
  if (isAdmin && body.granted && String(body.evidence || '').trim().length < 5) throw error('请登记机构已有授权的依据或编号，至少 5 个字。')
  return withUserContext(user, async (client) => {
    await lockGalleryStudent(client, user.organization.id, studentId)
    const before = (await client.query('SELECT * FROM gallery_consents WHERE organization_id=$1 AND student_id=$2 FOR UPDATE', [user.organization.id, studentId])).rows[0] || {}
    const granted = isAdmin ? body.granted : before.granted === true
    const optedIn = granted && (!isAdmin ? body.optedIn : before.opted_in === true)
    if (!isAdmin && body.optedIn && !granted) throw error('尚未登记机构公开授权，请联系管理员。', 409)
    await client.query(`INSERT INTO gallery_consents(organization_id,student_id,granted,opted_in,granted_by,authority,evidence)
      VALUES($1,$2,$3,$4,$5,'school',$6) ON CONFLICT(organization_id,student_id) DO UPDATE SET granted=$3,opted_in=$4,
      granted_by=CASE WHEN $7 THEN $5 ELSE gallery_consents.granted_by END,
      evidence=CASE WHEN $7 THEN $6 ELSE gallery_consents.evidence END,updated_at=now()`,
    [user.organization.id, studentId, granted, optedIn, isAdmin ? user.id : null, String(body.evidence || '').trim().slice(0, 500), isAdmin])
    if (!granted || body.withdrawPublished === true) await client.query("UPDATE gallery_submissions SET review_state='withdrawn',blocked=TRUE,published_at=NULL,updated_at=now() WHERE organization_id=$1 AND owner_user_id=$2 AND (NOT $3 OR (source='系统精选' AND NOT student_submitted))", [user.organization.id, studentId, granted])
    await galleryLog(client, user, 'gallery.consent', studentId, { granted, optedIn })
    return { granted, opted_in: optedIn }
  })
}
export async function listConsentStudents(user) {
  adminOnly(user)
  return (await queryAsUser(user, `SELECT u.id,u.display_name AS name,c.granted,c.opted_in,c.evidence,c.updated_at FROM users u
    LEFT JOIN gallery_consents c ON c.student_id=u.id AND c.organization_id=u.organization_id
    WHERE u.organization_id=$1 AND u.role='student' AND app_can_read_student(u.id,u.organization_id,u.campus_id) ORDER BY u.display_name LIMIT 500`, [user.organization.id])).rows
}
function workRow(row, isPublic = false) {
  const snap = (isPublic ? row.published_snapshot : row.snapshot) || {}, data = row.document_data || {}
  const legacy = row.review_state === 'legacy'
  const status = legacy ? (row.manual_review_status === 'rejected' || row.automatic_review_status === 'rejected' ? 'rejected' : 'review') : row.review_state
  return { id: row.id, documentId: row.document_id, projectId: snap.projectId || data.id || row.document_id,
    title: snap.title || row.document_title || '未命名作品', author: isPublic ? snap.author || '小画家' : row.author_name || snap.author || '小画家作品',
    course: snap.course || data.courseTitle || data.courseCategory || 'AI 创意美术', ageRange: snap.ageRange || data.ageRange || '',
    source: row.student_submitted ? '小画家投稿' : String(row.source || '小画家投稿').replace(/^学生/, '小画家'), status, type: 'AI 绘画', likes: 0, pinned: false,
    categoryId: row.category_id || '',
    cover: legacy ? (data.versions || []).find((v) => v.id === data.finalVersionId)?.background || data.cover || '' : `/api/gallery/submissions/${row.id}/image${isPublic ? '' : '?review=1'}`,
    createdAt: row.created_at, publishedAt: row.published_at,
    ...(!isPublic ? { auditReason: row.manual_review_reason || row.automatic_review_reason || '等待审核', qualityScore: legacy ? null : row.quality_score,
      aiResult: row.ai_result, blocked: row.blocked, ruleVersion: row.rule_version, legacy, updatedAt: row.updated_at, description: snap.description || '', previousPublished: !!row.published_at && !!row.published_snapshot && status !== 'published', canRetry: !!row.can_retry && !row.blocked && row.decision_by !== 'manual' } : {}) }
}
const statusSql = `CASE WHEN gs.review_state='legacy' THEN CASE WHEN gs.manual_review_status='rejected' OR gs.automatic_review_status='rejected' THEN 'rejected' ELSE 'review' END ELSE gs.review_state END`
const listColumns = `gs.id,gs.document_id,gs.source,gs.review_state,gs.snapshot,gs.published_snapshot,gs.student_submitted,
  gs.automatic_review_status,gs.manual_review_status,gs.automatic_review_reason,gs.manual_review_reason,gs.quality_score,
  gs.ai_result,gs.blocked,gs.rule_version,gs.created_at,gs.updated_at,gs.published_at,gs.decision_by,gs.category_id`
export function galleryPage(options = {}) {
  return { page: Math.max(1, Math.min(1000000, Number.parseInt(options.page, 10) || 1)), pageSize: Math.max(1, Math.min(100, Number.parseInt(options.pageSize, 10) || 20)) }
}

// ===== 作品广场分类 =====
// 分类由后台独立维护，作品只记 category_id。以前学生端按钮是拿作品 course 去重凑的，
// 作品没绑课程时 course 会退回作品标题，按钮上就显示成了某一幅画的名字。
export const DEFAULT_CATEGORY_NAME = '未分类'
// 分类名统一在这里清洗。以前是「静默截断到 20 字」，用户输 60 字会被悄悄改成 20 字还不知道；
// 现在超长直接报错，让他自己改短，避免存进库里才发现名字不对。
const CATEGORY_NAME_MAX = 20
const categoryName = (value) => String(value || '').trim().replace(/\s+/g, ' ')
function assertCategoryName(value) {
  const name = categoryName(value)
  if (!name) throw error('请填写分类名称。', 400)
  if ([...name].length > CATEGORY_NAME_MAX) throw error(`分类名称最多 ${CATEGORY_NAME_MAX} 个字，请缩短一些。`, 400)
  return name
}

// 每个机构固定一条「未分类」兜底，接住没有分类的旧作品；可重复调用。
async function ensureDefaultCategory(organizationId, client = null) {
  const run = client ? (sql, params) => client.query(sql, params) : (sql, params) => query(sql, params)
  const { rows } = await run(`INSERT INTO gallery_categories(id,organization_id,name,sort_order,visible,is_default)
    VALUES($1,$2,$3,9999,TRUE,TRUE)
    ON CONFLICT (organization_id) WHERE is_default DO UPDATE SET updated_at=gallery_categories.updated_at
    RETURNING id,name`, [galleryId('gcat'), organizationId, DEFAULT_CATEGORY_NAME])
  if (rows[0]) return rows[0]
  const fallback = await run('SELECT id,name FROM gallery_categories WHERE organization_id=$1 AND is_default LIMIT 1', [organizationId])
  return fallback.rows[0]
}

export async function listGalleryCategories(user) {
  adminOnly(user)
  await ensureDefaultCategory(user.organization.id)
  // work_count 必须与学生端 publicCategoryList 同口径（只算已公开、未被拦、有图的），
  // 否则后台「已归类作品」会比学生端实际看到的多，用户会以为分类丢了作品。
  const { rows } = await query(`SELECT c.id,c.name,c.sort_order,c.visible,c.is_default,c.created_at,
      (SELECT count(*)::int FROM gallery_submissions gs WHERE gs.organization_id=c.organization_id
        AND NOT gs.blocked AND gs.published_at IS NOT NULL
        AND gs.published_snapshot IS NOT NULL AND gs.published_image IS NOT NULL
        AND (gs.category_id=c.id OR (c.is_default AND gs.category_id IS NULL))) AS work_count
    FROM gallery_categories c WHERE c.organization_id=$1 ORDER BY c.is_default,c.sort_order,c.created_at`, [user.organization.id])
  return rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order, visible: row.visible,
    isDefault: row.is_default, workCount: row.work_count, createdAt: row.created_at }))
}

export async function createGalleryCategory(user, body = {}) {
  adminOnly(user)
  const name = assertCategoryName(body.name)
  if (name === DEFAULT_CATEGORY_NAME) throw error(`「${DEFAULT_CATEGORY_NAME}」是系统保留分类，请换一个名称。`, 409)
  return withUserContext(user, async (client) => {
    const exists = await client.query('SELECT 1 FROM gallery_categories WHERE organization_id=$1 AND name=$2', [user.organization.id, name])
    if (exists.rows.length) throw error('已有同名分类，请换一个名称。', 409)
    const next = await client.query('SELECT COALESCE(max(sort_order),0)+1 AS next FROM gallery_categories WHERE organization_id=$1 AND NOT is_default', [user.organization.id])
    const { rows } = await client.query(`INSERT INTO gallery_categories(id,organization_id,name,sort_order) VALUES($1,$2,$3,$4)
      RETURNING id,name,sort_order,visible,is_default`, [galleryId('gcat'), user.organization.id, name, next.rows[0].next])
    await galleryLog(client, user, 'gallery.category.create', rows[0].id, { name })
    return { id: rows[0].id, name: rows[0].name, sortOrder: rows[0].sort_order, visible: rows[0].visible, isDefault: rows[0].is_default, workCount: 0 }
  })
}

export async function updateGalleryCategory(user, categoryId, body = {}) {
  adminOnly(user)
  return withUserContext(user, async (client) => {
    const current = (await client.query('SELECT * FROM gallery_categories WHERE id=$1 AND organization_id=$2 FOR UPDATE', [categoryId, user.organization.id])).rows[0]
    if (!current) throw error('未找到该分类。', 404)
    const patch = {}
    if (body.name !== undefined) {
      const name = assertCategoryName(body.name)
      if (current.is_default && name !== DEFAULT_CATEGORY_NAME) throw error(`「${DEFAULT_CATEGORY_NAME}」是系统保留分类，不能改名。`, 409)
      if (name !== current.name) {
        const dup = await client.query('SELECT 1 FROM gallery_categories WHERE organization_id=$1 AND name=$2 AND id<>$3', [user.organization.id, name, categoryId])
        if (dup.rows.length) throw error('已有同名分类，请换一个名称。', 409)
        patch.name = name
      }
    }
    if (body.visible !== undefined) {
      if (current.is_default && body.visible === false) throw error(`「${DEFAULT_CATEGORY_NAME}」不能隐藏。`, 409)
      patch.visible = body.visible === true
    }
    if (body.sortOrder !== undefined) {
      const order = Number.parseInt(body.sortOrder, 10)
      if (!Number.isFinite(order)) throw error('排序值无效。', 400)
      patch.sortOrder = Math.max(0, Math.min(9999, order))
    }
    if (!Object.keys(patch).length) throw error('没有需要保存的修改。', 400)
    const sets = [], params = [categoryId, user.organization.id]
    const map = { name: 'name', visible: 'visible', sortOrder: 'sort_order' }
    Object.entries(patch).forEach(([key, value]) => { params.push(value); sets.push(`${map[key]}=$${params.length}`) })
    const { rows } = await client.query(`UPDATE gallery_categories SET ${sets.join(',')},updated_at=now()
      WHERE id=$1 AND organization_id=$2 RETURNING id,name,sort_order,visible,is_default`, params)
    await galleryLog(client, user, 'gallery.category.update', categoryId, patch)
    return { id: rows[0].id, name: rows[0].name, sortOrder: rows[0].sort_order, visible: rows[0].visible, isDefault: rows[0].is_default }
  })
}

export async function deleteGalleryCategory(user, categoryId) {
  adminOnly(user)
  return withUserContext(user, async (client) => {
    const current = (await client.query('SELECT * FROM gallery_categories WHERE id=$1 AND organization_id=$2 FOR UPDATE', [categoryId, user.organization.id])).rows[0]
    if (!current) throw error('未找到该分类。', 404)
    if (current.is_default) throw error(`「${DEFAULT_CATEGORY_NAME}」是系统兜底分类，不能删除。`, 409)
    const fallback = await ensureDefaultCategory(user.organization.id, client)
    // 分类删掉后作品不能失联：先整体挪到「未分类」，再删分类
    const moved = await client.query('UPDATE gallery_submissions SET category_id=$1,updated_at=now() WHERE organization_id=$2 AND category_id=$3', [fallback.id, user.organization.id, categoryId])
    await client.query('DELETE FROM gallery_categories WHERE id=$1 AND organization_id=$2', [categoryId, user.organization.id])
    await galleryLog(client, user, 'gallery.category.delete', categoryId, { name: current.name, movedWorks: moved.rowCount })
    return { deleted: true, movedWorks: moved.rowCount, fallbackId: fallback.id }
  })
}

export async function reorderGalleryCategories(user, body = {}) {
  adminOnly(user)
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : []
  if (!ids.length) throw error('请提供分类顺序。', 400)
  return withUserContext(user, async (client) => {
    const owned = (await client.query('SELECT id FROM gallery_categories WHERE organization_id=$1 AND NOT is_default', [user.organization.id])).rows.map((row) => row.id)
    const allowed = new Set(owned)
    let order = 0
    for (const id of ids) {
      if (!allowed.has(id)) continue
      await client.query('UPDATE gallery_categories SET sort_order=$1,updated_at=now() WHERE id=$2 AND organization_id=$3', [++order, id, user.organization.id])
    }
    await galleryLog(client, user, 'gallery.category.reorder', user.organization.id, { ids: ids.filter((id) => allowed.has(id)) })
    return listGalleryCategories(user)
  })
}

export async function assignGalleryCategory(user, submissionId, body = {}) {
  adminOnly(user)
  const target = String(body.categoryId || '')
  return withUserContext(user, async (client) => {
    const submission = (await client.query('SELECT id FROM gallery_submissions WHERE id=$1 AND organization_id=$2 FOR UPDATE', [submissionId, user.organization.id])).rows[0]
    if (!submission) throw error('未找到该投稿。', 404)
    let categoryId = null
    if (target) {
      const category = (await client.query('SELECT id,is_default FROM gallery_categories WHERE id=$1 AND organization_id=$2', [target, user.organization.id])).rows[0]
      if (!category) throw error('未找到该分类。', 404)
      categoryId = category.id
    }
    await client.query('UPDATE gallery_submissions SET category_id=$1,updated_at=now() WHERE id=$2', [categoryId, submissionId])
    await galleryLog(client, user, 'gallery.category.assign', submissionId, { categoryId })
    return { submissionId, categoryId }
  })
}

async function publicCategoryList(organizationId) {
  const fallback = await ensureDefaultCategory(organizationId)
  const { rows } = await query(`SELECT c.id,c.name,c.sort_order,c.is_default,
      (SELECT count(*)::int FROM gallery_submissions gs WHERE gs.organization_id=c.organization_id AND NOT gs.blocked
        AND gs.published_at IS NOT NULL AND gs.published_snapshot IS NOT NULL AND gs.published_image IS NOT NULL
        AND (gs.category_id=c.id OR (c.is_default AND gs.category_id IS NULL))) AS work_count
    FROM gallery_categories c WHERE c.organization_id=$1 AND (c.visible OR c.is_default) ORDER BY c.is_default,c.sort_order,c.created_at`, [organizationId])
  return { fallback, categories: rows.map((row) => ({ id: row.id, name: row.name, workCount: row.work_count, isDefault: row.is_default })) }
}
export async function listManagedGallerySubmissions(user, options = {}) {
  adminOnly(user)
  const { page, pageSize } = galleryPage(options)
  const base = `FROM gallery_submissions gs JOIN user_documents d ON d.id=gs.document_id JOIN users u ON u.id=gs.owner_user_id WHERE gs.organization_id=$1 AND app_can_read_student(gs.owner_user_id,gs.organization_id,d.campus_id)`
  return withUserContext(user, async client => {
    const stats = (await client.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE ${statusSql} IN ('review','queued','running','waiting_budget','stale','error'))::int AS pending,count(*) FILTER(WHERE gs.published_at IS NOT NULL AND NOT gs.blocked AND gs.source='系统精选' AND NOT gs.student_submitted)::int AS selected ${base}`, [user.organization.id])).rows[0]
    const filter = ` AND ($2='' OR ${statusSql}=$2) AND ($3='' OR gs.source=$3)`
    const params = [user.organization.id, String(options.status || ''), String(options.source || '')]
    const total = (await client.query(`SELECT count(*)::int AS total ${base}${filter}`, params)).rows[0].total
    const { rows } = await client.query(`SELECT ${listColumns},d.title AS document_title,CASE WHEN gs.review_state='legacy' THEN d.data END AS document_data,u.display_name AS author_name,
      EXISTS(SELECT 1 FROM gallery_jobs j WHERE j.submission_id=gs.id AND j.content_key=gs.content_key AND j.rule_version=gs.rule_version AND j.state='error') AS can_retry
      ${base}${filter} ORDER BY gs.updated_at DESC,gs.id LIMIT $4 OFFSET $5`, [...params, pageSize, (page - 1) * pageSize])
    return { works: rows.map(row => workRow(row)), total, stats, page, pageSize }
  })
}
export async function listOwnGallerySubmissions(user) {
  studentOnly(user)
  return (await queryAsUser(user, `SELECT ${listColumns},d.title AS document_title,CASE WHEN gs.review_state='legacy' THEN d.data END AS document_data FROM gallery_submissions gs
    JOIN user_documents d ON d.id=gs.document_id WHERE gs.owner_user_id=$1 AND gs.organization_id=$2 ORDER BY gs.updated_at DESC LIMIT 500`, [user.id, user.organization.id])).rows.map((row) => workRow(row))
}
export async function listPublicGalleryWorks(options = {}) {
  const { page, pageSize } = galleryPage(options)
  const base = `FROM gallery_submissions gs JOIN user_documents d ON d.id=gs.document_id AND d.deleted_at IS NULL JOIN users u ON u.id=gs.owner_user_id AND u.status='active' WHERE NOT gs.blocked AND gs.published_at IS NOT NULL AND gs.published_snapshot IS NOT NULL AND gs.published_image IS NOT NULL`
  // 分类按钮读后台建的真实分类；作品没归类（category_id 为空）的一律算进「未分类」
  const organizationId = String(options.organizationId || '')
  const categoryId = String(options.categoryId || '').slice(0, 64)
  let filter = '', params = []
  if (organizationId) {
    const { fallback, categories } = await publicCategoryList(organizationId)
    const picked = categories.find((item) => item.id === categoryId)
    if (categoryId && !picked) filter = ' AND FALSE'
    else if (picked?.isDefault) { filter = ' AND (gs.category_id IS NULL OR gs.category_id=$1)'; params = [picked.id] }
    else if (picked) { filter = ' AND gs.category_id=$1'; params = [picked.id] }
    const total = (await query(`SELECT count(*)::int AS total ${base}${filter}`, params)).rows[0].total
    const { rows } = await query(`SELECT ${listColumns} ${base}${filter} ORDER BY gs.published_at DESC,gs.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, (page - 1) * pageSize])
    const works = rows.map(row => ({ ...workRow(row, true), status: 'published' }))
    return { works, total, page, pageSize, categories, defaultCategoryId: fallback.id, courses: categories.map(item => item.name) }
  }
  // 没传机构（未登录浏览）时只给作品，不给分类
  const total = (await query(`SELECT count(*)::int AS total ${base}`)).rows[0].total
  const { rows } = await query(`SELECT ${listColumns} ${base} ORDER BY gs.published_at DESC,gs.id LIMIT $1 OFFSET $2`, [pageSize, (page - 1) * pageSize])
  return { works: rows.map(row => ({ ...workRow(row, true), status: 'published' })), total, page, pageSize, categories: [], courses: [] }
}
export async function accessibleSubmission(user, submissionId) {
  if (!['admin', 'student'].includes(user.role)) throw error('没有投稿管理权限。', 403)
  const { rows } = await queryAsUser(user, `SELECT gs.* FROM gallery_submissions gs JOIN user_documents d ON d.id=gs.document_id
    WHERE gs.id=$1 AND gs.organization_id=$2 AND app_can_read_student(gs.owner_user_id,gs.organization_id,d.campus_id)`, [submissionId, user.organization.id])
  if (!rows[0] || (user.role === 'student' && rows[0].owner_user_id !== user.id)) throw error('未找到投稿或没有权限。', 404)
  return rows[0]
}
export async function galleryImage(user, submissionId, review = false) {
  if (!review) {
    const { rows } = await query(`SELECT gs.published_image FROM gallery_submissions gs JOIN user_documents d ON d.id=gs.document_id AND d.deleted_at IS NULL
      JOIN users u ON u.id=gs.owner_user_id AND u.status='active' WHERE gs.id=$1 AND NOT gs.blocked AND gs.published_at IS NOT NULL`, [submissionId])
    if (!rows[0]?.published_image) throw error('作品已下架或不存在。', 404)
    return rows[0].published_image
  }
  const row = await accessibleSubmission(user, submissionId)
  if (row.image_data) return row.image_data
  return (await prepareGalleryArtwork(user, await galleryDocument(user, row.document_id))).image
}
export async function submitOwnGalleryDocument(user, documentId, form = {}, automatic = false) {
  studentOnly(user)
  const consent = await getGalleryConsent(user)
  if (!consent.granted || (automatic && !consent.opted_in)) throw error('没有有效的机构公开授权或未参与自动精选。', 409)
  if (!automatic && form.acceptPublication !== true) throw error('请确认同意将本作品在平台广场公开展示。')
  const settings = await getAuditSettings(user.organization.id)
  if (automatic && (!settings.aiAudit || !settings.autoSelect)) return null
  const artwork = await prepareGalleryArtwork(user, await galleryDocument(user, documentId), automatic ? {} : form)
  // 标题和介绍会在广场公开展示，过一遍统一风控（以前只在浏览器里查 4 个词，绕过前端就能发）。
  // 系统自动精选遇到不合适的直接跳过，不算违规。
  const verdict = await checkContent(user, `${artwork.snapshot.title}\n${artwork.snapshot.description}`, { scope: 'gallery', record: !automatic, countForBan: !automatic })
  if (!verdict.ok) {
    if (automatic) return null
    throw error(verdict.message, verdict.banned ? 403 : 400)
  }
  return withUserContext(user, async (client) => {
    await lockGalleryStudent(client, user.organization.id, user.id)
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gallery-doc:${documentId}`])
    const validConsent = (await client.query('SELECT * FROM gallery_consents WHERE organization_id=$1 AND student_id=$2', [user.organization.id, user.id])).rows[0]
    const validDoc = (await client.query('SELECT * FROM user_documents WHERE id=$1 AND deleted_at IS NULL FOR SHARE', [documentId])).rows[0]
    if (!validConsent?.granted || (automatic && !validConsent.opted_in) || !validDoc || sourceIdentity(validDoc) !== artwork.snapshot.sourceKey) throw error('作品或机构授权已变化，请刷新后重试。', 409)
    const found = (await client.query('SELECT * FROM gallery_submissions WHERE document_id=$1 AND owner_user_id=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE', [documentId, user.id])).rows[0]
    if (found?.blocked) throw error('这件作品已撤回或下架，不能自动重新发布，请联系管理员处理。', 409)
    const submissionId = found?.id || galleryId()
    if (found?.content_key === artwork.contentKey && found.rule_version === settings.version) {
      let state = found.review_state
      if (!automatic && !found.student_submitted) {
        if (state === 'not_selected') {
          state = 'review'
          const duplicates = (await client.query("SELECT published_snapshot FROM gallery_submissions WHERE organization_id=$1 AND document_id<>$2 AND published_at IS NOT NULL AND NOT blocked", [user.organization.id, documentId])).rows
          const duplicate = duplicates.some(({ published_snapshot: snap }) => snap && (snap.imageHash === artwork.imageHash || (settings.duplicateCheck && imageDistance(snap.perceptualHash, artwork.perceptualHash) <= 5)))
          if (settings.aiAudit && settings.autoPublish && found.ai_result?.safety === 'safe' && !duplicate) state = 'published'
        }
        await client.query(`UPDATE gallery_submissions SET student_submitted=TRUE,source='小画家投稿',review_state=$2,
          published_snapshot=CASE WHEN $2='published' THEN snapshot ELSE published_snapshot END,published_image=CASE WHEN $2='published' THEN image_data ELSE published_image END,
          published_at=CASE WHEN $2='published' THEN now() ELSE published_at END,updated_at=now() WHERE id=$1`, [submissionId, state])
        await galleryLog(client, user, 'gallery.submit', submissionId, { reused: true, state })
      }
      return { id: submissionId, status: state, existed: true }
    }
    const state = settings.aiAudit ? 'queued' : 'review', reason = settings.aiAudit ? '等待 AI 审核' : 'AI 审核未启用，等待人工审核'
    await client.query(`INSERT INTO gallery_submissions(id,organization_id,owner_user_id,document_id,source,review_state,snapshot,image_data,content_key,image_hash,perceptual_hash,rule_version,student_submitted,automatic_review_reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id) DO UPDATE SET source=$5,review_state=$6,snapshot=$7,image_data=$8,
      content_key=$9,image_hash=$10,perceptual_hash=$11,rule_version=$12,student_submitted=gallery_submissions.student_submitted OR $13,
      automatic_review_reason=$14,manual_review_reason='',ai_result=NULL,quality_score=NULL,decision_by='pending',updated_at=now()`,
    [submissionId, user.organization.id, user.id, documentId, automatic ? '系统精选' : '小画家投稿', state, JSON.stringify(artwork.snapshot), artwork.image, artwork.contentKey, artwork.imageHash, artwork.perceptualHash, settings.version, !automatic, reason])
    if (settings.aiAudit) await client.query(`INSERT INTO gallery_jobs(id,organization_id,owner_user_id,actor_user_id,document_id,submission_id,content_key,rules,rule_version,snapshot,image_data)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
    [galleryId('gj'), user.organization.id, user.id, user.id, documentId, submissionId, artwork.contentKey, JSON.stringify({ ...settings, modelConfigKey: modelIdentity(settings).configKey }), settings.version, JSON.stringify(artwork.snapshot), artwork.image])
    await galleryLog(client, user, automatic ? 'gallery.selected_candidate' : 'gallery.submit', submissionId, { documentId, version: settings.version })
    return { id: submissionId, status: state }
  })
}
export async function reviewGallerySubmission(user, submissionId, action, reason = '', expectedUpdatedAt) {
  adminOnly(user)
  if (!['approved', 'rejected', 'offline'].includes(action)) throw error('无效的审核操作。')
  if (String(reason).trim().length < 3) throw error('请填写人工审核、纠错或下架理由。')
  const row = await accessibleSubmission(user, submissionId)
  if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== row.updated_at.getTime()) throw error('作品审核状态已变化，请刷新并查看当前作品后再处理。', 409)
  if (action === 'approved' && row.review_state === 'withdrawn') throw error('作者本人或机构已撤回授权，不能重新上架。', 409)
  let artwork
  if (action === 'approved') {
    if (!(await getGalleryConsent(user, row.owner_user_id)).granted) throw error('机构公开授权已失效，不能上架。', 409)
    const doc = await galleryDocument(user, row.document_id)
    if (row.review_state === 'legacy') artwork = await prepareGalleryArtwork(await galleryOwner(row.owner_user_id), doc)
    else if (sourceIdentity(doc) !== row.snapshot.sourceKey) throw error('作品已更新，请重新提交当前版本。', 409)
  }
  return withUserContext(user, async (client) => {
    await lockGalleryStudent(client, user.organization.id, row.owner_user_id)
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gallery-doc:${row.document_id}`])
    const doc = action === 'approved' ? (await client.query('SELECT * FROM user_documents WHERE id=$1 AND deleted_at IS NULL FOR SHARE', [row.document_id])).rows[0] : null
    const current = (await client.query('SELECT * FROM gallery_submissions WHERE id=$1 FOR UPDATE', [submissionId])).rows[0]
    if (current.updated_at.toISOString() !== row.updated_at.toISOString()) throw error('投稿已发生变化，请刷新后重试。', 409)
    if (action === 'approved') {
      const consent = (await client.query('SELECT granted FROM gallery_consents WHERE organization_id=$1 AND student_id=$2', [user.organization.id, row.owner_user_id])).rows[0]
      if (!consent?.granted || !doc || sourceIdentity(doc) !== (artwork?.snapshot || current.snapshot).sourceKey) throw error('作品或授权已变化，不能上架，请刷新后重试。', 409)
    }
    const state = action === 'approved' ? 'published' : action === 'rejected' ? 'rejected' : 'offline'
    const snap = artwork?.snapshot || row.snapshot, picture = artwork?.image || row.image_data
    await client.query(`UPDATE gallery_submissions SET review_state=$1,manual_review_status=$2,manual_review_reason=$3,blocked=$4,
      snapshot=CASE WHEN $5 THEN $6::jsonb ELSE snapshot END,image_data=CASE WHEN $5 THEN $7 ELSE image_data END,
      published_snapshot=CASE WHEN $5 THEN $6::jsonb ELSE published_snapshot END,published_image=CASE WHEN $5 THEN $7 ELSE published_image END,
      published_at=CASE WHEN $5 THEN now() ELSE NULL END,decision_by='manual',updated_at=now() WHERE id=$8`,
    [state, action === 'approved' ? 'approved' : action === 'rejected' ? 'rejected' : 'pending', String(reason).slice(0, 800), action === 'offline', action === 'approved', JSON.stringify(snap), picture, submissionId])
    await galleryLog(client, user, `gallery.${action}`, submissionId, { reason: String(reason).slice(0, 800) })
    return { id: submissionId, status: state }
  })
}
export async function withdrawGallerySubmission(user, submissionId) {
  studentOnly(user)
  await accessibleSubmission(user, submissionId)
  await withUserContext(user, async (client) => {
    await lockGalleryStudent(client, user.organization.id, user.id)
    await client.query("UPDATE gallery_submissions SET review_state='withdrawn',blocked=TRUE,published_at=NULL,updated_at=now() WHERE id=$1 AND owner_user_id=$2", [submissionId, user.id])
    await galleryLog(client, user, 'gallery.withdraw', submissionId)
  })
  return { status: 'withdrawn' }
}
export async function retryGallerySubmission(user, submissionId, body) {
  adminOnly(user)
  if (body.confirmExtraCost !== true) throw error('重新审核可能再次计费，请明确确认。')
  const row = await accessibleSubmission(user, submissionId)
  const rules = await getAuditSettings(user.organization.id)
  if (!rules.aiAudit || platformBudget() <= 0 || row.blocked || row.decision_by === 'manual') throw error('审核暂停或作品已由人工处理，不能重新调用。', 409)
  return withUserContext(user, async client => {
    await lockGalleryStudent(client, user.organization.id, row.owner_user_id)
    const doc = (await client.query('SELECT * FROM user_documents WHERE id=$1 AND deleted_at IS NULL FOR SHARE', [row.document_id])).rows[0]
    const current = (await client.query('SELECT * FROM gallery_submissions WHERE id=$1 FOR UPDATE', [row.id])).rows[0]
    const consent = (await client.query('SELECT * FROM gallery_consents WHERE organization_id=$1 AND student_id=$2', [user.organization.id, row.owner_user_id])).rows[0]
    if (!doc || sourceIdentity(doc) !== row.snapshot.sourceKey || current.blocked || current.decision_by === 'manual' || current.updated_at.getTime() !== row.updated_at.getTime() || !consent?.granted || (!current.student_submitted && !consent.opted_in)) throw error('作品或授权已变更，请刷新后重试。', 409)
    const job = (await client.query("SELECT * FROM gallery_jobs WHERE submission_id=$1 AND content_key=$2 AND rule_version=$3 AND state='error' ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [row.id, row.content_key, row.rule_version])).rows[0]
    if (!job || modelIdentity(job.rules).configKey !== job.rules.modelConfigKey) throw error('没有可重试的失败任务，或模型配置已变更，请使用新规则重新投稿。', 409)
    await galleryLog(client, user, 'gallery.retry', row.id, { jobId: job.id, previousError: job.error_message, previousRequestSent: job.request_sent, attempts: job.attempts })
    await client.query("UPDATE gallery_jobs SET state='queued',request_sent=FALSE,error_message='',lease_until=NULL,updated_at=now() WHERE id=$1", [job.id])
    await client.query("UPDATE gallery_submissions SET review_state='queued',decision_by='pending',automatic_review_reason='管理员已确认重新审核',updated_at=now() WHERE id=$1", [row.id])
    return { id: job.id, status: 'queued' }
  })
}
export async function createGalleryTrial(user, body) {
  adminOnly(user)
  const rules = validateGalleryRules({ ...galleryDefaultRules, ...body.rules, aiAudit: false })
  if (!rules.provider || !rules.model || !rules.requestCostCeiling || !rules.dailyBudget) throw error('试审前请选择模型，并填写已确认的单次费用上限和每日预算。')
  rules.modelConfigKey = modelIdentity(rules).configKey
  if (platformBudget() <= 0) throw error('平台暂未授权付费审核，请先配置费用上限。', 409)
  const doc = await galleryDocument(user, body.documentId)
  if (!(await getGalleryConsent(user, doc.owner_user_id)).granted) throw error('作品尚未登记机构授权，不能发送给模型。', 409)
  const artwork = await prepareGalleryArtwork(await galleryOwner(doc.owner_user_id), doc), jobId = galleryId('gj')
  await query(`INSERT INTO gallery_jobs(id,organization_id,owner_user_id,actor_user_id,document_id,content_key,rules,rule_version,snapshot,image_data,is_trial)
    VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9,TRUE)`, [jobId, user.organization.id, doc.owner_user_id, user.id, doc.id, artwork.contentKey, JSON.stringify(rules), JSON.stringify(artwork.snapshot), artwork.image])
  return { id: jobId, status: 'queued' }
}
export async function galleryTrialWorks(user) {
  adminOnly(user)
  return (await queryAsUser(user, `SELECT d.id,d.title,u.display_name AS author,c.granted FROM user_documents d JOIN users u ON u.id=d.owner_user_id
    LEFT JOIN gallery_consents c ON c.student_id=u.id AND c.organization_id=d.organization_id
    WHERE d.organization_id=$1 AND d.document_type='project' AND d.deleted_at IS NULL AND COALESCE(d.data->>'finalVersionId','')<>''
    AND app_can_read_student(d.owner_user_id,d.organization_id,d.campus_id) ORDER BY d.updated_at DESC LIMIT 200`, [user.organization.id])).rows
}
export async function galleryJobResult(user, jobId) {
  adminOnly(user)
  const { rows } = await queryAsUser(user, `SELECT j.id,j.state,j.result,j.error_message,j.is_trial,j.created_at,j.updated_at FROM gallery_jobs j
    JOIN user_documents d ON d.id=j.document_id WHERE j.id=$1 AND j.organization_id=$2
    AND app_can_read_student(j.owner_user_id,j.organization_id,d.campus_id)`, [jobId, user.organization.id])
  if (!rows[0]) throw error('未找到审核任务。', 404)
  return rows[0]
}
export async function galleryHistory(user) {
  adminOnly(user)
  return (await queryAsUser(user, `SELECT a.id,a.action,a.detail,a.created_at FROM audit_logs a WHERE a.organization_id=$1 AND a.resource_type='gallery'
    AND (a.actor_user_id=$2 OR EXISTS(SELECT 1 FROM gallery_submissions gs JOIN user_documents d ON d.id=gs.document_id WHERE gs.id=a.resource_id
    AND app_can_read_student(gs.owner_user_id,gs.organization_id,d.campus_id))) ORDER BY a.created_at DESC LIMIT 200`, [user.organization.id, user.id])).rows
}
export async function galleryUsage(user) {
  adminOnly(user)
  const { rows } = await query("SELECT calls,reserved_cost FROM gallery_daily_usage WHERE organization_id=$1 AND day=(now() AT TIME ZONE 'Asia/Shanghai')::date", [user.organization.id])
  return { calls: rows[0]?.calls || 0, reservedCost: Number(rows[0]?.reserved_cost || 0), platformBudget: platformBudget() }
}
