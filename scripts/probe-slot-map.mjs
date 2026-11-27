// 诊断：打印每个素材格 nodeId → slotOrder → 分到的素材图，并断言 9 格无重复、第 1 格拿原稿
// 用法：node scripts/probe-slot-map.mjs [模板id]
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
try {
  process.loadEnvFile(resolve(here, '../server/.env'))
} catch {
  process.loadEnvFile(resolve(here, '../.env.local'))
}

const { query } = await import('../server/db.js')
const { prepareAdminH5WorkflowTest, h5ImageSlotOrder, h5ResultNodeOrder } = await import(
  '../server/ai-skill-store.js'
)

const wanted = process.argv[2] || ''
const rows = await query(
  `SELECT s.id, s.title, s.organization_id, u.id AS admin_id, u.role, s.draft_configuration AS cfg
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
const versions = [1, 2, 3, 4].map((i) => `https://example.com/version-${i}.png`)
const refs = [1, 2, 3, 4].map((i) => `https://example.com/ref-${i}.png`)
const materials = { sketchOriginal: 'https://example.com/sketch.png', versions, referenceImages: refs }
const prepared = await prepareAdminH5WorkflowTest(user, row.id, {
  templateId: 'probe-template',
  difficulty: 'pro',
  materials,
  report: { title: '探针报告', course: '水彩', idea: '下雨的城市' },
})

console.log('模板:', row.title, '(', row.id, ')')

// 期望的第 N 张素材：真实素材池顺序 = 原稿 → 参考图 1..4 → 版本图 1..4
const expected = [materials.sketchOriginal, ...refs, ...versions]

console.log('\n--- 素材格逐格分配（slotOrder 应为 1..9，且第1格拿原稿） ---')
const slotRows = (prepared.steps || []).filter((step) => Number(step.slotOrder) > 0)
for (const step of [...slotRows].sort((a, b) => a.slotOrder - b.slotOrder)) {
  const got = (step.request?.images || [])[0] || '(空)'
  const want = expected[step.slotOrder - 1] || ''
  const short = (v) => String(v).replace('https://example.com/', '')
  console.log(
    `slot ${step.slotOrder}  node=${step.nodeId}  透传=${step.slotPassthrough === true ? '是' : '否'}  拿到=${short(got)}  期望=${short(want)}  ${got === want ? '✅' : '❌'}`,
  )
}

console.log('\n--- 结果节点顺序 ---')
console.log(h5ResultNodeOrder(row.cfg).map((node, i) => `${i + 1}.${node.id}`).join('  '))

const miss = slotRows.filter((step) => (step.request?.images || [])[0] !== expected[step.slotOrder - 1])
const gotList = slotRows.map((step) => (step.request?.images || [])[0]).filter(Boolean)
const orders = slotRows.map((step) => Number(step.slotOrder)).sort((a, b) => a - b)
const chainOk = orders.every((n, i) => n === i + 1)
console.log('\n对不上的格子:', miss.length ? miss.map((s) => `slot${s.slotOrder}/${s.nodeId}`).join(', ') : '无')
console.log('slotOrder 是否连续 1..N:', chainOk ? '是' : `否 → ${orders.join(',')}`)
console.log('每格都有图:', gotList.length === slotRows.length ? '是' : `否 ${gotList.length}/${slotRows.length}`)
console.log('9 张有无重复:', new Set(gotList).size === gotList.length ? '无重复' : `重复 ${gotList.length - new Set(gotList).size} 张`)
console.log('第 1 格是否拿到原稿:', (slotRows.find((s) => Number(s.slotOrder) === 1)?.request?.images || [])[0] === materials.sketchOriginal ? '是' : '否')
console.log('素材格总数:', h5ImageSlotOrder(row.cfg).length, '｜规划里带 slotOrder 的步数:', slotRows.length)
process.exit(0)
