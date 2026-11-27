<template>
  <section class="ax-page wf-page">
    <header class="ax-head">
      <div>
        <h2>报告工作流库</h2>
        <p>H5 报告的方案 2：每种报告风格一条工作流。用户在前端选定风格后，系统按这条流程自动出报告。点一行直接进无限画布编排。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" @click="goReportCenter"><AdminIcon name="h5ReportTemplates" plain />H5 报告中心</button>
        <button type="button" class="ax-btn is-primary" :disabled="creating" @click="createWorkflow"><AdminIcon name="plus" plain />{{ creating ? '创建中…' : '新建工作流' }}</button>
      </div>
    </header>

    <div class="ax-stats is-3">
      <div class="ax-stat"><span>工作流</span><strong>{{ items.length }}</strong><small>每种报告风格一条</small></div>
      <div class="ax-stat"><span>已发布</span><strong>{{ publishedCount }}</strong><small>只有已发布的才会出现在用户端</small></div>
      <div class="ax-stat"><span>用户可选</span><strong>{{ selectableCount }}</strong><small>关掉的只有讲师能用</small></div>
    </div>

    <section class="ax-card is-flush">
      <div class="wf-toolbar">
        <div class="ax-search"><input v-model.trim="keyword" type="search" placeholder="搜索工作流名称或说明" aria-label="搜索工作流" /></div>
        <span v-if="selecting" class="wf-sel"><b>已选 {{ selectedIds.length }} 项</b>勾选后可批量删除；只选一项时可打开设置</span>
        <span class="wf-spacer"></span>
        <button type="button" class="ax-btn is-sm" :class="{ 'is-soft': selecting }" :aria-pressed="selecting" @click="toggleSelecting"><AdminIcon name="check" plain />{{ selecting ? '取消多选' : '多选' }}</button>
        <button v-if="selecting" type="button" class="ax-btn is-sm" :disabled="!settingsTarget" @click="openDrawer(settingsTarget)"><AdminIcon name="settings" plain />设置</button>
        <button v-if="selecting" type="button" class="ax-btn is-sm is-danger" :disabled="!selectedIds.length || deleting" @click="removeSelected"><AdminIcon name="trash" plain />{{ deleting ? '删除中…' : '删除' }}</button>
      </div>

      <div class="wf-list">
        <article
          v-for="item in visibleItems"
          :key="item.id"
          class="wf-row"
          :class="{ 'is-picked': selecting && selectedIds.includes(item.id), 'is-selecting': selecting }"
          tabindex="0"
          :title="selecting ? '点击勾选' : '点击打开无限画布'"
          @click="handleRowClick(item)"
          @keydown.enter.self="handleRowClick(item)"
        >
          <span v-if="selecting" class="wf-check" aria-hidden="true"><i></i></span>
          <div class="wf-book" aria-hidden="true">
            <span class="wf-page2" :style="innerPageStyle(item, 2)"></span>
            <span class="wf-page1" :style="innerPageStyle(item, 1)"></span>
            <span v-if="item.coverReady" class="wf-cover"><img :src="item.coverUrl" alt="" /></span>
            <span v-else class="wf-cover is-tint" :style="coverTintStyle(item)"></span>
          </div>
          <div class="wf-info">
            <div class="wf-name">
              <strong>{{ item.title }}</strong>
            </div>
            <p class="wf-desc" :class="{ 'is-empty': !item.summary }">{{ item.summary || '还没有填写说明，用户端会只显示名称。' }}</p>
            <div class="wf-flow">
              <template v-for="(step, index) in flowSteps(item)" :key="`${item.id}-${index}`">
                <span class="wf-step" :class="{ 'is-last': index === flowSteps(item).length - 1 }">{{ step }}</span>
                <AdminIcon v-if="index < flowSteps(item).length - 1" name="chevron" plain class="wf-arrow" />
              </template>
            </div>
          </div>
          <div class="wf-meta">
            <span>{{ item.nodeCount }} 节点 · {{ item.pageCount ? `${item.pageCount} 页` : '页数待定' }}</span>
            <b>{{ item.estimatedMinutes ? `约 ${item.estimatedMinutes} 分钟` : '耗时待定' }}</b>
          </div>
          <span class="ax-pill wf-status" :class="item.stage === 'published' ? 'is-ok' : item.stage === 'testing' ? 'is-warn' : 'is-muted'">{{ stageText(item) }}</span>
          <label class="wf-switch" :title="item.studentSelectable ? '用户可选，点击改为仅讲师可用' : '仅讲师可用，点击允许用户选择'" @click.stop>
            <span class="ax-switch">
              <input type="checkbox" :checked="item.studentSelectable" :aria-label="`${item.title} 用户可选`" @click.prevent="toggleSelectable(item)" />
              <i></i>
            </span>
            <small>用户可选</small>
          </label>
          <span class="wf-more-wrap" @click.stop>
            <el-dropdown trigger="click" placement="bottom-end" @command="(command) => (command === 'canvas' ? openCanvas(item) : command === 'settings' ? openDrawer(item) : removeOne(item))">
              <button type="button" class="wf-icon-btn" :aria-label="`${item.title} 更多操作`" title="更多操作"><AdminIcon name="more" plain /></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="canvas">打开画布</el-dropdown-item>
                  <el-dropdown-item command="settings">工作流设置</el-dropdown-item>
                  <el-dropdown-item command="remove" divided class="wf-danger-item">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </span>
        </article>

        <div v-if="!visibleItems.length" class="ax-empty" :class="{ 'is-compact': loading }" aria-live="polite">
          <strong>{{ loading ? '正在加载工作流…' : keyword ? '没有匹配的工作流' : '还没有工作流' }}</strong>
          <span v-if="!loading && !keyword">点下面「新建一种报告风格的工作流」开始。</span>
        </div>

        <button type="button" class="wf-add" :disabled="creating" @click="createWorkflow"><AdminIcon name="plus" plain />新建一种报告风格的工作流</button>
      </div>
    </section>

    <!-- 工作流设置抽屉：挂到 body 上，避免被外壳的毛玻璃层裁住 -->
    <Teleport to="body">
      <div class="wf-mask" :class="{ 'is-open': drawerOpen }" @click="closeDrawer"></div>
      <aside class="wf-drawer" :class="{ 'is-open': drawerOpen }" role="dialog" aria-label="工作流设置">
        <header class="wf-drawer-head">
          <h3>工作流设置</h3>
          <button type="button" class="wf-icon-btn" aria-label="关闭" @click="closeDrawer"><AdminIcon name="close" plain /></button>
        </header>

        <div class="wf-drawer-body">
          <section class="wf-group">
            <h4>封面图<small>用户端选风格时看到的第一张图</small></h4>
            <div class="wf-cover-edit">
              <div class="wf-cover-box">
                <img v-if="form.coverUrl" :src="form.coverUrl" alt="封面预览" />
                <span v-else class="wf-cover-placeholder" :style="coverPlaceholderStyle"></span>
                <span class="ax-pill is-muted wf-cover-badge">封面</span>
              </div>
              <div class="wf-cover-ops">
                <button type="button" class="ax-btn is-sm is-soft" :disabled="busyCover" @click="pickCoverFile"><AdminIcon name="upload" plain />上传图片</button>
                <button type="button" class="ax-btn is-sm" :disabled="busyCover" @click="generateCover"><AdminIcon name="sparkles" plain />{{ busyCover ? '生成中…' : 'AI 生成封面' }}</button>
                <button type="button" class="ax-btn is-sm is-ghost" :disabled="busyCover" @click="useCanvasFirstPage">用画布第一页当封面</button>
                <small class="ax-hint">建议竖图 3:4（如 900×1200）。不上传时，用户端显示一条同色系占位条，不会报错。</small>
              </div>
            </div>
            <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleCoverFile" />
          </section>

          <label class="ax-field">
            <span>工作流名称</span>
            <input v-model.trim="form.title" type="text" maxlength="80" />
            <small>这个名字会显示在用户端「选择报告风格」的列表里。</small>
          </label>

          <div class="ax-field">
            <span>运行状态</span>
            <div class="ax-seg wf-seg" role="group" aria-label="运行状态">
              <button v-for="option in stageOptions" :key="option.value" type="button" :class="{ 'is-active': form.stage === option.value }" :aria-pressed="form.stage === option.value" @click="form.stage = option.value">{{ option.label }}</button>
            </div>
            <small>只有「已发布」的工作流才会出现在用户端。</small>
          </div>

          <!-- 测试与发布针对「库里已保存的草稿」，不是画布上还没保存的内容，所以放在库里 -->
          <section class="wf-group">
            <h4>测试与发布<small>跑的是库里已保存的草稿</small></h4>
            <div class="wf-run-state" :class="{ 'is-ok': Boolean(form.testedAt) }">
              <AdminIcon :name="form.testedAt ? 'check' : 'clock'" :tint="form.testedAt ? '' : '#8e8e93'" size="sm" />
              <span v-if="form.testedAt">已通过真实测试 · {{ formatTime(form.testedAt) }}</span>
              <span v-else>还没做过真实测试，发布前必须跑一次</span>
            </div>
            <div class="wf-run-ops">
              <button type="button" class="ax-btn is-sm" :disabled="testing || publishing" @click="runTest"><AdminIcon name="play" plain />{{ testing ? '测试中…' : '真实测试' }}</button>
              <button type="button" class="ax-btn is-sm is-primary" :disabled="testing || publishing || !form.testedAt" @click="runPublish"><AdminIcon name="send" plain />{{ publishing ? '发布中…' : '发布工作流' }}</button>
            </div>
            <p class="ax-note is-warn"><span>真实测试会真的调用模型出图，<b>会产生费用</b>；成功后状态自动变成「测试中」。发布后用户端立刻可选，旧版本仍保留，历史报告不受影响。刚在画布上改过流程的话，先回画布「文件 → 保存草稿」，否则测的是旧版。</span></p>
          </section>

          <div class="ax-field">
            <span>用户端可见</span>
            <div class="ax-seg wf-seg" role="group" aria-label="用户端可见">
              <button type="button" :class="{ 'is-active': form.studentSelectable }" :aria-pressed="form.studentSelectable" @click="form.studentSelectable = true">允许用户选择</button>
              <button type="button" :class="{ 'is-active': !form.studentSelectable }" :aria-pressed="!form.studentSelectable" @click="form.studentSelectable = false">仅讲师可用</button>
            </div>
          </div>

          <div class="ax-form">
            <label class="ax-field">
              <span>预计耗时</span>
              <select v-model.number="form.estimatedMinutes">
                <option :value="0">暂不提示</option>
                <option :value="2">约 2 分钟</option>
                <option :value="3">约 3 分钟</option>
                <option :value="4">约 4 分钟</option>
                <option :value="6">约 6 分钟</option>
                <option :value="8">约 8 分钟</option>
                <option :value="10">约 10 分钟</option>
                <option :value="15">约 15 分钟</option>
              </select>
              <small>用户提交后会看到「大约还要 X 分钟」，避免干等。</small>
            </label>
            <label class="ax-field">
              <span>每日调用上限</span>
              <select v-model.number="form.dailyLimit">
                <option :value="0">不限制</option>
                <option :value="20">20 份报告 / 天</option>
                <option :value="50">50 份报告 / 天</option>
                <option :value="100">100 份报告 / 天</option>
              </select>
              <small>超过上限后自动排队到第二天，防止一张图刷爆账单。</small>
            </label>
          </div>

          <p class="ax-note is-plain"><span><b>打开画布改流程：</b>在列表里点这一行，会直接进入无限画布编辑这条工作流，改完保存后自动升版本。已发布的旧版本仍会保留，历史报告不受影响。</span></p>
        </div>

        <footer class="wf-drawer-foot">
          <button type="button" class="ax-btn" @click="closeDrawer">取消</button>
          <button type="button" class="ax-btn is-primary" :disabled="saving" @click="saveDrawer">{{ saving ? '保存中…' : '保存设置' }}</button>
        </footer>
      </aside>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  bulkRemoveH5WorkflowLibrary,
  changeEditableAiSkillStatus,
  generateH5WorkflowCanvasCover,
  generateH5WorkflowCover,
  getH5WorkflowLibraryItem,
  listH5WorkflowLibrary,
  publishH5Workflow,
  saveEditableAiSkill,
  saveH5WorkflowLibraryItem,
  testH5Workflow,
  uploadEditableAiSkillCover,
} from '../services/adminAiSkillEditorStore'
import { defaultSkillConfiguration } from '../utils/aiSkillSchema'
import AdminIcon from './admin/AdminIcon.vue'

const emit = defineEmits(['back'])
const router = useRouter()

const items = ref([])
const loading = ref(false)
const creating = ref(false)
const saving = ref(false)
const deleting = ref(false)
const busyCover = ref(false)
const testing = ref(false)
const publishing = ref(false)
const keyword = ref('')
const selecting = ref(false)
const selectedIds = ref([])
const menuId = ref('')
const drawerOpen = ref(false)
const editingId = ref('')
const fileInput = ref(null)
const form = reactive({
  title: '',
  stage: 'draft',
  studentSelectable: false,
  estimatedMinutes: 0,
  dailyLimit: 0,
  coverUrl: '',
  coverSource: '',
  testedAt: '',
  flowSummary: [],
})

const stageOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'testing', label: '测试中' },
  { value: 'published', label: '已发布' },
]

const visibleItems = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  if (!search) return items.value
  return items.value.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(search))
})
const publishedCount = computed(() => items.value.filter((item) => item.stage === 'published').length)
const selectableCount = computed(() => items.value.filter((item) => item.studentSelectable).length)
const settingsTarget = computed(() => {
  if (selectedIds.value.length === 1) return items.value.find((item) => item.id === selectedIds.value[0]) || null
  return null
})
const coverPlaceholderStyle = computed(() => {
  const hue = hueOf(editingId.value || form.title || 'h5-workflow')
  return { background: `linear-gradient(180deg, hsl(${hue} 38% 44%), hsl(${hue} 42% 28%))` }
})

function hueOf(seed) {
  return Math.abs([...String(seed || '')].reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 360
}

function flowSteps(item) {
  const steps = Array.isArray(item.flowSummary) ? item.flowSummary.filter(Boolean) : []
  if (steps.length) return steps
  return ['待编排']
}

function stageText(item) {
  if (item.stage === 'published') return `已发布 v${item.publishedVersionNumber || 1}`
  if (item.stage === 'testing') return '测试中'
  if (item.stage === 'offline') return '已下线'
  return '草稿'
}

function stageClass(item) {
  if (item.stage === 'testing') return 'tag-test'
  if (item.stage === 'draft' || item.stage === 'offline') return 'tag-draft'
  return ''
}

function statusText(item) {
  if (item.stage === 'published') return '已发布'
  if (item.stage === 'testing') return '测试中'
  if (item.stage === 'offline') return '已下线'
  return '草稿'
}

function statusClass(item) {
  if (item.stage === 'published') return 's-live'
  if (item.stage === 'testing') return 's-test'
  return 's-draft'
}

function innerPageStyle(item, page) {
  const hue = hueOf(item.id)
  if (page === 1) {
    return {
      background: '#fff',
      padding: '3px 2px',
      '--page-tint': `hsl(${hue} 34% 82%)`,
      '--page-line': `hsl(${hue} 30% 92%)`,
    }
  }
  return {
    background: `hsl(${hue} 34% 36%)`,
    padding: '3px 2px',
    '--page-tint': `hsl(${hue} 34% 58%)`,
  }
}

// 未上传封面时用同色系渐变占位：列表里每行仍有「一种风格」的辨识度，
// 又不会像纯白板那样看起来像加载失败。配色与内页同源，三者叠放才像一个册子。
function coverTintStyle(item) {
  const hue = hueOf(item.id)
  return {
    background: `linear-gradient(162deg, hsl(${hue} 36% 46%) 0%, hsl(${hue} 40% 30%) 100%)`,
    '--cover-deco': `hsl(${hue} 44% 74%)`,
  }
}

async function load() {
  loading.value = true
  try {
    items.value = await listH5WorkflowLibrary()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '工作流库加载失败')
    items.value = []
  } finally {
    loading.value = false
  }
}

function goReportCenter() {
  if (emit) emit('back')
  else router.replace('/admin/h5-reports')
}

function toggleSelecting() {
  selecting.value = !selecting.value
  if (!selecting.value) selectedIds.value = []
}

// 点行 = 进无限画布配工作流（主操作）。
// 工作流设置（封面/耗时/用户可选）走行尾「⋯」菜单，避免同一个抽屉有两个入口。
function handleRowClick(item) {
  if (selecting.value) {
    const index = selectedIds.value.indexOf(item.id)
    if (index >= 0) selectedIds.value.splice(index, 1)
    else selectedIds.value.push(item.id)
    return
  }
  openCanvas(item)
}

function toggleMenu(id) {
  menuId.value = menuId.value === id ? '' : id
}

function closeMenu() {
  menuId.value = ''
}

async function openCanvas(item) {
  closeMenu()
  // from=h5WorkflowLibrary 让画布页的「返回」回到本库，而不是报告中心（少点一次）。
  router.push({ path: `/admin/ai-skills/${encodeURIComponent(item.id)}/workflow`, query: { returnTo: 'h5-report', from: 'h5WorkflowLibrary' } })
}

async function openDrawer(item) {
  if (!item) return
  closeMenu()
  editingId.value = item.id
  const detail = await getH5WorkflowLibraryItem(item.id).catch(() => null)
  const source = detail || item
  form.title = source.title || ''
  form.stage = source.stage || 'draft'
  form.studentSelectable = Boolean(source.studentSelectable)
  form.estimatedMinutes = Number(source.estimatedMinutes || 0)
  form.dailyLimit = Number(source.dailyLimit || 0)
  form.coverUrl = source.coverUrl || ''
  form.coverSource = source.coverSource || ''
  form.testedAt = source.testedAt || ''
  form.flowSummary = Array.isArray(source.flowSummary) ? [...source.flowSummary] : []
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  editingId.value = ''
}

async function toggleSelectable(item) {
  try {
    const updated = await saveH5WorkflowLibraryItem(item.id, { studentSelectable: !item.studentSelectable })
    if (updated) Object.assign(item, updated)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '切换失败')
  }
}

function pickCoverFile() {
  fileInput.value?.click()
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

async function handleCoverFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    ElMessage.warning('封面仅支持 PNG、JPG、WEBP')
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    ElMessage.warning('封面图片不能超过 8MB')
    return
  }
  busyCover.value = true
  try {
    const dataUrl = await readFileAsDataUrl(file)
    const assetUrl = await uploadEditableAiSkillCover(dataUrl)
    if (!assetUrl) throw new Error('上传失败')
    form.coverUrl = assetUrl
    form.coverSource = 'upload'
    ElMessage.success('封面已上传，记得点保存设置')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '封面上传失败')
  } finally {
    busyCover.value = false
  }
}

async function generateCover() {
  if (!editingId.value) return
  busyCover.value = true
  try {
    const result = await generateH5WorkflowCover(editingId.value)
    if (result?.assetUrl) {
      form.coverUrl = result.assetUrl
      form.coverSource = 'ai'
      const target = items.value.find((item) => item.id === editingId.value)
      if (target && result.workflow) Object.assign(target, result.workflow)
      ElMessage.success('AI 封面已生成')
    } else {
      ElMessage.warning('AI 没有返回可用封面，请重试')
    }
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || 'AI 生成封面失败')
  } finally {
    busyCover.value = false
  }
}

async function useCanvasFirstPage() {
  if (!editingId.value) return
  busyCover.value = true
  try {
    // 取图口径交给服务端（h5WorkflowCanvasCoverSource），与画布 nodeMarkingImage() 保持一致。
    // 前端早先只看 data.image，而画布成图在 data.output.url，会误报「还没有生成过图片」。
    const result = await generateH5WorkflowCanvasCover(editingId.value)
    if (!result?.assetUrl) {
      ElMessage.warning('画布第一页读取失败，请重试')
      return
    }
    form.coverUrl = result.assetUrl
    form.coverSource = 'canvas-first-page'
    const target = items.value.find((item) => item.id === editingId.value)
    if (target && result.workflow) Object.assign(target, result.workflow)
    ElMessage.success('已用画布第一页当封面')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '读取画布失败')
  } finally {
    busyCover.value = false
  }
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 真实测试：跑的是库里已保存的草稿，会真的调模型出图（产生费用），所以先确认一次。
async function runTest() {
  if (!editingId.value || testing.value || publishing.value) return
  try {
    await ElMessageBox.confirm(
      '真实测试会调用模型真的生成一组图片（会消耗额度），确认开始测试？',
      '真实测试',
      { type: 'warning', confirmButtonText: '开始测试', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  testing.value = true
  try {
    const result = await testH5Workflow(editingId.value)
    if (result?.workflow) {
      // 测试成功后服务端会把 runtime.testedAt 写上，本地表单同步一下，「发布」按钮才会亮。
      form.testedAt = result.workflow.testedAt || new Date().toISOString()
      form.stage = 'testing'
      const target = items.value.find((item) => item.id === editingId.value)
      if (target) Object.assign(target, result.workflow)
    } else {
      form.testedAt = form.testedAt || new Date().toISOString()
      form.stage = 'testing'
    }
    await load()
    ElMessage.success(`真实测试通过，生成 ${result?.images?.length || 0} 张图片`)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '真实测试失败')
  } finally {
    testing.value = false
  }
}

async function runPublish() {
  if (!editingId.value || testing.value || publishing.value) return
  if (!form.testedAt) {
    ElMessage.warning('发布前必须先完成一次真实测试')
    return
  }
  try {
    await ElMessageBox.confirm(
      '发布后用户端立刻能选到这条工作流，旧版本会保留。确认发布？',
      '发布工作流',
      { type: 'warning', confirmButtonText: '发布', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  publishing.value = true
  try {
    const published = await publishH5Workflow(editingId.value)
    if (published) {
      form.stage = 'published'
      const target = items.value.find((item) => item.id === editingId.value)
      if (target) Object.assign(target, published)
    }
    await load()
    ElMessage.success('工作流已发布，用户端现在可以选到它')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '发布失败，请先完成真实测试')
  } finally {
    publishing.value = false
  }
}

async function saveDrawer() {
  if (!editingId.value) return
  if (!form.title.trim()) {
    ElMessage.warning('请填写工作流名称')
    return
  }
  const target = items.value.find((item) => item.id === editingId.value)
  if (form.stage === 'testing' && !form.testedAt && target?.stage !== 'testing') {
    ElMessage.warning('“测试中”需要先完成一次真实测试，请点上面的“真实测试”')
    return
  }
  // 发布与「保存设置」解耦：状态切到“已发布”不等于真的发布，
  // 真发布走上面「发布工作流」按钮（带版本号与二次确认）。这里只做提醒，不偷偷发布。
  if (form.stage === 'published' && target?.stage !== 'published') {
    ElMessage.warning('要真正发布请点上面的“发布工作流”，这里只保存设置')
    return
  }
  saving.value = true
  try {
    if (form.stage === 'draft' && target?.stage !== 'draft') {
      await changeEditableAiSkillStatus(editingId.value, 'draft')
    }
    await saveH5WorkflowLibraryItem(editingId.value, {
      title: form.title,
      coverUrl: form.coverUrl,
      coverSource: form.coverSource,
      studentSelectable: form.studentSelectable,
      estimatedMinutes: form.estimatedMinutes,
      dailyLimit: form.dailyLimit,
      flowSummary: form.flowSummary,
    })
    await load()
    ElMessage.success('设置已保存')
    closeDrawer()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.response?.data?.message || error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function removeOne(item) {
  closeMenu()
  try {
    await ElMessageBox.confirm(`确认删除「${item.title}」？删除后无法恢复。`, '删除工作流', { type: 'warning' })
  } catch {
    return
  }
  deleting.value = true
  try {
    await bulkRemoveH5WorkflowLibrary([item.id])
    await load()
    ElMessage.success('已删除')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '删除失败')
  } finally {
    deleting.value = false
  }
}

async function removeSelected() {
  if (!selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(`确认删除已选的 ${selectedIds.value.length} 条工作流？删除后无法恢复。`, '批量删除', { type: 'warning' })
  } catch {
    return
  }
  deleting.value = true
  try {
    await bulkRemoveH5WorkflowLibrary([...selectedIds.value])
    selectedIds.value = []
    await load()
    ElMessage.success('已删除所选工作流')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '删除失败')
  } finally {
    deleting.value = false
  }
}

async function createWorkflow() {
  if (creating.value) return
  creating.value = true
  try {
    const configuration = defaultSkillConfiguration('image')
    configuration.h5Workflow = { studentSelectable: false, estimatedMinutes: 6, pageCount: 4, flowSummary: [] }
    const skill = await saveEditableAiSkill({
      title: '新建报告风格工作流',
      summary: '',
      skillType: 'image',
      // 关键：标明用途，避免这条工作流出现在「AI 玩法中心」里。
      usageKind: 'report_workflow',
      configuration,
    })
    if (!skill?.id) throw new Error('创建失败')
    router.push({ path: `/admin/ai-skills/${encodeURIComponent(skill.id)}/workflow`, query: { returnTo: 'h5-report', from: 'h5WorkflowLibrary' } })
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '新建工作流失败')
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  load()
  document.addEventListener('click', closeMenu)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenu)
})
</script>

<style scoped>
/* 报告工作流库（2026-11-26 第二版）：小册子缩略图 + 流程步骤的列表行，右侧玻璃抽屉做设置；组件类名一律 wf- 前缀 */
.wf-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--ax-line); }
.wf-toolbar > .ax-search { flex: 0 1 320px; }
.wf-sel { display: inline-flex; align-items: baseline; gap: 8px; color: var(--ax-muted); font-size: 12.5px; }
.wf-sel > b { color: var(--ax-ink); font-size: 13.5px; font-variant-numeric: tabular-nums; }
.wf-spacer { flex: 1 1 auto; }

.wf-list { display: grid; }
.wf-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 128px 92px 92px 34px;
  align-items: center;
  gap: 18px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--ax-line);
  cursor: pointer;
  transition: background 0.12s ease;
}
.wf-row.is-selecting { grid-template-columns: 26px 72px minmax(0, 1fr) 128px 92px 92px 34px; }
.wf-row:hover { background: rgba(var(--ax-brand-rgb), 0.035); }
.wf-row.is-picked { background: rgba(var(--ax-brand-rgb), 0.07); }
.wf-row:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--ax-brand-ring); }

.wf-check { display: grid; place-items: center; }
.wf-check > i { display: grid; place-items: center; width: 22px; height: 22px; border: 2px solid var(--ax-fill-strong); border-radius: 50%; background: #fff; transition: background 0.15s ease, border-color 0.15s ease; }
.wf-row.is-picked .wf-check > i { border-color: var(--ax-brand); background: var(--ax-brand); }
.wf-row.is-picked .wf-check > i::after { content: ''; width: 8px; height: 4.5px; margin-top: -3px; border-bottom: 2px solid #fff; border-left: 2px solid #fff; transform: rotate(-45deg); }

/* 小册子缩略图：封面压在两页内页上，三张叠放才像一本 H5 报告 */
.wf-book { position: relative; width: 72px; height: 84px; }
.wf-book > span { position: absolute; top: 0; overflow: hidden; width: 54px; height: 72px; border-radius: 9px; box-shadow: 0 4px 12px rgba(16, 24, 40, 0.12); }
.wf-page2 { left: 18px; top: 8px !important; transform: rotate(7deg); opacity: 0.85; }
.wf-page1 { left: 10px; top: 5px !important; transform: rotate(3.5deg); }
.wf-page1::before,
.wf-page1::after { content: ''; position: absolute; left: 8px; right: 8px; height: 4px; border-radius: 2px; background: var(--page-tint, #e5e5ea); }
.wf-page1::before { top: 14px; }
.wf-page1::after { top: 24px; right: 18px; }
.wf-cover { left: 0; z-index: 1; }
.wf-cover > img { width: 100%; height: 100%; object-fit: cover; }
.wf-cover.is-tint::after { content: ''; position: absolute; left: 9px; right: 9px; bottom: 10px; height: 18px; border-radius: 5px; background: var(--cover-deco, rgba(255, 255, 255, 0.5)); opacity: 0.55; }

.wf-info { display: grid; gap: 5px; min-width: 0; }
.wf-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.wf-name > strong { overflow: hidden; color: var(--ax-ink); font-size: 15px; font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }
.wf-desc { overflow: hidden; margin: 0; color: var(--ax-text); font-size: 13px; white-space: nowrap; text-overflow: ellipsis; }
.wf-desc.is-empty { color: var(--ax-faint); }
.wf-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 2px; }
.wf-step { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 7px; background: var(--ax-fill); color: var(--ax-text); font-size: 12px; white-space: nowrap; }
.wf-step.is-last { background: var(--ax-brand-soft); color: var(--ax-brand); font-weight: 600; }
.wf-flow > .adm-icon.is-plain.wf-arrow { width: 12px; height: 12px; color: var(--ax-faint); }

.wf-meta { display: grid; gap: 3px; font-size: 12.5px; }
.wf-meta > span { color: var(--ax-muted); white-space: nowrap; }
.wf-meta > b { color: var(--ax-ink); font-weight: 600; white-space: nowrap; }
.wf-status { justify-self: start; }
.wf-switch { display: grid; justify-items: center; gap: 4px; cursor: pointer; }
.wf-switch > small { color: var(--ax-muted); font-size: 11.5px; white-space: nowrap; }
.wf-more-wrap { display: grid; place-items: center; }
.wf-icon-btn { display: grid; place-items: center; width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: 10px; background: transparent; color: var(--ax-muted); cursor: pointer; transition: background 0.12s ease, color 0.12s ease; }
.wf-icon-btn:hover { background: var(--ax-fill); color: var(--ax-ink); }
.wf-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }

.wf-add { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 56px; margin: 14px 18px 18px; border: 1.5px dashed var(--ax-line-strong); border-radius: 16px; background: transparent; color: var(--ax-brand); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
.wf-add:hover:not(:disabled) { border-color: rgba(var(--ax-brand-rgb), 0.45); background: rgba(var(--ax-brand-rgb), 0.04); }
.wf-add:disabled { opacity: 0.5; cursor: not-allowed; }
.wf-add:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }

/* 设置抽屉：Teleport 到 body，套件变量定义在 :root 上，照常可用 */
.wf-mask { position: fixed; inset: 0; z-index: 2000; background: rgba(15, 23, 42, 0.18); opacity: 0; pointer-events: none; transition: opacity 0.25s ease; }
.wf-mask.is-open { opacity: 1; pointer-events: auto; }
.wf-drawer {
  position: fixed;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 2001;
  display: flex;
  flex-direction: column;
  width: min(480px, calc(100vw - 24px));
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 24px;
  background: rgba(248, 249, 252, 0.94);
  box-shadow: 0 24px 60px rgba(16, 24, 40, 0.22);
  color: var(--ax-ink);
  visibility: hidden;
  transform: translateX(calc(100% + 24px));
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s linear 0.3s;
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  backdrop-filter: saturate(180%) blur(30px);
}
.wf-drawer.is-open { visibility: visible; transform: none; transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
.wf-drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 18px 12px 22px; }
.wf-drawer-head > h3 { margin: 0; font-size: 18px; font-weight: 700; }
.wf-drawer-body { display: grid; flex: 1 1 auto; align-content: start; gap: 16px; padding: 4px 22px 18px; overflow-y: auto; }
.wf-drawer-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px 18px; border-top: 1px solid var(--ax-line); }

.wf-group { display: grid; gap: 12px; padding: 16px; border-radius: 16px; background: var(--ax-surface-2); }
.wf-group > h4 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin: 0; color: var(--ax-ink); font-size: 14px; font-weight: 700; }
.wf-group > h4 small { color: var(--ax-muted); font-size: 12px; font-weight: 400; }
.wf-group > .ax-note { margin: 0; }
.wf-cover-edit { display: grid; grid-template-columns: 120px minmax(0, 1fr); align-items: start; gap: 16px; }
.wf-cover-box { position: relative; overflow: hidden; aspect-ratio: 3 / 4; border-radius: 14px; background: #fff; box-shadow: 0 6px 16px rgba(16, 24, 40, 0.12); }
.wf-cover-box > img,
.wf-cover-placeholder { display: block; width: 100%; height: 100%; object-fit: cover; }
.wf-cover-badge { position: absolute; left: 8px; bottom: 8px; background: rgba(255, 255, 255, 0.92) !important; }
.wf-cover-ops { display: grid; justify-items: start; gap: 8px; min-width: 0; }
.wf-seg { display: flex; width: 100%; padding: 3px; border-radius: 11px; }
.wf-seg > button { flex: 1 1 0; height: 32px; font-size: 13px; }
.wf-run-state { display: flex; align-items: center; gap: 10px; color: var(--ax-text); font-size: 13.5px; }
.wf-run-state.is-ok { color: var(--ax-ok); }
.wf-run-ops { display: flex; flex-wrap: wrap; gap: 8px; }

@media (max-width: 1100px) {
  .wf-row { grid-template-columns: 72px minmax(0, 1fr) auto 76px 34px; gap: 14px; }
  .wf-row.is-selecting { grid-template-columns: 26px 72px minmax(0, 1fr) auto 76px 34px; }
  .wf-meta { display: none; }
}
@media (max-width: 640px) {
  .wf-row,
  .wf-row.is-selecting { grid-template-columns: 60px minmax(0, 1fr) 34px; gap: 12px; }
  .wf-row.is-selecting { grid-template-columns: 22px 60px minmax(0, 1fr) 34px; }
  .wf-switch,
  .wf-status { display: none; }
  .wf-book { transform: scale(0.85); transform-origin: left center; }
  .wf-cover-edit { grid-template-columns: minmax(0, 1fr); }
  .wf-cover-box { width: 120px; }
}
</style>

<style>
/* el-dropdown 的菜单挂在 body 上，scoped 选不到，只放一条删除项变红 */
.el-dropdown-menu__item.wf-danger-item { color: #ff3b30; }
.el-dropdown-menu__item.wf-danger-item:not(.is-disabled):hover,
.el-dropdown-menu__item.wf-danger-item:not(.is-disabled):focus { background: rgba(255, 59, 48, 0.08); color: #ff3b30; }
</style>
