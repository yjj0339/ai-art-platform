// 后台「AI图像功能管理 → 风格模板编辑」第二轮改造验收（列表模式 / 批量管理 / 模板设置）：
//  ① 工具条有「卡片 / 列表」切换，默认卡片模式
//  ② 切到列表：平时 7 列（无勾选列）、每行有方形封面 + 分类 + 提示词 + 状态标签；刷新后仍停在列表（记住偏好）
//  ③ 点顶部「批量管理」进批量模式：批量条常驻、表格多出勾选列、勾两行显示「已选 2 个」
//  ④ 批量停用 → 接口 status 变 disabled、表格状态变「已停用」、学生端 API 看不到
//  ⑤ 勾齐 3 个验收行 → 批量启用 → 全部回到「启用中」
//  ⑥ 批量改分类 → 只改勾选的那几条，分类标签多出新分类
//  ⑦ 批量删除 → 先弹确认框，确认后验收行全没了、接口里也一条不剩（真实风格不受影响）
//  ⑧ 模板设置弹窗能保存「每排几张 / 面板标题 / 零配置不回退」，写进 localStorage
//  ⑨ 学生端照着设置变：cols-2 卡片更大、标题用自定义名、面板固定两排 + 左右滑动
//  ⑩ 零配置 + 「不回退」→ 面板只剩「不指定」一张卡
//  ⑪ 分类设置：建分类 / 改名（风格跟着改）/ 删分类（风格移到「推荐」、风格不丢）/ 「推荐」不可删
//
// 只创建/删除自己建的「验收*」临时风格；不点「AI生成封面」（会产生费用）。
// 🔴 库里可能已有真实风格（用户手工建的），所以：
//    · 一切定位按「名字」找，绝不用 nth()、绝不点表头全选 —— 曾因此物理删除过真实风格且不可恢复；
//    · 一切计数按「基线 + 本次新增」相对算，写死数字会假红。
import { createRequire } from 'node:module'
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3000'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
const COVER_DIR = path.join(process.cwd(), 'server', 'data', 'image-style-covers')
const SETTINGS_KEY = 'image-style-panel-settings-v1'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const failures = []
function check(name, ok, detail) {
  results.push({ name, pass: Boolean(ok), detail })
  if (!ok) failures.push(`${name} :: ${JSON.stringify(detail).slice(0, 300)}`)
  console.error(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  :: ${JSON.stringify(detail).slice(0, 300)}`}`)
}

const SEED = [
  { name: '验收批量甲', groupName: '验收组一', prompt: '厚涂油彩，笔触明显', rgb: [120, 90, 200] },
  { name: '验收批量乙', groupName: '验收组一', prompt: '木刻版画，黑白对比强', rgb: [200, 130, 90] },
  { name: '验收批量丙', groupName: '验收组二', prompt: '胶片质感，低饱和', rgb: [90, 160, 140] },
]
const isTemp = (item) => /^验收/.test(item.name || '')
const isSeed = (item) => SEED.some((seed) => seed.name === item.name) || isTemp(item)

async function api(cookie, method, url, body) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON 响应 */ }
  return { status: response.status, json, text }
}
async function login(account) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password: '123456789', organizationCode: 'demo-school' }),
  })
  const cookie = (response.headers.getSetCookie?.() || []).map((item) => item.split(';')[0]).join('; ')
  const payload = await response.json()
  return { cookie, user: payload.user }
}
async function solidPng(rgb) {
  const buffer = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer()
  return `data:image/png;base64,${buffer.toString('base64')}`
}
// 学生端可能弹「发现上次没做完的作品」，挡住底部按钮，统一清掉
async function dismissOverlays(page) {
  for (let i = 0; i < 4; i += 1) {
    if (!(await page.locator('.el-overlay').count())) return
    const closer = page.locator('.el-dialog__headerbtn, .el-overlay-dialog button:has-text("取消"), .el-overlay-dialog button:has-text("不要了")').first()
    if (await closer.count()) await closer.click({ force: true }).catch(() => {})
    else await page.keyboard.press('Escape')
    await delay(500)
  }
}

await mkdir(OUT_DIR, { recursive: true })
const created = []
const createdCovers = []
let browser

try {
  const admin = await login('guanliyuan88')
  const student = await login('ceshi2')
  check('登录：管理员 + 学生都成功', Boolean(admin.user?.id && student.user?.id), { admin: admin.user?.account, student: student.user?.account })

  // 清掉上次跑崩的残留
  const existing = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  for (const item of existing.json?.styles || []) {
    if (isTemp(item)) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
  }
  const baseline = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const realCount = (baseline.json?.styles || []).length

  async function createStyleViaApi(seed) {
    const uploaded = await api(admin.cookie, 'POST', '/api/admin/image-style-covers', { imageData: await solidPng(seed.rgb) })
    const saved = await api(admin.cookie, 'POST', '/api/admin/image-styles', {
      name: seed.name, groupName: seed.groupName, prompt: seed.prompt,
      coverImageUrl: uploaded.json?.assetUrl || '', status: 'enabled',
    })
    if (saved.json?.style?.id) {
      created.push(saved.json.style)
      if (uploaded.json?.assetUrl) createdCovers.push(String(uploaded.json.assetUrl).split('/').pop())
    }
    return saved.json?.style
  }
  for (const seed of SEED) await createStyleViaApi(seed)
  check('前置：3 个临时风格建好（2 组）', created.length === 3, created.map((item) => item.name))

  // ⑥ 要把风格批量挪到「验收合并组」。批量条的分类已经是真下拉（只能选已有分类），
  // 所以先通过分类接口把这个目标分类建出来。
  const MERGE_GROUP = '验收合并组'
  await api(admin.cookie, 'POST', '/api/admin/image-style-groups', { name: MERGE_GROUP })
  // ⑧ 模板设置里的「店铺默认分类」同样是真下拉，需要「验收默认组」这个分类存在才能选。
  const DEFAULT_GROUP = '验收默认组'
  await api(admin.cookie, 'POST', '/api/admin/image-style-groups', { name: DEFAULT_GROUP })

  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
  })
  // 进后台并点到「AI图像功能管理」。⑪ 换账号后还要再进一次，所以抽成函数。
  async function openStyleAdmin() {
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.admin-nav', { timeout: 30000 })
    await delay(1200)
    // ⚠️ 菜单分组改成「功能管理 / 作品广场」两组后，裸 `.nav-group-toggle` 会命中 2 个元素，
    // strict mode 直接报错。必须按文字锁定「功能管理」那一组。
    if (!(await page.locator('.nav-group-body').isVisible().catch(() => false))) await page.locator('.nav-group-toggle', { hasText: '功能管理' }).first().click()
    await delay(400)
    await page.locator('.nav-group-body .nav-child', { hasText: 'AI图像功能管理' }).click()
    await page.waitForSelector('.style-admin', { timeout: 20000 })
    await delay(1200)
  }
  await openStyleAdmin()

  // ① 工具条 + 默认卡片模式
  const toolbar = await page.evaluate(() => ({
    viewButtons: [...document.querySelectorAll('.view-switch button')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
    active: document.querySelector('.view-switch button.active')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    hasGrid: Boolean(document.querySelector('.style-grid')),
    hasTable: Boolean(document.querySelector('.style-table')),
    tabs: [...document.querySelectorAll('.style-toolbar .style-group-tabs button')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
  }))
  check('① 工具条有「卡片 / 列表」两个切换按钮', toolbar.viewButtons.length === 2 && toolbar.viewButtons[1] === '列表', toolbar.viewButtons)
  check('① 默认是卡片模式', toolbar.active === '卡片' && toolbar.hasGrid && !toolbar.hasTable, toolbar)
  // ⚠️ 库里可能已有真实风格（会多出「推荐」等真实分组），只断言「全部 + 我们那 2 个验收组」都在。
  check('① 分组筛选搬到工具条里（全部 + 2 组）',
    toolbar.tabs[0]?.startsWith('全部') && toolbar.tabs.some((t) => t.includes('验收组一')) && toolbar.tabs.some((t) => t.includes('验收组二')),
    toolbar.tabs)

  // ② 切到列表模式
  await page.locator('.view-switch button', { hasText: '列表' }).click()
  await page.waitForSelector('.style-table', { timeout: 10000 })
  await delay(600)
  const listState = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.style-table tbody tr')]
    return {
      hasGrid: Boolean(document.querySelector('.style-grid')),
      heads: [...document.querySelectorAll('.style-table thead th')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
      rowCount: rows.length,
      names: rows.map((row) => row.querySelector('.col-name strong')?.textContent?.trim() || ''),
      groups: rows.map((row) => row.querySelector('.group-chip')?.textContent?.trim() || ''),
      statusTags: rows.map((row) => row.querySelector('.status-tag')?.textContent?.trim() || ''),
      prompts: rows.map((row) => row.querySelector('.col-prompt span')?.textContent?.trim() || ''),
      coverWidths: rows.map((row) => {
        const img = row.querySelector('.row-cover img')
        if (!img) return 0
        const rect = img.getBoundingClientRect()
        return { w: Math.round(rect.width), h: Math.round(rect.height), natural: img.naturalWidth }
      }),
      stored: localStorage.getItem('image-style-panel-settings-v1-view'),
      url: location.href,
    }
  })
  // ⚠️ 所有计数都用「基线 + 本次建的 3 个」相对算：库里可能已有真实风格（如「3D毛绒」），
  // 写死 3 会让真实数据一多就假红，而且会误导人去改真实风格。
  const expectRows = realCount + 3
  check('② 切到列表后表格顶掉卡片网格', !listState.hasGrid && listState.rowCount === expectRows, { hasGrid: listState.hasGrid, rowCount: listState.rowCount, expectRows })
  // 平时（没进批量模式）不显示勾选列，所以是 7 列；进了批量模式才是 8 列。
  check('② 平时列表 7 列（封面/名称/分类/提示词/顺序/状态/操作，无勾选列）', listState.heads.length === 7 && listState.heads[0] === '封面' && listState.heads[5] === '状态', listState.heads)
  const tempRows = listState.names.map((name, i) => ({ name, group: listState.groups[i], status: listState.statusTags[i], prompt: listState.prompts[i], cover: listState.coverWidths[i] })).filter((row) => /^验收/.test(row.name))
  check('② 每行带分类 + 状态「启用中」+ 提示词', tempRows.length === 3 && tempRows.every((row) => row.group && row.status === '启用中' && row.prompt && row.prompt !== '—'), tempRows)
  check('② 列表里的封面是小方图且真的加载出来', tempRows.every((row) => row.cover.natural >= 200 && Math.abs(row.cover.w - row.cover.h) <= 2 && row.cover.w <= 80), tempRows.map((row) => row.cover))
  check('② 视图偏好写进了 localStorage', listState.stored === 'list', listState.stored)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-style-list-mode.png') })

  // 刷新后仍停在列表
  await page.goto(listState.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.style-admin', { timeout: 20000 })
  await delay(1500)
  const afterReload = await page.evaluate(() => ({
    hasTable: Boolean(document.querySelector('.style-table')),
    active: document.querySelector('.view-switch button.active')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    rowCount: document.querySelectorAll('.style-table tbody tr').length,
  }))
  check('② 刷新后仍停在列表模式', afterReload.hasTable && afterReload.active === '列表' && afterReload.rowCount === expectRows, { ...afterReload, expectRows })

  // ③ 点顶部「批量管理」进批量模式 → 批量条常驻 + 表格多出勾选列 → 勾两行
  // 🔴 绝不能用 nth() 或表头全选：库里可能有真实风格，会把它们一起改/删掉（已经踩过一次）。
  // 统一按「行内名称是 验收* 」来定位。
  const batchEntry = page.locator('.style-head-actions button', { hasText: '批量管理' })
  const rowByName = (name) => page.locator('.style-table tbody tr').filter({ has: page.locator('.col-name strong', { hasText: name }) })
  const pickRow = async (name) => { await rowByName(name).locator('td.col-pick input').check() }
  // 进批量模式前不该有勾选列，这就是「平时列表更干净」的证据。
  const beforeBatch = await page.evaluate(() => ({
    heads: document.querySelectorAll('.style-table thead th').length,
    pickCells: document.querySelectorAll('.style-table tbody td.col-pick').length,
    bar: Boolean(document.querySelector('.batch-bar')),
    entryOn: Boolean(document.querySelector('.style-head-actions button.is-on')),
  }))
  check('③ 没进批量模式时：无勾选列、无批量条、入口按钮不是激活态',
    beforeBatch.heads === 7 && beforeBatch.pickCells === 0 && !beforeBatch.bar && !beforeBatch.entryOn, beforeBatch)

  await batchEntry.click()
  await delay(500)
  const afterEntry = await page.evaluate(() => ({
    heads: document.querySelectorAll('.style-table thead th').length,
    pickCells: document.querySelectorAll('.style-table tbody td.col-pick').length,
    barText: document.querySelector('.batch-bar')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    entryOn: Boolean(document.querySelector('.style-head-actions button.is-on')),
    buttons: [...document.querySelectorAll('.batch-bar .batch-actions button')].map((el) => el.textContent.trim()),
  }))
  check('③ 点「批量管理」后批量条常驻（还没勾选就看得见功能）',
    Boolean(afterEntry.barText) && /已选 0 个/.test(afterEntry.barText) && afterEntry.entryOn, afterEntry)
  check('③ 批量模式下表格多出勾选列（7 → 8 列，每行都有）',
    afterEntry.heads === 8 && afterEntry.pickCells === expectRows, afterEntry)
  check('③ 批量条有启用/停用/改分类/删除/取消选择/退出',
    ['批量启用', '批量停用', '批量改分类', '批量删除', '取消选择', '退出批量'].every((text) => afterEntry.buttons.includes(text)), afterEntry.buttons)

  await pickRow('验收批量甲')
  await pickRow('验收批量乙')
  await delay(400)
  const batchBar = await page.evaluate(() => ({
    barText: document.querySelector('.batch-bar')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    pickedRows: document.querySelectorAll('.style-table tbody tr.picked').length,
    headIndeterminate: Boolean(document.querySelector('.style-table thead .col-pick input:indeterminate')),
  }))
  check('③ 勾两行后显示「已选 2 个」', /已选 2 个/.test(batchBar.barText) && batchBar.pickedRows === 2, batchBar)
  check('③ 表头全选框显示半选状态', batchBar.headIndeterminate, batchBar.headIndeterminate)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-style-batch-bar.png') })

  // ④ 批量停用
  await page.locator('.batch-bar button', { hasText: '批量停用' }).click()
  await delay(1600)
  const afterDisable = await page.evaluate(() => ({
    tags: [...document.querySelectorAll('.style-table .status-tag')].map((el) => el.textContent.trim()),
    offRows: document.querySelectorAll('.style-table tbody tr.off').length,
    // 批量模式是显式开关，批量条会一直留着（不做完就消失，管理员可以接着操作），
    // 但勾选必须清空 —— 否则下一次点「批量删除」会误删上一批。
    barText: document.querySelector('.batch-bar')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    pickedRows: document.querySelectorAll('.style-table tbody tr.picked').length,
    notice: document.querySelector('.style-alert.ok')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  }))
  const apiAfterDisable = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  // 只看「验收*」这三条的状态，别管真实风格是什么状态
  const tempStatusAfterDisable = (apiAfterDisable.json?.styles || []).filter(isTemp)
  const disabledFlags = tempStatusAfterDisable.map((item) => item.status)
  const studentAfterDisable = await api(student.cookie, 'GET', '/api/image-styles')
  const studentNamesAfterDisable = (studentAfterDisable.json?.styles || []).map((item) => item.name).filter((name) => /^验收/.test(name))
  const tempOffTags = await page.evaluate(() => [...document.querySelectorAll('.style-table tbody tr')]
    .filter((row) => /^验收/.test(row.querySelector('.col-name strong')?.textContent?.trim() || ''))
    .map((row) => row.querySelector('.status-tag')?.textContent?.trim() || ''))
  check('④ 批量停用只改了勾选的两行（另 1 行仍启用中）',
    tempOffTags.filter((text) => text === '已停用').length === 2 && tempOffTags.filter((text) => text === '启用中').length === 1 && afterDisable.offRows === 2,
    { tempOffTags, offRows: afterDisable.offRows })
  check('④ 接口里对应的 2 条变 disabled、1 条仍 enabled', disabledFlags.filter((status) => status === 'disabled').length === 2 && disabledFlags.filter((status) => status === 'enabled').length === 1, disabledFlags)
  check('④ 学生端只看到没被停用的那 1 个', studentNamesAfterDisable.length === 1 && studentNamesAfterDisable[0] === '验收批量丙', studentNamesAfterDisable)
  check('④ 批量完自动清空勾选（批量条留着，可接着操作）+ 成功提示',
    /已选 0 个/.test(afterDisable.barText) && afterDisable.pickedRows === 0 && /批量操作完成/.test(afterDisable.notice), afterDisable)

  // ⑤ 勾选全部「验收*」→ 批量启用
  // 🔴 这里原来点的是表头全选，库里有真实风格时会把它们一起停用/删除 —— 已经造成过一次真实数据丢失。
  // 现在只勾我们自己建的 3 条。
  for (const name of ['验收批量甲', '验收批量乙', '验收批量丙']) await pickRow(name)
  await delay(400)
  const allPickedText = await page.evaluate(() => document.querySelector('.batch-bar')?.textContent?.replace(/\s+/g, ' ').trim() || '')
  check('⑤ 勾上 3 个验收行', /已选 3 个/.test(allPickedText), allPickedText)
  await page.locator('.batch-bar button', { hasText: '批量启用' }).click()
  await delay(1600)
  const afterEnable = await page.evaluate(() => [...document.querySelectorAll('.style-table tbody tr')]
    .filter((row) => /^验收/.test(row.querySelector('.col-name strong')?.textContent?.trim() || ''))
    .map((row) => row.querySelector('.status-tag')?.textContent?.trim() || ''))
  const apiAfterEnable = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const tempAfterEnable = (apiAfterEnable.json?.styles || []).filter(isTemp)
  check('⑤ 批量启用后验收行全变「启用中」', afterEnable.length === 3 && afterEnable.every((text) => text === '启用中'), afterEnable)
  check('⑤ 接口里 3 条都回到 enabled', tempAfterEnable.length === 3 && tempAfterEnable.every((item) => item.status === 'enabled'), tempAfterEnable.map((item) => item.status))

  // ⑥ 批量改分类：只勾前两条验收行
  await pickRow('验收批量甲')
  await pickRow('验收批量乙')
  await delay(300)
  await page.locator('.batch-bar button', { hasText: '批量改分类' }).click()
  await page.waitForSelector('.batch-group-box select', { timeout: 10000 })
  await page.locator('.batch-group-box select').selectOption(MERGE_GROUP)
  await page.locator('.batch-group-box button', { hasText: '确定' }).click()
  await delay(1600)
  const afterGroup = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const groupMap = afterGroup.json.styles.reduce((map, item) => ({ ...map, [item.name]: item.groupName }), {})
  const groupTabs = await page.evaluate(() => [...document.querySelectorAll('.style-toolbar .style-group-tabs button')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
  check('⑥ 批量改分类只动勾选的两条', groupMap['验收批量甲'] === '验收合并组' && groupMap['验收批量乙'] === '验收合并组' && groupMap['验收批量丙'] === '验收组二', groupMap)
  check('⑥ 工具条分类标签出现「验收合并组」', groupTabs.some((text) => text.includes('验收合并组')), groupTabs)

  // ⑦ 批量删除（先弹确认框）
  // 🔴 同上：这里原来也是表头全选，真实风格会被一起物理删除（不可恢复）。
  // 现在只勾我们自己建的 3 条，删完应该「刚好剩回基线那几条」。
  for (const name of ['验收批量甲', '验收批量乙', '验收批量丙']) await pickRow(name)
  await delay(300)
  await page.locator('.batch-bar button', { hasText: '批量删除' }).click()
  const box = page.locator('.el-message-box')
  await box.waitFor({ timeout: 10000 })
  const boxText = await box.locator('.el-message-box__message').textContent()
  check('⑦ 批量删除前弹确认框（说明会连封面一起删）', /永久删除|封面/.test(boxText || ''), boxText)
  const confirmBtnText = (await box.locator('.el-message-box__btns button').last().textContent())?.trim() || ''
  await box.locator('.el-message-box__btns button').last().click()
  // 批量删除是「请求 → 重新拉列表 → 重渲染」三步，固定 delay 有时会在重渲染前采样（曾偶发读到 rows:3）。
  // 改成等表格真的只剩基线那几条再断言，最多等 8 秒；等不到就说明确实没刷新，仍然判失败。
  let emptiedInTime = true
  try {
    await page.waitForFunction((expected) => document.querySelectorAll('.style-table tbody tr').length === expected, realCount, { timeout: 8000 })
  } catch { emptiedInTime = false }
  await delay(400)
  const afterBatchDelete = await page.evaluate(() => ({
    rows: document.querySelectorAll('.style-table tbody tr').length,
    names: [...document.querySelectorAll('.style-table tbody tr .col-name strong')].map((el) => el.textContent.trim()),
    empty: document.querySelector('.style-empty')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    batchBarText: document.querySelector('.batch-bar')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    notice: document.querySelector('.style-alert')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    toast: [...document.querySelectorAll('.el-message')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
  }))
  afterBatchDelete.confirmBtnText = confirmBtnText
  afterBatchDelete.emptiedInTime = emptiedInTime
  afterBatchDelete.realCount = realCount
  const afterDeleteApi = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const afterDeleteList = afterDeleteApi.json?.styles || []
  // ⚠️ 不能断言「表格清空」：库里可能有真实风格（用户手工建的），删完只会剩回它们。
  // 正确口径是「只剩基线那几条、验收* 一条不剩、勾选被清空、空状态只在基线本来就为 0 时出现」。
  // 勾选是否清空分两种：基线还有风格时批量条还在（应显示「已选 0 个」）；
  // 基线本来就是 0 时整块列表被空状态替换，批量条自然一起消失。
  check('⑦ 批量删除后只剩基线风格、验收行全没了',
    afterBatchDelete.rows === realCount
      && !afterBatchDelete.names.some((name) => /^验收/.test(name))
      && afterBatchDelete.emptiedInTime
      && (realCount > 0 ? /已选 0 个/.test(afterBatchDelete.batchBarText) : afterBatchDelete.batchBarText === '')
      && (realCount > 0 || /还没有风格模板/.test(afterBatchDelete.empty)),
    afterBatchDelete)
  check('⑦ 接口里验收风格一条不剩（真实风格不受影响）',
    afterDeleteList.length === realCount && !afterDeleteList.some(isTemp),
    { total: afterDeleteList.length, realCount, names: afterDeleteList.map((item) => item.name) })
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-style-batch-deleted.png') })
  created.length = 0

  // ⑧ 模板设置
  await page.locator('.style-head-actions button', { hasText: '模板设置' }).click()
  await page.waitForSelector('.style-modal.narrow', { timeout: 10000 })
  await delay(400)
  const settingsBefore = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('.style-modal.narrow .field-row select')]
    return {
      title: document.querySelector('.style-modal.narrow h3')?.textContent?.trim() || '',
      defaultGroup: selects[0]?.value || '',
      columns: selects[1]?.value || '',
      panelTitle: document.querySelector('.style-modal.narrow .field-block input')?.value || '',
      fallback: document.querySelector('.style-modal.narrow .field-block select')?.value || '',
      summary: document.querySelector('.style-modal.narrow .settings-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    }
  })
  check('⑧ 设置弹窗是「模板设置」并带默认值', settingsBefore.title === '模板设置' && settingsBefore.defaultGroup === '推荐' && settingsBefore.columns === '4' && settingsBefore.panelTitle === '图像风格' && settingsBefore.fallback === 'builtin', settingsBefore)
  // ⚠️ 统计数字是「当前库里还剩几个」：批量删完只剩真实风格，不能写死 0。
  check('⑧ 设置里带当前统计（共 N 个风格）', new RegExp(`共\\s*${realCount}\\s*个`).test(settingsBefore.summary), { summary: settingsBefore.summary, realCount })
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-style-settings-modal.png') })
  await page.locator('.style-modal.narrow .field-row select').first().selectOption('验收默认组')
  await page.locator('.style-modal.narrow .field-row select').nth(1).selectOption('2')
  await page.locator('.style-modal.narrow .field-block input').fill('验收画风')
  await page.locator('.style-modal.narrow .field-block select').selectOption('empty')
  await page.locator('.style-modal.narrow .style-modal-foot .primary').click()
  await page.waitForSelector('.style-modal.narrow', { state: 'detached', timeout: 15000 })
  await delay(600)
  const storedSettings = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), SETTINGS_KEY)
  check('⑧ 保存后设置写进 localStorage', storedSettings?.columns === 2 && storedSettings?.panelTitle === '验收画风' && storedSettings?.fallbackMode === 'empty' && storedSettings?.defaultGroup === '验收默认组', storedSettings)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-style-settings.png') })

  // 新建风格的默认分组跟着设置走（空表单预填「验收默认组」）
  await page.locator('.style-head-actions button', { hasText: '新建风格' }).click()
  await page.waitForSelector('.style-modal:not(.narrow)', { timeout: 10000 })
  const prefillGroup = await page.locator('.style-modal:not(.narrow) .field-row select').first().inputValue()
  check('⑧ 新建风格时分组预填设置的默认分组', prefillGroup === '验收默认组', prefillGroup)
  await page.locator('.style-modal:not(.narrow) .style-modal-foot button', { hasText: '取消' }).click()
  await delay(400)

  // ⑨ 学生端照着设置变：先补 7 条风格（含分组），测「两排 + 左右滑动」
  created.length = 0
  for (let i = 1; i <= 7; i += 1) {
    await createStyleViaApi({
      name: `验收画风${i}`, groupName: i <= 4 ? '验收中国风' : '验收插画',
      prompt: `第 ${i} 号风格提示词`, rgb: [40 + i * 20, 90 + i * 10, 150 - i * 8],
    })
  }
  check('⑨ 补了 7 条风格用于滑动测试', created.length === 7, created.length)

  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
    })
  })
  await page.goto(`${BASE}/student/paint`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.prompt-chip-row', { timeout: 30000 })
  await delay(2000)
  await dismissOverlays(page)
  await page.locator('.chip-menu-wrap .prompt-chip', { hasText: '图像风格' }).first().click()
  await page.waitForSelector('.chip-option-panel.style-panel', { timeout: 15000 })
  await delay(900)
  const panel = await page.evaluate(() => {
    const wrap = document.querySelector('.chip-option-panel.style-panel')
    const scroll = wrap.querySelector('.style-card-scroll')
    const grid = wrap.querySelector('.style-card-grid')
    const cards = [...wrap.querySelectorAll('.style-card')]
    const rects = cards.map((el) => el.getBoundingClientRect())
    const cover = cards[0].querySelector('.style-card-cover').getBoundingClientRect()
    return {
      className: wrap.className,
      headText: wrap.querySelector('.style-panel-head')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      panelW: Math.round(wrap.getBoundingClientRect().width),
      panelLeft: Math.round(wrap.getBoundingClientRect().left),
      panelRight: Math.round(wrap.getBoundingClientRect().right),
      viewportW: window.innerWidth,
      cardCount: cards.length,
      // ⚠️ 库里可能有真实风格，也会出现在学生端面板里；只数我们建的「验收画风*」。
      tempCardCount: cards.filter((el) => /^验收画风/.test(el.querySelector('.style-card-name')?.textContent?.trim() || '')).length,
      tempCardW: Math.round((cards.find((el) => /^验收画风/.test(el.querySelector('.style-card-name')?.textContent?.trim() || '')) || cards[0]).getBoundingClientRect().width),
      cardW: Math.round(rects[0].width),
      coverW: Math.round(cover.width),
      coverH: Math.round(cover.height),
      rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
      cols: new Set(rects.map((rect) => Math.round(rect.left))).size,
      scrollClient: Math.round(scroll.clientWidth),
      scrollTotal: Math.round(scroll.scrollWidth),
      overflowX: getComputedStyle(scroll).overflowX,
      tabs: [...wrap.querySelectorAll('.style-group-tab')].map((el) => el.textContent.trim()),
    }
  })
  check('⑨ 学生端面板跟着设置变成「每排 2 张」（卡片更宽）', /cols-2/.test(panel.className) && panel.tempCardW >= 140, { className: panel.className, tempCardW: panel.tempCardW })
  check('⑨ 面板标题用后台自定义的「验收画风」', panel.headText.startsWith('验收画风'), panel.headText)
  check('⑨ 7 条验收风格 = 7 张卡（「不指定」不占卡片位）', panel.tempCardCount === 7, { tempCardCount: panel.tempCardCount, cardCount: panel.cardCount })
  check('⑨ 面板固定两排（不是竖着排一长串）', panel.rows === 2, { rows: panel.rows, tops: panel.rows })
  check('⑨ 卡片变小了（封面 ≤ 200px 且是正方形）', panel.coverW <= 200 && Math.abs(panel.coverW - panel.coverH) <= 2, { coverW: panel.coverW, coverH: panel.coverH })
  check('⑨ 超出两排的部分靠左右滑动', panel.overflowX === 'auto' && panel.scrollTotal > panel.scrollClient, { overflowX: panel.overflowX, scrollTotal: panel.scrollTotal, scrollClient: panel.scrollClient })
  check('⑨ 面板完整落在窗口内（左右不越界）', panel.panelLeft >= 0 && panel.panelRight <= panel.viewportW, panel)
  // ⚠️ 库里可能已有真实分组（真实风格带分组时会多出标签），只断言「全部 + 我们那 2 组」都在。
  check('⑨ 分类标签还在（全部 + 2 组）', panel.tabs[0] === '全部' && panel.tabs.some((t) => t.includes('验收中国风')) && panel.tabs.some((t) => t.includes('验收插画')), panel.tabs)
  await page.screenshot({ path: path.join(OUT_DIR, 'student-style-two-rows.png') })

  // 真滑一下：滚到最右，最后一张卡进视野
  const scrollResult = await page.evaluate(() => {
    const scroll = document.querySelector('.style-card-scroll')
    scroll.scrollLeft = scroll.scrollWidth
    const cards = [...document.querySelectorAll('.chip-option-panel.style-panel .style-card')]
    const last = cards[cards.length - 1].getBoundingClientRect()
    const box = scroll.getBoundingClientRect()
    return { scrollLeft: Math.round(scroll.scrollLeft), lastRight: Math.round(last.right), boxRight: Math.round(box.right) }
  })
  check('⑨ 能真滑到最右，最后一张卡完整可见', scrollResult.scrollLeft > 0 && scrollResult.lastRight <= scrollResult.boxRight + 2, scrollResult)
  await page.screenshot({ path: path.join(OUT_DIR, 'student-style-two-rows-scrolled.png') })

  // ⑩ 零配置 + 「不回退内置」→ 只留「不指定」
  for (const item of created) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
  created.length = 0
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.prompt-chip-row', { timeout: 30000 })
  await delay(2000)
  await dismissOverlays(page)
  await page.locator('.chip-menu-wrap .prompt-chip', { hasText: '图像风格' }).first().click()
  await page.waitForSelector('.chip-option-panel.style-panel', { timeout: 15000 })
  await delay(800)
  const emptyMode = await page.evaluate(() => ({
    names: [...document.querySelectorAll('.chip-option-panel.style-panel .style-card-name')].map((el) => el.textContent.trim()),
    tabs: document.querySelectorAll('.style-group-tab').length,
    overflow: (() => {
      const scroll = document.querySelector('.style-card-scroll')
      return scroll.scrollWidth > scroll.clientWidth
    })(),
    headText: document.querySelector('.style-panel-head')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    noneBtnText: document.querySelector('.chip-option-panel.style-panel .style-none-btn')?.textContent?.trim() || '',
    noneBtnSelected: Boolean(document.querySelector('.chip-option-panel.style-panel .style-none-btn.selected')),
  }))
  check('⑩ 「不回退内置风格」时验收风格一张卡都不剩', emptyMode.names.filter((name) => /^验收/.test(name)).length === 0, emptyMode.names)
  // 库里若已有真实风格，学生端当然还会显示它们；只有基线为空时才是真正的「一张卡都没有」。
  if (realCount === 0) check('⑩ 基线为空时学生端一张风格卡都没有', emptyMode.names.length === 0, emptyMode.names)
  else console.error(`SKIP  ⑩ 基线里有 ${realCount} 个真实风格，跳过「一张卡都没有」的断言`)
  check('⑩ 只剩「不用风格」按钮且是选中态（学生仍有明确选项）', emptyMode.noneBtnText === '不用风格' && emptyMode.noneBtnSelected, emptyMode)
  if (realCount === 0) check('⑩ 没有卡片时不显示分类标签也不横向溢出', emptyMode.tabs === 0 && emptyMode.overflow === false, emptyMode)
  await page.screenshot({ path: path.join(OUT_DIR, 'student-style-empty-fallback.png') })

  // 收尾：把设置恢复成默认（本 context 独立，不影响别人，但顺手验证能改回来）
  await page.evaluate((key) => localStorage.removeItem(key), SETTINGS_KEY)
  const cleared = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY)
  check('⑩ 设置可以从 localStorage 清掉（恢复默认）', cleared === null, cleared)

  // ⑪ 分类设置：建分类 → 改名（风格跟着改）→ 删分类（风格移到「推荐」，一张不丢）
  // 🔴 这一整段只用「验收*」临时分类和临时风格，绝不碰真实分类。
  // ⚠️ ⑨⑩ 已经把浏览器会话切成学生账号，进后台前必须重新用管理员登录，否则会被权限挡在门外。
  // ⚠️ 这里用 ?module=imageStyleTemplates 直达：点菜单先前在这台机器上会因为残留遮罩点不进去。
  const STYLE_ADMIN_URL = `${BASE}/admin?module=imageStyleTemplates`
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
  })
  await page.goto(STYLE_ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.style-admin', { timeout: 30000 })
  await delay(1500)

  // 建分类
  await page.locator('.style-head-actions button', { hasText: '分类设置' }).click()
  await page.waitForSelector('.style-modal.narrow', { timeout: 10000 })
  await delay(800)
  const categoryOpen = await page.evaluate(() => ({
    title: document.querySelector('.style-modal.narrow h3')?.textContent?.trim() || '',
    rows: [...document.querySelectorAll('.category-row')].map((el) => el.querySelector('.category-name')?.textContent?.trim() || ''),
    hasNewInput: Boolean(document.querySelector('.category-new input')),
    // 「推荐」那一行不能有删除按钮，只显示「兜底分类」
    recommendLocked: [...document.querySelectorAll('.category-row')]
      .filter((el) => el.querySelector('.category-name')?.textContent?.trim() === '推荐')
      .every((el) => !el.querySelector('button.danger') && Boolean(el.querySelector('.category-lock'))),
  }))
  check('⑪ 分类设置弹窗打开，列出已有分类（含「推荐」）', categoryOpen.title === '分类设置' && categoryOpen.rows.includes('推荐') && categoryOpen.hasNewInput, categoryOpen)
  check('⑪ 「推荐」是兜底分类：不给删除按钮，标「兜底分类」', categoryOpen.recommendLocked, categoryOpen)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-style-category-modal.png') })

  await page.locator('.category-new input').fill('验收设置分类')
  await page.locator('.category-new button', { hasText: '新建分类' }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.category-row .category-name')].some((el) => el.textContent.trim() === '验收设置分类'), { timeout: 10000 })
  await delay(400)
  const afterCreate = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('.category-row')].map((el) => el.querySelector('.category-name')?.textContent?.trim() || ''),
    tabs: [...document.querySelectorAll('.style-toolbar .style-group-tabs button')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
  }))
  const apiAfterCreate = await api(admin.cookie, 'GET', '/api/admin/image-style-groups')
  const groupAfterCreate = apiAfterCreate.json?.groups || []
  check('⑪ 新建分类后列表里出现它', afterCreate.rows.includes('验收设置分类') && groupAfterCreate.some((g) => g.name === '验收设置分类'), afterCreate.rows)
  check('⑪ 新分类名立刻出现在工具条分类标签里（空分类也显示）', afterCreate.tabs.some((text) => text.includes('验收设置分类')), afterCreate.tabs)

  // 重名拦截
  await page.locator('.category-new input').fill('验收设置分类')
  await page.locator('.category-new button', { hasText: '新建分类' }).click()
  await delay(600)
  const dupError = await page.evaluate(() => document.querySelector('.style-modal.narrow .style-alert.error')?.textContent?.replace(/\s+/g, ' ').trim() || '')
  check('⑪ 新建同名分类被拦下并给出提示', /同名/.test(dupError), dupError)
  await page.locator('.category-new input').fill('')

  // 再建两条挂在这个分类下的风格，用来验证「改名跟着改、删分类挪到推荐」
  created.length = 0
  for (const name of ['验收归类甲', '验收归类乙']) {
    await createStyleViaApi({ name, groupName: '验收设置分类', prompt: `给 ${name} 用的一句提示词`, rgb: [110, 80, 170] })
  }
  const beforeCategory = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const beforeCategoryTemp = (beforeCategory.json?.styles || []).filter(isSeed)
  check('⑪ 2 条验收风格已挂进「验收设置分类」',
    beforeCategoryTemp.filter((item) => /^验收归类/.test(item.name) && item.groupName === '验收设置分类').length === 2,
    beforeCategoryTemp.map((item) => `${item.name}→${item.groupName}`))

  // 改名：风格要跟着改
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.style-admin', { timeout: 30000 })
  await delay(1000)
  await page.locator('.style-head-actions button', { hasText: '分类设置' }).click()
  await page.waitForSelector('.category-row', { timeout: 15000 })
  await delay(400)
  await page.locator('.category-row').filter({ has: page.locator('.category-name', { hasText: '验收设置分类' }) }).locator('button', { hasText: '改名' }).click()
  await page.waitForSelector('.category-rename', { timeout: 10000 })
  await page.locator('.category-rename').fill('验收改名分类')
  // ⚠️ 必须锁「正在改名的那一行」里的保存：`.category-row button` 的第一个是「推荐」那行的「改名」，
  // 直接 first() 会点错行（历史上就因为这种定位方式误操作过真实数据）。
  await page.locator('.category-row').filter({ has: page.locator('.category-rename') }).locator('button', { hasText: '保存' }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.category-row .category-name')].some((el) => el.textContent.trim() === '验收改名分类'), { timeout: 10000 })
  await delay(600)
  const afterRename = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const renameMap = (afterRename.json?.styles || []).reduce((map, item) => ({ ...map, [item.name]: item.groupName }), {})
  check('⑪ 分类改名后，里面的风格分类跟着改',
    renameMap['验收归类甲'] === '验收改名分类' && renameMap['验收归类乙'] === '验收改名分类', renameMap)

  // 删分类：确认框要写明「风格会移到推荐」，删完风格一张不丢
  const renameRow = page.locator('.category-row').filter({ has: page.locator('.category-name', { hasText: '验收改名分类' }) })
  await renameRow.locator('button.danger', { hasText: '删除' }).click()
  const catBox = page.locator('.el-message-box')
  await catBox.waitFor({ timeout: 10000 })
  const catBoxText = await catBox.locator('.el-message-box__message').textContent()
  check('⑪ 删分类的确认框写明「风格会移到推荐、风格不删」', /推荐/.test(catBoxText || '') && /不会删|移到/.test(catBoxText || ''), catBoxText)
  await catBox.locator('.el-message-box__btns button').last().click()
  await page.waitForFunction(() => ![...document.querySelectorAll('.category-row .category-name')].some((el) => el.textContent.trim() === '验收改名分类'), { timeout: 10000 })
  await delay(800)
  const afterDeleteCategory = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const afterDeleteCategoryTemp = (afterDeleteCategory.json?.styles || []).filter(isSeed)
  const deleteMap = afterDeleteCategoryTemp.reduce((map, item) => ({ ...map, [item.name]: item.groupName }), {})
  check('⑪ 删分类后风格全部还在（一张不少）',
    afterDeleteCategoryTemp.length === beforeCategoryTemp.length, { before: beforeCategoryTemp.length, after: afterDeleteCategoryTemp.length })
  check('⑪ 删分类后这些风格被挪到「推荐」',
    deleteMap['验收归类甲'] === '推荐' && deleteMap['验收归类乙'] === '推荐', deleteMap)
  const groupsAfterDelete = await api(admin.cookie, 'GET', '/api/admin/image-style-groups')
  check('⑪ 分类表里确实没有「验收改名分类」了',
    !(groupsAfterDelete.json?.groups || []).some((g) => g.name === '验收改名分类'), (groupsAfterDelete.json?.groups || []).map((g) => g.name))

  await page.locator('.style-modal.narrow .style-modal-foot .primary', { hasText: '关闭' }).click()
  await page.waitForSelector('.style-modal.narrow', { state: 'detached', timeout: 10000 })
  // 清掉 ⑪ 建的临时风格，别影响 ⑫ 的清理统计
  for (const item of afterDeleteCategoryTemp) {
    if (/^验收归类/.test(item.name)) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
  }
  created.length = 0

  const fatal = errors.filter((text) => !/favicon|ResizeObserver|Failed to load resource/i.test(text))
  check('⑫ 控制台无新报错', fatal.length === 0, fatal.slice(0, 4))
  if (realCount) console.error(`NOTE  后台原本已有 ${realCount} 个真实风格（未改动）`)
} catch (error) {
  check('脚本执行未抛异常', false, String(error?.stack || error).slice(0, 600))
} finally {
  if (browser) await browser.close()
  try {
    const admin = await login('guanliyuan88')
    const list = await api(admin.cookie, 'GET', '/api/admin/image-styles')
    for (const item of list.json?.styles || []) {
      if (isSeed(item)) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
    }
    const left = await api(admin.cookie, 'GET', '/api/admin/image-styles')
    check('⑫ 临时风格已清空', (left.json?.styles || []).filter(isSeed).length === 0, left.json?.styles?.map((item) => item.name))
    // 验收里建的临时分类也要删掉：风格已清空，这些分类下面本来就是空的，删了不影响任何真实数据。
    const groupsLeft = await api(admin.cookie, 'GET', '/api/admin/image-style-groups')
    for (const group of groupsLeft.json?.groups || []) {
      if (/^验收/.test(group.name)) await api(admin.cookie, 'DELETE', `/api/admin/image-style-groups/${encodeURIComponent(group.id)}`)
    }
    const groupsFinal = await api(admin.cookie, 'GET', '/api/admin/image-style-groups')
    check('⑫ 临时分类已清空（真实分类未动）', !(groupsFinal.json?.groups || []).some((group) => /^验收/.test(group.name)), (groupsFinal.json?.groups || []).map((group) => group.name))
    if (createdCovers.length) {
      const dirs = await readdir(COVER_DIR).catch(() => [])
      let leftovers = []
      for (const dir of dirs) {
        const files = await readdir(path.join(COVER_DIR, dir)).catch(() => [])
        leftovers = leftovers.concat(files.filter((name) => createdCovers.includes(name)))
      }
      check('⑫ 批量删除的封面文件也被清掉', leftovers.length === 0, leftovers)
    }
  } catch (error) {
    check('⑫ 清理阶段未抛异常', false, String(error).slice(0, 300))
  }
}

const passed = results.filter((r) => r.pass).length
console.log(`\n==== ${passed}/${results.length} 项通过 ====`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((f) => console.log(' - ' + f))
  process.exitCode = 1
}
