<template>
  <!-- 用户端共用顶栏：所有功能页（主页除外）都是这一条，高度、位置、按钮完全一致。
       左：返回主页 + 当前页面名（名字和颜色跟主页卡片一致）；中：页面自己的操作（Teleport 进 #su-topbar-actions）；
       右：头像菜单（个人中心 / 素材库 / 提示词库 / 客户端 / 退出登录）。
       客户定：顶栏不放「AI 伙伴」和消息——AI 伙伴点页面左下角的形象，消息回主页看。 -->
  <header class="su-topbar">
    <div class="su-topbar__lead">
      <button class="su-topbar__back" type="button" :aria-label="back.label" @click="goBack">
        <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
        <span>{{ back.label }}</span>
      </button>
      <span class="su-topbar__sep" aria-hidden="true" />
      <div class="su-topbar__title">
        <span class="su-topbar__tile" :style="tileStyle" aria-hidden="true">
          <el-icon><component :is="info.icon" /></el-icon>
        </span>
        <div>
          <strong>{{ title }}</strong>
          <small v-if="subtitle">{{ subtitle }}</small>
        </div>
      </div>
    </div>

    <div id="su-topbar-actions" class="su-topbar__actions" />

    <nav class="su-topbar__tools" aria-label="常用功能">
      <el-dropdown trigger="click" placement="bottom-end" popper-class="su-pop su-me-pop" @command="onMenu">
        <button class="su-topbar__me" type="button" :aria-label="`${displayName}的菜单`">
          <span class="su-topbar__avatar" aria-hidden="true">{{ avatarText }}</span>
          <span class="su-topbar__me-name">{{ displayName }}</span>
          <el-icon class="su-topbar__caret" aria-hidden="true"><ArrowDown /></el-icon>
        </button>
        <template #dropdown>
          <div class="su-me-card">
            <span class="su-topbar__avatar su-topbar__avatar--lg" aria-hidden="true">{{ avatarText }}</span>
            <div>
              <strong>{{ displayName }}</strong>
              <small>{{ meLine }}</small>
            </div>
          </div>
          <el-dropdown-menu>
            <el-dropdown-item command="home" :icon="HomeFilled">{{ isStudent ? '回到主页' : '回到工作台' }}</el-dropdown-item>
            <el-dropdown-item v-if="route.name !== 'profile-center'" command="profile" :icon="User">个人中心</el-dropdown-item>
            <el-dropdown-item v-if="isStudent && route.name !== 'student-portfolio'" command="portfolio" :icon="Collection">我的素材库</el-dropdown-item>
            <el-dropdown-item v-if="isStudent && route.name !== 'student-prompts'" command="prompts" :icon="Memo">提示词库</el-dropdown-item>
            <el-dropdown-item v-if="isStudent" command="client" :icon="Download">安装客户端</el-dropdown-item>
            <el-dropdown-item command="logout" :icon="SwitchButton" divided>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </nav>
  </header>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown, ArrowLeft, Box, ChatDotRound, Collection, Document, Download, EditPen, Grid, HomeFilled,
  MagicStick, Memo, Picture, Reading, Star, SwitchButton, Tickets, User, VideoCamera, View,
} from '@element-plus/icons-vue'
import { useUserStore } from '../../stores/userStore'
import { useDifficultyStore } from '../../stores/difficultyStore'
import { useAccountPermissionStore } from '../../stores/accountPermissionStore'
import { clearLeaveBypass, confirmLeave, useStudentTopBar } from '../../composables/useStudentTopBar'
import { getWorkbenchConfig } from '../../services/workbenchGateway'
import { WORKBENCH_CARD_TINTS, WORKBENCH_CARD_TITLES } from '../../utils/workbenchDefaults'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const difficultyStore = useDifficultyStore()
const permissionStore = useAccountPermissionStore()
const topBar = useStudentTopBar()

// card：对应主页哪张卡（名字、配色跟卡片走，后台改了卡片名这里也跟着变）；tint：没有对应卡片时借哪张卡的配色
const ROUTE_INFO = {
  'student-paint': { card: 'paint', icon: MagicStick },
  'student-board': { card: 'sketchpad', icon: EditPen },
  'student-video': { card: 'video', icon: VideoCamera },
  'student-canvas': { card: 'canvas', icon: Grid },
  'student-model3d': { card: 'model3d', icon: Box },
  'student-courses': { card: 'courses', icon: Reading },
  'student-gallery': { card: 'gallery', icon: Picture },
  'student-portfolio': { card: 'portfolio', icon: Collection },
  'student-reports': { card: 'reports', icon: Document },
  'student-h5-report': { title: 'H5 报告', tint: 'reports', icon: Tickets },
  'student-h5-report-preview': { title: '报告预览', tint: 'reports', icon: View, back: { to: '/student/h5-report', label: '返回报告' } },
  'student-partner': { title: 'AI 伙伴', tint: 'portfolio', icon: ChatDotRound },
  'student-prompts': { title: '提示词库', tint: 'gallery', icon: Memo },
  'student-skill-runner': { title: 'AI 玩法', tint: 'paint', icon: Star },
  'profile-center': { title: '个人中心', tint: 'portfolio', icon: User },
}
const FALLBACK_INFO = { title: '', tint: 'portfolio', icon: Star }

const info = computed(() => ROUTE_INFO[route.name] || FALLBACK_INFO)
const isStudent = computed(() => (userStore.user?.role || 'student') === 'student')

// 后台「工作台管理」里改过的卡片名（只拉一次；拿不到就用内置名字）
const savedCardTitles = ref({})
async function loadCardTitles() {
  const config = await getWorkbenchConfig()
  const map = {}
  for (const card of config?.cards || []) if (card?.id && card.title) map[card.id] = String(card.title)
  savedCardTitles.value = map
}

const title = computed(() => {
  if (topBar.state.title && topBar.state.path === route.path) return topBar.state.title
  const { card, title: fixed } = info.value
  if (card) return savedCardTitles.value[card] || WORKBENCH_CARD_TITLES[card] || ''
  return fixed || String(route.meta?.title || '')
})
const subtitle = computed(() => (topBar.state.path === route.path ? topBar.state.subtitle : ''))

const tileStyle = computed(() => {
  const key = info.value.card || info.value.tint || 'portfolio'
  const [a, b, c] = WORKBENCH_CARD_TINTS[key] || WORKBENCH_CARD_TINTS.portfolio
  return { background: `linear-gradient(140deg, ${a}, ${b})`, '--t2': c }
})

const homePath = computed(() => permissionStore.roleHome(userStore.user?.role || 'student'))
const back = computed(() => {
  if (topBar.state.back && topBar.state.path === route.path) return topBar.state.back
  return info.value.back || { to: homePath.value, label: isStudent.value ? '主页' : '工作台' }
})
function goBack() {
  if (typeof back.value.action === 'function') back.value.action()
  else router.push(back.value.to)
}

const displayName = computed(() => userStore.user?.name || userStore.user?.account || '小画家')
const avatarText = computed(() => {
  const avatar = String(userStore.user?.avatar || '').trim()
  // avatar 字段有的是单个字，有的是图片地址；图片地址不在这里显示，退回名字首字
  if (avatar && avatar.length <= 2) return avatar
  return displayName.value.trim().slice(0, 1) || '画'
})
const meLine = computed(() => {
  if (!isStudent.value) return userStore.user?.organization?.name || (userStore.user?.role === 'admin' ? '管理员' : '讲师')
  return [userStore.user?.className, difficultyStore.currentMeta?.label].filter(Boolean).join(' · ') || '小画家'
})

async function onMenu(command) {
  if (command === 'home') router.push(homePath.value)
  else if (command === 'profile') router.push('/profile')
  else if (command === 'portfolio') router.push('/student/portfolio')
  else if (command === 'prompts') router.push('/student/prompts')
  else if (command === 'client') window.open('/install.html', '_blank')
  else if (command === 'logout') {
    // 先让当前页面做离开前检查（未保存提醒等），用户选择留下就不退出
    if (!(await confirmLeave({ path: '/login', name: 'login' }))) return
    userStore.logout()
    router.push('/login').finally(clearLeaveBypass)
  }
}


onMounted(() => {
  loadCardTitles()
})
</script>

<style scoped lang="scss">
.su-topbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  box-sizing: border-box;
  height: var(--app-top);
  padding: env(safe-area-inset-top, 0px) clamp(10px, 2vw, 24px) 0;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid var(--su-line);
  -webkit-backdrop-filter: var(--su-blur);
  backdrop-filter: var(--su-blur);
  color: var(--su-ink);
}
.su-topbar__lead { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 0 1 auto; }
.su-topbar__back {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 42px;
  min-height: 42px;
  padding: 0 16px 0 12px;
  border: 1px solid var(--su-line-strong);
  border-radius: 999px;
  background: #fff;
  color: var(--su-ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s ease, color 0.15s ease, transform 0.12s ease;
}
.su-topbar__back .el-icon { font-size: 16px; }
.su-topbar__back:hover { border-color: rgba(108, 92, 231, 0.45); color: var(--su-accent); }
.su-topbar__back:active { transform: scale(0.97); }
.su-topbar__sep { width: 1px; height: 24px; background: var(--su-line-strong); flex: 0 0 auto; }
.su-topbar__title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.su-topbar__title > div { display: grid; gap: 1px; min-width: 0; }
.su-topbar__title strong {
  overflow: hidden;
  color: var(--su-ink);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.su-topbar__title small {
  overflow: hidden;
  color: var(--su-muted);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.su-topbar__tile {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 11px;
  display: grid;
  place-items: center;
  font-size: 18px;
  color: #4a4f73;
  color: color-mix(in oklab, var(--t2) 52%, #1f2340);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}

.su-topbar__actions {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}
.su-topbar__actions::-webkit-scrollbar { display: none; }

.su-topbar__tools { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
.su-topbar__me {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  min-height: 42px;
  padding: 0 10px 0 4px;
  border: 1px solid var(--su-line-strong);
  border-radius: 999px;
  background: #fff;
  color: var(--su-ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s ease;
}
.su-topbar__me:hover { border-color: rgba(108, 92, 231, 0.45); }
.su-topbar__me-name { max-width: 8em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.su-topbar__caret { font-size: 12px; color: var(--su-muted); }
.su-topbar__avatar {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, #ffb088, #ff7a59);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

@media (max-width: 1024px) {
  .su-topbar__me-name, .su-topbar__caret { display: none; }
  .su-topbar__me { padding: 0 4px; }
}
@media (max-width: 860px) {
  .su-topbar__title small { display: none; }
}
@media (max-width: 600px) {
  .su-topbar { gap: 8px; }
  .su-topbar__lead { gap: 8px; }
  .su-topbar__back { width: 40px; height: 40px; min-height: 40px; padding: 0; justify-content: center; }
  .su-topbar__back span { display: none; }
  .su-topbar__sep { display: none; }
  .su-topbar__tile { width: 32px; height: 32px; border-radius: 10px; font-size: 16px; }
  .su-topbar__title strong { font-size: 16px; }
  .su-topbar__tools { gap: 6px; }
  .su-topbar__me { height: 40px; min-height: 40px; }
}
</style>

<!-- 弹层（头像菜单等）被 Element Plus 挂到 body 上，scoped 样式管不到，单独写全局 -->
<style lang="scss">
.su-pop.el-popper {
  border: 1px solid var(--su-line) !important;
  border-radius: 18px !important;
  box-shadow: var(--su-shadow-pop) !important;
}
.su-pop.el-popover.el-popper { padding: 0 !important; }
.su-pop .el-popper__arrow { display: none; }

.su-me-pop .su-me-card { display: flex; align-items: center; gap: 12px; min-width: 220px; padding: 14px 16px 10px; }
.su-me-pop .su-me-card > div { display: grid; gap: 2px; min-width: 0; }
.su-me-pop .su-me-card strong { overflow: hidden; color: var(--su-ink); font-size: 15px; font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }
.su-me-pop .su-me-card small { overflow: hidden; color: var(--su-muted); font-size: 12.5px; white-space: nowrap; text-overflow: ellipsis; }
.su-me-pop .su-topbar__avatar--lg { width: 40px; height: 40px; font-size: 16px; }
.su-me-pop .el-dropdown-menu { padding: 4px 6px 6px; }
.su-me-pop .el-dropdown-menu__item { border-radius: 10px; color: var(--su-ink); font-weight: 500; }
.su-me-pop .el-dropdown-menu__item:not(.is-disabled):hover,
.su-me-pop .el-dropdown-menu__item:not(.is-disabled):focus { background: var(--su-accent-soft); color: var(--su-accent); }
.su-me-pop .el-dropdown-menu__item--divided { margin-top: 6px; }
</style>
