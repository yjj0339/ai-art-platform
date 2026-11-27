<template>
  <main class="creator-shell">
    <!-- 返回、页面名、头像都在共用顶栏里；「新建项目」放进顶栏右侧（原来的帮助、消息两个按钮没有功能，去掉） -->
    <Teleport to="#su-topbar-actions" defer>
      <button class="su-btn su-btn--sm" type="button" @click="resetWorkspace">新建项目</button>
    </Teleport>

    <section class="creator-page">
      <aside class="control-panel">
        <section class="model-section">
          <h2>选择生成模型</h2>
          <div class="model-row">
            <button
              v-for="option in availableModelOptions"
              :key="option.id"
              type="button"
              class="model-card"
              :class="{ selected: selectedModelId === option.id }"
              @click="selectModel(option)"
            >
              <div class="model-image">
                <img :src="option.image" :alt="option.name" />
                <span v-if="selectedModelId === option.id" class="selected-check"><el-icon><Check /></el-icon></span>
              </div>
              <span class="model-tag">{{ option.tag }}</span>
              <strong>{{ option.name }}</strong>
              <small>{{ option.detail }}</small>
            </button>
            <button class="model-more" type="button" title="查看更多模型" @click="ElMessage.info('后续可在后台3D世界API配置中继续增加模型')">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </section>

        <section class="input-section">
          <div class="mode-tabs" role="tablist" aria-label="生成方式">
            <button v-for="mode in availableModes" :key="mode.id" type="button" :class="{ active: form.mode === mode.id }" @click="form.mode = mode.id">
              {{ mode.label }}
            </button>
          </div>
          <div class="edition-tabs" role="tablist" aria-label="生成版本">
            <button v-for="edition in availableEditions" :key="edition.id" type="button" :class="{ active: form.edition === edition.id }" @click="selectEdition(edition.id)">
              <strong>{{ edition.name }}</strong><small>{{ edition.detail }}</small>
            </button>
          </div>
          <label>
            <textarea v-model="form.prompt" :maxlength="promptLimit" placeholder="输入你想要生成的 3D 模型描述，支持中文或英文…" />
            <small>{{ form.prompt.length }} / {{ promptLimit }}</small>
          </label>
          <div class="reference-label">参考图 <span>（可选）</span></div>
          <button class="upload-row" type="button" @click="fileInput?.click()">
            <img v-if="referencePreview" :src="referencePreview" alt="已上传参考图" />
            <span v-else class="upload-icon"><el-icon><Plus /></el-icon></span>
            <span class="upload-copy">
              <strong>{{ referencePreview ? '更换图片' : '上传图片' }}</strong>
              <small>支持 JPG、PNG 格式<br />建议尺寸不低于 512px</small>
            </span>
          </button>
          <input ref="fileInput" class="hidden-input" type="file" accept="image/png,image/jpeg,image/webp" @change="handleImageUpload" />
        </section>

        <section class="settings-section">
          <button class="section-title" type="button" @click="settingsOpen = !settingsOpen">
            <strong>当前模型专属参数</strong>
            <el-icon :class="{ rotated: settingsOpen }"><ArrowDown /></el-icon>
          </button>
          <div v-if="settingsOpen" class="settings-body">
            <p v-if="isRapidEdition" class="edition-note">极速版会以快速模式生成模型；面数、PBR 和高清纹理由腾讯云自动处理。</p>
            <template v-else>
            <div class="setting-line">
              <label>生成质量</label>
              <select v-model="form.quality">
                <option value="standard">标准质量</option>
                <option value="high">高质量</option>
                <option value="ultra">超高质量</option>
              </select>
            </div>
            <div class="setting-line">
              <label>模型面数</label>
              <select v-model="form.faceCount">
                <option :value="500000">中（50万）</option>
                <option :value="1000000">高（100万+）</option>
                <option :value="3000000">超高（300万+）</option>
              </select>
            </div>
            <div class="setting-line">
              <label>高清纹理</label>
              <button class="switch" :class="{ on: form.enablePbr }" type="button" role="switch" :aria-checked="form.enablePbr" @click="form.enablePbr = !form.enablePbr"><i /></button>
            </div>
            </template>
          </div>
        </section>

        <section class="advanced-section">
          <button class="section-title" type="button" @click="advancedOpen = !advancedOpen">
            <strong>高级设置</strong>
            <el-icon :class="{ rotated: advancedOpen }"><ArrowDown /></el-icon>
          </button>
          <div v-if="advancedOpen" class="advanced-body">
            <label>输出格式 <span class="format-fixed">GLB</span></label>
            <label>自动优化 <button class="switch on" type="button" role="switch" aria-checked="true"><i /></button></label>
          </div>
        </section>

        <footer class="generate-footer">
          <small>{{ running ? `已等待 ${elapsedSeconds} 秒，生成完成后自动显示` : '预计消耗 1 次3D生成额度' }}</small>
          <button type="button" :disabled="running" @click="startTask">
            <el-icon v-if="!running"><MagicStick /></el-icon>
            {{ running ? '正在生成' : '开始生成' }}
          </button>
        </footer>
      </aside>

      <section class="viewport-shell">
        <div ref="canvasHost" class="model-canvas" aria-label="可拖动旋转的3D网格工作区" />
        <div v-if="!task.result?.modelUrl && !viewerLoading" class="grid-world-copy">
          <span>AI 3D SPACE</span>
          <strong>{{ running ? statusText : '3D 网格工作区' }}</strong>
          <small>{{ running ? '可拖动查看网格空间，模型完成后将在这里自动出现' : '按住拖动可旋转视角，滚轮可缩放' }}</small>
        </div>
        <div v-if="viewerLoading" class="viewer-message">正在加载已生成的 3D 模型…</div>
        <div v-else-if="viewerError" class="viewer-message is-error">
          <strong>3D 模型加载失败</strong>
          <span>{{ viewerError }}</span>
        </div>

        <div class="viewer-tools" aria-label="3D视图工具">
          <button type="button" title="自动旋转" :class="{ active: autoRotate }" @click="toggleAutoRotate"><el-icon><Refresh /></el-icon></button>
          <button type="button" title="拖动视图" @click="ElMessage.info('可直接拖动右侧3D区域旋转查看')"><el-icon><Rank /></el-icon></button>
          <button type="button" title="放大" @click="zoomPreview(0.1)"><el-icon><ZoomIn /></el-icon></button>
          <button type="button" title="适配窗口" @click="resetView"><el-icon><FullScreen /></el-icon></button>
        </div>

        <div class="view-cube">
          <el-icon><Box /></el-icon>
          <span>上 · 左 · 前</span>
        </div>

        <div class="model-info">
          <strong>模型信息</strong>
          <template v-if="task.result">
            <span>面数：{{ isRapidEdition ? '由极速版自动生成' : form.faceCount.toLocaleString() }}</span>
            <span>格式：GLB · 可拖动旋转</span>
          </template>
          <template v-else>
            <span>状态：{{ running ? statusText : '等待生成' }}</span>
            <span>生成完成后显示模型信息</span>
          </template>
        </div>

        <div v-if="running" class="progress-overlay" aria-live="polite">
          <span class="spinner" aria-hidden="true" />
          <div class="progress-copy">
            <strong>{{ statusText }}</strong>
            <span>{{ progressStepText }}</span>
          </div>
          <small>已等待 {{ elapsedSeconds }} 秒</small>
          <button type="button" @click="cancelWait">取消</button>
        </div>

        <div v-else-if="task.status === 'failed'" class="progress-overlay error-overlay">
          <el-icon><WarningFilled /></el-icon>
          <div class="progress-copy"><strong>生成未完成</strong><span>{{ task.error }}</span></div>
          <button type="button" @click="startTask">重试</button>
        </div>

        <div class="viewport-actions">
          <button type="button" @click="startTask"><el-icon><Refresh /></el-icon>重新生成</button>
          <button type="button" @click="createVariant"><el-icon><Share /></el-icon>生成变体</button>
          <button type="button" :disabled="!task.result" @click="exportModel"><el-icon><Download /></el-icon>下载 GLB</button>
        </div>
      </section>
    </section>

    <StudentAgentDock
      page="model3d"
      page-label="AI 3D 世界"
      panel-side="right"
      :samples="agentModel3dSamples"
      :canvas-context="agentCanvasContext"
      :busy="running"
      @execute="handleAgentExecute"
    />
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowDown,
  ArrowRight,
  Bell,
  Box,
  Check,
  Download,
  FullScreen,
  MagicStick,
  Plus,
  QuestionFilled,
  Rank,
  Refresh,
  Share,
  UserFilled,
  WarningFilled,
  ZoomIn,
} from '@element-plus/icons-vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createEmptyProject, useProjectStore } from '../stores/projectStore'
import { generateHunyuan3dModel, getHunyuan3dConfig, getHunyuan3dTask } from '../services/aiGateway'
import StudentAgentDock from '../components/StudentAgentDock.vue'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()
const fileInput = ref(null)
const canvasHost = ref(null)
const running = ref(false)
const settingsOpen = ref(true)
const advancedOpen = ref(false)
const selectedModelId = ref('general')
const referencePreview = ref('')
const elapsedSeconds = ref(0)
const autoRotate = ref(false)
const viewerLoading = ref(false)
const viewerError = ref('')
const sourceProject = reactive(createEmptyProject('pro'))
const task = reactive({ status: 'queued', result: null, error: '', taskId: '' })
const form = reactive({
  mode: 'text',
  edition: 'rapid',
  model: '3.1',
  prompt: '未来感透明运动鞋，虹彩材质，流线型设计，高细节产品渲染',
  quality: 'high',
  faceCount: 1000000,
  enablePbr: true,
  resultFormat: 'GLB',
})

// 提交后输入框清空，但「生成变体」仍要基于刚才那句描述
const lastSubmittedPrompt = ref('')

const modes = [
  { id: 'text', label: '文生 3D' },
  { id: 'image', label: '图生 3D' },
  { id: 'multiview', label: '多视图' },
]

const editionConfig = reactive({ enabled: true, disabledModels: [], defaultEdition: 'rapid', editions: { rapid: true, pro: true } })
const availableEditions = computed(() => [
  editionConfig.editions.rapid !== false && { id: 'rapid', name: '极速生成', detail: '速度快，适合课堂预览' },
  editionConfig.editions.pro !== false && { id: 'pro', name: '专业生成', detail: '质量高，适合作品保存' },
].filter(Boolean))
const isRapidEdition = computed(() => form.edition === 'rapid')
const promptLimit = computed(() => isRapidEdition.value ? 200 : 1000)
const availableModes = computed(() => isRapidEdition.value ? modes.filter((mode) => mode.id !== 'multiview') : modes)

const modelOptions = [
  { id: 'general', name: '通用模型 Pro', tag: '推荐', detail: '高质量', model: '3.1', image: '/assets/model3d/model-chair.png' },
  { id: 'character', name: '角色模型 Max', tag: '人物优化', detail: '高精度', model: '3.1', image: '/assets/model3d/model-character.png' },
  { id: 'building', name: '建筑模型 Pro', tag: '建筑优化', detail: '大场景', model: '3.1', image: '/assets/model3d/model-building.png' },
  { id: 'hard-surface', name: '硬表面模型', tag: '硬表面优化', detail: '精细结构', model: '3.0', image: '/assets/model3d/work-sneaker.png' },
]
const availableModelOptions = computed(() => editionConfig.enabled ? modelOptions.filter((item) => !editionConfig.disabledModels.includes(item.model)) : [])

const statusText = computed(() => ({ submitting: '正在提交生成任务', processing: '等待生成', rendering: '正在构建模型' }[task.status] || '等待生成'))
const progressStepText = computed(() => task.status === 'submitting' ? '正在校验素材与模型参数' : '腾讯混元3D正在生成网格与材质')

let elapsedTimer
let pollCancelled = false
let renderer
let scene
let camera
let controls
let modelRoot
let frameId

onMounted(async () => {
  const requestedProjectId = String(route.query.projectId || '').trim()
  if (requestedProjectId) projectStore.openProject(requestedProjectId)
  Object.assign(sourceProject, projectStore.currentProject || projectStore.draft || createEmptyProject('pro'))
  const image = projectImage(sourceProject)
  if (image) {
    referencePreview.value = image
    form.mode = 'image'
  }
  if (sourceProject.prompt) form.prompt = sourceProject.prompt
  load3dConfig()
  const restored = await restoreSavedModel()
  if (!restored) {
    await nextTick()
    initScene()
  }
  window.addEventListener('resize', resizeScene)
})

onBeforeUnmount(() => {
  clearInterval(elapsedTimer)
  pollCancelled = true
  window.removeEventListener('resize', resizeScene)
  destroyScene()
})

function selectModel(option) {
  selectedModelId.value = option.id
  form.model = option.model
  if (option.id === 'hard-surface') form.faceCount = 500000
}

function selectEdition(edition) {
  form.edition = edition
  if (edition === 'rapid' && form.mode === 'multiview') form.mode = 'image'
  if (form.prompt.length > promptLimit.value) form.prompt = form.prompt.slice(0, promptLimit.value)
}

async function load3dConfig() {
  try {
    const config = await getHunyuan3dConfig()
    editionConfig.enabled = config.enabled !== false
    editionConfig.disabledModels = config.disabledModels || []
    if (!availableModelOptions.value.some((item) => item.id === selectedModelId.value)) {
      const option = availableModelOptions.value[0]
      if (option) selectModel(option)
      else { selectedModelId.value = ''; form.model = '' }
    }
    editionConfig.defaultEdition = config.defaultEdition === 'pro' ? 'pro' : 'rapid'
    editionConfig.editions = { rapid: config.editions?.rapid !== false, pro: config.editions?.pro !== false }
    const preferred = editionConfig.defaultEdition
    selectEdition(editionConfig.editions[preferred] !== false ? preferred : (editionConfig.editions.rapid !== false ? 'rapid' : 'pro'))
  } catch {
    // 本地预览后端尚未重启时保留极速版默认值，不阻断创作页面展示。
  }
}

function handleImageUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    referencePreview.value = String(reader.result || '')
    form.mode = 'image'
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

async function resetWorkspace() {
  pollCancelled = true
  running.value = false
  clearInterval(elapsedTimer)
  destroyScene()
  viewerLoading.value = false
  viewerError.value = ''
  selectedModelId.value = 'general'
  referencePreview.value = ''
  Object.assign(form, {
    mode: 'text', edition: editionConfig.defaultEdition, model: availableModelOptions.value[0]?.model || '', prompt: '', quality: 'high', faceCount: 1000000, enablePbr: true, resultFormat: 'GLB',
  })
  Object.assign(task, { status: 'queued', result: null, error: '', taskId: '' })
  await nextTick()
  initScene()
}

// 3D 页的小智能体：用户说一句想要什么，它整理成 3D 描述并直接开始生成。
const agentModel3dSamples = [
  '帮我做一个会浮在空中的小房子',
  '我想要一只低多边形的小恐龙',
  '做一个圆圆的太空头盔'
]
/** 交给智能体的「画布快照」：现在的 3D 描述与出模设置，让它能接上「再圆一点」这种改法 */
const agentCanvasContext = computed(() => ({
  prompt: String(form.prompt || '').trim(),
  edition: form.edition,
  quality: form.quality,
  count: '',
  lastPrompt: String(lastSubmittedPrompt.value || '').trim(),
}))
async function handleAgentExecute(payload = {}) {
  const prompt = String(payload.prompt || '').trim()
  if (!prompt) return
  form.prompt = prompt
  // 智能体给的是文字描述，就走文生3D；不先切换的话会被「图生3D需上传参考图」拦住
  if (!referencePreview.value) form.mode = 'text'
  await nextTick()
  await startTask()
}

async function startTask() {
  if (!availableModelOptions.value.length) {
    ElMessage.warning('暂无可用3D模型，请联系管理员开启模型后刷新页面')
    return
  }
  if (!form.prompt.trim() && !referencePreview.value) {
    ElMessage.warning('请填写3D模型描述或上传参考图')
    return
  }
  if (form.mode !== 'text' && !referencePreview.value) {
    ElMessage.warning('图生3D或多视图模式需要先上传参考图')
    return
  }
  pollCancelled = false
  running.value = true
  elapsedSeconds.value = 0
  clearInterval(elapsedTimer)
  destroyScene()
  viewerLoading.value = false
  viewerError.value = ''
  elapsedTimer = setInterval(() => { elapsedSeconds.value += 1 }, 1000)
  Object.assign(task, { status: 'submitting', result: null, error: '', taskId: '' })
  await nextTick()
  initScene()
  const submittedPrompt = form.prompt.trim()
  try {
    const submitted = await generateHunyuan3dModel({
      imageBase64: form.mode === 'text' ? '' : referencePreview.value,
      prompt: submittedPrompt,
      edition: form.edition,
      model: form.model,
      faceCount: form.faceCount,
      enablePbr: form.enablePbr,
      resultFormat: form.resultFormat,
      isSketch: false,
    })
    task.taskId = submitted.taskId
    // 任务已经交上去了，输入框可以空出来；描述存快照，生成变体时还能用
    if (submittedPrompt) lastSubmittedPrompt.value = submittedPrompt
    form.prompt = ''
    const result = await waitForTask(submitted.taskId, submitted.edition || form.edition)
    if (pollCancelled) return
    Object.assign(task, {
      status: 'succeeded',
      result: {
        title: `${sourceProject.title || 'AI创意作品'} 3D模型`,
        description: '腾讯混元3D生成完成，可拖拽旋转查看并下载GLB文件。',
        modelUrl: result.modelUrl,
        previewImageUrl: result.previewImageUrl,
        files: result.files || [],
      },
    })
    saveResult()
    await nextTick()
    initScene()
    ElMessage.success('3D模型生成完成，已保存到当前项目')
  } catch (error) {
    const serverError = error?.response?.data || {}
    const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message === 'Network Error'
    const message = serverError.message || (isNetworkError
      ? '无法连接3D后端服务，请确认网页服务与本地后端都已启动后重试。'
      : error?.message) || '3D生成失败，请稍后重试。'
    if (!pollCancelled) Object.assign(task, { status: 'failed', result: null, error: message })
  } finally {
    clearInterval(elapsedTimer)
    running.value = false
  }
}

async function waitForTask(taskId, edition) {
  if (!taskId) throw new Error('腾讯混元3D没有返回任务ID')
  for (let attempt = 0; attempt < 48; attempt += 1) {
    if (pollCancelled) throw new Error('已取消等待')
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 2500 : 5000))
    if (pollCancelled) throw new Error('已取消等待')
    const next = await getHunyuan3dTask(taskId, edition)
    const status = String(next.status || '').toLowerCase()
    task.status = status === 'run' ? 'rendering' : 'processing'
    if (status === 'done') return next
    if (status === 'fail') throw new Error(next.errorMessage || next.errorCode || '腾讯混元3D生成失败')
  }
  throw new Error('生成等待时间较长，请稍后在我的项目中查看')
}

function cancelWait() {
  pollCancelled = true
  running.value = false
  clearInterval(elapsedTimer)
  Object.assign(task, { status: 'queued', error: '' })
  ElMessage.info('已停止当前页面等待；腾讯云已提交的任务可能仍在后台运行')
}

function createVariant() {
  // 输入框提交后是空的，用刚才那句描述做底
  const base = (form.prompt.trim() || lastSubmittedPrompt.value.trim()).replace(/，生成一个不同设计变体$/, '')
  if (!base && !referencePreview.value) {
    ElMessage.warning('先写一句3D模型描述，或上传参考图，再生成变体')
    return
  }
  form.prompt = base ? `${base}，生成一个不同设计变体` : '生成一个不同设计变体'
  startTask()
}

function saveResult() {
  if (!task.result) return
  const project = projectStore.currentProject || sourceProject
  projectStore.saveModel3D(project.id, {
    title: task.result.title,
    style: modelOptions.find((item) => item.id === selectedModelId.value)?.name || '通用模型 Pro',
    faceCount: form.faceCount,
    cover: task.result.previewImageUrl || '/assets/model3d/work-sneaker.png',
    preview: task.result.previewImageUrl || '/assets/model3d/work-sneaker.png',
    modelUrl: task.result.modelUrl,
    files: task.result.files || [],
    description: task.result.description,
  })
}

async function restoreSavedModel() {
  const models = Array.isArray(sourceProject.models3d) ? sourceProject.models3d : []
  const requestedModelId = String(route.query.modelId || '').trim()
  const savedModel = (requestedModelId && models.find((item) => item.id === requestedModelId)) || models[0]
  if (!savedModel?.modelUrl) return false
  Object.assign(task, {
    status: 'succeeded',
    error: '',
    taskId: '',
    result: {
      title: savedModel.title || `${sourceProject.title || 'AI创意作品'} 3D模型`,
      description: savedModel.description || '已生成的3D模型，可拖动旋转查看并下载GLB文件。',
      modelUrl: savedModel.modelUrl,
      previewImageUrl: savedModel.preview || savedModel.cover || '',
      files: Array.isArray(savedModel.files) ? savedModel.files : [],
    },
  })
  await nextTick()
  initScene()
  return true
}

function exportModel() {
  const file = task.result?.files?.find((item) => String(item.type).toUpperCase() === 'GLB') || task.result?.files?.[0]
  const url = file?.url || task.result?.modelUrl
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function zoomPreview(delta) {
  if (!camera || !controls) return
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
  const distance = camera.position.distanceTo(controls.target)
  const nextDistance = Math.min(10, Math.max(2.2, distance - delta * 8))
  camera.position.copy(controls.target).addScaledVector(direction, nextDistance)
  controls.update()
}

function toggleAutoRotate() {
  autoRotate.value = !autoRotate.value
  if (controls) controls.autoRotate = autoRotate.value
}

function resetView() {
  if (!camera || !controls) return
  camera.position.set(4.6, 3.1, 5.6)
  controls.target.set(0, 0, 0)
  controls.update()
}

function projectImage(project) {
  const version = project?.versions?.find((item) => item.id === project.finalVersionId) || project?.versions?.[0] || {}
  const image = version.imageUrl || version.url || project?.referenceImage || ''
  return String(image).startsWith('data:image/') ? String(image) : ''
}

function initScene() {
  if (!canvasHost.value) return
  const modelUrl = String(task.result?.modelUrl || '').trim()
  destroyScene()
  viewerLoading.value = Boolean(modelUrl)
  viewerError.value = ''
  canvasHost.value.innerHTML = ''
  scene = new THREE.Scene()
  scene.background = new THREE.Color('#edf1fa')
  scene.fog = new THREE.Fog('#edf1fa', 7, 16)
  const width = canvasHost.value.clientWidth || 900
  const height = canvasHost.value.clientHeight || 680
  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
  camera.position.set(4.6, 3.1, 5.6)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  canvasHost.value.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.enablePan = true
  controls.screenSpacePanning = false
  controls.minDistance = 2.2
  controls.maxDistance = 10
  controls.minPolarAngle = 0.12
  controls.maxPolarAngle = Math.PI * 0.49
  controls.target.set(0, 0, 0)
  controls.autoRotate = autoRotate.value
  controls.autoRotateSpeed = 1.25
  controls.update()
  addGridWorld()
  scene.add(new THREE.HemisphereLight('#ffffff', '#cbd5e1', 2.4))
  const key = new THREE.DirectionalLight('#ffffff', 2.5)
  key.position.set(3, 4, 5)
  scene.add(key)
  animate()
  if (!modelUrl) return
  new GLTFLoader().load(modelAssetUrl(modelUrl), (gltf) => {
    modelRoot = gltf.scene
    const bounds = new THREE.Box3().setFromObject(modelRoot)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z, 0.001)
    const fittedScale = 2.8 / maxDimension
    modelRoot.scale.setScalar(fittedScale)
    modelRoot.position.set(-center.x * fittedScale, -1.12 - bounds.min.y * fittedScale, -center.z * fittedScale)
    scene.add(modelRoot)
    camera.position.set(4.2, 2.8, 5.2)
    controls.target.set(0, 0.15, 0)
    controls.update()
    viewerLoading.value = false
  }, undefined, (error) => {
    viewerLoading.value = false
    viewerError.value = '模型文件读取失败。请确认3D后端正在运行；如果仍失败，原始腾讯下载链接可能已经过期。'
    console.warn('GLB preview failed', error)
  })
}

function addGridWorld() {
  if (!scene) return
  const grid = new THREE.GridHelper(14, 28, '#735bff', '#a8b5d7')
  grid.position.y = -1.15
  grid.material.transparent = true
  grid.material.opacity = 0.48
  scene.add(grid)

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(1.52, 1.55, 96),
    new THREE.MeshBasicMaterial({ color: '#735bff', transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  )
  innerRing.rotation.x = -Math.PI / 2
  innerRing.position.y = -1.12
  scene.add(innerRing)

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(2.32, 2.35, 96),
    new THREE.MeshBasicMaterial({ color: '#4bbce8', transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  )
  outerRing.rotation.x = -Math.PI / 2
  outerRing.position.y = -1.11
  scene.add(outerRing)
}

function modelAssetUrl(url) {
  const value = String(url || '').trim()
  if (!value || value.startsWith('/api/ai/model3d/assets')) return value
  if (!/^https:\/\//i.test(value)) return value
  return `/api/ai/model3d/assets?url=${encodeURIComponent(value)}`
}

function destroyScene() {
  if (frameId) cancelAnimationFrame(frameId)
  frameId = null
  controls?.dispose()
  controls = null
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  modelRoot = null
}

function animate() {
  frameId = requestAnimationFrame(animate)
  controls?.update()
  renderer?.render(scene, camera)
}

function resizeScene() {
  if (!canvasHost.value || !renderer || !camera) return
  const width = canvasHost.value.clientWidth || 900
  const height = canvasHost.value.clientHeight || 680
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}
</script>

<style scoped lang="scss">
.creator-shell {
  min-width: 0;
  min-height: calc(100vh - var(--app-top, 0px));
  color: #202432;
  background: #f2f4f8;
}
/* 左栏从上到下都是模型/参数，左下角一放人物就压住设置项。
   这里把小画师挪到右边 3D 画面区的右下，抬到「重新生成」按钮上方。 */
.creator-shell .sa-dock.is-floating {
  left: auto;
  right: 22px;
  bottom: 92px;
}
.creator-header {
  /* 全站统一导航条 58px（原 64，比作品广场高一截） */
  height: 58px;
  padding: 0 20px;
  border-bottom: 1px solid #e5e8ef;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255,255,255,.96);
}
button { font: inherit; }
.brand-button,
.header-nav button {
  border: 0;
  background: transparent;
  cursor: pointer;
}
.brand-button { display: flex; align-items: center; gap: 10px; color: #1d2230; font-size: 22px; }
.brand-button .el-icon { color: #735bff; font-size: 25px; }
.header-nav { display: flex; align-items: center; gap: 18px; }
.header-nav > button { color: #3d4351; font-size: 13px; }
.header-divider { width: 1px; height: 24px; background: #e2e5ec; }
.header-nav .icon-button,
.avatar-button { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; font-size: 19px; }
.header-nav .icon-button:hover { background: #f1efff; color: #684cff; }
.avatar-button { color: #fff !important; background: #b7bcc8 !important; }
.creator-page {
  /* 页面高度要跟着导航条一起改：原来是 64，少减 6px 会在底部多出一条滚动空白 */
  height: calc(100vh - var(--app-top, 0px));
  padding: 10px;
  display: grid;
  grid-template-columns: minmax(410px, 29.5%) minmax(0, 1fr);
  gap: 10px;
}
.control-panel {
  min-height: 0;
  border: 1px solid #e7eaf0;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: #fff;
}
.model-section,
.input-section,
.settings-section,
.advanced-section { padding: 13px 14px; border-bottom: 1px solid #eceff4; }
.model-section h2 { margin: 0 0 11px; font-size: 14px; }
/* 用 flex 而不是固定 4 列的 grid：后台停用某个模型后，卡片数量会变，
   固定列数会让「更多」按钮停在半空而不是靠最右。 */
.model-row { display: flex; gap: 8px; align-items: center; }
.model-card { flex: 1 1 0; min-width: 0; padding: 0 0 7px; border: 1px solid #e0e3ea; border-radius: 10px; overflow: hidden; position: relative; background: #fff; text-align: left; cursor: pointer; }
.model-card.selected { border-color: #7758ff; box-shadow: 0 0 0 1px #7758ff; }
.model-image { height: 83px; position: relative; overflow: hidden; background: #f7f7fa; }
.model-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
.selected-check { position: absolute; right: 5px; top: 5px; width: 22px; height: 22px; border: 2px solid #fff; border-radius: 50%; display: grid; place-items: center; color: #fff; background: #7659ff; }
.model-tag { display: block; width: max-content; max-width: calc(100% - 10px); margin: -18px 5px 5px; padding: 2px 5px; border-radius: 4px; position: relative; overflow: hidden; color: #fff; background: #667af4; font-size: 9px; white-space: nowrap; text-overflow: ellipsis; }
.model-card strong,
.model-card small { display: block; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-card strong { font-size: 10px; }
.model-card small { margin-top: 3px; color: #9ca2ae; font-size: 9px; }
.model-more { flex: 0 0 28px; width: 28px; height: 34px; min-height: 0; border: 1px solid #e0e3ea; border-radius: 50%; display: grid; place-items: center; background: #fff; cursor: pointer; }
.mode-tabs { padding: 3px; border: 1px solid #e1e4eb; border-radius: 8px; display: grid; grid-template-columns: repeat(3, 1fr); background: #f7f8fa; }
.mode-tabs button { height: 30px; border: 0; border-radius: 6px; color: #555c6c; background: transparent; cursor: pointer; }
.mode-tabs button.active { color: #6649ff; background: #fff; box-shadow: 0 2px 8px rgba(42,52,80,.08); }
.edition-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0 12px; }
.edition-tabs button { min-height: 48px; border: 1px solid #e4e7ef; border-radius: 10px; background: #fff; color: #64748b; cursor: pointer; display: grid; gap: 2px; justify-items: start; padding: 8px 10px; }
.edition-tabs button.active { border-color: #7c5cff; background: #f5f2ff; color: #6042e9; }
.edition-tabs strong { font-size: 13px; }
.edition-tabs small { font-size: 11px; }
.edition-note { margin: 0; padding: 10px; border-radius: 8px; background: #f4f7ff; color: #5d6b85; font-size: 12px; line-height: 1.6; }
.input-section label { display: block; position: relative; }
.input-section textarea { width: 100%; height: 84px; margin-top: 9px; padding: 10px 11px 24px; border: 1px solid #dfe3ea; border-radius: 9px; resize: none; outline: 0; color: #4c5362; line-height: 1.5; }
.input-section textarea:focus { border-color: #8067ff; box-shadow: 0 0 0 3px rgba(117,88,255,.08); }
.input-section label > small { position: absolute; right: 10px; bottom: 8px; color: #a0a6b2; }
.reference-label { margin-top: 10px; color: #363c4a; font-size: 12px; font-weight: 600; }
.reference-label span { color: #9ba1ad; font-weight: 400; }
.upload-row { width: 100%; min-height: 58px; margin-top: 7px; padding: 7px; border: 1px dashed #cdd2dc; border-radius: 8px; display: flex; align-items: center; gap: 10px; color: #747b8b; background: #fff; text-align: left; cursor: pointer; }
.upload-row > img { width: 48px; height: 44px; border-radius: 7px; object-fit: cover; }
.upload-icon { width: 48px; height: 44px; border-radius: 7px; display: grid; place-items: center; background: #f7f8fb; font-size: 20px; }
.upload-copy { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px; }
.upload-copy strong { color: #555c6b; font-size: 11px; }
.upload-copy small { color: #9ba1ad; font-size: 9px; line-height: 1.5; }
.hidden-input { display: none; }
.settings-section { padding-bottom: 8px; }
.section-title { width: 100%; height: 28px; padding: 0; border: 0; display: flex; align-items: center; justify-content: space-between; color: #303644; background: transparent; cursor: pointer; }
.section-title strong { font-size: 12px; }
.section-title .el-icon { transition: transform .2s; }
.section-title .rotated { transform: rotate(180deg); }
.settings-body { padding-top: 4px; }
.setting-line { min-height: 38px; display: grid; grid-template-columns: 100px 1fr; align-items: center; gap: 10px; font-size: 11px; }
.setting-line select,
.advanced-body select { height: 30px; padding: 0 8px; border: 1px solid #dfe3ea; border-radius: 7px; color: #4a5160; background: #fff; outline: 0; }
.switch { justify-self: end; width: 37px; height: 21px; padding: 2px; border: 0; border-radius: 999px; background: #d9dde5; cursor: pointer; }
.switch i { display: block; width: 17px; height: 17px; border-radius: 50%; background: #fff; transition: transform .2s; }
.switch.on { background: #7459fb; }
.switch.on i { transform: translateX(16px); }
.advanced-section { padding-top: 8px; padding-bottom: 8px; }
.advanced-body { padding-top: 8px; display: grid; gap: 8px; }
.advanced-body label { min-height: 30px; display: flex; align-items: center; justify-content: space-between; color: #737a89; font-size: 11px; }
/* 「开始生成」一直贴在左栏底部：参数展开得再多也不会被挤出屏幕（iPad 横屏 1180×820 原来只露出 14px） */
.generate-footer { position: sticky; z-index: 6; bottom: 0; margin-top: auto; padding: 9px 14px 12px; border-top: 1px solid #eceff4; background: #fff; }
.generate-footer small { display: block; margin-bottom: 7px; color: #888f9e; font-size: 10px; }
.generate-footer button { width: 100%; height: 44px; border: 0; border-radius: 9px; display: flex; align-items: center; justify-content: center; gap: 7px; color: #fff; background: linear-gradient(100deg, #7250fb, #34c9e9); box-shadow: 0 8px 18px rgba(89,93,239,.18); cursor: pointer; font-weight: 600; }
.generate-footer button:disabled { opacity: .62; cursor: wait; }
.viewport-shell { min-width: 0; border: 1px solid #e0e4ec; border-radius: 14px; overflow: hidden; position: relative; background: #eef1f7; }
.model-canvas { width: 100%; height: 100%; min-height: 620px; display: block; touch-action: none; }
.model-canvas :deep(canvas) { display: block; cursor: grab; }
.model-canvas :deep(canvas:active) { cursor: grabbing; }
.grid-world-copy { position: absolute; z-index: 2; left: 50%; top: 43%; min-width: 250px; padding: 18px 24px; border: 1px solid rgba(255,255,255,.75); border-radius: 14px; display: grid; gap: 6px; color: #4d5470; background: rgba(255,255,255,.56); box-shadow: 0 16px 42px rgba(66,70,110,.1); text-align: center; backdrop-filter: blur(13px); transform: translate(-50%,-50%); pointer-events: none; }
.grid-world-copy span { color: #735bff; font-size: 10px; font-weight: 800; letter-spacing: .18em; }
.grid-world-copy strong { color: #252b40; font-size: 18px; }
.grid-world-copy small { color: #747c91; font-size: 11px; }
.viewer-message { position: absolute; z-index: 5; left: 50%; top: 50%; min-width: 260px; padding: 16px 20px; border: 1px solid rgba(116,89,251,.18); border-radius: 12px; display: grid; gap: 5px; color: #5b55a4; background: rgba(255,255,255,.9); box-shadow: 0 12px 32px rgba(47,53,84,.12); transform: translate(-50%,-50%); text-align: center; backdrop-filter: blur(10px); }
.viewer-message.is-error { color: #b42318; border-color: rgba(180,35,24,.18); }
.viewer-message span { max-width: 360px; color: #737a89; font-size: 12px; }
.viewer-tools { position: absolute; z-index: 3; top: 28px; left: 20px; padding: 5px; border: 1px solid rgba(216,221,230,.82); border-radius: 10px; display: grid; gap: 2px; background: rgba(255,255,255,.86); box-shadow: 0 8px 24px rgba(34,46,77,.09); backdrop-filter: blur(8px); }
.viewer-tools button { width: 37px; height: 37px; border: 0; border-radius: 7px; display: grid; place-items: center; color: #303746; background: transparent; cursor: pointer; }
.viewer-tools button:hover { color: #694cff; background: #f1efff; }
.viewer-tools button.active { color: #fff; background: #735bff; }
.viewer-tools .el-icon { font-size: 19px; }
.view-cube { position: absolute; z-index: 3; top: 28px; right: 24px; width: 78px; height: 76px; border: 1px solid rgba(215,220,229,.74); border-radius: 10px; display: grid; place-items: center; align-content: center; gap: 4px; color: #626978; background: rgba(255,255,255,.74); backdrop-filter: blur(8px); }
.view-cube .el-icon { color: #765cff; font-size: 34px; }
.view-cube span { font-size: 9px; }
.model-info { position: absolute; z-index: 3; left: 20px; bottom: 28px; padding: 11px 13px; border: 1px solid rgba(216,221,230,.76); border-radius: 10px; display: grid; gap: 4px; color: #6d7482; background: rgba(255,255,255,.74); backdrop-filter: blur(10px); font-size: 10px; }
.model-info strong { color: #303644; font-size: 11px; }
.viewport-actions { position: absolute; z-index: 4; right: 24px; bottom: 28px; display: flex; gap: 10px; }
.viewport-actions button { height: 44px; padding: 0 18px; border: 1px solid rgba(214,219,228,.92); border-radius: 10px; display: flex; align-items: center; gap: 7px; color: #2d3341; background: rgba(255,255,255,.9); box-shadow: 0 6px 20px rgba(35,46,75,.08); backdrop-filter: blur(8px); cursor: pointer; }
.viewport-actions button:disabled { opacity: .48; cursor: not-allowed; }
.progress-overlay { position: absolute; z-index: 5; left: 50%; bottom: 110px; width: min(490px, 56%); min-height: 72px; padding: 12px 15px; border: 1px solid rgba(255,255,255,.85); border-radius: 13px; display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 13px; background: rgba(255,255,255,.75); box-shadow: 0 12px 34px rgba(52,59,89,.12); backdrop-filter: blur(14px); transform: translateX(-50%); }
.spinner { width: 30px; height: 30px; border: 4px solid #dfe4ef; border-top-color: #7158ff; border-right-color: #46b8ef; border-radius: 50%; animation: spin 1s linear infinite; }
.progress-copy { display: grid; gap: 5px; color: #555c6b; font-size: 11px; }
.progress-copy strong { color: #2d3341; font-size: 13px; }
.progress-overlay > small { color: #7c8392; font-size: 10px; }
.progress-overlay > button { border: 0; color: #565c69; background: transparent; cursor: pointer; }
.error-overlay { grid-template-columns: auto 1fr auto; color: #d14343; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1280px) {
  .creator-page { grid-template-columns: 360px minmax(0, 1fr); }
  .model-image { height: 70px; }
}
@media (max-width: 980px) {
  .creator-header { padding: 0 16px; }
  .brand-button { font-size: 19px; }
  .header-nav { gap: 10px; }
  .creator-page { grid-template-columns: 340px minmax(0, 1fr); }
  .grid-world-copy { min-width: 220px; padding: 15px 18px; }
  .viewport-actions { right: 12px; gap: 6px; }
  .viewport-actions button { padding: 0 10px; font-size: 12px; }
  .view-cube { right: 12px; }
}
@media (max-height: 800px) {
  .creator-header { height: 58px; }
  .model-section, .input-section, .settings-section, .advanced-section { padding-top: 8px; padding-bottom: 8px; }
  .model-image { height: 58px; }
  .input-section textarea { height: 62px; }
  .upload-row { min-height: 42px; }
  .setting-line { min-height: 31px; }
  .advanced-section { padding-top: 4px; padding-bottom: 4px; }
  .generate-footer button { height: 40px; }
}
</style>
