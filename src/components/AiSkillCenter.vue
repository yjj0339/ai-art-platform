<template>
  <section class="ax-page sk-page">
    <header class="ax-head">
      <div>
        <h2>AI玩法中心</h2>
        <p>{{ activeView === 'packages' ? '上传进来的 SKILL.md 技能包先在这里整理，转成玩法、测试、发布后才进用户端。' : '每个玩法有自己的工作流画布：先配置工作流，再配置用户看到的页面，最后发布。' }}</p>
      </div>
      <div v-if="activeView !== 'packages'" class="ax-head-actions">
        <button type="button" class="ax-btn is-primary" @click="openCreate"><AdminIcon name="plus" plain />新建{{ activeType === 'video' ? '视频' : '图像' }}玩法</button>
      </div>
    </header>

    <nav class="ax-tabs" aria-label="玩法类型">
      <button type="button" class="ax-tab" :class="{ 'is-active': activeView === 'image' }" @click="switchType('image')">图像玩法<em v-if="!loading" class="ax-tab-count">{{ typeCount('image') }}</em></button>
      <button type="button" class="ax-tab" :class="{ 'is-active': activeView === 'video' }" @click="switchType('video')">视频玩法<em v-if="!loading" class="ax-tab-count">{{ typeCount('video') }}</em></button>
      <button type="button" class="ax-tab" :class="{ 'is-active': activeView === 'packages' }" @click="switchType('packages')">技能包管理</button>
    </nav>

    <!-- 技能包是「原料区」：上传进来的 SKILL.md 先在这里待整理，转成玩法、测试、发布后才进用户端。 -->
    <AiSkillPackagePanel v-if="activeView === 'packages'" />

    <!-- 2026-11-27 按客户给的参考后台改：筛选条 + 表格放在一张白卡片里（以前是一张张大卡片，很占地方）。按钮和操作都没变。 -->
    <section v-else class="ax-card is-flush sk-list">
      <div class="ax-toolbar sk-toolbar">
        <div class="ax-search"><input v-model.trim="keyword" type="search" placeholder="搜索玩法名称或说明" aria-label="搜索玩法" /></div>
        <select v-model="statusFilter" class="ax-select" aria-label="按状态筛选"><option value="all">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="offline">已下线</option></select>
        <select v-model="providerFilter" class="ax-select" aria-label="按供应商筛选"><option value="all">全部供应商</option><option value="agnes">Agnes</option><option value="volcengine">火山引擎</option></select>
        <span class="ax-grow"></span>
        <span class="ax-count">共 {{ filteredSkills.length }} 个玩法</span>
      </div>

      <div v-if="loading" class="ax-empty is-compact"><strong>正在读取玩法…</strong></div>
      <div v-else-if="loadError" class="ax-empty">
        <strong>玩法列表没有读出来</strong>
        <span>{{ loadError }}</span>
        <button type="button" class="ax-btn is-sm is-soft" @click="loadSkills">重新加载</button>
      </div>
      <div v-else-if="!filteredSkills.length" class="ax-empty">
        <strong>{{ typeCount(activeType) ? '没有符合条件的玩法' : `还没有${activeType === 'video' ? '视频' : '图像'}玩法` }}</strong>
        <span>{{ typeCount(activeType) ? '换个关键词或筛选条件试试。' : '点上方「新建」按钮创建第一个玩法。' }}</span>
      </div>

      <div v-else class="ax-table-wrap">
        <table class="ax-table sk-table">
          <thead>
            <tr><th>玩法信息</th><th>供应商</th><th>状态</th><th>更新时间</th><th class="is-right">操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="skill in filteredSkills" :key="skill.id" class="sk-row" :class="`is-${skill.status}`">
              <td>
                <div class="sk-info">
                  <span class="sk-cover" :style="coverStyle(skill)">
                    <span v-if="!hasCover(skill)" class="sk-cover-empty"><AdminIcon :name="skill.skillType === 'video' ? 'video' : 'image'" /></span>
                  </span>
                  <span class="sk-text">
                    <strong class="sk-title" :title="skill.title">{{ skill.title }}</strong>
                    <small class="sk-summary" :title="skill.summary || ''">{{ skill.summary || '暂无玩法说明' }}</small>
                  </span>
                </div>
              </td>
              <td class="is-nowrap"><span class="ax-tag">{{ providerLabel(skill) }}</span></td>
              <td class="is-nowrap"><span class="ax-pill" :class="statusPill(skill.status)">{{ statusLabel(skill.status) }}</span></td>
              <td class="is-num">{{ dateLabel(skill.updatedAt) }}</td>
              <td class="is-right">
                <div class="sk-ops">
                  <button type="button" class="ax-link" @click="openWorkflow(skill)">配置工作流</button>
                  <button type="button" class="ax-link" @click="openStudentPage(skill)">用户页面</button>
                  <el-dropdown trigger="click">
                    <button type="button" class="ax-link sk-more" aria-label="更多操作">更多<AdminIcon name="chevron" plain class="sk-caret" /></button>
                    <template #dropdown><el-dropdown-menu>
                      <el-dropdown-item @click="editBasic(skill)">编辑基础信息</el-dropdown-item>
                      <el-dropdown-item v-if="skill.status === 'published'" @click="setStatus(skill, 'offline')">下线玩法</el-dropdown-item>
                      <el-dropdown-item v-if="skill.status === 'offline'" @click="setStatus(skill, 'draft')">转为草稿</el-dropdown-item>
                      <el-dropdown-item divided @click="removeSkill(skill)">永久删除</el-dropdown-item>
                    </el-dropdown-menu></template>
                  </el-dropdown>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <el-dialog v-model="createVisible" class="ax-dialog" :title="editingId ? '编辑玩法基础信息' : `新建${form.skillType === 'video' ? '视频' : '图像'}玩法`" width="min(92vw, 620px)" align-center destroy-on-close>
      <div class="sk-form">
        <section class="sk-group">
          <h4>基础信息</h4>
          <div class="ax-form">
            <label class="ax-field"><span>玩法名称</span><input v-model.trim="form.title" maxlength="80" placeholder="例如：人物动态短片" /></label>
            <label class="ax-field"><span>玩法类型</span><select v-model="form.skillType" :disabled="Boolean(editingId)"><option value="image">图像玩法</option><option value="video">视频玩法</option></select></label>
            <label class="ax-field sk-wide"><span>玩法说明</span><textarea v-model.trim="form.summary" maxlength="300" placeholder="一句话告诉用户这个玩法可以生成什么"></textarea></label>
          </div>
        </section>

        <section class="sk-group">
          <h4>玩法卡片图<small>显示在用户端「技能玩法」卡片上</small></h4>
          <div class="sk-cover-picker">
            <span class="sk-cover-preview" :class="{ 'is-empty': !coverUrl }">
              <img v-if="coverUrl" :src="coverUrl" alt="玩法卡片图预览" />
              <AdminIcon v-else name="image" plain />
            </span>
            <div class="sk-cover-actions">
              <input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleCoverFile" />
              <div class="sk-cover-buttons">
                <button type="button" class="ax-btn is-sm is-soft" :disabled="coverUploading" @click="coverInput?.click()"><AdminIcon name="upload" plain />{{ coverUploading ? '上传中…' : coverUrl ? '更换图片' : '上传图片' }}</button>
                <button v-if="coverUrl" type="button" class="ax-btn is-sm is-ghost" @click="clearCover">移除</button>
              </div>
              <small class="ax-hint">建议 <b>3:1 横图</b>（如 900×300），用户端卡片按这个比例整块铺满；主体放中间，上下边缘会被裁掉。PNG / JPG / WEBP，不超过 8MB。不上传就沿用系统默认插画。</small>
            </div>
          </div>
        </section>

        <section class="sk-group">
          <h4>生成提示词<small>真正发给模型的那句话，用户填的内容会插到 <code v-pre>{{subject}}</code> 的位置</small></h4>
          <textarea v-model="form.configuration.runtime.promptTemplate" class="ax-textarea sk-prompt" rows="4" placeholder="例如：一张活动宣传海报，主体是{{subject}}，大标题居中，紫色主视觉，极简留白，高清印刷质感"></textarea>
          <p class="ax-hint">用双大括号写变量名，例如 <code v-pre>{{subject}}</code>、<code v-pre>{{ratio}}</code>；变量名要和用户页面里的「字段标识」一致，否则用户填的内容不会生效。</p>
        </section>

        <details class="sk-advanced">
          <summary><span>高级设置<small>生成模型相关，一般不用改</small></span><AdminIcon name="chevron" plain class="sk-advanced-icon" /></summary>
          <div class="ax-form">
            <label class="ax-field"><span>供应商</span><select v-model="form.configuration.runtime.provider"><option value="agnes">Agnes</option><option v-if="form.skillType === 'image'" value="volcengine">火山引擎</option></select></label>
            <label class="ax-field"><span>模型</span><input v-model.trim="form.configuration.runtime.model" placeholder="留空使用后台默认模型" /></label>
          </div>
        </details>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="createVisible = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="saving" @click="saveBasic">{{ saving ? '保存中…' : editingId ? '保存' : '创建并配置工作流' }}</button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import AdminIcon from './admin/AdminIcon.vue'
import AiSkillPackagePanel from './AiSkillPackagePanel.vue'
import { defaultSkillConfiguration, normalizeSkillForSave } from '../utils/aiSkillSchema'
import { changeEditableAiSkillStatus, listEditableAiSkills, removeEditableAiSkill, saveEditableAiSkill, uploadEditableAiSkillCover } from '../services/adminAiSkillEditorStore'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const coverUploading = ref(false)
const coverInput = ref(null)
const loadError = ref('')
const skills = ref([])
const keyword = ref('')
const statusFilter = ref('all')
const providerFilter = ref('all')
const createVisible = ref(false)
const editingId = ref('')
const form = reactive({ title: '', summary: '', skillType: 'image', configuration: defaultSkillConfiguration('image'), scopeType: 'organization', sortOrder: 0, draftRevision: 0 })
const activeType = computed(() => route.query.type === 'video' ? 'video' : 'image')
// 第三个 tab 是「技能包管理」，它不是玩法类型，所以单独用一个视图状态区分。
const activeView = computed(() => (route.query.type === 'packages' ? 'packages' : activeType.value))
const coverUrl = computed(() => form.configuration?.presentation?.coverUrl || '')
const filteredSkills = computed(() => skills.value.filter((skill) => skill.skillType === activeType.value && (statusFilter.value === 'all' || skill.status === statusFilter.value) && (providerFilter.value === 'all' || providerOf(skill) === providerFilter.value) && (!keyword.value || `${skill.title} ${skill.summary || ''}`.toLowerCase().includes(keyword.value.toLowerCase()))))

function copy(value) { return JSON.parse(JSON.stringify(value)) }
function errorMessage(error, fallback) { return error?.response?.data?.message || error?.message || fallback }
function providerOf(skill) { return skill.draftConfiguration?.runtime?.provider || skill.configuration?.runtime?.provider || skill.configuration?.generation?.provider }
function providerLabel(skill) { return ({ agnes: 'Agnes', volcengine: '火山引擎' })[providerOf(skill)] || '未配置' }
function statusLabel(status) { return ({ draft: '草稿', published: '已发布', offline: '已下线' })[status] || status }
function dateLabel(value) { return value ? new Date(value).toLocaleDateString('zh-CN') : '--' }
function coverStyle(skill) { const url = skill.draftConfiguration?.presentation?.coverUrl || skill.configuration?.presentation?.coverUrl; return url ? { backgroundImage: `url("${url}")` } : {} }
function hasCover(skill) { return Boolean(skill.draftConfiguration?.presentation?.coverUrl || skill.configuration?.presentation?.coverUrl) }
function statusPill(status) { return ({ published: 'is-ok', draft: 'is-warn', offline: 'is-muted' })[status] || 'is-muted' }
function typeCount(type) { return skills.value.filter((skill) => skill.skillType === type).length }
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file) }) }
function ensurePresentation(configuration) {
  configuration.presentation ||= {}
  configuration.presentation.coverUrl ||= ''
  return configuration
}
async function handleCoverFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) { ElMessage.warning('请选择 PNG、JPG 或 WEBP 图片'); return }
  if (file.size > 8 * 1024 * 1024) { ElMessage.warning('图片不能超过 8MB，请先压缩后再上传'); return }
  coverUploading.value = true
  try {
    const assetUrl = await uploadEditableAiSkillCover(await readFileAsDataUrl(file))
    if (!assetUrl) throw new Error('上传未返回地址')
    ensurePresentation(form.configuration).presentation.coverUrl = assetUrl
    ElMessage.success('卡片图已上传，记得点保存')
  } catch (error) {
    ElMessage.error(errorMessage(error, '卡片图上传失败'))
  } finally {
    coverUploading.value = false
  }
}
function clearCover() { ensurePresentation(form.configuration).presentation.coverUrl = '' }
function switchType(type) { router.replace({ path: '/admin', query: { module: 'featureManagement', type } }) }
function resetForm(type = activeType.value) { editingId.value = ''; form.title = ''; form.summary = ''; form.skillType = type; form.configuration = defaultSkillConfiguration(type); form.scopeType = 'organization'; form.sortOrder = 0; form.draftRevision = 0 }
function openCreate() { resetForm(); createVisible.value = true }
function editBasic(skill) { const config = ensurePresentation(copy(skill.draftConfiguration || skill.configuration || defaultSkillConfiguration(skill.skillType))); editingId.value = skill.id; Object.assign(form, { id: skill.id, title: skill.title, summary: skill.summary || '', skillType: skill.skillType, configuration: config, scopeType: skill.scopeType || 'organization', sortOrder: skill.sortOrder || 0, draftRevision: skill.draftRevision || 0 }); createVisible.value = true }
function openWorkflow(skill) { router.push(`/admin/ai-skills/${encodeURIComponent(skill.id)}/workflow`) }
function openStudentPage(skill) { router.push(`/admin/ai-skills/${encodeURIComponent(skill.id)}/student-page`) }
async function loadSkills() { loading.value = true; loadError.value = ''; try { skills.value = await listEditableAiSkills() } catch (error) { loadError.value = errorMessage(error, '玩法列表加载失败，请检查登录和数据库配置。') } finally { loading.value = false } }
async function saveBasic() { if (!form.title) { ElMessage.warning('请填写玩法名称'); return } saving.value = true; try { const saved = await saveEditableAiSkill({ id: editingId.value || undefined, title: form.title, summary: form.summary, skillType: form.skillType, scopeType: form.scopeType, sortOrder: form.sortOrder, draftRevision: form.draftRevision, configuration: normalizeSkillForSave(form.configuration, form.skillType) }); createVisible.value = false; await loadSkills(); if (editingId.value) ElMessage.success('基础信息已保存'); else openWorkflow(saved) } catch (error) { ElMessage.error(errorMessage(error, '玩法保存失败')) } finally { saving.value = false } }
async function setStatus(skill, status) { try { await changeEditableAiSkillStatus(skill.id, status); await loadSkills(); ElMessage.success(status === 'offline' ? '玩法已下线' : '玩法已转为草稿') } catch (error) { ElMessage.error(errorMessage(error, '状态更新失败')) } }
async function removeSkill(skill) { try { await ElMessageBox.confirm(`永久删除“${skill.title}”及其版本、分配和用量记录？此操作不可恢复。`, '永久删除玩法', { type: 'warning', confirmButtonText: '永久删除' }); await removeEditableAiSkill(skill.id); await loadSkills(); ElMessage.success('玩法已永久删除') } catch (error) { if (error !== 'cancel') ElMessage.error(errorMessage(error, '删除失败')) } }

watch(() => form.skillType, (type, previous) => { if (!editingId.value && type !== previous) form.configuration = defaultSkillConfiguration(type) })
watch(() => route.query.type, loadSkills)
loadSkills()
</script>

<style scoped>
/* AI玩法中心（2026-11-26 第二版）：玩法做成 3:1 封面卡片，和用户端「技能玩法」卡片同比例；组件类名一律 sk- 前缀 */
.sk-toolbar > .ax-search { flex: 1 1 260px; max-width: 360px; }
.sk-list > .ax-empty { margin: 8px 0; }
.sk-info { display: flex; align-items: center; gap: 12px; min-width: 260px; max-width: 520px; }
.sk-cover {
  position: relative;
  flex: none;
  width: 108px;
  height: 36px;
  overflow: hidden;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(var(--ax-brand-rgb), 0.12), rgba(175, 82, 222, 0.14));
  background-position: center;
  background-size: cover;
}
.sk-row.is-offline .sk-cover { filter: grayscale(0.7); opacity: 0.75; }
.sk-cover-empty { position: absolute; inset: 0; display: grid; place-items: center; }
.sk-text { display: grid; gap: 2px; min-width: 0; }
.sk-title { overflow: hidden; color: var(--ax-ink); font-size: 14px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
.sk-summary { overflow: hidden; color: var(--ax-muted); font-size: 12.5px; white-space: nowrap; text-overflow: ellipsis; }
.sk-ops { display: inline-flex; align-items: center; justify-content: flex-end; gap: 14px; white-space: nowrap; }
.sk-ops .ax-link { min-height: 0; font-size: 13.5px; }
.sk-more { display: inline-flex; align-items: center; gap: 2px; }
.sk-caret { width: 12px; height: 12px; transform: rotate(90deg); }

/* 新建 / 编辑弹窗 */
.sk-form { display: grid; gap: 14px; }
.sk-group { display: grid; gap: 12px; padding: 16px; border-radius: 16px; background: var(--ax-surface-2); }
.sk-group > h4 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin: 0; color: var(--ax-ink); font-size: 14px; font-weight: 700; }
.sk-group > h4 small { color: var(--ax-muted); font-size: 12px; font-weight: 400; }
.sk-group > .ax-hint { margin: 0; }
.sk-wide { grid-column: 1 / -1; }
.sk-cover-picker { display: flex; align-items: center; gap: 16px; }
.sk-cover-preview { display: grid; flex: none; overflow: hidden; place-items: center; width: 198px; height: 66px; border-radius: 12px; background: var(--ax-fill); color: var(--ax-muted); }
.sk-cover-preview.is-empty { border: 1.5px dashed var(--ax-line-strong); background: rgba(255, 255, 255, 0.6); }
.sk-cover-preview > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.sk-cover-actions { display: grid; gap: 8px; min-width: 0; }
.sk-cover-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.sk-prompt { width: 100%; min-height: 96px; }
.sk-form code { padding: 1px 5px; border-radius: 5px; background: var(--ax-brand-soft); color: var(--ax-brand); font-size: 11.5px; }
.sk-advanced > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 14px;
  background: var(--ax-surface-2);
  color: var(--ax-ink);
  font-size: 14px;
  font-weight: 600;
  list-style: none;
  cursor: pointer;
}
.sk-advanced > summary::-webkit-details-marker { display: none; }
.sk-advanced > summary small { margin-left: 8px; color: var(--ax-muted); font-size: 12px; font-weight: 400; }
.sk-advanced > summary:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.sk-advanced-icon { color: var(--ax-muted); transform: rotate(90deg); transition: transform 0.2s ease; }
.sk-advanced[open] .sk-advanced-icon { transform: rotate(-90deg); }
.sk-advanced > .ax-form { margin-top: 12px; padding: 0 4px; }

@media (max-width: 720px) {
  .sk-cover-picker { flex-direction: column; align-items: stretch; }
  .sk-cover-preview { width: 100%; height: auto; aspect-ratio: 3 / 1; }
}
</style>
