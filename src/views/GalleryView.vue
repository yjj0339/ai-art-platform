<template>
  <main class="gallery-page app-page">
    <!-- 返回和页面名在共用顶栏里；「刷新作品」放进顶栏右侧 -->
    <Teleport to="#su-topbar-actions" defer>
      <button class="su-btn su-btn--sm" type="button" :disabled="loading" @click="refreshGallery">
        <el-icon :class="{ 'is-loading': loading }"><Refresh /></el-icon>
        刷新作品
      </button>
    </Teleport>

    <section class="gallery-toolbar" aria-label="分类筛选">
      <button
        v-for="item in tabs"
        :key="item.id || 'all'"
        type="button"
        :class="{ active: currentTab === item.id }"
        @click="selectCourse(item.id)"
      >
        {{ item.name }}
      </button>
    </section>

    <section v-if="visibleWorks.length" class="gallery-masonry" aria-label="公开作品列表">
      <!-- 瀑布流：作品按顺序轮流铺进各列，保证第一排就是最新几张，而不是把最新作品全堆在最左一列 -->
      <div v-for="(column, index) in masonryColumns" :key="index" class="masonry-col">
        <article
          v-for="work in column"
          :key="work.id"
          class="gallery-card"
          role="button"
          tabindex="0"
          @click="openDetail(work)"
          @keydown.enter="openDetail(work)"
        >
          <div class="cover" :class="{ 'is-image': coverKindOf(work) === 'image' }" :style="coverStyleOf(work)">
            <!-- 有真图片时用 <img>，让浏览器按作品真实画幅撑开高度（竖画就是竖的、横画就是横的） -->
            <img
              v-if="coverKindOf(work) === 'image'"
              :src="work.cover"
              :alt="work.title"
              loading="lazy"
              decoding="async"
              @load="onCoverLoad(work, $event)"
            />
            <span v-if="work.pinned" class="pinned-label">置顶</span>
            <div class="gallery-overlay">
              <div>
                <h2>{{ work.title }}</h2>
                <p v-if="workSubtitle(work)">{{ workSubtitle(work) }}</p>
              </div>
              <button type="button" class="like-button" aria-label="点赞" @click.stop="likeWork(work)">
                <el-icon><Star /></el-icon>
                {{ work.likes }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="loadError" class="gallery-empty" role="alert"><h2>作品加载失败</h2><p>{{ loadError }}</p><button @click="refreshGallery(false)">重新加载</button></section>
    <section v-else-if="!loading && !visibleWorks.length" class="gallery-empty">
      <el-icon><PictureFilled /></el-icon>
      <h2>暂时没有符合条件的公开作品</h2>
      <p>切换课程分类或稍后刷新再看看。</p>
    </section>

    <button v-if="hasMore" class="load-more" type="button" :disabled="loading" @click="loadMore">
      加载更多作品
    </button>
    <p v-else-if="visibleWorks.length" class="gallery-end">已加载全部审核通过作品</p>

    <el-dialog v-model="detailDialog.open" title="作品详情" width="min(760px, 94vw)">
      <div v-if="detailDialog.item" class="gallery-detail">
        <div class="detail-cover" :style="galleryCoverStyle(detailDialog.item.cover)" />
        <section>
          <span class="detail-type">{{ detailDialog.item.type || '绘画' }}</span>
          <h2>{{ detailDialog.item.title }}</h2>
          <p>{{ detailDialog.item.description || detailDialog.item.prompt || '这是一件通过平台审核的公开作品。' }}</p>
          <div class="gallery-detail-meta">
            <span>{{ detailDialog.item.author }}</span>
            <span>{{ detailDialog.item.ageRange }}</span>
            <span>{{ detailDialog.item.source || '用户投稿' }}</span>
          </div>
          <div class="detail-actions">
            <BaseButton variant="secondary" @click="likeWork(detailDialog.item)">点赞 {{ detailDialog.item.likes }}</BaseButton>
            <BaseButton @click="openGalleryCourse(detailDialog.item)">进入对应课程</BaseButton>
          </div>
        </section>
      </div>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, PictureFilled, Refresh, Star } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
import { useGalleryStore } from '../stores/galleryStore'
import { galleryCoverKind, galleryCoverStyle } from '../utils/galleryRules'

const router = useRouter()
const galleryStore = useGalleryStore()
const currentTab = ref('')
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const pageSize = 20
const detailDialog = reactive({ open: false, item: null })

const tabs = computed(() => {
  // 服务端模式：按钮 = 后台「作品广场 / 分类管理」里建的分类（visible 为真的才出现），
  // 不再是拿作品的课程名去重凑的 —— 那样没绑课程时会退回作品标题，按钮上会显示某幅画的名字。
  if (galleryStore.serverMode) {
    return [
      { id: '', name: '全部' },
      ...galleryStore.publicCategories.map((item) => ({ id: item.id, name: item.name })),
    ]
  }
  // 本地演示模式没有后台分类表，仍按课程名凑
  return [
    { id: '', name: '全部' },
    ...[...new Set(galleryStore.publishedWorks.map((item) => item.course).filter(Boolean))].map((name) => ({ id: name, name })),
  ]
})
const filteredWorks = computed(() => {
  if (!currentTab.value) return galleryStore.publishedWorks
  // 服务端模式已经由接口按分类筛过，本地模式才在前端按课程名筛
  if (galleryStore.serverMode) return galleryStore.publishedWorks
  return galleryStore.publishedWorks.filter((item) => item.course === currentTab.value)
})
const visibleWorks = computed(() => filteredWorks.value.slice(0, page.value * pageSize))
const hasMore = computed(() => visibleWorks.value.length < filteredWorks.value.length || (galleryStore.serverMode && galleryStore.works.length < galleryStore.publicTotal))

/* ===== 瀑布流列数：跟 CSS 断点一致 =====
   常见屏宽（1440 / 1920）统一 5 列，单张 3:4 竖图约 271~278px 宽。
   原来是 4 列、单张 340px 宽、竖图 453px 高 —— 一屏只能看到一张半，用户反馈「图太大了」。
   ⚠ 5 列的门槛定在 1300 而不是 1240：1241px 窗口时 5 列只剩 231px 宽（太碎），
   而 1240px 窗口 4 列是 292px —— 门槛定低了会在临界点忽大忽小地跳一档。 */
const columnCount = ref(5)

function syncColumnCount() {
  if (typeof window === 'undefined') return
  const width = window.innerWidth
  columnCount.value = width > 1300 ? 5 : width > 1040 ? 4 : width > 760 ? 3 : width > 460 ? 2 : 1
}

/* 每张图加载完记下它自己的宽高比，用来算这张卡大概多高。
   没有比例信息（渐变占位、还没加载完）时按 4:3 估。 */
const coverRatios = ref({})

function rememberCoverRatio(id, width, height) {
  if (!width || !height) return
  const ratio = width / height
  if (Math.abs((coverRatios.value[id] || 0) - ratio) < 0.001) return
  coverRatios.value = { ...coverRatios.value, [id]: ratio }
}

function onCoverLoad(work, event) {
  rememberCoverRatio(work.id, event?.target?.naturalWidth, event?.target?.naturalHeight)
}

/* 卡片是懒加载的，屏幕外的图还没下载，比例就还是估值 —— 分列会算偏。
   所以这里主动预加载一遍，比例齐了再分列（浏览器命中缓存，不会重复请求）。 */
watch(visibleWorks, (works) => {
  for (const work of works) {
    if (coverKindOf(work) !== 'image' || coverRatios.value[work.id]) continue
    const probe = new Image()
    probe.onload = () => rememberCoverRatio(work.id, probe.naturalWidth, probe.naturalHeight)
    probe.src = work.cover
  }
}, { immediate: true })

/* 分配策略（三步，缺一步就会出问题）：
   1) 第一排必须是「最新 N 张并排」——前 N 张强制一列一张；
   2) 剩下的按「预估高度从高到低」依次塞给当前最矮的列。
      只按顺序贪心的话，最后一张如果正好是 9:16 竖图，会把某一列顶出一大截，
      页面下方出现一大块空白（实测 12 张时列高差到 600px）。
      先放大图、后放小图，收尾就能接近齐平（实测差 50px 以内）。
   3) 每列内部再按原始顺序排，保证一列里仍是「新的在上、旧的在下」。
   注意：竖图（9:16）和横图（16:9）本身就差 3 倍高，列底不可能像素级齐平。 */
const masonryColumns = computed(() => {
  const total = Math.max(1, columnCount.value)
  const works = visibleWorks.value
  const heightOf = (work) => 1 / (coverRatios.value[work.id] || 4 / 3)
  const columns = Array.from({ length: total }, () => [])
  const heights = new Array(total).fill(0)

  // ①②：第一排钉死，其余按高度从高到低分配。统一存成 { work, index }，第三步才能还原顺序
  works.forEach((work, index) => {
    if (index < total) {
      columns[index].push({ work, index })
      heights[index] += heightOf(work)
    }
  })
  works.slice(total)
    .map((work, offset) => ({ work, index: offset + total }))
    .sort((a, b) => heightOf(b.work) - heightOf(a.work))
    .forEach((item) => {
      const target = heights.indexOf(Math.min(...heights))
      columns[target].push(item)
      heights[target] += heightOf(item.work)
    })

  // ③：列内还原成原始先后顺序（新的在上、旧的在下）
  return columns.map((column) => column
    .sort((a, b) => a.index - b.index)
    .map((item) => item.work))
})

/* 封面有两种：真图片走 <img> 按真实画幅显示；纯色/渐变没比例信息，退回 4:3 色块 */
function coverKindOf(work) {
  return galleryCoverKind(work?.cover)
}
function coverStyleOf(work) {
  return coverKindOf(work) === 'image' ? {} : galleryCoverStyle(work?.cover)
}

/* 卡片副标题：作者 · 课程 · 年龄段。
   ⚠ 去重：有历史数据把作品标题整句存进了 course（也会出现 ageRange 为空），
   直接拼会变成「标题 · 标题 · 」，又长又没意义，所以跟标题重复或为空的整段丢掉。 */
function workSubtitle(work) {
  const title = String(work?.title || '').trim()
  return [work?.author, work?.course, work?.ageRange]
    .map((part) => String(part || '').trim())
    .filter((part) => part && part !== title)
    .join(' · ')
}

onMounted(() => {
  syncColumnCount()
  window.addEventListener('resize', syncColumnCount)
  refreshGallery(false)
})
onBeforeUnmount(() => window.removeEventListener('resize', syncColumnCount))

function selectCourse(categoryId) {
  currentTab.value = categoryId
  page.value = 1
  if (galleryStore.serverMode) refreshGallery(false)
}
async function refreshGallery(showMessage = true) {
  loading.value = true
  loadError.value = ''
  try {
    await galleryStore.loadServerWorks(false, currentTab.value || '')
    page.value = 1
    if (showMessage) ElMessage.success('已刷新审核通过作品')
  } catch (error) {
    loadError.value = error.response?.data?.message || '暂时无法读取公开作品，请稍后重试。'
  } finally {
    loading.value = false
  }
}
async function loadMore() {
  loading.value = true
  try { if (galleryStore.serverMode && galleryStore.works.length < galleryStore.publicTotal) await galleryStore.loadServerWorks(true, currentTab.value || ''); page.value += 1 }
  catch { loadError.value = '更多作品加载失败，请重试。' }
  finally { loading.value = false }
}
function openDetail(work) {
  detailDialog.item = work
  detailDialog.open = true
}
function likeWork(work) {
  galleryStore.like(work.id)
}
function openGalleryCourse(work) {
  detailDialog.open = false
  router.push({ path: '/student/courses', query: { course: work.course } })
}
</script>

<style scoped lang="scss">
.gallery-page {
  min-height: calc(100dvh - var(--app-top, 0px));
  padding: 18px;
  background: radial-gradient(circle at 20% 0, rgba(236,210,255,.34), transparent 28%), linear-gradient(145deg, #fbf8f5, #f1f4ff 56%, #fbfaf8);
  color: #25346e;
}
.gallery-header,
.gallery-toolbar {
  max-width: 1440px;
  margin: 0 auto;
  border: 1px solid rgba(117,130,205,.18);
  background: rgba(255,255,255,.78);
  box-shadow: 0 14px 34px rgba(64,77,154,.1), inset 0 1px rgba(255,255,255,.96);
  backdrop-filter: blur(14px);
}
.gallery-header {
  /* 全站统一的导航条高度：绘画页、视频页也是 58px。
     ⚠ 改这里请同步其它页，别再出现这页 113、那页 58 的跳变。 */
  min-height: 58px;
  border-radius: 16px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}
/* 标题左右各一块弹性留白：不论两侧按钮文字长短，标题都稳稳居中 */
.header-spacer { flex: 1 1 0; min-width: 0; }
.gallery-header h1 { margin: 0; color: #25346e; font-size: 20px; letter-spacing: .02em; white-space: nowrap; }
.back-btn,
.refresh-btn {
  min-height: 34px;
  border: 1px solid rgba(111,126,214,.2);
  border-radius: 999px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  background: #fff;
  color: #5262ba;
  font-weight: 900;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}
.refresh-btn { background: linear-gradient(100deg,#eef0ff,#f7efff); }
.back-btn .el-icon { font-size: 17px; }
.gallery-toolbar { margin-top: 12px; border-radius: 16px; padding: 8px 10px; display: flex; gap: 8px; overflow-x: auto; }
.gallery-toolbar button { min-height: 34px; border: 1px solid transparent; border-radius: 999px; padding: 0 15px; flex: 0 0 auto; background: transparent; color: #6873a5; font-weight: 800; font-size: 13px; cursor: pointer; }
.gallery-toolbar button.active { border-color: rgba(112,126,219,.22); background: #eef0ff; color: #5263cb; }

/* ===== 瀑布流：每张作品按真实画幅完整显示，不再统一裁成 260px =====
   用 flex 分成 N 列、每列内部纵向排列。列数由脚本 columnCount 决定（跟下面断点一致）。
   间距从 14 收到 12：5 列时卡片只剩 ~275px 宽，14 的缝会显得松散。 */
.gallery-masonry { max-width: 1440px; margin: 16px auto 0; display: flex; align-items: flex-start; gap: 12px; }
.masonry-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.gallery-card { min-width: 0; border: 1px solid rgba(117,130,205,.18); border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 8px 18px rgba(55,68,145,.10); cursor: pointer; transition: transform 200ms ease, box-shadow 200ms ease; }
.gallery-card:hover,
.gallery-card:focus-visible { transform: translateY(-3px); box-shadow: 0 14px 26px rgba(55,68,145,.16); outline: none; }
.cover { position: relative; overflow: hidden; background-position: center !important; background-size: cover !important; }
/* 图按自身画幅撑满卡片宽度：竖画就竖、横画就横，绝不裁切 */
.cover.is-image img { display: block; width: 100%; height: auto; }
/* 没有真实图片（纯色/渐变占位）的封面没有画幅信息，退回 4:3 色块 */
.cover:not(.is-image) { aspect-ratio: 4 / 3; }
.cover::after { content: ''; position: absolute; inset: 55% 0 0; background: linear-gradient(180deg,transparent,rgba(25,34,86,.82)); }
.pinned-label { position: absolute; z-index: 2; top: 9px; left: 9px; min-height: 22px; border-radius: 999px; padding: 0 8px; display: inline-flex; align-items: center; background: rgba(255,247,225,.92); color: #d66c31; font-size: 10px; font-weight: 900; }
.gallery-overlay { position: absolute; z-index: 2; left: 10px; right: 10px; bottom: 9px; display: flex; align-items: end; justify-content: space-between; gap: 6px; color: #fff; }
/* 🔴 文字那一格必须 min-width: 0。卡片缩到 275px 后，标题的 min-content 宽度比可用宽度还大，
   flex 子项默认 min-width: auto 会让这一格撑破容器，把点赞按钮整个顶出卡片外（截图里按钮被裁掉）。
   加 min-width: 0 + flex: 1 1 auto 之后，文字才会老实被省略号截断，按钮留在卡内。 */
.gallery-overlay > div { flex: 1 1 auto; min-width: 0; }
/* 卡片窄了以后，标题和副标题的字号必须一起降，否则 275px 宽的卡里两行文字会顶到点赞按钮 */
.gallery-overlay h2 { margin: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 1.3; }
.gallery-overlay p { margin: 3px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,.78); font-size: 10px; line-height: 1.3; }
.like-button { min-height: 26px; flex: 0 0 auto; border: 0; border-radius: 999px; padding: 0 8px; display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,.88); color: #ec713a; font-size: 11px; font-weight: 900; cursor: pointer; }
.like-button :deep(.el-icon) { font-size: 12px; }
.gallery-empty { max-width: 1440px; min-height: 420px; margin: 16px auto 0; border: 1px dashed rgba(112,126,219,.28); border-radius: 24px; display: grid; place-content: center; justify-items: center; gap: 10px; background: rgba(255,255,255,.64); color: #6c76a4; text-align: center; }
.gallery-empty :deep(.el-icon) { font-size: 46px; color: #7c84df; }
.gallery-empty h2,
.gallery-empty p { margin: 0; }
.load-more { min-height: 46px; margin: 18px auto 0; border: 1px solid rgba(111,126,214,.2); border-radius: 999px; padding: 0 24px; display: block; background: #fff; color: #5968c5; font-weight: 900; cursor: pointer; }
.gallery-end { text-align: center; color: #858db4; font-weight: 800; }
.gallery-detail { display: grid; grid-template-columns: 1.25fr 1fr; gap: 20px; align-items: center; }
.detail-cover { min-height: 350px; border-radius: 18px; background-position: center !important; background-size: cover !important; box-shadow: 0 18px 36px rgba(39,51,116,.16); }
.detail-type { min-height: 30px; border-radius: 999px; padding: 0 10px; display: inline-flex; align-items: center; background: #eceeff; color: #5d69c7; font-size: 12px; font-weight: 900; }
.gallery-detail h2 { margin: 13px 0 8px; color: #25346e; }
.gallery-detail p { color: #6e78a2; line-height: 1.65; }
.gallery-detail-meta { margin: 16px 0; display: flex; flex-wrap: wrap; gap: 8px; }
.gallery-detail-meta span { min-height: 30px; border-radius: 999px; padding: 0 10px; display: inline-flex; align-items: center; background: #f4f5fb; color: #65709c; font-size: 12px; font-weight: 800; }
.detail-actions { display: flex; gap: 10px; flex-wrap: wrap; }
/* 断点必须跟脚本 syncColumnCount() 的阈值一致，否则列数和 CSS 会打架 */
@media (max-width: 1100px) { .gallery-detail { grid-template-columns: 1.25fr 1fr; } }
@media (max-width: 800px) { .gallery-detail { grid-template-columns: 1fr; } }
@media (max-width: 540px) {
  .gallery-page { padding: 10px; }
  .gallery-header { padding: 0 10px; gap: 8px; border-radius: 14px; }
  .back-btn { width: 34px; padding: 0; gap: 0; font-size: 0; justify-content: center; }
  .refresh-btn { padding: 0 11px; font-size: 12px; }
  .gallery-header h1 { font-size: 17px; }
  .gallery-masonry { gap: 8px; }
  .masonry-col { gap: 8px; }
}
</style>
