// 生成首页 9 张功能卡的内置封面（v2）：原创矢量插画 → 720×960 WebP。
//
// 为什么重画：v1 封面是从几张通用插画（刺猬、跑车、城堡、人物）里裁出来的，
// 跟功能没有关系 —— 卡片又是「纯图卡」（卡面不印字），小朋友只能靠图猜这张卡是干什么的。
// v2 每张图直接画出功能本身：调色盘 = AI 绘画、平板和笔 = 手绘板、播放器 = AI 视频……
// 版式跟客户自己在后台上传的「AI绘画」海报卡一致：左上角大标题 + 一行说明，下面是插画。
//
// 每张卡出两个版本：
//   <id>-v2.webp      海报版（带标题，3:4，按 1.5 倍出 1080×1440：平板/手机都是高分屏，720×960 会被放大发虚）
//   <id>-v2-obj.webp  物件版（只有插画物件和展台、背景透明、裁到物件边界）：平铺网格把它整张放进横向图块，
//                     任何比例都不裁切、不拉伸；图块底色用同一套配色（WORKBENCH_CARD_TINTS）画渐变。
// ⚠️ 标题是中文：用浏览器（Windows 微软雅黑）或装了 Noto Sans SC 的机器渲染，否则会出方块字。
//    卡片标题在后台不可改（server/workbench-config-store.js 固定用内置标题），所以把字画进图里是安全的。
//
// 全部是代码画的原创矢量图：没有用 AI 生图、没有第三方素材，不涉及版权和「AI 生成」标识问题。
// 运行：node scripts/make-card-art.mjs [--sheet <预览拼图.png>]
//       node scripts/make-card-art.mjs --svg <目录>   只输出 SVG 源文件（不需要 sharp，可用浏览器另行转 WebP；
//       物件版要按透明边界裁切，浏览器里画到 canvas 后扫 alpha 找边界即可）
// 输出：public/assets/student-theme/cards/<id>-v2.webp 和 <id>-v2-obj.webp（v1 文件保留，方便回退）
import fs from 'node:fs'
import path from 'node:path'
import { WORKBENCH_CARD_TINTS as TINTS } from '../src/utils/workbenchDefaults.js'

const W = 720
const H = 960
// 海报版输出倍数（viewBox 不变，只放大画布）
const POSTER_SCALE = 1.5
// 物件版先按 2 倍画，裁边后再缩到长边 OBJECT_MAX
const OBJECT_SCALE = 2
const OBJECT_MAX = 600
const OBJECT_BLEED = 260
const OUT_DIR = 'public/assets/student-theme/cards'
// 物件（含展台）整体放大倍数：卡片在首页轨道里只有 300px 左右宽，物件要够大才认得出
const STAGE_SCALE = 1.12
const FONT = "'Microsoft YaHei UI','Microsoft YaHei','PingFang SC','Noto Sans SC','Source Han Sans SC',sans-serif"
// 标题 = 内置卡片标题（src/utils/workbenchDefaults.js），说明 = 一句话告诉小朋友能做什么
const TEXT = {
  courses: ['课程选择', '跟着课程一步步学'],
  paint: ['AI绘画', '说出想法，AI 帮你画出来'],
  sketchpad: ['手绘板', '在平板上自由画画'],
  video: ['AI视频', '让你的画动起来'],
  canvas: ['无限画布', '把灵感摆满一整面墙'],
  model3d: ['AI 3D', '把平面的画变成 3D 模型'],
  gallery: ['作品广场', '看看大家的优秀作品'],
  portfolio: ['我的素材库', '画过的、做过的都在这里'],
  reports: ['项目报告', '把创作过程做成报告'],
}
// 把颜色往白色拉一点：卡片上半部分统一偏白，深蓝标题才清楚，也和客户那张海报卡的白紫底一致
function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c) => Math.round(c + (255 - c) * amount)
  return `#${[mix(n >> 16), mix((n >> 8) & 255), mix(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

const FILTERS = `
<filter id="blur40" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="40"/></filter>
<filter id="blur18" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="18"/></filter>
<filter id="blur6" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="drop" x="-40%" y="-40%" width="180%" height="190%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="14"/><feOffset dy="16" result="o"/>
  <feFlood flood-color="#3d2f8f" flood-opacity=".2"/><feComposite in2="o" operator="in"/>
  <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="dropSm" x="-40%" y="-40%" width="180%" height="190%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="6"/><feOffset dy="6" result="o"/>
  <feFlood flood-color="#3d2f8f" flood-opacity=".18"/><feComposite in2="o" operator="in"/>
  <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`

function card(build, { title = '', subtitle = '', objectOnly = false, scale = 1 } = {}) {
  const defs = []
  let seq = 0
  const stops = (list) => list.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')
  const g = {
    lin(list, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
      const id = `l${seq++}`
      defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`)
      return `url(#${id})`
    },
    rad(list, cx = 0.5, cy = 0.5, r = 0.5) {
      const id = `r${seq++}`
      defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(list)}</radialGradient>`)
      return `url(#${id})`
    },
    clip(shape) {
      const id = `c${seq++}`
      defs.push(`<clipPath id="${id}">${shape}</clipPath>`)
      return `url(#${id})`
    },
    pattern(xml, size) {
      const id = `p${seq++}`
      defs.push(`<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${xml}</pattern>`)
      return `url(#${id})`
    },
  }
  const [bg, art = ''] = build(g).split('<!--stage-->')
  // 海报版：插画整体下移给标题让位，略缩小；纯图版：插画居中放大
  const stage = title ? 'translate(360 575) scale(1.05) translate(-360 -480)' : `translate(360 480) scale(${STAGE_SCALE}) translate(-360 -480)`
  const text = title ? `
  <text x="56" y="150" font-family="${FONT}" font-size="84" font-weight="800" letter-spacing="2" fill="#1f2a6b">${title}</text>
  <text x="60" y="218" font-family="${FONT}" font-size="34" font-weight="500" letter-spacing="1" fill="#46518f">${subtitle}</text>` : ''
  // 物件版：不要底、不要标题，只留插画（含展台），透明背景
  const body = objectOnly ? `<g transform="${stage}">${art}</g>` : `${bg}<g transform="${stage}">${art}</g>${text}`
  // 物件版画布四周各放宽 OBJECT_BLEED：海报里有些物件故意出血到卡片外（胶片、触控笔），按 720×960 画会被画布边缘切掉
  const [vx, vy, vw, vh] = objectOnly ? [-OBJECT_BLEED, -OBJECT_BLEED, W + OBJECT_BLEED * 2, H + OBJECT_BLEED * 2] : [0, 0, W, H]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw * scale}" height="${vh * scale}" viewBox="${vx} ${vy} ${vw} ${vh}"><defs>${FILTERS}${defs.join('')}</defs>${body}</svg>`
}

// 统一的底：柔和的双色渐变 + 左上一团亮光 + 几个小装饰，9 张放在一起是一套。
function backdrop(g, top, bottom, accent) {
  return `
  <rect width="${W}" height="${H}" fill="${g.lin([[0, lighten(top, 0.6)], [0.45, lighten(top, 0.3)], [1, bottom]], 0, 0, 0.25, 1)}"/>
  <ellipse cx="190" cy="140" rx="380" ry="260" fill="#fff" opacity=".6" filter="url(#blur40)"/>
  <circle cx="650" cy="240" r="150" fill="${accent}" opacity=".26" filter="url(#blur40)"/>
  <circle cx="80" cy="820" r="190" fill="#fff" opacity=".55" filter="url(#blur40)"/>
  <circle cx="640" cy="880" r="130" fill="${accent}" opacity=".16" filter="url(#blur40)"/>
  <circle cx="608" cy="112" r="56" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3"/>
  <circle cx="96" cy="300" r="9" fill="#fff" opacity=".85"/>
  <circle cx="664" cy="640" r="7" fill="#fff" opacity=".8"/>
  <circle cx="64" cy="560" r="5" fill="#fff" opacity=".75"/>
  <circle cx="520" cy="900" r="6" fill="#fff" opacity=".7"/><!--stage-->`
}

// 物件下面的「展台」：和首页轨道舞台的光圈呼应。
function pedestal(g, cy, rx, tint) {
  return `
  <ellipse cx="360" cy="${cy + 26}" rx="${rx + 14}" ry="52" fill="#2d2470" opacity=".1" filter="url(#blur18)"/>
  <ellipse cx="360" cy="${cy + 13}" rx="${rx}" ry="52" fill="${g.lin([[0, '#ffffff', 0.6], [1, tint, 0.45]])}"/>
  <ellipse cx="360" cy="${cy}" rx="${rx}" ry="52" fill="${g.lin([[0, '#ffffff', 0.98], [1, '#ffffff', 0.7]])}"/>
  <ellipse cx="360" cy="${cy}" rx="${rx - 46}" ry="34" fill="none" stroke="${tint}" stroke-opacity=".45" stroke-width="2.5"/>`
}

function sparkle(x, y, s, fill = '#fff', opacity = 1) {
  const k = s * 0.18
  return `<path d="M${x} ${y - s}C${x + k} ${y - k} ${x + k} ${y - k} ${x + s} ${y}C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + s}C${x - k} ${y + k} ${x - k} ${y + k} ${x - s} ${y}C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - s}Z" fill="${fill}" opacity="${opacity}"/>`
}

function ball(g, cx, cy, r, base, light, dark) {
  const hx = cx - r * 0.32
  const hy = cy - r * 0.38
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${g.rad([[0, light], [0.55, base], [1, dark]], 0.38, 0.32, 0.75)}"/>
  <ellipse cx="${hx}" cy="${hy}" rx="${r * 0.34}" ry="${r * 0.2}" transform="rotate(-28 ${hx} ${hy})" fill="#fff" opacity=".75"/>`
}

const line = (x1, y1, x2, y2, color, width, opacity = 1) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`

const CARDS = {
  // AI 绘画：调色盘 + 画笔 + 魔法闪光
  paint: (g) => {
    const palette = 'M-190 -20C-200 -120 -90 -160 10 -150C120 -140 212 -88 206 10C200 92 140 142 60 142C12 142 -8 112 -40 114C-80 116 -70 152 -122 152C-182 152 -186 62 -190 -20ZM-118 52a30 30 0 1 0 60 0a30 30 0 1 0 -60 0Z'
    const blobs = [
      [-122, -58, 34, '#ff6b6b', '#ffd6d6', '#e03131'],
      [-40, -102, 32, '#ffa94d', '#ffe8cc', '#f76707'],
      [56, -100, 32, '#ffd43b', '#fff3bf', '#f59f00'],
      [136, -46, 31, '#51cf66', '#d3f9d8', '#2f9e44'],
      [146, 44, 29, '#4dabf7', '#d0ebff', '#1c7ed6'],
      [78, 94, 27, '#9775fa', '#e5dbff', '#6741d9'],
    ]
    return backdrop(g, ...TINTS.paint) + pedestal(g, 716, 250, '#c9b6ff') + `
    <g transform="translate(350 476) rotate(-10)" filter="url(#drop)">
      <path d="${palette}" transform="translate(0 16)" fill="${g.lin([[0, '#efbf82'], [1, '#d9995a']])}" fill-rule="evenodd"/>
      <path d="${palette}" fill="${g.lin([[0, '#fff8ea'], [1, '#f7d8a8']], 0, 0, 0.8, 1)}" fill-rule="evenodd"/>
      <path d="${palette}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="4"/>
      ${blobs.map(([x, y, r, b, l, d]) => ball(g, x, y, r, b, l, d)).join('')}
    </g>
    <g transform="translate(196 704) rotate(-50)" filter="url(#drop)">
      <path d="M0 -16L292 -11L292 11L0 16Q-16 0 0 -16Z" fill="${g.lin([[0, '#c4b4ff'], [1, '#6f4ef2']])}"/>
      ${line(12, -8, 280, -5, '#fff', 3, 0.6)}
      <rect x="288" y="-17" width="58" height="34" rx="7" fill="${g.lin([[0, '#fbfcff'], [0.5, '#bcc3d6'], [1, '#e8ebf3']])}"/>
      ${line(304, -15, 304, 15, '#97a0b8', 2, 0.6)}${line(330, -15, 330, 15, '#97a0b8', 2, 0.6)}
      <path d="M344 -16C384 -19 424 -10 456 0C424 10 384 19 344 16Z" fill="${g.lin([[0, '#f3e2c9'], [0.42, '#cbb6ff'], [1, '#8b5cf6']], 0, 0, 1, 0)}"/>
      <circle cx="462" cy="9" r="7" fill="#8b5cf6"/>
    </g>
    ${sparkle(560, 286, 30, '#ffd43b')}${sparkle(604, 356, 15, '#fff')}${sparkle(520, 226, 12, '#fff', 0.95)}
    <circle cx="590" cy="250" r="5" fill="#fff"/><circle cx="545" cy="345" r="4" fill="#ffd43b"/>`
  },

  // 手绘板：平板 + 小朋友的画 + 触控笔
  sketchpad: (g) => {
    const screen = g.clip('<rect x="-163" y="-223" width="326" height="446" rx="28"/>')
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4
      return line(-88 + Math.cos(a) * 48, -132 + Math.sin(a) * 48, -88 + Math.cos(a) * 64, -132 + Math.sin(a) * 64, '#fab005', 7)
    }).join('')
    return backdrop(g, ...TINTS.sketchpad) + pedestal(g, 730, 240, '#9fd3ff') + `
    <g transform="translate(360 455) rotate(-7)">
      <rect x="-185" y="-245" width="370" height="490" rx="44" fill="${g.lin([[0, '#ffffff'], [1, '#e6eaf7']], 0, 0, 1, 1)}" filter="url(#drop)"/>
      <rect x="-185" y="-245" width="370" height="490" rx="44" fill="none" stroke="#fff" stroke-width="3"/>
      <rect x="-163" y="-223" width="326" height="446" rx="28" fill="${g.lin([[0, '#fbfcff'], [1, '#edf2ff']])}"/>
      <circle cx="0" cy="-234" r="4" fill="#c5cbe0"/>
      <g clip-path="${screen}">
        <path d="M-163 118C-92 58 -12 66 58 106C108 134 140 128 163 110L163 223L-163 223Z" fill="${g.lin([[0, '#b2f2bb'], [1, '#8ce99a']])}"/>
        <circle cx="-88" cy="-132" r="34" fill="#ffd43b" stroke="#fab005" stroke-width="5"/>${rays}
        <path d="M30 -150a26 26 0 0 1 48 -10a22 22 0 0 1 36 16a18 18 0 0 1 -6 34h-74a22 22 0 0 1 -4 -40Z" fill="#fff" stroke="#a5d8ff" stroke-width="5" stroke-linejoin="round"/>
        <rect x="-72" y="22" width="112" height="90" rx="6" fill="#ffc9de" stroke="#f783ac" stroke-width="5"/>
        <path d="M-88 28L-16 -36L56 28Z" fill="#c0a8ff" stroke="#845ef7" stroke-width="5" stroke-linejoin="round"/>
        <rect x="-30" y="60" width="32" height="52" rx="5" fill="#fff" stroke="#f783ac" stroke-width="4"/>
        <path d="M18 168C40 130 66 196 88 158C100 138 104 140 110 150" fill="none" stroke="${g.lin([[0, '#ff6b6b'], [0.5, '#845ef7'], [1, '#339af0']], 0, 0, 1, 0)}" stroke-width="9" stroke-linecap="round"/>
      </g>
    </g>
    <g transform="translate(488 590) rotate(38)" filter="url(#drop)">
      <path d="M0 0L42 -11L42 11Z" fill="${g.lin([[0, '#f1f3f9'], [1, '#c9cfdd']])}"/>
      <path d="M0 0L12 -3L12 3Z" fill="#5c6178"/>
      <rect x="40" y="-12" width="226" height="24" rx="12" fill="${g.lin([[0, '#d6ccff'], [1, '#7c5cff']])}"/>
      <rect x="40" y="-12" width="16" height="24" fill="#e9ecf5"/>
      ${line(64, -6, 250, -6, '#fff', 3, 0.55)}
    </g>
    ${sparkle(590, 230, 24, '#fff')}${sparkle(130, 640, 16, '#ffd43b')}${sparkle(612, 520, 12, '#fff', 0.9)}`
  },

  // AI 视频：播放器 + 胶片带
  video: (g) => {
    const frames = [0, 1, 2, 3, 4].map((i) => {
      const colors = [['#ffd43b', '#ff922b'], ['#74c0fc', '#9775fa'], ['#8ce99a', '#38d9a9'], ['#ff8fab', '#f06595'], ['#b197fc', '#748ffc']][i]
      return `<rect x="${-330 + i * 150}" y="-34" width="112" height="68" rx="8" fill="${g.lin([[0, colors[0]], [1, colors[1]]], 0, 0, 1, 1)}" opacity=".95"/>`
    }).join('')
    const holes = Array.from({ length: 24 }, (_, i) => `<rect x="${-396 + i * 34}" y="-52" width="16" height="11" rx="3" fill="#fff" opacity=".85"/><rect x="${-396 + i * 34}" y="41" width="16" height="11" rx="3" fill="#fff" opacity=".85"/>`).join('')
    const screen = g.clip('<rect x="176" y="346" width="368" height="200" rx="22"/>')
    return backdrop(g, ...TINTS.video) + pedestal(g, 668, 250, '#d0b8ff') + `
    <g transform="translate(360 470) rotate(-22)" filter="url(#drop)">
      <rect x="-410" y="-62" width="820" height="124" rx="10" fill="${g.lin([[0, '#4a4290'], [1, '#2f2867']])}"/>
      ${holes}${frames}
    </g>
    <g filter="url(#drop)">
      <rect x="160" y="330" width="400" height="270" rx="34" fill="#fff" opacity=".97"/>
    </g>
    <rect x="176" y="346" width="368" height="200" rx="22" fill="${g.lin([[0, '#8d6bff'], [1, '#ff8fc8']], 0, 0, 1, 1)}"/>
    <g clip-path="${screen}">
      <path d="M176 506C250 470 320 488 380 512C440 536 500 520 544 496L544 546L176 546Z" fill="#fff" opacity=".28"/>
      <circle cx="250" cy="396" r="22" fill="#fff3bf" opacity=".9"/>
    </g>
    <circle cx="360" cy="446" r="58" fill="#fff" opacity=".96"/>
    <path d="M344 418L344 474L392 446Z" fill="${g.lin([[0, '#8d6bff'], [1, '#ff6fb1']], 0, 0, 1, 1)}" stroke="${g.lin([[0, '#8d6bff'], [1, '#ff6fb1']], 0, 0, 1, 1)}" stroke-width="8" stroke-linejoin="round"/>
    ${line(196, 572, 524, 572, '#e6e2f6', 8)}
    <path d="M196 572L330 572" stroke="${g.lin([[0, '#8d6bff'], [1, '#ff8fc8']], 0, 0, 1, 0)}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="330" cy="572" r="11" fill="#fff" stroke="#8d6bff" stroke-width="4"/>
    ${sparkle(130, 300, 22, '#fff')}${sparkle(600, 640, 18, '#ffd43b')}${sparkle(160, 640, 11, '#fff', 0.9)}`
  },

  // 无限画布：带点阵的大白板，便签和图片随意摆，边缘还在继续延伸
  canvas: (g) => {
    const dots = g.pattern('<circle cx="13" cy="13" r="2.3" fill="#d6d0ec"/>', 26)
    const board = g.clip('<rect x="110" y="250" width="500" height="420" rx="36"/>')
    const photo = g.clip('<rect x="12" y="12" width="146" height="92" rx="9"/>')
    return backdrop(g, ...TINTS.canvas) + pedestal(g, 722, 260, '#ffc58a') + `
    <g transform="rotate(-4 360 460)">
      <rect x="110" y="250" width="500" height="420" rx="36" fill="#fff" opacity=".97" filter="url(#drop)"/>
      <rect x="110" y="250" width="500" height="420" rx="36" fill="${dots}"/>
      <g clip-path="${board}">
        <g transform="translate(540 560) rotate(9)" opacity=".75"><rect width="130" height="100" rx="12" fill="#d0ebff"/></g>
        <g transform="translate(70 600) rotate(-8)" opacity=".75"><rect width="120" height="90" rx="12" fill="#e5dbff"/></g>
      </g>
      <path d="M262 418C300 446 328 446 362 424" fill="none" stroke="#9775fa" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 12"/>
      <path d="M470 418C496 444 500 470 486 494" fill="none" stroke="#9775fa" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 12"/>
      <g transform="translate(150 292) rotate(-7)" filter="url(#dropSm)">
        <rect width="132" height="126" rx="12" fill="${g.lin([[0, '#ffec99'], [1, '#ffd43b']])}"/>
        ${line(22, 38, 104, 38, '#e8a800', 7, 0.55)}${line(22, 62, 92, 62, '#e8a800', 7, 0.55)}${line(22, 86, 80, 86, '#e8a800', 7, 0.55)}
      </g>
      <g transform="translate(350 286) rotate(5)" filter="url(#dropSm)">
        <rect width="170" height="130" rx="14" fill="#fff"/>
        <rect x="12" y="12" width="146" height="92" rx="9" fill="${g.lin([[0, '#a5d8ff'], [1, '#d0bfff']])}"/>
        <g clip-path="${photo}">
          <path d="M12 90C50 62 80 70 108 84C130 94 146 90 158 82L158 104L12 104Z" fill="#8ce99a"/>
          <circle cx="126" cy="38" r="13" fill="#ffd43b"/>
        </g>
        ${line(14, 118, 92, 118, '#dee2e6', 6)}
      </g>
      <g transform="translate(150 456) rotate(-3)" filter="url(#dropSm)">
        <rect width="176" height="112" rx="14" fill="#fff"/>
        ${line(20, 30, 110, 30, '#b197fc', 9)}${line(20, 56, 150, 56, '#e9e5f5', 7)}${line(20, 78, 136, 78, '#e9e5f5', 7)}
      </g>
      <g transform="translate(420 486) rotate(8)" filter="url(#dropSm)">
        <rect width="128" height="118" rx="12" fill="${g.lin([[0, '#ffdeeb'], [1, '#ffc9de']])}"/>
        <path d="M64 92C30 68 26 50 36 40C46 30 60 34 64 46C68 34 82 30 92 40C102 50 98 68 64 92Z" fill="#ff6b9a"/>
      </g>
      <circle cx="560" cy="300" r="34" fill="${g.lin([[0, '#a5d8ff'], [1, '#4dabf7']])}" filter="url(#dropSm)"/>
      ${sparkle(560, 300, 16, '#fff')}
    </g>
    <path d="M500 600L500 656L514 642L526 668L538 662L526 637L546 636Z" fill="#fff" stroke="#6741d9" stroke-width="5" stroke-linejoin="round" filter="url(#dropSm)"/>
    ${sparkle(110, 210, 22, '#fff')}${sparkle(640, 210, 14, '#ffd43b')}${sparkle(630, 700, 12, '#fff', 0.9)}`
  },

  // AI 3D：立方体、球、三棱锥 + 旋转箭头
  model3d: (g) => {
    const s = 150
    const cx = 290
    const cy = 520
    const top = `${cx},${cy - s} ${cx + s * 0.866},${cy - s / 2} ${cx},${cy} ${cx - s * 0.866},${cy - s / 2}`
    const left = `${cx - s * 0.866},${cy - s / 2} ${cx},${cy} ${cx},${cy + s} ${cx - s * 0.866},${cy + s / 2}`
    const right = `${cx},${cy} ${cx + s * 0.866},${cy - s / 2} ${cx + s * 0.866},${cy + s / 2} ${cx},${cy + s}`
    const face = (points, fill) => `<polygon points="${points}" fill="${fill}" stroke="${fill}" stroke-width="10" stroke-linejoin="round"/>`
    return backdrop(g, ...TINTS.model3d) + pedestal(g, 716, 258, '#9db8ff') + `
    <path d="M118 640C80 600 120 560 230 540" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".25" filter="url(#blur6)"/>
    <g filter="url(#drop)">
      ${face(left, g.lin([[0, '#9c84ff'], [1, '#7656f2']]))}
      ${face(right, g.lin([[0, '#6f52f0'], [1, '#5236d0']]))}
      ${face(top, g.lin([[0, '#e4dbff'], [1, '#b9a6ff']], 0, 0, 1, 1))}
    </g>
    <path d="M${cx - s * 0.866 + 6} ${cy - s / 2}L${cx} ${cy - s + 4}L${cx + s * 0.866 - 6} ${cy - s / 2}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
    <g filter="url(#drop)">
      <polygon points="530,296 466,428 532,454" fill="${g.lin([[0, '#96f2d7'], [1, '#38d9a9']])}" stroke="#63e6be" stroke-width="6" stroke-linejoin="round"/>
      <polygon points="530,296 532,454 596,424" fill="${g.lin([[0, '#38d9a9'], [1, '#12b886']])}" stroke="#20c997" stroke-width="6" stroke-linejoin="round"/>
    </g>
    <g filter="url(#drop)">${ball(g, 506, 574, 76, '#ff8cc6', '#ffe3f1', '#d6488c')}</g>
    <path d="M150 640C120 700 300 730 450 712C540 700 600 680 610 640" fill="none" stroke="${g.lin([[0, '#7c5cff', 0.15], [0.6, '#7c5cff', 0.7], [1, '#7c5cff', 0.95]], 0, 0, 1, 0)}" stroke-width="8" stroke-linecap="round"/>
    <path d="M594 616L612 642L582 652" fill="none" stroke="#7c5cff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>
    ${sparkle(150, 300, 24, '#fff')}${sparkle(620, 250, 16, '#ffd43b')}${sparkle(640, 470, 11, '#fff', 0.9)}`
  },

  // 课程：翻开的书 + 铅笔 + 播放小徽章（视频课）
  courses: (g) => {
    const pic = g.clip('<rect x="168" y="372" width="152" height="110" rx="12"/>')
    return backdrop(g, ...TINTS.courses) + pedestal(g, 716, 258, '#8fd9c4') + `
    <g filter="url(#drop)">
      <path d="M118 366C210 334 300 336 360 370C420 336 510 334 602 366L602 626C510 598 420 600 360 632C300 600 210 598 118 626Z" fill="#23977a"/>
      <path d="M118 352C210 320 300 322 360 356C420 322 510 320 602 352L602 612C510 584 420 586 360 618C300 586 210 584 118 612Z" fill="#2fb38f"/>
      <path d="M360 346C300 312 210 312 134 338L134 596C210 570 300 572 360 606Z" fill="${g.lin([[0, '#ffffff'], [1, '#f2ecdc']], 0, 0, 1, 0)}"/>
      <path d="M360 346C420 312 510 312 586 338L586 596C510 570 420 572 360 606Z" fill="${g.lin([[0, '#f2ecdc'], [1, '#ffffff']], 0, 0, 1, 0)}"/>
    </g>
    ${line(360, 350, 360, 600, '#e2dac6', 3)}
    <rect x="168" y="372" width="152" height="110" rx="12" fill="${g.lin([[0, '#a5d8ff'], [1, '#e5dbff']])}"/>
    <g clip-path="${pic}">
      <path d="M168 462C200 430 236 436 262 452C286 466 304 462 320 452L320 482L168 482Z" fill="#69db7c"/>
      <path d="M168 470C196 452 226 456 250 468L250 482L168 482Z" fill="#40c057"/>
      <circle cx="288" cy="400" r="16" fill="#ffd43b"/>
    </g>
    ${line(172, 512, 304, 512, '#d9d3e6', 8)}${line(172, 538, 270, 538, '#d9d3e6', 8)}
    ${line(400, 384, 540, 384, '#b197fc', 10)}${line(400, 414, 536, 414, '#dcd7e8', 8)}${line(400, 440, 512, 440, '#dcd7e8', 8)}${line(400, 466, 530, 466, '#dcd7e8', 8)}
    <circle cx="414" cy="516" r="17" fill="#51cf66"/>
    <path d="M405 516L412 523L424 509" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    ${line(444, 516, 534, 516, '#dcd7e8', 8)}
    <path d="M520 326L520 404L534 390L548 404L548 322Z" fill="#ff6b6b"/>
    <g transform="translate(424 698) rotate(-26)" filter="url(#dropSm)">
      <path d="M0 -12L-36 0L0 12Z" fill="#ffe3bf"/><path d="M-36 0L-23 -4.4L-23 4.4Z" fill="#495057"/>
      <rect x="0" y="-12" width="196" height="24" fill="${g.lin([[0, '#ffe066'], [1, '#fab005']])}"/>
      ${line(2, -4, 194, -4, '#fff', 2.5, 0.5)}
      <rect x="192" y="-13" width="14" height="26" fill="#ced4da"/>
      <rect x="206" y="-12" width="32" height="24" rx="8" fill="#ff8fab"/>
    </g>
    <g filter="url(#dropSm)">
      <circle cx="596" cy="282" r="42" fill="${g.lin([[0, '#ffc078'], [1, '#ff6b6b']], 0, 0, 1, 1)}"/>
      <path d="M584 262L584 302L616 282Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
    </g>
    ${sparkle(150, 286, 24, '#ffd43b')}${sparkle(116, 456, 13, '#fff')}${sparkle(632, 520, 14, '#fff', 0.9)}`
  },

  // 作品广场：三幅画框 + 点赞
  gallery: (g) => {
    const art = g.clip('<rect x="34" y="34" width="202" height="262" rx="6"/>')
    return backdrop(g, ...TINTS.gallery) + pedestal(g, 680, 252, '#ffc2a8') + `
    <g transform="translate(160 300)">
      <rect width="270" height="330" rx="18" fill="${g.lin([[0, '#ffdf96'], [1, '#eea444']], 0, 0, 1, 1)}" filter="url(#drop)"/>
      <rect x="14" y="14" width="242" height="302" rx="10" fill="#fffaf0"/>
      <rect x="34" y="34" width="202" height="262" rx="6" fill="${g.lin([[0, '#ffc29a'], [0.55, '#ff9cc2'], [1, '#b9a0ff']])}"/>
      <g clip-path="${art}">
        <circle cx="140" cy="150" r="36" fill="#fff4c2"/>
        <path d="M34 226C80 186 130 196 170 218C200 234 220 232 236 224L236 296L34 296Z" fill="#9775fa" opacity=".85"/>
        <path d="M34 252C70 230 110 236 150 254C180 268 210 266 236 256L236 296L34 296Z" fill="#6741d9"/>
        ${line(80, 276, 120, 276, '#fff', 4, 0.5)}${line(150, 284, 196, 284, '#fff', 4, 0.4)}
      </g>
    </g>
    <g transform="translate(468 282)">
      <rect width="174" height="142" rx="14" fill="${g.lin([[0, '#ffffff'], [1, '#e7eaf3']], 0, 0, 1, 1)}" filter="url(#drop)"/>
      <rect x="13" y="13" width="148" height="116" rx="8" fill="#e7f5ff"/>
      <circle cx="56" cy="58" r="22" fill="#ff6b6b"/>
      <path d="M82 112L112 46L142 112Z" fill="#ffd43b" stroke="#ffd43b" stroke-width="6" stroke-linejoin="round"/>
      <rect x="30" y="86" width="44" height="30" rx="7" fill="#4dabf7"/>
    </g>
    <g transform="translate(482 456)">
      <rect width="150" height="172" rx="14" fill="${g.lin([[0, '#d6c8ff'], [1, '#9775fa']], 0, 0, 1, 1)}" filter="url(#drop)"/>
      <rect x="12" y="12" width="126" height="148" rx="8" fill="#fff9db"/>
      <path d="M44 62L50 30L70 52Z" fill="#ffa94d"/><path d="M106 62L100 30L80 52Z" fill="#ffa94d"/>
      <circle cx="75" cy="88" r="38" fill="#ffa94d"/>
      <circle cx="62" cy="82" r="5" fill="#343a40"/><circle cx="88" cy="82" r="5" fill="#343a40"/>
      <path d="M71 96L79 96L75 101Z" fill="#ff6b9a"/>
      ${line(40, 98, 58, 100, '#343a40', 2)}${line(40, 108, 58, 106, '#343a40', 2)}${line(110, 98, 92, 100, '#343a40', 2)}${line(110, 108, 92, 106, '#343a40', 2)}
    </g>
    <g filter="url(#dropSm)">
      <circle cx="162" cy="288" r="40" fill="${g.lin([[0, '#ff9fb7'], [1, '#ff4f84']], 0, 0, 1, 1)}"/>
      <path d="M162 308C138 292 134 278 140 270C146 262 158 264 162 274C166 264 178 262 184 270C190 278 186 292 162 308Z" fill="#fff"/>
    </g>
    ${sparkle(620, 236, 22, '#fff')}${sparkle(112, 640, 16, '#ffd43b')}${sparkle(450, 250, 11, '#fff', 0.9)}`
  },

  // 我的素材库：文件夹 + 冒出来的画、照片、视频
  portfolio: (g) => {
    const photo = g.clip('<rect x="10" y="10" width="160" height="108" rx="8"/>')
    return backdrop(g, ...TINTS.portfolio) + pedestal(g, 684, 252, '#a9b8ff') + `
    <path d="M150 330Q150 305 175 305L300 305Q318 305 328 320L345 345L545 345Q570 345 570 370L570 610Q570 635 545 635L175 635Q150 635 150 610Z" fill="${g.lin([[0, '#93a5ff'], [1, '#6470f2']])}" filter="url(#drop)"/>
    <g transform="translate(196 300) rotate(-9)" filter="url(#dropSm)">
      <rect width="168" height="208" rx="12" fill="#fff"/>
      <circle cx="122" cy="46" r="18" fill="#ffd43b"/>
      <path d="M22 150C44 104 70 168 94 122C108 96 124 110 142 92" fill="none" stroke="${g.lin([[0, '#ff6b6b'], [0.5, '#845ef7'], [1, '#339af0']], 0, 0, 1, 0)}" stroke-width="8" stroke-linecap="round"/>
    </g>
    <g transform="translate(330 288) rotate(5)" filter="url(#dropSm)">
      <rect width="180" height="150" rx="12" fill="#fff"/>
      <rect x="10" y="10" width="160" height="108" rx="8" fill="${g.lin([[0, '#a5d8ff'], [1, '#e5dbff']])}"/>
      <g clip-path="${photo}">
        <path d="M10 104L58 52L94 90L118 66L170 112L170 118L10 118Z" fill="#748ffc"/>
        <path d="M58 52L70 66L48 72Z" fill="#fff" opacity=".85"/>
        <circle cx="140" cy="36" r="12" fill="#fff3bf"/>
      </g>
      ${line(14, 134, 96, 134, '#dee2e6', 6)}
    </g>
    <g transform="translate(452 330) rotate(12)" filter="url(#dropSm)">
      <rect width="128" height="104" rx="12" fill="${g.lin([[0, '#4f478f'], [1, '#2f2867']])}"/>
      <circle cx="64" cy="52" r="24" fill="#fff" opacity=".95"/>
      <path d="M57 40L57 64L76 52Z" fill="#6f52f0"/>
    </g>
    <path d="M140 432Q140 410 162 410L558 410Q582 410 580 432L570 612Q568 640 540 640L180 640Q152 640 150 612Z" fill="${g.lin([[0, '#bcc8ff'], [1, '#7d8bff']])}" filter="url(#drop)"/>
    <path d="M160 418L560 418" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
    <circle cx="508" cy="578" r="30" fill="#fff" opacity=".9"/>
    <path d="M508 594C490 582 486 572 490 566C494 559 504 560 508 568C512 560 522 559 526 566C530 572 526 582 508 594Z" fill="#ff6b9a"/>
    ${sparkle(600, 296, 24, '#ffd43b')}${sparkle(122, 270, 16, '#fff')}${sparkle(624, 560, 12, '#fff', 0.9)}`
  },

  // 项目报告：图表报告 + 奖章
  reports: (g) => {
    const doc = g.clip('<rect x="200" y="245" width="320" height="420" rx="26"/>')
    const r = 44
    const c = 2 * Math.PI * r
    const seg = (color, from, part) => `<circle cx="452" cy="418" r="${r}" fill="none" stroke="${color}" stroke-width="22" stroke-dasharray="${c * part} ${c}" stroke-dashoffset="${-c * from}" transform="rotate(-90 452 418)"/>`
    return backdrop(g, ...TINTS.reports) + pedestal(g, 702, 248, '#9fc3ff') + `
    <g transform="rotate(4 360 460)">
      <rect x="200" y="245" width="320" height="420" rx="26" fill="#fff" filter="url(#drop)"/>
      <g clip-path="${doc}"><rect x="200" y="245" width="320" height="92" fill="${g.lin([[0, '#8d7bff'], [1, '#6fb2ff']], 0, 0, 1, 0)}"/></g>
      <circle cx="248" cy="291" r="22" fill="#fff" opacity=".92"/>
      ${line(286, 280, 400, 280, '#fff', 10, 0.95)}${line(286, 304, 360, 304, '#fff', 8, 0.7)}
      ${line(232, 472, 384, 472, '#e5e3f0', 3)}
      <rect x="240" y="402" width="24" height="70" rx="6" fill="#74c0fc"/>
      <rect x="276" y="372" width="24" height="100" rx="6" fill="#b197fc"/>
      <rect x="312" y="416" width="24" height="56" rx="6" fill="#ff8787"/>
      <rect x="348" y="352" width="24" height="120" rx="6" fill="#ffd43b"/>
      ${seg('#63e6be', 0, 0.45)}${seg('#748ffc', 0.45, 0.3)}${seg('#ff8fab', 0.75, 0.25)}
      ${line(232, 514, 488, 514, '#ebe9f4', 10)}${line(232, 542, 452, 542, '#ebe9f4', 10)}${line(232, 570, 470, 570, '#ebe9f4', 10)}
      <rect x="232" y="598" width="112" height="34" rx="17" fill="#f0ecff"/>
    </g>
    <g transform="translate(540 268)" filter="url(#drop)">
      <path d="M-30 14L-46 96L-24 84L-10 104L4 24Z" fill="#ff6b6b"/>
      <path d="M30 14L46 96L24 84L10 104L-4 24Z" fill="#4dabf7"/>
      <circle r="46" fill="${g.lin([[0, '#ffe680'], [1, '#f59f00']], 0, 0, 1, 1)}"/>
      <circle r="34" fill="none" stroke="#fff3bf" stroke-width="4"/>
      ${sparkle(0, 0, 20, '#fff')}
    </g>
    ${sparkle(150, 300, 22, '#fff')}${sparkle(130, 610, 15, '#ffd43b')}${sparkle(628, 560, 12, '#fff', 0.9)}`
  },
}

const argValue = (flag) => {
  const index = process.argv.indexOf(flag)
  return index > 0 ? process.argv[index + 1] || '' : ''
}
const sheetPath = argValue('--sheet')
const svgDir = argValue('--svg')

if (svgDir) {
  fs.mkdirSync(svgDir, { recursive: true })
  for (const [id, build] of Object.entries(CARDS)) {
    const [title, subtitle] = TEXT[id]
    fs.writeFileSync(path.join(svgDir, `${id}-v2.svg`), card(build, { title, subtitle, scale: POSTER_SCALE }))
    fs.writeFileSync(path.join(svgDir, `${id}-v2-obj.svg`), card(build, { objectOnly: true, scale: OBJECT_SCALE }))
    console.log(id)
  }
  process.exit(0)
}

const { default: sharp } = await import('sharp')
fs.mkdirSync(OUT_DIR, { recursive: true })
const rendered = []
for (const [id, build] of Object.entries(CARDS)) {
  const [title, subtitle] = TEXT[id]
  for (const [suffix, svg] of [['-v2', card(build, { title, subtitle, scale: POSTER_SCALE })], ['-v2-obj', card(build, { objectOnly: true, scale: OBJECT_SCALE })]]) {
    const file = path.join(OUT_DIR, `${id}${suffix}.webp`)
    const image = sharp(Buffer.from(svg))
    // 物件版：按透明边界裁掉四周空白，再缩到长边 OBJECT_MAX
    if (suffix === '-v2-obj') image.trim({ threshold: 1 }).resize(OBJECT_MAX, OBJECT_MAX, { fit: 'inside', withoutEnlargement: true })
    await image.webp({ quality: 88, alphaQuality: 92, effort: 6 }).toFile(file)
    if (suffix === '-v2') rendered.push({ id, file })
    console.log(`${file}  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`)
  }
}

// 预览拼图（只给人看，不进项目）：3×3，每张缩到 240×320
if (sheetPath) {
  const tiles = await Promise.all(rendered.map(({ file }) => sharp(file).resize(240, 320).png().toBuffer()))
  await sharp({ create: { width: 240 * 3 + 40, height: 320 * 3 + 40, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input, i) => ({ input, left: 10 + (i % 3) * 250, top: 10 + Math.floor(i / 3) * 330 })))
    .png()
    .toFile(sheetPath)
  console.log('sheet:', sheetPath)
}
