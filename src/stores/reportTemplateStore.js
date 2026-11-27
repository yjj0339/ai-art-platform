import { defineStore } from 'pinia'

const STORAGE_KEY = 'art-studio-report-templates'
const ASSET_DB_NAME = 'art-studio-report-template-assets'
const ASSET_STORE_NAME = 'files'
const parseStatuses = ['none', 'parsing', 'parsed', 'failed', 'manual']

export const reportTemplateCategories = [
  { value: 'classroom', label: '课堂报告' },
  { value: 'portfolio', label: '作品展示' },
  { value: 'growth', label: '成长记录' },
  { value: 'brand', label: '品牌设计' },
]

export const reportRendererPresets = [
  { value: 'classroom', label: '清爽课堂', desc: '留白清晰，适合课堂和作品展示' },
  { value: 'portfolio', label: '作品集', desc: '突出大图与作品细节' },
  { value: 'growth', label: '成长记录', desc: '强调过程、修改和讲师评语' },
  { value: 'brand', label: '品牌设计', desc: '信息规整，适合商业设计课程' },
]

export const reportLayoutOptions = [
  { value: 'cover-hero', label: '封面' },
  { value: 'text-focus', label: '课程理解' },
  { value: 'before-after', label: '草图对比' },
  { value: 'timeline', label: '迭代过程' },
  { value: 'image-text', label: '作品展示' },
  { value: 'review-card', label: 'AI点评' },
  { value: 'comment', label: '讲师评语' },
  { value: 'back-cover', label: '封底' },
  { value: 'model-showcase', label: '3D展示' },
  { value: 'storyboard', label: '视频分镜' },
]

const allLayouts = reportLayoutOptions.map((item) => item.value)

const seedTemplates = [
  {
    id: 'classroom',
    name: '清爽课堂报告',
    description: '白底清爽，适合课堂和作品展示',
    category: 'classroom',
    rendererPreset: 'classroom',
    theme: { bg: 'F7FBFA', surface: 'FFFFFF', primary: '1F9D8A', secondary: '2563EB', accent: 'D9F99D', title: '12343B', text: '334155', muted: '64748B', soft: 'ECFDF5' },
    footerBrand: '美佳美画 AI 创意美术',
  },
  {
    id: 'portfolio',
    name: '作品集展示',
    description: '大图优先，适合高质量作品归档',
    category: 'portfolio',
    rendererPreset: 'portfolio',
    theme: { bg: 'F8FAFC', surface: 'FFFFFF', primary: '334155', secondary: '0F766E', accent: 'CBD5E1', title: '111827', text: '374151', muted: '6B7280', soft: 'F1F5F9' },
    footerBrand: '作品集展示',
  },
  {
    id: 'growth',
    name: '成长记录',
    description: '突出过程、修改和讲师评语',
    category: 'growth',
    rendererPreset: 'growth',
    theme: { bg: 'FFF7ED', surface: 'FFFFFF', primary: 'EA580C', secondary: '7C3AED', accent: 'FDBA74', title: '431407', text: '4B5563', muted: '78716C', soft: 'FFEDD5' },
    footerBrand: '成长记录报告',
  },
  {
    id: 'brand',
    name: '品牌设计课',
    description: '适合门头、包装、IP和广告设计',
    category: 'brand',
    rendererPreset: 'brand',
    theme: { bg: 'F5F3FF', surface: 'FFFFFF', primary: '4F46E5', secondary: '0891B2', accent: 'C4B5FD', title: '1E1B4B', text: '334155', muted: '64748B', soft: 'EEF2FF' },
    footerBrand: '品牌设计课项目报告',
  },
  {
    id: 'kids-art-show',
    name: '儿童艺术展',
    description: '明亮活泼、适合低龄段作品展示，画面更有展览感。',
    category: 'portfolio',
    rendererPreset: 'portfolio',
    theme: { bg: 'FFFBEB', surface: 'FFFFFF', primary: 'F59E0B', secondary: '14B8A6', accent: 'FDE68A', title: '7C2D12', text: '3F3F46', muted: '71717A', soft: 'FEF3C7' },
    footerBrand: '儿童艺术展作品报告',
    styleTags: ['儿童', '展览', '明亮'],
    suitableCourses: ['创意美术', '儿童画', '主题展'],
    suitableAgeRanges: ['4-9岁'],
    preferredLayouts: ['cover-hero', 'image-text', 'before-after', 'review-card', 'comment', 'back-cover'],
    matchingKeywords: ['儿童', '展览', '作品', '色彩'],
    textDensity: 'light',
    imageCapacity: 4,
  },
  {
    id: 'parent-briefing',
    name: '汇报简报',
    description: '重点突出、文案短，适合课后快速分享查看。',
    category: 'classroom',
    rendererPreset: 'classroom',
    theme: { bg: 'F8FAFC', surface: 'FFFFFF', primary: '0F766E', secondary: '2563EB', accent: '99F6E4', title: '134E4A', text: '334155', muted: '64748B', soft: 'CCFBF1' },
    footerBrand: '课后汇报',
    styleTags: ['简报', '清晰'],
    suitableCourses: ['日常课堂', '体验课', '短课'],
    suitableAgeRanges: ['5-12岁'],
    preferredLayouts: ['cover-hero', 'text-focus', 'before-after', 'image-text', 'comment', 'back-cover'],
    matchingKeywords: ['课后', '汇报', '体验课'],
    textDensity: 'light',
    imageCapacity: 2,
  },
  {
    id: 'ai-process',
    name: 'AI创作过程',
    description: '强调草图、提示词、迭代和最终成品，适合AI创意项目。',
    category: 'growth',
    rendererPreset: 'growth',
    theme: { bg: 'F0FDFA', surface: 'FFFFFF', primary: '0D9488', secondary: '7C3AED', accent: 'A7F3D0', title: '042F2E', text: '334155', muted: '64748B', soft: 'CCFBF1' },
    footerBrand: 'AI创作过程报告',
    styleTags: ['AI', '过程', '迭代'],
    suitableCourses: ['AI绘画', '创意美术', '数字艺术'],
    suitableAgeRanges: ['8-16岁'],
    preferredLayouts: ['cover-hero', 'before-after', 'timeline', 'image-text', 'storyboard', 'review-card', 'back-cover'],
    matchingKeywords: ['AI', '提示词', '迭代', '草图', '成品'],
    textDensity: 'medium',
    imageCapacity: 4,
  },
  {
    id: 'graduation-review',
    name: '结课成果册',
    description: '更正式的阶段成果呈现，适合结课、续班沟通和作品归档。',
    category: 'growth',
    rendererPreset: 'brand',
    theme: { bg: 'FDF2F8', surface: 'FFFFFF', primary: 'BE185D', secondary: '0F766E', accent: 'FBCFE8', title: '831843', text: '374151', muted: '6B7280', soft: 'FCE7F3' },
    footerBrand: '结课成果册',
    styleTags: ['结课', '成果', '正式'],
    suitableCourses: ['阶段结课', '作品归档', '续班沟通'],
    suitableAgeRanges: ['6-15岁'],
    preferredLayouts: ['cover-hero', 'text-focus', 'timeline', 'image-text', 'review-card', 'comment', 'back-cover'],
    matchingKeywords: ['结课', '成果', '续班', '阶段'],
    textDensity: 'medium',
    imageCapacity: 3,
  },
]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeHex(value, fallback) {
  const hex = String(value || '').replace('#', '').toUpperCase()
  return /^[0-9A-F]{6}$/.test(hex) ? hex : fallback
}

function normalizeParseStatus(value) {
  return parseStatuses.includes(value) ? value : 'none'
}

function normalizeDecorImages(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item?.src)
    .slice(0, 12)
    .map((item, index) => ({
      id: item.id || `decor-${index + 1}`,
      name: item.name || `装饰图${index + 1}`,
      src: item.src,
      placement: item.placement || ['top-right', 'bottom-left', 'bottom-right', 'top-left'][index] || 'bottom-right',
      kind: item.kind || item.decorKind || '',
      x: item.x == null ? null : Math.max(0, Math.min(0.98, Number(item.x))),
      y: item.y == null ? null : Math.max(0, Math.min(0.96, Number(item.y))),
      w: item.w == null ? null : Math.max(0.02, Math.min(0.94, Number(item.w))),
      h: item.h == null ? null : Math.max(0.02, Math.min(0.9, Number(item.h))),
      locked: Boolean(item.locked),
    }))
}

function normalizeTemplateSlots(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && Number(item.w) > 0 && Number(item.h) > 0)
    .slice(0, 12)
    .map((item, index) => ({
      id: item.id || `slot-${index + 1}`,
      type: ['title', 'subtitle', 'body', 'footer', 'image'].includes(item.type) ? item.type : 'body',
      x: Math.max(0, Math.min(1, Number(item.x || 0))),
      y: Math.max(0, Math.min(1, Number(item.y || 0))),
      w: Math.max(0.02, Math.min(1, Number(item.w || 0.1))),
      h: Math.max(0.02, Math.min(1, Number(item.h || 0.1))),
      source: item.source || 'template',
      refId: item.refId || '',
      sampleText: item.sampleText || '',
      fontFamily: item.fontFamily || 'Microsoft YaHei',
      fontSize: Math.max(8, Math.min(72, Number(item.fontSize || (item.type === 'title' ? 34 : 15)))),
      fontWeight: Math.max(400, Math.min(900, Number(item.fontWeight || (item.type === 'title' ? 900 : 400)))),
      textAlign: ['left', 'center', 'right'].includes(item.textAlign) ? item.textAlign : item.type === 'title' ? 'center' : 'left',
      lineHeight: Math.max(0.8, Math.min(3, Number(item.lineHeight || (item.type === 'title' ? 1.12 : 1.45)))),
      italic: Boolean(item.italic),
      underline: Boolean(item.underline),
      maxLines: Math.max(1, Math.min(12, Number(item.maxLines || (item.type === 'title' ? 2 : 5)))),
      color: normalizeHex(item.color, '334155'),
      fill: normalizeHex(item.fill, item.type === 'image' ? 'E2E8F0' : 'FFFFFF'),
      radius: Math.max(0, Math.min(0.5, Number(item.radius ?? 0.04))),
      locked: Boolean(item.locked),
      imageSrc: item.imageSrc || '',
      imageFileName: item.imageFileName || '',
      imageAspectRatio: Number(item.imageAspectRatio || 0),
      imageFit: ['cover', 'contain', 'fill'].includes(item.imageFit) ? item.imageFit : 'cover',
    }))
}

function normalizeTemplatePages(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && (item.backgroundImage || Array.isArray(item.decorImages) || Array.isArray(item.slots)))
    .slice(0, 12)
    .map((item, index) => {
      const rawSlots = Array.isArray(item.slots) ? item.slots : []
      const decorSlots = rawSlots
        .filter((slot) => slot?.type === 'decor' && (slot.imageSrc || slot.src))
        .map((slot) => ({
          id: slot.id,
          name: slot.decorName || slot.name,
          src: slot.imageSrc || slot.src,
          kind: slot.decorKind || slot.kind,
          x: slot.x,
          y: slot.y,
          w: slot.w,
          h: slot.h,
          locked: slot.locked,
        }))
      return {
        id: item.id || `template-page-${index + 1}`,
        sourceIndex: Number(item.sourceIndex || index + 1),
        title: item.title || `模板页 ${index + 1}`,
        role: item.role || 'content',
        layout: item.layout || 'text-focus',
        backgroundImage: item.backgroundImage || '',
        backgroundLocked: Boolean(item.backgroundLocked),
        backgroundFit: ['cover', 'contain', 'fill'].includes(item.backgroundFit) ? item.backgroundFit : 'cover',
        decorImages: normalizeDecorImages(decorSlots.length ? decorSlots : (item.decorImages || [])),
        decorInitialized: Boolean(item.decorInitialized || decorSlots.length || item.decorImages?.length),
        slotProfile: item.slotProfile || 'text',
        slots: normalizeTemplateSlots(rawSlots.filter((slot) => slot?.type !== 'decor')),
        textRunCount: Number(item.textRunCount || 0),
        imageCount: Number(item.imageCount || 0),
        shapeCount: Number(item.shapeCount || 0),
      }
    })
}

function normalizeTemplate(template = {}, index = 0) {
  const seed = seedTemplates.find((item) => item.id === template.id) || seedTemplates[0]
  const sourceTheme = { ...seed.theme, ...(template.theme || {}) }
  const now = new Date().toISOString()
  return {
    id: template.id || `report-template-${Date.now()}-${index}`,
    name: template.name || '未命名PPT模板',
    description: template.description || '',
    category: template.category || 'classroom',
    rendererPreset: template.rendererPreset || template.category || 'classroom',
    status: template.status || 'published',
    builtIn: Boolean(template.builtIn ?? seedTemplates.some((item) => item.id === template.id)),
    previewImage: template.previewImage || '',
    backgroundImage: template.backgroundImage || '',
    decorImages: normalizeDecorImages(template.decorImages),
    templatePages: normalizeTemplatePages(template.templatePages),
    assetMode: template.assetMode || 'structured-assets',
    sourceFileName: template.sourceFileName || '',
    sourceFileSize: Number(template.sourceFileSize || 0),
    sourceUpdatedAt: template.sourceUpdatedAt || '',
    parseStatus: normalizeParseStatus(template.parseStatus),
    parseMessage: template.parseMessage || '',
    importMeta: template.importMeta && typeof template.importMeta === 'object' ? { ...template.importMeta } : null,
    fontFamily: template.fontFamily || 'Microsoft YaHei',
    footerBrand: template.footerBrand || seed.footerBrand,
    styleTags: Array.isArray(template.styleTags) ? [...new Set(template.styleTags.filter(Boolean))] : [],
    suitableCourses: Array.isArray(template.suitableCourses) ? [...new Set(template.suitableCourses.filter(Boolean))] : [],
    suitableAgeRanges: Array.isArray(template.suitableAgeRanges) ? [...new Set(template.suitableAgeRanges.filter(Boolean))] : [],
    suitablePages: Array.isArray(template.suitablePages) && template.suitablePages.length ? [...new Set(template.suitablePages)] : [],
    textDensity: ['light', 'medium', 'dense'].includes(template.textDensity) ? template.textDensity : 'medium',
    imageCapacity: Math.max(0, Math.min(6, Number(template.imageCapacity ?? 1))),
    overflowPolicy: ['shrink-then-split', 'shrink-only', 'split-first'].includes(template.overflowPolicy)
      ? template.overflowPolicy
      : 'shrink-then-split',
    preferredLayouts: Array.isArray(template.preferredLayouts) ? [...new Set(template.preferredLayouts)] : [],
    matchingKeywords: Array.isArray(template.matchingKeywords) ? [...new Set(template.matchingKeywords.filter(Boolean))] : [],
    theme: {
      bg: normalizeHex(sourceTheme.bg, seed.theme.bg),
      surface: normalizeHex(sourceTheme.surface, seed.theme.surface),
      primary: normalizeHex(sourceTheme.primary, seed.theme.primary),
      secondary: normalizeHex(sourceTheme.secondary, seed.theme.secondary),
      accent: normalizeHex(sourceTheme.accent, seed.theme.accent),
      title: normalizeHex(sourceTheme.title, seed.theme.title),
      text: normalizeHex(sourceTheme.text, seed.theme.text),
      muted: normalizeHex(sourceTheme.muted, seed.theme.muted),
      soft: normalizeHex(sourceTheme.soft, seed.theme.soft),
    },
    enabledLayouts: Array.isArray(template.enabledLayouts) && template.enabledLayouts.length
      ? [...new Set(template.enabledLayouts)]
      : [...allLayouts],
    visibility: template.visibility === 'restricted' ? 'restricted' : 'public',
    authorizedGroupIds: Array.isArray(template.authorizedGroupIds) ? [...new Set(template.authorizedGroupIds)] : [],
    authorizedClasses: Array.isArray(template.authorizedClasses) ? [...new Set(template.authorizedClasses)] : [],
    createdBy: template.createdBy || '管理员',
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || now,
  }
}

function readTemplates() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return seedTemplates.map((item) => normalizeTemplate({ ...item, builtIn: true }))
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) throw new Error('empty template list')
    const normalized = parsed.map(normalizeTemplate)
    const existingIds = new Set(normalized.map((item) => item.id))
    const missingBuiltIns = seedTemplates
      .filter((item) => !existingIds.has(item.id))
      .map((item) => normalizeTemplate({ ...item, builtIn: true }))
    return [...missingBuiltIns, ...normalized]
  } catch {
    return seedTemplates.map((item) => normalizeTemplate({ ...item, builtIn: true }))
  }
}

function openAssetDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持本地文件存储'))
      return
    }
    const request = indexedDB.open(ASSET_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'templateId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('模板文件数据库打开失败'))
  })
}

export async function saveTemplateSourceFile(templateId, file) {
  const db = await openAssetDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, 'readwrite')
    transaction.objectStore(ASSET_STORE_NAME).put({
      templateId,
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      updatedAt: new Date().toISOString(),
    })
    transaction.oncomplete = () => { db.close(); resolve(true) }
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('模板源文件保存失败')) }
  })
}

export async function getTemplateSourceFile(templateId) {
  const db = await openAssetDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, 'readonly')
    const request = transaction.objectStore(ASSET_STORE_NAME).get(templateId)
    request.onsuccess = () => { db.close(); resolve(request.result || null) }
    request.onerror = () => { db.close(); reject(request.error || new Error('模板源文件读取失败')) }
  })
}

export async function deleteTemplateSourceFile(templateId) {
  const db = await openAssetDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, 'readwrite')
    transaction.objectStore(ASSET_STORE_NAME).delete(templateId)
    transaction.oncomplete = () => { db.close(); resolve(true) }
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('模板源文件删除失败')) }
  })
}

export const useReportTemplateStore = defineStore('reportTemplate', {
  state: () => ({
    templates: readTemplates(),
  }),
  getters: {
    byId: (state) => (id) => state.templates.find((item) => item.id === id),
    published: (state) => state.templates.filter((item) => item.status === 'published'),
    visibleFor: (state) => (user, groupIds = [], classNames = []) => {
      if (user?.role === 'admin') return state.templates
      const groupSet = new Set(groupIds)
      const classSet = new Set(classNames.filter(Boolean))
      return state.templates.filter((template) => {
        if (template.status !== 'published') return false
        if (template.visibility === 'public') return true
        return template.authorizedGroupIds.some((id) => groupSet.has(id))
          || template.authorizedClasses.some((name) => classSet.has(name))
      })
    },
  },
  actions: {
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.templates))
      } catch (error) {
        const storageError = new Error('模板图片数据过多，本机存储空间不足。请减少页面图片或压缩素材后再保存。')
        storageError.cause = error
        throw storageError
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('report-template-store-updated'))
      }
    },
    reloadFromStorage() {
      this.templates = readTemplates()
    },
    createTemplate(payload = {}) {
      const template = normalizeTemplate({
        ...payload,
        id: payload.id || `report-template-${Date.now()}`,
        builtIn: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      this.templates.unshift(template)
      try {
        this.persist()
      } catch (error) {
        this.templates.shift()
        throw error
      }
      return template
    },
    updateTemplate(id, patch = {}) {
      const index = this.templates.findIndex((item) => item.id === id)
      if (index < 0) return null
      const previous = this.templates[index]
      const template = normalizeTemplate({ ...this.templates[index], ...patch, id, updatedAt: new Date().toISOString() })
      this.templates.splice(index, 1, template)
      try {
        this.persist()
      } catch (error) {
        this.templates.splice(index, 1, previous)
        throw error
      }
      return template
    },
    duplicateTemplate(id, ownerName = '管理员') {
      const source = this.templates.find((item) => item.id === id)
      if (!source) return null
      return this.createTemplate({
        ...clone(source),
        id: `report-template-${Date.now()}`,
        name: `${source.name} 副本`,
        builtIn: false,
        status: 'draft',
        sourceFileName: '',
        sourceFileSize: 0,
        createdBy: ownerName,
      })
    },
    canDelete(id) {
      const target = this.templates.find((item) => item.id === id)
      if (!target) return false
      const remainingPublic = this.templates.filter((item) => item.id !== id && item.status === 'published' && item.visibility === 'public')
      return target.status !== 'published' || target.visibility !== 'public' || remainingPublic.length > 0
    },
    deleteTemplate(id) {
      if (!this.canDelete(id)) return false
      const before = this.templates.length
      this.templates = this.templates.filter((item) => item.id !== id)
      if (this.templates.length === before) return false
      this.persist()
      return true
    },
  },
})
