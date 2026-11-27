/**
 * 画布模板存储（无限画布 P2）
 *
 * 纯文件式存储（对照 prompt-library-store.js 的兜底实现），
 * 落盘于 dataDir/canvas-templates.json，结构与其它 store 保持一致：
 *   { templates: [ { id, organizationId, ownerUserId, name, description, scope, graph, ... } ] }
 *
 * 模板只保存「子图快照」（nodes / edges 白名单字段），不含运行时状态。
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_NODES = 60
const MAX_EDGES = 120
const MAX_BYTES = 512 * 1024
const SCOPES = new Set(['private', 'org'])

function newId() {
  return `ctpl_${randomBytes(12).toString('base64url')}`
}

function cleanText(value, max = 120) {
  return String(value ?? '').trim().slice(0, max)
}

function fail(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function dataPath() {
  const dir = process.env.AI_DATA_DIR || join(process.cwd(), 'server', 'data-fallback')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'canvas-templates.json')
}

function readLocal() {
  try {
    const data = JSON.parse(readFileSync(dataPath(), 'utf8'))
    return Array.isArray(data?.templates) ? data : { templates: [] }
  } catch {
    return { templates: [] }
  }
}

function writeLocal(data) {
  writeFileSync(dataPath(), JSON.stringify(data, null, 2), 'utf8')
}

function orgId(user) {
  return user?.organization?.id || 'demo-organization'
}

function sanitizePosition(value) {
  const x = Number(value?.x)
  const y = Number(value?.y)
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
}

function sanitizePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function sanitizeNode(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = cleanText(raw.id, 80)
  const type = cleanText(raw.type, 40)
  if (!id || !type) return null
  const node = {
    id,
    type,
    position: sanitizePosition(raw.position),
    data: sanitizePlainObject(raw.data) || {},
  }
  const parentNode = cleanText(raw.parentNode, 80)
  if (parentNode) node.parentNode = parentNode
  if (raw.extent === 'parent') node.extent = 'parent'
  const width = Number(raw.width)
  if (Number.isFinite(width) && width > 0) node.width = Math.round(width)
  const height = Number(raw.height)
  if (Number.isFinite(height) && height > 0) node.height = Math.round(height)
  const style = sanitizePlainObject(raw.style)
  if (style) node.style = style
  return node
}

function sanitizeEdge(raw, nodeIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = cleanText(raw.source, 80)
  const target = cleanText(raw.target, 80)
  if (!source || !target) return null
  if (!nodeIds.has(source) || !nodeIds.has(target)) return null
  const edge = {
    id: cleanText(raw.id, 160) || `e_${source}_${target}`,
    source,
    target,
    sourceHandle: raw.sourceHandle ?? null,
    targetHandle: raw.targetHandle ?? null,
  }
  if (raw.type) edge.type = cleanText(raw.type, 40)
  if (raw.label) edge.label = cleanText(raw.label, 80)
  return edge
}

function sanitizeGraph(graph = {}) {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const nodes = rawNodes.map(sanitizeNode).filter(Boolean)
  if (!nodes.length) throw fail('模板至少需要包含一个节点')
  if (nodes.length > MAX_NODES) throw fail(`模板节点数量不能超过 ${MAX_NODES} 个`)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const rawEdges = Array.isArray(graph?.edges) ? graph.edges : []
  const edges = rawEdges.map((edge) => sanitizeEdge(edge, nodeIds)).filter(Boolean)
  if (edges.length > MAX_EDGES) throw fail(`模板连线数量不能超过 ${MAX_EDGES} 条`)
  try {
    if (Buffer.byteLength(JSON.stringify({ nodes, edges }), 'utf8') > MAX_BYTES) {
      throw fail('模板体积过大（超过 512KB），请先精简图片等素材后重试')
    }
  } catch (error) {
    if (error?.statusCode) throw error
    throw fail('模板内容无法序列化')
  }
  return { nodes, edges }
}

function normalizeScope(value, fallback = 'private') {
  const scope = cleanText(value || fallback, 12)
  return SCOPES.has(scope) ? scope : fallback
}

function normalizePayload(payload = {}) {
  const name = cleanText(payload.name, 60)
  if (!name) throw fail('请填写模板名称')
  const graph = sanitizeGraph(payload.graph || payload)
  return {
    name,
    description: cleanText(payload.description, 300),
    scope: normalizeScope(payload.scope),
    graph,
  }
}

function visibleTo(template, organizationId, userId) {
  if (!template || template.organizationId !== organizationId) return false
  if (template.scope === 'org') return true
  return template.ownerUserId === userId
}

function toPublic(template) {
  return {
    id: template.id,
    organizationId: template.organizationId,
    name: template.name,
    description: template.description || '',
    scope: template.scope || 'private',
    ownerUserId: template.ownerUserId || '',
    nodeCount: Number(template.nodeCount || template.graph?.nodes?.length || 0),
    edgeCount: Number(template.edgeCount || template.graph?.edges?.length || 0),
    graph: template.graph || { nodes: [], edges: [] },
    createdAt: template.createdAt || '',
    updatedAt: template.updatedAt || '',
  }
}

export async function listCanvasTemplates(user, options = {}) {
  const organizationId = orgId(user)
  const userId = user?.id || ''
  const withGraph = options.withGraph === true
  const data = readLocal()
  const list = data.templates
    .filter((item) => visibleTo(item, organizationId, userId))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map((item) => {
      const base = toPublic(item)
      if (withGraph) return base
      const { graph, ...summary } = base
      void graph
      return summary
    })
  return { templates: list }
}

export async function getCanvasTemplate(user, id) {
  const organizationId = orgId(user)
  const userId = user?.id || ''
  const templateId = cleanText(id, 80)
  if (!templateId) throw fail('模板 ID 不正确')
  const data = readLocal()
  const found = data.templates.find((item) => item.id === templateId && visibleTo(item, organizationId, userId))
  if (!found) throw fail('模板不存在或无权访问', 404)
  return toPublic(found)
}

export async function saveCanvasTemplate(user, payload = {}, id = '') {
  const organizationId = orgId(user)
  const userId = user?.id || ''
  const value = normalizePayload(payload)
  const data = readLocal()
  const index = id ? data.templates.findIndex((item) => item.id === id && item.organizationId === organizationId) : -1
  if (id && index < 0) throw fail('模板不存在', 404)
  if (index >= 0) {
    const current = data.templates[index]
    if (current.ownerUserId && current.ownerUserId !== userId && current.scope === 'private') {
      throw fail('仅模板创建者可以修改该模板', 403)
    }
  }
  const now = new Date().toISOString()
  const next = {
    id: index >= 0 ? data.templates[index].id : newId(),
    organizationId,
    ownerUserId: index >= 0 ? data.templates[index].ownerUserId || userId : userId,
    name: value.name,
    description: value.description,
    scope: value.scope,
    graph: value.graph,
    nodeCount: value.graph.nodes.length,
    edgeCount: value.graph.edges.length,
    createdAt: index >= 0 ? data.templates[index].createdAt || now : now,
    updatedAt: now,
  }
  if (index >= 0) data.templates[index] = next
  else data.templates.unshift(next)
  writeLocal(data)
  return toPublic(next)
}

export async function removeCanvasTemplate(user, id) {
  const organizationId = orgId(user)
  const userId = user?.id || ''
  const templateId = cleanText(id, 80)
  if (!templateId) throw fail('模板 ID 不正确')
  const data = readLocal()
  const index = data.templates.findIndex((item) => item.id === templateId && item.organizationId === organizationId)
  if (index < 0) throw fail('模板不存在', 404)
  const current = data.templates[index]
  if (current.ownerUserId && current.ownerUserId !== userId && current.scope === 'private') {
    throw fail('仅模板创建者可以删除该模板', 403)
  }
  data.templates.splice(index, 1)
  writeLocal(data)
  return { ok: true }
}

export const CANVAS_TEMPLATE_LIMITS = { MAX_NODES, MAX_EDGES, MAX_BYTES }
