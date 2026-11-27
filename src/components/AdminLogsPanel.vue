<template>
  <section class="ax-page logs-page">
    <header class="ax-head">
      <div>
        <h2>操作日志</h2>
        <p>谁在什么时候做了什么（登录、调积分、封禁、改配置……），以及每一笔积分的进出。只能看，不能改；保留最近 90 天可查。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" :disabled="exporting || !current.total" @click="exportCsv">{{ exporting ? '导出中…' : '导出表格' }}</button>
        <button type="button" class="ax-btn" :disabled="loading" @click="load()">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>
    </header>

    <nav class="ax-tabs" aria-label="日志分类">
      <button type="button" class="ax-tab" :class="{ 'is-active': tab === 'operations' }" @click="switchTab('operations')">操作记录</button>
      <button type="button" class="ax-tab" :class="{ 'is-active': tab === 'credits' }" @click="switchTab('credits')">积分流水</button>
    </nav>

    <div v-if="tab === 'operations'" class="ax-stats">
      <div class="ax-stat"><span>今天的操作</span><strong>{{ opStats.today }}</strong><small>所有账号合计</small></div>
      <button type="button" class="ax-stat" @click="setOp({ category: 'auth', days: 1 })"><span>今天登录</span><strong>{{ opStats.loginsToday }}</strong><small>点一下只看登录</small></button>
      <button type="button" class="ax-stat" @click="setOp({ category: 'credit', days: 7 })"><span>近 7 天调积分</span><strong>{{ opStats.adjustWeek }}</strong><small>管理员手动加减积分</small></button>
      <button type="button" class="ax-stat" @click="setOp({ category: 'risk', days: 7 })"><span>近 7 天风控操作</span><strong>{{ opStats.riskWeek }}</strong><small>封禁、解锁、改规则</small></button>
    </div>
    <div v-else class="ax-stats">
      <div class="ax-stat"><span>扣掉的积分</span><strong>{{ sums.consumed }}</strong><small>{{ rangeText }}，按当前筛选合计</small></div>
      <div class="ax-stat"><span>退回的积分</span><strong>{{ sums.refunded }}</strong><small>生成失败自动退回</small></div>
      <div class="ax-stat"><span>后台发放</span><strong>{{ sums.granted > 0 ? '+' : '' }}{{ sums.granted }}</strong><small>管理员调整、积分码兑换（扣回记负数）</small></div>
      <div class="ax-stat"><span>流水条数</span><strong>{{ credits.total }}</strong><small>{{ rangeText }}</small></div>
    </div>

    <div class="ax-card is-flush">
      <div class="ax-toolbar">
        <div class="ax-search">
          <input v-model.trim="filter.keyword" type="search" :placeholder="tab === 'operations' ? '搜索账号或姓名（操作人 / 被操作的人）' : '搜索账号或姓名'" @keyup.enter="load(1)" @search="load(1)" />
        </div>
        <template v-if="tab === 'operations'">
          <select v-model="filter.category" class="ax-select" aria-label="操作类型" @change="load(1)">
            <option value="">全部类型</option>
            <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
        </template>
        <template v-else>
          <select v-model="filter.kind" class="ax-select" aria-label="流水类型" @change="load(1)">
            <option value="">全部进出</option>
            <option v-for="item in kinds" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
          <select v-model="filter.biz" class="ax-select" aria-label="用途" @change="load(1)">
            <option value="">全部用途</option>
            <option v-for="item in bizTypes" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
        </template>
        <select v-model="filter.days" class="ax-select" aria-label="时间范围" @change="load(1)">
          <option :value="1">近 1 天</option><option :value="7">近 7 天</option><option :value="30">近 30 天</option><option :value="90">近 90 天</option>
        </select>
        <span class="ax-grow"></span>
        <span class="ax-count">共 {{ current.total }} 条</span>
      </div>

      <div v-if="tab === 'operations'" class="ax-table-wrap">
        <table class="ax-table logs-table">
          <thead><tr><th>时间</th><th>操作人</th><th>类型</th><th>做了什么</th><th>对象 / 内容</th></tr></thead>
          <tbody>
            <tr v-for="item in operations.items" :key="item.id">
              <td class="is-nowrap is-num">{{ formatTime(item.createdAt) }}</td>
              <td><span v-if="item.actor" class="logs-user"><strong>{{ item.actor.name || item.actor.account }}</strong><small>{{ item.actor.account }} · {{ roleLabel(item.actor.role) }}</small></span><span v-else class="logs-muted">系统</span></td>
              <td><span class="ax-tag" :class="categoryTone(item.category)">{{ item.categoryLabel }}</span></td>
              <td class="is-nowrap">{{ item.actionLabel }}</td>
              <td>
                <span class="logs-detail">
                  <span v-if="item.target" class="logs-target">{{ item.target.name || item.target.account }}<small>（{{ item.target.account }}）</small></span>
                  <span v-if="item.summary" class="logs-summary" :title="item.summary">{{ item.summary }}</span>
                  <span v-if="!item.target && !item.summary" class="logs-muted">—</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="ax-table-wrap">
        <table class="ax-table logs-table">
          <thead><tr><th>时间</th><th>账号</th><th>类型</th><th>用途</th><th class="is-right">积分变动</th><th class="is-right">变动后余额</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="item in credits.items" :key="item.id">
              <td class="is-nowrap is-num">{{ formatTime(item.createdAt) }}</td>
              <td><span v-if="item.user" class="logs-user"><strong>{{ item.user.name || item.user.account }}</strong><small>{{ item.user.account }}</small></span><span v-else class="logs-muted">已删除的账号</span></td>
              <td><span class="ax-tag" :class="kindTone(item.kind)">{{ item.kindLabel }}</span></td>
              <td class="is-nowrap">{{ item.bizLabel }}</td>
              <td class="is-right is-num"><b class="logs-change" :class="{ 'is-in': item.change > 0, 'is-out': item.change < 0 }">{{ item.change > 0 ? '+' : '' }}{{ item.change }}</b></td>
              <td class="is-right is-num">{{ item.balanceAfter }}</td>
              <td>
                <span class="logs-detail">
                  <span v-if="item.reason" class="logs-summary" :title="item.reason">{{ item.reason }}</span>
                  <span v-if="item.fromFree" class="logs-muted">另用赠送额度 {{ item.fromFree }}</span>
                  <span v-if="item.operator" class="logs-muted">操作人：{{ item.operator.name || item.operator.account }}</span>
                  <span v-if="!item.reason && !item.fromFree && !item.operator" class="logs-muted">—</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!current.items.length" class="ax-empty">
        <strong>{{ loading ? '正在读取…' : (loadError || '没有符合条件的记录') }}</strong>
        <span v-if="!loading && !loadError">换个时间范围或类型试试。</span>
      </div>
      <div v-if="current.total > current.pageSize" class="ax-pager">
        <span>第 {{ current.page }} / {{ pageCount }} 页</span>
        <button type="button" class="ax-btn is-sm" :disabled="loading || current.page <= 1" @click="load(current.page - 1)">上一页</button>
        <button type="button" class="ax-btn is-sm" :disabled="loading || current.page >= pageCount" @click="load(current.page + 1)">下一页</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiClient } from '../services/apiClient'

// 「操作日志」：GET /api/admin/logs/operations（audit_logs）+ GET /api/admin/logs/credits（credit_ledger），只读。
const tab = ref('operations')
const loading = ref(false)
const exporting = ref(false)
const loadError = ref('')
const filter = reactive({ keyword: '', category: '', kind: '', biz: '', days: 7 })
const operations = reactive({ items: [], total: 0, page: 1, pageSize: 20 })
const credits = reactive({ items: [], total: 0, page: 1, pageSize: 20 })
const opStats = reactive({ today: 0, loginsToday: 0, riskWeek: 0, adjustWeek: 0 })
const sums = reactive({ consumed: 0, freeUsed: 0, refunded: 0, granted: 0 })
const categories = ref([])
const kinds = ref([])
const bizTypes = ref([])

const current = computed(() => (tab.value === 'operations' ? operations : credits))
const pageCount = computed(() => Math.max(1, Math.ceil((current.value.total || 0) / current.value.pageSize)))
const rangeText = computed(() => (filter.days === 1 ? '近 1 天' : `近 ${filter.days} 天`))

function requestParams(page, pageSize) {
  const params = { page, pageSize, days: filter.days }
  if (filter.keyword) params.keyword = filter.keyword
  if (tab.value === 'operations') {
    if (filter.category) params.category = filter.category
  } else {
    if (filter.kind) params.kind = filter.kind
    if (filter.biz) params.biz = filter.biz
  }
  return params
}

function endpoint() {
  return tab.value === 'operations' ? '/admin/logs/operations' : '/admin/logs/credits'
}

async function load(page = current.value.page) {
  loading.value = true
  loadError.value = ''
  const target = current.value
  try {
    const { data } = await apiClient.get(endpoint(), { params: requestParams(page, target.pageSize) })
    Object.assign(target, { items: data.items || [], total: data.total || 0, page: data.page || page })
    if (tab.value === 'operations') {
      Object.assign(opStats, data.stats || {})
      categories.value = data.categories || categories.value
    } else {
      Object.assign(sums, data.sums || {})
      kinds.value = data.kinds || kinds.value
      bizTypes.value = data.bizTypes || bizTypes.value
    }
  } catch (error) {
    target.items = []
    target.total = 0
    loadError.value = error?.response?.data?.message || '日志读取失败，请确认后台服务已启动。'
  } finally {
    loading.value = false
  }
}

function switchTab(next) {
  if (tab.value === next) return
  tab.value = next
  load(1)
}

function setOp(patch) {
  Object.assign(filter, patch)
  load(1)
}

// 导出当前筛选下的记录（最多 2000 条），Excel 能直接打开的 CSV
async function exportCsv() {
  if (exporting.value) return
  exporting.value = true
  try {
    const rows = []
    const pageSize = 100
    for (let page = 1; page <= 20; page += 1) {
      const { data } = await apiClient.get(endpoint(), { params: requestParams(page, pageSize) })
      rows.push(...(data.items || []))
      if (rows.length >= (data.total || 0) || !(data.items || []).length) break
    }
    const name = (u) => (u ? `${u.name || ''}（${u.account}）` : '')
    const table = tab.value === 'operations'
      ? [['时间', '操作人', '类型', '做了什么', '对象', '内容'], ...rows.map((r) => [fullTime(r.createdAt), name(r.actor) || '系统', r.categoryLabel, r.actionLabel, name(r.target), r.summary])]
      : [['时间', '账号', '类型', '用途', '积分变动', '变动后余额', '说明', '操作人'], ...rows.map((r) => [fullTime(r.createdAt), name(r.user), r.kindLabel, r.bizLabel, r.change, r.balanceAfter, r.reason, name(r.operator)])]
    const csv = table.map((line) => line.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${tab.value === 'operations' ? '操作记录' : '积分流水'}-${fullTime(new Date()).slice(0, 10)}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    ElMessage.success(`已导出 ${rows.length} 条${rows.length < current.value.total ? '（一次最多导出 2000 条，可缩小时间范围分几次导）' : ''}`)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '导出失败，请稍后再试')
  } finally {
    exporting.value = false
  }
}

function csvCell(value) {
  let text = String(value ?? '')
  // 防止 Excel 把 = + - @ 开头的内容当公式执行（数字本身不处理）
  if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function roleLabel(role) {
  return { admin: '管理员', teacher: '讲师', student: '小画家' }[role] || ''
}

function categoryTone(category) {
  return { auth: 'is-info', credit: 'is-warn', risk: 'is-bad', account: 'is-warn' }[category] || ''
}

function kindTone(kind) {
  return { consume: '', refund: 'is-ok', admin_adjust: 'is-warn', redeem: 'is-info', void: 'is-bad' }[kind] || ''
}

const pad = (n) => String(n).padStart(2, '0')
function fullTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  return `${date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}-`}${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

onMounted(() => load(1))
</script>

<style scoped>
.logs-user { display: grid; gap: 1px; min-width: 0; }
.logs-user strong { color: var(--ax-ink); font-weight: 600; white-space: nowrap; }
.logs-user small { color: var(--ax-muted); font-size: 12px; white-space: nowrap; }
.logs-detail { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; }
.logs-target { color: var(--ax-ink); white-space: nowrap; }
.logs-target small { color: var(--ax-muted); font-size: 12px; }
.logs-summary { max-width: 420px; overflow: hidden; color: var(--ax-text); text-overflow: ellipsis; white-space: nowrap; }
.logs-muted { color: var(--ax-muted); font-size: 12.5px; white-space: nowrap; }
.ax-tag.is-ok { background: rgba(22, 163, 74, 0.1); color: #15803d; }
.ax-tag.is-bad { background: rgba(220, 38, 38, 0.08); color: #b91c1c; }
.logs-change { font-weight: 700; }
.logs-change.is-in { color: #16a34a; }
.logs-change.is-out { color: #dc2626; }
@media (max-width: 1180px) {
  .logs-summary { max-width: 260px; }
}
</style>
