// 工作台外观配置的前端读写入口。
//
// 用户端只用 getWorkbenchConfig()：拿不到（没登录 / 后端挂了 / 网络断）时返回 null，
// 工作台自动沿用代码里的内置卡片和背景 —— 绝不能因为一个外观配置把整个首屏卡住。
import { apiClient } from './apiClient'

export async function getWorkbenchConfig() {
  try {
    const response = await apiClient.get('/workbench-config', { timeout: 8000 })
    return response.data?.config || null
  } catch {
    return null
  }
}

// 登录页专用：还没登录就要显示品牌 LOGO，所以走独立的不需要登录的接口。
// 拿不到就返回空字符串，登录页继续显示内置那个「AI」方块。
export async function getBrandLogo() {
  try {
    const response = await apiClient.get('/brand-logo', { timeout: 6000 })
    return response.data?.logoUrl || ''
  } catch {
    return ''
  }
}

export async function adminGetWorkbenchConfig() {
  const response = await apiClient.get('/admin/workbench-config')
  return response.data
}

export async function adminSaveWorkbenchConfig(config) {
  const response = await apiClient.post('/admin/workbench-config', { config })
  return response.data?.config || null
}

export async function adminResetWorkbenchConfig() {
  const response = await apiClient.post('/admin/workbench-config/reset')
  return response.data?.config || null
}

// kind: 'card' | 'bg' | 'logo'
export async function adminUploadWorkbenchImage(kind, imageData) {
  const response = await apiClient.post('/admin/workbench-assets', { kind, imageData, mediaType: 'image' }, { timeout: 120000 })
  return response.data?.assetUrl || ''
}

export async function adminUploadWorkbenchVideo(dataBase64) {
  const response = await apiClient.post('/admin/workbench-assets', { kind: 'bg', mediaType: 'video', dataBase64 }, { timeout: 180000 })
  return response.data?.assetUrl || ''
}

// 保存成功后顺手清理「不再被引用」的旧素材。失败无所谓（服务端还会拦一道），
// 所以静默吞掉错误，绝不让一次清理失败影响「已保存成功」这个结果。
export async function adminDeleteWorkbenchAsset(fileName) {
  if (!fileName) return false
  try {
    await apiClient.delete('/admin/workbench-assets', { data: { fileName } })
    return true
  } catch {
    return false
  }
}
