/**
 * 查看智能体最近调用记录（只读，不花钱）。
 * 用法：node scripts/show-agent-logs.mjs [条数]
 */
const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:3000'
const limit = Number(process.argv[2] || 10)

const res0 = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: BASE },
  body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
})
if (!res0.ok) throw new Error(`管理员登录失败 ${res0.status} ${await res0.text()}`)
const cookie = (res0.headers.getSetCookie?.() || []).map((v) => v.split(';')[0]).join('; ')
console.log('[登录] 管理员 ok')

const res = await fetch(`${BASE}/api/admin/report-agent-config/logs?limit=${limit}`, {
  headers: { cookie, origin: BASE },
})
const data = await res.json().catch(() => ({}))
if (!res.ok) {
  console.log('[失败]', res.status, JSON.stringify(data).slice(0, 400))
  process.exit(1)
}
const logs = data.logs || []
console.log(`\n共 ${logs.length} 条：`)
for (const item of logs) {
  const when = new Date(item.at || item.createdAt || Date.now()).toLocaleTimeString('zh-CN')
  console.log(`\n[${when}] ${item.flowKey || '?'}  status=${item.status || '?'}  ${item.durationMs ?? '?'}ms`)
  if (item.source) console.log(`  来源: ${item.source}`)
  if (item.summary) console.log(`  摘要: ${String(item.summary).slice(0, 80)}`)
  if (item.error) console.log(`  错误: ${String(item.error).slice(0, 300)}`)
  if (item.diagnostic) console.log(`  诊断: ${JSON.stringify(item.diagnostic).slice(0, 300)}`)
}
