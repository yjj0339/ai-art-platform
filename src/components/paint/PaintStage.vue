<template>
  <div
    ref="stageRef"
    class="pb-stage"
    :class="{ 'is-panning': panning, 'is-paint': isPaintTool }"
    :data-paper-rect="paperRectAttr"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerUp"
    @wheel.prevent="onWheel"
  >
    <canvas ref="canvasRef" class="pb-canvas" />

    <div v-if="lassoStyle" class="pb-lasso" :style="lassoStyle">
      <span class="pb-lasso-tag">局部参考区域</span>
    </div>

    <div class="pb-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
        <path d="M11 12V4.5a1.5 1.5 0 0 1 3 0V12" />
        <path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3L4 15.5a1.6 1.6 0 0 1 2.7-1.7L8 15" />
      </svg>
      {{ hintText }}
    </div>

    <!--
      ⚠️ 缩放条必须 .stop 掉 pointerdown：舞台在 pointerdown 里做了 preventDefault（防止
      iPad 长按选中/回弹），事件冒泡上来会把按钮的 click 一起吃掉——表现就是「点缩放、
      点旋转、点适应全都没反应」。这里拦住，别让它传到舞台。
    -->
    <div class="pb-zoombar" @pointerdown.stop @pointerup.stop @click.stop>
      <button class="pb-zbtn" type="button" aria-label="缩小" @click="zoomAtCenter(-1)">−</button>
      <span class="pb-zoom-val">{{ zoomPercent }}%</span>
      <button class="pb-zbtn" type="button" aria-label="放大" @click="zoomAtCenter(1)">+</button>
      <button class="pb-zfit" type="button" @click="fitToScreen">适应</button>
      <span class="pb-zsep" aria-hidden="true" />
      <button
        class="pb-zbtn pb-zrot"
        type="button"
        :title="`画纸旋转（当前 ${rotation}°）`"
        :aria-label="`画纸旋转，当前 ${rotation} 度`"
        @click="emit('rotate')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-3.2-6.9" />
          <path d="M21 3.5V9h-5.5" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizeRotation, rotatedBox } from '../../utils/paintEngine.js'

const props = defineProps({
  doc: { type: Object, default: null },
  tool: { type: String, default: 'brush' },
  brushId: { type: String, default: 'pencil' },
  color: { type: String, default: '#2b3440' },
  size: { type: Number, default: 16 },
  brushOpacity: { type: Number, default: 1 },
  // 画纸旋转角度：0 / 90 / 180 / 270，只转直角
  rotation: { type: Number, default: 0 },
})
const emit = defineEmits(['changed', 'pick-color', 'lasso', 'rotate'])

const MIN_ZOOM = 0.1
const MAX_ZOOM = 6
const MOUSE_PRESSURE = 0.65

const stageRef = ref(null)
const canvasRef = ref(null)
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const stageSize = ref({ w: 0, h: 0 })
const panning = ref(false)
const lassoBox = ref(null)

const isPaintTool = computed(() => ['brush', 'eraser'].includes(props.tool))
const zoomPercent = computed(() => Math.round(scale.value * 100))
const rotation = computed(() => normalizeRotation(props.rotation))
/** 旋转后那张纸在屏幕上占的外框尺寸：转 90° 宽高互换 */
const boxSize = computed(() => {
  const doc = props.doc
  if (!doc) return { w: 0, h: 0 }
  return rotatedBox(doc.width, doc.height, rotation.value)
})
const hintText = computed(() => {
  if (props.tool === 'pan') return '拖拽移动 · 滚轮缩放'
  if (props.tool === 'lasso') return '拖出一个框，让 AI 只改框里的内容'
  if (props.tool === 'picker') return '点画面取色'
  if (props.tool === 'fill') return '点封闭区域填色'
  return '按住拖拽作画 · 空格拖动画面 · 滚轮缩放'
})

/**
 * 屏幕坐标（相对舞台左上角）→ 纸上的坐标。
 * 纸转起来以后鼠标点到的位置和纸上的位置差了整整一个角度，必须逆着转回去，
 * 否则笔迹会以纸中心为轴歪掉（转 90° 时上下笔会变成左右笔）。
 */
function screenToDoc(px, py) {
  const doc = props.doc
  if (!doc) return { x: 0, y: 0 }
  const box = boxSize.value
  const s = scale.value || 1
  let x = (px - offset.value.x) / s - box.w / 2
  let y = (py - offset.value.y) / s - box.h / 2
  if (rotation.value) {
    const rad = (rotation.value * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const rx = x * cos + y * sin
    const ry = -x * sin + y * cos
    x = rx
    y = ry
  }
  return { x: x + doc.width / 2, y: y + doc.height / 2 }
}

/** 纸上的坐标 → 屏幕坐标（相对舞台左上角），套索框摆位置用 */
function docToScreen(x, y) {
  const doc = props.doc
  if (!doc) return { x: 0, y: 0 }
  const box = boxSize.value
  let dx = x - doc.width / 2
  let dy = y - doc.height / 2
  if (rotation.value) {
    const rad = (rotation.value * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const rx = dx * cos - dy * sin
    const ry = dx * sin + dy * cos
    dx = rx
    dy = ry
  }
  return {
    x: offset.value.x + (dx + box.w / 2) * scale.value,
    y: offset.value.y + (dy + box.h / 2) * scale.value,
  }
}

/**
 * 把纸在屏幕上真实占的那块矩形暴露到 DOM 上（相对舞台左上角）：
 * 调试、自动化验收都要靠它，别再靠截图扫白色像素去猜——缩放条、提示条也是白的，一猜就错。
 */
const paperRectAttr = computed(() => {
  const box = boxSize.value
  if (!box.w || !box.h) return ''
  const s = scale.value || 1
  const x = Math.round(offset.value.x)
  const y = Math.round(offset.value.y)
  const w = Math.round(box.w * s)
  const h = Math.round(box.h * s)
  return `${x},${y},${w},${h}`
})

const lassoStyle = computed(() => {
  const box = lassoBox.value
  if (!box) return null
  // 框在纸上是个矩形，转 90° 后它在屏幕上依然是轴对齐的矩形（只是宽高互换），
  // 所以四个角各自换算一遍再取包围盒就够了，不用给 div 加 transform。
  const corners = [
    docToScreen(box.x, box.y),
    docToScreen(box.x + box.w, box.y),
    docToScreen(box.x + box.w, box.y + box.h),
    docToScreen(box.x, box.y + box.h),
  ]
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${Math.max(6, Math.max(...xs) - left)}px`,
    height: `${Math.max(6, Math.max(...ys) - top)}px`,
  }
})

let ctx = null
let dpr = 1
let frame = 0
let resizeObserver = null
let drawing = false
let activePointerId = null
let panOrigin = null
let lassoOrigin = null
let spaceDown = false

function scheduleRender() {
  if (frame) return
  frame = window.requestAnimationFrame(() => {
    frame = 0
    draw()
  })
}

function draw() {
  const doc = props.doc
  if (!doc || !ctx || !stageSize.value.w || !stageSize.value.h) return
  doc.render(
    ctx,
    stageSize.value.w,
    stageSize.value.h,
    dpr,
    { tx: offset.value.x, ty: offset.value.y, scale: scale.value, rotation: rotation.value },
    { paperShadow: true },
  )
}

function syncCanvasBox() {
  const stage = stageRef.value
  const canvas = canvasRef.value
  if (!stage || !canvas) return
  const rect = stage.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  const nextDpr = Math.min(2.5, window.devicePixelRatio || 1)
  stageSize.value = { w, h }
  dpr = nextDpr
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  scheduleRender()
}

function clampScale(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function fitToScreen() {
  const doc = props.doc
  const { w, h } = stageSize.value
  if (!doc || !w || !h) return
  // 按「旋转后的外框」算，不是按纸本身的宽高——转成横的以后要按 600×480 来放
  const box = boxSize.value
  const pad = Math.min(64, Math.max(24, Math.round(Math.min(w, h) * 0.09)))
  const next = clampScale(Math.min((w - pad * 2) / box.w, (h - pad * 2) / box.h))
  scale.value = next
  offset.value = { x: (w - box.w * next) / 2, y: (h - box.h * next) / 2 }
  scheduleRender()
}

/**
 * 等下一次舞台尺寸变化之后，自动重新居中适配一次。
 *
 * 为什么需要：进/出画纸全屏时版式从两栏变一栏，父组件没法知道新的尺寸什么时候回填到
 * stageSize —— 固定延时（哪怕 60ms）经常赶在上面的 ResizeObserver 之前跑，
 * fitToScreen 会拿旧宽度算偏移，纸就缩在左上角。所以把「再适配一次」挂到尺寸变化事件上。
 * withinMs 是保险丝：万一尺寸压根没变（比如本来就是单列），别把这面旗留到下次误触发。
 */
let autoFitToken = 0
function fitOnNextResize(withinMs = 1200) {
  const token = autoFitToken + 1
  autoFitToken = token
  window.setTimeout(() => {
    if (autoFitToken === token) autoFitToken = 0
  }, withinMs)
}

function zoomAtPoint(clientX, clientY, nextScale) {
  const stage = stageRef.value
  if (!stage) return
  const rect = stage.getBoundingClientRect()
  const px = clientX - rect.left
  const py = clientY - rect.top
  // 记住鼠标底下「纸上那一点」，缩放完把它按回原位——纸转了也照样锚得住
  const anchor = screenToDoc(px, py)
  scale.value = clampScale(nextScale)
  const after = docToScreen(anchor.x, anchor.y)
  offset.value = { x: offset.value.x + (px - after.x), y: offset.value.y + (py - after.y) }
  scheduleRender()
}

function zoomAtCenter(direction) {
  const { w, h } = stageSize.value
  const factor = direction > 0 ? 1.2 : 1 / 1.2
  zoomAtPoint(w / 2, h / 2, scale.value * factor)
}

function onWheel(event) {
  const factor = Math.exp(-event.deltaY * 0.0016)
  zoomAtPoint(event.clientX, event.clientY, scale.value * factor)
}

function toDocPoint(event) {
  const stage = stageRef.value
  if (!stage) return { x: 0, y: 0 }
  const rect = stage.getBoundingClientRect()
  return screenToDoc(event.clientX - rect.left, event.clientY - rect.top)
}

function pressureOf(event) {
  if (event.pointerType === 'pen') {
    const value = Number(event.pressure)
    return Number.isFinite(value) && value > 0 ? Math.min(1, value) : 0.5
  }
  return MOUSE_PRESSURE
}

function startPan(event) {
  panning.value = true
  activePointerId = event.pointerId
  panOrigin = { x: event.clientX, y: event.clientY, ox: offset.value.x, oy: offset.value.y }
  capturePointer(event.pointerId)
}

function capturePointer(pointerId) {
  const canvas = canvasRef.value
  try {
    canvas?.setPointerCapture?.(pointerId)
  } catch {
    // 某些浏览器在指针已释放时会抛错，忽略即可，不影响后续绘制。
  }
}

function startStroke(event) {
  const doc = props.doc
  if (!doc) return
  const point = toDocPoint(event)
  const ok = doc.beginStroke({
    x: point.x,
    y: point.y,
    pressure: pressureOf(event),
    brushId: props.tool === 'eraser' ? 'eraser' : props.brushId,
    color: props.color,
    size: props.size,
    opacity: props.tool === 'eraser' ? 1 : props.brushOpacity,
  })
  if (!ok) return
  drawing = true
  activePointerId = event.pointerId
  capturePointer(event.pointerId)
  scheduleRender()
}

function onPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button === 1) {
    startPan(event)
    return
  }
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const doc = props.doc
  if (!doc) return
  event.preventDefault()

  if (props.tool === 'pan' || spaceDown) {
    startPan(event)
    return
  }

  if (props.tool === 'picker') {
    const point = toDocPoint(event)
    const hex = doc.pickColor(point.x, point.y)
    if (hex) emit('pick-color', hex)
    return
  }

  if (props.tool === 'fill') {
    const point = toDocPoint(event)
    if (doc.fill(point.x, point.y, props.color)) {
      emit('changed')
      scheduleRender()
    }
    return
  }

  if (props.tool === 'lasso') {
    lassoOrigin = toDocPoint(event)
    lassoBox.value = null
    activePointerId = event.pointerId
    capturePointer(event.pointerId)
    return
  }

  startStroke(event)
}

function onPointerMove(event) {
  if (panning.value && panOrigin) {
    offset.value = {
      x: panOrigin.ox + (event.clientX - panOrigin.x),
      y: panOrigin.oy + (event.clientY - panOrigin.y),
    }
    scheduleRender()
    return
  }

  if (lassoOrigin) {
    const point = toDocPoint(event)
    lassoBox.value = {
      x: Math.min(lassoOrigin.x, point.x),
      y: Math.min(lassoOrigin.y, point.y),
      w: Math.abs(point.x - lassoOrigin.x),
      h: Math.abs(point.y - lassoOrigin.y),
    }
    return
  }

  if (!drawing) return
  const doc = props.doc
  if (!doc) return
  const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event]
  const points = events.length ? events : [event]
  for (const item of points) {
    const point = toDocPoint(item)
    doc.pushPoint(point.x, point.y, pressureOf(item))
  }
  scheduleRender()
}

function onPointerUp(event) {
  if (panning.value) {
    panning.value = false
    panOrigin = null
    activePointerId = null
    return
  }

  if (lassoOrigin) {
    const box = lassoBox.value
    lassoOrigin = null
    if (box && box.w > 12 && box.h > 12) {
      emit('lasso', box)
    } else {
      lassoBox.value = null
    }
    return
  }

  if (!drawing) return
  drawing = false
  props.doc?.endStroke()
  const canvas = canvasRef.value
  if (activePointerId != null) {
    try {
      canvas?.releasePointerCapture?.(activePointerId)
    } catch {
      // 指针已经释放，忽略。
    }
  }
  activePointerId = null
  emit('changed')
  scheduleRender()
}

function handleKeyDown(event) {
  if (event.code === 'Space' && !event.repeat) {
    const target = event.target
    const isField = target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')
    if (!isField) {
      spaceDown = true
      event.preventDefault()
    }
  }
}

function handleKeyUp(event) {
  if (event.code === 'Space') spaceDown = false
}

function clearLasso() {
  lassoBox.value = null
}

watch(() => props.doc, (doc) => {
  if (!doc) return
  lassoBox.value = null
  syncCanvasBox()
  fitToScreen()
})

watch(() => props.tool, (tool) => {
  if (tool !== 'lasso') lassoBox.value = null
})

// 转完纸要重新适配：横过来的纸比舞台高，不 fit 会顶出屏幕，用户就以为画丢了
watch(() => props.rotation, () => {
  lassoBox.value = null
  fitToScreen()
})

onMounted(() => {
  syncCanvasBox()
  fitToScreen()
  if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
    resizeObserver = new ResizeObserver(() => {
      syncCanvasBox()
      // 有人提前预约了「尺寸变了就重新适应」（画纸全屏切换）时，这里补这一刀
      if (autoFitToken) {
        autoFitToken = 0
        fitToScreen()
      }
    })
    resizeObserver.observe(stageRef.value)
  }
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onBeforeUnmount(() => {
  if (frame) window.cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
})

defineExpose({ fitToScreen, fitOnNextResize, zoomAtCenter, clearLasso, refresh: scheduleRender })
</script>

<style scoped lang="scss">
.pb-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  background:
    radial-gradient(circle at 1px 1px, rgba(31, 41, 55, .11) 1px, transparent 0) 0 0 / 22px 22px,
    linear-gradient(168deg, #eef3fa, #e2e9f4);
}
.pb-stage.is-panning { cursor: grabbing; }
.pb-stage.is-paint { cursor: crosshair; }
.pb-canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }

.pb-lasso {
  position: absolute;
  border: 1.5px dashed var(--color-primary);
  background: rgba(108, 92, 231, .08);
  border-radius: 2px;
  pointer-events: none;
  z-index: 4;
}
.pb-lasso-tag {
  position: absolute;
  left: 0;
  top: -20px;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.pb-hint {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .84);
  box-shadow: 0 3px 10px rgba(31, 41, 55, .08);
  font-size: 10.5px;
  color: #6b7684;
  pointer-events: none;
  z-index: 5;
}
.pb-hint svg { width: 12px; height: 12px; color: var(--color-primary); }

.pb-zoombar {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 11px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 4px 16px rgba(31, 41, 55, .1);
  border: 1px solid rgba(31, 41, 55, .05);
  z-index: 5;
}
.pb-zbtn {
  width: 26px;
  min-height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #6b7684;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.pb-zbtn:hover { background: #f2f5f9; color: var(--color-title); }
.pb-zoom-val {
  min-width: 48px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-title);
  font-variant-numeric: tabular-nums;
}
.pb-zfit {
  min-height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #6b7684;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
}
.pb-zfit:hover { background: #f2f5f9; color: var(--color-primary); }
.pb-zsep {
  width: 1px;
  height: 14px;
  margin: 0 3px;
  background: rgba(31, 41, 55, .1);
}
.pb-zrot { display: grid; place-items: center; }
.pb-zrot svg { width: 13px; height: 13px; }
.pb-zrot:hover { background: #f2f5f9; color: var(--color-primary); }
</style>
