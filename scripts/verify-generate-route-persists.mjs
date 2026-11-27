/**
 * 验收（端到端）：真实服务上，/api/ai/image/generate 返回的图片地址必须是站内 /api/assets/<id>，
 * 不能是上游的 24 小时临时链接。
 *
 * 为什么必须端到端再验一遍：
 * 上一个脚本只验了「转存函数自己好不好使」。函数写对了但没接在接口上，等于没改。
 * 这里真的打 /api/ai/image/generate，确认接线是通的。
 *
 * 零花费做法：
 * 用 admin 账号把「图像模型」指向一个本地假图床？不行 —— 出图地址在数据库里，改它风险太大。
 * 改成更干净的办法：直接调接口，但把上游 baseUrl 换成假图床。
 * 由于 provider 配置也在库里，最稳的是「只验接线、不验真实出图」：
 * 用一个临时创建的学生账号 + 拦截上游域名。上游域名拦不到就会真花钱，所以这里不这么做。
 *
 * 最终采用：**只读验证 + 源码接线断言**。
 *   ① 从 server/index.js 源码里确认 /api/ai/image/generate 分支里真的调了 preserveGeneratedImages
 *   ② 确认调用点在 sendJson 之前（否则返回的还是原图）
 *   ③ 确认失败不阻断（没有 throw）
 *   ④ 真打一次接口，确认响应里带 preservedImageCount 字段（说明新代码已生效、服务已重启）
 * 前三条零成本零风险，第四条只发一次会被「模型未配置」挡回的请求，不产生费用。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  → ${JSON.stringify(detail)}`}`)
}

const source = readFileSync(path.join(ROOT, 'server/index.js'), 'utf8')

// 定位 /api/ai/image/generate 那一段
const routeStart = source.indexOf("url.pathname === '/api/ai/image/generate'")
check('① 找到了出图接口分支', routeStart > 0)
const routeBlock = source.slice(routeStart, routeStart + 2600)

const callIndex = routeBlock.indexOf('preserveGeneratedImages(')
const sendIndex = routeBlock.indexOf('sendJson(res, 200')
check('① 出图接口里调用了转存函数', callIndex > 0, { callIndex })
check('② 转存在返回响应之前（否则返回的还是临时链接）', callIndex > 0 && sendIndex > callIndex, { callIndex, sendIndex })
check('③ 转存包在 try 里或本身不抛错（失败不能阻断出图）',
  routeBlock.includes('preserved') && !/preserveGeneratedImages[\s\S]{0,300}throw/.test(routeBlock.slice(callIndex, callIndex + 400)))
check('③ 返回体透出了转存数量（排查和验收都能直接看到）',
  routeBlock.includes('preservedImageCount') && routeBlock.includes('preserveFailedCount'))
check('③ 转存失败时给出可见告警，而不是静默',
  /preserved\.failed\s*\?/.test(routeBlock) || routeBlock.includes('没能存进素材库'))
check('④ 传了 dataDir（不传就写不进素材库）', /preserveGeneratedImages\([\s\S]{0,200}dataDir/.test(routeBlock))

// ---- 其余两个「学生会把图存下来」的入口，也必须转存 ----
// 只改 /api/ai/image/generate 是不够的：H5 报告工作流和 AI 技能走的是
// runImageSkillSteps → 服务端内部直调 generateImages，压根不经过那个路由。
const h5Start = source.indexOf("url.pathname === '/api/h5-report/canvas-workflow/run'")
check('⑥ 找到了 H5 报告工作流接口', h5Start > 0)
const h5Block = source.slice(h5Start, h5Start + 6000)
check('⑥ H5 报告工作流的图也转存了（否则报告里的图 24 小时后全破）',
  h5Block.includes('preserveGeneratedImages(') && h5Block.includes("kind: 'h5-report'"))
check('⑥ H5 报告转存结果同步到了 resultImages（只改 images 会留下外链）',
  h5Block.includes('executed.resultImages') && h5Block.includes('swapUrl'))
check('⑥ H5 报告转存失败时给出可见告警', h5Block.includes('没能存进素材库'))

const skillStart = source.indexOf('studentAiSkillRunMatch && req.method')
check('⑦ 找到了学生 AI 技能运行接口', skillStart > 0)
const skillBlock = source.slice(skillStart, skillStart + 1400)
check('⑦ AI 技能的图也转存了',
  skillBlock.includes('preserveGeneratedImages(') && skillBlock.includes("kind: 'ai-skill'"))
check('⑦ AI 技能返回的是转存后的地址（不能还发原图）',
  /images:\s*preserved\.images/.test(skillBlock))

// 后台预览类接口不进学生作品库，故意不转存 —— 断言它们没被误改，
// 避免以后有人「顺手统一一下」把管理员的测试图塞进学生素材里。
const adminTestStart = source.indexOf("adminAiSkillActionMatch && req.method === 'POST'")
const adminTestBlock = adminTestStart > 0 ? source.slice(adminTestStart, adminTestStart + 1200) : ''
check('⑧ 后台技能测试预览没有转存（不该往学生素材库里塞测试图）',
  adminTestStart > 0 && !adminTestBlock.includes('preserveGeneratedImages('))

// ---- 真打一次接口：确认新代码已生效（服务重启过） ----
const API = 'http://127.0.0.1:3000'
const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
check('⑤ 学生账号能登录', login.status === 200, login.status)
const cookie = (login.headers.getSetCookie?.() || []).map((item) => item.split(';')[0]).join('; ')

// 故意发一个空 prompt：服务端会在「调用上游之前」就 400 掉，不产生任何出图费用。
// 注意：空 prompt 是在 generateImages 内部抛错，走的是错误处理分支，
// 不会经过我们改的那段 sendJson，所以**不能**靠响应体里有没有新字段来判断代码是否生效。
// 真正可靠的证据是：服务进程的启动时间晚于 index.js 的修改时间 —— 改完没重启，
// 跑的还是老代码，这时候所有源码断言都通过、线上行为却还是老样子。
const probe = await fetch(`${API}/api/ai/image/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ prompt: '' }),
})
const probeBody = await probe.json().catch(() => ({}))
check('⑤ 空 prompt 被挡在调用上游之前（400，不花钱）', probe.status === 400, { status: probe.status, body: probeBody })

// 进程启动时间 vs 源码修改时间
const { statSync } = await import('node:fs')
const { execFileSync } = await import('node:child_process')
const sourceMtime = statSync(path.join(ROOT, 'server/index.js')).mtimeMs
let processStart = 0
try {
  const raw = execFileSync('powershell', ['-NoProfile', '-Command',
    "(Get-Process -Id (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'server/index\\.js' } | Select-Object -First 1 -ExpandProperty ProcessId)).StartTime.ToUniversalTime().ToString('o')",
  ], { encoding: 'utf8' }).trim()
  processStart = new Date(raw).getTime()
} catch (error) {
  console.log('  （读不到进程启动时间，跳过这项）', error.message.slice(0, 60))
}
check('⑤ 服务进程是在改完源码之后启动的（否则跑的还是老代码）',
  processStart > sourceMtime, { processStart: new Date(processStart).toISOString(), sourceMtime: new Date(sourceMtime).toISOString() })

const failed = checks.filter((item) => !item.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`)
if (failed.length) {
  console.log('失败项：')
  failed.forEach((item) => console.log(`  - ${item.name}`))
  process.exit(1)
}
console.log('全部通过：出图接口确实接了转存，且失败不阻断出图。')
