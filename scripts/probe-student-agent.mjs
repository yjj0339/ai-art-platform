/**
 * 探针：学生端五页共用的智能体。
 * 只调用「听懂 + 整理描述」接口，不触发任何出图，不花钱。
 *
 * 用法：node scripts/probe-student-agent.mjs [page] [一句话]
 * 例：  node scripts/probe-student-agent.mjs paint "帮我画一只月球上的猫"
 */
const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:3000'

const page = process.argv[2] || 'paint'
const text = process.argv[3] || '帮我画一只月球上的猫'

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`登录失败 ${res.status} ${JSON.stringify(body)}`)
  const cookie = (res.headers.getSetCookie?.() || []).map((v) => v.split(';')[0]).join('; ')
  return cookie
}

const cookie = await login()
console.log('[登录] ok')

const started = Date.now()
const res = await fetch(`${BASE}/api/student/agent/understand`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie, origin: BASE },
  body: JSON.stringify({ page, text, history: [] }),
})
const cost = Date.now() - started
const data = await res.json().catch(() => ({}))

console.log(`\n[状态] ${res.status}  用时 ${cost}ms`)
if (!res.ok) {
  console.log('[失败]', JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log(`[智能体] ${data.agentName || '(空)'}`)
console.log(`[模型]   ${data.provider || '?'} / ${data.model || '?'}  服务端计时 ${data.durationMs ?? '?'}ms`)
console.log(`[能跑吗] ${data.readyToRun ? '能 → 会直接开始生成' : '不能 → 先问清楚'}`)
console.log(`[动作]   ${data.actionKey || '(空)'}`)
console.log(`[信心]   ${data.confidence ?? '(空)'}`)
console.log(`\n[回话]\n${data.reply || '(空)'}`)
if (data.prompt) console.log(`\n[整理后的描述] (${data.prompt.length} 字)\n${data.prompt}`)
if (Array.isArray(data.additions) && data.additions.length) console.log(`\n[替你补了]\n- ${data.additions.map((a) => `${a.label}：${a.value}`).join('\n- ')}`)
if (Array.isArray(data.missing) && data.missing.length) console.log(`\n[不敢编]\n- ${data.missing.join('\n- ')}`)
if (Array.isArray(data.questions) && data.questions.length) console.log(`\n[要问你]\n- ${data.questions.join('\n- ')}`)
