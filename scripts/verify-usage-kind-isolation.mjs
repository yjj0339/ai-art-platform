// 验证：报告工作流库 与 AI 玩法中心 是否已彻底隔离（直接调新代码，不依赖服务端重启）
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { query, closeDb } from '../server/db.js'
import { listAdminSkills, listAdminH5WorkflowLibrary, listStudentSkills, createAdminSkill } from '../server/ai-skill-store.js'

for (const line of readFileSync(resolve(process.cwd(), 'server', '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#') || !t.includes('=')) continue
  const [k, ...rest] = t.split('=')
  if (!process.env[k]) process.env[k] = rest.join('=').trim()
}

const admin = (await query("SELECT id, organization_id FROM users WHERE account='guanliyuan88' LIMIT 1")).rows[0]
if (!admin) throw new Error('找不到管理员账号')
const orgId = admin.organization_id
const adminUser = { id: admin.id, role: 'admin', organization: { id: orgId }, campus: { id: '' } }

let pass = 0
let failCount = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { failCount++; console.log(`  FAIL  ${name}  ${detail}`) }
}

console.log('=== 1. AI 玩法中心（应只有学生玩法）===')
const skills = await listAdminSkills(adminUser)
for (const s of skills) console.log(`  - ${s.title}  [${s.usageKind}]  ${s.status}`)
check('不含任何报告工作流', skills.every((s) => s.usageKind === 'student_skill'))
check('包含「童话绘本封面」', skills.some((s) => s.title === '童话绘本封面'))
check('包含「测试玩法｜小动物插画」', skills.some((s) => s.title.includes('小动物插画')))
check('不含「方案2」系列', !skills.some((s) => s.title.includes('方案2')))
check('不含「新建报告风格工作流」', !skills.some((s) => s.title.includes('新建报告风格工作流')))

console.log('\n=== 2. 报告工作流库（应只有报告工作流）===')
const library = await listAdminH5WorkflowLibrary(adminUser)
for (const s of library) console.log(`  - ${s.title}  ${s.status}`)
check('库里条目均非学生玩法', !library.some((s) => s.title === '童话绘本封面' || s.title.includes('小动物插画')))
check('包含 4 条报告工作流', library.length === 4, `实际 ${library.length} 条`)

console.log('\n=== 3. 学生端可见玩法（应只有已发布学生玩法）===')
const stuRow = (await query("SELECT id, organization_id FROM users WHERE account='ceshi2' LIMIT 1")).rows[0]
const stuUser = { id: stuRow.id, role: 'student', organization: { id: stuRow.organization_id }, campus: { id: '' } }
const stuSkills = await listStudentSkills(stuUser, 'image')
for (const s of stuSkills) console.log(`  - ${s.title}`)
check('学生端不含报告工作流', stuSkills.every((s) => s.usageKind === 'student_skill'))

// 最小合法配置（供应商 + 一个生成节点 + 一条连线 + 学生页必填组件）
const minimalConfig = () => ({
  runtime: { provider: 'agnes', capability: 'text-to-image', promptTemplate: '{{subject}}', ratio: '1:1', count: 1 },
  workflow: {
    nodes: [
      { id: 'p1', type: 'prompt', data: { title: '创作提示词' } },
      { id: 'i1', type: 'image', data: { title: '图像生成' } },
      { id: 'r1', type: 'result', data: { title: '结果展示' } },
    ],
    edges: [
      { id: 'e1', source: 'p1', target: 'i1' },
      { id: 'e2', source: 'i1', target: 'r1' },
    ],
  },
  studentPage: {
    blocks: [
      { type: 'text', key: 'subject', label: '主题', required: true },
      { type: 'submit' },
      { type: 'result' },
    ],
  },
})

console.log('\n=== 4. 新建报告工作流 → 只进报告库，不进玩法中心 ===')
const created = await createAdminSkill(adminUser, {
  title: '【自检】隔离验证临时记录',
  summary: '',
  skillType: 'image',
  usageKind: 'report_workflow',
  configuration: minimalConfig(),
})
try {
  check('新建记录 usageKind = report_workflow', created.usageKind === 'report_workflow', created.usageKind)
  const skills2 = await listAdminSkills(adminUser)
  check('新记录不出现在 AI 玩法中心', !skills2.some((s) => s.id === created.id))
  const lib2 = await listAdminH5WorkflowLibrary(adminUser)
  check('新记录出现在报告工作流库', lib2.some((s) => s.id === created.id))
  check('报告库总数变成 5', lib2.length === 5, `实际 ${lib2.length}`)
} finally {
  await query('DELETE FROM ai_skills WHERE id=$1', [created.id])
  console.log('  （已删除自检临时记录）')
}

console.log('\n=== 5. 新建学生玩法 → 只进玩法中心 ===')
const created2 = await createAdminSkill(adminUser, {
  title: '【自检】学生玩法隔离临时记录',
  summary: '',
  skillType: 'image',
  configuration: minimalConfig(),
})
try {
  check('默认 usageKind = student_skill', created2.usageKind === 'student_skill', created2.usageKind)
  const lib3 = await listAdminH5WorkflowLibrary(adminUser)
  check('新学生玩法不出现在报告工作流库', !lib3.some((s) => s.id === created2.id))
  const skills3 = await listAdminSkills(adminUser)
  check('新学生玩法出现在 AI 玩法中心', skills3.some((s) => s.id === created2.id))
} finally {
  await query('DELETE FROM ai_skills WHERE id=$1', [created2.id])
  console.log('  （已删除自检临时记录）')
}

console.log(`\n结果: ${pass} 通过 / ${failCount} 失败`)
await closeDb()
process.exit(failCount ? 1 : 0)
