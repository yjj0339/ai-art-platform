<template>
  <main class="student-builder-page">
    <header class="builder-header">
      <div class="title-area">
        <button type="button" class="back-button" @click="backToWorkflow"><ArrowLeft /></button>
        <div><span>AI玩法中心 / 用户使用页面配置</span><strong>{{ skill?.title || '加载中…' }}</strong></div>
        <em v-if="skill">{{ statusLabel(skill.status) }}</em>
      </div>
      <nav class="step-nav" aria-label="玩法配置步骤">
        <button type="button" @click="backToWorkflow"><i>1</i>工作流配置</button><b /><span class="active"><i>2</i>用户使用页面</span>
      </nav>
      <div class="header-actions">
        <button type="button" :disabled="loading || saving" @click="saveDraft">保存草稿</button>
        <button type="button" :disabled="loading || testing || !SERVER_AUTH_MODE" :title="SERVER_AUTH_MODE ? '' : '本地演示模式不执行真实模型测试'" @click="testSkill">{{ testing ? '测试中…' : '真实测试' }}</button>
        <button type="button" class="primary" :disabled="loading || saving || !SERVER_AUTH_MODE" :title="SERVER_AUTH_MODE ? '' : '正式服务模式下测试成功后才能发布'" @click="publishSkill">发布给用户</button>
      </div>
    </header>

    <section v-if="loading" class="page-state">正在加载用户页面配置…</section>
    <section v-else-if="loadError" class="page-state error">{{ loadError }}<button type="button" @click="loadSkill">重新加载</button></section>

    <section v-else-if="skill" class="builder-shell">
      <aside class="config-panel">
        <nav class="config-tabs">
          <button type="button" :class="{ active: activeTab === 'layout' }" @click="activeTab = 'layout'">页面布局</button>
          <button type="button" :class="{ active: activeTab === 'components' }" @click="activeTab = 'components'">添加组件</button>
          <button type="button" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">组件设置</button>
        </nav>

        <div v-if="activeTab === 'layout'" class="panel-scroll">
          <p class="panel-tip">点击预览中的组件进行设置，拖动由“上移/下移”控制顺序。</p>
          <div class="block-list">
            <button v-for="block in blocks" :key="block.id" type="button" :class="{ active: selectedBlockId === block.id }" @click="selectBlock(block.id)">
              <span><component :is="catalogIcon(block.type)" />{{ block.label || blockTypeLabel(block.type) }}</span><small>{{ spanLabel(block.span) }}</small>
            </button>
          </div>
        </div>

        <div v-else-if="activeTab === 'components'" class="panel-scroll component-catalog">
          <p class="panel-tip">点击组件即可加入用户页面。</p>
          <button v-for="item in skillBlockCatalog" :key="item.type" type="button" @click="addBlock(item)"><component :is="catalogIcon(item.type)" /><span>{{ item.label }}</span><CirclePlus /></button>
        </div>

        <div v-else class="panel-scroll">
          <div v-if="selectedBlock" class="block-settings">
            <header><div><strong>{{ selectedBlock.label || blockTypeLabel(selectedBlock.type) }}</strong><small>{{ blockTypeLabel(selectedBlock.type) }}</small></div><button type="button" class="danger" @click="removeBlock(selectedBlock.id)"><Delete />删除</button></header>
            <label><span>显示名称</span><input v-model="selectedBlock.label" /></label>
            <label v-if="isInputBlock(selectedBlock)"><span>字段标识</span><input v-model="selectedBlock.key" placeholder="例如 subject" /></label>
            <label v-if="isInputBlock(selectedBlock)"><span>绑定工作流节点</span><select v-model="selectedBlock.binding"><option value="">请选择</option><option v-for="node in bindableNodes" :key="node.id" :value="node.id">{{ node.data?.title || node.id }}</option><option value="runtime.ratio">生成设置：比例</option><option value="runtime.count">生成设置：数量</option></select></label>
            <label><span>组件宽度</span><select v-model.number="selectedBlock.span"><option :value="4">三分之一</option><option :value="6">半行</option><option :value="8">三分之二</option><option :value="12">整行</option></select></label>
            <label v-if="isInputBlock(selectedBlock)"><span>输入提示</span><input v-model="selectedBlock.placeholder" /></label>
            <label v-if="selectedBlock.type === 'select'"><span>选项（逗号分隔）</span><input :value="optionsText(selectedBlock)" @change="setOptions(selectedBlock, $event.target.value)" /></label>
            <label v-if="isInputBlock(selectedBlock)" class="check"><input v-model="selectedBlock.required" type="checkbox" />用户必须填写</label>
            <div class="move-actions"><button type="button" @click="moveBlock(selectedBlock.id, -1)"><ArrowUp />上移</button><button type="button" @click="moveBlock(selectedBlock.id, 1)"><ArrowDown />下移</button></div>
          </div>
          <div v-else class="empty-settings">请先在预览或页面布局中选择一个组件。</div>
        </div>
      </aside>

      <main class="preview-stage">
        <header>
          <div><strong>用户页面实时预览</strong><span>后台预览和用户正式页面使用同一套组件</span></div>
          <div class="device-switch"><button type="button" :class="{ active: previewDevice === 'desktop' }" @click="previewDevice = 'desktop'"><Monitor />电脑</button><button type="button" :class="{ active: previewDevice === 'mobile' }" @click="previewDevice = 'mobile'"><Iphone />手机</button></div>
        </header>

        <div v-if="promptCheck.missing.length" class="prompt-check">
          <WarningFilled />
          <div>
            <strong>提示词里有 {{ promptCheck.missing.length }} 个位置，用户页面上没有对应的填写项</strong>
            <span>{{ promptCheck.missingLabel }}</span>
            <small>这些位置在生成时会变成空白，用户填的内容进不到提示词里，出图就会和填写的无关。</small>
          </div>
          <button type="button" class="fix" @click="addMissingFields">一键补齐</button>
        </div>

        <div class="preview-canvas" :class="previewDevice">
          <AiSkillStudentPage
            :title="skill.title"
            :summary="skill.summary"
            :skill-type="skill.skillType"
            :blocks="blocks"
            :values="previewValues"
            :preview-device="previewDevice"
            :selected-id="selectedBlockId"
            :result="testResult"
            :running="testing"
            @select="selectBlock"
            @update:values="previewValues = $event"
            @run="handlePreviewRun"
          />
        </div>
      </main>
    </section>
  </main>
</template>

<script setup>
import { computed, markRaw, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowLeft, ArrowUp, CirclePlus, Delete, Grid, Iphone, MagicStick, Monitor, Picture, Select, Switch, UploadFilled, VideoPlay, WarningFilled } from '@element-plus/icons-vue'
import AiSkillStudentPage from '../components/AiSkillStudentPage.vue'
import { getEditableAiSkill, publishEditableAiSkill, saveEditableAiSkill, SERVER_AUTH_MODE } from '../services/adminAiSkillEditorStore'
import { testAdminAiSkill } from '../services/aiSkillGateway'
import { normalizeSkillForSave, skillBlockCatalog, validateSkillDraft } from '../utils/aiSkillSchema'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const loadError = ref('')
const skill = ref(null)
const activeTab = ref('layout')
const previewDevice = ref('desktop')
const selectedBlockId = ref('')
const previewValues = ref({})
const testResult = ref(null)
const blocks = computed(() => skill.value?.configuration?.studentPage?.blocks || [])
const selectedBlock = computed(() => blocks.value.find((block) => block.id === selectedBlockId.value) || null)
const bindableNodes = computed(() => skill.value?.configuration?.workflow?.nodes?.filter((node) => node.type !== 'marker' && node.type !== 'result') || [])

// 提示词体检：提示词模板里的 {{变量}} 必须和用户页面的「字段标识」一一对上，
// 否则生成时该位置会被替换成空字符串，用户填的内容进不了提示词（属于静默失效，最难排查）。
const promptVars = computed(() => {
  const template = skill.value?.configuration?.runtime?.promptTemplate || ''
  return [...new Set([...template.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]))]
})
const pageKeys = computed(() => [...new Set(blocks.value.filter((block) => block.key).map((block) => block.key))])
const promptCheck = computed(() => {
  const missing = promptVars.value.filter((key) => !pageKeys.value.includes(key))
  return {
    missing,
    missingLabel: missing.map((key) => '{' + '{' + key + '}' + '}').join('、'),
    unused: pageKeys.value.filter((key) => !promptVars.value.includes(key)),
  }
})

function addMissingFields() {
  if (!skill.value || !promptCheck.value.missing.length) return
  const configuration = skill.value.configuration || (skill.value.configuration = {})
  const studentPage = configuration.studentPage || (configuration.studentPage = { layoutVersion: 1, columns: 12, blocks: [] })
  const current = Array.isArray(studentPage.blocks) ? studentPage.blocks : []
  const submitIndex = current.findIndex((block) => block.type === 'submit')
  const insertAt = submitIndex < 0 ? current.length : submitIndex
  const stamp = Date.now().toString(36)
  const created = promptCheck.value.missing.map((key, index) => ({
    id: `block_${key}_${stamp}_${index}`,
    type: key === 'subject' ? 'textarea' : 'text',
    key,
    binding: '',
    span: key === 'subject' ? 12 : 6,
    label: key === 'subject' ? '画面描述' : `填写项：${key}`,
    required: key === 'subject',
    placeholder: '',
    options: [],
  }))
  studentPage.blocks = [...current.slice(0, insertAt), ...created, ...current.slice(insertAt)]
  const first = created[0]
  if (first) selectBlock(first.id)
  ElMessage.success(`已补上 ${created.length} 个填写项，请按需要改名后保存草稿`)
}

async function handlePreviewRun() {
  if (!SERVER_AUTH_MODE) { ElMessage.info('当前是本地演示模式，真实测试请在服务端登录模式执行'); return }
  try {
    await ElMessageBox.confirm('这会真实调用一次模型生成图片，产生费用。确定现在测试吗？', '真实测试会花钱', {
      confirmButtonText: '确定测试', cancelButtonText: '先不测', type: 'warning',
    })
  } catch { return }
  await testSkill()
}

function copy(value) { return JSON.parse(JSON.stringify(value)) }
function errorMessage(error, fallback) { return error?.response?.data?.message || error?.message || fallback }
function statusLabel(status) { return ({ draft: '草稿', published: '已发布', offline: '已下线' })[status] || status }
function blockTypeLabel(type) { return skillBlockCatalog.find((item) => item.type === type)?.label || '页面组件' }
function spanLabel(span) { return ({ 4: '三分之一', 6: '半行', 8: '三分之二', 12: '整行' })[span] || `${span}/12列` }
function isInputBlock(block) { return ['image', 'images', 'text', 'textarea', 'select', 'switch', 'count', 'ratio'].includes(block.type) }
function optionsText(block) { return (block.options || []).map((item) => item.value).join(',') }
function setOptions(block, value) { block.options = String(value).split(',').map((item) => item.trim()).filter(Boolean).map((item) => ({ label: item, value: item })) }
function catalogIcon(type) { return markRaw(({ image: UploadFilled, images: Picture, text: MagicStick, textarea: MagicStick, select: Select, switch: Switch, count: Grid, ratio: Grid, heading: MagicStick, example: Picture, submit: VideoPlay, result: Picture })[type] || Grid) }
function selectBlock(id) { selectedBlockId.value = id; activeTab.value = 'settings' }
function ensureRequiredBlocks(configuration, skillType) {
  const studentPage = configuration.studentPage || (configuration.studentPage = { layoutVersion: 1, columns: 12, blocks: [] })
  const current = Array.isArray(studentPage.blocks) ? studentPage.blocks : []
  const next = [...current]
  const hasSubject = next.some((block) => ['text', 'textarea'].includes(block.type) && block.key === 'subject')
  const hasSubmit = next.some((block) => block.type === 'submit')
  const hasResult = next.some((block) => block.type === 'result')
  if (!hasSubject) next.splice(Math.min(2, next.length), 0, {
    // 不绑定画布节点：不同玩法的工作流节点 id 各不相同，硬编码会触发“绑定的画布节点不存在”。
    id: `block_subject_${Date.now().toString(36)}`, type: 'textarea', key: 'subject', binding: '', span: 6,
    label: skillType === 'video' ? '动作描述' : '画面描述', required: true, placeholder: '描述你想生成的画面', options: [],
  })
  if (!hasSubmit) next.push({ id: `block_submit_${Date.now().toString(36)}`, type: 'submit', span: 12, label: skillType === 'video' ? '生成视频' : '生成图片', options: [] })
  if (!hasResult) next.push({ id: `block_result_${Date.now().toString(36)}`, type: 'result', span: 12, label: skillType === 'video' ? '视频结果' : '生成结果', options: [] })
  studentPage.blocks = next
  return configuration
}
function backToWorkflow() { router.push(`/admin/ai-skills/${encodeURIComponent(route.params.skillId)}/workflow`) }
function addBlock(item) {
  if (!skill.value) return
  const configuration = skill.value.configuration || (skill.value.configuration = {})
  const studentPage = configuration.studentPage || (configuration.studentPage = { layoutVersion: 1, columns: 12, blocks: [] })
  const currentBlocks = Array.isArray(studentPage.blocks) ? studentPage.blocks : []
  const block = {
    id: `block_${Date.now().toString(36)}`,
    type: item.type,
    span: item.defaultSpan,
    label: item.label,
    key: item.input ? `${item.type}_${currentBlocks.length + 1}` : '',
    binding: '',
    required: false,
    placeholder: '',
    options: item.type === 'select' ? [{ label: '选项一', value: '选项一' }] : [],
  }
  studentPage.blocks = [...currentBlocks, block]
  selectBlock(block.id)
}
function removeBlock(id) { const index = blocks.value.findIndex((block) => block.id === id); if (index >= 0) blocks.value.splice(index, 1); selectedBlockId.value = ''; activeTab.value = 'layout' }
function moveBlock(id, direction) { const index = blocks.value.findIndex((block) => block.id === id); const next = index + direction; if (index < 0 || next < 0 || next >= blocks.value.length) return; [blocks.value[index], blocks.value[next]] = [blocks.value[next], blocks.value[index]] }

async function loadSkill() {
  loading.value = true; loadError.value = ''
  try {
    const loaded = await getEditableAiSkill(String(route.params.skillId))
    if (!loaded) throw new Error('玩法不存在或已经被删除')
    loaded.configuration = ensureRequiredBlocks(copy(loaded.draftConfiguration || loaded.configuration), loaded.skillType)
    skill.value = loaded
    previewValues.value = Object.fromEntries(blocks.value.filter((block) => block.key).map((block) => [block.key, block.defaultValue ?? '']))
    selectedBlockId.value = blocks.value[0]?.id || ''
  } catch (error) { loadError.value = errorMessage(error, '用户页面配置加载失败') } finally { loading.value = false }
}

async function saveDraft(options = {}) {
  if (!skill.value) return null
  const configuration = skill.value.configuration || (skill.value.configuration = {})
  // 预览组件和保存配置共用同一份数组，避免只更新计算属性导致保存时仍使用旧草稿。
  configuration.studentPage = {
    ...(configuration.studentPage || { layoutVersion: 1, columns: 12 }),
    blocks: copy(blocks.value),
  }
  const normalizedConfiguration = normalizeSkillForSave(configuration, skill.value.skillType)
  const errors = validateSkillDraft(normalizedConfiguration, skill.value.skillType, false)
  if (errors.length) { ElMessage.warning(errors[0]); return null }
  saving.value = true
  try {
    const saved = await saveEditableAiSkill({ id: skill.value.id, title: skill.value.title, summary: skill.value.summary, skillType: skill.value.skillType, scopeType: skill.value.scopeType, sortOrder: skill.value.sortOrder, draftRevision: skill.value.draftRevision, configuration: normalizedConfiguration })
    saved.configuration = copy(saved.draftConfiguration || saved.configuration)
    skill.value = saved
    if (!options.silent) ElMessage.success('用户页面草稿已保存')
    return saved
  } catch (error) { ElMessage.error(errorMessage(error, '用户页面保存失败')); return null } finally { saving.value = false }
}

async function testSkill() {
  if (!SERVER_AUTH_MODE) { ElMessage.info('当前是本地演示模式，真实测试请在服务端登录模式执行'); return }
  const saved = await saveDraft({ silent: true }); if (!saved) return
  testing.value = true; testResult.value = null
  try { const result = await testAdminAiSkill({ id: saved.id, ...saved, values: previewValues.value }); testResult.value = result; if (result.skill) { result.skill.configuration = copy(result.skill.draftConfiguration || result.skill.configuration); skill.value = result.skill } ElMessage.success(skill.value.skillType === 'video' ? '视频测试任务已提交' : '真实生成测试成功') } catch (error) { ElMessage.error(errorMessage(error, '真实测试失败，请检查输入和模型配置')) } finally { testing.value = false }
}

async function publishSkill() {
  const configuration = normalizeSkillForSave(skill.value.configuration, skill.value.skillType)
  const errors = validateSkillDraft(configuration, skill.value.skillType, true)
  if (errors.length) { ElMessage.warning(errors[0]); return }
  const saved = await saveDraft({ silent: true }); if (!saved) return
  saving.value = true
  try { const published = await publishEditableAiSkill(saved.id); published.configuration = copy(published.draftConfiguration || published.configuration); skill.value = published; ElMessage.success('玩法已发布，用户端将读取这个版本') } catch (error) { ElMessage.error(errorMessage(error, '玩法发布失败')) } finally { saving.value = false }
}

loadSkill()
</script>

<style scoped>
.student-builder-page{height:100vh;min-height:720px;overflow:hidden;background:#f5f7fb;color:#18213a}.builder-header{height:72px;box-sizing:border-box;display:grid;grid-template-columns:minmax(300px,1fr) auto minmax(390px,1fr);align-items:center;gap:20px;border-bottom:1px solid #dfe4ed;background:#fff;padding:0 20px;box-shadow:0 2px 12px rgba(28,38,62,.06);position:relative;z-index:20}.title-area,.header-actions,.step-nav{display:flex;align-items:center}.title-area{min-width:0;gap:12px}.back-button{width:40px;height:40px;padding:0!important}.title-area>div{display:grid;min-width:0;gap:3px}.title-area span{color:#8b95a8;font-size:12px}.title-area strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px}.title-area em{border-radius:99px;background:#f2f3f7;color:#778197;padding:4px 9px;font-size:12px;font-style:normal}.step-nav{gap:10px}.step-nav span,.step-nav button{display:flex;align-items:center;gap:7px;border:0;background:transparent;color:#768198;font:inherit}.step-nav span.active{color:#6848ed;font-weight:700}.step-nav i{display:flex;width:25px;height:25px;align-items:center;justify-content:center;border-radius:50%;background:#eeeafd;font-size:12px;font-style:normal}.step-nav b{width:36px;height:1px;background:#dfe4ed}.header-actions{justify-content:flex-end;gap:8px}.builder-header button,.config-panel button,.preview-stage button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #dfe4ed;border-radius:9px;background:#fff;color:#34425d;padding:9px 12px;font:inherit;cursor:pointer}.builder-header button svg,.config-panel button svg,.preview-stage button svg{width:17px}.builder-header button.primary{border-color:#6848ed;background:#6848ed;color:#fff}.builder-header button:disabled{cursor:not-allowed;opacity:.5}.builder-shell{height:calc(100vh - 72px);display:grid;grid-template-columns:380px minmax(0,1fr);overflow:hidden}.config-panel{display:flex;min-width:0;flex-direction:column;border-right:1px solid #dfe4ed;background:#fff}.config-tabs{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #e7eaf0;padding:0 12px}.config-tabs button{border:0;border-radius:0;padding:14px 5px;background:transparent}.config-tabs button.active{border-bottom:3px solid #6848ed;color:#6848ed}.panel-scroll{min-height:0;overflow:auto;padding:16px}.panel-tip{margin:0 0 14px;color:#7d879a;font-size:12px;line-height:1.6}.block-list{display:grid;gap:8px}.block-list button{width:100%;justify-content:space-between;text-align:left}.block-list button>span{display:flex;align-items:center;gap:8px}.block-list button small{color:#8b95a8}.block-list button.active{border-color:#6848ed;background:#f5f2ff;color:#6848ed}.component-catalog{display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:9px}.component-catalog .panel-tip{grid-column:1/-1}.component-catalog button{justify-content:flex-start}.component-catalog button svg:last-child{margin-left:auto}.block-settings{display:grid;gap:13px}.block-settings header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eceff4;padding-bottom:13px}.block-settings header>div{display:grid;gap:3px}.block-settings header small{color:#8b95a8}.block-settings header button.danger{border-color:#f0d0d0;color:#c84e4e}.block-settings label{display:grid;gap:7px;color:#53607a;font-size:12px}.block-settings input,.block-settings select{box-sizing:border-box;width:100%;border:1px solid #dfe4ed;border-radius:9px;padding:10px;color:#25304a;font:inherit}.block-settings .check{display:flex;align-items:center;gap:8px}.block-settings .check input{width:auto}.move-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.empty-settings{padding:60px 20px;color:#8b95a8;text-align:center}.preview-stage{min-width:0;overflow:auto;padding:20px 26px 36px}.preview-stage>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.preview-stage>header>div:first-child{display:grid;gap:4px}.preview-stage>header span{color:#8791a4;font-size:12px}.device-switch{display:flex;gap:6px}.device-switch button.active{border-color:#6848ed;color:#6848ed;background:#f4f1ff}.preview-canvas{box-sizing:border-box;min-height:calc(100vh - 150px);margin:auto;border:1px solid #e1e5ed;border-radius:16px;background:#fff;box-shadow:0 12px 36px rgba(36,46,72,.08);padding:26px;transition:max-width .2s}.preview-canvas.desktop{max-width:1180px}.preview-canvas.mobile{max-width:430px;padding:14px}.page-state{height:calc(100vh - 72px);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#8390a5}.page-state.error{color:#bd4b4b}@media(max-width:1160px){.builder-header{grid-template-columns:1fr auto}.step-nav{display:none}.builder-shell{grid-template-columns:330px minmax(0,1fr)}}@media(max-width:760px){.student-builder-page{height:auto;min-height:100vh;overflow:auto}.builder-header{height:auto;grid-template-columns:1fr;padding:12px}.header-actions{justify-content:flex-start;flex-wrap:wrap}.builder-shell{height:auto;grid-template-columns:1fr}.config-panel{min-height:480px;border-right:0;border-bottom:1px solid #dfe4ed}.preview-stage{padding:16px}.preview-canvas{min-height:600px}}
.prompt-check{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;border:1px solid #f2d5a2;border-radius:14px;background:#fff8ec;padding:14px 16px;color:#8a5a12}
.prompt-check>svg{width:20px;flex:0 0 auto;margin-top:1px;color:#d97706}
.prompt-check>div{display:grid;gap:4px;min-width:0}
.prompt-check strong{font-size:13px;color:#7a4a06}
.prompt-check span{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#a15c00;word-break:break-all}
.prompt-check small{color:#9a6b28;font-size:12px;line-height:1.55}
.prompt-check .fix{min-height:0;flex:0 0 auto;border-color:#e6b567;background:#fff;color:#8a5a12;padding:8px 14px;font-size:13px}
.prompt-check .fix:hover{border-color:#d97706;color:#7a4a06}
</style>
