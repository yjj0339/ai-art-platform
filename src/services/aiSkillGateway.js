import { apiClient } from './apiClient'

function dataOf(response) {
  return response?.data || {}
}

export async function listStudentAiSkills(type) {
  const response = await apiClient.get('/ai-skills', { params: type ? { type } : {} })
  return dataOf(response).skills || []
}

export async function runStudentAiSkill(skillId, values) {
  const response = await apiClient.post(`/ai-skills/${encodeURIComponent(skillId)}/runs`, { values })
  return dataOf(response)
}

export async function listAdminAiSkills() {
  const response = await apiClient.get('/admin/ai-skills')
  return dataOf(response).skills || []
}

// 把本地选中的图片转成 base64 交给服务端落盘，服务端会压缩成 720×720 webp 再返回可访问的地址。
export async function uploadAiSkillCoverImage(imageData) {
  const response = await apiClient.post('/admin/ai-skills/cover-assets', { imageData })
  return dataOf(response).assetUrl || ''
}

export async function getAdminAiSkill(skillId) {
  const response = await apiClient.get(`/admin/ai-skills/${encodeURIComponent(skillId)}`)
  return dataOf(response).skill || null
}

export async function createAdminAiSkill(payload) {
  const response = await apiClient.post('/admin/ai-skills', payload)
  return dataOf(response).skill || null
}

export async function updateAdminAiSkill(skillId, payload) {
  const response = await apiClient.patch(`/admin/ai-skills/${encodeURIComponent(skillId)}`, payload)
  return dataOf(response).skill || null
}

export async function publishAdminAiSkill(skillId) {
  const response = await apiClient.post(`/admin/ai-skills/${encodeURIComponent(skillId)}/publish`)
  return dataOf(response).skill || null
}

export async function setAdminAiSkillStatus(skillId, status) {
  const response = await apiClient.post(`/admin/ai-skills/${encodeURIComponent(skillId)}/status`, { status })
  return dataOf(response).skill || null
}

export async function deleteAdminAiSkill(skillId) {
  const response = await apiClient.delete(`/admin/ai-skills/${encodeURIComponent(skillId)}`)
  return dataOf(response)
}

export async function listAdminAiSkillVersions(skillId) {
  const response = await apiClient.get(`/admin/ai-skills/${encodeURIComponent(skillId)}/versions`)
  return dataOf(response).versions || []
}

export async function restoreAdminAiSkillVersion(skillId, versionId) {
  const response = await apiClient.post(`/admin/ai-skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(versionId)}/restore`)
  return dataOf(response).skill || null
}

export async function copyPlatformAiSkill(skillId) {
  const response = await apiClient.post(`/admin/ai-skills/${encodeURIComponent(skillId)}/copy`)
  return dataOf(response).skill || null
}

export async function enablePlatformAiSkill(skillId, enabled) {
  const response = await apiClient.post(`/admin/ai-skills/${encodeURIComponent(skillId)}/enable`, { enabled })
  return dataOf(response)
}

export async function testAdminAiSkill(payload) {
  const response = await apiClient.post(`/admin/ai-skills/${encodeURIComponent(payload.id || 'draft')}/test`, payload)
  return dataOf(response)
}

// ---- 报告工作流库（方案2） -------------------------------------------------

export async function listAdminH5Workflows() {
  const response = await apiClient.get('/admin/h5-report-workflows')
  return dataOf(response).workflows || []
}

export async function getAdminH5Workflow(workflowId) {
  const response = await apiClient.get(`/admin/h5-report-workflows/${encodeURIComponent(workflowId)}`)
  return dataOf(response).workflow || null
}

export async function updateAdminH5Workflow(workflowId, payload) {
  const response = await apiClient.patch(`/admin/h5-report-workflows/${encodeURIComponent(workflowId)}`, payload)
  return dataOf(response).workflow || null
}

export async function bulkDeleteAdminH5Workflows(ids) {
  const response = await apiClient.post('/admin/h5-report-workflows/bulk-delete', { ids })
  return dataOf(response)
}

export async function generateAdminH5WorkflowCover(workflowId) {
  const response = await apiClient.post(`/admin/h5-report-workflows/${encodeURIComponent(workflowId)}/cover/ai`)
  return dataOf(response)
}

export async function generateAdminH5WorkflowCanvasCover(workflowId) {
  const response = await apiClient.post(`/admin/h5-report-workflows/${encodeURIComponent(workflowId)}/cover/canvas`)
  return dataOf(response)
}

// 真实测试：服务端会用「已保存的草稿」跑一遍整条工作流并真的出图（会消耗额度）。
// payload 只是模板数据（课程/创意/页面文案），不传画布内容。
export async function testAdminH5Workflow(workflowId, payload = {}) {
  const response = await apiClient.post(`/admin/h5-report-workflows/${encodeURIComponent(workflowId)}/test`, payload)
  return dataOf(response)
}

// 发布：服务端要求 draft_configuration.runtime.testedAt 存在，否则返回「发布前必须先完成一次真实测试」。
export async function publishAdminH5Workflow(workflowId) {
  const response = await apiClient.post(`/admin/h5-report-workflows/${encodeURIComponent(workflowId)}/publish`)
  return dataOf(response).skill || null
}
