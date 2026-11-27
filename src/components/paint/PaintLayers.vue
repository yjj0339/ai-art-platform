<template>
  <div class="paint-layers" role="group" aria-label="图层">
    <div class="paint-layers-head">
      <strong>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
        图层
      </strong>
      <span class="paint-layers-cnt">{{ rows.length }}</span>
      <button type="button" class="paint-l-add" title="新建图层" @click="addLayer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>

    <div class="paint-layers-list">
      <div
        v-for="row in rows"
        :key="row.id"
        class="paint-layer-row"
        :class="{ 'is-active': row.id === activeId, 'is-off': !row.visible }"
        @click="select(row.id)"
      >
        <button
          type="button"
          class="paint-eye"
          :title="row.visible ? '隐藏这一层' : '显示这一层'"
          :aria-label="row.visible ? '隐藏这一层' : '显示这一层'"
          @click.stop="toggleVisible(row)"
        >
          <svg v-if="row.visible" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 4l16 16" /><path d="M9.9 5.8A9.4 9.4 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-2.6 3.3" /><path d="M6.3 8.2A17 17 0 0 0 2 12s3.6 6.5 10 6.5c1.3 0 2.5-.3 3.6-.7" /></svg>
        </button>

        <img v-if="thumbs[row.id]" class="paint-lthumb" :src="thumbs[row.id]" :alt="`${row.name} 缩略图`" />
        <span v-else class="paint-lthumb paint-lthumb--empty" />

        <span class="paint-lname" :title="row.name">{{ row.name }}</span>

        <button
          type="button"
          class="paint-lock"
          :class="{ 'is-locked': row.locked }"
          :title="row.locked ? '解锁这一层' : '锁定这一层'"
          :aria-label="row.locked ? '解锁这一层' : '锁定这一层'"
          @click.stop="toggleLocked(row)"
        >
          <svg v-if="row.locked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-1.9" /></svg>
        </button>
      </div>
    </div>

    <div class="paint-layer-blend">
      <span>混合模式</span>
      <select
        class="paint-blend-select"
        :value="activeRow?.blend || 'normal'"
        aria-label="图层混合模式"
        :disabled="!activeRow"
        @change="setBlend($event.target.value)"
      >
        <option v-for="item in BLEND_LIST" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </div>

    <div class="paint-layer-opacity">
      <div class="paint-lo-head">
        <span>不透明度</span>
        <b>{{ opacityPercent }}%</b>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        :value="opacityPercent"
        :disabled="!activeRow"
        aria-label="图层不透明度"
        @input="setOpacity(Number($event.target.value))"
      />
    </div>

    <div class="paint-layer-tip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /><circle cx="12" cy="12" r="3.4" /></svg>
      <span>点小眼睛可以单独隐藏一层。AI 生成的结果会插成最上面一层。</span>
    </div>

    <div class="paint-layers-foot">
      <button type="button" @click="addLayer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
        新建
      </button>
      <button type="button" :disabled="rows.length <= 1" @click="removeActive">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /></svg>
        删除
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BLEND_LIST } from '../../utils/paintEngine'

const props = defineProps({
  doc: { type: Object, default: null },
  revision: { type: Number, default: 0 },
  activeId: { type: String, default: '' },
})
const emit = defineEmits(['select', 'changed'])

const rows = ref([])
const thumbs = ref({})

const activeRow = computed(() => rows.value.find((row) => row.id === props.activeId) || null)
const opacityPercent = computed(() => Math.round((activeRow.value?.opacity ?? 1) * 100))

/**
 * doc 是 markRaw 的普通对象，Vue 不会追踪内部变化，
 * 所以每次画面变动都要靠 revision 手动拉一次快照。
 */
function refresh() {
  const doc = props.doc
  if (!doc) {
    rows.value = []
    thumbs.value = {}
    return
  }
  rows.value = doc.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blend: layer.blend,
  }))
  const next = {}
  rows.value.forEach((row) => {
    const canvas = doc.layerThumbnail(row.id, 26, 20)
    if (canvas) next[row.id] = canvas.toDataURL('image/png')
  })
  thumbs.value = next
}

watch(() => [props.revision, props.doc], refresh, { immediate: true })

function select(id) {
  if (props.doc) props.doc.activeLayerId = id
  emit('select', id)
}

function toggleVisible(row) {
  if (props.doc?.setLayerProp(row.id, { visible: !row.visible })) emit('changed')
}

function toggleLocked(row) {
  if (props.doc?.setLayerProp(row.id, { locked: !row.locked })) emit('changed')
}

function setBlend(value) {
  if (props.doc?.setLayerProp(props.activeId, { blend: value })) emit('changed')
}

function setOpacity(value) {
  if (props.doc?.setLayerProp(props.activeId, { opacity: value / 100 })) emit('changed')
}

function addLayer() {
  const doc = props.doc
  if (!doc) return
  const layer = doc.addLayer()
  emit('select', layer.id)
  emit('changed')
}

function removeActive() {
  const doc = props.doc
  if (!doc || !doc.canDeleteLayer) return
  if (doc.removeLayer(props.activeId)) {
    emit('select', doc.activeLayerId)
    emit('changed')
  }
}

defineExpose({ refresh })
</script>

<style scoped>
.paint-layers {
  width: 168px;
  flex: 0 0 168px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fcfdff;
  border-left: 1px solid var(--pb-line, #e5e7eb);
  overflow: hidden;
}

.paint-layers-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 10px 8px;
  border-bottom: 1px solid rgba(31, 41, 55, .06);
  flex: 0 0 auto;
}
.paint-layers-head strong { font-size: 11.5px; color: #1f2937; font-weight: 700; display: flex; align-items: center; gap: 5px; }
.paint-layers-head strong svg { width: 13px; height: 13px; color: #6c5ce7; }
.paint-layers-cnt { font-size: 9.5px; color: #9ca3af; background: #f1f4f9; padding: 1px 5px; border-radius: 4px; }
.paint-l-add {
  margin-left: auto;
  width: 20px;
  height: 20px;
  min-height: 0;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: #8b95a3;
  background: #f2f5f9;
}
.paint-l-add:hover { background: #e9eef6; color: #6c5ce7; }
.paint-l-add svg { width: 11px; height: 11px; }

.paint-layers-list { min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.paint-layers-list::-webkit-scrollbar { width: 6px; }
.paint-layers-list::-webkit-scrollbar-thumb { background: #dbe2ec; border-radius: 3px; }

.paint-layer-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 8px 10px 7px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: .14s;
}
.paint-layer-row:hover { background: rgba(108, 92, 231, .05); }
.paint-layer-row.is-active { background: rgba(108, 92, 231, .09); border-left-color: #6c5ce7; }

.paint-eye {
  width: 18px;
  height: 18px;
  min-height: 0;
  border-radius: 5px;
  display: grid;
  place-items: center;
  color: #94a0af;
  flex: 0 0 18px;
}
.paint-eye:hover { background: rgba(31, 41, 55, .06); color: #1f2937; }
.paint-eye svg { width: 12px; height: 12px; }
.paint-layer-row.is-off .paint-eye { color: #c7cdd6; }
.paint-layer-row.is-off .paint-lname,
.paint-layer-row.is-off .paint-lthumb { opacity: .42; }

.paint-lthumb {
  width: 26px;
  height: 20px;
  border-radius: 4px;
  flex: 0 0 26px;
  object-fit: cover;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(31, 41, 55, .10);
}
.paint-lthumb--empty { background: repeating-linear-gradient(-45deg, #f2f5fa 0 2px, #fff 2px 5px); }

.paint-lname {
  font-size: 11px;
  color: #1f2937;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.paint-lock {
  width: 16px;
  height: 16px;
  min-height: 0;
  border-radius: 4px;
  display: grid;
  place-items: center;
  color: #d3d9e1;
  flex: 0 0 16px;
  transition: .14s;
}
.paint-layer-row:hover .paint-lock { color: #9aa5b4; }
.paint-lock.is-locked { color: #6c5ce7; }
.paint-lock:hover { color: #1f2937; background: rgba(31, 41, 55, .05); }
.paint-lock svg { width: 10px; height: 10px; }

.paint-layer-blend {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 0;
  border-top: 1px solid rgba(31, 41, 55, .06);
  flex: 0 0 auto;
}
.paint-layer-blend > span { font-size: 11px; color: #6b7684; font-weight: 600; }
.paint-blend-select {
  height: 24px;
  min-height: 0;
  max-width: 92px;
  padding: 0 4px;
  border-radius: 7px;
  border: 0;
  background: #f2f5f9;
  color: #3d4753;
  font-size: 10.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.paint-layer-opacity { padding: 10px 10px 4px; border-top: 1px solid rgba(31, 41, 55, .06); flex: 0 0 auto; }
.paint-lo-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.paint-lo-head span { font-size: 10px; color: #6b7684; font-weight: 600; }
.paint-lo-head b { font-size: 10px; color: #1f2937; font-variant-numeric: tabular-nums; }
.paint-layer-opacity input[type='range'] { width: 100%; accent-color: #6c5ce7; height: 14px; margin: 0; }

.paint-layer-tip {
  margin: 11px 9px 0;
  display: flex;
  gap: 6px;
  padding: 8px 9px;
  border-radius: 9px;
  background: #f7f6ff;
  border: 1px dashed rgba(108, 92, 231, .28);
  font-size: 9.5px;
  color: #6b6f8f;
  line-height: 1.55;
}
.paint-layer-tip svg { width: 11px; height: 11px; flex: 0 0 11px; color: #6c5ce7; margin-top: 1px; }

.paint-layers-foot { display: flex; gap: 5px; padding: 8px 9px 9px; flex: 0 0 auto; }
.paint-layers-foot button {
  flex: 1;
  height: 26px;
  min-height: 0;
  border-radius: 7px;
  font-size: 10.5px;
  font-weight: 600;
  color: #5b6675;
  background: #f3f6fa;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: .16s;
}
.paint-layers-foot button:hover:not(:disabled) { background: #e9eef6; color: #6c5ce7; }
.paint-layers-foot button:disabled { opacity: .45; cursor: not-allowed; }
.paint-layers-foot svg { width: 11px; height: 11px; }

@media (max-width: 1360px) {
  .paint-layers { width: 156px; flex: 0 0 156px; }
}
@media (max-width: 1180px) {
  .paint-layers { width: 148px; flex: 0 0 148px; }
}
</style>
