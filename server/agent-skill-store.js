/* 智能体技能（Agent Skills）
 * ------------------------------------------------------------------
 * 一个技能 = 一份 SKILL.md（YAML 头 + Markdown 正文）+ 可选的参考文件（references/、assets/ 下的文本）。
 * 运行时采用"按需加载"：系统提示里只放技能目录（名称 + 一句话说明），
 * 模型需要时调用 load_skill 读取正文，再按需 read_skill_resource 读取参考文件。
 *
 * 与旧的「技能包 → 玩法卡」(ai-skill-package-store.js) 的区别：
 * 旧流程只从 SKILL.md 里抽取提示词，AI 并不会执行技能说明；这里是真正让 AI 读懂并按技能步骤工作。
 * 安全：技能里的脚本文件只当作文本参考，平台不会执行任何脚本。
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import JSZip from 'jszip'
import { logAudit } from './auth.js'
import { query } from './db.js'
import { BUILTIN_SKILLS } from './agent-builtin-skills.js'

const here = dirname(fileURLToPath(import.meta.url))

const MAX_INSTRUCTIONS = 60_000
const MAX_RESOURCE_CHARS = 120_000
const MAX_RESOURCES_TOTAL = 1_000_000
const MAX_RESOURCES = 60
const MAX_ARCHIVE_ENTRIES = 400
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
const MAX_COVER_BYTES = 2 * 1024 * 1024
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json', '.yaml', '.yml', '.csv', '.tsv', '.html', '.htm', '.css', '.js', '.mjs', '.ts', '.py', '.sh', '.xml', '.svg'])
const COVER_EXTENSIONS = { '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp' }
const STATUSES = new Set(['draft', 'published', 'disabled'])
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

let coverDir = join(process.cwd(), 'server', 'data', 'agent-skill-covers')
let schemaPromise = null
const seededOrganizations = new Set()

function fail(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hashText(text) {
  return createHash('sha256').update(String(text || '')).digest('hex')
}

export function configureAgentSkillStorage({ dataDir } = {}) {
  if (dataDir) coverDir = join(dataDir, 'agent-skill-covers')
}

/** 首次使用时自动建表；部署时也会由 pnpm db:migrate 执行同一份 SQL。 */
export function ensureAgentSchema() {
  if (!schemaPromise) {
    schemaPromise = query(readFileSync(join(here, 'agent-schema.sql'), 'utf8')).catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  return schemaPromise
}

async function assertOrgAdmin(user) {
  if (user?.role !== 'admin' || !user?.organization?.id) throw fail('仅机构管理员可以管理智能体技能', 403)
  const result = await query(
    'SELECT 1 FROM admin_scopes WHERE admin_user_id = $1 AND organization_id = $2 LIMIT 1',
    [user.id, user.organization.id],
  )
  if (!result.rows[0]) throw fail('当前管理员没有机构管理范围', 403)
}

/* ---------------- 解析 ---------------- */

export function toSkillSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
}

function firstParagraph(body = '') {
  const lines = String(body).split('\n').map((line) => line.trim())
  const text = lines.find((line) => line && !line.startsWith('#') && !line.startsWith('```') && !line.startsWith('|'))
  return text ? text.replace(/[*_`>]/g, '').trim() : ''
}

/** 解析一份 SKILL.md。返回值里不含数据库字段，只是内容。 */
export function parseSkillMarkdown(text, { fallbackName = '' } = {}) {
  const normalized = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const matched = normalized.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/)
  let frontmatter = {}
  let body = normalized
  if (matched) {
    try {
      frontmatter = YAML.parse(matched[1], { maxAliasCount: 20 }) || {}
    } catch (error) {
      throw fail(`SKILL.md 头部（--- 之间）格式有误：${String(error.message || '').split('\n')[0]}`)
    }
    if (typeof frontmatter !== 'object' || Array.isArray(frontmatter)) frontmatter = {}
    body = normalized.slice(matched[0].length)
  }
  body = body.trim()
  if (!body) throw fail('SKILL.md 正文为空，AI 无法知道这个技能要做什么')
  if (!matched) {
    // 没有 YAML 头时只接受「有 # 标题 + 像样正文」的 Markdown（兼容旧技能包），随手粘的一句话不算技能。
    const rest = body.replace(/^#\s+.+$/m, '').trim()
    if (!/^#\s+\S/m.test(body) || rest.length < 20) {
      throw fail('不是有效的 SKILL.md：开头需要用 --- 包起来的头部（写明 name 和 description），可以下载导入页里的示例模板参考。')
    }
  }
  if (body.length > MAX_INSTRUCTIONS) throw fail(`SKILL.md 正文过长（上限 ${MAX_INSTRUCTIONS} 字）`)

  const metadata = frontmatter.metadata && typeof frontmatter.metadata === 'object' && !Array.isArray(frontmatter.metadata)
    ? frontmatter.metadata : {}
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
  const rawName = String(frontmatter.name || fallbackName || '').trim()
  const contentHash = hashText(normalized)
  const slug = toSkillSlug(rawName) || toSkillSlug(heading) || `skill-${contentHash.slice(0, 8)}`
  const title = clean(metadata.title || frontmatter.title || heading || rawName || slug, 40)
  const description = clean(frontmatter.description || metadata.description || firstParagraph(body), 1024)
  if (!description) throw fail('SKILL.md 缺少 description（一句话说明什么时候使用这个技能）')
  const icon = clean(metadata.icon || frontmatter.icon || '', 8)
  const color = COLOR_PATTERN.test(String(metadata.color || '')) ? String(metadata.color) : ''
  return {
    slug,
    title,
    description,
    instructions: body,
    frontmatter: JSON.parse(JSON.stringify(frontmatter)),
    icon,
    color,
    contentHash,
  }
}

function normalizeArchivePath(path) {
  const value = String(path || '').replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!value || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return ''
  const normalized = posix.normalize(value)
  if (normalized.startsWith('..') || normalized.includes('/../')) return ''
  return normalized
}

function isIgnoredEntry(path) {
  return path.startsWith('__MACOSX/') || path.split('/').some((part) => part === '.DS_Store' || part === 'Thumbs.db' || part === '.git')
}

/**
 * 解析技能压缩包。一个压缩包里可以有多个技能（每个目录一份 SKILL.md），全部导入。
 * 只读取文本类参考文件；图片里只取 cover.* 作为卡片封面。
 */
export async function parseSkillArchive(buffer) {
  if (!buffer?.length) throw fail('压缩包为空')
  if (buffer.length > MAX_ARCHIVE_BYTES) throw fail('压缩包超过 20MB')
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw fail('无法读取压缩包，请确认是 .zip 格式')
  }
  const entries = Object.values(zip.files).filter((file) => !file.dir)
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw fail(`压缩包内文件过多（上限 ${MAX_ARCHIVE_ENTRIES} 个）`)
  const files = entries
    .map((file) => ({ file, path: normalizeArchivePath(file.name) }))
    .filter((item) => item.path && !isIgnoredEntry(item.path))
  const skillFiles = files.filter((item) => posix.basename(item.path).toLowerCase() === 'skill.md')
  if (!skillFiles.length) throw fail('压缩包里没有找到 SKILL.md')
  const skillDirs = skillFiles.map((item) => posix.dirname(item.path)).map((dir) => (dir === '.' ? '' : dir))

  const results = []
  for (const skillFile of skillFiles) {
    const dir = posix.dirname(skillFile.path) === '.' ? '' : posix.dirname(skillFile.path)
    const prefix = dir ? `${dir}/` : ''
    // 属于更深一层技能目录的文件，归那个技能，不归当前这个。
    const deeper = skillDirs.filter((other) => other !== dir && other.startsWith(prefix))
    const owned = files.filter((item) => item.path !== skillFile.path
      && item.path.startsWith(prefix)
      && !deeper.some((other) => item.path.startsWith(`${other}/`)))
    const markdown = await skillFile.file.async('string')
    const resources = {}
    const skipped = []
    let total = 0
    let cover = null
    for (const item of owned) {
      const relative = item.path.slice(prefix.length)
      const ext = posix.extname(relative).toLowerCase()
      const base = posix.basename(relative, ext).toLowerCase()
      if (COVER_EXTENSIONS[ext]) {
        if (!cover && (base === 'cover' || base === 'icon' || base === 'thumbnail')) {
          const data = await item.file.async('nodebuffer')
          if (data.length <= MAX_COVER_BYTES) cover = { buffer: data, extension: COVER_EXTENSIONS[ext] }
        }
        continue
      }
      if (!TEXT_EXTENSIONS.has(ext)) { skipped.push(relative); continue }
      if (Object.keys(resources).length >= MAX_RESOURCES) { skipped.push(relative); continue }
      const content = await item.file.async('string')
      if (content.length > MAX_RESOURCE_CHARS || total + content.length > MAX_RESOURCES_TOTAL) { skipped.push(relative); continue }
      total += content.length
      resources[relative] = content
    }
    results.push({ fileName: skillFile.path, folderName: dir ? posix.basename(dir) : '', markdown, resources, skipped, cover })
  }
  return results
}

/* ---------------- 数据库映射 ---------------- */

function toSkill(row, { full = false } = {}) {
  const resources = row.resources && typeof row.resources === 'object' ? row.resources : {}
  const base = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    icon: row.icon || '',
    color: row.color || '',
    coverUrl: row.cover_url || '',
    starterPrompts: Array.isArray(row.starter_prompts) ? row.starter_prompts : [],
    status: row.status,
    source: row.source,
    sortOrder: row.sort_order,
    useCount: row.use_count,
    resourceNames: Object.keys(resources),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
  if (!full) return base
  return { ...base, instructions: row.instructions, frontmatter: row.frontmatter || {}, resources, sourcePackageId: row.source_package_id || '' }
}

/** 首次读取时为本机构写入内置技能；已写入过（包括后来被删除的）不会重复写入。 */
export async function ensureBuiltinSkills(organizationId) {
  if (!organizationId || seededOrganizations.has(organizationId)) return
  await ensureAgentSchema()
  const existing = await query('SELECT id, slug, source, content_hash, deleted_at FROM agent_skills WHERE organization_id = $1', [organizationId])
  const known = new Map(existing.rows.map((row) => [row.slug, row]))
  for (const item of BUILTIN_SKILLS) {
    const parsed = parseSkillMarkdown(item.markdown)
    const row = known.get(parsed.slug)
    if (row) {
      // 内置技能升级：只有内容还是旧版内置原样（管理员没改过）才更新；状态、排序、封面保持机构自己的设置。
      const untouched = row.source === 'builtin' && !row.deleted_at && row.content_hash !== parsed.contentHash
        && (item.previousHashes || []).includes(row.content_hash)
      if (untouched) {
        await query(
          `UPDATE agent_skills SET title=$3, description=$4, instructions=$5, frontmatter=$6::jsonb, icon=$7, color=$8,
             starter_prompts=$9::jsonb, content_hash=$10, updated_at=now()
           WHERE id=$1 AND organization_id=$2 AND content_hash=$11`,
          [row.id, organizationId, parsed.title, parsed.description, parsed.instructions, JSON.stringify(parsed.frontmatter),
            parsed.icon, parsed.color, JSON.stringify(item.starterPrompts || []), parsed.contentHash, row.content_hash],
        )
      }
      continue
    }
    await query(
      `INSERT INTO agent_skills (id, organization_id, slug, title, description, instructions, frontmatter, icon, color,
         starter_prompts, status, source, content_hash, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,'published','builtin',$11,$12)
       ON CONFLICT DO NOTHING`,
      [newId('askill'), organizationId, parsed.slug, parsed.title, parsed.description, parsed.instructions,
        JSON.stringify(parsed.frontmatter), parsed.icon, parsed.color, JSON.stringify(item.starterPrompts || []),
        parsed.contentHash, item.sortOrder || 0],
    )
  }
  seededOrganizations.add(organizationId)
}

async function prepare(user) {
  if (!user?.organization?.id) throw fail('缺少登录信息', 401)
  await ensureAgentSchema()
  await ensureBuiltinSkills(user.organization.id)
}

/** 用户端：只返回已发布的技能（不含正文）。 */
export async function listPublishedSkills(user) {
  await prepare(user)
  const result = await query(
    `SELECT * FROM agent_skills WHERE organization_id = $1 AND status = 'published' AND deleted_at IS NULL
     ORDER BY sort_order, created_at`,
    [user.organization.id],
  )
  return result.rows.map((row) => toSkill(row))
}

/** 运行时：按 slug 取一个技能的完整内容。管理员测试时允许读取草稿。 */
export async function getSkillForRuntime(user, slug, { allowDraft = false } = {}) {
  await prepare(user)
  const key = toSkillSlug(slug) || String(slug || '').trim()
  if (!key) return null
  const statuses = allowDraft ? ['published', 'draft'] : ['published']
  const result = await query(
    `SELECT * FROM agent_skills WHERE organization_id = $1 AND (slug = $2 OR title = $3)
       AND status = ANY($4::text[]) AND deleted_at IS NULL
     ORDER BY CASE WHEN slug = $2 THEN 0 ELSE 1 END LIMIT 1`,
    [user.organization.id, key, String(slug || '').trim(), statuses],
  )
  return result.rows[0] ? toSkill(result.rows[0], { full: true }) : null
}

export async function recordSkillUse(skillId) {
  if (!skillId) return
  await query('UPDATE agent_skills SET use_count = use_count + 1 WHERE id = $1', [skillId]).catch(() => {})
}

/* ---------------- 后台管理 ---------------- */

export async function listSkillsForAdmin(user) {
  await assertOrgAdmin(user)
  await prepare(user)
  const result = await query(
    `SELECT * FROM agent_skills WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY sort_order, created_at`,
    [user.organization.id],
  )
  return result.rows.map((row) => toSkill(row))
}

export async function getSkillForAdmin(user, id) {
  await assertOrgAdmin(user)
  await prepare(user)
  const result = await query('SELECT * FROM agent_skills WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [id, user.organization.id])
  if (!result.rows[0]) throw fail('技能不存在或已删除', 404)
  return toSkill(result.rows[0], { full: true })
}

function saveCoverFile(skillId, cover) {
  if (!cover?.buffer?.length) return ''
  mkdirSync(coverDir, { recursive: true })
  const fileName = `${skillId}-${Date.now().toString(36)}.${cover.extension}`
  writeFileSync(join(coverDir, fileName), cover.buffer)
  return `/api/agent-skill-covers/${fileName}`
}

function removeCoverFile(url) {
  const match = String(url || '').match(/^\/api\/agent-skill-covers\/([A-Za-z0-9_.-]+)$/)
  if (!match) return
  const file = join(coverDir, match[1])
  try { if (existsSync(file)) unlinkSync(file) } catch {}
}

export function agentSkillCoverPath(fileName) {
  if (!/^[A-Za-z0-9_-]+\.(png|jpg|webp)$/.test(String(fileName || ''))) return ''
  const file = join(coverDir, fileName)
  return existsSync(file) ? file : ''
}

/** 解析 data:image/... 形式的封面上传。 */
export function decodeCoverDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return null
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_COVER_BYTES) return null
  return { buffer, extension: match[1] === 'jpeg' ? 'jpg' : match[1] }
}

async function upsertParsedSkill(user, parsed, { resources = {}, cover = null, source = 'upload', sourcePackageId = null } = {}) {
  const existing = await query(
    'SELECT id, status, source, cover_url FROM agent_skills WHERE organization_id = $1 AND slug = $2 AND deleted_at IS NULL',
    [user.organization.id, parsed.slug],
  )
  const row = existing.rows[0]
  if (row) {
    const coverUrl = cover ? saveCoverFile(row.id, cover) : ''
    await query(
      `UPDATE agent_skills SET title = $3, description = $4, instructions = $5, frontmatter = $6::jsonb, resources = $7::jsonb,
         icon = COALESCE(NULLIF($8, ''), icon), color = COALESCE(NULLIF($9, ''), color),
         cover_url = COALESCE(NULLIF($10, ''), cover_url), content_hash = $11, updated_at = now()
       WHERE id = $1 AND organization_id = $2`,
      [row.id, user.organization.id, parsed.title, parsed.description, parsed.instructions, JSON.stringify(parsed.frontmatter),
        JSON.stringify(resources), parsed.icon, parsed.color, coverUrl, parsed.contentHash],
    )
    if (coverUrl && row.cover_url) removeCoverFile(row.cover_url)
    return { id: row.id, slug: parsed.slug, title: parsed.title, action: 'updated', status: row.status }
  }
  const id = newId('askill')
  const coverUrl = cover ? saveCoverFile(id, cover) : ''
  const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM agent_skills WHERE organization_id = $1', [user.organization.id])
  await query(
    `INSERT INTO agent_skills (id, organization_id, slug, title, description, instructions, frontmatter, resources, icon, color,
       cover_url, status, source, source_package_id, content_hash, sort_order, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,'draft',$12,$13,$14,$15,$16)`,
    [id, user.organization.id, parsed.slug, parsed.title, parsed.description, parsed.instructions, JSON.stringify(parsed.frontmatter),
      JSON.stringify(resources), parsed.icon, parsed.color, coverUrl, source, sourcePackageId, parsed.contentHash,
      order.rows[0]?.next || 10, user.id],
  )
  return { id, slug: parsed.slug, title: parsed.title, action: 'created', status: 'draft' }
}

/**
 * 导入技能。items: [{ fileName, text }]（单个 SKILL.md）或 [{ fileName, zipBase64 }]（压缩包）。
 * 同名（slug 相同）的技能视为新版本，覆盖内容但保留上下架状态。新技能一律先是草稿，测试后再发布。
 */
export async function importAgentSkills(user, items = []) {
  await assertOrgAdmin(user)
  await prepare(user)
  const list = (Array.isArray(items) ? items : []).slice(0, 20)
  if (!list.length) throw fail('没有收到可导入的文件')
  const imported = []
  const skipped = []
  for (const item of list) {
    const fileName = clean(item?.fileName || 'SKILL.md', 160)
    try {
      if (item?.zipBase64) {
        const archive = await parseSkillArchive(Buffer.from(String(item.zipBase64), 'base64'))
        for (const entry of archive) {
          try {
            const parsed = parseSkillMarkdown(entry.markdown, { fallbackName: entry.folderName })
            const saved = await upsertParsedSkill(user, parsed, { resources: entry.resources, cover: entry.cover })
            imported.push({ ...saved, fileName: `${fileName} › ${entry.fileName}`, skippedFiles: entry.skipped })
          } catch (error) {
            skipped.push({ fileName: `${fileName} › ${entry.fileName}`, reason: error.message || '解析失败' })
          }
        }
      } else {
        const parsed = parseSkillMarkdown(item?.text || '', { fallbackName: fileName.replace(/\.md$/i, '').replace(/^skill$/i, '') })
        imported.push({ ...(await upsertParsedSkill(user, parsed)), fileName, skippedFiles: [] })
      }
    } catch (error) {
      skipped.push({ fileName, reason: error.message || '解析失败' })
    }
  }
  if (imported.length) {
    await logAudit(user.id, user.organization.id, 'agent_skill.import', 'agent_skill', imported.map((item) => item.id).join(','), { imported: imported.length, skipped: skipped.length })
  }
  return { imported, skipped }
}

/** 把旧「技能包」里已上传的 SKILL.md 直接变成智能体技能。 */
export async function importSkillFromPackage(user, packageId) {
  await assertOrgAdmin(user)
  await prepare(user)
  const result = await query(
    'SELECT id, package_key, body, title, cover_url FROM ai_skill_packages WHERE id = $1 AND organization_id = $2',
    [packageId, user.organization.id],
  )
  const row = result.rows[0]
  if (!row) throw fail('技能包不存在', 404)
  const parsed = parseSkillMarkdown(row.body || '', { fallbackName: row.package_key || '' })
  if (!parsed.title || parsed.title === parsed.slug) parsed.title = clean(row.title || parsed.slug, 40)
  const saved = await upsertParsedSkill(user, parsed, { source: 'package', sourcePackageId: row.id })
  if (row.cover_url && /^\/api\//.test(row.cover_url)) {
    await query("UPDATE agent_skills SET cover_url = $2 WHERE id = $1 AND cover_url = ''", [saved.id, row.cover_url])
  }
  return saved
}

export async function updateAgentSkill(user, id, patch = {}) {
  const current = await getSkillForAdmin(user, id)
  const next = {
    title: patch.title === undefined ? current.title : clean(patch.title, 40),
    description: patch.description === undefined ? current.description : clean(patch.description, 1024),
    instructions: patch.instructions === undefined ? current.instructions : String(patch.instructions || '').trim(),
    icon: patch.icon === undefined ? current.icon : clean(patch.icon, 8),
    color: patch.color === undefined ? current.color : (COLOR_PATTERN.test(String(patch.color || '')) ? patch.color : ''),
    starterPrompts: patch.starterPrompts === undefined ? current.starterPrompts
      : (Array.isArray(patch.starterPrompts) ? patch.starterPrompts : []).map((item) => clean(item, 60)).filter(Boolean).slice(0, 6),
    sortOrder: patch.sortOrder === undefined ? current.sortOrder : Math.max(0, Math.min(100000, Math.floor(Number(patch.sortOrder) || 0))),
    status: patch.status === undefined ? current.status : String(patch.status),
  }
  if (!next.title) throw fail('技能名称不能为空')
  if (!next.description) throw fail('技能说明不能为空：AI 靠这句话判断什么时候使用它')
  if (!next.instructions) throw fail('技能正文不能为空')
  if (next.instructions.length > MAX_INSTRUCTIONS) throw fail(`技能正文过长（上限 ${MAX_INSTRUCTIONS} 字）`)
  if (!STATUSES.has(next.status)) throw fail('技能状态无效')
  let coverUrl = current.coverUrl
  if (patch.coverData) {
    const cover = decodeCoverDataUrl(patch.coverData)
    if (!cover) throw fail('封面图片无效：仅支持 PNG / JPG / WEBP，且不超过 2MB')
    coverUrl = saveCoverFile(current.id, cover)
    removeCoverFile(current.coverUrl)
  } else if (patch.coverUrl === '') {
    removeCoverFile(current.coverUrl)
    coverUrl = ''
  }
  await query(
    `UPDATE agent_skills SET title=$3, description=$4, instructions=$5, icon=$6, color=$7, starter_prompts=$8::jsonb,
       sort_order=$9, status=$10, cover_url=$11, content_hash=$12, updated_at=now()
     WHERE id=$1 AND organization_id=$2`,
    [current.id, user.organization.id, next.title, next.description, next.instructions, next.icon, next.color,
      JSON.stringify(next.starterPrompts), next.sortOrder, next.status, coverUrl, hashText(next.instructions)],
  )
  if (patch.status !== undefined && patch.status !== current.status) {
    await logAudit(user.id, user.organization.id, 'agent_skill.status', 'agent_skill', current.id, { from: current.status, to: next.status })
  }
  return getSkillForAdmin(user, id)
}

/** 软删除：保留记录，避免内置技能被重新写入。 */
export async function deleteAgentSkill(user, id) {
  const current = await getSkillForAdmin(user, id)
  await query('UPDATE agent_skills SET deleted_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2', [current.id, user.organization.id])
  removeCoverFile(current.coverUrl)
  await logAudit(user.id, user.organization.id, 'agent_skill.delete', 'agent_skill', current.id, { slug: current.slug })
  return { id: current.id }
}

/** 导出为标准 SKILL.md 文本（便于下载备份或迁移到其他平台）。 */
export function skillToMarkdown(skill) {
  const frontmatter = {
    ...(skill.frontmatter || {}),
    name: skill.slug,
    description: skill.description,
    metadata: { ...((skill.frontmatter || {}).metadata || {}), title: skill.title, ...(skill.icon ? { icon: skill.icon } : {}), ...(skill.color ? { color: skill.color } : {}) },
  }
  return `---\n${YAML.stringify(frontmatter).trim()}\n---\n\n${skill.instructions}\n`
}
