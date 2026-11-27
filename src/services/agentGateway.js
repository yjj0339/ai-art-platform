/* AI 创作伙伴（智能体）前端接口：普通请求走 apiClient，对话用 fetch 读取 SSE 流。 */
import { createParser } from 'eventsource-parser'
import { apiClient } from './apiClient'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

export async function getAgentConfig() {
  const { data } = await apiClient.get('/agent/config', { timeout: 15000 })
  return data
}

export async function listAgentConversations() {
  const { data } = await apiClient.get('/agent/conversations', { timeout: 15000 })
  return data.conversations || []
}

export async function getAgentConversation(id) {
  const { data } = await apiClient.get(`/agent/conversations/${encodeURIComponent(id)}`, { timeout: 15000 })
  return data
}

export async function renameAgentConversation(id, title) {
  const { data } = await apiClient.patch(`/agent/conversations/${encodeURIComponent(id)}`, { title })
  return data.conversation
}

export async function deleteAgentConversation(id) {
  await apiClient.delete(`/agent/conversations/${encodeURIComponent(id)}`)
}

/**
 * 发送一条消息并逐段接收回复。
 * onEvent(type, data)：meta / delta / tool / skill / image / action / usage / error / done
 * 返回 Promise，流结束（或被 signal 中止）后 resolve。
 */
export async function streamAgentChat(body, { signal, onEvent }) {
  let response
  try {
    response = await fetch(`${API_BASE}/agent/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') return { aborted: true }
    throw Object.assign(new Error('网络连接失败，请检查网络后再试。'), { code: 0 })
  }
  const contentType = String(response.headers.get('content-type') || '')
  if (!response.ok || !contentType.includes('text/event-stream')) {
    const data = await response.json().catch(() => ({}))
    const fallback = response.status === 401 ? '登录已过期，请重新登录。' : `请求失败（${response.status}）`
    throw Object.assign(new Error(data.message || fallback), { code: response.status })
  }
  const parser = createParser({
    onEvent(event) {
      if (!event.data) return
      let data = {}
      try { data = JSON.parse(event.data) } catch { return }
      onEvent(event.event || 'message', data)
    },
  })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      parser.feed(decoder.decode(value, { stream: true }))
    }
    parser.feed(decoder.decode())
  } catch (error) {
    if (error?.name === 'AbortError') return { aborted: true }
    throw Object.assign(new Error('连接中断了，请重试。'), { code: 0 })
  }
  return { aborted: false }
}

/* ---------------- 后台 ---------------- */

export async function getAdminAgentConfig() {
  const { data } = await apiClient.get('/admin/agent/config', { timeout: 15000 })
  return data
}

export async function saveAdminAgentConfig(config) {
  const { data } = await apiClient.put('/admin/agent/config', { config })
  return data.config
}

export async function listAdminAgentSkills() {
  const { data } = await apiClient.get('/admin/agent/skills', { timeout: 15000 })
  return data.skills || []
}

export async function getAdminAgentSkill(id) {
  const { data } = await apiClient.get(`/admin/agent/skills/${encodeURIComponent(id)}`)
  return data.skill
}

export async function importAdminAgentSkills(files) {
  const { data } = await apiClient.post('/admin/agent/skills/import', { files }, { timeout: 120000 })
  return data
}

export async function importAdminAgentSkillFromPackage(packageId) {
  const { data } = await apiClient.post('/admin/agent/skills/from-package', { packageId })
  return data
}

export async function updateAdminAgentSkill(id, patch) {
  const { data } = await apiClient.patch(`/admin/agent/skills/${encodeURIComponent(id)}`, patch)
  return data.skill
}

export async function deleteAdminAgentSkill(id) {
  await apiClient.delete(`/admin/agent/skills/${encodeURIComponent(id)}`)
}

export function adminAgentSkillExportUrl(id) {
  return `${API_BASE}/admin/agent/skills/${encodeURIComponent(id)}/export`
}

export async function listAdminAgentLogs(status = 'all') {
  const { data } = await apiClient.get('/admin/agent/logs', { params: { status, limit: 100 } })
  return data.logs || []
}
