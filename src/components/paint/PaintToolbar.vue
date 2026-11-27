<template>
  <aside class="paint-tools" aria-label="画布工具">
    <button
      v-for="item in TOOLS"
      :key="item.id"
      type="button"
      class="paint-tool"
      :class="{ 'is-active': tool === item.id }"
      :title="item.title"
      :aria-pressed="tool === item.id"
      @click="onToolClick(item.id)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" v-html="item.icon" />
    </button>

    <div class="paint-tool-sep" />

    <!-- 颜色是独立工具：点它只开颜色面板，不再借道画笔浮层（老版本两者共用一个 popOpen，是 BUG）。
         面板位置按这个按钮的实际位置算，箭头才会指到它身上。 -->
    <button
      ref="colorBtn"
      type="button"
      class="paint-color-btn"
      :class="{ 'is-open': colorOpen }"
      :style="{ background: color }"
      :title="`颜色 ${String(color).toUpperCase()}（点开换色）`"
      :aria-label="`颜色工具，当前 ${color}`"
      aria-haspopup="dialog"
      :aria-expanded="colorOpen"
      @click="toggleColorPanel"
    />

    <div class="paint-tool-sep" />

    <!-- 画纸旋转：只转看的方向，纸上的画一点不动（转 90° 后接着画，墨还在笔尖下）。
         放在左侧工具栏最显眼的位置，别让人再去画布右下角找小图标。 -->
    <button
      type="button"
      class="paint-tool paint-rot-btn"
      :class="{ 'is-turned': rotation }"
      :title="rotation ? `画纸已转 ${rotation}°，点一下再转 90°` : '画纸旋转 90°（横过来画）'"
      :aria-label="rotation ? `画纸旋转，当前 ${rotation} 度，点一下再转 90 度` : '画纸旋转 90 度'"
      @click="emit('rotate')"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.5 12a8.5 8.5 0 1 1-2.9-6.35" />
        <path d="M20.5 3.6V9h-5.4" />
      </svg>
      <span v-if="rotation" class="paint-rot-deg">{{ rotation }}°</span>
    </button>

    <div v-if="brushOpen" class="paint-brush-pop" role="dialog" aria-label="选择画笔">
      <div class="paint-bp-head">
        <b>画笔</b>
        <span>{{ brushes.length }} 种</span>
        <button type="button" class="paint-bp-close" aria-label="收起" @click="brushOpen = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="paint-bp-list">
        <button
          v-for="item in brushes"
          :key="item.id"
          type="button"
          class="paint-brush"
          :class="{ 'is-active': brushId === item.id }"
          @click="pickBrush(item.id)"
        >
          <span class="paint-brush-prev">
            <svg :class="['paint-bs', item.previewClass]" viewBox="0 0 70 22"><path :d="item.previewPath" /></svg>
          </span>
          <span class="paint-brush-info">
            <b>{{ item.name }}</b>
            <span>{{ item.note }}</span>
          </span>
        </button>
      </div>

      <div class="paint-bp-foot">
        <div class="paint-bp-size-row">
          <span>笔刷粗细</span>
          <b>{{ size }} px</b>
        </div>
        <input
          type="range"
          min="1"
          max="90"
          :value="size"
          aria-label="笔刷粗细"
          @input="emit('update:size', Number($event.target.value))"
        />
        <div class="paint-bp-colors">
          <button
            v-for="swatch in palette"
            :key="swatch"
            type="button"
            class="paint-sw"
            :class="{ 'is-active': color.toLowerCase() === swatch.toLowerCase() }"
            :style="{ background: swatch }"
            :aria-label="`颜色 ${swatch}`"
            @click="applyColor(swatch)"
          />
        </div>
        <button type="button" class="paint-bp-more" @click="openColorPanel">
          更多颜色<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>
    </div>

    <div
      v-if="colorOpen"
      class="paint-color-pop"
      role="dialog"
      aria-label="选择颜色"
      :style="{ top: `${colorPopTop}px`, maxHeight: `calc(100% - ${colorPopTop + 12}px)` }"
    >
      <div class="paint-bp-head">
        <b>颜色</b>
        <!-- 系统取色器挪到标题栏，省掉最底下那一整行，面板又能矮 56px -->
        <label class="paint-cp-custom" title="调出系统取色器">
          <input type="color" :value="color" aria-label="自定义取色" @input="onCustomColor" />
          <span>自己调</span>
        </label>
        <button type="button" class="paint-bp-close" aria-label="收起" @click="colorOpen = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <!-- 左边取色器、右边快捷色：并排之后面板矮一半，色环和色块不用滚动就能同时看到 -->
      <div class="paint-cp-main">
        <!-- 取色器主体：色环选色相 + 方块调浓淡明暗，跟画图软件一个手感 -->
        <div class="paint-cp-picker">
          <PaintColorWheel :color="color" @change="applyColor" />
          <div class="paint-cp-actions">
            <button type="button" class="paint-cp-pick" title="点一下，再去画纸上点哪儿就取哪儿的色" @click="onPickFromCanvas">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="m17.5 3.5 3 3-9.6 9.6-3.9.9.9-3.9 9.6-9.6Z" />
                <path d="m14.4 6.6 3 3" />
                <path d="M5 20l3-1" />
              </svg>
              <span>吸管取色</span>
            </button>
            <span class="paint-cp-now">{{ String(color).toUpperCase() }}</span>
          </div>
        </div>

        <div class="paint-cp-body">
          <p class="paint-cp-title">常用色</p>
          <div class="paint-cp-grid">
            <button
              v-for="swatch in palette"
              :key="`常用-${swatch}`"
              type="button"
              class="paint-cp-sw"
              :class="{ 'is-active': sameColor(swatch) }"
              :style="{ background: swatch }"
              :aria-label="`颜色 ${swatch}`"
              :aria-pressed="sameColor(swatch)"
              @click="applyColor(swatch)"
            />
          </div>

          <p class="paint-cp-title">更多颜色</p>
          <div class="paint-cp-grid">
            <button
              v-for="swatch in EXTRA_COLORS"
              :key="`更多-${swatch}`"
              type="button"
              class="paint-cp-sw"
              :class="{ 'is-active': sameColor(swatch) }"
              :style="{ background: swatch }"
              :aria-label="`颜色 ${swatch}`"
              :aria-pressed="sameColor(swatch)"
              @click="applyColor(swatch)"
            />
          </div>

          <template v-if="recentColors.length">
            <p class="paint-cp-title">最近用过</p>
            <div class="paint-cp-grid">
              <button
                v-for="swatch in recentColors"
                :key="`最近-${swatch}`"
                type="button"
                class="paint-cp-sw"
                :class="{ 'is-active': sameColor(swatch) }"
                :style="{ background: swatch }"
                :aria-label="`颜色 ${swatch}`"
                :aria-pressed="sameColor(swatch)"
                @click="applyColor(swatch)"
              />
            </div>
          </template>
        </div>
      </div>
    </div>

    <svg class="paint-fx-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <filter id="paintFxWater" x="-20%" y="-60%" width="140%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="paintFxGrain" x="-20%" y="-60%" width="140%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  </aside>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BRUSH_LIST, PALETTE, normalizeRotation } from '../../utils/paintEngine'
import PaintColorWheel from './PaintColorWheel.vue'

const props = defineProps({
  tool: { type: String, default: 'brush' },
  brushId: { type: String, default: 'pencil' },
  color: { type: String, default: '#2b3440' },
  size: { type: Number, default: 16 },
  rotation: { type: Number, default: 0 },
})
const emit = defineEmits(['update:tool', 'update:brushId', 'update:color', 'update:size', 'rotate'])

const palette = PALETTE
/** 画笔浮层 / 颜色面板各自一个状态，互不顶替（以前共用 popOpen，点颜色弹的是画笔，是 BUG） */
const brushOpen = ref(false)
const colorOpen = ref(false)
const colorBtn = ref(null)
const colorPopTop = ref(10)
/** 只认 0/90/180/270；非整数角度一律吸附，避免角标显示 89.9999° */
const rotation = computed(() => normalizeRotation(props.rotation))

const TOOLS = [
  {
    id: 'brush',
    title: '画笔（点开选择笔刷）',
    icon: '<path d="m14.6 4.6 4.8 4.8L8.2 20.6 3 21l.4-5.2L14.6 4.6Z"/><path d="m12.8 6.4 4.8 4.8"/>',
  },
  {
    id: 'eraser',
    title: '橡皮',
    icon: '<path d="m4 16 6.5-6.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L13 19H7l-3-3Z"/><path d="m9 11 5 5"/>',
  },
  {
    id: 'fill',
    title: '填充',
    icon: '<path d="M5 12.5 12.5 5l6 6-7.5 7.5-6-6Z"/><path d="M9 8.5 6.5 6"/><path d="M19.5 16s1.5 1.8 1.5 3a1.5 1.5 0 0 1-3 0c0-1.2 1.5-3 1.5-3Z"/>',
  },
  {
    id: 'lasso',
    title: '套索（圈住区域让 AI 只改这里）',
    icon: '<path d="M4 12c0-3.3 3.6-6 8-6s8 2.7 8 6-3.6 6-8 6c-1.6 0-3.1-.3-4.4-.9"/><path d="M7.6 17.2c-.7.9-1 1.7-1 2.3M4.4 16.4c-.3.8-.3 1.6 0 2.3"/>',
  },
  {
    id: 'pan',
    title: '移动 / 抓手',
    icon: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 12V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3L4 15.5a1.6 1.6 0 0 1 2.7-1.7L8 15"/>',
  },
  {
    id: 'picker',
    title: '吸管取色',
    icon: '<path d="m17.5 3.5 3 3-9.6 9.6-3.9.9.9-3.9 9.6-9.6Z"/><path d="m14.4 6.6 3 3"/><path d="M5 20l3-1"/>',
  },
]

/**
 * 颜色面板的「更多颜色」：按灰阶 → 暖色 → 绿蓝 → 紫粉肤色排四排，
 * 7 列正好整除，最后一行不会孤零零剩几个。
 */
const EXTRA_COLORS = [
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#ffffff',
  '#7f1d1d', '#ef4444', '#f97316', '#f59e0b', '#facc15', '#fde68a', '#fff7ed',
  '#14532d', '#22c55e', '#84cc16', '#14b8a6', '#06b6d4', '#3b82f6', '#1e3a8a',
  '#6d28d9', '#a855f7', '#ec4899', '#f43f5e', '#8d5524', '#c68642', '#eab68f',
]

/** 最近用过的颜色存本地，下次打开还在（最多 12 个，新的排前面） */
const RECENT_KEY = 'art-studio-paint-recent-colors'
const recentColors = ref(loadRecent())

function loadRecent() {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.filter((item) => /^#[0-9a-f]{6}$/i.test(String(item))).slice(0, 12)
  } catch {
    return []
  }
}

function sameColor(value) {
  return String(props.color || '').toLowerCase() === String(value || '').toLowerCase()
}

/** 换色统一走这里：通知父级 + 记进「最近用过」 */
function applyColor(value) {
  const next = String(value || '').trim()
  if (!next) return
  emit('update:color', next)
  const list = [next, ...recentColors.value.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 12)
  recentColors.value = list
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* 隐私模式写不进去，不影响换色 */ }
}

function onCustomColor(event) {
  applyColor(event.target?.value)
}

/** 颜色面板整块大约多高（色环那一列撑出来的）。只用来判断屏幕放不放得下。
 *  标题栏 42 + 色环 150 + 吸管那排 34 + 内边距 ≈ 250，留 270 的判断余量 */
const COLOR_POP_HEIGHT = 270

/** 颜色面板贴着工具栏上的颜色按钮展开，所以面板的 top 得按按钮实际位置算 */
function syncColorPopTop() {
  const el = colorBtn.value
  const body = el?.closest('.paint-board-body')
  if (!el || !body) return
  const rect = el.getBoundingClientRect()
  const bodyRect = body.getBoundingClientRect()
  // 箭头（面板顶往下 26px）要指着按钮中心，所以面板顶比按钮中心高 34px
  let top = Math.round(rect.top - bodyRect.top + rect.height / 2 - 34)
  // 小横屏（比如 520 高）下方只剩两百来像素，此时宁可把面板整体上提、箭头偏一点，
  // 也不能让色环被屏幕下沿裁掉半截
  const room = bodyRect.height - 12
  if (room - top < COLOR_POP_HEIGHT) top = room - COLOR_POP_HEIGHT
  colorPopTop.value = Math.max(10, top)
}

function toggleColorPanel() {
  colorOpen.value = !colorOpen.value
  brushOpen.value = false
  if (colorOpen.value) nextTick(syncColorPopTop)
}

function openColorPanel() {
  brushOpen.value = false
  colorOpen.value = true
  nextTick(syncColorPopTop)
}

/**
 * 吸管：收起面板、把工具切到「吸管」，接下来在画纸上点哪儿就取哪儿的色。
 * 取完色由画板统一切回画笔（PaintBoard.onPickColor），不用手动再切。
 */
function onPickFromCanvas() {
  closeAll()
  emit('update:tool', 'picker')
}

function closeAll() {
  brushOpen.value = false
  colorOpen.value = false
}

/** 每种笔刷一句话 + 一条示意曲线。曲线按笔刷特征换粗细/虚线/滤镜，和真实笔感对得上。 */
const PREVIEW = {
  pencil: { cls: 'paint-bs-pencil', path: 'M3 15c6-8 11 4 17-2s9 5 15-1 11 5 16-3 10 4 15-2' },
  colorpencil: { cls: 'paint-bs-colyar', path: 'M3 15c6-8 11 4 17-2s9 5 15-1 11 5 16-3 10 4 15-2' },
  marker: { cls: 'paint-bs-marker', path: 'M3 14c6-7 11 4 17-1s9 5 15-1 11 5 16-2 10 3 15-1' },
  watercolor: { cls: 'paint-bs-water', path: 'M3 14c6-7 11 4 17-1s9 5 15-1 11 5 16-2 10 3 15-1' },
  crayon: { cls: 'paint-bs-crayon', path: 'M3 15c6-8 11 4 17-2s9 5 15-1 11 5 16-3 10 4 15-2' },
  oilpastel: { cls: 'paint-bs-oil', path: 'M3 14c6-7 11 4 17-1s9 5 15-1 11 5 16-2 10 3 15-1' },
  airbrush: { cls: 'paint-bs-air', path: 'M3 14c6-7 11 4 17-1s9 5 15-1 11 5 16-2 10 3 15-1' },
  ink: { cls: 'paint-bs-ink', path: 'M3 15c6-8 11 4 17-2s9 5 15-1 11 5 16-3 10 4 15-2' },
  brushpen: { cls: 'paint-bs-brush', path: 'M4 16c7-9 10 4 16-2s10 5 15-2 10 4 15-3 7 3 11-1' },
  chalk: { cls: 'paint-bs-chalk', path: 'M3 14c6-7 11 4 17-1s9 5 15-1 11 5 16-2 10 3 15-1' },
  sponge: { cls: 'paint-bs-sponge', path: 'M4 13c6-6 10 3 16-1s9 4 14-1 10 4 15-2 9 3 14-1' },
}

const brushes = BRUSH_LIST.map((item) => {
  const preview = PREVIEW[item.id] || PREVIEW.pencil
  return { id: item.id, name: item.name, note: item.note, previewClass: preview.cls, previewPath: preview.path }
})

function onToolClick(id) {
  if (id === 'brush') {
    brushOpen.value = !brushOpen.value
    colorOpen.value = false
    emit('update:tool', 'brush')
    return
  }
  closeAll()
  emit('update:tool', id)
}

function pickBrush(id) {
  emit('update:brushId', id)
  emit('update:tool', 'brush')
}

function onDocPointerDown(event) {
  const root = event.target instanceof Element ? event.target.closest('.paint-tools') : null
  if (root) return
  closeAll()
}

const anyOpen = computed(() => brushOpen.value || colorOpen.value)

watch(anyOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onDocPointerDown, true)
  else document.removeEventListener('pointerdown', onDocPointerDown, true)
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown, true))

defineExpose({
  openPanel: () => { brushOpen.value = true; colorOpen.value = false },
  closePanel: closeAll,
  openColorPanel,
})
</script>

<style scoped>
.paint-tools {
  width: 56px;
  flex: 0 0 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 0;
  border-right: 1px solid var(--pb-line, #e5e7eb);
  background: #fdfdff;
  z-index: 8;
}

.paint-tool {
  width: 40px;
  height: 40px;
  min-height: 0;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: #6b7684;
  transition: .16s cubic-bezier(.22, .61, .36, 1);
  position: relative;
  /* 全局只约定了 button 的最小高度，没有重置外观；不写这两行会露出浏览器默认的深色描边 + 灰底 */
  border: 0;
  background: none;
  cursor: pointer;
}
.paint-tool svg { width: 19px; height: 19px; }
.paint-tool:hover { background: #f4f6fa; color: #1f2937; }
.paint-tool.is-active {
  background: #f3f1ff;
  color: #6c5ce7;
  box-shadow: inset 0 0 0 1px rgba(108, 92, 231, .24);
}
.paint-tool.is-active svg { stroke-width: 2; }

.paint-tool-sep { width: 26px; height: 1px; background: var(--pb-line, #e5e7eb); margin: 7px 0; }

.paint-color-btn {
  width: 30px;
  height: 30px;
  min-height: 0;
  border-radius: 50%;
  margin-top: 2px;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(31, 41, 55, .16), 0 4px 10px rgba(31, 41, 55, .16);
  transition: .16s cubic-bezier(.22, .61, .36, 1);
  cursor: pointer;
}
.paint-color-btn:hover { transform: scale(1.08); }
/* 面板开着的时候套一圈橙环，和选中工具的橙色标记一致，一眼看出「这个面板是它开出来的」 */
.paint-color-btn.is-open {
  box-shadow: 0 0 0 2px #6c5ce7, 0 0 0 4px #fff, 0 4px 10px rgba(31, 41, 55, .2);
}

/* 画纸旋转按钮：转过之后变橙色 + 右上角挂一个角度小角标，一眼就知道「现在是横的」 */
.paint-rot-btn svg { width: 20px; height: 20px; }
.paint-rot-btn.is-turned {
  color: #6c5ce7;
  background: #f3f1ff;
  box-shadow: inset 0 0 0 1px rgba(108, 92, 231, .24);
}
.paint-rot-btn:active { transform: scale(.94); }
.paint-rot-deg {
  position: absolute;
  top: -3px;
  right: -5px;
  height: 13px;
  min-width: 21px;
  padding: 0 3px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: #6c5ce7;
  color: #fff;
  font-size: 8.5px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 1px 4px rgba(108, 92, 231, .45);
  pointer-events: none;
}

/* 浮层：定位相对 .paint-board-body（父级 position:relative），所以 left:60px 就是工具栏右边 */
.paint-brush-pop,
.paint-color-pop {
  position: absolute;
  left: 60px;
  top: 10px;
  z-index: 40;
  width: 238px;
  max-height: min(566px, calc(100% - 20px));
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid rgba(31, 41, 55, .09);
  border-radius: 16px;
  box-shadow: 0 26px 58px rgba(31, 41, 55, .22), 0 3px 10px rgba(31, 41, 55, .07);
  overflow: visible;
}
/* 颜色面板：左边色环 + 右边快捷色并排。高度上限由模板内联 maxHeight 控制（跟着按钮位置算） */
.paint-color-pop {
  /* 左栏 174 + 右栏 ≈174，比原来 372 窄一圈，小屏也不至于顶到画纸 */
  width: 352px;
}
.paint-brush-pop::before,
.paint-color-pop::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 26px;
  width: 11px;
  height: 11px;
  background: #fff;
  border-left: 1px solid rgba(31, 41, 55, .09);
  border-bottom: 1px solid rgba(31, 41, 55, .09);
  transform: rotate(45deg);
}

.paint-bp-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 12px 9px;
  border-bottom: 1px solid rgba(31, 41, 55, .06);
  flex: 0 0 auto;
}
.paint-bp-head b { font-size: 12.5px; color: #1f2937; font-weight: 700; }
.paint-bp-head span { font-size: 10px; color: #9ca3af; background: #f1f4f9; padding: 1.5px 6px; border-radius: 5px; }
/* 色值：跟在吸管按钮后面同一排 */
.paint-cp-now {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 6px;
  background: #f1f4f9;
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
  color: #6b7684;
}
.paint-bp-close {
  margin-left: auto;
  width: 22px;
  height: 22px;
  min-height: 0;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: #a4aebc;
  /* 同上：不显式清掉 border/background 会露出浏览器默认按钮外观 */
  border: 0;
  background: none;
  cursor: pointer;
}
.paint-bp-close:hover { background: #f3f5f9; color: #1f2937; }
.paint-bp-close svg { width: 12px; height: 12px; }

.paint-bp-list {
  overflow-y: auto;
  min-height: 0;
  padding: 5px 6px 7px;
  scrollbar-width: thin;
}
.paint-bp-list::-webkit-scrollbar { width: 6px; }
.paint-bp-list::-webkit-scrollbar-thumb { background: #dbe2ec; border-radius: 3px; }
.paint-bp-list::-webkit-scrollbar-track { background: transparent; }

.paint-brush {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 0;
  padding: 7px 8px;
  border-radius: 10px;
  transition: .14s cubic-bezier(.22, .61, .36, 1);
  border: 0;
  background: none;
  cursor: pointer;
}
.paint-brush:hover { background: #f5f7fb; }
.paint-brush.is-active { background: #f3f1ff; box-shadow: inset 0 0 0 1px rgba(108, 92, 231, .28); }

.paint-brush-prev {
  width: 72px;
  height: 22px;
  flex: 0 0 72px;
  display: grid;
  place-items: center;
  color: #3d4753;
}
.paint-brush-prev svg { width: 70px; height: 22px; display: block; }

.paint-brush-info { display: flex; flex-direction: column; min-width: 0; text-align: left; }
.paint-brush-info b { font-size: 11.5px; color: #1f2937; font-weight: 600; white-space: nowrap; line-height: 1.35; }
.paint-brush-info span { font-size: 9.5px; color: #9ca3af; line-height: 1.3; white-space: nowrap; }

.paint-bs path { fill: none; stroke: currentColor; stroke-linecap: round; }
.paint-bs-pencil path { stroke-width: 1.5; opacity: .62; }
.paint-bs-colyar path { stroke-width: 2.1; opacity: .55; stroke-dasharray: 2.4 1.5; }
.paint-bs-marker path { stroke-width: 5.5; stroke-linecap: butt; opacity: .85; }
.paint-bs-water path { stroke-width: 7; opacity: .42; filter: url(#paintFxWater); }
.paint-bs-crayon path { stroke-width: 6; opacity: .72; filter: url(#paintFxGrain); }
.paint-bs-oil path { stroke-width: 7; stroke-linecap: butt; opacity: .9; stroke-dasharray: 10 2.6; }
.paint-bs-air path { stroke-width: 9; opacity: .34; stroke-dasharray: .6 3.6; }
.paint-bs-ink path { stroke-width: 1.4; opacity: .92; }
.paint-bs-brush path { stroke-width: 4.4; opacity: .86; filter: url(#paintFxWater); }
.paint-bs-chalk path { stroke-width: 5.5; opacity: .5; stroke-dasharray: 3.2 2; filter: url(#paintFxGrain); }
.paint-bs-sponge path { stroke-width: 9; opacity: .36; stroke-dasharray: 1.2 4.2; filter: url(#paintFxGrain); }

.paint-bp-foot {
  padding: 9px 12px 11px;
  border-top: 1px solid rgba(31, 41, 55, .06);
  background: #fcfdff;
  border-radius: 0 0 16px 16px;
  flex: 0 0 auto;
}
.paint-bp-size-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.paint-bp-size-row span { font-size: 10.5px; font-weight: 600; color: #6b7684; }
.paint-bp-size-row b { font-size: 10.5px; color: #1f2937; font-variant-numeric: tabular-nums; }
/* ⚠️ 只写 accent-color 的话，未填充轨道在无头 Chrome 里会渲染成一整条深黑粗棒（和参考强度滑块同一个坑）。
   这里必须自己接管轨道和滑块，轨道才会是浅灰色。 */
.paint-bp-foot input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
  margin: 0 0 6px;
  background: transparent;
  cursor: pointer;
}
.paint-bp-foot input[type='range']::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: #e6eaf2;
}
.paint-bp-foot input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 50%;
  background: #6c5ce7;
  box-shadow: 0 1px 3px rgba(108, 92, 231, .45);
}
.paint-bp-foot input[type='range']::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: #e6eaf2;
}
.paint-bp-foot input[type='range']::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 0;
  border-radius: 50%;
  background: #6c5ce7;
}
.paint-bp-colors { display: flex; align-items: center; gap: 7px; }
.paint-sw {
  width: 18px;
  height: 18px;
  min-height: 0;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(31, 41, 55, .14);
  transition: .16s;
}
.paint-sw:hover { transform: scale(1.12); }
.paint-sw.is-active { box-shadow: 0 0 0 2px #6c5ce7; }

/* 「更多颜色」：从画笔浮层跳进独立颜色面板的那扇门 */
.paint-bp-more {
  width: 100%;
  min-height: 0;
  margin-top: 8px;
  padding: 5px 0 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 10.5px;
  font-weight: 600;
  color: #6c5ce7;
  border-radius: 8px;
  border: 0;
  background: none;
  cursor: pointer;
}
.paint-bp-more:hover { background: #f3f1ff; }
.paint-bp-more svg { width: 11px; height: 11px; }

/* ---------- 独立颜色面板 ---------- */
/* 左右两栏：左栏色环自然撑高整块，右栏绝对定位铺满右侧、内容多了自己滚 */
.paint-cp-main {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.paint-cp-picker {
  /* 色环缩到 150px 了，左栏跟着收窄，右栏就能多放一列色块 */
  flex: 0 0 174px;
  width: 174px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 12px 12px;
  border-right: 1px solid rgba(31, 41, 55, .07);
}

.paint-cp-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin-top: 10px;
}

.paint-cp-pick {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 0;
  padding: 5px 9px 5px 7px;
  border-radius: 9px;
  background: #f5f7fb;
  color: #4b5563;
  font-size: 11px;
  font-weight: 600;
  /* 全局没重置 button 外观，不写这两行会露出默认描边 */
  border: 0;
  cursor: pointer;
  transition: .14s;
}
.paint-cp-pick:hover { background: #f3f1ff; color: #6c5ce7; }
.paint-cp-pick:active { transform: scale(.96); }
.paint-cp-pick svg { width: 13px; height: 13px; flex: 0 0 13px; }

.paint-cp-body {
  /* 脱离文档流，高度跟着左栏走；不这么写它自己的内容会把整块面板顶高，左栏底下就多出一块空白 */
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 174px;
  overflow-y: auto;
  padding: 4px 12px 10px;
  scrollbar-width: thin;
}
/* 右栏底部淡出：色块行被面板下沿切断时，用这块白色渐变盖住半行，
   看起来是「下面还有、可以滚」，而不是「裁坏了」 */
.paint-cp-main::after {
  content: '';
  position: absolute;
  left: 174px;
  right: 0;
  bottom: 0;
  height: 26px;
  background: linear-gradient(to top, #fff 42%, rgba(255, 255, 255, 0));
  pointer-events: none;
  border-radius: 0 0 14px 0;
}
.paint-cp-body::-webkit-scrollbar { width: 6px; }
.paint-cp-body::-webkit-scrollbar-thumb { background: #dbe2ec; border-radius: 3px; }
.paint-cp-title {
  margin: 8px 0 6px;
  font-size: 10px;
  font-weight: 600;
  color: #9ca3af;
}
.paint-cp-grid {
  display: grid;
  /* 5 列：右栏 178px 除以 5 每格约 31px，比 4 列的 41px 省一行，
     常用色 7 个刚好两行、更多颜色 28 个从 7 行压到 6 行，一屏能多看一截 */
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.paint-cp-sw {
  width: 100%;
  min-height: 0;
  aspect-ratio: 1 / 1;
  /* 全局只约定了 button 的最小高度，没有重置外观；不写这两行会露出浏览器默认的深色描边 */
  border: 0;
  background: none;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(31, 41, 55, .12);
  cursor: pointer;
  transition: transform .14s cubic-bezier(.22, .61, .36, 1), box-shadow .14s;
}
.paint-cp-sw:hover { transform: scale(1.09); }
.paint-cp-sw.is-active {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #6c5ce7;
}

.paint-cp-custom {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 0;
  /* 挪到标题栏了，得把它顶到右边去；margin-left:auto 吃掉中间的空白 */
  margin-left: auto;
  padding: 3px 7px 3px 4px;
  border-radius: 8px;
  background: #f5f7fb;
  cursor: pointer;
}
.paint-cp-custom:hover { background: #eef1f7; }
.paint-cp-custom input[type='color'] {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: none;
  cursor: pointer;
}
.paint-cp-custom span { font-size: 10px; font-weight: 600; color: #4b5563; }
.paint-cp-custom b {
  margin-left: auto;
  font-size: 10px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
}

.paint-fx-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
</style>
