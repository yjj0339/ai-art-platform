import { ref } from 'vue'
import { apiClient } from '../services/apiClient'

/**
 * 手绘板素材：把手绘板存下来的稿子（服务端 document type=sketch / 本地缓存）
 * 统一转成「资源库素材」的形状，供 AI 绘画、AI 视频的参考图弹窗直接选用。
 *
 * 为什么单独抽出来：手绘稿不是项目（没有提示词、版本、报告），
 * 所以不进 projectStore；两个页面各自拼一份容易口径不一致，集中在这里。
 */

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
const LOCAL_STORAGE_KEY = 'ai-sketchpad-local-v1'

/** 从文档里取图片地址：服务端存的是 /api/assets/<id>，本地模式存的是 dataURL。 */
function resolveSketchPreview(document) {
  const direct = String(document?.data?.imageUrl || '').trim()
  if (direct) return direct
  const assetId = document?.data?.assetId || document?.resourceKey || ''
  return assetId ? `/api/assets/${encodeURIComponent(assetId)}` : ''
}

function toMaterial(document) {
  const preview = resolveSketchPreview(document)
  if (!preview) return null
  return {
    id: `sketch-${document.id}`,
    kind: 'sketch',
    source: '我的手绘稿',
    title: document.title || '未命名手绘稿',
    prompt: '参考这张手绘草稿的构图、线条和主体造型',
    category: '创意画',
    preview,
    cover: `url("${preview}") center / cover no-repeat`,
  }
}

function readLocalDocuments() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return (Array.isArray(list) ? list : []).map((item) => ({
      id: item.id,
      title: item.title,
      data: { imageUrl: item.imageUrl },
    }))
  } catch {
    return []
  }
}

export function useSketchMaterials() {
  const sketchMaterials = ref([])
  const sketchMaterialsLoading = ref(false)

  async function loadSketchMaterials() {
    sketchMaterialsLoading.value = true
    try {
      if (!SERVER_AUTH_MODE) {
        sketchMaterials.value = readLocalDocuments().map(toMaterial).filter(Boolean)
        return
      }
      const { data } = await apiClient.get('/me/documents', { params: { type: 'sketch' } })
      const documents = Array.isArray(data.documents) ? data.documents : []
      sketchMaterials.value = documents.map(toMaterial).filter(Boolean)
    } catch {
      // 取不到就当没有手绘稿，不要让整个参考图弹窗报错。
      sketchMaterials.value = []
    } finally {
      sketchMaterialsLoading.value = false
    }
  }

  return { sketchMaterials, sketchMaterialsLoading, loadSketchMaterials }
}
