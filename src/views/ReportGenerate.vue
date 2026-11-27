<template>
  <main class="report-page app-page" :class="[`difficulty-${difficulty}`, `template-${config.template}`]">
    <header class="phase-header">
      <button class="back-btn" @click="router.push('/student/reports')">返回</button>
      <div>
        <h1>项目创作报告编辑器</h1>
        <p>{{ form.title }}</p>
      </div>
      <span class="difficulty-pill">{{ difficultyLabel }}</span>
    </header>

    <section class="report-grid">
      <aside class="report-panel">
        <div class="panel-head">
          <strong>报告生成设置</strong>
          <small>素材自动同步</small>
        </div>
        <div class="report-scroll">
          <section class="config-block">
            <button class="block-title" type="button" @click="toggleBlock('base')">
              <span>模块1：报告基础设置</span>
              <strong>{{ isOpen('base') ? '收起' : '展开' }}</strong>
            </button>
            <div v-if="isOpen('base')" class="block-body">
              <label>
                自定义报告名称
                <input v-model="form.title" :readonly="difficulty === 'junior'" @input="syncConfig" />
              </label>

              <div class="radio-row">
                <label v-for="item in reportTypes" :key="item.value" :class="{ locked: item.locked }">
                  <input v-model="config.range" type="radio" :value="item.value" :disabled="item.locked" @change="syncConfig" />
                  {{ item.label }}
                </label>
              </div>

              <div class="template-grid">
                <button v-for="item in templates" :key="item.id" type="button" :disabled="item.locked" :class="{ active: config.template === item.id }" @click="selectTemplate(item.id)">
                  <span>{{ item.name }}</span>
                  <small>{{ item.locked ? item.lockText : item.desc }}</small>
                </button>
              </div>

              <div class="chapter-grid">
                <label v-for="item in chapterOptions" :key="item.key" :class="{ locked: item.locked }">
                  <input v-model="config.chapters[item.key]" type="checkbox" :disabled="item.locked" @change="syncConfig" />
                  {{ item.label }}
                </label>
              </div>

              <div v-if="difficulty === 'pro'" class="custom-page-row">
                <input v-model="customPageTitle" placeholder="新增空白页面标题" />
                <button type="button" @click="addCustomPage">新增页面</button>
              </div>
            </div>
          </section>

          <section class="config-block">
            <button class="block-title" type="button" @click="toggleBlock('materials')">
              <span>模块2：项目素材自动载入区</span>
              <strong>{{ isOpen('materials') ? '收起' : '展开' }}</strong>
            </button>
            <div v-if="isOpen('materials')" class="block-body material-list">
              <article v-for="group in materialGroups" :key="group.key">
                <div>
                  <strong>{{ group.title }}</strong>
                  <p>{{ group.desc }}</p>
                </div>
                <label>
                  <input v-model="config.materials[group.key]" type="checkbox" :disabled="materialLocked" @change="syncConfig" />
                  纳入报告
                </label>
              </article>
            </div>
          </section>

          <section class="config-block">
            <button class="block-title" type="button" @click="toggleBlock('copy')">
              <span>模块3：AI自动整合文案</span>
              <strong>{{ isOpen('copy') ? '收起' : '展开' }}</strong>
            </button>
            <div v-if="isOpen('copy')" class="block-body">
              <BaseButton block :loading="organizing" @click="organizeAllText">AI一键整合全部文字</BaseButton>
              <div class="ai-copy-list">
                <article v-for="item in aiSections" :key="item.key">
                  <div class="copy-title">
                    <h3>{{ item.title }}</h3>
                    <BaseButton variant="text" @click="rewriteAiText(item.key)">AI重写</BaseButton>
                  </div>
                  <textarea v-if="canEditAiText" v-model="form.aiText[item.key]" @input="syncConfig" />
                  <p v-else>{{ form.aiText[item.key] }}</p>
                </article>
              </div>
            </div>
          </section>

          <section class="config-block">
            <button class="block-title" type="button" @click="toggleBlock('extra')">
              <span>模块4：附加折叠设置</span>
              <strong>{{ isOpen('extra') ? '收起' : '展开' }}</strong>
            </button>
            <div v-if="isOpen('extra')" class="block-body">
              <div class="switch-grid">
                <label><input v-model="config.logoWatermark" type="checkbox" @change="syncConfig" /> 机构LOGO水印</label>
                <label><input v-model="config.studentWatermark" type="checkbox" @change="syncConfig" /> 用户信息水印</label>
              </div>
              <label>
                讲师评语
                <textarea v-model="form.teacherComment" placeholder="讲师后台可同步修改评语与打分。" @input="syncConfig" />
              </label>
              <label>
                导出画质
                <select v-model="config.exportQuality" @change="syncConfig">
                  <option value="print">PDF高清黑白打印</option>
                  <option value="share">移动端长图分享</option>
                  <option value="ultra" :disabled="difficulty === 'junior'">4K高清导出</option>
                </select>
              </label>
            </div>
          </section>
        </div>

        <div class="fixed-generate">
          <BaseButton block :loading="generating" :disabled="generating" @click="generateReport">一键生成完整报告</BaseButton>
          <p>{{ progressText }}</p>
        </div>
      </aside>

      <aside class="page-rail">
        <div class="rail-head">页面</div>
        <button
          v-for="(page, index) in previewPages"
          :key="`${page.title}-${index}`"
          type="button"
          :class="{ active: currentPageIndex === index }"
          @click="currentPageIndex = index"
        >
          <span>{{ index + 1 }}</span>
          <strong>{{ page.title }}</strong>
        </button>
      </aside>

      <section class="report-stage">
        <div class="canvas-toolbar">
          <span>编辑画布</span>
          <div>
            <button type="button">选择</button>
            <button type="button">文本</button>
            <button type="button">图片</button>
            <button type="button">布局</button>
          </div>
        </div>
        <div class="preview-top">
          <button type="button" :disabled="currentPageIndex === 0" @click="currentPageIndex -= 1">‹</button>
          <strong>第 {{ currentPageIndex + 1 }} 页 / 共 {{ previewPages.length || 1 }} 页</strong>
          <button type="button" :disabled="currentPageIndex >= previewPages.length - 1" @click="currentPageIndex += 1">›</button>
        </div>

        <div ref="reportEl" class="ppt-window">
          <article class="ppt-slide" :style="{ background: currentPage.visual || undefined }">
            <span class="page-index">{{ currentPageIndex + 1 }}/{{ previewPages.length }}</span>
            <span class="chapter-label">{{ currentPage.title }}</span>
            <h2>{{ currentPage.subtitle }}</h2>
            <p>{{ currentPage.body }}</p>
            <div class="slide-footer">
              <span v-if="config.logoWatermark">机构LOGO</span>
              <span v-if="config.studentWatermark">小画家阿橙 · AI创意美术课</span>
            </div>
          </article>
        </div>

        <div class="export-bar" :class="{ locked: !reportReady }">
          <BaseButton v-if="showPptExport" variant="secondary" :disabled="!reportReady || exporting" :loading="exporting === 'ppt'" @click="exportPpt">导出可编辑PPT</BaseButton>
          <BaseButton variant="secondary" :disabled="!reportReady || exporting" :loading="exporting === 'pdf'" @click="exportPdf">高清PDF</BaseButton>
          <BaseButton variant="secondary" :disabled="!reportReady || exporting" @click="mockExport('长图')">长图</BaseButton>
          <BaseButton v-if="difficulty !== 'junior'" variant="secondary" :disabled="!reportReady || exporting" @click="mockExport('分享海报')">分享海报</BaseButton>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
import { createEmptyProject, useProjectStore } from '../stores/projectStore'
import { useDifficultyStore } from '../stores/difficultyStore'
import { apiClient } from '../services/apiClient'

const CACHE_KEY = 'art-studio-report-editor-cache'
const API_MODE = import.meta.env.VITE_AI_MODE || 'mock'
const router = useRouter()
const projectStore = useProjectStore()
const difficultyStore = useDifficultyStore()
const reportEl = ref(null)
const generating = ref(false)
const organizing = ref(false)
const exporting = ref('')
const reportGenerated = ref(false)
const currentPageIndex = ref(0)
const customPageTitle = ref('')
const progressText = ref('模板切换与左侧修改会实时同步右侧预览。')
const project = reactive(createEmptyProject())
const difficulty = computed(() => difficultyStore.current)
const openBlocks = reactive({ base: true, materials: false, copy: false, extra: false })
const form = reactive({
  title: '我的项目完整创作报告',
  teacherComment: '',
  aiText: {
    understanding: '等待 AI 整理项目理解。',
    sketch: '等待 AI 梳理草图构思。',
    iteration: '等待 AI 汇总迭代修改思路。',
    finalDesign: '等待 AI 整合成品设计说明。',
    videoScript: '等待 AI 整理视频分镜剧本。',
  },
})
const config = reactive({
  range: 'single',
  template: 'cartoon',
  exportQuality: 'print',
  logoWatermark: true,
  studentWatermark: true,
  customPages: [],
  chapters: {
    cover: true,
    understanding: true,
    sketch: true,
    iteration: true,
    finalDesign: true,
    aiReview: true,
    teacher: true,
    backCover: true,
  },
  materials: {
    course: true,
    sketches: true,
    lineart: true,
    versions: true,
    models3d: true,
    videos: true,
    texts: true,
  },
})

const difficultyLabelMap = { junior: '初级版', starter: '入门版', advanced: '进阶版', pro: '高级版' }
const difficultyLabel = computed(() => difficultyLabelMap[difficulty.value] || '入门版')
const materialLocked = computed(() => difficulty.value === 'junior')
const canEditAiText = computed(() => ['advanced', 'pro'].includes(difficulty.value))
const showPptExport = computed(() => ['advanced', 'pro'].includes(difficulty.value))
const reportReady = computed(() => reportGenerated.value && previewPages.value.length > 0)

const reportTypes = computed(() => [
  { label: '单项目报告', value: 'single', locked: false },
  { label: '多课程合集报告', value: 'course', locked: !['advanced', 'pro'].includes(difficulty.value) },
])
const templates = computed(() => {
  const all = [
    { id: 'cartoon', name: '卡通童趣', desc: '适合低龄课堂展示' },
    { id: 'homework', name: '简约作业', desc: '清晰提交版' },
    { id: 'portfolio', name: '专业作品集', desc: '完整项目归档' },
    { id: 'brand', name: '机构品牌版', desc: 'LOGO水印与品牌页' },
  ]
  return all.map((item, index) => ({
    ...item,
    locked: difficulty.value === 'junior' ? index > 0 : difficulty.value === 'starter' ? index > 1 : false,
    lockText: difficulty.value === 'junior' ? '初级版仅开放卡通模板' : '进阶版解锁',
  }))
})
const chapterOptions = computed(() => {
  const names = [
    ['cover', '封面'],
    ['understanding', '课程项目理解'],
    ['sketch', '草图线稿对比'],
    ['iteration', '迭代修改流程'],
    ['finalDesign', '成品创意说明'],
    ['aiReview', 'AI专业点评'],
    ['teacher', '讲师评语'],
    ['backCover', '封底'],
  ]
  return names.map(([key, label]) => ({
    key,
    label,
    locked: difficulty.value === 'junior' || (difficulty.value === 'starter' && ['cover', 'backCover'].includes(key)),
  }))
})
const materialGroups = computed(() => [
  { key: 'course', title: '课程学习素材', desc: courseMaterialDesc.value },
  { key: 'sketches', title: '草图', desc: project.sketchOriginal ? '已载入原始拍照草图。' : '暂无草图，保留接口同步位。' },
  { key: 'lineart', title: '线稿', desc: project.sketchOptimized ? '已载入 AI 优化线稿。' : '暂无线稿，生成后自动同步。' },
  { key: 'versions', title: 'AI迭代图', desc: `已载入 ${project.versions?.length || 0} 张迭代作品。` },
  { key: 'models3d', title: '3D模型', desc: `已载入 ${project.models3d?.length || 0} 个 3D 项目素材。` },
  { key: 'videos', title: 'AI视频', desc: `已载入 ${project.videos?.length || 0} 条 AI 视频素材。` },
  { key: 'texts', title: '创作文本', desc: project.ideaSummary || project.prompt || '暂无创作文本，AI会按项目名称补齐。' },
])
const aiSections = computed(() => {
  const base = [
    { key: 'understanding', title: '项目理解' },
    { key: 'sketch', title: '草图构思' },
    { key: 'iteration', title: '迭代修改思路' },
    { key: 'finalDesign', title: '成品设计说明' },
  ]
  if (project.videos?.length && ['advanced', 'pro'].includes(difficulty.value)) base.push({ key: 'videoScript', title: '视频分镜剧本' })
  return base
})
const previewPages = computed(() => buildPages())
const currentPage = computed(() => previewPages.value[currentPageIndex.value] || { title: '报告预览', subtitle: '等待生成', body: '点击左侧“一键生成完整报告”。' })
const courseMaterialDesc = computed(() => {
  if (!project.courseTitle) return '暂无课程学习素材，从课程中心开始项目后会自动写入。'
  const answerCount = project.courseAnswers?.length || 0
  const ideaCount = [project.courseIdeaText, project.courseIdeaVoiceText].filter(Boolean).length
  return `已载入《${project.courseTitle}》、${answerCount} 条引导问答、${ideaCount} 条创意想法。`
})

onMounted(async () => {
  const source = projectStore.currentProject || projectStore.draft || createEmptyProject(difficulty.value)
  Object.assign(project, source)
  form.title = `${source.title || '我的项目'}完整创作报告`
  restoreCache()
  applyDifficultyDefaults()
  await organizeAllText()
  syncConfig()
})

watch(difficulty, () => {
  applyDifficultyDefaults()
  syncConfig()
})
watch(previewPages, () => {
  if (currentPageIndex.value > previewPages.value.length - 1) currentPageIndex.value = Math.max(previewPages.value.length - 1, 0)
})

function isOpen(key) { return openBlocks[key] }
function toggleBlock(key) {
  const willOpen = !openBlocks[key]
  Object.keys(openBlocks).forEach((item) => {
    openBlocks[item] = item === key ? willOpen : false
  })
}
function applyDifficultyDefaults() {
  if (difficulty.value === 'junior') {
    config.range = 'single'
    config.template = 'cartoon'
    Object.keys(config.chapters).forEach((key) => { config.chapters[key] = true })
    Object.keys(config.materials).forEach((key) => { config.materials[key] = true })
  }
  if (difficulty.value === 'starter' && !['cartoon', 'homework'].includes(config.template)) config.template = 'cartoon'
}
function restoreCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    if (raw.projectId !== project.id) return
    Object.assign(config, raw.config || {})
    Object.assign(form, raw.form || {})
  } catch {}
}
function cacheEditor() {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ projectId: project.id, config, form }))
}
function syncConfig() {
  project.reportConfig = { ...config }
  project.ideaSummary = form.aiText.finalDesign
  projectStore.setCurrentProject({ ...project })
  cacheEditor()
  reportGenerated.value = false
}
function selectTemplate(template) {
  const target = templates.value.find((item) => item.id === template)
  if (target?.locked) {
    ElMessage.warning(target.lockText)
    return
  }
  config.template = template
  syncConfig()
}
function addCustomPage() {
  if (!customPageTitle.value.trim()) return
  config.customPages.push({ title: customPageTitle.value.trim(), body: '自定义空白页面，可在高级版自由排版。' })
  customPageTitle.value = ''
  syncConfig()
}
async function organizeAllText() {
  organizing.value = true
  progressText.value = '正在读取项目素材并整理文案...'
  await new Promise((resolve) => setTimeout(resolve, 450))
  const versionText = (project.versions || []).map((item, index) => `V${index + 1}：${item.note || item.title}`).join('；') || '暂未生成多个版本'
  const final = finalVersion()
  const promptText = project.prompt || final?.prompt || '创意美术主题'
  const providerText = final?.provider ? `生成来源：${final.provider}` : '生成来源：Mock演示'
  const courseAnswerText = (project.courseAnswers || [])
    .map((item, index) => `${index + 1}. ${item.question}：${item.answer || '暂未填写'}`)
    .join('；')
  const courseIdea = [project.courseIdeaText, project.courseIdeaVoiceText].filter(Boolean).join('；')
  form.aiText.understanding = project.courseTitle
    ? `本次项目来自课程《${project.courseTitle}》。课程主题说明：${project.courseDescription || '讲师上传的趣味设计项目'}。用户课堂问答：${courseAnswerText || '暂未填写问答'}。用户创意想法：${courseIdea || '暂未填写创意想法'}。最终创作提示词：${promptText}。`
    : `${project.title || '当前项目'}围绕“${promptText}”展开。报告已读取用户输入的提示词、创作主题、生成版本和最终作品，用于检查前端链路是否按要求传递数据。`
  form.aiText.sketch = project.sketchOriginal ? '用户先用纸笔完成草图，再通过 AI 扫描优化为清晰线稿，保留了原创造型和课堂创作过程。' : '本项目暂未载入手绘草图，报告将重点呈现文字构思与 AI 迭代过程。'
  form.aiText.iteration = `创作迭代记录：${versionText}。当前共有 ${(project.versions || []).length} 个生成版本，${providerText}。每一轮围绕主体造型、色彩层次和细节完整度进行调整。`
  form.aiText.finalDesign = `最终作品“${final?.title || project.title || 'AI创意作品'}”来自提示词：“${promptText}”。画面主题、风格和参数已随项目保存，适合继续生成报告、视频或作品集归档。`
  form.aiText.videoScript = project.videos?.length ? '视频分镜包含开场、主体运动、细节特写和结尾展示，可继续写入提示词与运镜参数。' : '当前项目暂无 AI 视频素材。'
  progressText.value = 'AI文案已整理，右侧预览已同步。'
  organizing.value = false
  syncConfig()
}
function rewriteAiText(key) {
  form.aiText[key] = `${form.aiText[key]}（AI已重新整理为更清晰的报告表达。）`
  syncConfig()
}
async function generateReport() {
  generating.value = true
  progressText.value = '正在自动排版封面、过程页和成品说明...'
  await new Promise((resolve) => setTimeout(resolve, 520))
  let pages = previewPages.value
  let reportProvider = 'local'
  if (['api', 'auto'].includes(API_MODE)) {
    try {
      progressText.value = '正在请求后端报告生成接口...'
      const response = await apiClient.post('/report/generate', { project, config, form })
      if (Array.isArray(response.data?.pages) && response.data.pages.length) {
        pages = response.data.pages
        reportProvider = response.data.provider || 'api'
      }
    } catch (error) {
      if (API_MODE === 'api') {
        progressText.value = error?.response?.data?.message || error.message || '后端报告生成失败。'
        generating.value = false
        return
      }
      reportProvider = 'local-fallback'
    }
  }
  const saved = projectStore.saveReport(project.id, {
    title: form.title,
    type: config.range,
    course: 'AI创意美术课',
    template: config.template,
    pages,
    cover: finalVisual(),
    materialTypes: materialTypes(reportProvider),
    materialStats: materialStats(),
  })
  progressText.value = saved ? `报告已生成并归档到作品集「项目报告」。生成来源：${reportProvider}。` : '报告生成失败，请重试。'
  reportGenerated.value = Boolean(saved)
  if (saved) ElMessage.success('完整报告已生成并保存')
  generating.value = false
}
function buildPages() {
  const pages = []
  const final = finalVersion()
  const add = (key, page) => { if (config.chapters[key]) pages.push(page) }
  add('cover', { title: '封面', subtitle: form.title, body: `用户：小画家阿橙｜课程：${project.courseTitle || 'AI创意美术课'}｜项目报告`, visual: finalVisual() })
  add('understanding', { title: '课程项目理解', subtitle: '从课程目标到创作方向', body: form.aiText.understanding })
  add('sketch', { title: '草图线稿对比', subtitle: '原始草图与AI优化线稿', body: form.aiText.sketch })
  add('iteration', { title: '迭代修改流程', subtitle: '从初稿到终稿的修改记录', body: form.aiText.iteration })
  add('finalDesign', { title: '成品创意说明', subtitle: final?.title || '最终作品展示', body: form.aiText.finalDesign, visual: finalVisual() })
  if (project.models3d?.length && ['advanced', 'pro'].includes(difficulty.value)) pages.push({ title: '3D模型展示', subtitle: '多角度结构与厚度参数', body: '展示3D作品预览、厚度、旋转角度和课堂展示说明。' })
  if (project.videos?.length && ['advanced', 'pro'].includes(difficulty.value)) pages.push({ title: 'AI视频分镜', subtitle: '镜头脚本与运镜参数', body: form.aiText.videoScript })
  add('aiReview', { title: 'AI专业点评', subtitle: '构图、色彩、创意亮点', body: '主体突出，构图清楚，色彩明亮。下一步可继续增强背景故事、角色动作和材质细节。' })
  add('teacher', { title: '讲师评语', subtitle: '课堂评价与成长建议', body: form.teacherComment || '讲师评语：________________\n评分：☆☆☆☆☆\n讲师签字：________' })
  add('backCover', { title: '封底', subtitle: 'AI辅助创意项目创作报告', body: '机构LOGO / 品牌标语 / 分享二维码预留' })
  config.customPages.forEach((page) => pages.splice(Math.max(pages.length - 1, 0), 0, { title: '自定义页面', subtitle: page.title, body: page.body }))
  return pages
}
function finalVersion() {
  return project.versions?.find((item) => item.id === project.finalVersionId) || project.versions?.[0]
}
function finalVisual() {
  return finalVersion()?.background || project.cover || 'linear-gradient(135deg, #ff7a00, #ffd166)'
}
function materialTypes(provider = 'local') {
  const types = ['painting']
  if (project.courseTitle) types.push('course')
  if (project.models3d?.length) types.push('model3d')
  if (project.videos?.length) types.push('video')
  if (config.range !== 'single') types.push('collection')
  if (provider === 'api') types.push('api-report')
  return types
}
function materialStats() {
  return {
    sketches: project.sketchOriginal ? 1 : 0,
    versions: project.versions?.length || 0,
    models3d: project.models3d?.length || 0,
    videos: project.videos?.length || 0,
    course: project.courseTitle ? 1 : 0,
    texts: project.prompt || project.ideaSummary || project.courseIdeaText || project.courseIdeaVoiceText ? 1 : 0,
  }
}
async function exportPdf() {
  if (!reportEl.value) return
  exporting.value = 'pdf'
  try {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
    const canvas = await html2canvas(reportEl.value, { backgroundColor: '#ffffff', scale: 2 })
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height)
    pdf.save('AI项目创作报告.pdf')
  } finally {
    exporting.value = ''
  }
}
async function exportPpt() {
  exporting.value = 'ppt'
  try {
    const { default: pptxgen } = await import('pptxgenjs')
    const pptx = new pptxgen()
    pptx.layout = 'LAYOUT_WIDE'
    previewPages.value.forEach((page) => {
      const slide = pptx.addSlide()
      slide.background = { color: 'FFF7ED' }
      slide.addText(page.title, { x: 0.55, y: 0.35, w: 8.6, h: 0.35, fontSize: 18, bold: true, color: 'FF7A00' })
      slide.addText(page.subtitle, { x: 0.55, y: 0.88, w: 8.6, h: 0.55, fontSize: 26, bold: true, color: '202124' })
      slide.addText(page.body, { x: 0.65, y: 1.7, w: 8.0, h: 3.8, fontSize: 15, color: '3C4043' })
    })
    await pptx.writeFile({ fileName: 'AI项目创作报告.pptx' })
  } finally {
    exporting.value = ''
  }
}
function mockExport(type) {
  ElMessage.success(`${type}已生成，后续可接入后端渲染API`)
}
</script>

<style scoped lang="scss">
.report-page {
  max-width: 1366px;
  height: 100vh;
  min-height: 0;
  margin: 0 auto;
  padding: 0;
  overflow: hidden;
  background: #eef2f6;
  display: grid;
  grid-template-rows: 44px minmax(0, 1fr);
}
.phase-header,
.report-panel,
.page-rail,
.report-stage {
  border: 1px solid #d8dee8;
  border-radius: 0;
  background: #fff;
  box-shadow: none;
}
.phase-header {
  min-height: 44px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #17202d;
  border-color: #17202d;
  color: #fff;
}
.phase-header div { min-width: 0; }
.back-btn,
.preview-top button,
.custom-page-row button {
  min-height: 48px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 900;
}
.difficulty-pill {
  margin-left: auto;
  border-radius: 999px;
  padding: 6px 12px;
  background: rgba(255,255,255,.1);
  color: #fff;
  font-weight: 900;
}
h1, h2, h3 { margin: 0; color: var(--color-title); }
h1 { font-size: 14px; color: #fff; }
.phase-header p { margin: 2px 0 0; color: rgba(255,255,255,.72); font-size: 12px; }
p { color: var(--color-text); line-height: 1.6; margin: 6px 0 0; white-space: pre-line; }
.report-grid {
  margin-top: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: clamp(300px, 25vw, 330px) 108px minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
}
.report-panel {
  height: auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-head {
  min-height: 48px;
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  display: grid;
  align-content: center;
}
.panel-head strong { color: var(--color-title); font-size: 13px; }
.panel-head small { color: var(--color-muted); }
.report-scroll {
  flex: 1 1 auto;
  min-height: 0;
  padding: 10px;
  display: grid;
  align-content: start;
  gap: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,122,0,.72) rgba(255,243,230,.9);
  padding-bottom: 18px;
}
.config-block {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: visible;
  background: #fff;
}
.block-title {
  width: 100%;
  min-height: 42px;
  border: 0;
  padding: 0 10px;
  border-radius: 6px;
  background: #f8fafc;
  color: var(--color-title);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 900;
}
.block-title span {
  min-width: 0;
  line-height: 1.25;
}
.block-title strong {
  flex: 0 0 auto;
  color: var(--color-primary);
  white-space: nowrap;
}
.block-body {
  padding: 10px;
  display: grid;
  gap: 9px;
  max-height: calc(100vh - 218px);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,122,0,.68) rgba(255,243,230,.9);
}
label {
  min-width: 0;
  display: grid;
  gap: 5px;
  color: var(--color-title);
  font-weight: 800;
  font-size: 12px;
}
input, textarea, select {
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
}
input[type="checkbox"],
input[type="radio"] {
  width: 16px;
  height: 16px;
  min-height: 16px;
  padding: 0;
  accent-color: var(--color-primary);
}
textarea { min-height: 76px; resize: vertical; line-height: 1.5; }
.radio-row,
.template-grid,
.chapter-grid,
.switch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.radio-row label,
.chapter-grid label,
.switch-grid label {
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 7px 8px;
  grid-template-columns: auto 1fr;
  align-items: center;
}
.locked { opacity: .58; }
.template-grid button {
  min-height: 54px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: #fff;
  padding: 10px;
  text-align: left;
  cursor: pointer;
}
.template-grid button.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.template-grid span { display: block; font-weight: 900; }
.template-grid small { color: var(--color-muted); }
.custom-page-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.material-list article {
  min-height: 50px;
  border-radius: 6px;
  padding: 8px;
  background: #f9fafb;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px;
  gap: 8px;
  align-items: center;
}
.material-list article > div {
  min-width: 0;
}
.material-list strong {
  display: block;
  color: var(--color-title);
  font-size: 12px;
  line-height: 1.25;
}
.material-list p {
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}
.material-list label {
  min-width: 0;
  min-height: 32px;
  border-radius: 6px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: #fff;
  color: #64748b;
  font-size: 10px;
  line-height: 1.1;
  text-align: center;
}
.material-list label:has(input:checked) {
  color: var(--color-primary);
  background: #fff7ed;
}
.block-body::-webkit-scrollbar {
  width: 8px;
}
.block-body::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(255,243,230,.9);
}
.block-body::-webkit-scrollbar-thumb {
  border: 2px solid rgba(255,243,230,.9);
  border-radius: 999px;
  background: rgba(255,122,0,.68);
}
.ai-copy-list {
  display: grid;
  gap: 10px;
}
.ai-copy-list article {
  border-radius: 6px;
  padding: 9px;
  background: #f9fafb;
}
.copy-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fixed-generate {
  flex: 0 0 auto;
  padding: 10px;
  border-top: 1px solid var(--color-border);
  background: #fff;
}
.fixed-generate p {
  font-size: 13px;
  color: var(--color-muted);
  text-align: center;
}
.page-rail {
  height: auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  border-left: 0;
  border-right: 0;
}
.rail-head {
  min-height: 36px;
  padding: 10px;
  border-bottom: 1px solid #e5e7eb;
  color: var(--color-title);
  font-size: 12px;
  font-weight: 900;
}
.page-rail button {
  min-height: 78px;
  border: 0;
  border-bottom: 1px solid #e5e7eb;
  padding: 8px;
  background: #f8fafc;
  color: var(--color-title);
  cursor: pointer;
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 6px;
  align-items: start;
  text-align: left;
}
.page-rail button.active {
  background: #fff7ed;
  box-shadow: inset 3px 0 0 var(--color-primary);
}
.page-rail span {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: #e5e7eb;
  color: #475569;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 900;
}
.page-rail button.active span {
  background: var(--color-primary);
  color: #fff;
}
.page-rail strong {
  font-size: 11px;
  line-height: 1.35;
}
.report-stage {
  height: auto;
  min-height: 0;
  padding: 0;
  display: grid;
  grid-template-rows: 40px 42px minmax(0, 1fr) 58px;
  gap: 0;
  align-content: stretch;
  background: #f3f6fa;
}
.report-scroll::-webkit-scrollbar,
.page-rail::-webkit-scrollbar {
  width: 10px;
}
.report-scroll::-webkit-scrollbar-track,
.page-rail::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(255,243,230,.9);
}
.report-scroll::-webkit-scrollbar-thumb,
.page-rail::-webkit-scrollbar-thumb {
  border: 2px solid rgba(255,243,230,.9);
  border-radius: 999px;
  background: rgba(255,122,0,.72);
}
.canvas-toolbar {
  min-height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid #d8dee8;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.canvas-toolbar span {
  color: var(--color-title);
  font-size: 12px;
  font-weight: 900;
}
.canvas-toolbar div {
  display: flex;
  gap: 6px;
}
.canvas-toolbar button {
  min-height: 28px;
  border: 1px solid #d8dee8;
  border-radius: 4px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  cursor: pointer;
}
.preview-top,
.export-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: #fff;
  border-bottom: 1px solid #d8dee8;
}
.preview-top button:disabled { opacity: .45; cursor: not-allowed; }
.ppt-window {
  width: min(86%, 850px);
  aspect-ratio: 16 / 9;
  margin: auto;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 18px 46px rgba(15,23,42,.18);
  overflow: hidden;
  touch-action: pinch-zoom;
}
.ppt-slide {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 32px 38px;
  display: grid;
  align-content: end;
  gap: 10px;
  background: linear-gradient(135deg, #fff, #fff7ed);
  color: #1f2937;
}
.page-index,
.chapter-label {
  border-radius: 2px;
  padding: 5px 8px;
  background: rgba(255,122,0,.1);
  color: var(--color-primary);
  font-weight: 900;
}
.page-index {
  position: absolute;
  top: 22px;
  right: 24px;
}
.chapter-label { justify-self: start; }
.ppt-slide h2 {
  max-width: 760px;
  font-size: 30px;
  line-height: 1.18;
}
.ppt-slide p {
  max-width: 760px;
  border-radius: 4px;
  padding: 12px;
  background: rgba(255,255,255,.78);
  font-size: 17px;
}
.slide-footer {
  min-height: 22px;
  display: flex;
  gap: 10px;
  color: rgba(31,41,55,.58);
  font-size: 12px;
  font-weight: 900;
}
.template-homework .ppt-slide { background: #fff; }
.template-portfolio .ppt-slide { background: linear-gradient(135deg, #f4f4f5, #ffffff); }
.template-brand .ppt-slide { background: linear-gradient(135deg, #fff7ed, #ffffff 54%, #ffe0bd); }
.export-bar.locked { opacity: .72; }
.export-bar {
  border-top: 1px solid #d8dee8;
  border-bottom: 0;
}
.difficulty-junior .template-grid,
.difficulty-junior .chapter-grid,
.difficulty-junior .radio-row { grid-template-columns: 1fr; }
.difficulty-junior .ppt-slide h2 { font-size: 38px; }
.difficulty-junior .ppt-slide p { font-size: 20px; }
@media (max-width: 980px) {
  .report-page {
    height: auto;
    min-height: 100vh;
    overflow: visible;
    display: block;
  }
  .report-grid { grid-template-columns: 1fr; }
  .page-rail { display: none; }
  .report-panel { max-height: none; }
  .report-stage { min-height: auto; }
}
</style>
