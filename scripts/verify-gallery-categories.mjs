// 作品广场「分类管理」验收：
//  ① 后台能建分类，学生端顶部按钮显示分类名（不再是作品名）
//  ② 改名 / 隐藏 / 删除都能生效，且学生端同步
//  ③ 重名被拦
//  ④ 作品归类后，按分类筛选能筛出正确作品
//  ⑤ 「未分类」兜底：没归类的作品进未分类，删分类时作品被挪到未分类
//  ⑥ 排序能保存
//
// 零花费：不触发任何 AI 出图，只调分类接口 + 读公开列表。
// 自己建临时分类，跑完删掉，不碰真实作品数据。
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3000'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const failures = []
function check(name, ok, detail) {
  results.push({ name, pass: Boolean(ok), detail })
  if (!ok) failures.push(`${name} :: ${JSON.stringify(detail).slice(0, 300)}`)
  console.error(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  :: ${JSON.stringify(detail).slice(0, 300)}`}`)
}

await mkdir(OUT_DIR, { recursive: true })

// ---- 接口层：用管理员 cookie 走真实后端 ----
async function login(account) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password: '123456789', organizationCode: 'demo-school' }),
  })
  if (!r.ok) throw new Error(`登录失败 ${account} ${r.status}`)
  return (r.headers.getSetCookie?.() || []).map((x) => x.split(';')[0]).join('; ')
}
const adminCk = await login('guanliyuan88')
const studentCk = await login('ceshi2')
const api = async (p, init = {}, ck = adminCk) => {
  const r = await fetch(API + p, { ...init, headers: { 'Content-Type': 'application/json', Cookie: ck, ...(init.headers || {}) } })
  const text = await r.text()
  let body
  try { body = JSON.parse(text) } catch { body = text.slice(0, 200) }
  return { status: r.status, body }
}

const created = []
const cleanup = async () => {
  for (const id of created.reverse()) await api(`/api/admin/gallery-categories/${id}`, { method: 'DELETE' }).catch(() => {})
}

try {
  // ---- ① 建分类 ----
  const before = await api('/api/admin/gallery-categories')
  check('① 能读到后台分类列表', before.status === 200 && Array.isArray(before.body.categories), before.body)

  const defaultCat = before.body.categories.find((c) => c.isDefault)
  check('① 机构自带一条「未分类」兜底分类', !!defaultCat && defaultCat.name === '未分类', defaultCat)

  const name1 = `验收分类A-${Date.now().toString().slice(-6)}`
  const c1 = await api('/api/admin/gallery-categories', { method: 'POST', body: JSON.stringify({ name: name1 }) })
  check('① 新建分类成功', c1.status === 201 && c1.body.category?.name === name1, c1.body)
  if (c1.body.category?.id) created.push(c1.body.category.id)

  // 学生端公开列表：按钮读的是分类名
  const pub1 = await api('/api/gallery/public?page=1&pageSize=5', {}, studentCk)
  const catNames = (pub1.body.categories || []).map((x) => x.name)
  check('① 学生端分类按钮包含新建的分类名', catNames.includes(name1), catNames)
  // 关键回归：按钮文字不能再是作品标题
  const workTitles = (pub1.body.works || []).map((w) => w.title).filter(Boolean)
  const badCat = catNames.filter((n) => workTitles.some((t) => t && t.includes(n) && n.length > 4 && n !== '未分类'))
  check('① 分类按钮里没有混进作品标题', badCat.length === 0, { catNames, workTitles, badCat })
  check('① 兼容字段 courses 与分类名一致', JSON.stringify(pub1.body.courses) === JSON.stringify(catNames), { courses: pub1.body.courses, catNames })

  // ---- ② 改名 / 隐藏 ----
  const name2 = `${name1}-改名`
  const ren = await api(`/api/admin/gallery-categories/${created[0]}`, { method: 'PATCH', body: JSON.stringify({ name: name2 }) })
  check('② 改名生效', ren.status === 200 && ren.body.category?.name === name2, ren.body)
  const pub2 = await api('/api/gallery/public?page=1&pageSize=5', {}, studentCk)
  check('② 学生端同步显示新名字', (pub2.body.categories || []).some((x) => x.name === name2), (pub2.body.categories || []).map((x) => x.name))

  const hid = await api(`/api/admin/gallery-categories/${created[0]}`, { method: 'PATCH', body: JSON.stringify({ visible: false }) })
  check('② 隐藏分类生效', hid.status === 200 && hid.body.category?.visible === false, hid.body)
  const pub3 = await api('/api/gallery/public?page=1&pageSize=5', {}, studentCk)
  check('② 隐藏后学生端看不到该分类', !(pub3.body.categories || []).some((x) => x.id === created[0]), (pub3.body.categories || []).map((x) => x.name))
  const adminList = await api('/api/admin/gallery-categories')
  check('② 隐藏后后台仍能看到（方便再打开）', (adminList.body.categories || []).some((x) => x.id === created[0]), (adminList.body.categories || []).map((x) => x.name))
  await api(`/api/admin/gallery-categories/${created[0]}`, { method: 'PATCH', body: JSON.stringify({ visible: true }) })

  // ---- ③ 重名拦截 ----
  const dup = await api('/api/admin/gallery-categories', { method: 'POST', body: JSON.stringify({ name: name2 }) })
  check('③ 重名被拦（409）', dup.status === 409, { status: dup.status, body: dup.body })

  // 空名字 / 超长名字
  const empty = await api('/api/admin/gallery-categories', { method: 'POST', body: JSON.stringify({ name: '   ' }) })
  check('③ 空名字被拦', empty.status >= 400 && empty.status < 500, { status: empty.status, body: empty.body })
  const long = await api('/api/admin/gallery-categories', { method: 'POST', body: JSON.stringify({ name: '超'.repeat(60) }) })
  check('③ 超长名字被拦', long.status >= 400 && long.status < 500, { status: long.status, body: long.body })

  // ---- ④ 作品归类 + 按分类筛选 ----
  const pubNow = await api('/api/gallery/public?page=1&pageSize=10', {}, studentCk)
  const someWork = (pubNow.body.works || [])[0]
  if (someWork) {
    const origCat = someWork.categoryId || ''
    const assign = await api(`/api/admin/gallery-submissions/${someWork.id}/category`, { method: 'PUT', body: JSON.stringify({ categoryId: created[0] }) })
    check('④ 给作品指定分类成功', assign.status === 200, assign.body)

    const filtered = await api(`/api/gallery/public?page=1&pageSize=10&categoryId=${created[0]}`, {}, studentCk)
    check('④ 按该分类筛选能筛出这件作品', (filtered.body.works || []).some((w) => w.id === someWork.id), {
      want: someWork.id, got: (filtered.body.works || []).map((w) => w.id),
    })
    check('④ 筛选结果总数与列表一致', filtered.body.total === (filtered.body.works || []).length, { total: filtered.body.total, len: (filtered.body.works || []).length })

    const other = await api(`/api/gallery/public?page=1&pageSize=10&categoryId=${defaultCat.id}`, {}, studentCk)
    check('④ 该作品不再出现在「未分类」里', !(other.body.works || []).some((w) => w.id === someWork.id), {
      got: (other.body.works || []).map((w) => w.id),
    })

    // 不存在的分类 id：应当筛出 0 件，而不是把全部作品都吐出来
    const ghost = await api('/api/gallery/public?page=1&pageSize=10&categoryId=gcat_does_not_exist', {}, studentCk)
    check('④ 不存在的分类 id 返回空列表（不泄露全部作品）', (ghost.body.works || []).length === 0, { len: (ghost.body.works || []).length })

    // ---- ⑤ 删分类时作品被挪到未分类 ----
    const delRes = await api(`/api/admin/gallery-categories/${created[0]}`, { method: 'DELETE' })
    check('⑤ 删除分类成功', delRes.status === 200 && delRes.body.deleted === true, delRes.body)
    check('⑤ 删除时报告挪走了作品', delRes.body.movedWorks >= 1, delRes.body)
    // 从待清理清单里摘掉（已删），但后面的排序分类仍要留着给 finally 清
    const removedIdx = created.indexOf(created[0])
    if (removedIdx >= 0) created.splice(removedIdx, 1)

    const afterDel = await api(`/api/gallery/public?page=1&pageSize=10&categoryId=${defaultCat.id}`, {}, studentCk)
    check('⑤ 原作品回到「未分类」', (afterDel.body.works || []).some((w) => w.id === someWork.id), {
      got: (afterDel.body.works || []).map((w) => w.id),
    })

    // 复原：把作品放回原来的分类，避免污染真实数据
    if (origCat) await api(`/api/admin/gallery-submissions/${someWork.id}/category`, { method: 'PUT', body: JSON.stringify({ categoryId: origCat }) })
    else await api(`/api/admin/gallery-submissions/${someWork.id}/category`, { method: 'PUT', body: JSON.stringify({ categoryId: '' }) })
  } else {
    check('④ 有公开作品可用来验证归类', false, '当前没有公开作品，跳过归类验证')
  }

  // ---- ⑥ 排序 ----
  const a = await api('/api/admin/gallery-categories', { method: 'POST', body: JSON.stringify({ name: `验收排序1-${Date.now().toString().slice(-5)}` }) })
  const b = await api('/api/admin/gallery-categories', { method: 'POST', body: JSON.stringify({ name: `验收排序2-${Date.now().toString().slice(-5)}` }) })
  const idA = a.body.category?.id, idB = b.body.category?.id
  if (idA) created.push(idA)
  if (idB) created.push(idB)
  const orderRes = await api('/api/admin/gallery-categories/order', { method: 'PUT', body: JSON.stringify({ ids: [idB, idA] }) })
  check('⑥ 保存排序成功', orderRes.status === 200, orderRes.body)
  const listed = await api('/api/admin/gallery-categories')
  const seq = (listed.body.categories || []).map((x) => x.id)
  check('⑥ 排序后 B 在 A 前面', seq.indexOf(idB) < seq.indexOf(idA), { seq, idA, idB })

  // ---- ⑦ 默认分类不能删 / 不能改名 ----
  const delDefault = await api(`/api/admin/gallery-categories/${defaultCat.id}`, { method: 'DELETE' })
  check('⑦ 「未分类」不允许删除', delDefault.status >= 400, { status: delDefault.status, body: delDefault.body })
  const renameDefault = await api(`/api/admin/gallery-categories/${defaultCat.id}`, { method: 'PATCH', body: JSON.stringify({ name: '随便改' }) })
  check('⑦ 「未分类」不允许改名', renameDefault.status >= 400, { status: renameDefault.status, body: renameDefault.body })

  // ---- ⑧ 学生无权管理分类 ----
  const stuTry = await api('/api/admin/gallery-categories', { method: 'POST', body: JSON.stringify({ name: '学生偷建' }) }, studentCk)
  check('⑧ 学生账号不能新建分类', stuTry.status === 403 || stuTry.status === 401, { status: stuTry.status, body: stuTry.body })

  // ---- ⑨ 真实浏览器：学生端按钮显示分类名 ----
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const cookies = (await (async () => {
    const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }) })
    return (r.headers.getSetCookie?.() || [])
  })()).map((raw) => raw.split(';')[0]).map((pair) => {
    const i = pair.indexOf('=')
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: new URL(BASE).hostname, path: '/' }
  })
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(`${BASE}/student/gallery`, { waitUntil: 'networkidle', timeout: 60000 })
  await delay(2000)
  const ui = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('.gallery-toolbar button')].map((b) => b.textContent.trim()),
    cards: [...document.querySelectorAll('.gallery-card')].length,
  }))
  check('⑨ 学生端顶部有「全部」按钮', ui.buttons[0] === '全部', ui.buttons)
  // 回归重点：按钮文字必须来自分类表，不能等于任何一件作品的标题
  const pubTitles = (await api('/api/gallery/public?page=1&pageSize=40', {}, studentCk)).body.works.map((w) => w.title).filter(Boolean)
  const asTitle = ui.buttons.filter((t) => t !== '全部' && pubTitles.includes(t))
  check('⑨ 学生端按钮里没有作品标题（回归：以前会显示某幅画的名字）', asTitle.length === 0, { asTitle, buttons: ui.buttons, pubTitles })
  check('⑨ 学生端能看到作品卡片', ui.cards > 0, ui)

  // 点一个真实分类，看列表是否跟着变
  if (ui.buttons.length > 1) {
    await page.locator('.gallery-toolbar button').nth(1).click()
    await delay(1500)
    const after = await page.evaluate(() => ({
      active: document.querySelector('.gallery-toolbar button.active')?.textContent?.trim(),
      cards: [...document.querySelectorAll('.gallery-card')].length,
      empty: !!document.querySelector('.gallery-empty, .empty-state'),
    }))
    check('⑨ 点分类后按钮高亮切换', after.active === ui.buttons[1], { active: after.active, want: ui.buttons[1] })
    check('⑨ 点分类后列表没有报错', errs.length === 0, errs.slice(0, 3))
  }
  await page.screenshot({ path: path.join(OUT_DIR, 'gallery-categories-student.png') })
  await browser.close()

  check('⑨ 页面无 JS 报错', errs.length === 0, errs.slice(0, 4))
} catch (error) {
  check('脚本执行未抛异常', false, String(error?.stack || error).slice(0, 500))
} finally {
  await cleanup()
}

const passed = results.filter((r) => r.pass).length
console.log(`\n==== ${passed}/${results.length} 项通过 ====`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((f) => console.log(' - ' + f))
  process.exitCode = 1
}
