import { apiClient } from './apiClient'
import { generateArtwork } from './aiGateway'

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
/**
 * 演示模式（没有后端）下，作品存本地。
 * key 沿用老手绘板的 `ai-sketchpad-local-v1`：老页面已经删了，
 * 但「我的作品 → 手绘稿」和 AI 绘画的参考图弹窗还在读这个 key，
 * 换新 key 会让演示模式下刚画的稿子在那两处看不见。
 */
const LOCAL_STORAGE_KEY = 'ai-sketchpad-local-v1'
const LOCAL_ITEM_LIMIT = 8

/**
 * 右侧风格芯片。prompt 是追加在用户输入后面的「画风说明书」，
 * 用户只写「小屋、黄昏、有雾」也能出对味的结果。
 */
export const STYLE_PRESETS = [
  { id: 'watercolor', label: '水彩绘本', style: '水彩绘本插画', prompt: '水彩绘本插画风格，柔和的水痕边缘，浅色叠加，纸张纹理清晰' },
  { id: 'guofeng', label: '国风线描', style: '国风线描', prompt: '国风线描插画风格，细硬墨线勾轮廓，留白多，只用少量淡彩点染' },
  { id: 'oil', label: '厚涂油画', style: '厚涂油画', prompt: '厚涂油画风格，笔触明显，颜色饱和厚重，暖光' },
  { id: 'toon3d', label: '3D 卡通', style: '3D 卡通', prompt: '3D 卡通渲染风格，圆润造型，柔和打光，干净的背景' },
  { id: 'clay', label: '黏土质感', style: '黏土质感', prompt: '黏土手作质感，表面有手指压痕，颜色柔和，微距景深' },
  { id: 'collage', label: '布贴拼画', style: '布贴拼画', prompt: '布料拼贴画风格，不同花色的碎布拼接，边缘有缝线' },
]

/** 画纸比例 480×600 = 4:5，出图接口里最接近的是 3:4。 */
const IMAGE_RATIO = '3:4'

/**
 * 画板底部「模型」选择器要用的模型清单。
 *
 * 不在这里写死模型名：后台「AI 平台」页配了哪些平台、每个平台开了哪些图像模型，
 * /ai/health 已经整理成 providers[平台].imageModels 了。画板只挑「配了 Key 且真的有图像模型」
 * 的那些，免得后台换模型后前端还举着个不存在的名字，出图直接报「模型未启用」。
 */
export async function loadArtworkModels() {
  const response = await apiClient.get('/ai/health')
  const providers = response?.data?.providers || {}
  const list = []
  Object.entries(providers).forEach(([key, item]) => {
    if (!item?.configured) return
    const models = Array.isArray(item.imageModels) && item.imageModels.length
      ? item.imageModels
      : (item.imageModel ? [item.imageModel] : [])
    models.forEach((model) => {
      const name = String(model || '').trim()
      if (!name) return
      const id = `${key}::${name}`
      if (list.some((entry) => entry.id === id)) return
      list.push({ id, model: name, label: item.modelLabels?.[name] || name, provider: key, providerLabel: item.label || key })
    })
  })
  return list
}

function readLocalArtworks() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/**
 * 保存成品：和手绘板走同一条链路（先存素材，再登记一条 sketch 文档），
 * 所以画完的作品会直接出现在「我的作品 → 手绘稿」。
 */
export async function saveArtwork({ title, dataUrl, width, height }) {
  const name = String(title || '').trim().slice(0, 30) || '我的创作'
  if (SERVER_AUTH_MODE) {
    const { data } = await apiClient.post('/me/assets', {
      kind: 'sketch',
      originalName: `${name}.png`,
      mimeType: 'image/png',
      base64: dataUrl,
    })
    const assetId = data.asset?.id
    if (!assetId) throw new Error('服务端没有返回素材编号')
    const imageUrl = `/api/assets/${encodeURIComponent(assetId)}`
    await apiClient.post('/me/documents', {
      type: 'sketch',
      resourceKey: assetId,
      title: name,
      data: { assetId, imageUrl, width, height },
    })
    return { id: assetId, imageUrl, title: name }
  }
  const item = { id: `local-paint-${Date.now()}`, createdAt: new Date().toISOString(), title: name, imageUrl: dataUrl, width, height }
  const list = readLocalArtworks()
  list.unshift(item)
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list.slice(0, LOCAL_ITEM_LIMIT)))
  return item
}

/**
 * 把 AI 出图结果变成「可以安全画进画布」的地址。
 *
 * 跨域图片即使显示出来，一旦 drawImage 进 canvas，整张画布就会被标记为已污染，
 * 后面导出 PNG 会直接抛 SecurityError。所以：
 * - data URL：本身就是同源数据，直接用；
 * - https 图片：交给服务端转存成站内素材，换回 /api/assets/<id> 这种同源地址。
 */
export async function toCanvasSafeImageUrl(source) {
  const value = String(source || '').trim()
  if (!value) throw new Error('这张图还没有地址，先重新生成一次')
  if (/^data:image\//i.test(value)) return value
  if (!/^https?:\/\//i.test(value)) return value
  if (!SERVER_AUTH_MODE) return value
  const { data } = await apiClient.post('/me/assets/from-url', {
    url: value,
    kind: 'ai-artwork',
    originalName: `ai-artwork-${Date.now()}.png`,
  })
  const imageUrl = data?.imageUrl
  if (!imageUrl) throw new Error('转存 AI 图片失败，请重试')
  return imageUrl
}

/**
 * 出图：count 张候选。结果形状 [{ id, imageUrl, prompt, ... }]
 * strengthHint 是「参考强度」的提示词片段：模型没有 img2img 的 strength 参数，
 * 只能靠这句话告诉它「照抄构图」还是「大胆重画」，所以必须拼在用户提示词之后、画风之前。
 */
export async function requestArtwork({
  prompt,
  styleId,
  count = 4,
  referenceDataUrl = '',
  difficulty = 'pro',
  strengthHint = '',
  model = '',
  provider = '',
}) {
  const preset = STYLE_PRESETS.find((item) => item.id === styleId) || STYLE_PRESETS[0]
  const userPrompt = String(prompt || '').trim()
  const hint = String(strengthHint || '').trim()
  const finalPrompt = (userPrompt || hint)
    ? [userPrompt, hint, `画风要求：${preset.prompt}`].filter(Boolean).join('。')
    : preset.prompt
  const reference = String(referenceDataUrl || '').trim()
  const response = await generateArtwork({
    prompt: finalPrompt,
    difficulty,
    style: preset.style,
    count,
    ratio: IMAGE_RATIO,
    quality: 'standard',
    images: reference ? [reference] : [],
    // 用户在底部选了哪个模型就发哪个；留空则服务端退回「该平台第一个可用模型」。
    model,
    provider,
  })
  return Array.isArray(response?.results) ? response.results : []
}
