import { apiClient } from './apiClient'

// 图像风格模板：后台「AI图像功能管理 → 风格模板编辑」维护，用户端绘画页「图像风格」读取。

export async function listAdminImageStyles() {
  const response = await apiClient.get('/admin/image-styles')
  return response.data.styles || []
}

export async function listStudentImageStyles() {
  const response = await apiClient.get('/image-styles')
  return response.data.styles || []
}

/** 用户端：风格和面板设置（标题、每排几张、回退方式）一次读回来。面板设置存服务端，换设备也一致。 */
export async function loadStudentImageStylePanel() {
  const response = await apiClient.get('/image-styles')
  return { styles: response.data.styles || [], panelSettings: response.data.panelSettings || null }
}

/** 后台：读取风格面板设置。saved=false 表示服务端还没保存过（返回的是默认值）。 */
export async function getImageStylePanelSettings() {
  const response = await apiClient.get('/admin/image-styles/settings')
  return { settings: response.data.settings || null, saved: Boolean(response.data.saved) }
}

/** 后台：保存风格面板设置（存服务端，所有设备生效）。 */
export async function saveImageStylePanelSettings(payload) {
  const response = await apiClient.put('/admin/image-styles/settings', payload)
  return response.data.settings
}

export async function uploadImageStyleCover(imageData) {
  const response = await apiClient.post('/admin/image-style-covers', { imageData })
  return response.data.assetUrl
}

export async function createImageStyle(payload) {
  const response = await apiClient.post('/admin/image-styles', payload)
  return response.data.style
}

export async function updateImageStyle(id, payload) {
  const response = await apiClient.patch(`/admin/image-styles/${encodeURIComponent(id)}`, payload)
  return response.data.style
}

export async function deleteImageStyle(id, mode = 'archive') {
  const response = await apiClient.delete(`/admin/image-styles/${encodeURIComponent(id)}`, { params: { mode } })
  return response.data
}

export async function reorderImageStyles(ids) {
  const response = await apiClient.post('/admin/image-styles/reorder', { ids })
  return response.data
}

// 批量：action = enable | disable | archive | delete | group（group 需同时传 groupName）
export async function batchImageStyles(payload) {
  const response = await apiClient.post('/admin/image-styles/batch', payload)
  return response.data
}

// 分类（用户端叫「分组」）：可单独新建空分类，改名会连带改掉该分类下所有风格的 group_name。
// 删除分类不会删风格，里面的风格统一挪到「推荐」。
export async function listImageStyleGroups() {
  const response = await apiClient.get('/admin/image-style-groups')
  return response.data.groups || []
}

export async function createImageStyleGroup(name) {
  const response = await apiClient.post('/admin/image-style-groups', { name })
  return response.data.group
}

export async function renameImageStyleGroup(id, name) {
  const response = await apiClient.patch(`/admin/image-style-groups/${encodeURIComponent(id)}`, { name })
  return response.data.group
}

export async function deleteImageStyleGroup(id) {
  const response = await apiClient.delete(`/admin/image-style-groups/${encodeURIComponent(id)}`)
  return response.data
}
