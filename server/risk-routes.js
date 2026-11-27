/* 风控的接入点与后台接口，供 server/index.js 调用。
 * index.js 已经很大，风控相关的路由、登录保护、AI 入口检查都集中放在这里，index.js 里只留几行调用。
 */
import {
  activeBansForUsers, addRiskWords, assertAiAllowed, assertLoginAllowed, checkContent, clearLoginFailures, clearLoginLock, clientIp,
  createRiskBan, createRiskRule, defaultRiskState, deleteRiskRule, deleteRiskWords, deleteUserSessions, evaluateText, exportRiskWords,
  getActiveBan, getRiskSettings, getSafetyStatus, guardText, handleRiskEvents, liftRiskBan, listLoginLocks, listRiskBans, listRiskEvents,
  listRiskRules, listRiskWords, loadRiskState, networkLockedMessage, publicBan, publicCommentPolicy, recordLoginFailure, recordVerdict, RISK_CATEGORIES,
  riskOverview, takeRateToken, testRiskText, updateRiskRule, updateRiskSettings, updateRiskWord, visitorKey,
} from './risk-store.js'

export { checkContent, recordVerdict }

/** 被封禁（暂停 AI）或处在休息时段时不能调用的接口：AI 创作、AI 对话、技能运行、作品公开投稿。 */
export const AI_GUARDED_PATH = /^\/api\/(?:ai\/|agent\/chat$|ai-skills\/[A-Za-z0-9_-]+\/runs$|me\/gallery-submissions$|student\/agent\/understand$|student\/course-dialog\/(?:turn|answer)$|h5-report\/canvas-workflow\/run$|report\/generate$)/

/* ---------------- 登录 / 注册 ---------------- */

export async function assertLoginNotBanned(user) {
  const ban = await getActiveBan(user).catch(() => null)
  if (ban?.scope !== 'all') return
  const view = publicBan(ban)
  throw Object.assign(new Error(view.message), { statusCode: 403, data: { code: 'account_banned', ban: view } })
}

/**
 * 带防暴力猜密码的登录：同一账号连续输错会被临时锁定（锁定时长逐次翻倍，最长 15 分钟），
 * 同一 IP 失败过多也会被锁；被"暂停登录"的账号即使密码正确也不能登录。
 */
export async function loginWithProtection(req, body, login) {
  const attempt = {
    organizationCode: String(body.organizationCode || process.env.LOGIN_DEFAULT_ORGANIZATION_CODE || process.env.DEFAULT_ORGANIZATION_CODE || '').trim(),
    account: String(body.account || '').trim(),
    ip: clientIp(req),
  }
  try {
    await assertLoginAllowed(attempt)
  } catch (error) {
    if (error.statusCode === 429) throw error
    console.error('[risk] 登录保护检查失败（本次放行）：', error.message)
  }
  try {
    const result = await login(body.account, body.password, body.organizationCode, { beforeSession: assertLoginNotBanned })
    await clearLoginFailures(attempt).catch(() => {})
    return result
  } catch (error) {
    if (error.statusCode === 401 && attempt.account && attempt.organizationCode) {
      const failure = await recordLoginFailure(attempt).catch(() => null)
      if (failure?.lockedMinutes) Object.assign(error, { statusCode: 429, message: `账号或密码错误次数太多，请 ${failure.lockedMinutes} 分钟后再试。`, data: { code: 'login_locked', scope: 'account', retryAfterMinutes: failure.lockedMinutes } })
      // 这一次失败让整个网络进入锁定：直接说清楚，不然下一次密码输对了也会被拦，用户会以为系统坏了。
      else if (failure?.networkLockedMinutes) Object.assign(error, { statusCode: 429, message: networkLockedMessage(failure.networkLockedMinutes), data: { code: 'login_locked', scope: 'network', retryAfterMinutes: failure.networkLockedMinutes } })
      else if (failure && failure.remaining <= 2) error.message = `账号或密码错误，还可以再试 ${failure.remaining} 次。`
    }
    throw error
  }
}

/** 注册限频：防止有人用脚本暴力试邀请码。上限放宽到每小时 60 次，整班同时注册（共用一个出口 IP）也不受影响。 */
export function assertRegisterRate(req) {
  if (!takeRateToken(`register:${visitorKey(req)}`, 60, 3600 * 1000).ok) {
    throw Object.assign(new Error('注册尝试太频繁了，请稍后再试。'), { statusCode: 429 })
  }
}

/** 注册时的昵称会被别人看到：此时还不知道机构，用内置词表判断，不记录。 */
export async function assertProfileText(values = []) {
  for (const value of values) {
    const verdict = await checkContent(null, String(value || ''), { scope: 'profile', record: false })
    if (!verdict.ok) throw Object.assign(new Error(verdict.message), { statusCode: 400 })
  }
}

/* ---------------- 登录后的统一拦截 ---------------- */

/** 返回 true 表示已经响应（账号被暂停登录）；暂停 AI 或休息时段则抛 403。 */
export async function enforceAccountSafety(req, res, url, user, { sendJson, clearCookie }) {
  if (!user || url.pathname === '/api/auth/logout') return false
  const ban = await getActiveBan(user).catch(() => null)
  if (ban?.scope === 'all') {
    await deleteUserSessions(user.id).catch(() => {})
    const view = publicBan(ban)
    sendJson(res, 403, { ok: false, code: 'account_banned', message: view.message, data: { code: 'account_banned', ban: view } }, { 'Set-Cookie': clearCookie() })
    return true
  }
  if (req.method === 'POST' && AI_GUARDED_PATH.test(url.pathname)) await assertAiAllowed(user, ban)
  return false
}

/* ---------------- AI 入口的文字检查 ---------------- */

// 图片 / 链接 / base64 不是给人看的文字，不做检查（base64 里偶然拼出"qq12345"会被误判成联系方式）。
function looksLikeData(value) {
  const text = value.trim()
  return /^(?:data:|https?:\/\/|\/api\/|blob:)/i.test(text) || (text.length > 200 && /^[A-Za-z0-9+/=_-]+$/.test(text))
}

/** 拦截的直接抛 400（带友好提示）；需要打码的（如手机号）换成打码后的文字再交给模型。 */
export async function guardPromptFields(user, body, fields, scope = 'prompt') {
  if (!body || typeof body !== 'object') return body
  for (const field of fields) {
    const value = body[field]
    if (typeof value !== 'string' || !value.trim() || looksLikeData(value)) continue
    body[field] = await guardText(user, value, { scope })
  }
  return body
}

/** 技能运行时用户填写的各个输入框。 */
export async function guardTextValues(user, values, scope = 'prompt') {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return values
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !value.trim() || looksLikeData(value)) continue
    values[key] = await guardText(user, value, { scope })
  }
  return values
}

/** AI 生成的文字（如优化后的提示词）：不计入用户的违规次数，但不合适的结果不交给用户。 */
export async function guardAiOutput(user, text, scope = 'prompt') {
  const verdict = await checkContent(user, String(text || ''), { scope, countForBan: false, actor: 'ai' })
  if (!verdict.ok) throw Object.assign(new Error('AI 给出的结果里有不适合的内容，请换个描述再试。'), { statusCode: 422 })
  return verdict.text
}

/* ---------------- 公开发布（H5 报告）---------------- */

export async function loadPublishRiskState(user) {
  return loadRiskState(user?.organization?.id || '').catch(() => defaultRiskState())
}

export function publishTextVerdict(state, text) {
  return evaluateText(state || defaultRiskState(), text, 'gallery')
}

export function riskCategoryNames(categories = []) {
  return [...new Set(categories.map((key) => RISK_CATEGORIES[key] || '其他'))].join('、')
}

/* ---------------- 分享页点赞 / 留言（访客，无需登录）---------------- */

export async function handlePublicReportAction(req, res, token, action, { sendJson, readJson, readReports, writeReports }) {
  const found = readReports().find((item) => item.shareToken === token && item.status === 'published')
  if (!found) return sendJson(res, 404, { ok: false, message: '报告尚未发布、已下架或分享链接无效。' })
  const visitor = visitorKey(req)
  const organizationId = found.organizationId || ''
  let content = ''
  if (action === 'like') {
    // 同一访客对同一份报告一天只算一次赞，刷新连点也刷不出几百个赞。
    if (!takeRateToken(`like:${token}:${visitor}`, 1, 24 * 3600 * 1000).ok) {
      return sendJson(res, 200, { ok: true, alreadyLiked: true, likes: Number(found.likes || 0), comments: found.comments || [] })
    }
  } else {
    const policy = await publicCommentPolicy(organizationId)
    if (!policy.enabled) return sendJson(res, 403, { ok: false, message: '这份报告暂时关闭了留言。' })
    const body = await readJson(req, 8 * 1024, '留言内容太长了。')
    content = String(body.content || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!content) return sendJson(res, 400, { ok: false, message: '请先填写评语。' })
    if (!takeRateToken(`comment:${visitor}`, policy.perIpPerHour, 3600 * 1000).ok) {
      return sendJson(res, 429, { ok: false, message: '留言太频繁了，休息一会儿再来吧。' })
    }
    const verdict = await checkContent({ organizationId }, content, { scope: 'public_comment', actor: `visitor:${visitor}` })
    if (!verdict.ok) return sendJson(res, 400, { ok: false, message: verdict.message })
    content = verdict.text
  }
  // 读 - 改 - 写之间没有 await，避免并发请求互相覆盖。
  const reports = readReports()
  const index = reports.findIndex((item) => item.shareToken === token && item.status === 'published')
  if (index < 0) return sendJson(res, 404, { ok: false, message: '报告尚未发布、已下架或分享链接无效。' })
  if (action === 'like') reports[index].likes = Number(reports[index].likes || 0) + 1
  else reports[index].comments = [...(reports[index].comments || []), { id: `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, content, createdAt: new Date().toISOString() }].slice(-100)
  writeReports(reports)
  return sendJson(res, 200, { ok: true, likes: reports[index].likes, comments: reports[index].comments })
}

/* ---------------- 账号管理列表附带封禁状态 ---------------- */

export async function withAccountBans(user, accounts) {
  if (!Array.isArray(accounts) || !accounts.length || !user?.organization?.id) return accounts
  const bans = await activeBansForUsers(user.organization.id, accounts.map((item) => item.id)).catch(() => ({}))
  return accounts.map((item) => ({ ...item, ban: bans[item.id] || null }))
}

/* ---------------- /api/me/safety 与 /api/admin/risk/* ---------------- */

const DEMO_SAFETY = { ban: null, aiPaused: false, message: '', quietHours: { enabled: false, start: '22:00', end: '06:00', active: false }, restReminderMinutes: 40 }

/** 返回 true 表示已经响应。后台接口都在 /api/admin/ 下，鉴权拦截已经要求管理员角色，这里各函数还会再校验机构管理范围。 */
export async function handleRiskRoutes(req, res, url, user, { sendJson, readJson }) {
  const send = (status, payload, headers) => { sendJson(res, status, payload, headers); return true }
  const method = req.method
  if (method === 'GET' && url.pathname === '/api/me/safety') {
    return send(200, { ok: true, ...(user ? await getSafetyStatus(user) : DEMO_SAFETY) })
  }
  if (!url.pathname.startsWith('/api/admin/risk/')) return false
  const path = url.pathname.slice('/api/admin/risk'.length)
  const params = Object.fromEntries(url.searchParams)
  const body = async (limit = 16 * 1024, message = '请求内容过大。') => readJson(req, limit, message)

  if (method === 'GET' && path === '/overview') return send(200, { ok: true, ...await riskOverview(user) })

  if (method === 'GET' && path === '/words') return send(200, { ok: true, ...await listRiskWords(user, params) })
  if (method === 'POST' && path === '/words') return send(201, { ok: true, ...await addRiskWords(user, await body(2 * 1024 * 1024, '一次导入的内容太多，请分批导入。')) })
  if (method === 'POST' && path === '/words/delete') return send(200, { ok: true, ...await deleteRiskWords(user, (await body(256 * 1024)).ids) })
  if (method === 'GET' && path === '/words/export') {
    const csv = await exportRiskWords(user)
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="risk-words.csv"; filename*=UTF-8''${encodeURIComponent('敏感词库.csv')}`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(csv)
    return true
  }
  const word = path.match(/^\/words\/([A-Za-z0-9_-]+)$/)
  if (word && method === 'PATCH') return send(200, { ok: true, word: await updateRiskWord(user, word[1], await body()) })
  if (word && method === 'DELETE') return send(200, { ok: true, ...await deleteRiskWords(user, [word[1]]) })

  if (method === 'GET' && path === '/rules') return send(200, { ok: true, ...await listRiskRules(user) })
  if (method === 'POST' && path === '/rules') return send(201, { ok: true, rule: await createRiskRule(user, await body()) })
  const rule = path.match(/^\/rules\/([A-Za-z0-9_-]+)$/)
  if (rule && method === 'PATCH') return send(200, { ok: true, rule: await updateRiskRule(user, rule[1], await body()) })
  if (rule && method === 'DELETE') return send(200, { ok: true, ...await deleteRiskRule(user, rule[1]) })

  if (method === 'GET' && path === '/settings') return send(200, { ok: true, ...await getRiskSettings(user) })
  if (method === 'PUT' && path === '/settings') return send(200, { ok: true, ...await updateRiskSettings(user, await body(32 * 1024)) })
  if (method === 'POST' && path === '/test') return send(200, { ok: true, ...await testRiskText(user, await body(32 * 1024)) })

  if (method === 'GET' && path === '/events') return send(200, { ok: true, ...await listRiskEvents(user, params) })
  if (method === 'POST' && path === '/events/handle') return send(200, { ok: true, ...await handleRiskEvents(user, await body(64 * 1024)) })

  if (method === 'GET' && path === '/bans') return send(200, { ok: true, ...await listRiskBans(user, params) })
  if (method === 'POST' && path === '/bans') return send(201, { ok: true, ban: await createRiskBan(user, await body()) })
  const lift = path.match(/^\/bans\/([A-Za-z0-9_-]+)\/lift$/)
  if (lift && method === 'POST') return send(200, { ok: true, ...await liftRiskBan(user, lift[1], await body()) })

  if (method === 'GET' && path === '/login-locks') return send(200, { ok: true, ...await listLoginLocks(user) })
  if (method === 'POST' && path === '/login-locks/clear') return send(200, { ok: true, ...await clearLoginLock(user, await body()) })

  return send(404, { ok: false, message: '接口不存在' })
}
