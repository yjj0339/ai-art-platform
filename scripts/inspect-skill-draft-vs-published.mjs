// 只读：对比「童话绘本封面」的草稿态与发布态，检查学生端到底在用哪一份配置。
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

const rows = await query(
  `SELECT id, title, skill_type, status, published_version_id,
          draft_configuration, published_configuration, updated_at
   FROM ai_skills WHERE title LIKE '%童话绘本%' OR title LIKE '%绘本封面%' ORDER BY updated_at DESC`,
)

function summarize(label, cfg) {
  if (!cfg || !Object.keys(cfg).length) return `${label}: 空`
  const wf = cfg.workflow || {}
  const nodes = Array.isArray(wf.nodes) ? wf.nodes : []
  const edges = Array.isArray(wf.edges) ? wf.edges : []
  const blocks = cfg.studentPage?.blocks || []
  const lines = [
    `${label}: 节点 ${nodes.length} 个 连线 ${edges.length} 条`,
    `  节点: ${nodes.map((n) => `${n.type}:${n.id}:${(n.data?.title || '').slice(0, 10)}`).join(' | ')}`,
    `  组件: ${blocks.map((b) => `${b.type}${b.key ? '/' + b.key : ''}${b.binding ? '→' + b.binding : ''}`).join(' | ')}`,
    `  提示词模板: ${(cfg.runtime?.promptTemplate || '(空)').slice(0, 60)}`,
  ]
  return lines.join('\n')
}

for (const row of rows.rows) {
  console.log('='.repeat(70))
  console.log(`${row.title} | ${row.skill_type} | 状态=${row.status} | 发布版本=${row.published_version_id || '(无)'}`)
  console.log(`更新时间: ${row.updated_at}`)
  console.log(summarize('草稿', row.draft_configuration))
  console.log(summarize('已发布', row.published_configuration))
}

await closeDb()
