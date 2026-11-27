import { randomBytes } from 'node:crypto'
import { logAudit } from './auth.js'
import { query, withTransaction } from './db.js'

const INPUT_TYPES = new Set(['text', 'textarea', 'select', 'image', 'switch'])
const PAGE_BLOCK_TYPES = new Set(['image', 'images', 'text', 'textarea', 'select', 'switch', 'count', 'ratio', 'heading', 'example', 'submit', 'result'])
const SKILL_TYPES = new Set(['image', 'video'])
// 用途：区分同表里的「学生 AI 玩法」与「H5 报告配图工作流」，两个后台模块各查各的。
const USAGE_KINDS = new Set(['student_skill', 'report_workflow'])
const PROVIDERS = new Set(['agnes', 'volcengine'])
const CAPABILITIES = {
  image: new Set(['text-to-image', 'image-to-image']),
  video: new Set(['text-to-video', 'image-to-video']),
}
// 工作流封面来源：上传图片 / AI 生成 / 用画布第一页。
const COVER_SOURCES = new Set(['upload', 'ai', 'canvas-first-page'])

// 一个出图节点最多出几张。前端画布节点的「张数」档位、/ai/image/generate、工作流规划
// 全都读这一个数，改这里一处即可。
export const MAX_GENERATION_COUNT = 4

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function fail(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function platformOrganizationId() {
  return String(process.env.PLATFORM_ORGANIZATION_ID || '').trim()
}

function platformAdminIds() {
  return new Set(String(process.env.PLATFORM_SKILL_ADMIN_IDS || '').split(',').map((item) => item.trim()).filter(Boolean))
}

function canManagePlatform(user) {
  const organizationId = platformOrganizationId()
  const allowedIds = platformAdminIds()
  return Boolean(organizationId && user?.organization?.id === organizationId && (!allowedIds.size || allowedIds.has(user.id)))
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function cleanKey(value) {
  // 无限画布现有节点和连线 ID 使用连字符；保留它才能让学生页面绑定回原节点。
  return cleanText(value, 48).replace(/[^a-zA-Z0-9_-]/g, '')
}

// 连线 ID 必须完整保存，不能沿用 cleanKey 的 48 字符上限。
// VueFlow 自动生成的连线 ID 是 `vueflow__edge-<源节点ID>-<目标节点ID>`，
// 一个「文字提示词 → 8 张结果图」的节点对，ID 长度通常在 60~70 之间，
// 截到 48 位后前 48 位完全相同（都停在 image-17…），
// 于是 8 条不同的连线被压成了同一个 ID。
// 后果：页面上 8 条线叠成一条斜线，用户看到「只有一根线连出去」；
// 再拖一根同源的线时，也因为这个 ID 已存在而被 VueFlow 判成重复，怎么拖都拖不上。
function cleanEdgeId(value, fallback = '') {
  const id = cleanText(value || fallback, 200).replace(/[^a-zA-Z0-9_-]/g, '')
  return id || cleanText(fallback, 200)
}

function normalizeInputField(field = {}, index = 0) {
  const key = cleanKey(field.key || `field_${index + 1}`)
  const type = cleanText(field.type || 'text', 20)
  if (!key) throw fail(`第 ${index + 1} 个输入项缺少字段标识`)
  if (!INPUT_TYPES.has(type)) throw fail(`输入项 ${key} 的类型不受支持`)
  const options = type === 'select'
    ? (Array.isArray(field.options) ? field.options : []).map((item) => ({
      label: cleanText(item?.label ?? item, 80), value: cleanText(item?.value ?? item, 80),
    })).filter((item) => item.value)
    : []
  if (type === 'select' && !options.length) throw fail(`下拉输入项 ${key} 至少需要一个选项`)
  return {
    key,
    label: cleanText(field.label || key, 80),
    type,
    required: Boolean(field.required),
    placeholder: cleanText(field.placeholder, 160),
    defaultValue: type === 'switch' ? Boolean(field.defaultValue) : cleanText(field.defaultValue, 300),
    maxLength: Math.min(Math.max(Number(field.maxLength || (type === 'textarea' ? 1000 : 160)), 1), 3000),
    options,
  }
}

function safeJson(value, fallback) {
  try { return JSON.parse(JSON.stringify(value ?? fallback)) } catch { return fallback }
}

function normalizeWorkflow(raw = {}, skillType = '') {
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).slice(0, 80).map((node, index) => ({
    id: cleanKey(node.id || `node_${index + 1}`),
    type: cleanText(node.type, 30),
    position: { x: Number(node.position?.x || 0), y: Number(node.position?.y || 0) },
    data: safeJson(node.data, {}),
  })).filter((node) => node.id && ['upload', 'prompt', 'video', 'result', 'image', 'text', 'marker'].includes(node.type))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const usedEdgeIds = new Set()
  const edges = (Array.isArray(raw.edges) ? raw.edges : []).slice(0, 120).map((edge, index) => {
    const fallback = `edge_${index + 1}`
    const source = cleanKey(edge.source)
    const target = cleanKey(edge.target)
    // 历史数据里同一源节点的多条连线 ID 可能已经撞在一起（被截断成一样），
    // 这里按出现顺序补后缀重新分开，否则重新保存一次又会被去重合并。
    let id = cleanEdgeId(edge.id, fallback)
    if (usedEdgeIds.has(id)) {
      let suffix = 2
      while (usedEdgeIds.has(`${id}_${suffix}`)) suffix += 1
      id = `${id}_${suffix}`
    }
    usedEdgeIds.add(id)
    return { id, source, target, type: 'default' }
  }).filter((edge) => edge.id && nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target)
  if (!nodes.some((node) => ['video', 'image'].includes(node.type))) throw fail('工作流缺少图像或视频生成节点')
  // 结果节点改为选填：没画结果节点时，服务端会取最后一个生成节点作为结果展示。
  // 前端 validateSkillDraft 早已放开，这里不同步会让老师重搭画布后永远存不了草稿。
  if (!edges.length) throw fail('工作流至少需要一条有效连线')
  if (skillType === 'video' && !nodes.some((node) => node.type === 'video')) throw fail('视频玩法缺少视频生成节点')
  return {
    version: 1, nodes, edges,
    settings: safeJson(raw.settings, {}),
    edgesVisible: raw.edgesVisible !== false,
  }
}

// 按连线拓扑顺序推导「流程摘要」，如 手稿 → 线稿强化 → 材质渲染 → 成品图。
function deriveFlowSummary(nodes = [], edges = []) {
  if (!nodes.length) return []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) if (incoming.has(edge.target)) incoming.set(edge.target, incoming.get(edge.target) + 1)
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
  const ordered = []
  const seen = new Set()
  while (queue.length && ordered.length < nodes.length) {
    const id = queue.shift()
    if (seen.has(id) || !byId.has(id)) continue
    seen.add(id)
    ordered.push(byId.get(id))
    for (const edge of edges) if (edge.source === id && !seen.has(edge.target)) queue.push(edge.target)
  }
  for (const node of nodes) if (!seen.has(node.id)) ordered.push(node)
  return ordered
    .filter((node) => node.type !== 'marker')
    .map((node) => cleanText(node.data?.title || node.data?.label || node.type, 24))
    .filter(Boolean)
    .slice(0, 6)
}

// 工作流库附加元数据：只服务后台列表展示与学生端可选性，不参与生成执行。
function normalizeH5WorkflowMeta(raw = {}, workflow = {}) {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []
  const edges = Array.isArray(workflow.edges) ? workflow.edges : []
  const provided = (Array.isArray(raw.flowSummary) ? raw.flowSummary : [])
    .map((item) => cleanText(typeof item === 'string' ? item : item?.label, 24))
    .filter(Boolean)
    .slice(0, 8)
  return {
    studentSelectable: Boolean(raw.studentSelectable),
    estimatedMinutes: Math.min(Math.max(Number(raw.estimatedMinutes || 0), 0), 240),
    pageCount: Math.min(Math.max(Number(raw.pageCount || 0), 0), 24),
    flowSummary: provided.length ? provided : deriveFlowSummary(nodes, edges),
  }
}

function normalizePageBlock(block = {}, index = 0) {
  const type = cleanText(block.type, 24)
  if (!PAGE_BLOCK_TYPES.has(type)) throw fail(`第 ${index + 1} 个小画家页面组件不受支持`)
  const options = (Array.isArray(block.options) ? block.options : []).slice(0, 30).map((item) => ({
    label: cleanText(item?.label ?? item, 80), value: cleanText(item?.value ?? item, 80),
  })).filter((item) => item.value)
  return {
    id: cleanKey(block.id || `block_${index + 1}`), type, key: cleanKey(block.key), binding: cleanText(block.binding, 80),
    span: [4, 6, 8, 12].includes(Number(block.span)) ? Number(block.span) : 12,
    label: cleanText(block.label, 80), description: cleanText(block.description, 300), placeholder: cleanText(block.placeholder, 160),
    required: Boolean(block.required), defaultValue: type === 'switch' ? Boolean(block.defaultValue) : cleanText(block.defaultValue, 300),
    imageUrl: cleanText(block.imageUrl, 2000), maxLength: Math.min(Math.max(Number(block.maxLength || (type === 'textarea' ? 1000 : 200)), 1), 3000), options,
  }
}

function normalizeConfiguration(raw = {}, skillType = '', options = {}) {
  const allowIncomplete = Boolean(options.allowIncomplete)
  // 报告工作流（report_workflow）没有「学生使用页面」：表单组件、表单字段、字段绑定表
  // 一律不产出（旧模板里残留的默认组件会在下次保存时被清掉）。节点由老师在画布上自由搭。
  // AI 玩法卡（student_skill）的学生页面真实把组件投递到画布节点，这部分照旧。
  const usageKind = cleanText(options.usageKind || raw.usageKind || raw.usage_kind, 30)
  const hasStudentForm = usageKind !== 'report_workflow'
  const type = cleanText(skillType || raw.skillType, 20)
  if (!SKILL_TYPES.has(type)) throw fail('玩法类型仅支持图像或视频')
  const pageBlocks = hasStudentForm
    ? (Array.isArray(raw.studentPage?.blocks) ? raw.studentPage.blocks : []).slice(0, 30).map(normalizePageBlock)
    : []
  const derivedFields = pageBlocks.filter((block) => ['image', 'images', 'text', 'textarea', 'select', 'switch', 'count', 'ratio'].includes(block.type)).map((block) => ({
    ...block, type: block.type === 'images' ? 'image' : ['count', 'ratio'].includes(block.type) ? 'select' : block.type,
    options: block.type === 'count' ? [1, 2, 3, 4].map((value) => ({ label: String(value), value: String(value) })) : block.options,
  }))
  const inputFields = hasStudentForm
    ? (pageBlocks.length ? derivedFields : (Array.isArray(raw.inputFields) ? raw.inputFields : [])).slice(0, 20).map(normalizeInputField)
    : []
  const keys = new Set()
  for (const field of inputFields) {
    if (keys.has(field.key)) throw fail(`输入项字段标识重复：${field.key}`)
    keys.add(field.key)
  }
  const generation = raw.runtime || raw.generation || {}
  const provider = cleanText(generation.provider, 40)
  const capability = cleanText(generation.capability, 40)
  if (!PROVIDERS.has(provider)) throw fail('请选择已接入的 Agnes 或火山引擎供应商')
  if (!CAPABILITIES[type].has(capability)) throw fail('玩法类型与生成能力不匹配')
  if (type === 'video' && provider !== 'agnes') throw fail('当前视频玩法仅支持 Agnes 视频接口')
  // 画布上搭了生成节点时，提示词可以只写在「创作提示词」节点里，允许运行时模板为空。
  const rawWorkflowNodes = Array.isArray(raw.workflow?.nodes) ? raw.workflow.nodes : []
  const canvasHasGenerator = rawWorkflowNodes.some((node) => ['image', 'video'].includes(cleanText(node?.type, 24)))
  const canvasPrompts = rawWorkflowNodes
    .filter((node) => ['prompt', 'text'].includes(cleanText(node?.type, 24)))
    .map((node) => workflowNodePrompt(node))
    .filter(Boolean)
  const promptTemplate = cleanText(generation.promptTemplate, 4000)
  if (!promptTemplate && !canvasHasGenerator) throw fail('请填写提示词模板')
  if (!promptTemplate && !canvasPrompts.length) throw fail('提示词是空的：请在「工作流配置」里填写提示词模板，或编辑画布上的创作提示词节点')
  // 画布「创作提示词」节点里写的文案同样会做变量替换，一并校验，
  // 免得出现「学生填了字、提示词里却是空白」这种不报错的坑。
  const variables = [...new Set([promptTemplate, ...canvasPrompts].join('\n').matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g))].map((match) => match[1])
  if (!allowIncomplete && hasStudentForm) {
    for (const key of variables) if (!keys.has(key)) throw fail(`提示词里用到的 {{${key}}}，小画家在页面上没有对应的填写项`)
  }
  const imageFieldKeys = inputFields.filter((item) => item.type === 'image').map((item) => item.key)
  if (capability === 'image-to-video' && !imageFieldKeys.length) throw fail('图生视频玩法至少需要一个图片输入项')
  const workflow = normalizeWorkflow(raw.workflow || {}, type)
  if (!allowIncomplete && hasStudentForm) {
    if (!pageBlocks.length) throw fail('小画家使用页面至少需要一个组件')
    if (!pageBlocks.some((block) => block.type === 'submit')) throw fail('小画家使用页面缺少生成按钮')
    if (!pageBlocks.some((block) => block.type === 'result')) throw fail('小画家使用页面缺少结果组件')
  }
  // 学生页面组件 → 画布节点 的绑定校验。报告工作流没有学生页面，pageBlocks 恒为空，
  // 这段循环自然不会执行，所以不需要再单独加开关。
  const bindingKeys = new Set(workflow.nodes.map((node) => node.id))
  for (const block of pageBlocks) {
    if (block.binding && !block.binding.startsWith('runtime.') && !bindingKeys.has(block.binding)) throw fail(`${block.label || block.key}绑定的工作流节点不存在`)
  }
  const runtime = {
      provider,
      model: cleanText(generation.model, 120),
      capability,
      promptTemplate,
      negativePrompt: cleanText(generation.negativePrompt, 1000),
      ratio: cleanText(generation.ratio || (type === 'video' ? '16:9' : '1:1'), 12),
      quality: cleanText(generation.quality || 'standard', 30),
      resolution: cleanText(generation.resolution || '720P', 12),
      duration: cleanText(generation.duration || '5s', 12),
      frameRate: Math.min(Math.max(Number(generation.frameRate || 24), 12), 30),
      count: Math.min(Math.max(Number(generation.count || 1), 1), MAX_GENERATION_COUNT),
      testedAt: cleanText(generation.testedAt, 40),
  }
  return {
    schemaVersion: 2,
    inputFields,
    presentation: {
      coverUrl: cleanText(raw.presentation?.coverUrl, 2000),
      coverSource: COVER_SOURCES.has(cleanText(raw.presentation?.coverSource, 24)) ? cleanText(raw.presentation?.coverSource, 24) : '',
      coverGeneratedAt: cleanText(raw.presentation?.coverGeneratedAt, 40),
      exampleUrl: cleanText(raw.presentation?.exampleUrl, 2000),
      badge: cleanText(raw.presentation?.badge, 30),
      grade: cleanText(raw.presentation?.grade, 30),
    },
    workflow,
    studentPage: { layoutVersion: 1, columns: 12, blocks: pageBlocks },
    runtime,
    generation: runtime,
    bindings: Object.fromEntries(pageBlocks.filter((block) => block.key && block.binding).map((block) => [block.key, block.binding])),
    limits: { dailyLimit: Math.min(Math.max(Number(raw.limits?.dailyLimit || 0), 0), 100) },
    // 工作流库（方案2）附加元数据：只影响后台展示与学生端可选性，不参与生成执行。
    h5Workflow: normalizeH5WorkflowMeta(raw.h5Workflow || {}, workflow),
  }
}

function toSkill(row, includeDraft = false) {
  const base = {
    id: row.id, organizationId: row.organization_id, scopeType: row.scope_type, sourceSkillId: row.source_skill_id || '',
    skillType: row.skill_type, usageKind: row.usage_kind || 'student_skill', title: row.title, summary: row.summary || '', status: row.status,
    sortOrder: row.sort_order || 0, publishedVersionId: row.published_version_id || '', draftRevision: Number(row.draft_revision || 0),
    configuration: row.published_configuration || {}, createdAt: row.created_at, updatedAt: row.updated_at,
    // 学生端「技能玩法」顶部的分类标签靠这个字段筛选（来自技能包分类表）。
    categoryId: row.category_id || '', categoryName: row.category_name || '',
  }
  if (includeDraft) base.draftConfiguration = row.draft_configuration || {}
  return base
}

async function assertOrgAdmin(user) {
  if (user?.role !== 'admin' || !user?.organization?.id) throw fail('仅机构管理员可以管理玩法', 403)
  const result = await query(
    `SELECT 1 FROM admin_scopes WHERE admin_user_id = $1 AND organization_id = $2 LIMIT 1`,
    [user.id, user.organization.id],
  )
  if (!result.rows[0]) throw fail('当前管理员没有机构玩法管理范围', 403)
}

async function findAdminSkill(user, skillId) {
  await assertOrgAdmin(user)
  const result = await query('SELECT * FROM ai_skills WHERE id = $1 LIMIT 1', [skillId])
  const row = result.rows[0]
  if (!row) throw fail('玩法不存在', 404)
  const ownOrganization = row.organization_id === user.organization.id
  if ((row.scope_type === 'platform' && !canManagePlatform(user)) || (row.scope_type === 'organization' && !ownOrganization)) {
    throw fail('无权管理该玩法', 403)
  }
  return row
}

export async function listAdminSkills(user) {
  await assertOrgAdmin(user)
  const values = [user.organization.id]
  let scopeSql = 'scope_type = \'organization\' AND organization_id = $1'
  const platformId = platformOrganizationId()
  if (platformId) {
    values.push(platformId)
    scopeSql += ` OR (scope_type = 'platform' AND organization_id = $${values.length})`
  }
  const result = await query(
    `SELECT s.*, EXISTS(
       SELECT 1 FROM ai_skill_assignments a
       WHERE a.skill_id = s.id AND a.organization_id = $1 AND a.status = 'enabled'
     ) AS enabled_for_organization
     FROM ai_skills s WHERE (${scopeSql}) AND s.status <> 'archived' AND s.usage_kind = 'student_skill'
     ORDER BY CASE WHEN s.scope_type = 'platform' THEN 0 ELSE 1 END, s.sort_order ASC, s.updated_at DESC`,
    values,
  )
  return result.rows.map((row) => ({
    ...toSkill(row, row.organization_id === user.organization.id || canManagePlatform(user)),
    canEdit: row.organization_id === user.organization.id && (row.scope_type === 'organization' || canManagePlatform(user)),
    canCopy: row.scope_type === 'platform' && row.organization_id !== user.organization.id,
    enabledForOrganization: Boolean(row.enabled_for_organization),
  }))
}

export async function getAdminSkill(user, skillId) {
  const row = await findAdminSkill(user, skillId)
  const version = row.published_version_id
    ? await query('SELECT version_number FROM ai_skill_versions WHERE id=$1 AND skill_id=$2 LIMIT 1', [row.published_version_id, row.id])
    : { rows: [] }
  return { ...toSkill(row, true), publishedVersionNumber: Number(version.rows[0]?.version_number || 0), canManagePlatform: canManagePlatform(user) }
}

export async function createAdminSkill(user, payload = {}) {
  await assertOrgAdmin(user)
  const scopeType = cleanText(payload.scopeType || 'organization', 20)
  if (!['organization', 'platform'].includes(scopeType)) throw fail('玩法范围不正确')
  if (scopeType === 'platform' && !canManagePlatform(user)) throw fail('未配置平台玩法库管理员权限', 403)
  // 用途由创建入口决定：报告工作流库传 report_workflow，AI 玩法中心传 student_skill（默认）。
  const usageKind = cleanText(payload.usageKind || 'student_skill', 30) || 'student_skill'
  if (!USAGE_KINDS.has(usageKind)) throw fail('玩法用途不正确')
  const skillType = cleanText(payload.skillType, 20)
  const configuration = normalizeConfiguration(payload.configuration || {}, skillType, { usageKind })
  const title = cleanText(payload.title, 80)
  if (!title) throw fail('请填写玩法名称')
  const id = newId('skill')
  const result = await query(
    `INSERT INTO ai_skills (id, organization_id, scope_type, skill_type, usage_kind, title, summary, sort_order, draft_configuration, created_by_user_id, updated_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$10) RETURNING *`,
    [id, user.organization.id, scopeType, skillType, usageKind, title, cleanText(payload.summary, 300), Number(payload.sortOrder || 0), JSON.stringify(configuration), user.id],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill.create', 'ai_skill', id, { scopeType, skillType, usageKind, title })
  return toSkill(result.rows[0], true)
}

export async function updateAdminSkill(user, skillId, payload = {}) {
  const skill = await findAdminSkill(user, skillId)
  const configuration = normalizeConfiguration(payload.configuration || skill.draft_configuration || {}, skill.skill_type, { allowIncomplete: true, usageKind: skill.usage_kind })
  const title = cleanText(payload.title || skill.title, 80)
  if (!title) throw fail('请填写玩法名称')
  const expectedRevision = Number(payload.draftRevision ?? skill.draft_revision ?? 0)
  // 基础信息（名称/说明/卡片图）属于展示元数据，和标题一样应当保存即生效；
  // 但工作流与学生页面必须经过发布才生效，所以这里只把 presentation 段同步到已发布配置。
  const result = await query(
    `UPDATE ai_skills SET title=$1, summary=$2, sort_order=$3, draft_configuration=$4::jsonb,
       published_configuration = CASE WHEN status='published'
         THEN jsonb_set(COALESCE(published_configuration, '{}'::jsonb), '{presentation}', COALESCE($4::jsonb->'presentation', '{}'::jsonb))
         ELSE published_configuration END,
       draft_revision=draft_revision+1, updated_by_user_id=$5, updated_at=now()
     WHERE id=$6 AND draft_revision=$7 RETURNING *`,
    [title, cleanText(payload.summary, 300), Number(payload.sortOrder || 0), JSON.stringify(configuration), user.id, skillId, expectedRevision],
  )
  if (!result.rows[0]) throw fail('玩法草稿已被其他管理员更新，请刷新后重试', 409)
  await logAudit(user.id, user.organization.id, 'ai_skill.update_draft', 'ai_skill', skillId, { title })
  return toSkill(result.rows[0], true)
}

async function ensureAssignment(client, { skillId, versionId, organizationId, createdBy }) {
  const existing = await client.query(
    `SELECT id FROM ai_skill_assignments
     WHERE skill_id=$1 AND organization_id=$2 AND scope_type='organization' AND campus_id IS NULL AND class_id IS NULL AND permission_group_id IS NULL LIMIT 1`,
    [skillId, organizationId],
  )
  if (existing.rows[0]) {
    await client.query('UPDATE ai_skill_assignments SET version_id=$1, status=\'enabled\', updated_at=now() WHERE id=$2', [versionId, existing.rows[0].id])
    return existing.rows[0].id
  }
  const id = newId('assign')
  await client.query(
    `INSERT INTO ai_skill_assignments (id, skill_id, version_id, organization_id, scope_type, created_by_user_id)
     VALUES ($1,$2,$3,$4,'organization',$5)`,
    [id, skillId, versionId, organizationId, createdBy],
  )
  return id
}

export async function publishAdminSkill(user, skillId) {
  const skill = await findAdminSkill(user, skillId)
  const configuration = normalizeConfiguration(skill.draft_configuration || {}, skill.skill_type, { usageKind: skill.usage_kind })
  if (!configuration.runtime?.testedAt) throw fail('发布前必须先完成一次真实测试')
  const published = await withTransaction(async (client) => {
    const count = await client.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM ai_skill_versions WHERE skill_id=$1', [skillId])
    const versionId = newId('skillv')
    await client.query(
      `INSERT INTO ai_skill_versions (id, skill_id, version_number, configuration, created_by_user_id)
       VALUES ($1,$2,$3,$4::jsonb,$5)`,
      [versionId, skillId, Number(count.rows[0].next), JSON.stringify(configuration), user.id],
    )
    const updated = await client.query(
      `UPDATE ai_skills SET status='published', published_configuration=$1::jsonb, published_version_id=$2, updated_by_user_id=$3, updated_at=now()
       WHERE id=$4 RETURNING *`,
      [JSON.stringify(configuration), versionId, user.id, skillId],
    )
    if (skill.scope_type === 'organization') {
      await ensureAssignment(client, { skillId, versionId, organizationId: user.organization.id, createdBy: user.id })
    }
    return updated.rows[0]
  })
  await logAudit(user.id, user.organization.id, 'ai_skill.publish', 'ai_skill', skillId, { versionId: published.published_version_id })
  return toSkill(published, true)
}

export async function setAdminSkillStatus(user, skillId, status) {
  const skill = await findAdminSkill(user, skillId)
  const nextStatus = cleanText(status, 20)
  if (!['offline', 'archived', 'draft'].includes(nextStatus)) throw fail('不支持的玩法状态')
  const result = await query('UPDATE ai_skills SET status=$1, updated_by_user_id=$2, updated_at=now() WHERE id=$3 RETURNING *', [nextStatus, user.id, skill.id])
  await logAudit(user.id, user.organization.id, 'ai_skill.status', 'ai_skill', skillId, { status: nextStatus })
  return toSkill(result.rows[0], true)
}

export async function deleteAdminSkill(user, skillId) {
  const skill = await findAdminSkill(user, skillId)
  await withTransaction(async (client) => {
    await client.query('DELETE FROM ai_skill_daily_usage WHERE skill_id=$1', [skill.id])
    await client.query('DELETE FROM ai_skill_assignments WHERE skill_id=$1', [skill.id])
    await client.query('DELETE FROM ai_skill_versions WHERE skill_id=$1', [skill.id])
    await client.query('DELETE FROM ai_skills WHERE id=$1', [skill.id])
  })
  await logAudit(user.id, user.organization.id, 'ai_skill.delete', 'ai_skill', skillId, { title: skill.title })
  return { ok: true }
}

export async function listAdminSkillVersions(user, skillId) {
  await findAdminSkill(user, skillId)
  const result = await query(
    'SELECT id, version_number, created_at, created_by_user_id FROM ai_skill_versions WHERE skill_id=$1 ORDER BY version_number DESC',
    [skillId],
  )
  return result.rows.map((row) => ({ id: row.id, versionNumber: Number(row.version_number), createdAt: row.created_at, createdByUserId: row.created_by_user_id || '' }))
}

export async function restoreAdminSkillVersion(user, skillId, versionId) {
  const skill = await findAdminSkill(user, skillId)
  const version = await query('SELECT configuration FROM ai_skill_versions WHERE id=$1 AND skill_id=$2 LIMIT 1', [versionId, skillId])
  if (!version.rows[0]) throw fail('玩法版本不存在', 404)
  const configuration = normalizeConfiguration(version.rows[0].configuration || {}, skill.skill_type, { usageKind: skill.usage_kind })
  const result = await query(
    `UPDATE ai_skills SET draft_configuration=$1::jsonb, draft_revision=draft_revision+1, updated_by_user_id=$2, updated_at=now() WHERE id=$3 RETURNING *`,
    [JSON.stringify(configuration), user.id, skillId],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill.restore_version', 'ai_skill', skillId, { versionId })
  return toSkill(result.rows[0], true)
}

export async function copyPlatformSkill(user, skillId) {
  await assertOrgAdmin(user)
  const platformId = platformOrganizationId()
  if (!platformId) throw fail('平台玩法库尚未配置 PLATFORM_ORGANIZATION_ID', 503)
  const source = await query(`SELECT * FROM ai_skills WHERE id=$1 AND scope_type='platform' AND organization_id=$2 AND status='published' LIMIT 1`, [skillId, platformId])
  if (!source.rows[0]) throw fail('平台玩法不存在或尚未发布', 404)
  const row = source.rows[0]
  const id = newId('skill')
  const created = await query(
    `INSERT INTO ai_skills (id,organization_id,scope_type,source_skill_id,skill_type,usage_kind,title,summary,sort_order,draft_configuration,created_by_user_id,updated_by_user_id)
     VALUES ($1,$2,'organization',$3,$4,$10,$5,$6,$7,$8::jsonb,$9,$9) RETURNING *`,
    [id, user.organization.id, row.id, row.skill_type, `${row.title}（机构版）`, row.summary, row.sort_order, JSON.stringify(row.published_configuration || {}), user.id, row.usage_kind || 'student_skill'],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill.copy_platform', 'ai_skill', id, { sourceSkillId: skillId })
  return toSkill(created.rows[0], true)
}

export async function enablePlatformSkillForOrganization(user, skillId, enabled) {
  await assertOrgAdmin(user)
  const platformId = platformOrganizationId()
  if (!platformId) throw fail('平台玩法库尚未配置 PLATFORM_ORGANIZATION_ID', 503)
  const skill = await query(`SELECT * FROM ai_skills WHERE id=$1 AND scope_type='platform' AND organization_id=$2 AND status='published' LIMIT 1`, [skillId, platformId])
  if (!skill.rows[0]) throw fail('平台玩法不存在或尚未发布', 404)
  await withTransaction(async (client) => {
    const assignmentId = await ensureAssignment(client, {
      skillId, versionId: skill.rows[0].published_version_id, organizationId: user.organization.id, createdBy: user.id,
    })
    if (!enabled) await client.query("UPDATE ai_skill_assignments SET status='disabled', updated_at=now() WHERE id=$1", [assignmentId])
  })
  await logAudit(user.id, user.organization.id, 'ai_skill.platform_enable', 'ai_skill', skillId, { enabled: Boolean(enabled) })
  return { ok: true, enabled: Boolean(enabled) }
}

/**
 * 学生能不能用这个技能：已发布 + 有生效的分发（机构/机构分部/班级/权限组四选一）。
 * ⚠️ 玩法卡是 usage_kind='student_skill'，报告工作流是 'report_workflow'，
 * 两者除了这个字段其余条件完全一样 —— 所以抽成工厂，别各写一份走样。
 */
function studentVisibleSql(usageKind) { return `
  SELECT s.* FROM ai_skills s
  WHERE s.id = $1 AND s.status = 'published' AND s.usage_kind = '${usageKind}' AND EXISTS (
    SELECT 1 FROM ai_skill_assignments a
    WHERE a.skill_id = s.id AND a.organization_id = $2 AND a.status = 'enabled' AND (
      a.scope_type = 'organization'
      OR (a.scope_type = 'campus' AND a.campus_id = $3)
      OR (a.scope_type = 'class' AND EXISTS (
        SELECT 1 FROM class_students cs WHERE cs.class_id=a.class_id AND cs.student_user_id=$4 AND cs.organization_id=$2
      ))
      OR (a.scope_type = 'permission_group' AND EXISTS (
        SELECT 1 FROM permission_group_members pgm WHERE pgm.group_id=a.permission_group_id AND pgm.user_id=$4 AND pgm.organization_id=$2
      ))
    )
  ) LIMIT 1` }

const STUDENT_VISIBLE_SQL = studentVisibleSql('student_skill')
// 报告工作流库里的模板走这个。⚠️ 早先方案2的执行入口误用了上面那条（student_skill），
// 于是 report_workflow 永远查不到 → 一跑就 404「工作流不存在」。见 prepareH5ReportWorkflowRun。
const STUDENT_VISIBLE_WORKFLOW_SQL = studentVisibleSql('report_workflow')

export async function listStudentSkills(user, skillType = '') {
  if (!user?.organization?.id) throw fail('请先登录', 401)
  const type = cleanText(skillType, 20)
  if (type && !SKILL_TYPES.has(type)) throw fail('玩法类型不正确')
  // 带上分类名：学生端「技能玩法」顶部要按分类出标签，前端不该再猜一次名字。
  const result = await query(
    `SELECT s.*, c.name AS category_name FROM ai_skills s
     LEFT JOIN ai_skill_package_categories c ON c.id = s.category_id
     WHERE s.status='published' AND s.usage_kind='student_skill' ${type ? 'AND s.skill_type=$4' : ''} AND EXISTS (
      SELECT 1 FROM ai_skill_assignments a WHERE a.skill_id=s.id AND a.organization_id=$1 AND a.status='enabled' AND (
        a.scope_type='organization' OR (a.scope_type='campus' AND a.campus_id=$2)
        OR (a.scope_type='class' AND EXISTS (SELECT 1 FROM class_students cs WHERE cs.class_id=a.class_id AND cs.student_user_id=$3 AND cs.organization_id=$1))
        OR (a.scope_type='permission_group' AND EXISTS (SELECT 1 FROM permission_group_members pgm WHERE pgm.group_id=a.permission_group_id AND pgm.user_id=$3 AND pgm.organization_id=$1))
      )
    ) ORDER BY s.sort_order ASC, s.updated_at DESC`,
    type ? [user.organization.id, user.campus?.id || '', user.id, type] : [user.organization.id, user.campus?.id || '', user.id],
  )
  return result.rows.map((row) => toSkill(row, false))
}

function validateValues(configuration, values = {}) {
  const normalized = {}
  for (const field of configuration.inputFields || []) {
    const raw = values[field.key] ?? field.defaultValue
    if (field.type === 'switch') normalized[field.key] = Boolean(raw)
    else if (field.type === 'image') normalized[field.key] = Array.isArray(raw)
      ? raw.slice(0, 6).map((item) => cleanText(item, 4_000_000)).filter(Boolean)
      : cleanText(raw, 4_000_000)
    else normalized[field.key] = cleanText(raw, field.maxLength)
    if (field.required && (normalized[field.key] === '' || normalized[field.key] === null || (Array.isArray(normalized[field.key]) && !normalized[field.key].length))) throw fail(`请填写${field.label}`)
    if (field.type === 'select' && normalized[field.key] && !field.options.some((item) => item.value === normalized[field.key])) throw fail(`${field.label} 的选项无效`)
  }
  return normalized
}

function interpolate(template, values) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(values[key] ?? ''))
    .replace(/\n{3,}/g, '\n\n').trim()
}

export function buildSkillGenerationRequest(skill, values = {}) {
  const configuration = normalizeConfiguration(skill.configuration || {}, skill.skillType)
  const input = validateValues(configuration, values)
  const generation = configuration.generation
  const images = configuration.inputFields.filter((field) => field.type === 'image').flatMap((field) => Array.isArray(input[field.key]) ? input[field.key] : [input[field.key]]).filter(Boolean)
  return {
    skill, configuration, input,
    request: {
      provider: generation.provider, model: generation.model, prompt: interpolate(generation.promptTemplate, input),
      negativePrompt: generation.negativePrompt, ratio: generation.ratio, quality: generation.quality,
      resolution: generation.resolution, duration: generation.duration, frameRate: generation.frameRate,
      count: generation.count, images, referenceImage: images[0] || '', capability: generation.capability,
    },
  }
}

/* ------------------------------------------------------------------
 * 画布工作流执行器
 * ------------------------------------------------------------------
 * 背景：buildSkillGenerationRequest 只看 runtime.promptTemplate，
 * 画布上的 nodes/edges 从未参与执行——学生点生成时跑的不是老师搭的流程。
 * 这里把画布翻译成「按连线顺序执行的步骤表」，并负责把学生填写的内容
 * 注入到它绑定的那个节点上（binding === node.id）。
 */

// 只做「把素材交出去」的节点：学生上传入口
const WORKFLOW_INPUT_TYPES = new Set(['upload', 'reference', 'material', 'sketch'])
// 只做「产出文字」的节点
const WORKFLOW_PROMPT_TYPES = new Set(['prompt', 'text', 'note'])
// 真正会调模型的节点
const WORKFLOW_GENERATION_TYPES = new Set(['image', 'video'])

function workflowNodesOf(configuration) {
  const nodes = Array.isArray(configuration?.workflow?.nodes) ? configuration.workflow.nodes : []
  return nodes.filter((node) => node && cleanText(node.id, 60))
}

// 判断这条玩法是否真的在画布上搭了可执行流程
export function hasSkillWorkflow(configuration) {
  return workflowNodesOf(configuration).some((node) => WORKFLOW_GENERATION_TYPES.has(cleanText(node.type, 24)))
}

// 画布上新建节点时默认填的是「占位说明」，不是老师真正写的提示词。
// 与 src/utils/aiSkillSchema.js 的 defaultWorkflow() 保持同步——那边改文案这里要一起改，
// 否则占位说明会被当成提示词拼进请求，把正式提示词顶掉。
const WORKFLOW_PROMPT_PLACEHOLDERS = new Set(['描述希望生成的画面', '描述人物动作与镜头'])

// 节点的提示词写在 data.prompt / data.text / data.content，画布不同版本用过不同字段名
function workflowNodePrompt(node) {
  const data = node?.data || {}
  const text = cleanText(data.prompt || data.text || data.content || '', 4000)
  return WORKFLOW_PROMPT_PLACEHOLDERS.has(text) ? '' : text
}

function workflowNodeHasPrompt(node) {
  return Boolean(workflowNodePrompt(node))
}

// 学生页上绑定到这个节点的图片字段值
function workflowBoundImages(configuration, input, nodeId) {
  const blocks = configuration.studentPage?.blocks || []
  return blocks
    .filter((block) => block.binding === nodeId && ['image', 'images'].includes(block.type) && block.key)
    .flatMap((block) => (Array.isArray(input[block.key]) ? input[block.key] : [input[block.key]]))
    .filter(Boolean)
}

// 学生页上绑定到这个节点的文字字段名
function workflowBoundFieldKeys(configuration, nodeId) {
  const blocks = configuration.studentPage?.blocks || []
  return blocks
    .filter((block) => block.binding === nodeId && block.key && !['image', 'images', 'result', 'submit', 'heading', 'example'].includes(block.type))
    .map((block) => block.key)
}

// 学生页上绑定到这个节点的文字字段值
function workflowBoundText(configuration, input, nodeId) {
  const blocks = configuration.studentPage?.blocks || []
  return blocks
    .filter((block) => block.binding === nodeId && block.key && !['image', 'images', 'result', 'submit', 'heading', 'example'].includes(block.type))
    .map((block) => cleanText(input[block.key], block.maxLength || 1000))
    .filter(Boolean)
    .join('\n')
}

// Kahn 拓扑排序；画布上手绘的连线可能成环，这里明确报错而不是死循环
function workflowTopoOrder(nodes, edges) {
  const ids = nodes.map((node) => node.id)
  const exists = new Set(ids)
  const indegree = new Map(ids.map((id) => [id, 0]))
  const next = new Map(ids.map((id) => [id, []]))
  for (const edge of Array.isArray(edges) ? edges : []) {
    const source = cleanText(edge?.source, 60)
    const target = cleanText(edge?.target, 60)
    if (!exists.has(source) || !exists.has(target) || source === target) continue
    next.get(source).push(target)
    indegree.set(target, indegree.get(target) + 1)
  }
  const queue = ids.filter((id) => indegree.get(id) === 0)
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const target of next.get(id)) {
      indegree.set(target, indegree.get(target) - 1)
      if (indegree.get(target) === 0) queue.push(target)
    }
  }
  if (order.length !== ids.length) throw fail('画布连线形成了循环，请检查节点连线的方向')
  return order
}

/**
 * 纯规划：把 workflow 变成步骤表，不发任何网络请求。
 * 返回 { steps, images, prompt }，其中 steps 至少一个（生成节点）。
 * 供 buildSkillWorkflowRequest 与干跑校验共用。
 */
export function planSkillWorkflow(configuration, input = {}) {
  const nodes = workflowNodesOf(configuration)
  const edges = configuration.workflow?.edges || []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(nodes.map((node) => [node.id, []]))
  for (const edge of Array.isArray(edges) ? edges : []) {
    const source = cleanText(edge?.source, 60)
    const target = cleanText(edge?.target, 60)
    if (byId.has(source) && byId.has(target) && source !== target) incoming.get(target).push(source)
  }

  const generation = configuration.generation || {}
  const outputs = new Map()
  const steps = []

  for (const id of workflowTopoOrder(nodes, edges)) {
    const node = byId.get(id)
    const type = cleanText(node.type, 24)
    const upstream = incoming.get(id).map((sourceId) => outputs.get(sourceId)).filter(Boolean)
    const upstreamImages = [...new Set(upstream.flatMap((item) => item.images || []))]
    const upstreamText = upstream.map((item) => item.text || '').filter(Boolean).join('\n').trim()

    // 结果节点只汇总，不生产内容
    if (type === 'result') {
      outputs.set(id, { images: upstreamImages, text: upstreamText, isResult: true })
      continue
    }

    // 上传/素材入口：把学生上传的图交出去
    if (WORKFLOW_INPUT_TYPES.has(type)) {
      const own = workflowBoundImages(configuration, input, id)
      outputs.set(id, { images: [...new Set([...upstreamImages, ...own])], text: upstreamText })
      continue
    }

    // 提示词节点：优先用节点里老师写的文案，占位说明视为没写、回落到运行时提示词模板。
    // 学生填写的内容只作为变量值参与替换；只有模板完全没引用这些字段时，才追加兜底，
    // 否则会出现「学生填的一句话把老师整段模板顶掉」。
    if (WORKFLOW_PROMPT_TYPES.has(type)) {
      const own = workflowNodePrompt(node)
      const template = own || cleanText(generation.promptTemplate || '', 4000)
      const boundKeys = workflowBoundFieldKeys(configuration, id)
      const usesBound = boundKeys.some((key) => new RegExp(`{{\\s*${key}\\s*}}`).test(template))
      const appended = template && (usesBound || !boundKeys.length) ? '' : workflowBoundText(configuration, input, id)
      const source = [template, appended].filter(Boolean).join('\n')
      const text = source ? interpolate(source, input) : upstreamText
      outputs.set(id, { images: upstreamImages, text })
      continue
    }

    // 生成节点
    if (WORKFLOW_GENERATION_TYPES.has(type)) {
      const data = node.data || {}
      const ownPrompt = cleanText(data.prompt || '', 4000)
      // 优先用上游提示词节点的产物；没有就回落到运行时提示词模板
      const prompt = [upstreamText, ownPrompt].filter(Boolean).join('\n').trim()
        || interpolate(generation.promptTemplate || '', input)
      const images = [...new Set([...upstreamImages, ...workflowBoundImages(configuration, input, id)])].slice(0, 6)
      const ratio = cleanText(input.ratio, 20) || cleanText(data.ratio, 20) || generation.ratio || (type === 'video' ? '9:16' : '1:1')
      const count = Math.min(Math.max(Number(input.count || data.count || generation.count || 1) || 1, 1), MAX_GENERATION_COUNT)
      const provider = cleanText(data.provider, 40) || generation.provider
      const model = cleanText(data.model, 80) || generation.model
      const isVideo = type === 'video'
      steps.push({
        nodeId: id,
        nodeType: type,
        title: cleanText(data.title || '', 120),
        // 直接上游节点 id：执行器靠它拿「自己那一路」的产出当参考图。
        // 不记这个就只能退回「上一步的结果」，8 个并列的结果节点会一个接一个互相污染。
        upstreamNodeIds: [...incoming.get(id)],
        request: {
          provider,
          model,
          capability: isVideo ? (images.length ? 'image-to-video' : 'text-to-video') : (images.length ? 'image-to-image' : 'text-to-image'),
          prompt,
          negativePrompt: generation.negativePrompt,
          ratio,
          quality: generation.quality,
          resolution: generation.resolution,
          duration: generation.duration,
          frameRate: generation.frameRate,
          count,
          images,
          referenceImage: images[0] || '',
        },
      })
      // 产物要等真正生成后才知道，先占位，供下游节点读到 text
      outputs.set(id, { images: [], text: prompt, stepIndex: steps.length - 1 })
      continue
    }

    // 其余类型（marker / group 等）纯透传
    outputs.set(id, { images: upstreamImages, text: upstreamText })
  }

  if (!steps.length) throw fail('画布上还没有图像/视频生成节点，小画家端无法出结果')
  const blank = steps.find((step) => !step.request.prompt)
  if (blank) throw fail(`「${blank.title || '生成节点'}」没有可用的提示词：请编辑画布上的创作提示词节点，或在工作流配置里填写提示词模板`)
  const lastStep = steps[steps.length - 1]
  return { steps, request: lastStep.request, images: lastStep.request.images }
}

/**
 * 按画布执行的请求构造：结构与 buildSkillGenerationRequest 兼容，
 * 额外带 steps，供服务端串行执行多个生成节点。
 */
export function buildSkillWorkflowRequest(skill, values = {}) {
  const configuration = normalizeConfiguration(skill.configuration || {}, skill.skillType)
  const input = validateValues(configuration, values)
  const plan = planSkillWorkflow(configuration, input)
  if (skill.skillType === 'video' && plan.steps.length > 1) {
    throw fail('视频玩法暂不支持多个生成节点（视频生成耗时长，需要排队执行）')
  }
  return {
    skill,
    configuration,
    input,
    steps: plan.steps,
    request: plan.request,
    nodeResults: plan.steps.map((step) => ({ nodeId: step.nodeId, nodeType: step.nodeType, title: step.title, status: 'planned' })),
  }
}

export async function prepareStudentSkillRun(user, skillId, values = {}) {
  if (user?.role !== 'student') throw fail('仅小画家账户可以使用玩法生成', 403)
  const result = await query(STUDENT_VISIBLE_SQL, [skillId, user.organization.id, user.campus?.id || '', user.id])
  const row = result.rows[0]
  if (!row) throw fail('玩法不存在、未发布或当前账号不可使用', 404)
  const skill = toSkill(row, false)
  // 画布上搭了生成节点就按画布执行；没有画布的老玩法保持原逻辑，避免影响存量。
  const prepared = hasSkillWorkflow(skill.configuration)
    ? buildSkillWorkflowRequest(skill, values)
    : buildSkillGenerationRequest(skill, values)
  const dailyLimit = prepared.configuration.limits?.dailyLimit || 0
  if (dailyLimit > 0) {
    const usage = await withTransaction(async (client) => client.query(
      `INSERT INTO ai_skill_daily_usage (organization_id,user_id,skill_id,version_id,usage_date,used_count)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,1)
       ON CONFLICT (organization_id,user_id,skill_id,usage_date) DO UPDATE
       SET used_count=ai_skill_daily_usage.used_count+1, version_id=EXCLUDED.version_id, updated_at=now()
       WHERE ai_skill_daily_usage.used_count < $5
       RETURNING used_count`,
      [user.organization.id, user.id, skill.id, skill.publishedVersionId || null, dailyLimit],
    ))
    if (!usage.rows[0]) throw fail(`今日使用次数已达到上限（${dailyLimit} 次）`, 429)
    prepared.usageReserved = true
  }
  return prepared
}

function validateH5WorkflowConfiguration(configuration = {}) {
  const nodes = configuration.workflow?.nodes || []
  const edges = configuration.workflow?.edges || []
  if (!nodes.some((node) => node.type === 'image')) throw fail('H5 工作流缺少图像生成节点')
  if (!nodes.some((node) => node.type === 'result')) throw fail('H5 工作流缺少结果节点')
  if (!edges.length) throw fail('H5 工作流至少需要一条连线')
  if (!configuration.runtime?.promptTemplate) throw fail('H5 工作流缺少生成提示词')
  return configuration
}

// 参考图张数不在这里设限：素材总数由 h5MaterialItems 兜住，每张图各自落到自己那一格
// （见下面的 slotUrlByNode），单次模型调用只带自己那一张，天然不会撞供应商的
// imageInput.maxImages。只要老师在工作流里把格子标够，勾多少张图就都能用上。
// 画布节点提示词统一追加的约束：只出视觉素材，中文由 H5 版式排版（模型画中文必错字）
const H5_PROMPT_GUARD = '只生成报告所需的视觉图片，不要在图片中生成大段文字；中文文案由 H5 固定模板排版。'
// 节点上的学生端卡槽角色（image / text / result / none）。老师不标就按节点类型推断，
// 保证老模板不用重新配也能跑。

function h5SlotRoleOf(node) {
  const explicit = cleanText(node?.data?.studentSlot?.role, 20)
  // 能选的角色跟节点类型绑死：提示词节点出不了图，就不该被标成图像卡槽。
  if (node?.type === 'image' && (explicit === 'image' || explicit === 'none')) return explicit
  if (['text', 'prompt'].includes(node?.type) && (explicit === 'text' || explicit === 'none')) return explicit
  if (node?.type === 'result' && (explicit === 'result' || explicit === 'none')) return explicit
  if (node?.type === 'image') return 'image'
  if (node?.type === 'result') return 'result'
  // ⚠️ 文字节点不按类型推断成 text：老模板里每个提示词节点都会被推断成 text，
  // 一推断就会把学生自述偷偷接到老师原来的提示词后面，所以默认「不上前端」。
  return 'none'
}

// 画布上「有上游连线」的节点 = 这条工作流跑出来的出口。
// 学生端要分两件事：左边没入线的图像节点是「学生上传素材的格子」，
// 右边有入线的图像节点是「工作流跑出来的结果图」。两者都要进报告，
// 但只有前者该占学生的上传格。早先不区分，8 个结果节点被当成 8 个素材格，
// 算出 15 格、顺序被 y 打乱、结果图反而没人收。
function h5InboundNodeIds(workflow = {}) {
  const ids = new Set()
  for (const edge of Array.isArray(workflow?.edges) ? workflow.edges : []) {
    const target = cleanText(edge?.target, 60)
    if (target) ids.add(target)
  }
  return ids
}

// 画布上的先后：从上到下、从左到右。
function h5CanvasOrder(left, right) {
  const leftY = Number(left.node?.position?.y || 0)
  const rightY = Number(right.node?.position?.y || 0)
  if (leftY !== rightY) return leftY - rightY
  const leftX = Number(left.node?.position?.x || 0)
  const rightX = Number(right.node?.position?.x || 0)
  if (leftX !== rightX) return leftX - rightX
  return left.order - right.order
}

// 学生端图像卡槽顺序。
// 「排第几格」填了数字就是字面意思：这一格就是那个号。
// 没填的（以及撞了号的）按画布从上到下、从左到右补进空位，不抢别人占住的格子。
// 卡槽总数由老师摆的图像节点数决定，不写死；号填超了自动排到最后，不会多出空格。
// ⚠️ 有上游连线的图像节点默认不算卡槽：它出的是工作流跑出来的结果图，不是学生上传的格子。
// 老师如果确实想让某个结果节点也收学生素材，把「排第几格」填上就照填的算。
export function h5ImageSlotOrder(configuration = {}) {
  const inbound = h5InboundNodeIds(configuration.workflow)
  const all = (configuration.workflow?.nodes || [])
    .filter((node) => node.type === 'image' && h5SlotRoleOf(node) === 'image')
    .filter((node) => !inbound.has(node.id) || Number(node?.data?.studentSlot?.index || 0) > 0)
    .map((node, order) => ({ node, order, index: Number(node?.data?.studentSlot?.index || 0) }))
  const canvasSorted = [...all].sort(h5CanvasOrder)
  const pinned = canvasSorted
    .filter((item) => item.index > 0)
    .sort((left, right) => left.index - right.index || h5CanvasOrder(left, right))
  const queue = canvasSorted.filter((item) => !(item.index > 0))
  const slots = []
  for (const item of pinned) {
    const at = item.index - 1
    if (at < slots.length && slots[at]) queue.push(item)
    else slots[at] = item
  }
  for (let i = 0; i < slots.length; i += 1) {
    if (!slots[i]) slots[i] = queue.shift() || null
  }
  while (queue.length) slots.push(queue.shift())
  return slots.filter(Boolean).map((item) => item.node)
}

// 结果图节点的顺序：有上游连线的图像节点，按画布从上到下、从左到右。
// 这条顺序就是「报告里方案2结果图 1~N」，跟学生上传了多少张素材无关 ——
// 哪怕学生一张素材都没传，结果图也照样要按这个顺序进报告。
export function h5ResultNodeOrder(configuration = {}) {
  const inbound = h5InboundNodeIds(configuration.workflow)
  return (configuration.workflow?.nodes || [])
    .filter((node) => node.type === 'image' && inbound.has(node.id))
    .map((node, order) => ({ node, order }))
    .sort(h5CanvasOrder)
    .map((item) => item.node)
}

// 文字卡槽：学生的创作自述接在老师写死的提示词后面，不替换原提示词。
// ⚠️ 这里只认老师「明确标注」为文字卡槽的节点：图像节点可以按类型推断，
// 文字节点不能 —— 老模板里每个提示词节点都会被推断成 text，
// 一推断就会给所有节点追加学生自述，等于悄悄改掉老师原来的提示词。
function h5TextSlotNodes(configuration = {}) {
  return (configuration.workflow?.nodes || [])
    .filter((node) => ['text', 'prompt'].includes(node.type)
      && cleanText(node?.data?.studentSlot?.role, 20) === 'text')
}

// 学生自己写的那段话（放到文字卡槽节点后面）
function h5StudentWords(report = {}) {
  return cleanText(report.idea || report.summary || '', 1200)
}

// 把学生自述接在老师原文后面。
// ⚠️ 提示词节点（prompt）的内容在 data.prompt，普通文字节点（text）在 data.text
// （见 workflowNodePrompt）。一律往 data.prompt 拼的话，文字节点会变成「只有学生自述」，
// 老师写的那段正文被顶掉 —— 所以必须拼回节点原本在用的那个字段。
export function h5AppendStudentWords(data = {}, extra = '') {
  if (!extra) return data
  const hasPrompt = Boolean(cleanText(data.prompt, 4000))
  const hasText = Boolean(cleanText(data.text, 4000))
  // 文字节点的正文在 data.text，提示词节点在 data.prompt，各拼回各自的字段。
  const key = hasText && !hasPrompt ? 'text' : 'prompt'
  const current = cleanText(data[key], 4000)
  return { ...data, [key]: [current, extra].filter(Boolean).join('\n') }
}

function h5MaterialItems(materials = {}) {
  const groups = [
    ['sketch-original', materials.sketchOriginal],
    ['sketch-optimized', materials.sketchOptimized],
    ['reference-image', materials.referenceImages],
    ['ai-version', materials.versions],
    ['final-image', materials.finalImage],
    ['video', materials.videos],
    ['model-3d', materials.models3d],
  ]
  return groups.flatMap(([sourceType, raw]) => (Array.isArray(raw) ? raw : [raw]).map((item, index) => {
    const source = typeof item === 'string' ? { url: item } : (item && typeof item === 'object' ? item : {})
    const url = cleanText(source.url || source.src || source.imageUrl || source.preview || source.cover || '', 4_000_000)
    return url ? { sourceType, sourceId: cleanText(source.id || `${sourceType}-${index + 1}`, 100), label: cleanText(source.label || source.title || '', 120), url } : null
  })).filter(Boolean).slice(0, 24)
}

function h5ReportText(report = {}) {
  const pages = (Array.isArray(report.pages) ? report.pages : []).slice(0, 12).map((page, index) => {
    const source = page && typeof page === 'object' ? page : {}
    return `${index + 1}. ${cleanText(source.title, 120)}\n${cleanText(source.body || source.text, 800)}`.trim()
  }).filter(Boolean)
  return [
    `报告标题：${cleanText(report.title, 120)}`,
    `课程：${cleanText(report.course, 300)}`,
    `创意想法：${cleanText(report.idea, 1000)}`,
    `内容摘要：${cleanText(report.summary, 1200)}`,
    `原始提示词：${cleanText(report.prompt, 1200)}`,
    pages.length ? `页面文案：\n${pages.join('\n')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 6000)
}

// 导出仅为可脱离数据库做纯规划冒烟测试（scripts 里用），不改变内部调用行为。
export function buildH5WorkflowRequest(skill, payload = {}) {
  const configuration = validateH5WorkflowConfiguration(normalizeConfiguration(skill.configuration || {}, skill.skillType, { allowIncomplete: true, usageKind: skill.usageKind || skill.usage_kind || 'report_workflow' }))
  if (skill.skillType !== 'image') throw fail('H5 方案2只能绑定图像工作流')
  const materialItems = h5MaterialItems(payload.materials || {})
  const reportDocument = h5ReportText(payload.report || {})
  const templateId = cleanText(payload.templateId, 120)
  const difficulty = cleanText(payload.difficulty, 30)
  const variables = {
    report_document: reportDocument,
    report_title: cleanText(payload.report?.title, 120),
    template_id: templateId,
    difficulty,
    subject: reportDocument,
  }
  const configuredPrompt = configuration.runtime.promptTemplate.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => variables[key] || '')
  const prompt = [
    configuredPrompt,
    '以下是 H5 报告固定面板提供的统一输入。只生成报告所需的视觉图片，不要在图片中生成大段文字；中文文案由 H5 固定模板排版。',
    `H5模板：${templateId || '未指定'}；适龄版本：${difficulty || '未指定'}`,
    reportDocument,
  ].filter(Boolean).join('\n\n').slice(0, 8000)
  const imageCandidates = materialItems.filter((item) => item.sourceType !== 'video')
  // 不裁剪：老师在工作流上标了几个图像卡槽，就依次分发几张素材，多余的留给后面的节点。
  const referenceImages = imageCandidates
  const referenceUrls = referenceImages.map((item) => item.url)
  const warnings = []
  if (materialItems.length > imageCandidates.length) {
    warnings.push(`视频素材共 ${materialItems.length - imageCandidates.length} 个，只用于报告内嵌播放，未作为出图参考。`)
  }

  // 卡槽分配：老师可以在后台画布节点上标「这个节点在学生端占第几格」。
  // 第 N 个图像卡槽节点拿第 N 张学生素材（一张图一个节点，不再全塞给第一个节点）；
  // 学生素材不够的节点直接跳过不跑，学生端对应格子留空。
  const slotNodes = h5ImageSlotOrder(configuration)
  // ⚠️ h5ImageSlotOrder 返回的是「节点数组」，不是 { node } 包装对象。
  // 早先这里写成 item.node.id，只要画布上标了图像卡槽就直接 TypeError，
  // 报告工作流一跑就 500 —— 改成 item.id。
  const slotIndexByNode = new Map(slotNodes.map((node, index) => [node.id, index]))
  const slotUrlByNode = new Map()
  slotNodes.forEach((node, index) => {
    const url = referenceUrls[index] || ''
    if (url) slotUrlByNode.set(node.id, url)
  })
  // 结果图节点（有上游连线的图像节点）单独编号：报告里「方案2结果图 1~N」按这个顺序排，
  // 不受学生上传了几张素材影响。以前这些节点既不算结果也没人收图，跑完就丢。
  const resultNodes = h5ResultNodeOrder(configuration)
  const resultOrderByNode = new Map(resultNodes.map((node, index) => [node.id, index + 1]))

  // 按画布节点真实执行：每个图像卡槽节点用自己那一张素材，其余节点按连线接力。
  // 规划失败时不阻断学生，回落到单次出图并透出原因。
  let steps = []
  if (Array.isArray(configuration.workflow?.nodes) && configuration.workflow.nodes.length) {
    // 文字卡槽节点：把学生自己写的创作说明接到老师提示词后面（只认老师明确标注的节点）
    const studentWords = h5StudentWords(payload.report || {})
    const textSlotIds = new Set(h5TextSlotNodes(configuration).map((node) => node.id))
    const baseWorkflow = configuration.workflow || {}
    const workflowForPlan = studentWords && textSlotIds.size
      ? {
          ...baseWorkflow,
          nodes: (baseWorkflow.nodes || []).map((node) => (textSlotIds.has(node.id)
            ? { ...node, data: h5AppendStudentWords(node.data || {}, studentWords) }
            : node)),
        }
      : baseWorkflow

    // 有入线的节点能从上游接力，没分到素材也不用跳过
    const incomingTargets = new Set((baseWorkflow.edges || []).map((edge) => cleanText(edge?.target, 60)).filter(Boolean))

    const planningConfiguration = {
      ...configuration,
      workflow: workflowForPlan,
      generation: {
        ...(configuration.generation || {}),
        provider: configuration.runtime?.provider || configuration.generation?.provider,
        model: configuration.runtime?.model || configuration.generation?.model,
        promptTemplate: configuration.runtime?.promptTemplate || configuration.generation?.promptTemplate || '',
        negativePrompt: configuration.runtime?.negativePrompt || configuration.generation?.negativePrompt,
        ratio: configuration.runtime?.ratio || configuration.generation?.ratio,
        quality: configuration.runtime?.quality || configuration.generation?.quality,
        resolution: configuration.runtime?.resolution || configuration.generation?.resolution,
        count: configuration.runtime?.count || configuration.generation?.count,
      },
    }
    // 张数优先用调用方指定；否则让每个出图节点用自己的 data.count，其次回落到运行时配置
    const planningInput = { ...variables }
    if (payload.count) planningInput.count = Math.max(1, Math.min(MAX_GENERATION_COUNT, Number(payload.count)))
    try {
      const plan = planSkillWorkflow(planningConfiguration, planningInput)
      const nodeById = new Map((configuration.workflow?.nodes || []).map((node) => [node.id, node]))
      let skippedByShortfall = 0
      steps = plan.steps.flatMap((step) => {
        // ⚠️ 卡槽索引从 0 开始，不能用 `|| 0` 兜底：第 1 格的索引就是 0，
        // `0 || 0` 会把它当成「不是卡槽」，第 1 格永远分不到学生素材。
        const slotOrder = slotIndexByNode.has(step.nodeId) ? slotIndexByNode.get(step.nodeId) + 1 : 0
        const resultOrder = resultOrderByNode.get(step.nodeId) || 0
        const slotUrl = slotUrlByNode.get(step.nodeId) || ''
        // 卡槽节点没分到学生素材、也没有上游可以接力 → 跳过，不花这一次出图
        if (slotOrder > 0 && !slotUrl && !incomingTargets.has(step.nodeId)) {
          skippedByShortfall += 1
          return []
        }
        const stepPrompt = String(step.request?.prompt || '')
        const prompt = stepPrompt.includes(H5_PROMPT_GUARD) ? stepPrompt : [stepPrompt, H5_PROMPT_GUARD].filter(Boolean).join('\n\n')
        // 出问题了：只带自己的参考图，不去碰「上一步的产物」
        const tagged = {
          ...step,
          ...(slotOrder > 0 ? { slotOrder } : {}),
          ...(resultOrder > 0 ? { resultOrder } : {}),
          request: { ...step.request, prompt },
        }
        if (slotOrder <= 0) return [tagged]
        if (!slotUrl) return [tagged]
        // 素材格 = 学生自己上传的那张图。默认原样进报告，不重绘：
        // 重绘既多花一次出图费，又会把学生画的画面改掉（改完作品就变味了）。
        // 老师要「拿学生素材再加工」，把这个节点标成重绘即可（studentSlot.redraw = true）。
        const redraw = nodeById.get(step.nodeId)?.data?.studentSlot?.redraw === true
        if (!redraw) {
          return [{
            ...tagged,
            slotPassthrough: true,
            request: { ...tagged.request, images: [slotUrl], referenceImage: slotUrl },
          }]
        }
        // 重绘：只拿自己那一张学生素材，确保「第 3 页」就是第 3 张图
        return [{
          ...tagged,
          request: {
            ...tagged.request,
            images: [slotUrl],
            referenceImage: slotUrl,
            capability: 'image-to-image',
          },
        }]
      })
      if (skippedByShortfall) {
        warnings.push(`有 ${skippedByShortfall} 个图像卡槽节点没分到小画家素材（本次共 ${referenceUrls.length} 张图），已跳过不生成，小画家端对应格子留空。`)
      }
      if (!steps.length) throw fail('小画家素材不足以填充任何图像卡槽节点')
    } catch (error) {
      steps = []
      warnings.push(`画布流程未按节点执行，已回落到单次出图：${error?.message || '流程规划失败'}`)
    }
  }

  return {
    skill: { ...skill, configuration }, configuration, materialItems, warnings, steps,
    request: {
      provider: configuration.runtime.provider,
      model: configuration.runtime.model,
      capability: referenceUrls.length ? 'image-to-image' : 'text-to-image',
      prompt,
      negativePrompt: configuration.runtime.negativePrompt,
      ratio: configuration.runtime.ratio || '9:16',
      quality: configuration.runtime.quality,
      resolution: configuration.runtime.resolution,
      count: configuration.runtime.count,
      images: referenceUrls,
      referenceImage: referenceUrls[0] || '',
    },
    nodeResults: (configuration.workflow.nodes || []).filter((node) => ['image', 'result'].includes(node.type)).map((node) => ({
      nodeId: node.id, nodeType: node.type, title: cleanText(node.data?.title || '', 120), status: 'prepared',
    })),
  }
}

async function reserveH5WorkflowUsage(user, prepared) {
  const dailyLimit = prepared.configuration.limits?.dailyLimit || 0
  if (dailyLimit <= 0) return
  const usage = await withTransaction(async (client) => client.query(
    `INSERT INTO ai_skill_daily_usage (organization_id,user_id,skill_id,version_id,usage_date,used_count)
     VALUES ($1,$2,$3,$4,CURRENT_DATE,1)
     ON CONFLICT (organization_id,user_id,skill_id,usage_date) DO UPDATE
     SET used_count=ai_skill_daily_usage.used_count+1, version_id=EXCLUDED.version_id, updated_at=now()
     WHERE ai_skill_daily_usage.used_count < $5 RETURNING used_count`,
    [user.organization.id, user.id, prepared.skill.id, prepared.skill.publishedVersionId || null, dailyLimit],
  ))
  if (!usage.rows[0]) throw fail(`今日使用次数已达到上限（${dailyLimit} 次）`, 429)
  prepared.usageReserved = true
}

export async function prepareH5ReportWorkflowRun(user, skillId, payload = {}) {
  if (user?.role !== 'student') throw fail('只有小画家可以执行 H5 方案2工作流', 403)
  const result = await query(
    STUDENT_VISIBLE_WORKFLOW_SQL.replace('SELECT s.*', 'SELECT s.*, (SELECT version_number FROM ai_skill_versions v WHERE v.id=s.published_version_id) AS version_number'),
    [skillId, user.organization.id, user.campus?.id || '', user.id],
  )
  const row = result.rows[0]
  if (!row) throw fail('H5 工作流不存在、未发布或当前账号不可使用', 404)
  const skill = toSkill(row, false)
  const prepared = buildH5WorkflowRequest(skill, payload)
  prepared.workflowVersion = Number(row.version_number || 0)
  // 前端一份报告只调用一次。以前按客户端传的 batchIndex 决定扣不扣每日次数，
  // 伪造 batchIndex>0 的请求就能无限次生成；现在一律按第一批处理，每次都占一次。
  prepared.batchIndex = 0
  prepared.batchTotal = 1
  await reserveH5WorkflowUsage(user, prepared)
  return prepared
}

export async function prepareAdminH5WorkflowTest(user, skillId, payload = {}) {
  const row = await findAdminSkill(user, skillId)
  const skill = { ...toSkill(row, true), configuration: row.draft_configuration || {} }
  return buildH5WorkflowRequest(skill, payload)
}

export async function markAdminH5WorkflowTested(user, skillId) {
  const skill = await findAdminSkill(user, skillId)
  const configuration = validateH5WorkflowConfiguration(normalizeConfiguration(skill.draft_configuration || {}, skill.skill_type, { allowIncomplete: true, usageKind: skill.usage_kind || 'report_workflow' }))
  const testedAt = new Date().toISOString()
  configuration.runtime.testedAt = testedAt
  configuration.generation.testedAt = testedAt
  const result = await query(
    `UPDATE ai_skills SET draft_configuration=$1::jsonb, draft_revision=draft_revision+1, updated_by_user_id=$2, updated_at=now() WHERE id=$3 RETURNING *`,
    [JSON.stringify(configuration), user.id, skillId],
  )
  await logAudit(user.id, user.organization.id, 'h5_workflow.test_passed', 'h5_workflow', skillId, { testedAt })
  return toSkill(result.rows[0], true)
}

export async function publishAdminH5Workflow(user, skillId) {
  const skill = await findAdminSkill(user, skillId)
  const configuration = validateH5WorkflowConfiguration(normalizeConfiguration(skill.draft_configuration || {}, skill.skill_type, { allowIncomplete: true, usageKind: skill.usage_kind || 'report_workflow' }))
  if (!configuration.runtime?.testedAt) throw fail('发布前必须先完成一次真实测试')
  const published = await withTransaction(async (client) => {
    const count = await client.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM ai_skill_versions WHERE skill_id=$1', [skillId])
    const versionNumber = Number(count.rows[0].next)
    const versionId = newId('skillv')
    await client.query(
      `INSERT INTO ai_skill_versions (id, skill_id, version_number, configuration, created_by_user_id)
       VALUES ($1,$2,$3,$4::jsonb,$5)`,
      [versionId, skillId, versionNumber, JSON.stringify(configuration), user.id],
    )
    const updated = await client.query(
      `UPDATE ai_skills SET status='published', published_configuration=$1::jsonb, published_version_id=$2, updated_by_user_id=$3, updated_at=now()
       WHERE id=$4 RETURNING *`,
      [JSON.stringify(configuration), versionId, user.id, skillId],
    )
    if (skill.scope_type === 'organization') {
      await ensureAssignment(client, { skillId, versionId, organizationId: user.organization.id, createdBy: user.id })
    }
    return { row: updated.rows[0], versionNumber }
  })
  await logAudit(user.id, user.organization.id, 'h5_workflow.publish', 'h5_workflow', skillId, { versionId: published.row.published_version_id, versionNumber: published.versionNumber })
  return { ...toSkill(published.row, true), publishedVersionNumber: published.versionNumber }
}

// ---- 报告工作流库（方案2） -------------------------------------------------

// 宽松读取草稿/已发布配置，草稿可能不完整，这里绝不抛错。
function readLibraryConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const presentation = source.presentation && typeof source.presentation === 'object' ? source.presentation : {}
  const workflow = source.workflow && typeof source.workflow === 'object' ? source.workflow : {}
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []
  const meta = normalizeH5WorkflowMeta(source.h5Workflow || {}, workflow)
  const coverSource = cleanText(presentation.coverSource, 24)
  return {
    coverUrl: cleanText(presentation.coverUrl, 2000),
    coverSource: COVER_SOURCES.has(coverSource) ? coverSource : '',
    coverGeneratedAt: cleanText(presentation.coverGeneratedAt, 40),
    nodes,
    nodeCount: nodes.length,
    meta,
    dailyLimit: Math.min(Math.max(Number(source.limits?.dailyLimit || 0), 0), 100),
    testedAt: cleanText(source.runtime?.testedAt || source.generation?.testedAt, 40),
    promptTemplate: cleanText(source.runtime?.promptTemplate, 4000),
    ratio: cleanText(source.runtime?.ratio || '9:16', 12),
  }
}

function deriveLibraryStage(status, testedAt, publishedVersionNumber) {
  if (status === 'published' && publishedVersionNumber > 0) return 'published'
  if (status === 'offline') return 'offline'
  if (testedAt) return 'testing'
  return 'draft'
}

function toLibraryItem(row) {
  const draft = readLibraryConfig(row.draft_configuration)
  const publishedVersionNumber = Number(row.version_number || 0)
  const stage = deriveLibraryStage(row.status, draft.testedAt, publishedVersionNumber)
  return {
    id: row.id,
    title: row.title || '',
    summary: row.summary || '',
    skillType: row.skill_type,
    status: row.status,
    stage,
    publishedVersionNumber,
    versionCount: Number(row.version_count || 0),
    draftRevision: Number(row.draft_revision || 0),
    updatedAt: row.updated_at,
    coverUrl: draft.coverUrl,
    coverSource: draft.coverSource,
    coverGeneratedAt: draft.coverGeneratedAt,
    coverReady: Boolean(draft.coverUrl),
    studentSelectable: draft.meta.studentSelectable,
    estimatedMinutes: draft.meta.estimatedMinutes,
    pageCount: draft.meta.pageCount,
    flowSummary: draft.meta.flowSummary,
    nodeCount: draft.nodeCount,
    dailyLimit: draft.dailyLimit,
    testedAt: draft.testedAt,
  }
}

export async function listAdminH5WorkflowLibrary(user) {
  await assertOrgAdmin(user)
  const result = await query(
    `SELECT s.*,
       (SELECT v.version_number FROM ai_skill_versions v WHERE v.id = s.published_version_id) AS version_number,
       (SELECT COUNT(*) FROM ai_skill_versions v WHERE v.skill_id = s.id) AS version_count
     FROM ai_skills s
     WHERE s.organization_id = $1 AND s.scope_type = 'organization'
       AND s.skill_type = 'image' AND s.status <> 'archived'
       AND s.usage_kind = 'report_workflow'
     ORDER BY s.sort_order ASC, s.updated_at DESC`,
    [user.organization.id],
  )
  return result.rows.map(toLibraryItem)
}

/**
 * 学生端「选一个风格」的卡片来源 = 后台报告工作流库。
 * 一个已发布的工作流就是一张卡：名字用工作流标题，封面用 presentation.coverUrl，
 * 版本号拿已发布版本，学生点哪张就按哪张的 workflowId 去跑。
 * 只列「学生可选」的，没勾的在后台留着给老师自己测。
 */
export async function listStudentReportStyles(user) {
  if (!user?.organization?.id) throw fail('请先登录', 401)
  const result = await query(
    `SELECT s.*,
       (SELECT v.version_number FROM ai_skill_versions v WHERE v.id = s.published_version_id) AS version_number
     FROM ai_skills s
     WHERE s.organization_id = $1 AND s.scope_type = 'organization'
       AND s.status = 'published' AND s.skill_type = 'image' AND s.usage_kind = 'report_workflow'
       AND EXISTS (
         SELECT 1 FROM ai_skill_assignments a
         WHERE a.skill_id = s.id AND a.organization_id = $1 AND a.status = 'enabled' AND (
           a.scope_type = 'organization'
           OR (a.scope_type = 'campus' AND a.campus_id = $2)
           OR (a.scope_type = 'class' AND EXISTS (
             SELECT 1 FROM class_students cs WHERE cs.class_id = a.class_id AND cs.student_user_id = $3 AND cs.organization_id = $1
           ))
           OR (a.scope_type = 'permission_group' AND EXISTS (
             SELECT 1 FROM permission_group_members pgm WHERE pgm.group_id = a.permission_group_id AND pgm.user_id = $3 AND pgm.organization_id = $1
           ))
         )
       )
     ORDER BY s.sort_order ASC, s.updated_at DESC`,
    [user.organization.id, user.campus?.id || '', user.id],
  )
  return result.rows
    .map((row) => {
      const published = row.published_configuration && typeof row.published_configuration === 'object' ? row.published_configuration : {}
      const draft = row.draft_configuration && typeof row.draft_configuration === 'object' ? row.draft_configuration : {}
      // 已发布的以 published_configuration 为准，没发布过才退回草稿（老师刚勾完还没发时也能看到预览）
      const meta = published.h5Workflow || draft.h5Workflow || {}
      const presentation = published.presentation || draft.presentation || {}
      return {
        skillId: row.id,
        name: cleanText(row.title, 60),
        summary: cleanText(row.summary, 160),
        coverUrl: cleanText(presentation.coverUrl, 2000),
        versionNumber: Number(row.version_number || 0),
        studentSelectable: meta.studentSelectable === true,
        pageCount: Number(meta.pageCount || 0),
        estimatedMinutes: Number(meta.estimatedMinutes || 0),
        flowSummary: Array.isArray(meta.flowSummary) ? meta.flowSummary.slice(0, 8) : [],
      }
    })
    // 没勾「学生可选」或压根没发布过版本的，不进学生端
    .filter((item) => item.studentSelectable && item.versionNumber > 0)
}

export async function getAdminH5WorkflowLibraryItem(user, skillId) {
  const row = await findAdminSkill(user, skillId)
  if (row.skill_type !== 'image') throw fail('只有图像工作流可以加入报告工作流库')
  const version = row.published_version_id
    ? await query('SELECT version_number FROM ai_skill_versions WHERE id=$1 AND skill_id=$2 LIMIT 1', [row.published_version_id, row.id])
    : { rows: [] }
  return {
    ...toLibraryItem({ ...row, version_number: version.rows[0]?.version_number || 0 }),
    canManagePlatform: canManagePlatform(user),
    draftConfiguration: row.draft_configuration || {},
  }
}

export async function updateAdminH5WorkflowLibraryItem(user, skillId, payload = {}) {
  // 先做归属/类型校验（findAdminSkill 会校验组织与平台权限，并对越权抛 403）
  const authorized = await findAdminSkill(user, skillId)
  if (authorized.skill_type !== 'image') throw fail('只有图像工作流可以加入报告工作流库')

  // ⚠️ draft_configuration 是**整块 JSONB**，必须「锁行 → 读最新 → 合并 → 写回」。
  // 早先是「读 → 合并 → 整块 UPDATE」，两个并发 PATCH 各改一个字段时，后写的会拿自己那份旧快照
  // 整块覆盖，把先写的字段抹掉。实测（scripts/probe-h5-workflow-concurrency.mjs）：
  // 不锁行时 3/3 轮必丢 2~4 个字段。真实触发场景：管理员开两个标签页、双击保存、
  // AI 生成封面与「保存设置」同时发生。
  const { result, title } = await withTransaction(async (client) => {
    const locked = await client.query('SELECT * FROM ai_skills WHERE id = $1 FOR UPDATE', [skillId])
    const skill = locked.rows[0]
    if (!skill) throw fail('工作流不存在或已删除', 404)

    const draft = skill.draft_configuration && typeof skill.draft_configuration === 'object' ? { ...skill.draft_configuration } : {}
    const presentation = { ...(draft.presentation || {}) }
    const meta = { ...(draft.h5Workflow || {}) }
    const limits = { ...(draft.limits || {}) }

    if (payload.coverUrl !== undefined) presentation.coverUrl = cleanText(payload.coverUrl, 2000)
    if (payload.coverSource !== undefined) {
      const source = cleanText(payload.coverSource, 24)
      if (source && !COVER_SOURCES.has(source)) throw fail('封面来源不受支持')
      presentation.coverSource = source
      if (source === 'ai') presentation.coverGeneratedAt = new Date().toISOString()
    }
    if (payload.studentSelectable !== undefined) meta.studentSelectable = Boolean(payload.studentSelectable)
    if (payload.estimatedMinutes !== undefined) meta.estimatedMinutes = Math.min(Math.max(Number(payload.estimatedMinutes || 0), 0), 240)
    if (payload.pageCount !== undefined) meta.pageCount = Math.min(Math.max(Number(payload.pageCount || 0), 0), 24)
    if (Array.isArray(payload.flowSummary)) {
      meta.flowSummary = payload.flowSummary.map((item) => cleanText(typeof item === 'string' ? item : item?.label, 24)).filter(Boolean).slice(0, 8)
    }
    if (payload.dailyLimit !== undefined) limits.dailyLimit = Math.min(Math.max(Number(payload.dailyLimit || 0), 0), 100)

    draft.presentation = presentation
    draft.h5Workflow = meta
    draft.limits = limits

    const title = cleanText(payload.title || skill.title, 80)
    if (!title) throw fail('请填写工作流名称')
    const summary = payload.summary !== undefined ? cleanText(payload.summary, 300) : cleanText(skill.summary, 300)

    // presentation / h5Workflow 属于展示元数据，已发布的工作流也要立即生效；
    // 工作流本体与学生页面仍然只能通过发布流程更新。
    const updated = await client.query(
      `UPDATE ai_skills SET title=$1, summary=$2, draft_configuration=$3::jsonb,
         published_configuration = CASE WHEN status='published'
           THEN jsonb_set(
             jsonb_set(COALESCE(published_configuration,'{}'::jsonb), '{presentation}', COALESCE($3::jsonb->'presentation','{}'::jsonb)),
             '{h5Workflow}', COALESCE($3::jsonb->'h5Workflow','{}'::jsonb))
           ELSE published_configuration END,
         draft_revision=draft_revision+1, updated_by_user_id=$4, updated_at=now()
       WHERE id=$5 RETURNING *`,
      [title, summary, JSON.stringify(draft), user.id, skillId],
    )
    // title 只在这里可见（合并逻辑依赖锁内读到的 skill），所以一起带出事务给下面的审计用。
    return { result: updated, title }
  })
  if (!result.rows[0]) throw fail('工作流更新失败，请刷新后重试', 409)
  await logAudit(user.id, user.organization.id, 'h5_workflow.library_update', 'h5_workflow', skillId, { title })
  const version = result.rows[0].published_version_id
    ? await query('SELECT version_number FROM ai_skill_versions WHERE id=$1 LIMIT 1', [result.rows[0].published_version_id])
    : { rows: [] }
  return toLibraryItem({ ...result.rows[0], version_number: version.rows[0]?.version_number || 0 })
}

export async function bulkDeleteAdminH5Workflows(user, ids = []) {
  await assertOrgAdmin(user)
  const list = (Array.isArray(ids) ? ids : []).map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 100)
  if (!list.length) throw fail('请选择要删除的工作流')
  const owned = await query(
    `SELECT id, title FROM ai_skills
     WHERE organization_id=$1 AND scope_type='organization' AND skill_type='image' AND id = ANY($2::text[])`,
    [user.organization.id, list],
  )
  if (!owned.rows.length) throw fail('没有可删除的工作流', 404)
  const deletableIds = owned.rows.map((row) => row.id)
  await withTransaction(async (client) => {
    await client.query('DELETE FROM ai_skill_daily_usage WHERE skill_id = ANY($1::text[])', [deletableIds])
    await client.query('DELETE FROM ai_skill_assignments WHERE skill_id = ANY($1::text[])', [deletableIds])
    await client.query('DELETE FROM ai_skill_versions WHERE skill_id = ANY($1::text[])', [deletableIds])
    await client.query('DELETE FROM ai_skills WHERE id = ANY($1::text[])', [deletableIds])
  })
  await logAudit(user.id, user.organization.id, 'h5_workflow.bulk_delete', 'h5_workflow', '', { ids: deletableIds, titles: owned.rows.map((row) => row.title) })
  return { ok: true, deletedIds: deletableIds }
}

// 「用画布第一页当封面」的取图口径。
// ⚠️ 必须与画布 `CanvasStudio.vue` 的 `nodeMarkingImage()` 完全一致：画布的成图存在 `data.output.url`，
// 早期前端只找 `data.image/imageUrl/preview`，导致画布明明出过图却一直提示「还没有生成过图片」。
// 这里以节点数组顺序取第一张有图的节点（upload 自带图 / image 输出图 / image-result 输出图）。
export function h5WorkflowCanvasCoverSource(configuration = {}) {
  const nodes = Array.isArray(configuration?.workflow?.nodes) ? configuration.workflow.nodes : []
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const data = node.data && typeof node.data === 'object' ? node.data : {}
    const outputUrl = String(data.output?.url || '').trim()
    const ownImage = String(data.image || '').trim()
    let url = ''
    if (node.type === 'upload') url = ownImage
    else if (node.type === 'image') url = outputUrl || ownImage
    else if (node.type === 'result' && data.mode === 'image-result') url = outputUrl || ownImage
    if (url) return { nodeId: cleanText(node.id, 100), nodeType: cleanText(node.type, 40), title: cleanText(data.title, 120), url }
  }
  return null
}

// 生成封面用的提示词：只描述风格与画面，不要求任何文字。
export function buildH5WorkflowCoverPrompt(item = {}) {
  const style = cleanText(item.title, 80)
  const summary = cleanText(item.summary, 300)
  const flow = (Array.isArray(item.flowSummary) ? item.flowSummary : []).map((step) => cleanText(step, 24)).filter(Boolean)
  return [
    `为美术教学「${style || '视觉风格'}」工作流生成一张竖版封面主视觉。`,
    summary,
    flow.length ? `流程关键词：${flow.join('、')}` : '',
    '要求：单一主体、干净的背景、柔和光影、高级质感，构图适合 3:4 竖版卡片裁切。',
    '绝对不要出现任何文字、字母、水印、logo 或界面元素。',
  ].filter(Boolean).join('\n').slice(0, 1200)
}

export async function releaseStudentSkillUsage(user, skill) {
  if (!skill?.id || !(skill.configuration?.limits?.dailyLimit > 0)) return
  await query(
    `UPDATE ai_skill_daily_usage SET used_count=GREATEST(used_count-1,0), updated_at=now()
     WHERE organization_id=$1 AND user_id=$2 AND skill_id=$3 AND usage_date=CURRENT_DATE`,
    [user.organization.id, user.id, skill.id],
  )
}

export async function prepareAdminSkillTest(user, payload = {}, skillId = '') {
  await assertOrgAdmin(user)
  let skillType = cleanText(payload.skillType, 20)
  let rawConfiguration = payload.configuration && typeof payload.configuration === 'object' ? payload.configuration : {}
  // 后台页面总会带上完整草稿，但脚本/接口直调时可能只传 values。
  // 不兜底的话 normalizeConfiguration 收到空对象会把 provider 判成空，
  // 报「请选择已接入的 Agnes 或火山引擎供应商」——看起来像供应商挂了，其实是没带配置。
  if (skillId && skillId !== 'draft' && (!Object.keys(rawConfiguration).length || !SKILL_TYPES.has(skillType))) {
    const row = await findAdminSkill(user, skillId)
    if (!Object.keys(rawConfiguration).length) rawConfiguration = row.draft_configuration || {}
    if (!SKILL_TYPES.has(skillType)) skillType = cleanText(row.skill_type, 20)
  }
  // 后台预览必须和学生端跑同一条执行路径，否则「预览正常、学生出图不对」。
  const draft = { skillType, configuration: rawConfiguration, title: '测试玩法' }
  return hasSkillWorkflow(rawConfiguration)
    ? buildSkillWorkflowRequest(draft, payload.values || {})
    : buildSkillGenerationRequest(draft, payload.values || {})
}

export async function markAdminSkillTested(user, skillId, payload = {}) {
  const skill = await findAdminSkill(user, skillId)
  const configuration = normalizeConfiguration(payload.configuration || skill.draft_configuration || {}, skill.skill_type)
  const testedAt = new Date().toISOString()
  configuration.runtime.testedAt = testedAt
  configuration.generation.testedAt = testedAt
  const result = await query(
    `UPDATE ai_skills SET draft_configuration=$1::jsonb, draft_revision=draft_revision+1, updated_by_user_id=$2, updated_at=now() WHERE id=$3 RETURNING *`,
    [JSON.stringify(configuration), user.id, skillId],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill.test_passed', 'ai_skill', skillId, { testedAt })
  return toSkill(result.rows[0], true)
}
