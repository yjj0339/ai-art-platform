<template>
  <!-- 用户端共用顶栏：除主页、登录页、公开报告页外，所有小画家页面 + 个人中心都显示同一条顶栏，
       保证每一页都能一键回主页、右上角永远是同样的头像菜单（客户定：AI 伙伴点页面左下角的形象，消息回主页看）。 -->
  <StudentTopBar v-if="showTopBar" />
  <RouterView />
  <LandscapeNotice />
</template>

<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import LandscapeNotice from './components/LandscapeNotice.vue'
import StudentTopBar from './components/student/StudentTopBar.vue'
import { useUserStore } from './stores/userStore'

const route = useRoute()
const userStore = useUserStore()
const NO_TOPBAR = new Set(['student-workbench', 'login', 'public-h5-report'])

const showTopBar = computed(() => {
  if (!userStore.user || route.meta?.public) return false
  const name = String(route.name || '')
  if (!name || NO_TOPBAR.has(name)) return false
  return route.path.startsWith('/student/') || name === 'profile-center'
})

// 页面用 calc(100dvh - var(--app-top)) 算剩余高度；顶栏不显示时 --app-top 为 0
watchEffect(() => {
  document.documentElement.classList.toggle('has-su-topbar', showTopBar.value)
})
</script>
