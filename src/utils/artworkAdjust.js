export const DEFAULT_ARTWORK_ADJUSTMENTS = Object.freeze({ brightness: 0, contrast: 0, saturation: 0, warmth: 0 })

export function normalizeArtworkAdjustments(input = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_ARTWORK_ADJUSTMENTS).map((key) => {
    const value = Number(input[key] ?? 0)
    if (!Number.isFinite(value) || value < -100 || value > 100) throw new Error('调整参数必须在 -100 到 100 之间')
    return [key, value]
  }))
}

// 前端预览与服务端保存共用逐像素计算，避免 CSS 滤镜与成品不一致。
export function applyArtworkAdjustments(pixels, input) {
  const { brightness, contrast, saturation, warmth } = normalizeArtworkAdjustments(input)
  const light = 1 + brightness / 100
  const contrastFactor = (1 + contrast / 100) ** 2
  const sat = 1 + saturation / 100
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
  for (let i = 0; i < pixels.length; i += 4) {
    let r = (pixels[i] * light - 127.5) * contrastFactor + 127.5
    let g = (pixels[i + 1] * light - 127.5) * contrastFactor + 127.5
    let b = (pixels[i + 2] * light - 127.5) * contrastFactor + 127.5
    const gray = .2126 * r + .7152 * g + .0722 * b
    r = gray + (r - gray) * sat + warmth * .22
    g = gray + (g - gray) * sat + warmth * .04
    b = gray + (b - gray) * sat - warmth * .22
    pixels[i] = clamp(r); pixels[i + 1] = clamp(g); pixels[i + 2] = clamp(b)
  }
  return pixels
}
