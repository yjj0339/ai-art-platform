<template>
  <section class="h5-page-image-viewer" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <div class="image-stage">
      <img ref="imageEl" :src="current?.url" :alt="current?.label || `报告第 ${activeIndex + 1} 页`" @load="reportRatio" />
    </div>
    <nav v-if="showNav && images.length > 1" aria-label="报告页导航">
      <button type="button" :disabled="activeIndex === 0" @click="go(activeIndex - 1)">‹ 上一页</button>
      <strong>{{ activeIndex + 1 }} / {{ images.length }}</strong>
      <button type="button" :disabled="activeIndex === images.length - 1" @click="go(activeIndex + 1)">下一页 ›</button>
    </nav>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
const props = defineProps({
  images: { type: Array, default: () => [] },
  // 传了 index 就由外部控制页码（预览页外层有自己的翻页按钮，避免两套页码不同步）
  index: { type: Number, default: null },
  showNav: { type: Boolean, default: true },
})
// size = 图片真实像素 { width, height }。外层拿它决定手机外壳是竖着还是横着。
const emit = defineEmits(['update:index', 'size'])
const innerIndex = ref(0)
const imageEl = ref(null)
const controlled = computed(() => typeof props.index === 'number')
const activeIndex = computed(() => (controlled.value ? Math.min(Math.max(props.index, 0), Math.max(props.images.length - 1, 0)) : innerIndex.value))
const touchStart = ref(0)
const current = computed(() => props.images[activeIndex.value] || {})
watch(() => props.images.length, () => { if (!controlled.value && innerIndex.value > props.images.length - 1) innerIndex.value = Math.max(props.images.length - 1, 0) })

// 换页时重新上报画幅：同一份报告里竖图和横图可能混着出现。
watch(activeIndex, async () => {
  await nextTick()
  reportRatio()
})
watch(() => current.value?.url, async () => {
  await nextTick()
  reportRatio()
})

function reportRatio() {
  const el = imageEl.value
  if (!el || !el.naturalWidth || !el.naturalHeight) return
  emit('size', { width: el.naturalWidth, height: el.naturalHeight })
}
function go(next) {
  if (next < 0 || next > props.images.length - 1) return
  if (controlled.value) emit('update:index', next)
  else innerIndex.value = next
}
function onTouchStart(event) { touchStart.value = event.touches?.[0]?.clientX || 0 }
function onTouchEnd(event) {
  const offset = (event.changedTouches?.[0]?.clientX || 0) - touchStart.value
  if (offset < -45) go(activeIndex.value + 1)
  if (offset > 45) go(activeIndex.value - 1)
}
</script>

<style scoped>
.h5-page-image-viewer{width:100%;height:100%;margin:0;display:flex;flex-direction:column}
/* 画幅由外层手机外壳决定：外壳量好图片真实长宽比再撑开，这里只负责填满，不写死比例 */
.image-stage{flex:1 1 auto;min-height:0;overflow:hidden;border-radius:inherit;background:#edf4fb}
.image-stage img{display:block;width:100%;height:100%;object-fit:contain;background:#edf4fb}
nav{display:grid;grid-template-columns:1fr auto 1fr;gap:9px;align-items:center;margin-top:12px}
nav button{min-height:42px;border:1px solid #c4d8f0;border-radius:999px;background:#fff;color:#265a9b;font-weight:800}
nav button:last-child{grid-column:3}
nav button:disabled{opacity:.42}
nav strong{color:#165fcb;font-size:13px;text-align:center}
</style>
