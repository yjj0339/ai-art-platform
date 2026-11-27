// 用户工作台内置外观（唯一真源）
//
// 为什么单独一份：后台「工作台管理」面板要给用户展示「现在长什么样」，
// 用户端要真的渲染。两处各写一份的话，改一张图就会变成「后台看到 A、用户看到 B」，
// 而且很难查。所以图片地址只写在这里，两边都从这里取。
//
// 注意：这里只是「内置兜底」。后台配了图就以配置为准，这里不参与。

// 卡片顺序 = 用户端轨道顺序。新增功能页时，这里和后端 WORKBENCH_CARD_IDS 同步加一行。
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

// 每张卡绑定一个用户端路由，所以「卡」不能新增，只能换图/隐藏。
export const WORKBENCH_CARD_ORDER = ['courses', 'paint', 'sketchpad', 'video', 'canvas', 'model3d', 'gallery', 'portfolio', 'reports']

// 卡面内置图。gallery / portfolio 两张在用户端会优先取最新作品封面，
// 这里给的是「一件作品都没有」时显示的兜底图。
//
// v2（当前）：原创矢量插画，每张直接画出功能本身，版式和客户在后台上传的「AI绘画」海报卡一致
//   （左上角大标题 + 一行说明）。重新生成：scripts/make-card-art.mjs
//   - WORKBENCH_BUILTIN_CARD_IMAGES：海报版（带标题，3:4，1080×1440 高清），首页轮播和后台预览用；
//   - WORKBENCH_BUILTIN_CARD_OBJECTS：只有物件、背景透明、按物件边界裁好的版本，平铺网格用。
//     网格图块是横的（约 1.7:1，竖屏平板主卡甚至 5:1），把 3:4 竖图 cover 进去必然裁掉主体、还会放大发虚
//     （用户反馈「图片和方框错位、内容显示不全」就是这个）。物件图整张 contain 进图块，任何比例都完整、不拉伸，
//     图块底色用下面同一套配色画渐变，看起来还是同一张卡。
// v1（cards/*-v1.webp）文件保留，想回退把下面的 -v2 改回 -v1 即可。
// 🔴 海报图一律是 3:4 竖版，不要直接引用原始横版素材：cover 居中裁切会裁掉主体（踩过）。
const card = (id, suffix) => `/assets/student-theme/cards/${id}-${suffix}.webp`
export const WORKBENCH_BUILTIN_CARD_IMAGES = {
  courses: card('courses', 'v2'),
  paint: card('paint', 'v2'),
  sketchpad: card('sketchpad', 'v2'),
  video: card('video', 'v2'),
  canvas: card('canvas', 'v2'),
  model3d: card('model3d', 'v2'),
  gallery: card('gallery', 'v2'),
  portfolio: card('portfolio', 'v2'),
  reports: card('reports', 'v2'),
}
export const WORKBENCH_BUILTIN_CARD_OBJECTS = Object.fromEntries(
  Object.keys(WORKBENCH_BUILTIN_CARD_IMAGES).map((id) => [id, card(id, 'v2-obj')]),
)

// 每张卡的配色 [上方浅色, 下方颜色, 点缀色]：卡面插画的底（scripts/make-card-art.mjs 直接读这里）
// 和平铺图块的底色渐变共用一份，改一处两边一起变。
export const WORKBENCH_CARD_TINTS = {
  paint: ['#ffe4d4', '#e5dbff', '#ff9f80'],
  sketchpad: ['#d6f7ea', '#d4e4ff', '#7fd8be'],
  video: ['#ffdaea', '#dad3ff', '#ff8cc6'],
  canvas: ['#fff3c6', '#ffe0d4', '#ffb36b'],
  model3d: ['#d6ecff', '#dcd4ff', '#7aa8ff'],
  courses: ['#daf6e3', '#d2edf7', '#69db9b'],
  gallery: ['#ffe0e7', '#ffe8cc', '#ff9fb2'],
  portfolio: ['#eadcff', '#d6e4ff', '#9b8cff'],
  reports: ['#d2f4f0', '#dce2ff', '#66d9c9'],
}

// 一句话说明：首页轮播下方的「进入」按钮旁、平铺网格图块里都用这一份。
export const WORKBENCH_CARD_DESCRIPTIONS = {
  courses: '跟着课程一步步学',
  paint: '说出想法或上传草图，AI 帮你画出来',
  sketchpad: '在平板上自由画画',
  video: '让你的画动起来',
  canvas: '把灵感摆满一整面墙',
  model3d: '把平面的画变成 3D 模型',
  gallery: '看看大家的优秀作品',
  portfolio: '我画过的、做过的都在这里',
  reports: '把创作过程做成报告',
}

// 内置构图：图已经是按主体位置裁好的 3:4，所以一律居中。
// 只有在后台换了横版图、又不想丢主体时，才需要在这里或后台面板调「构图位置」。
export const WORKBENCH_BUILTIN_CARD_POSITIONS = {
  courses: 'center',
  paint: 'center',
  sketchpad: 'center',
  video: 'center',
  canvas: 'center',
  model3d: 'center',
  gallery: 'center',
  portfolio: 'center',
  reports: 'center',
}

// 后台只能选这 5 个方向：够用，又不会让人面对一堆百分比发懵。
export const WORKBENCH_POSITION_OPTIONS = [
  { value: 'center', label: '居中', css: '50% 50%' },
  { value: 'left', label: '偏左', css: '28% 50%' },
  { value: 'right', label: '偏右', css: '72% 50%' },
  { value: 'top', label: '偏上', css: '50% 28%' },
  { value: 'bottom', label: '偏下', css: '50% 72%' },
]

const POSITION_CSS = Object.fromEntries(WORKBENCH_POSITION_OPTIONS.map((item) => [item.value, item.css]))

export function workbenchPositionCss(value) {
  return POSITION_CSS[value] || POSITION_CSS.center
}

// 背景：后台没配视频/图片时，用户端显示代码画的「动态光影」（StudentWorkbench.vue 里的 .ambient-bg），
// 不再默认播视频 —— 原视频是豆包生成的，片里带「豆包 AI 生成」标识，以前靠柔雾遮住；
// 按《人工智能生成合成内容标识办法》不应删除或隐匿这类标识，所以默认改用原创背景。
// 原视频和它的静态底图仍保留，后台「工作台管理 → 背景」可一键用回（用回时沿用当年客户确认过的柔雾样式）。
export const WORKBENCH_LEGACY_BG_IMAGE = '/assets/student-theme/orbit-stage-bg-v2.png'
export const WORKBENCH_LEGACY_BG_VIDEO = '/assets/student-theme/orbit-stage-loop-v1.mp4'

// 卡片图统一 3:4 竖版：后台按这个比例压，用户端就不再二次裁切，
// 做到「后台看到什么，用户就看到什么」。
export const WORKBENCH_CARD_RATIO_HINT = '3:4（建议 720×960）'
