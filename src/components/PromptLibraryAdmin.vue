<template>
  <section class="ax-page pl-page">
    <header class="ax-head">
      <div>
        <h2>提示词库管理</h2>
        <p>初级版、入门版用户端画画时点选的图标提示词。保存后，用户端刷新就能用上。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" :disabled="loading" @click="loadData"><AdminIcon name="refresh" plain />刷新</button>
        <button type="button" class="ax-btn" @click="openCategoryForm()"><AdminIcon name="folder" plain />新增分类</button>
        <button type="button" class="ax-btn is-primary" :disabled="!selectedCategory" @click="openPromptForm()"><AdminIcon name="plus" plain />创建提示词</button>
      </div>
    </header>

    <p v-if="error" class="ax-note is-bad">{{ error }}</p>

    <div class="pl-layout">
      <aside class="ax-card is-flush pl-cats">
        <div class="pl-cats-head"><strong>提示词分类</strong><em class="ax-tab-count">{{ categories.length }}</em></div>
        <div class="pl-cat-list">
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            class="pl-cat"
            :class="{ 'is-active': selectedCategoryId === category.id, 'is-off': category.status !== 'enabled' }"
            @click="selectedCategoryId = category.id"
          >
            <span class="pl-well"><img v-if="category.iconImageUrl" :src="category.iconImageUrl" :alt="category.name" /><span v-else>{{ category.icon }}</span></span>
            <span class="pl-cat-main"><strong>{{ category.name }}</strong><small>{{ editionText(category.targetEditions) }} · {{ statusText(category.status) }}</small></span>
            <b class="pl-cat-count">{{ prompts.filter((item) => item.categoryId === category.id).length }}</b>
          </button>
        </div>
        <div v-if="!categories.length && !loading" class="ax-empty is-compact"><strong>还没有分类</strong><span>点上方「新增分类」。</span></div>
      </aside>

      <section class="ax-card is-flush pl-list">
        <div class="pl-list-head">
          <div class="pl-list-title">
            <span v-if="selectedCategory" class="pl-well is-lg"><img v-if="selectedCategory.iconImageUrl" :src="selectedCategory.iconImageUrl" :alt="selectedCategory.name" /><span v-else>{{ selectedCategory.icon }}</span></span>
            <span class="ax-cell-main"><strong>{{ selectedCategory?.name || '全部提示词' }}</strong><small v-if="selectedCategory">{{ editionText(selectedCategory.targetEditions) }} · {{ statusText(selectedCategory.status) }} · {{ filteredPrompts.length }} 个提示词</small></span>
          </div>
          <div class="ax-seg" aria-label="按版本筛选">
            <button type="button" :class="{ 'is-active': editionFilter === 'all' }" @click="editionFilter = 'all'">全部</button>
            <button type="button" :class="{ 'is-active': editionFilter === 'junior' }" @click="editionFilter = 'junior'">初级版</button>
            <button type="button" :class="{ 'is-active': editionFilter === 'starter' }" @click="editionFilter = 'starter'">入门版</button>
          </div>
        </div>
        <div v-if="selectedCategory" class="pl-cat-actions">
          <button type="button" class="ax-btn is-sm" @click="openCategoryForm(selectedCategory)"><AdminIcon name="pencil" plain />编辑分类</button>
          <button type="button" class="ax-btn is-sm is-ghost" @click="removeCategory(selectedCategory)">停用分类</button>
          <span class="ax-grow"></span>
          <button type="button" class="ax-btn is-sm is-danger" @click="removeCategory(selectedCategory, 'permanent')">永久删除分类</button>
        </div>

        <div v-if="loading" class="ax-empty is-compact"><strong>正在读取提示词配置…</strong></div>
        <div v-else-if="!filteredPrompts.length" class="ax-empty"><strong>这个分类下没有符合条件的提示词</strong><span>{{ selectedCategory ? '点上方「创建提示词」添加。' : '先选一个分类。' }}</span></div>
        <div v-else class="ax-table-wrap">
          <table class="ax-table pl-table">
            <thead><tr><th class="is-check">图标</th><th>显示名称</th><th>实际提示词</th><th>版本</th><th>状态</th><th class="is-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="item in filteredPrompts" :key="item.id">
                <td><span class="pl-well"><img v-if="item.iconImageUrl" :src="item.iconImageUrl" :alt="item.label" /><span v-else>{{ item.icon }}</span></span></td>
                <td class="is-nowrap"><strong class="pl-label">{{ item.label }}</strong></td>
                <td><span class="pl-copy" :title="item.prompt">{{ item.prompt }}</span></td>
                <td class="is-nowrap">{{ editionText(item.targetEditions) }}</td>
                <td><span class="ax-pill" :class="item.status === 'enabled' ? 'is-ok' : 'is-muted'">{{ statusText(item.status) }}</span></td>
                <td class="is-right">
                  <span class="pl-row-actions">
                    <button type="button" class="ax-btn is-sm is-soft" @click="openPromptForm(item)">编辑</button>
                    <button type="button" class="ax-btn is-sm is-ghost" @click="removeItem(item)">停用</button>
                    <button type="button" class="ax-btn is-sm is-danger" @click="removeItem(item, 'permanent')">删除</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <el-dialog
      :model-value="Boolean(formType)"
      class="ax-dialog"
      :title="formType === 'category' ? (form.id ? '编辑分类' : '新增分类') : (form.id ? '编辑提示词' : '创建提示词')"
      width="min(560px, 94vw)"
      align-center
      @update:model-value="(open) => { if (!open) closeForm() }"
    >
      <form id="prompt-library-form" class="pl-form" @submit.prevent="submitForm">
        <div class="pl-icon-editor">
          <span class="pl-well is-xl"><img v-if="form.iconImageUrl" :src="form.iconImageUrl" :alt="(formType === 'category' ? form.name : form.label) || '图标'" /><span v-else>{{ form.icon || '✨' }}</span></span>
          <div class="pl-icon-editor-main">
            <strong>{{ formType === 'category' ? '分类图片图标' : '提示词图片图标' }}</strong>
            <small class="ax-hint">{{ formType === 'category' ? '可上传图片，或用 AI 生成一张方形图标。' : '图片会保存到服务器，用户端优先显示图片。' }}</small>
            <div class="pl-icon-actions">
              <input v-if="formType === 'category'" ref="categoryIconFileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleIconFile" />
              <input v-else ref="promptIconFileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleIconFile" />
              <button type="button" class="ax-btn is-sm is-soft" @click="(formType === 'category' ? categoryIconFileInput : promptIconFileInput)?.click()"><AdminIcon name="upload" plain />上传图片</button>
              <button type="button" class="ax-btn is-sm" :disabled="iconGenerating" @click="generateIcon"><AdminIcon name="sparkles" plain />{{ iconGenerating ? '生成中…' : 'AI生成图标' }}</button>
            </div>
          </div>
        </div>

        <div class="ax-form">
          <template v-if="formType === 'category'">
            <label class="ax-field"><span>分类名称</span><input v-model.trim="form.name" maxlength="60" required placeholder="例如：画什么" /></label>
            <label class="ax-field"><span>文字图标（没有图片时显示）</span><input v-model.trim="form.icon" maxlength="12" placeholder="例如：🐶" /></label>
          </template>
          <template v-else>
            <label class="ax-field"><span>所属分类</span><select v-model="form.categoryId" required><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.icon }} {{ category.name }}</option></select></label>
            <label class="ax-field"><span>显示名称</span><input v-model.trim="form.label" maxlength="60" required placeholder="例如：小狗" /></label>
            <label class="ax-field"><span>文字图标（没有图片时显示）</span><input v-model.trim="form.icon" maxlength="12" placeholder="例如：🐶" /></label>
            <label class="ax-field pl-wide"><span>实际 AI 提示词</span><textarea v-model.trim="form.prompt" maxlength="2000" required placeholder="例如：一只可爱的小狗"></textarea></label>
          </template>
          <label class="ax-field"><span>排序</span><input v-model.number="form.sortOrder" type="number" min="0" /><small>数字越小越靠前。</small></label>
          <label class="ax-field"><span>状态</span><select v-model="form.status"><option value="enabled">启用</option><option value="disabled">停用</option><option value="archived">归档</option></select></label>
        </div>

        <div class="pl-editions">
          <span>适用版本</span>
          <div class="ax-tags is-roomy">
            <label v-for="edition in editionOptions" :key="edition.value" class="ax-chip-check">
              <input v-model="form.targetEditions" type="checkbox" :value="edition.value" />
              <span>{{ edition.label }}</span>
            </label>
          </div>
        </div>
        <p v-if="formError" class="ax-note is-bad">{{ formError }}</p>
      </form>
      <template #footer>
        <button type="button" class="ax-btn" @click="closeForm">取消</button>
        <button type="submit" form="prompt-library-form" class="ax-btn is-primary" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createPrompt, createPromptCategory, deletePrompt, deletePromptCategory, listAdminPromptLibrary, updatePrompt, updatePromptCategory, uploadPromptIconImage } from '../services/promptLibraryGateway'
import { generateArtwork } from '../services/aiGateway'
import AdminIcon from './admin/AdminIcon.vue'

const categories = ref([])
const prompts = ref([])
const selectedCategoryId = ref('')
const editionFilter = ref('all')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const formError = ref('')
const formType = ref('')
const form = reactive({ id: '', categoryId: '', name: '', label: '', icon: '✨', iconImageUrl: '', prompt: '', targetEditions: ['junior', 'starter'], sortOrder: 0, status: 'enabled' })
const categoryIconFileInput = ref(null)
const promptIconFileInput = ref(null)
const iconGenerating = ref(false)
const editionOptions = [{ value: 'junior', label: '初级版' }, { value: 'starter', label: '入门版' }]
const selectedCategory = computed(() => categories.value.find((item) => item.id === selectedCategoryId.value) || null)
const filteredPrompts = computed(() => prompts.value.filter((item) => item.categoryId === selectedCategoryId.value && (editionFilter.value === 'all' || item.targetEditions.includes(editionFilter.value))))

function editionText(values = []) { return values.length === 2 ? '初级版 + 入门版' : values.includes('junior') ? '初级版' : '入门版' }
function statusText(value) { return value === 'enabled' ? '启用' : value === 'disabled' ? '停用' : '已归档' }
async function loadData() {
  loading.value = true; error.value = ''
  try {
    const data = await listAdminPromptLibrary(); categories.value = data.categories || []; prompts.value = data.prompts || []
    if (!categories.value.some((item) => item.id === selectedCategoryId.value)) selectedCategoryId.value = categories.value[0]?.id || ''
  } catch (err) { error.value = err.response?.data?.message || err.message || '提示词配置读取失败' } finally { loading.value = false }
}
function resetForm() { Object.assign(form, { id: '', categoryId: selectedCategoryId.value || categories.value[0]?.id || '', name: '', label: '', icon: '✨', iconImageUrl: '', prompt: '', targetEditions: ['junior', 'starter'], sortOrder: 0, status: 'enabled' }); formError.value = '' }
function openCategoryForm(item = null) { resetForm(); formType.value = 'category'; if (item) Object.assign(form, { id: item.id, name: item.name, icon: item.icon, iconImageUrl: item.iconImageUrl || '', targetEditions: [...item.targetEditions], sortOrder: item.sortOrder, status: item.status }) }
function openPromptForm(item = null) { if (!categories.value.length) return ElMessage.warning('请先创建提示词分类'); resetForm(); formType.value = 'prompt'; if (item) Object.assign(form, { id: item.id, categoryId: item.categoryId, label: item.label, icon: item.icon, iconImageUrl: item.iconImageUrl || '', prompt: item.prompt, targetEditions: [...item.targetEditions], sortOrder: item.sortOrder, status: item.status }) }
function closeForm() { formType.value = ''; formError.value = '' }
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file) }) }
async function handleIconFile(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file) return
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type) || file.size > 8 * 1024 * 1024) return (formError.value = '请选择不超过8MB的 PNG、JPG 或 WEBP 图片')
  try { formError.value = ''; form.iconImageUrl = await uploadPromptIconImage(await readFileAsDataUrl(file)); ElMessage.success('图标图片已上传') } catch (err) { formError.value = err.response?.data?.message || err.message || '图标上传失败' }
}
function extractDataImage(value) { const match = String(value || '').match(/data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+/i); return match?.[0] || '' }
async function generateIcon() {
  const subject = formType.value === 'prompt' ? (form.prompt || form.label) : (form.name || '儿童美术提示词分类')
  if (!subject.trim()) return (formError.value = '请先填写名称或提示词，再生成图标')
  iconGenerating.value = true; formError.value = ''
  try {
    const result = await generateArtwork({ prompt: `${subject}，儿童友好的方形彩色贴纸图标，主体单一，背景干净，无文字`, difficulty: 'starter', style: '彩色扁平插画图标', count: 1, ratio: '1:1', quality: 'standard', returnBase64: true })
    const first = result.results?.[0] || {}
    const image = first.imageUrl || extractDataImage(first.background)
    if (!image) throw new Error('AI 没有返回可用的图标图片，请检查 AI 接口配置')
    form.iconImageUrl = image.startsWith('data:') ? await uploadPromptIconImage(image) : image
    ElMessage.success('AI 图标已生成')
  } catch (err) { formError.value = err.message || 'AI 图标生成失败' } finally { iconGenerating.value = false }
}
async function submitForm() {
  if (!form.targetEditions.length) return (formError.value = '至少选择一个适用版本')
  saving.value = true; formError.value = ''
  try {
    if (formType.value === 'category') { const saved = form.id ? await updatePromptCategory(form.id, form) : await createPromptCategory(form); if (!form.id) selectedCategoryId.value = saved.id }
    else { const saved = form.id ? await updatePrompt(form.id, form) : await createPrompt(form); selectedCategoryId.value = saved.categoryId }
    closeForm(); await loadData(); ElMessage.success('提示词配置已保存')
  } catch (err) { formError.value = err.response?.data?.message || err.message || '保存失败' } finally { saving.value = false }
}
async function removeItem(item, mode = 'archive') {
  try { await ElMessageBox.confirm(mode === 'permanent' ? `永久删除“${item.label}”后不可恢复，确定继续吗？` : `停用“${item.label}”后用户端将不再显示，确定继续吗？`, '确认操作', { type: 'warning' }); await deletePrompt(item.id, mode); await loadData(); ElMessage.success(mode === 'permanent' ? '提示词已永久删除' : '提示词已归档') } catch (err) { if (err !== 'cancel') ElMessage.error(err.response?.data?.message || err.message || '操作失败') }
}
async function removeCategory(item, mode = 'archive') {
  try { await ElMessageBox.confirm(mode === 'permanent' ? `永久删除分类“${item.name}”后不可恢复，确定继续吗？` : `停用分类“${item.name}”后用户端将不再显示，确定继续吗？`, '确认操作', { type: 'warning' }); await deletePromptCategory(item.id, mode); await loadData(); ElMessage.success(mode === 'permanent' ? '分类已永久删除' : '分类已归档') } catch (err) { if (err !== 'cancel') ElMessage.error(err.response?.data?.message || err.message || '操作失败') }
}
onMounted(loadData)
</script>

<style scoped>
/* 提示词库管理（2026-11-26 第二版）：左边分类列表 + 右边提示词表；组件类名一律 pl- 前缀 */
.pl-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); align-items: start; gap: 16px; }

.pl-cats { position: sticky; top: 84px; }
.pl-cats-head { display: flex; align-items: center; gap: 8px; padding: 16px 18px 10px; color: var(--ax-ink); font-size: 15px; }
.pl-cat-list { display: grid; gap: 2px; max-height: calc(100vh - 190px); overflow: auto; padding: 0 8px 10px; }
.pl-cat {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 0;
  padding: 9px 10px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--ax-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}
.pl-cat:hover { background: var(--ax-fill); }
.pl-cat:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.pl-cat.is-active { background: var(--ax-brand-soft); }
.pl-cat.is-active .pl-cat-main > strong { color: var(--ax-brand); }
.pl-cat.is-off .pl-well { opacity: 0.5; }
.pl-cat-main { display: grid; gap: 2px; min-width: 0; }
.pl-cat-main > strong { overflow: hidden; color: var(--ax-ink); font-size: 14px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
.pl-cat-main > small { overflow: hidden; color: var(--ax-muted); font-size: 12px; white-space: nowrap; text-overflow: ellipsis; }
.pl-cat-count { min-width: 22px; color: var(--ax-muted); font-size: 12.5px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }

/* 图标格：放用户端真正显示的图标（图片或 emoji） */
.pl-well { display: grid; flex: none; overflow: hidden; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: #fff7e6; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.06); font-size: 21px; line-height: 1; }
.pl-well > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.pl-well.is-lg { width: 44px; height: 44px; border-radius: 13px; font-size: 24px; }
.pl-well.is-xl { width: 72px; height: 72px; border-radius: 18px; font-size: 36px; }

.pl-list-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 12px; }
.pl-list-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pl-list-title .ax-cell-main > strong { font-size: 17px; }
.pl-cat-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 18px 14px; border-bottom: 1px solid var(--ax-line); }
.pl-label { color: var(--ax-ink); font-weight: 600; }
.pl-copy { display: -webkit-box; overflow: hidden; max-width: 420px; color: var(--ax-text); line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pl-row-actions { display: inline-flex; gap: 6px; }

/* 弹窗 */
.pl-form { display: grid; gap: 16px; }
.pl-icon-editor { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 16px; background: var(--ax-surface-2); }
.pl-icon-editor-main { display: grid; gap: 6px; min-width: 0; }
.pl-icon-editor-main > strong { color: var(--ax-ink); font-size: 14px; }
.pl-icon-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
.pl-wide { grid-column: 1 / -1; }
.pl-editions { display: grid; gap: 8px; }
.pl-editions > span { color: var(--ax-ink); font-size: 13px; font-weight: 600; }

@media (max-width: 1080px) {
  .pl-layout { grid-template-columns: minmax(0, 1fr); }
  .pl-cats { position: static; }
  .pl-cat-list { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); max-height: none; }
}
</style>
