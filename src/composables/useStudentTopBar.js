// 用户端共用顶栏（StudentTopBar）的「页面自定义」入口。
//
// 1) 自定义标题 / 返回目标
//    顶栏默认按路由显示页面名（和主页卡片同名、同色）、「主页」键回主页。个别页面需要更具体的名字或返回别处
//    （例如 AI 玩法页显示玩法名、返回它所在的 AI 绘画 / AI 视频页），在页面里调用：
//      const topBar = useStudentTopBar()
//      topBar.set({ title: '星空水彩', subtitle: '第 3 课', back: { to: '/student/paint', label: '返回' } })
//    离开页面（路由变化）后自动失效，不需要页面自己清。
//
// 2) 页面自己的操作按钮（保存、导出…）想放进顶栏，用 Teleport：
//      <Teleport to="#su-topbar-actions" defer> <button class="su-btn su-btn--sm">保存</button> </Teleport>
//
// 3) 离开前检查（未保存提醒、离开前自动存进素材库…）：
//      useLeaveGuard(async (to) => { …; return true /* 允许离开 */ | false /* 留下 */ })
//    顶栏「主页」、AI 伙伴、头像菜单里的跳转都会经过它；「退出登录」也会先问它，用户选「留下」就不退出。
import { onBeforeUnmount, reactive } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const state = reactive({ title: '', subtitle: '', path: '', back: null })

// 部署在子路径（例如 /ai-art-platform/）时，地址栏路径带前缀，而 route.path 不带；比较前先去掉。
function stripBase(pathname) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname
}

export function useStudentTopBar() {
  return {
    state,
    // back: { to: '/student/paint', label: '返回' } 跳路由；或 { action: fn, label: '课程列表' } 由页面自己处理（例如回到列表视图）
    set({ title = '', subtitle = '', back = null, path = '' } = {}) {
      state.title = title
      state.subtitle = subtitle
      state.back = back && (back.to || typeof back.action === 'function')
        ? { to: back.to || '', label: back.label || '返回', action: typeof back.action === 'function' ? back.action : null }
        : null
      state.path = path || (typeof window !== 'undefined' ? stripBase(window.location.pathname) : '')
    },
    reset() {
      state.title = ''
      state.subtitle = ''
      state.back = null
      state.path = ''
    },
  }
}

let leaveCheck = null
let bypassOnce = false

export function useLeaveGuard(check) {
  leaveCheck = check
  onBeforeRouteLeave(async (to) => {
    if (bypassOnce) {
      bypassOnce = false
      return true
    }
    return (await check(to)) !== false
  })
  onBeforeUnmount(() => {
    if (leaveCheck === check) leaveCheck = null
  })
}

// 顶栏「退出登录」用：先让当前页面做离开前检查；通过后这一次跳转不再重复检查
export async function confirmLeave(to) {
  if (!leaveCheck) return true
  const ok = (await leaveCheck(to)) !== false
  if (ok) bypassOnce = true
  return ok
}

export function clearLeaveBypass() {
  bypassOnce = false
}
