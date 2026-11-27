<template>
  <section class="ax-page ga-page">
    <header class="ax-head">
      <div>
        <h2>内容审核</h2>
        <p>设置 AI 审核和自动精选规则，合适的作品自动进入作品广场；拿不准的转人工处理。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" @click="resetDraft"><AdminIcon name="undo" plain />恢复默认</button>
        <button type="button" class="ax-btn" :disabled="loading" @click="openTrial"><AdminIcon name="eye" plain />选择作品试审</button>
        <button type="button" class="ax-btn is-primary" :disabled="saving || loading || !!loadError" @click="save">{{ saving ? '保存中…' : '保存并启用' }}</button>
      </div>
    </header>

    <div v-if="loadError" class="ax-note is-bad ga-note" role="alert"><span>{{ loadError }}</span><button type="button" class="ax-btn is-sm" @click="load">重新加载</button></div>
    <p v-if="!store.serverMode" class="ax-note is-warn">真实内容审核需要服务端登录模式，演示模式不执行 AI 审核或自动发布。</p>

    <div class="ga-tabbar">
      <nav class="ax-tabs" aria-label="内容审核视图">
        <button v-for="item in tabs" :key="item.id" type="button" class="ax-tab" :class="{ 'is-active': tab === item.id }" @click="tab = item.id">{{ item.label }}<em v-if="item.id === 'queue' && store.adminStats.pending" class="ax-tab-count is-alert">{{ store.adminStats.pending }}</em></button>
      </nav>
      <span v-if="dirty" class="ax-pill is-warn">有未保存的设置</span>
      <span class="ax-grow"></span>
      <button type="button" class="ax-btn is-sm" :disabled="loading" @click="load"><AdminIcon name="refresh" plain />刷新</button>
    </div>

    <div v-if="loading" class="ax-card"><div class="ax-empty is-compact" aria-live="polite"><strong>正在加载审核配置和记录…</strong></div></div>
    <template v-else-if="!loadError">
      <div class="ax-stats">
        <div v-for="metric in metrics" :key="metric.label" class="ax-stat"><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong><small>{{ metric.detail }}</small></div>
      </div>

      <div v-if="tab === 'rules'" class="ga-rules">
        <section class="ax-card">
          <div class="ax-card-head">
            <div><h3>AI 内容审核</h3><p>检查图片与文字，识别不适合公开的内容。</p></div>
            <label class="ax-switch"><input v-model="form.aiAudit" type="checkbox" aria-label="AI 自动审核" /><i></i><span>{{ form.aiAudit ? '已开启' : '已关闭' }}</span></label>
          </div>
          <label class="ax-field">
            <span>审核模型</span>
            <select v-model="modelKey"><option value="">请选择已配置的视觉候选模型</option><option v-for="model in meta.models" :key="keyFor(model)" :value="keyFor(model)">{{ model.label }} · {{ model.verified ? '已通过试审' : '待验证看图能力' }}</option></select>
          </label>
          <div class="ga-switch-line">
            <label for="audit-requirements">启用自定义审核要求</label>
            <label class="ax-switch"><input v-model="form.customAudit" type="checkbox" aria-label="启用自定义审核要求" /><i></i></label>
          </div>
          <textarea id="audit-requirements" v-model="form.auditRequirements" class="ax-textarea ga-textarea" :disabled="!form.customAudit" rows="5" maxlength="2000" :placeholder="galleryDefaultAuditPrompt"></textarea>
          <p class="ax-hint ga-hint">关闭后保留文字，使用平台基础审核标准。最多 2000 字。</p>
          <div class="ax-rows ga-rows">
            <label class="ax-row ga-toggle"><span class="ax-row-main"><strong>增强个人信息检查</strong><small>加强检查联系方式、可识别人物和二维码</small></span><span class="ax-switch"><input v-model="form.privacyCheck" type="checkbox" aria-label="增强个人信息检查" /><i></i></span></label>
            <label class="ax-row ga-toggle"><span class="ax-row-main"><strong>相似作品检查</strong><small>疑似重复转人工确认，不直接认定侵权</small></span><span class="ax-switch"><input v-model="form.duplicateCheck" type="checkbox" aria-label="相似作品检查" /><i></i></span></label>
          </div>
          <p class="ax-hint ga-hint">基础安全、精确重复和权限校验始终生效。</p>
        </section>

        <section class="ax-card">
          <div class="ax-card-head">
            <div><h3>系统自动精选</h3><p>最终作品保存后自动筛选，不用逐次投稿。</p></div>
            <label class="ax-switch"><input v-model="form.autoSelect" type="checkbox" aria-label="系统自动精选" /><i></i><span>{{ form.autoSelect ? '已开启' : '已关闭' }}</span></label>
          </div>
          <div class="ga-scope"><span>参与范围</span><div class="ax-tags"><span class="ax-tag">机构已授权</span><span class="ax-tag">用户允许精选</span><span class="ax-tag">最终绘画作品</span></div></div>
          <div class="ga-switch-line">
            <label for="selection-requirements">启用自定义优秀作品标准</label>
            <label class="ax-switch"><input v-model="form.customSelection" type="checkbox" aria-label="启用自定义优秀作品标准" /><i></i></label>
          </div>
          <textarea id="selection-requirements" v-model="form.selectionRequirements" class="ax-textarea ga-textarea" :disabled="!form.customSelection" rows="5" maxlength="2000" :placeholder="galleryDefaultSelectionPrompt"></textarea>
          <p class="ax-hint ga-hint">关闭后保留文字，使用平台默认精选标准。最多 2000 字。</p>
          <div class="ga-number-line">
            <label for="quality-threshold">优秀评分门槛</label>
            <input id="quality-threshold" v-model.number="form.qualityThreshold" class="ga-number" type="number" min="0" max="100" step="1" />
          </div>
          <input v-model.number="form.qualityThreshold" class="ga-range" type="range" min="0" max="100" aria-label="调整优秀评分门槛" />
          <p class="ax-hint ga-hint">只影响系统精选；用户主动投稿不受这个门槛限制。</p>
          <div class="ga-number-line">
            <label for="daily-limit">每日审核数量上限</label>
            <input id="daily-limit" v-model.number="form.dailyLimit" class="ga-number" type="number" min="1" max="1000" step="1" />
          </div>
          <details class="ga-budget">
            <summary><span>费用控制<small>今日已调用 {{ meta.usage.calls }} 次</small></span><AdminIcon name="chevron" plain class="ga-budget-icon" /></summary>
            <div class="ga-number-line"><label>每日预算上限（元）</label><input v-model.number="form.dailyBudget" class="ga-number" aria-label="每日预算上限" type="number" min="0" max="10000" step="0.01" /></div>
            <div class="ga-number-line"><label>单次费用上限（元）</label><input v-model.number="form.requestCostCeiling" class="ga-number" aria-label="单次费用上限" type="number" min="0" max="100" step="0.01" /></div>
            <p class="ax-hint ga-hint">按供应商确认的图片和输出最高费用填写；每次先预留费用，不等同供应商账单。试审同样计入额度。</p>
          </details>
        </section>

        <section class="ax-card ga-wide">
          <div class="ax-card-head"><div><h3>发布策略</h3><p>控制审核后的处理方式。</p></div></div>
          <div class="ga-publish">
            <label class="ga-publish-item ga-toggle">
              <AdminIcon name="send" />
              <span class="ax-row-main"><strong>审核通过自动上架</strong><small>关闭后，由管理员确认上架</small></span>
              <span class="ax-switch"><input v-model="form.autoPublish" type="checkbox" aria-label="审核通过自动上架" /><i></i></span>
            </label>
            <div class="ga-publish-item"><AdminIcon name="alert" tint="#ff9500" /><span class="ax-row-main"><strong>审核异常或结果不确定</strong><small>转人工复核，不自动公开</small></span></div>
            <div class="ga-publish-item"><AdminIcon name="clock" /><span class="ax-row-main"><strong>设置生效范围</strong><small>保存后的新任务；已下架作品不会自动重发</small></span></div>
          </div>
        </section>
        <p v-if="runtimeMessage" class="ax-note ga-wide">{{ runtimeMessage }}</p>
        <p class="ax-hint ga-wide">当前生效版本：{{ store.settings.version }}。规则只分配给新任务；关闭审核或发布会立即限制正在处理的任务。</p>
      </div>

      <section v-if="tab === 'rules' || tab === 'queue'" class="ax-card is-flush">
        <div class="ax-card-head ga-flush-head">
          <div><h3>审核队列</h3><p>点作品看审核详情；人工处理需要填写理由。</p></div>
          <div class="ga-head-tools">
            <select v-model="statusFilter" class="ax-select" aria-label="筛选审核状态"><option value="">全部状态</option><option v-for="(label, status) in galleryStatusLabels" :key="status" :value="status">{{ label }}</option></select>
            <button type="button" class="ax-btn is-sm" @click="tab = 'consents'">机构授权登记</button>
          </div>
        </div>
        <div v-if="!filteredWorks.length" class="ax-empty"><strong>暂无符合条件的审核记录</strong><span>用户投稿或系统精选后会出现在这里。</span></div>
        <div v-else class="ax-table-wrap">
          <table class="ax-table ga-table">
            <thead><tr><th>作品</th><th>来源</th><th>审核判断</th><th class="is-right">精选评分</th><th>状态</th><th class="is-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="work in visibleWorks" :key="work.id">
                <td>
                  <button type="button" class="ga-work" @click="detail = work">
                    <span class="ga-work-thumb"><img v-if="coverUrl(work.cover)" :src="coverUrl(work.cover)" alt="作品预览" /><AdminIcon v-else name="image" plain /></span>
                    <span class="ax-cell-main"><strong>{{ work.title }}</strong><small>{{ work.author }} · {{ work.course }}</small></span>
                  </button>
                </td>
                <td class="is-nowrap">{{ work.source }}</td>
                <td><span class="ga-reason" :title="work.auditReason">{{ work.auditReason }}</span></td>
                <td class="is-right is-num">{{ work.qualityScore ?? '—' }}</td>
                <td>
                  <span class="ax-pill" :class="work.status === 'published' ? 'is-ok' : ['rejected', 'withdrawn', 'offline'].includes(work.status) ? 'is-muted' : 'is-warn'">{{ galleryStatusLabels[work.status] || work.status }}</span>
                  <small v-if="work.previousPublished" class="ga-sub">旧版仍在广场展示</small>
                </td>
                <td class="is-right">
                  <span class="ga-row-actions">
                    <button type="button" class="ax-btn is-sm is-ghost" @click="detail = work">详情</button>
                    <button v-if="work.canRetry" type="button" class="ax-btn is-sm" @click="retry(work)">重新审核</button>
                    <button v-if="work.status !== 'published' && work.status !== 'withdrawn'" type="button" class="ax-btn is-sm is-soft" @click="review(work, 'published')">{{ work.status === 'offline' ? '重新上架' : '通过' }}</button>
                    <button v-if="!['offline', 'withdrawn', 'rejected'].includes(work.status)" type="button" class="ax-btn is-sm is-danger" @click="review(work, work.status === 'published' ? 'offline' : 'rejected')">{{ work.status === 'published' ? '下架' : '驳回' }}</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="store.adminTotal > pageSize" class="ga-pager">
          <button type="button" class="ax-btn is-sm" :disabled="page <= 1" @click="page--">上一页</button>
          <span class="ax-count">{{ page }} / {{ Math.ceil(store.adminTotal / pageSize) }}</span>
          <button type="button" class="ax-btn is-sm" :disabled="page * pageSize >= store.adminTotal" @click="page++">下一页</button>
        </div>
      </section>

      <section v-if="tab === 'history'" class="ax-card is-flush">
        <div class="ax-card-head ga-flush-head"><div><h3>审核记录</h3><p>保留模型决定与人工操作依据。</p></div></div>
        <div v-if="!meta.history.length" class="ax-empty"><strong>暂无操作记录</strong></div>
        <div v-else class="ga-history">
          <div v-for="record in meta.history" :key="record.id" class="ga-history-row">
            <strong>{{ actionLabel(record.action) }}</strong>
            <span>{{ record.detail.reason || (record.detail.state ? galleryStatusLabels[record.detail.state] : '') || '配置或授权状态已记录' }}</span>
            <time>{{ formatTime(record.created_at) }}</time>
          </div>
        </div>
      </section>

      <section v-if="tab === 'consents'" class="ax-card is-flush">
        <div class="ax-card-head ga-flush-head"><div><h3>机构公开授权登记</h3><p>只登记机构已经取得的授权；范围应包含图片审核与平台公开展示。</p></div></div>
        <div v-if="!meta.students.length" class="ax-empty"><strong>管理范围内暂无用户</strong></div>
        <div v-else class="ax-table-wrap">
          <table class="ax-table">
            <thead><tr><th>用户</th><th>机构授权</th><th>参与精选</th><th>授权依据</th><th class="is-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="student in meta.students" :key="student.id">
                <td><strong class="ga-name">{{ student.name }}</strong></td>
                <td><span class="ax-pill" :class="student.granted ? 'is-ok' : 'is-muted'">{{ student.granted ? '已登记' : '未登记' }}</span></td>
                <td>{{ student.opted_in ? '允许' : '未开启' }}</td>
                <td><span class="ga-reason">{{ student.evidence || '—' }}</span></td>
                <td class="is-right">
                  <span class="ga-row-actions">
                    <button type="button" class="ax-btn is-sm is-soft" @click="registerConsent(student)">登记 / 更新</button>
                    <button v-if="student.granted" type="button" class="ax-btn is-sm is-danger" @click="revokeConsent(student)">撤回授权</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <el-dialog :model-value="!!detail" class="ax-dialog" title="作品审核详情" width="min(760px, 94vw)" align-center @close="detail = null">
      <div v-if="detail" class="ga-detail">
        <img v-if="coverUrl(detail.cover)" class="ga-detail-image" :src="coverUrl(detail.cover)" alt="审核作品" />
        <h3>{{ detail.title }}</h3>
        <p v-if="detail.description">{{ detail.description }}</p>
        <p class="ax-note is-plain">{{ detail.auditReason }}</p>
        <p v-if="detail.legacy" class="ax-note is-warn">这条记录来自旧规则检查，没有进行真实 AI 看图评分。</p>
        <div v-if="detail.aiResult" class="ga-detail-ai">
          <p>{{ detail.aiResult.imageDescription }}</p>
          <div class="ax-rows">
            <div v-for="item in detail.aiResult.dimensions" :key="item.name" class="ax-row"><span class="ax-row-main"><strong>{{ item.name }}</strong><small>{{ item.reason }}</small></span><span class="ax-pill is-info">{{ item.score }} 分</span></div>
          </div>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="trial.open" class="ax-dialog" title="选择作品试审" width="min(680px, 94vw)" align-center>
      <div class="ga-trial">
        <p class="ax-note is-warn">用当前表单规则审一次，计入审核额度（会产生费用）。试审不保存设置，也不会上架作品。</p>
        <label class="ax-field">
          <span>选择作品</span>
          <select v-model="trial.documentId"><option value="">请选择</option><option v-for="work in meta.trialWorks" :key="work.id" :value="work.id" :disabled="!work.granted">{{ work.title }} · {{ work.author }}{{ work.granted ? '' : '（机构未授权）' }}</option></select>
        </label>
        <p v-if="!meta.usage.platformBudget" class="ax-note is-bad">平台还没有启用付费审核，目前不能调用真实模型。</p>
        <div v-if="trial.job" class="ga-trial-result" aria-live="polite">
          <strong>{{ trial.job.state === 'done' ? '试审完成' : trial.job.state === 'error' ? '试审失败' : trial.job.state === 'waiting_budget' ? '等待额度' : '正在审核…' }}</strong>
          <p>{{ trial.job.error_message || trial.job.result?.reason }}</p>
          <template v-if="trial.job.result">
            <p>画面识别：{{ trial.job.result.imageDescription }}</p>
            <p>精选评分：{{ trial.job.result.score }} 分</p>
            <p v-for="item in trial.job.result.dimensions" :key="item.name">{{ item.name }}：{{ item.score }} · {{ item.reason }}</p>
          </template>
        </div>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="trial.open = false">关闭</button>
        <button type="button" class="ax-btn is-primary" :disabled="trial.busy || !trial.documentId || !meta.usage.platformBudget" @click="startTrial">{{ trial.busy ? '试审中…' : '开始试审（计入额度）' }}</button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useGalleryStore } from '../stores/galleryStore'
import { apiClient } from '../services/apiClient'
import { galleryDefaultRules, galleryDefaultAuditPrompt, galleryDefaultSelectionPrompt, galleryStatusLabels, validateGalleryRules } from '../utils/galleryRules'
import AdminIcon from './admin/AdminIcon.vue'
const store = useGalleryStore()
const form = reactive({ ...galleryDefaultRules, version: 0 }), saved = ref(''), loading = ref(true), saving = ref(false), loadError = ref('')
const meta = reactive({ models: [], usage: { calls: 0, reservedCost: 0, platformBudget: 0 }, students: [], trialWorks: [], history: [] })
const tab = ref('rules'), statusFilter = ref(''), page = ref(1), pageSize = 20, detail = ref(null)
const trial = reactive({ open: false, documentId: '', busy: false, job: null })
let trialTimer, disposed = false
const tabs = [{ id: 'rules', label: '规则设置' }, { id: 'queue', label: '审核队列' }, { id: 'history', label: '审核记录' }, { id: 'consents', label: '机构授权' }]
const dirty = computed(() => saved.value && JSON.stringify(form) !== saved.value)
const keyFor = (model) => JSON.stringify([model.provider, model.model])
const modelKey = computed({ get: () => form.provider && form.model ? keyFor(form) : '', set: (value) => { const [provider, model] = value ? JSON.parse(value) : ['', '']; form.provider = provider; form.model = model } })
const filteredWorks = computed(() => store.managedWorks)
const visibleWorks = filteredWorks
const metrics = computed(() => [
  { label: '待处理作品', value: store.adminStats.pending, detail: '当前审核队列' },
  { label: '今日模型调用', value: meta.usage.calls, detail: '含试审与正式审核' },
  { label: '系统精选上架', value: store.adminStats.selected, detail: '已公开的精选作品' },
  { label: '今日预留费用', value: `¥${meta.usage.reservedCost.toFixed(2)}`, detail: '按设置上限预留' },
])
const runtimeMessage = computed(() => !meta.usage.platformBudget ? '付费审核当前未启用。可保存规则和处理人工审核，真实 AI 自动审核需先配置平台费用上限。' : !store.settings.aiAudit ? 'AI 审核当前关闭，投稿进入人工队列；自动精选暂停。' : !meta.models.some(model => model.provider === store.settings.provider && model.model === store.settings.model && model.verified) ? '审核模型已停用或配置已变化，自动审核暂停，请重新选择模型并试审。' : !store.settings.autoSelect ? 'AI 审核已启用，系统自动精选当前关闭。' : '自动精选仅处理已授权、允许参与且保存了最终版的新作品。')
const errorText = (error) => error?.response?.data?.message || error?.message || '操作失败，请稍后重试。'
const coverUrl = (value) => { const text = String(value || ''); return text.startsWith('url(') ? text.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '') : /^(data:image\/|https?:\/\/|\/api\/)/.test(text) ? text : '' }
const formatTime = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
const actionLabel = value => ({ 'gallery.retry': '管理员重新审核', 'gallery.settings': '规则已保存', 'gallery.submit': '用户投稿', 'gallery.ai_decision': 'AI 审核决定', 'gallery.approved': '人工通过', 'gallery.rejected': '人工驳回', 'gallery.offline': '管理员下架', 'gallery.consent': '授权变更', 'gallery.withdraw': '用户撤回', 'gallery.selected_candidate': '系统精选候选' }[value] || '审核操作')
watch(statusFilter, () => { if (page.value !== 1) page.value = 1; else refreshQueue() })
watch(page, () => refreshQueue())
async function refreshQueue() {
  try { await store.loadAdminWorks({ page: page.value, pageSize, status: statusFilter.value }) } catch (error) { loadError.value = errorText(error) }
}
async function load() {
  if (dirty.value) { try { await ElMessageBox.confirm('刷新会放弃未保存的规则，是否继续？', '未保存设置', { type: 'warning', confirmButtonText: '放弃并刷新', cancelButtonText: '继续编辑' }) } catch { return } }
  loading.value = true; loadError.value = ''
  try {
    if (!store.serverMode) throw new Error('请使用服务端登录模式访问内容审核。')
    const [, , response] = await Promise.all([store.loadAdminSettings(), store.loadAdminWorks({ page: page.value, pageSize, status: statusFilter.value }), apiClient.get('/admin/gallery-meta')])
    Object.assign(meta, response.data)
    for (const key of Object.keys(galleryDefaultRules)) form[key] = store.settings[key] ?? galleryDefaultRules[key]
    form.version = store.settings.version
    saved.value = JSON.stringify(form)
  } catch (error) { loadError.value = errorText(error) } finally { loading.value = false }
}
async function save() {
  saving.value = true
  try { validateGalleryRules(form); await store.saveAdminSettings({ ...form }); form.version = store.settings.version; saved.value = JSON.stringify(form); ElMessage.success('审核规则已保存到服务端'); await refreshRecords() } catch (error) { ElMessage.error(errorText(error)) } finally { saving.value = false }
}
async function refreshRecords() { const [, response] = await Promise.all([store.loadAdminWorks({ page: page.value, pageSize, status: statusFilter.value }), apiClient.get('/admin/gallery-meta')]); Object.assign(meta, response.data) }
function resetDraft() { const version = form.version; Object.assign(form, galleryDefaultRules, { version }); ElMessage.info('已恢复表单默认值，保存后才会生效。') }
function openTrial() { trial.open = true; trial.job = null }
async function startTrial() {
  trial.busy = true
  try {
    const { data } = await apiClient.post('/admin/gallery-trials', { documentId: trial.documentId, rules: { ...form } })
    trial.job = { id: data.job.id, state: 'queued' }
    const started = Date.now()
    const poll = async () => {
      if (disposed) return
      try {
        trial.job = (await apiClient.get(`/admin/gallery-jobs/${data.job.id}`)).data.job
        if (['done', 'error', 'waiting_budget'].includes(trial.job.state)) { trial.busy = false; await refreshRecords(); return }
        if (Date.now() - started > 120000) throw new Error('等待结果超时，任务仍保存在服务端，请稍后查看。')
        trialTimer = setTimeout(poll, 1500)
      } catch (error) { trial.busy = false; ElMessage.error(errorText(error)) }
    }
    await poll()
  } catch (error) { trial.busy = false; ElMessage.error(errorText(error)) }
}
async function retry(work) {
  try { await ElMessageBox.confirm('上一次请求可能已产生费用。重新审核将再次调用模型并计入额度，是否继续？', '确认重新审核', { confirmButtonText: '确认重新审核', cancelButtonText: '取消' }); await apiClient.post(`/admin/gallery-submissions/${work.id}/retry`, { confirmExtraCost: true }); await refreshRecords(); ElMessage.success('已重新进入审核队列') } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(errorText(error)) }
}
async function review(work, status) {
  try {
    const { value } = await ElMessageBox.prompt(status === 'published' ? '请查看作品后填写人工审核或纠错理由。重新上架属于明确恢复操作。' : '请填写驳回或下架原因。', '人工处理', { inputValidator: value => String(value || '').trim().length >= 3 || '至少填写 3 个字', confirmButtonText: '确认处理', cancelButtonText: '取消' })
    await store.setStatus(work.id, status, value); await refreshRecords(); ElMessage.success('审核状态已更新')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(errorText(error)) }
}
async function registerConsent(student) {
  try {
    const { value } = await ElMessageBox.prompt('请登记机构已经取得的授权依据或编号，范围应包含图片发送给所选供应商审核及平台公开展示。不要填写用户敏感信息。', `登记授权 · ${student.name}`, { inputType: 'textarea', inputValue: student.evidence || '', inputValidator: value => String(value || '').trim().length >= 5 || '请至少填写 5 个字', confirmButtonText: '登记确认', cancelButtonText: '取消' })
    await apiClient.put(`/admin/gallery-consents/${student.id}`, { granted: true, evidence: value }); await refreshRecords(); ElMessage.success('机构授权已登记，用户可开启自动精选')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(errorText(error)) }
}
async function revokeConsent(student) {
  try { await ElMessageBox.confirm('撤回将停止审核并撤下该用户已公开作品，是否继续？', '撤回机构授权', { type: 'warning', confirmButtonText: '确认撤回', cancelButtonText: '取消' }); await apiClient.put(`/admin/gallery-consents/${student.id}`, { granted: false }); await refreshRecords(); ElMessage.success('授权已撤回') } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(errorText(error)) }
}
async function confirmLeave() { if (!dirty.value) return true; try { await ElMessageBox.confirm('还有未保存的审核规则，是否离开？', '未保存设置', { confirmButtonText: '放弃并离开', cancelButtonText: '继续编辑' }); saved.value = JSON.stringify(form); return true } catch { return false } }
defineExpose({ confirmLeave })
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(confirmLeave)
onMounted(() => { load(); window.addEventListener('beforeunload', beforeUnload) })
onBeforeUnmount(() => { disposed = true; clearTimeout(trialTimer); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<style scoped>
/* 内容审核（2026-11-26 第二版）：去掉旧的橙色主题，改用后台统一的 iOS 套件；组件类名一律 ga- 前缀 */
.ga-note { align-items: center; }
.ga-note > span { flex: 1 1 auto; }
.ga-tabbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }

.ga-rules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 16px; }
.ga-rules > .ax-card { display: grid; gap: 12px; }
.ga-rules > .ax-card > .ax-card-head { margin-bottom: 4px; }
.ga-wide { grid-column: 1 / -1; }
.ga-rules > p { margin: 0; }
.ga-switch-line,
.ga-number-line { display: flex; align-items: center; justify-content: space-between; gap: 14px; color: var(--ax-ink); font-size: 14px; font-weight: 600; }
.ga-switch-line { margin-top: 6px; }
.ga-textarea { width: 100%; min-height: 128px; }
.ga-textarea:disabled { color: var(--ax-muted); cursor: not-allowed; }
.ga-hint { margin: -4px 0 0; }
.ga-rows { margin-top: 2px; border-top: 1px solid var(--ax-line); }
.ga-toggle { cursor: pointer; }
.ga-scope { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.ga-scope > span { color: var(--ax-ink); font-size: 14px; font-weight: 600; }
.ga-number { width: 110px; height: 36px; padding: 0 12px; border: 0; border-radius: var(--ax-radius-sm); background: var(--ax-fill); color: var(--ax-ink); font: inherit; font-variant-numeric: tabular-nums; text-align: right; }
.ga-number:focus { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.ga-range { width: 100%; accent-color: var(--ax-brand); }
.ga-budget { display: grid; gap: 10px; padding-top: 12px; border-top: 1px solid var(--ax-line); }
.ga-budget > summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--ax-ink); font-size: 14px; font-weight: 600; list-style: none; cursor: pointer; }
.ga-budget > summary::-webkit-details-marker { display: none; }
.ga-budget > summary small { margin-left: 8px; color: var(--ax-muted); font-size: 12.5px; font-weight: 400; }
.ga-budget > summary:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); border-radius: 8px; }
.ga-budget-icon { color: var(--ax-muted); transform: rotate(90deg); transition: transform 0.2s ease; }
.ga-budget[open] .ga-budget-icon { transform: rotate(-90deg); }
.ga-budget > .ga-number-line { font-weight: 500; }

.ga-publish { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ga-publish-item { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 14px; border-radius: var(--ax-radius); background: var(--ax-surface-2); }
.ga-publish-item > .ax-row-main { flex: 1 1 auto; }

.ga-flush-head { margin: 0; padding: 18px 22px 14px; border-bottom: 1px solid var(--ax-line); }
.ga-head-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ga-work { display: flex; align-items: center; gap: 10px; min-width: 200px; min-height: 0; padding: 0; border: 0; background: none; font: inherit; text-align: left; cursor: pointer; }
.ga-work:hover .ax-cell-main > strong { color: var(--ax-brand); }
.ga-work:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); border-radius: 10px; }
.ga-work-thumb { display: grid; flex: none; overflow: hidden; place-items: center; width: 52px; height: 42px; border-radius: 10px; background: var(--ax-fill); color: var(--ax-muted); }
.ga-work-thumb > img { width: 100%; height: 100%; object-fit: cover; }
.ga-reason { display: -webkit-box; overflow: hidden; max-width: 300px; color: var(--ax-text); line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ga-sub { display: block; margin-top: 4px; color: var(--ax-muted); font-size: 12px; }
.ga-row-actions { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.ga-name { color: var(--ax-ink); font-weight: 600; }
.ga-pager { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 12px 22px 16px; border-top: 1px solid var(--ax-line); }

.ga-history { display: grid; }
.ga-history-row { display: grid; grid-template-columns: 160px minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 13px 22px; border-bottom: 1px solid var(--ax-line); font-size: 13.5px; }
.ga-history-row:last-child { border-bottom: 0; }
.ga-history-row > strong { color: var(--ax-ink); font-weight: 600; }
.ga-history-row > span { color: var(--ax-text); overflow-wrap: anywhere; }
.ga-history-row > time { color: var(--ax-muted); font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }

.ga-detail,
.ga-trial { display: grid; gap: 12px; }
.ga-detail > h3 { margin: 0; color: var(--ax-ink); font-size: 18px; }
.ga-detail p,
.ga-trial p { margin: 0; line-height: 1.6; }
.ga-detail-image { display: block; max-width: 100%; max-height: 390px; margin: 0 auto; border-radius: 14px; object-fit: contain; }
.ga-detail-ai { display: grid; gap: 8px; }
.ga-trial-result { display: grid; gap: 6px; padding: 14px 16px; border-radius: 14px; background: var(--ax-surface-2); }
.ga-trial-result > strong { color: var(--ax-ink); }

@media (max-width: 1100px) {
  .ga-rules { grid-template-columns: minmax(0, 1fr); }
  .ga-publish { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .ga-history-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
}
</style>
