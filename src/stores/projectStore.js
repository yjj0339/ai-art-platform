import { defineStore } from 'pinia'

import { apiClient } from '../services/apiClient'
import { normalizeReferenceImages } from '../utils/referenceImages'

const STORAGE_KEY = 'art-studio-projects'
const DRAFT_KEY = 'art-studio-current-draft'
const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
const pendingWrites = new Map()

const seedProjects = [
  {
    id: 'p-001',
    title: '会发光的水果店IP',
    type: 'AI绘画',
    updatedAt: '今天 10:20',
    prompt: '一个会发光的橙子店长，站在未来水果店门口，温暖灯光，儿童插画风格',
    cover: 'linear-gradient(135deg, #ffb15c, #ffd6a5)',
    thumbnails: [],
  },
  {
    id: 'p-002',
    title: '星际旅行小汽车',
    type: '草图变作品',
    updatedAt: '昨天 18:42',
    prompt: '一辆像星星一样闪亮的小汽车，在银河轨道上旅行，色彩明亮，圆润可爱',
    cover: 'linear-gradient(135deg, #36bffa, #c7f9ff)',
    thumbnails: [],
  },
  {
    id: 'p-003',
    title: '我的梦幻房间',
    type: '创意设计',
    updatedAt: '周二 15:10',
    prompt: '儿童梦幻房间，有绘画墙、云朵灯和小小3D打印机，温馨治愈',
    cover: 'linear-gradient(135deg, #f472b6, #fde2f3)',
    thumbnails: [],
  },
]

export function createEmptyProject(difficulty = 'starter') {
  return {
    id: `p-${Date.now()}`,
    title: '新的AI绘画项目',
    type: 'AI绘画',
    updatedAt: '刚刚',
    difficulty,
    prompt: '',
    cover: '',
    thumbnails: [],
    courseId: '',
    courseTitle: '',
    courseCategory: '',
    courseDescription: '',
    courseAnswers: [],
    courseIdeaText: '',
    courseIdeaVoiceText: '',
    courseMaterials: [],
    h5TemplateId: '',
    h5LayoutDraft: {
      templateId: '',
      fillMode: 'auto',
      assignments: {},
    },
    ideaRawAnswers: ['', '', '', ''],
    ideaSummary: '',
    ideaPrompt: '',
    sketchOriginal: '',
    sketchOptimized: '',
    referenceImages: [],
    sketchScore: 0,
    sketchComment: '',
    sketchSource: '',
    sketchStage: 'idle',
    sketchProgress: 0,
    sketchCurrentStep: '',
    lineControl: {
      enabled: false,
      strength: 70,
      thickness: 50,
      contrast: 60,
      mode: 'clean-line',
      multiControls: [],
    },
    versions: [],
    finalVersionId: '',
    revisionHistory: [],
    reports: [],
    videos: [],
    videoTasks: [],
    models3d: [],
    texts: [],
    reportConfig: {
      range: 'single',
      showSketch: true,
      showProcess: true,
      showAiReview: true,
      template: 'cartoon',
    },
    trash: [],
  }
}

function normalizeProject(project = {}) {
  return {
    ...createEmptyProject(project.difficulty || 'starter'),
    ...project,
    lineControl: {
      ...createEmptyProject(project.difficulty || 'starter').lineControl,
      ...(project.lineControl || {}),
    },
    reportConfig: {
      ...createEmptyProject(project.difficulty || 'starter').reportConfig,
      ...(project.reportConfig || {}),
    },
    h5LayoutDraft: {
      ...createEmptyProject(project.difficulty || 'starter').h5LayoutDraft,
      ...(project.h5LayoutDraft || {}),
      assignments: { ...(project.h5LayoutDraft?.assignments || {}) },
    },
    versions: project.versions || project.thumbnails || [],
    // 老数据里 referenceImages 可能是纯字符串 / CSS background，绘画页读 item.preview
    // 会拿到 undefined → 缩略图破图。这里统一整形，坏数据在入口处就被修好。
    referenceImages: normalizeReferenceImages(project.referenceImages),
    courseAnswers: project.courseAnswers || [],
    courseMaterials: project.courseMaterials || [],
    finalVersionId: project.finalVersionId || project.thumbnails?.[0]?.id || '',
    revisionHistory: project.revisionHistory || [],
    reports: project.reports || [],
    videos: project.videos || [],
    videoTasks: project.videoTasks || [],
    models3d: project.models3d || [],
    texts: project.texts || [],
    trash: project.trash || [],
  }
}

function readProjects() {
  if (SERVER_AUTH_MODE) return []
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return seedProjects.map(normalizeProject)
  try {
    return JSON.parse(raw).map(normalizeProject)
  } catch {
    return seedProjects.map(normalizeProject)
  }
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    projects: readProjects(),
    currentProject: null,
    draft: SERVER_AUTH_MODE ? null : (localStorage.getItem(DRAFT_KEY) ? normalizeProject(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || {}) : null),
    hydrated: false,
  }),
  actions: {
    persist() {
      if (SERVER_AUTH_MODE) {
        this.projects.forEach((project) => this.queueServerWrite(project, 'project'))
        return
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.projects))
    },
    async hydrateFromServer(force = false) {
      if (!SERVER_AUTH_MODE || (this.hydrated && !force)) return
      const [projectsResponse, draftsResponse] = await Promise.all([
        apiClient.get('/me/documents', { params: { type: 'project' } }),
        apiClient.get('/me/documents', { params: { type: 'draft' } }),
      ])
      this.projects = (projectsResponse.data.documents || []).map((document) => normalizeProject({
        ...document.data,
        _serverDocumentId: document.id,
        _serverVersion: document.version,
      }))
      const draftDocument = draftsResponse.data.documents?.[0]
      this.draft = draftDocument ? normalizeProject({
        ...draftDocument.data,
        _serverDocumentId: draftDocument.id,
        _serverVersion: draftDocument.version,
      }) : null
      this.currentProject = null
      this.hydrated = true
    },
    clearSessionData() {
      if (!SERVER_AUTH_MODE) return
      this.projects = []
      this.currentProject = null
      this.draft = null
      this.hydrated = false
      pendingWrites.clear()
    },
    queueServerWrite(project, type = 'project') {
      if (!SERVER_AUTH_MODE || !project?.id) return Promise.resolve()
      const key = `${type}:${project.id}`
      const previous = pendingWrites.get(key) || Promise.resolve()
      const write = previous.catch(() => {}).then(async () => {
        const source = type === 'draft' ? this.draft : this.projects.find((item) => item.id === project.id)
        if (!source || source.id !== project.id) return
        const payload = JSON.parse(JSON.stringify(source))
        delete payload._serverDocumentId
        delete payload._serverVersion
        if (source._serverDocumentId) {
          const { data } = await apiClient.patch(`/me/documents/${source._serverDocumentId}`, {
            title: source.title, data: payload, version: source._serverVersion,
          })
          source._serverVersion = data.document.version
        } else {
          const { data } = await apiClient.post('/me/documents', {
            type, resourceKey: source.id, title: source.title, data: payload,
          })
          source._serverDocumentId = data.document.id
          source._serverVersion = data.document.version
        }
        const latest = type === 'draft' ? this.draft : this.projects.find((item) => item.id === project.id)
        if (latest && latest.id === source.id && latest !== source) {
          latest._serverDocumentId = source._serverDocumentId
          latest._serverVersion = source._serverVersion
        }
      }).finally(() => {
        if (pendingWrites.get(key) === write) pendingWrites.delete(key)
      })
      pendingWrites.set(key, write)
      return write
    },
    async flushServerWrites(strict = false) {
      if (!SERVER_AUTH_MODE) return
      if (strict) return Promise.all([...pendingWrites.values()])
      await Promise.allSettled([...pendingWrites.values()])
    },
    applyServerProject(document) {
      const project = normalizeProject({ ...document.data, _serverDocumentId: document.id, _serverVersion: document.version })
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      else this.projects.unshift(project)
      this.currentProject = project
      return project
    },
    startNewProject(difficulty) {
      this.currentProject = createEmptyProject(difficulty)
      this.saveDraft(this.currentProject)
    },
    openProject(projectId) {
      const found = this.projects.find((project) => project.id === projectId)
      this.currentProject = found ? normalizeProject(found) : null
      if (this.currentProject) this.saveDraft(this.currentProject)
    },
    saveDraft(payload) {
      const draftServerMeta = SERVER_AUTH_MODE && this.draft?.id === payload.id
        ? { _serverDocumentId: this.draft._serverDocumentId, _serverVersion: this.draft._serverVersion }
        : {}
      this.draft = normalizeProject({ ...payload, savedAt: new Date().toISOString() })
      if (SERVER_AUTH_MODE) {
        // 草稿和正式项目是不同文档，不可用项目文档编号 PATCH 草稿。
        delete this.draft._serverDocumentId
        delete this.draft._serverVersion
        Object.assign(this.draft, draftServerMeta)
        this.queueServerWrite(this.draft, 'draft')
        return
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.draft))
    },
    saveCurrentProject(payload) {
      const project = normalizeProject({ ...this.currentProject, ...payload, updatedAt: '刚刚' })
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      else this.projects.unshift(project)
      this.currentProject = project
      this.saveDraft(project)
      this.persist()
    },
    saveText(projectId, text = {}) {
      const existingProject = this.projects.find((item) => item.id === projectId)
      const source = existingProject || this.currentProject || this.draft
      if (!source || !String(text.text || '').trim()) return null
      const project = normalizeProject(source)
      const sourceIsDraft = SERVER_AUTH_MODE && !existingProject && source === this.draft && source._serverDocumentId
      const draftServerMeta = sourceIsDraft
        ? { _serverDocumentId: source._serverDocumentId, _serverVersion: source._serverVersion }
        : null
      if (sourceIsDraft) {
        // 草稿和正式项目是两类服务端文档，不能复用同一个文档编号。
        delete project._serverDocumentId
        delete project._serverVersion
      }
      const savedText = {
        id: text.id || `text-${Date.now()}`,
        title: text.title || `${project.title} · 文本`,
        text: String(text.text).trim(),
        sourceNodeId: text.sourceNodeId || '',
        createdAt: text.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const nextTexts = project.texts?.filter((item) => item.id !== savedText.id) || []
      project.texts = [savedText, ...nextTexts]
      project.updatedAt = '刚刚'
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      else this.projects.unshift(project)
      this.currentProject = project
      this.saveDraft(sourceIsDraft ? { ...project, ...draftServerMeta } : project)
      this.persist()
      return savedText
    },
    deleteProject(projectId) {
      const project = this.projects.find((item) => item.id === projectId)
      if (project && SERVER_AUTH_MODE && project._serverDocumentId) {
        apiClient.delete(`/me/documents/${project._serverDocumentId}`).catch(() => {})
      } else if (project) {
        const deleted = { ...project, deletedAt: new Date().toISOString() }
        const trash = JSON.parse(localStorage.getItem('art-studio-project-trash') || '[]')
        localStorage.setItem('art-studio-project-trash', JSON.stringify([deleted, ...trash]))
      }
      this.projects = this.projects.filter((project) => project.id !== projectId)
      this.persist()
    },
    setCurrentProject(payload) {
      this.currentProject = normalizeProject(payload)
      this.saveDraft(this.currentProject)
    },
    saveReport(projectId, report) {
      const source = this.projects.find((item) => item.id === projectId) || this.currentProject || this.draft
      if (!source) return null
      const project = normalizeProject(source)
      const savedReport = {
        id: report.id || `report-${Date.now()}`,
        title: report.title || `${project.title}完整创作报告`,
        type: report.type || 'single',
        course: report.course || 'AI创意美术课',
        // 报告分类：批量管理里「分类设置」写的值，重新生成时必须带回来，否则分类会被清掉
        category: report.category || '',
        createdAt: report.createdAt || new Date().toISOString(),
        pages: report.pages || [],
        template: report.template || project.reportConfig?.template || 'cartoon',
        cover: report.cover || project.cover,
        materialTypes: report.materialTypes || ['painting'],
        materialStats: report.materialStats || {
          sketches: project.sketchOriginal ? 1 : 0,
          versions: project.versions?.length || 0,
          models3d: project.models3d?.length || 0,
          videos: project.videos?.length || 0,
          texts: project.prompt || project.ideaSummary ? 1 : 0,
        },
        model: report.model || '',
        agentProvider: report.agentProvider || '',
        h5TemplateId: report.h5TemplateId || report.template || '',
        h5StrategyId: report.h5StrategyId || 'h5-standard',
        h5WorkflowId: report.h5WorkflowId || '',
        h5WorkflowVersion: Number(report.h5WorkflowVersion || 0),
        adapterKey: report.adapterKey || '',
        pageImages: report.pageImages || [],
        theme: report.theme || '',
        materialSummary: report.materialSummary || null,
        warnings: report.warnings || [],
      }
      const nextReports = project.reports?.filter((item) => item.id !== savedReport.id) || []
      project.reports = [savedReport, ...nextReports]
      project.updatedAt = '刚刚'
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      else this.projects.unshift(project)
      this.currentProject = project
      this.saveDraft(project)
      this.persist()
      return savedReport
    },
    deleteReport(projectId, reportId) {
      const project = normalizeProject(this.projects.find((item) => item.id === projectId) || this.currentProject || this.draft)
      project.reports = (project.reports || []).filter((item) => item.id !== reportId)
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      this.currentProject = project
      this.saveDraft(project)
      this.persist()
    },
    // 批量删除：一次确认删多份报告，按项目分组只落一次盘（逐条 deleteReport 会写 N 次服务器）
    deleteReports(items = []) {
      const byProject = new Map()
      items.forEach((item) => {
        const projectId = item?.projectId || item?.project?.id
        const reportId = item?.reportId || item?.report?.id || item?.id
        if (!projectId || !reportId) return
        if (!byProject.has(projectId)) byProject.set(projectId, new Set())
        byProject.get(projectId).add(reportId)
      })
      let removed = 0
      byProject.forEach((reportIds, projectId) => {
        const project = normalizeProject(this.projects.find((entry) => entry.id === projectId) || this.currentProject || this.draft)
        const before = (project.reports || []).length
        project.reports = (project.reports || []).filter((report) => !reportIds.has(report.id))
        removed += before - project.reports.length
        const index = this.projects.findIndex((entry) => entry.id === project.id)
        if (index >= 0) this.projects.splice(index, 1, project)
        this.currentProject = project
        this.saveDraft(project)
      })
      this.persist()
      return removed
    },
    // 批量改分类：报告上没有单独的「分类」表，直接写在 report.category 上（空字符串 = 未分类）
    setReportsCategory(items = [], category = '') {
      const byProject = new Map()
      items.forEach((item) => {
        const projectId = item?.projectId || item?.project?.id
        const reportId = item?.reportId || item?.report?.id || item?.id
        if (!projectId || !reportId) return
        if (!byProject.has(projectId)) byProject.set(projectId, new Set())
        byProject.get(projectId).add(reportId)
      })
      let changed = 0
      byProject.forEach((reportIds, projectId) => {
        const project = normalizeProject(this.projects.find((entry) => entry.id === projectId) || this.currentProject || this.draft)
        project.reports = (project.reports || []).map((report) => {
          if (!reportIds.has(report.id)) return report
          changed += 1
          return { ...report, category: category || '' }
        })
        const index = this.projects.findIndex((entry) => entry.id === project.id)
        if (index >= 0) this.projects.splice(index, 1, project)
        this.currentProject = project
        this.saveDraft(project)
      })
      this.persist()
      return changed
    },
    saveVideo(projectId, video) {
      const source = this.projects.find((item) => item.id === projectId) || this.currentProject || this.draft
      if (!source) return null
      const project = normalizeProject(source)
      const savedVideo = {
        id: video.id || `video-${Date.now()}`,
        title: video.title || `${project.title} AI动态视频`,
        type: 'AI动态视频',
        createdAt: video.createdAt || new Date().toISOString(),
        duration: video.duration || '10s',
        ratio: video.ratio || '9:16',
        style: video.style || '动起来',
        script: video.script || '',
        cover: video.cover || project.cover,
        background: video.background || 'linear-gradient(135deg, #2b184f, #7c3aed 55%, #ff7a00)',
        description: video.description || '已生成课堂演示级 AI 视频 Mock 结果',
        materials: video.materials || [],
        taskId: video.taskId || video.id || '',
        status: video.status || 'succeeded',
        progress: Number(video.progress || 100),
        videoUrl: video.videoUrl || video.previewUrl || '',
        previewUrl: video.previewUrl || video.videoUrl || '',
      }
      const nextVideos = project.videos?.filter((item) => item.id !== savedVideo.id) || []
      project.videos = [savedVideo, ...nextVideos]
      project.updatedAt = '刚刚'
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      else this.projects.unshift(project)
      this.currentProject = project
      this.saveDraft(project)
      this.persist()
      return savedVideo
    },
    deleteVideo(projectId, videoId) {
      const project = normalizeProject(this.projects.find((item) => item.id === projectId) || this.currentProject || this.draft)
      project.videos = (project.videos || []).filter((item) => item.id !== videoId)
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      this.currentProject = project
      this.saveDraft(project)
      this.persist()
    },
    saveModel3D(projectId, model) {
      const source = this.projects.find((item) => item.id === projectId) || this.currentProject || this.draft
      if (!source) return null
      const project = normalizeProject(source)
      const savedModel = {
        id: model.id || `model3d-${Date.now()}`,
        title: model.title || `${project.title} 3D作品`,
        type: '3D作品',
        createdAt: model.createdAt || new Date().toISOString(),
        style: model.style || '卡通Q版',
        thickness: model.thickness || 50,
        depth: model.depth || 45,
        rotation: model.rotation || 30,
        cover: model.cover || project.cover || 'linear-gradient(135deg, #ecfdf5, #fffbeb)',
        preview: model.preview || model.cover || project.cover,
        modelUrl: model.modelUrl || '',
        files: Array.isArray(model.files) ? model.files : [],
        description: model.description || '课堂演示级平面转3D Mock 结果',
      }
      const nextModels = project.models3d?.filter((item) => item.id !== savedModel.id) || []
      project.models3d = [savedModel, ...nextModels]
      project.updatedAt = '刚刚'
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      else this.projects.unshift(project)
      this.currentProject = project
      this.saveDraft(project)
      this.persist()
      return savedModel
    },
    deleteModel3D(projectId, modelId) {
      const project = normalizeProject(this.projects.find((item) => item.id === projectId) || this.currentProject || this.draft)
      project.models3d = (project.models3d || []).filter((item) => item.id !== modelId)
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) this.projects.splice(index, 1, project)
      this.currentProject = project
      this.saveDraft(project)
      this.persist()
    },

    /**
     * 素材库批量删除：一次处理多条，最后只落盘一次（server 模式下避免逐条 PATCH）。
     * entry: { projectId, kind, itemId, versionId, versionIndex }
     * 约定：项目最后一个作品版本被删除时，连同该项目一起移入回收站（其它素材随项目一并移除）。
     * 返回真正删除成功的条数。
     */
    bulkDeleteMaterials(entries = []) {
      let removed = 0
      entries.forEach((entry) => {
        const project = this.projects.find((item) => item.id === entry.projectId)
        if (!project) return
        if (entry.kind === 'project') {
          const versions = project.versions || []
          if (!versions.length) {
            this.deleteProject(project.id)
            removed += 1
            return
          }
          const index = entry.versionId
            ? versions.findIndex((item) => (item.id || '') === entry.versionId)
            : Number(entry.versionIndex)
          if (!Number.isInteger(index) || index < 0 || index >= versions.length) return
          const [removedVersion] = versions.splice(index, 1)
          if (removedVersion && project.finalVersionId === removedVersion.id) {
            project.finalVersionId = versions[0]?.id || ''
          }
          if (!versions.length) {
            this.deleteProject(project.id)
          } else {
            project.updatedAt = '刚刚'
          }
          removed += 1
          return
        }
        const collectionKey = { video: 'videos', model3d: 'models3d', text: 'texts', report: 'reports' }[entry.kind]
        if (!collectionKey) return
        const collection = project[collectionKey] || []
        const next = collection.filter((item) => item.id !== entry.itemId)
        if (next.length === collection.length) return
        project[collectionKey] = next
        project.updatedAt = '刚刚'
        removed += 1
      })
      if (removed) this.persist()
      return removed
    },

    /**
     * 素材库批量重命名：一次处理多条，最后只落盘一次。
     * entry: { projectId, kind, itemId, versionId, versionIndex, title }
     * 仅支持 图像(project) / 视频(video) / 文本(text) / 3D(model3d) / 报告(report)。
     * 返回真正改名成功的条数。
     */
    bulkRenameMaterials(entries = []) {
      let renamed = 0
      entries.forEach((entry) => {
        const project = this.projects.find((item) => item.id === entry.projectId)
        const title = String(entry.title || '').trim()
        if (!project || !title) return
        if (entry.kind === 'project') {
          const versions = project.versions || []
          const version = entry.versionId
            ? versions.find((item) => (item.id || '') === entry.versionId)
            : versions[Number(entry.versionIndex)]
          if (version) version.title = title
          else if (!versions.length) project.title = title
          else return
        } else {
          const collectionKey = { video: 'videos', model3d: 'models3d', text: 'texts', report: 'reports' }[entry.kind]
          if (!collectionKey) return
          const target = (project[collectionKey] || []).find((item) => item.id === entry.itemId)
          if (!target) return
          target.title = title
        }
        project.updatedAt = '刚刚'
        renamed += 1
      })
      if (renamed) this.persist()
      return renamed
    },

    /**
     * 批量删除撤销：整体恢复项目快照。
     * server 模式下抹掉旧的文档编号，让 persist() 重新 POST 建文档（原文档已被 DELETE）。
     */
    restoreProjects(snapshot = []) {
      this.projects = (Array.isArray(snapshot) ? snapshot : []).map((item) => {
        const project = normalizeProject(JSON.parse(JSON.stringify(item)))
        if (SERVER_AUTH_MODE) {
          delete project._serverDocumentId
          delete project._serverVersion
        }
        return project
      })
      this.persist()
      return this.projects.length
    },
  },
})
