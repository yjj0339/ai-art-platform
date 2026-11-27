// 后台「操作日志」（2026-11-27）：只读，查本机构的两类记录。
//   1. 操作记录：audit_logs 表（登录 / 退出、积分调整、风控操作、内容和配置的增删改……各处已经在写，之前后台没地方看）
//   2. 积分流水：credit_ledger 表（每一笔扣分、退款、管理员调整、积分码兑换）
// 只有管理员能看，只看自己机构的。不返回 IP、请求内容、提示词原文、密码之类的信息（这两张表本来也不存）。
import { query } from './db.js'

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode })
}

function assertAdmin(user) {
  if (!user || user.role !== 'admin' || !user.organization?.id) throw fail('只有管理员可以查看操作日志。', 403)
  return user.organization.id
}

function pageParams(params) {
  const days = Math.min(90, Math.max(1, Math.round(Number(params.days) || 7)))
  const page = Math.max(1, Math.round(Number(params.page) || 1))
  const pageSize = Math.min(100, Math.max(10, Math.round(Number(params.pageSize) || 20)))
  return { days, page, pageSize }
}

function likeValue(keyword) {
  return `%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

function userView(id, account, name, role) {
  return id ? { id, account: account || '', name: name || '', role: role || '' } : null
}

// ---------------------------------------------------------------------------
// 操作记录
// ---------------------------------------------------------------------------

export const LOG_CATEGORIES = [
  { id: 'auth', label: '登录', prefixes: ['auth.'] },
  { id: 'account', label: '账号', prefixes: ['account.'] },
  { id: 'credit', label: '积分', prefixes: ['credit.'] },
  { id: 'risk', label: '风控', prefixes: ['risk.'] },
  { id: 'config', label: '配置', prefixes: ['ai_skill.', 'agent_skill.', 'h5_workflow.', 'image_style.', 'course.'] },
  { id: 'content', label: '作品', prefixes: ['document.', 'asset.', 'gallery.'] },
  { id: 'ai', label: 'AI 任务', prefixes: ['ai_task.'] },
]

const ACTION_LABELS = {
  'auth.login': '登录',
  'auth.logout': '退出登录',
  'account.password_reset': '重置密码',
  'credit.adjust': '调整积分',
  'credit.save_prices': '修改计费设置',
  'risk.settings.update': '修改风控设置',
  'risk.ban.create': '封禁账号',
  'risk.ban.auto': '自动封禁',
  'risk.ban.lift': '解除封禁',
  'risk.login.unlock': '解除登录锁定',
  'risk.login.unlock_network': '解除网络锁定',
  'risk.rules.create': '新增风控规则',
  'risk.rules.update': '修改风控规则',
  'risk.rules.delete': '删除风控规则',
  'risk.words.add': '添加违禁词',
  'risk.words.update': '修改违禁词',
  'risk.words.delete': '删除违禁词',
  'risk.words.export': '导出违禁词',
  'risk.events.handle': '处理风控事件',
  'ai_skill.create': '新建 AI 玩法',
  'ai_skill.delete': '删除 AI 玩法',
  'ai_skill.publish': '发布 AI 玩法',
  'ai_skill.status': '上下架 AI 玩法',
  'ai_skill.test_passed': 'AI 玩法测试通过',
  'agent_skill.import': '导入技能',
  'agent_skill.delete': '删除技能',
  'agent_skill.status': '修改技能状态',
  'h5_workflow.publish': '发布 H5 报告工作流',
  'h5_workflow.test_passed': 'H5 工作流测试通过',
  'image_style.panel_settings': '修改风格面板设置',
  'course.create': '新建课程',
  'course.assign': '授权课程',
  'document.create': '新建作品',
  'document.update': '保存作品',
  'asset.create': '上传素材',
  'ai_task.create': '提交 AI 生成',
}

const RESOURCE_LABELS = {
  canvas: '画布', draft: '草稿', 'video-draft': '视频草稿', project: '项目', sketch: '草图', 'course-learning': '课程学习',
  image: '出图', video: '视频', model3d: '3D 模型', asset: '素材',
}

const STATUS_LABELS = { published: '已发布', draft: '草稿', offline: '已下架', enabled: '启用', disabled: '停用' }
const BAN_SCOPE_LABELS = { all: '全部功能', ai: 'AI 功能', chat: '聊天', login: '登录' }

function categoryOf(action) {
  return LOG_CATEGORIES.find((item) => item.prefixes.some((p) => action.startsWith(p))) || { id: 'other', label: '其他' }
}

function clip(text, max = 40) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

// 把 detail 里常见的字段翻成一句人话；认不出来的就留空，不把原始 JSON 甩给管理员看
function summarize(action, resourceType, d) {
  const detail = d && typeof d === 'object' ? d : {}
  const parts = []
  if (action === 'credit.adjust') {
    const delta = Number(detail.delta) || 0
    parts.push(`${delta > 0 ? '+' : ''}${delta} 分`)
    if (detail.reason) parts.push(clip(detail.reason))
  } else if (action === 'credit.save_prices') {
    if (detail.abilities) parts.push(`${detail.abilities} 类能力`)
    if (detail.modelPrices) parts.push(`${detail.modelPrices} 个模型单价`)
    if (detail.messages) parts.push('提示文字')
  } else if (action === 'risk.ban.create' || action === 'risk.ban.auto') {
    if (detail.scope) parts.push(`限制：${BAN_SCOPE_LABELS[detail.scope] || detail.scope}`)
    if (detail.minutes) parts.push(`${detail.minutes} 分钟`)
    if (detail.reason) parts.push(clip(detail.reason))
  } else if (action === 'ai_task.create' || action.startsWith('document.')) {
    if (RESOURCE_LABELS[resourceType]) parts.push(RESOURCE_LABELS[resourceType])
  } else {
    if (detail.title) parts.push(clip(detail.title))
    if (detail.name) parts.push(clip(detail.name))
    if (detail.word) parts.push(clip(detail.word, 20))
    if (detail.slug) parts.push(detail.slug)
    if (detail.status) parts.push(STATUS_LABELS[detail.status] || detail.status)
    if (detail.from && detail.to) parts.push(`${STATUS_LABELS[detail.from] || detail.from} → ${STATUS_LABELS[detail.to] || detail.to}`)
    if (detail.versionNumber) parts.push(`第 ${detail.versionNumber} 版`)
    if (detail.imported != null) parts.push(`导入 ${detail.imported} 个`)
    if (detail.added) parts.push(`新增 ${detail.added} 个`)
    if (detail.count && !parts.length) parts.push(`${detail.count} 条`)
    if (detail.cleared) parts.push(`清除 ${detail.cleared} 条`)
    if (detail.reason && !parts.includes(clip(detail.reason))) parts.push(clip(detail.reason))
  }
  return parts.filter(Boolean).join(' · ')
}

export async function listOperationLogs(user, params = {}) {
  const organizationId = assertAdmin(user)
  const { days, page, pageSize } = pageParams(params)
  const where = ['a.organization_id = $1', 'a.created_at > now() - make_interval(days => $2)']
  const values = [organizationId, days]
  const category = LOG_CATEGORIES.find((item) => item.id === params.category)
  if (category) {
    const ors = category.prefixes.map((p) => { values.push(`${p}%`); return `a.action LIKE $${values.length}` })
    where.push(`(${ors.join(' OR ')})`)
  }
  const keyword = String(params.keyword || '').trim().slice(0, 50)
  if (keyword) {
    values.push(likeValue(keyword))
    const k = `$${values.length}`
    where.push(`(actor.account ILIKE ${k} OR actor.display_name ILIKE ${k} OR target.account ILIKE ${k} OR target.display_name ILIKE ${k})`)
  }
  const from = `FROM audit_logs a
    LEFT JOIN users actor ON actor.id = a.actor_user_id
    LEFT JOIN users target ON a.resource_type = 'user' AND target.id = a.resource_id AND target.organization_id = a.organization_id`
  const whereSql = where.join(' AND ')
  const [rows, total, stats] = await Promise.all([
    query(
      `SELECT a.id, a.action, a.resource_type, a.resource_id, a.detail, a.created_at,
              actor.id AS actor_id, actor.account AS actor_account, actor.display_name AS actor_name, actor.role AS actor_role,
              target.id AS target_id, target.account AS target_account, target.display_name AS target_name
       ${from} WHERE ${whereSql} ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      values,
    ),
    query(`SELECT count(*)::int AS n ${from} WHERE ${whereSql}`, values),
    query(
      `SELECT
         count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
         count(*) FILTER (WHERE action = 'auth.login' AND created_at >= date_trunc('day', now()))::int AS logins_today,
         count(*) FILTER (WHERE action LIKE 'risk.%' AND created_at > now() - interval '7 days')::int AS risk_week,
         count(*) FILTER (WHERE action = 'credit.adjust' AND created_at > now() - interval '7 days')::int AS adjust_week
       FROM audit_logs WHERE organization_id = $1 AND created_at > now() - interval '8 days'`,
      [organizationId],
    ),
  ])
  const s = stats.rows[0] || {}
  return {
    items: rows.rows.map((row) => {
      const cat = categoryOf(row.action)
      return {
        id: row.id,
        createdAt: row.created_at,
        action: row.action,
        actionLabel: ACTION_LABELS[row.action] || row.action,
        category: cat.id,
        categoryLabel: cat.label,
        actor: userView(row.actor_id, row.actor_account, row.actor_name, row.actor_role),
        target: userView(row.target_id, row.target_account, row.target_name, ''),
        summary: summarize(row.action, row.resource_type, row.detail),
      }
    }),
    total: total.rows[0].n,
    page,
    pageSize,
    days,
    categories: LOG_CATEGORIES.map(({ id, label }) => ({ id, label })),
    stats: { today: s.today || 0, loginsToday: s.logins_today || 0, riskWeek: s.risk_week || 0, adjustWeek: s.adjust_week || 0 },
  }
}

// ---------------------------------------------------------------------------
// 积分流水
// ---------------------------------------------------------------------------

const LEDGER_KIND_LABELS = { consume: '消耗', refund: '退回', admin_adjust: '管理员调整', redeem: '积分码兑换', void: '积分码作废' }
const BIZ_LABELS = {
  'ai-image': 'AI 绘画出图', 'ai-video': 'AI 视频', 'ai-model3d': 'AI 3D 模型', 'h5-report': 'H5 报告',
  'agent-image': 'AI 伙伴出图', 'agent-video': 'AI 伙伴视频', 'agent-turn': 'AI 伙伴聊天', 'agent-skill': '技能玩法',
  credit_code: '积分码',
}

export async function listCreditLedgerLogs(user, params = {}) {
  const organizationId = assertAdmin(user)
  const { days, page, pageSize } = pageParams(params)
  const where = ['l.organization_id = $1', 'l.created_at > now() - make_interval(days => $2)']
  const values = [organizationId, days]
  if (LEDGER_KIND_LABELS[params.kind]) { values.push(params.kind); where.push(`l.kind = $${values.length}`) }
  if (BIZ_LABELS[params.biz]) { values.push(params.biz); where.push(`l.biz_type = $${values.length}`) }
  const keyword = String(params.keyword || '').trim().slice(0, 50)
  if (keyword) {
    values.push(likeValue(keyword))
    where.push(`(u.account ILIKE $${values.length} OR u.display_name ILIKE $${values.length})`)
  }
  const from = `FROM credit_ledger l
    LEFT JOIN users u ON u.id = l.user_id
    LEFT JOIN users op ON op.id = l.operator_user_id`
  const whereSql = where.join(' AND ')
  const [rows, total, sums] = await Promise.all([
    query(
      `SELECT l.*, u.account AS user_account, u.display_name AS user_name, u.role AS user_role,
              op.account AS op_account, op.display_name AS op_name, op.role AS op_role
       ${from} WHERE ${whereSql} ORDER BY l.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      values,
    ),
    query(`SELECT count(*)::int AS n ${from} WHERE ${whereSql}`, values),
    // 汇总跟着当前筛选走：管理员筛了某个人 / 某种用途，看到的就是这部分的合计
    query(
      `SELECT
         COALESCE(sum(l.from_wallet) FILTER (WHERE l.kind = 'consume'), 0)::int AS consumed,
         COALESCE(sum(l.from_free) FILTER (WHERE l.kind = 'consume'), 0)::int AS free_used,
         COALESCE(sum(l.from_wallet) FILTER (WHERE l.kind = 'refund'), 0)::int AS refunded,
         COALESCE(sum(CASE WHEN l.direction = 'in' THEN l.amount ELSE -l.amount END) FILTER (WHERE l.kind IN ('admin_adjust','redeem','void')), 0)::int AS granted
       ${from} WHERE ${whereSql}`,
      values,
    ),
  ])
  const s = sums.rows[0] || {}
  return {
    items: rows.rows.map((row) => {
      const operatorIsSelf = row.operator_user_id && row.operator_user_id === row.user_id
      return {
        id: row.id,
        createdAt: row.created_at,
        user: userView(row.user_id, row.user_account, row.user_name, row.user_role),
        kind: row.kind,
        kindLabel: LEDGER_KIND_LABELS[row.kind] || row.kind,
        bizType: row.biz_type,
        bizLabel: BIZ_LABELS[row.biz_type] || (row.kind === 'admin_adjust' ? '后台调整' : row.biz_type || '—'),
        // 带正负号的余额变动：进账为正，扣分为负。消耗 / 退回的 amount 可能含「赠送额度」那部分，真正动余额的是 from_wallet
        change: (row.direction === 'in' ? 1 : -1) * (row.kind === 'consume' || row.kind === 'refund' ? row.from_wallet : row.amount),
        fromFree: row.from_free,
        balanceAfter: row.balance_after,
        reason: clip(row.reason, 60),
        operator: operatorIsSelf ? null : userView(row.operator_user_id, row.op_account, row.op_name, row.op_role),
      }
    }),
    total: total.rows[0].n,
    page,
    pageSize,
    days,
    kinds: Object.entries(LEDGER_KIND_LABELS).map(([id, label]) => ({ id, label })),
    bizTypes: Object.entries(BIZ_LABELS).map(([id, label]) => ({ id, label })),
    sums: { consumed: s.consumed || 0, freeUsed: s.free_used || 0, refunded: s.refunded || 0, granted: s.granted || 0 },
  }
}
