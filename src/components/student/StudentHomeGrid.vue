<template>
  <section class="home-grid" aria-label="小画家首页">
    <!-- 问候 + 问问 AI 伙伴 -->
    <header class="home-hero">
      <div class="hero-text">
        <h1>{{ greeting }}，{{ userName || '小画家' }}</h1>
        <p>今天想创作点什么？点下面的卡片开始，或者直接问问 AI 伙伴。</p>
      </div>
      <form class="ask-bar" role="search" @submit.prevent="submitAsk">
        <el-icon class="ask-icon" aria-hidden="true"><MagicStick /></el-icon>
        <input
          v-model="askText"
          type="text"
          maxlength="200"
          :placeholder="askPlaceholder"
          aria-label="问问 AI 伙伴"
        >
        <button type="submit"><span class="ask-long">问问 AI 伙伴</span><span class="ask-short">问问</span></button>
      </form>
    </header>

    <!-- 创作 -->
    <h2 class="group-title">开始创作</h2>
    <div class="tiles create-tiles">
      <button
        v-for="item in createItems"
        :key="item.id"
        type="button"
        class="tile"
        :class="[`tile-${item.id}`, { 'tile-main': item.id === mainId }]"
        :style="tileStyle(item)"
        @click="emit('enter', item)"
      >
        <span class="tile-art" :class="{ 'is-framed': isFramed(item) }" aria-hidden="true">
          <img :src="artSrc(item)" alt="" decoding="async" draggable="false" @error="onArtError(item)">
        </span>
        <span class="tile-text">
          <strong>{{ item.title }}</strong>
          <small>{{ item.description || DEFAULT_TEXT[item.id] || '' }}</small>
        </span>
      </button>
    </div>
    <div v-if="extras.length" class="tiles extra-tiles">
      <button v-for="extra in extras" :key="extra.id" type="button" class="tile tile-extra" :style="{ '--extra-color': extra.color }" @click="emit('open', extra.id)">
        <span class="extra-icon" aria-hidden="true"><el-icon><component :is="extra.icon" /></el-icon></span>
        <span class="tile-text">
          <strong>{{ extra.title }}</strong>
          <small>{{ extra.text }}</small>
        </span>
      </button>
    </div>

    <!-- 学习与作品 -->
    <template v-if="libraryItems.length">
      <h2 class="group-title">学习与作品</h2>
      <div class="tiles library-tiles">
        <button v-for="item in libraryItems" :key="item.id" type="button" class="tile tile-row" :style="tileStyle(item)" @click="emit('enter', item)">
          <span class="tile-art" :class="{ 'is-framed': isFramed(item) }" aria-hidden="true">
            <img :src="artSrc(item)" alt="" loading="lazy" decoding="async" draggable="false" @error="onArtError(item)">
          </span>
          <span class="tile-text">
            <strong>{{ item.title }}</strong>
            <small>{{ item.meta || item.description || DEFAULT_TEXT[item.id] || '' }}</small>
          </span>
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { MagicStick } from '@element-plus/icons-vue'
import { WORKBENCH_CARD_DESCRIPTIONS as DEFAULT_TEXT } from '../../utils/workbenchDefaults'

const props = defineProps({
  // 与轮播同一份数据（已合并后台「工作台外观」配置：标题、图片、隐藏）
  items: { type: Array, default: () => [] },
  userName: { type: String, default: '' },
  // 固定入口（不进后台卡片配置），例如扫描草图：[{ id, title, text, icon, color }]
  extras: { type: Array, default: () => [] },
})
const emit = defineEmits(['enter', 'open', 'ask'])

const CREATE_IDS = ['paint', 'sketchpad', 'video', 'canvas', 'model3d']
const LIBRARY_IDS = ['courses', 'gallery', 'portfolio', 'reports']

const createItems = computed(() => CREATE_IDS.map((id) => props.items.find((item) => item.id === id)).filter(Boolean))
const libraryItems = computed(() => LIBRARY_IDS.map((id) => props.items.find((item) => item.id === id)).filter(Boolean))
// 最大的那张卡：AI 绘画；后台把它隐藏了就让第一张创作卡当主卡
const mainId = computed(() => (createItems.value.some((item) => item.id === 'paint') ? 'paint' : createItems.value[0]?.id))

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const askText = ref('')
const askPlaceholder = '比如：帮我画一只会飞的小猫'
function submitAsk() {
  emit('ask', askText.value.trim())
  askText.value = ''
}

/* 图块配图（item.tileArt，见 StudentWorkbench.vue）：
   - 内置：透明底物件图，整张 contain 进右侧配图区 —— 图块是横的、手机上又是方的，比例一直在变，
     只有「整张放进去」才能保证任何尺寸都不裁切、不拉伸（以前 3:4 竖图 cover 进横块，主体被裁、还被放大）；
   - 后台换的图 / 作品封面（framed）：按原比例当小海报放，白边圆角，同样不裁切；
   - 地址失效（作品封面多是 24 小时签名外链）：记下来改用内置物件图，不留裂图。 */
const failedArt = reactive(new Set())
function artSrc(item) {
  const art = item.tileArt
  if (!art) return ''
  return failedArt.has(art.src) ? art.fallback : art.src
}
function isFramed(item) {
  return Boolean(item.tileArt?.framed && !failedArt.has(item.tileArt.src))
}
function onArtError(item) {
  const art = item.tileArt
  if (art && art.src !== art.fallback) failedArt.add(art.src)
}
// 图块底色 = 这张卡的配色（和轮播里卡面插画同一套，WORKBENCH_CARD_TINTS）
function tileStyle(item) {
  return item.tint ? { '--tint-a': item.tint[0], '--tint-b': item.tint[1] } : null
}
</script>

<style scoped>
.home-grid {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 14px;
  width: min(1240px, 100%);
  min-height: 0;
  margin: 0 auto;
  padding: 8px 24px 28px;
  /* 外层工作台固定一屏高、不滚动，内容多时在这里面上下滑 */
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.home-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  padding: 18px 22px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.hero-text { min-width: 0; }
.hero-text h1 { margin: 0; color: var(--color-title); font-size: clamp(22px, 2.4vw, 28px); line-height: 1.3; }
.hero-text p { margin: 6px 0 0; color: var(--color-text); font-size: 15px; }

.ask-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 420px;
  max-width: 560px;
  min-height: 56px;
  padding: 6px 6px 6px 16px;
  border: 1.5px solid var(--color-border);
  border-radius: 18px;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ask-bar:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 4px var(--color-primary-ring); }
.ask-icon { flex: none; color: var(--color-primary); font-size: 22px; }
.ask-bar input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--color-title);
  font: inherit;
  font-size: 16px;
}
.ask-bar input::placeholder { color: var(--color-muted); }
.ask-bar button {
  flex: none;
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: var(--color-primary);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.ask-bar button:hover { background: var(--color-primary-hover); }

.group-title { margin: 8px 4px 0; color: var(--color-title); font-size: 17px; font-weight: 700; }

.tiles { display: grid; gap: 14px; }
/* 电脑 / 横屏平板：4 列，AI 绘画占 2×2 */
.create-tiles {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: 158px;
}
.library-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.extra-tiles { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.tile-extra { min-height: 88px; }

.tile {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 22px;
  /* 左上偏白（放字），右下是这张卡的颜色（放图） */
  background: linear-gradient(150deg, #fff 0%, var(--tint-a, #f4f1ff) 48%, var(--tint-b, #ebe7ff) 100%);
  box-shadow: var(--shadow-card);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.tile:hover { box-shadow: var(--shadow-soft); }
.tile:active { transform: scale(0.98); }
.tile:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }

/* 配图区：固定在右侧，图整张 contain 进去 —— 和文字区左右分开，永远不互相压 */
.tile-art {
  position: absolute;
  top: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48%;
  pointer-events: none;
}
.tile-art img {
  display: block;
  width: auto;
  height: auto;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  user-select: none;
  -webkit-user-drag: none;
}
/* 后台换的图 / 作品封面：按原比例做成小海报 */
.tile-art.is-framed { padding: 4px 6px 8px; }
.tile-art.is-framed img {
  border: 3px solid #fff;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 22px rgba(46, 42, 120, 0.18);
}

.tile-text {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 54%;
  padding: 14px 4px 14px 18px;
}
.tile-text strong { color: var(--color-title); font-size: 18px; line-height: 1.3; }
.tile-text small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.tile-main { grid-column: span 2; grid-row: span 2; }
.tile-main .tile-art { top: 18px; right: 22px; bottom: 18px; justify-content: flex-end; width: 54%; }
.tile-main .tile-text { gap: 8px; max-width: 46%; padding: 22px 6px 22px 26px; }
.tile-main .tile-text strong { font-size: 28px; }
.tile-main .tile-text small { font-size: 15px; -webkit-line-clamp: 3; }

.tile-extra { gap: 0; background: #fff; }
.tile-extra .tile-text { max-width: none; }
.extra-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 56px;
  height: 56px;
  margin-left: 16px;
  border-radius: 18px;
  background: var(--color-primary-soft);
  background: color-mix(in srgb, var(--extra-color, #6c5ce7) 14%, #fff);
  color: var(--extra-color, #6c5ce7);
  font-size: 28px;
}

/* 学习与作品：横向矮卡，左字右图 */
.tile-row { min-height: 96px; }
.tile-row .tile-art { top: 8px; right: 12px; bottom: 8px; width: 38%; }
.tile-row .tile-text { max-width: 62%; }
.tile-row .tile-text strong { font-size: 17px; }
.tile-row .tile-text small { -webkit-line-clamp: 1; }

/* 竖屏平板：两列；AI 绘画占满第一行并加高成横幅，剩下单数张时最后一张也占满，避免空格 */
.ask-short { display: none; }
@media (max-width: 1024px) {
  .create-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: 216px; grid-auto-rows: 156px; }
  .tile-main { grid-column: span 2; grid-row: span 1; }
  .create-tiles .tile:last-child:nth-child(even) { grid-column: span 2; }
  .library-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* 手机：小图块太窄放不下左右排，改成上图下字；主卡和「学习与作品」仍是左字右图 */
@media (max-width: 640px) {
  .home-grid { gap: 12px; padding: 4px 12px 20px; }
  .home-hero { padding: 14px; border-radius: 20px; }
  .hero-text p { font-size: 14px; }
  .ask-bar { flex-basis: 100%; }
  .ask-bar button { padding: 0 16px; font-size: 15px; }
  .ask-long { display: none; }
  .ask-short { display: inline; }
  .create-tiles { grid-template-rows: 172px; grid-auto-rows: 156px; gap: 10px; }
  .tile { border-radius: 20px; }
  .tile-main .tile-art { top: 12px; right: 10px; bottom: 12px; width: 50%; }
  .tile-main .tile-text { max-width: 52%; padding: 16px 4px 16px 18px; }
  .tile-main .tile-text strong { font-size: 22px; }
  .tile-main .tile-text small { font-size: 13px; }
  .create-tiles .tile:not(.tile-main) { align-items: flex-end; }
  .create-tiles .tile:not(.tile-main) .tile-art { top: 10px; right: 10px; bottom: 54px; left: 10px; width: auto; }
  .create-tiles .tile:not(.tile-main) .tile-text { gap: 2px; max-width: 100%; padding: 8px 12px 12px; }
  .create-tiles .tile:not(.tile-main) .tile-text small { -webkit-line-clamp: 1; font-size: 12px; }
  .library-tiles { grid-template-columns: 1fr; gap: 10px; }
  .tile-text strong { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .tile { transition: none; }
}
</style>
