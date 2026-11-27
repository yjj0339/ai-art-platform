import { defineStore } from 'pinia'

import { apiClient } from '../services/apiClient'
import { galleryDefaultRules, galleryStatusLabels } from '../utils/galleryRules'

const STORAGE_KEY = 'art-studio-gallery-works-v1'
const SETTINGS_KEY = 'art-studio-gallery-settings-v1'
const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'

const defaultSettings = {
  autoAudit: true,
  autoSelect: true,
  qualityThreshold: 60,
  duplicateThreshold: 80,
  maxPinned: 3,
}

const seedWorks = [
  ['g-001', '会发光的水果店IP', '阿橙', '本地小店LOGO设计', '6-9岁', 36, 'linear-gradient(135deg, #ffb15c, #ffd6a5)', '用户投稿'],
  ['g-002', '星际旅行小汽车', '小星', '未来交通工具', '8-12岁', 28, 'linear-gradient(135deg, #36bffa, #c7f9ff)', '系统精选'],
  ['g-003', '黏土小城堡', '米粒', '梦幻建筑设计', '6-9岁', 42, 'linear-gradient(135deg, #a7f3d0, #fef3c7)', '讲师推荐'],
  ['g-004', '梦幻云朵房间', '木木', '我的理想空间', '8-12岁', 31, 'linear-gradient(135deg, #f472b6, #fde2f3)', '用户投稿'],
  ['g-005', '森林音乐会', '小叶', '绘本场景创作', '6-9岁', 33, 'linear-gradient(135deg, #86efac, #d9f99d)', '系统精选'],
  ['g-006', '未来糖果工厂', '糖糖', '创意空间设计', '10-14岁', 51, 'linear-gradient(135deg, #fb7185, #fde68a)', '讲师推荐'],
].map(([id, title, author, course, ageRange, likes, cover, source], index) => ({
  id,
  projectId: `seed-${id}`,
  title,
  author,
  course,
  ageRange,
  likes,
  cover,
  icon: '画',
  type: 'AI绘画',
  source,
  prompt: `${title}，儿童创意美术作品`,
  description: '作品已通过平台内容审核并公开展示。',
  status: 'published',
  auditMode: 'mock',
  auditReason: 'Mock 审核通过',
  qualityScore: 82 + index,
  pinned: source === '讲师推荐' && index < 3,
  publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
  createdAt: new Date(Date.now() - index * 3600000).toISOString(),
}))

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function normalizedText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '')
}

function finalArtwork(project = {}) {
  const versions = project.versions || []
  return versions.find((item) => item.id === project.finalVersionId) || versions[0] || null
}

export const useGalleryStore = defineStore('gallery', {
  state: () => ({
    works: SERVER_AUTH_MODE ? [] : readJson(STORAGE_KEY, seedWorks),
    adminWorks: [],
    adminTotal: 0,
    adminStats: { total: 0, pending: 0, selected: 0 },
    ownWorks: [],
    ownLoaded: false,
    consent: { granted: false, opted_in: false },
    ownError: '',
    publicTotal: 0,
    publicPage: 0,
    publicCourses: [],
    // 后台维护的作品广场分类（用户端顶部按钮读这个）
    publicCategories: [],
    publicDefaultCategoryId: '',
    settings: SERVER_AUTH_MODE ? { ...galleryDefaultRules, version: 0 } : { ...defaultSettings, ...readJson(SETTINGS_KEY, {}) },
    settingsLoaded: false,
    autoSelectConsent: SERVER_AUTH_MODE ? false : readJson('art-studio-gallery-auto-select-consent', false),
    sensitiveWords: ['暴力', '色情', '仇恨', '辱骂'],
  }),
  getters: {
    publishedWorks: (state) => [...state.works]
      .filter((item) => item.status === 'published')
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.publishedAt) - new Date(a.publishedAt)),
    reviewWorks: (state) => (SERVER_AUTH_MODE ? state.adminWorks : state.works).filter((item) => item.status === 'review' || item.status === 'pending'),
    rejectedWorks: (state) => (SERVER_AUTH_MODE ? state.adminWorks : state.works).filter((item) => item.status === 'rejected'),
    managedWorks: (state) => [...(SERVER_AUTH_MODE ? state.adminWorks : state.works)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    serverMode: () => SERVER_AUTH_MODE,
  },
  actions: {
    persist() {
      if (SERVER_AUTH_MODE) return
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.works))
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
      localStorage.setItem('art-studio-gallery-auto-select-consent', JSON.stringify(this.autoSelectConsent))
    },
    async setAutoSelectConsent(value, withdrawPublished = false) {
      if (SERVER_AUTH_MODE) {
        const { data } = await apiClient.put('/me/gallery-consent', { optedIn: Boolean(value), withdrawPublished })
        this.consent = { ...this.consent, ...data.consent }
        this.autoSelectConsent = data.consent.opted_in
        if (withdrawPublished) await this.loadOwnWorks()
        return
      }
      this.autoSelectConsent = Boolean(value)
      this.persist()
    },
    updateSetting(key, value) {
      if (!(key in this.settings)) return
      this.settings[key] = value
      this.persist()
    },
    audit(payload, source = '用户投稿') {
      const text = `${payload.title || ''}${payload.description || ''}`
      const hit = this.sensitiveWords.find((word) => text.includes(word))
      if (hit) return { passed: false, reason: '作品名称或创作思路包含不合适文字', score: 0 }
      if (!payload.cover) return { passed: false, reason: '作品生成不完整，请重新生成后投稿', score: 35 }
      if (source !== '讲师推荐') {
        const duplicate = this.works.find((item) => item.status === 'published'
          && item.projectId !== payload.projectId
          && (normalizedText(item.title) === normalizedText(payload.title)
            || (payload.prompt && normalizedText(item.prompt) === normalizedText(payload.prompt))))
        if (duplicate) return { passed: false, reason: '作品与已有作品过于相似', score: 48 }
      }
      const score = Math.min(96, 70 + Math.min(20, String(payload.description || payload.prompt || '').length))
      if (source !== '讲师推荐' && score < Number(this.settings.qualityThreshold)) {
        return { passed: false, reason: '作品生成不完整，请重新生成后投稿', score }
      }
      return { passed: true, reason: 'Mock 规则审核通过', score }
    },
    submit(payload, source = '用户投稿') {
      const existing = this.works.find((item) => item.projectId === payload.projectId)
      if (existing?.status === 'published') return { work: existing, passed: true, existed: true }
      const result = this.settings.autoAudit
        ? this.audit(payload, source)
        : { passed: false, reason: '智能审核已关闭，等待人工审核', score: 0, review: true }
      const now = new Date().toISOString()
      const work = {
        ...(existing || {}),
        id: existing?.id || `gallery-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        projectId: payload.projectId,
        title: payload.title || '未命名作品',
        author: payload.author || '小画家',
        course: payload.course || 'AI创意美术课',
        ageRange: payload.ageRange || '6-12岁',
        cover: payload.cover,
        icon: '画',
        type: 'AI绘画',
        prompt: payload.prompt || '',
        description: payload.description || '这是一幅认真完成的AI创意美术作品。',
        source,
        likes: existing?.likes || 0,
        status: result.review ? 'review' : result.passed ? 'published' : 'rejected',
        auditMode: 'mock',
        auditReason: result.reason,
        qualityScore: result.score,
        pinned: existing?.pinned || false,
        createdAt: existing?.createdAt || now,
        publishedAt: result.passed ? now : existing?.publishedAt || '',
      }
      if (existing) Object.assign(existing, work)
      else this.works.unshift(work)
      this.persist()
      return { work, passed: result.passed, existed: false }
    },
    submitProject(project, user, form = {}) {
      if (SERVER_AUTH_MODE) {
        return this.submitServerProject(project, form)
      }
      const artwork = finalArtwork(project)
      return this.submit({
        projectId: project.id,
        title: form.title || project.title,
        author: user?.name || '小画家',
        course: project.courseTitle || project.courseCategory || 'AI创意美术课',
        ageRange: project.ageRange || '6-12岁',
        cover: artwork?.background || artwork?.imageUrl || project.cover,
        prompt: project.prompt,
        description: form.description || project.ideaSummary || project.courseIdeaText || project.prompt,
      }, form.source || '用户投稿')
    },
    autoSelectProject(project, user) {
      if (SERVER_AUTH_MODE) return null
      if (!this.settings.autoSelect || !this.autoSelectConsent || !project?.finalVersionId) return null
      return this.submitProject(project, user, { source: '系统精选' })
    },
    like(id) {
      if (SERVER_AUTH_MODE) return
      const work = this.works.find((item) => item.id === id)
      if (!work) return
      work.likes += 1
      this.persist()
    },
    async loadAdminSettings() {
      if (!SERVER_AUTH_MODE) return
      const { data } = await apiClient.get('/admin/gallery-audit-settings')
      this.settings = { ...galleryDefaultRules, ...data.settings }
      this.settingsLoaded = true
    },
    async saveAdminSettings(patch) {
      if (!SERVER_AUTH_MODE) {
        this.updateSetting('autoAudit', patch.autoAudit)
        this.updateSetting('autoSelect', patch.autoSelect)
        this.updateSetting('qualityThreshold', patch.qualityThreshold)
        this.updateSetting('duplicateThreshold', patch.duplicateThreshold)
        this.updateSetting('maxPinned', patch.maxPinned)
        if (Array.isArray(patch.sensitiveWords)) this.sensitiveWords = [...patch.sensitiveWords]
        return { ok: true }
      }
      const { data } = await apiClient.put('/admin/gallery-audit-settings', patch)
      if (data?.settings) {
        this.settings = { ...galleryDefaultRules, ...data.settings }
        if (Array.isArray(data.settings.sensitiveWords)) this.sensitiveWords = [...data.settings.sensitiveWords]
      }
      return { ok: true, settings: data?.settings }
    },
    async loadAdminWorks(params = {}) {
      if (!SERVER_AUTH_MODE) return
      const { data } = await apiClient.get('/admin/gallery-submissions', { params })
      this.adminWorks = data.works
      this.adminTotal = data.total
      this.adminStats = data.stats
    },
    resetAdminSettings() {
      if (SERVER_AUTH_MODE) return
      this.settings = { ...defaultSettings }
      this.sensitiveWords = [...defaultSettings.sensitiveWords]
      this.persist()
    },
    async setStatus(id, status, reason = '') {
      if (SERVER_AUTH_MODE) {
        const action = status === 'published' ? 'approved' : status === 'rejected' ? 'rejected' : 'offline'
        const { data } = await apiClient.patch(`/admin/gallery-submissions/${id}`, { action, reason, expectedUpdatedAt: this.adminWorks.find(work => work.id === id)?.updatedAt })
        return data
      }
      const work = this.works.find((item) => item.id === id)
      if (!work) return
      work.status = status
      if (reason) work.auditReason = reason
      if (status === 'published') work.publishedAt = new Date().toISOString()
      if (status !== 'published') work.pinned = false
      this.persist()
    },
    togglePinned(id) {
      if (SERVER_AUTH_MODE) return { ok: false, reason: '正式模式的精选置顶尚未开放。' }
      const work = this.works.find((item) => item.id === id)
      if (!work || work.status !== 'published') return { ok: false, reason: '仅已上架作品可以置顶' }
      if (!work.pinned && this.works.filter((item) => item.pinned && item.status === 'published').length >= this.settings.maxPinned) {
        return { ok: false, reason: `首页最多置顶 ${this.settings.maxPinned} 个作品` }
      }
      work.pinned = !work.pinned
      this.persist()
      return { ok: true, pinned: work.pinned }
    },
    // 分类筛选走 categoryId（后台建的真实分类），不再按 course 筛选。
    // course 参数保留只为兼容旧调用方，传进来也当没传。
    async loadServerWorks(append = false, categoryId = '') {
      if (!SERVER_AUTH_MODE) return
      const page = append ? this.publicPage + 1 : 1
      const { data } = await apiClient.get('/gallery/public', { params: { page, pageSize: 40, categoryId } })
      this.works = append ? [...this.works, ...data.works.filter(work => !this.works.some(existing => existing.id === work.id))] : data.works
      this.publicTotal = data.total
      this.publicPage = page
      this.publicCategories = data.categories || []
      this.publicDefaultCategoryId = data.defaultCategoryId || ''
      this.publicCourses = data.courses || []
    },
    async loadOwnWorks() {
      if (!SERVER_AUTH_MODE) return
      try {
        const [works, consent] = await Promise.all([apiClient.get('/me/gallery-submissions'), apiClient.get('/me/gallery-consent')])
        this.ownWorks = works.data.works
        this.consent = consent.data.consent
        this.autoSelectConsent = this.consent.opted_in
        this.ownLoaded = true
        this.ownError = ''
      } catch (error) {
        this.ownLoaded = false
        this.ownError = error.response?.data?.message || '审核状态加载失败，请重试。'
        throw error
      }
    },
    ownWork(projectId) {
      return (SERVER_AUTH_MODE ? this.ownWorks : this.works).find(work => work.projectId === projectId || work.documentId === projectId)
    },
    statusLabel(projectId, hasFinal = true) {
      if (SERVER_AUTH_MODE && !this.ownLoaded) return this.ownError ? '状态读取失败' : '正在读取状态'
      const work = this.ownWork(projectId)
      return work ? `${galleryStatusLabels[work.status] || '待审核'}${work.previousPublished ? '（旧版已公开）' : ''}` : hasFinal ? '可投稿' : '未完成'
    },
    async submitServerProject(project, form) {
      if (!project?._serverDocumentId) throw new Error('作品尚未同步到服务端，请稍后重试。')
      const { data } = await apiClient.post('/me/gallery-submissions', { documentId: project._serverDocumentId, title: form.title, description: form.description, acceptPublication: form.acceptPublication === true })
      await this.loadOwnWorks()
      return { work: this.ownWorks.find(work => work.id === data.submission.id), status: data.submission.status, existed: data.submission.existed, passed: data.submission.status === 'published' }
    },
    async withdraw(id) {
      if (SERVER_AUTH_MODE) { await apiClient.post(`/me/gallery-submissions/${id}/withdraw`); await this.loadOwnWorks(); return }
      const work = this.works.find(work => work.id === id)
      if (work) { work.status = 'withdrawn'; this.persist() }
    },
  },
})
