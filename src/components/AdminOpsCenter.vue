<template>
  <section class="ax-page">
    <header class="ax-head">
      <div>
        <h2>异常管理</h2>
        <p>服务器出错和 AI 调用失败会自动记在这里（同一个错误只记一条，次数累加）。处理完点「已解决」，下次再出现会重新打开。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" :disabled="loading" @click="load()">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>
    </header>

    <div class="ax-stats">
      <button type="button" class="ax-stat" :class="{ 'is-warn': stats.open }" @click="setFilter({ status: 'open', kind: '' })">
        <span>未解决</span><strong>{{ stats.open }}</strong><small>需要看一眼的</small>
      </button>
      <button type="button" class="ax-stat" :class="{ 'is-warn': stats.openAi }" @click="setFilter({ status: 'open', kind: 'ai' })">
        <span>AI 调用失败</span><strong>{{ stats.openAi }}</strong><small>多半是模型平台繁忙、额度或配置问题</small>
      </button>
      <button type="button" class="ax-stat" :class="{ 'is-alert': stats.openServer }" @click="setFilter({ status: 'open', kind: 'server' })">
        <span>服务器错误</span><strong>{{ stats.openServer }}</strong><small>程序本身出错，需要技术处理</small>
      </button>
      <div class="ax-stat">
        <span>24 小时内</span><strong>{{ stats.last24h }}</strong><small>新出现或再次出现</small>
      </div>
    </div>

    <div class="ax-card is-flush">
      <div class="ax-toolbar">
        <div class="ax-search"><input v-model.trim="filter.keyword" type="search" placeholder="搜索错误信息或接口" @keyup.enter="load(1)" @search="load(1)" /></div>
        <select v-model="filter.status" class="ax-select" @change="load(1)">
          <option value="open">未解决</option><option value="resolved">已解决</option><option value="">全部</option>
        </select>
        <select v-model="filter.kind" class="ax-select" @change="load(1)">
          <option value="">全部类型</option><option value="ai">AI 调用失败</option><option value="server">服务器错误</option>
        </select>
        <select v-model="filter.days" class="ax-select" @change="load(1)">
          <option :value="1">近 1 天</option><option :value="7">近 7 天</option><option :value="30">近 30 天</option><option :value="90">近 90 天</option>
        </select>
        <span class="ax-grow"></span>
        <template v-if="selected.length">
          <span class="ax-count">已选 {{ selected.length }} 条</span>
          <button type="button" class="ax-btn is-sm is-soft" @click="resolve(true)">标记已解决</button>
          <button type="button" class="ax-btn is-sm" @click="resolve(false)">重新打开</button>
        </template>
        <span v-else class="ax-count">共 {{ list.total }} 条</span>
      </div>
      <div class="ax-table-wrap">
        <table class="ax-table">
          <thead>
            <tr>
              <th class="is-check"><input type="checkbox" :checked="allChecked" aria-label="全选本页" @change="toggleAll($event.target.checked)" /></th>
              <th>最近出现</th><th>类型</th><th>错误信息 / 接口</th><th class="is-right">次数</th><th>状态</th><th class="is-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list.items" :key="item.id">
              <td class="is-check"><input v-model="selected" type="checkbox" :value="item.id" :aria-label="`选择 ${item.message}`" /></td>
              <td class="is-nowrap">{{ formatTime(item.lastSeenAt || item.createdAt) }}</td>
              <td><span class="ax-tag" :class="item.kind === 'ai' ? 'is-warn' : 'is-info'">{{ item.kindLabel }}</span></td>
              <td>
                <span class="ops-error">
                  <span class="ops-message" :title="item.message">{{ item.message || '—' }}</span>
                  <span class="ax-mono ops-path" :title="`${item.method || ''} ${item.path || ''}`">{{ item.method }} {{ item.path }}</span>
                </span>
              </td>
              <td class="is-right is-num">{{ item.repeatCount }}</td>
              <td><span class="ax-pill" :class="item.resolved ? 'is-ok' : 'is-warn'">{{ item.resolved ? '已解决' : '未解决' }}</span></td>
              <td class="is-right">
                <div class="ax-actions">
                  <button type="button" class="ax-btn is-sm" @click="detail = item">详情</button>
                  <button type="button" class="ax-btn is-sm" :class="item.resolved ? '' : 'is-soft'" @click="resolve(!item.resolved, [item.id])">{{ item.resolved ? '重新打开' : '已解决' }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!list.items.length" class="ax-empty">
        <strong>{{ filter.status === 'open' ? '没有未解决的异常' : '没有符合条件的记录' }}</strong>
        <span>服务器出错或 AI 调用失败时，会自动出现在这里。</span>
      </div>
      <div v-if="list.total > list.pageSize" class="ax-pager">
        <span>第 {{ list.page }} / {{ pageCount }} 页</span>
        <button type="button" class="ax-btn is-sm" :disabled="list.page <= 1" @click="load(list.page - 1)">上一页</button>
        <button type="button" class="ax-btn is-sm" :disabled="list.page >= pageCount" @click="load(list.page + 1)">下一页</button>
      </div>
    </div>

    <el-dialog :model-value="Boolean(detail)" class="ax-dialog" title="异常详情" width="min(720px, 94vw)" align-center append-to-body @update:model-value="detail = null">
      <div v-if="detail" class="ax-form is-1col">
        <div class="ax-kv">
          <div><span>类型</span><strong>{{ detail.kindLabel }}</strong></div>
          <div><span>状态码</span><strong>{{ detail.status || '—' }}</strong></div>
          <div><span>出现次数</span><strong>{{ detail.repeatCount }}</strong></div>
          <div><span>第一次</span><strong>{{ formatTime(detail.createdAt) }}</strong></div>
          <div><span>最近一次</span><strong>{{ formatTime(detail.lastSeenAt) }}</strong></div>
          <div><span>触发账号</span><strong>{{ detail.user ? `${detail.user.name || ''}（${detail.user.account}）` : '—' }}</strong></div>
        </div>
        <div class="ax-field"><span>接口</span><code class="ops-code">{{ detail.method }} {{ detail.path }}</code></div>
        <div class="ax-field"><span>错误信息</span><code class="ops-code">{{ detail.message }}{{ detail.code ? `（${detail.code}）` : '' }}</code></div>
        <div v-if="detail.stack" class="ax-field"><span>出错位置（给技术人员看）</span><pre class="ops-code ops-stack">{{ detail.stack }}</pre></div>
        <p class="ax-note is-plain">{{ adviceFor(detail) }}</p>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="detail = null">关闭</button>
        <button v-if="detail" type="button" class="ax-btn is-primary" @click="resolveDetail">{{ detail.resolved ? '重新打开' : '标记已解决' }}</button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiClient } from '../services/apiClient'

// 「异常管理」：GET /api/admin/ops/errors + POST /api/admin/ops/errors/resolve（后端早已就绪，这里补上页面）。
const loading = ref(false)
const list = reactive({ items: [], total: 0, page: 1, pageSize: 20 })
const stats = reactive({ last24h: 0, open: 0, openAi: 0, openServer: 0 })
const filter = reactive({ status: 'open', kind: '', days: 7, keyword: '' })
const selected = ref([])
const detail = ref(null)

const pageCount = computed(() => Math.max(1, Math.ceil((list.total || 0) / list.pageSize)))
const allChecked = computed(() => list.items.length > 0 && list.items.every((item) => selected.value.includes(item.id)))

async function load(page = list.page) {
  loading.value = true
  const params = { page, pageSize: list.pageSize, days: filter.days }
  for (const key of ['status', 'kind', 'keyword']) if (filter[key]) params[key] = filter[key]
  try {
    const { data } = await apiClient.get('/admin/ops/errors', { params })
    Object.assign(list, { items: data.items || [], total: data.total || 0, page: data.page || page })
    Object.assign(stats, data.stats || {})
    selected.value = []
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '异常记录读取失败')
  } finally {
    loading.value = false
  }
}

function setFilter(patch) {
  Object.assign(filter, patch)
  load(1)
}

function toggleAll(checked) {
  selected.value = checked ? list.items.map((item) => item.id) : []
}

async function resolve(resolved, ids = selected.value) {
  if (!ids.length) return
  try {
    const { data } = await apiClient.post('/admin/ops/errors/resolve', { ids, resolved })
    ElMessage.success(resolved ? `已标记 ${data.updated} 条为已解决` : `已重新打开 ${data.updated} 条`)
    await load()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  }
}

async function resolveDetail() {
  const item = detail.value
  if (!item) return
  await resolve(!item.resolved, [item.id])
  detail.value = null
}

// 给不懂技术的管理员一句「下一步做什么」。
function adviceFor(item) {
  const text = `${item.message || ''} ${item.code || ''}`
  if (item.kind === 'ai') {
    if (/429|请求较多|限流|rate/i.test(text)) return '模型平台限流：同一时间用的人太多。可以在「API 配置」里给图像设一个备用模型，或稍后再试。'
    if (/超时|timeout/i.test(text)) return '模型平台响应太慢或网络不稳。偶尔出现可以忽略；经常出现请检查服务器网络，或换一个模型平台。'
    if (/401|403|Key|密钥|权限|unauthorized/i.test(text)) return 'Key 无效、过期或没开通这个模型。请到「API 配置」检查该平台的 Key 和模型。'
    if (/余额|欠费|quota|billing|402/i.test(text)) return '模型平台账户余额不足或欠费，请到对应平台充值。'
    return 'AI 调用失败通常是模型平台的问题。偶尔一次可以忽略，次数多时请到「API 配置」点「测试连接」检查。'
  }
  return '这是程序本身的错误。请把「出错位置」整段复制给技术人员；处理好后点「标记已解决」。'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  return `${date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}-`}${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

onMounted(() => load(1))
</script>

<style scoped>
/* 错误信息和接口合成一格：上面是错误，下面一行小字是接口，省出一列给平板竖屏 */
.ops-error { display: grid; gap: 2px; min-width: 0; }
.ops-message,
.ops-path { display: block; max-width: 460px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ops-message { color: var(--ax-ink); }
.ops-path { color: var(--ax-muted); font-size: 12px; }
@media (max-width: 1180px) {
  .ops-message,
  .ops-path { max-width: 300px; }
}
@media (max-width: 900px) {
  .ops-message,
  .ops-path { max-width: 240px; }
}
.ops-code {
  display: block;
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ax-surface-2);
  color: var(--ax-ink);
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.ops-stack { max-height: 220px; overflow: auto; color: var(--ax-text); }
</style>
