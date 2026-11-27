const densityOrder = ['light', 'medium', 'dense']

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((item) => String(item).toLowerCase()) : []
}

function overlapScore(expected, actual) {
  const left = list(expected)
  const right = list(actual)
  if (!left.length || !right.length) return 0
  return left.some((item) => right.includes(item)) ? 1 : 0
}

function densityScore(expected, actual) {
  const left = densityOrder.indexOf(expected || 'medium')
  const right = densityOrder.indexOf(actual || 'medium')
  if (left < 0 || right < 0) return 0
  return Math.max(0, 1 - Math.abs(left - right) / 2)
}

function includesKeyword(template, keywords = []) {
  const haystack = [
    template.name,
    template.description,
    ...(template.styleTags || []),
    ...(template.matchingKeywords || []),
  ].join(' ').toLowerCase()
  return list(keywords).filter((keyword) => haystack.includes(keyword)).length
}

export function scoreTemplate(template = {}, context = {}) {
  const pageTypes = context.pageTypes || []
  const imageCount = Number(context.imageCount || 0)
  const imageCapacity = Math.max(0, Number(template.imageCapacity ?? 1))
  const imageFit = imageCount === 0 ? 1 : Math.min(1, imageCapacity / imageCount)
  const pageFit = overlapScore(
    template.preferredLayouts?.length ? template.preferredLayouts : (template.suitablePages?.length ? template.suitablePages : template.enabledLayouts),
    pageTypes,
  )
  const courseFit = overlapScore(template.suitableCourses, [context.courseCategory, context.courseTitle])
  const ageFit = overlapScore(template.suitableAgeRanges, [context.ageRange, context.difficulty])
  const keywordHits = includesKeyword(template, context.keywords)
  const keywordFit = context.keywords?.length ? Math.min(1, keywordHits / Math.min(3, context.keywords.length)) : 0
  const densityFit = densityScore(template.textDensity, context.textDensity)
  const publishedFit = template.status === 'published' ? 1 : 0
  const authorizedFit = context.availableTemplateIds?.includes(template.id) ? 1 : 0
  const score = Math.round((
    pageFit * 28
    + courseFit * 18
    + ageFit * 12
    + keywordFit * 14
    + densityFit * 12
    + imageFit * 8
    + publishedFit * 4
    + authorizedFit * 4
  ) * 10) / 10
  const reasons = []
  if (pageFit) reasons.push('页面版式匹配')
  if (courseFit) reasons.push('课程类型匹配')
  if (ageFit) reasons.push('适用年龄匹配')
  if (keywordFit) reasons.push('风格关键词匹配')
  if (densityFit >= 0.75) reasons.push('文字密度合适')
  if (imageFit >= 0.75) reasons.push('图片容量合适')
  if (!reasons.length) reasons.push('作为当前可用模板的稳妥回退')
  return { score, reasons }
}

export function recommendTemplates(templates = [], context = {}, limit = 3) {
  return templates
    .filter((template) => template?.status === 'published')
    .map((template) => ({ template, ...scoreTemplate(template, context) }))
    .sort((left, right) => right.score - left.score || left.template.name.localeCompare(right.template.name, 'zh-CN'))
    .slice(0, limit)
}
