import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { logAudit } from './auth.js'
import { isDatabaseConfigured, query, withTransaction } from './db.js'

const EDITIONS = new Set(['junior', 'starter'])
const STATUSES = new Set(['enabled', 'disabled', 'archived'])

function newId(prefix) { return `${prefix}_${randomBytes(12).toString('base64url')}` }
function cleanText(value, max = 2000) { return String(value ?? '').trim().slice(0, max) }
function fail(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; return error }
function normalizeEditions(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  const result = [...new Set(values.map((item) => String(item).trim()).filter((item) => EDITIONS.has(item)))]
  if (!result.length) throw fail('至少选择一个适用版本')
  return result
}
function normalizeStatus(value, fallback = 'enabled') {
  const status = cleanText(value || fallback, 20)
  if (!STATUSES.has(status)) throw fail('提示词状态不正确')
  return status
}
function normalizeImageUrl(value) {
  const imageUrl = cleanText(value, 1000)
  if (!imageUrl) return ''
  if (/^(https?:\/\/|\/api\/prompt-library-icons\/)[^\s]+$/i.test(imageUrl)) return imageUrl
  throw fail('提示词图标图片地址不正确')
}
function normalizeCategory(payload = {}) {
  const name = cleanText(payload.name, 60)
  if (!name) throw fail('请填写分类名称')
  return { name, icon: cleanText(payload.icon || '✨', 12) || '✨', iconImageUrl: normalizeImageUrl(payload.iconImageUrl), targetEditions: normalizeEditions(payload.targetEditions), sortOrder: Number(payload.sortOrder || 0), status: normalizeStatus(payload.status) }
}
function normalizePrompt(payload = {}) {
  const label = cleanText(payload.label, 60)
  const prompt = cleanText(payload.prompt, 2000)
  if (!label) throw fail('请填写提示词名称')
  if (!prompt) throw fail('请填写实际提示词')
  const categoryId = cleanText(payload.categoryId, 100)
  if (!categoryId) throw fail('请选择提示词分类')
  return { categoryId, label, icon: cleanText(payload.icon || '✨', 12) || '✨', iconImageUrl: normalizeImageUrl(payload.iconImageUrl), prompt, targetEditions: normalizeEditions(payload.targetEditions), sortOrder: Number(payload.sortOrder || 0), status: normalizeStatus(payload.status) }
}
function toCategory(row) {
  return { id: row.id, organizationId: row.organization_id, name: row.name, icon: row.icon || '✨', iconImageUrl: row.icon_image_url || '', targetEditions: row.target_editions || ['junior', 'starter'], sortOrder: Number(row.sort_order || 0), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }
}
function toPrompt(row) {
  return { id: row.id, organizationId: row.organization_id, categoryId: row.category_id, label: row.label, icon: row.icon || '✨', iconImageUrl: row.icon_image_url || '', prompt: row.prompt, targetEditions: row.target_editions || ['junior', 'starter'], sortOrder: Number(row.sort_order || 0), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }
}
function dataPath() {
  const dir = process.env.AI_DATA_DIR || join(process.cwd(), 'server', 'data-fallback')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'prompt-library.json')
}
function readLocal() {
  try { return JSON.parse(readFileSync(dataPath(), 'utf8')) } catch { return { categories: [], prompts: [] } }
}
function writeLocal(data) { writeFileSync(dataPath(), JSON.stringify(data, null, 2), 'utf8') }
function orgId(user) { return user?.organization?.id || 'demo-organization' }
function assertAdmin(user) { if (user?.role && user.role !== 'admin') throw fail('仅管理员可以管理提示词库', 403) }

export async function listPromptLibrary(user, edition = '') {
  const target = EDITIONS.has(edition) ? edition : ''
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocal()
    const categories = data.categories.filter((item) => item.organizationId === orgId(user) && item.status === 'enabled' && (!target || item.targetEditions.includes(target)))
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const categoryIds = new Set(categories.map((item) => item.id))
    const prompts = data.prompts.filter((item) => categoryIds.has(item.categoryId) && item.status === 'enabled' && (!target || item.targetEditions.includes(target)))
      .sort((a, b) => a.sortOrder - b.sortOrder)
    return { categories, prompts }
  }
  const values = [orgId(user)]
  const categoryFilter = target ? ` AND $2 = ANY(c.target_editions)` : ''
  if (target) values.push(target)
  const categories = await query(`SELECT * FROM prompt_categories c WHERE c.organization_id=$1 AND c.status='enabled'${categoryFilter} ORDER BY c.sort_order ASC, c.created_at ASC`, values)
  const promptValues = [orgId(user)]
  const promptFilter = target ? ` AND $2 = ANY(p.target_editions)` : ''
  if (target) promptValues.push(target)
  const prompts = await query(`SELECT p.* FROM prompts p JOIN prompt_categories c ON c.id=p.category_id AND c.organization_id=p.organization_id WHERE p.organization_id=$1 AND p.status='enabled' AND c.status='enabled'${promptFilter} ORDER BY p.category_id, p.sort_order ASC, p.created_at ASC`, promptValues)
  return { categories: categories.rows.map(toCategory), prompts: prompts.rows.map(toPrompt) }
}

export async function listAdminPromptLibrary(user) {
  assertAdmin(user)
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocal()
    const categories = data.categories.filter((item) => item.organizationId === orgId(user)).sort((a, b) => a.sortOrder - b.sortOrder)
    const categoryIds = new Set(categories.map((item) => item.id))
    return { categories, prompts: data.prompts.filter((item) => categoryIds.has(item.categoryId)).sort((a, b) => a.sortOrder - b.sortOrder) }
  }
  const [categories, prompts] = await Promise.all([
    query('SELECT * FROM prompt_categories WHERE organization_id=$1 ORDER BY sort_order ASC, created_at ASC', [orgId(user)]),
    query('SELECT * FROM prompts WHERE organization_id=$1 ORDER BY category_id, sort_order ASC, created_at ASC', [orgId(user)]),
  ])
  return { categories: categories.rows.map(toCategory), prompts: prompts.rows.map(toPrompt) }
}

export async function savePromptCategory(user, payload = {}, id = '') {
  assertAdmin(user)
  const value = normalizeCategory(payload)
  const organizationId = orgId(user)
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocal(); const index = data.categories.findIndex((item) => item.id === id && item.organizationId === organizationId)
    const next = { ...value, id: id || newId('pcat'), organizationId, createdAt: data.categories[index]?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
    if (index < 0) data.categories.push(next); else data.categories[index] = next
    writeLocal(data); return next
  }
  if (id) {
    const result = await query(`UPDATE prompt_categories SET name=$1, icon=$2, icon_image_url=$3, target_editions=$4, sort_order=$5, status=$6, updated_by_user_id=$7, updated_at=now() WHERE id=$8 AND organization_id=$9 RETURNING *`, [value.name, value.icon, value.iconImageUrl, value.targetEditions, value.sortOrder, value.status, user.id, id, organizationId])
    if (!result.rows[0]) throw fail('提示词分类不存在', 404)
    await logAudit(user.id, organizationId, 'prompt_category.update', 'prompt_category', id, value); return toCategory(result.rows[0])
  }
  const result = await query(`INSERT INTO prompt_categories (id,organization_id,name,icon,icon_image_url,target_editions,sort_order,status,created_by_user_id,updated_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`, [newId('pcat'), organizationId, value.name, value.icon, value.iconImageUrl, value.targetEditions, value.sortOrder, value.status, user.id])
  await logAudit(user.id, organizationId, 'prompt_category.create', 'prompt_category', result.rows[0].id, value); return toCategory(result.rows[0])
}

export async function savePrompt(user, payload = {}, id = '') {
  assertAdmin(user)
  const value = normalizePrompt(payload)
  const organizationId = orgId(user)
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocal(); const category = data.categories.find((item) => item.id === value.categoryId && item.organizationId === organizationId && item.status !== 'archived')
    if (!category) throw fail('提示词分类不存在或已归档', 404)
    const index = data.prompts.findIndex((item) => item.id === id && item.organizationId === organizationId)
    const next = { ...value, id: id || newId('prompt'), organizationId, createdAt: data.prompts[index]?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
    if (index < 0) data.prompts.push(next); else data.prompts[index] = next
    writeLocal(data); return next
  }
  const category = await query('SELECT id FROM prompt_categories WHERE id=$1 AND organization_id=$2 AND status<>\'archived\' LIMIT 1', [value.categoryId, organizationId])
  if (!category.rows[0]) throw fail('提示词分类不存在或已归档', 404)
  if (id) {
    const result = await query(`UPDATE prompts SET category_id=$1,label=$2,icon=$3,icon_image_url=$4,prompt=$5,target_editions=$6,sort_order=$7,status=$8,updated_by_user_id=$9,updated_at=now() WHERE id=$10 AND organization_id=$11 RETURNING *`, [value.categoryId, value.label, value.icon, value.iconImageUrl, value.prompt, value.targetEditions, value.sortOrder, value.status, user.id, id, organizationId])
    if (!result.rows[0]) throw fail('提示词不存在', 404)
    await logAudit(user.id, organizationId, 'prompt.update', 'prompt', id, value); return toPrompt(result.rows[0])
  }
  const result = await query(`INSERT INTO prompts (id,organization_id,category_id,label,icon,icon_image_url,prompt,target_editions,sort_order,status,created_by_user_id,updated_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`, [newId('prompt'), organizationId, value.categoryId, value.label, value.icon, value.iconImageUrl, value.prompt, value.targetEditions, value.sortOrder, value.status, user.id])
  await logAudit(user.id, organizationId, 'prompt.create', 'prompt', result.rows[0].id, value); return toPrompt(result.rows[0])
}

export async function removePrompt(user, id, mode = 'archive') {
  assertAdmin(user); const organizationId = orgId(user)
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocal(); const index = data.prompts.findIndex((item) => item.id === id && item.organizationId === organizationId)
    if (index < 0) throw fail('提示词不存在', 404)
    if (mode === 'permanent') data.prompts.splice(index, 1); else data.prompts[index].status = 'archived'
    writeLocal(data); return { ok: true, mode }
  }
  const result = mode === 'permanent'
    ? await query('DELETE FROM prompts WHERE id=$1 AND organization_id=$2 RETURNING id', [id, organizationId])
    : await query("UPDATE prompts SET status='archived', updated_by_user_id=$3, updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id", [id, organizationId, user.id])
  if (!result.rows[0]) throw fail('提示词不存在', 404)
  await logAudit(user.id, organizationId, mode === 'permanent' ? 'prompt.delete' : 'prompt.archive', 'prompt', id, {})
  return { ok: true, mode }
}

export async function removePromptCategory(user, id, mode = 'archive') {
  assertAdmin(user); const organizationId = orgId(user)
  if (!isDatabaseConfigured()) {
    const data = readLocal(); const index = data.categories.findIndex((item) => item.id === id && item.organizationId === organizationId)
    if (index < 0) throw fail('提示词分类不存在', 404)
    if (data.prompts.some((item) => item.categoryId === id)) throw fail('该分类下仍有提示词，请先永久删除提示词')
    if (mode === 'permanent') data.categories.splice(index, 1); else data.categories[index].status = 'archived'
    writeLocal(data); return { ok: true, mode }
  }
  const child = await query('SELECT 1 FROM prompts WHERE category_id=$1 AND organization_id=$2 LIMIT 1', [id, organizationId])
  if (child.rows[0]) throw fail('该分类下仍有提示词，请先永久删除提示词')
  const result = mode === 'permanent'
    ? await query('DELETE FROM prompt_categories WHERE id=$1 AND organization_id=$2 RETURNING id', [id, organizationId])
    : await query("UPDATE prompt_categories SET status='archived', updated_by_user_id=$3, updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id", [id, organizationId, user.id])
  if (!result.rows[0]) throw fail('提示词分类不存在', 404)
  await logAudit(user.id, organizationId, mode === 'permanent' ? 'prompt_category.delete' : 'prompt_category.archive', 'prompt_category', id, {})
  return { ok: true, mode }
}
