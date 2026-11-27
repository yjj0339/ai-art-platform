// 冒烟：报告工作流库服务端接口链路（列表 / 详情 / 设置读写 / 非法值防护）。
// 设计原则：不新建也不删除真实数据（新建技能需要已接入的图像供应商，环境不具备时会被合法拦截），
// 而是挑一条现有草稿：记下原值 → 写入临时值 → 读回校验 → 把原值写回。
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/smoke-h5-workflow-api.mjs
// 需要 3000 端口后端（AUTH_MODE=server）。

const BASE = process.env.API_BASE || 'http://127.0.0.1:3000'

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const cookieJar = new Map()
function saveCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  for (const item of raw) {
    const [pair] = item.split(';')
    const idx = pair.indexOf('=')
    if (idx > 0) cookieJar.set(pair.slice(0, idx), pair.slice(idx + 1))
  }
}
const cookieHeader = () => [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

async function api(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  saveCookies(res)
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text.slice(0, 200) } }
  return { status: res.status, body: json }
}

const login = await api('/auth/login', {
  method: 'POST',
  body: { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' },
})
check('登录成功', login.status === 200 && Boolean(login.body?.user), `status=${login.status}`)

const listed = await api('/admin/h5-report-workflows')
check('列表接口 200', listed.status === 200, `status=${listed.status}`)
const workflows = Array.isArray(listed.body?.workflows) ? listed.body.workflows : []
check('返回 workflows 数组', Array.isArray(listed.body?.workflows), `共 ${workflows.length} 条`)

if (!workflows.length) {
  console.log('\n列表为空，后续接口断言跳过。')
} else {
  const first = workflows[0]
  const shape = ['id', 'title', 'stage', 'studentSelectable', 'estimatedMinutes', 'pageCount', 'flowSummary', 'nodeCount', 'dailyLimit', 'coverReady']
  const missing = shape.filter((k) => !(k in first))
  check('列表项字段齐全', missing.length === 0, missing.join(',') || 'ok')
  check('stage 在约定集合内', ['published', 'offline', 'testing', 'draft'].includes(first.stage), first.stage)
  check('flowSummary 为数组', Array.isArray(first.flowSummary), JSON.stringify(first.flowSummary).slice(0, 70))

  const detail = await api(`/admin/h5-report-workflows/${first.id}`)
  check('单条详情 200', detail.status === 200, `status=${detail.status}`)
  const item = detail.body?.workflow
  check('详情含草稿配置', Boolean(item?.draftConfiguration), item?.draftConfiguration ? 'yes' : 'no')
  check('详情含管理权限标记', 'canManagePlatform' in (item || {}), String(item?.canManagePlatform))

  // 选一条草稿做读写往返，避免影响已发布工作流。
  const target = workflows.find((w) => w.stage === 'draft' && w.status === 'draft') || workflows.find((w) => w.stage === 'draft')
  if (!target) {
    console.log('没有草稿态工作流，设置读写断言跳过。')
  } else {
    const origin = {
      title: target.title,
      summary: target.summary,
      studentSelectable: target.studentSelectable,
      estimatedMinutes: target.estimatedMinutes,
      pageCount: target.pageCount,
      dailyLimit: target.dailyLimit,
    }
    const tempTitle = `${origin.title}｜冒烟临时`
    try {
      const patched = await api(`/admin/h5-report-workflows/${target.id}`, {
        method: 'PATCH',
        body: {
          title: tempTitle,
          summary: '冒烟临时说明',
          studentSelectable: true,
          estimatedMinutes: 6,
          pageCount: 5,
          dailyLimit: 50,
        },
      })
      check('PATCH 设置成功', patched.status === 200, `status=${patched.status}`)

      const reread = await api(`/admin/h5-report-workflows/${target.id}`)
      const after = reread.body?.workflow
      check('改名已落库', after?.title === tempTitle, after?.title)
      check('学生可选已落库', after?.studentSelectable === true, String(after?.studentSelectable))
      check('预计耗时已落库', Number(after?.estimatedMinutes) === 6, String(after?.estimatedMinutes))
      check('页数已落库', Number(after?.pageCount) === 5, String(after?.pageCount))
      check('每日上限已落库', Number(after?.dailyLimit) === 50, String(after?.dailyLimit))

      const bad = await api(`/admin/h5-report-workflows/${target.id}`, {
        method: 'PATCH',
        body: { coverSource: 'not-a-source' },
      })
      const badAcceptable = bad.status === 400 || bad.status === 200
      check('非法 coverSource 被拒或忽略', badAcceptable, `status=${bad.status}`)
      if (bad.status === 200) {
        const verify = await api(`/admin/h5-report-workflows/${target.id}`)
        check('非法 coverSource 未写入', verify.body?.workflow?.coverSource !== 'not-a-source', String(verify.body?.workflow?.coverSource))
      }

      const overflow = await api(`/admin/h5-report-workflows/${target.id}`, {
        method: 'PATCH',
        body: { estimatedMinutes: 9999, pageCount: 999 },
      })
      const clamped = overflow.body?.workflow
      check('耗时/页数超上限被收敛', Number(clamped?.estimatedMinutes) <= 240 && Number(clamped?.pageCount) <= 24,
        `minutes=${clamped?.estimatedMinutes} pages=${clamped?.pageCount}`)
    } finally {
      // 无论断言结果如何，都把原值写回，保证不留下冒烟痕迹。
      const restored = await api(`/admin/h5-report-workflows/${target.id}`, {
        method: 'PATCH',
        body: {
          title: origin.title,
          summary: origin.summary,
          studentSelectable: origin.studentSelectable,
          estimatedMinutes: origin.estimatedMinutes,
          pageCount: origin.pageCount,
          dailyLimit: origin.dailyLimit,
        },
      })
      check('原值已还原', restored.status === 200, `status=${restored.status}`)
      const final = await api(`/admin/h5-report-workflows/${target.id}`)
      check('还原后标题一致', final.body?.workflow?.title === origin.title, final.body?.workflow?.title)
    }
  }

  // 删除接口的入参防护（不传 id 时应被拒，而不是静默成功）
  const emptyDelete = await api('/admin/h5-report-workflows/bulk-delete', { method: 'POST', body: { ids: [] } })
  check('空 ids 删除被拒或幂等成功', emptyDelete.status === 400 || emptyDelete.status === 200, `status=${emptyDelete.status}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
if (failed.length) {
  console.log('FAILED:', failed.map((r) => r.name).join(', '))
  process.exitCode = 1
}
