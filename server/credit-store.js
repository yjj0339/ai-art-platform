import { randomBytes, randomInt } from 'node:crypto'
import { withTransaction, withUserContext } from './db.js'
import { logAudit } from './auth.js'

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function httpError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

// 码字符集：去掉易混字符 0 O 1 l I
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomCodeBlock(len = 4) {
  let out = ''
  for (let i = 0; i < len; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

function makeCode(prefix = '') {
  const p = String(prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  const body = `${randomCodeBlock(4)}-${randomCodeBlock(4)}-${randomCodeBlock(4)}`
  return p ? `${p}-${body}` : body
}

function mapLedgerRow(row) {
  return {
    id: row.id,
    direction: row.direction,
    amount: row.amount,
    fromFree: row.from_free,
    fromWallet: row.from_wallet,
    kind: row.kind,
    bizType: row.biz_type,
    bizId: row.biz_id,
    balanceAfter: row.balance_after,
    reason: row.reason,
    operatorUserId: row.operator_user_id,
    createdAt: row.created_at,
  }
}

function mapCodeRow(row) {
  return {
    id: row.id,
    code: row.code,
    faceValue: row.face_value,
    status: row.status,
    orderNo: row.order_no,
    note: row.note,
    batchId: row.batch_id,
    redeemedByUserId: row.redeemed_by_user_id,
    redeemedAt: row.redeemed_at,
    confirmedAt: row.confirmed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

// ---------- 基础：钱包 / 日额度 / 价目 ----------

/**
 * 五类会计费的能力。
 * ability 是稳定键（写进数据库和流水），label/unit 只影响后台和学生端怎么叫。
 * priceCode 指向 credit_prices 里的「能力兜底价」那一行。
 */
export const CREDIT_ABILITIES = [
  { ability: 'image', label: '出图', unit: '张', priceCode: 'image_basic', dailyFree: 8, credits: 5, sort: 10 },
  { ability: 'video', label: '视频', unit: '个', priceCode: 'video_clip', dailyFree: 1, credits: 30, sort: 20 },
  { ability: 'model3d', label: '3D 模型', unit: '个', priceCode: 'model3d', dailyFree: 1, credits: 20, sort: 30 },
  { ability: 'report_h5', label: 'H5 报告', unit: '份', priceCode: 'report_h5', dailyFree: 1, credits: 40, sort: 40 },
  { ability: 'ai_text', label: 'AI 文字', unit: '次', priceCode: 'ai_text', dailyFree: 5, credits: 2, sort: 50 },
]

export const CREDIT_ABILITY_MAP = new Map(CREDIT_ABILITIES.map((item) => [item.ability, item]))

/**
 * 后台可改的提示文案。键名固定，文案随便改；{} 里的占位符由前端/服务端替换。*/
export const CREDIT_MESSAGE_DEFAULTS = {
  freeExhausted: '今日免费{ability}次数已用完，本次将扣 {credits} 积分（当前余额 {balance}）。继续生成？',
  notEnough: '积分不够了，还需 {shortfall} 分，请联系管理员充值。',
  failedRefund: '生成失败，已退回 {credits} 积分。',
  noBalance: '积分不足，请联系管理员充值后再试。',
  rechargeGuide: '请向管理员索取收款码，付款后把订单号发给管理员即可拿到积分码。',
  redeemSuccess: '兑换成功，已到账 {credits} 积分。',
}

const CREDIT_MESSAGE_KEYS = Object.keys(CREDIT_MESSAGE_DEFAULTS)

function normalizeAbility(value) {
  const key = String(value || '').trim()
  return CREDIT_ABILITY_MAP.has(key) ? key : ''
}

function mapPriceRow(row) {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    credits: row.credits,
    status: row.status,
    ability: row.ability || 'image',
    provider: row.provider || '',
    model: row.model || '',
    dailyFree: row.daily_free || 0,
    sortOrder: row.sort_order || 0,
  }
}

/**
 * 保证五类能力的兜底价都存在。
 * 老机构升级上来只有 image_basic / video_clip / report_h5 三行，缺的两类在这里补。
 */
export async function ensureAbilityPrices(client, organizationId) {
  for (const item of CREDIT_ABILITIES) {
    await client.query(
      `INSERT INTO credit_prices
         (id, organization_id, code, label, credits, sort_order, ability, provider, model, daily_free)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'','',$8)
       ON CONFLICT (organization_id, code) DO NOTHING`,
      [
        `cp_${organizationId}_${item.priceCode}`, organizationId, item.priceCode,
        item.label, item.credits, item.sort, item.ability, item.dailyFree,
      ],
    )
  }
}

export async function ensureWallet(client, organizationId, userId) {
  await client.query(
    `INSERT INTO credit_wallets (organization_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
    [organizationId, userId],
  )
}

export async function ensureDailyQuota(client, organizationId, userId, total = 60) {
  await client.query(
    `INSERT INTO credit_daily_quota (organization_id, user_id, grant_date, free_total, free_used)
     VALUES ($1, $2, CURRENT_DATE, $3, 0)
     ON CONFLICT (organization_id, user_id, grant_date) DO NOTHING`,
    [organizationId, userId, total],
  )
}

async function getPrice(client, organizationId, code) {
  const result = await client.query(
    `SELECT credits, label, ability, provider, model, daily_free FROM credit_prices
     WHERE organization_id = $1 AND code = $2 AND status = 'enabled'
     LIMIT 1`,
    [organizationId, code],
  )
  if (!result.rows[0]) throw httpError('价目不存在或已停用。', 400)
  return result.rows[0]
}

/**
 * 按「能力 + 供应商 + 模型」查实际单价，三级回落：
 *   1) 该模型单独定价的行（provider/model 都匹配）
 *   2) 该模型的「跨供应商」定价行（只匹配 model）
 *   3) 该能力的兜底价（provider/model 都为空）
 * 查不到就退回代码里的默认值，绝不让计价失败把生成卡住。
 */
async function resolveAbilityPrice(client, organizationId, { ability, provider = '', model = '' }) {
  const meta = CREDIT_ABILITY_MAP.get(normalizeAbility(ability))
  if (!meta) throw httpError('未知的计费能力。', 400)
  const modelKeys = []
  if (model) {
    if (provider) modelKeys.push({ provider, model })
    modelKeys.push({ provider: '', model })
  }
  for (const key of modelKeys) {
    const hit = await client.query(
      `SELECT credits, label, daily_free FROM credit_prices
       WHERE organization_id=$1 AND ability=$2 AND provider=$3 AND model=$4 AND status='enabled'
       LIMIT 1`,
      [organizationId, meta.ability, key.provider, key.model],
    )
    if (hit.rows[0]) {
      return {
        ability: meta.ability, label: hit.rows[0].label || meta.label,
        credits: toInt(hit.rows[0].credits, meta.credits),
        dailyFree: toInt(hit.rows[0].daily_free, meta.dailyFree),
        matched: 'model',
      }
    }
  }
  const fallback = await client.query(
    `SELECT credits, label, daily_free FROM credit_prices
     WHERE organization_id=$1 AND ability=$2 AND provider='' AND model='' AND status='enabled'
     LIMIT 1`,
    [organizationId, meta.ability],
  )
  return {
    ability: meta.ability,
    label: fallback.rows[0]?.label || meta.label,
    credits: toInt(fallback.rows[0]?.credits, meta.credits),
    dailyFree: toInt(fallback.rows[0]?.daily_free, meta.dailyFree),
    matched: 'ability',
  }
}

async function readCreditSettings(client, organizationId) {
  const result = await client.query(
    'SELECT settings FROM credit_settings WHERE organization_id = $1',
    [organizationId],
  )
  const stored = result.rows[0]?.settings || {}
  const messages = {}
  for (const key of CREDIT_MESSAGE_KEYS) {
    const value = String(stored.messages?.[key] ?? '').trim()
    messages[key] = value || CREDIT_MESSAGE_DEFAULTS[key]
  }
  return { messages }
}

async function readWallet(client, organizationId, userId) {
  const result = await client.query(
    `SELECT balance, total_recharged, total_consumed FROM credit_wallets
     WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId],
  )
  return result.rows[0] || { balance: 0, total_recharged: 0, total_consumed: 0 }
}

// ---------- 用户侧 ----------

export async function getSummary(user) {
  const organizationId = user.organization.id
  return withTransaction(async (client) => {
    await ensureWallet(client, organizationId, user.id)
    await ensureAbilityPrices(client, organizationId)
    const wallet = await readWallet(client, organizationId, user.id)
    const month = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS used FROM credit_ledger
       WHERE organization_id = $1 AND user_id = $2 AND kind = 'consume'
         AND created_at >= date_trunc('month', now())`,
      [organizationId, user.id],
    )
    const prices = await client.query(
      `SELECT code, label, credits, status, ability, provider, model, daily_free FROM credit_prices
       WHERE organization_id = $1 AND status = 'enabled' ORDER BY sort_order`,
      [organizationId],
    )
    const usage = await client.query(
      `SELECT ability, free_total, free_used, paid_count FROM credit_usage_daily
       WHERE organization_id = $1 AND user_id = $2 AND usage_date = CURRENT_DATE`,
      [organizationId, user.id],
    )
    const usageByAbility = new Map(usage.rows.map((row) => [row.ability, row]))
    const priceRows = prices.rows.map(mapPriceRow)

    // 每类能力的「今天白送几次、用了几次、用完扣多少」——学生端直接照着渲染进度条。
    const abilities = CREDIT_ABILITIES.map((meta) => {
      const row = priceRows.find((r) => r.ability === meta.ability && !r.provider && !r.model)
      const used = usageByAbility.get(meta.ability)
      const freeTotal = used?.free_total ?? (row ? row.dailyFree : meta.dailyFree)
      const freeUsed = used?.free_used ?? 0
      return {
        ability: meta.ability,
        label: meta.label,
        unit: meta.unit,
        credits: row ? row.credits : meta.credits,
        dailyFree: freeTotal,
        freeUsed,
        freeRemaining: Math.max(0, freeTotal - freeUsed),
        paidCount: used?.paid_count ?? 0,
        enabled: !row || row.status === 'enabled',
      }
    })

    // 老的「60 积分/天」字段继续返回，避免已发布的前端页面直接白屏；
    // 数值改成五类赠送次数之和，语义变为「今天总共还有几次白送」。
    const freeTotal = abilities.reduce((sum, item) => sum + item.dailyFree, 0)
    const freeUsed = abilities.reduce((sum, item) => sum + item.freeUsed, 0)

    return {
      balance: wallet.balance,
      totalRecharged: wallet.total_recharged,
      totalConsumed: wallet.total_consumed,
      freeTotal,
      freeUsed,
      freeRemaining: Math.max(0, freeTotal - freeUsed),
      monthUsed: toInt(month.rows[0]?.used, 0),
      abilities,
      messages: (await readCreditSettings(client, organizationId)).messages,
      prices: priceRows
        .filter((row) => !row.provider && !row.model)
        .map((row) => ({ code: row.code, label: row.label, credits: row.credits, ability: row.ability })),
      modelPrices: priceRows
        .filter((row) => row.provider || row.model)
        .map((row) => ({ ability: row.ability, provider: row.provider, model: row.model, credits: row.credits })),
    }
  })
}

export async function listLedger(user, { limit = 50, before = '' } = {}) {
  const organizationId = user.organization.id
  const capped = Math.min(Math.max(toInt(limit, 50), 1), 200)
  const params = [organizationId, user.id]
  let cursorSql = ''
  if (before) {
    params.push(before)
    cursorSql = ` AND created_at < $${params.length}`
  }
  const result = await withUserContext(user, (client) => client.query(
    `SELECT * FROM credit_ledger
     WHERE organization_id = $1 AND user_id = $2${cursorSql}
     ORDER BY created_at DESC LIMIT ${capped}`,
    params,
  ))
  return { entries: result.rows.map(mapLedgerRow) }
}

export async function redeemCode(user, rawCode) {
  const organizationId = user.organization.id
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) throw httpError('请输入积分码。', 400)
  return withTransaction(async (client) => {
    const found = await client.query(
      `SELECT * FROM credit_codes
       WHERE organization_id = $1 AND code = $2 FOR UPDATE`,
      [organizationId, code],
    )
    const row = found.rows[0]
    if (!row) throw httpError('积分码不存在。', 404)
    if (row.status === 'void') throw httpError('该积分码已作废。', 400)
    if (row.status !== 'issued') throw httpError('该积分码已被使用。', 409)
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      throw httpError('该积分码已过期。', 400)
    }
    await ensureWallet(client, organizationId, user.id)
    const wallet = await client.query(
      `SELECT * FROM credit_wallets WHERE organization_id = $1 AND user_id = $2 FOR UPDATE`,
      [organizationId, user.id],
    )
    const nextBalance = wallet.rows[0].balance + row.face_value
    await client.query(
      `UPDATE credit_wallets
         SET balance = balance + $3, total_recharged = total_recharged + $3, updated_at = now()
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, user.id, row.face_value],
    )
    await client.query(
      `UPDATE credit_codes
         SET status = 'redeemed', redeemed_by_user_id = $3, redeemed_at = now()
       WHERE id = $1 AND organization_id = $2`,
      [row.id, organizationId, user.id],
    )
    const ledger = await client.query(
      `INSERT INTO credit_ledger (id, organization_id, user_id, direction, amount, from_free, from_wallet,
         kind, biz_type, biz_id, balance_after, reason, operator_user_id)
       VALUES ($1,$2,$3,'in',$4,0,0,'redeem','credit_code',$5,$6,'积分码兑换',$3) RETURNING *`,
      [newId('cl'), organizationId, user.id, row.face_value, row.id, nextBalance],
    )
    await logAudit(user.id, organizationId, 'credit.redeem', 'credit_code', row.id, { amount: row.face_value })
    return {
      added: row.face_value,
      balance: nextBalance,
      entry: mapLedgerRow(ledger.rows[0]),
    }
  })
}

// ---------- 扣费 / 退款（二期接线用，一期先实现好） ----------

function toChargeResult(row) {
  return {
    charged: row.amount,
    fromFree: row.from_free,
    fromWallet: row.from_wallet,
    balanceAfter: row.balance_after,
    ledgerId: row.id,
  }
}

export async function chargeCredits(user, { bizType, bizId, priceCode, priceCredits = null } = {}) {
  const organizationId = user.organization.id
  if (!bizType || !bizId) throw httpError('缺少业务标识，无法扣费。', 400)
  return withUserContext(user, async (client) => {
    const existed = await client.query(
      `SELECT * FROM credit_ledger
       WHERE organization_id=$1 AND user_id=$2 AND biz_type=$3 AND biz_id=$4 AND kind='consume'`,
      [organizationId, user.id, bizType, bizId],
    )
    if (existed.rows.length) return toChargeResult(existed.rows[0])

    const amount = priceCredits != null ? toInt(priceCredits, 0) : toInt((await getPrice(client, organizationId, priceCode)).credits, 0)

    await ensureWallet(client, organizationId, user.id)
    await ensureDailyQuota(client, organizationId, user.id)
    const wallet = await client.query(
      `SELECT * FROM credit_wallets WHERE organization_id=$1 AND user_id=$2 FOR UPDATE`,
      [organizationId, user.id],
    )
    const quota = await client.query(
      `SELECT * FROM credit_daily_quota
       WHERE organization_id=$1 AND user_id=$2 AND grant_date=CURRENT_DATE FOR UPDATE`,
      [organizationId, user.id],
    )
    const freeLeft = quota.rows[0].free_total - quota.rows[0].free_used
    const fromFree = Math.min(freeLeft, amount)
    const fromWallet = amount - fromFree
    if (wallet.rows[0].balance < fromWallet) throw httpError('积分不足，请先充值。', 402)

    if (fromFree) {
      await client.query(
        `UPDATE credit_daily_quota SET free_used = free_used + $3, updated_at = now()
         WHERE organization_id=$1 AND user_id=$2 AND grant_date=CURRENT_DATE`,
        [organizationId, user.id, fromFree],
      )
    }
    const nextBalance = wallet.rows[0].balance - fromWallet
    if (fromWallet) {
      await client.query(
        `UPDATE credit_wallets SET balance = balance - $3, total_consumed = total_consumed + $3, updated_at = now()
         WHERE organization_id=$1 AND user_id=$2`,
        [organizationId, user.id, fromWallet],
      )
    }
    const row = await client.query(
      `INSERT INTO credit_ledger (id, organization_id, user_id, direction, amount, from_free, from_wallet,
         kind, biz_type, biz_id, balance_after, reason, operator_user_id)
       VALUES ($1,$2,$3,'out',$4,$5,$6,'consume',$7,$8,$9,'',$3) RETURNING *`,
      [newId('cl'), organizationId, user.id, amount, fromFree, fromWallet, bizType, bizId, nextBalance],
    )
    return toChargeResult(row.rows[0])
  })
}

export async function refundCredits(user, { bizType, bizId, reason = '任务失败自动退款' } = {}) {
  const organizationId = user.organization.id
  if (!bizType || !bizId) throw httpError('缺少业务标识，无法退款。', 400)
  return withUserContext(user, async (client) => {
    const consume = await client.query(
      `SELECT * FROM credit_ledger
       WHERE organization_id=$1 AND user_id=$2 AND biz_type=$3 AND biz_id=$4 AND kind='consume' LIMIT 1`,
      [organizationId, user.id, bizType, bizId],
    )
    if (!consume.rows[0]) throw httpError('找不到对应的扣费记录。', 404)
    const refunded = await client.query(
      `SELECT id FROM credit_ledger
       WHERE organization_id=$1 AND user_id=$2 AND biz_type=$3 AND biz_id=$4 AND kind='refund' LIMIT 1`,
      [organizationId, user.id, bizType, bizId],
    )
    if (refunded.rows[0]) return { refunded: 0, alreadyRefunded: true }

    const c = consume.rows[0]
    await ensureWallet(client, organizationId, user.id)
    await ensureDailyQuota(client, organizationId, user.id)
    const wallet = await client.query(
      `SELECT * FROM credit_wallets WHERE organization_id=$1 AND user_id=$2 FOR UPDATE`,
      [organizationId, user.id],
    )
    if (c.from_free) {
      await client.query(
        `UPDATE credit_daily_quota SET free_used = GREATEST(free_used - $3, 0), updated_at = now()
         WHERE organization_id=$1 AND user_id=$2 AND grant_date=CURRENT_DATE`,
        [organizationId, user.id, c.from_free],
      )
    }
    const nextBalance = wallet.rows[0].balance + c.from_wallet
    if (c.from_wallet) {
      await client.query(
        `UPDATE credit_wallets SET balance = balance + $3, total_consumed = GREATEST(total_consumed - $3, 0), updated_at = now()
         WHERE organization_id=$1 AND user_id=$2`,
        [organizationId, user.id, c.from_wallet],
      )
    }
    await client.query(
      `INSERT INTO credit_ledger (id, organization_id, user_id, direction, amount, from_free, from_wallet,
         kind, biz_type, biz_id, balance_after, reason, operator_user_id)
       VALUES ($1,$2,$3,'in',$4,$5,$6,'refund',$7,$8,$9,$10,$3)`,
      [newId('cl'), organizationId, user.id, c.amount, c.from_free, c.from_wallet, bizType, bizId, nextBalance, reason],
    )
    return { refunded: c.amount, balance: nextBalance }
  })
}

// ---------- 后台：加减分 / 概览 / 单人明细 ----------

export async function adminAdjustCredits(admin, targetUserId, { delta, reason } = {}) {
  const organizationId = admin.organization.id
  const amount = toInt(delta, 0)
  const why = String(reason || '').trim()
  if (!amount) throw httpError('调整数量不能为 0。', 400)
  if (!why) throw httpError('请填写调整原因。', 400)
  return withTransaction(async (client) => {
    const target = await client.query(
      `SELECT id FROM users WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [targetUserId, organizationId],
    )
    if (!target.rows[0]) throw httpError('目标账号不存在。', 404)
    await ensureWallet(client, organizationId, targetUserId)
    const wallet = await client.query(
      `SELECT * FROM credit_wallets WHERE organization_id=$1 AND user_id=$2 FOR UPDATE`,
      [organizationId, targetUserId],
    )
    const nextBalance = wallet.rows[0].balance + amount
    if (nextBalance < 0) throw httpError('扣减后余额不能为负。', 400)
    await client.query(
      `UPDATE credit_wallets
         SET balance = $3,
             total_recharged = total_recharged + $4,
             updated_at = now()
       WHERE organization_id=$1 AND user_id=$2`,
      [organizationId, targetUserId, nextBalance, amount > 0 ? amount : 0],
    )
    const row = await client.query(
      `INSERT INTO credit_ledger (id, organization_id, user_id, direction, amount, from_free, from_wallet,
         kind, biz_type, biz_id, balance_after, reason, operator_user_id)
       VALUES ($1,$2,$3,$4,$5,0,0,'admin_adjust','','',$6,$7,$8) RETURNING *`,
      [newId('cl'), organizationId, targetUserId, amount > 0 ? 'in' : 'out', Math.abs(amount), nextBalance, why, admin.id],
    )
    await logAudit(admin.id, organizationId, 'credit.adjust', 'user', targetUserId, { delta: amount, reason: why })
    return { balance: nextBalance, entry: mapLedgerRow(row.rows[0]) }
  })
}

export async function getCreditOverview(admin, { keyword = '', role = '' } = {}) {
  const organizationId = admin.organization.id
  const params = [organizationId]
  let where = 'WHERE u.organization_id = $1'
  if (keyword) {
    params.push(`%${String(keyword).trim()}%`)
    where += ` AND (u.account ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`
  }
  if (role) {
    params.push(String(role))
    where += ` AND u.role = $${params.length}`
  }
  const result = await withTransaction((client) => client.query(
    `SELECT u.id, COALESCE(w.balance, 0) AS balance
     FROM users u
     LEFT JOIN credit_wallets w ON w.organization_id = u.organization_id AND w.user_id = u.id
     ${where}`,
    params,
  ))
  const map = {}
  for (const row of result.rows) map[row.id] = toInt(row.balance, 0)
  return { credits: map }
}

export async function getUserCredit(admin, targetUserId) {
  const organizationId = admin.organization.id
  return withTransaction(async (client) => {
    const target = await client.query(
      `SELECT id, display_name, account, role FROM users WHERE id = $1 AND organization_id = $2`,
      [targetUserId, organizationId],
    )
    if (!target.rows[0]) throw httpError('目标账号不存在。', 404)
    await ensureWallet(client, organizationId, targetUserId)
    await ensureDailyQuota(client, organizationId, targetUserId)
    const wallet = await readWallet(client, organizationId, targetUserId)
    const quota = await client.query(
      `SELECT free_total, free_used FROM credit_daily_quota
       WHERE organization_id = $1 AND user_id = $2 AND grant_date = CURRENT_DATE`,
      [organizationId, targetUserId],
    )
    const ledger = await client.query(
      `SELECT * FROM credit_ledger WHERE organization_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 10`,
      [organizationId, targetUserId],
    )
    const freeTotal = quota.rows[0]?.free_total ?? 60
    const freeUsed = quota.rows[0]?.free_used ?? 0
    return {
      user: { id: target.rows[0].id, name: target.rows[0].display_name, account: target.rows[0].account, role: target.rows[0].role },
      balance: wallet.balance,
      freeTotal,
      freeUsed,
      freeRemaining: Math.max(0, freeTotal - freeUsed),
      entries: ledger.rows.map(mapLedgerRow),
    }
  })
}

// ---------- 后台：发码 / 码列表 / 核对 / 作废 / 导出 ----------

export async function generateCodes(admin, { faceValue, quantity, prefix = '', note = '', expiresInDays = null, orderNo = '' } = {}) {
  const organizationId = admin.organization.id
  const face = toInt(faceValue, 0)
  const qty = toInt(quantity, 0)
  if (face <= 0) throw httpError('面额必须大于 0。', 400)
  if (qty <= 0 || qty > 500) throw httpError('数量需在 1–500 之间。', 400)
  const days = expiresInDays != null && String(expiresInDays).trim() !== '' ? toInt(expiresInDays, 0) : 0
  return withTransaction(async (client) => {
    const batchId = newId('ccb')
    let expiresAt = null
    if (days > 0) {
      const d = new Date()
      d.setDate(d.getDate() + days)
      expiresAt = d.toISOString()
    }
    await client.query(
      `INSERT INTO credit_code_batches (id, organization_id, face_value, quantity, prefix, note, expires_at, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [batchId, organizationId, face, qty, prefix || '', note || '', expiresAt, admin.id],
    )
    const codes = []
    for (let i = 0; i < qty; i += 1) {
      let inserted = false
      for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
        const code = makeCode(prefix)
        try {
          await client.query(
            `INSERT INTO credit_codes (id, organization_id, batch_id, code, face_value, status, order_no, note, issued_by_user_id, expires_at)
             VALUES ($1,$2,$3,$4,$5,'issued',$6,$7,$8,$9)`,
            [newId('cc'), organizationId, batchId, code, face, orderNo || '', note || '', admin.id, expiresAt],
          )
          codes.push(code)
          inserted = true
        } catch (error) {
          if (error.code !== '23505') throw error // 非唯一冲突直接抛出
        }
      }
      if (!inserted) throw httpError('生成积分码失败，请重试。', 500)
    }
    await logAudit(admin.id, organizationId, 'credit.generate_codes', 'credit_code_batch', batchId, { face, qty })
    return { batchId, faceValue: face, quantity: qty, codes, expiresAt }
  })
}

export async function listCodes(admin, { status = '', from = '', to = '', limit = 200 } = {}) {
  const organizationId = admin.organization.id
  const params = [organizationId]
  let where = 'WHERE organization_id = $1'
  if (status) {
    params.push(String(status))
    where += ` AND status = $${params.length}`
  }
  if (from) {
    params.push(from)
    where += ` AND created_at >= $${params.length}`
  }
  if (to) {
    params.push(to)
    where += ` AND created_at < $${params.length}`
  }
  const capped = Math.min(Math.max(toInt(limit, 200), 1), 1000)
  const result = await withTransaction((client) => client.query(
    `SELECT * FROM credit_codes ${where} ORDER BY created_at DESC LIMIT ${capped}`,
    params,
  ))
  return { codes: result.rows.map(mapCodeRow) }
}

async function getCodeForAdmin(client, organizationId, codeId) {
  const result = await client.query(
    `SELECT * FROM credit_codes WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [codeId, organizationId],
  )
  if (!result.rows[0]) throw httpError('积分码不存在。', 404)
  return result.rows[0]
}

export async function confirmCodePayment(admin, codeId) {
  const organizationId = admin.organization.id
  return withTransaction(async (client) => {
    const row = await getCodeForAdmin(client, organizationId, codeId)
    if (row.status === 'confirmed') return { code: mapCodeRow(row) }
    if (row.status !== 'issued' && row.status !== 'redeemed') {
      throw httpError('当前状态不可确认为已收款。', 400)
    }
    const updated = await client.query(
      `UPDATE credit_codes SET status = 'confirmed', confirmed_at = now(), confirmed_by_user_id = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [codeId, organizationId, admin.id],
    )
    await logAudit(admin.id, organizationId, 'credit.confirm_code', 'credit_code', codeId, {})
    return { code: mapCodeRow(updated.rows[0]) }
  })
}

export async function voidCode(admin, codeId, { clawBack = false } = {}) {
  const organizationId = admin.organization.id
  return withTransaction(async (client) => {
    const row = await getCodeForAdmin(client, organizationId, codeId)
    if (row.status === 'void') return { code: mapCodeRow(row) }
    const wasRedeemed = row.status === 'redeemed' || row.status === 'confirmed'
    if (wasRedeemed && clawBack && row.redeemed_by_user_id) {
      await ensureWallet(client, organizationId, row.redeemed_by_user_id)
      const wallet = await client.query(
        `SELECT * FROM credit_wallets WHERE organization_id = $1 AND user_id = $2 FOR UPDATE`,
        [organizationId, row.redeemed_by_user_id],
      )
      const nextBalance = wallet.rows[0].balance - row.face_value
      if (nextBalance < 0) throw httpError('该用户余额不足，无法扣回，请先手动处理。', 400)
      await client.query(
        `UPDATE credit_wallets SET balance = $3, total_recharged = GREATEST(total_recharged - $4, 0), updated_at = now()
         WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, row.redeemed_by_user_id, nextBalance, row.face_value],
      )
      await client.query(
        `INSERT INTO credit_ledger (id, organization_id, user_id, direction, amount, from_free, from_wallet,
           kind, biz_type, biz_id, balance_after, reason, operator_user_id)
         VALUES ($1,$2,$3,'out',$4,0,0,'void','credit_code',$5,$6,'积分码作废扣回',$7)`,
        [newId('cl'), organizationId, row.redeemed_by_user_id, row.face_value, row.id, nextBalance, admin.id],
      )
    }
    const updated = await client.query(
      `UPDATE credit_codes SET status = 'void' WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [codeId, organizationId],
    )
    await logAudit(admin.id, organizationId, 'credit.void_code', 'credit_code', codeId, { clawBack })
    return { code: mapCodeRow(updated.rows[0]) }
  })
}

function csvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(header, rows) {
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  return '\ufeff' + lines.join('\r\n')
}

const CODE_STATUS_LABELS = {
  issued: '未使用',
  redeemed: '已兑换待核对',
  confirmed: '已核对收款',
  void: '已作废',
}

function codeStatusLabel(status) {
  return CODE_STATUS_LABELS[status] || status
}

export async function exportCodes(admin, { type = 'codes', from = '', to = '' } = {}) {
  const organizationId = admin.organization.id
  return withTransaction(async (client) => {
    const params = [organizationId]
    let where = 'WHERE c.organization_id = $1'
    if (from) {
      params.push(from)
      where += ` AND c.created_at >= $${params.length}`
    }
    if (to) {
      params.push(to)
      where += ` AND c.created_at < $${params.length}`
    }
    if (type === 'check') {
      const result = await client.query(
        `SELECT c.code, c.face_value, c.status, c.order_no, c.note,
                u.display_name AS redeemed_by, c.redeemed_at, c.confirmed_at, c.created_at
         FROM credit_codes c
         LEFT JOIN users u ON u.id = c.redeemed_by_user_id
         ${where} ORDER BY c.created_at DESC`,
        params,
      )
      const rows = result.rows.map((r) => [
        r.code, r.face_value, codeStatusLabel(r.status), r.order_no, r.note,
        r.redeemed_by || '', r.redeemed_at ? new Date(r.redeemed_at).toISOString() : '',
        r.confirmed_at ? new Date(r.confirmed_at).toISOString() : '',
        r.created_at ? new Date(r.created_at).toISOString() : '',
      ])
      const csv = toCsv(['积分码', '面额', '状态', '订单号', '备注', '兑换人', '兑换时间', '确认收款时间', '生成时间'], rows)
      return { filename: `积分核对表-${new Date().toISOString().slice(0, 10)}.csv`, csv }
    }
    const result = await client.query(
      `SELECT c.code, c.face_value, c.status, c.expires_at, c.created_at FROM credit_codes c
       ${where} ORDER BY c.created_at DESC`,
      params,
    )
    const rows = result.rows.map((r) => [
      r.code, r.face_value, codeStatusLabel(r.status),
      r.expires_at ? new Date(r.expires_at).toISOString().slice(0, 10) : '永久',
      r.created_at ? new Date(r.created_at).toISOString() : '',
    ])
    const csv = toCsv(['积分码', '面额', '状态', '有效期', '生成时间'], rows)
    return { filename: `积分码表-${new Date().toISOString().slice(0, 10)}.csv`, csv }
  })
}

// ---------- 后台：价目表读写 ----------

/**
 * 后台「AI 用量与计费」面板的全部数据。
 * 返回三层：能力兜底配置 / 模型单独定价 / 每类今天的全校用量概况。
 */
export async function listPrices(admin) {
  const organizationId = admin.organization.id
  return withTransaction(async (client) => {
    await ensureAbilityPrices(client, organizationId)
    const result = await client.query(
      `SELECT id, code, label, credits, status, ability, provider, model, daily_free, sort_order
       FROM credit_prices WHERE organization_id = $1 ORDER BY sort_order, code`,
      [organizationId],
    )
    const rows = result.rows.map(mapPriceRow)
    // 能力兜底行 = provider/model 都空的那一行，每个 ability 至多一条
    const abilities = CREDIT_ABILITIES.map((meta) => {
      const row = rows.find((r) => r.ability === meta.ability && !r.provider && !r.model)
      return {
        ability: meta.ability,
        label: meta.label,
        unit: meta.unit,
        priceCode: meta.priceCode,
        credits: row ? row.credits : meta.credits,
        dailyFree: row ? row.dailyFree : meta.dailyFree,
        status: row ? row.status : 'enabled',
        priceId: row ? row.id : '',
      }
    })
    const modelPrices = rows
      .filter((r) => r.provider || r.model)
      .map((r) => ({
        id: r.id, ability: r.ability, provider: r.provider, model: r.model,
        label: r.label, credits: r.credits, status: r.status,
      }))
    return { abilities, modelPrices, messages: (await readCreditSettings(client, organizationId)).messages }
  })
}

/**
 * 保存面板。两种写法并存，任一都可以：
 *   abilities: [{ ability, credits, dailyFree, status }]        → 改能力兜底
 *   modelPrices: [{ ability, provider, model, credits, status }] → 加/改某个模型的单独价
 * 旧的 prices: [{ code, credits }] 写法保留，老调用方不会 500。
 */
export async function savePrices(admin, payload) {
  const organizationId = admin.organization.id
  const body = Array.isArray(payload) ? { prices: payload } : (payload || {})
  const abilities = Array.isArray(body.abilities) ? body.abilities : []
  const modelPrices = Array.isArray(body.modelPrices) ? body.modelPrices : []
  const legacy = Array.isArray(body.prices) ? body.prices : []
  const legacyMessages = body.messages && typeof body.messages === 'object' ? body.messages : null

  await withTransaction(async (client) => {
    await ensureAbilityPrices(client, organizationId)

    for (const item of legacy) {
      if (!item || !item.code) continue
      await client.query(
        `UPDATE credit_prices
           SET label = COALESCE($3, label), credits = COALESCE($4, credits),
               status = COALESCE($5, status), updated_by_user_id = $6, updated_at = now()
         WHERE organization_id = $1 AND code = $2`,
        [
          organizationId, String(item.code),
          item.label != null ? String(item.label) : null,
          item.credits != null ? toInt(item.credits, 0) : null,
          item.status === 'enabled' || item.status === 'disabled' ? item.status : null,
          admin.id,
        ],
      )
    }

    for (const item of abilities) {
      const ability = normalizeAbility(item?.ability)
      if (!ability) continue
      const meta = CREDIT_ABILITY_MAP.get(ability)
      await client.query(
        `UPDATE credit_prices
           SET credits = COALESCE($3, credits),
               daily_free = COALESCE($4, daily_free),
               status = COALESCE($5, status),
               updated_by_user_id = $6, updated_at = now()
         WHERE organization_id = $1 AND ability = $2 AND provider = '' AND model = ''`,
        [
          organizationId, ability,
          item.credits != null ? Math.max(0, toInt(item.credits, meta.credits)) : null,
          item.dailyFree != null ? Math.max(0, toInt(item.dailyFree, meta.dailyFree)) : null,
          item.status === 'enabled' || item.status === 'disabled' ? item.status : null,
          admin.id,
        ],
      )
    }

    // 模型分价：按 (organization, ability, provider, model) 幂等写入。
    // credits 传 null 或负数代表「删掉这条单独定价，回到能力兜底」。
    for (const item of modelPrices) {
      const ability = normalizeAbility(item?.ability)
      const model = String(item?.model || '').trim()
      const provider = String(item?.provider || '').trim()
      if (!ability || !model) continue
      if (item.credits == null || Number(item.credits) < 0) {
        await client.query(
          `DELETE FROM credit_prices
           WHERE organization_id = $1 AND ability = $2 AND provider = $3 AND model = $4`,
          [organizationId, ability, provider, model],
        )
        continue
      }
      const status = item.status === 'disabled' ? 'disabled' : 'enabled'
      await client.query(
        `INSERT INTO credit_prices
           (id, organization_id, code, label, credits, sort_order, ability, provider, model, status, updated_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (organization_id, ability, provider, model) DO UPDATE
           SET credits = EXCLUDED.credits,
               status = EXCLUDED.status,
               label = EXCLUDED.label,
               updated_by_user_id = EXCLUDED.updated_by_user_id,
               updated_at = now()`,
        [
          `cp_${organizationId}_${ability}_${provider || 'any'}_${model}`.slice(0, 63),
          organizationId,
          `${ability}:${provider || '*'}:${model}`.slice(0, 60),
          String(item.label || model).slice(0, 60),
          Math.max(0, toInt(item.credits, 0)),
          CREDIT_ABILITY_MAP.get(ability).sort + 1,
          ability, provider, model, status, admin.id,
        ],
      )
    }

    if (legacyMessages) {
      const current = await readCreditSettings(client, organizationId)
      const merged = { ...current.messages }
      for (const key of CREDIT_MESSAGE_KEYS) {
        if (legacyMessages[key] == null) continue
        const value = String(legacyMessages[key]).trim()
        merged[key] = value || CREDIT_MESSAGE_DEFAULTS[key]
      }
      await client.query(
        `INSERT INTO credit_settings (organization_id, settings, updated_by_user_id, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (organization_id) DO UPDATE
           SET settings = $2::jsonb, updated_by_user_id = $3, updated_at = now()`,
        [organizationId, JSON.stringify({ messages: merged }), admin.id],
      )
    }

    await logAudit(admin.id, organizationId, 'credit.save_prices', 'credit_prices', null, {
      abilities: abilities.length, modelPrices: modelPrices.length, messages: legacyMessages ? 1 : 0,
    })
  })
  return listPrices(admin)
}

/** 后台改提示文案（单独一个入口，面板可以只保存文案不动价目）。*/
export async function saveCreditMessages(admin, messages) {
  const organizationId = admin.organization.id
  if (!messages || typeof messages !== 'object') throw httpError('提示文案格式不正确。', 400)
  await withTransaction(async (client) => {
    const current = await readCreditSettings(client, organizationId)
    const merged = { ...current.messages }
    for (const key of CREDIT_MESSAGE_KEYS) {
      if (messages[key] == null) continue
      const value = String(messages[key]).trim()
      merged[key] = value || CREDIT_MESSAGE_DEFAULTS[key]
    }
    await client.query(
      `INSERT INTO credit_settings (organization_id, settings, updated_by_user_id, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (organization_id) DO UPDATE
         SET settings = $2::jsonb, updated_by_user_id = $3, updated_at = now()`,
      [organizationId, JSON.stringify({ messages: merged }), admin.id],
    )
    await logAudit(admin.id, organizationId, 'credit.save_messages', 'credit_settings', null, { keys: Object.keys(messages).length })
  })
  return withTransaction((client) => readCreditSettings(client, organizationId))
}

/** 学生端/前端要用到的「可改文案」，不带价格。*/
export async function getCreditMessages(user) {
  const organizationId = user.organization.id
  return withTransaction((client) => readCreditSettings(client, organizationId))
}

/**
 * 预检：这次生成要不要花钱？花多少？白送还剩几次？
 * 前端在「点生成」之前调它，据此决定「直接生成」还是「弹窗确认」。
 * 注意：这里只读不写，不占额度也不扣钱。
 */
export async function previewCharge(user, { ability, provider = '', model = '', count = 1 } = {}) {
  const organizationId = user.organization.id
  const meta = CREDIT_ABILITY_MAP.get(normalizeAbility(ability))
  if (!meta) throw httpError('未知的计费能力。', 400)
  const quantity = Math.max(1, toInt(count, 1))
  return withTransaction(async (client) => {
    const price = await resolveAbilityPrice(client, organizationId, { ability: meta.ability, provider, model })
    await ensureWallet(client, organizationId, user.id)
    const wallet = await readWallet(client, organizationId, user.id)
    const usage = await client.query(
      `SELECT free_total, free_used FROM credit_usage_daily
       WHERE organization_id=$1 AND user_id=$2 AND usage_date=CURRENT_DATE AND ability=$3`,
      [organizationId, user.id, meta.ability],
    )
    const freeTotal = usage.rows[0]?.free_total ?? price.dailyFree
    const freeUsed = usage.rows[0]?.free_used ?? 0
    const freeRemaining = Math.max(0, freeTotal - freeUsed)
    // 本次实际能白送几次，剩下的一律折成积分
    const freeCovered = Math.min(freeRemaining, quantity)
    const paidCount = quantity - freeCovered
    const cost = paidCount * price.credits
    const settings = await readCreditSettings(client, organizationId)
    return {
      ability: meta.ability,
      label: meta.label,
      unit: meta.unit,
      quantity,
      unitCredits: price.credits,
      priceMatched: price.matched,
      freeTotal,
      freeUsed,
      freeRemaining,
      freeCovered,
      paidCount,
      cost,
      balance: wallet.balance,
      needConfirm: cost > 0,
      enough: wallet.balance >= cost,
      shortfall: Math.max(0, cost - wallet.balance),
      messages: settings.messages,
    }
  })
}

/**
 * 按新规则扣费：先消耗当日赠送次数，不够的部分按单价折成积分从钱包扣。
 * 与老 chargeCredits 的差别：不再有「60 积分/天」这层，赠送按次数记、按能力分开。
 */
export async function chargeAbility(user, { ability, provider = '', model = '', count = 1, bizType, bizId } = {}) {
  const organizationId = user.organization.id
  const meta = CREDIT_ABILITY_MAP.get(normalizeAbility(ability))
  if (!meta) throw httpError('未知的计费能力。', 400)
  if (!bizType || !bizId) throw httpError('缺少业务标识，无法扣费。', 400)
  const quantity = Math.max(1, toInt(count, 1))

  return withUserContext(user, async (client) => {
    const existed = await client.query(
      `SELECT * FROM credit_ledger
       WHERE organization_id=$1 AND user_id=$2 AND biz_type=$3 AND biz_id=$4 AND kind='consume'`,
      [organizationId, user.id, bizType, bizId],
    )
    if (existed.rows.length) {
      const row = existed.rows[0]
      return {
        charged: row.amount, fromFree: row.from_free, fromWallet: row.from_wallet,
        balance: row.balance_after, alreadyCharged: true, ability: meta.ability, quantity,
      }
    }

    const price = await resolveAbilityPrice(client, organizationId, { ability: meta.ability, provider, model })
    await ensureWallet(client, organizationId, user.id)

    // 固定加锁顺序：钱包 → 当日用量，避免两个标签页同时点生成死锁。
    const wallet = await client.query(
      `SELECT balance, total_consumed FROM credit_wallets WHERE organization_id=$1 AND user_id=$2 FOR UPDATE`,
      [organizationId, user.id],
    )
    await client.query(
      `INSERT INTO credit_usage_daily (organization_id, user_id, usage_date, ability, free_total, free_used, paid_count)
       VALUES ($1,$2,CURRENT_DATE,$3,$4,0,0)
       ON CONFLICT (organization_id, user_id, usage_date, ability) DO NOTHING`,
      [organizationId, user.id, meta.ability, price.dailyFree],
    )
    const usage = await client.query(
      `SELECT free_total, free_used FROM credit_usage_daily
       WHERE organization_id=$1 AND user_id=$2 AND usage_date=CURRENT_DATE AND ability=$3 FOR UPDATE`,
      [organizationId, user.id, meta.ability],
    )
    const freeTotal = usage.rows[0].free_total
    const freeUsed = usage.rows[0].free_used
    const freeRemaining = Math.max(0, freeTotal - freeUsed)
    const freeCovered = Math.min(freeRemaining, quantity)
    const paidCount = quantity - freeCovered
    const amount = paidCount * price.credits

    if (amount > 0 && wallet.rows[0].balance < amount) {
      throw httpError(`积分不足，还需 ${amount - wallet.rows[0].balance} 分，请联系管理员充值。`, 402)
    }

    if (freeCovered) {
      await client.query(
        `UPDATE credit_usage_daily SET free_used = free_used + $4, updated_at = now()
         WHERE organization_id=$1 AND user_id=$2 AND usage_date=CURRENT_DATE AND ability=$3`,
        [organizationId, user.id, meta.ability, freeCovered],
      )
    }
    if (paidCount) {
      await client.query(
        `UPDATE credit_usage_daily SET paid_count = paid_count + $4, updated_at = now()
         WHERE organization_id=$1 AND user_id=$2 AND usage_date=CURRENT_DATE AND ability=$3`,
        [organizationId, user.id, meta.ability, paidCount],
      )
    }
    const nextBalance = wallet.rows[0].balance - amount
    if (amount > 0) {
      await client.query(
        `UPDATE credit_wallets SET balance = balance - $3, total_consumed = total_consumed + $3, updated_at = now()
         WHERE organization_id=$1 AND user_id=$2`,
        [organizationId, user.id, amount],
      )
    }

    // 一分钱没花（全走白送）时不写流水：钱包没变，写进去只会让账看着乱。
    if (amount > 0) {
      await client.query(
        `INSERT INTO credit_ledger (id, organization_id, user_id, direction, amount, from_free, from_wallet,
           kind, biz_type, biz_id, balance_after, reason, operator_user_id)
         VALUES ($1,$2,$3,'out',$4,0,$4,'consume',$5,$6,$7,$8,$3)`,
        [
          newId('cl'), organizationId, user.id, amount, bizType, bizId, nextBalance,
          `${meta.label} ×${paidCount}`,
        ],
      )
    }
    return {
      charged: amount, fromFree: freeCovered, fromWallet: amount,
      balance: nextBalance, paidCount, freeCovered, ability: meta.ability,
      quantity, unitCredits: price.credits, alreadyCharged: false,
    }
  })
}

/**
 * 退回一次 chargeAbility 的扣费：钱包里扣的积分原路退回，当天用掉的免费次数也还回去。
 * 老的 refundCredits 只认流水，而全走免费次数的扣费不写流水 —— 生成失败时免费次数就白白少了一次。
 * charge 传 chargeAbility 的返回值（freeCovered / paidCount）。同一个 bizId 只会退一次积分。
 */
export async function refundAbility(user, { ability, bizType, bizId, charge = {}, reason = '生成失败自动退回' } = {}) {
  const organizationId = user.organization.id
  const meta = CREDIT_ABILITY_MAP.get(normalizeAbility(ability))
  if (!meta) throw httpError('未知的计费能力。', 400)
  if (!bizType || !bizId) throw httpError('缺少业务标识，无法退款。', 400)
  if (charge.alreadyCharged) return { refunded: 0, skipped: true }
  return withUserContext(user, async (client) => {
    const refunded = await client.query(
      `SELECT id FROM credit_ledger
       WHERE organization_id=$1 AND user_id=$2 AND biz_type=$3 AND biz_id=$4 AND kind='refund' LIMIT 1`,
      [organizationId, user.id, bizType, bizId],
    )
    if (refunded.rows[0]) return { refunded: 0, alreadyRefunded: true }
    const consume = await client.query(
      `SELECT * FROM credit_ledger
       WHERE organization_id=$1 AND user_id=$2 AND biz_type=$3 AND biz_id=$4 AND kind='consume' LIMIT 1`,
      [organizationId, user.id, bizType, bizId],
    )
    let balance = null
    let amount = 0
    if (consume.rows[0]) {
      const row = consume.rows[0]
      amount = row.from_wallet
      await ensureWallet(client, organizationId, user.id)
      const wallet = await client.query(
        `SELECT balance FROM credit_wallets WHERE organization_id=$1 AND user_id=$2 FOR UPDATE`,
        [organizationId, user.id],
      )
      balance = wallet.rows[0].balance + amount
      if (amount > 0) {
        await client.query(
          `UPDATE credit_wallets SET balance = balance + $3, total_consumed = GREATEST(total_consumed - $3, 0), updated_at = now()
           WHERE organization_id=$1 AND user_id=$2`,
          [organizationId, user.id, amount],
        )
        await client.query(
          `INSERT INTO credit_ledger (id, organization_id, user_id, direction, amount, from_free, from_wallet,
             kind, biz_type, biz_id, balance_after, reason, operator_user_id)
           VALUES ($1,$2,$3,'in',$4,0,$4,'refund',$5,$6,$7,$8,$3)`,
          [newId('cl'), organizationId, user.id, amount, bizType, bizId, balance, reason],
        )
      }
    }
    const freeBack = Math.max(0, toInt(charge.freeCovered, 0))
    const paidBack = Math.max(0, toInt(charge.paidCount, 0))
    if (freeBack || paidBack) {
      await client.query(
        `UPDATE credit_usage_daily
           SET free_used = GREATEST(free_used - $4, 0), paid_count = GREATEST(paid_count - $5, 0), updated_at = now()
         WHERE organization_id=$1 AND user_id=$2 AND usage_date=CURRENT_DATE AND ability=$3`,
        [organizationId, user.id, meta.ability, freeBack, paidBack],
      )
    }
    return { refunded: amount, freeRestored: freeBack, balance }
  })
}
