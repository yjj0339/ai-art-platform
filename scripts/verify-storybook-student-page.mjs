// 验证：学生按页面填完，服务端实际会拼出什么提示词、传几张图。
// 只做规划（planSkillWorkflow / buildSkillWorkflowRequest），不发任何真实生成请求。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

try {
  const text = readFileSync(join(process.cwd(), 'server', '.env'), 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at < 0) continue
    const key = trimmed.slice(0, at).trim()
    const value = trimmed.slice(at + 1).trim()
    if (key && !process.env[key]) process.env[key] = value
  }
} catch {}

const { query, closeDb } = await import('../server/db.js')
const { buildSkillWorkflowRequest, normalizeConfiguration } = await import('../server/ai-skill-store.js').catch(() => ({}))
const store = await import('../server/ai-skill-store.js')

const SKILL_ID = 'skill_4GHbiWsqZZYwIL7iXSVRlQkb'
const rows = await query('SELECT * FROM ai_skills WHERE id=$1', [SKILL_ID])
const row = rows.rows[0]
const configuration = row.draft_configuration

const values = {
  reference_image: 'https://example.test/student-upload.png',
  subject: '小熊的生日派对',
  style: '水彩',
  ratio: '3:4',
}

// 用与学生端完全相同的入口构造请求
const prepared = store.buildSkillWorkflowRequest(
  { id: row.id, skillType: row.skill_type, configuration },
  values,
)

console.log('实际执行步骤数:', prepared.steps.length)
prepared.steps.forEach((step, index) => {
  console.log(`\n第 ${index + 1} 步  ${step.nodeType}  capability=${step.request.capability}`)
  console.log('  prompt :', step.request.prompt)
  console.log('  images :', step.request.images.length, '张 →', step.request.images.join(', '))
  console.log('  count  :', step.request.count, ' ratio=', step.request.ratio)
})
console.log('\n最终取用的结果请求:', prepared.request.capability)

// buildSkillWorkflowRequest 内部就是严格模式（allowIncomplete 关闭）：
// 学生页缺组件、提示词变量没有对应填写项、必填项为空，都会在这里直接抛错。
console.log('\n严格校验: 已通过（构建请求时未抛错）')

// 必填项缺失必须被拦住，否则学生不填也能点生成
for (const missing of ['subject', 'style', 'reference_image']) {
  const partial = { ...values }
  delete partial[missing]
  try {
    store.buildSkillWorkflowRequest({ id: row.id, skillType: row.skill_type, configuration }, partial)
    console.log(`  必填拦截: ${missing} 缺失时“未拦截”（异常）`)
  } catch (error) {
    console.log(`  必填拦截: ${missing} 缺失 → ${error.message}`)
  }
}

await closeDb()
