// 学生工作台外观配置（卡片图 / 背景 / LOGO）
//
// 为什么单独一个文件：这些配置改的是「学生打开工作台第一眼看到的东西」，
// 一旦写坏，学生端会白屏或点不到卡片。所以读写都走这里，统一做归一化兜底：
// 读不到文件、字段缺失、ID 不认识，一律退回内置默认值，绝不让前端拿到半个配置。
//
// 卡片只能改「图 + 显示/隐藏 + 构图位置」，不能新增：
// 每张卡背后绑死一个学生端路由（见 StudentWorkbench.vue 的 enterProWorkbenchItem），
// 凭空加一张卡没有页面可去，点开就是空白页。要做新功能必须单独开发页面。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

// 顺序即学生端卡片顺序，新增功能页时在这里补一行。
export const WORKBENCH_CARD_IDS = ['courses', 'paint', 'sketchpad', 'video', 'canvas', 'model3d', 'gallery', 'portfolio', 'reports']

export const WORKBENCH_CARD_TITLES = {
  courses: '课程选择',
  paint: 'AI绘画',
  sketchpad: '手绘板',
  video: 'AI视频',
  canvas: '无限画布',
  model3d: 'AI 3D',
  gallery: '作品广场',
  portfolio: '我的素材库',
  reports: '项目报告',
}

// 换图后主体被裁掉了怎么办：给后台一个「往哪边偏」的选项，不用重做图。
export const WORKBENCH_IMAGE_POSITIONS = {
  center: '居中',
  left: '偏左',
  right: '偏右',
  top: '偏上',
  bottom: '偏下',
}

const POSITION_CSS = {
  center: '50% 50%',
  left: '28% 50%',
  right: '72% 50%',
  top: '50% 28%',
  bottom: '50% 72%',
}

export function workbenchPositionCss(value) {
  return POSITION_CSS[value] || POSITION_CSS.center
}

export function workbenchConfigPath(dataDir) {
  return join(dataDir, 'workbench-config.json')
}

export function workbenchAssetDir(dataDir) {
  return join(dataDir, 'workbench-assets')
}

// 只允许「工作台资源」这个前缀的站内地址，防止后台把卡片图填成任意外链（外链一失效卡片就空）。
const ALLOWED_ASSET_PREFIX = '/api/workbench-assets/'
const ALLOWED_STATIC_PREFIX = '/assets/'

function safeText(value = '', max = 120) {
  return String(value || '').trim().slice(0, max)
}

function safeAssetUrl(value = '') {
  const text = safeText(value, 400)
  if (!text) return ''
  if (!text.startsWith(ALLOWED_ASSET_PREFIX) && !text.startsWith(ALLOWED_STATIC_PREFIX)) return ''
  // 站内地址里不允许出现协议头/上级目录，避免拼出越权路径。
  if (/[\\]|\.\.|:\/\//.test(text)) return ''
  return text
}

export function defaultWorkbenchConfig() {
  return {
    version: 1,
    updatedAt: '',
    brand: { logoUrl: '' },
    background: { imageUrl: '', videoUrl: '' },
    // imageUrl 为空 = 用代码里内置的那张图（画廊/素材库两张还会自动取最新作品封面），
    // 所以「后台什么都没配」和「以前的样子」完全一致，不会因为上线这个功能突然变脸。
    cards: WORKBENCH_CARD_IDS.map((id) => ({
      id,
      title: WORKBENCH_CARD_TITLES[id],
      imageUrl: '',
      position: 'center',
      visible: true,
    })),
  }
}

export function normalizeWorkbenchConfig(raw) {
  const base = defaultWorkbenchConfig()
  const source = raw && typeof raw === 'object' ? raw : {}
  const sourceCards = Array.isArray(source.cards) ? source.cards : []
  const byId = new Map()
  sourceCards.forEach((card) => {
    const id = safeText(card?.id, 40)
    if (!WORKBENCH_CARD_IDS.includes(id)) return
    byId.set(id, card)
  })

  return {
    version: 1,
    updatedAt: safeText(source.updatedAt, 40),
    brand: {
      logoUrl: safeAssetUrl(source.brand?.logoUrl),
    },
    background: {
      imageUrl: safeAssetUrl(source.background?.imageUrl),
      videoUrl: safeAssetUrl(source.background?.videoUrl),
    },
    // 顺序永远是内置顺序：这一版后台不提供拖动排序，避免学生端顺序与代码里的路由表错位。
    cards: base.cards.map((card) => {
      const saved = byId.get(card.id)
      if (!saved) return card
      const position = Object.prototype.hasOwnProperty.call(WORKBENCH_IMAGE_POSITIONS, saved.position) ? saved.position : 'center'
      return {
        id: card.id,
        title: card.title,
        imageUrl: safeAssetUrl(saved.imageUrl),
        position,
        visible: saved.visible !== false,
      }
    }),
  }
}

export function readWorkbenchConfig(dataDir) {
  try {
    const filePath = workbenchConfigPath(dataDir)
    if (!existsSync(filePath)) return defaultWorkbenchConfig()
    return normalizeWorkbenchConfig(JSON.parse(readFileSync(filePath, 'utf8')))
  } catch {
    // 配置坏了不是致命错误：学生端照旧显示内置卡片，比白屏好。
    return defaultWorkbenchConfig()
  }
}

export function writeWorkbenchConfig(dataDir, raw) {
  const normalized = normalizeWorkbenchConfig({ ...raw, updatedAt: new Date().toISOString() })
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(workbenchConfigPath(dataDir), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

// 文件名一律「前缀-时间戳-随机串.扩展名」，只能由服务端生成，不接受前端传名字。
const ASSET_FILE_PATTERN = /^(card|bg|logo)-\d+-[a-z0-9]{8,16}\.(webp|png|jpg|mp4)$/

export function workbenchAssetPath(dataDir, fileName) {
  const safeName = basename(String(fileName || ''))
  if (safeName !== fileName || !ASSET_FILE_PATTERN.test(safeName)) return ''
  return join(workbenchAssetDir(dataDir), safeName)
}
