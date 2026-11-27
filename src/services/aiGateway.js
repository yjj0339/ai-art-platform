import { apiClient } from './apiClient'
import { generateArtwork as generateMockArtwork } from './mockAiService'

const API_MODE = import.meta.env.VITE_AI_MODE || 'mock'

function shouldUseApi() {
  return ['api', 'auto'].includes(API_MODE)
}

function apiErrorMessage(error, fallback = 'AI 接口请求失败') {
  const data = error?.response?.data
  const upstreamMessage = data?.details?.message || data?.error?.message || data?.message
  return String(upstreamMessage || error?.message || fallback).trim()
}

function normalizeArtworkResponse(payload, request) {
  const data = payload?.data || payload || {}
  const items = data.images || data.results || data.versions || []
  if (!Array.isArray(items) || !items.length) {
    throw new Error('AI接口没有返回图片结果')
  }

  return items.map((item, index) => ({
    id: item.id || `api-art-${Date.now()}-${index}`,
    title: item.title || `AI作品 ${index + 1}`,
    prompt: item.prompt || request.prompt,
    difficulty: request.difficulty,
    style: request.style,
    imageUrl: item.imageUrl || item.url || item.src || '',
    background: item.background || (item.imageUrl || item.url ? `url("${item.imageUrl || item.url}") center / cover no-repeat` : ''),
    provider: data.provider || item.provider || 'api',
    model: item.model || data.model || '',
    taskId: data.taskId || item.taskId || '',
    // 服务端出图后会先把图存进用户自己的素材库（上游链接只有 24 小时有效），
    // 这里必须把编号带下来：画布拿它判断「这张图已经落库，不用再上传一次」。
    assetId: item.assetId || '',
    createdAt: item.createdAt || new Date().toISOString(),
  }))
}

export async function testAiConnection() {
  const startedAt = Date.now()
  try {
    const response = await apiClient.get('/ai/health')
    if (!response.data || typeof response.data !== 'object') {
      throw new Error('接口返回的不是JSON健康检查结果，请确认后端AI网关已启动')
    }
    return {
      ok: true,
      mode: API_MODE,
      latency: Date.now() - startedAt,
      message: response?.data?.message || 'AI接口连接正常',
      data: response.data,
    }
  } catch (error) {
    return {
      ok: false,
      mode: API_MODE,
      latency: Date.now() - startedAt,
      message: error?.response?.data?.message || error.message || 'AI接口连接失败',
      data: error?.response?.data || null,
    }
  }
}

export async function generateArtwork(request) {
  if (!shouldUseApi()) {
    const results = await generateMockArtwork(request)
    return { source: 'mock', results }
  }

  try {
    const response = await apiClient.post('/ai/image/generate', {
      prompt: request.prompt,
      negativePrompt: request.negativePrompt || '',
      difficulty: request.difficulty,
      style: request.style,
      provider: request.provider || '',
      model: request.model || '',
      count: request.count || 1,
      ratio: request.ratio || 'auto',
      quality: request.quality || 'standard',
      lineControl: request.lineControl || null,
      images: Array.isArray(request.images) ? request.images.filter(Boolean) : [],
      templateReferenceImages: Array.isArray(request.templateReferenceImages) ? request.templateReferenceImages.filter(Boolean).slice(0, 3) : [],
      referenceImage: request.referenceImage || '',
      returnBase64: Boolean(request.returnBase64),
      projectId: request.projectId || '',
    })
    return {
      source: 'api',
      results: normalizeArtworkResponse(response.data, request),
      raw: response.data,
    }
  } catch (error) {
    const message = apiErrorMessage(error, 'AI 图片生成失败')
    if (API_MODE === 'api') {
      const detailedError = new Error(message)
      detailedError.status = error?.response?.status
      detailedError.data = error?.response?.data || null
      throw detailedError
    }
    const results = await generateMockArtwork(request)
    return {
      source: 'mock-fallback',
      results,
      error: message,
    }
  }
}

export async function generateVideo(request) {
  const response = await apiClient.post('/ai/video/generate', request)
  return response.data || {}
}

// 画布「标记」功能：把以点击点为中心裁出的小图交给可看图的大模型识别，返回 3~5 个候选内容。
// 候选既可能来自服务端的新字段 candidates，也可能只有兼容字段 description（老服务端），因此统一归一化。
// 失败（如后台未配置支持视觉的文本模型 / 智能体关闭识别 / 网络抖动）必须抛出，
// 由调用方降级为「候选为空 + 允许手动填写」，绝不阻塞主流程。
export async function describeImageRegion({ image, hint = '' } = {}) {
  const dataUrl = String(image || '').trim()
  if (!dataUrl.startsWith('data:image/')) throw new Error('待识别区域不是有效的图片数据')
  const response = await apiClient.post('/ai/image/describe-region', {
    image: dataUrl,
    hint: String(hint || '').slice(0, 200),
  })
  const data = response?.data || {}
  const candidates = normalizeRegionCandidates(data)
  if (!candidates.length) throw new Error('识别接口没有返回可用内容')
  return {
    candidates,
    // 兼容旧调用方：首选候选即默认内容描述。
    description: candidates[0],
    provider: data.provider || '',
    model: data.model || '',
  }
}

// 归一化候选列表：合并 candidates 数组与 description 单值 → 去首尾引号/标点 → 去重 → 上限 5 个。
function normalizeRegionCandidates(data = {}) {
  const raw = Array.isArray(data.candidates) ? data.candidates : []
  const values = [...raw, data.description]
    .map((item) => String(item == null ? '' : item).trim())
    .map((item) => item.replace(/^[\s"'“”‘’、,，。.；;]+/, '').replace(/[\s"'“”‘’、,，。.；;]+$/, ''))
    .filter(Boolean)
  return [...new Set(values)].slice(0, 5)
}

export async function getVideoTask(taskId, provider = 'agnes') {
  const response = await apiClient.get(`/ai/video/tasks/${encodeURIComponent(taskId)}`, { params: { provider } })
  return response.data || {}
}

export async function generateHunyuan3dModel(request) {
  const response = await apiClient.post('/ai/model3d/generate', request)
  return response.data || {}
}

export async function getHunyuan3dTask(taskId, edition = 'rapid') {
  const response = await apiClient.get(`/ai/model3d/tasks/${encodeURIComponent(taskId)}`, { params: { edition } })
  return response.data || {}
}

export async function getHunyuan3dConfig() {
  const response = await apiClient.get('/ai/model3d/config')
  return response.data || {}
}

export async function optimizeArtworkPrompt(request) {
  const response = await apiClient.post('/ai/prompt/optimize', {
    prompt: request.prompt,
    strength: request.strength || 'balanced',
    flowKey: request.flowKey || 'paint.promptOptimize',
  })
  const prompt = String(response?.data?.prompt || '').trim()
  if (!prompt) throw new Error('提示词智能体没有返回有效内容')
  return { prompt, raw: response.data }
}

export async function getJuniorCreativeAgentConfig() {
  const response = await apiClient.get('/admin/creative-agent-config')
  return response?.data?.config || {}
}

export async function saveJuniorCreativeAgentConfig(config) {
  const response = await apiClient.post('/admin/creative-agent-config', config)
  return response?.data?.config || {}
}

// 画布助手的附件解析：图片走视觉模型转述，文本直读。
export async function requestCanvasAttachment(payload = {}) {
  const response = await apiClient.post('/ai/canvas/assistant-attachment', {
    name: payload.name || '',
    mime: payload.mime || '',
    kind: payload.kind || '',
    dataUrl: payload.dataUrl || '',
    text: payload.text || '',
  })
  const data = response?.data || {}
  return {
    description: String(data.description || '').trim(),
    provider: data.provider || '',
    model: data.model || '',
  }
}

export async function requestCanvasAssistant(request) {
  const response = await apiClient.post('/ai/canvas/assistant', {
    operation: request.operation || 'assist',
    message: request.message || '',
    model: request.model || '',
    provider: request.provider || '',
    selectedNode: request.selectedNode || null,
    upstream: Array.isArray(request.upstream) ? request.upstream : [],
    canvas: request.canvas || { nodes: [], edges: [] },
    availableNodeTypes: Array.isArray(request.availableNodeTypes) ? request.availableNodeTypes : [],
    conversation: Array.isArray(request.conversation) ? request.conversation.slice(-10) : [],
    agentState: request.agentState && typeof request.agentState === 'object' ? request.agentState : {},
    execution: request.execution && typeof request.execution === 'object' ? request.execution : null,
    availableTemplates: Array.isArray(request.availableTemplates) ? request.availableTemplates : [],
  })
  const data = response?.data || {}
  return {
    reply: String(data.reply || '').trim(),
    // 看图评价时后端给出的「可直接重绘」的改进提示词（可选）。
    refinePrompt: String(data.refinePrompt || '').trim(),
    actions: Array.isArray(data.actions) ? data.actions : [],
    warnings: Array.isArray(data.warnings) ? data.warnings.map((item) => String(item)) : [],
    proposals: Array.isArray(data.proposals) ? data.proposals : [],
    provider: data.provider || '',
    model: data.model || '',
    phase: data.phase || '',
    plan: Array.isArray(data.plan) ? data.plan : [],
    agentState: data.agentState && typeof data.agentState === 'object' ? data.agentState : {},
  }
}

// 画布模板（P2）：服务端存储，可跨会话 / 跨设备复用一段子图。
export async function listCanvasTemplates(options = {}) {
  const response = await apiClient.get('/canvas/templates', {
    params: options.withGraph ? { withGraph: 1 } : {},
  })
  const data = response?.data || {}
  return Array.isArray(data.templates) ? data.templates : []
}

export async function getCanvasTemplate(id) {
  const response = await apiClient.get(`/canvas/templates/${encodeURIComponent(id)}`)
  return response?.data?.template || null
}

export async function saveCanvasTemplate(payload = {}) {
  const body = {
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim(),
    scope: payload.scope === 'org' ? 'org' : 'private',
    graph: payload.graph || { nodes: [], edges: [] },
  }
  const response = payload.id
    ? await apiClient.patch(`/canvas/templates/${encodeURIComponent(payload.id)}`, body)
    : await apiClient.post('/canvas/templates', body)
  return response?.data?.template || null
}

export async function deleteCanvasTemplate(id) {
  const response = await apiClient.delete(`/canvas/templates/${encodeURIComponent(id)}`)
  return Boolean(response?.data?.ok)
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('无法读取录音数据'))
    reader.readAsDataURL(blob)
  })
}

export async function transcribeArtworkVoice(blob) {
  const audio = await blobToDataUrl(blob)
  const response = await apiClient.post('/ai/audio/transcribe', {
    audio,
    mimeType: blob.type || 'audio/webm',
    language: 'zh',
  })
  const text = String(response?.data?.text || '').trim()
  if (!text) throw new Error('语音转写没有返回文字')
  return text
}

export function getAiMode() {
  return API_MODE
}
