function ratioValue(value) {
  const [width, height] = String(value || '').split(':').map(Number)
  return width > 0 && height > 0 ? width / height : 1
}

function closestRatio(aspectRatio, candidates, fallback) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return fallback
  return candidates.reduce((best, current) => (
    Math.abs(ratioValue(current) - aspectRatio) < Math.abs(ratioValue(best) - aspectRatio) ? current : best
  ), fallback)
}

function ratioFromPrompt(prompt, candidates, fallback) {
  const text = String(prompt || '')
  if (/电影|全景|横幅|超宽/.test(text) && candidates.includes('21:9')) return '21:9'
  if (/竖屏|海报|手机屏|短视频/.test(text) && candidates.includes('9:16')) return '9:16'
  if (/人物|肖像|半身|全身/.test(text) && candidates.includes('3:4')) return '3:4'
  if (/风景|场景|室内|建筑|横向|长卷/.test(text) && candidates.includes('16:9')) return '16:9'
  if (/图标|徽章|头像|产品|标志/.test(text) && candidates.includes('1:1')) return '1:1'
  return fallback
}

function imageAspectRatio(source) {
  if (!source || typeof Image === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : null)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

// “智能”在图生模式优先保持原图构图比例；文生模式根据提示词选择更适合的预设画幅。
export async function resolveSmartRatio({ referenceImages = [], prompt = '', candidates = [], fallback = '1:1' } = {}) {
  const available = candidates.filter(Boolean)
  const defaultRatio = available.includes(fallback) ? fallback : available[0] || fallback
  const firstReference = referenceImages.find(Boolean)
  if (firstReference) {
    const aspectRatio = await imageAspectRatio(firstReference)
    if (aspectRatio) return closestRatio(aspectRatio, available, defaultRatio)
  }
  return ratioFromPrompt(prompt, available, defaultRatio)
}
