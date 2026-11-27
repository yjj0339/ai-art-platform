// 后台「AI图像功能管理 → 风格模板编辑」验收：
//  ① 菜单在「功能管理」分组里，点进去顶栏标题 = AI图像功能管理
//  ② 空状态明确（告诉管理员学生端会回退内置 8 个风格）
//  ③ 新建风格：填名字 + 分组 + 上传方形封面 + 风格提示词 → 保存 → 列表出现卡片、封面真的显示
//  ④ 排序：点 ↓ 后接口里的顺序跟着换
//  ⑤ 停用：卡片打上「已停用」角标
//  ⑥ 编辑：改名后列表同步
//  ⑦ 删除：弹确认框，确认后卡片消失，记录真被删掉
//  ⑪ AI 生成封面：必须有独立的「封面生成提示词」+「出图模型」下拉；名称不参与出图
//     （拦截 /api/ai/image/generate 回假图，不花钱，只验请求体）
//
// 只操作自己建的「验收*」临时风格，不动后台真实数据。
// ⚠️ 库里可能已有真实风格（如「3D毛绒」），所有定位必须按名字，不能按 nth()；
//    计数一律按「基线 + 本次新增」相对算，否则真实数据一多就假红、还会改到真实风格。
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
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const failures = []
function check(name, ok, detail) {
  results.push({ name, pass: Boolean(ok), detail })
  if (!ok) failures.push(`${name} :: ${JSON.stringify(detail).slice(0, 300)}`)
  console.error(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  :: ${JSON.stringify(detail).slice(0, 300)}`}`)
}

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

const isTemp = (item) => /^验收/.test(item.name || '')
await mkdir(OUT_DIR, { recursive: true })
let browser
const createdCovers = []
// ⑪ 用的假图 + 请求记录：拦截出图接口，一分钱不花，只看「发出去的请求体对不对」。
const FAKE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF/2gAAAABJRU5ErkJggg=='
const sentImageRequests = []

try {
  const admin = await login('guanliyuan88')
  check('管理员登录成功', Boolean(admin.user?.id), admin.user?.account)

  // 清掉上次残留，保证从空状态开始
  const existing = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  for (const item of existing.json?.styles || []) {
    if (isTemp(item)) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
  }
  const baseline = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const realCount = (baseline.json?.styles || []).length
  // 「分类」已从「输入框 + datalist」改成真下拉（datalist 会按预填值过滤，看起来像选不了别的分类），
  // 下拉里只能选已有分类，所以验收前先建一个临时分类「验收风格组」，清理阶段一并删掉。
  await api(admin.cookie, 'POST', '/api/admin/image-style-groups', { name: '验收风格组' })

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
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.admin-nav', { timeout: 30000 })
  await delay(1200)

  // ① 菜单入口
  // ⚠️ 菜单分组改成「功能管理 / 作品广场」两组后，裸 `.nav-group-toggle` 会命中 2 个元素，
  // strict mode 直接报错。必须按文字锁定「功能管理」那一组。
  const groupToggle = page.locator('.nav-group-toggle', { hasText: '功能管理' }).first()
  if (!(await page.locator('.nav-group-body').isVisible().catch(() => false))) await groupToggle.click()
  await delay(400)
  const childLabels = await page.$$eval('.nav-group-body .nav-child', (els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
  check('① 「功能管理」里有「AI图像功能管理」入口', childLabels.some((text) => text.includes('AI图像功能管理')), childLabels)
  await page.locator('.nav-group-body .nav-child', { hasText: 'AI图像功能管理' }).click()
  await delay(1500)
  const head = await page.evaluate(() => ({
    activeChild: document.querySelector('.nav-group-body .nav-child.active')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    h2: document.querySelector('.style-admin h2')?.textContent?.trim() || '',
    url: location.pathname + location.search,
  }))
  check('① 左侧菜单高亮在「AI图像功能管理」上', head.activeChild.includes('AI图像功能管理'), head)
  check('① 页面里是「风格模板编辑」', head.h2 === '风格模板编辑', head)

  // ② 空状态
  if (realCount === 0) {
    const empty = await page.evaluate(() => document.querySelector('.style-empty')?.textContent?.replace(/\s+/g, ' ').trim() || '')
    check('② 没有风格时给出空状态提示', /还没有风格模板/.test(empty), empty)
    check('② 空状态说明会回退内置 8 个风格', /8 个风格/.test(empty), empty)
  } else {
    console.error(`SKIP  ② 已有 ${realCount} 个真实风格，空状态提示跳过`)
  }
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-image-style-empty.png') })

  // ③ 新建 2 个风格（第 1 个走上传封面，第 2 个不传封面看重位置占位）
  const coverPng = await sharp({ create: { width: 640, height: 640, channels: 3, background: { r: 120, g: 90, b: 200 } } }).png().toBuffer()
  const coverFile = path.join(OUT_DIR, 'tmp-style-cover.png')
  await sharp(coverPng).toFile(coverFile)

  async function createStyle({ name, group, prompt, withCover }) {
    await page.locator('.style-head-actions .primary').click()
    await page.waitForSelector('.style-modal', { timeout: 10000 })
    await page.locator('.style-modal input[placeholder*="3D毛绒"]').fill(name)
    // 分类现在是真下拉：只能选「分类设置」里已有的分类，不能现打新名字。
    await page.locator('.style-modal .field-row select').first().selectOption(group)
    // ⚠️ 弹窗里现在有两个 textarea（封面生成提示词 / 风格提示词），裸 `.style-modal textarea`
    // 会 strict mode 报错。按专用类名锁定「风格提示词」那个。
    await page.locator('.style-modal .style-prompt-input').fill(prompt)
    if (withCover) {
      await page.locator('.style-modal input[type="file"]').setInputFiles(coverFile)
      await page.waitForFunction(() => Boolean(document.querySelector('.cover-preview img')?.getAttribute('src')?.includes('/api/image-style-covers/')), null, { timeout: 30000 })
    }
    await page.locator('.style-modal-foot .primary').click()
    await page.waitForSelector('.style-modal', { state: 'detached', timeout: 20000 })
    await delay(900)
  }

  await createStyle({ name: '验收油彩', group: '验收风格组', prompt: '厚涂油彩，笔触明显，色彩饱和', withCover: true })
  await createStyle({ name: '验收版画', group: '验收风格组', prompt: '木刻版画，黑白对比强，纹理粗粝', withCover: false })

  const afterCreate = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const tempStyles = (afterCreate.json?.styles || []).filter(isTemp)
  check('③ 两个风格都建成功', tempStyles.length === 2, tempStyles.map((item) => item.name))
  const withCover = tempStyles.find((item) => item.name === '验收油彩')
  check('③ 上传的封面已存到服务器', /^\/api\/image-style-covers\//.test(withCover?.coverImageUrl || ''), withCover?.coverImageUrl)
  if (withCover?.coverImageUrl) createdCovers.push(withCover.coverImageUrl.split('/').pop())
  const cardState = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.style-grid .style-card')]
    return {
      count: cards.length,
      names: cards.map((el) => el.querySelector('.style-meta strong')?.textContent?.trim() || ''),
      groups: [...new Set(cards.map((el) => el.querySelector('.style-meta small')?.textContent?.trim() || ''))],
      coverLoaded: cards.map((el) => {
        const img = el.querySelector('.style-cover img')
        return img ? img.naturalWidth : 0
      }),
      emptyCovers: cards.filter((el) => el.querySelector('.style-cover')?.classList.contains('empty')).length,
      tabs: [...document.querySelectorAll('.style-group-tabs button')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
    }
  })
  check('③ 列表里多出 2 张卡片', cardState.count === realCount + 2 && ['验收油彩', '验收版画'].every((name) => cardState.names.includes(name)), { count: cardState.count, realCount, names: cardState.names })
  check('③ 有封面的卡片图片真的加载出来（naturalWidth ≥ 200）', cardState.coverLoaded.some((width) => width >= 200), cardState.coverLoaded)
  // ⚠️ 库里可能已有真实风格（如「3D毛绒」），不能断言「占位卡只有 1 张」，
  // 只断言「我们那两个里，带封面的加载出来了、没带封面的显示占位」。
  check('③ 没封面的卡片显示占位', cardState.emptyCovers >= 1, cardState.emptyCovers)
  check('③ 分组标签多了「验收风格组 2」', cardState.tabs.some((text) => /验收风格组\s*2/.test(text)), cardState.tabs)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-image-style-list.png') })

  // ④ 排序：把「验收油彩」挪一位（不能再用 nth(1)：库里可能有真实风格，位置不固定）
  // ⚠️ 排在第 1 张时「上移」是禁用的（点了会 30 秒超时），所以按它的实际位置决定方向：
  //    前面有卡就上移，已经在最前面就下移。两种基线都能跑。
  const beforeOrder = (await api(admin.cookie, 'GET', '/api/admin/image-styles')).json.styles.map((item) => item.name)
  const targetCard = page.locator('.style-grid .style-card').filter({ hasText: '验收油彩' }).first()
  const startIndex = beforeOrder.indexOf('验收油彩')
  const moveDirection = startIndex > 0 ? '上移' : '下移'
  await targetCard.locator(`button[title="${moveDirection}"]`).click()
  await delay(1200)
  const afterOrder = (await api(admin.cookie, 'GET', '/api/admin/image-styles')).json.styles.map((item) => item.name)
  // 断言「这一张确实挪动了一位」，而不是「整个数组倒序」——真实风格夹在中间时倒序断言必假红。
  const movedFrom = startIndex
  const movedTo = afterOrder.indexOf('验收油彩')
  check('④ 点排序按钮后接口顺序真的换了',
    movedFrom >= 0 && movedTo === (moveDirection === '上移' ? movedFrom - 1 : movedFrom + 1),
    { moveDirection, movedFrom, movedTo, beforeOrder, afterOrder })

  // ⑤ 停用「验收油彩」
  const offCard = page.locator('.style-grid .style-card').filter({ hasText: '验收油彩' }).first()
  await offCard.locator('button', { hasText: '停用' }).click()
  await delay(1200)
  const offState = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.style-grid .style-card')].find((el) => el.textContent.includes('验收油彩'))
    return { off: Boolean(card?.classList.contains('off')), badge: card?.querySelector('.style-badge')?.textContent?.trim() || '' }
  })
  check('⑤ 停用后卡片变灰并打「已停用」角标', offState.off && offState.badge === '已停用', offState)

  // ⑥ 编辑改名（同样按名字定位，不碰真实风格）
  await page.locator('.style-grid .style-card').filter({ hasText: '验收油彩' }).first().locator('button', { hasText: '编辑' }).click()
  await page.waitForSelector('.style-modal', { timeout: 10000 })
  const prefilled = await page.locator('.style-modal input[placeholder*="3D毛绒"]').inputValue()
  await page.locator('.style-modal input[placeholder*="3D毛绒"]').fill('验收版画改')
  await page.locator('.style-modal-foot .primary').click()
  await page.waitForSelector('.style-modal', { state: 'detached', timeout: 20000 })
  await delay(900)
  const renamed = await page.evaluate(() => [...document.querySelectorAll('.style-grid .style-meta strong')].map((el) => el.textContent.trim()))
  check('⑥ 编辑框带出原名', prefilled.length > 0, prefilled)
  check('⑥ 改名后列表同步', renamed.includes('验收版画改'), renamed)

  // ⑦ 删除（弹确认框）——删刚改名的「验收版画改」
  await page.locator('.style-grid .style-card').filter({ hasText: '验收版画改' }).first().locator('button', { hasText: '删除' }).click()
  const box = page.locator('.el-message-box')
  await box.waitFor({ timeout: 10000 })
  const boxText = await box.locator('.el-message-box__message').textContent()
  check('⑦ 删除前弹确认框', /永久删除|确定|删除/.test(boxText || ''), boxText)
  await box.locator('.el-message-box__btns button').last().click()
  await delay(1400)
  // 等表格真的少一张再数，避免采样太早（⑦ 曾偶发假红）
  await page.waitForFunction((expected) => document.querySelectorAll('.style-grid .style-card').length === expected, realCount + 1, { timeout: 15000 }).catch(() => {})
  const afterDelete = await page.evaluate(() => document.querySelectorAll('.style-grid .style-card').length)
  const leftApi = (await api(admin.cookie, 'GET', '/api/admin/image-styles')).json.styles.filter(isTemp).map((item) => item.name)
  check('⑦ 确认后卡片少一张', afterDelete === realCount + 1, { afterDelete, realCount })
  check('⑦ 接口里也真的删掉了', leftApi.length === 1, leftApi)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-image-style-after-delete.png') })

  // ⑧ 学生端看到的顺序 = 后台排的顺序
  const student = await login('ceshi2')
  const studentList = await api(student.cookie, 'GET', '/api/image-styles')
  const adminList = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const adminEnabled = (adminList.json?.styles || []).filter((item) => item.status === 'enabled').map((item) => item.name)
  const studentNames = (studentList.json?.styles || []).map((item) => item.name)
  const disabledName = leftApi.find((name) => name.includes('版画改')) || ''
  check('⑧ 学生端拿到的启用风格顺序与后台一致', adminEnabled.join() === studentNames.join(), { adminEnabled, studentNames })
  check('⑧ 学生端看不到已停用的风格', !disabledName || !studentNames.includes(disabledName), { disabledName, studentNames })

  const fatal = errors.filter((text) => !/favicon|ResizeObserver|Failed to load resource/i.test(text))
  check('⑨ 控制台无新报错', fatal.length === 0, fatal.slice(0, 4))

  // ⑪ AI 生成封面：必须自己填「提示词」并可选「模型」，风格名称绝不参与出图。
  // 🔴 全程拦截 /api/ai/image/generate 回一张假图，不花钱；只验「发出去的请求体对不对」。
  await page.route('**/api/ai/image/generate', async (route) => {
    sentImageRequests.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ imageUrl: FAKE_PNG }] }) })
  })
  await page.locator('.style-head-actions .primary').click()
  await page.waitForSelector('.style-modal', { timeout: 10000 })
  await delay(600)
  const aiBlock = await page.evaluate(() => {
    const modal = document.querySelector('.style-modal')
    const select = modal.querySelector('.cover-ai-model select')
    return {
      exists: Boolean(modal.querySelector('.cover-ai')),
      hasPromptBox: Boolean(modal.querySelector('.cover-prompt-input')),
      // ⚠️ `.cover-ai-title` 现在有两处（「出图模型」标签 + 「封面生成提示词」标签），
      // 裸 querySelector 会先撞上左边那个，必须锁在 .cover-ai-prompt 里面取。
      promptTitle: modal.querySelector('.cover-ai-prompt .cover-ai-title')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      modelTitle: modal.querySelector('.cover-ai-model .cover-ai-title')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      modelOptions: [...(select?.options || [])].map((o) => o.textContent.trim()),
      hasStylePromptBox: Boolean(modal.querySelector('.style-prompt-input')),
    }
  })
  check('⑪ 弹窗里有独立的「封面生成提示词」输入框', aiBlock.exists && aiBlock.hasPromptBox, aiBlock)
  check('⑪ 提示词框写明「AI 只按这句话画，风格名称不参与」', /风格名称不参与/.test(aiBlock.promptTitle), aiBlock.promptTitle)
  check('⑪ 有「出图模型」下拉，且带「自动」+ 真实可用模型', aiBlock.modelOptions.length >= 2 && /自动/.test(aiBlock.modelOptions[0]), aiBlock.modelOptions)
  // 新排版：模型下拉搬到封面图正下方，跟图同宽左对齐（原来挤在右列里，图下面留一大块空白）
  const coverLayout = await page.evaluate(() => {
    const left = document.querySelector('.cover-left')
    const preview = document.querySelector('.cover-preview')
    const model = document.querySelector('.cover-ai-model')
    const side = document.querySelector('.cover-side')
    if (!left || !preview || !model || !side) return null
    const p = preview.getBoundingClientRect()
    const m = model.getBoundingClientRect()
    const s = side.getBoundingClientRect()
    return {
      modelUnderImage: Math.round(m.top) >= Math.round(p.bottom) - 1,
      modelAlignLeft: Math.abs(Math.round(m.left) - Math.round(p.left)) <= 1,
      modelSameWidth: Math.abs(Math.round(m.width) - Math.round(p.width)) <= 2,
      sideStartsRightOfImage: Math.round(s.left) >= Math.round(p.right) - 1,
      // 「模型」属于左列、不在右列里：右列里应该找不到它
      modelInSide: Boolean(document.querySelector('.cover-side .cover-ai-model')),
    }
  })
  check('⑪ 「出图模型」在封面图正下方、与图同宽左对齐（图片下方不留空）',
    coverLayout && coverLayout.modelUnderImage && coverLayout.modelAlignLeft && coverLayout.modelSameWidth && !coverLayout.modelInSide, coverLayout)
  check('⑪ 「封面提示词」与「风格提示词」是两个独立输入框', aiBlock.hasStylePromptBox, aiBlock.hasStylePromptBox)

  // 空提示词必须拦下、不发请求（否则又变成「只有名称就出图」）
  await page.locator('.style-modal input[placeholder*="3D毛绒"]').fill('验收封面名XYZ')
  await page.locator('.style-modal .cover-buttons button', { hasText: 'AI生成封面' }).click()
  await delay(700)
  const emptyGuard = await page.evaluate(() => document.querySelector('.style-alert.error')?.textContent?.trim() || '')
  check('⑪ 没填封面提示词时直接拦下、不发请求', /封面生成提示词/.test(emptyGuard) && sentImageRequests.length === 0, { emptyGuard, sent: sentImageRequests.length })

  // 填提示词 + 选具体模型 → 请求体里必须是指令、且带上 provider/model
  await page.locator('.style-modal .cover-prompt-input').fill('一只 3D 毛绒质感的红色小熊，正面居中，纯白背景')
  const modelOptionCount = await page.locator('.cover-ai-model select option').count()
  if (modelOptionCount > 1) await page.locator('.cover-ai-model select').selectOption({ index: 1 })
  const pickedModel = await page.locator('.cover-ai-model select').inputValue()
  await delay(300)
  await page.locator('.style-modal .cover-buttons button', { hasText: 'AI生成封面' }).click()
  await delay(2200)
  const coverReq = sentImageRequests[sentImageRequests.length - 1] || {}
  const coverAfter = await page.evaluate(() => ({
    src: document.querySelector('.cover-preview img')?.getAttribute('src') || '',
    error: document.querySelector('.style-alert.error')?.textContent?.trim() || '',
  }))
  check('⑪ 出图请求的提示词 = 管理员填的那句（不含风格名称）',
    /红色小熊/.test(coverReq.prompt || '') && !/验收封面名XYZ/.test(coverReq.prompt || ''),
    { prompt: coverReq.prompt, name: '验收封面名XYZ' })
  check('⑪ 选定的模型真的带进了请求（provider + model）',
    Boolean(pickedModel) && `${coverReq.provider}::${coverReq.model}` === pickedModel,
    { pickedModel, provider: coverReq.provider, model: coverReq.model })
  check('⑪ 出图后封面落到预览框、没有报错', /\/api\/image-style-covers\//.test(coverAfter.src) && !coverAfter.error, coverAfter)
  if (coverAfter.src.includes('/api/image-style-covers/')) createdCovers.push(coverAfter.src.split('/').pop())
  // 保存而不是取消：这个「验收封面名XYZ」会被清理阶段连同封面一起删掉。
  // 点取消会留下一个没人引用的封面文件（孤儿），反而让 ⑩ 假红。
  await page.locator('.style-modal-foot .primary').click()
  await page.waitForSelector('.style-modal', { state: 'detached', timeout: 20000 })
  await delay(900)
  const savedAi = (await api(admin.cookie, 'GET', '/api/admin/image-styles')).json.styles.filter(isTemp).map((item) => item.name)
  check('⑪ 生成封面后保存，风格落库且带封面', savedAi.includes('验收封面名XYZ'), savedAi)
  await page.unroute('**/api/ai/image/generate')
} catch (error) {
  check('脚本执行未抛异常', false, String(error?.stack || error).slice(0, 600))
} finally {
  if (browser) await browser.close()
  try {
    const admin = await login('guanliyuan88')
    const list = await api(admin.cookie, 'GET', '/api/admin/image-styles')
    for (const item of list.json?.styles || []) {
      if (isTemp(item)) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
    }
    const left = await api(admin.cookie, 'GET', '/api/admin/image-styles')
    check('⑩ 临时风格已清空', (left.json?.styles || []).filter(isTemp).length === 0, left.json?.styles?.map((item) => item.name))
    // 验收前建的临时分类也要删掉，不能留在「分类设置」里污染真实数据
    const groupList = await api(admin.cookie, 'GET', '/api/admin/image-style-groups')
    for (const group of groupList.json?.groups || []) {
      if (/^验收/.test(group.name || '')) await api(admin.cookie, 'DELETE', `/api/admin/image-style-groups/${encodeURIComponent(group.id)}`)
    }
    if (createdCovers.length) {
      const dirs = await readdir(COVER_DIR).catch(() => [])
      let leftovers = []
      for (const dir of dirs) {
        const files = await readdir(path.join(COVER_DIR, dir)).catch(() => [])
        leftovers = leftovers.concat(files.filter((name) => createdCovers.includes(name)))
      }
      check('⑩ 删除后封面文件也清掉', leftovers.length === 0, leftovers)
    }
  } catch (error) {
    check('⑩ 清理阶段未抛异常', false, String(error).slice(0, 300))
  }
}

const passed = results.filter((r) => r.pass).length
console.log(`\n==== ${passed}/${results.length} 项通过 ====`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((f) => console.log(' - ' + f))
  process.exitCode = 1
}
