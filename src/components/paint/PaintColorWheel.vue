<template>
  <!-- 一整块方盘：外圈是色相环，环心嵌色域方块（跟 Procreate / 画世界一个长相）。
       以前是「环在上、方块在下」叠着放，竖向吃掉三百多像素，太占地方。 -->
  <div
    ref="ringWrap"
    class="paint-wheel"
    :style="{ width: `${RING_SIZE}px`, height: `${RING_SIZE}px` }"
    @pointerdown="startRing"
    @pointermove="moveRing"
    @pointerup="endDrag"
    @pointercancel="endDrag"
  >
    <canvas ref="ringCanvas" class="paint-wheel-canvas" aria-hidden="true" />
    <span class="paint-wheel-hue" :style="hueDotStyle" />

    <!-- 色域方块：横着调「浓不浓」，竖着调「亮不亮」。它盖在色环中间，所以点它的时候不能让它冒泡到环上 -->
    <div
      ref="svBox"
      class="paint-wheel-sv"
      :style="svBoxStyle"
      role="slider"
      aria-label="颜色浓淡与明暗，拖动选择"
      :aria-valuetext="hex"
      @pointerdown.stop="startSv"
      @pointermove.stop="moveSv"
      @pointerup.stop="endDrag"
      @pointercancel.stop="endDrag"
    >
      <span class="paint-wheel-sv-dot" :style="svDotStyle" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'

/**
 * 绘图软件那种 HSV 取色器：色相环 + 色域方块。
 * 色相环 0° 在正上方、顺时针增加（和 Krita / 画世界的手感一致）。
 * 组件内部自己维护 h/s/v 三个分量，对外只吐 #rrggbb。
 */
const props = defineProps({
  color: { type: String, default: '#2b3440' },
})
const emit = defineEmits(['change'])

const RING_SIZE = 150
const RING_WIDTH = 14
const RING_MID = (RING_SIZE - RING_WIDTH) / 2
const RING_INNER = RING_MID - RING_WIDTH / 2
const RING_OUTER = RING_MID + RING_WIDTH / 2
/** 环心色域方块的边长。四角离环内圈还要留一点缝，不能顶到环上 */
const SV_SIZE = 80

const ringWrap = ref(null)
const ringCanvas = ref(null)
const svBox = ref(null)

const hue = ref(0)
const sat = ref(0)
const val = ref(0)

/** 'ring' | 'sv' | '' —— 正在拖哪个 */
let dragging = ''

const hex = computed(() => hsvToHex(hue.value, sat.value, val.value))
const hueColor = computed(() => `hsl(${hue.value}, 100%, 50%)`)

const svStyle = computed(() => ({
  // 两层叠出来就是 HSV 方块：横向白→纯色，纵向透明→黑
  background: `linear-gradient(to top, #000000, rgba(0, 0, 0, 0)), linear-gradient(to right, #ffffff, ${hueColor.value})`,
}))

/** 方块边长和居中偏移都从 SV_SIZE 算，CSS 里不再写死尺寸，改常量就够了 */
const svBoxStyle = computed(() => ({
  ...svStyle.value,
  width: `${SV_SIZE}px`,
  height: `${SV_SIZE}px`,
  margin: `${-SV_SIZE / 2}px 0 0 ${-SV_SIZE / 2}px`,
}))

const hueDotStyle = computed(() => {
  const rad = ((hue.value - 90) * Math.PI) / 180
  return {
    left: `${RING_SIZE / 2 + Math.cos(rad) * RING_MID}px`,
    top: `${RING_SIZE / 2 + Math.sin(rad) * RING_MID}px`,
  }
})

const svDotStyle = computed(() => ({
  left: `${sat.value * 100}%`,
  top: `${(1 - val.value) * 100}%`,
}))

function drawRing() {
  const canvas = ringCanvas.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(RING_SIZE * dpr)
  canvas.height = Math.round(RING_SIZE * dpr)
  canvas.style.width = `${RING_SIZE}px`
  canvas.style.height = `${RING_SIZE}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr)
  const center = RING_SIZE / 2
  // 一度一段弧、相邻重叠 0.8°，拼出来看不出接缝
  for (let deg = 0; deg < 360; deg += 1) {
    const from = ((deg - 0.8 - 90) * Math.PI) / 180
    const to = ((deg + 0.8 - 90) * Math.PI) / 180
    ctx.beginPath()
    ctx.arc(center, center, RING_MID, from, to)
    ctx.lineWidth = RING_WIDTH
    ctx.strokeStyle = `hsl(${deg}, 100%, 50%)`
    ctx.stroke()
  }
}

function emitColor() {
  emit('change', hex.value)
}

/** 从指针位置反推色相；返回 false 表示这一下点在了环外面，不算数 */
function ringHueFromEvent(event, checkRadius) {
  const el = ringWrap.value
  if (!el) return false
  const rect = el.getBoundingClientRect()
  const dx = event.clientX - (rect.left + rect.width / 2)
  const dy = event.clientY - (rect.top + rect.height / 2)
  if (checkRadius) {
    const dist = Math.hypot(dx, dy)
    // 中间那块空白和环外面都不接，避免一按就跳色
    if (dist < RING_INNER - 5 || dist > RING_OUTER + 7) return false
  }
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
  hue.value = ((deg % 360) + 360) % 360
  return true
}

function startRing(event) {
  if (!ringHueFromEvent(event, true)) return
  dragging = 'ring'
  try { ringWrap.value?.setPointerCapture(event.pointerId) } catch { /* 指针已失效，忽略 */ }
  emitColor()
}

function moveRing(event) {
  if (dragging !== 'ring') return
  ringHueFromEvent(event, false)
  emitColor()
}

function svFromEvent(event) {
  const el = svBox.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
  sat.value = x / rect.width
  val.value = 1 - y / rect.height
}

function startSv(event) {
  dragging = 'sv'
  try { svBox.value?.setPointerCapture(event.pointerId) } catch { /* 同上 */ }
  svFromEvent(event)
  emitColor()
}

function moveSv(event) {
  if (dragging !== 'sv') return
  svFromEvent(event)
  emitColor()
}

function endDrag(event) {
  if (!dragging) return
  dragging = ''
  try { event.target?.releasePointerCapture?.(event.pointerId) } catch { /* 同上 */ }
}

/**
 * 外部换色（点常用色、画布吸管、系统取色器）时把指针挪过去。
 * ⚠️ 父级会把自己刚收到的颜色原样传回来，这时如果还反推一次，
 * 8bit 量化误差会让指针在拖动过程中一点点往回抖 —— 所以同值直接跳过。
 */
watch(() => props.color, (value) => {
  const next = hexToHsv(value)
  if (!next) return
  if (String(value).toLowerCase() === hex.value.toLowerCase()) return
  // 纯黑 / 纯灰时色相没有意义，保留原来指针位置，别让它一下跳回红色
  if (next.s > 0.004 && next.v > 0.004) hue.value = next.h
  sat.value = next.s
  val.value = next.v
})

onMounted(() => {
  const first = hexToHsv(props.color)
  if (first) {
    hue.value = first.h
    sat.value = first.s
    val.value = first.v
  }
  drawRing()
})

function hsvToHex(h, s, v) {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) { r = c; g = x; b = 0 }
  else if (hp < 2) { r = x; g = c; b = 0 }
  else if (hp < 3) { r = 0; g = c; b = x }
  else if (hp < 4) { r = 0; g = x; b = c }
  else if (hp < 5) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const channel = (n) => Math.round(Math.min(Math.max(n + m, 0), 1) * 255).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function hexToHsv(value) {
  const matched = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim())
  if (!matched) return null
  const int = Number.parseInt(matched[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}
</script>

<style scoped>
.paint-wheel {
  position: relative;
  flex: 0 0 auto;
  /* 触屏拖动时别让页面跟着滚 */
  touch-action: none;
  cursor: crosshair;
}

.paint-wheel-canvas {
  display: block;
  border-radius: 50%;
}

/* 环上的色相指针 */
.paint-wheel-hue {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2.5px solid #fff;
  box-shadow: 0 0 0 1px rgba(31, 41, 55, .3), 0 2px 6px rgba(31, 41, 55, .3);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

/* 色域方块：嵌在环心正中。尺寸和居中偏移由模板里 svBoxStyle 按 SV_SIZE 算出来，这里只管长相 */
.paint-wheel-sv {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 9px;
  touch-action: none;
  cursor: crosshair;
  /* 渐变背景会自动跟着圆角裁，所以不用 overflow:hidden —— 那样边上那个小圆点会被切掉半颗 */
  box-shadow: 0 0 0 1px rgba(31, 41, 55, .12), 0 2px 7px rgba(31, 41, 55, .16);
}

.paint-wheel-sv-dot {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(31, 41, 55, .42), 0 1px 4px rgba(31, 41, 55, .35);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
