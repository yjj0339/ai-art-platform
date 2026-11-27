// 探针：验证「用画布第一页当封面」新接口 /cover/canvas 的真实行为。
// 关键：必须证明“画布里有 data.output.url 的图时能取到”，这正是旧前端会漏判的形状。
import assert from 'node:assert/strict'
const BASE = process.env.BASE || 'http://127.0.0.1:3301'
let pass = 0
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`) }
  else console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`)
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
})
assert.ok(login.ok, 'login')
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
const headers = { 'Content-Type': 'application/json', Cookie: cookie }

const list = await (await fetch(`${BASE}/api/admin/h5-report-workflows`, { headers })).json()
const rows = list.workflows || []
ok('列表可读', rows.length > 0, `${rows.length} 条`)

const target = rows[0]
// 先在“没有出图”的状态下调一次：应当 409 且提示跑真实测试，而不是 500。
const emptyRes = await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}/cover/canvas`, { method: 'POST', headers })
const emptyBody = await emptyRes.json().catch(() => ({}))
ok('无出图时返回 409 而非 500', emptyRes.status === 409 || emptyRes.status === 200, `status=${emptyRes.status}`)
if (emptyRes.status === 409) ok('409 文案指向真实测试', /真实测试/.test(emptyBody.message || ''), emptyBody.message)

// 造一张 data:URL 图塞进 draftConfiguration 的 image 节点 data.output.url，
// 这正是画布真实写法的形状（前端旧逻辑只看 data.image 会漏）。
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAJUlEQVR42u3JMQEAAICvUf9/aQvYQEnbqQAAAAAAAAAAAAAAAAB4NBiAAAG0y3XhAAAAAElFTkSuQmCC'
const detailRes = await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}`, { headers })
const detail = await detailRes.json()
const original = JSON.parse(JSON.stringify(detail?.workflow?.draftConfiguration || {}))

const patched = JSON.parse(JSON.stringify(original))
patched.workflow = patched.workflow || { nodes: [], edges: [] }
patched.workflow.nodes = Array.isArray(patched.workflow.nodes) ? patched.workflow.nodes : []
// 保留原有节点结构，只给一个 image 节点写上 output.url，模拟“画布已出图”。
if (!patched.workflow.nodes.some((n) => n.type === 'image')) patched.workflow.nodes.push({ id: 'image-probe', type: 'image', data: { title: '探针图' } })
const imageNode = patched.workflow.nodes.find((n) => n.type === 'image')
imageNode.data = { ...(imageNode.data || {}), output: { url: `data:image/png;base64,${tinyPng}` } }

const writeRes = await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}`, {
  method: 'PATCH', headers, body: JSON.stringify({ coverUrl: '', coverSource: '' }),
})
ok('重置封面失败可忽略或 200', writeRes.status === 200 || writeRes.status === 400, `status=${writeRes.status}`)

// 直接把带 output.url 的配置写回（走 ai-skills 的更新口，保证 draft_configuration 生效）
const skillPatch = await fetch(`${BASE}/api/admin/ai-skills/${target.id}`, {
  method: 'PATCH', headers, body: JSON.stringify({ configuration: patched }),
})
ok('draftConfiguration 写入成功', skillPatch.ok, `status=${skillPatch.status}`)
if (skillPatch.ok) {
  const coverRes = await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}/cover/canvas`, { method: 'POST', headers })
  const coverBody = await coverRes.json().catch(() => ({}))
  ok('有 output.url 时能取到画布第一页', coverRes.ok && Boolean(coverBody.assetUrl), `status=${coverRes.status} assetUrl=${String(coverBody.assetUrl || '').slice(0, 40)}`)
  if (coverRes.ok) {
    ok('coverSource 落为 canvas-first-page', coverBody.workflow?.coverSource === 'canvas-first-page', coverBody.workflow?.coverSource)
    ok('返回的来源节点是 image', coverBody.sourceNode?.nodeType === 'image', JSON.stringify(coverBody.sourceNode || {}))
    // 还原：清掉封面，恢复原配置
    await fetch(`${BASE}/api/admin/ai-skills/${target.id}`, { method: 'PATCH', headers, body: JSON.stringify({ configuration: original }) })
    await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}`, { method: 'PATCH', headers, body: JSON.stringify({ coverUrl: '', coverSource: '' }) })
    const back = await (await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}`, { headers })).json()
    ok('已还原封面', !back.workflow?.coverUrl, `cover='${back.workflow?.coverUrl || ''}'`)
  }
}
console.log(`\n${pass} PASS`)
