// 校验：H5 报告工作流是否按画布节点拆成多步（不发起任何付费调用）
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

const rows = await query(
  `SELECT s.id, s.title, s.organization_id, u.id AS admin_id, u.role
     FROM ai_skills s
     JOIN users u ON u.organization_id = s.organization_id
    WHERE s.skill_type = 'image'
      AND s.usage_kind = 'report_workflow'
      AND COALESCE(s.draft_configuration->'workflow'->'nodes', '[]'::jsonb) <> '[]'::jsonb
      AND u.role IN ('admin', 'org_admin', 'owner')
    ORDER BY s.updated_at DESC NULLS LAST
    LIMIT 1`,
)
const row = rows.rows[0]
if (!row) {
  console.log('SKIP: 没有找到带画布节点的图像工作流')
  process.exit(0)
}

const user = { id: row.admin_id, role: row.role, organization: { id: row.organization_id } }
const prepared = await prepareAdminH5WorkflowTest(user, row.id, {
  templateId: 'verify-template',
  difficulty: 'pro',
  materials: {
    sketchOriginal: 'https://example.com/sketch.png',
    versions: ['https://example.com/v1.png', 'https://example.com/v2.png'],
    referenceImages: ['https://example.com/ref.png'],
  },
  report: { title: '验证报告', course: '水彩', idea: '下雨的城市' },
})

const steps = prepared.steps || []
console.log('工作流:', row.title, '(', row.id, ')')
console.log('引用素材数:', prepared.materialItems.length)
console.log('规划步数:', steps.length)
let total = 0
steps.forEach((step, index) => {
  total += Number(step.request?.count || 0)
  console.log(
    `  #${index + 1} ${step.nodeId} ${step.nodeType} count=${step.request?.count}` +
    ` 参考图=${(step.request?.images || []).length}` +
    ` 提示词=${String(step.request?.prompt || '').slice(0, 24).replace(/\s+/g, ' ')}`,
  )
})
console.log('预计结果图总数:', total)
console.log('警告:', prepared.warnings || [])
process.exit(0)
