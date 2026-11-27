/* 风控中心：敏感词库、内容过滤规则、违规记录、封禁、登录保护、青少年使用设置。
 *
 * 一处判断，处处复用：AI 伙伴对话、AI 创作描述、作品公开发布、分享页留言、昵称都走 checkContent()。
 * - 词库匹配：先把文字统一成「NFKC（全角转半角）+ 小写 + 常见繁体转简体 + 去掉空格标点符号」，
 *   再用 Aho-Corasick 一次扫完，所以「色 情」「色.情」「ＳＢ」这类变形也能命中；
 *   打码时映射回原文位置，只替换命中的那几个字。
 * - 放行词（白名单）：被放行词完整盖住的命中不算数，用来消除"颜色情绪""做爱心卡片"这类误伤。
 * - 内置规则：联系方式（手机号 / 座机 / QQ / 微信 / 邮箱 / 身份证号）、网址链接、刷屏。
 * - 自定义规则：正则（限制长度、拒绝反向引用和嵌套重复，避免拖慢服务器）或「词A+词B」组合。
 * - 处理优先级：拦截 > 关注（放行但记录）> 打码 > 放行；公开场景会把打码 / 关注升级为拦截。
 * - 违规记录只保存打码后的片段；访客只记 IP 的带密钥哈希。
 * - 自动封禁只针对创作者账号（role = student），管理员和讲师不会被自动封禁。
 * 数据库不可用时退回内置词表在内存里判断（不记录、不封禁），保证"宁可多拦，不会全放"。
 */
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { logAudit } from './auth.js'
import { isDatabaseConfigured, query, withTransaction } from './db.js'
import { DEFAULT_RISK_WORDS, RISK_CATEGORIES } from './risk-default-words.js'

const here = dirname(fileURLToPath(import.meta.url))

export { RISK_CATEGORIES }
export const RISK_SCOPES = {
  chat: 'AI 伙伴对话',
  prompt: 'AI 创作描述',
  gallery: '作品公开发布',
  public_comment: '分享页留言',
  profile: '昵称资料',
}
export const RISK_ACTIONS = { block: '拦截', review: '关注', mask: '打码', allow: '放行' }
const SCOPE_KEYS = Object.keys(RISK_SCOPES)
const ACTION_RANK = { pass: 0, mask: 1, review: 2, block: 3 }
// 不同场景对同一个命中的处理：对话里打码就够了；公开场景里打码后的脏话也不该出现，直接拦下。
const SCOPE_POLICY = {
  chat: { mask: 'mask', review: 'review' },
  prompt: { mask: 'mask', review: 'review' },
  gallery: { mask: 'block', review: 'review' },
  public_comment: { mask: 'block', review: 'block' },
  profile: { mask: 'block', review: 'block' },
}
const WORD_SOURCES = new Set(['builtin', 'manual', 'import'])
const MAX_CHECK_CHARS = 20000
const MAX_WORD_CHARS = 30
const MAX_WORDS_PER_ORG = 50000
const MAX_WORDS_PER_BATCH = 2000
const MAX_CUSTOM_RULES = 200
const STATE_TTL_MS = 30_000
const BAN_CACHE_MS = 10_000
const EVENT_RETENTION_DAYS = 180
const LOGIN_ACCOUNT_LIMIT = Math.max(3, Number(process.env.LOGIN_MAX_FAILURES || 5))
const LOGIN_IP_LIMIT = Math.max(10, Number(process.env.LOGIN_IP_MAX_FAILURES || 50))
const LOGIN_LOCK_MAX_MINUTES = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES || 15))
// 同一网络里每个账号登录成功一次（每 15 分钟最多一次）抵扣几次失败；设成 0 表示不抵扣。
const LOGIN_IP_SUCCESS_CREDIT = Math.min(20, Math.max(0, Math.floor(Number(process.env.LOGIN_IP_SUCCESS_CREDIT ?? 3) || 0)))
const APP_TIMEZONE = validTimeZone(process.env.APP_TIMEZONE) || 'Asia/Shanghai'

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  scopes: Object.fromEntries(SCOPE_KEYS.map((key) => [key, true])),
  blockMessage: '内容里有不适合的词语，换个说法再试试吧。',
  banPolicy: { enabled: true, windowMinutes: 60, threshold: 5, durations: [30, 1440, 10080], scope: 'ai' },
  publicComments: { enabled: true, perIpPerHour: 6 },
  youth: { restReminderMinutes: 40, quietHours: { enabled: false, start: '22:00', end: '06:00' } },
})

/* ---------------- 基础工具 ---------------- */

function fail(message, statusCode = 400, data = null) {
  const error = new Error(message)
  error.statusCode = statusCode
  if (data) error.data = data
  return error
}

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function clean(value, max = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value))
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validTimeZone(value) {
  const zone = String(value || '').trim()
  if (!zone) return ''
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return ''
  }
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&')
}

function formatLocal(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: APP_TIMEZONE, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

let hashKey = null
/** 带密钥的哈希：IP 只有 40 亿种，裸 SHA-256 几秒就能反查，所以混入服务器密钥。 */
export function riskHash(value) {
  if (!hashKey) {
    const secret = process.env.RISK_HASH_SECRET || process.env.AI_CREDENTIAL_ENCRYPTION_KEY || process.env.DATABASE_URL || 'ai-art-local'
    hashKey = createHash('sha256').update(`ai-art-risk|${secret}`).digest()
  }
  return createHmac('sha256', hashKey).update(String(value)).digest('hex')
}

let proxyWarningShown = false

/** 只有在 TRUST_PROXY=true（前面有自己的 Nginx 等反向代理）时才相信转发头，否则任何人都能伪造 IP。 */
export function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true') {
    const real = String(req.headers['x-real-ip'] || '').trim()
    if (real) return real.slice(0, 64)
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((item) => item.trim()).filter(Boolean)
    // 最右边那个是离我们最近的代理写进去的，前面的都可能被客户端伪造。
    if (forwarded.length) return forwarded[forwarded.length - 1].slice(0, 64)
  }
  const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64)
  // 请求从本机代理转进来、还带着转发头，却没开 TRUST_PROXY：所有访客都会被当成同一个 IP。提醒一次。
  if (!proxyWarningShown && process.env.TRUST_PROXY !== 'true' && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']) && /^(127\.|::1$)/.test(remote)) {
    proxyWarningShown = true
    console.warn('[risk] 请求经过了反向代理（带 X-Forwarded-For / X-Real-IP），但 server/.env 没有设置 TRUST_PROXY=true：所有访客都会被当成同一个 IP，登录保护和访客限流可能把所有人一起锁住。确认前面是自己的 Nginx 后，请加上 TRUST_PROXY=true 并重启。')
  }
  return remote
}

/** IP 只留前两段给管理员认网络（例如 183.21.*.*），本机地址直接写明。 */
function ipHint(ip) {
  const value = String(ip || '')
  if (/^(127\.|::1$)/.test(value)) return '本机地址'
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return `${value.split('.').slice(0, 2).join('.')}.*.*`
  if (value.includes(':')) return `${value.split(':').filter(Boolean).slice(0, 2).join(':')}:*`
  return ''
}

export function visitorKey(req) {
  return riskHash(`visitor|${clientIp(req)}`).slice(0, 16)
}

/* ---------------- 文字归一化 ---------------- */

// 只收录词表里会用到、且和简体写法不同的繁体字；更完整的繁简转换请接专业内容安全服务。
const TRAD_PAIRS = '黃黄 網网 視视 頻频 體体 約约 賣卖 愛爱 澀涩 圖图 優优 強强 亂乱 倫伦 寫写 脫脱 屍尸 殺杀 動动 斬斩 頭头 槍枪 賭赌 場场 樂乐 機机 時时 錢钱 資资 販贩 搖摇 鴉鸦 殘残 輕轻 沒没 樓楼 藥药 腦脑 賤贱 東东 製制 彈弹 買买 辦办 證证 詐诈 騙骗 擊击 盜盗 號号 單单 結结 賺赚 費费 領领 掃扫 碼码 羣群 價价 戲戏 練练 貸贷 園园 癡痴 滾滚 筆笔 媽妈 傷伤 姦奸 鬥斗 戰战'
const TO_SIMPLIFIED = new Map(TRAD_PAIRS.split(' ').map((pair) => [pair[0], pair[1]]))
const CN_DIGITS = new Map(Object.entries({
  零: '0', 〇: '0', 一: '1', 幺: '1', 壹: '1', 二: '2', 贰: '2', 三: '3', 叁: '3', 四: '4', 肆: '4',
  五: '5', 伍: '5', 六: '6', 陆: '6', 七: '7', 柒: '7', 八: '8', 捌: '8', 九: '9', 玖: '9',
}))
const DICT_SKIP = /[\s\p{P}\p{S}\p{Cf}\p{Mn}\p{Me}\p{Cc}]/u
const PLAIN_SKIP = /\p{Cf}/u

/**
 * 把原文逐个字符归一化，返回归一化后的字符串 str 和位置表 map（str[i] 来自原文第 map[i] 个字符）。
 * 少数生僻的扩展区字符（emoji 等）替换成 U+FFFD，保证 str 里一个下标就是一个字符。
 */
function buildForm(points, skip, mapChar) {
  let str = ''
  const map = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const normalized = point.codePointAt(0) < 0x80 ? point.toLowerCase() : point.normalize('NFKC').toLowerCase()
    for (const raw of normalized) {
      const ch = mapChar ? (mapChar.get(raw) || raw) : raw
      if (skip.test(ch)) continue
      str += ch.length > 1 ? '�' : ch
      map.push(index)
    }
  }
  return { str, map }
}

function normalizedKey(word) {
  return buildForm(Array.from(String(word || '')), DICT_SKIP, TO_SIMPLIFIED).str
}

function lazyForms(points) {
  const cache = {}
  return {
    get dict() { return cache.dict || (cache.dict = buildForm(points, DICT_SKIP, TO_SIMPLIFIED)) },
    get contact() { return cache.contact || (cache.contact = buildForm(points, DICT_SKIP, CN_DIGITS)) },
    get plain() { return cache.plain || (cache.plain = buildForm(points, PLAIN_SKIP, TO_SIMPLIFIED)) },
  }
}

/* ---------------- Aho-Corasick 多模式匹配 ---------------- */

function buildMatcher(entries) {
  const nodes = [{ next: new Map(), fail: 0, out: [] }]
  entries.forEach((entry, index) => {
    let node = 0
    for (const ch of entry.key) {
      let child = nodes[node].next.get(ch)
      if (child === undefined) {
        child = nodes.length
        nodes.push({ next: new Map(), fail: 0, out: [] })
        nodes[node].next.set(ch, child)
      }
      node = child
    }
    nodes[node].out.push(index)
  })
  const queue = [...nodes[0].next.values()]
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]
    for (const [ch, child] of nodes[current].next) {
      let fallback = nodes[current].fail
      while (fallback && !nodes[fallback].next.has(ch)) fallback = nodes[fallback].fail
      const target = nodes[fallback].next.get(ch)
      nodes[child].fail = target !== undefined && target !== child ? target : 0
      const inherited = nodes[nodes[child].fail].out
      if (inherited.length) nodes[child].out = nodes[child].out.concat(inherited)
      queue.push(child)
    }
  }
  return { nodes, entries }
}

function scanMatcher(matcher, str) {
  const { nodes, entries } = matcher
  const hits = []
  let node = 0
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i]
    while (node && !nodes[node].next.has(ch)) node = nodes[node].fail
    node = nodes[node].next.get(ch) ?? 0
    const out = nodes[node].out
    for (let k = 0; k < out.length; k += 1) {
      const entry = entries[out[k]]
      hits.push({ entry, start: i - entry.key.length + 1, end: i })
    }
    if (hits.length > 2000) break
  }
  return hits
}

/* ---------------- 内置规则 ---------------- */

const CONTACT_PATTERNS = [
  /(?<!\d)(?:86)?1[3-9]\d{9}(?!\d)/g, // 手机号（可带 86）
  /(?<!\d)0\d{2,3}[2-9]\d{6,7}(?!\d)/g, // 座机：区号 + 号码
  /(?<!\d)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dx](?!\d)/g, // 身份证号
  /(?:qq|扣扣|企鹅|q号|球球)(?:号码|号)?(?:是|为)?\d{5,11}(?!\d)/g,
  /(?:微信|威信|薇信|徽信|v信|vx|wx|weixin|wechat)(?:号码|号)?(?:是|为)?[a-z\d]{6,20}/g,
]
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g
const TLDS = 'com|cn|net|org|top|xyz|vip|cc|io|me|info|club|site|online|shop|app|link|ink|wang|ltd|tv|co|biz|pro|fun|icu|work|live|store|tech|cloud|asia|tk|ml|ga|cf|gq|hk|tw|jp|us|uk'
const URL_PATTERN = new RegExp(String.raw`(?:https?:\/\/|www\.)[^\s]+|(?<![a-z0-9@.-])[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.(?:${TLDS})(?![a-z0-9-])(?:\/[^\s]*)?`, 'g')
const SPAM_PATTERN = /(.)\1{14,}/gsu

function findAll(regex, form) {
  const spans = []
  regex.lastIndex = 0
  let match
  while ((match = regex.exec(form.str)) !== null) {
    if (!match[0]) { regex.lastIndex += 1; continue }
    const start = form.map[match.index]
    const end = form.map[match.index + match[0].length - 1]
    if (start !== undefined && end !== undefined) spans.push({ start, end })
    if (spans.length >= 50) break
  }
  return spans
}

const BUILTIN_RULES = {
  contact_info: {
    name: '联系方式保护',
    description: '识别手机号、座机、QQ、微信、邮箱、身份证号。对话和创作描述里自动打码（不会发给 AI），公开发布和留言里直接拦截。',
    category: 'privacy', action: 'mask', scopes: [...SCOPE_KEYS],
    message: '为了保护隐私，请不要留下电话、QQ、微信等联系方式。',
    find: (forms) => [...CONTACT_PATTERNS.flatMap((pattern) => findAll(pattern, forms.contact)), ...findAll(EMAIL_PATTERN, forms.plain)],
  },
  url: {
    name: '网址链接',
    description: '识别网址和域名，防止在公开场合把人引到站外。',
    category: 'ads', action: 'block', scopes: ['gallery', 'public_comment', 'profile'],
    message: '暂时不支持发送网址链接。',
    find: (forms) => findAll(URL_PATTERN, forms.plain),
  },
  spam_repeat: {
    name: '刷屏',
    description: '同一个字或表情连续重复 15 次以上。',
    category: 'spam', action: 'block', scopes: ['gallery', 'public_comment', 'profile'],
    message: '请不要重复刷屏。',
    find: (forms) => findAll(SPAM_PATTERN, forms.plain),
  },
}

function parseCombo(pattern) {
  return String(pattern || '').split(/[\r\n|]+/).map((line) => line.split(/[+＋]/).map((part) => normalizedKey(part)).filter(Boolean))
    .filter((parts) => parts.length >= 2)
}

function findCombo(groups, form) {
  const spans = []
  for (const parts of groups) {
    const positions = parts.map((part) => form.str.indexOf(part))
    if (positions.some((index) => index < 0)) continue
    parts.forEach((part, k) => spans.push({ start: form.map[positions[k]], end: form.map[positions[k] + part.length - 1] }))
  }
  return spans
}

function rowScopes(value) {
  const list = Array.isArray(value) ? value : []
  return list.filter((item) => SCOPE_KEYS.includes(item))
}

function compileRule(row) {
  const base = {
    id: row.id, key: row.rule_key, kind: row.kind, name: row.name, category: RISK_CATEGORIES[row.category] ? row.category : 'other',
    action: ACTION_RANK[row.action] ? row.action : 'block', scopes: rowScopes(row.scopes), enabled: row.enabled !== false, counted: true, message: '',
  }
  if (row.kind === 'builtin') {
    const definition = BUILTIN_RULES[row.rule_key]
    if (!definition) return null
    return { ...base, name: definition.name, category: definition.category, counted: false, message: definition.message, find: definition.find }
  }
  if (row.kind === 'regex') {
    let regex
    try { regex = new RegExp(row.pattern, 'giu') } catch { return null }
    return { ...base, find: (forms) => findAll(regex, forms.plain) }
  }
  if (row.kind === 'combo') {
    const groups = parseCombo(row.pattern)
    return groups.length ? { ...base, find: (forms) => findCombo(groups, forms.dict) } : null
  }
  return null
}

function builtinRuleRows() {
  return Object.entries(BUILTIN_RULES).map(([key, definition]) => ({
    id: `builtin-${key}`, rule_key: key, kind: 'builtin', name: definition.name, category: definition.category,
    action: definition.action, scopes: definition.scopes, enabled: true,
  }))
}

/* ---------------- 设置 ---------------- */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function normalizeRiskSettings(input = {}) {
  const source = isObject(input) ? input : {}
  const ban = isObject(source.banPolicy) ? source.banPolicy : {}
  const comments = isObject(source.publicComments) ? source.publicComments : {}
  const youth = isObject(source.youth) ? source.youth : {}
  const quiet = isObject(youth.quietHours) ? youth.quietHours : {}
  const durations = (Array.isArray(ban.durations) ? ban.durations : DEFAULT_SETTINGS.banPolicy.durations)
    .map((value) => Math.round(Number(value))).filter((value) => Number.isFinite(value) && value >= 5 && value <= 525600).slice(0, 5)
  const rest = Math.round(Number(youth.restReminderMinutes ?? DEFAULT_SETTINGS.youth.restReminderMinutes))
  return {
    enabled: source.enabled !== false,
    scopes: Object.fromEntries(SCOPE_KEYS.map((key) => [key, source.scopes?.[key] !== false])),
    blockMessage: clean(source.blockMessage, 100) || DEFAULT_SETTINGS.blockMessage,
    banPolicy: {
      enabled: ban.enabled !== false,
      windowMinutes: clampInt(ban.windowMinutes, 5, 1440, DEFAULT_SETTINGS.banPolicy.windowMinutes),
      threshold: clampInt(ban.threshold, 2, 50, DEFAULT_SETTINGS.banPolicy.threshold),
      durations: durations.length ? durations : [...DEFAULT_SETTINGS.banPolicy.durations],
      scope: ban.scope === 'all' ? 'all' : 'ai',
    },
    publicComments: {
      enabled: comments.enabled !== false,
      perIpPerHour: clampInt(comments.perIpPerHour, 1, 60, DEFAULT_SETTINGS.publicComments.perIpPerHour),
    },
    youth: {
      restReminderMinutes: rest === 0 ? 0 : clampInt(rest, 10, 180, DEFAULT_SETTINGS.youth.restReminderMinutes),
      quietHours: {
        enabled: quiet.enabled === true,
        start: TIME_PATTERN.test(quiet.start) ? quiet.start : DEFAULT_SETTINGS.youth.quietHours.start,
        end: TIME_PATTERN.test(quiet.end) ? quiet.end : DEFAULT_SETTINGS.youth.quietHours.end,
      },
    },
  }
}

function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0)
  return (hour % 24) * 60 + minute
}

function toMinutes(value) {
  const [hour, minute] = String(value).split(':').map(Number)
  return hour * 60 + minute
}

export function quietHoursActive(settings, now = new Date()) {
  const quiet = settings?.youth?.quietHours
  if (!quiet?.enabled) return false
  const start = toMinutes(quiet.start)
  const end = toMinutes(quiet.end)
  if (start === end) return false
  const minutes = localMinutes(now)
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

/* ---------------- 机构风控状态（带缓存） ---------------- */

let schemaPromise = null
const seededOrganizations = new Set()
const stateCache = new Map()
let defaultStateCache = null

/** 首次使用时自动建表；部署时也会由 pnpm db:migrate 执行同一份 SQL。 */
export function ensureRiskSchema() {
  if (!schemaPromise) {
    schemaPromise = query(readFileSync(join(here, 'risk-schema.sql'), 'utf8')).catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  return schemaPromise
}

function createState({ organizationId, settings, words, ruleRows, persistent, version = '' }) {
  const entries = []
  for (const word of words) {
    const key = normalizedKey(word.word)
    if (!key) continue
    entries.push({ key, id: word.id, word: word.word, category: RISK_CATEGORIES[word.category] ? word.category : 'other', action: word.action })
  }
  return {
    organizationId, settings, persistent, version,
    matcher: buildMatcher(entries),
    rules: ruleRows.map(compileRule).filter(Boolean),
    wordCount: entries.length,
  }
}

function defaultState() {
  if (!defaultStateCache) {
    defaultStateCache = createState({
      organizationId: '', settings: normalizeRiskSettings({}), persistent: false,
      words: DEFAULT_RISK_WORDS.map((word, index) => ({ id: `default-${index}`, ...word })),
      ruleRows: builtinRuleRows(),
    })
  }
  return defaultStateCache
}

/** 首次用到某个机构时写入内置词表（只写一次，管理员删掉的词不会被自动写回）；内置规则缺哪条补哪条。 */
async function ensureRiskSeed(organizationId) {
  if (seededOrganizations.has(organizationId)) return
  await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`risk-seed:${organizationId}`])
    const existing = (await client.query('SELECT seeded_at FROM risk_settings WHERE organization_id = $1', [organizationId])).rows[0]
    if (!existing?.seeded_at) {
      const words = DEFAULT_RISK_WORDS
      await client.query(
        `INSERT INTO risk_words (id, organization_id, word, category, action, source)
         SELECT unnest($1::text[]), $2, unnest($3::text[]), unnest($4::text[]), unnest($5::text[]), 'builtin'
         ON CONFLICT DO NOTHING`,
        [words.map(() => newId('rw')), organizationId, words.map((item) => item.word), words.map((item) => item.category), words.map((item) => item.action)],
      )
      await client.query(
        `INSERT INTO risk_settings (organization_id, settings, seeded_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (organization_id) DO UPDATE SET seeded_at = now()`,
        [organizationId, JSON.stringify(normalizeRiskSettings({}))],
      )
    }
    const rules = builtinRuleRows()
    await client.query(
      `INSERT INTO risk_rules (id, organization_id, rule_key, name, kind, category, scopes, action)
       SELECT unnest($1::text[]), $2, unnest($3::text[]), unnest($4::text[]), 'builtin', unnest($5::text[]), unnest($6::jsonb[]), unnest($7::text[])
       ON CONFLICT DO NOTHING`,
      [rules.map(() => newId('rr')), organizationId, rules.map((rule) => rule.rule_key), rules.map((rule) => rule.name),
        rules.map((rule) => rule.category), rules.map((rule) => JSON.stringify(rule.scopes)), rules.map((rule) => rule.action)],
    )
  })
  seededOrganizations.add(organizationId)
}

async function stateVersion(organizationId) {
  const { rows } = await query(
    `SELECT
       (SELECT concat(count(*), ':', coalesce(max(updated_at)::text, '')) FROM risk_words WHERE organization_id = $1) AS words,
       (SELECT concat(count(*), ':', coalesce(max(updated_at)::text, '')) FROM risk_rules WHERE organization_id = $1) AS rules,
       (SELECT coalesce(updated_at::text, '') FROM risk_settings WHERE organization_id = $1) AS settings`,
    [organizationId],
  )
  const row = rows[0] || {}
  return `${row.words}|${row.rules}|${row.settings}`
}

async function buildState(organizationId) {
  await ensureRiskSchema()
  await ensureRiskSeed(organizationId)
  const version = await stateVersion(organizationId)
  const [settingsResult, wordsResult, rulesResult] = await Promise.all([
    query('SELECT settings FROM risk_settings WHERE organization_id = $1', [organizationId]),
    query('SELECT id, word, category, action FROM risk_words WHERE organization_id = $1 AND enabled', [organizationId]),
    query('SELECT * FROM risk_rules WHERE organization_id = $1', [organizationId]),
  ])
  return createState({
    organizationId, persistent: true, version,
    settings: normalizeRiskSettings(settingsResult.rows[0]?.settings),
    words: wordsResult.rows,
    ruleRows: rulesResult.rows,
  })
}

export async function loadRiskState(organizationId) {
  if (!organizationId || !isDatabaseConfigured()) return defaultState()
  const now = Date.now()
  const cached = stateCache.get(organizationId)
  if (cached && cached.checkedAt + STATE_TTL_MS > now) return cached.promise
  const promise = (async () => {
    if (cached) {
      // 过期后先比一下版本：词库没变就沿用，不必每 30 秒重建一次匹配树。
      try {
        const previous = await cached.promise
        if (previous.persistent && (await stateVersion(organizationId)) === previous.version) return previous
      } catch {}
    }
    return buildState(organizationId)
  })()
  stateCache.set(organizationId, { promise, checkedAt: now })
  promise.catch(() => { if (stateCache.get(organizationId)?.promise === promise) stateCache.delete(organizationId) })
  return promise
}

export function invalidateRiskState(organizationId) {
  stateCache.delete(organizationId)
}

export const defaultRiskState = () => defaultState()

const failedStates = new Map()
async function stateFor(subject) {
  const organizationId = subject?.organization?.id || subject?.organizationId || ''
  // 读库失败后 60 秒内直接用内置词表，避免每个请求都去撞一次坏掉的数据库、刷满日志。
  const failedAt = failedStates.get(organizationId)
  if (failedAt && failedAt + 60_000 > Date.now()) return defaultState()
  try {
    return await loadRiskState(organizationId)
  } catch (error) {
    failedStates.set(organizationId, Date.now())
    console.error('[risk] 读取风控配置失败，暂时改用内置词表：', error.message)
    return defaultState()
  }
}

/* ---------------- 判断 ---------------- */

function escalate(action, policy) {
  if (action === 'mask') return policy.mask
  if (action === 'review') return policy.review
  return action
}

/**
 * 同步判断一段文字（不记录、不封禁）。AI 回复流式输出时每来一段就要判断一次，所以必须是同步的。
 * 返回：action（pass / mask / review / block）、text（打码后的可用文本）、safeText（所有命中都打码，用于存档）、
 * hits、categories、message（拦截时给用户看的话）、selfHarm（是否流露自伤念头）、counted（是否计入违规次数）。
 */
export function evaluateText(state, input, scope) {
  const original = String(input ?? '')
  const base = { action: 'pass', text: original, safeText: original, excerpt: '', hits: [], categories: [], message: '', selfHarm: false, counted: false }
  if (!original.trim() || !state?.settings?.enabled || !SCOPE_POLICY[scope] || state.settings.scopes?.[scope] === false) return base
  const policy = SCOPE_POLICY[scope]
  let points = Array.from(original)
  let rest = ''
  if (points.length > MAX_CHECK_CHARS) {
    rest = points.slice(MAX_CHECK_CHARS).join('')
    points = points.slice(0, MAX_CHECK_CHARS)
  }
  const forms = lazyForms(points)
  const spans = []

  const rawHits = scanMatcher(state.matcher, forms.dict.str)
  const allows = rawHits.filter((hit) => hit.entry.action === 'allow')
  for (const hit of rawHits) {
    if (hit.entry.action === 'allow' || !ACTION_RANK[hit.entry.action]) continue
    if (allows.some((allow) => allow.start <= hit.start && allow.end >= hit.end)) continue
    const action = escalate(hit.entry.action, policy)
    spans.push({
      start: forms.dict.map[hit.start], end: forms.dict.map[hit.end], action, source: 'word', id: hit.entry.id, label: hit.entry.word,
      category: hit.entry.category, counted: action === 'block' && hit.entry.category !== 'self_harm', message: '',
    })
  }
  for (const rule of state.rules) {
    if (!rule.enabled || !rule.scopes.includes(scope)) continue
    const action = escalate(rule.action, policy)
    for (const span of rule.find(forms)) {
      spans.push({ ...span, action, source: 'rule', id: rule.id, label: rule.name, category: rule.category, counted: rule.counted && action === 'block', message: rule.message })
    }
  }
  const valid = spans.filter((span) => span.start !== undefined && span.end !== undefined && span.end >= span.start)
  if (!valid.length) return base

  let action = 'pass'
  for (const span of valid) if (ACTION_RANK[span.action] > ACTION_RANK[action]) action = span.action
  const allMasked = new Set()
  const maskOnly = new Set()
  for (const span of valid) {
    for (let index = span.start; index <= span.end; index += 1) {
      allMasked.add(index)
      if (span.action === 'mask') maskOnly.add(index)
    }
  }
  const rebuild = (set) => points.map((ch, index) => (set.has(index) ? '*' : ch)).join('') + rest
  const safeText = rebuild(allMasked)
  const first = Math.min(...valid.map((span) => span.start))
  const from = Math.max(0, first - 30)
  const blocker = valid.find((span) => span.action === 'block')
  const seen = new Set()
  const hits = []
  for (const span of [...valid].sort((a, b) => ACTION_RANK[b.action] - ACTION_RANK[a.action])) {
    const key = `${span.source}:${span.id}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({ source: span.source, id: span.id, label: span.label, category: span.category, action: span.action })
  }
  return {
    action,
    text: action === 'block' ? safeText : rebuild(maskOnly),
    safeText,
    excerpt: Array.from(safeText).slice(from, from + 120).join(''),
    hits: hits.slice(0, 20),
    categories: [...new Set(hits.map((hit) => hit.category))],
    message: blocker ? (blocker.message || state.settings.blockMessage) : '',
    selfHarm: valid.some((span) => span.category === 'self_harm'),
    counted: valid.some((span) => span.counted),
  }
}

/** 给流式输出用：预先拿到机构的风控状态，之后同步判断。 */
export async function riskCheckerFor(subject) {
  const state = await stateFor(subject)
  return (text, scope = 'chat') => evaluateText(state, text, scope)
}

const lastPurge = new Map()
function maybePurge(organizationId) {
  const now = Date.now()
  if ((lastPurge.get(organizationId) || 0) + 6 * 3600 * 1000 > now) return
  lastPurge.set(organizationId, now)
  query(`DELETE FROM risk_events WHERE organization_id = $1 AND created_at < now() - make_interval(days => $2)`, [organizationId, EVENT_RETENTION_DAYS]).catch(() => {})
  maybePurgeLogins()
}

// 登录计数单独清理：以前只在记录违规事件时顺带清，长期没有违规事件时，乱填账号的失败记录会一直堆着。
let lastLoginPurge = 0
function maybePurgeLogins() {
  const now = Date.now()
  if (lastLoginPurge + 6 * 3600 * 1000 > now) return
  lastLoginPurge = now
  query(`DELETE FROM login_attempts WHERE updated_at < now() - interval '1 day' AND (locked_until IS NULL OR locked_until < now())`).catch(() => {})
  query(`DELETE FROM login_ip_credits WHERE credited_at < now() - interval '1 day'`).catch(() => {})
}

async function recordRiskEvent(state, subject, verdict, { scope, actor, counted }) {
  const organizationId = state.organizationId
  const userId = subject?.organization?.id && subject?.id ? subject.id : null
  const primary = verdict.hits[0]
  await query(
    `INSERT INTO risk_events (id, organization_id, user_id, actor, scope, action, category, hits, excerpt, counted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
    [newId('rev'), organizationId, userId, clean(actor, 60), scope, verdict.action, primary?.category || '', JSON.stringify(verdict.hits.slice(0, 10)), verdict.excerpt.slice(0, 120), counted],
  )
  const wordIds = verdict.hits.filter((hit) => hit.source === 'word').map((hit) => hit.id)
  const ruleIds = verdict.hits.filter((hit) => hit.source === 'rule').map((hit) => hit.id)
  // 只更新命中次数，不碰 updated_at，否则每次命中都会让缓存的匹配树失效重建。
  if (wordIds.length) await query('UPDATE risk_words SET hit_count = hit_count + 1, last_hit_at = now() WHERE organization_id = $1 AND id = ANY($2::text[])', [organizationId, wordIds])
  if (ruleIds.length) await query('UPDATE risk_rules SET hit_count = hit_count + 1, last_hit_at = now() WHERE organization_id = $1 AND id = ANY($2::text[])', [organizationId, ruleIds])
  maybePurge(organizationId)
}

const ACTIVE_BAN_SQL = `SELECT * FROM risk_bans
  WHERE organization_id = $1 AND user_id = $2 AND lifted_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
  ORDER BY (scope = 'all') DESC, ends_at DESC NULLS FIRST LIMIT 1`

async function maybeAutoBan(state, user) {
  const policy = state.settings.banPolicy
  if (!policy.enabled) return null
  const organizationId = state.organizationId
  const ban = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`risk-ban:${organizationId}:${user.id}`])
    if ((await client.query(ACTIVE_BAN_SQL, [organizationId, user.id])).rows[0]) return null
    // 只数上一次封禁之后的违规，否则解封后再犯一次就会立刻被封。
    const counted = (await client.query(
      `SELECT count(*)::int AS n FROM risk_events
       WHERE organization_id = $1 AND user_id = $2 AND counted AND created_at > now() - make_interval(mins => $3)
         AND created_at > COALESCE((SELECT GREATEST(max(created_at), max(lifted_at)) FROM risk_bans WHERE organization_id = $1 AND user_id = $2), '-infinity'::timestamptz)`,
      [organizationId, user.id, policy.windowMinutes],
    )).rows[0].n
    if (counted < policy.threshold) return null
    const previous = (await client.query(
      `SELECT count(*)::int AS n FROM risk_bans WHERE organization_id = $1 AND user_id = $2 AND source = 'auto' AND created_at > now() - interval '30 days'`,
      [organizationId, user.id],
    )).rows[0].n
    const minutes = policy.durations[Math.min(previous, policy.durations.length - 1)]
    const inserted = (await client.query(
      `INSERT INTO risk_bans (id, organization_id, user_id, scope, reason, source, ends_at)
       VALUES ($1, $2, $3, $4, $5, 'auto', now() + make_interval(mins => $6)) RETURNING *`,
      [newId('rban'), organizationId, user.id, policy.scope, `${policy.windowMinutes} 分钟内 ${counted} 次发送不适合的内容（第 ${previous + 1} 次自动处理）`, minutes],
    )).rows[0]
    if (policy.scope === 'all') await client.query('DELETE FROM sessions WHERE user_id = $1', [user.id])
    return inserted
  })
  if (ban) {
    banCache.delete(user.id)
    await logAudit(null, organizationId, 'risk.ban.auto', 'user', user.id, { banId: ban.id, scope: ban.scope, endsAt: ban.ends_at }).catch(() => {})
  }
  return ban
}

/**
 * 判断 + 记录 + 必要时自动封禁。subject 是登录用户，或访客时传 { organizationId }。
 * 返回 evaluateText 的结果，外加 ok（没被拦截）和 banned（这次触发了自动封禁时的封禁信息）。
 */
export async function checkContent(subject, text, { scope = 'chat', record = true, countForBan = true, actor = '' } = {}) {
  const state = await stateFor(subject)
  const verdict = evaluateText(state, text, scope)
  if (!record) return { ...verdict, ok: verdict.action !== 'block', banned: null }
  return recordVerdict(subject, verdict, { scope, countForBan, actor, state })
}

/** 已经用 evaluateText 判断过（比如同步流程里），再补记录和自动封禁。 */
export async function recordVerdict(subject, verdict, { scope = 'chat', countForBan = true, actor = '', state = null } = {}) {
  const result = { ...verdict, ok: verdict.action !== 'block', banned: null }
  const current = state || await stateFor(subject)
  if (verdict.action === 'pass' || !current.persistent) return result
  const counted = countForBan && verdict.counted && subject?.role === 'student' && Boolean(subject?.id)
  try {
    await recordRiskEvent(current, subject, verdict, { scope, actor, counted })
    if (counted && verdict.action === 'block') {
      const ban = await maybeAutoBan(current, subject)
      if (ban) {
        result.banned = publicBan(ban)
        result.message = result.banned.message
      }
    }
  } catch (error) {
    console.error('[risk] 记录违规失败：', error.message)
  }
  return result
}

/** 常用写法：拦截就抛 400（带友好提示），否则返回可用的文本（可能已打码）。 */
export async function guardText(subject, text, options = {}) {
  const verdict = await checkContent(subject, text, options)
  if (!verdict.ok) throw fail(verdict.message, verdict.banned ? 403 : 400, { code: verdict.banned ? 'ai_paused' : 'content_blocked', categories: verdict.categories, ban: verdict.banned })
  return verdict.text
}

/* ---------------- 封禁 ---------------- */

const banCache = new Map()

export async function getActiveBan(user) {
  if (!user?.id || !user?.organization?.id || !isDatabaseConfigured()) return null
  const now = Date.now()
  const cached = banCache.get(user.id)
  if (cached && cached.expiresAt > now) {
    const ban = cached.ban
    return ban && (!ban.ends_at || new Date(ban.ends_at).getTime() > now) ? ban : null
  }
  await ensureRiskSchema()
  const ban = (await query(ACTIVE_BAN_SQL, [user.organization.id, user.id])).rows[0] || null
  if (banCache.size > 5000) banCache.clear()
  banCache.set(user.id, { ban, expiresAt: now + BAN_CACHE_MS })
  return ban
}

export function publicBan(ban) {
  if (!ban) return null
  const endsAt = ban.ends_at ? new Date(ban.ends_at).toISOString() : null
  const until = endsAt ? `，将在 ${formatLocal(endsAt)} 恢复` : '，如有疑问请联系管理员'
  const message = ban.scope === 'all'
    ? `这个账号已暂停使用${until}。`
    : `${ban.source === 'auto' ? '因为多次发送不适合的内容，' : ''}AI 创作和作品发布暂停使用${until}。`
  return { id: ban.id, scope: ban.scope, scopeLabel: ban.scope === 'all' ? '暂停登录' : '暂停 AI 与发布', source: ban.source, endsAt, permanent: !endsAt, message }
}

/** AI 创作 / 发布前调用：被封禁或处在休息时段（仅创作者账号）就抛 403。 */
export async function assertAiAllowed(user, knownBan) {
  const ban = knownBan === undefined ? await getActiveBan(user) : knownBan
  if (ban) {
    const view = publicBan(ban)
    throw fail(view.message, 403, { code: 'ai_paused', ban: view })
  }
  if (user?.role === 'student') {
    const state = await stateFor(user)
    if (quietHoursActive(state.settings)) {
      const quiet = state.settings.youth.quietHours
      throw fail(`现在是休息时间（${quiet.start}–${quiet.end}），好好休息，明天再来创作吧～`, 403, { code: 'quiet_hours', quietHours: quiet })
    }
  }
}

/** 前端用：当前账号的封禁、休息时段、护眼提醒间隔。 */
export async function getSafetyStatus(user) {
  const state = await stateFor(user)
  const ban = await getActiveBan(user).catch(() => null)
  const creator = user?.role === 'student'
  const quiet = state.settings.youth.quietHours
  const quietActive = creator && quietHoursActive(state.settings)
  const banView = publicBan(ban)
  return {
    ban: banView,
    aiPaused: Boolean(ban) || quietActive,
    message: banView?.message || (quietActive ? `现在是休息时间（${quiet.start}–${quiet.end}），明天再来创作吧～` : ''),
    quietHours: { enabled: creator && quiet.enabled, start: quiet.start, end: quiet.end, active: quietActive },
    restReminderMinutes: creator ? state.settings.youth.restReminderMinutes : 0,
  }
}

export async function deleteUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

/* ---------------- 登录保护 ---------------- */

function loginKeys({ organizationCode, account, ip }, organizationId) {
  const org = String(organizationCode || '').trim().toLowerCase()
  const name = String(account || '').trim().toLowerCase()
  return {
    accountKey: riskHash(`login-account|${org}|${name}`),
    // 网络（IP）计数按要登录的机构分开：A 校的失败不会锁住 B 校，管理员也只能看到、解除自己机构的。
    // 机构代码不存在的都归到同一个「未知机构」桶，换着乱填机构代码也绕不开。
    ipKey: riskHash(`login-ip|${organizationId || '?'}|${ip || ''}`),
  }
}

/** 一次登录请求只查一次「机构 + 账号」，三个环节（登录前检查、失败计数、成功清零）共用。 */
function loginContext(input) {
  if (!input.context) {
    input.context = query(
      `SELECT o.id AS organization_id, u.id AS user_id
       FROM organizations o LEFT JOIN users u ON u.organization_id = o.id AND lower(u.account) = lower($1)
       WHERE lower(o.code) = lower($2) ORDER BY (o.code = $2) DESC LIMIT 1`,
      [String(input.account || '').trim(), String(input.organizationCode || '').trim()],
    ).then(({ rows }) => {
      const organizationId = rows[0]?.organization_id || null
      return { organizationId, userId: rows[0]?.user_id || null, ...loginKeys(input, organizationId) }
    })
    // 查询失败时允许下一个环节重新查。
    input.context.catch(() => { input.context = null })
  }
  return input.context
}

function minutesUntil(value) {
  return Math.max(1, Math.ceil((new Date(value).getTime() - Date.now()) / 60000))
}

export function networkLockedMessage(minutes) {
  return `这个网络里登录失败的次数太多了，为了保护大家的账号，暂停登录 ${minutes} 分钟。着急的话，请管理员在「账号安全 → 登录锁定」里解除。`
}

/** 登录前调用：账号或网络处于锁定期就直接 429，不再校验密码。 */
export async function assertLoginAllowed(input) {
  if (!isDatabaseConfigured()) return
  await ensureRiskSchema()
  const { accountKey, ipKey } = await loginContext(input)
  const { rows } = await query('SELECT kind, locked_until FROM login_attempts WHERE key_hash = ANY($1::text[]) AND locked_until > now()', [[accountKey, ipKey]])
  if (!rows.length) return
  const latest = rows.reduce((max, row) => (new Date(row.locked_until) > new Date(max.locked_until) ? row : max), rows[0])
  const minutes = minutesUntil(latest.locked_until)
  throw fail(latest.kind === 'ip'
    ? networkLockedMessage(minutes)
    : `密码错误次数太多，账号暂时锁定，请 ${minutes} 分钟后再试，或请管理员解除锁定。`, 429, { code: 'login_locked', scope: latest.kind === 'ip' ? 'network' : 'account', retryAfterMinutes: minutes })
}

async function bumpAttempt(key, kind, organizationId, userId, limit, hint = null) {
  // 15 分钟内没有新的失败就重新计数；锁定时长随失败次数翻倍：1、2、4、8 分钟……最长 LOGIN_LOCK_MAX_MINUTES。
  const row = (await query(
    `INSERT INTO login_attempts (key_hash, kind, organization_id, user_id, ip_hint, failures, first_failed_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, now(), now())
     ON CONFLICT (key_hash) DO UPDATE SET
       failures = CASE WHEN login_attempts.updated_at < now() - interval '15 minutes' THEN 1 ELSE login_attempts.failures + 1 END,
       first_failed_at = CASE WHEN login_attempts.updated_at < now() - interval '15 minutes' THEN now() ELSE login_attempts.first_failed_at END,
       organization_id = COALESCE(EXCLUDED.organization_id, login_attempts.organization_id),
       user_id = COALESCE(EXCLUDED.user_id, login_attempts.user_id),
       ip_hint = COALESCE(EXCLUDED.ip_hint, login_attempts.ip_hint),
       updated_at = now()
     RETURNING failures`,
    [key, kind, organizationId, userId, hint],
  )).rows[0]
  const failures = row?.failures || 1
  if (failures < limit) return { failures, remaining: limit - failures, lockedMinutes: 0 }
  const lockedMinutes = kind === 'ip' ? LOGIN_LOCK_MAX_MINUTES : Math.min(LOGIN_LOCK_MAX_MINUTES, 2 ** (failures - limit))
  await query('UPDATE login_attempts SET locked_until = now() + make_interval(mins => $2) WHERE key_hash = $1', [key, lockedMinutes])
  return { failures, remaining: 0, lockedMinutes }
}

/**
 * 密码错误后调用，返回还能试几次 / 锁定几分钟，用来给出更清楚的提示。
 * networkLockedMinutes > 0 表示这一次失败让整个网络（同一出口 IP + 同一机构）进入了锁定。
 */
export async function recordLoginFailure(input) {
  if (!isDatabaseConfigured()) return { remaining: LOGIN_ACCOUNT_LIMIT, lockedMinutes: 0, networkLockedMinutes: 0 }
  await ensureRiskSchema()
  maybePurgeLogins()
  const { accountKey, ipKey, organizationId, userId } = await loginContext(input)
  const [account, network] = await Promise.all([
    // 账号行只在账号真实存在时记机构，这样「登录锁定」列表和看板数字对得上（乱填的账号不算）。
    bumpAttempt(accountKey, 'account', userId ? organizationId : null, userId, LOGIN_ACCOUNT_LIMIT),
    bumpAttempt(ipKey, 'ip', organizationId, null, LOGIN_IP_LIMIT, ipHint(input.ip) || null),
  ])
  return { ...account, networkLockedMinutes: network.lockedMinutes }
}

/** 登录成功后调用：清掉这个账号的失败计数，并给这个网络抵扣几次失败（同一账号每 15 分钟最多一次）。 */
export async function clearLoginFailures(input) {
  if (!isDatabaseConfigured()) return
  const { accountKey, ipKey } = await loginContext(input)
  await query('DELETE FROM login_attempts WHERE key_hash = $1', [accountKey])
  if (!LOGIN_IP_SUCCESS_CREDIT) return
  const network = await query('SELECT 1 FROM login_attempts WHERE key_hash = $1 AND failures > 0 AND (locked_until IS NULL OR locked_until <= now())', [ipKey])
  if (!network.rowCount) return
  const credited = await query(
    `INSERT INTO login_ip_credits (ip_key, account_key, credited_at) VALUES ($1, $2, now())
     ON CONFLICT (ip_key, account_key) DO UPDATE SET credited_at = now()
       WHERE login_ip_credits.credited_at < now() - interval '15 minutes'
     RETURNING 1`,
    [ipKey, accountKey],
  )
  if (!credited.rowCount) return
  await query('UPDATE login_attempts SET failures = GREATEST(0, failures - $2) WHERE key_hash = $1 AND (locked_until IS NULL OR locked_until <= now())', [ipKey, LOGIN_IP_SUCCESS_CREDIT])
}

/* ---------------- 访客限流（分享页留言 / 点赞） ---------------- */

const memoryBuckets = new Map()

export function takeRateToken(key, limit, windowMs) {
  const now = Date.now()
  let bucket = memoryBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    memoryBuckets.set(key, bucket)
  }
  if (bucket.count >= limit) return { ok: false, retryAfterMs: bucket.resetAt - now }
  bucket.count += 1
  if (memoryBuckets.size > 20000) {
    for (const [itemKey, item] of memoryBuckets) if (item.resetAt <= now) memoryBuckets.delete(itemKey)
    if (memoryBuckets.size > 50000) memoryBuckets.clear()
  }
  return { ok: true, remaining: limit - bucket.count }
}

export async function publicCommentPolicy(organizationId) {
  return (await stateFor({ organizationId })).settings.publicComments
}

/* ---------------- 后台：权限 ---------------- */

async function assertRiskAdmin(user) {
  if (user?.role !== 'admin' || !user?.organization?.id) throw fail('仅机构管理员可以管理风控', 403)
  const result = await query('SELECT 1 FROM admin_scopes WHERE admin_user_id = $1 AND organization_id = $2 LIMIT 1', [user.id, user.organization.id])
  if (!result.rows[0]) throw fail('当前管理员没有机构管理范围', 403)
  await ensureRiskSchema()
  await ensureRiskSeed(user.organization.id)
  return user.organization.id
}

function pageParams(params, defaultSize = 30) {
  const pageSize = clampInt(params.pageSize, 10, 200, defaultSize)
  const page = clampInt(params.page, 1, 100000, 1)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/* ---------------- 后台：敏感词库 ---------------- */

function wordView(row) {
  return {
    id: row.id, word: row.word, category: row.category, categoryLabel: RISK_CATEGORIES[row.category] || '其他',
    action: row.action, actionLabel: RISK_ACTIONS[row.action] || row.action, enabled: row.enabled, source: row.source,
    hitCount: row.hit_count, lastHitAt: row.last_hit_at, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function validateWord(word) {
  const value = String(word ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return { error: '词语不能为空' }
  if (Array.from(value).length > MAX_WORD_CHARS) return { error: `不能超过 ${MAX_WORD_CHARS} 个字` }
  if (normalizedKey(value).length < 2) return { error: '有效字符少于 2 个（单个字容易误伤正常内容）' }
  return { value }
}

export async function listRiskWords(user, params = {}) {
  const organizationId = await assertRiskAdmin(user)
  const conditions = ['organization_id = $1']
  const values = [organizationId]
  const keyword = clean(params.keyword, 30)
  if (keyword) { values.push(`%${escapeLike(keyword)}%`); conditions.push(`word ILIKE $${values.length} ESCAPE '\\'`) }
  if (RISK_CATEGORIES[params.category]) { values.push(params.category); conditions.push(`category = $${values.length}`) }
  if (RISK_ACTIONS[params.action]) { values.push(params.action); conditions.push(`action = $${values.length}`) }
  if (WORD_SOURCES.has(params.source)) { values.push(params.source); conditions.push(`source = $${values.length}`) }
  if (params.enabled === 'true' || params.enabled === 'false') { values.push(params.enabled === 'true'); conditions.push(`enabled = $${values.length}`) }
  const where = conditions.join(' AND ')
  const order = params.sort === 'hits' ? 'hit_count DESC, created_at DESC' : 'created_at DESC, word'
  const { page, pageSize, offset } = pageParams(params, 50)
  const [rows, total, summary] = await Promise.all([
    query(`SELECT * FROM risk_words WHERE ${where} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${offset}`, values),
    query(`SELECT count(*)::int AS n FROM risk_words WHERE ${where}`, values),
    query('SELECT category, action, enabled, count(*)::int AS n FROM risk_words WHERE organization_id = $1 GROUP BY category, action, enabled', [organizationId]),
  ])
  const byCategory = {}
  const byAction = {}
  let all = 0
  let disabled = 0
  for (const row of summary.rows) {
    all += row.n
    if (!row.enabled) disabled += row.n
    byCategory[row.category] = (byCategory[row.category] || 0) + row.n
    byAction[row.action] = (byAction[row.action] || 0) + row.n
  }
  return { items: rows.rows.map(wordView), total: total.rows[0].n, page, pageSize, summary: { all, disabled, byCategory, byAction } }
}

const CATEGORY_BY_LABEL = Object.fromEntries(Object.entries(RISK_CATEGORIES).map(([key, label]) => [label, key]))
const ACTION_BY_LABEL = Object.fromEntries(Object.entries(RISK_ACTIONS).map(([key, label]) => [label, key]))

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i += 1 } else if (ch === '"') quoted = false
      else current += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { cells.push(current); current = '' } else current += ch
  }
  cells.push(current)
  return cells.map((cell) => cell.trim())
}

/** 批量添加：每行一个词（也可用逗号、顿号分隔）；也能直接导入本页"导出"的 CSV。重复的词会更新分类和处理方式。 */
export async function addRiskWords(user, body = {}) {
  const organizationId = await assertRiskAdmin(user)
  const defaultCategory = RISK_CATEGORIES[body.category] ? body.category : 'other'
  const defaultAction = RISK_ACTIONS[body.action] ? body.action : 'block'
  const source = body.source === 'import' ? 'import' : 'manual'
  const raw = (Array.isArray(body.words) ? body.words.join('\n') : String(body.words || '')).replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/)
  let items
  if (/^词语,/.test(lines[0] || '')) {
    items = lines.slice(1).filter((line) => line.trim()).map((line) => {
      const [word, category, action, status] = parseCsvLine(line)
      return {
        word: word.replace(/^'(?=[=+\-@])/, ''),
        category: CATEGORY_BY_LABEL[category] || (RISK_CATEGORIES[category] ? category : defaultCategory),
        action: ACTION_BY_LABEL[action] || (RISK_ACTIONS[action] ? action : defaultAction),
        enabled: status !== '停用',
      }
    })
  } else {
    items = raw.split(/[\r\n,，、;；]+/).map((word) => ({ word, category: defaultCategory, action: defaultAction, enabled: true }))
  }
  items = items.filter((item) => String(item.word || '').trim())
  if (!items.length) throw fail('请填写要添加的词语')
  if (items.length > MAX_WORDS_PER_BATCH) throw fail(`一次最多添加 ${MAX_WORDS_PER_BATCH} 个词，请分批导入`)
  const accepted = []
  const skipped = []
  const seen = new Set()
  for (const item of items) {
    const checked = validateWord(item.word)
    if (checked.error) { skipped.push({ word: String(item.word).slice(0, 40), reason: checked.error }); continue }
    const lower = checked.value.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    accepted.push({ ...item, word: checked.value })
  }
  let added = 0
  let updated = 0
  if (accepted.length) {
    const count = (await query('SELECT count(*)::int AS n FROM risk_words WHERE organization_id = $1', [organizationId])).rows[0].n
    if (count + accepted.length > MAX_WORDS_PER_ORG) throw fail(`词库最多 ${MAX_WORDS_PER_ORG} 个词，当前已有 ${count} 个`)
    const result = await query(
      `INSERT INTO risk_words (id, organization_id, word, category, action, enabled, source, created_by_user_id)
       SELECT unnest($1::text[]), $2, unnest($3::text[]), unnest($4::text[]), unnest($5::text[]), unnest($6::boolean[]), $7, $8
       ON CONFLICT (organization_id, lower(word)) DO UPDATE SET category = EXCLUDED.category, action = EXCLUDED.action, enabled = EXCLUDED.enabled, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [accepted.map(() => newId('rw')), organizationId, accepted.map((item) => item.word), accepted.map((item) => item.category),
        accepted.map((item) => item.action), accepted.map((item) => item.enabled !== false), source, user.id],
    )
    added = result.rows.filter((row) => row.inserted).length
    updated = result.rows.length - added
    invalidateRiskState(organizationId)
  }
  await logAudit(user.id, organizationId, 'risk.words.add', 'risk_word', null, { added, updated, skipped: skipped.length, source })
  return { added, updated, skipped }
}

export async function updateRiskWord(user, id, patch = {}) {
  const organizationId = await assertRiskAdmin(user)
  const sets = []
  const values = [id, organizationId]
  if (patch.word !== undefined) {
    const checked = validateWord(patch.word)
    if (checked.error) throw fail(checked.error)
    values.push(checked.value); sets.push(`word = $${values.length}`)
  }
  if (patch.category !== undefined) {
    if (!RISK_CATEGORIES[patch.category]) throw fail('分类无效')
    values.push(patch.category); sets.push(`category = $${values.length}`)
  }
  if (patch.action !== undefined) {
    if (!RISK_ACTIONS[patch.action]) throw fail('处理方式无效')
    values.push(patch.action); sets.push(`action = $${values.length}`)
  }
  if (typeof patch.enabled === 'boolean') { values.push(patch.enabled); sets.push(`enabled = $${values.length}`) }
  if (!sets.length) throw fail('没有要修改的内容')
  let row
  try {
    row = (await query(`UPDATE risk_words SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND organization_id = $2 RETURNING *`, values)).rows[0]
  } catch (error) {
    if (error.code === '23505') throw fail('词库里已经有这个词了', 409)
    throw error
  }
  if (!row) throw fail('词语不存在或已删除', 404)
  invalidateRiskState(organizationId)
  await logAudit(user.id, organizationId, 'risk.words.update', 'risk_word', id, { word: row.word, action: row.action, enabled: row.enabled })
  return wordView(row)
}

export async function deleteRiskWords(user, ids = []) {
  const organizationId = await assertRiskAdmin(user)
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map((item) => String(item || '')).filter((item) => /^[A-Za-z0-9_-]{4,80}$/.test(item)))].slice(0, 1000)
  if (!list.length) throw fail('请先选择要删除的词语')
  const result = await query('DELETE FROM risk_words WHERE organization_id = $1 AND id = ANY($2::text[]) RETURNING word', [organizationId, list])
  invalidateRiskState(organizationId)
  await logAudit(user.id, organizationId, 'risk.words.delete', 'risk_word', null, { count: result.rowCount, sample: result.rows.slice(0, 20).map((row) => row.word) })
  return { deleted: result.rowCount }
}

function csvCell(value) {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}` // 防止被表格软件当成公式执行
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function exportRiskWords(user) {
  const organizationId = await assertRiskAdmin(user)
  const { rows } = await query('SELECT * FROM risk_words WHERE organization_id = $1 ORDER BY category, action, word', [organizationId])
  const sourceLabels = { builtin: '内置', manual: '手动添加', import: '导入' }
  const lines = ['词语,分类,处理方式,状态,来源,命中次数']
  for (const row of rows) {
    lines.push([row.word, RISK_CATEGORIES[row.category] || '其他', RISK_ACTIONS[row.action] || row.action, row.enabled ? '启用' : '停用', sourceLabels[row.source] || row.source, row.hit_count].map(csvCell).join(','))
  }
  await logAudit(user.id, organizationId, 'risk.words.export', 'risk_word', null, { count: rows.length })
  return `﻿${lines.join('\r\n')}\r\n`
}

/* ---------------- 后台：内容过滤规则 ---------------- */

function ruleView(row) {
  const definition = row.kind === 'builtin' ? BUILTIN_RULES[row.rule_key] : null
  return {
    id: row.id, key: row.rule_key, kind: row.kind, builtin: row.kind === 'builtin',
    name: definition?.name || row.name, description: definition?.description || row.description,
    category: definition?.category || row.category, categoryLabel: RISK_CATEGORIES[definition?.category || row.category] || '其他',
    pattern: row.kind === 'builtin' ? '' : row.pattern, scopes: rowScopes(row.scopes), action: row.action, actionLabel: RISK_ACTIONS[row.action],
    enabled: row.enabled, hitCount: row.hit_count, lastHitAt: row.last_hit_at, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function validateScopes(value) {
  const scopes = [...new Set((Array.isArray(value) ? value : []).filter((item) => SCOPE_KEYS.includes(item)))]
  if (!scopes.length) throw fail('请至少选择一个生效场景')
  return scopes
}

function validateRuleAction(value) {
  if (!['block', 'review', 'mask'].includes(value)) throw fail('处理方式无效')
  return value
}

/** 正则规则：限制长度，拒绝反向引用和嵌套重复，再用最坏情况的长文本实测一次耗时。 */
export function validateRulePattern(kind, pattern) {
  const source = String(pattern ?? '').trim()
  if (!source) throw fail('请填写匹配内容')
  if (kind === 'combo') {
    if (source.length > 500) throw fail('组合规则不能超过 500 个字符')
    const groups = parseCombo(source)
    if (!groups.length) throw fail('组合规则的写法是「词A+词B」，每行一组，每组至少两个词')
    if (groups.length > 20) throw fail('组合规则最多 20 组')
    if (groups.some((parts) => parts.length > 5)) throw fail('每组最多 5 个词')
    return source
  }
  if (source.length > 200) throw fail('正则规则不能超过 200 个字符')
  if (/\\[1-9]|\\k</.test(source)) throw fail('规则里不能使用反向引用')
  if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/.test(source)) throw fail('规则里不能出现嵌套重复（如 (a+)+），以免拖慢服务器')
  let regex
  try { regex = new RegExp(source, 'giu') } catch { throw fail('正则规则格式不正确，请检查括号和转义') }
  if (regex.test('')) throw fail('这条规则会匹配空内容，请修改')
  const started = performance.now()
  for (const sample of ['a'.repeat(4000) + '!', '1'.repeat(4000) + 'x', '啊'.repeat(4000), 'ab'.repeat(2000) + '#']) {
    regex.lastIndex = 0
    regex.test(sample)
  }
  if (performance.now() - started > 60) throw fail('这条规则匹配太慢，请简化后再试')
  return source
}

export async function listRiskRules(user) {
  const organizationId = await assertRiskAdmin(user)
  const { rows } = await query(`SELECT * FROM risk_rules WHERE organization_id = $1 ORDER BY (kind = 'builtin') DESC, created_at`, [organizationId])
  return { items: rows.filter((row) => row.kind !== 'builtin' || BUILTIN_RULES[row.rule_key]).map(ruleView) }
}

export async function createRiskRule(user, body = {}) {
  const organizationId = await assertRiskAdmin(user)
  const kind = body.kind === 'combo' ? 'combo' : body.kind === 'regex' ? 'regex' : ''
  if (!kind) throw fail('请选择规则类型')
  const name = clean(body.name, 30)
  if (!name) throw fail('请填写规则名称')
  const pattern = validateRulePattern(kind, body.pattern)
  const scopes = validateScopes(body.scopes)
  const action = validateRuleAction(body.action || 'block')
  const category = RISK_CATEGORIES[body.category] ? body.category : 'other'
  const count = (await query(`SELECT count(*)::int AS n FROM risk_rules WHERE organization_id = $1 AND kind <> 'builtin'`, [organizationId])).rows[0].n
  if (count >= MAX_CUSTOM_RULES) throw fail(`自定义规则最多 ${MAX_CUSTOM_RULES} 条`)
  const row = (await query(
    `INSERT INTO risk_rules (id, organization_id, rule_key, name, description, kind, category, pattern, scopes, action, enabled, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12) RETURNING *`,
    [newId('rr'), organizationId, `custom_${randomBytes(6).toString('hex')}`, name, clean(body.description, 200), kind, category, pattern, JSON.stringify(scopes), action, body.enabled !== false, user.id],
  )).rows[0]
  invalidateRiskState(organizationId)
  await logAudit(user.id, organizationId, 'risk.rules.create', 'risk_rule', row.id, { name, kind, action, scopes })
  return ruleView(row)
}

export async function updateRiskRule(user, id, patch = {}) {
  const organizationId = await assertRiskAdmin(user)
  const current = (await query('SELECT * FROM risk_rules WHERE id = $1 AND organization_id = $2', [id, organizationId])).rows[0]
  if (!current) throw fail('规则不存在或已删除', 404)
  const sets = []
  const values = [id, organizationId]
  const push = (column, value, cast = '') => { values.push(value); sets.push(`${column} = $${values.length}${cast}`) }
  if (typeof patch.enabled === 'boolean') push('enabled', patch.enabled)
  if (patch.action !== undefined) push('action', validateRuleAction(patch.action))
  if (patch.scopes !== undefined) push('scopes', JSON.stringify(validateScopes(patch.scopes)), '::jsonb')
  if (current.kind !== 'builtin') {
    if (patch.name !== undefined) {
      const name = clean(patch.name, 30)
      if (!name) throw fail('请填写规则名称')
      push('name', name)
    }
    if (patch.description !== undefined) push('description', clean(patch.description, 200))
    if (patch.category !== undefined) {
      if (!RISK_CATEGORIES[patch.category]) throw fail('分类无效')
      push('category', patch.category)
    }
    if (patch.pattern !== undefined) push('pattern', validateRulePattern(current.kind, patch.pattern))
  }
  if (!sets.length) throw fail('没有要修改的内容')
  const row = (await query(`UPDATE risk_rules SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND organization_id = $2 RETURNING *`, values)).rows[0]
  invalidateRiskState(organizationId)
  await logAudit(user.id, organizationId, 'risk.rules.update', 'risk_rule', id, { enabled: row.enabled, action: row.action, scopes: row.scopes })
  return ruleView(row)
}

export async function deleteRiskRule(user, id) {
  const organizationId = await assertRiskAdmin(user)
  const current = (await query('SELECT kind, name FROM risk_rules WHERE id = $1 AND organization_id = $2', [id, organizationId])).rows[0]
  if (!current) throw fail('规则不存在或已删除', 404)
  if (current.kind === 'builtin') throw fail('内置规则不能删除，可以停用')
  await query('DELETE FROM risk_rules WHERE id = $1 AND organization_id = $2', [id, organizationId])
  invalidateRiskState(organizationId)
  await logAudit(user.id, organizationId, 'risk.rules.delete', 'risk_rule', id, { name: current.name })
  return { deleted: true }
}

/* ---------------- 后台：设置与试一试 ---------------- */

function mergeDeep(base, patch) {
  if (!isObject(patch)) return base
  const output = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    output[key] = isObject(value) && isObject(base?.[key]) ? mergeDeep(base[key], value) : value
  }
  return output
}

export async function getRiskSettings(user) {
  const organizationId = await assertRiskAdmin(user)
  const row = (await query('SELECT settings, updated_at FROM risk_settings WHERE organization_id = $1', [organizationId])).rows[0]
  return {
    settings: normalizeRiskSettings(row?.settings), updatedAt: row?.updated_at || null,
    scopes: RISK_SCOPES, categories: RISK_CATEGORIES, actions: RISK_ACTIONS, timezone: APP_TIMEZONE,
  }
}

export async function updateRiskSettings(user, patch = {}) {
  const organizationId = await assertRiskAdmin(user)
  const row = (await query('SELECT settings FROM risk_settings WHERE organization_id = $1', [organizationId])).rows[0]
  const next = normalizeRiskSettings(mergeDeep(normalizeRiskSettings(row?.settings), isObject(patch) ? patch : {}))
  await query(
    `INSERT INTO risk_settings (organization_id, settings, seeded_at, updated_at, updated_by) VALUES ($1, $2::jsonb, now(), now(), $3)
     ON CONFLICT (organization_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [organizationId, JSON.stringify(next), user.id],
  )
  invalidateRiskState(organizationId)
  await logAudit(user.id, organizationId, 'risk.settings.update', 'risk_settings', organizationId, next)
  return { settings: next }
}

/** 后台"试一试"：只判断，不记录、不计数。 */
export async function testRiskText(user, body = {}) {
  const organizationId = await assertRiskAdmin(user)
  const text = String(body.text || '').slice(0, 2000)
  if (!text.trim()) throw fail('请先输入要检测的文字')
  const scope = SCOPE_POLICY[body.scope] ? body.scope : 'chat'
  invalidateRiskState(organizationId)
  const verdict = evaluateText(await loadRiskState(organizationId), text, scope)
  return {
    scope, action: verdict.action, actionLabel: verdict.action === 'pass' ? '放行' : RISK_ACTIONS[verdict.action],
    text: verdict.text, hits: verdict.hits.map((hit) => ({ ...hit, actionLabel: RISK_ACTIONS[hit.action], categoryLabel: RISK_CATEGORIES[hit.category] || '其他' })),
    message: verdict.message, selfHarm: verdict.selfHarm,
  }
}

/* ---------------- 后台：违规记录 ---------------- */

function actorLabel(row) {
  if (row.actor === 'ai') return 'AI 伙伴生成'
  if (String(row.actor || '').startsWith('visitor:')) return '分享页访客'
  return ''
}

function eventView(row) {
  return {
    id: row.id,
    user: row.user_id ? { id: row.user_id, account: row.account || '', name: row.display_name || '', role: row.role || '' } : null,
    actor: actorLabel(row), scope: row.scope, scopeLabel: RISK_SCOPES[row.scope] || row.scope,
    action: row.action, actionLabel: RISK_ACTIONS[row.action] || row.action,
    category: row.category, categoryLabel: RISK_CATEGORIES[row.category] || '其他',
    hits: (Array.isArray(row.hits) ? row.hits : []).map((hit) => ({ label: hit.label, category: hit.category, categoryLabel: RISK_CATEGORIES[hit.category] || '其他', action: hit.action, source: hit.source })),
    excerpt: row.excerpt, counted: row.counted, handled: Boolean(row.handled_at), handledAt: row.handled_at, createdAt: row.created_at,
  }
}

export async function listRiskEvents(user, params = {}) {
  const organizationId = await assertRiskAdmin(user)
  const conditions = ['e.organization_id = $1']
  const values = [organizationId]
  const days = clampInt(params.days, 1, EVENT_RETENTION_DAYS, 30)
  values.push(days); conditions.push(`e.created_at > now() - make_interval(days => $${values.length})`)
  if (RISK_SCOPES[params.scope]) { values.push(params.scope); conditions.push(`e.scope = $${values.length}`) }
  if (ACTION_RANK[params.action]) { values.push(params.action); conditions.push(`e.action = $${values.length}`) }
  if (RISK_CATEGORIES[params.category]) { values.push(params.category); conditions.push(`e.category = $${values.length}`) }
  if (params.status === 'pending') conditions.push('e.handled_at IS NULL')
  if (params.status === 'handled') conditions.push('e.handled_at IS NOT NULL')
  if (/^[A-Za-z0-9_-]{4,80}$/.test(String(params.userId || ''))) { values.push(params.userId); conditions.push(`e.user_id = $${values.length}`) }
  const keyword = clean(params.keyword, 40)
  if (keyword) {
    values.push(`%${escapeLike(keyword)}%`)
    conditions.push(`(u.account ILIKE $${values.length} ESCAPE '\\' OR u.display_name ILIKE $${values.length} ESCAPE '\\' OR e.excerpt ILIKE $${values.length} ESCAPE '\\')`)
  }
  const where = conditions.join(' AND ')
  const { page, pageSize, offset } = pageParams(params)
  const [rows, total, today] = await Promise.all([
    query(`SELECT e.*, u.account, u.display_name, u.role FROM risk_events e LEFT JOIN users u ON u.id = e.user_id AND u.organization_id = e.organization_id
      WHERE ${where} ORDER BY e.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, values),
    query(`SELECT count(*)::int AS n FROM risk_events e LEFT JOIN users u ON u.id = e.user_id AND u.organization_id = e.organization_id WHERE ${where}`, values),
    query(`SELECT
        count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS day,
        count(*) FILTER (WHERE created_at > now() - interval '1 day' AND action = 'block')::int AS blocked,
        count(*) FILTER (WHERE handled_at IS NULL AND category = 'self_harm')::int AS care
      FROM risk_events WHERE organization_id = $1 AND created_at > now() - make_interval(days => $2)`, [organizationId, EVENT_RETENTION_DAYS]),
  ])
  const stats = today.rows[0] || {}
  return { items: rows.rows.map(eventView), total: total.rows[0].n, page, pageSize, stats: { last24h: stats.day || 0, blocked24h: stats.blocked || 0, pendingCare: stats.care || 0 } }
}

export async function handleRiskEvents(user, body = {}) {
  const organizationId = await assertRiskAdmin(user)
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String).filter((item) => /^[A-Za-z0-9_-]{4,80}$/.test(item)))].slice(0, 500)
  if (!ids.length) throw fail('请先选择记录')
  const handled = body.handled !== false
  const result = await query(
    `UPDATE risk_events SET handled_at = CASE WHEN $3 THEN now() ELSE NULL END, handled_by_user_id = CASE WHEN $3 THEN $4 ELSE NULL END
     WHERE organization_id = $1 AND id = ANY($2::text[])`,
    [organizationId, ids, handled, user.id],
  )
  await logAudit(user.id, organizationId, handled ? 'risk.events.handle' : 'risk.events.reopen', 'risk_event', null, { count: result.rowCount })
  return { updated: result.rowCount }
}

/* ---------------- 后台：封禁名单 ---------------- */

function banView(row) {
  const active = !row.lifted_at && (!row.ends_at || new Date(row.ends_at).getTime() > Date.now())
  return {
    id: row.id, user: { id: row.user_id, account: row.account || '', name: row.display_name || '', role: row.role || '' },
    scope: row.scope, scopeLabel: row.scope === 'all' ? '暂停登录' : '暂停 AI 与发布', source: row.source, sourceLabel: row.source === 'auto' ? '自动' : '手动',
    reason: row.reason, startsAt: row.starts_at, endsAt: row.ends_at, permanent: !row.ends_at, active,
    status: row.lifted_at ? 'lifted' : active ? 'active' : 'expired',
    statusLabel: row.lifted_at ? '已解除' : active ? '生效中' : '已到期',
    liftedAt: row.lifted_at, liftReason: row.lift_reason, liftedBy: row.lifted_by_name || '', createdBy: row.created_by_name || (row.source === 'auto' ? '系统' : ''), createdAt: row.created_at,
  }
}

export async function listRiskBans(user, params = {}) {
  const organizationId = await assertRiskAdmin(user)
  const conditions = ['b.organization_id = $1']
  const values = [organizationId]
  const activeSql = 'b.lifted_at IS NULL AND (b.ends_at IS NULL OR b.ends_at > now())'
  if ((params.status || 'active') === 'active') conditions.push(activeSql)
  else if (params.status === 'ended') conditions.push(`NOT (${activeSql})`)
  if (/^[A-Za-z0-9_-]{4,80}$/.test(String(params.userId || ''))) { values.push(params.userId); conditions.push(`b.user_id = $${values.length}`) }
  const keyword = clean(params.keyword, 40)
  if (keyword) {
    values.push(`%${escapeLike(keyword)}%`)
    conditions.push(`(u.account ILIKE $${values.length} ESCAPE '\\' OR u.display_name ILIKE $${values.length} ESCAPE '\\')`)
  }
  const where = conditions.join(' AND ')
  const { page, pageSize, offset } = pageParams(params)
  const from = `FROM risk_bans b JOIN users u ON u.id = b.user_id AND u.organization_id = b.organization_id
    LEFT JOIN users c ON c.id = b.created_by_user_id LEFT JOIN users l ON l.id = b.lifted_by_user_id`
  const [rows, total] = await Promise.all([
    query(`SELECT b.*, u.account, u.display_name, u.role, c.display_name AS created_by_name, l.display_name AS lifted_by_name ${from}
      WHERE ${where} ORDER BY b.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, values),
    query(`SELECT count(*)::int AS n ${from} WHERE ${where}`, values),
  ])
  return { items: rows.rows.map(banView), total: total.rows[0].n, page, pageSize }
}

export async function createRiskBan(user, body = {}) {
  const organizationId = await assertRiskAdmin(user)
  const targetId = String(body.userId || '')
  const target = (await query('SELECT id, role, display_name, account FROM users WHERE id = $1 AND organization_id = $2', [targetId, organizationId])).rows[0]
  if (!target) throw fail('账号不存在或不属于本机构', 404)
  if (target.id === user.id) throw fail('不能封禁自己的账号')
  if (target.role === 'admin') throw fail('不能封禁管理员账号')
  const scope = body.scope === 'all' ? 'all' : 'ai'
  const minutes = Math.round(Number(body.minutes))
  if (!Number.isFinite(minutes) || minutes < 0) throw fail('请选择封禁时长')
  if (minutes > 0 && (minutes < 5 || minutes > 525600)) throw fail('封禁时长需要在 5 分钟到 365 天之间，或选择永久')
  const reason = clean(body.reason, 200)
  if (reason.length < 2) throw fail('请填写封禁原因（只有管理员能看到）')
  const ban = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`risk-ban:${organizationId}:${target.id}`])
    await client.query(
      `UPDATE risk_bans SET lifted_at = now(), lifted_by_user_id = $3, lift_reason = '被新的封禁替换'
       WHERE organization_id = $1 AND user_id = $2 AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at > now())`,
      [organizationId, target.id, user.id],
    )
    const inserted = (await client.query(
      `INSERT INTO risk_bans (id, organization_id, user_id, scope, reason, source, ends_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'manual', CASE WHEN $6::int > 0 THEN now() + make_interval(mins => $6::int) ELSE NULL END, $7) RETURNING *`,
      [newId('rban'), organizationId, target.id, scope, reason, minutes, user.id],
    )).rows[0]
    if (scope === 'all') await client.query('DELETE FROM sessions WHERE user_id = $1', [target.id])
    return inserted
  })
  banCache.delete(target.id)
  await logAudit(user.id, organizationId, 'risk.ban.create', 'user', target.id, { banId: ban.id, scope, minutes, reason })
  return banView({ ...ban, account: target.account, display_name: target.display_name, role: target.role, created_by_name: user.name })
}

export async function liftRiskBan(user, id, body = {}) {
  const organizationId = await assertRiskAdmin(user)
  const reason = clean(body.reason, 200) || '管理员解除'
  const row = (await query(
    `UPDATE risk_bans SET lifted_at = now(), lifted_by_user_id = $3, lift_reason = $4
     WHERE id = $1 AND organization_id = $2 AND lifted_at IS NULL RETURNING *`,
    [id, organizationId, user.id, reason],
  )).rows[0]
  if (!row) throw fail('封禁记录不存在或已经解除', 404)
  banCache.delete(row.user_id)
  await logAudit(user.id, organizationId, 'risk.ban.lift', 'user', row.user_id, { banId: id, reason })
  return { lifted: true }
}

/** 账号管理列表用：一次查出这些账号当前生效的封禁。 */
export async function activeBansForUsers(organizationId, userIds = []) {
  const ids = [...new Set(userIds.map(String))].slice(0, 500)
  if (!ids.length || !isDatabaseConfigured()) return {}
  await ensureRiskSchema()
  const { rows } = await query(
    `SELECT DISTINCT ON (user_id) * FROM risk_bans
     WHERE organization_id = $1 AND user_id = ANY($2::text[]) AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at > now())
     ORDER BY user_id, (scope = 'all') DESC, ends_at DESC NULLS FIRST`,
    [organizationId, ids],
  )
  return Object.fromEntries(rows.map((row) => [row.user_id, publicBan(row)]))
}

/* ---------------- 后台：登录锁定 ---------------- */

export async function listLoginLocks(user) {
  const organizationId = await assertRiskAdmin(user)
  const [accounts, networks] = await Promise.all([
    query(
      `SELECT la.user_id, la.failures, la.locked_until, u.account, u.display_name, u.role
       FROM login_attempts la JOIN users u ON u.id = la.user_id AND u.organization_id = la.organization_id
       WHERE la.organization_id = $1 AND la.kind = 'account' AND la.locked_until > now() ORDER BY la.locked_until DESC LIMIT 200`,
      [organizationId],
    ),
    // 网络锁定：同一出口 IP 登录本机构失败太多。只给出 IP 前两段，id 是带密钥的哈希，拿不回完整 IP。
    query(
      `SELECT key_hash, failures, locked_until, first_failed_at, ip_hint
       FROM login_attempts WHERE organization_id = $1 AND kind = 'ip' AND locked_until > now() ORDER BY locked_until DESC LIMIT 50`,
      [organizationId],
    ),
  ])
  return {
    items: accounts.rows.map((row) => ({ user: { id: row.user_id, account: row.account, name: row.display_name, role: row.role }, failures: row.failures, lockedUntil: row.locked_until })),
    networkLocks: networks.rows.map((row) => ({ id: row.key_hash, ipHint: row.ip_hint || '', failures: row.failures, firstFailedAt: row.first_failed_at, lockedUntil: row.locked_until })),
  }
}

/** 解除登录锁定：传 userId 解除某个账号；传 lockId 解除某个网络（只能是本机构的）。 */
export async function clearLoginLock(user, input = {}) {
  const organizationId = await assertRiskAdmin(user)
  const payload = typeof input === 'string' ? { userId: input } : (input || {})
  const lockId = String(payload.lockId || '').trim()
  if (lockId) {
    if (!/^[a-f0-9]{64}$/.test(lockId)) throw fail('锁定记录不存在或已经解除', 404)
    const result = await query(`DELETE FROM login_attempts WHERE organization_id = $1 AND key_hash = $2 AND kind = 'ip'`, [organizationId, lockId])
    await logAudit(user.id, organizationId, 'risk.login.unlock_network', 'login_lock', lockId.slice(0, 16), { cleared: result.rowCount })
    return { cleared: result.rowCount }
  }
  const userId = String(payload.userId || '').trim()
  if (!userId) throw fail('请选择要解除锁定的账号', 400)
  const result = await query(`DELETE FROM login_attempts WHERE organization_id = $1 AND user_id = $2 AND kind = 'account'`, [organizationId, userId])
  await logAudit(user.id, organizationId, 'risk.login.unlock', 'user', userId, { cleared: result.rowCount })
  return { cleared: result.rowCount }
}

/* ---------------- 数据看板 ---------------- */

export async function riskOverview(user) {
  const organizationId = await assertRiskAdmin(user)
  const [events, bans, locks, trend] = await Promise.all([
    query(`SELECT
        count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS day,
        count(*) FILTER (WHERE created_at > now() - interval '1 day' AND action = 'block')::int AS blocked,
        count(*) FILTER (WHERE handled_at IS NULL AND category = 'self_harm')::int AS care,
        count(*) FILTER (WHERE handled_at IS NULL)::int AS pending
      FROM risk_events WHERE organization_id = $1 AND created_at > now() - interval '30 days'`, [organizationId]),
    query(`SELECT count(*)::int AS n FROM risk_bans WHERE organization_id = $1 AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at > now())`, [organizationId]),
    query(`SELECT count(*) FILTER (WHERE kind = 'account')::int AS accounts, count(*) FILTER (WHERE kind = 'ip')::int AS networks
      FROM login_attempts WHERE organization_id = $1 AND locked_until > now()`, [organizationId]),
    query(`SELECT to_char((created_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day, count(*)::int AS events, count(*) FILTER (WHERE action = 'block')::int AS blocked
      FROM risk_events WHERE organization_id = $1 AND created_at > now() - interval '7 days' GROUP BY 1 ORDER BY 1`, [organizationId, APP_TIMEZONE]),
  ])
  const row = events.rows[0] || {}
  return {
    events24h: row.day || 0, blocked24h: row.blocked || 0, pendingCare: row.care || 0, pendingEvents: row.pending || 0,
    activeBans: bans.rows[0].n, lockedAccounts: locks.rows[0].accounts, lockedNetworks: locks.rows[0].networks, trend: trend.rows,
  }
}
