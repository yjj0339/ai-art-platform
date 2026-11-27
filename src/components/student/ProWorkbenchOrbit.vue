<template>
  <section
    class="pro-orbit"
    aria-roledescription="轮播"
    aria-label="创作空间切换"
    @keydown.left.prevent="userMove(-1)"
    @keydown.right.prevent="userMove(1)"
    @pointerdown.capture="holdForUser"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <div
      ref="stageRef"
      class="pro-orbit__stage"
      :class="{ 'is-dragging': dragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <div class="pro-orbit__track" aria-hidden="true" />

      <article
        v-for="(item, index) in items"
        :key="item.id"
        class="orbit-card"
        :class="[positionClass(index), { 'is-active': index === activeIndex }]"
        :aria-label="`${item.title}${index === activeIndex ? '，当前选中' : ''}`"
        :aria-selected="index === activeIndex"
        :tabindex="visibleDistance(index) <= 2 ? 0 : -1"
        role="option"
        @click="selectCard(index)"
        @keydown.enter.prevent="enterCard(index)"
        @keydown.space.prevent="enterCard(index)"
      >
        <!-- 纯图卡片（用户选的方案 C）：整张卡就是一张图。内置图是带标题的海报版（和客户上传的那张一致），
             后台换了图就以后台为准；卡片固定 3:4，和图片同比例，图不会被裁掉一截。
             title 仍然保留在数据里：读屏软件靠 aria-label 念出来。 -->
        <div
          class="orbit-card__surface"
          :style="{ backgroundImage: item.imageUrl, backgroundPosition: item.imagePosition || 'center' }"
        >
          <span class="orbit-card__scrim" aria-hidden="true" />
          <span v-if="index === activeIndex" class="orbit-card__active-ring" aria-hidden="true" />
        </div>
      </article>

      <button class="orbit-arrow orbit-arrow--left" type="button" aria-label="上一项" @click.stop="userMove(-1)">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <button class="orbit-arrow orbit-arrow--right" type="button" aria-label="下一项" @click.stop="userMove(1)">
        <el-icon><ArrowRight /></el-icon>
      </button>
    </div>

    <footer class="pro-orbit__controls">
      <!-- 点中间那张卡就能进入；这颗按钮给不知道「点卡片」的小朋友一个明确入口，同时告诉他现在是哪张 -->
      <button v-if="activeItem" type="button" class="orbit-enter" @click="enterActive">
        <span>进入{{ activeItem.title }}</span>
        <el-icon aria-hidden="true"><ArrowRight /></el-icon>
      </button>
      <div class="orbit-nav">
        <div class="orbit-dots" role="tablist" aria-label="创作空间选择">
          <button
            v-for="(item, index) in items"
            :key="item.id"
            type="button"
            :class="{ active: index === activeIndex }"
            :aria-label="`切换到${item.title}`"
            :aria-selected="index === activeIndex"
            role="tab"
            @click="userSelect(index)"
          >
            <span aria-hidden="true" />
          </button>
        </div>
        <button
          v-if="autoplay && items.length > 1"
          type="button"
          class="orbit-play"
          :aria-label="autoplayOn ? '暂停自动轮播' : '继续自动轮播'"
          :title="autoplayOn ? '暂停自动轮播' : '继续自动轮播'"
          @click="togglePlay"
        >
          <el-icon aria-hidden="true"><VideoPause v-if="autoplayOn" /><VideoPlay v-else /></el-icon>
        </button>
      </div>
      <!-- 读屏：自动转的时候不播报（每 4 秒念一次太吵），停下来以后换卡才念 -->
      <p class="orbit-sr-only" :aria-live="autoplayOn ? 'off' : 'polite'">{{ activeItem ? `当前：${activeItem.title}` : '' }}</p>
    </footer>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'

const props = defineProps({
  items: {
    type: Array,
    required: true,
  },
  initialId: {
    type: String,
    default: 'paint',
  },
  // 客户要求首页轮播「自动转动」；传 false 就是原来的纯手动轮播。
  autoplay: {
    type: Boolean,
    default: true,
  },
  // 每张停留多久（毫秒）：4.5 秒够小朋友看清一张卡上的标题和图。
  interval: {
    type: Number,
    default: 4500,
  },
})

const emit = defineEmits(['enter'])

const initialIndex = Math.max(0, props.items.findIndex((item) => item.id === props.initialId))
// 拖动超过这个距离才算"在拖"，之前一律当点击，保证卡片的 click 正常触发。
const DRAG_THRESHOLD = 8
// 松手时移动超过这个距离才翻页（避免手抖误翻）。
const SWIPE_THRESHOLD = 50
// 手指/鼠标碰过轮播以后，这么久没有再操作才继续自动转：给小朋友留足看和点的时间。
const RESUME_AFTER = 8000
// 刚被自动转到中间不足这么久的卡，点一下只算「选中」、不进入：
// 小朋友伸手去点的那一下卡片刚好转走了，不能把人送进他没想去的页面。
const ARRIVAL_GUARD = 700
// 按下后这么久还没收到松手事件，就当松手事件丢了（见 tick 里的保险）。
const STALE_DRAG = 15000
const activeIndex = ref(initialIndex)
const activeItem = computed(() => props.items[activeIndex.value] || props.items[0] || null)
const stageRef = ref(null)
const dragging = ref(false)
let pointerId = null
let startX = 0
let dragX = 0
let captured = false
let suppressClickUntil = 0
let pointerDownAt = 0

// 后台外观配置是异步到的，隐藏某张卡以后列表会变短：尽量停在原来那张卡上，找不到再回第一张，
// 否则 activeIndex 指到列表外面，整圈卡片的位置全乱。
let activeId = props.items[initialIndex]?.id || ''
watch(activeIndex, (index) => {
  activeId = props.items[index]?.id || activeId
})
watch(() => props.items.map((item) => item.id).join('|'), () => {
  const index = props.items.findIndex((item) => item.id === activeId)
  activeIndex.value = index >= 0 ? index : 0
})

/* ===== 自动轮播 =====
   停下来的情况：手指/鼠标碰到轮播（8 秒后自己恢复）、正在拖、键盘 Tab 到轮播里、页面切到后台、点了暂停键。
   ⚠️ 不做「鼠标悬停就暂停」：这块轮播几乎占满整个屏幕，鼠标随手一放就在上面，悬停暂停 = 电脑上永远不转。
   系统开了「减少动态效果」时默认不自动转，暂停键可以手动打开。 */
const prefersReducedMotion = typeof window !== 'undefined'
  && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const userPaused = ref(prefersReducedMotion)
const autoplayOn = computed(() => props.autoplay && !userPaused.value && props.items.length > 1)
let timer = 0
let holdUntil = 0
let keyboardFocus = false
let lastAutoMoveAt = 0

function clearTimer() {
  if (!timer) return
  window.clearTimeout(timer)
  timer = 0
}

function schedule() {
  clearTimer()
  if (!autoplayOn.value || document.hidden) return
  timer = window.setTimeout(tick, Math.max(props.interval, holdUntil - Date.now()))
}

function tick() {
  timer = 0
  if (!autoplayOn.value || document.hidden) return
  // 保险：万一松手事件丢了（指针在别处抬起、系统手势抢走），「正在拖」会一直挂着、轮播就再也不转。
  // 按下超过 15 秒还没结束的拖动一律当作已结束（真按住 15 秒不放的小朋友，卡片照样不会被拖走）。
  if (dragging.value && Date.now() - pointerDownAt > STALE_DRAG) {
    dragging.value = false
    captured = false
    pointerId = null
    dragX = 0
  }
  if (keyboardFocus || dragging.value || Date.now() < holdUntil) {
    schedule()
    return
  }
  move(1)
  lastAutoMoveAt = Date.now()
  schedule()
}

function holdForUser() {
  holdUntil = Date.now() + RESUME_AFTER
  schedule()
}

function togglePlay() {
  userPaused.value = !userPaused.value
  // 点「继续」以后按正常节奏转，不用再等 8 秒
  holdUntil = 0
  schedule()
}

function onFocusIn(event) {
  // 只有键盘 Tab 进来才停（:focus-visible）。鼠标、手指点卡片也会让卡片拿到焦点，不能因此一直停着。
  keyboardFocus = Boolean(event.target?.matches?.(':focus-visible'))
}

function onFocusOut(event) {
  if (event.currentTarget.contains(event.relatedTarget)) return
  keyboardFocus = false
  schedule()
}

function onVisibilityChange() {
  if (document.hidden) clearTimer()
  else schedule()
}

watch(autoplayOn, schedule)
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  schedule()
})
onBeforeUnmount(() => {
  clearTimer()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

function normalizedDistance(index) {
  const total = props.items.length
  let distance = index - activeIndex.value
  if (distance > total / 2) distance -= total
  if (distance < -total / 2) distance += total
  return distance
}

function visibleDistance(index) {
  return Math.abs(normalizedDistance(index))
}

function positionClass(index) {
  const distance = normalizedDistance(index)
  if (distance === 0) return 'is-center'
  return distance < 0 ? `is-left-${Math.abs(distance)}` : `is-right-${distance}`
}

function move(step) {
  const total = props.items.length
  if (!total) return
  activeIndex.value = (activeIndex.value + step + total) % total
}

function userMove(step) {
  move(step)
  holdForUser()
}

function userSelect(index) {
  activeIndex.value = index
  holdForUser()
}

function justArrived() {
  return Date.now() - lastAutoMoveAt < ARRIVAL_GUARD
}

function selectCard(index) {
  if (Date.now() < suppressClickUntil) return
  // 纯图卡片没有「进入创作」按钮，所以「点中间那张」= 进入，「点左右那张」= 换到中间。
  // 这样用户只用一次点击，不用先选中再双击（低龄用户根本不会双击）。
  if (index === activeIndex.value) {
    if (justArrived()) return
    emit('enter', props.items[index])
    return
  }
  activeIndex.value = index
}

function enterCard(index) {
  if (index !== activeIndex.value) {
    activeIndex.value = index
    return
  }
  emit('enter', props.items[index])
}

function enterActive() {
  if (!activeItem.value || justArrived()) return
  emit('enter', activeItem.value)
}

function onPointerDown(event) {
  if (event.target.closest('button')) return
  pointerId = event.pointerId
  pointerDownAt = Date.now()
  startX = event.clientX
  dragX = 0
  captured = false
  dragging.value = true
  // 这里刻意不做 setPointerCapture：一旦按下就捕获指针，卡片上的 click 会被吞掉，
  // 鼠标根本点不中卡片（只有键盘方向键能切）。等真的拖动超过阈值再捕获。
}

function onPointerMove(event) {
  if (!dragging.value || event.pointerId !== pointerId) return
  dragX = event.clientX - startX
  if (!captured && Math.abs(dragX) >= DRAG_THRESHOLD) {
    captured = true
    stageRef.value?.setPointerCapture?.(pointerId)
  }
}

function finishPointer(event, cancelled = false) {
  if (!dragging.value || event.pointerId !== pointerId) return
  if (captured) stageRef.value?.releasePointerCapture?.(pointerId)
  captured = false
  dragging.value = false
  pointerId = null
  if (!cancelled && Math.abs(dragX) >= SWIPE_THRESHOLD) {
    move(dragX < 0 ? 1 : -1)
    suppressClickUntil = Date.now() + 260
  }
  dragX = 0
  holdForUser()
}

function onPointerUp(event) {
  finishPointer(event)
}

function onPointerCancel(event) {
  finishPointer(event, true)
}
</script>

<style scoped lang="scss">
.pro-orbit {
  --orbit-ink: #25346e;
  --orbit-violet: #9b78e9;
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(123, 136, 211, .16);
  border-radius: 26px;
  /* 静态背景图已移除：舞台底图由工作台的全屏背景提供（用户要求「背景图撑满整个屏幕 + 换成动态的」）。
     这里只保留一层极淡的柔光，让卡片区在背景上略微发亮、不被背景细节抢掉注意力。
     ⚠️ 千万不要把 url(...) 加回来，否则背景被盖在卡片里、看起来像「只换了一小块」。 */
  background:
    radial-gradient(ellipse at 50% 38%, rgba(255, 255, 255, .34) 0 18%, rgba(246, 245, 255, .1) 48%, transparent 72%);
  box-shadow: 0 20px 54px rgba(63, 76, 156, .08), inset 0 1px rgba(255, 255, 255, .78);
  isolation: isolate;
}

.pro-orbit::before,
.pro-orbit::after {
  content: '';
  position: absolute;
  pointer-events: none;
  z-index: -1;
}
.pro-orbit::before {
  inset: 18% -14% -30%;
  border: 1px solid rgba(120, 138, 231, .34);
  border-radius: 50%;
  transform: perspective(700px) rotateX(72deg);
  box-shadow: 0 0 0 24px rgba(151, 160, 236, .07), 0 0 0 52px rgba(151, 160, 236, .045), 0 0 0 92px rgba(151, 160, 236, .025);
}
.pro-orbit::after {
  width: 76%;
  height: 74%;
  left: 12%;
  bottom: -38%;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(116, 136, 239, .25), rgba(204, 176, 245, .12) 39%, transparent 69%);
  filter: blur(22px);
}

.pro-orbit__stage {
  position: relative;
  min-height: 560px;
  /* 底部留给「进入」按钮 + 圆点 + 暂停键这一组（约 100px）。 */
  height: calc(100% - 116px);
  touch-action: pan-y;
  user-select: none;
}
.pro-orbit__stage::before,
.pro-orbit__stage::after {
  content: '';
  position: absolute;
  z-index: 0;
  pointer-events: none;
  border-radius: 50%;
}
.pro-orbit__stage::before {
  left: -7%;
  right: -7%;
  bottom: 7%;
  height: 38%;
  border: 1px solid rgba(113, 132, 230, .42);
  transform: perspective(780px) rotateX(72deg);
  box-shadow: 0 0 0 28px rgba(137, 154, 236, .1), 0 0 0 62px rgba(137, 154, 236, .06), 0 0 0 102px rgba(137, 154, 236, .03);
}
.pro-orbit__stage::after {
  width: 64%;
  height: 24%;
  left: 18%;
  bottom: 9%;
  background: radial-gradient(ellipse, rgba(130, 144, 241, .16), transparent 67%);
  filter: blur(16px);
}
.pro-orbit__stage.is-dragging { cursor: grabbing; }
.pro-orbit__track {
  position: absolute;
  z-index: 0;
  left: 4%;
  right: 4%;
  bottom: 8%;
  height: 39%;
  border: 2px solid rgba(125, 139, 229, .62);
  border-radius: 50%;
  transform: perspective(700px) rotateX(70deg);
  box-shadow: 0 0 28px rgba(111, 130, 233, .34), inset 0 0 24px rgba(111, 130, 233, .24), 0 0 0 8px rgba(255, 255, 255, .16);
}

.orbit-card {
  position: absolute;
  z-index: 1;
  /* 舞台内垂直居中：卡片上下留白对称，同时给底部控制条留出安全区。 */
  top: 50%;
  left: 50%;
  /* 卡片固定 3:4（和内置图、后台建议尺寸 720×960 一致）：高度跟舞台走，宽度按比例算，
     图片 cover 铺满时不会再被裁掉左右两条（以前卡片偏瘦，海报卡左上角的标题会被切掉一点）。 */
  width: auto;
  height: min(548px, 88%);
  aspect-ratio: 3 / 4;
  margin: 0;
  border: 0;
  opacity: 0;
  transform: translate3d(-50%, -50%, 0) scale(.45);
  transform-origin: center center;
  transition: transform 420ms cubic-bezier(.2, .8, .2, 1), opacity 360ms ease, filter 360ms ease;
  cursor: pointer;
  outline: none;
  pointer-events: none;
}
.orbit-card:focus-visible .orbit-card__surface { box-shadow: 0 0 0 3px rgba(87, 108, 230, .55), 0 26px 58px rgba(60, 72, 160, .3); }
/* 纯图卡片（方案 C）：卡面就是一张图，没有内边距、没有白底。
   图片地址由 item.imageUrl 以内联 background-image 注入，所以这里只定义「怎么铺」。
   ⚠️ background-size 必须 cover：后台传的图比例未必是 3:4，contain 会露白边。 */
.orbit-card__surface {
  position: relative;
  width: 100%;
  height: 100%;
  border: 1px solid rgba(121, 134, 211, .25);
  border-radius: 24px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, .9);
  background-repeat: no-repeat;
  background-size: cover;
  box-shadow: 0 22px 46px rgba(68, 79, 155, .16), inset 0 1px rgba(255, 255, 255, .5);
  isolation: isolate;
}
/* 底部一层极淡的暗色：侧边卡缩小后边缘会和背景糊在一起，这层暗角让每张卡的边界看得清（只在最底部 32%）。 */
.orbit-card__scrim {
  position: absolute;
  inset: 68% 0 0;
  background: linear-gradient(180deg, transparent, rgba(43, 53, 116, .16));
  pointer-events: none;
}
/* 选中态：亮一圈橙边，告诉用户「点这张就进这里」。 */
.orbit-card__active-ring {
  position: absolute;
  inset: 0;
  border: 3px solid rgba(255, 138, 84, .92);
  border-radius: 24px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .55), 0 0 0 5px rgba(255, 138, 84, .16);
  pointer-events: none;
}

.orbit-card.is-center { z-index: 12; opacity: 1; transform: translate3d(-50%, -50%, 120px) scale(1.04); pointer-events: auto; }
.orbit-card.is-center .orbit-card__surface { border-color: rgba(150, 121, 226, .42); box-shadow: 0 30px 66px rgba(67, 78, 164, .24), 0 0 0 6px rgba(255, 255, 255, .46); }
.orbit-card.is-left-1,
.orbit-card.is-right-1 { z-index: 8; opacity: .94; pointer-events: auto; filter: saturate(.98); }
.orbit-card.is-left-1 { transform: translate3d(calc(-50% - 19vw), -56%, 30px) scale(.76) rotateY(11deg); }
.orbit-card.is-right-1 { transform: translate3d(calc(-50% + 19vw), -56%, 30px) scale(.76) rotateY(-11deg); }
.orbit-card.is-left-2,
.orbit-card.is-right-2 { z-index: 6; opacity: .78; pointer-events: auto; filter: saturate(.86); }
.orbit-card.is-left-2 { transform: translate3d(calc(-50% - 31vw), -62%, 0) scale(.61) rotateY(16deg); }
.orbit-card.is-right-2 { transform: translate3d(calc(-50% + 31vw), -62%, 0) scale(.61) rotateY(-16deg); }
.orbit-card.is-left-3,
.orbit-card.is-right-3 { z-index: 4; opacity: .58; pointer-events: auto; }
.orbit-card.is-left-3 { transform: translate3d(calc(-50% - 40vw), -66%, 0) scale(.47) rotateY(20deg); }
.orbit-card.is-right-3 { transform: translate3d(calc(-50% + 40vw), -66%, 0) scale(.47) rotateY(-20deg); }
.orbit-card.is-left-4,
.orbit-card.is-right-4 { z-index: 2; opacity: .38; pointer-events: auto; }
.orbit-card.is-left-4 { transform: translate3d(calc(-50% - 46vw), -69%, 0) scale(.35) rotateY(23deg); }
.orbit-card.is-right-4 { transform: translate3d(calc(-50% + 46vw), -69%, 0) scale(.35) rotateY(-23deg); }

.orbit-arrow {
  position: absolute;
  z-index: 30;
  top: 60%;
  width: 50px;
  height: 50px;
  border: 1px solid rgba(112, 128, 216, .24);
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, .82);
  color: #5f70dc;
  box-shadow: 0 12px 26px rgba(67, 80, 163, .14);
  cursor: pointer;
  backdrop-filter: blur(12px);
}
.orbit-arrow :deep(.el-icon) { font-size: 24px; }
.orbit-arrow--left { left: 18px; }
.orbit-arrow--right { right: 18px; }

.pro-orbit__controls {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  bottom: 14px;
  display: grid;
  justify-items: center;
  gap: 8px;
}
.orbit-enter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 24px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(100deg, #6f6cf0, #9b78e9);
  color: #fff;
  font: inherit;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: .5px;
  box-shadow: 0 12px 26px rgba(98, 92, 222, .28);
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease;
}
.orbit-enter:hover { box-shadow: 0 14px 30px rgba(98, 92, 222, .36); }
.orbit-enter:active { transform: scale(.97); }
.orbit-enter:focus-visible { outline: 3px solid rgba(111, 108, 240, .45); outline-offset: 3px; }
.orbit-enter :deep(.el-icon) { font-size: 18px; }
.orbit-nav { display: flex; align-items: center; gap: 8px; }
.orbit-dots { display: flex; }
/* 圆点看着小，按的地方要大：30×30 的透明按钮里放一颗 9px 的点，手指好按。 */
.orbit-dots button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  min-height: 30px;
  border: 0;
  padding: 0;
  background: none;
  cursor: pointer;
}
.orbit-dots button span {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #bec4ef;
  transition: width 220ms ease, background 220ms ease;
}
.orbit-dots button.active span { width: 26px; background: #ff8a54; }
.orbit-dots button:focus-visible { outline: 2px solid rgba(95, 112, 220, .6); outline-offset: -4px; border-radius: 10px; }
.orbit-play {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  min-height: 34px;
  padding: 0;
  border: 1px solid rgba(112, 128, 216, .24);
  border-radius: 50%;
  background: rgba(255, 255, 255, .82);
  color: #5f70dc;
  cursor: pointer;
  backdrop-filter: blur(12px);
}
.orbit-play :deep(.el-icon) { font-size: 18px; }
.orbit-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .pro-orbit__stage { min-height: 490px; }
  .orbit-card { height: min(470px, 82%); }
  .orbit-card.is-left-1 { transform: translate3d(calc(-50% - 25vw), -56%, 30px) scale(.74) rotateY(9deg); }
  .orbit-card.is-right-1 { transform: translate3d(calc(-50% + 25vw), -56%, 30px) scale(.74) rotateY(-9deg); }
  .orbit-card.is-left-2 { transform: translate3d(calc(-50% - 42vw), -63%, 0) scale(.58) rotateY(14deg); }
  .orbit-card.is-right-2 { transform: translate3d(calc(-50% + 42vw), -63%, 0) scale(.58) rotateY(-14deg); }
  .orbit-card.is-left-3,
  .orbit-card.is-right-3,
  .orbit-card.is-left-4,
  .orbit-card.is-right-4 { opacity: 0; pointer-events: none; }
}

/* 竖屏平板（如 820×1180、768×1024）：舞台很高，沿用横屏的 470px 卡片会上下各空出一大截，
   改成按舞台高度放大（最高 700px），小朋友看得清、也更好点。 */
@media (max-width: 980px) and (min-width: 681px) and (orientation: portrait) {
  .orbit-card { height: min(700px, 76%); }
}

@media (max-width: 680px) {
  .pro-orbit { min-height: 640px; border-radius: 20px; }
  .pro-orbit__stage { min-height: 480px; height: 500px; }
  .orbit-card { top: 48%; width: min(72vw, 300px); height: auto; }
  .orbit-card.is-left-1 { transform: translate3d(calc(-50% - 68vw), -45%, 0) scale(.72); opacity: .42; }
  .orbit-card.is-right-1 { transform: translate3d(calc(-50% + 68vw), -45%, 0) scale(.72); opacity: .42; }
  .orbit-card.is-left-2,
  .orbit-card.is-right-2 { opacity: 0; pointer-events: none; }
  .orbit-arrow { top: 62%; width: 44px; height: 44px; }
  .orbit-arrow--left { left: 8px; }
  .orbit-arrow--right { right: 8px; }
  .pro-orbit__controls { bottom: 12px; }
}

/* 按设备定尺寸（方案 E）：横屏矮一点的屏幕（1366×768 笔记本、1280×720 等），舞台原来最少 560 / 490px，
   比实际能给的高度还高，卡片就压到「进入」按钮上。这里放开下限，舞台跟着可用高度走，按钮和圆点永远在卡片下面。 */
@media (min-width: 681px) and (max-height: 800px) {
  .pro-orbit__stage { min-height: 300px; }
}
/* 手机横屏等特别矮的屏幕（高 ≤ 520px）：「进入」按钮和圆点并成一行，舞台多给卡片一点高度，整组都在一屏里 */
@media (min-width: 681px) and (max-height: 520px) and (orientation: landscape) {
  .pro-orbit__stage { min-height: 150px; height: calc(100% - 58px); }
  .orbit-card { height: 90%; }
  .pro-orbit__controls { bottom: 8px; grid-auto-flow: column; justify-content: center; align-items: center; gap: 12px; }
  .orbit-enter { min-height: 40px; padding: 0 18px; font-size: 14px; }
  .orbit-arrow { width: 40px; height: 40px; }
}

/* 大屏（1920×1080 一类、投影）：舞台很高，卡片还停在 548px 会上下各空一大截 → 最高放到 680px */
@media (min-width: 1200px) and (min-height: 960px) {
  .orbit-card { height: min(680px, 84%); }
}

@media (prefers-reduced-motion: reduce) {
  .orbit-card,
  .orbit-dots button span,
  .orbit-enter { transition-duration: 1ms; }
  .orbit-card.is-left-1,
  .orbit-card.is-right-1,
  .orbit-card.is-left-2,
  .orbit-card.is-right-2 { rotate: 0deg; }
}
</style>
