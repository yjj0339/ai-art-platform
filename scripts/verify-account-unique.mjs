/**
 * 验证「账号不能重名」这道限制真的拦得住，以及登录页有注册入口。
 *
 * 两段：
 *   1. 真实后端接口：管理员登录 → 新建一个账号 → 再用只差大小写的账号建一次，必须被拒（中文提示）
 *      → 改成一个只差大小写的名字也必须被拒 → 清理掉测试账号。
 *   2. 真实浏览器：登录页必须有可见的「使用邀请码注册」入口，点击能打开注册弹窗。
 *
 * 会往库里建一个临时账号（命名为 zzci* 前缀），结束时删掉，不动任何真实账号。
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { query } from '../server/db.js'

// 脚本会直接连库做收尾清理，必须先加载 server/.env，否则 query() 抛「数据库未配置」。
// ⚠ 必须用 fileURLToPath：Windows 下 URL.pathname 是 `/D:/...`，resolve 会拼成 `D:\D:\...` 而静默失败。
const here = fileURLToPath(new URL('.', import.meta.url))
let envLoaded = false
for (const file of ['../server/.env', '../.env.local']) {
  try {
    process.loadEnvFile(fileURLToPath(new URL(file, import.meta.url)))
    envLoaded = true
  } catch {
    /* 文件不存在就跳过 */
  }
}
if (!envLoaded || !String(process.env.DATABASE_URL || '').trim()) {
  console.error(`无法加载数据库配置，请检查 server/.env 是否存在（脚本目录：${here}）`)
  process.exit(1)
}

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const ADMIN = { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }
// ⚠ 探针账号总长必须 ≤ 20（账号规则上限）。下面还会拼 `b`，所以前缀+时间戳要留够余量。
// ⚠ 前缀不能带下划线：账号规则只接受字母和数字，带下划线会被自己的规则拒掉。
const PROBE_PREFIX = 'zzci'
const PROBE_ACCOUNT = `${PROBE_PREFIX}${Date.now().toString(36)}`
// 前缀是纯字母数字，LIKE 里没有通配符，不需要转义。
const PROBE_LIKE = `${PROBE_PREFIX}%`

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// ───────────── 第一段：真实接口 ─────────────
console.log('\n=== 第一段：新建/改名账号时的查重 ===')

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(ADMIN),
})
check(loginRes.ok, '管理员能登录', `HTTP ${loginRes.status}`)
if (!loginRes.ok) {
  console.log(await loginRes.text())
  process.exit(1)
}
const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', cookie, ...(options.headers || {}) },
  })
  let body = null
  try { body = await res.json() } catch { /* 空回包 */ }
  return { status: res.status, body }
}

const me = await api('/api/admin/organization-setup')
const campusId = me.body?.campuses?.find((c) => c.status === 'active')?.id || null
console.log(`  可用校区：${campusId || '（无）'}`)
check(Boolean(campusId), '取到可用校区，后面才建得了账号', campusId || '无')

// 建第一个测试账号
const created = await api('/api/admin/accounts', {
  method: 'POST',
  body: JSON.stringify({ account: PROBE_ACCOUNT, name: '查重探针A', password: '12345678', role: 'student', campusId }),
})
check(created.status === 201, '第一次建账号成功', `HTTP ${created.status} ${JSON.stringify(created.body)?.slice(0, 80)}`)
const probeId = created.body?.id || ''

// 用只差大小写的账号再建一次 —— 必须被拒
const dupCase = PROBE_ACCOUNT.toUpperCase()
const dupRes = await api('/api/admin/accounts', {
  method: 'POST',
  body: JSON.stringify({ account: dupCase, name: '查重探针B', password: '12345678', role: 'student', campusId }),
})
check(dupRes.status === 409, '只差大小写的同名账号被拒绝', `HTTP ${dupRes.status}`)
check(/已被使用/.test(dupRes.body?.message || ''), '拒绝提示是中文且说清了原因', dupRes.body?.message || '(无)')

// 完全相同也必须被拒
const sameRes = await api('/api/admin/accounts', {
  method: 'POST',
  body: JSON.stringify({ account: PROBE_ACCOUNT, name: '查重探针C', password: '12345678', role: 'student', campusId }),
})
check(sameRes.status === 409, '完全相同的账号也被拒绝', `HTTP ${sameRes.status}`)

// 建一个正常账号，再把它改成与 A 只差大小写 —— 改名也要拦
const second = await api('/api/admin/accounts', {
  method: 'POST',
  body: JSON.stringify({ account: `${PROBE_ACCOUNT}b`, name: '查重探针D', password: '12345678', role: 'student', campusId }),
})
check(second.status === 201, '第二个测试账号建成功', `HTTP ${second.status}`)
if (second.body?.id) {
  const rename = await api(`/api/admin/accounts/${second.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ account: PROBE_ACCOUNT.toUpperCase() }),
  })
  check(rename.status === 409, '改名成只差大小写的重复账号也被拒绝', `HTTP ${rename.status}`)
  check(/已被使用/.test(rename.body?.message || ''), '改名拒绝提示是中文', rename.body?.message || '(无)')

  // 改成自己的名字（大小写变化）应当允许，不能被自己挡住
  const selfRename = await api(`/api/admin/accounts/${second.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ account: `${PROBE_ACCOUNT}b`.toUpperCase() }),
  })
  check(selfRename.status === 200, '只改自己账号的大小写不受影响（不能把自己挡住）', `HTTP ${selfRename.status} ${selfRename.body?.message || ''}`)
}

// 清理：接口的 DELETE 只是「停用」，账号还留在库里，所以直接用 SQL 删掉自己造的测试数据。
// 只删 zzci 前缀（本脚本专用），绝不碰任何真实账号。
// ⚠ 必须用 lower(account) 匹配：脚本中途会把测试账号改成大写，LIKE 区分大小写会漏删。
await query(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lower(account) LIKE $1)`, [PROBE_LIKE])
await query(`DELETE FROM users WHERE lower(account) LIKE $1`, [PROBE_LIKE])
const leftover = await query(`SELECT count(*)::int n FROM users WHERE lower(account) LIKE $1`, [PROBE_LIKE])
check(leftover.rows[0].n === 0, '测试账号已全部清理，库里没有残留', `剩余 ${leftover.rows[0].n} 个`)
// 防止以后改前缀时探针账号超出 20 位上限，导致用例自己撞规则报 400（曾经发生过）。
check(`${PROBE_ACCOUNT}b`.length <= 20, '探针账号长度在新规则上限（20）以内', `${PROBE_ACCOUNT}b`.length)

// ───────────── 第二段：登录页注册入口 ─────────────
console.log('\n=== 第二段：登录页的注册入口 ===')

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const entry = await page.evaluate(() => {
    const el = document.querySelector('.registration-entry')
    if (!el) return { exists: false }
    const btn = el.querySelector('button')
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const btnStyle = btn ? getComputedStyle(btn) : null
    return {
      exists: true,
      buttonText: btn?.textContent?.trim() || '',
      visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.5,
      inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
      fontSize: btnStyle?.fontSize,
      color: btnStyle?.color,
      bottom: Math.round(rect.bottom),
      viewportH: window.innerHeight,
    }
  })
  check(entry.exists, '登录页存在注册入口')
  check(entry.visible, '注册入口是可见的（没有被 display/visibility 藏起来）')
  check(entry.inViewport, '注册入口在首屏内，不用滚动就能看到', `bottom=${entry.bottom} 视口高=${entry.viewportH}`)
  check(entry.buttonText === '使用邀请码注册', '按钮文字明确说了是注册', entry.buttonText)
  check(parseFloat(entry.fontSize) >= 14, '字号够大看得清（≥14px）', entry.fontSize)

  // 点开弹窗
  await page.click('.registration-entry button')
  await page.waitForTimeout(600)
  const dialog = await page.evaluate(() => {
    const el = document.querySelector('.el-dialog')
    if (!el) return { open: false }
    const labels = [...el.querySelectorAll('.el-form-item__label')].map((n) => n.textContent.trim())
    return { open: true, title: el.querySelector('.el-dialog__title')?.textContent?.trim() || '', labels }
  })
  check(dialog.open, '点击后注册弹窗能打开')
  check(dialog.title.includes('邀请码'), '弹窗标题说明了是邀请码注册', dialog.title)
  for (const field of ['邀请码', '姓名', '登录账号', '设置密码', '确认密码']) {
    check(dialog.labels.includes(field), `弹窗有「${field}」这一栏`)
  }

  await page.screenshot({ path: 'logs/login-register-entry.png' })
} finally {
  await browser.close()
}

console.log(`\n${fails.length === 0 ? '全部通过' : `${fails.length} 项失败：${fails.join(' / ')}`}`)
process.exit(fails.length === 0 ? 0 : 1)
