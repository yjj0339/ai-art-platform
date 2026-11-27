<template>
  <!-- 风格卡片的默认小样：后台没传封面图时，按风格名称画一张能看出「这种画风长什么样」的原创小图，带轻微动效。
       画在 120×120 的方形画布里，按容器等比缩放；系统设置了「减少动态效果」时动画全部停掉。 -->
  <span class="ssa" :class="`ssa--${art}`" :style="{ '--d': delay }" aria-hidden="true">
    <svg class="ssa__svg" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet" focusable="false">
      <!-- 国画 / 水墨：远山、近山、红日、松枝、印章 -->
      <template v-if="art === 'ink'">
        <circle cx="86" cy="34" r="11" fill="#e2574c" opacity=".85" />
        <path d="M0 74c12-14 22-22 32-14s18-14 30-4 22-12 34 0 18-4 24 2v62H0z" fill="#b9bcb8" opacity=".75" />
        <g class="s-drift"><ellipse cx="44" cy="80" rx="34" ry="4.5" fill="#f6f1e6" opacity=".85" /></g>
        <path d="M0 90c14-12 24-18 36-8s20-10 34 2 24-8 50 4v32H0z" fill="#5f6460" />
        <path d="M8 14c12 4 22 10 30 22M22 18l-4-8M28 23l-3-9M34 29l-1-9M20 18l-9-1M26 22l-9 2M32 28l-8 3" stroke="#3b3d3a" stroke-width="1.8" stroke-linecap="round" fill="none" />
        <g class="s-fly"><path d="M52 36q3-2.5 6 0q3-2.5 6 0" stroke="#3b3d3a" stroke-width="1.3" fill="none" stroke-linecap="round" /></g>
        <rect x="94" y="94" width="14" height="16" rx="2" fill="#c8423b" />
        <path d="M98 99h6M98 103h6M98 107h6" stroke="#fff" stroke-width="1.3" opacity=".9" />
      </template>

      <!-- 油画：金框、厚涂的天空笔触、太阳、草地上的花点 -->
      <template v-else-if="art === 'oil'">
        <rect x="10" y="10" width="100" height="100" rx="6" fill="#4d73b8" />
        <g class="s-drift">
          <path d="M20 34c6-3 14-3 20 0s14 3 20 0" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".85" />
          <path d="M28 46c5-2 11-2 16 0" stroke="#cfe0fa" stroke-width="5" fill="none" stroke-linecap="round" />
        </g>
        <path d="M50 62c6-3 14-3 20 0s12 3 18 0" stroke="#9cc1f5" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8" />
        <path class="s-pulse" :d="rays(84, 34, 13, 18, 8)" stroke="#f8d66d" stroke-width="3.5" stroke-linecap="round" />
        <circle cx="84" cy="34" r="10" fill="#f8d66d" />
        <path d="M10 80c20-12 40-14 60-6s30 2 40-2v28a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="#3f8a5a" />
        <path d="M16 88c10-4 18-4 26 0M48 86c10-5 20-5 30 0M80 84c8-3 16-3 24 0" stroke="#6fbf7f" stroke-width="4" fill="none" stroke-linecap="round" />
        <circle cx="26" cy="98" r="3.5" fill="#ff7b6b" />
        <circle cx="40" cy="102" r="3" fill="#ffd66b" />
        <circle cx="62" cy="97" r="3.5" fill="#ff9fbf" />
        <circle cx="82" cy="102" r="3" fill="#fff" />
        <circle cx="96" cy="95" r="3.5" fill="#ff7b6b" />
        <rect x="10" y="10" width="100" height="100" rx="6" fill="none" stroke="#d6a447" stroke-width="7" />
        <rect x="13.5" y="13.5" width="93" height="93" rx="3" fill="none" stroke="#f3cf7a" stroke-width="1.2" />
      </template>

      <!-- 漫画：网点底、速度线、爆炸框 -->
      <template v-else-if="art === 'comic'">
        <defs>
          <pattern :id="`${uid}-dots`" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="#ffb03a" opacity=".5" />
          </pattern>
        </defs>
        <rect width="120" height="120" :fill="`url(#${uid}-dots)`" />
        <path d="M6 60h18M96 60h18M60 6v14M60 100v14M16 16l12 12M104 16 92 28M16 104l12-12M104 104 92 92" stroke="#2a2d4f" stroke-width="2.4" stroke-linecap="round" opacity=".55" />
        <g class="s-pop">
          <path :d="burst(60, 60, 34, 23, 12)" fill="#ff5d5d" stroke="#2a2d4f" stroke-width="2.4" stroke-linejoin="round" />
          <text x="60" y="68" text-anchor="middle" font-size="22" font-weight="900" fill="#fff" stroke="#2a2d4f" stroke-width="1.4" paint-order="stroke" font-family="'PingFang SC','Microsoft YaHei',sans-serif">哇!</text>
        </g>
      </template>

      <!-- 3D：有高光的立体球 + 小方块，投影跟着浮动 -->
      <template v-else-if="art === '3d'">
        <defs>
          <radialGradient :id="`${uid}-ball`" cx="38%" cy="32%" r="72%">
            <stop offset="0" stop-color="#ebe5ff" />
            <stop offset=".55" stop-color="#9b8cff" />
            <stop offset="1" stop-color="#5b4bd6" />
          </radialGradient>
        </defs>
        <ellipse class="s-shadow" cx="52" cy="98" rx="24" ry="5" fill="#5b4bd6" opacity=".18" />
        <g class="s-float">
          <circle cx="52" cy="58" r="27" :fill="`url(#${uid}-ball)`" />
          <ellipse cx="42" cy="45" rx="9" ry="5.5" fill="#fff" opacity=".75" transform="rotate(-25 42 45)" />
        </g>
        <ellipse cx="91" cy="104" rx="13" ry="3" fill="#5b4bd6" opacity=".14" />
        <g class="s-float2">
          <path d="M91 70l14 7-14 7-14-7z" fill="#ffe08a" />
          <path d="M77 77l14 7v15l-14-7z" fill="#f5b83d" />
          <path d="M105 77l-14 7v15l14-7z" fill="#e0971f" />
        </g>
      </template>

      <!-- 线描：一笔一笔画出来的小花 + 铅笔 -->
      <template v-else-if="art === 'line'">
        <g class="s-draw" stroke="#2a2d4f" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path pathLength="1" d="M56 106V48" />
          <path pathLength="1" d="M56 86c-10-2-18-8-20-16 10 0 18 6 20 16z" />
          <path pathLength="1" d="M56 76c10-2 18-8 20-16-10 0-18 6-20 16z" />
          <ellipse v-for="angle in [0, 60, 120, 180, 240, 300]" :key="angle" pathLength="1" cx="56" cy="24" rx="5.5" ry="9" :transform="`rotate(${angle} 56 34)`" />
          <circle pathLength="1" cx="56" cy="34" r="5" />
        </g>
        <g transform="rotate(35 96 92)">
          <rect x="91" y="70" width="10" height="34" rx="1.5" fill="#ffd66b" stroke="#2a2d4f" stroke-width="1.6" />
          <path d="M91 104l5 9 5-9z" fill="#ffe6c7" stroke="#2a2d4f" stroke-width="1.6" stroke-linejoin="round" />
          <path d="M94.6 110.5l1.4 2.5 1.4-2.5z" fill="#2a2d4f" />
        </g>
      </template>

      <!-- 照片写实：带取景框的风景照 -->
      <template v-else-if="art === 'photo'">
        <defs>
          <linearGradient :id="`${uid}-sky`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#6aa7e6" />
            <stop offset="1" stop-color="#d7ebff" />
          </linearGradient>
          <linearGradient :id="`${uid}-mtn`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#4f6f8f" />
            <stop offset="1" stop-color="#8fa9c2" />
          </linearGradient>
        </defs>
        <rect x="16" y="23" width="92" height="76" rx="4" fill="#1f2340" opacity=".08" />
        <rect x="14" y="20" width="92" height="76" rx="4" fill="#fff" />
        <rect x="20" y="26" width="80" height="56" rx="2" :fill="`url(#${uid}-sky)`" />
        <circle cx="80" cy="40" r="7" fill="#fff6d6" opacity=".95" />
        <path d="M20 70l16-18 12 10 16-20 20 22 16-10v28H20z" :fill="`url(#${uid}-mtn)`" />
        <path d="M20 74h80v8H20z" fill="#9fc6e8" opacity=".9" />
        <path d="M26 77h14M50 79h20M76 77h12" stroke="#fff" stroke-width="1.2" opacity=".7" />
        <path class="s-pulse" d="M8 26V14h12M112 26V14h-12M8 90v12h12M112 90v12h-12" stroke="#6c5ce7" stroke-width="2.4" fill="none" stroke-linecap="round" />
      </template>

      <!-- 水彩：晕开的半透明色块 -->
      <template v-else-if="art === 'watercolor'">
        <g class="s-breathe"><path d="M28 34c10-12 30-10 36 2s-2 26-16 26-28-14-20-28z" fill="#ff9fbf" opacity=".55" stroke="#ff7fa8" stroke-opacity=".35" stroke-width="1.2" /></g>
        <g class="s-breathe d2"><path d="M58 46c12-10 32-4 34 10s-10 26-24 22-22-22-10-32z" fill="#7cc8ff" opacity=".5" stroke="#4fb2f5" stroke-opacity=".3" stroke-width="1.2" /></g>
        <g class="s-breathe d3"><path d="M28 66c8-10 26-10 30 2s-6 22-18 20-20-12-12-22z" fill="#ffd66b" opacity=".6" stroke="#f5b83d" stroke-opacity=".35" stroke-width="1.2" /></g>
        <path d="M14 102c14-6 30-6 46-2s34 4 46-2" stroke="#9b8cff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".35" />
        <circle cx="96" cy="28" r="2.5" fill="#ff9fbf" opacity=".6" />
        <circle cx="102" cy="36" r="1.6" fill="#7cc8ff" opacity=".6" />
        <circle cx="18" cy="88" r="2" fill="#ffd66b" opacity=".7" />
      </template>

      <!-- 儿童画：蜡笔太阳、小房子、挥手的小人、草地 -->
      <template v-else-if="art === 'kids'">
        <g class="s-spin"><path :d="rays(94, 24, 12, 18, 9)" stroke="#ffb703" stroke-width="2.6" stroke-linecap="round" /></g>
        <circle cx="94" cy="24" r="9" fill="#ffd23f" stroke="#f0a500" stroke-width="1.4" />
        <g class="s-drift">
          <path d="M16 32c0-5 6-8 10-5 2-5 10-5 12 0 5-1 8 4 5 8H18c-2 0-3-1-2-3z" fill="#fff" stroke="#9fb4d8" stroke-width="1.4" />
        </g>
        <path d="M30 66l21-20 21 20z" fill="#6c9cff" stroke="#2a2d4f" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M34 64h34v34H34z" fill="#ff8f73" stroke="#2a2d4f" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M46 98V82h10v16" fill="#ffd66b" stroke="#2a2d4f" stroke-width="1.6" />
        <rect x="38" y="70" width="8" height="8" fill="#cfe8ff" stroke="#2a2d4f" stroke-width="1.4" />
        <g stroke="#2a2d4f" stroke-width="1.8" stroke-linecap="round" fill="none">
          <circle cx="90" cy="70" r="5" fill="#ffe0c7" />
          <path d="M90 75v14M90 89l-5 9M90 89l5 9M90 80l-7 5" />
          <g class="s-wave"><path d="M90 80l8-7" /></g>
        </g>
        <path :d="zigzag(6, 104, 108, 4, 6)" stroke="#4fbf86" stroke-width="2" fill="none" stroke-linejoin="round" />
        <path d="M18 104V90" stroke="#4fbf86" stroke-width="1.8" />
        <circle cx="18" cy="87" r="4" fill="#ff8fa3" />
      </template>

      <!-- 像素：一颗会跳的像素爱心 -->
      <template v-else-if="art === 'pixel'">
        <g class="s-bounce">
          <rect v-for="cell in pixelHeart" :key="cell.key" :x="cell.x" :y="cell.y" width="9.2" height="9.2" :fill="cell.fill" />
        </g>
        <path class="s-twinkle" d="M20 20h4v4h-4zM24 16h4v4h-4zM24 24h4v4h-4zM28 20h4v4h-4z" fill="#ffd66b" />
        <path class="s-twinkle d2" d="M94 92h4v4h-4zM98 88h4v4h-4zM98 96h4v4h-4zM102 92h4v4h-4z" fill="#7cc8ff" />
      </template>

      <!-- 素描：排线明暗的铅笔球 -->
      <template v-else-if="art === 'sketch'">
        <defs>
          <clipPath :id="`${uid}-ball`"><circle cx="54" cy="56" r="28" /></clipPath>
        </defs>
        <ellipse cx="62" cy="92" rx="28" ry="5" fill="#3b3d3a" opacity=".14" />
        <g :clip-path="`url(#${uid}-ball)`" stroke="#3b3d3a" stroke-width="1" opacity=".55">
          <path :d="hatch(58, 104, 5, 28, 86, 34)" />
          <path :d="hatch(70, 104, 6, 40, 90, -34)" opacity=".7" />
        </g>
        <circle class="s-draw-once" pathLength="1" cx="54" cy="56" r="28" fill="none" stroke="#3b3d3a" stroke-width="1.6" />
        <g transform="rotate(35 96 90)">
          <rect x="91" y="68" width="9" height="32" rx="1.5" fill="#6b6f6b" />
          <path d="M91 100l4.5 8 4.5-8z" fill="#e8dcc8" />
          <path d="M94.2 105.6l1.3 2.4 1.3-2.4z" fill="#2a2d4f" />
        </g>
      </template>

      <!-- 赛博霓虹：发光的城市线条 -->
      <template v-else-if="art === 'neon'">
        <defs>
          <filter :id="`${uid}-glow`" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle class="s-pulse" cx="60" cy="48" r="20" fill="none" stroke="#ff5fd2" stroke-width="2.4" :filter="`url(#${uid}-glow)`" />
        <path d="M12 82h16V64h12v18h10V56h14v26h10V68h12v14h22" stroke="#4ff0ff" stroke-width="2.2" fill="none" stroke-linejoin="round" :filter="`url(#${uid}-glow)`" />
        <path d="M8 92h104M60 92 28 120M60 92 92 120M60 92v28M60 92 8 112M60 92l52 20M14 104h92" stroke="#8b6cff" stroke-width="1.3" opacity=".75" />
      </template>

      <!-- 剪纸：红色团花 -->
      <template v-else-if="art === 'papercut'">
        <circle cx="62" cy="62" r="40" fill="#b8322b" opacity=".2" />
        <circle cx="60" cy="60" r="40" fill="#e8483f" />
        <path v-for="angle in [0, 45, 90, 135, 180, 225, 270, 315]" :key="angle" d="M60 30c5 6 5 12 0 18-5-6-5-12 0-18z" fill="#fff1ec" :transform="`rotate(${angle} 60 60)`" />
        <circle cx="60" cy="60" r="7" fill="#fff1ec" />
        <circle v-for="angle in [22, 67, 112, 157, 202, 247, 292, 337]" :key="`d${angle}`" cx="60" cy="27" r="2" fill="#fff1ec" :transform="`rotate(${angle} 60 60)`" />
        <path class="s-twinkle" :d="star(102, 20, 5)" fill="#ffd66b" />
      </template>

      <!-- 扁平插画：仙人掌盆栽 + 几何装饰 -->
      <template v-else-if="art === 'flat'">
        <circle cx="90" cy="30" r="12" fill="#ffc94d" />
        <path d="M18 34l8-14 8 14z" fill="#9b8cff" opacity=".7" />
        <circle cx="100" cy="76" r="5" fill="#ff9fbf" opacity=".8" />
        <g class="s-sway-up">
          <path d="M51 66h-6a6 6 0 0 1-6-6v-8" stroke="#3fae74" stroke-width="7" fill="none" stroke-linecap="round" />
          <path d="M67 60h5a6 6 0 0 0 6-6v-6" stroke="#3fae74" stroke-width="7" fill="none" stroke-linecap="round" />
          <rect x="51" y="38" width="16" height="48" rx="8" fill="#4fbf86" />
          <path d="M56 50v6M62 62v6M56 72v5" stroke="#2f9a63" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="59" cy="38" r="4.5" fill="#ff8fa3" />
        </g>
        <rect x="36" y="82" width="46" height="8" rx="3" fill="#ff7a5c" />
        <path d="M40 90h38l-4 18H44z" fill="#ff8f73" />
      </template>

      <!-- 不指定风格 -->
      <template v-else-if="art === 'none'">
        <circle cx="60" cy="58" r="24" fill="none" stroke="#b4b8cf" stroke-width="3" stroke-dasharray="6 6" />
        <path d="M43 75 77 41" stroke="#b4b8cf" stroke-width="3" stroke-linecap="round" />
      </template>

      <!-- 其它风格：调色盘 -->
      <template v-else>
        <path d="M60 22c-26 0-42 16-42 34 0 14 11 24 24 24 7 0 9-5 9-9 0-5 4-8 10-8h6c13 0 19-8 19-18 0-13-11-23-26-23z" fill="#fff" />
        <circle cx="42" cy="64" r="5" fill="#f1edff" />
        <circle class="s-twinkle" cx="38" cy="46" r="5" fill="#ff8f73" />
        <circle class="s-twinkle d2" cx="52" cy="34" r="5" fill="#ffd66b" />
        <circle class="s-twinkle d3" cx="68" cy="34" r="5" fill="#8fe3c0" />
        <circle class="s-twinkle d4" cx="78" cy="47" r="5" fill="#9b8cff" />
        <g class="s-brush">
          <path d="M104 100 88 74" stroke="#c49a6c" stroke-width="5" stroke-linecap="round" />
          <path d="M89 75l-3.5-5" stroke="#b8bccf" stroke-width="6" />
          <path d="M85.5 70c-3-4-3.5-8-2-11.5 3.5 1.5 5 6 5 10z" fill="#6c5ce7" />
        </g>
      </template>
    </svg>
  </span>
</template>

<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
  label: { type: String, default: '' },
  value: { type: String, default: '' },
  /** 直接指定小样（不按名称猜） */
  kind: { type: String, default: '' },
})
const uid = useId()

// 顺序有讲究：「3D卡通」算 3D、「儿童插画」算儿童画、「照片写实」算写实
const RULES = [
  ['3d', /3D|三维|立体|C4D|粘土|盲盒|渲染/i],
  ['ink', /国画|水墨|中国风|国风|山水|工笔/],
  ['oil', /油画|厚涂|印象派/],
  ['watercolor', /水彩|淡彩/],
  ['kids', /儿童|童趣|蜡笔|涂鸦|稚拙|简笔画/],
  ['line', /线描|线稿|勾线|白描|简笔/],
  ['sketch', /素描|铅笔|炭笔/],
  ['photo', /照片|写实|摄影|真实|实拍|电影/],
  ['comic', /漫画|动漫|日漫|美漫|二次元|卡通/],
  ['pixel', /像素|8-?bit|马赛克/i],
  ['neon', /赛博|霓虹|科幻|未来|蒸汽波/],
  ['papercut', /剪纸|折纸|拼贴|纸艺/],
  ['flat', /扁平|矢量|极简|插画|插图|商业/],
]
const KINDS = new Set([...RULES.map(([name]) => name), 'none', 'palette'])
const art = computed(() => {
  if (KINDS.has(props.kind)) return props.kind
  if (props.value === 'none' || /^(无|不指定|不用风格)$/.test(props.label)) return 'none'
  const hit = RULES.find(([, re]) => re.test(props.label))
  return hit ? hit[0] : 'palette'
})
const delay = computed(() => {
  let hash = 0
  for (const ch of props.label || props.value) hash = (hash * 31 + ch.charCodeAt(0)) % 997
  return `${((hash % 7) * 0.37).toFixed(2)}s`
})

const f = (n) => Number(n.toFixed(1))
function star(x, y, r) {
  const a = f(r * 0.27)
  const b = f(r * 0.73)
  return `M${x} ${f(y - r)}l${a} ${b} ${b} ${a}-${b} ${a}-${a} ${b}-${a}-${b}-${b}-${a} ${b}-${a}z`
}
function rays(cx, cy, r1, r2, n) {
  let d = ''
  for (let i = 0; i < n; i += 1) {
    const t = (Math.PI * 2 * i) / n - Math.PI / 2
    d += `M${f(cx + Math.cos(t) * r1)} ${f(cy + Math.sin(t) * r1)}L${f(cx + Math.cos(t) * r2)} ${f(cy + Math.sin(t) * r2)}`
  }
  return d
}
function burst(cx, cy, R, r, n) {
  let d = ''
  for (let i = 0; i < n * 2; i += 1) {
    const t = (Math.PI * i) / n - Math.PI / 2
    const radius = i % 2 ? r : R
    d += `${i ? 'L' : 'M'}${f(cx + Math.cos(t) * radius)} ${f(cy + Math.sin(t) * radius)}`
  }
  return `${d}z`
}
/** 草地锯齿线 */
function zigzag(x0, y, width, step, height) {
  let d = `M${x0} ${y}`
  for (let x = x0 + step, up = true; x <= x0 + width; x += step, up = !up) d += `L${x} ${up ? y - height : y}`
  return d
}
/** 素描排线：从 (x, top) 斜着往下画，间隔 gap */
function hatch(from, to, gap, top, bottom, slant) {
  let d = ''
  for (let x = from; x <= to; x += gap) d += `M${x} ${top}l${-slant} ${bottom - top}`
  return d
}
// 像素爱心（9×8 格）
const HEART = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....']
const pixelHeart = HEART.flatMap((row, y) => [...row].map((cell, x) => {
  if (cell !== 'X') return null
  const light = (y === 1 && x === 1) || (y === 2 && x === 1) || (y === 1 && x === 2)
  const shade = x === 8 || (y >= 4 && x === row.lastIndexOf('X'))
  return { key: `${x}-${y}`, x: f(19 + x * 9.2), y: f(26 + y * 9.2), fill: light ? '#ffc2cf' : shade ? '#e0405f' : '#ff5a7a' }
}).filter(Boolean))
</script>

<style scoped>
.ssa { --d: 0s; position: relative; display: block; width: 100%; height: 100%; overflow: hidden; }
.ssa__svg { display: block; width: 100%; height: 100%; }

.ssa--ink { background: linear-gradient(180deg, #f8f4ea, #efe8d8); }
.ssa--oil { background: linear-gradient(135deg, #fbf1df, #f3e3c3); }
.ssa--comic { background: #fff7d8; }
.ssa--3d { background: linear-gradient(135deg, #e6efff, #f4eaff); }
.ssa--line { background: #fbfbfd; }
.ssa--photo { background: linear-gradient(135deg, #eef2f7, #e3e9f2); }
.ssa--watercolor { background: #fffdf7; }
.ssa--kids { background: linear-gradient(180deg, #e8f5ff, #fff6e6); }
.ssa--pixel { background: linear-gradient(135deg, #e7f1ff, #f1ecff); }
.ssa--sketch { background: #f5f5f3; }
.ssa--neon { background: linear-gradient(180deg, #221f45, #17152e); }
.ssa--papercut { background: #fff1ec; }
.ssa--flat { background: linear-gradient(135deg, #e3f6ff, #fff0e6); }
.ssa--none { background: #f6f6fb; }
.ssa--palette { background: linear-gradient(135deg, #efeaff, #ffe9dc); }

.s-float, .s-float2, .s-shadow, .s-drift, .s-fly, .s-pulse, .s-pop, .s-breathe, .s-spin,
.s-sway-up, .s-wave, .s-bounce, .s-twinkle, .s-brush { transform-box: fill-box; }

.s-float { transform-origin: center; animation: ssFloat 3.6s ease-in-out var(--d) infinite; }
.s-float2 { transform-origin: center; animation: ssFloat 4.4s ease-in-out calc(var(--d) + 0.8s) infinite; }
.s-shadow { transform-origin: center; animation: ssShadow 3.6s ease-in-out var(--d) infinite; }
.s-drift { animation: ssDrift 8s ease-in-out var(--d) infinite; }
.s-fly { animation: ssFly 6s ease-in-out var(--d) infinite; }
.s-pulse { animation: ssPulse 2.2s ease-in-out var(--d) infinite; }
.s-pop { transform-origin: center; animation: ssPop 2.4s ease-in-out var(--d) infinite; }
.s-breathe { transform-origin: center; animation: ssBreathe 4s ease-in-out var(--d) infinite; }
.s-breathe.d2 { animation-delay: calc(var(--d) + 1.3s); }
.s-breathe.d3 { animation-delay: calc(var(--d) + 2.6s); }
.s-spin { transform-origin: center; animation: ssSpin 16s linear infinite; }
.s-sway-up { transform-origin: 50% 100%; animation: ssSway 4.2s ease-in-out var(--d) infinite; }
.s-wave { transform-origin: 0% 100%; animation: ssWave 1.6s ease-in-out var(--d) infinite; }
.s-brush { transform-origin: 100% 100%; animation: ssSway 3s ease-in-out var(--d) infinite; }
.s-bounce { animation: ssBounce 1.4s steps(2, jump-none) var(--d) infinite; }
.s-twinkle { transform-origin: center; animation: ssTwinkle 2.6s ease-in-out var(--d) infinite; }
.s-twinkle.d2 { animation-delay: calc(var(--d) + 0.9s); }
.s-twinkle.d3 { animation-delay: calc(var(--d) + 1.7s); }
.s-twinkle.d4 { animation-delay: calc(var(--d) + 2.2s); }
.s-draw path, .s-draw ellipse, .s-draw circle { stroke-dasharray: 1; animation: ssDraw 6s ease-in-out var(--d) infinite; }
.s-draw-once { stroke-dasharray: 1; animation: ssDraw 7s ease-in-out var(--d) infinite; }

@keyframes ssFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes ssShadow { 0%, 100% { transform: scaleX(1); opacity: 0.18; } 50% { transform: scaleX(0.82); opacity: 0.1; } }
@keyframes ssDrift { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(8px); } }
@keyframes ssFly { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(8px, -3px); } }
@keyframes ssPulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
@keyframes ssPop { 0%, 100% { transform: scale(0.94) rotate(-3deg); } 50% { transform: scale(1.06) rotate(3deg); } }
@keyframes ssBreathe { 0%, 100% { transform: scale(0.95); } 50% { transform: scale(1.05); } }
@keyframes ssSpin { to { transform: rotate(360deg); } }
@keyframes ssSway { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
@keyframes ssWave { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-30deg); } }
@keyframes ssBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes ssTwinkle { 0%, 100% { opacity: 0.35; transform: scale(0.75); } 50% { opacity: 1; transform: scale(1.1); } }
@keyframes ssDraw { 0% { stroke-dashoffset: 1; } 45%, 85% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 1; } }

@media (prefers-reduced-motion: reduce) {
  .ssa * { animation: none !important; stroke-dashoffset: 0 !important; }
}
</style>
