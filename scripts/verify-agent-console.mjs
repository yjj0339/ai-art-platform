// 验证后台「智能体配置」页新增的三项能力：
//   ① 身份参数（agent 是否带 name/masterPrompt 等）
//   ② 试跑接口（只调文本模型，不出图、不扣分）
//   ③ 调用记录（试跑后能查到一条 agent.dryRun）
// 用法：node scripts/verify-agent-console.mjs
const BASE = process.env.API_BASE || 'http://127.0.0.1:3000'

let pass = 0
let fail = 0
const failures = []

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

let cookie = ''

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (cookie) headers.Cookie = cookie
  if (options.body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE}${path}`, { ...options, headers })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: response.status, json }
}

async function main() {
  console.log('\n== 0. 登录管理员 ==')
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
  })
  check('管理员登录成功', login.status === 200 && login.json?.ok === true, `status=${login.status}`)
  if (login.status !== 200) throw new Error('登录失败，后续无法验证')

  console.log('\n== 1. 读取智能体配置（身份参数） ==')
  const cfg = await api('/api/admin/report-agent-config')
  check('配置文件返回 200', cfg.status === 200, `status=${cfg.status}`)
  const config = cfg.json || {}
  const agents = config.agents || []
  check('至少 1 个智能体', agents.length >= 1, `${agents.length} 个`)
  const primary = agents.find(item => item.status === 'enabled') || agents[0]
  check('智能体有名称', Boolean(primary?.name), primary?.name || '(空)')
  check('智能体有提示词（masterPrompt 或 persona）', Boolean(primary?.masterPrompt || primary?.persona))
  const bindings = config.bindings || {}
  const boundKeys = Object.keys(bindings).filter(key => bindings[key] === primary?.id)
  check('该智能体已绑定流程', boundKeys.length > 0, `${boundKeys.length} 条`)
  check('返回流程清单 flows', Array.isArray(config.flows) && config.flows.length >= 10, `${config.flows?.length ?? 0} 条`)

  console.log('\n== 2. 调用记录接口（空态可用） ==')
  const logsBefore = await api('/api/admin/report-agent-config/logs?limit=5')
  check('记录接口返回 200', logsBefore.status === 200, `status=${logsBefore.status}`)
  check('返回 logs 数组', Array.isArray(logsBefore.json?.logs), `条数 ${logsBefore.json?.logs?.length ?? 'N/A'}`)
  check('返回可选动作清单 actions', Array.isArray(logsBefore.json?.actions) && logsBefore.json.actions.length >= 6, `${logsBefore.json?.actions?.length ?? 0} 个动作`)
  const actionKeys = (logsBefore.json?.actions || []).map(item => item.key)
  check('动作含 出图 / 出视频 / 只是聊天', ['action.image.generate', 'action.video.generate', 'action.chat'].every(key => actionKeys.includes(key)), actionKeys.join(', '))
  const countBefore = logsBefore.json?.logs?.length ?? 0

  console.log('\n== 3. 试跑（明确下令：帮我画一只月球上的猫） ==')
  const run1 = await api('/api/admin/report-agent-config/preview', {
    method: 'POST',
    body: JSON.stringify({ text: '帮我画一只月球上的猫', agentId: primary?.id || '' }),
  })
  check('试跑接口返回 200', run1.status === 200, `status=${run1.status} ${run1.json?.message || ''}`)
  const r1 = run1.json
  if (r1?.ok) {
    console.log('    模型原始判断：', JSON.stringify(r1))
    check('isCommand = true（明确下令要执行）', r1.isCommand === true)
    check('actionKey 落在出图类动作', r1.actionKey === 'action.image.generate', r1.actionKey)
    check('动作带中文名与花费说明', Boolean(r1.actionLabel) && Boolean(r1.spend), `${r1.actionLabel} / ${r1.spend}`)
    check('给了整理后的描述 filledPrompt', typeof r1.filledPrompt === 'string' && r1.filledPrompt.length > 4, `${(r1.filledPrompt || '').length} 字`)
    check('补充项是 {label,value} 结构化数组', Array.isArray(r1.additions) && r1.additions.every(item => item && item.label && item.value), `${r1.additions?.length ?? 0} 条`)
    check('confidence 在 0~1', typeof r1.confidence === 'number' && r1.confidence >= 0 && r1.confidence <= 1, String(r1.confidence))
    check('耗时大于 0（前端要展示秒数）', Number(r1.durationMs) > 0, `${r1.durationMs}ms`)
  } else {
    check('试跑返回结果结构', false, JSON.stringify(run1.json).slice(0, 200))
  }

  console.log('\n== 4. 试跑（只是在想，不该执行） ==')
  const run2 = await api('/api/admin/report-agent-config/preview', {
    method: 'POST',
    body: JSON.stringify({ text: '我想画猫，但不知道背景用什么', agentId: primary?.id || '' }),
  })
  const r2 = run2.json
  if (r2?.ok) {
    console.log('    模型原始判断：', JSON.stringify(r2))
    check('不会直接执行（isCommand=false 或判定为先追问）', r2.isCommand === false || r2.actionKey === 'action.clarify', `isCommand=${r2.isCommand} / ${r2.actionKey}`)
    check('没有落到直接出图', r2.actionKey !== 'action.image.generate', r2.actionKey)
    check('给了追问或补充，不是空手', (r2.questions?.length || 0) + (r2.additions?.length || 0) > 0, `问 ${r2.questions?.length ?? 0} / 补 ${r2.additions?.length ?? 0}`)
  } else {
    check('第二次试跑返回结果结构', false, JSON.stringify(run2.json).slice(0, 200))
  }

  console.log('\n== 5. 试跑（空文本应被拦下） ==')
  const runEmpty = await api('/api/admin/report-agent-config/preview', {
    method: 'POST',
    body: JSON.stringify({ text: '   ', agentId: primary?.id || '' }),
  })
  check('空文本返回 400', runEmpty.status === 400, `status=${runEmpty.status}`)

  console.log('\n== 6. 调用记录已写入 ==')
  const logsAfter = await api('/api/admin/report-agent-config/logs?limit=20')
  const list = logsAfter.json?.logs || []
  check('记录条数增加了', list.length > countBefore, `${countBefore} → ${list.length}`)
  const dryLogs = list.filter(item => item.flowKey === 'agent.dryRun')
  check('有 agent.dryRun 记录', dryLogs.length >= 2, `${dryLogs.length} 条`)
  const latest = dryLogs[0]
  if (latest) {
    check('记录带状态 ok', latest.status === 'ok', latest.status)
    check('记录带模型名', Boolean(latest.model), latest.model || '(空)')
    check('记录带耗时', Number(latest.durationMs) > 0, `${latest.durationMs}ms`)
    check('记录带来源标记「后台试跑」', latest.source === '后台试跑', latest.source)
    check('记录不含学生原话（脱敏）', !JSON.stringify(latest).includes('月球上的猫'), latest.summary)
  }
  const filtered = await api('/api/admin/report-agent-config/logs?flowKey=agent.dryRun&limit=5')
  check('按 flowKey 过滤生效', (filtered.json?.logs || []).every(item => item.flowKey === 'agent.dryRun'), `${filtered.json?.logs?.length ?? 0} 条`)
  const failedOnly = await api('/api/admin/report-agent-config/logs?status=failed&limit=5')
  check('按结果过滤生效', (failedOnly.json?.logs || []).every(item => item.status !== 'success'), `${failedOnly.json?.logs?.length ?? 0} 条`)

  console.log('\n== 7. 保存配置（重排后保存链路未坏） ==')
  const saved = await api('/api/admin/report-agent-config', {
    method: 'POST',
    body: JSON.stringify({ agents: config.agents, bindings: config.bindings, activeAgentId: config.activeAgentId }),
  })
  check('原样保存成功（幂等）', saved.status === 200 && saved.json?.ok === true, `status=${saved.status} ${saved.json?.message || ''}`)
  const reread = await api('/api/admin/report-agent-config')
  const rereadAgents = reread.json?.agents || []
  check('保存后智能体数量不变', rereadAgents.length === agents.length, `${agents.length} → ${rereadAgents.length}`)
  const rereadBound = Object.keys(reread.json?.bindings || {}).filter(key => reread.json.bindings[key] === primary?.id)
  check('保存后流程绑定数不变', rereadBound.length === boundKeys.length, `${boundKeys.length} → ${rereadBound.length}`)

  console.log('\n== 8. 清掉本次试跑产生的记录 ==')
  const cleared = await api('/api/admin/report-agent-config/logs/clear', { method: 'POST', body: JSON.stringify({}) })
  check('清理接口返回 200', cleared.status === 200, `status=${cleared.status}`)
  const logsFinal = await api('/api/admin/report-agent-config/logs?limit=5')
  check('记录已清空', (logsFinal.json?.logs || []).length === 0, `剩 ${logsFinal.json?.logs?.length ?? 0} 条`)

  console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项`)
  if (fail) {
    console.log('失败项：')
    failures.forEach(item => console.log(`  - ${item}`))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('\n脚本异常：', error.message)
  process.exitCode = 1
})
