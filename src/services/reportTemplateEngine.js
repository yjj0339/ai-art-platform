const supportedSlotTypes = ['title', 'subtitle', 'body', 'footer', 'image']
const supportedLayouts = ['cover-hero', 'text-focus', 'before-after', 'timeline', 'image-text', 'review-card', 'comment', 'back-cover', 'model-showcase', 'storyboard']

function asText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim()
}

function asNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function asHex(value, fallback = '') {
  const hex = String(value || '').replace('#', '').toUpperCase()
  return /^[0-9A-F]{6}$/.test(hex) ? hex : fallback
}

function normalizeSlot(slot = {}, index = 0) {
  const type = supportedSlotTypes.includes(slot.type) ? slot.type : 'body'
  const w = Math.max(0.06, Math.min(0.9, asNumber(slot.w, type === 'image' ? 0.32 : 0.4)))
  const h = Math.max(0.06, Math.min(0.82, asNumber(slot.h, type === 'image' ? 0.3 : 0.14)))
  return {
    id: asText(slot.id, `agent-slot-${index + 1}`),
    type,
    x: Math.max(0.03, Math.min(0.97 - w, asNumber(slot.x, 0.08))),
    y: Math.max(0.06, Math.min(0.94 - h, asNumber(slot.y, 0.1 + index * 0.12))),
    w,
    h,
    maxChars: Math.max(12, Math.min(180, asNumber(slot.maxChars, type === 'title' ? 32 : 100))),
    variant: supportedLayouts.includes(slot.variant) ? slot.variant : '',
    source: asText(slot.source, 'deepseek-layout'),
    sampleText: String(slot.sampleText || ''),
    fontFamily: asText(slot.fontFamily, ''),
    fontSize: slot.fontSize ? Math.max(8, Math.min(72, asNumber(slot.fontSize, 15))) : 0,
    fontWeight: slot.fontWeight ? Math.max(400, Math.min(900, asNumber(slot.fontWeight, 400))) : 0,
    textAlign: ['left', 'center', 'right'].includes(slot.textAlign) ? slot.textAlign : '',
    lineHeight: slot.lineHeight ? Math.max(0.8, Math.min(3, asNumber(slot.lineHeight, 1.45))) : 0,
    italic: Boolean(slot.italic),
    underline: Boolean(slot.underline),
    maxLines: Math.max(1, Math.min(12, asNumber(slot.maxLines, type === 'title' ? 2 : 5))),
    color: asHex(slot.color),
    fill: asHex(slot.fill),
    imageSrc: String(slot.imageSrc || ''),
    imageFit: ['cover', 'contain', 'fill'].includes(slot.imageFit) ? slot.imageFit : 'cover',
  }
}

export function normalizeStructuredReportPage(page = {}, fallback = {}, index = 0) {
  const layout = supportedLayouts.includes(page.layout) ? page.layout : fallback.layout || 'text-focus'
  const rawSlots = Array.isArray(page.layoutPlan?.slots) ? page.layoutPlan.slots : Array.isArray(page.slots) ? page.slots : []
  return {
    ...fallback,
    ...page,
    id: asText(page.id, fallback.id || `page-${index + 1}`),
    type: asText(page.type, fallback.type || layout),
    title: asText(page.title, fallback.title || '项目报告'),
    subtitle: asText(page.subtitle, fallback.subtitle || page.title || '报告页面'),
    body: asText(page.body, fallback.body || ''),
    layout,
    layoutPlan: {
      source: asText(page.layoutPlan?.source, rawSlots.length ? 'deepseek' : 'local'),
      engine: 'local-template-engine',
      slots: rawSlots.map(normalizeSlot).slice(0, 12),
      warnings: Array.isArray(page.layoutPlan?.warnings) ? page.layoutPlan.warnings.filter(Boolean).map(String) : [],
    },
  }
}

function rect(slot = {}) {
  return {
    x: asNumber(slot.x, 0),
    y: asNumber(slot.y, 0),
    w: asNumber(slot.w, 0),
    h: asNumber(slot.h, 0),
  }
}

function overlaps(left, right, gap = 0.008) {
  const a = rect(left)
  const b = rect(right)
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y
}

export function resolveLocalTemplateSlots(page = {}, fallbackSlots = []) {
  const agentSlots = Array.isArray(page.layoutPlan?.slots) ? page.layoutPlan.slots : []
  const source = agentSlots.length >= 2 ? agentSlots : fallbackSlots
  const normalized = source.map(normalizeSlot)
  const safe = []
  normalized.forEach((slot) => {
    let next = { ...slot }
    for (let attempt = 0; attempt < 4 && safe.some((item) => overlaps(item, next)); attempt += 1) {
      next = {
        ...next,
        y: Math.max(0.06, Math.min(0.94 - next.h, next.y + 0.045)),
        h: Math.max(0.06, next.h - 0.018),
      }
    }
    safe.push(next)
  })
  return safe
}

export function validateReportBeforeExport({ pages = [], template = null } = {}) {
  const warnings = []
  if (!template?.id) warnings.push('未选择可用PPT模板')
  if (!Array.isArray(pages) || !pages.length) warnings.push('没有可导出的报告页面')

  pages.forEach((page, pageIndex) => {
    const label = `第${pageIndex + 1}页`
    if (!asText(page.title) && !asText(page.subtitle)) warnings.push(`${label}缺少标题`)
    if (!supportedLayouts.includes(page.layout)) warnings.push(`${label}版式不在本地模板引擎支持范围内`)
    if (asText(page.subtitle).length > 42) warnings.push(`${label}副标题偏长，导出时会自动压缩字号`)
    if (asText(page.body).length > 180) warnings.push(`${label}正文偏长，建议拆页或改短`)

    const slots = Array.isArray(page.layoutPlan?.slots) ? page.layoutPlan.slots.map(normalizeSlot) : []
    slots.forEach((slot, slotIndex) => {
      if (slot.x + slot.w > 0.98 || slot.y + slot.h > 0.96) warnings.push(`${label}第${slotIndex + 1}个占位框超出安全区，已交给本地模板引擎修正`)
      if (slots.slice(slotIndex + 1).some((next) => overlaps(slot, next))) warnings.push(`${label}存在占位框重叠，已交给本地模板引擎避让`)
    })
  })

  return {
    ok: !warnings.some((item) => item.includes('未选择') || item.includes('没有可导出')),
    warnings: [...new Set(warnings)],
  }
}
