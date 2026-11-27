<template>
  <section class="ax-page gc-page">
    <header class="ax-head">
      <div>
        <h2>分类管理</h2>
        <p>这里建的分类，就是用户端作品广场顶部那排筛选按钮。改完立即生效，不用发版。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" :disabled="loading" @click="load"><AdminIcon name="refresh" plain />刷新</button>
        <button type="button" class="ax-btn is-primary" :disabled="loading || !!loadError" @click="openCreate"><AdminIcon name="plus" plain />新建分类</button>
      </div>
    </header>

    <div v-if="loadError" class="ax-note is-bad gc-note" role="alert"><span>{{ loadError }}</span><button type="button" class="ax-btn is-sm" @click="load">重新加载</button></div>
    <div v-else-if="loading" class="ax-card"><div class="ax-empty is-compact" aria-live="polite"><strong>正在加载分类…</strong></div></div>

    <template v-else>
      <div class="ax-stats" :class="{ 'is-3': metrics.length === 3 }">
        <div v-for="metric in metrics" :key="metric.label" class="ax-stat"><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong><small>{{ metric.detail }}</small></div>
      </div>

      <div class="gc-layout">
        <section class="ax-card is-flush">
          <div class="ax-card-head gc-head">
            <div>
              <h3>分类列表</h3>
              <p>用左边的上下箭头调整顺序。「未分类」是系统兜底分类，接住还没归类的作品，不能删除也不能隐藏。</p>
            </div>
            <button v-if="orderDirty" type="button" class="ax-btn is-sm is-primary" :disabled="saving" @click="saveOrder">保存顺序</button>
          </div>

          <div v-if="!rows.length" class="ax-empty"><strong>还没有分类</strong><span>点右上角「新建分类」开始。</span></div>
          <div v-else class="gc-rows">
            <div v-for="(row, index) in rows" :key="row.id" class="gc-row" :class="{ 'is-default': row.isDefault, 'is-hidden': !row.visible && !row.isDefault }">
              <span class="gc-order">
                <button type="button" class="gc-arrow" :disabled="row.isDefault || index === 0 || saving" aria-label="上移" @click="move(index, -1)"><AdminIcon name="arrowUp" plain /></button>
                <button type="button" class="gc-arrow" :disabled="row.isDefault || index === rows.length - 1 || saving" aria-label="下移" @click="move(index, 1)"><AdminIcon name="arrowDown" plain /></button>
              </span>
              <AdminIcon :name="row.isDefault ? 'folder' : 'tag'" :tint="row.isDefault ? '#8e8e93' : ''" />
              <span class="ax-row-main">
                <strong>{{ row.name }}<em v-if="row.isDefault" class="ax-tag gc-tag">系统兜底</em></strong>
                <small>{{ row.workCount }} 件作品</small>
              </span>
              <span class="gc-visible">
                <small>{{ row.isDefault ? '始终显示' : row.visible ? '用户端显示' : '已隐藏' }}</small>
                <label class="ax-switch">
                  <input type="checkbox" :checked="row.visible || row.isDefault" :disabled="row.isDefault || saving" :aria-label="`用户端显示 ${row.name}`" @click.prevent="toggleVisible(row)" />
                  <i></i>
                </label>
              </span>
              <span class="gc-actions">
                <button type="button" class="ax-btn is-sm" :disabled="saving" @click="openRename(row)">改名</button>
                <button type="button" class="ax-btn is-sm is-danger" :disabled="row.isDefault || saving" @click="remove(row)">删除</button>
              </span>
            </div>
          </div>
        </section>

        <section class="ax-card is-flush">
          <div class="ax-card-head gc-head">
            <div>
              <h3>作品归类</h3>
              <p>用户端按分类筛选时，看的就是这里的归属。改完立即生效。</p>
            </div>
            <div class="gc-tools">
              <select v-model="filterCategory" class="ax-select" aria-label="按分类筛选作品">
                <option value="">全部分类</option>
                <option v-for="row in rows" :key="row.id" :value="row.id">{{ row.name }}</option>
              </select>
              <button type="button" class="ax-btn is-sm" :disabled="loadingWorks" @click="loadWorks"><AdminIcon name="refresh" plain />刷新作品</button>
            </div>
          </div>
          <div v-if="loadingWorks" class="ax-empty is-compact" aria-live="polite"><strong>正在加载作品…</strong></div>
          <div v-else-if="!visibleWorks.length" class="ax-empty"><strong>暂无已上架的作品</strong><span>作品通过审核上架后，可以在这里给它归类。</span></div>
          <div v-else class="gc-works">
            <div v-for="work in visibleWorks" :key="work.id" class="gc-work">
              <span class="gc-thumb"><img v-if="coverUrl(work.cover)" :src="coverUrl(work.cover)" alt="" /><AdminIcon v-else name="image" plain /></span>
              <span class="ax-row-main"><strong>{{ work.title }}</strong><small>{{ work.author }}</small></span>
              <select class="ax-select gc-assign" :value="work.categoryId || defaultCategoryId" :disabled="saving" :aria-label="`${work.title} 的分类`" @change="assign(work, $event.target.value)">
                <option v-for="row in rows" :key="row.id" :value="row.id">{{ row.name }}</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </template>

    <el-dialog v-model="create.open" class="ax-dialog" :title="create.editingId ? '给分类改名' : '新建分类'" width="min(480px, 92vw)" align-center>
      <label class="ax-field">
        <span>分类名称</span>
        <input v-model="create.name" maxlength="20" placeholder="例如：水彩、素描、手工" @keyup.enter="submitCreate" />
        <small>最多 20 个字。用户端按钮上直接显示这个名字，建议 2～6 个字。</small>
      </label>
      <template #footer>
        <button type="button" class="ax-btn" @click="create.open = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="saving" @click="submitCreate">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiClient } from '../services/apiClient'
import AdminIcon from './admin/AdminIcon.vue'

const rows = ref([])
const works = ref([])
const loading = ref(true)
const loadingWorks = ref(false)
const saving = ref(false)
const loadError = ref('')
const orderDirty = ref(false)
const filterCategory = ref('')
const create = reactive({ open: false, name: '', editingId: '' })

const defaultCategoryId = computed(() => rows.value.find((row) => row.isDefault)?.id || '')
const visibleWorks = computed(() => {
  if (!filterCategory.value) return works.value
  if (filterCategory.value === defaultCategoryId.value) return works.value.filter((work) => !work.categoryId || work.categoryId === defaultCategoryId.value)
  return works.value.filter((work) => work.categoryId === filterCategory.value)
})
const metrics = computed(() => {
  const total = rows.value.reduce((sum, row) => sum + (row.workCount || 0), 0)
  return [
    { label: '分类数量', value: rows.value.filter((row) => !row.isDefault).length, detail: '不含「未分类」' },
    { label: '用户端可见', value: rows.value.filter((row) => row.visible || row.isDefault).length, detail: '隐藏的分类不出按钮' },
    { label: '已归类作品', value: total, detail: '公开在广场的作品' },
  ]
})

const errorText = (error) => error?.response?.data?.message || error?.message || '操作失败，请稍后重试。'
const coverUrl = (value) => {
  const text = String(value || '')
  if (text.startsWith('url(')) return text.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '')
  return /^(data:image\/|https?:\/\/|\/api\/)/.test(text) ? text : ''
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await apiClient.get('/admin/gallery-categories')
    rows.value = (data.categories || []).map((row) => ({ ...row }))
    orderDirty.value = false
  } catch (error) {
    loadError.value = errorText(error)
  } finally {
    loading.value = false
  }
}

async function loadWorks() {
  loadingWorks.value = true
  try {
    const { data } = await apiClient.get('/admin/gallery-submissions', { params: { page: 1, pageSize: 100 } })
    works.value = (data.works || []).filter((work) => work.status === 'published')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    loadingWorks.value = false
  }
}

function openCreate() {
  create.open = true
  create.name = ''
  create.editingId = ''
}
function openRename(row) {
  create.open = true
  create.name = row.name
  create.editingId = row.id
}

async function submitCreate() {
  const name = create.name.trim()
  if (!name) return ElMessage.warning('请填写分类名称')
  if (name.length > 20) return ElMessage.warning('分类名称最多 20 个字')
  saving.value = true
  try {
    if (create.editingId) {
      await apiClient.patch(`/admin/gallery-categories/${create.editingId}`, { name })
      ElMessage.success('分类已改名')
    } else {
      await apiClient.post('/admin/gallery-categories', { name })
      ElMessage.success('分类已创建')
    }
    create.open = false
    await load()
    await loadWorks()
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

async function toggleVisible(row) {
  if (row.isDefault) return
  saving.value = true
  try {
    await apiClient.patch(`/admin/gallery-categories/${row.id}`, { visible: !row.visible })
    row.visible = !row.visible
    ElMessage.success(row.visible ? '已显示在用户端' : '已从用户端隐藏')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

function move(index, delta) {
  const target = index + delta
  if (target < 0 || target >= rows.value.length) return
  const list = [...rows.value]
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
  rows.value = list
  orderDirty.value = true
}

async function saveOrder() {
  saving.value = true
  try {
    const ids = rows.value.filter((row) => !row.isDefault).map((row) => row.id)
    const { data } = await apiClient.put('/admin/gallery-categories/order', { ids })
    rows.value = (data.categories || []).map((row) => ({ ...row }))
    orderDirty.value = false
    ElMessage.success('分类顺序已保存')
  } catch (error) {
    ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  if (row.isDefault) return
  try {
    await ElMessageBox.confirm(
      row.workCount > 0
        ? `「${row.name}」下还有 ${row.workCount} 件作品，删除后这些作品会移到「未分类」，不会被删掉。确定删除这个分类吗？`
        : `确定删除分类「${row.name}」吗？`,
      '删除分类',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
    saving.value = true
    const { data } = await apiClient.delete(`/admin/gallery-categories/${row.id}`)
    ElMessage.success(data.movedWorks ? `分类已删除，${data.movedWorks} 件作品移到「未分类」` : '分类已删除')
    await load()
    await loadWorks()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(errorText(error))
  } finally {
    saving.value = false
  }
}

async function assign(work, categoryId) {
  saving.value = true
  try {
    const target = categoryId === defaultCategoryId.value ? '' : categoryId
    await apiClient.put(`/admin/gallery-submissions/${work.id}/category`, { categoryId: target })
    work.categoryId = target
    await load()
    ElMessage.success('作品分类已更新')
  } catch (error) {
    ElMessage.error(errorText(error))
    await loadWorks()
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await load()
  await loadWorks()
})
</script>

<style scoped>
/* 分类管理（2026-11-26 第二版）：左边分类（排序 / 显示开关），右边作品归类；组件类名一律 gc- 前缀 */
.gc-note { align-items: center; }
.gc-note > span { flex: 1 1 auto; }
.gc-layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: start; gap: 16px; }
.gc-head { flex-wrap: wrap; margin: 0; padding: 18px 22px 14px; border-bottom: 1px solid var(--ax-line); }
.gc-head > div:first-child { flex: 1 1 240px; }
.gc-tools { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; }

.gc-rows { display: grid; }
.gc-row { display: flex; align-items: center; gap: 12px; padding: 12px 22px 12px 14px; border-bottom: 1px solid var(--ax-line); transition: background 0.12s ease; }
.gc-row:last-child { border-bottom: 0; }
.gc-row:hover { background: rgba(var(--ax-brand-rgb), 0.03); }
.gc-row > .ax-row-main { flex: 1 1 auto; }
.gc-row > .ax-row-main > strong { display: flex; align-items: center; gap: 8px; }
.gc-row.is-hidden > .ax-row-main > strong { color: var(--ax-muted); }
.gc-tag { height: 20px; padding: 0 7px; font-size: 11.5px; font-weight: 500; font-style: normal; }
.gc-order { display: grid; gap: 2px; }
.gc-arrow { display: grid; place-items: center; width: 26px; height: 20px; min-height: 0; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--ax-muted); cursor: pointer; }
.gc-arrow:hover:not(:disabled) { background: var(--ax-fill); color: var(--ax-brand); }
.gc-arrow:disabled { opacity: 0.25; cursor: not-allowed; }
.gc-arrow:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.gc-arrow > .adm-icon.is-plain { width: 15px; height: 15px; }
.gc-visible { display: flex; align-items: center; gap: 10px; }
.gc-visible > small { min-width: 64px; color: var(--ax-muted); font-size: 12.5px; text-align: right; }
.gc-actions { display: flex; gap: 6px; }

.gc-works { display: grid; max-height: 640px; overflow: auto; }
.gc-work { display: flex; align-items: center; gap: 12px; padding: 10px 22px; border-bottom: 1px solid var(--ax-line); }
.gc-work:last-child { border-bottom: 0; }
.gc-work > .ax-row-main { flex: 1 1 auto; }
.gc-work > .ax-row-main > strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gc-thumb { display: grid; flex: none; overflow: hidden; place-items: center; width: 48px; height: 40px; border-radius: 10px; background: var(--ax-fill); color: var(--ax-muted); }
.gc-thumb > img { width: 100%; height: 100%; object-fit: cover; }
.gc-assign { width: 140px; }

@media (max-width: 1180px) {
  .gc-layout { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .gc-row { flex-wrap: wrap; }
  .gc-actions { width: 100%; justify-content: flex-end; }
}
</style>
