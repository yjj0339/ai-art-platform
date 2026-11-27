// 探针：读一条真实工作流的 draft_configuration，看画布图片节点到底把图片地址存哪个字段。
// 目的：`H5WorkflowLibraryPanel.useCanvasFirstPage()` 现在只看 data.image / data.imageUrl / data.preview，
// 需要确认画布真实产物是否落在 data.output.url 上（若如此，则该函数在有图的画布上也会误报“还没有生成过图片”）。
const BASE = 'http://127.0.0.1:3000'

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
})
if (!login.ok) {
  console.log('LOGIN_FAIL', login.status, await login.text())
  process.exit(1)
}
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
const headers = { 'Content-Type': 'application/json', Cookie: cookie }

const listRes = await fetch(`${BASE}/api/admin/h5-report-workflows`, { headers })
const list = await listRes.json()
const rows = list.workflows || []
console.log('WORKFLOW_COUNT', rows.length)
for (const row of rows) console.log('  ROW', JSON.stringify({ id: row.id, title: row.title, stage: row.stage, nodeCount: row.nodeCount, cover: row.coverSource || '(none)', coverUrl: String(row.coverUrl || '').slice(0, 48) }))

for (const row of rows) {
  const detailRes = await fetch(`${BASE}/api/admin/h5-report-workflows/${row.id}`, { headers })
  const detail = await detailRes.json()
  const workflow = detail?.workflow || {}
  console.log('---', row.id, '| keys:', Object.keys(workflow).join(','))
  const cfg = workflow.draftConfiguration || workflow.configuration || {}
  const nodes = cfg?.workflow?.nodes || []
  console.log('  nodes:', nodes.length, '| types:', [...new Set(nodes.map((n) => n.type))].join(','))
  for (const node of nodes) {
    if (!['image', 'upload', 'result'].includes(node.type)) continue
    const d = node.data || {}
    console.log('  FIELD', node.type, node.id, '| data keys:', Object.keys(d).join(','),
      '| output.url:', String(d.output?.url || '').slice(0, 40),
      '| data.image:', String(d.image || '').slice(0, 40))
  }
}
