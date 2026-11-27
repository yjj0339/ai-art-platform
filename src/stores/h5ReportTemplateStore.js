import { defineStore } from 'pinia'
import { productDesignStoryTemplate } from '../utils/productDesignStory'
import { normalizeH5Design } from '../utils/h5Layout.js'

const STORAGE_KEY = 'art-studio-h5-report-templates'

export const h5ReportLayouts = [
  { value: 'kids-classroom', label: '童趣课堂风', desc: '明亮、贴纸感、适合低龄创意美术报告' },
  { value: 'art-gallery', label: '艺术展览风', desc: '大图画廊、留白充足、突出最终作品' },
  { value: 'growth-file', label: '成长档案风', desc: '时间线记录草图、迭代和课堂表现' },
  { value: 'ai-tech', label: 'AI 科技风', desc: '数字艺术感，适合 AI 绘画、3D 和视频作品' },
  { value: 'product-design-story', label: '产品设计故事', desc: '高级版用户第一人称讲述产品灵感、草图、AI方案与3D过程' },
]

export const h5ReportModules = [
  { key: 'inspiration', label: '我的灵感从哪里来' },
  { key: 'problem', label: '我想解决的问题' },
  { key: 'sketch', label: '我画下第一版想法' },
  { key: 'ai', label: '我和AI一起试方案' },
  { key: 'model', label: '我把它做成立体的' },
  { key: 'scene', label: '我想象它真正被使用' },
  { key: 'reflection', label: '这是我的收获' },
  { key: 'cover', label: '封面' },
  { key: 'course', label: '课程主题' },
  { key: 'idea', label: '用户创意想法' },
  { key: 'process', label: '草图/创作过程' },
  { key: 'aiPrompt', label: '我的 AI 提示词' },
  { key: 'aiProcess', label: 'AI 生成过程' },
  { key: 'finalWork', label: '最终作品展示' },
  { key: 'aiReview', label: 'AI 点评' },
  { key: 'teacherComment', label: '讲师评语/成长证书' },
  { key: 'backCover', label: '我的项目收获' },
]

const seedTemplates = [
  productDesignStoryTemplate(),
  {
    id: 'h5-kids-classroom',
    name: '童趣课堂报告',
    layout: 'kids-classroom',
    description: '适合低龄儿童创意美术、涂鸦和课堂展示。',
    status: 'published',
    theme: { primary: '#f97316', secondary: '#14b8a6', accent: '#facc15', background: '#fff7ed', surface: '#ffffff', text: '#334155' },
    fontFamily: 'Microsoft YaHei',
    coverImage: '/assets/h5-report/kids-classroom.png',
    decorImages: [],
    moduleOrder: h5ReportModules.map((item) => item.key),
    hiddenModules: [],
    officialButtonText: '进入官网',
    officialUrl: 'https://example.com',
    builtIn: true,
  },
  {
    id: 'h5-art-gallery',
    name: '艺术展览报告',
    layout: 'art-gallery',
    description: '适合正式作品展示和对外分享。',
    status: 'published',
    theme: { primary: '#111827', secondary: '#0f766e', accent: '#cbd5e1', background: '#f8fafc', surface: '#ffffff', text: '#374151' },
    fontFamily: 'Microsoft YaHei',
    coverImage: '/assets/h5-report/art-gallery.png',
    decorImages: [],
    moduleOrder: h5ReportModules.map((item) => item.key),
    hiddenModules: [],
    officialButtonText: '进入官网',
    officialUrl: 'https://example.com',
    builtIn: true,
  },
  {
    id: 'h5-growth-file',
    name: '成长档案报告',
    layout: 'growth-file',
    description: '适合过程记录、草图对比和阶段性成长报告。',
    status: 'published',
    theme: { primary: '#be185d', secondary: '#7c3aed', accent: '#f9a8d4', background: '#fdf2f8', surface: '#ffffff', text: '#3f3f46' },
    fontFamily: 'Microsoft YaHei',
    coverImage: '/assets/h5-report/growth-file.png',
    decorImages: [],
    moduleOrder: h5ReportModules.map((item) => item.key),
    hiddenModules: [],
    officialButtonText: '进入官网',
    officialUrl: 'https://example.com',
    builtIn: true,
  },
  {
    id: 'h5-ai-tech',
    name: 'AI 科技报告',
    layout: 'ai-tech',
    description: '适合 AI 绘画、数字艺术、3D 和视频项目。',
    status: 'published',
    theme: { primary: '#2563eb', secondary: '#06b6d4', accent: '#a78bfa', background: '#eef2ff', surface: '#ffffff', text: '#1e293b' },
    fontFamily: 'Microsoft YaHei',
    coverImage: '/assets/h5-report/ai-tech.png',
    decorImages: [],
    moduleOrder: h5ReportModules.map((item) => item.key),
    hiddenModules: [],
    officialButtonText: '进入官网',
    officialUrl: 'https://example.com',
    builtIn: true,
  },
]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeTemplate(template = {}, index = 0) {
  const seed = seedTemplates.find((item) => item.id === template.id) || seedTemplates[index % seedTemplates.length] || seedTemplates[0]
  const now = new Date().toISOString()
  const moduleKeys = h5ReportModules.map((item) => item.key)
  const order = Array.isArray(template.moduleOrder) && template.moduleOrder.length ? template.moduleOrder : seed.moduleOrder
  return {
    id: template.id || `h5-report-template-${Date.now()}-${index}`,
    strategyId: template.strategyId || seed.strategyId || 'h5-standard',
    designDocument: normalizeH5Design(template.designDocument),
    organizationId: template.organizationId || '',
    revision: Number(template.revision || 0),
    name: template.name || seed.name || '未命名 H5 报告模板',
    layout: h5ReportLayouts.some((item) => item.value === template.layout) ? template.layout : seed.layout,
    description: template.description || seed.description || '',
    status: ['published', 'draft', 'disabled'].includes(template.status) ? template.status : 'draft',
    theme: {
      ...seed.theme,
      ...(template.theme || {}),
    },
    fontFamily: template.fontFamily || seed.fontFamily || 'Microsoft YaHei',
    contentDensity: ['relaxed', 'standard', 'compact'].includes(template.contentDensity) ? template.contentDensity : 'relaxed',
    pageMode: template.pageMode === 'paged' ? 'paged' : (seed.pageMode || 'paged'),
    storyPreset: template.storyPreset || seed.storyPreset || '',
    renderVersion: Number(template.renderVersion || seed.renderVersion || 1),
    pageDesigns: { ...(seed.pageDesigns || {}), ...(template.pageDesigns || {}) },
    minPages: Math.max(1, Math.min(12, Number(template.minPages || seed.minPages || 6))),
    maxPages: Math.max(6, Math.min(12, Number(template.maxPages || seed.maxPages || 12))),
    displayOptions: {
      studentInfo: template.displayOptions?.studentInfo !== false,
      chapterNav: template.displayOptions?.chapterNav !== false,
      social: template.displayOptions?.social !== false,
      download: template.displayOptions?.download !== false,
      official: template.displayOptions?.official !== false,
    },
    coverImage: template.coverImage || seed.coverImage || '',
    decorImages: Array.isArray(template.decorImages) ? template.decorImages.filter(Boolean).slice(0, 8) : [],
    previewImages: Array.isArray(template.previewImages) ? template.previewImages.filter(Boolean).slice(0, 6) : [],
    posterConfig: {
      backgroundImage: template.posterConfig?.backgroundImage || template.coverImage || seed.coverImage || '',
      titleAlign: ['left', 'center', 'right'].includes(template.posterConfig?.titleAlign) ? template.posterConfig.titleAlign : 'left',
      showStudentInfo: template.posterConfig?.showStudentInfo !== false,
      showBrand: template.posterConfig?.showBrand !== false,
      qrPosition: ['bottom-left', 'bottom-right'].includes(template.posterConfig?.qrPosition) ? template.posterConfig.qrPosition : 'bottom-right',
    },
    moduleOrder: [...new Set(order.filter((key) => moduleKeys.includes(key)))].concat(moduleKeys.filter((key) => !order.includes(key))),
    hiddenModules: Array.isArray(template.hiddenModules) ? [...new Set(template.hiddenModules.filter((key) => moduleKeys.includes(key)))] : [],
    officialButtonText: template.officialButtonText || seed.officialButtonText || '进入官网',
    officialUrl: template.officialUrl || seed.officialUrl || '',
    builtIn: Boolean(template.builtIn ?? seedTemplates.some((item) => item.id === template.id)),
    createdBy: template.createdBy || '管理员',
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || now,
  }
}

function readTemplates() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return seedTemplates.map(normalizeTemplate)
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('invalid h5 templates')
    const normalized = parsed.map(normalizeTemplate)
    const ids = new Set(normalized.map((item) => item.id))
    const missing = seedTemplates.filter((item) => !ids.has(item.id)).map(normalizeTemplate)
    return [...missing, ...normalized]
  } catch {
    return seedTemplates.map(normalizeTemplate)
  }
}

export const useH5ReportTemplateStore = defineStore('h5ReportTemplate', {
  state: () => ({
    templates: readTemplates(),
  }),
  getters: {
    published: (state) => state.templates.filter((item) => item.status === 'published'),
    byId: (state) => (id) => state.templates.find((item) => item.id === id),
  },
  actions: {
    replaceTemplates(templates = [], { persist = false } = {}) {
      const normalized = Array.isArray(templates) && templates.length ? templates.map(normalizeTemplate) : seedTemplates.map(normalizeTemplate)
      this.templates = normalized
      if (persist) this.persist()
      else if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('h5-report-template-store-updated'))
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.templates))
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('h5-report-template-store-updated'))
    },
    createTemplate(payload = {}) {
      const template = normalizeTemplate({
        ...payload,
        id: payload.id || `h5-report-template-${Date.now()}`,
        builtIn: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      this.templates.unshift(template)
      this.persist()
      return template
    },
    updateTemplate(id, patch = {}) {
      const index = this.templates.findIndex((item) => item.id === id)
      if (index < 0) return null
      const template = normalizeTemplate({ ...this.templates[index], ...patch, id, updatedAt: new Date().toISOString() })
      this.templates.splice(index, 1, template)
      this.persist()
      return template
    },
    duplicateTemplate(id, ownerName = '管理员') {
      const source = this.templates.find((item) => item.id === id)
      if (!source) return null
      return this.createTemplate({
        ...clone(source),
        id: `h5-report-template-${Date.now()}`,
        name: `${source.name} 副本`,
        status: 'draft',
        builtIn: false,
        createdBy: ownerName,
      })
    },
    deleteTemplate(id) {
      const target = this.templates.find((item) => item.id === id)
      if (!target || target.builtIn) return false
      this.templates = this.templates.filter((item) => item.id !== id)
      this.persist()
      return true
    },
  },
})
