<template>
  <div ref="host" class="h5-layout-host" :style="{ aspectRatio: '9 / 16' }">
    <article class="h5-layout-paper" :style="{ width: '1080px', height: '1920px', transform: `scale(${scale})`, backgroundColor: page.background, backgroundImage: page.backgroundImage ? `url(${JSON.stringify(page.backgroundImage)})` : undefined, backgroundSize: page.backgroundImage ? 'cover' : undefined }" :aria-label="page.title">
      <template v-for="element in visibleElements" :key="element.id">
        <div class="h5-layout-element" :class="{ selected: editable && selectedId === element.id, locked: element.locked, editable }" :style="elementStyle(element)" :data-element-id="element.id" :tabindex="editable ? 0 : undefined" :role="editable ? 'button' : undefined" :aria-label="element.name" @pointerdown="startPointer($event, element)" @keydown.enter.stop="$emit('select', element.id)">
          <img v-if="element.type === 'image' && element.src" :src="element.src" :alt="element.name" draggable="false" :style="{ objectFit: element.fit, objectPosition: `${element.cropX}% ${element.cropY}%` }" @error="failed.add(element.src)" />
          <span v-else-if="element.type === 'image'" class="h5-layout-image-empty">{{ editable ? bindingLabel(element.binding) || '选择图片' : '暂无图片' }}</span>
          <span v-if="element.type === 'text'" class="h5-layout-text">{{ displayText(element) }}</span>
          <span v-if="element.type === 'image' && failed.has(element.src)" class="h5-layout-image-error">图片暂时无法加载</span>
          <template v-if="editable && selectedId === element.id && !element.locked">
            <span class="h5-layout-resize" aria-label="缩放元素" @pointerdown.stop="startPointer($event, element, true)"></span>
          </template>
        </div>
      </template>
      <span v-if="pageNumber" class="h5-layout-number">{{ pageNumber }}</span>
    </article>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { H5_BINDINGS } from '../utils/h5Layout.js'
const props = defineProps({ page: { type: Object, required: true }, editable: Boolean, selectedId: String, pageNumber: String, sample: { type: Object, default: () => ({}) } })
const emit = defineEmits(['select', 'change', 'gesture-start', 'gesture-end'])
const host = ref(null), scale = ref(0.35), failed = reactive(new Set())
let observer, gesture
const visibleElements = computed(() => [...(props.page.elements || [])].filter(item => !item.hidden).sort((a, b) => a.z - b.z))
const bindingLabel = binding => H5_BINDINGS.find(item => item.value === binding)?.label
function displayText(element) { return element.binding ? props.sample[element.binding] ?? element.text ?? bindingLabel(element.binding) : element.text }
function elementStyle(element) {
  return { left: `${element.x}px`, top: `${element.y}px`, width: `${element.w}px`, height: `${element.h}px`, zIndex: element.z, transform: `rotate(${element.rotation}deg)`, opacity: element.opacity, borderRadius: `${element.radius}px`, backgroundColor: element.type === 'shape' || element.type === 'image' ? element.fill : undefined, fontFamily: `${element.fontFamily}, "PingFang SC", "Microsoft YaHei", sans-serif`, fontSize: `${element.fontSize}px`, fontWeight: element.bold ? 700 : 400, lineHeight: element.lineHeight, color: element.color, textAlign: element.align }
}
function startPointer(event, element, resize = false) {
  if (!props.editable) return
  emit('select', element.id)
  if (element.locked || event.button !== 0) return
  event.preventDefault()
  event.currentTarget.setPointerCapture?.(event.pointerId)
  gesture = { id: element.id, startX: event.clientX, startY: event.clientY, element: { ...element }, resize }
  emit('gesture-start')
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end, { once: true })
  window.addEventListener('pointercancel', end, { once: true })
}
function move(event) {
  if (!gesture) return
  const { element, resize } = gesture, dx = (event.clientX - gesture.startX) / scale.value, dy = (event.clientY - gesture.startY) / scale.value
  const snap = value => Math.round(value / 10) * 10
  const patch = resize ? { w: Math.min(1080 - element.x, Math.max(40, snap(element.w + dx))), h: Math.min(1920 - element.y, Math.max(30, snap(element.h + dy))) } : { x: Math.min(1080 - element.w, Math.max(0, snap(element.x + dx))), y: Math.min(1920 - element.h, Math.max(0, snap(element.y + dy))) }
  if (!resize && Math.abs(patch.x - (1080 - element.w) / 2) < 20) patch.x = (1080 - element.w) / 2
  emit('change', { id: gesture.id, patch })
}
function end() { if (!gesture) return; gesture = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); emit('gesture-end') }
onMounted(() => { observer = new ResizeObserver(() => { scale.value = (host.value?.clientWidth || 378) / 1080 }); observer.observe(host.value) })
onBeforeUnmount(() => { observer?.disconnect(); end() })
</script>

<style scoped>
.h5-layout-host{position:relative;width:100%;overflow:hidden;background:#f2f7ff}.h5-layout-paper{position:absolute;inset:0;transform-origin:top left;overflow:hidden;background-size:cover;background-position:center;background-image:linear-gradient(#b4cce322 1px,transparent 1px),linear-gradient(90deg,#b4cce322 1px,transparent 1px);background-size:60px 60px;isolation:isolate}.h5-layout-element{position:absolute;box-sizing:border-box}.h5-layout-element img{display:block;width:100%;height:100%;border-radius:inherit;pointer-events:none}.h5-layout-element.editable{touch-action:none;cursor:move}.h5-layout-element.locked{cursor:default}.h5-layout-element.selected{outline:5px solid #3479f5;outline-offset:2px}.h5-layout-text{display:block;white-space:pre-wrap;overflow-wrap:anywhere;height:100%;overflow:hidden}.h5-layout-image-empty,.h5-layout-image-error{display:grid;place-items:center;width:100%;height:100%;font-size:38px;color:#6985a8;text-align:center;border:3px dashed #bed2ec;box-sizing:border-box}.h5-layout-image-error{position:absolute;inset:0;background:#eef4fc}.h5-layout-resize{position:absolute;width:76px;height:76px;right:-30px;bottom:-30px;background:#fff;border:6px solid #3479f5;border-radius:10px;touch-action:none;cursor:nwse-resize;z-index:101}.h5-layout-number{position:absolute;bottom:40px;right:70px;font-size:34px;color:#6680a5}
</style>
