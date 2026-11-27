<template>
  <main class="portfolio-page app-page">
    <!-- 返回和页面名在共用顶栏里；「开始新创作」放进顶栏右侧 -->
    <Teleport to="#su-topbar-actions" defer>
      <button class="su-btn su-btn--primary su-btn--sm" type="button" @click="startNew">开始新创作</button>
    </Teleport>

    <section class="portfolio-toolbar" aria-label="素材筛选">
      <div class="type-tabs">
        <button
          v-for="item in typeOptions"
          :key="item.value"
          type="button"
          :class="{ active: filterType === item.value }"
          @click="filterType = item.value"
        >
          {{ item.label }}
          <span>{{ item.count }}</span>
        </button>
      </div>
      <el-popover placement="bottom-end" :width="316" trigger="click" popper-class="portfolio-consent-popper">
        <template #reference>
          <button
            type="button"
            class="consent-entry"
            :class="{ 'is-opted': galleryStore.autoSelectConsent }"
            aria-label="系统自动精选设置"
            title="系统自动精选设置"
          >
            <el-icon><Setting /></el-icon>
          </button>
        </template>
        <div class="consent-panel">
          <strong>系统自动精选</strong>
          <p>开启后，你保存为最终作品时自动提交机构审核，通过后展示在作品广场。可随时关闭，或逐件撤回。</p>
          <label class="consent-panel-switch">
            <span>允许自动精选</span>
            <el-switch
              :model-value="galleryStore.autoSelectConsent"
              :disabled="consentBusy || (galleryStore.serverMode && (!galleryStore.ownLoaded || !galleryStore.consent.granted))"
              @change="toggleAutoSelectConsent"
            />
          </label>
          <p v-if="galleryStore.serverMode && !galleryStore.ownLoaded" class="consent-panel-note" role="alert">
            {{ galleryStore.ownError || '正在读取审核状态…' }}
            <button v-if="galleryStore.ownError" type="button" @click="initializeGallery">重试</button>
          </p>
          <p v-else-if="galleryStore.serverMode && !galleryStore.consent.granted" class="consent-panel-note is-warn">
            机构尚未登记公开授权，自动精选与投稿暂不可用，请联系管理员。
          </p>
          <button
            v-if="galleryStore.serverMode && galleryStore.ownWorks.some(work => work.source === '系统精选' && (work.status === 'published' || work.previousPublished))"
            type="button"
            class="consent-panel-withdraw"
            @click="withdrawSelected"
          >
            撤下已精选作品
          </button>
        </div>
      </el-popover>
      <PortfolioBatchMenu
        v-model:active="batchActive"
        v-model:selected-ids="batchSelectedIds"
        v-model:canvas-documents="canvasDocuments"
        :items="visibleItems"
        @applied="loadCanvasDocuments"
      />
    </section>

    <section v-if="visibleItems.length" class="portfolio-grid" aria-label="个人素材列表">
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="portfolio-card"
        :class="{ 'is-batch': batchActive, 'is-picked': batchSelectedIds.includes(item.id) }"
        role="button"
        tabindex="0"
        @click="handleCardClick(item)"
        @keydown.enter="handleCardClick(item)"
      >
        <span v-if="batchActive" class="portfolio-select-box" :class="{ checked: batchSelectedIds.includes(item.id) }">
          <el-icon v-if="batchSelectedIds.includes(item.id)"><Check /></el-icon>
        </span>
        <div class="portfolio-cover" :style="getPortfolioArtworkStyle(item)">
          <span class="kind-chip">{{ kindLabel(item.kind) }}</span>
          <span v-if="item.kind === 'project' && isGalleryPublished(item)" class="published-chip">已上架</span>
          <PortfolioItemMenu v-if="!batchActive" :item="item" @changed="reloadDocuments" />
          <div class="portfolio-cover-info">
            <strong>{{ item.title }}</strong>
            <p>{{ item.meta }}</p>
          </div>
        </div>
      </article>
    </section>

    <section v-else class="portfolio-empty">
      <el-icon><PictureFilled /></el-icon>
      <h2>当前分类还没有作品</h2>
      <p>在画布中保存素材后，内容会自动出现在这里。</p>
      <BaseButton @click="startNew">开始新创作</BaseButton>
    </section>

    <el-dialog v-model="portfolioDialog.open" title="单个素材浏览" width="980px" class="portfolio-dialog">
      <div v-if="portfolioDialog.item" class="portfolio-detail">
        <div class="portfolio-detail-media-stage" :class="{ 'is-compact': portfolioArtworkCompact }">
          <div class="portfolio-zoom-controls" aria-label="作品缩放控制">
            <button type="button" aria-label="缩小作品" :disabled="portfolioArtworkScale <= 0.2" @click="changePortfolioArtworkScale(-0.1)">
              <el-icon><ZoomOut /></el-icon>
            </button>
            <button type="button" aria-label="放大作品" :disabled="portfolioArtworkScale >= 5" @click="changePortfolioArtworkScale(0.1)">
              <el-icon><ZoomIn /></el-icon>
            </button>
          </div>
          <div
            class="portfolio-detail-artwork"
            :class="[getPortfolioRatioClass(portfolioDialog.item), `portfolio-detail-artwork--${portfolioDialog.item.kind}`]"
            :style="getPortfolioDetailArtworkStyle(portfolioDialog.item)"
          />
        </div>
        <section class="portfolio-detail-main">
          <div>
            <span class="portfolio-detail-type">{{ kindLabel(portfolioDialog.item.kind) }}</span>
            <h2>{{ portfolioDialog.item.title }}</h2>
            <p>{{ portfolioDialog.item.meta }}</p>
          </div>
          <div class="portfolio-detail-prompt">
            <span>{{ portfolioDialog.item.kind === 'text' ? '文本内容' : portfolioDialog.item.kind === 'project' ? '图像提示词' : '素材说明' }}</span>
            <p>{{ getPortfolioDescription(portfolioDialog.item) }}</p>
          </div>
        </section>
      </div>
      <template #footer>
        <div v-if="portfolioDialog.item" class="portfolio-detail-actions">
          <BaseButton v-if="portfolioDialog.item.kind !== 'sketch'" variant="secondary" @click="goCanvasEdit(portfolioDialog.item)">去画布编辑</BaseButton>
          <BaseButton v-if="!['text', 'canvas'].includes(portfolioDialog.item.kind)" variant="secondary" @click="importReference(portfolioDialog.item)">导入参考图</BaseButton>
          <BaseButton v-if="portfolioDialog.item.kind !== 'sketch'" variant="secondary" @click="modifyArtwork(portfolioDialog.item)">
            {{ portfolioDialog.item.kind === 'model3d' ? '打开3D查看' : portfolioDialog.item.kind === 'text' ? '编辑文本' : portfolioDialog.item.kind === 'canvas' ? '打开无限画布' : '作品修改' }}
          </BaseButton>
          <BaseButton
            v-if="portfolioDialog.item.kind === 'project'"
            :disabled="!portfolioDialog.item.finalVersionId || ['已撤回', '已下架'].includes(galleryStatusLabel(portfolioDialog.item))"
            @click="openSubmissionDialog(portfolioDialog.item)"
          >
            {{ portfolioDialog.item.finalVersionId ? '投稿到作品广场' : '请先设置最终作品' }}
          </BaseButton>
          <span v-if="portfolioDialog.item.kind === 'project'">{{ galleryStatusLabel(portfolioDialog.item) }}</span>
          <BaseButton v-if="portfolioDialog.item.kind === 'sketch'" variant="secondary" @click="deleteSketch(portfolioDialog.item)">删除手绘稿</BaseButton>
          <BaseButton v-if="portfolioDialog.item.kind === 'project' && galleryStore.ownWork(portfolioDialog.item.projectId) && !['withdrawn','offline'].includes(galleryStore.ownWork(portfolioDialog.item.projectId).status)" variant="secondary" @click="withdrawArtwork(portfolioDialog.item)">撤回广场作品</BaseButton>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="submissionDialog.open" title="投稿到作品广场" width="min(520px, 94vw)">
      <div class="submission-form">
        <label>
          <span>作品名称</span>
          <el-input v-model="submissionDialog.title" maxlength="30" show-word-limit />
        </label>
        <label>
          <span>创作思路（选填）</span>
          <el-input v-model="submissionDialog.description" type="textarea" :rows="4" maxlength="200" />
        </label>
        <p>投稿后按机构设置进行审核，通过后方可公开。公开内容包括最终图片、作品名称、平台昵称和课程信息。</p>
        <el-checkbox v-model="submissionDialog.acceptPublication">我已阅读并同意审核及公开展示说明</el-checkbox>
        <p v-if="galleryStore.serverMode && !galleryStore.consent.granted">机构尚未登记公开授权，请联系管理员。</p>
      </div>
      <template #footer>
        <BaseButton variant="secondary" @click="submissionDialog.open = false">取消</BaseButton>
        <BaseButton :disabled="galleryBusy || !submissionDialog.acceptPublication || (galleryStore.serverMode && !galleryStore.consent.granted)" @click="submitPortfolioArtwork">{{ galleryBusy ? '提交中…' : '提交审核' }}</BaseButton>
      </template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, PictureFilled, Setting, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
import PortfolioBatchMenu from '../components/student/PortfolioBatchMenu.vue'
import PortfolioItemMenu from '../components/student/PortfolioItemMenu.vue'
import { useDifficultyStore } from '../stores/difficultyStore'
import { useGalleryStore } from '../stores/galleryStore'
import { useStudentGallery } from '../composables/useStudentGallery'
import { galleryCoverStyle, galleryStatusLabels } from '../utils/galleryRules'
import { extractImageUrl } from '../utils/referenceImages'
import { useProjectStore } from '../stores/projectStore'
import { useUserStore } from '../stores/userStore'
import { apiClient } from '../services/apiClient'

const router = useRouter()
const difficultyStore = useDifficultyStore()
const galleryStore = useGalleryStore()
const projectStore = useProjectStore()
const userStore = useUserStore()
const fallbackCover = "url('/assets/student-theme/paint-generation-canvas-v1.png') center / cover no-repeat"
const filterType = ref('all')
const portfolioDialog = reactive({ open: false, item: null })
const submissionDialog = reactive({ open: false, item: null, title: '', description: '' })
const { galleryBusy, consentBusy, galleryStatusLabel, isGalleryPublished, initializeGallery, toggleAutoSelectConsent, openSubmissionDialog, submitPortfolioArtwork, withdrawArtwork, withdrawSelected } = useStudentGallery({ galleryStore, projectStore, userStore, submissionDialog, getSourceProject })
const portfolioArtworkScale = ref(1)
const portfolioArtworkCompact = computed(() => portfolioArtworkScale.value < 1)
const canvasDocuments = ref([])
const sketchDocuments = ref([])
const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
const batchActive = ref(false)
const batchSelectedIds = ref([])

/**
 * 卡片点击分流：批量模式下点击 = 勾选/取消勾选，普通模式下才打开详情弹窗。
 * 这是「批量」与「打开详情」两种语义的唯一切换点，缺了它点卡片会一边勾选一边弹窗。
 */
function handleCardClick(item) {
  if (!batchActive.value) {
    openPortfolioDetail(item)
    return
  }
  const index = batchSelectedIds.value.indexOf(item.id)
  if (index >= 0) batchSelectedIds.value.splice(index, 1)
  else batchSelectedIds.value.push(item.id)
}

const portfolioItems = computed(() => {
  const items = []
  projectStore.projects.forEach((project) => {
    const versions = Array.isArray(project.versions) ? project.versions : []
    if (versions.length) {
      versions.forEach((version, index) => items.push({
        id: `${project.id}-version-${version.id || index}`,
        projectId: project.id,
        versionId: version.id || '',
        kind: 'project',
        title: version.title || `${project.title} · V${index + 1}`,
        meta: formatDate(version.createdAt || project.updatedAt),
        cover: version.imageUrl || version.background || project.cover,
        prompt: version.batchPrompt || version.prompt || project.prompt,
        description: version.note || project.ideaSummary || project.theme,
        ratio: version.ratio || version.batchMeta?.ratio || project.ratio || '4:3',
        finalVersionId: project.finalVersionId,
      }))
    } else {
      // 兼容历史项目：没有版本记录时仍显示原有项目卡片。
      items.push({
        id: `${project.id}-project`, projectId: project.id, kind: 'project', title: project.title,
        meta: project.updatedAt, cover: project.cover, prompt: project.prompt,
        description: project.ideaSummary || project.theme, ratio: project.ratio || '4:3',
        finalVersionId: project.finalVersionId,
      })
    }
    ;(project.models3d || []).forEach((model) => items.push({
      id: model.id, projectId: project.id, kind: 'model3d', title: model.title,
      meta: formatDate(model.createdAt), cover: model.cover || model.preview || project.cover,
      prompt: project.prompt, description: model.description, ratio: model.ratio || '1:1',
    }))
    ;(project.videos || []).forEach((video) => items.push({
      id: video.id, projectId: project.id, kind: 'video', title: video.title,
      meta: formatDate(video.createdAt), cover: video.background || video.cover || project.cover,
      prompt: project.prompt, description: video.description || video.script, ratio: video.ratio || '9:16',
    }))
    ;(project.texts || []).forEach((text) => items.push({
      id: text.id, projectId: project.id, kind: 'text', title: text.title || `${project.title} · 文本`,
      meta: formatDate(text.updatedAt || text.createdAt), cover: 'linear-gradient(135deg, #eef6ff, #f6f0ff)',
      prompt: text.text, description: text.text, ratio: '4:3', sourceNodeId: text.sourceNodeId,
    }))
  })
  canvasDocuments.value.forEach((document) => {
    const nodeCount = Array.isArray(document.data?.nodes) ? document.data.nodes.length : 0
    items.push({
      id: `${document.id}-canvas`,
      projectId: '',
      kind: 'canvas',
      title: document.title || '未命名无限画布',
      meta: formatDate(document.updatedAt || document.createdAt),
      cover: 'linear-gradient(135deg, #eef4ff, #f8f2ff)',
      prompt: '',
      description: `无限画布工作流，包含 ${nodeCount} 个节点。`,
      ratio: '16:9',
      documentId: document.id,
      resourceKey: document.resourceKey,
    })
  })
  // 手绘稿独立成一类：它是画板存下来的图片素材，不是项目，所以不进 projectStore。
  sketchDocuments.value.forEach((document) => {
    const cover = String(document.data?.imageUrl || '').trim()
      || (document.data?.assetId ? `/api/assets/${encodeURIComponent(document.data.assetId)}` : '')
      || (document.resourceKey ? `/api/assets/${encodeURIComponent(document.resourceKey)}` : '')
    items.push({
      id: `${document.id}-sketch`,
      projectId: '',
      kind: 'sketch',
      title: document.title || '未命名手绘稿',
      meta: formatDate(document.updatedAt || document.createdAt),
      cover,
      prompt: '',
      description: '手绘板保存的草图，可直接作为参考图使用。',
      ratio: '4:3',
      documentId: document.id,
      assetId: document.data?.assetId || document.resourceKey || '',
      resourceKey: document.resourceKey,
    })
  })
  return items
})

const visibleItems = computed(() => filterType.value === 'all'
  ? portfolioItems.value
  : portfolioItems.value.filter((item) => item.kind === filterType.value))

const typeOptions = computed(() => [
  { value: 'all', label: '全部素材', count: portfolioItems.value.length },
  { value: 'sketch', label: '手绘稿', count: portfolioItems.value.filter((item) => item.kind === 'sketch').length },
  { value: 'project', label: 'AI绘画', count: portfolioItems.value.filter((item) => item.kind === 'project').length },
  { value: 'video', label: 'AI视频', count: portfolioItems.value.filter((item) => item.kind === 'video').length },
  { value: 'text', label: '文本', count: portfolioItems.value.filter((item) => item.kind === 'text').length },
  { value: 'model3d', label: '3D作品', count: portfolioItems.value.filter((item) => item.kind === 'model3d').length },
  { value: 'canvas', label: '无限画布', count: portfolioItems.value.filter((item) => item.kind === 'canvas').length },
])

onMounted(async () => {
  await loadCanvasDocuments()
  await loadSketchDocuments()
  await initializeGallery()
})

async function loadCanvasDocuments() {
  if (!SERVER_AUTH_MODE) {
    try {
      const raw = window.localStorage.getItem('ai-workflow-canvas-stage1-v2')
      if (raw) {
        const saved = JSON.parse(raw)
        // 画布名称由 CanvasStudio 存在序列化对象的根级 title 上；老数据没有该字段时回退默认名。
        canvasDocuments.value = [{
          id: 'local-canvas',
          title: String(saved?.title || '').trim() || '未命名无限画布',
          data: saved,
          updatedAt: new Date().toISOString(),
        }]
      }
    } catch {
      canvasDocuments.value = []
    }
    return
  }
  try {
    const { data } = await apiClient.get('/me/documents', { params: { type: 'canvas' } })
    canvasDocuments.value = Array.isArray(data.documents) ? data.documents : []
  } catch {
    canvasDocuments.value = []
  }
}

async function loadSketchDocuments() {
  if (!SERVER_AUTH_MODE) {
    try {
      const raw = window.localStorage.getItem('ai-sketchpad-local-v1')
      sketchDocuments.value = raw ? JSON.parse(raw).map((item) => ({
        id: item.id,
        title: item.title,
        data: { imageUrl: item.imageUrl || item.dataUrl, assetId: '', width: item.width, height: item.height },
        updatedAt: item.createdAt,
      })) : []
    } catch {
      sketchDocuments.value = []
    }
    return
  }
  try {
    const { data } = await apiClient.get('/me/documents', { params: { type: 'sketch' } })
    sketchDocuments.value = Array.isArray(data.documents) ? data.documents : []
  } catch {
    sketchDocuments.value = []
  }
}

/**
 * 卡片右上角菜单做完动作后刷新「文档类」素材（画布 / 手绘稿）。
 * 项目类素材存在 projectStore 里本来就是响应式的，不用重读；
 * 文档类要靠重新拉一次列表才会消失或改名。
 */
function reloadDocuments() {
  loadCanvasDocuments()
  loadSketchDocuments()
}

/**
 * 删掉一张手绘稿。草图只是素材，删掉不影响任何项目记录，
 * 所以这里直接删文档；非 server 模式同步清本地缓存。
 */
async function deleteSketch(item) {
  if (!item?.documentId) return
  try {
    await ElMessageBox.confirm(`确定删掉「${item.title}」吗？删除后无法恢复。`, '删除手绘稿', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
    })
  } catch {
    return
  }
  if (SERVER_AUTH_MODE) {
    try {
      await apiClient.delete(`/me/documents/${encodeURIComponent(item.documentId)}`)
    } catch {
      ElMessage.error('删除失败，请稍后重试。')
      return
    }
  } else {
    try {
      const list = JSON.parse(window.localStorage.getItem('ai-sketchpad-local-v1') || '[]')
      window.localStorage.setItem('ai-sketchpad-local-v1', JSON.stringify(list.filter((entry) => entry.id !== item.documentId)))
    } catch {
      /* 本地缓存损坏时忽略，刷新列表即可 */
    }
  }
  portfolioDialog.open = false
  await loadSketchDocuments()
  ElMessage.success('已删除')
}

function kindLabel(kind) {
  return { project: 'AI绘画', model3d: '3D作品', video: '动态视频', text: '创作文本', canvas: '无限画布', sketch: '手绘稿' }[kind] || '作品'
}
function formatDate(value) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
function getSourceProject(projectId) {
  return projectStore.projects.find((project) => project.id === projectId) || projectStore.currentProject || projectStore.draft
}
function normalizePortfolioRatio(value, kind = 'project') {
  const ratio = String(value || '').trim()
  if (['1:1', '4:3', '3:4', '16:9', '9:16'].includes(ratio)) return ratio
  return { project: '4:3', model3d: '1:1', video: '9:16', canvas: '16:9', sketch: '4:3' }[kind] || '4:3'
}
function getPortfolioImageUrl(cover = '') {
  const value = String(cover || '')
  if (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/')) return value
  return value.match(/url\(["']?([^"')]+)["']?\)/)?.[1] || ''
}
function getPortfolioArtworkStyle(item) {
  const imageUrl = getPortfolioImageUrl(item?.cover)
  return { background: imageUrl ? `url("${imageUrl}") center / cover no-repeat #f8fafc` : item?.cover || fallbackCover }
}
function getPortfolioDetailArtworkStyle(item) {
  const imageUrl = getPortfolioImageUrl(item?.cover)
  return {
    aspectRatio: normalizePortfolioRatio(item?.ratio, item?.kind).replace(':', ' / '),
    background: imageUrl ? `url("${imageUrl}") center / contain no-repeat #f8fafc` : item?.cover || fallbackCover,
    '--portfolio-artwork-scale': portfolioArtworkScale.value,
  }
}
function getPortfolioRatioClass(item) {
  const ratio = normalizePortfolioRatio(item?.ratio, item?.kind)
  if (['9:16', '3:4'].includes(ratio)) return 'is-vertical'
  if (ratio === '1:1') return 'is-square'
  return 'is-wide'
}
function getPortfolioDescription(item) {
  if (!item) return '暂无作品说明。'
  if (item.kind === 'canvas') return item.description || '无限画布工作流。'
  return item.kind === 'project' ? item.prompt || item.description || '暂无提示词内容。' : item.description || item.prompt || '暂无作品说明。'
}
function openPortfolioDetail(item) {
  portfolioDialog.item = item
  portfolioArtworkScale.value = 1
  portfolioDialog.open = true
}
function changePortfolioArtworkScale(delta) {
  portfolioArtworkScale.value = Math.min(5, Math.max(0.2, Math.round((portfolioArtworkScale.value + delta) * 10) / 10))
}
function openPortfolioItem(item) {
  if (item.kind === 'canvas') {
    router.push({ path: '/student/canvas', query: item.documentId && item.documentId !== 'local-canvas' ? { canvasId: item.documentId } : {} })
    return
  }
  projectStore.openProject(item.projectId)
  if (item.kind === 'model3d') router.push({ path: '/student/model3d', query: { projectId: item.projectId, modelId: item.id } })
  else if (item.kind === 'video') router.push('/student/video')
  else if (item.kind === 'text') router.push('/student/canvas')
  else router.push('/student/paint')
}
function goCanvasEdit(item) {
  if (item.kind === 'canvas') {
    portfolioDialog.open = false
    router.push({ path: '/student/canvas', query: item.documentId && item.documentId !== 'local-canvas' ? { canvasId: item.documentId } : {} })
    return
  }
  projectStore.openProject(item.projectId)
  portfolioDialog.open = false
  router.push('/student/canvas')
}
function importReference(item) {
  // 参考图只取「那张图」本身：封面可能是 CSS background（url("...")）或纯渐变占位，
  // 必须抽出真实图片地址，否则绘画页 <img :src="item.preview"> 拿到 undefined 就是破图。
  const preview = extractImageUrl(item.cover) || extractImageUrl(getSourceProject(item.projectId)?.cover)
  if (!preview) {
    ElMessage.warning('这张素材没有可用的图片，无法作为参考图。')
    return
  }
  projectStore.startNewProject(difficultyStore.current)
  projectStore.setCurrentProject({
    ...(projectStore.currentProject || {}),
    title: `${item.title} 参考图创作`,
    theme: item.title,
    // 只带一张干净的参考图，不继承源项目的提示词，也不写任何自动文案。
    prompt: '',
    cover: preview,
    referenceImages: [{
      id: `ref-portfolio-${Date.now()}`,
      name: item.title || '参考图',
      source: 'portfolio',
      preview,
      edited: false,
      createdAt: new Date().toISOString(),
    }],
  })
  portfolioDialog.open = false
  ElMessage.success('已导入为参考图')
  router.push('/student/paint')
}
function modifyArtwork(item) {
  portfolioDialog.open = false
  if (item.kind === 'project') {
    const source = getSourceProject(item.projectId)
    const versionId = item.versionId || source?.finalVersionId || source?.versions?.[0]?.id
    if (!versionId) return ElMessage.warning('该作品没有可编辑的图片版本。')
    projectStore.openProject(item.projectId)
    router.push({ path: '/student/paint', query: { projectId: item.projectId, versionId, edit: '1' } })
    return
  }
  openPortfolioItem(item)
}
function startNew() {
  projectStore.startNewProject(difficultyStore.current)
  router.push('/student/paint')
}
</script>

<style scoped lang="scss">
.portfolio-page {
  min-height: calc(100dvh - var(--app-top, 0px));
  padding: 18px;
  background: radial-gradient(circle at 74% 2%, rgba(190, 198, 255, .42), transparent 28%), linear-gradient(145deg, #fbf8f5, #f1f4ff 56%, #fbfaf8);
  color: #25346e;
}
.portfolio-header,
.portfolio-toolbar {
  max-width: 1440px;
  margin: 0 auto;
  border: 1px solid rgba(117, 130, 205, .18);
  background: rgba(255,255,255,.78);
  box-shadow: 0 14px 34px rgba(64, 77, 154, .1), inset 0 1px rgba(255,255,255,.96);
  backdrop-filter: blur(14px);
}
.portfolio-header {
  /* 全站统一导航条 58px。原来是 min-height 92 + 上下 15 内边距，里面还摞了英文小字、
     标题、说明三行，实测 113px —— 页面第一条就被这一块吃掉一大截。
     现在只留一行：返回工作台 | 我的素材库 | 开始新创作。 */
  min-height: 58px;
  border-radius: 18px;
  padding: 0 14px;
  display: flex;
  gap: 12px;
  align-items: center;
}
/* 标题左右各一块弹性留白：不论两侧按钮文字长短，标题都稳稳居中 */
.header-spacer { flex: 1 1 0; min-width: 0; }
.back-button,
.new-work-button,
.batch-button {
  min-height: 34px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  flex: 0 0 auto;
}
.back-button { border: 1px solid rgba(111,126,214,.2); display: flex; gap: 7px; align-items: center; background: #fff; color: #5262ba; }
.new-work-button { border: 0; background: linear-gradient(100deg, #596ae4, #8e7cec, #bb7edd); color: #fff; box-shadow: 0 10px 22px rgba(89,106,228,.22); }
.portfolio-heading { text-align: center; }
.portfolio-heading h1 { margin: 0; color: #25346e; font-size: 20px; letter-spacing: .02em; white-space: nowrap; }
/* position+z-index 必须给：上面那条公共规则里的 backdrop-filter 会让工具栏自成层叠上下文，
   内部下拉菜单的 z-index 被封死在工具栏内 → 被后面的素材卡片盖住（真实故障复现点）。
   高度收紧：原 12px 内边距 + 42px 按钮 + 横向滚动条，让这条横栏占掉近 70px，把下面卡片整体压下移。 */
.portfolio-toolbar { position: relative; z-index: 30; margin-top: 12px; border-radius: 18px; padding: 7px 9px; display: flex; align-items: center; gap: 8px; }
/* 分类太多时让它自身可横向滚动（窄屏保底），但滚动条本身也是"乱"的来源之一 → 隐藏滚槽只留滚动能力 */
.type-tabs { flex: 1 1 auto; display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
.type-tabs::-webkit-scrollbar { display: none; }
.type-tabs button { min-height: 34px; border: 1px solid transparent; border-radius: 999px; padding: 0 11px; display: flex; gap: 6px; align-items: center; white-space: nowrap; background: transparent; color: #6873a5; font-size: 13px; font-weight: 800; cursor: pointer; }
.type-tabs button span { min-width: 20px; height: 20px; border-radius: 999px; display: grid; place-items: center; background: #eef0ff; font-size: 11px; }
.type-tabs button.active { border-color: rgba(112,126,219,.22); background: #eef0ff; color: #5263cb; }
/* 授权设置收成一个齿轮图标按钮：原有的说明文字 + 未授权提示都是整句长文案，
   直接摊在横栏里既挤爆分类又把它顶高，改成点开才看。 */
.consent-entry { flex: 0 0 auto; width: 34px; min-height: 34px; padding: 0; border: 1px solid rgba(111,126,214,.2); border-radius: 999px; display: grid; place-items: center; background: #fff; color: #6b76b4; font-size: 16px; cursor: pointer; transition: color 160ms ease, border-color 160ms ease, background 160ms ease; }
.consent-entry:hover { border-color: rgba(111,126,214,.42); color: #5263cb; }
.consent-entry.is-opted { border-color: rgba(89,106,228,.34); background: #eef0ff; color: #5263cb; }
.batch-button { border: 1px solid rgba(111,126,214,.2); background: #fff; color: #5664b7; }
.portfolio-grid { max-width: 1440px; margin: 12px auto 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.portfolio-card { position: relative; min-width: 0; border: 1px solid rgba(117,130,205,.18); border-radius: 20px; overflow: hidden; background: #fff; box-shadow: 0 14px 28px rgba(55,68,145,.11); cursor: pointer; transition: transform 200ms ease, box-shadow 200ms ease, border-color 160ms ease; }
.portfolio-card:hover,
.portfolio-card:focus-visible { transform: translateY(-4px); box-shadow: 0 20px 38px rgba(55,68,145,.17); outline: none; }
/* 批量态：位移会让整片网格抖动、也让人误以为卡片还在"打开详情"，这里关掉位移只留描边反馈 */
.portfolio-card.is-batch { cursor: default; }
.portfolio-card.is-batch:hover,
.portfolio-card.is-batch:focus-visible { transform: none; box-shadow: 0 14px 28px rgba(55,68,145,.11); outline: none; }
.portfolio-card.is-batch:focus-visible { outline: 2px solid #7c84df; outline-offset: 3px; }
.portfolio-card.is-picked { border-color: #6f7ee0; box-shadow: 0 0 0 3px rgba(112,126,219,.22), 0 18px 34px rgba(55,68,145,.16); }
.portfolio-card.is-picked .portfolio-cover::after { background: linear-gradient(180deg, rgba(89,106,228,.14), rgba(25,34,86,.82)); }
/* 勾选框：卡片自身 overflow:hidden，绝对定位挂在卡片上（与封面同一起点） */
.portfolio-select-box { position: absolute; z-index: 3; top: 12px; left: 12px; width: 26px; height: 26px; border: 2px solid rgba(255,255,255,.92); border-radius: 9px; display: grid; place-items: center; background: rgba(28,36,84,.32); color: #fff; font-size: 15px; backdrop-filter: blur(6px); transition: background 160ms ease, border-color 160ms ease; }
.portfolio-select-box.checked { border-color: #fff; background: linear-gradient(135deg, #596ae4, #8e7cec); }
/* 勾选框占住左上角，批量态把类型标签右移让位 */
.portfolio-card.is-batch .kind-chip { left: 46px; }
.portfolio-cover { position: relative; height: 240px; overflow: hidden; background-position: center !important; background-size: cover !important; }
.portfolio-cover::after { content: ''; position: absolute; inset: 42% 0 0; background: linear-gradient(180deg, transparent, rgba(25,34,86,.78)); }
.kind-chip,
.published-chip { position: absolute; z-index: 2; top: 12px; min-height: 28px; border-radius: 999px; padding: 0 10px; display: inline-flex; align-items: center; background: rgba(255,255,255,.87); color: #5967be; font-size: 11px; font-weight: 900; backdrop-filter: blur(8px); }
.kind-chip { left: 12px; }
/* 「已上架」标签让出右上角给「三个点」菜单 */
.published-chip { right: 52px; color: #e66f38; }
/* 批量态三个点隐藏，「已上架」可以回到最右边 */
.portfolio-card.is-batch .published-chip { right: 12px; }
.portfolio-cover-info { position: absolute; z-index: 2; left: 15px; right: 15px; bottom: 14px; color: #fff; }
.portfolio-cover-info strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; }
.portfolio-cover-info p { margin: 5px 0 0; color: rgba(255,255,255,.78); font-size: 12px; }
.portfolio-empty { max-width: 1440px; min-height: 420px; margin: 16px auto 0; border: 1px dashed rgba(112,126,219,.28); border-radius: 24px; display: grid; place-content: center; justify-items: center; gap: 10px; background: rgba(255,255,255,.64); color: #6c76a4; text-align: center; }
.portfolio-empty :deep(.el-icon) { font-size: 46px; color: #7c84df; }
.portfolio-empty h2,
.portfolio-empty p { margin: 0; }
.portfolio-detail { display: grid; grid-template-columns: minmax(0, 7fr) minmax(220px, 3fr); gap: 20px; }
.portfolio-detail-media-stage { position: relative; min-height: 360px; max-height: min(64vh,560px); border-radius: 18px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f4f5fb; }
.portfolio-zoom-controls { position: absolute; z-index: 3; top: 14px; right: 14px; display: flex; gap: 8px; }
.portfolio-zoom-controls button { width: 42px; height: 42px; border: 1px solid rgba(111,126,214,.2); border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.9); color: #5968c5; cursor: pointer; }
.portfolio-detail-artwork { max-width: 100%; max-height: min(64vh,560px); border-radius: 18px; background-position: center; background-size: contain; background-repeat: no-repeat; transform: scale(var(--portfolio-artwork-scale,1)); transform-origin: center; transition: transform 180ms ease; box-shadow: 0 18px 38px rgba(35,47,113,.14); }
.portfolio-detail-artwork.is-wide { width: min(100%,680px); }
.portfolio-detail-artwork.is-square { width: min(100%,520px); }
.portfolio-detail-artwork.is-vertical { width: min(100%,330px); }
.portfolio-detail-main { min-height: 360px; max-height: min(64vh,560px); border: 1px solid rgba(117,130,205,.18); border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 18px; background: #faf9ff; }
.portfolio-detail-type { min-height: 32px; border-radius: 999px; padding: 0 11px; display: inline-flex; align-items: center; background: #eceeff; color: #5e6acb; font-weight: 900; }
.portfolio-detail-main h2 { margin: 12px 0 6px; color: #25346e; }
.portfolio-detail-main p { color: #707aa4; }
.portfolio-detail-prompt { flex: 1; min-height: 180px; border-radius: 15px; padding: 14px; overflow: hidden; background: #fff; }
.portfolio-detail-prompt span { color: #5e6acb; font-size: 12px; font-weight: 900; }
.portfolio-detail-prompt p { max-height: 220px; overflow-y: auto; white-space: pre-wrap; line-height: 1.65; }
.portfolio-detail-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.submission-form { display: grid; gap: 16px; }
.submission-form > label:not(.el-checkbox) { display: grid; gap: 7px; }
.submission-form > label:not(.el-checkbox) > span { color: #25346e; font-weight: 900; }
.submission-form :deep(.el-checkbox) { height: auto; white-space: normal; align-items: flex-start; }
.submission-form :deep(.el-checkbox__label) { white-space: normal; line-height: 1.6; }
.submission-form p { margin: 0; color: #7880a4; line-height: 1.6; }
@media (max-width: 1100px) { .portfolio-grid { grid-template-columns: repeat(3,1fr); } }
@media (max-width: 800px) { .portfolio-grid { grid-template-columns: repeat(2,1fr); } .portfolio-toolbar { flex-wrap: wrap; } .type-tabs { flex-basis: 100%; } .portfolio-detail { grid-template-columns: 1fr; } }
@media (max-width: 540px) { .portfolio-page { padding: 10px; } .portfolio-grid { grid-template-columns: 1fr; } .portfolio-header { border-radius: 14px; padding: 0 10px; gap: 8px; } .portfolio-heading h1 { font-size: 17px; } .back-button { width: 34px; padding: 0; gap: 0; font-size: 0; justify-content: center; } .new-work-button { padding: 0 11px; font-size: 12px; } .portfolio-cover { height: 260px; } }
</style>
