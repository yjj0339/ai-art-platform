import { apiClient } from './apiClient'

export async function listStudentPromptLibrary(edition) {
  const response = await apiClient.get('/prompt-library', { params: edition ? { edition } : {} })
  return response.data
}

export async function listAdminPromptLibrary() {
  const response = await apiClient.get('/admin/prompt-library')
  return response.data
}

export async function uploadPromptIconImage(imageData) {
  const response = await apiClient.post('/admin/prompt-library/icon-assets', { imageData })
  return response.data.assetUrl
}

export async function createPromptCategory(payload) {
  const response = await apiClient.post('/admin/prompt-library/categories', payload)
  return response.data.category
}

export async function updatePromptCategory(id, payload) {
  const response = await apiClient.patch(`/admin/prompt-library/categories/${encodeURIComponent(id)}`, payload)
  return response.data.category
}

export async function deletePromptCategory(id, mode = 'archive') {
  const response = await apiClient.delete(`/admin/prompt-library/categories/${encodeURIComponent(id)}`, { params: { mode } })
  return response.data
}

export async function createPrompt(payload) {
  const response = await apiClient.post('/admin/prompt-library/prompts', payload)
  return response.data.prompt
}

export async function updatePrompt(id, payload) {
  const response = await apiClient.patch(`/admin/prompt-library/prompts/${encodeURIComponent(id)}`, payload)
  return response.data.prompt
}

export async function deletePrompt(id, mode = 'archive') {
  const response = await apiClient.delete(`/admin/prompt-library/prompts/${encodeURIComponent(id)}`, { params: { mode } })
  return response.data
}
