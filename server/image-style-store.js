import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { logAudit } from './auth.js'
import { isDatabaseConfigured, query } from './db.js'

// 图像风格模板：后台「AI图像功能管理 → 风格模板编辑」维护，学生端绘画页「图像风格」直接读取。
// 一个风格 = 一张方形封面图 + 一句风格提示词 + 一个分组名。
// 分组只是一个文本字段（学生端按出现顺序排标签），不单独建表，少一层维护。

const STATUSES = new Set(['enabled', 'disabled', 'archived'])
const DEFAULT_GROUP = '推荐'

function newId(prefix) { return `${prefix}_${randomBytes(12).toString('base64url')}` }
function cleanText(value, max = 2000) { return String(value ?? '').trim().slice(0, max) }
function fail(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; return error }

function normalizeStatus(value, fallback = 'enabled') {
  const status = cleanText(value || fallback, 20)
  if (!STATUSES.has(status)) throw fail('风格状态不正确')
  return status
}

function normalizeCoverUrl(value) {
  const url = cleanText(value, 1000)
  if (!url) return ''
  if (/^(https?:\/\/|\/api\/image-style-covers\/)[^\s]+$/i.test(url)) return url
  throw fail('封面图地址不正确')
}

function normalizeStyle(payload = {}) {
  const name = cleanText(payload.name, 40)
  if (!name) throw fail('请填写风格名称')
  const prompt = cleanText(payload.prompt, 600)
  return {
    name,
    groupName: cleanText(payload.groupName, 30) || DEFAULT_GROUP,
    prompt,
    coverImageUrl: normalizeCoverUrl(payload.coverImageUrl),
    sortOrder: Number(payload.sortOrder || 0),
    status: normalizeStatus(payload.status),
  }
}

function toStyle(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    groupName: row.group_name || DEFAULT_GROUP,
    prompt: row.prompt || '',
    coverImageUrl: row.cover_image_url || '',
    sortOrder: Number(row.sort_order || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function dataPath() {
  const dir = process.env.AI_DATA_DIR || join(process.cwd(), 'server', 'data-fallback')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'image-style-templates.json')
}

// 彻底删除风格时顺手清掉它自己的封面文件，避免换封面／删风格后磁盘越堆越多。
// 只处理本站上传的地址（/api/image-style-covers/<机构>/<文件名>），外链封面一律不动。
// 注意：封面真正落在 server/index.js 的 dataDir 下（可能是 server/data，也可能是 data-fallback），
// 这里必须由服务端启动时用 setImageStyleCoverRoot() 告知，不能自己猜——否则删了数据、图还留在盘上。
const COVER_PREFIX = '/api/image-style-covers/'
let coverRootDir = process.env.AI_DATA_DIR || join(process.cwd(), 'server', 'data')
export function setImageStyleCoverRoot(dir) {
  const next = cleanText(dir, 500)
  if (next) coverRootDir = next
}
async function removeCoverFile(coverImageUrl) {
  const url = cleanText(coverImageUrl, 1000)
  if (!url.startsWith(COVER_PREFIX)) return
  const parts = url.slice(COVER_PREFIX.length).split('/')
  if (parts.length !== 2) return
  if (parts.some((part) => !part || part.includes('..') || part.includes('\\'))) return
  const target = join(coverRootDir, 'image-style-covers', decodeURIComponent(parts[0]), decodeURIComponent(parts[1]))
  try {
    await unlink(target)
  } catch (error) {
    // 文件本来就不在（重复删、换过封面）是正常情况，静默跳过。
    // 其它错误必须报出来：曾经因为静默吞掉 EBUSY/EPERM，删了几十个风格后磁盘上堆了一堆没人用的封面，
    // 表面「删除成功」，实际文件一直留着。
    if (error?.code !== 'ENOENT') console.warn('[image-style] 封面文件清理失败：', target, error?.code, error?.message)
  }
}
function readLocal() {
  try {
    const data = JSON.parse(readFileSync(dataPath(), 'utf8'))
    return { styles: Array.isArray(data.styles) ? data.styles : [] }
  } catch { return { styles: [] } }
}
function writeLocal(data) { writeFileSync(dataPath(), JSON.stringify(data, null, 2), 'utf8') }

function orgId(user) { return user?.organization?.id || 'demo-organization' }
function assertAdmin(user) { if (user?.role && user.role !== 'admin') throw fail('仅管理员可以管理图像风格', 403) }

function bySort(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0) }

// ---- 风格面板设置（面板标题、每排几张、默认分组、没有启用风格时是否回退内置风格）----
// 以前只存在后台那台电脑的浏览器里，换一台设备（例如小画家的平板）就读不到，后台改了等于没改。
// 现在按机构存服务端一份：后台保存，学生端读取 /api/image-styles 时一起带上。
const PANEL_DEFAULTS = Object.freeze({ panelTitle: '图像风格', columns: 4, defaultGroup: DEFAULT_GROUP, fallbackMode: 'builtin' })

export function normalizeImageStylePanelSettings(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  return {
    panelTitle: cleanText(source.panelTitle, 20) || PANEL_DEFAULTS.panelTitle,
    columns: [2, 3, 4].includes(Number(source.columns)) ? Number(source.columns) : PANEL_DEFAULTS.columns,
    defaultGroup: cleanText(source.defaultGroup, 30) || PANEL_DEFAULTS.defaultGroup,
    fallbackMode: source.fallbackMode === 'empty' ? 'empty' : 'builtin',
  }
}

let panelSchemaPromise = null
function ensurePanelSchema() {
  if (!panelSchemaPromise) {
    panelSchemaPromise = query(`CREATE TABLE IF NOT EXISTS image_style_panel_settings (
      organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).catch((error) => { panelSchemaPromise = null; throw error })
  }
  return panelSchemaPromise
}

function panelLocalPath() { return join(dataPath(), '..', 'image-style-panel-settings.json') }
function readPanelLocal() {
  try {
    const data = JSON.parse(readFileSync(panelLocalPath(), 'utf8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch { return {} }
}

/** 读取本机构的风格面板设置。saved=false 表示还没在服务端保存过（用默认值）。 */
export async function getImageStylePanelSettings(user) {
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const saved = readPanelLocal()[orgId(user)]
    return { settings: normalizeImageStylePanelSettings(saved), saved: Boolean(saved) }
  }
  await ensurePanelSchema()
  const result = await query('SELECT settings FROM image_style_panel_settings WHERE organization_id=$1', [orgId(user)])
  return { settings: normalizeImageStylePanelSettings(result.rows[0]?.settings), saved: result.rows.length > 0 }
}

/** 后台保存风格面板设置（只有管理员可以改）。 */
export async function saveImageStylePanelSettings(user, payload = {}) {
  assertAdmin(user)
  const settings = normalizeImageStylePanelSettings(payload)
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readPanelLocal()
    data[orgId(user)] = settings
    writeFileSync(panelLocalPath(), JSON.stringify(data, null, 2), 'utf8')
    return { settings, saved: true }
  }
  await ensurePanelSchema()
  await query(
    `INSERT INTO image_style_panel_settings (organization_id, settings, updated_by_user_id, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (organization_id) DO UPDATE SET settings = EXCLUDED.settings, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()`,
    [orgId(user), JSON.stringify(settings), user.id || null],
  )
  await logAudit(user.id, orgId(user), 'image_style.panel_settings', 'image_style_panel', orgId(user), settings)
  return { settings, saved: true }
}

/** 后台列表：全部状态（含停用、归档），按排序值升序 */
export async function listAdminImageStyles(user) {
  assertAdmin(user)
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    return readLocal().styles.filter((item) => item.organizationId === orgId(user)).sort(bySort)
  }
  const result = await query('SELECT * FROM image_style_templates WHERE organization_id=$1 ORDER BY sort_order ASC, created_at ASC', [orgId(user)])
  return result.rows.map(toStyle)
}

/** 学生端列表：只给启用中的风格。空数组时前端自动回退内置风格，保证不出白板。 */
export async function listStudentImageStyles(user) {
  if (!isDatabaseConfigured() || !user?.organization?.id) {
    return readLocal().styles
      .filter((item) => item.organizationId === orgId(user) && item.status === 'enabled')
      .sort(bySort)
  }
  const result = await query(
    "SELECT * FROM image_style_templates WHERE organization_id=$1 AND status='enabled' ORDER BY sort_order ASC, created_at ASC",
    [orgId(user)],
  )
  return result.rows.map(toStyle)
}

export async function saveImageStyle(user, payload = {}, id = '') {
  assertAdmin(user)
  const value = normalizeStyle(payload)
  const organizationId = orgId(user)

  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocal()
    const index = data.styles.findIndex((item) => item.id === id && item.organizationId === organizationId)
    if (id && index < 0) throw fail('风格模板不存在', 404)
    const previousCover = data.styles[index]?.coverImageUrl || ''
    const next = {
      ...value,
      id: id || newId('istyle'),
      organizationId,
      createdAt: data.styles[index]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (index < 0) data.styles.push(next); else data.styles[index] = next
    writeLocal(data)
    if (previousCover && previousCover !== value.coverImageUrl) await removeCoverFile(previousCover)
    return next
  }

  if (id) {
    const previous = await query('SELECT cover_image_url FROM image_style_templates WHERE id=$1 AND organization_id=$2', [id, organizationId])
    const result = await query(
      `UPDATE image_style_templates SET name=$1, group_name=$2, prompt=$3, cover_image_url=$4, sort_order=$5, status=$6, updated_by_user_id=$7, updated_at=now()
       WHERE id=$8 AND organization_id=$9 RETURNING *`,
      [value.name, value.groupName, value.prompt, value.coverImageUrl, value.sortOrder, value.status, user.id, id, organizationId],
    )
    if (!result.rows[0]) throw fail('风格模板不存在', 404)
    const oldCover = previous.rows[0]?.cover_image_url || ''
    if (oldCover && oldCover !== value.coverImageUrl) await removeCoverFile(oldCover)
    await logAudit(user.id, organizationId, 'image_style.update', 'image_style', id, value)
    return toStyle(result.rows[0])
  }

  const result = await query(
    `INSERT INTO image_style_templates (id,organization_id,name,group_name,prompt,cover_image_url,sort_order,status,created_by_user_id,updated_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
    [newId('istyle'), organizationId, value.name, value.groupName, value.prompt, value.coverImageUrl, value.sortOrder, value.status, user.id],
  )
  await logAudit(user.id, organizationId, 'image_style.create', 'image_style', result.rows[0].id, value)
  return toStyle(result.rows[0])
}

export async function removeImageStyle(user, id, mode = 'archive') {
  assertAdmin(user)
  const organizationId = orgId(user)

  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocal()
    const index = data.styles.findIndex((item) => item.id === id && item.organizationId === organizationId)
    if (index < 0) throw fail('风格模板不存在', 404)
    const cover = data.styles[index].coverImageUrl || ''
    if (mode === 'permanent') data.styles.splice(index, 1)
    else data.styles[index].status = 'archived'
    writeLocal(data)
    if (mode === 'permanent') await removeCoverFile(cover)
    return { ok: true, mode }
  }

  const result = mode === 'permanent'
    ? await query('DELETE FROM image_style_templates WHERE id=$1 AND organization_id=$2 RETURNING *', [id, organizationId])
    : await query("UPDATE image_style_templates SET status='archived', updated_by_user_id=$3, updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id", [id, organizationId, user.id])
  if (!result.rows[0]) throw fail('风格模板不存在', 404)
  if (mode === 'permanent') await removeCoverFile(result.rows[0].cover_image_url)
  await logAudit(user.id, organizationId, mode === 'permanent' ? 'image_style.delete' : 'image_style.archive', 'image_style', id, {})
  return { ok: true, mode }
}

/**
 * 批量操作：勾选多条一次性改状态 / 改分组 / 永久删除。
 * 单条失败不影响其它条，最后把成功数和失败原因一起回给前端。
 * action = enable | disable | archive | delete | group
 */
export async function batchUpdateImageStyles(user, payload = {}) {
  assertAdmin(user)
  const organizationId = orgId(user)
  const ids = (Array.isArray(payload.ids) ? payload.ids : []).map((item) => cleanText(item, 100)).filter(Boolean)
  if (!ids.length) throw fail('请先勾选要处理的风格')
  const action = cleanText(payload.action, 20)
  if (!['enable', 'disable', 'archive', 'delete', 'group'].includes(action)) throw fail('批量操作类型不正确')
  const groupName = action === 'group' ? cleanText(payload.groupName, 30) : ''
  if (action === 'group' && !groupName) throw fail('请填写要移到哪个分组')

  let done = 0
  const failed = []
  for (const id of ids) {
    try {
      if (action === 'delete') await removeImageStyle(user, id, 'permanent')
      else if (action === 'archive') await removeImageStyle(user, id, 'archive')
      else if (action === 'group') {
        const rows = isDatabaseConfigured() && user?.organization?.id
          ? (await query('SELECT * FROM image_style_templates WHERE id=$1 AND organization_id=$2', [id, organizationId])).rows
          : readLocal().styles.filter((item) => item.id === id && item.organizationId === organizationId)
        if (!rows[0]) throw fail('风格模板不存在', 404)
        const current = toStyle(rows[0])
        await saveImageStyle(user, { ...current, coverImageUrl: current.coverImageUrl, groupName }, id)
      } else {
        const rows = isDatabaseConfigured() && user?.organization?.id
          ? (await query('SELECT * FROM image_style_templates WHERE id=$1 AND organization_id=$2', [id, organizationId])).rows
          : readLocal().styles.filter((item) => item.id === id && item.organizationId === organizationId)
        if (!rows[0]) throw fail('风格模板不存在', 404)
        const current = toStyle(rows[0])
        await saveImageStyle(user, { ...current, coverImageUrl: current.coverImageUrl, status: action === 'enable' ? 'enabled' : 'disabled' }, id)
      }
      done += 1
    } catch (error) {
      failed.push({ id, message: error?.message || '处理失败' })
    }
  }
  await logAudit(user.id, organizationId, 'image_style.batch', 'image_style', ids.join(','), { action, done, failed: failed.length })
  return { ok: true, action, done, failed }
}

/** 批量重排：学生端标签顺序、卡片顺序都按这个值走 */
export async function reorderImageStyles(user, orderedIds = []) {
  assertAdmin(user)
  const organizationId = orgId(user)
  const ids = (Array.isArray(orderedIds) ? orderedIds : []).map((item) => cleanText(item, 100)).filter(Boolean)
  if (!ids.length) throw fail('请提供要排序的风格列表')

  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocal()
    ids.forEach((id, index) => {
      const target = data.styles.find((item) => item.id === id && item.organizationId === organizationId)
      if (target) { target.sortOrder = index; target.updatedAt = new Date().toISOString() }
    })
    writeLocal(data)
    return { ok: true }
  }

  for (let index = 0; index < ids.length; index += 1) {
    await query('UPDATE image_style_templates SET sort_order=$1, updated_by_user_id=$2, updated_at=now() WHERE id=$3 AND organization_id=$4', [index, user.id, ids[index], organizationId])
  }
  return { ok: true }
}

/* ============================ 分类（分组） ============================ */

// 分类以前只是 group_name 里的一段文字，没有风格就没有分类，也没法单独改名。
// 现在单独存一张表，但风格仍靠 group_name 文本对应——不做外键迁移，避免动老数据把学生端标签搞丢。
// 🔴 删分类绝不连带删风格：里面的风格统一挪到「推荐」，风格一张都不丢。

function groupPath() {
  const dir = process.env.AI_DATA_DIR || join(process.cwd(), 'server', 'data-fallback')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'image-style-groups.json')
}
function readLocalGroups() {
  try {
    const data = JSON.parse(readFileSync(groupPath(), 'utf8'))
    return { groups: Array.isArray(data.groups) ? data.groups : [] }
  } catch { return { groups: [] } }
}
function writeLocalGroups(data) { writeFileSync(groupPath(), JSON.stringify(data, null, 2), 'utf8') }

function toGroup(row) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
  }
}

/**
 * 分类列表。
 * 老数据自愈：风格里出现过的 group_name 若还没有分类记录，自动补一条——
 * 否则升级后第一次打开后台，已有风格的分类会「凭空消失」，学生端标签却还在。
 * 一条分类都没有时补一个「推荐」，保证下拉框里永远有可选项。
 */
export async function listImageStyleGroups(user) {
  assertAdmin(user)
  const organizationId = orgId(user)

  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const groups = readLocalGroups()
    const styles = readLocal().styles.filter((item) => item.organizationId === organizationId)
    const known = groups.groups.filter((item) => item.organizationId === organizationId)
    const missing = []
    styles.forEach((item) => {
      const name = cleanText(item.groupName, 30) || DEFAULT_GROUP
      if (!known.some((group) => group.name === name) && !missing.some((group) => group.name === name)) {
        missing.push({ id: newId('isgroup'), organizationId, name, sortOrder: known.length + missing.length, createdAt: new Date().toISOString() })
      }
    })
    if (missing.length) {
      groups.groups.push(...missing)
      writeLocalGroups(groups)
    }
    const list = [...known, ...missing].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    if (!list.length) return [{ id: newId('isgroup'), name: DEFAULT_GROUP, sortOrder: 0, createdAt: new Date().toISOString() }]
    return list
  }

  await query(
    `INSERT INTO image_style_groups (id, organization_id, name, sort_order)
     SELECT 'isgroup_' || substr(md5(random()::text || t.group_name), 1, 24), $1, t.group_name,
            COALESCE((SELECT max(sort_order) + 1 FROM image_style_groups WHERE organization_id=$1), 0)
     FROM (SELECT DISTINCT group_name FROM image_style_templates WHERE organization_id=$1) t
     WHERE NOT EXISTS (
       SELECT 1 FROM image_style_groups g WHERE g.organization_id=$1 AND g.name=t.group_name
     )`,
    [organizationId],
  )
  const existing = await query('SELECT * FROM image_style_groups WHERE organization_id=$1 ORDER BY sort_order ASC, created_at ASC', [organizationId])
  if (existing.rows.length) return existing.rows.map(toGroup)
  const seeded = await query(
    `INSERT INTO image_style_groups (id, organization_id, name, sort_order) VALUES ($1,$2,$3,0)
     ON CONFLICT DO NOTHING RETURNING *`,
    [newId('isgroup'), organizationId, DEFAULT_GROUP],
  )
  if (seeded.rows[0]) return [toGroup(seeded.rows[0])]
  return (await query('SELECT * FROM image_style_groups WHERE organization_id=$1 ORDER BY sort_order ASC', [organizationId])).rows.map(toGroup)
}

/** 新建分类：允许先建空分类，再往里放风格（这就是单独建表的意义） */
export async function createImageStyleGroup(user, payload = {}) {
  assertAdmin(user)
  const organizationId = orgId(user)
  const name = cleanText(payload.name, 30)
  if (!name) throw fail('请填写分类名称')

  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocalGroups()
    if (data.groups.some((item) => item.organizationId === organizationId && item.name === name)) throw fail('已经有同名分类了', 409)
    const mine = data.groups.filter((item) => item.organizationId === organizationId)
    const group = { id: newId('isgroup'), organizationId, name, sortOrder: mine.length, createdAt: new Date().toISOString() }
    data.groups.push(group)
    writeLocalGroups(data)
    return group
  }

  const duplicate = await query('SELECT 1 FROM image_style_groups WHERE organization_id=$1 AND name=$2', [organizationId, name])
  if (duplicate.rows[0]) throw fail('已经有同名分类了', 409)
  const result = await query(
    `INSERT INTO image_style_groups (id, organization_id, name, sort_order, created_by_user_id, updated_by_user_id)
     VALUES ($1,$2,$3, COALESCE((SELECT max(sort_order)+1 FROM image_style_groups WHERE organization_id=$2), 0), $4, $4)
     RETURNING *`,
    [newId('isgroup'), organizationId, name, user.id],
  )
  await logAudit(user.id, organizationId, 'image_style_group.create', 'image_style_group', result.rows[0].id, { name })
  return toGroup(result.rows[0])
}

/**
 * 分类改名：分类记录和该分类下的所有风格一起改，避免「改了分类名，风格还挂在老名字下」。
 * 学生端标签直接读 group_name，所以两张表必须同时更新。
 */
export async function renameImageStyleGroup(user, id, payload = {}) {
  assertAdmin(user)
  const organizationId = orgId(user)
  const name = cleanText(payload.name, 30)
  if (!name) throw fail('请填写分类名称')

  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocalGroups()
    const target = data.groups.find((item) => item.id === id && item.organizationId === organizationId)
    if (!target) throw fail('分类不存在', 404)
    if (target.name === name) return target
    if (data.groups.some((item) => item.organizationId === organizationId && item.name === name)) throw fail('已经有同名分类了', 409)
    const oldName = target.name
    target.name = name
    writeLocalGroups(data)
    const styles = readLocal()
    styles.styles.forEach((item) => { if (item.organizationId === organizationId && item.groupName === oldName) item.groupName = name })
    writeLocal(styles)
    return target
  }

  const current = await query('SELECT * FROM image_style_groups WHERE id=$1 AND organization_id=$2', [id, organizationId])
  const group = current.rows[0]
  if (!group) throw fail('分类不存在', 404)
  if (group.name === name) return toGroup(group)
  const duplicate = await query('SELECT 1 FROM image_style_groups WHERE organization_id=$1 AND name=$2 AND id<>$3', [organizationId, name, id])
  if (duplicate.rows[0]) throw fail('已经有同名分类了', 409)

  const updated = await query(
    'UPDATE image_style_groups SET name=$1, updated_by_user_id=$2, updated_at=now() WHERE id=$3 AND organization_id=$4 RETURNING *',
    [name, user.id, id, organizationId],
  )
  await query(
    'UPDATE image_style_templates SET group_name=$1, updated_by_user_id=$2, updated_at=now() WHERE organization_id=$3 AND group_name=$4',
    [name, user.id, organizationId, group.name],
  )
  await logAudit(user.id, organizationId, 'image_style_group.rename', 'image_style_group', id, { from: group.name, to: name })
  return toGroup(updated.rows[0])
}

/**
 * 删除分类：里面的风格一律挪到「推荐」，绝不删风格、不删封面。
 * 「推荐」是兜底分类，删掉就没有地方可挪了，所以直接拒绝。
 */
export async function removeImageStyleGroup(user, id) {
  assertAdmin(user)
  const organizationId = orgId(user)

  if (!isDatabaseConfigured() || !user?.organization?.id) {
    const data = readLocalGroups()
    const index = data.groups.findIndex((item) => item.id === id && item.organizationId === organizationId)
    if (index < 0) throw fail('分类不存在', 404)
    const group = data.groups[index]
    if (group.name === DEFAULT_GROUP) throw fail(`「${DEFAULT_GROUP}」是兜底分类，不能删除`)
    data.groups.splice(index, 1)
    writeLocalGroups(data)
    const styles = readLocal()
    let moved = 0
    styles.styles.forEach((item) => {
      if (item.organizationId === organizationId && item.groupName === group.name) { item.groupName = DEFAULT_GROUP; moved += 1 }
    })
    if (moved) writeLocal(styles)
    return { ok: true, moved, groupName: group.name }
  }

  const current = await query('SELECT * FROM image_style_groups WHERE id=$1 AND organization_id=$2', [id, organizationId])
  const group = current.rows[0]
  if (!group) throw fail('分类不存在', 404)
  if (group.name === DEFAULT_GROUP) throw fail(`「${DEFAULT_GROUP}」是兜底分类，不能删除`)

  const moved = await query(
    'UPDATE image_style_templates SET group_name=$1, updated_by_user_id=$2, updated_at=now() WHERE organization_id=$3 AND group_name=$4 RETURNING id',
    [DEFAULT_GROUP, user.id, organizationId, group.name],
  )
  await query('DELETE FROM image_style_groups WHERE id=$1 AND organization_id=$2', [id, organizationId])
  await logAudit(user.id, organizationId, 'image_style_group.delete', 'image_style_group', id, { groupName: group.name, movedStyles: moved.rows.length })
  return { ok: true, moved: moved.rows.length, groupName: group.name }
}
