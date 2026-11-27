import { defineStore } from 'pinia'
import { apiClient } from '../services/apiClient'

const STORAGE_KEY = 'art-studio-user'
const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    token: '',
    // 登出进行中：阻止路由守卫的 restoreSession 在后端会话注销完成前把用户重新写回
    sessionClearing: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.user && (SERVER_AUTH_MODE || state.token)),
  },
  actions: {
    async restoreSession() {
      // 登出流程中不恢复会话：此时本地已清空但后端会话尚未注销，
      // 继续调 /auth/me 会把用户写回，导致跳转 /login 又被重定向回角色首页。
      if (this.sessionClearing) return
      if (this.user && (SERVER_AUTH_MODE || this.token)) return
      if (SERVER_AUTH_MODE) {
        try {
          // 会话恢复发生在全局路由守卫中，必须短超时，避免后端停止时所有页面像无法点击。
          const { data } = await apiClient.get('/auth/me', { timeout: 8000 })
          this.user = data.user || null
          this.token = ''
        } catch {
          this.user = null
          this.token = ''
        }
        return
      }

      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      try {
        const session = JSON.parse(raw)
        this.user = session.user
        this.token = session.token
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    },
    async login({ account, password, organizationCode, difficulty, role = 'student' }) {
      if (SERVER_AUTH_MODE) {
        const { data } = await apiClient.post('/auth/login', { account, password, organizationCode }, { timeout: 15000 })
        this.user = { ...data.user, difficulty: data.user.role === 'student' ? difficulty : '' }
        this.token = ''
        localStorage.removeItem(STORAGE_KEY)
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
      const roleMeta = {
        student: { id: 'stu-001', name: account || '小画家阿橙', className: 'AI创意美术A班', avatar: '艺' },
        teacher: { id: 'tea-001', name: account || '王讲师', className: 'AI创意美术教研组', avatar: '师' },
        admin: { id: 'adm-001', name: account || '管理员', className: '机构管理中心', avatar: '管' },
      }
      const meta = roleMeta[role] || roleMeta.student
      this.user = {
        id: meta.id,
        name: meta.name,
        role,
        className: meta.className,
        avatar: meta.avatar,
        difficulty,
      }
      this.token = 'mock-token-project-new-art-studio'
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: this.user, token: this.token }))
    },
    async logout() {
      const serverMode = SERVER_AUTH_MODE
      // 同步清空本地登录态并置「登出中」标志：调用方不 await 就 router.push('/login')，
      // 路由守卫会立即调 restoreSession；若此时后端会话尚未注销，它会把用户重新写回原页面。
      this.sessionClearing = true
      this.user = null
      this.token = ''
      localStorage.removeItem(STORAGE_KEY)
      try {
        if (!serverMode) return
        try {
          const [{ useProjectStore }, { useAccountPermissionStore }, { useGalleryStore }, { useCourseStore }] = await Promise.all([
            import('./projectStore'), import('./accountPermissionStore'), import('./galleryStore'), import('./courseStore'),
          ])
          const projectStore = useProjectStore()
          useGalleryStore().$reset()
          await projectStore.flushServerWrites()
          projectStore.clearSessionData()
          useAccountPermissionStore().clearServerData()
          useCourseStore().clearServerData()
        } catch {
          // Store cleanup is best-effort; the authenticated server session is still revoked below.
        }
        try {
          await apiClient.post('/auth/logout')
        } catch {
          // 网络异常也必须清除本机登录态，避免前端继续显示受保护内容。
        }
        window.dispatchEvent(new CustomEvent('art-studio-session-cleared'))
      } finally {
        // 服务端注销结束后解除标志，避免影响后续正常登录
        this.sessionClearing = false
      }
    },
  },
})
