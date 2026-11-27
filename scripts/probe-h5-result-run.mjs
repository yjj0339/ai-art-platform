// 探针：真实模板 → 规划 → 跑一遍（出图函数是假的，不花一分钱）→ 看 H5 报告到底拿到哪些图。
// 用法：node scripts/probe-h5-result-run.mjs [模板id]
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
try {
  process.loadEnvFile(resolve(here, '../server/.env'))
} catch {
  process.loadEnvFile(resolve(here, '../.env.local'))
}

const { query } = await import('../server/db.js')
const { prepareAdminH5WorkflowTest } = await import('../server/ai-skill-store.js')
const { runImageSteps } = await import('../server/image-step-runner.js')

const wanted = process.argv[2] || ''
const rows = await query(
  `SELECT s.id, s.title, s.organization_id, u.id AS admin_id, u.role
     FROM ai_skills s
     JOIN users u ON u.organization_id = s.organization_id
    WHERE s.skill_type = 'image'
      AND s.usage_kind = 'report_workflow'
      AND COALESCE(s.draft_configuration->'workflow'->'nodes', '[]'::jsonb) <> '[]'::jsonb
      AND u.role IN ('admin', 'org_admin', 'owner')
      ${wanted ? 'AND s.id = $1' : ''}
    ORDER BY s.updated_at DESC NULLS LAST
    LIMIT 1`,
  wanted ? [wanted] : [],
)
const row = rows.rows[0]
if (!row) {
  console.log('SKIP: 没有找到带画布节点的图像工作流')
  process.exit(0)
}

const user = { id: row.admin_id, role: row.role, organization: { id: row.organization_id } }
// 9 张假素材，正好填满左边 9 个素材格
const versions = [1, 2, 3, 4].map((i) => `https://example.com/version-${i}.png`)
const refs = [1, 2, 3, 4].map((i) => `https://example.com/ref-${i}.png`)
const prepared = await prepareAdminH5WorkflowTest(user, row.id, {
  templateId: 'probe-template',
  difficulty: 'pro',
  materials: { sketchOriginal: 'https://example.com/sketch.png', versions, referenceImages: refs },
  report: { title: '探针报告', course: '水彩', idea: '下雨的城市' },
})

const calls = []
const generate = async (request, step) => {
  calls.push({ nodeId: step?.nodeId || '', refs: (request.images || []).length, provider: 'probe' })
  return { provider: 'probe', images: [{ id: `x-${step?.nodeId || 'go'}`, imageUrl: `probe://${step?.nodeId || 'go'}` }] }
}
const executed = await runImageSteps(prepared, { generate })

console.log('模板:', row.title, '(', row.id, ')')
console.log('规划步数:', (prepared.steps || []).length)
console.log('素材格:', executed.materialImages.length, '张 →', executed.materialImages.join(', ').replace(/https:\/\/example\.com\//g, ''))
console.log('报告结果图:', executed.images.length, '张 →', executed.images.join(', '))
console.log('真正调模型:', calls.length, '次')
console.log('每次带几张参考图:', calls.map((c) => `${c.nodeId || 'go'}:${c.refs}`).join(' '))
console.log('警告:', prepared.warnings || [])
process.exit(0)
