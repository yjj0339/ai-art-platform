export const galleryDefaultRules = Object.freeze({
  aiAudit: false, autoSelect: false, autoPublish: false,
  provider: '', model: '', customAudit: false, auditRequirements: '',
  customSelection: false, selectionRequirements: '', privacyCheck: true, duplicateCheck: false,
  qualityThreshold: 85, dailyLimit: 100, dailyBudget: 0, requestCostCeiling: 0,
})

export const galleryDefaultAuditPrompt = '适合儿童与青少年公开浏览。拒绝色情、仇恨、严重暴力和明显不适宜内容；不得公开真实联系方式、住址、学号或可识别未成年人的敏感信息。不确定的内容必须交人工复核。'
export const galleryDefaultSelectionPrompt = '结合用户年龄和课程主题，评价创意表达、主题契合、画面完成度。优先选择有想象力、有个人表达的作品，不以精细程度作为唯一标准。'

export const galleryStatusLabels = {
  legacy: '旧规则待复核', queued: '排队审核', running: 'AI 审核中', review: '待人工复核',
  pending: '待审核', waiting_budget: '等待额度', published: '已上架', rejected: '审核驳回',
  not_selected: '暂未入选', offline: '已下架', withdrawn: '已撤回', stale: '作品已更新', error: '审核异常',
}

const galleryCoverImagePattern = /^(data:image\/|https?:\/\/|\/api\/|\/assets\/)/

// 封面有「真图片」和「纯色/渐变占位」两种。瀑布流要靠 <img> 让浏览器按真实画幅撑开高度，
// 所以必须先分清是哪种：渐变没法当 <img> 的 src，只能退回固定比例的色块。
export function galleryCoverKind(value) {
  return galleryCoverImagePattern.test(String(value || '')) ? 'image' : 'paint'
}

export function galleryCoverStyle(value) {
  const text = String(value || '')
  if (galleryCoverImagePattern.test(text)) return { backgroundImage: `url(${JSON.stringify(text)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  return { background: text }
}

export function validateGalleryRules(value = {}) {
  const rules = { ...galleryDefaultRules }
  const fail = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }) }
  for (const key of ['aiAudit', 'autoSelect', 'autoPublish', 'customAudit', 'customSelection', 'privacyCheck', 'duplicateCheck']) {
    if (typeof value[key] !== 'boolean') fail('审核开关格式不正确。')
    rules[key] = value[key]
  }
  for (const key of ['provider', 'model', 'auditRequirements', 'selectionRequirements']) {
    if (typeof value[key] !== 'string' || value[key].length > (key.endsWith('Requirements') ? 2000 : 160)) fail('模型或自定义要求格式不正确，要求最多 2000 字。')
    rules[key] = value[key].trim()
  }
  for (const [key, min, max, integer] of [['qualityThreshold', 0, 100, true], ['dailyLimit', 1, 1000, true], ['dailyBudget', 0, 10000, false], ['requestCostCeiling', 0, 100, false]]) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max || (integer && !Number.isInteger(value[key]))) fail('评分、每日额度或预算超出允许范围。')
    rules[key] = value[key]
  }
  if (rules.customAudit && !rules.auditRequirements) fail('请填写自定义审核要求，或关闭对应开关。')
  if (rules.customSelection && !rules.selectionRequirements) fail('请填写优秀作品标准，或关闭对应开关。')
  if (rules.aiAudit && (!rules.provider || !rules.model)) fail('请先选择审核模型。')
  if (rules.aiAudit && (!rules.dailyBudget || !rules.requestCostCeiling || rules.requestCostCeiling > rules.dailyBudget)) fail('请设置已确认价格的单次费用上限与每日预算。')
  return rules
}
