<template>
  <main class="profile-page app-page">
    <!-- 返回和页面名在共用顶栏里；积分余额和退出登录放进顶栏右侧 -->
    <Teleport to="#su-topbar-actions" defer>
      <div class="top-token">
        <span>积分余额</span>
        <strong>{{ creditSummary.balance }}</strong>
      </div>
      <button type="button" class="su-btn su-btn--sm su-btn--danger" @click="logout">退出登录</button>
    </Teleport>

    <section class="profile-shell">
      <aside class="profile-sidebar">
        <section class="identity-card">
          <div class="avatar-ring">{{ avatarText }}</div>
          <strong>{{ userStore.user?.name || roleMeta.name }}</strong>
          <span>{{ roleMeta.label }}</span>
          <p>{{ userStore.user?.className || roleMeta.className }}</p>
        </section>

        <nav class="profile-nav" aria-label="个人中心导航">
          <button
            v-for="item in sectionTabs"
            :key="item.id"
            type="button"
            :class="{ active: activeSection === item.id }"
            @click="activeSection = item.id"
          >
            <span class="icon-tile"><el-icon><component :is="iconOf(item.icon)" /></el-icon></span>
            <div>
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </div>
          </button>
        </nav>

        <section class="side-token">
          <span>本月消耗积分</span>
          <strong>{{ creditSummary.monthUsed }} 积分</strong>
          <button type="button" @click="activeSection = 'payment'">去充值</button>
        </section>
      </aside>

      <section class="profile-content">
        <section v-if="activeSection === 'overview'" class="content-panel overview-panel">
          <div class="section-head">
            <div>
              <h2>概览</h2>
              <p>只保留最常用的数据和入口，减少重复信息。</p>
            </div>
            <button type="button" @click="router.push(roleMeta.primaryPath)">{{ roleMeta.primaryAction }}</button>
          </div>

          <div class="metric-grid">
            <article v-for="item in summaryCards" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <p>{{ item.note }}</p>
            </article>
          </div>

          <div class="overview-layout">
            <article class="activity-card">
              <div class="subhead">
                <h3>最近动态</h3>
                <button type="button" @click="activeSection = 'records'">查看记录</button>
              </div>
              <div class="activity-list">
                <div v-for="item in recentActivities" :key="item.title">
                  <span>{{ item.type }}</span>
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.time }}</small>
                </div>
              </div>
            </article>

            <article class="quick-card">
              <div class="subhead">
                <h3>常用入口</h3>
                <button type="button" @click="activeSection = 'business'">全部</button>
              </div>
              <div class="quick-grid">
                <button v-for="item in quickActions" :key="item.title" type="button" @click="handleQuickAction(item)">
                  <span class="icon-tile"><el-icon><component :is="iconOf(item.icon)" /></el-icon></span>
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.desc }}</small>
                </button>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="activeSection === 'business'" class="content-panel business-panel">
          <div class="section-head">
            <div>
              <h2>{{ roleMeta.sectionTitle }}</h2>
              <p>{{ roleMeta.sectionDesc }}</p>
            </div>
            <button type="button" @click="router.push(roleMeta.primaryPath)">{{ roleMeta.primaryAction }}</button>
          </div>

          <div class="business-grid">
            <article v-for="item in roleCards" :key="item.title">
              <span class="icon-tile"><el-icon><component :is="iconOf(item.icon)" /></el-icon></span>
              <div>
                <strong>{{ item.title }}</strong>
                <p>{{ item.desc }}</p>
              </div>
            </article>
          </div>

          <article class="compact-report">
            <div class="subhead">
              <h3>{{ roleMeta.reportTitle }}</h3>
              <button type="button" @click="togglePanel('reports')">{{ openPanels.reports ? '收起' : '展开' }}</button>
            </div>
            <div v-show="openPanels.reports" class="compact-list">
              <div v-for="item in reportItems" :key="item.title">
                <strong>{{ item.title }}</strong>
                <span>{{ item.status }}</span>
              </div>
            </div>
          </article>
        </section>

        <section v-else-if="activeSection === 'payment'" class="content-panel payment-panel">
          <div class="section-head">
            <div>
              <h2>积分充值</h2>
              <p>选择档位后生成订单号，付款给讲师；把订单号发给讲师领取积分码，再到「我的积分」兑换到账。</p>
            </div>
            <span class="pay-status">{{ activeOrder ? '待付款' : '请选择档位' }}</span>
          </div>

          <div class="payment-workspace">
            <div class="package-list">
              <article
                v-for="pack in creditPackages"
                :key="pack.id"
                class="package-card"
                :class="{ active: selectedPackId === pack.id }"
              >
                <div>
                  <span>{{ pack.label }}</span>
                  <strong>{{ pack.credits }} 积分</strong>
                  <p>{{ pack.desc }}</p>
                </div>
                <em>¥{{ pack.yuan }}</em>
                <button type="button" @click="selectPack(pack)">选择档位</button>
              </article>
            </div>

            <aside class="payment-detail">
              <div v-if="!activeOrder" class="payment-empty">
                <strong>请选择一个充值档位</strong>
                <p>选中后这里会显示订单号、付款指引和「我已付款·去兑换」入口。</p>
              </div>

              <template v-else>
                <div class="method-tabs">
                  <button type="button" :class="{ active: paymentMethod === 'wechat' }" @click="paymentMethod = 'wechat'">微信支付</button>
                  <button type="button" :class="{ active: paymentMethod === 'alipay' }" @click="paymentMethod = 'alipay'">支付宝</button>
                </div>

                <div class="pay-guide">
                  <div class="pay-guide-mark">{{ paymentMethod === 'wechat' ? '微' : '支' }}</div>
                  <strong>请向讲师索取收款码</strong>
                  <p>微信、支付宝都可以付款，金额按所选档位。付款完成后把下面的订单号发给讲师，讲师确认后会发你一个积分码。</p>
                </div>

                <div class="order-info">
                  <strong>{{ activeOrder.label }} · ¥{{ activeOrder.yuan }} · {{ activeOrder.credits }} 积分</strong>
                  <p class="order-no">订单号：{{ activeOrder.orderNo }}</p>
                  <button type="button" class="order-copy" @click="copyOrderNo">复制订单号</button>
                  <span>付款后把订单号发给讲师，讲师确认收款后发放积分码</span>
                </div>

                <div class="pay-actions">
                  <button type="button" @click="goRedeem">我已付款·去兑换</button>
                  <button type="button" @click="cancelOrder">重新选择</button>
                </div>
              </template>
            </aside>
          </div>
        </section>

        <section v-else-if="activeSection === 'wallet'" class="content-panel wallet-panel">
          <div class="section-head">
            <div>
              <h2>我的积分</h2>
              <p>查看余额、今日免费额度和消费流水；把讲师发的积分码粘贴进来即可到账。</p>
            </div>
            <button type="button" @click="loadAll">刷新</button>
          </div>

          <div class="wallet-metrics">
            <article class="wallet-metric main">
              <span>当前余额</span>
              <strong>{{ creditSummary.balance }}</strong>
              <em>积分</em>
            </article>
            <article class="wallet-metric">
              <span>今日免费额度</span>
              <strong>{{ creditSummary.freeRemaining }}</strong>
              <em>剩余 / 共 {{ creditSummary.freeTotal }}</em>
              <div class="free-bar"><i :style="{ width: freePercent + '%' }"></i></div>
            </article>
            <article class="wallet-metric">
              <span>本月消耗</span>
              <strong>{{ creditSummary.monthUsed }}</strong>
              <em>积分</em>
            </article>
          </div>

          <div class="code-redeem">
            <div class="code-redeem-head">
              <strong>积分码兑换</strong>
              <p>把讲师发给你的积分码粘贴到这里（例如 ART-XXXX-XXXX-XXXX）。</p>
            </div>
            <div class="code-redeem-row">
              <input v-model="redeemInput" type="text" placeholder="输入积分码" @keyup.enter="doRedeem" />
              <button type="button" :disabled="redeeming" @click="doRedeem">{{ redeeming ? '兑换中…' : '立即兑换' }}</button>
            </div>
          </div>

          <div class="wallet-ledger">
            <div class="subhead"><h3>积分流水</h3><span>共 {{ creditLedger.length }} 条</span></div>
            <div class="ledger-list">
              <article v-for="item in creditLedgerRows" :key="item.id">
                <div>
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.time }}</span>
                </div>
                <em :class="{ positive: item.amount > 0 }">{{ item.amount > 0 ? '+' : '' }}{{ item.amount }}</em>
              </article>
              <div v-if="!creditLedgerRows.length" class="wallet-empty">暂无积分流水</div>
            </div>
          </div>
        </section>

        <section v-else class="content-panel records-panel">
          <div class="section-head">
            <div>
              <h2>记录与安全</h2>
              <p>充值、AI消耗和账号设置集中到折叠面板，默认不占用首页空间。</p>
            </div>
          </div>

          <div class="accordion-stack">
            <article class="accordion-card">
              <button type="button" class="accordion-head" @click="togglePanel('ledger')">
                <strong>积分收入记录</strong>
                <span>{{ openPanels.ledger ? '收起' : '展开' }}</span>
              </button>
              <div v-show="openPanels.ledger" class="ledger-list">
                <article v-for="item in rechargeLedger" :key="item.id">
                  <div>
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.time }}</span>
                  </div>
                  <em class="positive">+{{ item.amount }}</em>
                </article>
              </div>
            </article>

            <article class="accordion-card">
              <button type="button" class="accordion-head" @click="togglePanel('usage')">
                <strong>积分消耗记录</strong>
                <span>{{ openPanels.usage ? '收起' : '展开' }}</span>
              </button>
              <div v-show="openPanels.usage" class="ledger-list">
                <article v-for="item in usageLedger" :key="item.id">
                  <div>
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.time }}</span>
                  </div>
                  <em>{{ item.amount }}</em>
                </article>
              </div>
            </article>

            <article class="accordion-card">
              <button type="button" class="accordion-head" @click="togglePanel('security')">
                <strong>账号安全设置</strong>
                <span>{{ openPanels.security ? '收起' : '展开' }}</span>
              </button>
              <div v-show="openPanels.security" class="security-actions">
                <button type="button">修改资料</button>
                <button type="button">隐私设置</button>
                <button type="button" @click="logout">切换账号</button>
              </div>
            </article>
          </div>
        </section>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Coin, Collection, Cpu, CreditCard, DataAnalysis, DataBoard, Document, Files, Key, Lock, Picture, Reading, Ticket, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useCourseStore } from '../stores/courseStore'
import { useDifficultyStore } from '../stores/difficultyStore'
import { useProjectStore } from '../stores/projectStore'
import { useUserStore } from '../stores/userStore'
import { fetchCreditSummary, fetchCreditLedger, redeemCreditCode } from '../services/creditGateway'

const router = useRouter()
const userStore = useUserStore()
const projectStore = useProjectStore()
const courseStore = useCourseStore()
const difficultyStore = useDifficultyStore()

const activeSection = ref('overview')
const creditSummary = reactive({
  balance: 0,
  freeTotal: 60,
  freeUsed: 0,
  freeRemaining: 60,
  monthUsed: 0,
})
const creditLedger = ref([])
const redeemInput = ref('')
const redeeming = ref(false)
const selectedPackId = ref('')
const paymentMethod = ref('wechat')
const activeOrder = ref(null)
const openPanels = reactive({
  reports: true,
  ledger: true,
  usage: false,
  security: false,
})

// 充值档位（1 积分 = 0.1 元，10 元 = 100 积分）
const creditPackages = [
  { id: 'p10', label: '体验档', yuan: 10, credits: 100, desc: '适合先试试 AI 绘画与报告导出。' },
  { id: 'p30', label: '基础档', yuan: 30, credits: 300, desc: '适合一个月的课堂创作练习。' },
  { id: 'p50', label: '常用档', yuan: 50, credits: 500, desc: '适合高频生图、视频和 3D 创作。' },
  { id: 'p100', label: '畅用档', yuan: 100, credits: 1000, desc: '适合长期使用与班级集中充值。' },
]

const roleConfig = {
  student: {
    label: '用户账号',
    avatar: '学',
    name: '小画家阿橙',
    className: 'AI创意美术A班',
    subtitle: '管理课程、作品、积分和学习档案',
    sectionTitle: '我的学习与创作',
    sectionDesc: '课程、作品、报告和AI创作资产集中查看。',
    reportTitle: '最近项目报告',
    businessLabel: '我的内容',
    businessDesc: '课程、作品与学习档案',
    primaryAction: '进入用户工作台',
    primaryPath: '/student/workbench',
  },
  teacher: {
    label: '讲师账号',
    avatar: '师',
    name: '王讲师',
    className: 'AI创意美术教研组',
    subtitle: '管理授课、用户、课程库和项目报告',
    sectionTitle: '讲师课务中心',
    sectionDesc: '今日授课、点名、课程库和用户档案集中查看。',
    reportTitle: '项目报告发送记录',
    businessLabel: '课务内容',
    businessDesc: '授课、课程库与用户',
    primaryAction: '进入讲师端',
    primaryPath: '/teacher/workbench',
  },
  admin: {
    label: '管理员账号',
    avatar: '管',
    name: '管理员',
    className: '机构管理中心',
    subtitle: '查看账号、模型、积分和系统状态',
    sectionTitle: '系统管理概览',
    sectionDesc: '账号权限、模型配置、积分消耗和兑换码集中查看。',
    reportTitle: '系统与积分记录',
    businessLabel: '系统内容',
    businessDesc: '账号、模型与积分',
    primaryAction: '进入管理后台',
    primaryPath: '/admin',
  },
}

const roleMeta = computed(() => roleConfig[userStore.user?.role] || roleConfig.student)
// 头像和顶栏一致：头像字段是一两个字就用它，否则用名字第一个字（不再显示角色字）
const avatarText = computed(() => {
  const avatar = String(userStore.user?.avatar || '').trim()
  if (avatar && avatar.length <= 2) return avatar
  return String(userStore.user?.name || userStore.user?.account || roleMeta.value.name || '画').trim().slice(0, 1) || '画'
})
// 单个汉字当图标不好看：数据里还是原来的字，显示时换成对应的线条图标
const ICON_OF = { 览: DataBoard, 内: Files, 充: CreditCard, 分: Coin, 记: Lock, 课: Reading, 作: Picture, 报: Document, 库: Collection, 员: User, 账: Key, 模: Cpu, 码: Ticket, 统: DataAnalysis }
const iconOf = (ch) => ICON_OF[ch] || DataBoard
const homePath = computed(() => roleMeta.value.primaryPath)
const sectionTabs = computed(() => [
  { id: 'overview', label: '概览', desc: '关键数据和入口', icon: '览' },
  { id: 'business', label: roleMeta.value.businessLabel, desc: roleMeta.value.businessDesc, icon: '内' },
  { id: 'payment', label: '积分充值', desc: '档位和订单号', icon: '充' },
  { id: 'wallet', label: '我的积分', desc: '余额、免费额度和流水', icon: '分' },
  { id: 'records', label: '记录与安全', desc: '账单、消耗和账号', icon: '记' },
])
const summaryCards = computed(() => [
  { label: '积分余额', value: creditSummary.balance, note: `${difficultyStore.currentMeta.label} · ${difficultyStore.currentMeta.hint}` },
  { label: '素材数量', value: projectStore.projects.length, note: '个人素材库与生成项目' },
  { label: '课程数量', value: courseStore.authorizedCourses?.length || courseStore.courses.length, note: '已授权或已发布课程' },
  { label: '今日免费额度', value: creditSummary.freeRemaining, note: `共 ${creditSummary.freeTotal} 积分，每天 0 点重置` },
])
const roleCards = computed(() => {
  const role = userStore.user?.role || 'student'
  const maps = {
    student: [
      { icon: '课', title: '我的课程', desc: `${courseStore.authorizedCourses?.length || 0}门课程可学习，继续完成课堂任务。` },
      { icon: '作', title: '我的素材库', desc: `${projectStore.projects.length}个素材项目，含AI绘画、报告、视频和3D。` },
      { icon: '分', title: '我的积分', desc: `余额 ${creditSummary.balance} 积分，今日还剩 ${creditSummary.freeRemaining} 免费额度。` },
      { icon: '报', title: '项目报告', desc: '查看已生成的完整创作报告和分享记录。' },
    ],
    teacher: [
      { icon: '课', title: '今日授课', desc: '查看今日班级、点名记录和快速扣课入口。' },
      { icon: '库', title: '课程库', desc: `${courseStore.courses.length}门课程，支持视频、PPT、文档和题目管理。` },
      { icon: '员', title: '用户档案', desc: '查看用户作品、学习记录、请假和课时情况。' },
      { icon: '报', title: '报告发送', desc: '向用户端发送项目报告并追踪查看状态。' },
    ],
    admin: [
      { icon: '账', title: '账号权限', desc: '查看机构分部、班级、用户、讲师和管理员账号概况。' },
      { icon: '模', title: '模型状态', desc: '查看已接入模型、默认模型和AI网关状态。' },
      { icon: '码', title: '积分兑换码', desc: '生成、核对和导出积分码，处理用户付款记录。' },
      { icon: '统', title: '系统概览', desc: '查看平台运行状态、内容审核和API配置入口。' },
    ],
  }
  return maps[role] || maps.student
})
const quickActions = computed(() => roleCards.value.slice(0, 4))
const recentActivities = computed(() => {
  const role = userStore.user?.role || 'student'
  const maps = {
    student: [
      { type: '课程', title: '门头设计课学习进度已更新', time: '今天' },
      { type: '作品', title: '新增AI绘画项目草稿', time: '昨天' },
      { type: '积分', title: `今日免费额度剩余 ${creditSummary.freeRemaining} 积分`, time: '本周' },
    ],
    teacher: [
      { type: '授课', title: '今日课程待点名', time: '今天' },
      { type: '课件', title: '课程库文档解析记录已保存', time: '昨天' },
      { type: '报告', title: '用户端报告待发送', time: '本周' },
    ],
    admin: [
      { type: '模型', title: 'AI模型配置状态可查看', time: '今天' },
      { type: '积分', title: '积分兑换码待核对收款', time: '昨天' },
      { type: '账号', title: '分部账号权限待复核', time: '本周' },
    ],
  }
  return maps[role] || maps.student
})
const reportItems = computed(() => {
  const role = userStore.user?.role || 'student'
  const maps = {
    student: [
      { title: '奶茶店门头设计报告', status: '可查看' },
      { title: 'IP形象创作报告', status: '草稿' },
      { title: 'AI绘画生成历史', status: '已同步' },
    ],
    teacher: [
      { title: 'A班门头设计项目报告', status: '待发送' },
      { title: '课程库上传课件', status: '已归档' },
      { title: '用户档案更新', status: '进行中' },
    ],
    admin: [
      { title: '积分流水概览', status: `${creditLedger.value.length}条` },
      { title: '模型配置状态', status: 'Mock' },
      { title: '本月消耗积分', status: `${creditSummary.monthUsed} 积分` },
    ],
  }
  return maps[role] || maps.student
})
const freePercent = computed(() => {
  const total = Number(creditSummary.freeTotal || 0)
  if (!total) return 0
  const remaining = Math.max(0, Math.min(total, Number(creditSummary.freeRemaining || 0)))
  return Math.round((remaining / total) * 100)
})
const creditLedgerRows = computed(() => creditLedger.value.map((item) => ({
  id: item.id,
  title: ledgerTitle(item),
  amount: item.direction === 'out' ? -Number(item.amount || 0) : Number(item.amount || 0),
  time: formatTime(item.createdAt),
})))
const rechargeLedger = computed(() => {
  const items = creditLedgerRows.value.filter((item) => item.amount > 0)
  return items.length ? items : [{ id: 'empty-recharge', title: '暂无积分收入', amount: 0, time: '兑换积分码或后台加分后显示' }]
})
const usageLedger = computed(() => {
  const items = creditLedgerRows.value.filter((item) => item.amount < 0)
  return items.length ? items : [{ id: 'empty-usage', title: '暂无积分消耗', amount: 0, time: '生成图片后显示' }]
})
function ledgerTitle(item) {
  const kindMap = {
    recharge: '充值入账',
    redeem: '积分码兑换',
    admin_adjust: '讲师加分',
    consume: 'AI 创作消耗',
    refund: '失败退回',
    void: '积分码作废扣回',
  }
  return item.reason || kindMap[item.kind] || (item.direction === 'out' ? '积分消耗' : '积分入账')
}

async function loadAll() {
  void courseStore.load()
  try {
    const [summary, ledger] = await Promise.all([
      fetchCreditSummary(),
      fetchCreditLedger(40),
    ])
    if (summary) {
      creditSummary.balance = Number(summary.balance || 0)
      creditSummary.freeTotal = Number(summary.freeTotal ?? 60)
      creditSummary.freeUsed = Number(summary.freeUsed || 0)
      creditSummary.freeRemaining = Number(summary.freeRemaining || 0)
      creditSummary.monthUsed = Number(summary.monthUsed || 0)
    }
    creditLedger.value = Array.isArray(ledger?.entries) ? ledger.entries : []
  } catch (error) {
    // 未登录或演示模式下静默失败，不打断页面
    creditLedger.value = []
  }
}

function selectPack(pack) {
  selectedPackId.value = pack.id
  activeOrder.value = {
    id: pack.id,
    label: pack.label,
    yuan: pack.yuan,
    credits: pack.credits,
    orderNo: buildOrderNo(),
    createdAt: new Date().toISOString(),
  }
}

function buildOrderNo() {
  const now = new Date()
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand = String(Math.floor(Math.random() * 900) + 100)
  return `JF${stamp}${rand}`
}

function goRedeem() {
  activeSection.value = 'wallet'
  ElMessage.info('付款完成后把订单号发给讲师，收到积分码后在这里粘贴兑换')
}

async function copyOrderNo() {
  const no = activeOrder.value?.orderNo
  if (!no) return
  try {
    await navigator.clipboard.writeText(no)
    ElMessage.success('订单号已复制，发给讲师即可')
  } catch (error) {
    ElMessage.warning(`复制失败，请手动记下订单号：${no}`)
  }
}

function cancelOrder() {
  activeOrder.value = null
  selectedPackId.value = ''
}

async function doRedeem() {
  const code = String(redeemInput.value || '').trim().toUpperCase()
  if (!code) {
    ElMessage.warning('请先输入积分码')
    return
  }
  if (redeeming.value) return
  redeeming.value = true
  try {
    const result = await redeemCreditCode(code)
    ElMessage.success(`兑换成功，已到账 ${result.added} 积分`)
    redeemInput.value = ''
    await loadAll()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '兑换失败，请检查积分码是否正确或是否已被使用')
  } finally {
    redeeming.value = false
  }
}

function togglePanel(key) {
  openPanels[key] = !openPanels[key]
}

function handleQuickAction(item) {
  if (item.title.includes('充值')) {
    activeSection.value = 'payment'
    return
  }
  if (item.title.includes('积分')) {
    activeSection.value = 'wallet'
    return
  }
  activeSection.value = 'business'
}

function goBack() {
  router.push(homePath.value)
}

function logout() {
  userStore.logout()
  router.push('/login')
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return String(value || '刚刚')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

onMounted(loadAll)
</script>

<style scoped lang="scss">
.profile-page {
  width: min(1226px, calc(100vw - 32px));
  height: min(918px, calc(100dvh - var(--app-top, 0px) - 24px));
  min-height: 760px;
  margin: 12px auto;
  display: grid;
  /* 页内导航条去掉了（返回和标题在共用顶栏里），整页只剩内容这一行 */
  grid-template-rows: minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
}

.profile-topbar,
.profile-sidebar,
.content-panel {
  border: 1px solid #e5eaf1;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, .07);
}

.profile-topbar {
  /* 全站统一导航条 58px。原来 72px（标题下面还挂着「角色说明」小字、积分块和按钮都是 48 高），
     现在一行放平：返回 | 个人中心 | 积分余额 | 退出登录。 */
  min-height: 58px;
  padding: 0 14px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
}
/* 导航条里的按钮统一收到 34 高（下面那条 48 高的规则还要给页面内其它按钮用，所以只覆盖这一处） */
.profile-topbar .top-action {
  min-height: 34px;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 13px;
}

.top-title h1,
.top-title p,
.section-head h2,
.section-head p,
.subhead h3 {
  margin: 0;
}

.top-title h1 {
  color: #0f172a;
  font-size: 20px;
  line-height: 1.1;
  white-space: nowrap;
}

.top-title p,
.section-head p,
.activity-list small,
.quick-grid small,
.business-grid p,
.compact-list span,
.order-info p,
.order-info span,
.payment-empty p {
  color: #8a94a8;
  line-height: 1.45;
}

.top-token {
  /* 竖排「积分余额 / 数字」压成一行横排，58px 的条里才不顶高 */
  min-height: 34px;
  border-radius: 999px;
  background: #f5f3ff;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 7px;
}

.top-token span {
  color: #6c5ce7;
  font-size: 12px;
  font-weight: 900;
}

.top-token strong {
  color: #0f172a;
  font-size: 16px;
}

button {
  font: inherit;
}

.top-action,
.section-head button,
.side-token button,
.subhead button,
.package-card button,
.method-tabs button,
.pay-actions button,
.security-actions button {
  min-height: 48px;
  border: 0;
  border-radius: 12px;
  padding: 0 16px;
  font-weight: 900;
  cursor: pointer;
}

.top-action,
.section-head button,
.side-token button,
.subhead button {
  background: #f0eeff;
  color: #6c5ce7;
}

.top-action.danger,
.security-actions button {
  background: #f3f4f6;
  color: #475569;
}

.profile-shell {
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 14px;
}

.profile-sidebar {
  min-height: 0;
  padding: 14px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  overflow: hidden;
}

.identity-card {
  display: grid;
  justify-items: center;
  gap: 7px;
  text-align: center;
}

.avatar-ring {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  background: linear-gradient(135deg, #6c5ce7, #a594f9);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 32px;
  font-weight: 900;
}

.identity-card strong {
  color: #0f172a;
  font-size: 20px;
}

.identity-card span {
  color: #6c5ce7;
  font-weight: 900;
}

.identity-card p {
  margin: 0;
  color: #8a94a8;
  line-height: 1.45;
}

.profile-nav {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 10px;
  overflow-y: auto;
}

.profile-nav button {
  min-height: 64px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: #f8fafc;
  color: #334155;
  padding: 10px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;
}

.profile-nav button.active {
  border-color: rgba(108, 92, 231, .34);
  background: #f5f3ff;
  color: #6c5ce7;
}

.profile-nav span,
.quick-grid span,
.business-grid > article > span {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: #fff;
  color: #6c5ce7;
  display: grid;
  place-items: center;
  font-weight: 900;
}

.profile-nav strong {
  display: block;
  font-size: 15px;
}

.profile-nav small {
  color: #8a94a8;
  font-size: 12px;
}

.side-token {
  border-radius: 14px;
  background: #0f172a;
  color: #fff;
  padding: 14px;
  display: grid;
  gap: 8px;
}

.side-token span {
  color: #cbd5e1;
}

.side-token strong {
  font-size: 22px;
}

.profile-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.content-panel {
  height: 100%;
  padding: 16px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
}

.section-head,
.subhead {
  min-height: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.section-head h2 {
  color: #0f172a;
  font-size: 24px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-grid article,
.activity-card,
.quick-card,
.business-grid article,
.compact-report,
.accordion-card,
.package-card,
.payment-detail {
  border: 1px solid #e5eaf1;
  border-radius: 14px;
  background: #f8fafc;
}

.metric-grid article {
  min-height: 112px;
  padding: 14px;
  display: grid;
  gap: 7px;
}

.metric-grid span {
  color: #6c5ce7;
  font-weight: 900;
}

.metric-grid strong {
  color: #0f172a;
  font-size: 30px;
}

.metric-grid p {
  margin: 0;
  color: #8a94a8;
  line-height: 1.35;
}

.overview-panel {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.overview-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: .95fr 1.05fr;
  gap: 12px;
}

.activity-card,
.quick-card,
.compact-report {
  min-height: 0;
  padding: 14px;
  display: grid;
  align-content: start;
  gap: 12px;
}

.activity-list,
.compact-list,
.ledger-list {
  min-height: 0;
  display: grid;
  gap: 10px;
  overflow-y: auto;
}

.activity-list div,
.compact-list div,
.ledger-list article {
  min-height: 58px;
  border-radius: 12px;
  background: #fff;
  padding: 10px 12px;
  display: grid;
  gap: 3px;
}

.activity-list span {
  color: #6c5ce7;
  font-size: 12px;
  font-weight: 900;
}

.activity-list strong,
.quick-grid strong,
.business-grid strong,
.compact-list strong,
.ledger-list strong,
.package-card strong,
.order-info strong,
.payment-empty strong {
  color: #0f172a;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quick-grid button {
  min-height: 108px;
  border: 0;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 7px;
  text-align: left;
  cursor: pointer;
}

.business-panel {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.business-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.business-grid article {
  min-height: 142px;
  padding: 14px;
  display: grid;
  align-content: start;
  gap: 10px;
}

.business-grid p {
  margin: 6px 0 0;
}

.compact-report {
  overflow: hidden;
}

.compact-list div {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.payment-panel {
  grid-template-rows: auto minmax(0, 1fr);
}

.pay-status {
  min-height: 34px;
  border-radius: 999px;
  padding: 7px 12px;
  background: #eff6ff;
  color: #1260b3;
  font-weight: 900;
}

.payment-workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 318px;
  gap: 14px;
}

.package-list {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
  align-items: start;
  overflow-y: auto;
}

.package-card {
  min-height: 160px;
  padding: 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-content: start;
}

.package-card.active {
  border-color: rgba(108, 92, 231, .42);
  background: #f5f3ff;
}

.package-card > div {
  min-width: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
}

.package-card > div p {
  flex: 0 0 100%;
}

.package-card span {
  color: #6c5ce7;
  font-weight: 900;
}

.package-card p {
  margin: 7px 0 0;
  color: #8a94a8;
  line-height: 1.45;
}

.package-card em {
  color: #6c5ce7;
  font-size: 24px;
  font-style: normal;
  font-weight: 900;
}

.package-card button {
  grid-column: 1 / -1;
  background: #6c5ce7;
  color: #fff;
}

.payment-detail {
  min-height: 0;
  padding: 14px;
  display: grid;
  align-content: start;
  gap: 12px;
  background: #f8fafc;
}

.payment-empty {
  min-height: 280px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
}

.method-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.method-tabs button {
  background: #fff;
  color: #475569;
}

.method-tabs button.active {
  background: #f0eeff;
  color: #6c5ce7;
}

.pay-guide {
  border: 1px dashed #d9d3fb;
  border-radius: 14px;
  background: #f9f8ff;
  padding: 16px 14px;
  display: grid;
  justify-items: center;
  gap: 7px;
  text-align: center;
}

.pay-guide-mark {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #f0eeff;
  color: #6c5ce7;
  font-size: 18px;
  font-weight: 900;
  display: grid;
  place-items: center;
}

.pay-guide strong {
  color: #0f172a;
  font-size: 14px;
}

.pay-guide p {
  margin: 0;
  color: #8a94a8;
  font-size: 12px;
  line-height: 1.7;
  max-width: 260px;
}

.order-info {
  display: grid;
  gap: 5px;
  text-align: center;
}

.order-info p,
.order-info span,
.payment-empty p {
  margin: 0;
}

.order-info .order-no {
  color: #0f172a;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: .04em;
}

.order-info .order-copy {
  justify-self: center;
  height: 28px;
  min-height: 0;
  padding: 0 14px;
  border: 1px solid #d9d3fb;
  border-radius: 999px;
  background: #fff;
  color: #6c5ce7;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.pay-actions {
  display: grid;
  gap: 8px;
}

.pay-actions button:first-child {
  background: #6c5ce7;
  color: #fff;
}

.pay-actions button:nth-child(2) {
  background: #eef2f7;
  color: #475569;
}

.pay-actions button:disabled {
  cursor: not-allowed;
  opacity: .46;
}

.records-panel {
  grid-template-rows: auto minmax(0, 1fr);
}

.accordion-stack {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 12px;
  overflow-y: auto;
}

.accordion-card {
  padding: 0;
  overflow: hidden;
}

.accordion-head {
  width: 100%;
  min-height: 58px;
  border: 0;
  background: #fff;
  color: #0f172a;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.accordion-head span {
  color: #6c5ce7;
  font-weight: 900;
}

.ledger-list {
  max-height: 260px;
  padding: 0 14px 14px;
}

.ledger-list article {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.ledger-list article > div {
  min-width: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.ledger-list span {
  color: #8a94a8;
  font-size: 12px;
  font-weight: 700;
}

.ledger-list em {
  color: #dc2626;
  font-style: normal;
  font-weight: 900;
}

.ledger-list em.positive {
  color: #16a34a;
}

.security-actions {
  padding: 0 14px 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

/* ---------- 我的积分板块 ---------- */

.wallet-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 14px;
}

.wallet-metrics {
  padding: 0 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.wallet-metric {
  border: 1px solid #e8edf4;
  border-radius: 14px;
  background: #fbfcfe;
  padding: 14px;
  display: grid;
  grid-template-columns: auto auto;
  align-content: start;
  gap: 2px 6px;
}

.wallet-metric.main {
  border-color: #d4cdf7;
  background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 70%);
}

.wallet-metric span {
  grid-column: 1 / -1;
  color: #8a94a8;
  font-size: 12px;
  font-weight: 800;
}

.wallet-metric strong {
  color: #0f172a;
  font-size: 30px;
  line-height: 1.1;
}

.wallet-metric.main strong {
  color: #5b4bd6;
}

.wallet-metric em {
  align-self: end;
  padding-bottom: 4px;
  color: #8a94a8;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.wallet-metric .free-bar {
  grid-column: 1 / -1;
  margin-top: 10px;
}

.free-bar {
  height: 8px;
  border-radius: 999px;
  background: #eef1f6;
  overflow: hidden;
}

.free-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #b9b0f7 0%, #6c5ce7 100%);
  transition: width .25s ease;
}

.code-redeem {
  margin: 0 14px;
  border: 1px dashed #b9b0f7;
  border-radius: 14px;
  background: #f9f8ff;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.code-redeem-head strong {
  color: #0f172a;
  font-size: 15px;
}

.code-redeem-head p {
  margin: 4px 0 0;
  color: #8a94a8;
  font-size: 13px;
  line-height: 1.45;
}

.code-redeem-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  gap: 10px;
}

.code-redeem-row input {
  min-height: 44px;
  border: 1px solid #e5eaf1;
  border-radius: 12px;
  background: #fff;
  padding: 0 14px;
  color: #0f172a;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
  outline: none;
}

.code-redeem-row input:focus {
  border-color: #6c5ce7;
  box-shadow: 0 0 0 3px rgba(108, 92, 231, .12);
}

.code-redeem-row button {
  min-height: 44px;
  border: 0;
  border-radius: 12px;
  background: #6c5ce7;
  color: #fff;
  font-weight: 900;
  cursor: pointer;
}

.code-redeem-row button:disabled {
  background: #b9b0f7;
  cursor: not-allowed;
}

.wallet-ledger {
  min-height: 0;
  /* 记录少时按内容高，不跟着面板剩余高度一起拉伸；记录多时封顶到面板高度并内部滚动 */
  align-self: start;
  max-height: 100%;
  margin: 0 14px 14px;
  border: 1px solid #e8edf4;
  border-radius: 14px;
  background: #fbfcfe;
  padding: 12px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
}

.wallet-ledger .subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wallet-ledger .subhead span {
  color: #8a94a8;
  font-size: 12px;
  font-weight: 800;
}

.wallet-ledger .ledger-list {
  max-height: none;
  padding: 0;
  /* 记录少时贴顶排列，不要被 grid 拉伸到卡片全高、内容居中悬空 */
  align-content: start;
  /* 记录多时内部滚动，滚动条常显，让用户看得出下面还有 */
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

.wallet-ledger .ledger-list::-webkit-scrollbar {
  width: 6px;
}

.wallet-ledger .ledger-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #cbd5e1;
}

.wallet-ledger .ledger-list::-webkit-scrollbar-track {
  background: transparent;
}

.wallet-empty {
  min-height: 58px;
  border-radius: 12px;
  background: #fff;
  color: #a3adc0;
  display: grid;
  place-items: center;
  font-size: 13px;
}

@media (max-width: 980px) {
  .profile-page {
    width: calc(100vw - 20px);
    height: auto;
    min-height: calc(100dvh - var(--app-top, 0px));
    overflow: visible;
  }

  .profile-topbar {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .top-token {
    display: none;
  }

  .profile-shell,
  .overview-layout,
  .payment-workspace {
    grid-template-columns: 1fr;
  }

  .profile-sidebar,
  .content-panel {
    overflow: visible;
  }

  .metric-grid,
  .business-grid,
  .package-list,
  .security-actions,
  .wallet-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .code-redeem-row {
    grid-template-columns: 1fr;
  }
}
/* 单字图标换成线条图标后：图标居中、大小统一 */
.icon-tile { display: inline-grid; place-items: center; }
.icon-tile .el-icon { font-size: 18px; }
</style>
