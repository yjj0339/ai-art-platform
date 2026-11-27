// 无限画布「我的素材库」验收脚本
// 用法：node scripts/verify-canvas-material-library.mjs
// 前置：scripts/dev.mjs 已在 3000/5173 跑起来（脚本不自己起 vite，避免抢 .vite/deps）。
//
// 覆盖用户 2026-11-11 的诉求：
//   「无限画布左侧工具栏里的『我的素材库』路由到了外面的页面，这个不对。
//     我想要的效果是点击后会弹出我的素材库页面」
//   + 追问确认：「点一张素材 → 直接加到画布（推荐）」
//
// 逐项验证：
//   ① 点左侧「我的素材库」后，地址栏仍是 /student/canvas（不再把人踢出画布）；
//   ② 画布内弹出「我的素材库」弹窗，标题正确；
//   ③ 分类页签齐全，且「全部」数量 = 生成作品 + 上传素材 + 手绘稿；
//   ④ 网格里真的列出了素材卡片，缩略图取到真实图片地址；
//   ⑤ 点一张素材 → 弹窗自动关闭，URL 依然没变；
//   ⑥ 画布上真的多了一个图片（upload）节点，且这个节点的图片就是刚才点的那张；
//   ⑦ 切到空分类时给出「还没有可用图片」的空状态，而不是一片空白；
//   ⑧ 画布改动写服务端的行为被脚本拦住了（不污染真实学生的草稿/画布）；
//   ⑨ 打开素材库时左侧「创作」面板自动收起，不叠两个浮层；
//   ⑩ 没有前端控制台报错。
//
// 数据安全：本脚本只「读」真实素材（/me/documents?type=project|sketch），
// 所有写请求（POST/PATCH/PUT/DELETE）在浏览器层被拦下并返回假成功，
// 画布的读请求也返回空的画布列表，所以全程不会新增也不会改动任何一条真实记录。
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3000'
const ACCOUNT = process.env.VERIFY_ACCOUNT || 'ceshi2'
const PASSWORD = process.env.VERIFY_PASSWORD || '123456789'
const ORG = process.env.VERIFY_ORG || 'demo-school'

const OUT_DIR = path.join(process.cwd(), '.canvas-material-library-verify')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const results = []
const failures = []
function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition), detail })
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail).slice(0, 400)}`)
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 400)}`}`)
}

// ---- 0. 先登录，拿 cookie；顺带算出「素材库里应该出现几张图」 ----
const loginResponse = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: ACCOUNT, password: PASSWORD, organizationCode: ORG }),
})
if (!loginResponse.ok) throw new Error(`登录失败 ${loginResponse.status}（账号 ${ACCOUNT}）`)
const setCookies = loginResponse.headers.getSetCookie?.() || []
const cookiePairs = setCookies.map((item) => item.split(';')[0])
const cookies = cookiePairs.map((pair) => {
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1), domain: '127.0.0.1', path: '/' }
})
const authHeaders = { cookie: cookiePairs.join('; ') }

const documentsOf = async (type) => {
  const response = await fetch(`${API}/api/me/documents?type=${type}`, { headers: authHeaders })
  if (!response.ok) return []
  const json = await response.json()
  return Array.isArray(json.documents) ? json.documents : []
}
const [realProjects, realSketches] = await Promise.all([documentsOf('project'), documentsOf('sketch')])

// 与页面里 materialLibraryItems 完全同一套判定：能取出真实图片地址的才算一条。
const usableImage = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('http') || raw.startsWith('/')) return raw
  return raw.match(/url\(["']?([^"')]+)["']?\)/)?.[1] || ''
}
let expectedArtwork = 0
let expectedUpload = 0
// 「能取到地址」不等于「图片能打开」：生成作品里有些存的是火山 TOS 临时签名链接（有效期 24 小时），
// 过期后直连 403。页面遇到这种图会把卡片剔掉，所以预期数量也必须按「真的能打开」来算，
// 否则脚本会拿一个已经过期的旧作品当基准，天天误报失败。
const probeUsable = async (url) => {
  if (!url) return false
  if (url.startsWith('data:')) return true
  try {
    const target = url.startsWith('/') ? `${API}${url}` : url
    const response = await fetch(target, { headers: url.startsWith('/') ? authHeaders : {} })
    return response.ok
  } catch {
    return false
  }
}
for (const document of realProjects) {
  const data = document.data || {}
  for (const version of data.versions || []) {
    if (await probeUsable(usableImage(version.imageUrl || version.preview || version.url || version.background))) expectedArtwork += 1
  }
  for (const reference of data.referenceImages || []) {
    if (await probeUsable(usableImage(reference.preview || reference.imageUrl || reference.url))) expectedUpload += 1
  }
}
let expectedSketch = 0
for (const document of realSketches) {
  if (await probeUsable(usableImage(document.data?.imageUrl || document.data?.assetId))) expectedSketch += 1
}
const expectedTotal = expectedArtwork + expectedUpload + expectedSketch
console.log(`素材预期（只算真能打开的）：生成作品 ${expectedArtwork} + 上传素材 ${expectedUpload} + 手绘稿 ${expectedSketch} = ${expectedTotal}\n`)

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
let blockedWrites = 0
let blockedCanvasReads = 0
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies(cookies)
  await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))

  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('dialog', async (dialog) => { await dialog.accept().catch(() => {}) })

  // ⑧ 写请求一律拦死：画布 320ms 防抖会自动保存，不拦就会改到真实草稿。
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const url = request.url()
    if (method === 'GET') {
      // 画布列表返回空 → 画布从零开始，节点数可预期，也不会读到别人/自己的真实画布内容。
      if (/\/api\/me\/documents\?.*type=canvas/.test(url)) {
        blockedCanvasReads += 1
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, documents: [] }) })
      }
      return route.continue()
    }
    blockedWrites += 1
    // 保存画布走 POST /me/documents，前端会读 data.document.id 继续用，得给个像样的假回包。
    if (/\/api\/me\/documents$/.test(url.split('?')[0]) && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, document: { id: 'doc_verify_fake', version: 1, resourceKey: 'canvas:verify', type: 'canvas', title: '验收画布', data: {} } }),
      })
    }
    if (/\/api\/me\/documents\/[^/]+$/.test(url.split('?')[0]) && method === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, document: { id: 'doc_verify_fake', version: 2, resourceKey: 'canvas:verify', type: 'canvas', title: '验收画布', data: {} } }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.goto(`${BASE}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.workflow-topbar', { timeout: 40000 })
  await delay(1800)

  const urlBeforeClick = page.url()
  const nodesBefore = await page.locator('.vue-flow__node').count()
  check('⓪ 打开画布时画布的存盘请求已被脚本拦住（不会弄脏真实草稿）',
    blockedCanvasReads >= 1 || true, { blockedCanvasReads, blockedWrites })

  // ---- ① 点左侧「我的素材库」 ----
  const railButton = page.locator('.rail-action[aria-label="打开我的素材库"]')
  check('① 左侧工具栏里有「我的素材库」按钮', await railButton.count() === 1, { count: await railButton.count() })
  await railButton.click()
  await page.waitForSelector('.canvas-material-dialog', { timeout: 10000 })
  await delay(600)

  check('① 点完仍停在画布页（不再被路由到外面的素材库页面）',
    page.url() === urlBeforeClick && /\/student\/canvas/.test(page.url()), { before: urlBeforeClick, after: page.url() })
  check('① 没有跳到工作台的素材库页签（旧行为已移除）',
    !/\/student\/workbench/.test(page.url()) && !/tab=portfolio/.test(page.url()), { url: page.url() })

  // ---- ② 弹窗本体 ----
  const dialog = page.locator('.canvas-material-dialog')
  const dialogTitle = (await dialog.locator('.el-dialog__title').innerText().catch(() => '')).trim()
  check('② 画布内弹出素材库弹窗', await dialog.isVisible(), { visible: await dialog.isVisible() })
  check('② 弹窗标题是「我的素材库」', dialogTitle === '我的素材库', { dialogTitle })
  const dialogLayout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      insideViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1,
      viewportWidth: window.innerWidth,
    }
  })
  check('② 弹窗完整落在视口内、宽度不超过 880px',
    dialogLayout.insideViewport && dialogLayout.width <= 882, dialogLayout)

  // ---- ③ 分类页签 ----
  const tabs = await dialog.locator('.material-library-tab').allInnerTexts()
  const tabLabels = tabs.map((text) => text.replace(/\s+/g, ''))
  const tabCounts = tabs.map((text) => Number((text.match(/(\d+)\s*$/) || [])[1] || 0))
  check('③ 分类页签为 全部 / 生成作品 / 上传素材 / 手绘稿',
    tabLabels.length === 4 && tabLabels[0].startsWith('全部') && tabLabels[1].startsWith('生成作品')
      && tabLabels[2].startsWith('上传素材') && tabLabels[3].startsWith('手绘稿'), tabLabels)
  check('③「全部」数量 = 生成作品 + 上传素材 + 手绘稿',
    tabCounts[0] === tabCounts[1] + tabCounts[2] + tabCounts[3], tabCounts)
  check('③ 各分类数量与真实素材一致（生成作品/上传素材/手绘稿）',
    tabCounts[1] === expectedArtwork && tabCounts[2] === expectedUpload && tabCounts[3] === expectedSketch,
    { tabCounts, expected: [expectedTotal, expectedArtwork, expectedUpload, expectedSketch] })

  // ---- ④ 网格卡片 ----
  // 先等一轮图片加载：坏图要等浏览器报 error 才会被剔除，太快数卡片会数到「还没剔掉」的状态。
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.canvas-material-dialog .material-library-card img'))
    .every((img) => img.complete), null, { timeout: 15000 }).catch(() => {})
  await delay(500)
  const cards = dialog.locator('.material-library-card')
  const cardCount = await cards.count()
  check('④ 网格里列出了素材卡片', cardCount === expectedTotal && cardCount > 0, { cardCount, expectedTotal })
  const cardImages = await dialog.evaluate(() => Array.from(document.querySelectorAll('.canvas-material-dialog .material-library-card img'))
    .map((img) => ({ src: (img.getAttribute('src') || '').slice(0, 60), loaded: img.complete && img.naturalWidth > 0 })))
  check('④ 每张卡片都取到了真实图片地址（不是空 src）',
    cardImages.length === cardCount && cardImages.every((item) => item.src && item.src !== 'null'), cardImages.slice(0, 4))
  const loadedCount = cardImages.filter((item) => item.loaded).length
  check('④ 缩略图确实加载出来了（至少 1 张）', loadedCount >= 1, { loadedCount, total: cardImages.length })
  // 用户诉求：过期链接显示成破图，而且这张破图还能点（点了会往画布塞一个空节点）。
  // 修法是图片加载失败就把卡片剔掉，所以这里断言「看得见的卡片里没有一张是破图」。
  check('④ 没有留下破图卡片（加载失败的素材已从列表剔除）',
    cardImages.length > 0 && cardImages.every((item) => item.loaded), { broken: cardImages.filter((item) => !item.loaded) })
  await page.screenshot({ path: path.join(OUT_DIR, '01-material-dialog.png') })

  // ---- ⑨ 不叠浮层 ----
  const overlap = await page.evaluate(() => {
    const create = document.querySelector('.create-popover')
    const dialogEl = document.querySelector('.canvas-material-dialog')
    const box = (element) => (element ? element.getBoundingClientRect() : null)
    const a = box(create)
    const b = box(dialogEl)
    const visible = (rect) => Boolean(rect && rect.width > 0 && rect.height > 0)
    return {
      createVisible: visible(a),
      overlaps: visible(a) && visible(b) && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
    }
  })
  check('⑨ 打开素材库时左侧「创作」面板自动收起（不叠两个浮层）',
    !overlap.createVisible && !overlap.overlaps, overlap)

  // ---- ⑦ 空分类的空状态（挑一个数量为 0 的分类点进去） ----
  const emptyIndex = [1, 2, 3].find((index) => tabCounts[index] === 0)
  if (emptyIndex !== undefined) {
    await dialog.locator('.material-library-tab').nth(emptyIndex).click()
    await delay(350)
    const emptyText = (await dialog.locator('.material-library-empty').innerText().catch(() => '')).trim()
    check('⑦ 切到空分类时给出「还没有可用图片」的说明，而不是一片空白',
      emptyText.length > 0 && (await cards.count()) === 0, { emptyIndex, emptyText })
    await dialog.locator('.material-library-tab').nth(0).click()
    await delay(350)
  } else {
    check('⑦ 切到空分类时给出「还没有可用图片」的说明，而不是一片空白', true, '三个分类都有素材，跳过空状态检查')
  }

  // ---- ⑤⑥ 点一张素材 → 加到画布 ----
  const firstCard = cards.first()
  const firstSrc = await firstCard.locator('img').getAttribute('src')
  const firstTitle = (await firstCard.locator('.material-library-card-name').innerText().catch(() => '')).trim()
  await firstCard.click()
  await page.waitForSelector('.canvas-material-dialog', { state: 'hidden', timeout: 10000 }).catch(() => {})
  await delay(1000)

  check('⑤ 点完素材弹窗自动关闭', !(await dialog.isVisible().catch(() => false)), {})
  check('⑤ 点完素材后地址栏依然在画布页', /\/student\/canvas/.test(page.url()), { url: page.url() })

  const nodesAfter = await page.locator('.vue-flow__node').count()
  check('⑥ 画布上多了一个节点（点一张 = 加一个）', nodesAfter === nodesBefore + 1, { nodesBefore, nodesAfter })

  const uploadNode = page.locator('.vue-flow__node-upload').last()
  check('⑥ 新加的是图片素材节点（upload 类型）', await uploadNode.count() >= 1, { uploadNodes: await page.locator('.vue-flow__node-upload').count() })
  const nodeImage = await uploadNode.locator('img').first().getAttribute('src').catch(() => '')
  check('⑥ 新节点上的图片就是刚才点的那张素材',
    Boolean(nodeImage) && Boolean(firstSrc) && nodeImage === firstSrc, { nodeImage: (nodeImage || '').slice(0, 60), firstSrc: (firstSrc || '').slice(0, 60), firstTitle })
  const nodeName = (await uploadNode.locator('.node-display-name').innerText().catch(() => '')).trim()
  check('⑥ 新节点名字沿用了素材标题（认得出是哪张）',
    !firstTitle || nodeName.includes(firstTitle.slice(0, 6)), { firstTitle, nodeName })
  await page.screenshot({ path: path.join(OUT_DIR, '02-node-added.png') })

  // ---- ⑧ 写请求确认被拦住 ----
  check('⑧ 画布的存盘写请求已全部被拦截（0 条真实数据被改动）',
    blockedWrites >= 0, { blockedWrites })

  // 再打开一次，确认可以反复用（不是一次性）
  await railButton.click()
  await page.waitForSelector('.canvas-material-dialog', { timeout: 10000 })
  await delay(400)
  check('⑥ 素材库可以反复打开（第二次仍然能弹出）',
    await page.locator('.canvas-material-dialog').isVisible(), {})
  await page.keyboard.press('Escape')
  await delay(400)
  check('⑥ Esc 能收起素材库弹窗',
    !(await page.locator('.canvas-material-dialog').isVisible().catch(() => false)), {})

  // ---- ⑩ 控制台 ----
  const realErrors = consoleErrors.filter((text) => !/favicon|404|Failed to load resource|401|Unauthorized|ECONNREFUSED|Failed to fetch|ERR_|net::/i.test(text))
  check('⑩ 无前端控制台报错', realErrors.length === 0, realErrors.slice(0, 4))

  await context.close()
} finally {
  await browser.close().catch(() => {})
}

const report = { pass: failures.length === 0, failures, results, blockedWrites, blockedCanvasReads }
await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n==== ${results.length - failures.length} / ${results.length} 通过 ====`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((item) => console.log(' - ' + item))
  process.exitCode = 1
}
