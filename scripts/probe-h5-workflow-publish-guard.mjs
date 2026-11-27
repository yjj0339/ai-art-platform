// 探针：验证「发布前必须先完成一次真实测试」这道守卫真的拦得住，且探针本身零副作用。
//
// ⚠️ 纪律（这条探针就是为它而写的）：
//   1. 绝不对 `POST /api/admin/h5-report-workflows/:id/test` 做探索性调用——它**没有任何供应商前置校验**，
//      直接 buildH5WorkflowRequest → generateImages，真调火山/Agnes 出图，产生真实费用。
//      （历史上一个同类探针假设「未配置供应商时 /test 会被拦截」，结果真的调了一次 volcengine。）
//   2. 只对 `/publish` 做「期望被拦截」的验证，且**必须先在只读阶段确认 testedAt 为空**。
//      publishAdminH5Workflow() 的守卫在 withTransaction 之前，testedAt 为空时 400 抛出，不会插入任何版本行。
//      若 testedAt 非空则**跳过**，绝不放行——否则会真的发布出一个版本。
//   3. 跑完复读一次，证明 status/versionCount/testedAt 一点没动。
//
// 用法：node scripts/probe-h5-workflow-publish-guard.mjs
import { readFileSync } from 'node:fs'

const envText = readFileSync(new URL('../server/.env', import.meta.url), 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:3000'
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
})
if (!login.ok) {
  console.log('登录失败', login.status, (await login.text()).slice(0, 200))
  process.exit(1)
}
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
const auth = { Cookie: cookie }

// ---- 阶段 1：只读，挑一个「有节点、未测试、未发布」的草稿 ----
const listRes = await fetch(`${BASE}/api/admin/h5-report-workflows`, { headers: auth })
const list = await listRes.json()
const all = list.workflows || []
check('工作流库列表可读', listRes.ok && Array.isArray(all), `共 ${all.length} 条`)

const target = all.find((w) => w.skillType === 'image' && !w.testedAt && Number(w.nodeCount || 0) > 0)
if (!target) {
  console.log('\nSKIP：当前没有「有节点 + testedAt 为空」的草稿，无法安全验证发布守卫。')
  console.log('      先在工作流库抽屉里存一个带节点的草稿，再跑本探针。')
  process.exit(0)
}
console.log(`\n目标工作流: ${target.id} 「${target.title}」 status=${target.status} nodes=${target.nodeCount} testedAt=${target.testedAt || '(空)'}`)

check('前置条件：testedAt 为空（否则发布守卫会放行，探针必须跳过）', !target.testedAt, target.testedAt || '(空)')
check('前置条件：草稿有生成节点（否则 400 会来自「缺少节点」而非守卫）', Number(target.nodeCount || 0) > 0, `${target.nodeCount} 个节点`)
check('前置条件：当前未发布（避免影响已上线版本）', target.status !== 'published' && Number(target.versionCount || 0) === 0,
  `status=${target.status} versionCount=${target.versionCount}`)

if (results.some((r) => !r.ok)) {
  console.log('\n前置条件不满足，为安全起见不发起任何 POST，直接结束。')
  process.exit(1)
}

// ---- 阶段 2：唯一的写向请求，且是「期望被 400 拒绝」的那一个 ----
const pubRes = await fetch(`${BASE}/api/admin/h5-report-workflows/${encodeURIComponent(target.id)}/publish`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: '{}',
})
const pubText = await pubRes.text()
check('未测试的草稿调 /publish 被拒绝（400）', pubRes.status === 400, `status=${pubRes.status}`)
check('拒绝理由是「发布前必须先完成一次真实测试」', pubText.includes('发布前必须先完成一次真实测试'), pubText.slice(0, 160))

// ---- 阶段 3：复读，证明零副作用 ----
const afterRes = await fetch(`${BASE}/api/admin/h5-report-workflows`, { headers: auth })
const afterItem = ((await afterRes.json()).workflows || []).find((w) => w.id === target.id)
check('发布被拒后 status 未变', afterItem && afterItem.status === target.status, `status=${afterItem?.status}`)
check('发布被拒后 versionCount 未变（没有插入版本行）',
  afterItem && Number(afterItem.versionCount || 0) === Number(target.versionCount || 0),
  `versionCount=${afterItem?.versionCount}`)
check('发布被拒后 testedAt 仍为空（没有被误标为已测试）', afterItem && !afterItem.testedAt, afterItem?.testedAt || '(空)')

console.log('\n注：本探针**从未**调用 /test —— 该接口无供应商前置校验，会真调付费模型出图。')
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail}`)
  process.exit(1)
}
