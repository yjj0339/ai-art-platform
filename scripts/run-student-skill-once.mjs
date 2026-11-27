/**
 * 学生端真实跑一次技能玩法（会真实调用模型、产生费用）
 *
 * 用途：验证「学生页面填写 → 后端画布工作流 → 出图」整条链路真的接通。
 * 只应手动执行，且必须显式带 --yes 才会真正发请求，避免被误当成回归脚本跑。
 *
 * 用法：
 *   node scripts/run-student-skill-once.mjs --skill=skill_xxx --yes
 *   可选：--subject=小兔子的月亮船  --style=蜡笔  --ratio=3:4
 *         --account=ceshi2 --password=123456789
 *         --image=docs/ark-marked-probe/user-upstream.png
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.APP_BASE || 'http://127.0.0.1:3000'

const argv = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=')
    return [k, v.length ? v.join('=') : true]
  }),
)

if (!argv.yes) {
  console.log('本脚本会真实调用模型并产生费用。确认执行请加 --yes，例如：')
  console.log('  node scripts/run-student-skill-once.mjs --skill=skill_xxx --yes')
  process.exit(0)
}
if (!argv.skill) {
  console.log('缺少 --skill=<技能ID>')
  process.exit(1)
}

const SKILL_ID = argv.skill
const ACCOUNT = argv.account || 'ceshi2'
const PASSWORD = argv.password || '123456789'

async function login(account, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password, organizationCode: 'demo-school' }),
  })
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('登录失败: ' + (await res.text()).slice(0, 200))
  return cookie
}

// 参考图必须是真实可解析的图片，手写的假 base64 会让上游报 500
const imgRel = argv.image || 'docs/ark-marked-probe/user-upstream.png'
const dataUrl = 'data:image/png;base64,' + readFileSync(resolve(process.cwd(), imgRel)).toString('base64')
console.log('样本图:', imgRel, Math.round(dataUrl.length / 1024), 'KB')

const cookie = await login(ACCOUNT, PASSWORD)
console.log(`学生登录成功: ${ACCOUNT}`)

const values = {
  subject: argv.subject || '小兔子的月亮船',
  style: argv.style || '蜡笔',
  ratio: argv.ratio || '3:4',
  reference_image: dataUrl,
}
console.log('学生填写:', { ...values, reference_image: '<' + Math.round(dataUrl.length / 1024) + 'KB png>' })

console.log('\n提交生成（真实调用模型，约 15-25 秒）...')
const t0 = Date.now()
const res = await fetch(`${BASE}/api/ai-skills/${SKILL_ID}/runs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ values }),
})
const text = await res.text()
console.log('HTTP', res.status, ' 耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's')

let json = {}
try { json = JSON.parse(text) } catch { console.log(text.slice(0, 600)); process.exit(1) }
if (!res.ok) { console.log('失败:', JSON.stringify(json).slice(0, 600)); process.exit(1) }

console.log('provider:', json.provider || json.run?.provider || '')
const images = json.images || json.run?.images || []
console.log('出图数量:', images.length)
for (const im of images) console.log('  ', im.imageUrl || im.url || JSON.stringify(im).slice(0, 120))
console.log('最终提示词:', json.prompt || json.run?.prompt || '')

const steps = json.steps || json.run?.steps || []
console.log('步骤:', JSON.stringify(steps, null, 1).slice(0, 800))
// nodeId 是画布节点 ID，出现在这里才说明真的走了画布工作流
const nodeIds = steps.map((s) => s.nodeId).filter(Boolean)
console.log(nodeIds.length ? `✅ 走了画布工作流，节点: ${nodeIds.join(', ')}` : '⚠️ 没有 nodeId，可能没走画布工作流')
