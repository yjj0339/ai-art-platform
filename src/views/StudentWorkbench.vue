<template>
  <main class="workbench app-page" :class="[`mode-${difficultyStore.current}`, 'student-visual-theme', { 'is-home-grid': homeLayout === 'grid' }]">
    <!-- 全屏动态背景（用户要求「撑满整个屏幕 + 换成动态的」）：
         默认是代码画的「动态光影」——原创、不带任何水印，只用 CSS 动画，平板上也省电；
         后台「工作台管理」配了视频就播视频，配了图片就铺图片。 -->
    <div
      class="workbench-bg"
      :class="{ 'is-fallback': bgMode === 'image', 'is-legacy-video': isLegacyBgVideo }"
      :style="bgImageStyle"
      aria-hidden="true"
    >
      <div v-if="showAmbientBg" class="ambient-bg">
        <span class="ambient-bg__blob ambient-bg__blob--a" />
        <span class="ambient-bg__blob ambient-bg__blob--b" />
        <span class="ambient-bg__blob ambient-bg__blob--c" />
        <svg class="ambient-bg__lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <path class="ambient-bg__arc" d="M-40 300C300 180 620 170 900 230S1380 330 1500 250" />
          <path class="ambient-bg__arc ambient-bg__arc--b" d="M-60 430C260 530 700 530 1000 440S1400 310 1520 370" />
          <path class="ambient-bg__streak ambient-bg__streak--glow" d="M-40 300C300 180 620 170 900 230S1380 330 1500 250" />
          <path class="ambient-bg__streak" d="M-40 300C300 180 620 170 900 230S1380 330 1500 250" />
          <path class="ambient-bg__streak ambient-bg__streak--glow ambient-bg__streak--b" d="M-60 430C260 530 700 530 1000 440S1400 310 1520 370" />
          <path class="ambient-bg__streak ambient-bg__streak--b" d="M-60 430C260 530 700 530 1000 440S1400 310 1520 370" />
          <ellipse class="ambient-bg__ring" cx="720" cy="830" rx="640" ry="124" />
          <ellipse class="ambient-bg__ring ambient-bg__ring--inner" cx="720" cy="830" rx="450" ry="84" />
          <ellipse class="ambient-bg__ring ambient-bg__ring--spin" cx="720" cy="830" rx="640" ry="124" />
        </svg>
        <i v-for="dot in AMBIENT_DOTS" :key="dot.id" class="ambient-bg__dot" :style="dot.style" />
      </div>
      <video
        v-if="bgVideoSrc"
        v-show="!bgVideoFailed"
        ref="bgVideoRef"
        class="workbench-bg__video"
        :src="bgVideoSrc"
        :poster="bgPosterUrl || undefined"
        autoplay
        muted
        loop
        playsinline
        preload="auto"
        disablepictureinpicture
        tabindex="-1"
        @error="onBgVideoError"
      />
      <span class="workbench-bg__veil" />
    </div>

    <header class="topbar">
      <div class="student-id">
        <span class="avatar">{{ userStore.user?.avatar || '艺' }}</span>
        <div>
          <strong>{{ userStore.user?.name }}</strong>
          <!-- 没分班的账号 className 为空：不能显示成「· 高级版」 -->
          <p>{{ [userStore.user?.className, difficultyStore.currentMeta.label].filter(Boolean).join(' · ') }}</p>
        </div>
      </div>
      <nav>
        <button class="partner-entry" @click="router.push('/student/partner')">AI 伙伴</button>
        <button class="nav-mid" @click="messageDialog.open = true">消息中心</button>
        <button class="nav-mid" @click="router.push('/profile')">个人中心</button>
        <button class="nav-wide" @click="router.push('/student/prompts')">提示词库</button>
        <button class="client-download-btn nav-wide" @click="openClientDownload">客户端</button>
        <el-dropdown class="legacy-profile-menu" trigger="click">
          <button>个人中心</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="activeTab = 'gallery'">同学作品广场</el-dropdown-item>
              <el-dropdown-item @click="router.push('/student/courses')">我的课程</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button class="nav-wide" @click="logout">退出登录</button>
        <!-- 窄屏：次要按钮收进「更多」，顶栏保持一行 -->
        <el-dropdown class="nav-more" trigger="click" placement="bottom-end" @command="onNavMore">
          <button type="button">更多</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="compactNav" command="messages">消息中心</el-dropdown-item>
              <el-dropdown-item v-if="compactNav" command="profile">个人中心</el-dropdown-item>
              <el-dropdown-item command="prompts">提示词库</el-dropdown-item>
              <el-dropdown-item command="client">客户端</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </nav>
    </header>

    <!-- 首页两套样式，数据是同一份 proWorkbenchItems（后台外观配置照常生效）：
         - 轮播（默认，客户指定）：3D 轨道卡片，自动转动；
         - 平铺：一眼能看全的图块网格。右上角切换，选择记在本机。 -->
    <section
      v-if="['junior', 'starter', 'advanced', 'pro'].includes(difficultyStore.current)"
      class="student-home"
      :class="`is-${homeLayout}`"
    >
      <div class="home-toolbar">
        <!-- 平铺里有「扫描草图」图块；轮播里没有，所以在这里放一个（客户要求必须有扫描：纸上画，少看屏幕） -->
        <button v-if="homeLayout === 'orbit'" type="button" class="home-scan" @click="openHomeExtra('scan')">
          <el-icon aria-hidden="true"><Camera /></el-icon>
          <span>扫描草图</span>
        </button>
        <div class="layout-switch" role="radiogroup" aria-label="首页样式">
          <button
            type="button"
            role="radio"
            :aria-checked="homeLayout === 'orbit'"
            :class="{ active: homeLayout === 'orbit' }"
            @click="setHomeLayout('orbit')"
          >轮播</button>
          <button
            type="button"
            role="radio"
            :aria-checked="homeLayout === 'grid'"
            :class="{ active: homeLayout === 'grid' }"
            @click="setHomeLayout('grid')"
          >平铺</button>
        </div>
      </div>
      <ProWorkbenchOrbit
        v-if="homeLayout === 'orbit'"
        :items="proWorkbenchItems"
        @enter="enterProWorkbenchItem"
      />
      <StudentHomeGrid
        v-else
        :items="proWorkbenchItems"
        :user-name="userStore.user?.name || ''"
        :extras="homeExtras"
        @enter="enterProWorkbenchItem"
        @open="openHomeExtra"
        @ask="askPartner"
      />
    </section>

    <template v-else>
    <section class="quick-board">
      <div class="mini-stack">
        <article class="mini-card course-entry" @click="router.push('/student/courses')">
          <span class="mini-icon">课</span>
          <div>
            <strong>选择项目课程</strong>
            <p>进入课程中心，按主题开始课堂创作任务</p>
          </div>
        </article>
      </div>

      <button class="main-feature paint-feature" @click="startNew">
        <span>画</span>
        <strong>开始新绘画项目</strong>
        <p>创建空白项目，进入AI绘画创作页</p>
      </button>
      <button class="main-feature video-feature" @click="router.push('/student/video')">
        <span>视</span>
        <strong>AI创作视频</strong>
        <p>用绘画作品和草图生成动态短片</p>
      </button>
      <button class="main-feature model-feature" @click="router.push('/student/model3d')">
        <span>3D</span>
        <strong>生成3D世界</strong>
        <p>把平面作品转成可旋转的3D模型</p>
      </button>
      <button class="main-feature report-feature" @click="createProjectReport">
        <span>报</span>
        <strong>创作项目报告</strong>
        <p>汇总草图、构思、迭代作品生成报告</p>
      </button>
    </section>

    <section class="works-board">
      <div class="tabs-bar">
        <button :class="{ active: activeTab === 'gallery' }" @click="activeTab = 'gallery'">作品广场</button>
        <button :class="{ active: activeTab === 'portfolio' }" @click="activeTab = 'portfolio'">我的素材库</button>
        <button v-if="activeTab === 'gallery'" class="refresh-btn" :disabled="galleryLoading" aria-label="刷新作品广场" title="刷新作品广场" @click="refreshGallery">
          <el-icon :class="{ 'is-loading': galleryLoading }"><Refresh /></el-icon>
        </button>
        <el-select v-if="activeTab === 'gallery'" v-model="galleryCategory" class="gallery-course-filter" size="large" @change="onGalleryCategoryChange">
          <el-option label="全部分类" value="" />
          <el-option v-for="item in galleryCategories" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <div v-if="activeTab === 'portfolio'" class="portfolio-filter">
          <el-select v-model="filterType" size="large" style="width: 150px">
            <el-option label="全部类型" value="all" />
            <el-option label="AI绘画" value="project" />
            <el-option label="3D作品" value="model3d" />
            <el-option label="创作报告" value="report" />
            <el-option label="AI动态视频" value="video" />
          </el-select>
          <el-popover placement="bottom-end" :width="316" trigger="click" popper-class="portfolio-consent-popper">
            <template #reference>
              <button type="button" class="consent-entry" :class="{ 'is-opted': galleryStore.autoSelectConsent }" aria-label="系统自动精选设置" title="系统自动精选设置">
                <el-icon><Setting /></el-icon>
              </button>
            </template>
            <div class="consent-panel">
              <strong>系统自动精选</strong>
              <p>开启后，你保存为最终作品时自动提交机构审核，通过后展示在作品广场。可随时关闭，或逐件撤回。</p>
              <label class="consent-panel-switch">
                <span>允许自动精选</span>
                <el-switch :model-value="galleryStore.autoSelectConsent" :disabled="consentBusy || (galleryStore.serverMode && (!galleryStore.ownLoaded || !galleryStore.consent.granted))" @change="toggleAutoSelectConsent" />
              </label>
              <p v-if="galleryStore.serverMode && !galleryStore.ownLoaded" class="consent-panel-note" role="alert">
                {{ galleryStore.ownError || '正在读取审核状态…' }}
                <button v-if="galleryStore.ownError" type="button" @click="initializeGallery">重试</button>
              </p>
              <p v-else-if="galleryStore.serverMode && !galleryStore.consent.granted" class="consent-panel-note is-warn">
                机构尚未登记公开授权，自动精选与投稿暂不可用，请联系管理员。
              </p>
              <button v-if="galleryStore.serverMode && galleryStore.ownWorks.some(work => work.source === '系统精选' && (work.status === 'published' || work.previousPublished))" type="button" class="consent-panel-withdraw" @click="withdrawSelected">撤下已精选作品</button>
            </div>
          </el-popover>
          <PortfolioBatchMenu
            v-model:active="batchActive"
            v-model:selected-ids="batchSelectedIds"
            variant="workbench"
            :items="visibleItems"
          />
        </div>
      </div>

      <transition name="tab-fade" mode="out-in">
        <div v-if="activeTab === 'gallery'" key="gallery" class="works-scroll" @scroll="handleGalleryScroll">
          <p v-if="galleryError" role="alert">{{ galleryError }}</p><p v-else-if="!galleryLoading && !galleryItems.length">暂时没有审核通过的公开作品</p><div class="gallery-grid">
            <article v-for="item in visibleGalleryItems" :key="item.id" class="gallery-card" @click="openGalleryDetail(item)">
              <div class="work-cover" :style="galleryCoverStyle(item.cover)">
                <span>{{ item.icon }}</span>
              </div>
              <div class="gallery-overlay">
                <div class="gallery-meta">
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.ageRange }} · {{ item.course }}</p>
                </div>
                <div class="gallery-actions">
                  <span v-if="item.pinned" class="source-chip">置顶</span>
                  <button type="button" class="like-chip" aria-label="点赞" @click.stop="likeGalleryWork(item)">♥ {{ item.likes }}</button>
                </div>
              </div>
            </article>
          </div>
          <div class="load-more">{{ galleryHasMore ? '继续向下滚动加载更多公开作品' : '已加载全部审核通过作品' }}</div>
        </div>

        <div v-else key="portfolio" class="works-scroll">
          <div v-if="visibleItems.length" class="project-grid portfolio-cover-grid">
            <article
              v-for="item in visibleItems"
              :key="item.id"
              class="project-card portfolio-cover-card"
              :class="{ 'is-batch': batchActive, 'is-picked': batchSelectedIds.includes(item.id) }"
              role="button"
              tabindex="0"
              @click="handleCardClick(item)"
              @keydown.enter="handleCardClick(item)"
            >
              <span v-if="batchActive" class="portfolio-select-box" :class="{ checked: batchSelectedIds.includes(item.id) }">
                <el-icon v-if="batchSelectedIds.includes(item.id)"><Check /></el-icon>
              </span>
              <div class="work-cover portfolio-cover" :class="`portfolio-cover--${item.kind}`" :style="getPortfolioArtworkStyle(item)">
                <div class="portfolio-cover-info">
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.meta }}</p>
                </div>
                <span v-if="item.kind === 'project' && isGalleryPublished(item)" class="portfolio-published-star" title="已展示在作品广场">★</span>
                <PortfolioItemMenu v-if="!batchActive" :item="item" />
              </div>
            </article>
          </div>
          <div v-else class="portfolio-empty">当前分类还没有作品，先去完成一个AI创作项目。</div>
        </div>
      </transition>
    </section>
    </template>

    <el-dialog v-model="galleryDialog.open" title="作品详情" width="760px">
      <div v-if="galleryDialog.item" class="gallery-detail">
        <div class="detail-cover" :style="galleryCoverStyle(galleryDialog.item.cover)">
          <span>{{ galleryDialog.item.icon }}</span>
        </div>
        <section>
          <h2>{{ galleryDialog.item.title }}</h2>
          <p>{{ galleryDialog.item.description }}</p>
          <div class="gallery-detail-meta">
            <span>{{ galleryDialog.item.author }}</span>
            <span>{{ galleryDialog.item.ageRange }}</span>
            <span>{{ galleryDialog.item.source }}</span>
          </div>
          <div class="detail-actions">
            <BaseButton variant="secondary" @click="likeGalleryWork(galleryDialog.item)">点赞 {{ galleryDialog.item.likes }}</BaseButton>
            <BaseButton @click="openGalleryCourse(galleryDialog.item)">进入对应课程</BaseButton>
          </div>
        </section>
      </div>
    </el-dialog>

    <el-dialog v-model="portfolioDialog.open" title="单个作品浏览" width="980px" class="portfolio-dialog">
      <div v-if="portfolioDialog.item" class="portfolio-detail">
        <div class="portfolio-detail-media-stage" :class="{ 'is-compact': portfolioArtworkCompact }">
          <div class="portfolio-zoom-controls" aria-label="作品缩放控制">
            <button type="button" aria-label="缩小作品" title="缩小作品" :disabled="portfolioArtworkScale <= 0.2" @click="changePortfolioArtworkScale(-0.1)">
              <el-icon><ZoomOut /></el-icon>
            </button>
            <button type="button" aria-label="放大作品" title="放大作品" :disabled="portfolioArtworkScale >= 5" @click="changePortfolioArtworkScale(0.1)">
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
            <span>{{ portfolioDialog.item.kind === 'project' ? '图像提示词' : '作品说明' }}</span>
            <p>{{ getPortfolioDescription(portfolioDialog.item) }}</p>
          </div>
        </section>
      </div>
      <template #footer>
        <div v-if="portfolioDialog.item" class="portfolio-detail-actions">
          <BaseButton variant="secondary" @click="goCanvasEdit(portfolioDialog.item)">去画布编辑</BaseButton>
          <BaseButton variant="secondary" @click="importReference(portfolioDialog.item)">导入参考图</BaseButton>
          <BaseButton variant="secondary" @click="modifyArtwork(portfolioDialog.item)">{{ portfolioDialog.item.kind === 'model3d' ? '打开3D查看' : '作品修改' }}</BaseButton>
          <BaseButton
            v-if="portfolioDialog.item.kind === 'project'"
            :disabled="!portfolioDialog.item.finalVersionId || ['已撤回', '已下架'].includes(galleryStatusLabel(portfolioDialog.item))"
            @click="openSubmissionDialog(portfolioDialog.item)"
          >
            {{ portfolioDialog.item.finalVersionId ? '投稿到作品广场' : '请先设置最终作品' }}
          </BaseButton>
          <span v-if="portfolioDialog.item.kind === 'project'">{{ galleryStatusLabel(portfolioDialog.item) }}</span>
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
          <el-input v-model="submissionDialog.description" type="textarea" :rows="4" maxlength="200" show-word-limit />
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

    <el-dialog v-model="messageDialog.open" title="消息中心" width="520px">
      <div v-if="galleryMessages.length" class="message-list">
        <article v-for="message in galleryMessages" :key="message.id" class="message-item">
          <div>
            <strong>{{ message.title }}</strong>
            <p>{{ message.auditReason }}</p>
          </div>
          <span>{{ galleryMessageStatus(message.status) }}</span>
        </article>
      </div>
      <div v-else class="message-empty">暂无作品审核消息</div>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Camera, Check, MagicStick, Refresh, Setting, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
import PortfolioBatchMenu from '../components/student/PortfolioBatchMenu.vue'
import PortfolioItemMenu from '../components/student/PortfolioItemMenu.vue'
import ProWorkbenchOrbit from '../components/student/ProWorkbenchOrbit.vue'
import StudentHomeGrid from '../components/student/StudentHomeGrid.vue'
import { useDifficultyStore } from '../stores/difficultyStore'
import { useGalleryStore } from '../stores/galleryStore'
import { useStudentGallery } from '../composables/useStudentGallery'
import { galleryCoverStyle, galleryStatusLabels } from '../utils/galleryRules'
import { extractImageUrl } from '../utils/referenceImages'
import { useProjectStore } from '../stores/projectStore'
import { useUserStore } from '../stores/userStore'
import { getWorkbenchConfig } from '../services/workbenchGateway'
import {
  WORKBENCH_BUILTIN_CARD_IMAGES,
  WORKBENCH_BUILTIN_CARD_OBJECTS,
  WORKBENCH_CARD_TINTS,
  WORKBENCH_BUILTIN_CARD_POSITIONS,
  WORKBENCH_LEGACY_BG_IMAGE,
  WORKBENCH_LEGACY_BG_VIDEO,
  WORKBENCH_CARD_ORDER,
  WORKBENCH_CARD_TITLES,
  workbenchPositionCss,
} from '../utils/workbenchDefaults'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const difficultyStore = useDifficultyStore()
const galleryStore = useGalleryStore()
const projectStore = useProjectStore()

/* ===== 全屏动态背景 =====
   默认（后台没配背景）：代码画的「动态光影」.ambient-bg —— 原创、不带任何水印，只用 CSS 动画，平板上也省电。
   以前默认播的是一段豆包生成的视频，片里带「豆包 AI 生成」标识、靠角落柔雾遮住；按《人工智能生成合成内容标识办法》
   不应删除或隐匿这类标识，所以默认换成原创背景。后台「工作台管理 → 背景」可以一键用回那段视频，
   用回时沿用当年客户确认过的柔雾样式（.is-legacy-video）。
   视频的三个保护点照旧：
   1. 必须 muted：带音轨的视频浏览器一律拒绝 autoplay，不静音会停在第一帧，看着像没生效。
   2. 播放失败（老浏览器 / 被省流量模式拦 / 文件 404）→ bgVideoFailed 置真，退回动态光影，不留灰底。
   3. 页面切走时暂停，回来再播：省电，也避免多标签同时解码。 */
const bgVideoRef = ref(null)
const bgVideoFailed = ref(false)
// 动态光影里飘的小光点：位置、大小、节奏写死（不用随机数），每次进来都一样，截图对比也稳定。
const AMBIENT_DOTS = [
  [8, 22, 4], [16, 64, 3], [24, 38, 5], [33, 80, 3], [41, 16, 4], [52, 58, 3],
  [60, 30, 5], [68, 74, 4], [76, 44, 3], [84, 20, 4], [90, 62, 5], [95, 36, 3],
].map(([x, y, size], index) => ({
  id: index,
  style: {
    left: `${x}%`,
    top: `${y}%`,
    width: `${size}px`,
    height: `${size}px`,
    animationDuration: `${5 + (index % 4) * 1.5}s`,
    animationDelay: `${-((index * 1.7) % 6)}s`,
  },
}))

/* ===== 工作台外观配置（后台「工作台管理」下发）=====
   拿不到配置（没登录 / 后端挂了 / 网络断）时 workbenchConfig 保持 null，
   下面所有 computed 自动退回内置值 —— 一个外观配置绝不能让首屏卡住或白屏。 */
const workbenchConfig = ref(null)
const workbenchLogoUrl = computed(() => workbenchConfig.value?.brand?.logoUrl || '')
// 视频优先、图片次之、都没配就是内置的动态光影：后台「换成静态图」也是一种有效设置。
// 视频放不出来时按同一顺序往下退：后台传过背景图就铺那张图，没传才用动态光影。
// 注意 bgVideoSrc 只认「配没配」、不看失败与否：失败后 <video> 留在页面上只是 v-show 藏起来；
// 要是失败就把 src 清掉，下面的 watch 会把失败记录清零 → 又挂上视频 → 又失败，来回打转。
const bgVideoSrc = computed(() => workbenchConfig.value?.background?.videoUrl || '')
const bgCustomImageUrl = computed(() => workbenchConfig.value?.background?.imageUrl || '')
const bgMode = computed(() => {
  if (bgVideoSrc.value && !bgVideoFailed.value) return 'video'
  if (bgCustomImageUrl.value) return 'image'
  return 'ambient'
})
const isLegacyBgVideo = computed(() => bgMode.value === 'video' && bgVideoSrc.value === WORKBENCH_LEGACY_BG_VIDEO)
const bgPosterUrl = computed(() => (bgVideoSrc.value === WORKBENCH_LEGACY_BG_VIDEO ? WORKBENCH_LEGACY_BG_IMAGE : bgCustomImageUrl.value))
const showAmbientBg = computed(() => bgMode.value === 'ambient')
const bgImageStyle = computed(() => (bgMode.value === 'image' ? { backgroundImage: `url('${bgCustomImageUrl.value}')` } : null))
// 后台换了视频：上一段放不出来的记录作废，新视频重新试
watch(bgVideoSrc, () => { bgVideoFailed.value = false })

/* ===== 首页两套样式 =====
   默认「轮播」（客户指定：轮播 + 自动转动）；「平铺」是一眼看全的图块网格，右上角可以切换。
   选择只记在本机（界面偏好，不是业务数据）；读不到或被清掉就回到默认的轮播。 */
const HOME_LAYOUT_KEY = 'art-studio-home-layout'
function readHomeLayout() {
  try {
    return localStorage.getItem(HOME_LAYOUT_KEY) === 'grid' ? 'grid' : 'orbit'
  } catch {
    return 'orbit'
  }
}
const homeLayout = ref(readHomeLayout())
function setHomeLayout(layout) {
  homeLayout.value = layout === 'grid' ? 'grid' : 'orbit'
  try {
    localStorage.setItem(HOME_LAYOUT_KEY, homeLayout.value)
  } catch {
    // 隐私模式等写不进本机存储：这次照样切换，只是下次进来回到默认
  }
}

function playBgVideo() {
  const video = bgVideoRef.value
  if (!video || bgVideoFailed.value) return
  // play() 返回 Promise，被拦时会 reject，不 catch 会在控制台刷一片红字
  const result = video.play()
  if (result && typeof result.catch === 'function') {
    // AbortError = 还没播起来就被 pause() 打断（快速切走又切回），视频本身没坏，不能因此永久退回动态光影
    result.catch((error) => { if (error?.name !== 'AbortError') bgVideoFailed.value = true })
  }
}

function onBgVideoError() {
  bgVideoFailed.value = true
}

function onVisibilityChange() {
  if (document.hidden) bgVideoRef.value?.pause()
  else playBgVideo()
}

onMounted(() => {
  playBgVideo()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

const fallbackCover = 'linear-gradient(135deg, #ff7a00, #ffd166)'
const activeTab = ref(route.query.tab === 'portfolio' ? 'portfolio' : 'gallery')
const filterType = ref('all')
const galleryCategory = ref('')
const galleryDialog = reactive({ open: false, item: null })
const portfolioDialog = reactive({ open: false, item: null })
const submissionDialog = reactive({ open: false, item: null, title: '', description: '' })
const { galleryBusy, consentBusy, galleryStatusLabel, isGalleryPublished, initializeGallery, toggleAutoSelectConsent, openSubmissionDialog, submitPortfolioArtwork, withdrawArtwork, withdrawSelected } = useStudentGallery({ galleryStore, projectStore, userStore, submissionDialog, getSourceProject })
const messageDialog = reactive({ open: false })
const portfolioArtworkScale = ref(1)
const portfolioArtworkCompact = computed(() => portfolioArtworkScale.value < 1)
// 批量操作状态（与独立页 StudentPortfolio.vue 语义一致，卡片勾选框依赖它渲染）
const batchActive = ref(false)
const batchSelectedIds = ref([])
const galleryLoading = ref(false)
const galleryError = ref('')
const galleryPage = ref(1)

const legacyGalleryItems = ref([
  {
    id: 'g-001',
    title: '会发光的水果店IP',
    author: '阿橙',
    type: '绘画',
    likes: 36,
    icon: '画',
    cover: "url('/assets/student-theme/gallery-hedgehog-v1.png') center / cover no-repeat",
    prompt: '会发光的橙子店长，未来水果店，儿童插画风格',
    description: '同班同学公开作品，已通过内容审核。主题是一个温暖的水果店IP形象。',
    comments: ['颜色很温暖，适合做店铺招牌。'],
  },
  {
    id: 'g-002',
    title: '星际旅行小汽车',
    author: '小星',
    type: difficultyStore.current === 'junior' ? '绘画' : '视频',
    likes: 28,
    icon: difficultyStore.current === 'junior' ? '画' : '视',
    cover: "url('/assets/student-theme/gallery-future-car-v1.png') center / cover no-repeat",
    prompt: '星星小汽车，银河轨道，圆润可爱',
    description: '公开作品展示了小汽车在银河轨道中的创意运动效果。',
    comments: ['运镜想法很有速度感。'],
  },
  {
    id: 'g-003',
    title: '黏土小城堡',
    author: '米粒',
    type: difficultyStore.current === 'junior' ? '绘画' : '3D',
    likes: 42,
    icon: difficultyStore.current === 'junior' ? '画' : '3D',
    cover: "url('/assets/student-theme/gallery-sky-castle-v1.png') center / cover no-repeat",
    prompt: '黏土质感的小城堡，圆角，柔和灯光',
    description: '公开作品使用平面转3D流程生成了手办感小城堡。',
    comments: ['3D形体很适合做课堂展示。'],
  },
  {
    id: 'g-004',
    title: '梦幻云朵房间',
    author: '木木',
    type: '绘画',
    likes: 31,
    icon: '画',
    cover: 'linear-gradient(135deg, #f472b6, #fde2f3)',
    prompt: '梦幻房间，云朵灯，温馨治愈',
    description: '同班同学公开绘画作品，色彩温柔，构思完整。',
    comments: ['云朵灯的创意很好。'],
  },
  {
    id: 'g-005',
    title: '节日海报设计',
    author: '可可',
    type: '绘画',
    likes: 24,
    icon: '报',
    cover: 'linear-gradient(135deg, #facc15, #fb7185)',
    prompt: '节日海报，彩带，礼物，明亮配色',
    description: '课堂项目作品，适合生成同款后继续修改文字和配色。',
    comments: ['标题可以再大一点。'],
  },
  {
    id: 'g-006',
    title: '森林音乐会',
    author: '小叶',
    type: '绘画',
    likes: 33,
    icon: '画',
    cover: 'linear-gradient(135deg, #86efac, #d9f99d)',
    prompt: '森林音乐会，小动物舞台，柔和晨光，儿童绘本风格',
    description: '已通过内容审核的班级公开作品，适合生成同款后练习舞台构图。',
    comments: ['舞台层次很清楚。'],
  },
  {
    id: 'g-007',
    title: '海底机器人伙伴',
    author: '阿蓝',
    type: difficultyStore.current === 'junior' ? '绘画' : '3D',
    likes: 45,
    icon: difficultyStore.current === 'junior' ? '画' : '3D',
    cover: 'linear-gradient(135deg, #38bdf8, #bae6fd)',
    prompt: '海底机器人伙伴，透明潜水舱，珊瑚背景，圆润3D造型',
    description: '公开作品展示了平面角色转3D的课堂演示效果。',
    comments: ['机器人造型很适合做手办。'],
  },
  {
    id: 'g-008',
    title: '会飞的书包',
    author: '点点',
    type: difficultyStore.current === 'junior' ? '绘画' : '视频',
    likes: 29,
    icon: difficultyStore.current === 'junior' ? '画' : '视',
    cover: 'linear-gradient(135deg, #c4b5fd, #fbcfe8)',
    prompt: '会飞的书包，彩色喷气尾巴，校园天空，轻快动画',
    description: 'AI动态视频公开作品，用绘画成品生成了短片效果。',
    comments: ['动作方向很有趣。'],
  },
  {
    id: 'g-009',
    title: '未来糖果工厂',
    author: '糖糖',
    type: '绘画',
    likes: 51,
    icon: '画',
    cover: 'linear-gradient(135deg, #fb7185, #fde68a)',
    prompt: '未来糖果工厂，传送带，彩色糖果机器，明亮配色',
    description: '已审核通过的创意设计作品，适合练习空间透视和色彩搭配。',
    comments: ['机器细节可以继续加。'],
  },
  {
    id: 'g-010',
    title: '月亮上的茶会',
    author: '月月',
    type: '绘画',
    likes: 39,
    icon: '画',
    cover: 'linear-gradient(135deg, #fef3c7, #ddd6fe)',
    prompt: '月亮上的茶会，星星甜点，柔和夜空，梦幻插画',
    description: '同班级公开作品，创意说明完整，画面氛围清晰。',
    comments: ['夜空颜色很舒服。'],
  },
  {
    id: 'g-011',
    title: '彩虹公交站',
    author: '小虹',
    type: '绘画',
    likes: 27,
    icon: '画',
    cover: 'linear-gradient(135deg, #f0abfc, #93c5fd)',
    prompt: '彩虹公交站，未来城市，透明候车亭，儿童插画',
    description: '公开绘画作品，适合继续生成同款并调整建筑细节。',
    comments: ['候车亭的想法很新。'],
  },
  {
    id: 'g-012',
    title: '积木太空基地',
    author: '木子',
    type: difficultyStore.current === 'junior' ? '绘画' : '3D',
    likes: 48,
    icon: difficultyStore.current === 'junior' ? '画' : '3D',
    cover: 'linear-gradient(135deg, #bfdbfe, #fef08a)',
    prompt: '积木玩具风格太空基地，圆角模块，低多边形，明亮灯光',
    description: '已审核通过的3D作品，支持作为平面转3D参考案例。',
    comments: ['积木模块很适合课堂展示。'],
  },
  {
    id: 'g-013',
    title: '会唱歌的蘑菇屋',
    author: '南南',
    type: '绘画',
    likes: 34,
    icon: '画',
    cover: 'linear-gradient(135deg, #f9a8d4, #fde68a)',
    prompt: '会唱歌的蘑菇屋，森林小路，童话插画，温暖灯光',
    description: '班级公开绘画作品，适合练习建筑造型和童话氛围表达。',
    comments: ['蘑菇屋的表情很有趣。'],
  },
  {
    id: 'g-014',
    title: '星光鱼群短片',
    author: '小海',
    type: difficultyStore.current === 'junior' ? '绘画' : '视频',
    likes: 46,
    icon: difficultyStore.current === 'junior' ? '画' : '视',
    cover: 'linear-gradient(135deg, #67e8f9, #c4b5fd)',
    prompt: '发光鱼群，海底慢镜头，梦幻光影，轻柔动画',
    description: '用绘画作品生成的AI动态视频，适合作为视频创作参考。',
    comments: ['鱼群移动方向很自然。'],
  },
  {
    id: 'g-015',
    title: '机器人图书管理员',
    author: '安安',
    type: '绘画',
    likes: 32,
    icon: '画',
    cover: 'linear-gradient(135deg, #93c5fd, #fef3c7)',
    prompt: '机器人图书管理员，圆润造型，未来图书馆，儿童插画',
    description: '公开绘画作品，主题完整，适合生成同款后继续修改角色动作。',
    comments: ['机器人和书架搭配得很好。'],
  },
  {
    id: 'g-016',
    title: '彩色风车小镇',
    author: '米朵',
    type: difficultyStore.current === 'junior' ? '绘画' : '3D',
    likes: 40,
    icon: difficultyStore.current === 'junior' ? '画' : '3D',
    cover: 'linear-gradient(135deg, #86efac, #bfdbfe)',
    prompt: '彩色风车小镇，低多边形，圆角建筑，明亮天空',
    description: '平面转3D公开作品，适合观察建筑块面和空间关系。',
    comments: ['风车造型很适合做成立体模型。'],
  },
  {
    id: 'g-017',
    title: '甜甜圈星球海报',
    author: '果果',
    type: '报告',
    likes: 26,
    icon: '报',
    cover: 'linear-gradient(135deg, #fda4af, #fed7aa)',
    prompt: '甜甜圈星球，课程项目海报，创意说明，明亮配色',
    description: '项目报告公开案例，包含草图、迭代过程和最终成果展示。',
    comments: ['报告结构清楚，适合参考。'],
  },
  {
    id: 'g-018',
    title: '云朵游乐场',
    author: '小白',
    type: '绘画',
    likes: 38,
    icon: '画',
    cover: 'linear-gradient(135deg, #dbeafe, #fce7f3)',
    prompt: '云朵游乐场，彩虹滑梯，软绵绵材质，儿童绘本',
    description: '已审核公开作品，适合练习场景构图和色彩层次。',
    comments: ['滑梯和云朵结合得很可爱。'],
  },
  {
    id: 'g-019',
    title: '恐龙快递员',
    author: '乐乐',
    type: difficultyStore.current === 'junior' ? '绘画' : '视频',
    likes: 44,
    icon: difficultyStore.current === 'junior' ? '画' : '视',
    cover: 'linear-gradient(135deg, #bbf7d0, #fef08a)',
    prompt: '恐龙快递员，城市街道，轻快奔跑动画，卡通风格',
    description: 'AI视频公开作品，展示角色移动和故事感镜头。',
    comments: ['故事性很强，适合继续生成报告。'],
  },
  {
    id: 'g-020',
    title: '未来植物实验室',
    author: '青禾',
    type: '绘画',
    likes: 37,
    icon: '画',
    cover: 'linear-gradient(135deg, #6ee7b7, #bae6fd)',
    prompt: '未来植物实验室，透明培养舱，发光藤蔓，科幻儿童插画',
    description: '公开绘画作品，适合练习科技主题和植物细节设计。',
    comments: ['发光藤蔓很有想象力。'],
  },
  {
    id: 'g-021',
    title: '海岛课堂作品集',
    author: '星河班',
    type: '报告',
    likes: 30,
    icon: '报',
    cover: 'linear-gradient(135deg, #7dd3fc, #fde68a)',
    prompt: '海岛课堂作品集，封面设计，课程合集报告，清爽排版',
    description: '课程合集报告公开案例，展示多作品整理和AI点评页。',
    comments: ['合集报告很适合学期展示。'],
  },
  {
    id: 'g-022',
    title: '宇宙猫咪飞船',
    author: '喵喵',
    type: difficultyStore.current === 'junior' ? '绘画' : '3D',
    likes: 52,
    icon: difficultyStore.current === 'junior' ? '画' : '3D',
    cover: 'linear-gradient(135deg, #c4b5fd, #fbcfe8)',
    prompt: '宇宙猫咪飞船，圆润玩具风格，透明驾驶舱，星空背景',
    description: '3D公开作品案例，适合练习角色和载具组合设计。',
    comments: ['飞船外形很有辨识度。'],
  },
  {
    id: 'g-023',
    title: '会发光的雨伞街',
    author: '雨点',
    type: '绘画',
    likes: 35,
    icon: '画',
    cover: 'linear-gradient(135deg, #a5b4fc, #f0abfc)',
    prompt: '会发光的雨伞街，夜晚小巷，倒影，温暖橙色灯光',
    description: '公开绘画作品，适合练习光影、反射和街景空间。',
    comments: ['雨伞灯光效果很好。'],
  },
  {
    id: 'g-024',
    title: '魔法铅笔动画',
    author: '圆圆',
    type: difficultyStore.current === 'junior' ? '绘画' : '视频',
    likes: 41,
    icon: difficultyStore.current === 'junior' ? '画' : '视',
    cover: 'linear-gradient(135deg, #fed7aa, #fef9c3)',
    prompt: '魔法铅笔自动画出彩虹城堡，轻快动画，课堂演示短片',
    description: 'AI视频公开作品，适合参考绘画到动态短片的创作流程。',
    comments: ['铅笔画出城堡的过程很清楚。'],
  },
])
const galleryPageSize = 20
// 分类由后台维护，用户端只读；服务端模式下筛选已在接口侧完成，本地只做演示数据兜底。
const galleryCategories = computed(() => galleryStore.serverMode ? galleryStore.publicCategories : [])
const galleryItems = computed(() => {
  const items = galleryStore.serverMode ? galleryStore.publishedWorks : galleryStore.publishedWorks.length ? galleryStore.publishedWorks : legacyGalleryItems.value
  // 服务端模式：接口已按 categoryId 筛过，前端再筛会筛空（作品字段不一定带 categoryId）
  if (galleryStore.serverMode || !galleryCategory.value) return items
  return items.filter((item) => item.course === galleryCategory.value)
})
function onGalleryCategoryChange() {
  galleryPage.value = 1
  refreshGallery(false)
}
const visibleGalleryItems = computed(() => galleryItems.value.slice(0, Math.min(galleryItems.value.length, galleryPage.value * galleryPageSize)))
const galleryHasMore = computed(() => visibleGalleryItems.value.length < galleryItems.value.length || (galleryStore.serverMode && galleryStore.works.length < galleryStore.publicTotal))

const portfolioItems = computed(() => {
  const items = []
  projectStore.projects.forEach((project) => {
    items.push({
      id: `${project.id}-project`,
      projectId: project.id,
      kind: 'project',
      icon: project.title.slice(0, 1),
      title: project.title,
      meta: project.updatedAt,
      cover: project.cover,
      prompt: project.prompt,
      description: project.ideaSummary || project.theme,
      ratio: project.ratio || project.versions?.[0]?.ratio || '4:3',
      finalVersionId: project.finalVersionId,
      courseTitle: project.courseTitle || project.courseCategory || 'AI创意美术课',
      hasReport: Boolean(project.reports?.length),
    })
    ;(project.models3d || []).forEach((model) => {
      items.push({
        id: model.id,
        projectId: project.id,
        kind: 'model3d',
        icon: '3D',
        title: model.title,
        meta: formatDate(model.createdAt),
        cover: model.cover || model.preview || project.cover,
        prompt: project.prompt,
        description: model.description,
        modelUrl: model.modelUrl,
        ratio: model.ratio || '1:1',
        hasReport: Boolean(project.reports?.length),
      })
    })
    ;(project.reports || []).forEach((report) => {
      items.push({
        id: report.id,
        projectId: project.id,
        kind: 'report',
        icon: '报',
        title: report.title,
        meta: formatDate(report.createdAt),
        cover: report.cover || project.cover,
        prompt: project.prompt,
        description: report.summary || report.description,
        ratio: report.ratio || '16:9',
        hasReport: true,
      })
    })
    ;(project.videos || []).forEach((video) => {
      items.push({
        id: video.id,
        projectId: project.id,
        kind: 'video',
        icon: '视',
        title: video.title,
        meta: formatDate(video.createdAt),
        cover: video.background || video.cover || project.cover,
        prompt: project.prompt,
        description: video.description || video.script,
        ratio: video.ratio || '9:16',
        hasReport: Boolean(project.reports?.length),
      })
    })
  })
  return items
})
const visibleItems = computed(() => {
  if (filterType.value === 'report') return portfolioItems.value.filter((item) => item.kind === 'report')
  if (filterType.value === 'project') return portfolioItems.value.filter((item) => item.kind === 'project')
  if (filterType.value === 'video') return portfolioItems.value.filter((item) => item.kind === 'video')
  if (filterType.value === 'model3d') return portfolioItems.value.filter((item) => item.kind === 'model3d')
  return portfolioItems.value
})
/* 每张卡的「动态文案」：数量、封面这些每次进页面都会变，所以放这里算；
   图片地址、标题这些固定不变的全在 workbenchDefaults.js，后台面板也读同一份。 */
const CARD_DYNAMIC_TEXT = computed(() => ({
  gallery: {
    description: '发现审核通过的优秀创作',
    meta: `${galleryStore.serverMode ? galleryStore.publicTotal : galleryItems.value.length} 件公开作品`,
  },
  portfolio: {
    description: '管理个人绘画、视频和3D作品',
    meta: `${portfolioItems.value.length} 件个人作品`,
  },
  reports: {
    description: '汇总创作过程与学习成果',
    meta: `${portfolioItems.value.filter((item) => item.kind === 'report').length} 份项目报告`,
  },
}))

const proWorkbenchItems = computed(() => {
  const firstPortfolioCover = portfolioItems.value.find((item) => item.cover)?.cover
  const firstGalleryCover = galleryItems.value.find((item) => item.cover)?.cover
  const galleryArt = galleryCoverStyle(firstGalleryCover)
  const savedCards = new Map((workbenchConfig.value?.cards || []).map((card) => [card.id, card]))
  const dynamicText = CARD_DYNAMIC_TEXT.value

  return WORKBENCH_CARD_ORDER.map((id) => {
    const saved = savedCards.get(id)
    const fallbackUrl = `url('${WORKBENCH_BUILTIN_CARD_IMAGES[id]}')`
    // 画廊/素材库两张：有真实作品封面就先用作品封面（这是「活的」内容，比任何静态图都有意义），
    // 一件作品都没有才退回内置图。
    let imageUrl = fallbackUrl
    // customSrc：同一张图的「裸地址」，给平铺网格的 <img> 用（轮播用的是上面的 CSS url() 串）
    let customSrc = ''
    if (id === 'gallery' && galleryArt.backgroundImage) {
      imageUrl = galleryArt.backgroundImage
      customSrc = firstGalleryCover
    }
    else if (id === 'gallery' && firstGalleryCover) imageUrl = `url('${firstGalleryCover}')`
    // ⚠️ 素材库的 cover 存的是「整条 CSS」（如 url("https://…") center / cover no-repeat #f8fafc），
    //    不是裸地址。直接拼 url('${cover}') 会变成 url('url("https://…")')，浏览器按相对路径解析 → 图裂（踩过）。
    //    统一走 getPortfolioImageUrl() 抽出真实地址，取不到就保留内置兜底图。
    else if (id === 'portfolio') {
      const coverUrl = getPortfolioImageUrl(firstPortfolioCover)
      if (coverUrl) {
        imageUrl = `url('${coverUrl}')`
        customSrc = coverUrl
      }
    }
    // 后台配了图就以后台为准，整条覆盖。
    if (saved?.imageUrl) {
      imageUrl = `url('${saved.imageUrl}')`
      customSrc = saved.imageUrl
    }
    // 🔴 兜底垫在最底层：作品封面多是 AI 上游的 24 小时签名外链，过期就 403，
    //    后台换的图也可能被删。CSS 多层背景里「上层加载失败会自动露出下层」，
    //    这样任何一张图挂了都不会变成白块，用户至少还看得见内置卡面。
    const customUrl = imageUrl !== fallbackUrl ? imageUrl : ''
    if (customUrl) imageUrl = `${customUrl}, ${fallbackUrl}`
    return {
      id,
      title: WORKBENCH_CARD_TITLES[id],
      description: dynamicText[id]?.description || '',
      meta: dynamicText[id]?.meta || '',
      imageUrl,
      // 平铺网格用：内置的是透明底物件图，整张放进图块（不裁切、不拉伸）；
      // 后台换的图、作品封面按原比例当「小海报」放，加载失败退回内置物件图。
      tileArt: {
        src: customSrc || WORKBENCH_BUILTIN_CARD_OBJECTS[id],
        fallback: WORKBENCH_BUILTIN_CARD_OBJECTS[id],
        framed: Boolean(customSrc),
      },
      tint: WORKBENCH_CARD_TINTS[id],
      imagePosition: workbenchPositionCss(saved?.position || WORKBENCH_BUILTIN_CARD_POSITIONS[id]),
      visible: saved?.visible !== false,
    }
  })
    // 后台点了「隐藏」就不渲染；但第一张永远保留，否则轨道空转、用户没有入口。
    .filter((item, index) => item.visible || index === 0)
})
const galleryMessages = computed(() => (galleryStore.serverMode ? galleryStore.ownWorks : galleryStore.works)
  .filter((item) => (galleryStore.serverMode || item.author === userStore.user?.name) && ['rejected', 'review', 'offline'].includes(item.status))
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))

onMounted(async () => {
  // 外观配置和作品数据并行拉：外观先到先渲染，作品列表后到再补，谁也别等谁。
  loadWorkbenchConfig()
  await initializeGallery()
  await refreshGallery(false)
})

// 后台没配过 / 请求失败都返回 null，此时全部退回内置外观，页面照常可用。
async function loadWorkbenchConfig() {
  const config = await getWorkbenchConfig()
  if (config) workbenchConfig.value = config
}

function startNew() {
  projectStore.startNewProject(difficultyStore.current)
  router.push('/student/paint')
}
// 首页固定入口（不属于后台可配置的 9 张卡）
const homeExtras = [
  { id: 'scan', title: '扫描草图', text: '拍下纸上的画，接着用 AI 创作', icon: Camera, color: '#19b394' },
  { id: 'partner', title: 'AI 伙伴', text: '不会就问，它能帮你想、帮你画', icon: MagicStick, color: '#6c5ce7' },
]
function openHomeExtra(id) {
  if (id === 'scan') router.push({ path: '/student/paint', query: { scan: '1' } })
  else if (id === 'partner') router.push('/student/partner')
}
function askPartner(text) {
  router.push({ path: '/student/partner', query: text ? { q: text } : {} })
}
function enterProWorkbenchItem(item) {
  const routes = {
    courses: '/student/courses',
    sketchpad: '/student/board',
    video: '/student/video',
    canvas: '/student/canvas',
    model3d: '/student/model3d',
    gallery: '/student/gallery',
    portfolio: '/student/portfolio',
    reports: '/student/reports',
  }
  if (item.id === 'paint') {
    startNew()
    return
  }
  const target = routes[item.id]
  if (target) router.push(target)
}
function createProjectReport() {
  const source = projectStore.currentProject || projectStore.draft
  if (source) projectStore.setCurrentProject({ ...source, difficulty: difficultyStore.current })
  else projectStore.startNewProject(difficultyStore.current)
  router.push('/student/h5-report')
}
function openProject(projectId) {
  projectStore.openProject(projectId)
  router.push('/student/paint')
}
function generateReport(projectId) {
  projectStore.openProject(projectId)
  router.push('/student/h5-report')
}
function openReport(projectId) {
  projectStore.openProject(projectId)
  router.push('/student/h5-report')
}
function generateVideo(projectId) {
  projectStore.openProject(projectId)
  router.push('/student/video')
}
function openVideo(projectId) {
  projectStore.openProject(projectId)
  router.push('/student/video')
}
function openModel(projectId, modelId = '') {
  projectStore.openProject(projectId)
  router.push({ path: '/student/model3d', query: { projectId, ...(modelId ? { modelId } : {}) } })
}
function kindLabel(kind) {
  const labels = {
    project: 'AI绘画',
    model3d: '3D作品',
    report: '创作报告',
    video: '动态视频',
  }
  return labels[kind] || '作品'
}
function getSourceProject(projectId) {
  return projectStore.projects.find((project) => project.id === projectId) || projectStore.currentProject || projectStore.draft
}
function normalizePortfolioRatio(value, kind = 'project') {
  const ratio = String(value || '').trim()
  if (['1:1', '4:3', '3:4', '16:9', '9:16'].includes(ratio)) return ratio
  const fallback = {
    project: '4:3',
    model3d: '1:1',
    report: '16:9',
    video: '9:16',
  }
  return fallback[kind] || '4:3'
}
function getPortfolioImageUrl(cover = '') {
  const value = String(cover || '')
  if (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/')) return value
  const match = value.match(/url\(["']?([^"')]+)["']?\)/)
  return match?.[1] || ''
}
function getPortfolioArtworkStyle(item) {
  const style = {
    background: item?.cover || fallbackCover,
  }
  const imageUrl = getPortfolioImageUrl(item?.cover)
  if (imageUrl) {
    style.background = `url("${imageUrl}") center / cover no-repeat #f8fafc`
  }
  return style
}
function getPortfolioDetailArtworkStyle(item) {
  const ratio = normalizePortfolioRatio(item?.ratio, item?.kind).replace(':', ' / ')
  const style = {
    aspectRatio: ratio,
    background: item?.cover || fallbackCover,
    '--portfolio-artwork-scale': portfolioArtworkScale.value,
  }
  const imageUrl = getPortfolioImageUrl(item?.cover)
  if (imageUrl) {
    style.background = `url("${imageUrl}") center / contain no-repeat #f8fafc`
  }
  return style
}
function getPortfolioRatioClass(item) {
  const ratio = normalizePortfolioRatio(item?.ratio, item?.kind)
  if (['9:16', '3:4'].includes(ratio)) return 'is-vertical'
  if (ratio === '1:1') return 'is-square'
  return 'is-wide'
}
function getPortfolioDescription(item) {
  if (!item) return '暂无作品说明。'
  if (item.kind === 'project') return item.prompt || item.description || '暂无提示词内容。'
  return item.description || item.prompt || '暂无作品说明。'
}
function openPortfolioDetail(item) {
  portfolioDialog.item = item
  portfolioArtworkScale.value = 1
  portfolioDialog.open = true
}
/**
 * 卡片点击分流：批量模式下点击 = 勾选/取消勾选，普通模式下才打开详情弹窗。
 * 与独立页同一套语义，避免「点一下既勾选又弹窗」。
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
function galleryMessageStatus(status) { return galleryStatusLabels[status] || '审核提醒' }
function changePortfolioArtworkScale(delta) {
  const next = Math.round((portfolioArtworkScale.value + delta) * 10) / 10
  portfolioArtworkScale.value = Math.min(5, Math.max(0.2, next))
}
function openPortfolioItem(item) {
  if (item.kind === 'model3d') openModel(item.projectId, item.id)
  else if (item.kind === 'video') openVideo(item.projectId)
  else if (item.kind === 'report') openReport(item.projectId)
  else openProject(item.projectId)
}
function goCanvasEdit(item) {
  projectStore.openProject(item.projectId)
  portfolioDialog.open = false
  router.push('/student/canvas')
}
function importReference(item) {
  // 与 /student/portfolio 保持一致：封面可能是 CSS background / 渐变占位，
  // 必须抽出真实图片地址，且不继承源项目提示词（否则绘画页一进来就带着一堆自动文案）。
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
function reeditArtwork(item) {
  const source = getSourceProject(item.projectId)
  const preview = extractImageUrl(item.cover) || extractImageUrl(source?.cover)
  projectStore.startNewProject(difficultyStore.current)
  projectStore.setCurrentProject({
    ...(projectStore.currentProject || {}),
    title: `${item.title} 重新编辑`,
    theme: item.title,
    prompt: source?.prompt || `根据《${item.title}》继续生成一版新的AI绘画作品`,
    cover: preview || item.cover || source?.cover || '',
    referenceImages: preview
      ? [{
        id: `ref-reedit-${Date.now()}`,
        name: item.title || '参考图',
        source: 'portfolio',
        preview,
        edited: false,
        createdAt: new Date().toISOString(),
      }]
      : [],
  })
  portfolioDialog.open = false
  router.push('/student/paint')
}
function modifyArtwork(item) {
  portfolioDialog.open = false
  if (item.kind === 'project') {
    const source = projectStore.projects.find((project) => project.id === item.projectId)
    const versionId = item.versionId || source?.finalVersionId || source?.versions?.[0]?.id
    if (!versionId) return ElMessage.warning('该作品没有可编辑的图片版本。')
    projectStore.openProject(item.projectId)
    router.push({ path: '/student/paint', query: { projectId: item.projectId, versionId, edit: '1' } })
    return
  }
  openPortfolioItem(item)
}
function openGalleryDetail(item) {
  galleryDialog.item = item
  galleryDialog.open = true
}
function likeGalleryWork(item) {
  galleryStore.like(item.id)
}
function openGalleryCourse(item) {
  galleryDialog.open = false
  router.push({ path: '/student/courses', query: { course: item.course } })
}
async function refreshGallery(showMessage = true) {
  galleryLoading.value = true; galleryError.value = ''
  try { await galleryStore.loadServerWorks(false, galleryCategory.value); galleryPage.value = 1; if (showMessage) ElMessage.success('已刷新审核通过作品') }
  catch (error) { galleryError.value = error.response?.data?.message || '作品加载失败，请点击刷新重试。' }
  finally { galleryLoading.value = false }
}
async function handleGalleryScroll(event) {
  const target = event.target
  if (!galleryHasMore.value || galleryLoading.value || target.scrollTop + target.clientHeight < target.scrollHeight - 32) return
  galleryLoading.value = true
  try { if (galleryStore.serverMode && galleryStore.works.length < galleryStore.publicTotal) await galleryStore.loadServerWorks(true, galleryCategory.value); galleryPage.value += 1 }
  catch { galleryError.value = '更多作品加载失败，请刷新重试。' }
  finally { galleryLoading.value = false }
}
function generateSame(item) {
  const project = projectStore.startNewProject(difficultyStore.current)
  projectStore.setCurrentProject({
    ...(projectStore.currentProject || project),
    title: `${item.title} 同款创作`,
    prompt: item.prompt,
    theme: item.title,
    cover: item.cover,
  })
  router.push('/student/paint')
}
function formatDate(value) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
async function deleteProject(projectId) {
  try {
    await ElMessageBox.confirm('删除后会进入本地回收站，7天内可恢复。确定删除这个项目吗？', '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  projectStore.deleteProject(projectId)
  ElMessage.success('项目已移入回收站')
}
async function deleteItem(item) {
  if (item.kind === 'report') {
    await confirmAndRun('确定删除这份创作报告吗？原绘画项目会保留。', () => projectStore.deleteReport(item.projectId, item.id), '报告已删除')
    return
  }
  if (item.kind === 'video') {
    await confirmAndRun('确定删除这个AI动态视频吗？原绘画项目会保留。', () => projectStore.deleteVideo(item.projectId, item.id), '视频已删除')
    return
  }
  if (item.kind === 'model3d') {
    await confirmAndRun('确定删除这个3D作品吗？原绘画项目会保留。', () => projectStore.deleteModel3D(item.projectId, item.id), '3D作品已删除')
    return
  }
  deleteProject(item.projectId)
}
async function confirmAndRun(message, action, success) {
  try {
    await ElMessageBox.confirm(message, '删除确认', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' })
  } catch {
    return
  }
  action()
  ElMessage.success(success)
}
function logout() {
  userStore.logout()
  router.push('/login')
}
// 顶栏：≤900px 次要按钮收进「更多」（CSS 控制）；≤600px 连消息中心、个人中心也收进去（菜单项按这个开关显示）
const compactNav = ref(false)
let compactNavQuery = null
function syncCompactNav() {
  compactNav.value = Boolean(compactNavQuery?.matches)
}
onMounted(() => {
  compactNavQuery = window.matchMedia?.('(max-width: 600px)') || null
  syncCompactNav()
  compactNavQuery?.addEventListener?.('change', syncCompactNav)
})
onUnmounted(() => compactNavQuery?.removeEventListener?.('change', syncCompactNav))
function onNavMore(command) {
  if (command === 'messages') messageDialog.open = true
  else if (command === 'profile') router.push('/profile')
  else if (command === 'prompts') router.push('/student/prompts')
  else if (command === 'client') openClientDownload()
  else if (command === 'logout') logout()
}
// 「客户端」按钮：直接打开安卓安装包下载页（public/install.html）
function openClientDownload() {
  window.open('/install.html', '_blank')
}
</script>

<style scoped lang="scss">
.workbench {
  width: min(100%, 1280px);
  height: 100vh;
  max-height: 100vh;
  margin: 0 auto;
  padding: 12px 18px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

/* ===== 全屏动态背景 =====
   视频盖住整个视口（含 padding 区域），内容一律抬到它上面。
   ⚠️ 视频必须 muted 才能自动播放：带声音的视频浏览器一律拒绝 autoplay，
   不静音就会停在第一帧，看着像「没生效」。 */
.workbench-bg {
  /* fixed 而不是 absolute：.workbench 本身限宽 1280px 居中，用 absolute 只能在中间那块铺开，
     宽屏两侧会露出灰底。fixed 永远对齐视口，才是「撑满整个屏幕」。 */
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--color-bg);
}
/* 视频放不出来时退回静态底图，绝不留下灰底。
   具体图片地址由 :style 的内联 background-image 给（后台可换），这里只负责怎么铺。 */
.workbench-bg.is-fallback {
  background-color: var(--color-bg);
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
.workbench-bg__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  /* 原片 1280×720 铺到 1440 以上会放大 1.5 倍左右，稍微锐化一点抵掉发虚 */
  filter: saturate(1.04) contrast(1.02);
}
.workbench-bg__veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* 只有后台选择「用回原视频」时才盖这两团柔雾（当年客户确认过的方案）；默认的动态光影和后台自己上传的背景都不盖。 */
.workbench-bg.is-legacy-video .workbench-bg__veil {
  /* 原片带「豆包 AI 生成」水印，10 秒一轮只出现两个位置（逐帧量过，别再靠猜）：
     - 整片都在：右下角。原片 x=996~1232 / y=600~643
     - 5~7 秒：左上角，还更清楚。原片 x=52~136 / y=43~76
     原片 1280×720 在 1440×900 里 object-fit:cover = 放大 1.25 倍、抹掉左右各 64 原像素。
     所以左上角那处折算到屏幕是「距左 65px、距顶 54px、离顶部大约 110px」——
     根本不是贴着屏幕角，这就是第一版遮罩（`at 8% 7%`）完全没盖住它的原因。
     ⚠️ 尺寸必须写 `ellipse + 百分比`：`circle` 不认百分比半径，会退化成 farthest-corner，
        在 16:10 屏上算出的半径只有 170px 左右，盖不住被放大后往内推的水印。
     ⚠️ 左上角这块雾要往「右上」甩、不能只压顶部：水印离左 65px 但离顶 54px，
        如果雾只盖顶边条，字的下半截会露在雾外面。
     ⚠️ 右下角那团雾的浓芯要落在水印上（`at 100% 86%` ≈ y774，正好压住 y750~804 的文字），
        不能贴 `100% 100%`：那样最浓处掉到屏幕最底边，字卡在最淡的外圈（第一版就是这样漏的）。 */
  background:
    /* 左上角水印（5~7 秒） */
    radial-gradient(ellipse 34% 26% at 2% 6%,
      rgba(249, 248, 255, .99) 0,
      rgba(249, 248, 255, .98) 44%,
      rgba(249, 248, 255, .9) 70%,
      rgba(249, 248, 255, .55) 89%,
      transparent 100%),
    /* 右下角水印（全程常驻，块头更大） */
    radial-gradient(ellipse 40% 32% at 100% 86%,
      rgba(249, 248, 255, .99) 0,
      rgba(249, 248, 255, .98) 46%,
      rgba(249, 248, 255, .92) 72%,
      rgba(249, 248, 255, .6) 90%,
      transparent 100%);
}

/* 所有内容压在背景视频之上 */
.workbench > :not(.workbench-bg) {
  position: relative;
  z-index: 1;
}

.topbar {
  /* 这一页不要「导航条卡片」：姓名与右侧按钮直接浮在页面背景上，只占一条 58px 的呼吸区。
     高度仍保留 58px，避免和别的页面切换时上下跳动。 */
  height: 58px;
  flex: 0 0 58px;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 2;
}
.student-id { display: flex; align-items: center; gap: 14px; }
.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 900;
}
.student-id strong { color: var(--color-title); }
.student-id p { margin: 3px 0 0; color: var(--color-muted); }
nav { display: flex; gap: 10px; }
.legacy-profile-menu { display: none; }
nav button,
.mini-card button,
.refresh-btn,
.batch-btn,
.comment-input button {
  min-height: 48px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: var(--color-primary-soft);
  color: var(--color-text);
  cursor: pointer;
  font-weight: 900;
}
/* 顶部是「纯文字悬浮」：四个难度共用这一页，全部去掉胶囊底和描边，只留字。
   悬停/键盘聚焦时补一层淡底，保证还能看出是可点的按钮。 */
.topbar nav button {
  background: none;
  box-shadow: none;
  transition: background 160ms ease;
}
.topbar nav button:hover,
.topbar nav button:focus-visible {
  background: rgba(255, 255, 255, .72);
}
.quick-board {
  flex: 0 0 170px;
  display: grid;
  grid-template-columns: minmax(168px, 1.05fr) repeat(5, minmax(120px, 1fr));
  gap: 12px;
  align-items: stretch;
  min-height: 0;
}
.mini-stack { display: grid; grid-template-rows: 1fr 1fr; gap: 10px; min-height: 0; }
.mini-card,
.main-feature,
.works-board {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: var(--shadow-card);
}
.mini-card {
  min-height: 0;
  padding: 10px;
}
.progress-card {
  display: grid;
  grid-template-columns: 1fr 58px;
  gap: 8px;
  align-items: center;
}
.mini-copy span,
.gallery-meta p,
.project-card p { color: var(--color-muted); }
.mini-copy strong,
.course-entry strong,
.main-feature strong {
  display: block;
  color: var(--color-title);
  font-weight: 900;
}
.mini-copy p,
.course-entry p,
.main-feature p {
  margin: 4px 0 0;
  color: var(--color-text);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.progress-ring {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: conic-gradient(var(--color-primary) var(--progress), #f3f4f6 0);
}
.progress-ring b {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #fff;
  display: grid;
  place-items: center;
  color: var(--color-primary);
  font-size: 12px;
}
.progress-card button { grid-column: 1 / -1; }
.course-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.mini-icon,
.main-feature span {
  display: grid;
  place-items: center;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 900;
}
.mini-icon { width: 48px; height: 48px; border-radius: 14px; flex: 0 0 auto; }
.main-feature {
  min-height: 0;
  height: 100%;
  padding: 14px;
  text-align: left;
  cursor: pointer;
  transition: transform 220ms ease, box-shadow 220ms ease;
}
.main-feature:hover { transform: translateY(-2px); box-shadow: var(--shadow-soft); }
.main-feature span {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  margin-bottom: 16px;
}
.main-feature strong { font-size: 18px; }
.paint-feature { border-color: rgba(255,122,0,.32); background: linear-gradient(135deg, #fff7ed, #fff); }
.video-feature { border-color: #d8ccff; background: linear-gradient(135deg, #f3efff, #fff); }
.model-feature { border-color: #bbf7d0; background: linear-gradient(135deg, #ecfdf5, #fff); }
.report-feature { border-color: #fed7aa; background: linear-gradient(135deg, #fff7ed, #fffaf0); }
.works-board {
  flex: 1 1 auto;
  min-height: 0;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
}
.tabs-bar {
  /* pro 主题给 .works-board 加了 backdrop-filter（自成层叠上下文），
     批量下拉菜单必须靠这里的 z-index 抬到滚动区之上，否则被素材卡片盖住。 */
  position: relative;
  z-index: 30;
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}
.tabs-bar > button {
  flex: 1 1 180px;
  min-height: 48px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #fff;
  color: var(--color-title);
  cursor: pointer;
  font-weight: 900;
}
.tabs-bar > button.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.portfolio-filter {
  margin-left: auto;
  display: flex;
  gap: 10px;
  align-items: center;
}
.refresh-btn {
  margin-left: auto;
  flex: 0 0 36px !important;
  width: 36px;
  min-height: 36px !important;
  height: 36px;
  padding: 0 !important;
  border-radius: 8px !important;
  display: inline-grid;
  place-items: center;
}
.refresh-btn :deep(.el-icon) { font-size: 18px; }
.gallery-course-filter { width: 180px; flex: 0 0 auto; }
/* 授权设置收成齿轮图标：原来是「一行文字 + 开关 + 一句未授权长提示」，全摊在标签栏里，
   既挤压分类也把标签栏顶高一截，改成点开才看。 */
.consent-entry {
  flex: 0 0 36px;
  width: 36px;
  min-height: 36px;
  padding: 0;
  border: 1px solid var(--color-border-soft, rgba(111, 126, 214, .2));
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--color-surface, #fff);
  color: var(--color-text-soft, #6b76b4);
  font-size: 17px;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}
.consent-entry:hover { color: var(--color-primary, #5263cb); border-color: rgba(111, 126, 214, .45); }
.consent-entry.is-opted { background: var(--color-primary-soft, #eef0ff); color: var(--color-primary, #5263cb); border-color: rgba(89, 106, 228, .32); }
.works-scroll {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 122, 0, .72) rgba(255, 243, 230, .9);
}
.works-scroll::-webkit-scrollbar {
  width: 10px;
}
.works-scroll::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(255, 243, 230, .9);
}
.works-scroll::-webkit-scrollbar-thumb {
  border: 2px solid rgba(255, 243, 230, .9);
  border-radius: 999px;
  background: rgba(255, 122, 0, .72);
}
.works-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 122, 0, .95);
}
.gallery-grid,
.project-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.gallery-card,
.project-card {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 10px;
  background: #fff;
}
.gallery-card {
  position: relative;
  min-height: 236px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(15, 23, 42, .06);
}
.work-cover {
  height: 110px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}
.gallery-card .work-cover {
  position: absolute;
  inset: 0;
  height: auto;
  border-radius: 0;
}
.gallery-card .work-cover::after {
  content: '';
  position: absolute;
  inset: 38% 0 0;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0), rgba(15, 23, 42, .72));
}
.work-cover span {
  width: 50px;
  height: 50px;
  border-radius: 16px;
  background: rgba(255,255,255,.86);
  display: grid;
  place-items: center;
  font-size: 24px;
  font-weight: 900;
  color: var(--color-primary);
}
.gallery-card .work-cover span {
  opacity: .92;
  transform: translateY(-12px);
}
.gallery-overlay {
  position: absolute;
  inset: auto 0 0;
  min-height: 54px;
  padding: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
  z-index: 1;
}
.gallery-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.like-chip,
.same-icon-btn {
  min-height: 32px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .88);
  color: #ff7a00;
  display: inline-grid;
  place-items: center;
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 6px 14px rgba(15, 23, 42, .12);
}
.like-chip {
  min-width: 54px;
  padding: 0 10px;
  border: 0;
  cursor: pointer;
}
.same-icon-btn {
  width: 34px;
  border: 0;
  cursor: pointer;
}
.project-card h3 {
  display: block;
  margin: 10px 0 5px;
  color: var(--color-title);
  font-size: 16px;
}
.gallery-meta p,
.project-card p {
  margin: 0 0 10px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gallery-meta p {
  margin: 0;
  color: rgba(255, 255, 255, .84);
  font-size: 12px;
  -webkit-line-clamp: 1;
  text-shadow: 0 2px 8px rgba(15, 23, 42, .32);
}
.gallery-meta strong {
  display: block;
  margin-bottom: 4px;
  color: #fff;
  font-size: 14px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 2px 8px rgba(15, 23, 42, .32);
}
.source-chip {
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #fef3c7;
  color: #92400e;
  font-size: 11px;
  font-weight: 900;
}
.load-more {
  min-height: 44px;
  display: grid;
  place-items: center;
  color: var(--color-muted);
  font-weight: 900;
}
.portfolio-cover-grid { align-items: start; }
.portfolio-cover-card {
  position: relative;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}
.portfolio-cover .portfolio-published-star {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 24px;
  height: 24px;
  display: inline-grid;
  place-items: center;
  color: #f59e0b;
  font-size: 20px;
  line-height: 1;
  opacity: 1;
}
.portfolio-cover-card:hover,
.portfolio-cover-card:focus-visible {
  transform: translateY(-2px);
  border-color: rgba(255, 122, 0, .45);
  box-shadow: var(--shadow-soft);
  outline: none;
}
/* 批量态：取消位移反馈（整片网格抖动会让人误判），改由描边 + 勾选框表达选中 */
.portfolio-cover-card.is-batch { cursor: default; }
.portfolio-cover-card.is-batch:hover,
.portfolio-cover-card.is-batch:focus-visible {
  transform: none;
  border-color: var(--color-border);
  box-shadow: none;
}
.portfolio-cover-card.is-batch:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.portfolio-cover-card.is-picked {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(255, 122, 0, .2);
}
.portfolio-cover-card .portfolio-select-box {
  position: absolute;
  z-index: 3;
  top: 8px;
  left: 8px;
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, .92);
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(28, 36, 84, .32);
  color: #fff;
  font-size: 14px;
  backdrop-filter: blur(6px);
  transition: background 160ms ease, border-color 160ms ease;
}
.portfolio-cover-card .portfolio-select-box.checked {
  border-color: #fff;
  background: var(--color-primary);
}
/* 勾选框占住左上角，批量态把「已上架」星标右移让位 */
.portfolio-cover-card.is-batch .portfolio-published-star { left: 40px; }
/* 卡片右上角「三个点」菜单：卡片内边距小，贴紧一点更协调 */
.portfolio-cover-card .portfolio-item-menu { top: 6px; right: 6px; }
.portfolio-cover {
  position: relative;
  height: 176px;
  min-height: 0;
  overflow: hidden;
  align-content: center;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.portfolio-cover::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 46%;
  background: linear-gradient(180deg, rgba(17, 24, 39, 0), rgba(17, 24, 39, .66));
}
.portfolio-cover-info {
  position: absolute;
  z-index: 2;
  left: 12px;
  right: 12px;
  bottom: 10px;
  color: #fff;
}
.portfolio-cover-info strong {
  display: block;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.portfolio-cover-info p {
  margin: 3px 0 0;
  color: rgba(255, 255, 255, .78);
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.portfolio-empty {
  min-height: 220px;
  border: 1px dashed rgba(255, 122, 0, .34);
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: var(--color-muted);
  font-weight: 900;
  background: #fffaf5;
}
.gallery-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: center; }
.detail-cover {
  min-height: 320px;
  border-radius: 18px;
  display: grid;
  place-items: center;
}
.detail-cover span { font-size: 54px; font-weight: 900; color: #fff; }
.detail-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.gallery-detail-meta {
  margin: 16px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.gallery-detail-meta span {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #f8fafc;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 800;
}
.portfolio-detail {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(220px, 3fr);
  gap: 20px;
  align-items: center;
}
.portfolio-detail-media-stage {
  position: relative;
  min-height: 360px;
  max-height: min(64vh, 560px);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #f8fafc;
}
.portfolio-zoom-controls {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  display: inline-flex;
  gap: 8px;
}
.portfolio-zoom-controls button {
  width: 42px;
  height: 42px;
  border: 1px solid rgba(255, 122, 0, .26);
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  background: rgba(255, 255, 255, .92);
  color: var(--color-primary);
  box-shadow: 0 10px 22px rgba(15, 23, 42, .12);
  cursor: pointer;
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
}
.portfolio-zoom-controls button:hover:not(:disabled),
.portfolio-zoom-controls button:focus-visible {
  transform: translateY(-1px);
  background: #fff7ed;
  border-color: rgba(255, 122, 0, .46);
  outline: none;
}
.portfolio-zoom-controls button:disabled {
  opacity: .46;
  cursor: not-allowed;
  box-shadow: none;
}
.portfolio-zoom-controls :deep(.el-icon) {
  font-size: 19px;
}
.portfolio-detail-artwork {
  max-width: 100%;
  max-height: min(64vh, 560px);
  border-radius: 18px;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0 18px 38px rgba(15, 23, 42, .12);
  transform: scale(var(--portfolio-artwork-scale, 1));
  transform-origin: center;
  transition: transform 180ms ease, box-shadow 180ms ease;
}
.portfolio-detail-artwork.is-wide {
  width: min(100%, 680px);
}
.portfolio-detail-artwork.is-square {
  width: min(100%, 520px);
}
.portfolio-detail-artwork.is-vertical {
  width: min(100%, 330px);
}
.portfolio-detail-main {
  border: 1px solid var(--color-border);
  border-radius: 18px;
  padding: 18px;
  background: #fffaf5;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  min-height: 360px;
  max-height: min(64vh, 560px);
}
.portfolio-detail-type {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  border-radius: 999px;
  padding: 0 12px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 900;
}
.portfolio-detail-main h2 {
  margin: 14px 0 8px;
  color: var(--color-title);
  font-size: 22px;
  line-height: 1.2;
}
.portfolio-detail-main > div:first-child > p {
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.5;
}
.portfolio-detail-prompt {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 190px;
  border-radius: 16px;
  padding: 14px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}
.portfolio-detail-prompt span {
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 900;
}
.portfolio-detail-prompt p {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.65;
  overflow-y: auto;
  white-space: pre-wrap;
}
.portfolio-detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.portfolio-detail-actions :deep(.base-button) { min-height: 48px; }
.submission-form {
  display: grid;
  gap: 18px;
}
.submission-form > label:not(.el-checkbox) { display: grid; gap: 8px; }
.submission-form > label:not(.el-checkbox) > span { color: var(--color-title); font-weight: 900; }
.submission-form > p { margin: 0; color: var(--color-muted); line-height: 1.6; }
.message-list { display: grid; gap: 10px; }
.message-item {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}
.message-item strong { color: var(--color-title); }
.message-item p { margin: 6px 0 0; color: var(--color-muted); line-height: 1.5; }
.message-item > span {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #fee2e2;
  color: #991b1b;
  font-size: 12px;
  font-weight: 800;
}
.message-empty { padding: 38px 0; text-align: center; color: var(--color-muted); }
.comment-box {
  margin: 14px 0;
  border-radius: 14px;
  padding: 12px;
  background: #f8fafc;
  display: grid;
  gap: 8px;
}
.comment-box strong { color: var(--color-title); }
.comment-box p { margin: 0; color: var(--color-text); }
.comment-input {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.comment-input input {
  min-height: 48px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 0 12px;
}
.tab-fade-enter-active,
.tab-fade-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.tab-fade-enter-from,
.tab-fade-leave-to { opacity: 0; transform: translateY(6px); }
@media (max-width: 1180px) {
  .workbench { padding: 12px; }
  .quick-board {
    flex-basis: 160px;
    grid-template-columns: minmax(150px, 1.05fr) repeat(4, minmax(116px, 1fr));
    gap: 10px;
  }
  .gallery-grid,
  .project-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .work-cover { height: 100px; }
  .portfolio-cover { height: 154px; min-height: 0; }
  .main-feature { padding: 12px; }
  .main-feature strong { font-size: 16px; }
  .main-feature span { margin-bottom: 12px; }
}
@media (max-width: 980px) {
  .workbench { height: auto; max-height: none; min-height: 100dvh; overflow: visible; padding: 12px; }
  .quick-board { flex-basis: auto; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gallery-grid, .project-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 680px) {
  .workbench { gap: 12px; padding: 10px; }
  .topbar { height: auto; min-height: 60px; padding: 10px 12px; align-items: flex-start; gap: 10px; }
  .student-id { min-width: 0; gap: 9px; }
  .student-id p { display: none; }
  nav { gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  nav button { min-height: 40px; padding: 0 10px; font-size: 12px; }
  .quick-board { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .mini-stack { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; grid-template-rows: auto; }
  .gallery-grid, .project-grid { grid-template-columns: 1fr; }
  .portfolio-detail-actions { justify-content: stretch; }
  .portfolio-detail-actions :deep(.base-button) { flex: 1 1 calc(50% - 6px); padding: 0 10px; }
  .comment-input { grid-template-columns: 1fr; }
}

/* 高级版用户工作台：复用现有模块与栅格，只更新科技艺术的色彩、层次和作品展示。 */
.workbench.mode-pro.student-visual-theme {
  --work-ink: #25346e;
  --work-line: rgba(113, 128, 205, .2);
  --work-violet: #7c7ff0;
  background:
    radial-gradient(circle at 64% -10%, rgba(185, 196, 255, .45), transparent 28%),
    linear-gradient(135deg, #f8f5f4, #f3f6ff 52%, #fbf8f5);
  width: min(100%, 1440px);
}
.workbench.mode-pro .topbar,
.workbench.mode-pro .mini-card,
.workbench.mode-pro .main-feature,
.workbench.mode-pro .works-board {
  border-color: var(--work-line);
  background-color: rgba(255,255,255,.78);
  box-shadow: 0 12px 28px rgba(70, 82, 157, .09), inset 0 1px rgba(255,255,255,.92);
  backdrop-filter: blur(14px);
}
.workbench.mode-pro .topbar {
  /* 用户要求这一页不要导航条底：文字直接悬浮，所以这里也不给玻璃底和阴影。 */
  min-height: 58px;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  background-image: none;
  box-shadow: none;
  backdrop-filter: none;
}
.workbench.mode-pro .topbar nav { gap: 8px; }
.workbench.mode-pro .topbar nav button { min-height: 42px; padding: 0 15px; }
.workbench.mode-pro .student-id strong,
.workbench.mode-pro .mini-copy strong,
.workbench.mode-pro .course-entry strong,
.workbench.mode-pro .main-feature strong,
.workbench.mode-pro .tabs-bar > button { color: var(--work-ink); }
.workbench.mode-pro .avatar {
  background: linear-gradient(145deg, #ff8b39, #ff6f2f);
  box-shadow: 0 8px 18px rgba(250, 121, 50, .22);
}
.workbench.mode-pro nav button,
.workbench.mode-pro .mini-card button {
  background: rgba(255,255,255,.62);
  color: #43549f;
  box-shadow: inset 0 0 0 1px rgba(114, 127, 203, .14);
}
/* 这一页顶部是「纯文字悬浮」：去掉胶囊白底和描边，只留字。
   悬停/键盘聚焦时给一层淡底，保证能看出可点。 */
.workbench.mode-pro .topbar nav button {
  background: none;
  box-shadow: none;
  color: #3c4b96;
  font-weight: 800;
  transition: background 160ms ease, color 160ms ease;
}
.workbench.mode-pro .topbar nav button:hover,
.workbench.mode-pro .topbar nav button:focus-visible {
  background: rgba(255, 255, 255, .66);
  color: #2b3a86;
}
.workbench.mode-pro .mini-icon,
.workbench.mode-pro .main-feature span {
  border: 1px solid rgba(117, 129, 220, .2);
  background: rgba(244, 242, 255, .85);
  color: #6871db;
}
.workbench.mode-pro .progress-ring { background: conic-gradient(#ff812f var(--progress), #f3f0fa 0); }
.workbench.mode-pro .progress-ring b { color: #f07020; }
.workbench.mode-pro .paint-feature { background-image: linear-gradient(135deg, rgba(255,248,240,.94), rgba(255,255,255,.72)), url('/assets/student-theme/login-aya-artist-v1.png'); background-size: cover; background-position: 8% 72%; }
.workbench.mode-pro .video-feature { background-image: linear-gradient(135deg, rgba(246,243,255,.94), rgba(255,255,255,.72)), url('/assets/student-theme/paint-generation-canvas-v1.png'); background-size: cover; background-position: 65% 70%; }
.workbench.mode-pro .model-feature { background: linear-gradient(135deg, #eefbf8, #f8fffd); }
.workbench.mode-pro .report-feature { background: linear-gradient(135deg, #fff5f0, #fffdfb); }
.workbench.mode-pro .tabs-bar > button { border-color: var(--work-line); background: rgba(255,255,255,.58); }
.workbench.mode-pro .tabs-bar > button.active { border-color: transparent; background: linear-gradient(100deg, #7376e8, #aa92f2); color: #fff; box-shadow: 0 9px 18px rgba(118, 112, 226, .2); }
.workbench.mode-pro .refresh-btn { background: rgba(255,255,255,.68); color: #5968c5; }
.workbench.mode-pro .gallery-card { border-color: rgba(132, 144, 210, .16); box-shadow: 0 12px 24px rgba(54, 64, 130, .12); }
.workbench.mode-pro .gallery-card:hover { transform: translateY(-3px); box-shadow: 0 18px 34px rgba(54, 64, 130, .2); }
.workbench.mode-pro .gallery-card .work-cover::after { background: linear-gradient(180deg, rgba(20, 27, 74, 0), rgba(22, 29, 77, .76)); }
.workbench.mode-pro .work-cover span { background: rgba(255,255,255,.8); color: #6572dc; }
.workbench.mode-pro .like-chip { color: #f1763b; }
.workbench.mode-pro .works-scroll { scrollbar-color: rgba(124,127,240,.65) rgba(242,240,250,.8); }
.workbench.mode-pro .works-scroll::-webkit-scrollbar-track { background: rgba(242,240,250,.8); }
.workbench.mode-pro .works-scroll::-webkit-scrollbar-thumb { border-color: rgba(242,240,250,.8); background: rgba(124,127,240,.65); }
/* 顶栏里唯一带底色的按钮：AI 伙伴入口（全局都能问、能画、能做视频）。 */
.workbench.student-visual-theme .topbar nav button.partner-entry {
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 6px 16px rgba(108, 92, 231, .28);
}
.workbench.student-visual-theme .topbar nav button.partner-entry:hover,
.workbench.student-visual-theme .topbar nav button.partner-entry:focus-visible {
  background: var(--color-primary-hover);
  color: #fff;
}
/* 平铺网格：背景只做氛围，整体再压一层浅色，图块和文字更清楚（简约）。轮播模式不压，让动态背景透出来。 */
.workbench.student-visual-theme.is-home-grid .workbench-bg__veil::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(246, 247, 251, .58);
}

/* ===== 首页：轮播 / 平铺 两套样式 ===== */
.student-home {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.home-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-height: 40px;
}
/* 平铺网格自己限宽 1240px、左右留 24px，工具条跟它对齐 */
.student-home.is-grid .home-toolbar { width: min(1240px, 100%); margin: 0 auto; padding: 0 24px; }
.home-scan {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(25, 179, 148, .3);
  border-radius: 999px;
  background: rgba(255, 255, 255, .84);
  color: #0f8f72;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 6px 16px rgba(25, 179, 148, .12);
  backdrop-filter: blur(12px);
  cursor: pointer;
}
.home-scan .el-icon { font-size: 18px; }
.layout-switch {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(123, 136, 211, .22);
  border-radius: 999px;
  background: rgba(255, 255, 255, .72);
  box-shadow: 0 6px 16px rgba(63, 76, 156, .08);
  backdrop-filter: blur(12px);
}
.layout-switch button {
  min-height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: #5967b3;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.layout-switch button.active { background: #fff; color: var(--color-primary); box-shadow: 0 2px 8px rgba(63, 76, 156, .14); }
.home-scan:focus-visible,
.layout-switch button:focus-visible { outline: 3px solid rgba(108, 92, 231, .35); outline-offset: 2px; }
/* ≤980px 整页改成可上下滚动（.workbench 高度变 auto）：轮播必须给一个确定的高度，
   否则舞台只按最小高度算，底部的「进入」按钮和圆点会压到卡片上。 */
@media (max-width: 980px) {
  /* 一直铺到屏幕底（竖屏平板不再在下面空一条）；矮屏至少 620px，整页上下滚动 */
  .student-home.is-orbit .pro-orbit { flex: none; height: min(1100px, max(620px, calc(100dvh - 144px))); }
}
/* 手机横屏（高 ≤ 520px）：620px 的轮播要往下滚才看得到「进入」按钮——改成正好一屏（轮播组件里按钮和圆点会并成一行） */
@media (max-width: 980px) and (max-height: 520px) and (orientation: landscape) {
  .student-home.is-orbit .pro-orbit { height: max(240px, calc(100dvh - 144px)); }
}
@media (max-width: 680px) {
  .student-home.is-orbit .pro-orbit { height: auto; }
  .student-home.is-grid .home-toolbar { padding: 0 12px; }
}

/* ===== 内置背景「动态光影」=====
   原创背景，代替以前那段带「豆包 AI 生成」标识的视频：浅紫底 + 三团缓慢漂移的柔光 + 两道流光弧线 + 地面光环 + 闪烁的小光点。
   只动 transform / opacity / 描边偏移，不用模糊滤镜，低配平板也不卡；系统要求减少动态效果时全部静止。 */
.ambient-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 50% at 50% 104%, rgba(255, 255, 255, .85), transparent 70%),
    linear-gradient(180deg, #e9e4ff 0%, #f0ecff 40%, #f6f3ff 64%, #edeefe 100%);
}
.ambient-bg__blob { position: absolute; border-radius: 50%; will-change: transform; }
.ambient-bg__blob--a {
  left: -18vmax;
  top: -24vmax;
  width: 64vmax;
  height: 64vmax;
  background: radial-gradient(circle, rgba(170, 150, 255, .5), rgba(170, 150, 255, 0) 68%);
  animation: ambient-drift-a 26s ease-in-out infinite alternate;
}
.ambient-bg__blob--b {
  right: -20vmax;
  top: 2vmax;
  width: 58vmax;
  height: 58vmax;
  background: radial-gradient(circle, rgba(150, 196, 255, .46), rgba(150, 196, 255, 0) 68%);
  animation: ambient-drift-b 32s ease-in-out infinite alternate;
}
.ambient-bg__blob--c {
  left: 20vmax;
  bottom: -30vmax;
  width: 52vmax;
  height: 52vmax;
  background: radial-gradient(circle, rgba(255, 190, 212, .4), rgba(255, 190, 212, 0) 68%);
  animation: ambient-drift-c 38s ease-in-out infinite alternate;
}
.ambient-bg__lines { position: absolute; inset: 0; width: 100%; height: 100%; }
.ambient-bg__arc { fill: none; stroke: rgba(255, 255, 255, .6); stroke-width: 1.5; }
.ambient-bg__arc--b { stroke: rgba(176, 164, 255, .42); }
/* 流光：一小段亮线沿弧线跑（描边虚线 + 偏移动画），外面再叠一条粗而淡的同步线当光晕 */
.ambient-bg__streak {
  fill: none;
  stroke: rgba(255, 255, 255, .95);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 150 1850;
  animation: ambient-streak 11s linear infinite;
}
.ambient-bg__streak--glow { stroke: rgba(255, 255, 255, .35); stroke-width: 9; }
.ambient-bg__streak--b { animation-duration: 14s; animation-delay: -6s; }
.ambient-bg__ring { fill: none; stroke: rgba(132, 120, 240, .26); stroke-width: 1.5; }
.ambient-bg__ring--inner { stroke: rgba(255, 255, 255, .65); }
.ambient-bg__ring--spin {
  stroke: rgba(255, 255, 255, .95);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 160 2660;
  animation: ambient-ring 16s linear infinite;
}
.ambient-bg__dot {
  position: absolute;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 8px 2px rgba(255, 255, 255, .85);
  opacity: .2;
  animation: ambient-twinkle 6s ease-in-out infinite;
}
@keyframes ambient-drift-a { to { transform: translate3d(8vmax, 6vmax, 0) scale(1.12); } }
@keyframes ambient-drift-b { to { transform: translate3d(-10vmax, 8vmax, 0) scale(.92); } }
@keyframes ambient-drift-c { to { transform: translate3d(-6vmax, -8vmax, 0) scale(1.1); } }
@keyframes ambient-streak { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }
@keyframes ambient-ring { from { stroke-dashoffset: 2820; } to { stroke-dashoffset: 0; } }
@keyframes ambient-twinkle {
  0%, 100% { opacity: .15; transform: translateY(0); }
  50% { opacity: .9; transform: translateY(-12px); }
}
@media (prefers-reduced-motion: reduce) {
  .ambient-bg__blob,
  .ambient-bg__streak,
  .ambient-bg__ring--spin,
  .ambient-bg__dot { animation: none; }
  .ambient-bg__streak { opacity: 0; }
}
/* 顶栏响应式：宽屏全部平铺；≤900px 次要按钮收进「更多」；≤600px 只留「AI 伙伴」和「更多」，名字单行省略。 */
.nav-more { display: none; }
.student-id > div { min-width: 0; }
.student-id strong { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
@media (max-width: 900px) {
  .workbench.student-visual-theme .topbar nav .nav-wide { display: none; }
  .workbench.student-visual-theme .topbar nav .nav-more { display: inline-flex; }
}
@media (max-width: 600px) {
  .workbench.student-visual-theme .topbar { align-items: center; flex-wrap: nowrap; min-height: 56px; padding: 6px 4px; }
  .workbench.student-visual-theme .topbar nav { flex-wrap: nowrap; gap: 6px; }
  .workbench.student-visual-theme .topbar nav .nav-mid { display: none; }
  .workbench.student-visual-theme .topbar nav button { min-height: 42px; padding: 0 14px; font-size: 14px; }
  .student-id strong { max-width: 40vw; }
}
</style>
