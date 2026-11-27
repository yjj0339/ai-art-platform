/* 技能包分类
 * ------------------------------------------------------------------
 * 分类由后台自己建，学生端只拿它做筛选，不参与生成。
 * 规矩与「作品广场分类」保持一致，避免两套口径：
 *   · 每机构固定一条「未分类」兜底（is_default），不可删、不可改名
 *   · 删分类 → 里面的包自动回到「未分类」，绝不连带删包
 *   · 分类名重复直接 409，超长直接 400（不静默截断）
 */
import { randomBytes } from 'node:crypto'
import { logAudit } from './auth.js'
import { query } from './db.js'

export const DEFAULT_PACKAGE_CATEGORY = '未分类'
const NAME_MAX = 20

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function fail(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function assertOrgAdmin(user) {
  if (user?.role !== 'admin' || !user?.organization?.id) throw fail('仅机构管理员可以管理技能包分类', 403)
  const result = await query(
    'SELECT 1 FROM admin_scopes WHERE admin_user_id = $1 AND organization_id = $2 LIMIT 1',
    [user.id, user.organization.id],
  )
  if (!result.rows[0]) throw fail('当前管理员没有机构管理范围', 403)
}

const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ')

function assertName(value) {
  const name = cleanName(value)
  if (!name) throw fail('请填写分类名称')
  if ([...name].length > NAME_MAX) throw fail(`分类名称最多 ${NAME_MAX} 个字，请缩短一些`)
  return name
}

// 每机构一条「未分类」兜底，可重复调用（ON CONFLICT 幂等）。
export async function ensureDefaultPackageCategory(organizationId) {
  const inserted = await query(
    `INSERT INTO ai_skill_package_categories (id, organization_id, name, sort_order, is_default)
     VALUES ($1,$2,$3,9999,TRUE)
     ON CONFLICT (organization_id) WHERE is_default DO NOTHING
     RETURNING id, name`,
    [newId('skillcat'), organizationId, DEFAULT_PACKAGE_CATEGORY],
  )
  if (inserted.rows[0]) return inserted.rows[0]
  const existing = await query(
    'SELECT id, name FROM ai_skill_package_categories WHERE organization_id=$1 AND is_default LIMIT 1',
    [organizationId],
  )
  return existing.rows[0]
}

export async function listPackageCategories(user) {
  await assertOrgAdmin(user)
  await ensureDefaultPackageCategory(user.organization.id)
  // package_count 与列表同口径：按 category_id 精确统计，
  // 未分类那条要把 category_id IS NULL 的也算进去，否则数字会比实际看到的少。
  const result = await query(
    `SELECT c.id, c.name, c.sort_order, c.is_default, c.created_at,
       (SELECT count(*)::int FROM ai_skill_packages p
         WHERE p.organization_id=c.organization_id
           AND (p.category_id=c.id OR (c.is_default AND p.category_id IS NULL))) AS package_count
     FROM ai_skill_package_categories c
     WHERE c.organization_id=$1
     ORDER BY c.is_default, c.sort_order, c.created_at`,
    [user.organization.id],
  )
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    packageCount: row.package_count,
    createdAt: row.created_at,
  }))
}

export async function createPackageCategory(user, body = {}) {
  await assertOrgAdmin(user)
  const name = assertName(body.name)
  if (name === DEFAULT_PACKAGE_CATEGORY) throw fail(`「${DEFAULT_PACKAGE_CATEGORY}」是系统保留分类，请换一个名称`, 409)
  await ensureDefaultPackageCategory(user.organization.id)
  const dup = await query(
    'SELECT 1 FROM ai_skill_package_categories WHERE organization_id=$1 AND name=$2 LIMIT 1',
    [user.organization.id, name],
  )
  if (dup.rows[0]) throw fail('已有同名分类，请换一个名称', 409)
  const next = await query(
    'SELECT COALESCE(max(sort_order),0)+1 AS next FROM ai_skill_package_categories WHERE organization_id=$1 AND NOT is_default',
    [user.organization.id],
  )
  const id = newId('skillcat')
  const result = await query(
    `INSERT INTO ai_skill_package_categories (id, organization_id, name, sort_order)
     VALUES ($1,$2,$3,$4) RETURNING id, name, sort_order, is_default`,
    [id, user.organization.id, name, Number(next.rows[0].next) || 1],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill_package.category.create', 'ai_skill_package_categories', id, { name })
  const row = result.rows[0]
  return { id: row.id, name: row.name, sortOrder: row.sort_order, isDefault: row.is_default, packageCount: 0 }
}

export async function updatePackageCategory(user, categoryId, body = {}) {
  await assertOrgAdmin(user)
  const current = await query(
    'SELECT * FROM ai_skill_package_categories WHERE id=$1 AND organization_id=$2 LIMIT 1',
    [categoryId, user.organization.id],
  )
  const row = current.rows[0]
  if (!row) throw fail('未找到该分类', 404)
  if (row.is_default) throw fail(`「${DEFAULT_PACKAGE_CATEGORY}」是系统兜底分类，不能改名`, 409)
  const name = assertName(body.name)
  if (name === DEFAULT_PACKAGE_CATEGORY) throw fail(`「${DEFAULT_PACKAGE_CATEGORY}」是系统保留分类，请换一个名称`, 409)
  const dup = await query(
    'SELECT 1 FROM ai_skill_package_categories WHERE organization_id=$1 AND name=$2 AND id<>$3 LIMIT 1',
    [user.organization.id, name, categoryId],
  )
  if (dup.rows[0]) throw fail('已有同名分类，请换一个名称', 409)
  const result = await query(
    `UPDATE ai_skill_package_categories SET name=$1, updated_at=now()
     WHERE id=$2 AND organization_id=$3 RETURNING id, name, sort_order, is_default`,
    [name, categoryId, user.organization.id],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill_package.category.update', 'ai_skill_package_categories', categoryId, { from: row.name, to: name })
  const updated = result.rows[0]
  const count = await query(
    'SELECT count(*)::int AS n FROM ai_skill_packages WHERE organization_id=$1 AND category_id=$2',
    [user.organization.id, categoryId],
  )
  return { id: updated.id, name: updated.name, sortOrder: updated.sort_order, isDefault: updated.is_default, packageCount: count.rows[0].n }
}

export async function deletePackageCategory(user, categoryId) {
  await assertOrgAdmin(user)
  const current = await query(
    'SELECT * FROM ai_skill_package_categories WHERE id=$1 AND organization_id=$2 LIMIT 1',
    [categoryId, user.organization.id],
  )
  const row = current.rows[0]
  if (!row) throw fail('未找到该分类', 404)
  if (row.is_default) throw fail(`「${DEFAULT_PACKAGE_CATEGORY}」是系统兜底分类，不能删除`, 409)
  const fallback = await ensureDefaultPackageCategory(user.organization.id)
  // 先搬包再删分类：包不能失联。已转出的玩法也把分类清空，
  // 否则学生端会指着一个不存在的分类 id，标签直接消失。
  const movedPackages = await query(
    'UPDATE ai_skill_packages SET category_id=$1, updated_at=now() WHERE organization_id=$2 AND category_id=$3',
    [fallback.id, user.organization.id, categoryId],
  )
  await query(
    'UPDATE ai_skills SET category_id=NULL WHERE organization_id=$1 AND category_id=$2',
    [user.organization.id, categoryId],
  )
  await query('DELETE FROM ai_skill_package_categories WHERE id=$1 AND organization_id=$2', [categoryId, user.organization.id])
  await logAudit(user.id, user.organization.id, 'ai_skill_package.category.delete', 'ai_skill_package_categories', categoryId, {
    name: row.name, movedPackages: movedPackages.rowCount,
  })
  return { deleted: true, movedPackages: movedPackages.rowCount, fallbackId: fallback.id }
}

// 给一批技能包设分类。categoryId 为空 / 'uncategorized' 时归到「未分类」。
export async function setPackagesCategory(user, ids = [], categoryId = '') {
  await assertOrgAdmin(user)
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean).slice(0, 100)
  if (!list.length) throw fail('请先选择技能包')
  let target = ''
  if (categoryId) {
    const found = await query(
      'SELECT id FROM ai_skill_package_categories WHERE id=$1 AND organization_id=$2 LIMIT 1',
      [categoryId, user.organization.id],
    )
    if (!found.rows[0]) throw fail('分类不存在', 404)
    target = found.rows[0].id
  } else {
    target = (await ensureDefaultPackageCategory(user.organization.id)).id
  }
  const result = await query(
    `UPDATE ai_skill_packages SET category_id=$1, updated_at=now()
     WHERE organization_id=$2 AND id = ANY($3::text[]) RETURNING id`,
    [target, user.organization.id, list],
  )
  // 已转出玩法的卡同步分类，否则学生端标签还是旧的。
  await query(
    `UPDATE ai_skills SET category_id=$1, updated_at=now()
     WHERE organization_id=$2 AND id IN (
       SELECT converted_skill_id FROM ai_skill_packages
       WHERE organization_id=$2 AND id = ANY($3::text[]) AND converted_skill_id IS NOT NULL
     )`,
    [target, user.organization.id, list],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill_package.category.assign', 'ai_skill_packages', list.join(','), {
    categoryId: target, updated: result.rowCount,
  })
  return { ok: true, categoryId: target, updatedIds: result.rows.map((row) => row.id) }
}
