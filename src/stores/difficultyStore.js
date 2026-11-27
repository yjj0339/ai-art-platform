import { defineStore } from 'pinia'

const STORAGE_KEY = 'art-studio-difficulty'

// 级别只表达「操作复杂度」，与年龄无关：同一级别任何年龄段的人都能用。
// hint 写的是这个级别怎么操作，不要写年龄，否则会被读成按年龄分班。
// 2026-11 客户定：只保留两个版本（入门版 / 高级版），登录时选，进去以后不再切换。
export const difficultyList = [
  { id: 'starter', label: '入门版', hint: '会说话就能画 · 图标点选', icon: '🎨', summary: '语音描述与图标点选，零打字压力' },
  { id: 'pro', label: '高级版', hint: '完整参数 · 专业创作', icon: '💻', summary: '全参数面板，适合能自己写提示词的小画家' },
]

// 以前存下来的「初级版 / 进阶版」自动归到最接近的版本，老用户不会卡在已经下线的版本里。
const LEGACY_LEVELS = { junior: 'starter', advanced: 'pro' }
function normalizeLevel(value) {
  const level = LEGACY_LEVELS[value] || value
  return difficultyList.some((item) => item.id === level) ? level : 'starter'
}

export const useDifficultyStore = defineStore('difficulty', {
  state: () => ({
    current: normalizeLevel(localStorage.getItem(STORAGE_KEY)),
  }),
  getters: {
    currentMeta: (state) => difficultyList.find((item) => item.id === state.current) || difficultyList[0],
    isYoung: (state) => ['junior', 'starter'].includes(state.current),
  },
  actions: {
    setDifficulty(value) {
      this.current = normalizeLevel(value)
      localStorage.setItem(STORAGE_KEY, this.current)
    },
  },
})
