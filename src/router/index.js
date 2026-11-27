import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/userStore'
import { useAccountPermissionStore } from '../stores/accountPermissionStore'
import { useProjectStore } from '../stores/projectStore'

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/h5-report/public/:token', name: 'public-h5-report', component: () => import('../views/PublicH5Report.vue'), meta: { public: true } },
  { path: '/profile', name: 'profile-center', component: () => import('../views/ProfileCenter.vue') },
  { path: '/student/workbench', name: 'student-workbench', component: () => import('../views/StudentWorkbench.vue'), meta: { roles: ['student'], permissionKey: 'studentAccess' } },
  { path: '/student/partner', name: 'student-partner', component: () => import('../views/AgentPartner.vue'), meta: { roles: ['student'], permissionKey: 'aiCreate' } },
  { path: '/student/prompts', name: 'student-prompts', component: () => import('../views/PromptLibrary.vue'), meta: { roles: ['student'], permissionKey: 'studentAccess' } },
  { path: '/student/paint', name: 'student-paint', component: () => import('../views/PaintStudio.vue'), meta: { roles: ['student'], permissionKey: 'aiCreate', landscapeWorkspace: true } },
  { path: '/student/video', name: 'student-video', component: () => import('../views/VideoGenerate.vue'), meta: { roles: ['student'], permissionKey: 'aiCreate', landscapeWorkspace: true } },
  { path: '/student/model3d', name: 'student-model3d', component: () => import('../views/Model3DGenerate.vue'), meta: { roles: ['student'], permissionKey: 'aiCreate', landscapeWorkspace: true } },
  // 旧入口统一转到新画布，保留链接兼容性，避免用户误进入旧版工作流画布。
  { path: '/student/canvas', name: 'student-canvas', component: () => import('../views/CanvasStudio.vue'), meta: { roles: ['student'], permissionKey: 'aiCreate', landscapeWorkspace: true } },
  // AI 创作台（即「手绘板」）：左边真画（11 笔刷 + 图层 + 填充 + 吸管 + 套索），
  // 右边真出图，结果可插回画纸，保存进素材库（type=sketch）。
  { path: '/student/board', name: 'student-board', component: () => import('../views/PaintBoard.vue'), meta: { roles: ['student'], permissionKey: 'studentAccess', landscapeWorkspace: true } },
  // 旧手绘板地址只做跳转，老链接 / 用户书签不会 404。
  { path: '/student/sketchpad', name: 'student-sketchpad', redirect: '/student/board', meta: { roles: ['student'], permissionKey: 'studentAccess' } },
  { path: '/student/skills/:skillId', name: 'student-skill-runner', component: () => import('../views/StudentSkillRunner.vue'), meta: { roles: ['student'], permissionKey: 'aiCreate', landscapeWorkspace: true } },
  { path: '/student/reports', name: 'student-reports', component: () => import('../views/ReportOverview.vue'), meta: { roles: ['student'], permissionKey: 'reports' } },
  { path: '/student/h5-report', name: 'student-h5-report', component: () => import('../views/H5ReportGenerate.vue'), meta: { roles: ['student'], permissionKey: 'reports', landscapeWorkspace: true } },
  { path: '/student/h5-report/preview', name: 'student-h5-report-preview', component: () => import('../views/AdvancedH5Preview.vue'), meta: { roles: ['student'], permissionKey: 'reports', landscapeWorkspace: true } },
  { path: '/student/report', name: 'student-report', redirect: (to) => ({ path: '/student/h5-report', query: to.query }), meta: { roles: ['student'], permissionKey: 'reports' } },
  { path: '/student/courses', name: 'student-courses', component: () => import('../views/CourseCenter.vue'), meta: { roles: ['student'], permissionKey: 'courses' } },
  { path: '/student/gallery', name: 'student-gallery', component: () => import('../views/GalleryView.vue'), meta: { roles: ['student'], permissionKey: 'studentAccess' } },
  { path: '/student/portfolio', name: 'student-portfolio', component: () => import('../views/StudentPortfolio.vue'), meta: { roles: ['student'], permissionKey: 'studentAccess' } },
  { path: '/teacher', redirect: '/teacher/workbench' },
  { path: '/teacher/workbench', name: 'teacher-workbench', component: () => import('../views/TeacherWorkbench.vue'), meta: { roles: ['teacher'], permissionKey: 'teacherAccess' } },
  { path: '/admin', name: 'admin-dashboard', component: () => import('../views/AdminDashboard.vue'), meta: { roles: ['admin'], permissionKey: 'adminAccess' } },
  // H5 报告中心保留独立地址，避免后台同页切换被路由守卫或旧查询参数阻断。
  { path: '/admin/h5-reports', name: 'admin-h5-reports', component: () => import('../views/AdminDashboard.vue'), meta: { roles: ['admin'], permissionKey: 'adminAccess' } },
  // 方案 2 报告工作流库：后台按风格管理工作流，与用户端选择面板一一对应。
  { path: '/admin/h5-report-workflows', name: 'admin-h5-report-workflows', component: () => import('../views/AdminDashboard.vue'), meta: { roles: ['admin'], permissionKey: 'adminAccess' } },
  { path: '/admin/ai-skills/:skillId/workflow', name: 'admin-ai-skill-workflow', component: () => import('../views/AdminAiSkillWorkflowPage.vue'), meta: { roles: ['admin'], permissionKey: 'adminAccess', landscapeWorkspace: true } },
  { path: '/admin/ai-skills/:skillId/student-page', name: 'admin-ai-skill-student-page', component: () => import('../views/AdminAiSkillStudentPage.vue'), meta: { roles: ['admin'], permissionKey: 'adminAccess', landscapeWorkspace: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const userStore = useUserStore()
  const accountPermissionStore = useAccountPermissionStore()
  await userStore.restoreSession()
  if (!to.meta.public && !userStore.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/login' && userStore.isLoggedIn) {
    const homeMap = {
      student: '/student/workbench',
      teacher: '/teacher/workbench',
      admin: '/admin',
    }
    return homeMap[userStore.user?.role] || '/student/workbench'
  }
  if (SERVER_AUTH_MODE && userStore.user?.role === 'student') {
    await useProjectStore().hydrateFromServer()
  }
  if (SERVER_AUTH_MODE && userStore.user?.role === 'admin' && to.path.startsWith('/admin')) {
    // 权限接口不可用或响应较慢时不能阻塞后台页面导航；页面进入后再异步同步数据。
    accountPermissionStore.loadAdminData().catch((error) => {
      console.warn('[admin] permission data unavailable after navigation', error)
    })
  }
  if (!to.meta.public && !accountPermissionStore.canAccessRoute(userStore.user, to)) {
    return accountPermissionStore.roleHome(userStore.user?.role)
  }
  return true
})

export default router
