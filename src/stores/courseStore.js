import { defineStore } from 'pinia'
import { apiClient } from '../services/apiClient'
import { useUserStore } from './userStore'

// 服务端模式：课程存在服务端（/api/courses，按角色过滤：管理员看全部、讲师看自己建的和授权到所在权限组的、
// 小画家只看已发布且授权给他的）。演示模式（没有后端）才用浏览器本地存储。
const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
// 旧版本把课程只存在浏览器里；服务端模式下只用它把老数据搬上去一次
const STORAGE_KEY = 'art-studio-courses'
const MIGRATED_KEY_PREFIX = 'art-studio-courses-migrated'

export const courseCategories = [
  { label: '全部课程', value: 'all' },
  { label: 'LOGO设计', value: 'logo' },
  { label: '门头设计', value: 'storefront' },
  { label: '服装设计', value: 'fashion' },
  { label: '产品设计', value: 'product' },
  { label: 'IP形象', value: 'ip' },
  { label: '动漫人物', value: 'anime' },
  { label: '综合项目', value: 'project' },
]

const seedCourses = [
  {
    id: 'course-storefront-001',
    title: '实体商家门头设计',
    category: 'storefront',
    difficulty: '进阶/高级',
    ageRange: '10-13岁',
    status: 'published',
    authorizedClasses: ['AI创意美术A班', '进阶设计班'],
    authorizedStudents: ['小画家阿橙', '晨晨', '可可'],
    cover: 'linear-gradient(135deg, #ff7a00, #ffd166)',
    icon: '门',
    description: '把一家真实商家的店名、招牌、门头颜色和品牌气质设计成完整视觉方案。',
    videoUrl: 'mock://video/storefront-design',
    pptPages: [
      { title: '观察真实商家', body: '店名、商品、顾客、周边环境都会影响门头设计。' },
      { title: '提炼品牌关键词', body: '用 3 个词描述这家店：温暖、专业、可爱、科技、传统等。' },
      { title: '设计门头草图', body: '确定招牌形状、主色、字体和图形符号。' },
      { title: '进入AI创作', body: '把你的观察和想法整理成提示词，生成门头设计方案。' },
    ],
    questions: [
      '这家店主要卖什么？你希望顾客第一眼感受到什么？',
      '你想给门头使用哪三种颜色？为什么？',
      '招牌上要出现文字、图案还是吉祥物？',
      '你希望最终作品看起来更可爱、专业还是高级？',
    ],
  },
  {
    id: 'course-logo-001',
    title: '本地小店LOGO设计',
    category: 'logo',
    difficulty: '入门/进阶',
    ageRange: '7-12岁',
    status: 'published',
    authorizedClasses: ['AI创意美术A班'],
    authorizedStudents: ['小画家阿橙', '多多'],
    cover: 'linear-gradient(135deg, #36bffa, #a7f3d0)',
    icon: '标',
    description: '为咖啡店、甜品店、花店等实体商家设计一个容易记住的图形LOGO。',
    videoUrl: 'mock://video/logo-design',
    pptPages: [
      { title: '什么是LOGO', body: 'LOGO 是一个品牌最容易被记住的图形符号。' },
      { title: '找出品牌特点', body: '从商品、名字、颜色、顾客感受中提取设计元素。' },
      { title: '简化图形', body: '优秀LOGO通常简单、清楚、容易识别。' },
    ],
    questions: [
      '你要帮哪一种店设计LOGO？',
      '这个LOGO里最重要的图形是什么？',
      '你希望它看起来活泼、温暖还是酷一点？',
    ],
  },
  {
    id: 'course-ip-001',
    title: '原创IP形象设计',
    category: 'ip',
    difficulty: '全难度',
    ageRange: '6-13岁',
    status: 'published',
    authorizedClasses: ['AI创意美术A班', '低龄启蒙班'],
    authorizedStudents: ['小画家阿橙', '晨晨', '可可', '多多'],
    cover: 'linear-gradient(135deg, #f472b6, #c084fc)',
    icon: 'IP',
    description: '把一个品牌或故事变成可爱的原创角色，设计外形、表情、动作和颜色。',
    videoUrl: 'mock://video/ip-character',
    pptPages: [
      { title: '角色从哪里来', body: '角色可以来自动物、植物、食物、工具或一个小故事。' },
      { title: '设计性格', body: '先想清楚它是勇敢、害羞、聪明还是调皮。' },
      { title: '画出标志特征', body: '给角色设计一个别人一眼能记住的特点。' },
    ],
    questions: [
      '你的角色叫什么名字？',
      '它有什么特别的性格？',
      '它身上最容易被记住的特点是什么？',
      '你想让它出现在什么场景里？',
    ],
  },
]

const requirementPresets = {
  storefront: [
    { label: '尺寸规格', value: '横向门头画面，招牌文字清晰可读' },
    { label: '必备元素', value: '店名、招牌、入口、橱窗或产品符号' },
    { label: '形象来源', value: '从店铺商品、品牌名称和目标顾客中提取' },
    { label: '风格要求', value: '亲和、醒目，与店铺定位一致' },
    { label: '使用场景', value: '实体门店门头与品牌展示' },
  ],
  ip: [
    { label: '尺寸规格', value: '完整角色正面稿，保留放大与缩小识别度' },
    { label: '必备元素', value: '角色轮廓、表情、标志配件、主色' },
    { label: '形象来源', value: '从动物、植物、食物或品牌故事中提取' },
    { label: '风格要求', value: '造型简洁、特点明确、方便延展动作' },
    { label: '使用场景', value: '海报、周边、表情包和品牌宣传' },
  ],
  ad: [
    { label: '尺寸规格', value: '竖版海报构图，重点信息在首屏可见' },
    { label: '必备元素', value: '主标题、核心画面、品牌信息、行动提示' },
    { label: '形象来源', value: '从宣传对象、活动主题和目标人群中提取' },
    { label: '风格要求', value: '层级清晰、主题醒目、文字易读' },
    { label: '使用场景', value: '线上宣传海报与线下展示' },
  ],
}

const materialPresets = {
  storefront: [
    { id: 'storefront-line', type: 'lineart', title: '门头线稿', description: '招牌、窗户和入口结构参考', preview: '' },
    { id: 'storefront-image', type: 'image', title: '参考图片', description: '奶茶店门头构图参考', preview: '' },
    { id: 'storefront-color', type: 'palette', title: '配色表', description: '奶绿 / 木色 / 白色', preview: '' },
    { id: 'storefront-font', type: 'font', title: '招牌字体', description: '圆润亲和风格', preview: '' },
  ],
  ip: [
    { id: 'ip-line', type: 'lineart', title: '角色结构线稿', description: '头身比例与动作轮廓', preview: '' },
    { id: 'ip-image', type: 'image', title: '形象参考', description: '动物与品牌角色参考', preview: '' },
    { id: 'ip-color', type: 'palette', title: '角色配色', description: '主色 / 辅色 / 点缀色', preview: '' },
    { id: 'ip-font', type: 'font', title: '角色名称字体', description: '活泼、容易识别', preview: '' },
  ],
}

function normalizeRequirements(items, category) {
  const source = Array.isArray(items) && items.length ? items : (requirementPresets[category] || requirementPresets.storefront)
  return source.map((item) => ({ label: item?.label || '设计要求', value: item?.value || '' }))
}

function normalizeMaterials(items, category) {
  const source = Array.isArray(items) && items.length ? items : (materialPresets[category] || materialPresets.storefront)
  return source.map((item, index) => ({
    id: item?.id || `material-${Date.now()}-${index}`,
    type: item?.type || 'image',
    title: item?.title || `配套资料 ${index + 1}`,
    description: item?.description || item?.desc || '',
    preview: item?.preview || '',
  }))
}

function normalizeCourse(course = {}) {
  // 演示模式沿用原来的示例默认值；服务端模式下没填就是空，不能凭空塞示例班级 / 示例权限组（服务端会按名字去匹配真实班级）
  const demoDefaults = !SERVER_AUTH_MODE
  return {
    // 服务端的扩展字段（课程智能体人设、对话轮数、按班级 ID 授权等）原样保留，下面只规范已知字段
    ...course,
    id: course.id || `course-${Date.now()}`,
    title: course.title || '新的设计课程',
    category: course.category || 'project',
    difficulty: course.difficulty || '全难度',
    ageRange: course.ageRange || '6-13岁',
    status: course.status || 'draft',
    ownerId: course.ownerId || (demoDefaults ? 'tea-001' : ''),
    ownerName: course.ownerName || (demoDefaults ? '王讲师' : ''),
    ownerRole: course.ownerRole || 'teacher',
    authorizedGroupIds: Array.isArray(course.authorizedGroupIds) ? [...new Set(course.authorizedGroupIds)] : (demoDefaults ? ['group-course-teachers'] : []),
    authorizedClasses: Array.isArray(course.authorizedClasses) ? [...new Set(course.authorizedClasses)] : (demoDefaults ? ['AI创意美术A班'] : []),
    authorizedStudents: Array.isArray(course.authorizedStudents) ? [...new Set(course.authorizedStudents)] : (demoDefaults ? ['小画家阿橙'] : []),
    authorizedClassIds: Array.isArray(course.authorizedClassIds) ? [...new Set(course.authorizedClassIds.filter(Boolean))] : [],
    authorizedOrganization: course.authorizedOrganization === true,
    cover: course.cover || 'linear-gradient(135deg, #ff7a00, #ffd166)',
    coverAssetId: course.coverAssetId || '',
    coverFileName: course.coverFileName || '',
    coverPrompt: course.coverPrompt || '',
    icon: course.icon || '课',
    description: course.description || '',
    videoUrl: course.videoUrl || 'mock://video/course',
    videoAssetId: course.videoAssetId || '',
    videoFileName: course.videoFileName || '',
    pptAssetId: course.pptAssetId || '',
    pptFileName: course.pptFileName || '',
    pptPdfUrl: course.pptPdfUrl || '',
    pptSlideImages: Array.isArray(course.pptSlideImages) ? course.pptSlideImages : [],
    documentFileName: course.documentFileName || '',
    pptPages: course.pptPages?.length ? course.pptPages : [{ title: '课程导入', body: '这里展示讲师上传的PPT内容。' }],
    questions: course.questions?.length ? course.questions.map(normalizeQuestion) : [normalizeQuestion('看完课程后，你最想设计什么？')],
    designRequirements: normalizeRequirements(course.designRequirements, course.category || 'project'),
    materials: normalizeMaterials(course.materials, course.category || 'project'),
    h5ReportSettings: {
      selectionMode: course.h5ReportSettings?.selectionMode === 'student' ? 'student' : 'auto',
      allowedTemplateIds: Array.isArray(course.h5ReportSettings?.allowedTemplateIds)
        ? [...new Set(course.h5ReportSettings.allowedTemplateIds.filter(Boolean))]
        : [],
      defaultTemplateId: String(course.h5ReportSettings?.defaultTemplateId || ''),
    },
    createdAt: course.createdAt || new Date().toISOString(),
    updatedAt: course.updatedAt || new Date().toISOString(),
  }
}

function normalizeQuestion(question = {}) {
  if (typeof question === 'string') {
    return {
      type: 'choice',
      title: question,
      options: ['记录你的设计灵感', '语音转文字', '高饱和装饰', '忽略课程主题'],
      answer: 'A',
    }
  }
  return {
    type: 'choice',
    title: question.title || question.text || '这节课最重要的设计重点是什么？',
    options: Array.isArray(question.options) && question.options.length ? question.options.slice(0, 4) : ['突出品牌特点', '随便装饰', '只写文字', '忽略主题要求'],
    answer: question.answer || 'A',
  }
}

function readCourses() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return seedCourses.map(normalizeCourse)
  try {
    return JSON.parse(raw).map(normalizeCourse)
  } catch {
    return seedCourses.map(normalizeCourse)
  }
}

// 浏览器里真正存过的课程（有这个键才算）；内置示例课不往服务端搬
function readSavedLocalCourses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// 旧版本一保存就把内置示例课也写进了浏览器：没改过的示例课不搬（改过的算老师的成果，照搬）
const SEED_COURSE_IDS = new Set(seedCourses.map((course) => course.id))
function isUntouchedSeedCourse(course) {
  if (!SEED_COURSE_IDS.has(course.id)) return false
  const created = Date.parse(course.createdAt || '')
  const updated = Date.parse(course.updatedAt || '')
  return !Number.isFinite(created) || !Number.isFinite(updated) || Math.abs(updated - created) < 5000
}

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}

function viewerKey(user) {
  return user?.id ? `${user.organization?.id || ''}:${user.id}` : ''
}

function newCourseId() {
  return `course-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// 发给服务端的课程数据：去掉服务端自己管的字段
function courseBody(course = {}) {
  const { version, ...body } = course
  return body
}

let pendingLoad = null
let pendingLoadFor = ''

export const useCourseStore = defineStore('course', {
  state: () => ({
    courses: SERVER_AUTH_MODE ? [] : readCourses(),
    // 服务端模式：courses 是当前账号能看到的课程；loadedFor 记是谁的，换了账号要重新拉
    loaded: !SERVER_AUTH_MODE,
    loading: false,
    loadError: '',
    loadedFor: '',
    currentStudent: '小画家阿橙',
    currentClass: 'AI创意美术A班',
  }),
  getters: {
    serverMode: () => SERVER_AUTH_MODE,
    publishedCourses: (state) => state.courses.filter((course) => course.status === 'published'),
    coursesForTeacher: (state) => (teacherId, groupIds = []) => {
      // 服务端已经按「本人建的 + 授权到所在权限组的」过滤好了
      if (SERVER_AUTH_MODE) return state.courses
      const groupSet = new Set(groupIds)
      return state.courses.filter((course) => (
        course.ownerId === teacherId
        || (course.authorizedGroupIds || []).some((groupId) => groupSet.has(groupId))
      ))
    },
    authorizedCourses() {
      // 服务端模式：小画家拿到的本来就是「已发布且授权给他」的课
      if (SERVER_AUTH_MODE) return this.publishedCourses
      return this.publishedCourses.filter((course) => (
        course.authorizedClasses.includes(this.currentClass) || course.authorizedStudents.includes(this.currentStudent)
      ))
    },
  },
  actions: {
    persist() {
      if (SERVER_AUTH_MODE) return
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.courses))
    },
    /** 拉当前账号能看到的课程。失败不抛错，错误放在 loadError 里给页面显示。 */
    async load({ force = false } = {}) {
      if (!SERVER_AUTH_MODE) return this.courses
      const user = useUserStore().user
      const key = viewerKey(user)
      if (!key) {
        this.clearServerData()
        return []
      }
      // 换了账号：先清掉上一个账号的课程，免得新页面闪一下别人的数据
      if (this.loadedFor && this.loadedFor !== key) this.clearServerData()
      if (!force && this.loaded && this.loadedFor === key) return this.courses
      if (pendingLoad && pendingLoadFor === key) return pendingLoad
      pendingLoadFor = key
      this.loading = true
      this.loadError = ''
      pendingLoad = (async () => {
        try {
          const { data } = await apiClient.get('/courses', { timeout: 15000 })
          if (viewerKey(useUserStore().user) !== key) return []
          this.courses = (data.courses || []).map(normalizeCourse)
          this.loaded = true
          this.loadedFor = key
          if (['admin', 'teacher'].includes(user.role)) await this.migrateLocalCourses(user)
          return this.courses
        } catch (error) {
          this.loadError = errorMessage(error, '课程加载失败，请稍后刷新重试')
          return this.courses
        } finally {
          this.loading = false
          pendingLoad = null
          pendingLoadFor = ''
        }
      })()
      return pendingLoad
    },
    clearServerData() {
      if (!SERVER_AUTH_MODE) return
      this.courses = []
      this.loaded = false
      this.loadedFor = ''
      this.loadError = ''
    },
    // 旧版本课程只存在浏览器里：服务端模式下第一次打开时搬上去一次（每个机构 + 账号一次）。
    // 管理员搬全部，讲师只搬自己建的；服务端按课程 ID 去重（已存在就按更新处理），不会重复。
    async migrateLocalCourses(user) {
      const flag = `${MIGRATED_KEY_PREFIX}:${viewerKey(user)}`
      if (localStorage.getItem(flag)) return 0
      const known = new Set(this.courses.map((course) => course.id))
      const uploads = readSavedLocalCourses()
        .filter((course) => course?.id && String(course.title || '').trim())
        .filter((course) => !isUntouchedSeedCourse(course))
        .filter((course) => user.role === 'admin' || course.ownerId === user.id)
        .filter((course) => !known.has(course.id))
      let moved = 0
      for (const course of uploads) {
        const body = courseBody(course)
        // 老数据里的归属是演示账号（tea-001 这种），服务端没有这个人：管理员搬上去的就记在管理员名下
        if (user.role === 'admin' && !String(body.ownerId || '').startsWith('usr_')) {
          Object.assign(body, { ownerId: user.id, ownerName: user.name || '', ownerRole: 'admin' })
        }
        try {
          await apiClient.post('/courses', body, { timeout: 20000 })
          moved += 1
        } catch (error) {
          // 这次没搬完就不打标记，下次打开再试；已经搬上去的按 ID 去重
          console.warn('[courses] 本机课程搬到服务端失败：', course.id, errorMessage(error, ''))
          return moved
        }
      }
      localStorage.setItem(flag, new Date().toISOString())
      if (moved) {
        const { data } = await apiClient.get('/courses', { timeout: 15000 })
        this.courses = (data.courses || []).map(normalizeCourse)
      }
      return moved
    },
    async createCourse(payload = {}) {
      const now = new Date().toISOString()
      // 总是新 ID：「复制课程」传进来的是原课程，沿用原 ID 会把原课程覆盖掉
      const course = normalizeCourse({ ...payload, id: newCourseId(), status: 'published', createdAt: now, updatedAt: now })
      if (!SERVER_AUTH_MODE) {
        this.courses.unshift(course)
        this.persist()
        return course
      }
      try {
        const { data } = await apiClient.post('/courses', courseBody(course), { timeout: 20000 })
        const saved = normalizeCourse(data.course)
        this.courses = [saved, ...this.courses.filter((item) => item.id !== saved.id)]
        return saved
      } catch (error) {
        throw new Error(errorMessage(error, '课程保存失败，请稍后重试'))
      }
    },
    async updateCourse(id, patch = {}) {
      const index = this.courses.findIndex((course) => course.id === id)
      if (index < 0) return null
      if (!SERVER_AUTH_MODE) {
        const course = normalizeCourse({ ...this.courses[index], ...patch, updatedAt: new Date().toISOString() })
        this.courses.splice(index, 1, course)
        this.persist()
        return course
      }
      try {
        const { id: ignoredId, ...rest } = courseBody(patch)
        const { data } = await apiClient.patch(`/courses/${encodeURIComponent(id)}`, rest, { timeout: 20000 })
        const saved = normalizeCourse(data.course)
        const at = this.courses.findIndex((course) => course.id === id)
        if (at >= 0) this.courses.splice(at, 1, saved)
        return saved
      } catch (error) {
        throw new Error(errorMessage(error, '课程保存失败，请稍后重试'))
      }
    },
    /** 只改页面里这份课程数据、不保存到服务端（例如小画家端把 PDF 转出来的图片缓存起来） */
    patchLocal(id, patch = {}) {
      const index = this.courses.findIndex((course) => course.id === id)
      if (index < 0) return null
      const course = { ...this.courses[index], ...patch }
      this.courses.splice(index, 1, course)
      this.persist()
      return course
    },
    async bulkUpdateStatus(ids = [], status = 'published') {
      const list = [...new Set(ids)].filter(Boolean)
      if (!list.length) return 0
      if (!SERVER_AUTH_MODE) {
        let updated = 0
        for (const id of list) if (await this.updateCourse(id, { status })) updated += 1
        return updated
      }
      try {
        const { data } = await apiClient.post('/courses/bulk-status', { ids: list, status }, { timeout: 30000 })
        await this.load({ force: true })
        return Number(data.updated) || 0
      } catch (error) {
        throw new Error(errorMessage(error, '批量修改失败，请稍后重试'))
      }
    },
    async deleteCourse(id) {
      if (!SERVER_AUTH_MODE) {
        const before = this.courses.length
        this.courses = this.courses.filter((course) => course.id !== id)
        if (this.courses.length !== before) {
          this.persist()
          return true
        }
        return false
      }
      try {
        await apiClient.delete(`/courses/${encodeURIComponent(id)}`, { timeout: 15000 })
        this.courses = this.courses.filter((course) => course.id !== id)
        return true
      } catch (error) {
        throw new Error(errorMessage(error, '删除失败，请稍后重试'))
      }
    },
    async deleteCourses(ids = []) {
      const idSet = new Set(ids.filter(Boolean))
      if (!idSet.size) return 0
      if (!SERVER_AUTH_MODE) {
        const before = this.courses.length
        this.courses = this.courses.filter((course) => !idSet.has(course.id))
        const removed = before - this.courses.length
        if (removed) this.persist()
        return removed
      }
      try {
        const { data } = await apiClient.post('/courses/bulk-delete', { ids: [...idSet] }, { timeout: 30000 })
        await this.load({ force: true })
        return Number(data.removed) || 0
      } catch (error) {
        throw new Error(errorMessage(error, '删除失败，请稍后重试'))
      }
    },
  },
})
