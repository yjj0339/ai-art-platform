<template>
  <main class="advanced-preview-page app-page">
    <header class="preview-header">
      <button type="button" class="preview-back" @click="backToEditor"><ArrowLeft /><span>返回编辑</span></button>
      <div class="preview-title">
        <strong>第3步：预览我的H5报告</strong>
        <small>手机真实效果 · 工作流结果图</small>
      </div>
      <ol class="preview-progress" aria-label="报告生成进度">
        <li class="done"><b><CircleCheckFilled /></b><span>资料整理</span></li>
        <li class="done"><b><CircleCheckFilled /></b><span>叙事编辑</span></li>
        <li class="active"><b>3</b><span>独立预览</span></li>
        <li><b>4</b><span>提交审核</span></li>
      </ol>
      <button type="button" class="preview-generate" @click="confirmGenerate"><MagicStick />确认生成H5报告</button>
    </header>

    <section class="preview-workspace">
      <aside class="chapter-sidebar">
        <div class="side-heading"><small>报告结构</small><strong>章节导航</strong></div>
        <nav v-if="navPages.length" aria-label="预览章节">
          <button v-for="(page, index) in navPages" :key="page.id" type="button" :class="{ active: pageIndex === index }" @click="pageIndex = index">
            <i><Picture /></i>
            <span><strong>{{ page.label }}</strong><small>{{ String(index + 1).padStart(2, '0') }}</small></span>
          </button>
        </nav>
        <p v-if="workflowPageImages.length"><InfoFilled />正在看讲师工作流出的 {{ workflowPageImages.length }} 张结果图。</p>
        <p v-else><InfoFilled />还没有结果图，回到上一步点「生成 H5 报告」后再来预览。</p>
      </aside>

      <section class="phone-preview-stage">
        <div class="stage-heading">
          <div><span><Iphone />手机预览{{ isLandscape ? '横版' : '竖版' }}</span><strong>{{ reportTitle }}</strong></div>
          <small>{{ ratioLabel }}</small>
        </div>
        <div ref="phoneRendererWrap" class="phone-renderer-wrap">
          <!-- 手机框只放工作流出的成品结果图，一张图就是一页。
               原来那套「用 project 字段硬拼文字页 / 排版模板」的渲染已经移除：
               它显示的不是工作流结果，用户看到的图全是错的。
               外壳尺寸由图片真实画幅决定：竖图 = 竖手机，横图 = 横手机，图永远完整不裁切。
               手机外壳永远都在：没有结果图时也只是屏幕里空着，不能把整台手机藏掉，
               否则用户点「预览」看到的是一片白，以为功能坏了（老问题）。 -->
          <div class="phone-shell" :style="phoneShellStyle">
            <H5PageImageViewer v-if="workflowPageImages.length" v-model:index="pageIndex" :images="workflowPageImages" :show-nav="false" @size="onImageSize" />
            <div v-else class="phone-empty">
              <Picture />
              <strong>还没有结果图</strong>
              <span>回到上一步，勾选素材后点「生成 H5 报告」，工作流出图后这里就会显示。</span>
            </div>
          </div>
        </div>
        <div class="stage-controls">
          <button type="button" :disabled="pageIndex === 0" @click="pageIndex--"><ArrowLeft />上一页</button>
          <span>{{ previewPageCount ? `${pageIndex + 1} / ${previewPageCount}` : '暂无结果图' }}</span>
          <button type="button" :disabled="pageIndex >= previewPageCount - 1" @click="pageIndex++">下一页<ArrowRight /></button>
        </div>
      </section>

      <aside class="preview-settings">
        <section class="settings-block preview-checks">
          <div class="settings-title"><div><small>生成前确认</small><strong>报告检查</strong></div></div>
          <ul>
            <li><CircleCheckFilled /><span><strong>创意说明已整理</strong><small>{{ ideaText ? '已使用当前草稿内容' : '将使用本地兜底说明' }}</small></span></li>
            <li><CircleCheckFilled /><span><strong>作品素材已接入</strong><small>{{ materialSummary }}</small></span></li>
            <li><CircleCheckFilled /><span><strong>结果图已就位</strong><small>{{ workflowPageImages.length ? `${workflowPageImages.length} 张工作流结果图` : '还没有结果图' }}</small></span></li>
          </ul>
        </section>

        <div class="preview-actions">
          <button type="button" class="continue-edit" @click="backToEditor">返回继续修改</button>
          <button type="button" class="confirm-generate" @click="confirmGenerate"><MagicStick />确认生成H5报告</button>
        </div>
      </aside>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  CircleCheckFilled,
  InfoFilled,
  Iphone,
  MagicStick,
  Picture,
} from '@element-plus/icons-vue'
import H5PageImageViewer from '../components/H5PageImageViewer.vue'
import { apiClient } from '../services/apiClient'
import { createEmptyProject, useProjectStore } from '../stores/projectStore'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()
const project = reactive(createEmptyProject('pro'))
const previewDraft = reactive({ reportTitle: '', idea: '', templateId: '', availableTemplateIds: [], pageImages: [] })
const pageIndex = ref(0)
// 预览页不再提供「H5报告风格」切换：报告外观完全由老师发布的工作流结果图决定，
// 再摆一排风格卡只会让人以为换一下就能改图，实际换不了。这里只保留模板 id 原样传递，
// 保证生成时写进报告的 h5TemplateId 不变（后端和历史数据还要用这个字段）。
const selectedTemplateId = ref('')

const reportTitle = computed(() => previewDraft.reportTitle || `${project.title || '我的项目'} H5 创作报告`)
const ideaText = computed(() => previewDraft.idea || project.idea || project.reportIdea || '')
// 工作流结果图：一张图就是一页，手机框里只翻这些成品图。
// 原来那套「用 project 字段硬拼封面/创意说明/过程/3D/视频/最终作品」的假页已经删掉，
// 因为它显示的根本不是工作流出的图。
const workflowPageImages = computed(() => (previewDraft.pageImages || []).filter((item) => item?.url))
const navPages = computed(() => workflowPageImages.value.map((item, index) => ({ id: item.id || `workflow-${index + 1}`, label: item.label || `结果图 ${index + 1}` })))
const previewPageCount = computed(() => workflowPageImages.value.length)
const materialSummary = computed(() => `手稿 ${project.sketchOriginal ? 1 : 0} · 3D ${project.models3d?.length || 0} · 视频 ${project.videos?.length || 0}`)

// ---- 手机外壳跟着图片画幅走 ----
// 图片真实像素（由看图组件 onload 后上报）。没上报之前先按 9:16 竖图占位。
const imageSize = ref({ width: 390, height: 844 })
const phoneRendererWrap = ref(null)
const stageSize = ref({ width: 0, height: 0 })
let stageObserver = null
const isLandscape = computed(() => imageSize.value.width > imageSize.value.height)
// 手机预览基准画幅：9:16 竖屏。方图靠它兜住。
const PHONE_RATIO = 9 / 16
const isSquareImage = computed(() => {
  const { width, height } = imageSize.value
  if (!width || !height) return false
  const ratio = width / height
  return ratio >= 0.85 && ratio <= 1.18
})
// 外壳外框（含边框）的长宽比：竖图竖着放，横图横着放。
// 方图（1:1）不跟着变成方手机 —— 真实手机没有正方形屏幕，
// 用户看到方壳会以为是页面画错了，所以方图统一按 9:16 竖屏出壳，图片等比装进去。
const shellRatio = computed(() => {
  const { width, height } = imageSize.value
  if (!width || !height) return PHONE_RATIO
  if (isSquareImage.value) return PHONE_RATIO
  return width / height
})
// 外壳在中间区域内等比缩放，永远完整可见：宽和高谁先顶到边界就按谁算。
// 注意要扣掉边框厚度 —— 屏幕区域（内框）才必须等于图片画幅，
// 否则竖图放进去会多出几像素黑边，横图上下会被压扁。
const phoneShellStyle = computed(() => {
  const { width: stageW, height: stageH } = stageSize.value
  if (!stageW || !stageH) return {}
  const bezel = Math.min(12, Math.max(5, Math.round(Math.min(stageW, stageH) * 0.018)))
  const ratio = shellRatio.value
  // 内框可用空间
  const maxInnerW = Math.max(stageW - bezel * 2, 40)
  const maxInnerH = Math.max(stageH - bezel * 2, 40)
  const innerW = Math.min(maxInnerW, maxInnerH * ratio)
  const innerH = innerW / ratio
  const outerW = innerW + bezel * 2
  const outerH = innerH + bezel * 2
  return {
    '--shell-bezel': `${bezel}px`,
    '--shell-radius': `${Math.round(Math.min(outerW, outerH) * 0.09)}px`,
    width: `${Math.floor(outerW)}px`,
    height: `${Math.floor(outerH)}px`,
    padding: `${bezel}px`,
  }
})
const ratioLabel = computed(() => {
  // 没图时别报「390 × 844 竖图」这种占位数字，用户看到会以为已经有图了。
  if (!workflowPageImages.value.length) return '等待结果图'
  const { width, height } = imageSize.value
  if (!width || !height) return '等待结果图'
  const divisor = gcd(width, height)
  const w = width / divisor
  const h = height / divisor
  const shape = width === height ? '方图' : (isLandscape.value ? '横图' : '竖图')
  // 常见比例直接说人话，杂比例给像素值，避免出现 227:400 这种看不懂的数字
  const known = { '9:16': '9:16', '2:3': '2:3', '1:1': '1:1', '3:4': '3:4', '4:3': '4:3', '16:9': '16:9' }
  const key = `${w}:${h}`
  return known[key] ? `${known[key]} ${shape}` : `${width} × ${height} ${shape}`
})
function gcd(a, b) { return b ? gcd(b, a % b) : a }
function onImageSize(size) {
  if (!size?.width || !size?.height) return
  if (size.width === imageSize.value.width && size.height === imageSize.value.height) return
  imageSize.value = { width: size.width, height: size.height }
}
function measureStage() {
  const el = phoneRendererWrap.value
  if (!el) return
  const { width, height } = el.getBoundingClientRect()
  // 留 8px 余量，避免外壳阴影/边框被容器边缘切掉
  stageSize.value = { width: Math.max(width - 16, 0), height: Math.max(height - 16, 0) }
}

onMounted(async () => {
  Object.assign(project, projectStore.currentProject || projectStore.draft || createEmptyProject('pro'))
  try {
    Object.assign(previewDraft, JSON.parse(sessionStorage.getItem('advanced-h5-preview-draft') || '{}'))
  } catch {}
  // 先把中间区域量出来，手机外壳才不会在等接口的时候闪一下空白
  await nextTick()
  measureStage()
  stageObserver = new ResizeObserver(measureStage)
  if (phoneRendererWrap.value) stageObserver.observe(phoneRendererWrap.value)
  // 模板 id 只做原样透传（生成时写进报告的 h5TemplateId），预览页不再拉风格列表、也不再让人切换。
  selectedTemplateId.value = previewDraft.templateId || project.h5TemplateId || ''
  pageIndex.value = Math.min(Number(previewDraft.currentPageIndex) || 0, Math.max(previewPageCount.value - 1, 0))
  await loadSavedPageImages()
})

// 报告已经保存过、图也落过盘，但这次进预览页时 sessionStorage 里没带图
// （典型场景：从报告列表点「查看预览」，或刷新了页面）。
// 这时直接按报告 id 把服务器上已有的结果图读回来，凭据不足才退回空状态。
// 页面图片的读接口是 /api/h5-report-assets/:reportId/:pageId。
async function loadSavedPageImages() {
  if (workflowPageImages.value.length) return
  const reportId = String(route.query.reportId || localStorage.getItem('art-studio-current-report-id') || '').trim()
  if (!reportId) return
  try {
    const { data } = await apiClient.get('/h5-reports')
    const saved = (data?.reports || []).find((item) => item.id === reportId)
    const pages = Array.isArray(saved?.pageImages) ? saved.pageImages.filter((item) => item?.id) : []
    if (!pages.length) return
    previewDraft.pageImages = pages.map((item, index) => ({
      id: item.id,
      label: item.label || `结果图 ${index + 1}`,
      url: `/api/h5-report-assets/${encodeURIComponent(reportId)}/${encodeURIComponent(item.id)}`,
    }))
    pageIndex.value = Math.min(pageIndex.value, Math.max(previewDraft.pageImages.length - 1, 0))
  } catch {
    // 读不到就保持空状态，不打断预览页其他部分
  }
}

onBeforeUnmount(() => {
  stageObserver?.disconnect()
  stageObserver = null
})

watch(pageIndex, persistPreviewDraft)
watch(selectedTemplateId, persistPreviewDraft)

function persistPreviewDraft() {
  previewDraft.currentPageIndex = pageIndex.value
  previewDraft.templateId = selectedTemplateId.value
  sessionStorage.setItem('advanced-h5-preview-draft', JSON.stringify(previewDraft))
}
function backToEditor() { router.push('/student/h5-report') }
function confirmGenerate() {
  projectStore.saveDraft({ ...project, idea: ideaText.value, reportIdea: ideaText.value, h5TemplateId: selectedTemplateId.value })
  persistPreviewDraft()
  router.push({ path: '/student/h5-report', query: { action: 'generate' } })
}
</script>

<style scoped lang="scss">
.advanced-preview-page { min-height: calc(100vh - var(--app-top, 0px)); padding: 0 18px 16px; color: #122b49; background: #f3f8ff; overflow: hidden; }
.preview-header { max-width: 1540px; min-height: 76px; margin: 0 auto; display: grid; grid-template-columns: 150px minmax(220px,.75fr) auto minmax(190px,.65fr); align-items: center; gap: 18px; border-bottom: 1px solid #dbe7f5; }
.preview-back { border: 0; display: inline-flex; align-items: center; gap: 8px; color: #24567f; background: transparent; font-size: 14px; font-weight: 800; cursor: pointer; }
.preview-back svg { width: 19px; height: 19px; }
.preview-title { display: grid; gap: 4px; }
.preview-title strong { font-size: 20px; }
.preview-title small { color: #748aa3; font-size: 11px; }
.preview-progress { margin: 0; padding: 0; display: flex; gap: 28px; list-style: none; }
.preview-progress li { width: 68px; display: grid; justify-items: center; gap: 6px; position: relative; color: #60758f; font-size: 10px; font-weight: 800; white-space: nowrap; }
.preview-progress li:not(:last-child)::after { content: ''; position: absolute; top: 11px; left: 47px; width: 49px; height: 1px; background: #c5d5e8; }
.preview-progress b { position: relative; z-index: 1; width: 23px; height: 23px; border: 1px solid #9cb3cf; border-radius: 50%; display: grid; place-items: center; background: #f8fbff; font-size: 12px; }
.preview-progress b svg { width: 13px; height: 13px; }
.preview-progress .done b,.preview-progress .active b { border-color: #1678f3; color: #fff; background: #1678f3; }
.preview-progress .active { color: #1472eb; }
.preview-generate { justify-self: end; min-height: 42px; border: 0; border-radius: 9px; padding: 0 17px; display: inline-flex; align-items: center; gap: 7px; color: #fff; background: #ff6900; font-size: 14px; font-weight: 900; cursor: pointer; box-shadow: 0 8px 20px rgba(255,105,0,.18); }
.preview-generate svg { width: 18px; height: 18px; }
/* 右栏原来放「H5报告风格」卡片，删掉后只剩一块「报告检查」，
   300px 会留出大片空白，收窄到 240px 把空间让给中间的手机预览。 */
.preview-workspace { max-width: 1540px; height: calc(100vh - var(--app-top, 0px) - 94px); min-height: 620px; margin: 8px auto 0; display: grid; grid-template-columns: minmax(190px,16%) minmax(430px,1fr) minmax(238px,20%); gap: 10px; }
.chapter-sidebar,.phone-preview-stage,.preview-settings { min-width: 0; min-height: 0; border: 1px solid #d8e6f6; border-radius: 13px; background: rgba(255,255,255,.9); box-shadow: 0 12px 30px rgba(35,84,145,.06); }
.chapter-sidebar { padding: 19px 14px; display: flex; flex-direction: column; }
.side-heading { padding: 0 8px 13px; display: grid; gap: 4px; border-bottom: 1px solid #e4edf7; }
.side-heading small,.settings-title small { color: #7c91aa; font-size: 10px; }
.side-heading strong,.settings-title strong { color: #18324f; font-size: 16px; }
.chapter-sidebar nav { margin-top: 10px; display: grid; gap: 7px; }
.chapter-sidebar nav button { min-height: 55px; border: 1px solid transparent; border-radius: 10px; padding: 7px 9px; display: grid; grid-template-columns: 34px minmax(0,1fr); align-items: center; gap: 9px; color: #536a83; background: transparent; text-align: left; cursor: pointer; }
.chapter-sidebar nav button:hover { background: #f6faff; }
.chapter-sidebar nav button.active { border-color: #83b8fb; color: #116eea; background: #eef6ff; box-shadow: 0 5px 14px rgba(28,117,235,.08); }
.chapter-sidebar nav i { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: #4c7cb3; background: #eef5fd; font-style: normal; }
.chapter-sidebar nav i svg { width: 17px; height: 17px; }
.chapter-sidebar nav span { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 5px; }
.chapter-sidebar nav strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.chapter-sidebar nav small { color: #93a4b8; font-size: 9px; }
.chapter-sidebar>p { margin: auto 5px 0; display: flex; gap: 6px; color: #8194ab; font-size: 10px; line-height: 1.5; }
.chapter-sidebar>p svg { flex: 0 0 auto; width: 14px; height: 14px; }
.phone-preview-stage { padding: 16px 20px 13px; display: grid; grid-template-rows: 42px minmax(0,1fr) 42px; overflow: hidden; background: #eaf3ff; }
.stage-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.stage-heading>div { display: grid; gap: 4px; }
.stage-heading span { display: inline-flex; align-items: center; gap: 6px; color: #1575ef; font-size: 10px; font-weight: 900; }
.stage-heading span svg { width: 14px; height: 14px; }
.stage-heading strong { max-width: 32em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
.stage-heading>small { border-radius: 999px; padding: 5px 9px; color: #5d7895; background: #fff; font-size: 9px; }
.phone-renderer-wrap { min-height: 0; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
/* 手机外壳：尺寸由脚本按图片真实画幅算出（竖图竖手机、横图横手机），
   屏幕区域正好等于图片画幅，所以整张图一定完整、不变形、不裁边。 */
.phone-shell { flex: 0 0 auto; box-sizing: border-box; border-radius: var(--shell-radius, 28px); background: #0d213b; box-shadow: 0 0 0 2px rgba(66,191,255,.4), 0 20px 44px rgba(22,77,135,.28); overflow: hidden; }
.phone-shell :deep(.h5-page-image-viewer) { width: 100%; height: 100%; margin: 0; display: flex; flex-direction: column; }
.phone-shell :deep(.image-stage) { flex: 1 1 auto; min-height: 0; border-radius: calc(var(--shell-radius, 28px) - var(--shell-bezel, 8px)); }
.phone-shell :deep(.image-stage img) { width: 100%; height: 100%; object-fit: contain; }
/* 空状态装在手机屏幕里（不是外面单独一个虚线框）：手机机身始终看得见，
   用户一眼就知道「手机在、只是还没出图」，不会以为预览坏了。 */
.phone-empty { width: 100%; height: 100%; display: grid; place-content: center; justify-items: center; gap: 9px; padding: 22px 18px; box-sizing: border-box; color: #6f88a3; background: #edf4fb; text-align: center; border-radius: calc(var(--shell-radius, 28px) - var(--shell-bezel, 8px)); }
.phone-empty svg { width: 38px; height: 38px; color: #a9c6e6; }
.phone-empty strong { color: #2c5b8e; font-size: clamp(12px, 2.4vw, 15px); }
.phone-empty span { max-width: 15em; font-size: clamp(9px, 1.7vw, 12px); line-height: 1.7; }
.stage-controls { display: flex; align-items: center; justify-content: center; gap: 18px; }
.stage-controls button { min-height: 32px; border: 1px solid #cadbef; border-radius: 999px; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px; color: #41617f; background: #fff; cursor: pointer; }
.stage-controls button:disabled { cursor: not-allowed; opacity: .4; }
.stage-controls button svg { width: 14px; height: 14px; }
.stage-controls span { color: #176fdd; font-size: 11px; font-weight: 900; }
.preview-settings { padding: 17px; display: flex; flex-direction: column; gap: 14px; overflow: auto; scrollbar-width: thin; }
.settings-block { border: 1px solid #e0eaf6; border-radius: 12px; padding: 14px; background: #fff; }
.settings-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.settings-title>div { display: grid; gap: 4px; }
.settings-title>span { border-radius: 999px; padding: 4px 8px; color: #1473eb; background: #edf5ff; font-size: 9px; font-weight: 900; }
.preview-checks ul { margin: 13px 0 0; padding: 0; display: grid; gap: 11px; list-style: none; }
.preview-checks li { display: grid; grid-template-columns: 18px minmax(0,1fr); gap: 8px; color: #18a56b; }
.preview-checks li>svg { width: 17px; height: 17px; }
.preview-checks li span { display: grid; gap: 3px; }
.preview-checks li strong { color: #38536f; font-size: 11px; }
.preview-checks li small { color: #8295aa; font-size: 9px; }
.preview-actions { margin-top: auto; display: grid; grid-template-columns: .85fr 1.15fr; gap: 9px; }
.preview-actions button { min-height: 48px; border-radius: 10px; font-size: 11px; font-weight: 900; cursor: pointer; }
.continue-edit { border: 1px solid #c9d9eb; color: #3d5b79; background: #fff; }
.confirm-generate { border: 0; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: #fff; background: #ff6900; box-shadow: 0 8px 18px rgba(255,105,0,.18); }
.confirm-generate svg { width: 16px; height: 16px; }
button:focus-visible { outline: 3px solid rgba(34,124,244,.24); outline-offset: 2px; }

@media (max-width: 1100px) and (orientation: landscape) {
  .advanced-preview-page { padding-inline: 9px; }
  .preview-header { grid-template-columns: 104px minmax(165px,.8fr) auto 154px; gap: 7px; }
  .preview-back span { display: none; }
  .preview-title strong { font-size: 16px; }
  .preview-title small { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview-progress { gap: 8px; }
  .preview-progress li { width: 53px; font-size: 9px; }
  .preview-progress li:not(:last-child)::after { left: 38px; width: 31px; }
  .preview-generate { padding-inline: 10px; font-size: 11px; }
  .preview-workspace { grid-template-columns: 150px minmax(320px,1fr) 210px; gap: 7px; }
  .chapter-sidebar { padding: 12px 8px; }
  .chapter-sidebar nav { gap: 4px; }
  .chapter-sidebar nav button { min-height: 48px; grid-template-columns: 29px minmax(0,1fr); gap: 6px; padding: 5px; }
  .chapter-sidebar nav i { width: 29px; height: 29px; }
  .phone-preview-stage { padding-inline: 10px; }
  .preview-settings { padding: 10px; gap: 9px; }
  .settings-block { padding: 10px; }
  .preview-actions { grid-template-columns: 1fr; }
  .preview-actions button { min-height: 40px; }
}

@media (max-height: 760px) and (orientation: landscape) {
  .preview-header { min-height: 66px; }
  .preview-workspace { height: calc(100vh - var(--app-top, 0px) - 78px); min-height: 560px; }
  .phone-preview-stage { grid-template-rows: 35px minmax(0,1fr) 35px; padding-block: 10px; }
  .chapter-sidebar>p { display: none; }
  .preview-checks { display: none; }
}
</style>
