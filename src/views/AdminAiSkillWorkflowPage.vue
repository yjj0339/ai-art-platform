<template>
  <!-- 页面不再有自带顶栏：标题、保存、返回、重置全部收进画布左上角「文件 ▾」菜单，
       测试与发布搬到「报告工作流库 → 工作流设置」抽屉里。这里只留画布本身。 -->
  <main class="workflow-editor-page">
    <section v-if="loading" class="page-state">正在加载玩法工作流…</section>
    <section v-else-if="loadError" class="page-state error">{{ loadError }}<button type="button" @click="loadSkill">重新加载</button></section>
    <section v-else-if="skill" class="canvas-host">
      <CanvasStudio
        :key="canvasKey"
        admin-mode
        :workflow-title="skill.title"
        :initial-canvas="skill.configuration.workflow"
        :admin-dirty="dirty"
        :admin-saving="saving"
        :admin-back-label="adminBackLabel"
        :admin-student-page="!h5Mode"
        :h5-slot-mode="h5Mode"
        @change="updateWorkflow"
        @save="updateWorkflow"
        @close="backToList"
        @request-save="saveDraft"
        @open-student-page="goStudentPage"
      />
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import CanvasStudio from './CanvasStudio.vue'
import { getEditableAiSkill, saveEditableAiSkill } from '../services/adminAiSkillEditorStore'
import { normalizeSkillForSave, validateWorkflowDraft } from '../utils/aiSkillSchema'
import { apiClient } from '../services/apiClient'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const skill = ref(null)
const dirty = ref(false)
const canvasKey = ref(0)
// 「有没有未保存的改动」不能只听画布发来的第一次快照：画布一挂载就会把初始内容回传一次，
// 若直接把 dirty 置 true，用户什么都没动就看到橙点在闪。所以拿一份基线快照做比对。
// 拖一下又拖回原位也会自动变回「没有改动」，比单纯的布尔标记更贴近事实。
let baselineJson = null
let pendingJson = ''
let leavingAfterSave = false

const listQuery = computed(() => ({ module: 'featureManagement', type: skill.value?.skillType === 'video' ? 'video' : 'image' }))
const h5Mode = computed(() => route.query.returnTo === 'h5-report')
// 「文件 → 返回」那一项写什么：从工作流库进的返回库，从报告中心进的返回报告中心，玩法中心进的返回玩法列表。
const adminBackLabel = computed(() => {
  if (h5Mode.value) return route.query.from === 'h5WorkflowLibrary' ? '返回工作流库' : '返回报告中心'
  return '返回玩法列表'
})

function copy(value) { return JSON.parse(JSON.stringify(value)) }
function errorMessage(error, fallback) { return error?.response?.data?.message || error?.message || fallback }
// 保存按钮藏进「文件」菜单后，用户改完直接点「返回」会悄悄丢改动。
// 所以离开前只要还脏着，就问一句：存了再走 / 不存直接走 / 留下继续改。
async function confirmLeave(actionLabel) {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm(
      `画布上还有没保存的改动。要先保存草稿再${actionLabel}吗？`,
      '有未保存的改动',
      { confirmButtonText: '保存并离开', cancelButtonText: '不保存，直接离开', distinguishCancelAndClose: true, type: 'warning' },
    )
    const saved = await saveDraft({ silent: true })
    if (!saved) return false
    leavingAfterSave = true
    return true
  } catch (action) {
    // 「不保存，直接离开」= cancel；点右上角 × 或遮罩 = close，那是我改主意了，留下。
    return action === 'cancel'
  }
}

async function backToList() {
  const ok = await confirmLeave('返回')
  if (!ok) return
  leavingAfterSave = true
  if (route.query.returnTo === 'h5-report') {
    // 从「报告工作流库」点行进来的退回库里；从报告中心进来的仍回报告中心。
    router.push(route.query.from === 'h5WorkflowLibrary' ? '/admin/h5-report-workflows' : '/admin/h5-reports')
    return
  }
  router.push({ path: '/admin', query: listQuery.value })
}
// 画布每次改动都会把快照传上来。第一次（挂载回传）当基线，不算改动；
// 之后按内容比对，和基线一致就说明拖回去了 / 又改回原样，橙点自动消失。
function updateWorkflow(snapshot) {
  if (!skill.value) return
  skill.value.configuration.workflow = copy(snapshot)
  const current = JSON.stringify(snapshot)
  if (baselineJson === null) {
    baselineJson = current
    dirty.value = false
    return
  }
  pendingJson = current
  dirty.value = current !== baselineJson
}

async function syncH5WorkflowVersion(saved) {
  if (route.query.returnTo !== 'h5-report' || !saved?.id) return
  const response = await apiClient.get('/admin/h5-report-config')
  const draft = copy(response.data.draft || response.data)
  const strategy = (draft.strategies || []).find((item) => item.id === 'h5-canvas-workflow')
  if (!strategy || strategy.workflowId !== saved.id) return
  strategy.workflowVersion = Number(saved.publishedVersionNumber || saved.draftRevision || 0)
  await apiClient.post('/admin/h5-report-config/draft', draft)
}

async function loadSkill() {
  loading.value = true
  loadError.value = ''
  try {
    const loaded = await getEditableAiSkill(String(route.params.skillId))
    if (!loaded) throw new Error('玩法不存在或已经被删除')
    loaded.configuration = copy(loaded.draftConfiguration || loaded.configuration)
    skill.value = loaded
    canvasKey.value += 1
    dirty.value = false
  } catch (error) {
    loadError.value = errorMessage(error, '玩法工作流加载失败')
  } finally {
    loading.value = false
  }
}

async function saveDraft(options = {}) {
  if (!skill.value) return null
  const configuration = normalizeSkillForSave(skill.value.configuration, skill.value.skillType)
  const errors = validateWorkflowDraft(configuration, skill.value.skillType)
  if (errors.length) { ElMessage.warning(errors[0]); return null }
  saving.value = true
  try {
    const saved = await saveEditableAiSkill({
      id: skill.value.id, title: skill.value.title, summary: skill.value.summary, skillType: skill.value.skillType,
      scopeType: skill.value.scopeType, sortOrder: skill.value.sortOrder, draftRevision: skill.value.draftRevision,
      configuration,
    })
    saved.configuration = copy(saved.draftConfiguration || saved.configuration)
    skill.value = saved
    // 保存成功后，比对基线换成「画布最后发上来的那份快照」。
    // 用 pendingJson 而不是重新序列化库里的数据：两者字段形状不一定完全一样，
    // 直接换字符串会比出假的「有改动」。
    if (pendingJson) baselineJson = pendingJson
    dirty.value = false
    await syncH5WorkflowVersion(saved)
    if (!options.silent) ElMessage.success('工作流草稿已保存')
    return saved
  } catch (error) {
    ElMessage.error(errorMessage(error, '工作流草稿保存失败'))
    return null
  } finally {
    saving.value = false
  }
}

async function goStudentPage() {
  if (!skill.value) return
  // confirmLeave 里已经问过「存了再走还是直接走」，这里不再偷偷存一遍。
  const ok = await confirmLeave('去用户使用页面')
  if (!ok) return
  leavingAfterSave = true
  router.push(`/admin/ai-skills/${encodeURIComponent(skill.value.id)}/student-page`)
}

// 关标签页 / 刷新 / 输入新网址也算「离开」：脏着就交给浏览器弹原生确认。
function onBeforeUnload(event) {
  if (!dirty.value || leavingAfterSave) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (dirty.value && !leavingAfterSave) window.console.info('玩法工作流存在未保存改动')
})

loadSkill()
</script>

<style scoped>
/* 页面只剩画布：原来 72px 的顶栏整条去掉，画布直接铺满整个视口。 */
.workflow-editor-page{height:100dvh;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:#f5f7fb;color:#18213a}
.canvas-host{flex:1;min-height:0;position:relative}
.canvas-host :deep(.workflow-page.admin-workflow-mode){height:100%;min-height:0;border:0;border-radius:0}
.page-state{height:100dvh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#8390a5}
.page-state.error{color:#bd4b4b}
.page-state button{min-height:34px;padding:0 14px;border:1px solid #dfe4ed;border-radius:9px;background:#fff;color:#34425d;font:inherit;cursor:pointer}
</style>
