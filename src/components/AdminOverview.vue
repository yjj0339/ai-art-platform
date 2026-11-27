<template>
  <section class="ov">
    <header class="ov-hero">
      <div>
        <p class="ov-date">{{ todayText }}</p>
        <h2>{{ greeting }}，{{ name }}</h2>
        <p class="ov-sub">今天平台的情况都在这一页。{{ updatedText }}</p>
      </div>
      <button type="button" class="ax-btn" :disabled="loading" @click="load">
        <AdminIcon name="refresh" plain :class="{ 'is-spinning': loading }" />{{ loading ? '刷新中…' : '刷新' }}
      </button>
    </header>

    <p v-if="loadError" class="ax-note is-bad">{{ loadError }}</p>

    <div class="ov-kpis">
      <article v-for="item in kpis" :key="item.key" class="ov-kpi">
        <AdminIcon :name="item.icon" size="lg" />
        <div class="ov-kpi-body">
          <small>{{ item.label }}</small>
          <strong>{{ item.value }}</strong>
          <em>{{ item.note }}</em>
        </div>
      </article>
    </div>

    <div class="ov-grid">
      <!-- 接口可用率：近 24 小时，每小时一根柱，正常 / 出错两段 -->
      <article class="ov-card ov-api">
        <header class="ov-card-head">
          <div>
            <h3>接口可用率 · 近 24 小时</h3>
            <p>用户每点一次按钮就是一次请求；出错指服务器自己出了问题（5xx）。</p>
          </div>
          <span class="ov-rate">
            <b>{{ api ? `${api.rate}%` : '—' }}</b>
            <span v-if="rateTone !== 'none'" class="ax-pill" :class="rateTone === 'good' ? 'is-ok' : rateTone === 'warn' ? 'is-warn' : 'is-bad'">
              {{ rateTone === 'good' ? '正常' : rateTone === 'warn' ? '有少量出错' : '出错偏多' }}
            </span>
          </span>
        </header>
        <div class="ov-legend" aria-hidden="true">
          <span><i class="sw is-ok"></i>正常请求</span>
          <span><i class="sw is-err"></i>出错</span>
        </div>
        <div class="ov-chart" @mouseleave="hoverIndex = -1">
          <div class="ov-bars" role="img" :aria-label="chartLabel">
            <div
              v-for="(bucket, index) in trend"
              :key="bucket.hour"
              class="ov-col"
              :class="{ 'is-hover': hoverIndex === index }"
              @mouseenter="hoverIndex = index"
            >
              <div class="ov-bar" :style="{ height: barHeight(bucket.total) }">
                <span v-if="bucket.errors" class="seg is-err" :style="{ height: segShare(bucket.errors, bucket.total) }"></span>
                <span class="seg is-ok" :style="{ height: segShare(bucket.total - bucket.errors, bucket.total) }"></span>
              </div>
            </div>
          </div>
          <div
            v-if="hoverBucket"
            class="ov-tip"
            :style="{ left: `${((hoverIndex + 0.5) / trend.length) * 100}%` }"
            :class="hoverIndex >= trend.length / 2 ? 'is-before' : 'is-after'"
          >
            <strong>{{ hourRange(hoverBucket.hour) }}</strong>
            <span>请求 {{ hoverBucket.total }} 次</span>
            <span :class="{ 'is-err': hoverBucket.errors }">出错 {{ hoverBucket.errors }} 次</span>
          </div>
          <p v-if="!trendMax" class="ov-chart-empty">这段时间还没有请求</p>
        </div>
        <div class="ov-axis" aria-hidden="true">
          <span>{{ trend.length ? hourLabel(trend[0].hour) : '' }}</span>
          <span>{{ trend.length ? hourLabel(trend[Math.floor(trend.length / 2)].hour) : '' }}</span>
          <span>现在</span>
        </div>
        <p class="ov-foot">{{ api ? `共 ${api.total} 次请求，出错 ${api.errors} 次。从 ${sinceText} 服务启动开始统计，重启后重新计数。` : '暂时读不到接口统计。' }}</p>
        <table class="ov-sr-only">
          <caption>近 24 小时每小时请求数</caption>
          <thead><tr><th>时间</th><th>请求</th><th>出错</th></tr></thead>
          <tbody><tr v-for="bucket in trend" :key="`t-${bucket.hour}`"><td>{{ hourRange(bucket.hour) }}</td><td>{{ bucket.total }}</td><td>{{ bucket.errors }}</td></tr></tbody>
        </table>
      </article>

      <!-- 今日 AI 调用：按类型 -->
      <article class="ov-card ov-ai">
        <header class="ov-card-head">
          <div>
            <h3>今日 AI 调用</h3>
            <p>{{ ai && ai.successRate !== null ? `成功率 ${ai.successRate}%` : '按能力分开统计' }}</p>
          </div>
          <span class="ov-count">{{ ai ? ai.totalToday : '—' }}<small>次</small></span>
        </header>
        <ul v-if="aiRows.length" class="ov-ai-list">
          <li v-for="row in aiRows" :key="row.type" :style="{ '--tint': taskTint(row.type) }">
            <AdminIcon :name="taskIconName(row.type)" size="sm" />
            <div class="ov-ai-main">
              <div class="ov-ai-label">
                <span>{{ row.label }}</span>
                <span class="ov-ai-value">{{ row.total }} 次<em v-if="row.failed">失败 {{ row.failed }}</em></span>
              </div>
              <div class="ov-ai-track"><i :style="{ width: `${Math.max(4, (row.total / aiMax) * 100)}%` }"></i></div>
            </div>
          </li>
        </ul>
        <div v-else class="ax-empty is-compact"><strong>今天还没有 AI 调用</strong><span>用户出图、做视频或生成报告后，这里会按类型统计。</span></div>
      </article>

      <!-- 待处理：iOS 列表，整行可点 -->
      <article class="ov-card ov-todo">
        <header class="ov-card-head">
          <div>
            <h3>待处理</h3>
            <p>有数字的地方需要看一眼，点一行直接过去。</p>
          </div>
        </header>
        <ul class="ov-todo-list">
          <li v-for="item in todos" :key="item.key">
            <component
              :is="item.nav ? 'button' : 'div'"
              v-bind="item.nav ? { type: 'button' } : {}"
              class="ov-todo-row"
              :class="{ 'is-hot': item.hot, 'is-link': item.nav }"
              @click="item.nav && emit('navigate', item.nav)"
            >
              <AdminIcon :name="item.icon" size="sm" :tint="item.hot ? '' : '#aeaeb2'" />
              <span class="ov-todo-main">
                <strong>{{ item.title }}</strong>
                <small>{{ item.note }}</small>
              </span>
              <b>{{ item.value }}</b>
              <AdminIcon v-if="item.nav" name="chevron" plain class="ov-chevron" />
            </component>
          </li>
        </ul>
      </article>

      <!-- 今日积分 -->
      <article class="ov-card ov-credits">
        <header class="ov-card-head">
          <div>
            <h3>今日积分</h3>
            <p>充值、兑换码入账和 AI 消耗。</p>
          </div>
        </header>
        <dl class="ov-tiles">
          <div><dt>入账</dt><dd>{{ fmt(credits?.rechargedToday) }}</dd></div>
          <div><dt>消耗</dt><dd>{{ fmt(credits?.consumedToday) }}</dd></div>
          <div><dt>消耗人数</dt><dd>{{ fmt(credits?.payersToday) }}</dd></div>
          <div><dt>兑换码 发/兑</dt><dd>{{ codes ? `${codes.issuedToday} / ${codes.redeemedToday}` : '—' }}</dd></div>
        </dl>
        <button type="button" class="ax-btn is-soft is-sm ov-more" @click="emit('navigate', 'creditBilling')">
          AI 用量与计费<AdminIcon name="chevron" plain />
        </button>
      </article>

      <!-- 常用入口：像手机桌面的应用图标 -->
      <article class="ov-card ov-quick">
        <header class="ov-card-head">
          <div>
            <h3>常用入口</h3>
            <p>最常改的几个地方。</p>
          </div>
        </header>
        <div class="ov-apps">
          <button v-for="item in quickLinks" :key="item.nav" type="button" class="ov-app" @click="emit('navigate', item.nav)">
            <AdminIcon :name="item.nav" size="xl" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiClient } from '../services/apiClient'
import AdminIcon from './admin/AdminIcon.vue'
import { adminIcon, taskIconName } from './admin/adminIcons.js'

const props = defineProps({
  userName: { type: String, default: '' },
  // 已经做好的页面才给链接（风控 / 异常页面上线前不显示「去看看」）
  availableNavs: { type: Array, default: () => [] },
})
const emit = defineEmits(['navigate'])

const loading = ref(false)
const loadError = ref('')
const overview = ref(null)
const risk = ref(null)
const updatedAt = ref(null)
const hoverIndex = ref(-1)

const name = computed(() => props.userName || '管理员')
const now = ref(new Date())
const greeting = computed(() => {
  const hour = now.value.getHours()
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})
const todayText = computed(() => {
  const date = now.value
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · 星期${'日一二三四五六'[date.getDay()]}`
})
const updatedText = computed(() => (updatedAt.value ? `数据更新于 ${pad(updatedAt.value.getHours())}:${pad(updatedAt.value.getMinutes())}。` : ''))

const users = computed(() => overview.value?.users || null)
const credits = computed(() => overview.value?.credits || null)
const codes = computed(() => overview.value?.codes || null)
const ai = computed(() => overview.value?.ai || null)
const api = computed(() => overview.value?.api || null)
const errors = computed(() => overview.value?.errors || null)

function pad(value) {
  return String(value).padStart(2, '0')
}
function fmt(value) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString('zh-CN')
}

const kpis = computed(() => [
  {
    key: 'new', icon: 'userPlus', label: '今日新增账号',
    value: users.value ? fmt(users.value.newToday) : '—',
    note: users.value ? `共 ${fmt(users.value.total)} 个账号` : '暂时读不到',
  },
  {
    key: 'active', icon: 'activity', label: '今日活跃',
    value: users.value?.activeToday === null || !users.value ? '—' : fmt(users.value.activeToday),
    note: '今天登录、用过平台的账号',
  },
  {
    key: 'ai', icon: 'sparkles', label: '今日 AI 调用',
    value: ai.value ? fmt(ai.value.totalToday) : '—',
    note: ai.value?.successRate !== null && ai.value ? `成功率 ${ai.value.successRate}%` : '今天还没有调用',
  },
  {
    key: 'credits', icon: 'coins', label: '今日积分消耗',
    value: credits.value ? fmt(credits.value.consumedToday) : '—',
    note: credits.value ? `入账 ${fmt(credits.value.rechargedToday)}` : '暂时读不到',
  },
])

const trend = computed(() => api.value?.trend || [])
const trendMax = computed(() => trend.value.reduce((max, bucket) => Math.max(max, bucket.total), 0))
const hoverBucket = computed(() => (hoverIndex.value >= 0 ? trend.value[hoverIndex.value] : null))
const rateTone = computed(() => {
  if (!api.value || !api.value.total) return 'none'
  if (api.value.rate >= 99.5) return 'good'
  if (api.value.rate >= 97) return 'warn'
  return 'bad'
})
const sinceText = computed(() => {
  const value = api.value?.since
  if (!value) return ''
  const date = new Date(value)
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})
const chartLabel = computed(() => (api.value
  ? `近 24 小时共 ${api.value.total} 次请求，出错 ${api.value.errors} 次，可用率 ${api.value.rate}%`
  : '暂时读不到接口统计'))

function barHeight(total) {
  if (!trendMax.value || !total) return '0%'
  return `${Math.max(3, (total / trendMax.value) * 100)}%`
}
function segShare(part, total) {
  return total ? `${(part / total) * 100}%` : '0%'
}
function hourLabel(iso) {
  return `${pad(new Date(iso).getHours())}:00`
}
function hourRange(iso) {
  const hour = new Date(iso).getHours()
  return `${pad(hour)}:00–${pad(hour)}:59`
}

const aiRows = computed(() => (ai.value?.byType || []).filter((row) => row.total > 0).sort((a, b) => b.total - a.total))
const aiMax = computed(() => aiRows.value.reduce((max, row) => Math.max(max, row.total), 0) || 1)
function taskTint(type) {
  return adminIcon(taskIconName(type)).tint
}

const can = (nav) => props.availableNavs.includes(nav)
const todos = computed(() => [
  {
    key: 'errors', icon: 'alert', title: '未处理的异常', nav: can('ops') ? 'ops' : '',
    value: errors.value ? fmt(errors.value.open) : '—',
    note: errors.value ? `今天 AI 失败 ${errors.value.aiToday} 次 · 服务器出错 ${errors.value.serverToday} 次` : '暂时读不到',
    hot: Boolean(errors.value?.open),
  },
  {
    key: 'risk', icon: 'shield', title: '风控待复核', nav: can('risk') ? 'risk' : '',
    value: risk.value ? fmt(risk.value.pendingEvents) : '—',
    note: risk.value ? `近 24 小时拦下 ${risk.value.blocked24h} 条 · 需要关心 ${risk.value.pendingCare} 位` : '暂时读不到',
    hot: Boolean(risk.value?.pendingEvents || risk.value?.pendingCare),
  },
  {
    key: 'bans', icon: 'ban', title: '正在封禁的账号', nav: can('risk') ? 'risk' : '',
    value: risk.value ? fmt(risk.value.activeBans) : '—',
    note: risk.value ? `登录被锁定 ${risk.value.lockedAccounts} 个${risk.value.lockedNetworks ? ` · 网络 ${risk.value.lockedNetworks} 个` : ''}` : '暂时读不到',
    hot: Boolean(risk.value?.activeBans),
  },
  {
    key: 'disabled', icon: 'userOff', title: '已停用的账号', nav: 'accounts',
    value: users.value ? fmt(users.value.disabled) : '—',
    note: '在「账号权限」里可以重新启用',
    hot: false,
  },
])

const quickLinks = [
  { nav: 'accounts', label: '账号权限' },
  { nav: 'api', label: 'API 配置' },
  { nav: 'partner', label: 'AI 创作伙伴' },
  { nav: 'workbench', label: '工作台外观' },
  { nav: 'courses', label: '课程库' },
  { nav: 'audit', label: '内容审核' },
]

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  now.value = new Date()
  const [ops, riskResult] = await Promise.allSettled([
    apiClient.get('/admin/ops/overview', { timeout: 15000 }),
    apiClient.get('/admin/risk/overview', { timeout: 15000 }),
  ])
  if (ops.status === 'fulfilled') overview.value = ops.value.data
  if (riskResult.status === 'fulfilled') risk.value = riskResult.value.data
  if (ops.status === 'rejected' && riskResult.status === 'rejected') {
    loadError.value = ops.reason?.response?.data?.message || '数据读取失败，请稍后点「刷新」再试。'
  }
  updatedAt.value = new Date()
  loading.value = false
}

onMounted(load)
</script>

<style scoped>
.ov { display: grid; gap: 18px; min-width: 0; }
.ov-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 6px 2px 0; }
.ov-date { margin: 0 0 4px; color: var(--ax-muted); font-size: 13.5px; font-weight: 600; }
.ov-hero h2 { margin: 0; color: var(--ax-ink); font-size: 32px; font-weight: 700; line-height: 1.15; letter-spacing: -0.02em; }
.ov-sub { margin: 6px 0 0; color: var(--ax-muted); font-size: 14px; }
.is-spinning { animation: ov-spin 1s linear infinite; }
@keyframes ov-spin { to { transform: rotate(360deg); } }

/* 小组件 */
.ov-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.ov-kpi,
.ov-card {
  min-width: 0;
  border: 1px solid var(--ax-glass-edge);
  border-radius: var(--ax-radius-lg);
  background: var(--ax-surface);
  box-shadow: var(--ax-shadow);
  -webkit-backdrop-filter: var(--ax-blur);
  backdrop-filter: var(--ax-blur);
}
.ov-kpi { display: flex; align-items: center; gap: 14px; padding: 18px; }
.ov-kpi-body { display: grid; gap: 1px; min-width: 0; }
.ov-kpi-body small { color: var(--ax-text); font-size: 13px; font-weight: 600; }
.ov-kpi-body strong { color: var(--ax-ink); font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.ov-kpi-body em { overflow: hidden; color: var(--ax-muted); font-size: 12.5px; font-style: normal; white-space: nowrap; text-overflow: ellipsis; }

.ov-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; }
.ov-card { display: grid; align-content: start; gap: 14px; padding: 20px 22px; }
.ov-api { grid-column: span 8; }
.ov-ai { grid-column: span 4; }
.ov-todo { grid-column: span 5; }
.ov-credits { grid-column: span 3; }
.ov-quick { grid-column: span 4; }
.ov-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ov-card-head h3 { margin: 0; color: var(--ax-ink); font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.ov-card-head p { margin: 4px 0 0; color: var(--ax-muted); font-size: 13px; line-height: 1.5; }

.ov-rate { display: grid; justify-items: end; gap: 4px; }
.ov-rate b { color: var(--ax-ink); font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
.ov-count { color: var(--ax-ink); font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
.ov-count small { margin-left: 3px; color: var(--ax-muted); font-size: 13px; font-weight: 500; }

/* 柱状图 */
.ov-legend { display: flex; gap: 16px; color: var(--ax-text); font-size: 12.5px; }
.ov-legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 10px; border-radius: 3px; }
.sw.is-ok { background: #0a84ff; }
.sw.is-err { background: #ff3b30; }
.ov-chart { position: relative; height: 160px; }
.ov-bars { display: flex; align-items: flex-end; gap: 4px; height: 100%; padding-bottom: 1px; border-bottom: 1px solid var(--ax-line); }
.ov-col { display: flex; align-items: flex-end; flex: 1 1 0; height: 100%; min-width: 0; border-radius: 7px 7px 0 0; cursor: default; }
.ov-col.is-hover { background: rgba(var(--ax-brand-rgb), 0.07); }
.ov-bar { display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; width: 100%; min-height: 0; }
.ov-bar .seg { display: block; width: 100%; min-height: 0; }
.ov-bar .seg:first-child { border-radius: 5px 5px 0 0; }
.ov-bar .seg.is-ok { background: linear-gradient(180deg, #5ac8fa, #0a84ff); }
.ov-col.is-hover .seg.is-ok { background: #0064d1; }
.ov-bar .seg.is-err { background: #ff3b30; }
.ov-chart-empty { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--ax-muted); font-size: 13px; pointer-events: none; }
.ov-tip {
  position: absolute; top: 6px; z-index: 2; display: grid; gap: 2px; min-width: 124px; padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 12px; background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 30px rgba(16, 24, 40, 0.16); color: var(--ax-text); font-size: 12.5px;
  pointer-events: none; white-space: nowrap;
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
}
/* 提示框放在柱子旁边（右半边放左侧、左半边放右侧），不挡住正在看的那根柱子，也不会盖到卡片标题 */
.ov-tip.is-before { transform: translateX(calc(-100% - 14px)); }
.ov-tip.is-after { transform: translateX(14px); }
.ov-tip strong { color: var(--ax-ink); font-size: 13px; }
.ov-tip .is-err { color: var(--ax-bad); }
.ov-axis { display: flex; justify-content: space-between; margin-top: -6px; color: var(--ax-muted); font-size: 12px; }
.ov-foot { margin: 0; color: var(--ax-muted); font-size: 12.5px; line-height: 1.6; }

/* AI 调用 */
.ov-ai-list { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
.ov-ai-list li { display: flex; align-items: center; gap: 12px; }
.ov-ai-main { flex: 1 1 auto; min-width: 0; }
.ov-ai-label { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; color: var(--ax-ink); font-size: 13.5px; font-weight: 600; }
.ov-ai-value { color: var(--ax-text); font-weight: 500; font-variant-numeric: tabular-nums; }
.ov-ai-value em { margin-left: 8px; color: var(--ax-bad); font-style: normal; }
.ov-ai-track { height: 8px; overflow: hidden; border-radius: 999px; background: var(--ax-fill); }
.ov-ai-track i { display: block; height: 100%; border-radius: 999px; background: var(--tint, #0a84ff); }

/* 待处理 */
.ov-todo-list { display: grid; margin: 0 -10px; padding: 0; list-style: none; }
.ov-todo-list li + li .ov-todo-row::before {
  content: '';
  position: absolute;
  top: 0;
  right: 10px;
  left: 50px;
  height: 1px;
  background: var(--ax-line);
}
.ov-todo-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 58px !important;
  padding: 8px 10px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}
.ov-todo-row.is-link { cursor: pointer; transition: background 0.15s ease; }
.ov-todo-row.is-link:hover { background: var(--ax-fill); }
.ov-todo-row.is-link:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.ov-todo-main { display: grid; flex: 1 1 auto; gap: 1px; min-width: 0; }
.ov-todo-main strong { color: var(--ax-ink); font-size: 14px; font-weight: 600; }
.ov-todo-main small { overflow: hidden; color: var(--ax-muted); font-size: 12.5px; white-space: nowrap; text-overflow: ellipsis; }
.ov-todo-row b { color: var(--ax-ink); font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ov-todo-row.is-hot b { color: #ff3b30; }
.ov-chevron { color: var(--ax-faint); }

/* 今日积分：四个小格 */
.ov-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; }
.ov-tiles div { display: grid; gap: 4px; padding: 12px 14px; border-radius: 14px; background: var(--ax-surface-2); }
.ov-tiles dt { overflow: hidden; color: var(--ax-muted); font-size: 12.5px; white-space: nowrap; text-overflow: ellipsis; }
.ov-tiles dd { margin: 0; color: var(--ax-ink); font-size: 22px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }
.ov-more { justify-self: start; }

/* 常用入口：应用图标 */
.ov-apps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 8px; }
.ov-app {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-height: 0 !important;
  padding: 10px 4px;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--ax-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.12s ease;
}
.ov-app:hover { background: var(--ax-fill); }
.ov-app:active { transform: scale(0.96); }
.ov-app:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.ov-app span { white-space: nowrap; }

.ov-sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 1280px) {
  .ov-api { grid-column: span 12; }
  .ov-ai, .ov-todo { grid-column: span 6; }
  .ov-credits, .ov-quick { grid-column: span 6; }
}
@media (max-width: 1100px) {
  .ov-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .ov-ai, .ov-todo, .ov-credits, .ov-quick { grid-column: span 12; }
  .ov-hero h2 { font-size: 26px; }
}
@media (max-width: 520px) {
  .ov-kpis { grid-template-columns: 1fr; }
}
</style>
