// 探针：报告工作流库在真实 Postgres 下的「并发写」行为。
//
// 要回答的问题：updateAdminH5WorkflowLibraryItem() 是「读整块 draft_configuration → 改 → 整块写回」，
// 两个并发 PATCH 改不同字段时，后写的会不会把先写的字段整块覆盖掉（丢更新）。
// 真实场景：管理员开两个标签页 / 双击保存 / AI 生成封面与「保存设置」同时发生。
//
// 安全：只挑一条现有草稿；每轮跑完用 PATCH /api/admin/ai-skills/:id {configuration: 原值} 还原。
// 用法：node scripts/probe-h5-workflow-concurrency.mjs   （BASE 可覆盖，默认 127.0.0.1:3000）
const BASE = process.env.BASE || 'http://127.0.0.1:3000'

let pass = 0
let fail = 0
function ok(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`PASS  ${name}${detail ? `  — ${detail}` : ''}`) }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`) }
}

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
})
ok('管理员登录成功', loginRes.status === 200, `status=${loginRes.status}`)
const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]
const headers = { Cookie: cookie }

const listRes = await fetch(`${BASE}/api/admin/h5-report-workflows`, { headers })
const list = await listRes.json()
const workflows = list.workflows || []
ok('工作流列表可读', listRes.status === 200 && workflows.length > 0, `${workflows.length} 条`)
if (!workflows.length) { console.log('\n无可测数据'); process.exit(1) }

// 只挑草稿（已发布行的 published_configuration 也会被同步，改动面更大，这里不碰）
const target = workflows.find((w) => w.stage !== 'published') || workflows[0]
console.log(`\n目标: ${target.id} | stage=${target.stage} | title=${target.title}`)

// 记原值，用于还原
// ⚠️ 还原必须走工作流库自己的 PATCH：`PATCH /api/admin/ai-skills/:id` 会走 normalizeConfiguration 严格校验，
// 未选供应商的草稿会被 400「请选择已接入的 Agnes 或火山引擎供应商」挡掉，无法用它还原。
const detailRes = await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}`, { headers })
const baseline = (await detailRes.json()).workflow || {}
const RESTORE_BODY = {
  title: baseline.title || target.title,
  coverUrl: baseline.coverUrl || '',
  coverSource: baseline.coverSource || '',
  studentSelectable: Boolean(baseline.studentSelectable),
  estimatedMinutes: Number(baseline.estimatedMinutes || 0),
  pageCount: Number(baseline.pageCount || 0),
  dailyLimit: Number(baseline.dailyLimit || 0),
}

async function restore() {
  const res = await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(RESTORE_BODY),
  })
  return res.status
}
async function readItem() {
  const res = await fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}`, { headers })
  return (await res.json()).workflow || {}
}
function patch(body) {
  return fetch(`${BASE}/api/admin/h5-report-workflows/${target.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// 六个互不相同的字段，每个只改一个 —— 并发时若丢更新，读回来就会缺项
const PROBE_COVER = '/api/ai-skill-covers/probe-org/concurrency.webp'
const PROBE_TITLE = '并发探针·改名'
function patchesOf({ minutes, pages, limit, cover, title }) {
  return [
    { studentSelectable: true },
    { estimatedMinutes: minutes },
    { pageCount: pages },
    { dailyLimit: limit },
    { coverUrl: cover },
    { title },
  ]
}
function wantedOf({ minutes, pages, limit, cover, title }) {
  return { studentSelectable: true, estimatedMinutes: minutes, pageCount: pages, dailyLimit: limit, coverUrl: cover, title }
}
function diffOf(item, wanted) {
  const lost = []
  if (item.studentSelectable !== wanted.studentSelectable) lost.push(`studentSelectable=${item.studentSelectable}`)
  if (Number(item.estimatedMinutes) !== wanted.estimatedMinutes) lost.push(`estimatedMinutes=${item.estimatedMinutes}`)
  if (Number(item.pageCount) !== wanted.pageCount) lost.push(`pageCount=${item.pageCount}`)
  if (Number(item.dailyLimit) !== wanted.dailyLimit) lost.push(`dailyLimit=${item.dailyLimit}`)
  if (item.coverUrl !== wanted.coverUrl) lost.push(`coverUrl='${item.coverUrl}'`)
  if (item.title !== wanted.title) lost.push(`title='${item.title}'`)
  return lost
}
const BASE_SET = { minutes: 17, pages: 7, limit: 33, cover: PROBE_COVER, title: PROBE_TITLE }

// ---- 对照组：串行写，确认这六个字段本身都写得进去 ------------------------------
console.log('\n--- 对照组：串行 PATCH（排除「字段根本写不进去」）---')
ok('还原到基线', (await restore()) === 200)
for (const body of patchesOf(BASE_SET)) await patch(body)
const serialLost = diffOf(await readItem(), wantedOf(BASE_SET))
ok('串行写 6 个字段全部生效', serialLost.length === 0, serialLost.length ? `缺 ${serialLost.join(', ')}` : '6/6')

// ---- 实验组：并发写同一行的不同字段（3 轮，每轮换一组值，避免被上一轮掩盖）-----
console.log('\n--- 实验组：6 个并发 PATCH 各改一个不同字段（3 轮）---')
const ROUNDS = [
  { minutes: 21, pages: 5, limit: 41, cover: `${PROBE_COVER}?r1`, title: `${PROBE_TITLE}1` },
  { minutes: 22, pages: 6, limit: 42, cover: `${PROBE_COVER}?r2`, title: `${PROBE_TITLE}2` },
  { minutes: 23, pages: 8, limit: 43, cover: `${PROBE_COVER}?r3`, title: `${PROBE_TITLE}3` },
]
let roundLoss = 0
for (const [index, round] of ROUNDS.entries()) {
  const restored = await restore()
  const beforeRev = (await readItem()).draftRevision || 0
  const responses = await Promise.all(patchesOf(round).map((body) => patch(body)))
  const no5xx = responses.every((r) => r.status < 500)
  const item = await readItem()
  const lost = diffOf(item, wantedOf(round))
  const revDelta = (item.draftRevision || 0) - beforeRev
  if (lost.length) roundLoss += 1
  console.log(`  第 ${index + 1} 轮：还原=${restored} 状态=${responses.map((r) => r.status).join(',')} revision +${revDelta}` +
    ` 丢失=${lost.length ? lost.join(', ') : '无'}`)
  ok(`第 ${index + 1} 轮：并发 PATCH 无 5xx`, no5xx, responses.map((r) => r.status).join(','))
  ok(`第 ${index + 1} 轮：6 次并发写都落库（revision +6）`, revDelta === 6, `+${revDelta}`)
  ok(`第 ${index + 1} 轮：6 个不同字段全部保留（无丢更新）`, lost.length === 0,
    lost.length ? `丢了 ${lost.length} 项：${lost.join(', ')}` : '6/6')
}
ok('3 轮并发均未出现丢更新', roundLoss === 0, `${3 - roundLoss}/3 轮干净`)

// ---- 并发写同一字段：最终值必须是其中之一，且不能被撕裂 -----------------------
console.log('\n--- 并发写同一字段（estimatedMinutes 8 个不同值）---')
ok('还原到基线', (await restore()) === 200)
const values = [11, 12, 13, 14, 15, 16, 18, 19]
const sameFieldRes = await Promise.all(values.map((v) => patch({ estimatedMinutes: v })))
ok('同字段并发 PATCH 无 5xx', sameFieldRes.every((r) => r.status < 500), sameFieldRes.map((r) => r.status).join(','))
const sameFieldItem = await readItem()
ok('最终值落在写入集合内（无半截值/NaN）', values.includes(Number(sameFieldItem.estimatedMinutes)), `estimatedMinutes=${sameFieldItem.estimatedMinutes}`)

// ---- 还原 ---------------------------------------------------------------------
console.log('\n--- 还原 ---')
ok('已还原为原配置', (await restore()) === 200)
const back = await readItem()
ok('还原后标题一致', back.title === RESTORE_BODY.title, `'${back.title}'`)
ok('还原后封面一致', (back.coverUrl || '') === (baseline.coverUrl || ''), `cover='${back.coverUrl || ''}'`)
ok('还原后学生可选一致', Boolean(back.studentSelectable) === Boolean(baseline.studentSelectable), `studentSelectable=${back.studentSelectable}`)
ok('还原后每日上限一致', Number(back.dailyLimit) === Number(baseline.dailyLimit), `dailyLimit=${back.dailyLimit}`)
// 「同字段并发」那一节会把 estimatedMinutes 写成 19 等合成值，必须一并确认还原，否则会留下一个
// 不在前端下拉选项里的脏值（0/2/3/4/6/8/10/15 之外）。
ok('还原后预计耗时一致', Number(back.estimatedMinutes) === Number(baseline.estimatedMinutes), `estimatedMinutes=${back.estimatedMinutes}`)
ok('还原后页数一致', Number(back.pageCount) === Number(baseline.pageCount), `pageCount=${back.pageCount}`)

console.log(`\n${pass} PASS / ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 2)
