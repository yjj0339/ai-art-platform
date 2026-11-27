/**
 * 参考图数据整形。
 *
 * 绘画页的参考图结构是 { id, name, preview, ... }，缩略图读的是 item.preview。
 * 历史上有几处入口（素材库「导入参考图」、重新编辑等）只塞了一个字符串或一个
 * CSS background（`url("...") center / cover`），于是 item.preview 取不到值，
 * 缩略图就成了破图。这里统一把各种写法收敛成标准对象。
 */

const CSS_URL_PATTERN = /url\(["']?([^"')]+)["']?\)/

/** 从 data URI / http / 相对路径 / CSS background 里取出真正能塞进 <img src> 的地址。 */
export function extractImageUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('http') || raw.startsWith('/')) return raw
  return raw.match(CSS_URL_PATTERN)?.[1] || ''
}

/**
 * 把任意形态的图片输入收敛成参考图对象。
 * @param {string|object} input 图片地址、CSS background 或已有参考图对象
 * @param {{ fallbackName?: string, source?: string, index?: number }} options
 * @returns {object|null} 拿不到可用图片时返回 null（渐变占位封面就属于这种）
 */
export function toReferenceImage(input, { fallbackName = '参考图', source = 'portfolio', index = 0 } = {}) {
  if (!input) return null
  if (typeof input === 'string') {
    const preview = extractImageUrl(input)
    if (!preview) return null
    return {
      id: `ref-restored-${index}`,
      name: fallbackName,
      source,
      preview,
      edited: false,
      createdAt: new Date().toISOString(),
    }
  }
  const preview = extractImageUrl(
    input.preview || input.imageUrl || input.url || input.cover || input.background,
  )
  if (!preview) return null
  // 保留原有附加字段（裁剪、蒙版等），只补齐标准字段，避免覆盖掉编辑信息。
  return {
    ...input,
    id: input.id || `ref-restored-${index}`,
    name: input.name || input.title || fallbackName,
    source: input.source || source,
    preview,
    edited: Boolean(input.edited),
    createdAt: input.createdAt || new Date().toISOString(),
  }
}

/** 批量整形，过滤掉拿不到图片的条目。 */
export function normalizeReferenceImages(list, options = {}) {
  if (!Array.isArray(list)) return []
  return list
    .map((item, index) => toReferenceImage(item, { ...options, index }))
    .filter(Boolean)
}
