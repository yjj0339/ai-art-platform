<template>
  <el-dialog :model-value="true" title="作品修改" width="min(1400px, 96vw)" top="3vh" class="artwork-editor-dialog" append-to-body destroy-on-close :close-on-click-modal="false" :close-on-press-escape="false" :before-close="requestClose">
    <div class="artwork-editor" v-loading="loading">
      <header class="edit-header">
        <div><h2>作品修改 <span>{{ sourceVersion?.title || '当前作品' }}</span></h2><p>{{ project.title }} · 原图保留，放心尝试</p></div>
        <BaseButton :disabled="!pending || busy" :loading="saving" @click="saveResult">保存为新版本</BaseButton>
      </header>
      <div class="edit-layout">
        <nav class="edit-tools" aria-label="修改工具">
          <small>创作工具</small>
          <button v-for="item in tools" :key="item.key" type="button" :class="{ active: mode === item.key }" :disabled="busy" :aria-pressed="mode === item.key" @click="changeMode(item.key)"><component :is="item.icon" /><span>{{ item.label }}</span></button>
          <div class="edit-protect"><Lock /><span>原图保留<br>支持版本回看</span></div>
        </nav>
        <main class="edit-workspace">
          <div class="edit-viewbar"><span>{{ pending ? '修改结果 · 待保存' : toolDescription }}</span><button type="button" :disabled="!imageReady" :aria-pressed="compare" @click="compare = !compare">{{ compare ? '返回修改视图' : '查看原图' }}</button></div>
          <div ref="stage" class="edit-stage" @wheel.prevent="wheelZoom">
            <div v-if="imageReady" class="edit-image-plane" :style="planeStyle">
              <img :src="displayImage" alt="当前作品" draggable="false" />
              <canvas ref="maskCanvas" class="edit-mask" :class="{ 'is-pan': pointerTool === 'pan' }" :style="{ opacity: showMask && !compare && !pending && mode !== 'adjust' ? 1 : 0 }" :width="imageWidth" :height="imageHeight" :aria-label="mode === 'background' && !backgroundInverted ? '涂抹要保留的主体' : '涂抹要修改的区域'" @pointerdown="startPointer" @pointermove="movePointer" @pointerup="endPointer" @pointercancel="endPointer" @lostpointercapture="endPointer" />
              <span v-if="showMask && !compare && !pending && mode !== 'adjust' && selectedPixels" class="edit-mask-label">{{ mode === 'background' && !backgroundInverted ? '紫色区域：保留的主体' : '紫色区域：将被修改' }}</span>
            </div>
            <p v-else class="edit-empty">{{ loadError || '正在读取作品原图…' }}</p>
          </div>
          <div class="edit-canvas-tools">
            <div><button type="button" :class="{ active: pointerTool === 'brush' }" :disabled="busy || !!pending" @click="pointerTool = 'brush'">画笔</button><button type="button" :class="{ active: pointerTool === 'pan' }" @click="pointerTool = 'pan'">拖动画面</button></div>
            <div><button type="button" aria-label="缩小画面" :disabled="!imageReady" @click="zoomBy(-.25)">−</button><span>{{ Math.round(zoom * 100) }}%</span><button type="button" aria-label="放大画面" :disabled="!imageReady" @click="zoomBy(.25)">＋</button><button type="button" @click="fitImage">适应画面</button></div>
          </div>
          <div class="edit-history"><div><strong>作品版本</strong><small>每次灵感，都可以保留</small></div><button v-for="(item, index) in project.versions" :key="item.id" type="button" :class="{ active: sourceId === item.id }" :disabled="busy" @click="changeVersion(item.id)"><img v-if="versionImage(item)" :src="versionImage(item)" alt="作品版本缩略图" /><span>{{ item.title || `V${index + 1}` }}</span></button><div v-if="pending" class="edit-pending"><img :src="pending.version.imageUrl" alt="待保存的修改结果" /><span>本次修改 · 待保存</span></div></div>
        </main>
        <aside class="edit-settings">
          <div><small class="edit-eyebrow">让创意发生在细节里</small><h3>{{ currentTool.label }}</h3><p>{{ toolDescription }}</p></div>
          <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
          <button v-if="loadError" type="button" :disabled="busy" class="edit-text-button" @click="loadSource">重新读取作品</button>
          <el-alert v-if="capabilityError && mode !== 'adjust'" :title="capabilityError" type="warning" :closable="false" />
          <template v-if="mode === 'adjust'">
            <div class="edit-presets"><button v-for="preset in presets" :key="preset.label" type="button" :disabled="busy || !!pending" @click="applyPreset(preset.values)">{{ preset.label }}</button></div>
            <label v-for="field in adjustmentFields" :key="field.key" class="edit-range"><span>{{ field.label }}<b>{{ adjustments[field.key] > 0 ? '+' : '' }}{{ adjustments[field.key] }}</b></span><input v-model.number="adjustments[field.key]" type="range" min="-100" max="100" :disabled="busy || !!pending" @input="renderAdjustment" /></label>
            <button type="button" class="edit-text-button" :disabled="busy || !!pending" @click="applyPreset(defaultAdjustments)">恢复默认</button>
            <p class="edit-hint">即时预览，不消耗 AI 次数。保存后成为新的图片版本。</p>
          </template>
          <template v-else>
            <section class="edit-selection">
              <div class="edit-section-label"><strong>① {{ mode === 'background' && !backgroundInverted ? '涂抹要保留的主体' : '选择修改区域' }}</strong><button type="button" :disabled="busy || !!pending" @click="clearMask">清空</button></div>
              <div class="edit-brushes"><button type="button" :class="{ active: brush === 'paint' }" :disabled="busy || !!pending" @click="brush = 'paint'; pointerTool = 'brush'"><EditPen />画笔</button><button type="button" :class="{ active: brush === 'erase' }" :disabled="busy || !!pending" @click="brush = 'erase'; pointerTool = 'brush'"><Delete />橡皮擦</button><button type="button" aria-label="撤销选区" :disabled="busy || !!pending || !undoStack.length" @click="undoMask"><RefreshLeft /></button><button type="button" aria-label="重做选区" :disabled="busy || !!pending || !redoStack.length" @click="redoMask"><RefreshRight /></button></div>
              <label class="edit-range"><span>画笔大小 <b>{{ brushSize }} px</b></span><input v-model.number="brushSize" type="range" min="4" max="160" :disabled="busy || !!pending" /></label>
              <div class="edit-mask-controls"><label><input v-model="showMask" type="checkbox" /> 显示紫色选区</label><button type="button" :disabled="busy || !!pending || !selectedPixels" @click="invertMask">{{ mode === 'background' && !backgroundInverted ? '选择其余背景' : '反选区域' }}</button></div>
            </section>
            <label v-if="mode !== 'erase'" class="edit-prompt"><strong>② {{ mode === 'background' ? '描述新的背景' : '描述你的想法' }}</strong><textarea v-model="prompts[mode]" :disabled="busy || !!pending" maxlength="2000" :placeholder="mode === 'background' ? '例如：阳光下的草地，远处有树木，光线自然。' : '例如：给狗狗戴一顶红色小帽子，保留原来的照片风格。'" rows="4" /><span>{{ prompts[mode].length }}/2000</span></label>
            <div v-if="mode === 'repaint'" class="edit-suggestions"><button v-for="item in suggestions" :key="item.label" type="button" :disabled="busy || !!pending" @click="prompts.repaint = item.text">{{ item.label }}</button></div>
            <p class="edit-hint">{{ mode === 'erase' ? '涂抹不要的物体，AI 会参考周围画面补全背景。' : mode === 'background' ? '先涂抹主体，再选择其余背景；头发、毛发等边缘可用小画笔修正。' : '把新增物体周围也涂一点，为创意留出空间。选区外保持原样。' }}</p>
            <label class="edit-model"><strong>编辑模型</strong><select v-model="modelKey" :disabled="busy || !!pending || !models.length"><option v-if="!models.length" value="">暂无支持选区编辑的模型</option><option v-for="item in models" :key="`${item.provider}:${item.model}`" :value="`${item.provider}:${item.model}`">{{ item.label }}</option></select></label>
          </template>
          <div class="edit-action-area">
            <div v-if="pending" class="edit-result-actions"><p>效果已生成，满意后保存为新版本。</p><button type="button" :disabled="busy" @click="discardResult">返回继续修改</button></div>
            <BaseButton v-else :loading="generating" :disabled="!canGenerate" @click="generateResult">{{ mode === 'adjust' ? '生成调整预览' : mode === 'erase' ? '消除物体' : mode === 'background' ? '生成新背景' : '生成修改' }}</BaseButton>
            <p role="status" aria-live="polite" :class="{ 'edit-error': actionError }">{{ actionError || (generating ? '正在处理，请等待；本次只生成一张图片。' : saving ? '正在保存，请稍候。' : mode === 'adjust' ? '基础调整无需 AI，原图始终保留。' : '每次生成 1 张，可能消耗模型额度。') }}</p>
            <button v-if="conflict" type="button" :disabled="busy" @click="reloadProject">重新加载版本后保存</button>
          </div>
        </aside>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeRouteLeave } from 'vue-router'
import { Brush, Delete, EditPen, Lock, Picture, RefreshLeft, RefreshRight, SetUp } from '@element-plus/icons-vue'
import BaseButton from './base/BaseButton.vue'
import { apiClient } from '../services/apiClient'
import { useProjectStore } from '../stores/projectStore'
import { applyArtworkAdjustments, DEFAULT_ARTWORK_ADJUSTMENTS } from '../utils/artworkAdjust'

const props = defineProps({ project: { type: Object, required: true }, versionId: { type: String, required: true } })
const emit = defineEmits(['close', 'saved', 'reload'])
const projectStore = useProjectStore()
const tools = [{ key: 'adjust', label: '整体调整', icon: SetUp }, { key: 'repaint', label: '局部重绘', icon: Brush }, { key: 'erase', label: '消除物体', icon: Delete }, { key: 'background', label: '更换背景', icon: Picture }]
const adjustmentFields = [{ key: 'brightness', label: '亮度' }, { key: 'contrast', label: '对比度' }, { key: 'saturation', label: '鲜艳度' }, { key: 'warmth', label: '冷暖' }]
const defaultAdjustments = { ...DEFAULT_ARTWORK_ADJUSTMENTS }
const presets = [{ label: '更明亮', values: { brightness: 15 } }, { label: '更鲜艳', values: { saturation: 25 } }, { label: '更温暖', values: { warmth: 30 } }]
const suggestions = [{ label: '换个颜色', text: '把选中部分改成红色，保持原有的材质和光影。' }, { label: '增加物体', text: '给狗狗戴一顶红色小帽子，保留狗狗原来的样子和照片风格。' }, { label: '修改细节', text: '让选中部分的细节更清晰自然，保持原来的风格。' }]
const mode = ref('repaint'), sourceId = ref(props.versionId), models = ref([]), modelKey = ref('')
const loading = ref(true), generating = ref(false), saving = ref(false), pending = ref(null), loadError = ref(''), capabilityError = ref(''), actionError = ref(''), conflict = ref(false)
const sourceVersion = computed(() => props.project.versions?.find((version) => version.id === sourceId.value))
const currentTool = computed(() => tools.find((tool) => tool.key === mode.value))
const busy = computed(() => loading.value || generating.value || saving.value)
const toolDescription = computed(() => ({ adjust: '调整光线和色彩，让画面更合你心意。', repaint: '涂一涂，再告诉 AI 这里怎么改。', erase: '涂抹不要的物体，自然补全附近背景。', background: '保留画面主角，去一个新的地方。' }[mode.value]))
const stage = ref(null), maskCanvas = ref(null), imageReady = ref(false), sourceImageUrl = ref(''), adjustedImage = ref(''), imageWidth = ref(0), imageHeight = ref(0)
const zoom = ref(1), pan = reactive({ x: 0, y: 0 }), planeWidth = ref(0), compare = ref(false), pointerTool = ref('brush'), brush = ref('paint'), brushSize = ref(48), showMask = ref(true), selectedPixels = ref(0), backgroundInverted = ref(false)
const prompts = reactive({ repaint: '', background: '' }), adjustments = reactive({ ...defaultAdjustments })
const undoStack = ref([]), redoStack = ref([])
let bitmap, originalPixels, selection, ctx, observer, pointer = null, lastPoint, dragStart, docId = '', expectedVersion = 0, sourceObjectUrl = '', alive = true, adjustmentFrame = 0
const planeStyle = computed(() => ({ width: `${planeWidth.value}px`, aspectRatio: `${imageWidth.value} / ${imageHeight.value}`, transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom.value})` }))
const displayImage = computed(() => compare.value ? sourceImageUrl.value : pending.value?.version.imageUrl || (mode.value === 'adjust' ? adjustedImage.value || sourceImageUrl.value : sourceImageUrl.value))
const dirty = computed(() => !!pending.value || selectedPixels.value > 0 || Object.values(adjustments).some(Boolean) || !!prompts.repaint || !!prompts.background)
const canGenerate = computed(() => !busy.value && imageReady.value && (mode.value === 'adjust' ? Object.values(adjustments).some(Boolean) : !!modelKey.value && selectedPixels.value > 0 && selectedPixels.value < imageWidth.value * imageHeight.value && (mode.value === 'erase' || !!prompts[mode.value]?.trim()) && (mode.value !== 'background' || backgroundInverted.value)))
function errorMessage(error) { return error?.response?.data?.message || error.message || '操作失败，请稍后再试。' }
function versionImage(version) { return version.imageUrl || String(version.background || '').match(/url\(["']?([^"')]+)["']?\)/)?.[1] || '' }
function fitImage() {
  if (!stage.value || !imageWidth.value) return
  planeWidth.value = Math.max(1, Math.min(stage.value.clientWidth - 36, (stage.value.clientHeight - 36) * imageWidth.value / imageHeight.value))
  zoom.value = 1; pan.x = 0; pan.y = 0
}
function zoomBy(value) { zoom.value = Math.max(.5, Math.min(4, zoom.value + value)) }
function wheelZoom(event) { if (imageReady.value) zoomBy(event.deltaY > 0 ? -.1 : .1) }
function snapshot() {
  const strokes = new Uint8Array(Math.ceil(selection.length / 8))
  for (let i = 0; i < selection.length; i++) if (selection[i]) strokes[i >> 3] |= 1 << (i & 7)
  return { strokes, inverted: backgroundInverted.value }
}
function restoreSnapshot(state) {
  for (let i = 0; i < selection.length; i++) selection[i] = state.strokes[i >> 3] & (1 << (i & 7)) ? 255 : 0
  backgroundInverted.value = state.inverted; drawMask()
}
function pushUndo() {
  undoStack.value.push(snapshot())
  const limit = Math.min(30, Math.max(1, Math.floor(24 * 1024 * 1024 / Math.ceil(selection.length / 8))))
  if (undoStack.value.length > limit) undoStack.value.shift()
  redoStack.value = []
}
function drawMask() {
  if (!ctx || !selection) return
  const data = ctx.createImageData(imageWidth.value, imageHeight.value)
  let count = 0
  for (let i = 0; i < selection.length; i++) {
    if (!selection[i]) continue
    const offset = i * 4
    data.data[offset] = 147; data.data[offset + 1] = 102; data.data[offset + 2] = 231; data.data[offset + 3] = 125
    count++
  }
  selectedPixels.value = count; ctx.putImageData(data, 0, 0)
}
function clearMask() { if (!selection) return; pushUndo(); selection.fill(0); backgroundInverted.value = false; drawMask() }
function invertMask() { pushUndo(); for (let i = 0; i < selection.length; i++) selection[i] = selection[i] ? 0 : 255; backgroundInverted.value = !backgroundInverted.value; drawMask() }
function undoMask() { if (!undoStack.value.length) return; redoStack.value.push(snapshot()); restoreSnapshot(undoStack.value.pop()) }
function redoMask() { if (!redoStack.value.length) return; undoStack.value.push(snapshot()); restoreSnapshot(redoStack.value.pop()) }
function imagePoint(event) { const rect = maskCanvas.value.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * imageWidth.value, y: (event.clientY - rect.top) / rect.height * imageHeight.value } }
function paintSegment(a, b) {
  const radius = brushSize.value / (planeWidth.value * zoom.value) * imageWidth.value / 2
  const distance = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 3)))
  const w = imageWidth.value, h = imageHeight.value
  for (let n = 0; n <= steps; n++) {
    const x = a.x + (b.x - a.x) * n / steps, y = a.y + (b.y - a.y) * n / steps
    for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(h - 1, Math.ceil(y + radius)); py++) {
      for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(w - 1, Math.ceil(x + radius)); px++) if ((px - x) ** 2 + (py - y) ** 2 <= radius ** 2) selection[py * w + px] = brush.value === 'erase' ? 0 : 255
    }
  }
  drawMask()
}
function startPointer(event) {
  if (event.button !== 0 || !imageReady.value) return
  if (pointerTool.value !== 'pan' && (busy.value || pending.value || compare.value || mode.value === 'adjust')) return
  pointer = event.pointerId; maskCanvas.value.setPointerCapture(pointer)
  if (pointerTool.value === 'pan') dragStart = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }
  else { pushUndo(); lastPoint = imagePoint(event); paintSegment(lastPoint, lastPoint) }
}
function movePointer(event) {
  if (pointer !== event.pointerId) return
  if (dragStart) { pan.x = dragStart.px + event.clientX - dragStart.x; pan.y = dragStart.py + event.clientY - dragStart.y }
  else { const point = imagePoint(event); paintSegment(lastPoint, point); lastPoint = point }
}
function endPointer() { pointer = null; dragStart = null }
function renderAdjustment() {
  cancelAnimationFrame(adjustmentFrame)
  adjustmentFrame = requestAnimationFrame(() => {
    if (!originalPixels) return
    const canvas = document.createElement('canvas'); canvas.width = imageWidth.value; canvas.height = imageHeight.value
    const context = canvas.getContext('2d'), data = new ImageData(new Uint8ClampedArray(originalPixels), canvas.width, canvas.height)
    applyArtworkAdjustments(data.data, adjustments); context.putImageData(data, 0, 0); adjustedImage.value = canvas.toDataURL('image/png')
  })
}
function applyPreset(values) { Object.assign(adjustments, defaultAdjustments, values); renderAdjustment() }
async function confirmDiscard() {
  try { await ElMessageBox.confirm('当前修改尚未保存，是否放弃并继续？', '保留你的创意', { confirmButtonText: '放弃当前修改', cancelButtonText: '返回修改', type: 'warning' }); return true } catch { return false }
}
async function requestClose() { if (busy.value) return ElMessage.info('正在处理，请等待本次操作完成。'); if (dirty.value && !await confirmDiscard()) return; emit('close') }
async function changeMode(next) {
  if (next === mode.value) return
  if (pending.value && !await confirmDiscard()) return
  if ((mode.value === 'background' || next === 'background') && selectedPixels.value) {
    if (!await confirmDiscard()) return
    selection.fill(0); backgroundInverted.value = false; undoStack.value = []; redoStack.value = []; drawMask()
  }
  pending.value = null; mode.value = next; compare.value = false; actionError.value = ''; if (next === 'adjust') renderAdjustment()
}
async function changeVersion(id) { if (id === sourceId.value) return; if (dirty.value && !await confirmDiscard()) return; sourceId.value = id; await loadSource() }
async function loadSource() {
  loading.value = true; imageReady.value = false; loadError.value = ''; actionError.value = ''; pending.value = null; compare.value = false
  Object.assign(adjustments, defaultAdjustments); adjustedImage.value = ''; prompts.repaint = ''; prompts.background = ''; selectedPixels.value = 0; backgroundInverted.value = false; undoStack.value = []; redoStack.value = []
  try {
    if (import.meta.env.VITE_AUTH_MODE !== 'server') throw new Error('请使用服务端用户账号登录。演示模式不提供真实修改或云端保存。')
    await projectStore.flushServerWrites(true)
    const stored = projectStore.projects.find((item) => item.id === props.project.id)
    docId = stored?._serverDocumentId || props.project._serverDocumentId || ''
    expectedVersion = stored?._serverVersion || props.project._serverVersion || 0
    if (!docId) throw new Error('项目尚未保存到服务器，请返回保存项目后重试。')
    const response = await apiClient.get('/ai/image/edit/source', { params: { documentId: docId, versionId: sourceId.value }, responseType: 'blob' })
    if (!alive) return
    if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl)
    sourceObjectUrl = URL.createObjectURL(response.data); sourceImageUrl.value = sourceObjectUrl
    bitmap?.close()
    bitmap = await createImageBitmap(response.data)
    imageWidth.value = bitmap.width; imageHeight.value = bitmap.height
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); originalPixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    selection = new Uint8Array(bitmap.width * bitmap.height); imageReady.value = true; await nextTick()
    ctx = maskCanvas.value.getContext('2d'); fitImage(); drawMask()
    const preferred = models.value.find((item) => item.model === sourceVersion.value?.model && item.provider === sourceVersion.value?.provider)
    if (preferred) modelKey.value = `${preferred.provider}:${preferred.model}`
  } catch (error) {
    if (error.response?.data instanceof Blob) { try { const detail = JSON.parse(await error.response.data.text()); loadError.value = detail.message } catch { loadError.value = '原图读取失败，请重新打开。' } }
    else loadError.value = errorMessage(error)
  } finally { loading.value = false }
}
async function loadModels() {
  try {
    const { data } = await apiClient.get('/ai/image/edit/capabilities'); models.value = data.models || []
    modelKey.value = models.value.length ? `${models.value[0].provider}:${models.value[0].model}` : ''
    if (!models.value.length) capabilityError.value = '暂无已配置的选区编辑模型。整体调整仍可使用，请联系管理员配置局部重绘能力。'
  } catch (error) { capabilityError.value = errorMessage(error) }
}
function exportMask() {
  const canvas = document.createElement('canvas'); canvas.width = imageWidth.value; canvas.height = imageHeight.value
  const context = canvas.getContext('2d'), data = context.createImageData(canvas.width, canvas.height)
  for (let i = 0; i < selection.length; i++) { data.data[i * 4] = selection[i]; data.data[i * 4 + 1] = selection[i]; data.data[i * 4 + 2] = selection[i]; data.data[i * 4 + 3] = 255 }
  context.putImageData(data, 0, 0); return canvas.toDataURL('image/png')
}
async function generateResult() {
  if (!canGenerate.value) return
  generating.value = true; actionError.value = ''; conflict.value = false
  try {
    const model = models.value.find((item) => `${item.provider}:${item.model}` === modelKey.value)
    const { data } = await apiClient.post('/ai/image/edit', { documentId: docId, versionId: sourceId.value, operation: mode.value, adjustments: { ...adjustments },
      ...(mode.value !== 'adjust' ? { mask: exportMask(), prompt: prompts[mode.value] || '', provider: model?.provider, model: model?.model } : {}) }, { timeout: 200000 })
    pending.value = data; compare.value = false
  } catch (error) { actionError.value = errorMessage(error) } finally { generating.value = false }
}
function discardResult() { pending.value = null; actionError.value = ''; conflict.value = false; compare.value = false }
async function saveResult() {
  if (!pending.value || busy.value) return
  saving.value = true; actionError.value = ''; conflict.value = false
  try {
    const { data } = await apiClient.post('/ai/image/edit/save', { pendingId: pending.value.pendingId, expectedVersion })
    projectStore.applyServerProject(data.document); emit('saved', data)
    sourceId.value = data.versionId; pending.value = null; ElMessage.success('已保存为新版本，原图仍在版本记录中。')
    await nextTick(); await loadSource()
  } catch (error) { actionError.value = errorMessage(error); conflict.value = error.response?.status === 409 } finally { saving.value = false }
}
async function reloadProject() {
  loading.value = true
  try { const { data } = await apiClient.get(`/me/documents/${encodeURIComponent(docId)}`); expectedVersion = data.document.version; projectStore.applyServerProject(data.document); emit('reload', data.document); conflict.value = false; actionError.value = '已重新加载，可以再次保存；无需重新生成。' }
  catch (error) { actionError.value = errorMessage(error) } finally { loading.value = false }
}
function beforeUnload(event) { if (dirty.value || generating.value || saving.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(async () => { window.addEventListener('beforeunload', beforeUnload); await Promise.all([loadModels(), loadSource()]); observer = new ResizeObserver(() => fitImage()); if (stage.value) observer.observe(stage.value) })
onBeforeRouteLeave(async () => { if (busy.value) { ElMessage.info('正在处理，请等待本次操作完成。'); return false } return !dirty.value || await confirmDiscard() })
onBeforeUnmount(() => { alive = false; observer?.disconnect(); window.removeEventListener('beforeunload', beforeUnload); cancelAnimationFrame(adjustmentFrame); bitmap?.close(); if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl) })
</script>

<style scoped>
.artwork-editor { --edit-purple: #7361d8; --edit-orange: #ff851b; --edit-text: #293450; --edit-muted: #7c839a; --edit-line: #e7e8f2; color: var(--edit-text); background: #f6f7fc; border-radius: 14px; overflow: hidden; }
.artwork-editor button, .artwork-editor input, .artwork-editor textarea, .artwork-editor select { font: inherit; }
.artwork-editor button { cursor: pointer; color: inherit; }
.artwork-editor button:disabled { cursor: not-allowed; opacity: .5; }
.artwork-editor button:focus-visible, .artwork-editor input:focus-visible, .artwork-editor textarea:focus-visible, .artwork-editor select:focus-visible { outline: 2px solid var(--edit-purple); outline-offset: 3px; }
.edit-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px 24px; background: #fff; border-bottom: 1px solid var(--edit-line); }
.edit-header h2 { margin: 0; font-size: 21px; }.edit-header h2 span { font-size: 13px; font-weight: 400; color: var(--edit-muted); margin-left: 14px; }.edit-header p { margin: 6px 0 0; color: var(--edit-muted); font-size: 12px; }
.edit-layout { display: grid; grid-template-columns: 96px minmax(0, 1fr) 310px; }
.edit-tools { display: flex; flex-direction: column; padding: 22px 9px; gap: 12px; background: #fff; border-right: 1px solid var(--edit-line); }.edit-tools small { text-align: center; font-size: 11px; color: var(--edit-muted); }
.edit-tools button { display: flex; flex-direction: column; align-items: center; gap: 9px; border: 0; padding: 16px 4px; background: transparent; border-radius: 10px; font-size: 12px; }.edit-tools svg { width: 23px; height: 23px; }.edit-tools button.active { color: var(--edit-purple); background: #efecff; font-weight: 600; }
.edit-protect { margin-top: auto; display: grid; justify-items: center; padding-top: 30px; font-size: 11px; color: var(--edit-muted); line-height: 1.8; text-align: center; gap: 8px; }.edit-protect svg { color: var(--edit-purple); }
.edit-workspace { min-width: 0; padding: 18px 20px; }.edit-viewbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--edit-muted); font-size: 12px; margin-bottom: 12px; }
.edit-viewbar button, .edit-canvas-tools button { background: #fff; border: 1px solid var(--edit-line); border-radius: 6px; padding: 7px 9px; font-size: 12px; }
.edit-stage { position: relative; overflow: hidden; height: clamp(280px, 46vh, 570px); min-width: 0; background-color: #eceef6; background-image: radial-gradient(#d2d6e6 1px, transparent 1px); background-size: 14px 14px; border-radius: 12px; touch-action: none; }
.edit-image-plane { position: absolute; left: 50%; top: 50%; transform-origin: center; box-shadow: 0 5px 25px #29345020; background: #fff; }.edit-image-plane img { width: 100%; height: 100%; display: block; object-fit: contain; user-select: none; }.edit-mask { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }.edit-mask.is-pan { cursor: grab; }.edit-mask.is-pan:active { cursor: grabbing; }.edit-mask-label { position: absolute; top: 10px; left: 10px; padding: 6px 9px; border-radius: 5px; background: #fffffff0; color: #6a4ac1; font-size: 11px; pointer-events: none; }
.edit-empty { height: 100%; display: grid; place-items: center; padding: 20px; margin: 0; color: var(--edit-muted); text-align: center; }
.edit-canvas-tools { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 0 18px; flex-wrap: wrap; }.edit-canvas-tools > div { display: flex; align-items: center; gap: 5px; }.edit-canvas-tools span { min-width: 42px; text-align: center; font-size: 12px; }.edit-canvas-tools button.active { color: var(--edit-purple); border-color: var(--edit-purple); }
.edit-history { display: flex; gap: 10px; align-items: center; padding-top: 16px; border-top: 1px solid var(--edit-line); overflow-x: auto; max-width: 100%; }.edit-history > div:first-child { min-width: 90px; }.edit-history strong { font-size: 12px; }.edit-history small { display: block; font-size: 10px; margin-top: 7px; color: var(--edit-muted); }.edit-history button, .edit-pending { border: 1px solid var(--edit-line); padding: 4px; border-radius: 7px; width: 92px; min-width: 92px; background: #fff; font-size: 10px; }.edit-history button.active, .edit-pending { border-color: var(--edit-purple); color: var(--edit-purple); }.edit-history img { width: 82px; height: 58px; object-fit: contain; border-radius: 4px; background: #f5f5fa; }.edit-history span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 5px 1px 2px; }
.edit-settings { display: flex; flex-direction: column; gap: 19px; min-width: 0; background: #fff; border-left: 1px solid var(--edit-line); padding: 24px 20px 18px; }.edit-eyebrow { color: var(--edit-purple); font-size: 10px; letter-spacing: 1px; }.edit-settings h3 { font-size: 23px; margin: 7px 0; }.edit-settings p { font-size: 12px; color: var(--edit-muted); line-height: 1.7; margin: 0; }.edit-section-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 12px; }.edit-section-label button, .edit-text-button { font-size: 11px; background: none; border: 0; color: var(--edit-muted); padding: 3px; }
.edit-brushes { display: flex; gap: 6px; }.edit-brushes button { display: flex; align-items: center; gap: 4px; border: 1px solid var(--edit-line); background: #fff; border-radius: 6px; padding: 9px 8px; font-size: 11px; }.edit-brushes svg { width: 15px; height: 15px; }.edit-brushes button.active { background: #efecff; color: var(--edit-purple); border-color: var(--edit-purple); }
.edit-range { display: block; margin: 15px 0 8px; }.edit-range > span { display: flex; justify-content: space-between; font-size: 12px; color: var(--edit-muted); margin-bottom: 10px; }.edit-range b { font-weight: 400; }.edit-range input { display: block; width: 100%; height: 5px; accent-color: var(--edit-purple); }.edit-mask-controls { display: flex; justify-content: space-between; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 13px; font-size: 11px; }.edit-mask-controls label { display: flex; align-items: center; gap: 4px; color: var(--edit-muted); }.edit-mask-controls input { accent-color: var(--edit-purple); }.edit-mask-controls button { border: 0; padding: 5px 0; background: none; color: var(--edit-purple); }
.edit-mask-controls input[type="checkbox"] { width: 15px; height: 15px; min-width: 15px; padding: 0; margin: 0; flex: 0 0 15px; }
.edit-prompt { display: block; font-size: 12px; }.edit-prompt strong { display: block; margin-bottom: 12px; }.edit-prompt textarea { display: block; width: 100%; box-sizing: border-box; background: #f7f8fc; color: var(--edit-text); border: 1px solid var(--edit-line); padding: 12px; border-radius: 8px; line-height: 1.8; resize: vertical; font-size: 13px; min-height: 110px; }.edit-prompt > span { display: block; text-align: right; font-size: 10px; color: var(--edit-muted); margin-top: 4px; }
.edit-suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: -10px; }.edit-suggestions button { background: #f6f7fc; border: 0; border-radius: 5px; padding: 6px 9px; font-size: 11px; color: var(--edit-muted); }.edit-settings .edit-hint { font-size: 11px; background: #f7f8fc; padding: 10px; border-radius: 7px; }.edit-model { display: block; font-size: 12px; }.edit-model select { width: 100%; padding: 9px 7px; font-size: 12px; margin-top: 9px; border: 1px solid var(--edit-line); border-radius: 6px; background: #fff; color: var(--edit-text); }
.edit-action-area { margin-top: auto; }.edit-action-area :deep(.base-button) { width: 100%; }.edit-action-area > p { text-align: center; font-size: 11px; margin-top: 10px; }.edit-action-area > button, .edit-result-actions button { border: 1px solid var(--edit-line); background: #fff; padding: 10px; border-radius: 7px; width: 100%; margin-top: 10px; }.edit-settings p.edit-error { color: #bd3939; }.edit-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }.edit-presets button { border: 1px solid var(--edit-line); background: #f7f8fc; padding: 10px 3px; border-radius: 6px; font-size: 11px; }
@media (max-width: 1000px) { .edit-layout { grid-template-columns: 78px minmax(0, 1fr) 265px; }.edit-workspace { padding: 14px 12px; }.edit-settings { padding: 20px 14px; gap: 16px; }.edit-brushes button { padding: 8px 6px; }.edit-header { padding: 16px; } }
@media (max-width: 720px) { .edit-layout { grid-template-columns: 66px minmax(0, 1fr); }.edit-settings { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--edit-line); }.edit-tools button { font-size: 11px; }.edit-tools small, .edit-protect { display: none; }.edit-header h2 span { display: block; margin: 4px 0 0; }.edit-header h2 { font-size: 18px; }.edit-prompt textarea { font-size: 16px; }.edit-stage { height: 310px; } }
@media (pointer: coarse) { .artwork-editor button { min-height: 40px; } }
</style>
