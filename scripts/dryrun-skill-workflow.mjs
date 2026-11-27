// 只读干跑：把「童话绘本封面」当前草稿喂给 planSkillWorkflow，
// 打印真实执行步骤（不发任何生成请求、不花钱），验证用户截图里的流程跑起来会怎样。
const BASE = process.env.BASE || 'http://127.0.0.1:3000'
const SKILL_ID = 'skill_4GHbiWsqZZYwIL7iXSVRlQkb'

const res = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
})
const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')

const detailRes = await fetch(`${BASE}/api/admin/h5-report-workflows/${SKILL_ID}`, { headers: { cookie } })
const detail = await detailRes.json()
const cfg = detail.workflow.draftConfiguration

const { planSkillWorkflow } = await import('../server/ai-skill-store.js')

console.log('=== 节点 ===')
for (const n of cfg.workflow.nodes) {
  const d = n.data || {}
  console.log(`${n.type.padEnd(7)} ${n.id}  title=${JSON.stringify(d.title || '')}  prompt=${JSON.stringify(String(d.prompt || '').slice(0, 40))}`)
}
console.log('=== 连线 ===')
for (const e of cfg.workflow.edges) console.log(`${e.source} -> ${e.target}`)

console.log('\n=== 干跑结果（模拟学生只用默认输入） ===')
try {
  const plan = planSkillWorkflow(cfg, {})
  plan.steps.forEach((s, i) => {
    console.log(`\n第 ${i + 1} 步  node=${s.nodeId}  title=${JSON.stringify(s.title)}  capability=${s.request.capability}`)
    console.log(`  prompt : ${JSON.stringify(s.request.prompt)}`)
    console.log(`  images : ${JSON.stringify(s.request.images)}`)
    console.log(`  count  : ${s.request.count}  ratio=${s.request.ratio}  provider=${s.request.provider}`)
  })
  console.log(`\n实际生成次数: ${plan.steps.length}`)
} catch (err) {
  console.log('干跑抛错:', err.message)
}
