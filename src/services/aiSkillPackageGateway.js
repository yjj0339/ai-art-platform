import { apiClient } from './apiClient'
import { SERVER_AUTH_MODE, saveEditableAiSkill } from './adminAiSkillEditorStore'
import { defaultSkillConfiguration } from '../utils/aiSkillSchema'

/*
 * 技能包（外部 SKILL.md）接口层。
 *
 * 定位：这里是「原料仓库」，不是用户能点的东西。
 * 导入只落一条待整理记录；老师补提示词 → 转成玩法卡 → 测试 → 发布，用户端才看得到。
 */

const LOCAL_KEY = 'admin-ai-skill-packages-demo-v1'
const LOCAL_CATEGORY_KEY = 'admin-ai-skill-package-categories-demo-v1'
// 「未分类」是系统兜底分类，演示模式也要有一条，否则下拉里选不到东西。
const DEFAULT_CATEGORY = { id: 'local-cat-uncategorized', name: '未分类', sortOrder: 9999, isDefault: true }

function dataOf(response) {
  return response?.data || {}
}

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

/* ---------------- 本地演示模式 ---------------- */
// 没有服务端时用 sessionStorage 顶一份，让「上传 → 列表 → 转玩法」这套交互在演示环境也点得动。
function readLocal() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(LOCAL_KEY) || 'null')
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return []
}

function writeLocal(list) {
  window.sessionStorage.setItem(LOCAL_KEY, JSON.stringify(list))
}

function localTitleFromFile(fileName = '') {
  return String(fileName).replace(/\.(md|markdown|zip|txt)$/i, '').replace(/^SKILL$/i, '未命名技能包') || '未命名技能包'
}

/* ---------------- 列表 / 详情 ---------------- */
// options: { status?, categoryId?, keyword? }（兼容旧写法：直接传 status 字符串）
export async function listSkillPackages(options = {}) {
  const opts = typeof options === 'string' ? { status: options } : (options || {})
  if (!SERVER_AUTH_MODE) {
    let list = readLocal()
    if (opts.status) list = list.filter((item) => item.status === opts.status)
    if (opts.categoryId && opts.categoryId !== 'all') {
      list = opts.categoryId === 'uncategorized'
        ? list.filter((item) => !item.categoryId)
        : list.filter((item) => item.categoryId === opts.categoryId)
    }
    if (opts.keyword) {
      const kw = String(opts.keyword).toLowerCase()
      list = list.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(kw))
    }
    return copy(list)
  }
  const params = {}
  if (opts.status) params.status = opts.status
  if (opts.categoryId) params.categoryId = opts.categoryId
  if (opts.keyword) params.keyword = opts.keyword
  const response = await apiClient.get('/admin/ai-skill-packages', { params })
  return dataOf(response).packages || []
}

export async function getSkillPackageDetail(packageId) {
  if (!SERVER_AUTH_MODE) return copy(readLocal().find((item) => item.id === packageId) || null)
  const response = await apiClient.get(`/admin/ai-skill-packages/${encodeURIComponent(packageId)}`)
  return dataOf(response).package || null
}

/* ---------------- 导入 ---------------- */
// items: [{ fileName, content, coverUrl? }]
export async function importSkillPackages(items = []) {
  if (!SERVER_AUTH_MODE) {
    const list = readLocal()
    const imported = []
    const skipped = []
    for (const item of items) {
      const fileName = String(item?.fileName || 'SKILL.md')
      if (list.some((entry) => entry.fileName === fileName)) {
        skipped.push({ fileName, reason: '已导入过同名技能包' })
        continue
      }
      const record = {
        id: `local-pkg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        fileName,
        packageKey: '',
        title: localTitleFromFile(fileName),
        summary: '本地演示模式只记录了文件名，正文解析需要服务端。',
        coverUrl: item?.coverUrl || '',
        promptCandidates: [],
        metadata: {},
        status: 'pending',
        convertedSkillId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      list.unshift(record)
      imported.push(record)
    }
    writeLocal(list)
    return { imported, skipped }
  }
  const response = await apiClient.post('/admin/ai-skill-packages/import', { items })
  return dataOf(response)
}

/* ---------------- 批量操作 ---------------- */
export async function bulkSkillPackages(ids = [], status = '') {
  if (!SERVER_AUTH_MODE) {
    const set = new Set(ids)
    const list = readLocal().map((item) => (set.has(item.id) && item.status !== 'converted' ? { ...item, status } : item))
    writeLocal(list)
    return { ok: true, updatedIds: ids }
  }
  const response = await apiClient.post('/admin/ai-skill-packages/bulk', { ids, status })
  return dataOf(response)
}

export async function removeSkillPackages(ids = []) {
  if (!SERVER_AUTH_MODE) {
    const set = new Set(ids)
    writeLocal(readLocal().filter((item) => !set.has(item.id)))
    return { ok: true, deletedIds: ids }
  }
  const response = await apiClient.post('/admin/ai-skill-packages/bulk', { action: 'delete', ids })
  return dataOf(response)
}

/* ---------------- 单条编辑 ---------------- */
// payload: { title?, summary?, coverUrl? }
export async function updateSkillPackage(packageId, payload = {}) {
  if (!SERVER_AUTH_MODE) {
    const list = readLocal()
    const record = list.find((item) => item.id === packageId)
    if (!record) throw new Error('技能包不存在')
    Object.assign(record, payload, { updatedAt: new Date().toISOString() })
    writeLocal(list)
    return copy(record)
  }
  const response = await apiClient.patch(`/admin/ai-skill-packages/${encodeURIComponent(packageId)}`, payload)
  return dataOf(response).package || null
}

/* ---------------- 批量改名 ---------------- */
// payload: { ids, prefix?, suffix?, find?, replace? }
export async function renameSkillPackages(payload = {}) {
  if (!SERVER_AUTH_MODE) {
    const set = new Set(payload.ids || [])
    const updated = []
    const skipped = []
    const list = readLocal().map((item) => {
      if (!set.has(item.id)) return item
      const before = String(item.title || '')
      let next = payload.find ? before.split(payload.find).join(payload.replace || '') : before
      next = `${payload.prefix || ''}${next}${payload.suffix || ''}`.trim()
      if (!next) { skipped.push({ id: item.id, title: before, reason: '改名后标题为空' }); return item }
      if ([...next].length > 80) { skipped.push({ id: item.id, title: before, reason: '改名后超过 80 字' }); return item }
      if (next === before) { skipped.push({ id: item.id, title: before, reason: '名称没有变化' }); return item }
      updated.push({ id: item.id, from: before, to: next })
      return { ...item, title: next, updatedAt: new Date().toISOString() }
    })
    writeLocal(list)
    return { ok: true, updated, skipped }
  }
  const response = await apiClient.post('/admin/ai-skill-packages/bulk', { ...payload, action: 'rename' })
  return dataOf(response)
}

/* ---------------- 批量上下线（= 用户可见） ----------------
 * 本质上动的是「转出来的玩法」的发布状态；包还没转玩法时无法上线，会在 skipped 里说明原因。
 */
export async function setSkillPackagesVisibility(ids = [], visible = true) {
  if (!SERVER_AUTH_MODE) {
    const set = new Set(ids)
    const updated = []
    const skipped = []
    const list = readLocal().map((item) => {
      if (!set.has(item.id)) return item
      if (!item.convertedSkillId) {
        skipped.push({ id: item.id, title: item.title, reason: '还没转成玩法，用户端本来就没有这张卡' })
        return item
      }
      updated.push({ id: item.id, title: item.title })
      return { ...item, studentVisible: Boolean(visible), updatedAt: new Date().toISOString() }
    })
    writeLocal(list)
    return { ok: true, visible: Boolean(visible), updated, skipped }
  }
  const response = await apiClient.post('/admin/ai-skill-packages/bulk', { action: 'visibility', ids, visible })
  return dataOf(response)
}

/* ---------------- 分类 ---------------- */
export async function listSkillPackageCategories() {
  if (!SERVER_AUTH_MODE) {
    let list
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(LOCAL_CATEGORY_KEY) || 'null')
      if (Array.isArray(parsed)) list = parsed
    } catch {}
    if (!list) list = [copy(DEFAULT_CATEGORY)]
    const packages = readLocal()
    return list.map((item) => ({
      ...item,
      packageCount: packages.filter((pkg) => (item.isDefault ? !pkg.categoryId || pkg.categoryId === item.id : pkg.categoryId === item.id)).length,
    }))
  }
  const response = await apiClient.get('/admin/ai-skill-package-categories')
  return dataOf(response).categories || []
}

function writeLocalCategories(list) {
  window.sessionStorage.setItem(LOCAL_CATEGORY_KEY, JSON.stringify(list))
}

function readLocalCategories() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(LOCAL_CATEGORY_KEY) || 'null')
    if (Array.isArray(parsed) && parsed.length) return parsed
  } catch {}
  return [copy(DEFAULT_CATEGORY)]
}

export async function createSkillPackageCategory(name) {
  if (!SERVER_AUTH_MODE) {
    const list = readLocalCategories()
    const trimmed = String(name || '').trim()
    if (!trimmed) throw new Error('请填写分类名称')
    if (list.some((item) => item.name === trimmed)) throw new Error('已有同名分类，请换一个名称')
    const record = { id: `local-cat-${Date.now().toString(36)}`, name: trimmed, sortOrder: list.length, isDefault: false }
    list.push(record)
    writeLocalCategories(list)
    return { ...record, packageCount: 0 }
  }
  const response = await apiClient.post('/admin/ai-skill-package-categories', { name })
  return dataOf(response).category || null
}

export async function updateSkillPackageCategory(categoryId, name) {
  if (!SERVER_AUTH_MODE) {
    const list = readLocalCategories()
    const record = list.find((item) => item.id === categoryId)
    if (!record) throw new Error('未找到该分类')
    if (record.isDefault) throw new Error('「未分类」是系统兜底分类，不能改名')
    const trimmed = String(name || '').trim()
    if (!trimmed) throw new Error('请填写分类名称')
    if (list.some((item) => item.name === trimmed && item.id !== categoryId)) throw new Error('已有同名分类，请换一个名称')
    record.name = trimmed
    writeLocalCategories(list)
    return copy(record)
  }
  const response = await apiClient.patch(`/admin/ai-skill-package-categories/${encodeURIComponent(categoryId)}`, { name })
  return dataOf(response).category || null
}

export async function deleteSkillPackageCategory(categoryId) {
  if (!SERVER_AUTH_MODE) {
    const list = readLocalCategories()
    const record = list.find((item) => item.id === categoryId)
    if (!record) throw new Error('未找到该分类')
    if (record.isDefault) throw new Error('「未分类」是系统兜底分类，不能删除')
    writeLocalCategories(list.filter((item) => item.id !== categoryId))
    // 包回落到未分类：本地模式没有「未分类」id，直接清空即等于未分类。
    const packages = readLocal().map((item) => (item.categoryId === categoryId ? { ...item, categoryId: '' } : item))
    writeLocal(packages)
    return { deleted: true, movedPackages: packages.filter((item) => !item.categoryId).length }
  }
  const response = await apiClient.delete(`/admin/ai-skill-package-categories/${encodeURIComponent(categoryId)}`)
  return dataOf(response)
}

export async function setSkillPackagesCategory(ids = [], categoryId = '') {
  if (!SERVER_AUTH_MODE) {
    const set = new Set(ids)
    const list = readLocal().map((item) => (set.has(item.id) ? { ...item, categoryId } : item))
    writeLocal(list)
    return { ok: true, categoryId, updatedIds: ids }
  }
  const response = await apiClient.post('/admin/ai-skill-packages/bulk', { action: 'category', ids, categoryId })
  return dataOf(response)
}

/* ---------------- 转成玩法 ----------------
 * 产出的是一张草稿玩法卡：用户看不到，必须老师测试并发布。
 * payload: { skillType, promptTemplate, title, summary, coverUrl }
 */
export async function convertSkillPackage(packageId, payload = {}) {
  if (!SERVER_AUTH_MODE) {
    const list = readLocal()
    const record = list.find((item) => item.id === packageId)
    if (!record) throw new Error('技能包不存在')
    const skillType = payload.skillType === 'video' ? 'video' : 'image'
    const configuration = defaultSkillConfiguration(skillType)
    configuration.runtime.promptTemplate = String(payload.promptTemplate || '{{subject}}').trim() || '{{subject}}'
    configuration.presentation.coverUrl = String(payload.coverUrl || record.coverUrl || '')
    const skill = await saveEditableAiSkill({
      title: String(payload.title || '').trim() || record.title,
      summary: String(payload.summary || '').trim() || record.summary,
      skillType,
      scopeType: 'organization',
      configuration,
    })
    record.status = 'converted'
    record.convertedSkillId = skill?.id || ''
    record.updatedAt = new Date().toISOString()
    writeLocal(list)
    return { ok: true, skill }
  }
  const response = await apiClient.post(`/admin/ai-skill-packages/${encodeURIComponent(packageId)}/convert`, payload)
  return dataOf(response)
}
