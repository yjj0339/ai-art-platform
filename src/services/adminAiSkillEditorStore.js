import {
  bulkDeleteAdminH5Workflows,
  createAdminAiSkill,
  deleteAdminAiSkill,
  generateAdminH5WorkflowCanvasCover,
  generateAdminH5WorkflowCover,
  getAdminAiSkill,
  getAdminH5Workflow,
  listAdminAiSkills,
  listAdminH5Workflows,
  publishAdminAiSkill,
  publishAdminH5Workflow as publishAdminH5WorkflowApi,
  setAdminAiSkillStatus,
  testAdminH5Workflow as testAdminH5WorkflowApi,
  updateAdminAiSkill,
  updateAdminH5Workflow,
  uploadAiSkillCoverImage,
} from './aiSkillGateway'
import { apiClient } from './apiClient'
import { defaultSkillConfiguration } from '../utils/aiSkillSchema'

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
const LOCAL_KEY = 'admin-ai-skill-editor-demo-v2'

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

function initialLocalSkills() {
  const imageConfig = defaultSkillConfiguration('image')
  const videoConfig = defaultSkillConfiguration('video')
  return [
    {
      id: 'demo-image-skill', title: '童话绘本封面', summary: '上传参考图并描述故事主题，生成童话绘本封面。',
      status: 'draft', skillType: 'image', scopeType: 'organization', sortOrder: 0, draftRevision: 0,
      configuration: imageConfig, draftConfiguration: imageConfig, updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-video-skill', title: '人物动态短片', summary: '上传人物图片并描述动作，生成动态短片。',
      status: 'draft', skillType: 'video', scopeType: 'organization', sortOrder: 0, draftRevision: 0,
      configuration: videoConfig, draftConfiguration: videoConfig, updatedAt: new Date().toISOString(),
    },
  ]
}

function readLocalSkills() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(LOCAL_KEY) || 'null')
    if (Array.isArray(parsed) && parsed.length) return parsed
  } catch {}
  const initial = initialLocalSkills()
  window.sessionStorage.setItem(LOCAL_KEY, JSON.stringify(initial))
  return initial
}

function writeLocalSkills(skills) {
  window.sessionStorage.setItem(LOCAL_KEY, JSON.stringify(skills))
}

export async function listEditableAiSkills() {
  return SERVER_AUTH_MODE ? listAdminAiSkills() : copy(readLocalSkills())
}

export async function getEditableAiSkill(id) {
  if (SERVER_AUTH_MODE) return getAdminAiSkill(id)
  return copy(readLocalSkills().find((item) => item.id === id) || null)
}

export async function saveEditableAiSkill(payload) {
  if (SERVER_AUTH_MODE) {
    return payload.id ? updateAdminAiSkill(payload.id, payload) : createAdminAiSkill(payload)
  }
  const skills = readLocalSkills()
  const index = skills.findIndex((item) => item.id === payload.id)
  const current = index >= 0 ? skills[index] : null
  const saved = {
    ...current,
    ...copy(payload),
    id: payload.id || `local-skill-${Date.now().toString(36)}`,
    status: current?.status || 'draft',
    draftRevision: Number(current?.draftRevision || 0) + 1,
    configuration: copy(payload.configuration),
    draftConfiguration: copy(payload.configuration),
    updatedAt: new Date().toISOString(),
  }
  if (index >= 0) skills.splice(index, 1, saved)
  else skills.unshift(saved)
  writeLocalSkills(skills)
  return copy(saved)
}

export async function removeEditableAiSkill(id) {
  if (SERVER_AUTH_MODE) return deleteAdminAiSkill(id)
  writeLocalSkills(readLocalSkills().filter((item) => item.id !== id))
  return { ok: true }
}

export async function changeEditableAiSkillStatus(id, status) {
  if (SERVER_AUTH_MODE) return setAdminAiSkillStatus(id, status)
  const skill = await getEditableAiSkill(id)
  if (!skill) return null
  skill.status = status
  return saveEditableAiSkill(skill)
}

export async function publishEditableAiSkill(id) {
  if (SERVER_AUTH_MODE) return publishAdminAiSkill(id)
  const skill = await getEditableAiSkill(id)
  if (!skill) return null
  skill.status = 'published'
  return saveEditableAiSkill(skill)
}

// 本地演示模式没有服务端，直接把 dataURL 存进 sessionStorage，让上传流程在演示环境也能走通。
export async function uploadEditableAiSkillCover(imageData) {
  if (!SERVER_AUTH_MODE) return imageData
  return uploadAiSkillCoverImage(imageData)
}

// ---- 报告工作流库（方案2） -------------------------------------------------

const COVER_SOURCES = new Set(['upload', 'ai', 'canvas-first-page'])

function deriveFlowSummary(workflow = {}) {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []
  const edges = Array.isArray(workflow.edges) ? workflow.edges : []
  if (!nodes.length) return []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) if (incoming.has(edge.target)) incoming.set(edge.target, incoming.get(edge.target) + 1)
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
  const ordered = []
  const seen = new Set()
  while (queue.length && ordered.length < nodes.length) {
    const current = queue.shift()
    if (seen.has(current) || !byId.has(current)) continue
    seen.add(current)
    ordered.push(byId.get(current))
    for (const edge of edges) if (edge.source === current && !seen.has(edge.target)) queue.push(edge.target)
  }
  for (const node of nodes) if (!seen.has(node.id)) ordered.push(node)
  return ordered
    .filter((node) => node.type !== 'marker')
    .map((node) => String(node.data?.title || node.data?.label || node.type || '').trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, 6)
}

function deriveLibraryStage(status, testedAt, versionNumber) {
  if (status === 'published' && versionNumber > 0) return 'published'
  if (status === 'offline') return 'offline'
  if (testedAt) return 'testing'
  return 'draft'
}

// 本地演示模式用同一套推导逻辑，保证演示数据和真实接口形状一致。
function toLocalLibraryItem(skill = {}) {
  const configuration = skill.draftConfiguration || skill.configuration || {}
  const presentation = configuration.presentation || {}
  const meta = configuration.h5Workflow || {}
  const workflow = configuration.workflow || {}
  const testedAt = configuration.runtime?.testedAt || configuration.generation?.testedAt || ''
  const versionNumber = Number(skill.publishedVersionNumber || skill.versionNumber || 0)
  const coverSource = COVER_SOURCES.has(presentation.coverSource) ? presentation.coverSource : ''
  return {
    id: skill.id,
    title: skill.title || '',
    summary: skill.summary || '',
    skillType: skill.skillType || 'image',
    status: skill.status || 'draft',
    stage: deriveLibraryStage(skill.status, testedAt, versionNumber),
    publishedVersionNumber: versionNumber,
    versionCount: versionNumber,
    draftRevision: Number(skill.draftRevision || 0),
    updatedAt: skill.updatedAt || '',
    coverUrl: presentation.coverUrl || '',
    coverSource,
    coverGeneratedAt: presentation.coverGeneratedAt || '',
    coverReady: Boolean(presentation.coverUrl),
    studentSelectable: Boolean(meta.studentSelectable),
    estimatedMinutes: Number(meta.estimatedMinutes || 0),
    pageCount: Number(meta.pageCount || 0),
    flowSummary: Array.isArray(meta.flowSummary) && meta.flowSummary.length ? meta.flowSummary : deriveFlowSummary(workflow),
    nodeCount: (workflow.nodes || []).length,
    dailyLimit: Number(configuration.limits?.dailyLimit || 0),
    testedAt,
  }
}

export async function listH5WorkflowLibrary() {
  if (SERVER_AUTH_MODE) return listAdminH5Workflows()
  return readLocalSkills().filter((skill) => (skill.skillType || 'image') === 'image').map(toLocalLibraryItem)
}

export async function getH5WorkflowLibraryItem(id) {
  if (SERVER_AUTH_MODE) return getAdminH5Workflow(id)
  const skill = readLocalSkills().find((item) => item.id === id)
  return skill ? toLocalLibraryItem(skill) : null
}

export async function saveH5WorkflowLibraryItem(id, payload = {}) {
  if (SERVER_AUTH_MODE) return updateAdminH5Workflow(id, payload)
  const skills = readLocalSkills()
  const index = skills.findIndex((item) => item.id === id)
  if (index < 0) return null
  const skill = skills[index]
  const configuration = copy(skill.draftConfiguration || skill.configuration || {})
  configuration.presentation = { ...(configuration.presentation || {}) }
  configuration.h5Workflow = { ...(configuration.h5Workflow || {}) }
  configuration.limits = { ...(configuration.limits || {}) }
  if (payload.coverUrl !== undefined) configuration.presentation.coverUrl = payload.coverUrl
  if (payload.coverSource !== undefined) {
    configuration.presentation.coverSource = COVER_SOURCES.has(payload.coverSource) ? payload.coverSource : ''
    if (payload.coverSource === 'ai') configuration.presentation.coverGeneratedAt = new Date().toISOString()
  }
  if (payload.studentSelectable !== undefined) configuration.h5Workflow.studentSelectable = Boolean(payload.studentSelectable)
  if (payload.estimatedMinutes !== undefined) configuration.h5Workflow.estimatedMinutes = Number(payload.estimatedMinutes || 0)
  if (payload.pageCount !== undefined) configuration.h5Workflow.pageCount = Number(payload.pageCount || 0)
  if (Array.isArray(payload.flowSummary)) configuration.h5Workflow.flowSummary = payload.flowSummary.slice(0, 8)
  if (payload.dailyLimit !== undefined) configuration.limits.dailyLimit = Number(payload.dailyLimit || 0)
  const saved = {
    ...skill,
    title: payload.title !== undefined ? payload.title : skill.title,
    summary: payload.summary !== undefined ? payload.summary : skill.summary,
    draftConfiguration: configuration,
    configuration: copy(configuration),
    draftRevision: Number(skill.draftRevision || 0) + 1,
    updatedAt: new Date().toISOString(),
  }
  skills.splice(index, 1, saved)
  writeLocalSkills(skills)
  return toLocalLibraryItem(saved)
}

export async function bulkRemoveH5WorkflowLibrary(ids = []) {
  if (SERVER_AUTH_MODE) return bulkDeleteAdminH5Workflows(ids)
  const removeIds = new Set(Array.isArray(ids) ? ids : [])
  const skills = readLocalSkills()
  const kept = skills.filter((skill) => !removeIds.has(skill.id))
  writeLocalSkills(kept)
  return { ok: true, deletedIds: skills.filter((skill) => removeIds.has(skill.id)).map((skill) => skill.id) }
}

export async function generateH5WorkflowCover(id) {
  if (SERVER_AUTH_MODE) return generateAdminH5WorkflowCover(id)
  // 本地演示没有图像模型，用一个同色系渐变占位图代替，保证交互链路完整可验收。
  const hue = Math.abs([...String(id)].reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 42% 46%)"/><stop offset="1" stop-color="hsl(${hue} 46% 28%)"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="640" cy="300" r="230" fill="hsl(${hue} 44% 62%)" opacity=".45"/><circle cx="300" cy="720" r="180" fill="hsl(${hue} 40% 70%)" opacity=".32"/><rect x="110" y="1010" width="470" height="34" rx="17" fill="#fff" opacity=".85"/><rect x="110" y="1070" width="290" height="22" rx="11" fill="#fff" opacity=".55"/></svg>`
  const assetUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const item = await saveH5WorkflowLibraryItem(id, { coverUrl: assetUrl, coverSource: 'ai' })
  return { ok: true, workflow: item, assetUrl }
}

// 演示模式没有真实画布产物时，用同色系 SVG 占位模拟「第一页」；能读到真实出图时交给服务端逻辑。
export async function generateH5WorkflowCanvasCover(id) {
  if (SERVER_AUTH_MODE) return generateAdminH5WorkflowCanvasCover(id)
  const skill = readLocalSkills().find((item) => item.id === id)
  const configuration = skill?.draftConfiguration || skill?.configuration || {}
  const nodes = Array.isArray(configuration.workflow?.nodes) ? configuration.workflow.nodes : []
  const first = nodes.find((node) => {
    const data = node?.data || {}
    return String(data.output?.url || data.image || '').trim()
  })
  const url = String(first?.data?.output?.url || first?.data?.image || '').trim()
  if (!url) {
    const error = new Error('画布里还没有生成过图片，请先在画布页跑一次真实测试再取首页。')
    error.code = 'CANVAS_COVER_MISSING'
    throw error
  }
  const item = await saveH5WorkflowLibraryItem(id, { coverUrl: url, coverSource: 'canvas-first-page' })
  return { ok: true, workflow: item, assetUrl: url, sourceNode: { nodeId: first.id, nodeType: first.type, title: first.data?.title || '', url } }
}

// 真实测试用的模板数据：只喂课程/创意/页面文案，画布内容由服务端读已保存的草稿。
// 重点：这里跑的是「库里已保存的版本」，不是画布上还没保存的东西，所以要在抽屉里点。
function defaultH5TestPayload() {
  return {
    difficulty: 'pro',
    templateId: 'h5-ai-tech',
    report: {
      title: '我的 AI 创意项目',
      course: 'AI 创意美术课',
      idea: '把我的草图发展成完整的视觉作品。',
      summary: '我从课程问题、草图和 AI 版本中整理创作过程，并选择最终方案。',
      prompt: '创意美术项目视觉，竖版构图，清晰主体，不生成大段文字',
      pages: [{ title: '我的创意', body: '我先观察和画草图，再用 AI 尝试不同方案。' }],
    },
    materials: {},
  }
}

export async function testH5Workflow(id, payload = null) {
  if (!SERVER_AUTH_MODE) {
    // 演示模式不真调模型：只把 testedAt 记上，让「测试中」这个状态能走通。
    const item = await saveH5WorkflowLibraryItem(id, {})
    return { ok: true, images: [], workflow: item, demo: true }
  }
  const result = await testAdminH5WorkflowApi(id, payload || defaultH5TestPayload())
  return { ...result, workflow: normalizeH5WorkflowSkill(result?.skill) }
}

export async function publishH5Workflow(id) {
  if (!SERVER_AUTH_MODE) {
    const skill = await getEditableAiSkill(id)
    if (!skill) return null
    skill.status = 'published'
    const saved = await saveEditableAiSkill(skill)
    return saved ? toLocalLibraryItem(saved) : null
  }
  const published = await publishAdminH5WorkflowApi(id)
  await syncH5WorkflowVersion(published)
  return normalizeH5WorkflowSkill(published)
}

// 服务端返回的 skill 里，配置可能在 draftConfiguration 上；统一摊平成库列表那一份形状。
function normalizeH5WorkflowSkill(skill) {
  if (!skill) return null
  const configuration = copy(skill.draftConfiguration || skill.configuration || {})
  return toLocalLibraryItem({ ...skill, draftConfiguration: configuration })
}

// 发布后要把 h5-report-config 里「方案2」绑定的版本号改成最新，否则用户端会报版本不一致(409)。
async function syncH5WorkflowVersion(published) {
  if (!published?.id || !Number(published.publishedVersionNumber || 0)) return
  try {
    const response = await apiClient.get('/admin/h5-report-config')
    const draft = copy(response.data.draft || response.data)
    const strategy = (draft.strategies || []).find((item) => item.id === 'h5-canvas-workflow')
    if (!strategy || strategy.workflowId !== published.id) return
    strategy.workflowVersion = Number(published.publishedVersionNumber || 0)
    await apiClient.post('/admin/h5-report-config/draft', draft)
  } catch {
    // 版本同步失败不阻断发布本身：发布已成功，只是用户端会提示需要重新绑定。
  }
}

export { SERVER_AUTH_MODE }