<template>
  <main class="reports-page app-page" :class="[`difficulty-${difficulty}`, { 'batch-mode': batchMode }]">
    <header class="reports-toolbar">
      <div class="title-zone">
        <h1>我的项目创作报告</h1>
      </div>

      <div class="filter-zone">
        <!-- 搜索：标题 / 课程 / 分类 三个字段一起搜，一个框就够 -->
        <div class="search-box">
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input
            v-model.trim="keyword"
            type="search"
            class="search-input"
            placeholder="搜索报告标题、课程或分类"
            aria-label="搜索报告"
          >
          <button v-if="keyword" type="button" class="search-clear" aria-label="清空搜索" @click="keyword = ''">×</button>
        </div>
        <el-select v-model="filterType" size="large" class="toolbar-select">
          <el-option label="全部" value="all" />
          <el-option label="绘画报告" value="painting" />
          <el-option label="3D报告" value="model3d" />
          <el-option label="视频报告" value="video" />
          <el-option label="合集报告" value="collection" />
        </el-select>
        <!-- 分类筛选只在「确实设过分类」之后出现，没分类时不占位置 -->
        <el-select v-if="categoryOptions.length" v-model="filterCategory" size="large" class="toolbar-select">
          <el-option label="全部分类" value="all" />
          <el-option v-for="name in categoryOptions" :key="name" :label="name" :value="name" />
        </el-select>
      </div>

      <div class="action-zone">
        <BaseButton v-if="!batchMode" variant="secondary" @click="enterBatchMode">批量管理</BaseButton>
        <BaseButton v-if="!batchMode" @click="createBlankReport">新建空白报告</BaseButton>
        <BaseButton v-else variant="secondary" @click="exitBatchMode">退出批量</BaseButton>
      </div>
    </header>

    <!-- 批量操作条：只在批量模式出现，吸顶跟着滚，选中几份随时看得见 -->
    <section v-if="batchMode" class="batch-bar" aria-label="批量操作">
      <button type="button" class="pick-all" :class="{ on: allPicked }" @click="togglePickAll">
        <span class="tick">{{ allPicked ? '✓' : '' }}</span>
        <span>{{ allPicked ? '取消全选' : '全选' }}</span>
      </button>
      <span class="batch-count">已选 <b>{{ selectedItems.length }}</b> 份</span>
      <span class="batch-spacer"></span>
      <button
        type="button"
        class="batch-btn"
        :disabled="!selectedItems.length || !canBatchExport"
        :title="canBatchExport ? '' : '批量导出需进阶版或高级版'"
        @click="batchExport"
      >批量导出</button>
      <button type="button" class="batch-btn" :disabled="!selectedItems.length" @click="openCategoryDialog">分类设置</button>
      <button type="button" class="batch-btn danger" :disabled="!selectedItems.length" @click="batchDelete">批量删除</button>
    </section>

    <section v-if="!visibleReports.length" class="empty-reports">
      <div class="empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 120 100" width="120" height="100">
          <rect x="22" y="10" width="64" height="80" rx="10" fill="#fff" stroke="#6c5ce7" stroke-width="2.5" />
          <rect x="32" y="22" width="44" height="22" rx="5" fill="#f0eeff" />
          <path d="M36 40l9-9 7 6 6-5 9 8" fill="none" stroke="#a594f9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M33 54h42M33 63h42M33 72h26" stroke="#cfc8fa" stroke-width="3" stroke-linecap="round" />
          <circle cx="88" cy="74" r="15" fill="#6c5ce7" />
          <path d="M81 74.5l5 5 9-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h2>{{ hasFilter ? '没有找到符合条件的报告' : '还没有项目创作报告' }}</h2>
      <p>{{ hasFilter ? '换个关键词，或者把筛选条件改回「全部」试试。' : '可以从作品集项目自动生成，也可以先创建一份空白报告。' }}</p>
      <div class="empty-actions">
        <BaseButton v-if="hasFilter" variant="secondary" @click="resetFilter">清空筛选条件</BaseButton>
        <BaseButton v-else @click="router.push('/student/workbench')">去作品集生成报告</BaseButton>
        <BaseButton variant="secondary" @click="createBlankReport">新建空白报告</BaseButton>
      </div>
    </section>

    <section v-else class="report-grid" aria-label="项目报告列表">
      <article
        v-for="item in visibleReports"
        :key="keyOf(item)"
        class="report-card"
        :class="{ 'menu-open': openMenuId === item.report.id, 'is-picked': isPicked(item) }"
        @click="batchMode && togglePick(item)"
      >
        <!-- 9:16 竖版封面：与报告本身同比例，图占整卡 86% -->
        <div
          class="report-cover"
          :class="{ 'is-wide': isWideCover(item), 'is-empty': !coverUrl(item) }"
        >
          <template v-if="coverUrl(item)">
            <img class="cover-bg" :src="coverUrl(item)" alt="" aria-hidden="true">
            <img
              class="cover-fg"
              :src="coverUrl(item)"
              :alt="item.report.title"
              loading="lazy"
              decoding="async"
              @load="rememberCoverRatio(item, $event)"
              @error="markCoverBroken(item)"
            >
            <div class="cover-fade"></div>
            <span class="badge-type">{{ typeLabel(item) }}</span>
            <span v-if="pageCount(item)" class="badge-page">{{ pageCount(item) }} 页</span>
          </template>
          <div v-else class="cover-empty">
            <span>+</span>
            <small>{{ typeLabel(item) }} · 暂无结果图</small>
          </div>
          <span v-if="item.report.category" class="badge-cat">{{ item.report.category }}</span>
          <!-- 批量模式的勾选圈放在右上角：左上角是类型角标，右下角是页数角标，只有这里是空的 -->
          <span v-if="batchMode" class="pick-dot" :class="{ on: isPicked(item) }" aria-hidden="true">
            {{ isPicked(item) ? '✓' : '' }}
          </span>
        </div>

        <div class="card-meta">
          <h2>{{ item.report.title }}</h2>
          <p>{{ shortDate(item.report.createdAt) }} · {{ materialCount(item) }} 张</p>
        </div>

        <div class="card-acts">
          <button type="button" class="act-main" @click="openReport(item.project.id, item.report.id)">查看预览</button>
          <button
            type="button"
            class="act-more"
            :class="{ on: openMenuId === item.report.id }"
            :aria-expanded="openMenuId === item.report.id"
            aria-label="更多操作"
            @click.stop="toggleMenu(item.report.id)"
          >⋯</button>
          <div class="card-menu" :class="{ open: openMenuId === item.report.id }" @click.stop>
            <button type="button" @click="runAction(item, 'regenerate')">重新生成</button>
            <button type="button" @click="runAction(item, 'export')">导出</button>
            <button type="button" @click="runAction(item, 'poster')">分享海报</button>
            <button type="button" class="danger" @click="runAction(item, 'delete')">删除</button>
          </div>
        </div>
      </article>
    </section>

    <!-- 分类设置：预设几个常用分类 + 自己输入，留空 = 清空分类 -->
    <el-dialog v-model="categoryDialogVisible" title="分类设置" width="430px" append-to-body>
      <div class="category-dialog">
        <p class="cat-hint">给选中的 {{ selectedItems.length }} 份报告设置分类，以后可以按分类快速找到它们。</p>
        <div class="cat-presets">
          <button
            v-for="name in CATEGORY_PRESETS"
            :key="name"
            type="button"
            class="cat-chip"
            :class="{ on: categoryDraft === name }"
            @click="categoryDraft = name"
          >{{ name }}</button>
        </div>
        <el-input v-model="categoryDraft" maxlength="12" show-word-limit placeholder="也可以自己输入，比如「秋季班期末作品」" />
        <p class="cat-note">留空保存 = 清空这些报告的分类</p>
      </div>
      <template #footer>
        <button type="button" class="dlg-btn" @click="categoryDialogVisible = false">取消</button>
        <button type="button" class="dlg-btn primary" @click="applyCategory">确定</button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
import { useDifficultyStore } from '../stores/difficultyStore'
import { useProjectStore } from '../stores/projectStore'

const router = useRouter()
const projectStore = useProjectStore()
const difficultyStore = useDifficultyStore()
const filterType = ref('all')
const keyword = ref('')
const filterCategory = ref('all')
const difficulty = computed(() => difficultyStore.current)
const canBatchExport = computed(() => ['advanced', 'pro'].includes(difficulty.value))

// 分类预设：美术机构最常用的几种归档口径，点一下就行，不用手打
const CATEGORY_PRESETS = ['课堂作业', '期末作品', '参赛作品', '汇报展示', '户外写生']

// 三个点菜单：同一时刻只开一个，点页面其他地方自动收起
const openMenuId = ref('')
function toggleMenu(id) {
  openMenuId.value = openMenuId.value === id ? '' : id
}
function closeMenu() {
  openMenuId.value = ''
}
onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))

/* ---------------- 批量管理 ---------------- */
// 同一份报告在 store 里由「项目 id + 报告 id」共同定位，只记报告 id 会撞号
const batchMode = ref(false)
const pickedKeys = ref([])
function keyOf(item) {
  return `${item.project.id}::${item.report.id}`
}
function isPicked(item) {
  return pickedKeys.value.includes(keyOf(item))
}
function togglePick(item) {
  const key = keyOf(item)
  pickedKeys.value = pickedKeys.value.includes(key)
    ? pickedKeys.value.filter((entry) => entry !== key)
    : [...pickedKeys.value, key]
}
function enterBatchMode() {
  closeMenu()
  batchMode.value = true
  pickedKeys.value = []
}
function exitBatchMode() {
  batchMode.value = false
  pickedKeys.value = []
}
const allPicked = computed(() => Boolean(visibleReports.value.length)
  && pickedKeys.value.length === visibleReports.value.length)
function togglePickAll() {
  pickedKeys.value = allPicked.value ? [] : visibleReports.value.map(keyOf)
}
// 选中项按当前列表还原成 { project, report }，顺便自动剔掉已被筛掉/删掉的
const selectedItems = computed(() => {
  const map = new Map(visibleReports.value.map((item) => [keyOf(item), item]))
  return pickedKeys.value.map((key) => map.get(key)).filter(Boolean)
})

const categoryDialogVisible = ref(false)
const categoryDraft = ref('')
function openCategoryDialog() {
  if (!selectedItems.value.length) {
    ElMessage.warning('先勾选要设置分类的报告')
    return
  }
  // 选中的报告分类一致就带出来，方便直接改；不一致就留空重设
  const names = new Set(selectedItems.value.map((item) => item.report.category || ''))
  categoryDraft.value = names.size === 1 ? [...names][0] : ''
  categoryDialogVisible.value = true
}
function applyCategory() {
  const count = projectStore.setReportsCategory(
    selectedItems.value.map((item) => ({ projectId: item.project.id, reportId: item.report.id })),
    categoryDraft.value.trim(),
  )
  categoryDialogVisible.value = false
  ElMessage.success(categoryDraft.value.trim()
    ? `已把 ${count} 份报告归到「${categoryDraft.value.trim()}」`
    : `已清空 ${count} 份报告的分类`)
}
async function batchDelete() {
  const count = selectedItems.value.length
  if (!count) {
    ElMessage.warning('先勾选要删除的报告')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将删除选中的 ${count} 份报告。删除报告不会删除原作品；如果删除作品集项目，对应报告也会一起消失。`,
      `批量删除 ${count} 份报告`,
      { confirmButtonText: '全部删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  const removed = projectStore.deleteReports(
    selectedItems.value.map((item) => ({ projectId: item.project.id, reportId: item.report.id })),
  )
  pickedKeys.value = []
  ElMessage.success(`已删除 ${removed || count} 份报告`)
}

// 封面取图：优先报告自己的第一张工作流结果图，其次项目里能当图用的 cover。
// 老报告只有 pageImages 的 id 没有 url，就按预览页同一条读图接口拼出来。
// 图 404 / 读不到时记进 brokenCovers，直接退回色块 —— 不让卡片露出破图标。
const brokenCovers = ref({})
// 产品故事类报告的第 1 页是模板封面页（整页只有标题 +「等待用户作品」占位），
// 拿它当卡片封面等于摆一张空页，所以跳过，用真正有画作的那一页。
const COVER_SKIP_PAGE_IDS = new Set(['story-cover'])
function pickCoverPage(pages) {
  const usable = (Array.isArray(pages) ? pages : []).filter((page) => page && (page.url || page.id))
  if (!usable.length) return null
  // 画布工作流结果图每张都是真实作品，第一张就最好
  const workflow = usable.find((page) => String(page.id || '').startsWith('workflow-'))
  if (workflow) return workflow
  const withArtwork = usable.find((page) => !COVER_SKIP_PAGE_IDS.has(String(page.id || '')))
  return withArtwork || usable[0]
}
function coverUrl(item) {
  if (brokenCovers.value[item.report.id]) return ''
  const first = pickCoverPage(item.report.pageImages)
  if (first?.url) return first.url
  if (first?.id && item.report.id) {
    return `/api/h5-report-assets/${encodeURIComponent(item.report.id)}/${encodeURIComponent(first.id)}`
  }
  const cover = item.report.cover || item.project.cover || ''
  return typeof cover === 'string' && /^(https?:)?\//.test(cover) ? cover : ''
}
function markCoverBroken(item) {
  brokenCovers.value = { ...brokenCovers.value, [item.report.id]: true }
}
function pageCount(item) {
  const images = Array.isArray(item.report.pageImages) ? item.report.pageImages.length : 0
  const pages = Array.isArray(item.report.pages) ? item.report.pages.length : 0
  return images || pages
}
// 图比 9:16 更宽（方图画作、横图）时，改成「整张完整显示 + 自身模糊图补底」，
// 否则铺满会把人物裁成半个头。
const coverRatios = ref({})
function rememberCoverRatio(item, event) {
  const el = event?.target
  if (!el?.naturalWidth || !el?.naturalHeight) return
  coverRatios.value[item.report.id] = el.naturalWidth / el.naturalHeight
}
function isWideCover(item) {
  const ratio = coverRatios.value[item.report.id]
  return Boolean(ratio) && ratio > 9 / 16 + 0.02
}

const reports = computed(() => projectStore.projects.flatMap((project) => {
  return (project.reports || []).map((report) => ({ project, report }))
}))

// 已有的分类（去重、去空），用来决定要不要显示「分类」筛选下拉
const categoryOptions = computed(() => {
  const names = reports.value.map((item) => String(item.report.category || '').trim()).filter(Boolean)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
})
const hasFilter = computed(() => Boolean(keyword.value) || filterType.value !== 'all' || filterCategory.value !== 'all')
function resetFilter() {
  keyword.value = ''
  filterType.value = 'all'
  filterCategory.value = 'all'
}

const visibleReports = computed(() => {
  let list = reports.value
  if (filterType.value !== 'all') {
    list = list.filter((item) => materialTypes(item).includes(filterType.value))
  }
  if (filterCategory.value !== 'all') {
    list = list.filter((item) => (item.report.category || '') === filterCategory.value)
  }
  // 搜索：标题、课程、分类一起匹配，用户记不住分类名时打标题也能找到
  const q = keyword.value.toLowerCase()
  if (q) {
    list = list.filter((item) => {
      const haystack = [item.report.title, item.report.course, item.report.category]
        .filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }
  // 排序固定「最新在前」——原来那个「最新 / 课程分组」下拉实际没人用，已删掉
  return [...list].sort((a, b) => String(b.report.createdAt || '').localeCompare(String(a.report.createdAt || '')))
})

function materialTypes(item) {
  if (item.report.materialTypes?.length) return item.report.materialTypes
  const types = ['painting']
  if (item.project.models3d?.length) types.push('model3d')
  if (item.project.videos?.length) types.push('video')
  if (['course', 'term', 'collection'].includes(item.report.type)) types.push('collection')
  return types
}
function typeLabel(item) {
  if (materialTypes(item).includes('collection')) return '合集报告'
  if (materialTypes(item).includes('video')) return '视频报告'
  if (materialTypes(item).includes('model3d')) return '3D报告'
  return '绘画报告'
}
// 卡片第二行只留「日期 · N 张」，课程名去掉（每张卡都一样，白占一行）
function materialCount(item) {
  const stats = item.report.materialStats || {}
  const counted = (stats.sketches || 0) + (stats.versions || 0) + (stats.models3d || 0) + (stats.videos || 0)
  if (counted) return counted
  return (item.project.versions?.length || 0) + (item.project.models3d?.length || 0) + (item.project.videos?.length || 0)
}
function shortDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
function openReport(projectId, reportId, regenerate = false) {
  projectStore.openProject(projectId)
  localStorage.setItem('art-studio-current-report-id', reportId)
  router.push({ path: '/student/h5-report', query: regenerate ? {} : { reportId } })
}
function createBlankReport() {
  projectStore.startNewProject(difficulty.value)
  localStorage.removeItem('art-studio-current-report-id')
  router.push('/student/h5-report')
}
function exportReport(item, action) {
  const locked = action === '分享海报' && difficulty.value === 'junior'
  if (locked) {
    ElMessage.warning('分享海报在入门及以上版本开放')
    return
  }
  ElMessage.success(`${item.report.title} ${action}已加入任务队列`)
}
function batchExport() {
  if (!canBatchExport.value) {
    ElMessage.warning('批量导出需进阶版或高级版')
    return
  }
  const count = selectedItems.value.length
  if (!count) {
    ElMessage.warning('先勾选要导出的报告')
    return
  }
  ElMessage.success(`已把选中的 ${count} 份报告加入导出队列`)
}
async function deleteReport(projectId, reportId) {
  try {
    await ElMessageBox.confirm('删除报告不会删除原作品；如果删除作品集项目，对应报告也会一起消失。确定删除这份报告吗？', '删除报告', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  projectStore.deleteReport(projectId, reportId)
  ElMessage.success('报告已删除')
}
function runAction(item, action) {
  closeMenu()
  if (action === 'regenerate') return openReport(item.project.id, item.report.id, true)
  if (action === 'export') return exportReport(item, '导出')
  if (action === 'poster') return exportReport(item, '分享海报')
  if (action === 'delete') return deleteReport(item.project.id, item.report.id)
}
</script>

<style scoped lang="scss">
.reports-page {
  max-width: 1366px;
  min-width: 0;
  margin: 0 auto;
  overflow-x: hidden;
}
.reports-toolbar,
.empty-reports,
.report-card {
  border-radius: 12px;
  background: #fff;
  box-shadow: var(--shadow-card);
}
.reports-toolbar {
  /* 全站统一导航条高度 58px（和作品广场 / AI 绘画 / AI 视频一致）。
     原来这里 min-height 92 + 16 内边距，标题下面还有一行说明小字，实测整体 115px，
     把下面报告卡片的位置全挤下去了。现在只留一行：返回 + 标题 + 筛选 + 按钮。 */
  min-height: 58px;
  padding: 0 14px;
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: center;
}
.title-zone,
.filter-zone,
.action-zone {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.title-zone { flex: 1 1 auto; }
.filter-zone,
.action-zone { flex: 0 0 auto; }
.action-zone { justify-content: flex-end; }
.toolbar-select { width: 118px; }
/* 搜索框：原生 input 而不是 el-input —— 导航条只有 58px 高，
   el-input 的 40px 外壳加边框在这里显得厚重，原生 input 更好压扁 */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 200px;
  height: 34px;
  padding: 0 8px 0 26px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #f7f8fa;
  transition: border-color .16s ease, background .16s ease;
}
.search-box:focus-within {
  border-color: rgba(255, 122, 0, .55);
  background: #fff;
}
.search-icon {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  line-height: 1;
  color: #9aa4b2;
  pointer-events: none;
}
.search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  font-size: 13px;
  color: var(--color-title);
  outline: none;
}
.search-input::placeholder { color: #a8b1bf; }
/* search 类型的原生清除按钮在 Chrome 里是黑块，自己画一个 */
.search-input::-webkit-search-cancel-button { display: none; }
.search-clear {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  min-height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #d7dce4;
  color: #fff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.search-clear:hover { background: #b6c0cf; }

/* ---------- 批量操作条 ---------- */
.batch-bar {
  position: sticky;
  top: 0;
  z-index: 12;
  margin-top: 12px;
  min-height: 48px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  background: #fff;
  box-shadow: var(--shadow-card);
}
.pick-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #fff;
  color: var(--color-title);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.pick-all .tick {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.5px solid #cbd5e1;
  display: grid;
  place-items: center;
  font-size: 10px;
  line-height: 1;
  color: #fff;
}
.pick-all.on { border-color: rgba(255, 122, 0, .5); background: var(--color-primary-soft); color: var(--color-primary); }
.pick-all.on .tick { border-color: var(--color-primary); background: var(--color-primary); }
.batch-count { font-size: 13px; color: var(--color-text); white-space: nowrap; }
.batch-count b { color: var(--color-primary); font-size: 14px; }
.batch-spacer { flex: 1 1 auto; }
.batch-btn {
  height: 32px;
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #fff;
  color: var(--color-title);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.batch-btn:hover:not(:disabled) { border-color: rgba(255, 122, 0, .45); color: var(--color-primary); }
.batch-btn:disabled { color: #b6c0cf; background: #f7f8fa; cursor: not-allowed; }
.batch-btn.danger { color: #dc2626; border-color: #fecaca; }
.batch-btn.danger:hover:not(:disabled) { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
.batch-btn.danger:disabled { color: #f3b4b4; background: #fdf6f6; border-color: #f6dcdc; }

/* 批量模式下卡片本身就是一个大勾选框：操作按钮让开点击，点哪都能选中 */
.batch-mode .report-card { cursor: pointer; }
.batch-mode .card-acts { pointer-events: none; }
/* 选中描边必须连 :hover 一起写：点卡片时鼠标就停在卡上，
   `.report-card:hover` 和 `.report-card.is-picked` 特异性相同、hover 写在后面，
   不带上 :hover 就会出现「选中了但橙色描边看不见」 */
.report-card.is-picked,
.report-card.is-picked:hover {
  box-shadow: 0 0 0 2px var(--color-primary), 0 10px 24px rgba(255, 122, 0, .18);
  transform: none;
}
.pick-dot {
  position: absolute;
  right: 7px;
  top: 7px;
  z-index: 4;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, .9);
  background: rgba(12, 16, 22, .35);
  backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  font-size: 12px;
  line-height: 1;
  font-weight: 900;
  color: #fff;
}
.pick-dot.on { border-color: var(--color-primary); background: var(--color-primary); }
.badge-cat {
  position: absolute;
  left: 7px;
  bottom: 7px;
  z-index: 3;
  max-width: calc(100% - 60px);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  color: #fff;
  background: rgba(255, 122, 0, .82);
  border-radius: 999px;
  padding: 4px 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 分类设置弹窗 ---------- */
.category-dialog { display: grid; gap: 12px; }
.cat-hint { margin: 0; font-size: 13px; color: var(--color-text); line-height: 1.6; }
.cat-presets { display: flex; flex-wrap: wrap; gap: 8px; }
.cat-chip {
  height: 30px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #fff;
  color: var(--color-title);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.cat-chip:hover { border-color: rgba(255, 122, 0, .45); color: var(--color-primary); }
.cat-chip.on { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); }
.cat-note { margin: 0; font-size: 12px; color: #9aa4b2; }
.dlg-btn {
  height: 34px;
  min-height: 34px;
  padding: 0 18px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #fff;
  color: var(--color-title);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.dlg-btn + .dlg-btn { margin-left: 8px; }
.dlg-btn.primary {
  border: 0;
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), #ff9f1c);
}
.back-btn {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 14px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 900;
  white-space: nowrap;
  font-size: 13px;
}
h1, h2 { margin: 0; color: var(--color-title); }
/* 标题也跟作品广场一样收到 20px，一行放得下，不再折行把导航条撑高 */
h1 { font-size: 20px; white-space: nowrap; }
p, small { color: var(--color-text); line-height: 1.5; }
.empty-reports {
  min-height: 520px;
  margin-top: 18px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  padding: 28px;
  text-align: center;
}
/* 空状态插画：一份带图表的报告 + 勾（以前是只写着「项目报告」四个字的橙色方块） */
.empty-illustration {
  width: 168px;
  height: 128px;
  border-radius: 24px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #f5f3ff, #eef4ff);
}
.empty-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

/* ---------- 报告网格：5 列（窄屏自动降列） ---------- */
.report-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  /* 5 列后卡宽约 188px，间距必须收窄，否则卡片被挤成细条 */
  gap: 12px;
}
.report-card {
  min-width: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  transition: transform .16s ease, box-shadow .16s ease;
}
.report-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 6px rgba(16, 24, 40, .06), 0 14px 30px rgba(16, 24, 40, .09);
}
/* 菜单向上弹，需要盖住同排的其它卡片 */
.report-card.menu-open { position: relative; z-index: 5; }

/* ---------- 封面：9:16 竖版 ---------- */
.report-cover {
  position: relative;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  border-radius: 12px 12px 0 0;
  background: #eef0f3;
  isolation: isolate;
}
.cover-bg,
.cover-fg {
  display: block;
  width: 100%;
  height: 100%;
}
/* 竖长报告页（≈9:19）直接铺满，只裁掉很窄的一圈边，最干净 */
.cover-bg { display: none; }
.cover-fg {
  position: relative;
  z-index: 1;
  object-fit: cover;
}
/* 方图 / 横图：整张完整显示，四周用同一张图模糊放大补底，绝不裁掉人物 */
.report-cover.is-wide .cover-bg {
  display: block;
  position: absolute;
  inset: -20px;
  z-index: 0;
  width: calc(100% + 40px);
  height: calc(100% + 40px);
  object-fit: cover;
  filter: blur(22px) saturate(1.15) brightness(.9);
}
.report-cover.is-wide .cover-fg { object-fit: contain; }
.cover-fade {
  position: absolute;
  inset: auto 0 0 0;
  height: 64px;
  z-index: 2;
  background: linear-gradient(to top, rgba(12, 16, 22, .5), rgba(12, 16, 22, 0));
  pointer-events: none;
}
.badge-type {
  position: absolute;
  left: 7px;
  top: 7px;
  z-index: 3;
  /* 5 列后卡宽约 188px，角标按 4 列尺寸会盖掉太多封面，收小一档 */
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .2px;
  line-height: 1;
  color: #fff;
  background: rgba(12, 16, 22, .45);
  backdrop-filter: blur(6px);
  border-radius: 999px;
  padding: 4px 7px;
}
.badge-page {
  position: absolute;
  right: 7px;
  bottom: 7px;
  z-index: 3;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  background: rgba(12, 16, 22, .5);
  backdrop-filter: blur(6px);
  border-radius: 5px;
  padding: 4px 6px;
}
/* 还没生成结果图的报告：浅灰待生成态，绝不再摆一大块橙色 ——
   9:16 面积太大，橙色渐变铺满整卡会非常刺眼（用户原话「太丑」）。 */
.cover-empty {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  text-align: center;
  background:
    repeating-linear-gradient(135deg, rgba(148, 163, 184, .07) 0 10px, transparent 10px 20px),
    #f4f6f9;
}
.cover-empty span {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1.5px dashed #cbd5e1;
  display: grid;
  place-items: center;
  color: #b6c0cf;
  font-size: 18px;
  font-weight: 900;
}
.cover-empty small {
  color: #9aa4b2;
  font-size: 11px;
  font-weight: 700;
  padding: 0 8px;
  line-height: 1.4;
}

/* ---------- 文字区：只有两行，总共 44px ---------- */
.card-meta {
  min-width: 0;
  padding: 8px 9px 0;
}
.card-meta h2 {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.3;
  font-weight: 800;
  color: var(--color-title);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-meta p {
  margin: 3px 0 0;
  font-size: 11px;
  line-height: 1.3;
  color: var(--color-text);
  opacity: .72;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 操作区：一行 30px —— 查看预览 + 三个点 ---------- */
.card-acts {
  position: relative;
  margin-top: 7px;
  padding: 0 7px 8px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.act-main {
  flex: 1;
  min-width: 0;
  height: 30px;
  /* 全局 button{min-height:var(--touch-size)} 是 48px，会把这一行撑到 57px，
     这里必须显式压回去，否则「按钮压成一行」的排版效果全白做 */
  min-height: 30px;
  padding: 0 6px;
  border: 0;
  border-radius: 8px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
}
.act-main:hover { background: #ffedd8; }
.act-more {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  min-height: 30px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: #f5f6f8;
  color: var(--color-text);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  font-weight: 900;
  display: grid;
  place-items: center;
}
.act-more:hover { background: #eceef2; }
.act-more.on {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

/* 三个点下拉菜单：重新生成 / 导出 / 分享海报 / 删除 全收进来 */
.card-menu {
  position: absolute;
  right: 7px;
  bottom: calc(100% + 6px);
  min-width: 128px;
  padding: 5px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 10px rgba(16, 24, 40, .08), 0 16px 36px rgba(16, 24, 40, .14);
  display: none;
  z-index: 20;
}
.card-menu.open { display: block; }
.card-menu button {
  width: 100%;
  height: 32px;
  min-height: 32px;
  border: 0;
  border-radius: 7px;
  padding: 0 10px;
  background: transparent;
  color: var(--color-title);
  font-size: 12.5px;
  text-align: left;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.card-menu button:hover { background: #f5f6f8; }
.card-menu button.danger { color: #dc2626; }
.card-menu button.danger:hover { background: #fef2f2; }

/* 5 列后卡宽：1440 视口约 264px（页面限宽 1366）。
   1180 以下卡宽跌破 230px 就降一列，之后每档依次降，避免卡片被挤成细条。 */
@media (max-width: 1180px) {
  .report-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 1100px) {
  .reports-toolbar {
    /* 窄屏允许折成两行，否则标题会被挤成竖排 */
    flex-wrap: wrap;
    padding: 10px 14px;
  }
  .title-zone { flex: 1 1 100%; }
  .filter-zone { flex: 1 1 auto; }
  .action-zone { justify-content: flex-start; }
  /* 搜索框在窄屏吃掉剩余宽度，两个下拉固定宽度 */
  .search-box { flex: 1 1 140px; width: auto; min-width: 120px; }
  .batch-bar { flex-wrap: wrap; padding: 8px 12px; }
  .batch-spacer { flex: 1 1 100%; height: 0; }
}
@media (max-width: 900px) {
  .report-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 620px) {
  .report-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 460px) {
  .report-grid { grid-template-columns: 1fr; }
}
</style>
