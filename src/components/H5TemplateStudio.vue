<template>
  <section class="h5-studio" :class="{ 'studio-expanded': expanded }" aria-label="H5模板设计器">
    <header class="studio-header">
      <div><h2>H5 模板设计器</h2><p :class="{ danger: saveError }" role="status">{{ saveError || saveState }}<span v-if="!draft.designDocument"> · 当前模板尚未启用可视化布局</span></p></div>
      <div class="studio-header-actions"><button @click="expanded = !expanded">{{ expanded ? '退出全屏' : '全屏编辑' }}</button><button @click="previewOpen = true">预览</button><button :disabled="saving || !dirty" @click="save(false)">保存草稿</button><button class="primary" :disabled="saving || !design" @click="save(true)">发布模板</button></div>
    </header>
    <div class="studio-template-switch"><label>当前模板<select :value="draft.id" @change="switchTemplate($event.target.value)"><option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }}</option><option v-if="!templates.some(item => item.id === draft.id)" :value="draft.id">{{ draft.name }}（新草稿）</option></select></label><button @click="makeCopy">复制为新模板</button><button @click="createHandbook">新建蓝白手账</button><span>发布后在「版本与模板」授权用户使用</span></div>
    <div class="studio-workspace" :inert="!revision">
      <nav class="studio-pages" aria-label="报告页面">
        <span class="studio-muted">页面</span>
        <button v-for="(page, index) in design?.pages || []" :key="page.id" class="studio-page-thumb" :class="{ active: page.id === pageId }" @click="pageId = page.id; selectedId = ''"><span>{{ String(index + 1).padStart(2, '0') }}</span><b>{{ page.title }}</b><small v-if="!page.enabled">已停用</small></button>
        <button :disabled="!design || design.pages.length >= 24" @click="addPage">＋ 加页</button>
      </nav>
      <main class="studio-stage">
        <div class="studio-stage-tools"><div><button aria-label="撤销" :disabled="!undoStack.length" @click="undo">撤销</button><button aria-label="重做" :disabled="!redoStack.length" @click="redo">重做</button></div><span>{{ currentPage?.title || '选择模板版式' }}</span><button @click="zoom = zoom === 1 ? 1.25 : 1">{{ zoom === 1 ? '放大查看' : '适合屏幕' }}</button></div>
        <div v-if="!design" class="studio-empty"><h3>让模板变得直观可编辑</h3><p>基于当前风格创建可视化布局，或新建一套蓝白创意手账。原模板在发布前保持原样。</p><button class="primary" @click="enableDesign">为当前模板添加布局</button></div>
        <div v-else class="studio-paper-scroll"><div class="studio-paper-wrap" :style="{ width: `${Math.round(360 * zoom)}px` }"><H5LayoutPage v-if="currentPage" :page="currentPage" editable :selected-id="selectedId" :sample="sampleText" :page-number="`${pageIndex + 1} / ${design.pages.length}`" @select="selectElement" @gesture-start="beginEdit" @gesture-end="finishEdit" @change="moveElement" /></div></div>
        <p class="studio-stage-caption">{{ selectedElement ? `已选中：${selectedElement.name}${selectedElement.locked ? ' · 已锁定' : ' · 可拖动位置与缩放'}` : '轻点元素，在右侧调整；也可使用数值设置' }}</p>
      </main>
      <aside class="studio-panel" @focusin="beginEdit" @change="finishEdit">
        <div class="studio-tabs" role="tablist"><button v-for="tab in tabs" :key="tab.id" role="tab" :aria-selected="panel === tab.id" :class="{ active: panel === tab.id }" @click="panel = tab.id">{{ tab.label }}</button></div>
        <div v-if="panel === 'add'" class="studio-panel-body">
          <h3>添加内容</h3><p class="studio-muted">轻点添加，拖动调整位置</p>
          <div class="studio-add-grid"><button :disabled="!currentPage" @click="uploadPurpose = 'image'; uploadInput.click()"><b>↑</b>上传素材</button><button :disabled="!currentPage" @click="addElement('text')"><b>T</b>添加文字</button><button :disabled="!currentPage" @click="panel = 'page'"><b>▱</b>背景</button><button :disabled="!currentPage" @click="addElement('shape')"><b>◇</b>形状与装饰</button></div>
          <details open><summary>素材上传</summary><div class="studio-upload"><button :disabled="uploading || !currentPage" @click="uploadPurpose = 'image'; uploadInput.click()">{{ uploading ? '上传中…' : '＋ 选择图片' }}</button><p>PNG、JPG、WEBP，单张不超过8MB</p><small>上传模板装饰；用户作品通过内容绑定填入</small></div></details>
          <section class="studio-ai"><h3>AI 智能排版</h3><p>复用已有文案与素材，生成可调整的布局建议</p><label>预览资料<select v-model="sampleSelection" @change="loadSample"><option value="demo">示例资料（不含用户数据）</option><option v-for="item in samples" :key="item.id" :value="item.id">{{ item.studentName }} · {{ item.title }}</option></select></label><button class="studio-text-link" @click="loadSamples">读取授权范围内的项目</button><label>作用范围<select v-model="aiScope"><option value="page">当前页面</option><option value="all">整份报告</option></select></label><label>排版要求<textarea v-model="aiInstruction" maxlength="300" placeholder="例如：作品大一点，装饰少一点" /></label><button v-if="!aiBusy" class="primary" :disabled="!design" @click="requestAI">生成排版建议</button><button v-else @click="cancelAI">取消等待</button><p v-if="aiMessage" role="status">{{ aiMessage }}</p></section>
          <details><summary>最近上传与模板素材</summary><div class="studio-asset-list"><button v-for="src in assets" :key="src" @click="addImage(src)"><img :src="src" alt="添加已上传素材" /></button><p v-if="!assets.length" class="studio-muted">上传图片后会显示在这里</p></div></details>
        </div>
        <div v-else-if="panel === 'properties'" class="studio-panel-body">
          <template v-if="selectedElement"><h3>{{ selectedElement.name }}</h3><label>元素名称<input v-model="selectedElement.name" maxlength="60" /></label><label v-if="selectedElement.type !== 'shape'">内容绑定<select v-model="selectedElement.binding"><option value="">固定{{ selectedElement.type === 'text' ? '文字' : '图片' }}</option><option v-for="item in availableBindings" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
            <template v-if="selectedElement.type === 'text'"><label v-if="!selectedElement.binding">文字内容<textarea v-model="selectedElement.text" maxlength="3000" /></label><p v-else class="studio-muted">生成时自动填入每位用户的内容</p><div class="studio-field-grid"><label>字体<select v-model="selectedElement.fontFamily"><option value="Microsoft YaHei">微软雅黑</option><option value="KaiTi">楷体</option><option value="SimSun">宋体</option></select></label><label>字号<input v-model.number="selectedElement.fontSize" type="number" min="34" max="150" /></label><label>文字颜色<input v-model="selectedElement.color" type="color" /></label><label>行距<input v-model.number="selectedElement.lineHeight" type="number" step="0.1" min="1" max="2" /></label></div><label>对齐<select v-model="selectedElement.align"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><label class="studio-check"><input v-model="selectedElement.bold" type="checkbox" />文字加粗</label></template>
            <template v-if="selectedElement.type === 'image'"><label>图片显示<select v-model="selectedElement.fit"><option value="contain">完整显示</option><option value="cover">填满并裁切</option></select></label><div v-if="selectedElement.fit === 'cover'" class="studio-field-grid"><label>裁切水平位置<input v-model.number="selectedElement.cropX" type="range" min="0" max="100" /></label><label>裁切垂直位置<input v-model.number="selectedElement.cropY" type="range" min="0" max="100" /></label></div><button @click="uploadPurpose = 'replace'; uploadInput.click()">替换为固定图片</button></template>
            <div class="studio-divider"></div><h4>位置与大小</h4><div class="studio-field-grid"><label v-for="[key, label] in geometryFields" :key="key">{{ label }}<input v-model.number="selectedElement[key]" :disabled="selectedElement.locked" type="number" min="0" :max="key === 'x' || key === 'w' ? 1080 : 1920" /></label></div><div class="studio-inline"><button :disabled="selectedElement.locked" @click="centerElement">水平居中</button><button :disabled="selectedElement.locked" @click="scaleElement(0.9)">缩小</button><button :disabled="selectedElement.locked" @click="scaleElement(1.1)">放大</button></div><div class="studio-field-grid"><label>旋转<input v-model.number="selectedElement.rotation" :disabled="selectedElement.locked" type="number" min="-15" max="15" /></label><label>透明度<input v-model.number="selectedElement.opacity" type="range" min="0.1" max="1" step="0.05" /></label><label>圆角<input v-model.number="selectedElement.radius" type="number" min="0" max="120" /></label><label v-if="selectedElement.type !== 'text'">背景色<input v-model="selectedElement.fill" type="color" /></label></div><label class="studio-check"><input v-model="selectedElement.locked" type="checkbox" />锁定位置与大小</label><div class="studio-inline"><button @click="duplicateElement">复制</button><button class="danger" @click="deleteElement">删除</button></div>
          </template><p v-else class="studio-muted">先轻点画布中的文字、图片或装饰</p>
        </div>
        <div v-else-if="panel === 'layers'" class="studio-panel-body"><h3>本页图层</h3><div v-for="element in sortedLayers" :key="element.id" class="studio-layer" :class="{ active: selectedId === element.id }"><button @click="selectElement(element.id)">{{ element.name }}</button><div><button :aria-label="element.hidden ? '显示图层' : '隐藏图层'" @click="changeLayer(element, 'hidden')">{{ element.hidden ? '显示' : '隐藏' }}</button><button :aria-label="element.locked ? '解锁图层' : '锁定图层'" @click="changeLayer(element, 'locked')">{{ element.locked ? '解锁' : '锁定' }}</button><button aria-label="图层前移" @click="reorderLayer(element, 1)">↑</button><button aria-label="图层后移" @click="reorderLayer(element, -1)">↓</button></div></div></div>
        <div v-else class="studio-panel-body"><h3>页面设置</h3><label>模板名称<input v-model="draft.name" maxlength="80" /></label><label>官网地址<input v-model="draft.officialUrl" type="url" maxlength="300" placeholder="https://…" /></label><label>模板状态<select v-model="draft.status"><option value="draft">草稿</option><option value="published">发布时启用</option><option value="disabled">停用</option></select></label><template v-if="currentPage"><label>页面名称<input v-model="currentPage.title" maxlength="80" /></label><label>所属章节<select v-model="currentPage.chapter"><option v-for="item in chapters" :key="item.id" :value="item.id">{{ item.label }}</option></select></label><label>背景颜色<input v-model="currentPage.background" type="color" /></label><button @click="uploadPurpose = 'background'; uploadInput.click()">上传页面背景</button><button v-if="currentPage.backgroundImage" @click="removeBackground">移除背景图片</button><label class="studio-check"><input v-model="currentPage.enabled" type="checkbox" />启用此页</label><div class="studio-inline"><button :disabled="pageIndex === 0" @click="reorderPage(-1)">上移</button><button :disabled="pageIndex === design.pages.length - 1" @click="reorderPage(1)">下移</button><button @click="copyPage">复制页</button></div><button class="danger" :disabled="design.pages.length <= 1" @click="removePage">删除页面</button></template><details><summary>官网与分享设置</summary><label>官网地址<input v-model="draft.officialUrl" placeholder="https://" /></label><p class="studio-muted">报告底部保留“进入官网”。海报沿用原 H5 中心配置。</p></details><p class="studio-muted">缺少章节素材时自动省略；文字过长时自动分页。</p></div>
      </aside>
    </div>
    <input ref="uploadInput" class="studio-file" type="file" accept="image/png,image/jpeg,image/webp" @change="upload" />
    <div v-if="previewOpen || proposal" class="studio-modal" @click.self="closePreview"><section role="dialog" aria-modal="true" aria-label="报告预览"><header><div><h3>{{ proposal ? 'AI 排版建议' : '模板预览' }}</h3><small>{{ sampleSelection === 'demo' ? '示例资料，仅用于预览' : '授权项目资料，仅用于预览' }}</small></div><button @click="closePreview">关闭</button></header><div class="studio-preview-scroll"><p v-if="previewState.error" class="studio-muted danger" role="alert">{{ previewState.error }}</p><H5LayoutPage v-for="(page, i) in previewDesign?.pages || []" :key="page.id" :page="page" :page-number="`${i + 1} / ${previewDesign.pages.length}`" /></div><footer v-if="proposal"><span>{{ proposalChanged ? '原稿已变化，请重新生成建议' : '确认效果后应用，支持撤销' }}</span><button class="primary" :disabled="proposalChanged" @click="applyProposal">应用排版</button></footer></section></div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiClient } from '../services/apiClient'
import H5LayoutPage from './H5LayoutPage.vue'
import { H5_BINDINGS, H5_CHAPTERS, cloneLayout, compileH5Layout, createH5HandbookDesign, normalizeH5Element, recordedH5Pages, validateH5Design } from '../utils/h5Layout.js'
const props = defineProps({ template: { type: Object, required: true }, templates: { type: Array, default: () => [] } })
const emit = defineEmits(['select-template', 'saved', 'dirty'])
const draft = ref(cloneLayout(props.template)), panel = ref('add'), pageId = ref(''), selectedId = ref(''), zoom = ref(1), expanded = ref(false)
const dirty = ref(false), saving = ref(false), saveError = ref(''), revision = ref(''), previewOpen = ref(false), saveState = ref('正在读取服务端草稿…')
const undoStack = ref([]), redoStack = ref([]), uploadInput = ref(), uploadPurpose = ref('image'), uploading = ref(false), assets = ref([])
const aiBusy = ref(false), aiScope = ref('page'), aiInstruction = ref(''), aiMessage = ref(''), proposal = ref(null), proposalFingerprint = ref(''), samples = ref([]), sampleSelection = ref('demo'), sampleProject = ref(null)
let editBefore, saveTimer, saveAgain = false, stopped = false, requestController, localRevision = 0, syncing = false
const tabs = [{ id: 'add', label: '添加' }, { id: 'properties', label: '属性' }, { id: 'layers', label: '图层' }, { id: 'page', label: '页面' }], chapters = H5_CHAPTERS
const geometryFields = [['x', '水平位置'], ['y', '垂直位置'], ['w', '宽度'], ['h', '高度']]
const design = computed(() => draft.value.designDocument), pageIndex = computed(() => Math.max(0, design.value?.pages.findIndex(page => page.id === pageId.value) ?? 0))
const currentPage = computed(() => design.value?.pages[pageIndex.value]), selectedElement = computed(() => currentPage.value?.elements.find(item => item.id === selectedId.value))
const sortedLayers = computed(() => [...(currentPage.value?.elements || [])].sort((a, b) => b.z - a.z))
const availableBindings = computed(() => H5_BINDINGS.filter(item => selectedElement.value?.type === 'text' ? !item.value.startsWith('image:') && !['final', 'sketch', 'refined'].includes(item.value) : item.value.startsWith('image:') || ['final', 'sketch', 'refined'].includes(item.value)))
const sampleText = computed(() => ({ 'page.title': currentPage.value?.title || '我的创作故事', 'page.body': '这是一段用于检查排版的示例文案。正式生成时，系统会自动填入用户自己的创作记录。', 'project.title': '未来城市生态空间', 'student.name': '示例同学' }))
const fingerprint = () => JSON.stringify(draft.value.designDocument)
const proposalChanged = computed(() => proposal.value && proposalFingerprint.value !== fingerprint())
function previewContent() {
  const project = sampleProject.value || { title: draft.value.name || '我的创作报告', finalArtworkUrl: '/assets/h5-report/product-design-story.png' }
  if (sampleProject.value) return { project, pages: recordedH5Pages(project) }
  const pages = chapters.map(chapter => ({ type: chapter.id, title: chapter.label, body: '这是模板预览示例。用户的创作内容将在生成时自动填入，不需要重新上传已有素材。' }))
  return { project, pages }
}
const previewState = computed(() => {
  if (proposal.value) return { design: proposal.value }
  if (!design.value) return { design: null }
  try { const data = previewContent(); return { design: compileH5Layout(design.value, data.pages, data.project) } } catch (error) { return { design: null, error: error.message || '当前布局无法预览，请检查元素位置与文字容量' } }
})
const previewDesign = computed(() => previewState.value.design)
function id(prefix) { return `${prefix}-${crypto.randomUUID().slice(0, 12)}` }
function setDirty() { if (syncing) return; dirty.value = true; localRevision++; emit('dirty', true); saveState.value = '有未保存修改'; clearTimeout(saveTimer); if (revision.value) saveTimer = setTimeout(() => save(false, true), 1800) }
watch(() => draft.value, setDirty, { deep: true, flush: 'sync' })
watch(() => props.template.id, () => { if (props.template.id !== draft.value.id) reset(props.template) })
function reset(template) { clearTimeout(saveTimer); syncing = true; draft.value = cloneLayout(template); syncing = false; pageId.value = template.designDocument?.pages[0]?.id || ''; selectedId.value = ''; editBefore = null; undoStack.value = []; redoStack.value = []; dirty.value = false; emit('dirty', false); saveState.value = '草稿已读取'; saveError.value = '' }
function beginEdit() { if (!editBefore) editBefore = JSON.stringify(draft.value) }
function finishEdit() { if (!editBefore) return; const before = editBefore; editBefore = null; if (before !== JSON.stringify(draft.value)) { undoStack.value.push(before); if (undoStack.value.length > 60) undoStack.value.shift(); redoStack.value = [] } }
function mutate(action) { finishEdit(); beginEdit(); action(); finishEdit() }
function undo() { finishEdit(); if (!undoStack.value.length) return; redoStack.value.push(JSON.stringify(draft.value)); draft.value = JSON.parse(undoStack.value.pop()) }
function redo() { if (!redoStack.value.length) return; undoStack.value.push(JSON.stringify(draft.value)); draft.value = JSON.parse(redoStack.value.pop()) }
function enableDesign() { mutate(() => { if (draft.value.builtIn) { draft.value = { ...cloneLayout(draft.value), id: id('h5-template'), name: `${draft.value.name} 可视化版`, builtIn: false, status: 'draft' } } draft.value.designDocument = createH5HandbookDesign(); pageId.value = design.value.pages[0].id }) }
async function canLeave() { if (!dirty.value) return true; if (!saving.value && await save(false, true)) return true; try { await ElMessageBox.confirm('当前草稿尚未保存到服务端，仍要离开吗？', '保留编辑内容', { confirmButtonText: '离开', cancelButtonText: '继续编辑', type: 'warning' }); return true } catch { return false } }
async function switchTemplate(value) { if (await canLeave()) emit('select-template', value) }
async function makeCopy() { try { const { data } = await apiClient.get('/admin/h5-report-config'); revision.value = data.revision; saveError.value = ''; draft.value = { ...cloneLayout(draft.value), id: id('h5-template'), name: `${draft.value.name} 副本`, builtIn: false, status: 'draft' }; undoStack.value = []; redoStack.value = [] } catch { ElMessage.error('无法读取最新配置，当前编辑内容已保留') } }
async function createHandbook() { if (!(await canLeave())) return; draft.value = { ...cloneLayout(draft.value), id: id('h5-handbook'), name: '蓝白创意手账', layout: 'product-design-story', strategyId: 'h5-standard', builtIn: false, status: 'draft', designDocument: createH5HandbookDesign() }; pageId.value = design.value.pages[0].id }
function selectElement(value) { selectedId.value = value; panel.value = 'properties' }
function addElement(type, src = '') { if (!currentPage.value || currentPage.value.elements.length >= 48) return ElMessage.warning('每页最多48个元素'); mutate(() => { const element = normalizeH5Element({ id: id(type), type, src, name: type === 'shape' ? '便签装饰' : type === 'text' ? '新文字' : '新图片', text: type === 'text' ? '输入文字' : '', x: 110, y: 450, w: type === 'text' ? 800 : 500, h: 240, z: Math.min(100, currentPage.value.elements.length + 1) }); currentPage.value.elements.push(element); selectElement(element.id) }) }
function addImage(src) { addElement('image', src) }
function moveElement({ id, patch }) { const element = currentPage.value.elements.find(item => item.id === id); if (element && !element.locked) Object.assign(element, patch) }
function centerElement() { mutate(() => { selectedElement.value.x = (1080 - selectedElement.value.w) / 2 }) }
function scaleElement(factor) { mutate(() => { const element = selectedElement.value; element.w = Math.min(1080 - element.x, Math.max(40, Math.round(element.w * factor))); element.h = Math.min(1920 - element.y, Math.max(30, Math.round(element.h * factor))) }) }
function duplicateElement() { mutate(() => { const copy = { ...cloneLayout(selectedElement.value), id: id('element'), name: `${selectedElement.value.name} 副本`, locked: false }; copy.x = Math.min(1080 - copy.w, copy.x + 20); copy.y = Math.min(1920 - copy.h, copy.y + 20); currentPage.value.elements.push(copy); selectedId.value = copy.id }) }
function deleteElement() { mutate(() => { currentPage.value.elements = currentPage.value.elements.filter(item => item.id !== selectedId.value); selectedId.value = '' }) }
function changeLayer(element, key) { mutate(() => { element[key] = !element[key] }) }
function reorderLayer(element, direction) { mutate(() => { const sorted = [...currentPage.value.elements].sort((a, b) => a.z - b.z); const from = sorted.findIndex(item => item.id === element.id), to = Math.max(0, Math.min(sorted.length - 1, from + direction)); [sorted[from], sorted[to]] = [sorted[to], sorted[from]]; sorted.forEach((item, i) => { item.z = i }) }) }
function addPage() { mutate(() => { const page = cloneLayout(createH5HandbookDesign().pages[0]); page.id = id('page'); page.title = '新页面'; page.chapter = 'reflection'; design.value.pages.push(page); pageId.value = page.id }) }
function copyPage() { mutate(() => { const page = cloneLayout(currentPage.value); page.id = id('page'); page.title += ' 副本'; design.value.pages.splice(pageIndex.value + 1, 0, page); pageId.value = page.id }) }
function reorderPage(direction) { mutate(() => { const index = pageIndex.value, target = index + direction; if (target < 0 || target >= design.value.pages.length) return; [design.value.pages[index], design.value.pages[target]] = [design.value.pages[target], design.value.pages[index]] }) }
async function removePage() { try { await ElMessageBox.confirm('删除当前页面？删除后可以撤销。', '删除页面'); mutate(() => { design.value.pages.splice(pageIndex.value, 1); pageId.value = design.value.pages[0].id }) } catch {} }
function removeBackground() { mutate(() => { currentPage.value.backgroundImage = '' }) }
async function upload(event) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) return ElMessage.warning('请选择8MB以内的PNG、JPG或WEBP图片')
  uploading.value = true
  try { const imageData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) }); const { data } = await apiClient.post('/admin/h5-visual-template-assets', { templateId: draft.value.id, pageId: currentPage.value.id, imageData }); if (uploadPurpose.value === 'image') addImage(data.assetUrl); else mutate(() => { if (uploadPurpose.value === 'background') currentPage.value.backgroundImage = data.assetUrl; else if (uploadPurpose.value === 'replace' && selectedElement.value) { selectedElement.value.src = data.assetUrl; selectedElement.value.binding = '' } }); assets.value.unshift(data.assetUrl) } catch (error) { ElMessage.error(error.response?.data?.message || '图片上传失败，请重试') } finally { uploading.value = false }
}
async function save(publish = false, silent = false) {
  clearTimeout(saveTimer)
  if (saving.value) { saveAgain = true; return false }
  finishEdit(); if (!revision.value) { saveError.value = '服务器配置未读取，不能保存。请刷新后重试'; return false }
  const snapshot = cloneLayout(draft.value), startRevision = localRevision
  if (publish) {
    const errors = validateH5Design(snapshot.designDocument)
    if (!/^https?:\/\//i.test(snapshot.officialUrl || '')) errors.unshift('请先在页面面板填写有效的官网地址')
    if (errors.length) return ElMessage.warning(errors[0])
    try { await ElMessageBox.confirm('只发布当前模板。用户版本授权和其他未发布草稿不会改变。', '发布模板', { confirmButtonText: '发布', cancelButtonText: '取消' }) } catch { return false }
    snapshot.status = snapshot.status === 'disabled' ? 'disabled' : 'published'
  }
  saving.value = true; saveError.value = ''; saveState.value = '正在保存到服务端…'
  try { const { data } = await apiClient.post('/admin/h5-report-config/template', { template: snapshot, revision: revision.value, action: publish ? 'publish' : 'draft' }); revision.value = data.revision; if (startRevision === localRevision) { syncing = true; draft.value = cloneLayout(data.template); syncing = false; dirty.value = false; emit('dirty', false) } emit('saved', data); saveState.value = dirty.value ? '有更新等待保存' : publish ? '模板已发布' : '草稿已保存到服务端'; if (!silent) ElMessage.success(publish ? '当前模板已发布，请到版本与模板检查授权' : '草稿已保存'); return true } catch (error) { saveError.value = error.response?.data?.message || '草稿保存失败，编辑内容已保留'; if (!silent) ElMessage.error(saveError.value); return false } finally { saving.value = false; if ((saveAgain || dirty.value && startRevision !== localRevision) && !stopped) { saveAgain = false; saveTimer = setTimeout(() => save(false, true), 1800) } }
}
async function loadSamples() { try { const { data } = await apiClient.get('/admin/h5-report-layout/samples'); samples.value = data.samples; if (!samples.value.length) ElMessage.info('当前授权范围内暂无已保存项目，可继续使用示例资料') } catch (error) { ElMessage.error(error.response?.data?.message || '样例资料读取失败') } }
async function loadSample() { if (sampleSelection.value === 'demo') { sampleProject.value = null; return } try { const { data } = await apiClient.get('/admin/h5-report-layout/samples', { params: { id: sampleSelection.value } }); sampleProject.value = data.project } catch (error) { sampleSelection.value = 'demo'; sampleProject.value = null; ElMessage.error(error.response?.data?.message || '无法读取该项目') } }
async function requestAI() {
  if (!design.value || aiBusy.value) return
  const data = previewContent(); let base
  try { base = compileH5Layout(design.value, data.pages, data.project) } catch (error) { return ElMessage.warning(error.message) }
  if (aiScope.value === 'page') { const candidate = base.pages.find(page => page.id === currentPage.value.id); if (!candidate) return ElMessage.info('本页没有对应样例资料，请选择有素材的页面'); base.pages = [candidate] }
  aiBusy.value = true; aiMessage.value = '正在根据模板规则生成排版建议…'; proposalFingerprint.value = fingerprint(); requestController = new AbortController()
  try { const { data } = await apiClient.post('/admin/h5-report-layout/generate', { design: base, instruction: aiInstruction.value }, { signal: requestController.signal, timeout: 65000 }); proposal.value = data.layout; aiMessage.value = '建议已生成，请预览后应用' } catch (error) { aiMessage.value = error.code === 'ERR_CANCELED' ? '已取消等待，供应商已处理的请求可能仍产生费用' : error.response?.data?.message || 'AI 排版失败，原稿已保留，可继续手动编辑' } finally { aiBusy.value = false }
}
function cancelAI() { requestController?.abort() }
function closePreview() { previewOpen.value = false; proposal.value = null }
function applyProposal() { if (proposalChanged.value) return; mutate(() => { for (const proposedPage of proposal.value.pages) { const target = design.value.pages.find(page => page.id === proposedPage.id); if (!target) continue; for (const element of proposedPage.elements) { const original = target.elements.find(item => item.id === element.id); if (original && !original.locked) for (const key of ['x', 'y', 'w', 'h', 'rotation', 'fontSize']) original[key] = element[key] } } }); proposal.value = null; ElMessage.success('排版已应用，可继续调整或撤销') }
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(canLeave)
defineExpose({ canLeave })
onMounted(async () => { pageId.value = design.value?.pages[0]?.id || ''; window.addEventListener('beforeunload', beforeUnload); try { const { data } = await apiClient.get('/admin/h5-report-config'); const latest = data.draft.templates.find(template => template.id === draft.value.id); if (latest && !dirty.value) reset(latest); revision.value = data.revision; saveState.value = '服务端草稿已就绪' } catch { saveError.value = '无法读取服务端配置，编辑内容暂不能保存' } })
onBeforeUnmount(() => { stopped = true; clearTimeout(saveTimer); requestController?.abort(); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<style scoped src="./H5TemplateStudio.css"></style>
