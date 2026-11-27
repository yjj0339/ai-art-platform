/**
 * 验证「账号格式规则」真的拦得住，前端和后端两道闸一致。
 *
 * 规则：3–20 位，只允许小写字母和数字（不接受下划线/横杠/空格/中文），允许纯数字（手机号可直接当账号）；
 * 大写自动转小写。
 *
 * 三段：
 *   1. 真实后端接口：各种非法账号必须 400 + 中文提示；合法账号能建；大写自动落库成小写。
 *   2. 纯函数层：server/account-rules.js 与 src/utils/accountRules.js 对同一批输入结论一致。
 *   3. 真实浏览器：登录页注册弹窗输入中文/大写，实际值被实时过滤成合法形式。
 *
 * 会往库里建临时账号（zz_fmt_ 前缀），结束时删掉，不动任何真实账号。
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { query } from '../server/db.js'
import { accountFormatError, normalizeAccount, ACCOUNT_MAX_LENGTH } from '../server/account-rules.js'

// ⚠ 必须用 fileURLToPath：Windows 下 URL.pathname 是 `/D:/...`，resolve 会拼成 `D:\D:\...`。
for (const file of ['../server/.env', '../.env.local']) {
  try {
    process.loadEnvFile(fileURLToPath(new URL(file, import.meta.url)))
  } catch {
    /* 文件不存在就跳过 */
  }
}
if (!String(process.env.DATABASE_URL || '').trim()) {
  console.error('无法加载数据库配置，请检查 server/.env 是否存在')
  process.exit(1)
}

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const ADMIN = { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }
// 探针前缀不能带下划线：新规则不接受下划线，前缀本身就得合法。
const PROBE_PREFIX = 'zzfmt'
const PROBE_ACCOUNT = `${PROBE_PREFIX}${Date.now().toString(36)}`
const PROBE_LIKE = `${PROBE_PREFIX}%`

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// ───────────── 第一段：真实接口 ─────────────
console.log('\n=== 第一段：后端接口的账号格式闸门 ===')

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(ADMIN),
})
const loginBody = await loginRes.json().catch(() => ({}))
check(loginRes.ok, '管理员能登录', `HTTP ${loginRes.status}`)
const token = loginBody.token || loginBody.sessionToken || ''
const cookie = loginRes.headers.getSetCookie?.().map((c) => c.split(';')[0]).join('; ') || ''

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

const setup = await api('/api/admin/organization-setup')
const campusId = setup.body?.campuses?.[0]?.id || ''
check(Boolean(campusId), '取到可用校区，后面才建得了账号', campusId || '无')

const illegal = [
  ['中文账号', '中文'],
  ['ab', '只有 2 位'],
  ['a'.repeat(21), '21 位'],
  ['abc_def', '含下划线'],
  ['abc-def', '含横杠'],
  ['a b c', '含空格'],
  ['', '空账号'],
]
for (const [value, why] of illegal) {
  const res = await api('/api/admin/accounts', {
    method: 'POST',
    body: JSON.stringify({ account: value, name: '格式探针', password: '12345678', role: 'student', campusId }),
  })
  check(res.status === 400, `拒绝非法账号：${why}`, `HTTP ${res.status} ${res.body?.message || ''}`)
  check(
    /3–20 位|账号需|不能为空/.test(res.body?.message || ''),
    `拒绝「${why}」时给的是中文规则提示`,
    res.body?.message || '(无)',
  )
}

// 纯数字账号（手机号形态）必须能建成功 —— 这是本次规则调整的核心诉求
const phoneAccount = `139${String(Date.now()).slice(-8)}`
const phoneCreated = await api('/api/admin/accounts', {
  method: 'POST',
  body: JSON.stringify({ account: phoneAccount, name: '格式探针手机号', password: '12345678', role: 'student', campusId }),
})
check(
  phoneCreated.status === 201,
  '纯数字账号（手机号形态）能建成功',
  `HTTP ${phoneCreated.status} ${phoneCreated.body?.message || ''}`,
)

// 合法账号 + 大写自动转小写
const upper = `${PROBE_PREFIX}Mixed${Date.now().toString(36).slice(-4)}`
const created = await api('/api/admin/accounts', {
  method: 'POST',
  body: JSON.stringify({ account: upper, name: '格式探针合法', password: '12345678', role: 'student', campusId }),
})
check(created.status === 201, '合法账号能建成功（含大写字母）', `HTTP ${created.status} ${created.body?.message || ''}`)
if (created.body?.id) {
  const row = await query('SELECT account FROM users WHERE id = $1', [created.body.id])
  check(row.rows[0]?.account === upper.toLowerCase(), '大写自动落库成小写', row.rows[0]?.account || '(无)')
}

// 改名同样受格式约束
if (created.body?.id) {
  const badRename = await api(`/api/admin/accounts/${created.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ account: '中文改名' }),
  })
  check(badRename.status === 400, '改名成中文账号也被拒绝', `HTTP ${badRename.status} ${badRename.body?.message || ''}`)
}

// 清理（纯数字探针按前缀匹配不到，单独按账号名删）
for (const account of [phoneAccount]) {
  await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lower(account) = $1)`, [account])
  await query(`DELETE FROM users WHERE lower(account) = $1`, [account])
}
await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lower(account) LIKE $1)`, [PROBE_LIKE])
await query(`DELETE FROM users WHERE lower(account) LIKE $1`, [PROBE_LIKE])
const leftover = await query(
  `SELECT count(*)::int n FROM users WHERE lower(account) LIKE $1 OR lower(account) = $2`,
  [PROBE_LIKE, phoneAccount],
)
check(leftover.rows[0].n === 0, '测试账号已全部清理，库里没有残留', `剩余 ${leftover.rows[0].n} 个`)

// ───────────── 第二段：前后端规则一致性 ─────────────
console.log('\n=== 第二段：前端与后端的规则必须说同一句话 ===')

const front = await import('../src/utils/accountRules.js')
const cases = ['abc', 'ab', 'a'.repeat(21), '13912345678', '1abc', 'abc-def', 'abc_def', '中文', 'ABC', '', '   ', 'a1b2c3']
let mismatch = 0
for (const value of cases) {
  const back = accountFormatError(value)
  const frontMsg = front.accountFormatError(value)
  const same = (Boolean(back) === Boolean(frontMsg)) && normalizeAccount(value) === front.normalizeAccount(value)
  if (!same) {
    mismatch += 1
    console.log(`      不一致：${JSON.stringify(value)} 后端=${JSON.stringify(back)} 前端=${JSON.stringify(frontMsg)}`)
  }
}
check(mismatch === 0, '同一批输入的通过/拒绝结论前后端完全一致', `不一致 ${mismatch} 处`)
check(front.ACCOUNT_MAX_LENGTH === ACCOUNT_MAX_LENGTH, '前后端长度上限一致', `${front.ACCOUNT_MAX_LENGTH} vs ${ACCOUNT_MAX_LENGTH}`)
check(
  front.sanitizeAccountInput('中文AbC_123 ') === 'abc123',
  '输入过滤会把中文/空格/下划线去掉、大写转小写',
  front.sanitizeAccountInput('中文AbC_123 '),
)
check(front.sanitizeAccountInput('139-1234-5678') === '13912345678', '手机号里的横杠会被过滤成纯数字', front.sanitizeAccountInput('139-1234-5678'))

// ───────────── 第三段：真实浏览器 ─────────────
console.log('\n=== 第三段：注册弹窗里输入中文和大写会被实时过滤 ===')

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.click('.registration-entry button')
  await page.waitForTimeout(600)

  const accountInput = page.locator('.registration-dialog .el-form-item', { hasText: '登录账号' }).locator('input')
  await accountInput.fill('中文AbC_123')
  await page.waitForTimeout(200)
  const filtered = await accountInput.inputValue()
  check(filtered === 'abc123', '输入「中文AbC_123」实际值是 abc123（下划线也被去掉）', filtered || '(空)')

  await accountInput.fill('139-1234-5678')
  await page.waitForTimeout(200)
  const phoneFiltered = await accountInput.inputValue()
  check(phoneFiltered === '13912345678', '输入带横杠的手机号会被过滤成纯数字', phoneFiltered || '(空)')

  const tipVisible = await page.locator('.registration-field-tip').first().isVisible()
  check(tipVisible, '账号输入框下方有规则提示文字')

  await page.close()
} finally {
  await browser.close()
}

console.log(fails.length === 0 ? '\n全部通过' : `\n失败 ${fails.length} 项：\n- ${fails.join('\n- ')}`)
process.exit(fails.length === 0 ? 0 : 1)
