// AI 创作台（/student/board）端到端验收脚本
// 用法：node scripts/verify-paint-board.mjs
// 依赖：playwright-core（workbuddy binaries workspace）+ ms-playwright chromium；
//      使用已在跑的 dev 服务（默认 5173 前端 / 3000 后端），不自己起服务。
//
// 覆盖：
//   ⓪ 入口：工作台「手绘板」卡片 → /student/board；老地址 /student/sketchpad 跳转；顶栏「返回」回工作台
//   ① 页面撑满视口、三栏版式到位（画板 / 496px AI 栏 / 底部提示词条）
//   ② 首屏画纸居中（画布中心像素是纸白、四角是透明舞台底）
//   ③ 画笔浮层落在 56px 工具栏右侧，11 种笔刷齐全，选笔后粗细跟随该笔刷默认值
//   ④ 真画一笔 → 撤销可用、舞台上真有墨色像素、图层缩略图有内容
//   ⑤ Ctrl+Z / Ctrl+Shift+Z 真正生效（按墨色像素数前后对比）
//   ⑥ 新建图层 / 撤销 / 重做
//   ⑦ 出图：拦截 /api/ai/image/generate 喂固定图（不真实扣费）→ 出 4 张
//   ⑧ 插回画纸：图层 +1，名字带「AI · 水彩绘本」，新层缩略图有内容
//   ⑨ 套索：拖框 → 底部变「局部参考 W×H」；顶部标题区已删、参考入口只剩底部 chip
//   ⑩ 保存作品：真调 /api/me/assets + /api/me/documents，落到「我的作品 · 手绘稿」，验收后清理这条临时记录
//   ⑪ 参考强度：0~100% 滑块 / 默认 60% / 拖到两头换成对应说明 / 提示词带上强度说明
//   ⑫ 导入到新图层：与参考强度同一排、位于 AI 大图下方、有图才可点、点后图层 +1
//   ⑬ 画纸全屏：顶栏整条 + AI 区 + 提示词条全部让位、画纸变宽变高且自动重新适配、
//      板头「退出全屏」胶囊与 Esc 两条出口都能退出还原
//   ⑭ 画纸旋转：转 90° 后尺寸标注与外框方向跟着变、绕中心不跑偏、笔迹跟着笔尖走（坐标逆变换正确）、
//      连点 4 次回正、转着保存的 PNG 也是横的（导出方向和屏幕一致）
//   ⑮ 出图模型选择：在「引用当前画布」右边同一排、默认「自动」、菜单往上弹、
//      清单来自后台真实配置、选中后请求里带对 model/provider、切回自动则不带
//   ⑯ 颜色是独立工具：点颜色只弹颜色面板（不弹画笔浮层）、不改当前工具、面板贴着按钮展开、
//      常用色 + 更多颜色 + 自定义取色齐全、选的红色画到纸上真是红的、画笔浮层「更多颜色」能跳进来
//   ⑰ 色环取色器：色环真画出了连续色相、指针指着当前色、点环换色相、色域方块能调浓淡明暗、
//      吸管取色能从面板直接切过去、吸完自动切回画笔并真吸到画纸上那一色
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const WEB = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3000'
const ACCOUNT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }
const OUT_DIR = path.join(process.cwd(), '.paint-board-verify')

const results = []
const failures = []
function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition), detail })
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 轮询等待，不做固定 sleep。 */
async function waitFor(label, fn, timeout = 15000, step = 150) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      last = await fn()
      if (last) return last
    } catch (error) {
      last = String(error?.message || error)
    }
    await delay(step)
  }
  throw new Error(`等待超时：${label}（最后结果 ${JSON.stringify(last)}）`)
}

const createdDocuments = []
/**
 * 读图层缩略图里「非白像素」的个数。
 * 缩略图只有 26×20，用 dataURL 字符串长度判断不可靠（纯色图反而更短），所以直接解码数像素。
 */
async function thumbInk(page, index = 0) {
  return page.evaluate(async (idx) => {
    const img = document.querySelectorAll('.paint-layer-row .paint-lthumb')[idx]
    if (!img || !img.src || !img.src.startsWith('data:')) return -1
    const image = new Image()
    image.src = img.src
    await image.decode().catch(() => {})
    if (!image.naturalWidth) return -2
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let ink = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) ink += 1
    }
    return ink
  }, index)
}
let browser
try {
  await mkdir(OUT_DIR, { recursive: true })

  // ---------- 0. 登录拿 Cookie ----------
  const loginResponse = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ACCOUNT),
  })
  if (!loginResponse.ok) throw new Error(`登录失败 ${loginResponse.status}`)
  const setCookie = loginResponse.headers.getSetCookie?.() || []
  const session = setCookie.map((item) => item.split(';')[0]).find((item) => item.startsWith('ai_art_session='))
  if (!session) throw new Error('登录响应里没有 ai_art_session')

  // ---------- 1. 出图夹具（固定 4 张纯色图，绝不真调上游） ----------
  const fixtureUrls = []
  for (const [index, color] of ['#4f7cf0', '#f2a03d', '#3fb98a', '#c85ad0'].entries()) {
    const buffer = await sharp({ create: { width: 480, height: 600, channels: 4, background: color } })
      .png()
      .composite([{ input: Buffer.from(`<svg width="480" height="600"><text x="240" y="310" font-size="72" text-anchor="middle" fill="#ffffff" font-family="sans-serif">${index + 1}</text></svg>`), top: 0, left: 0 }])
      .png()
      .toBuffer()
    fixtureUrls.push(`data:image/png;base64,${buffer.toString('base64')}`)
  }

  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 1 })
  await context.addCookies([{ name: 'ai_art_session', value: session.split('=')[1], url: WEB }])
  // 工作台的「手绘板」卡片只在专业版难度下出现，入口检查要先把这个开关写进本地存储。
  await context.addInitScript(() => window.localStorage.setItem('art-studio-difficulty', 'pro'))

  let upstreamCalls = 0
  // 参考强度没有对应参数可传上游，只能靠提示词里那句强度说明生效，
  // 所以每次请求的 prompt 都留档，验收时断言它确实被拼进去了。
  const sentPrompts = []
  // 底部「模型」选择器选完要真的发给服务端，所以每次请求的 model / provider 都留档。
  const sentModelBodies = []
  await context.route('**/api/ai/image/generate', async (route) => {
    upstreamCalls += 1
    const body = JSON.parse(route.request().postData() || '{}')
    sentPrompts.push(String(body.prompt || ''))
    sentModelBodies.push({ model: String(body.model || ''), provider: String(body.provider || '') })
    const count = Math.min(Math.max(Number(body.count || 1), 1), 4)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        provider: 'fixture',
        model: 'fixture-square',
        images: Array.from({ length: count }, (_, index) => ({
          id: `fixture-${index + 1}`,
          imageUrl: fixtureUrls[index % fixtureUrls.length],
          prompt: body.prompt || '',
        })),
      }),
    })
  })

  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => {
    const text = m.text()
    if (m.type() === 'error' && !/favicon|Devtools|\[Vue warn\]|Failed to load resource|ERR_|401/i.test(text)) consoleErrors.push(text)
  })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('response', async (response) => {
    if (response.url().includes('/api/me/documents') && response.request().method() === 'POST') {
      try {
        const data = await response.json()
        const id = data?.document?.id || data?.item?.id || data?.data?.id
        if (id) createdDocuments.push(id)
      } catch { /* 忽略解析失败 */ }
    }
  })

  // ---------- ⓪ 入口：工作台卡片 → 新画板；老地址跳转；返回按钮 ----------
  await page.goto(`${WEB}/student/workbench`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.orbit-card', { timeout: 30000 })
  // ⚠️ 卡片已改成「纯图方案」：卡面上不印标题、也没有「打开手绘板」按钮。
  // 名称只留在 aria-label 里（读屏用），所以定位必须走 aria-label，不能再按文字找。
  const sketchCard = page.locator('.orbit-card[aria-label^="手绘板"]').first()
  await sketchCard.scrollIntoViewIfNeeded()
  // 交互约定：点中间那张 = 进入，点左右那张 = 换到中间。
  // 手绘板不一定在中间（默认停在 AI绘画），所以先点一次切过来，确认成为当前卡再点第二次进入。
  await sketchCard.click()
  await page.waitForFunction(
    () => document.querySelector('.orbit-card[aria-label^="手绘板"]')?.classList.contains('is-center'),
    null,
    { timeout: 10000 },
  )
  check('⓪ 工作台「手绘板」卡片能被点到中间并成为当前卡', true, {})
  await sketchCard.click()
  const enteredUrl = await waitFor('点卡片后进入新画板', async () => {
    const url = page.url()
    return url.includes('/student/board') ? url : 0
  })
  check('⓪ 点「打开手绘板」直接进 /student/board（不再进老页面）', enteredUrl.includes('/student/board'), { url: enteredUrl })

  // 老地址只做跳转，学生收藏的链接不会 404
  const legacyPage = await context.newPage()
  await legacyPage.goto(`${WEB}/student/sketchpad`, { waitUntil: 'domcontentloaded' })
  const legacyUrl = await waitFor('老地址跳转', async () => (legacyPage.url().includes('/student/board') ? legacyPage.url() : 0))
  await legacyPage.close()
  check('⓪ 老地址 /student/sketchpad 自动跳到 /student/board', Boolean(legacyUrl), { url: legacyUrl })

  await page.locator('.paint-back').click()
  const backUrl = await waitFor('点返回回工作台', async () => (page.url().includes('/student/workbench') ? page.url() : 0))
  check('⓪ 顶栏「返回」能回工作台', Boolean(backUrl), { url: backUrl })

  await page.goto(`${WEB}/student/board`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.paint-app', { timeout: 30000 })
  await waitFor('画布渲染出第一帧', () => page.evaluate(() => {
    const canvas = document.querySelector('.pb-canvas')
    return Boolean(canvas && canvas.width > 100 && canvas.height > 100)
  }))
  await delay(400)

  // ---------- ① 版式 ----------
  const geo = await page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }
    }
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      app: box('.paint-app'),
      topbar: box('.paint-topbar'),
      board: box('.paint-board'),
      boardBody: box('.paint-board-body'),
      tools: box('.paint-tools'),
      stage: box('.pb-stage'),
      layers: box('.paint-layers'),
      ai: box('.paint-ai'),
      composer: box('.paint-composer'),
      brand: document.querySelector('.paint-brand strong')?.textContent?.trim() || '',
      subTitle: document.querySelector('.paint-brand-text span')?.textContent?.trim() || '',
      zoom: document.querySelector('.pb-zoom-val')?.textContent?.trim() || '',
      hints: [...document.querySelectorAll('.pb-hint')].length,
    }
  })
  check('① 页面撑满视口（fixed inset:0，无横向滚动）', geo.app && geo.app.w === geo.viewport.w && geo.app.h === geo.viewport.h && geo.scrollW <= geo.viewport.w + 1, geo)
  check('① 顶栏高度 52px', Math.abs(geo.topbar.h - 52) <= 1, geo.topbar)
  check('① 右侧 AI 栏宽 496px', Math.abs(geo.ai.w - 496) <= 2, geo.ai)
  check('① 画板与 AI 栏并排且连成一张卡（画板右边 = AI 左边，间距 0）', Math.abs(geo.board.right - geo.ai.x) <= 2, { board: geo.board, ai: geo.ai })
  check('① 工具栏 56px + 图层列 168px + 画布三者横排', Math.abs(geo.tools.w - 56) <= 2 && Math.abs(geo.layers.w - 168) <= 3 && geo.stage.w > geo.tools.w, { tools: geo.tools, layers: geo.layers, stage: geo.stage })
  check('① 底部提示词条在画板下方且整行铺满', geo.composer.y > geo.board.y + geo.board.h - 2 && geo.composer.w > geo.board.w * 0.9, geo.composer)
  check('① 品牌标题为「美佳美画 · AI 创作台」', geo.brand === '美佳美画 · AI 创作台', geo.brand)
  check('① 副标题带当前学生名', geo.subTitle.startsWith('测试2') !== false && geo.subTitle.length > 2, geo.subTitle)

  // ---------- ② 首屏画纸居中 ----------
  const paper = await page.evaluate(() => {
    const canvas = document.querySelector('.pb-canvas')
    const ctx = canvas.getContext('2d')
    const at = (x, y) => {
      const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
      return { r: d[0], g: d[1], b: d[2], a: d[3] }
    }
    return {
      size: { w: canvas.width, h: canvas.height },
      center: at(canvas.width / 2, canvas.height / 2),
      corner: at(3, 3),
    }
  })
  check('② 画布已按 DPR 放大到可视尺寸', paper.size.w > 300 && paper.size.h > 300, paper.size)
  check('② 画纸居中：画布中心像素是纸白', paper.center.a > 240 && paper.center.r > 246 && paper.center.g > 246 && paper.center.b > 246, paper.center)
  check('② 舞台四角是透明底（画纸没有铺满整个舞台）', paper.corner.a < 40, paper.corner)
  check('② 缩放百分比是数字', /^\d+%$/.test(geo.zoom), geo.zoom)

  await page.screenshot({ path: path.join(OUT_DIR, '01-first-screen.png') })

  // ---------- ③ 画笔浮层 ----------
  const brushTool = page.locator('.paint-tool').first()
  await brushTool.click()
  await page.waitForSelector('.paint-brush-pop', { timeout: 5000 })
  const popGeo = await page.evaluate(() => {
    const pop = document.querySelector('.paint-brush-pop').getBoundingClientRect()
    const tools = document.querySelector('.paint-tools').getBoundingClientRect()
    const body = document.querySelector('.paint-board-body').getBoundingClientRect()
    return {
      pop: { x: Math.round(pop.x), y: Math.round(pop.y), w: Math.round(pop.width), h: Math.round(pop.height) },
      tools: { x: Math.round(tools.x), right: Math.round(tools.right), w: Math.round(tools.width) },
      body: { x: Math.round(body.x), y: Math.round(body.y), h: Math.round(body.height) },
      brushCount: document.querySelectorAll('.paint-brush').length,
      names: [...document.querySelectorAll('.paint-brush-info b')].map((el) => el.textContent.trim()),
      sizeText: document.querySelector('.paint-bp-size-row b')?.textContent?.trim() || '',
    }
  })
  check('③ 浮层在 56px 工具栏右侧展开', popGeo.pop.x >= popGeo.tools.right - 1 && popGeo.pop.x <= popGeo.tools.right + 10, popGeo)
  check('③ 浮层不超出画板左右边界、贴着工具栏顶部', popGeo.pop.x + popGeo.pop.w < 1560 - 500 && popGeo.pop.y >= popGeo.body.y - 2, popGeo)
  check('③ 11 种笔刷齐全（水彩晕染按用户要求已去掉）', popGeo.brushCount === 11, { count: popGeo.brushCount, names: popGeo.names })
  check('③ 笔刷列表里没有「水彩晕染」', !popGeo.names.some((name) => name.includes('晕染')), popGeo.names)
  check('③ 默认铅笔粗细 7px', popGeo.sizeText === '7 px', popGeo.sizeText)

  // 选「蜡笔」→ 粗细跟随该笔刷默认 18px（浮层故意不收起，方便接着调粗细和颜色）
  await page.locator('.paint-brush', { hasText: '蜡笔' }).first().click()
  await delay(300)
  check('③ 选中笔刷后浮层保持展开（可继续调粗细/颜色）', (await page.locator('.paint-brush-pop').count()) === 1, {})
  check('③ 蜡笔变成高亮当前笔刷', (await page.locator('.paint-brush.is-active .paint-brush-info b').innerText()).trim() === '蜡笔', await page.locator('.paint-brush.is-active').innerText())
  const crayonSize = await page.locator('.paint-bp-size-row b').innerText()
  check('③ 切到蜡笔后粗细自动变 18px', crayonSize.trim() === '18 px', crayonSize)
  // 关掉浮层再画（浮层会盖住画布）
  await page.locator('.paint-bp-close').click()
  await waitFor('浮层收起', async () => (await page.locator('.paint-brush-pop').count()) === 0)

  // ---------- ④ 真画一笔 ----------
  const thumbInkBefore = await thumbInk(page, 0)
  const stageBox = await page.locator('.pb-stage').boundingBox()
  const cx = stageBox.x + stageBox.width / 2
  const cy = stageBox.y + stageBox.height / 2
  await page.mouse.move(cx - 70, cy - 30)
  await page.mouse.down()
  for (let i = 0; i <= 24; i += 1) {
    await page.mouse.move(cx - 70 + i * 5, cy - 30 + Math.sin(i / 3) * 40)
    await delay(12)
  }
  await page.mouse.up()
  await delay(400)

  const undoDisabled = await page.locator('button[title="撤销"]').isDisabled()
  check('④ 画完一笔后「撤销」可用', undoDisabled === false, { undoDisabled })
  const thumbInkAfter = await waitFor('图层缩略图出现内容', async () => {
    const ink = await thumbInk(page, 0)
    return ink > 0 ? ink : 0
  })
  check('④ 图层缩略图里真有笔迹（非白像素 > 0）', thumbInkAfter > 0 && thumbInkAfter > thumbInkBefore, { thumbInkBefore, thumbInkAfter })
  check('④ 保存状态变「未保存」', (await page.locator('.paint-save-state').innerText()).includes('未保存'), await page.locator('.paint-save-state').innerText())

  const inkPixels = await page.evaluate(() => {
    const canvas = document.querySelector('.pb-canvas')
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let dark = 0
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200 && data[i] < 140 && data[i + 1] < 140) dark += 1
    return dark
  })
  check('④ 舞台上真的出现了笔画像素', inkPixels > 300, { inkPixels })

  // ---------- ⑤ 快捷键撤销 / 重做（趁历史里只有刚才那一笔） ----------
  const countInk = () => page.evaluate(() => {
    const canvas = document.querySelector('.pb-canvas')
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let dark = 0
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200 && data[i] < 140 && data[i + 1] < 140) dark += 1
    return dark
  })
  await page.locator('.paint-board-head').click({ position: { x: 6, y: 6 } })
  const inkBefore = await countInk()
  await page.keyboard.press('Control+z')
  await delay(500)
  const inkAfterUndo = await countInk()
  check('⑤ Ctrl+Z 真的把笔画撤掉了（墨色像素明显减少）', inkAfterUndo < inkBefore * 0.5, { inkBefore, inkAfterUndo })
  await page.keyboard.press('Control+Shift+z')
  await delay(500)
  const inkAfterRedo = await countInk()
  check('⑤ Ctrl+Shift+Z 把笔画恢复了', inkAfterRedo > inkAfterUndo * 2, { inkAfterUndo, inkAfterRedo })

  // ---------- ⑥ 图层新建 / 撤销 / 重做 ----------
  const layersBefore = await page.locator('.paint-layer-row').count()
  await page.locator('.paint-layers-foot button').first().click()
  const layersAfter = await waitFor('新建图层后行数 +1', async () => {
    const count = await page.locator('.paint-layer-row').count()
    return count === layersBefore + 1 ? count : 0
  })
  check('⑥ 新建图层后列表 +1', layersAfter === layersBefore + 1, { layersBefore, layersAfter })
  check('⑥ 新图层自动成为当前层且名字带「图层」', (await page.locator('.paint-layer-row.is-active .paint-lname').first().innerText()).includes('图层'), await page.locator('.paint-layer-row.is-active').first().innerText())

  await page.locator('button[title="撤销"]').click()
  await delay(400)
  check('⑥ 撤销后「重做」可用', (await page.locator('button[title="重做"]').isDisabled()) === false, {})
  await page.locator('button[title="重做"]').click()
  await delay(400)
  check('⑥ 重做后图层回来', (await page.locator('.paint-layer-row').count()) === layersBefore + 1, {})

  // 轻提示不能盖住缩放条和「新建/删除」按钮（toast 是 fixed 定位，很容易压到右下控件上）
  const toastOverlap = await page.evaluate(() => {
    const toast = document.querySelector('.paint-toast')
    if (!toast) return { skipped: true }
    const t = toast.getBoundingClientRect()
    const targets = { zoombar: '.pb-zoombar', layersFoot: '.paint-layers-foot', composer: '.paint-prompt-bar' }
    const hits = []
    for (const [name, selector] of Object.entries(targets)) {
      const el = document.querySelector(selector)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const overlap = !(t.right < r.left || t.left > r.right || t.bottom < r.top || t.top > r.bottom)
      if (overlap) hits.push(name)
    }
    return { hits, toast: { top: Math.round(t.top), bottom: Math.round(t.bottom) } }
  })
  check('⑥ 轻提示不压住缩放条 / 图层按钮 / 提示词条', (toastOverlap.skipped || toastOverlap.hits.length === 0), toastOverlap)

  // ---------- ⑦ 出图（拦截，不真实扣费） ----------
  await page.locator('.paint-style-chip', { hasText: '水彩绘本' }).first().click()
  await page.locator('.paint-prompt-input').fill('小屋、黄昏、有雾')
  await page.locator('.paint-gen-btn').click()
  const resultCount = await waitFor('出图结果渲染', async () => {
    const count = await page.locator('.paint-result-main img').count()
    return count >= 1 ? count : 0
  }, 20000)
  check('⑦ 请求方打到 /api/ai/image/generate 一次', upstreamCalls === 1, { upstreamCalls })
  check('⑦ 主图有内容（img 有 src）', (await page.locator('.paint-result-main img').getAttribute('src'))?.startsWith('data:image/'), {})
  check('⑦ 只出 1 张大图（没有 2/3/4 缩略图）', resultCount === 1 && (await page.locator('.paint-result-thumbs').count()) === 0, { resultCount })
  check('⑦ 底部显示「本次生成 1 张」', (await page.locator('.paint-count').innerText()).includes('本次生成 1 张'), await page.locator('.paint-count').innerText())
  check('⑦ 提示词输入框的值没被清掉', (await page.locator('.paint-prompt-input').inputValue()) === '小屋、黄昏、有雾', {})
  await page.screenshot({ path: path.join(OUT_DIR, '02-generated.png') })

  // ---------- ⑧ 插回画纸 ----------
  const layersBeforeInsert = await page.locator('.paint-layer-row').count()
  await page.locator('.paint-result-main .paint-rtools span').first().click()
  const inserted = await waitFor('插回后图层 +1', async () => {
    const count = await page.locator('.paint-layer-row').count()
    return count === layersBeforeInsert + 1 ? count : 0
  }, 20000)
  check('⑧ 插回画纸后图层 +1', inserted === layersBeforeInsert + 1, { layersBeforeInsert, inserted })
  const topName = await page.locator('.paint-layer-row').first().innerText()
  check('⑧ 新图层名字是「AI · 水彩绘本」且在列表最上面', topName.includes('AI') && topName.includes('水彩绘本'), topName)
  const aiThumbInk = await waitFor('AI 图层缩略图有内容', async () => {
    const ink = await thumbInk(page, 0)
    return ink > 0 ? ink : 0
  }, 15000)
  // 缩略图 26×20 按画纸比例等比内接（480×600 → 16×20 = 320 格），整幅 AI 图应几乎填满这 320 格
  check('⑧ AI 图层缩略图是整幅图（非白像素铺满缩略图内接区）', aiThumbInk >= 300, { aiThumbInk })
  await page.screenshot({ path: path.join(OUT_DIR, '03-inserted.png') })

  // ---------- ⑨ 套索 ----------
  await page.locator('.paint-tool[title^="套索"]').click()
  await page.mouse.move(cx - 90, cy - 60)
  await page.mouse.down()
  await page.mouse.move(cx - 30, cy - 10, { steps: 6 })
  await page.mouse.move(cx + 40, cy + 50, { steps: 6 })
  await page.mouse.up()
  await waitFor('套索框出现在画布上', async () => (await page.locator('.pb-lasso').count()) === 1)
  const lassoText = await page.locator('.paint-ref-chip').innerText()
  check('⑨ 底部 chip 变「局部参考 · W×H」', /局部参考 · \d+×\d+/.test(lassoText), lassoText)
  // 顶部「AI 生成 / 灵感加速 / 参考画纸」标题区已按老师要求整块删掉（11-05），
  // 参考画纸的唯一入口就是底部 chip，这里防它被加回来、也防参考能力丢失。
  const headGone = await page.locator('.paint-ai-head, .paint-ref-pill').count()
  check('⑨ 顶部标题区已删除，参考入口只剩底部 chip', headGone === 0 && (await page.locator('.paint-ref-chip').count()) === 1, { headGone })
  await page.screenshot({ path: path.join(OUT_DIR, '04-lasso.png') })
  // 取消框选
  await page.locator('.paint-ref-chip').click()
  await waitFor('框选被取消', async () => (await page.locator('.pb-lasso').count()) === 0)
  check('⑨ 点 chip 可取消框选并回到「已引用当前画布」', (await page.locator('.paint-ref-chip').innerText()).includes('引用当前画布'), await page.locator('.paint-ref-chip').innerText())

  // ---------- ⑩ 保存 ----------
  await page.locator('.paint-bh-tag').click()
  await page.waitForSelector('.paint-bh-input')
  const saveTitle = `验收临时作品-${Date.now().toString(36)}`
  await page.locator('.paint-bh-input').fill(saveTitle)
  await page.locator('.paint-bh-input').press('Enter')
  await waitFor('标题改成功', async () => (await page.locator('.paint-bh-tag').innerText()).trim() === saveTitle)
  check('⑩ 画纸标题可点击改名', (await page.locator('.paint-bh-tag').innerText()).trim() === saveTitle, saveTitle)

  await page.locator('.paint-ghost').click()
  const toast = await waitFor('保存成功提示出现', async () => {
    const text = await page.locator('.paint-toast').innerText().catch(() => '')
    return text.includes('已保存') ? text : ''
  }, 30000)
  check('⑩ 保存后提示「已保存到我的作品 · 手绘稿」', toast.includes('我的作品'), toast)
  const saveState = await page.locator('.paint-save-state').innerText()
  check('⑩ 顶栏保存状态变「已保存」', saveState.includes('已保存'), saveState)

  // 服务端确实多了一条 sketch 文档
  await delay(300)
  const docsResponse = await fetch(`${WEB}/api/me/documents?type=sketch`, { headers: { Cookie: session } })
  const docsPayload = await docsResponse.json().catch(() => ({}))
  const docList = docsPayload.documents || docsPayload.items || docsPayload.data || []
  const matched = Array.isArray(docList) ? docList.find((item) => item.title === saveTitle) : null
  check('⑩ 服务端「我的作品」里能查到这条手绘稿', Boolean(matched), { saveTitle, total: Array.isArray(docList) ? docList.length : -1 })
  if (matched?.id) createdDocuments.push(matched.id)

  await page.screenshot({ path: path.join(OUT_DIR, '05-saved.png') })

  // ---------- ⑪ 参考强度：0~100% 滑块（上游没有 strength 参数，只能靠提示词 + 参考图分辨率） ----------
  const strengthRange = page.locator('.paint-strength-range')
  const strengthVal = () => page.locator('.paint-strength-val').innerText()
  const strengthHint = () => page.locator('.paint-strength-hint').innerText()
  /** 拖滑块：range 用 fill 不触发 input，直接改值再发事件 */
  async function setStrength(pct) {
    await strengthRange.evaluate((el, value) => {
      el.value = String(value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, pct)
    await waitFor(`参考强度拖到 ${pct}%`, async () => (await strengthVal()).trim() === `${pct}%`)
  }

  check('⑪ 参考强度是一个 0~100 的滑块', await strengthRange.isVisible()
    && (await strengthRange.getAttribute('min')) === '0'
    && (await strengthRange.getAttribute('max')) === '100',
    { min: await strengthRange.getAttribute('min'), max: await strengthRange.getAttribute('max') })
  check('⑪ 默认停在 60%', (await strengthVal()).trim() === '60%', await strengthVal())
  const mediumHint = await strengthHint()
  check('⑪ 默认是「半参考」那套说明', mediumHint.includes('留大致构图'), mediumHint)
  // ⑦ 那次出图用的就是默认值，说明文字应该已经拼进提示词
  check('⑪ 默认强度的说明进了请求提示词', (sentPrompts[0] || '').includes('大致位置和画面结构'), (sentPrompts[0] || '').slice(0, 160))

  await setStrength(0)
  const looseHint = await strengthHint()
  check('⑪ 拖到 0% 换成「自由发挥」说明', looseHint.includes('只借题材') && looseHint !== mediumHint, { looseHint, mediumHint })

  await setStrength(100)
  const tightHint = await strengthHint()
  check('⑪ 拖到 100% 换成「照着画」说明', tightHint.includes('位置和线条') && tightHint !== looseHint, { looseHint, tightHint })

  await page.locator('.paint-prompt-input').fill('一只小猫')
  await page.locator('.paint-gen-btn').click()
  await waitFor('第二次出图请求发出', async () => upstreamCalls >= 2, 20000)
  const tightPrompt = sentPrompts[sentPrompts.length - 1] || ''
  check('⑪ 100% 时请求提示词带「不要移动、删减或新增主要物体」', tightPrompt.includes('不要移动、删减或新增主要物体'), tightPrompt.slice(0, 200))
  check('⑪ 提示词里仍然保留学生自己写的字', tightPrompt.includes('一只小猫'), tightPrompt.slice(0, 200))
  await setStrength(60)

  // ---------- ⑫ 导入到新图层（和参考强度同一排，平板没 hover 也点得到） ----------
  const importBtn = page.locator('.paint-import-btn')
  check('⑫ 「导入到新图层」按钮常驻可见', await importBtn.isVisible(), {})
  check('⑫ 有生成结果时可点', await importBtn.isEnabled(), {})
  const importBox = await importBtn.boundingBox()
  const rangeBox = await strengthRange.boundingBox()
  check('⑫ 它排在参考强度左边、同一排', Boolean(importBox && rangeBox)
    && importBox.x + importBox.width <= rangeBox.x + 2
    && Math.abs((importBox.y + importBox.height / 2) - (rangeBox.y + rangeBox.height / 2)) <= 4,
    { importBox, rangeBox })
  // 老师指定：这一排要落在 AI 大图**下面**（看完图、再往下走一步决定贴不贴）
  const thumbsBox = await page.locator('.paint-result-main').boundingBox()
  const rowBox = await page.locator('.paint-strength-row').boundingBox()
  check('⑫ 整排位于 AI 大图下方', Boolean(thumbsBox && rowBox)
    && rowBox.y >= thumbsBox.y + thumbsBox.height - 1, { thumbsBox, rowBox })
  check('⑫ 这一排没有被面板底部裁掉', Boolean(rowBox)
    && await page.locator('.paint-ai-body').evaluate((el, y) => {
      const r = el.getBoundingClientRect()
      return y <= r.bottom + 1
    }, rowBox.y + rowBox.height), { rowBox })
  const layersBeforeBigBtn = await page.locator('.paint-layer-row').count()
  await importBtn.click()
  const layersAfterBigBtn = await waitFor('点导入后图层 +1', async () => {
    const count = await page.locator('.paint-layer-row').count()
    return count === layersBeforeBigBtn + 1 ? count : 0
  }, 20000)
  check('⑫ 点「导入到新图层」后图层 +1', layersAfterBigBtn === layersBeforeBigBtn + 1, { layersBeforeBigBtn, layersAfterBigBtn })
  const bigBtnLayerName = await page.locator('.paint-layer-row').first().innerText()
  check('⑫ 新图层名字带 AI', bigBtnLayerName.includes('AI'), bigBtnLayerName)
  await page.screenshot({ path: path.join(OUT_DIR, '06-insert-button.png') })

  // ---------- ⑬ 画纸全屏（CSS class 切换，不是 Fullscreen API——iPad Safari 不支持） ----------
  const boardBeforeFocus = await page.locator('.paint-board').boundingBox()
  const readZoom = () => page.evaluate(() => Number(String(document.querySelector('.pb-zoom-val')?.textContent || '').replace('%', '')) || 0)
  const zoomBeforeFocus = await readZoom()
  const focusBtn = page.locator('.paint-focus-btn')
  check('⑬ 顶栏右上角有画纸全屏按钮', await focusBtn.isVisible(), {})
  await focusBtn.click()
  await waitFor('进入全屏态', async () => (await page.locator('.paint-app.is-canvas-focus').count()) > 0)
  check('⑬ 全屏后右栏 AI 区让位', await page.locator('.paint-ai').isHidden(), {})
  check('⑬ 全屏后底部提示词条让位', await page.locator('.paint-composer').isHidden(), {})
  const boardFocus = await waitFor('画纸区变宽', async () => {
    const box = await page.locator('.paint-board').boundingBox()
    return box && box.width > boardBeforeFocus.width + 150 ? box : 0
  }, 8000)
  check('⑬ 全屏后画纸区变宽变高', boardFocus.width > boardBeforeFocus.width && boardFocus.height > boardBeforeFocus.height, {
    before: { w: Math.round(boardBeforeFocus.width), h: Math.round(boardBeforeFocus.height) },
    after: { w: Math.round(boardFocus.width), h: Math.round(boardFocus.height) },
  })
  // 尺寸变了画布组件只重算像素、不会自己重新居中，必须由 fitOnNextResize 在尺寸回填后补一次适配。
  // 这里不能拿 canvas 的宽度当「纸变大了」的证据——canvas 元素本来就和舞台一样大，纸是画在里面的。
  // 于是按「适应屏幕」的算法反推应有的缩放，再看实际读数：一旦按旧舞台尺寸算，读数就会明显偏小。
  const fitInfo = await page.evaluate(() => {
    const stage = document.querySelector('.pb-stage').getBoundingClientRect()
    const sizeText = document.querySelector('.paint-bh-size')?.textContent || ''
    const match = sizeText.match(/(\d+)\s*[×x]\s*(\d+)/)
    const zoomText = document.querySelector('.pb-zoom-val')?.textContent || ''
    return {
      stage: { w: Math.round(stage.width), h: Math.round(stage.height) },
      doc: match ? { w: Number(match[1]), h: Number(match[2]) } : null,
      zoom: Number(String(zoomText).replace('%', '')) || 0,
    }
  })
  const fitPad = Math.min(64, Math.max(24, Math.round(Math.min(fitInfo.stage.w, fitInfo.stage.h) * 0.09)))
  const expectedZoom = fitInfo.doc ? Math.round(Math.min(
    (fitInfo.stage.w - fitPad * 2) / fitInfo.doc.w,
    (fitInfo.stage.h - fitPad * 2) / fitInfo.doc.h,
  ) * 100) : 0
  check('⑬ 全屏后画纸按新舞台重新适配（缩放读数与适应算法一致）', Math.abs(fitInfo.zoom - expectedZoom) <= 1, { ...fitInfo, expectedZoom })
  check('⑬ 全屏后画纸比全屏前更大', fitInfo.zoom > zoomBeforeFocus, { zoomBeforeFocus, after: fitInfo.zoom })

  // 全屏 = 干净画纸：整条顶栏（返回 / 标题 / 保存 / 头像）必须藏起来，
  // 只剩「我的画纸」那条板头和工具栏。出口靠板头右上的橙色「退出全屏」胶囊 + Esc。
  const topbarInFocus = await page.evaluate(() => {
    const bar = document.querySelector('.paint-topbar')
    const back = document.querySelector('.paint-back')
    const head = document.querySelector('.paint-board-head')
    if (!bar || !back || !head) return null
    const headRect = head.getBoundingClientRect()
    // 板头本身的 y 一定贴 0（padding 算在盒子内），要看的是里面那排内容离屏幕顶多远
    const inner = head.firstElementChild?.getBoundingClientRect()
    return {
      topbarDisplay: getComputedStyle(bar).display,
      topbarVisible: bar.getBoundingClientRect().height > 0 && back.getBoundingClientRect().height > 0,
      headY: Math.round(headRect.y),
      headInnerY: Math.round(inner?.y ?? -1),
      headH: Math.round(headRect.height),
      viewportH: window.innerHeight,
      overflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }
  })
  check('⑬ 全屏后顶栏整条隐藏（返回/保存/头像都不占位）', Boolean(topbarInFocus)
    && topbarInFocus.topbarDisplay === 'none'
    && !topbarInFocus.topbarVisible, topbarInFocus)
  check('⑬ 全屏后板头内容不贴屏幕最上沿且整页无溢出', Boolean(topbarInFocus)
    && topbarInFocus.headInnerY >= 4
    && topbarInFocus.headH >= 32
    && topbarInFocus.overflowY <= 0, topbarInFocus)
  const exitFocusBtn = page.locator('.paint-focus-btn.is-on')
  check('⑬ 全屏时板头按钮变成带文字的「退出全屏」', await exitFocusBtn.isVisible()
    && (await exitFocusBtn.innerText()).includes('退出全屏'), { text: (await exitFocusBtn.innerText()).trim() })
  await page.screenshot({ path: path.join(OUT_DIR, '07-focus-on.png') })

  // 出口一：板头那个橙色胶囊
  await exitFocusBtn.click()
  const exitedByButton = await waitFor('点「退出全屏」退出', async () => (await page.locator('.paint-app:not(.is-canvas-focus)').count()) > 0, 8000).catch(() => 0)
  check('⑬ 板头「退出全屏」按钮能退出并让顶栏与 AI 区回来', Boolean(exitedByButton)
    && await page.locator('.paint-ai').isVisible()
    && await page.locator('.paint-topbar').isVisible(), {})

  // 出口二：Esc（再进一次全屏）
  await page.locator('.paint-focus-btn').click()
  await waitFor('再次进入全屏态', async () => (await page.locator('.paint-app.is-canvas-focus').count()) > 0)
  await page.locator('.paint-focus-btn.is-on').waitFor({ state: 'visible', timeout: 5000 })
  await page.keyboard.press('Escape')
  await waitFor('Esc 退出全屏', async () => (await page.locator('.paint-app:not(.is-canvas-focus)').count()) > 0)
  const boardRestored = await page.locator('.paint-board').boundingBox()
  const zoomRestored = await waitFor('退出全屏后缩放回到原样', async () => {
    const zoom = await readZoom()
    return zoom === zoomBeforeFocus ? zoom : 0
  }, 4000).catch(() => readZoom())
  check('⑬ Esc 能退出全屏并还原版式', Math.abs(boardRestored.width - boardBeforeFocus.width) < 8 && await page.locator('.paint-ai').isVisible() && zoomRestored === zoomBeforeFocus, {
    before: Math.round(boardBeforeFocus.width),
    restored: Math.round(boardRestored.width),
    zoomBeforeFocus,
    zoomRestored,
  })
  await page.screenshot({ path: path.join(OUT_DIR, '08-focus-off.png') })

  // ---------- ⑭ 画纸旋转（只转看的方向，笔迹坐标要逆着转回去） ----------
  /**
   * 读舞台自己报出来的纸外框 `data-paper-rect`（x,y,w,h，相对舞台左上角，CSS px）。
   * ⚠️ 早先版本是截图扫「接近纯白」像素求包围盒，结果把右下角白色缩放条、白底提示条
   * 一起算了进去，竖纸能被量成 767×427。纸的真实位置只有舞台自己知道，别再猜。
   */
  async function paperBox(label) {
    const rect = await waitFor(`读到纸外框（${label}）`, async () => {
      const raw = await page.locator('.pb-stage').getAttribute('data-paper-rect')
      if (!raw) return 0
      const [x, y, w, h] = raw.split(',').map(Number)
      if (!(w > 0 && h > 0)) return 0
      return { x, y, w, h }
    }, 4000).catch(() => null)
    const stageLayout = await page.locator('.pb-stage').boundingBox()
    return {
      x: rect?.x ?? 0,
      y: rect?.y ?? 0,
      w: rect?.w ?? 0,
      h: rect?.h ?? 0,
      stageW: Math.round(stageLayout?.width || 0),
      stageH: Math.round(stageLayout?.height || 0),
    }
  }

  const rotateBtn = page.locator('.pb-zrot')
  const toolRotateBtn = page.locator('.paint-rot-btn')
  const rotDeg = page.locator('.paint-rot-deg')
  const sizeLabel = page.locator('.paint-bh-size')
  check('⑭ 缩放条上有画纸旋转按钮', await rotateBtn.isVisible(), {})
  // 左侧工具栏是最显眼的入口（用户原话：「这个按钮太隐蔽了，直接加在左侧工具栏里」）
  check('⑭ 左侧工具栏上也有画纸旋转按钮', await toolRotateBtn.isVisible(), {})
  check('⑭ 正向时左侧旋转按钮不挂角度角标（不干扰视觉）', (await rotDeg.count()) === 0, {})
  const verticalPaper = await paperBox('0')
  check('⑭ 旋转前纸是竖的 480 × 600', (await sizeLabel.innerText()).trim() === '480 × 600'
    && verticalPaper.h > verticalPaper.w, { label: (await sizeLabel.innerText()).trim(), box: verticalPaper })

  await toolRotateBtn.click()
  await waitFor('转 90° 后尺寸标注变化', async () => (await sizeLabel.innerText()).trim() === '600 × 480')
  check('⑭ 点一次转 90°，板头尺寸变成 600 × 480', (await sizeLabel.innerText()).trim() === '600 × 480', await sizeLabel.innerText())
  const degText = await waitFor('左侧按钮挂出角度角标', async () => {
    const text = await rotDeg.innerText().catch(() => '')
    return text.includes('90') ? text.trim() : 0
  }, 4000).catch(() => '')
  check('⑭ 转过之后左侧按钮显示 90° 角标（一眼看出当前是横的）', degText === '90°', { degText })

  const horizontalPaper = await waitFor('纸在屏幕上横过来', async () => {
    const box = await paperBox('90')
    return box.w > box.h ? box : 0
  }, 8000).catch(() => paperBox('90'))
  check('⑭ 屏幕上画纸真的横过来了（外框宽 > 高）', horizontalPaper.w > horizontalPaper.h, {
    before: { w: verticalPaper.w, h: verticalPaper.h },
    after: { w: horizontalPaper.w, h: horizontalPaper.h },
  })
  const paperCentreOffset = Math.abs((horizontalPaper.x + horizontalPaper.w / 2) - horizontalPaper.stageW / 2)
  check('⑭ 转完仍然居中（绕纸中心转，没跑到一边）', paperCentreOffset <= 8, { paperCentreOffset })
  await page.screenshot({ path: path.join(OUT_DIR, '09-rotate-90.png') })

  // 笔迹方向：屏幕上横着拖一笔，纸转 90° 后落到纸上应该是竖的。
  // 这是旋转「数学对不对」唯一的硬证据——坐标不逆变换的话，笔会歪 90° 甚至跑到纸外。
  // 判定方式：同一块舞台截两帧做像素差，只有这一笔会变，包围盒的宽高比就是笔迹方向。
  async function stageRaw(label) {
    const file = path.join(OUT_DIR, `tmp-stage-${label}.png`)
    await page.locator('.pb-stage').screenshot({ path: file })
    return sharp(file).raw().toBuffer({ resolveWithObject: true })
  }
  // ⚠️ ⑨ 段把工具切成了套索，套索状态下拖鼠标只会圈框、不会落笔——diff 恒为 0。
  // 这里必须切回画笔，否则这个断言永远失败，而且失败原因看起来像「旋转数学算错了」。
  await page.locator('.paint-tool[title^="画笔"]').click()
  await page.waitForSelector('.paint-brush-pop', { timeout: 5000 })
  await page.locator('.paint-bp-close').click()
  await waitFor('画笔浮层收起', async () => (await page.locator('.paint-brush-pop').count()) === 0)
  await page.locator('.paint-more-wrap .paint-icon-btn').click()
  await page.locator('.paint-more-menu button', { hasText: '清空当前图层' }).click()
  await waitFor('提示条消失再截图（免得把 toast 算进差异）', async () => (await page.locator('.paint-toast').count()) === 0, 8000).catch(() => 0)
  await delay(200)
  const beforeStroke = await stageRaw('before-stroke')
  const strokeStageBox = await page.locator('.pb-stage').boundingBox()
  const strokeCx = strokeStageBox.x + strokeStageBox.width / 2
  const strokeCy = strokeStageBox.y + strokeStageBox.height / 2
  await page.mouse.move(strokeCx - 45, strokeCy)
  await page.mouse.down()
  await page.mouse.move(strokeCx, strokeCy, { steps: 10 })
  await page.mouse.move(strokeCx + 45, strokeCy, { steps: 10 })
  await page.mouse.up()
  await delay(320)
  const afterStroke = await stageRaw('after-stroke')
  const strokeShape = (() => {
    const { data, info } = afterStroke
    const prev = beforeStroke.data
    let minX = info.width
    let minY = info.height
    let maxX = -1
    let maxY = -1
    let ink = 0
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const i = (y * info.width + x) * info.channels
        const delta = Math.abs(data[i] - prev[i]) + Math.abs(data[i + 1] - prev[i + 1]) + Math.abs(data[i + 2] - prev[i + 2])
        if (delta > 90) {
          ink += 1
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    return {
      ink,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      shotW: info.width,
      shotH: info.height,
    }
  })()
  /**
   * 判定口径：「笔尖在哪儿，墨就落在哪儿」。
   *
   * 屏幕上是横着拖的，所以正确的表现是**屏幕上也是横的一道**——纸转的是「看的方向」，
   * 墨跟着指针走才对。只有坐标没做逆变换（或者做了正向变换）时，墨才会歪成竖的。
   * 同时要求落墨中心就在拖拽起点附近，否则说明转完之后偏了一截（绕错了轴）。
   */
  const shotScale = strokeShape.shotW ? strokeShape.shotW / strokeStageBox.width : 1
  const inkCentreOffsetX = Math.abs(strokeShape.cx / shotScale - strokeStageBox.width / 2)
  const inkCentreOffsetY = Math.abs(strokeShape.cy / shotScale - strokeStageBox.height / 2)
  check('⑭ 转 90° 时屏幕横着拖一笔，墨跟着笔尖走（屏幕上仍是横的，没歪成竖的）',
    strokeShape.ink > 40 && strokeShape.w > strokeShape.h * 1.5, strokeShape)
  check('⑭ 转 90° 落墨位置就在笔尖下（绕纸中心转，没偏到一边）',
    inkCentreOffsetX <= 12 && inkCentreOffsetY <= 12, { inkCentreOffsetX, inkCentreOffsetY, shotScale })

  // 转满一圈必须回到原位
  for (let i = 0; i < 3; i += 1) {
    await rotateBtn.click()
    await delay(220)
  }
  await waitFor('转满 4 次回到 0°', async () => (await sizeLabel.innerText()).trim() === '480 × 600')
  check('⑭ 连点 4 次转回正向 480 × 600', (await sizeLabel.innerText()).trim() === '480 × 600', await sizeLabel.innerText())
  // 两个入口（左侧工具栏 / 缩放条）都要能转，混着点也要对得上
  await waitFor('转回正向角标消失', async () => (await rotDeg.count()) === 0, 4000).catch(() => 0)
  check('⑭ 转回正向后左侧按钮的 90° 角标消失', (await rotDeg.count()) === 0, { count: await rotDeg.count() })

  // 保存出去的图必须和屏幕上看到的方向一致：转 90° 时存下来的 PNG 应该是 600×480
  let sketchAsset = null
  const captureAsset = (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/me/assets')) {
      try {
        const payload = JSON.parse(request.postData() || '{}')
        if (payload?.kind === 'sketch' && payload?.base64) sketchAsset = payload.base64
      } catch { /* 忽略 */ }
    }
  }
  page.on('request', captureAsset)
  await rotateBtn.click()
  await waitFor('再次转到 90°', async () => (await sizeLabel.innerText()).trim() === '600 × 480')
  await page.locator('.paint-ghost').click()
  await waitFor('横向保存完成', async () => (await page.locator('.paint-toast').innerText().catch(() => '')).includes('已保存'), 30000)
  page.off('request', captureAsset)
  const pngSize = (() => {
    if (!sketchAsset) return null
    const raw = sketchAsset.includes(',') ? sketchAsset.split(',')[1] : sketchAsset
    const head = Buffer.from(raw.slice(0, 64), 'base64')
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
  })()
  check('⑭ 转 90° 保存的 PNG 也是横的 600×480（导出方向和屏幕一致）', pngSize?.width === 600 && pngSize?.height === 480, pngSize)
  await rotateBtn.click()
  await waitFor('转回正向收尾', async () => (await sizeLabel.innerText()).trim() === '480 × 600')

  // ---------- ⑮ 出图模型选择：紧跟在「引用当前画布」后面、默认自动、能换、选完真的发给服务端 ----------
  const modelChip = page.locator('.paint-model-chip')
  const refChip = page.locator('.paint-ref-chip').first()
  await waitFor('底部提示词条出现「出图模型」下拉', async () => (await modelChip.count()) === 1, 8000)
  const modelChipBox = await modelChip.boundingBox()
  const refChipBox = await refChip.boundingBox()
  check('⑮ 底部提示词条里有「出图模型」下拉，就在「引用当前画布」右边同一排',
    Boolean(modelChipBox) && Boolean(refChipBox) &&
      modelChipBox.x >= refChipBox.x + refChipBox.width - 1 &&
      Math.abs(modelChipBox.y - refChipBox.y) <= 6,
    { modelChipBox, refChipBox })
  check('⑮ 默认显示「自动」（跟随后台默认，和加这个功能之前的行为一致）',
    (await page.locator('.paint-model-name').innerText()).trim() === '自动',
    await page.locator('.paint-model-name').innerText())

  await modelChip.click()
  await waitFor('模型菜单展开', async () => (await page.locator('.paint-model-menu').count()) === 1, 6000)
  const menuBox = await page.locator('.paint-model-menu').boundingBox()
  check('⑮ 菜单往上弹（这条横栏贴着页面底边，往下弹会被屏幕裁掉）',
    Boolean(menuBox) && menuBox.y + menuBox.height <= modelChipBox.y + 2, { menuBox, chip: modelChipBox })
  const modelItems = page.locator('.paint-model-menu .paint-model-item')
  const modelItemCount = await modelItems.count()
  check('⑮ 清单来自后台真实配置（「自动」+ 至少一个配了 Key 的图像模型）',
    modelItemCount >= 2, { modelItemCount, texts: await modelItems.allInnerTexts() })

  // 选第一台真实平台（跳过第 1 条「自动」）
  const pickedText = (await modelItems.nth(1).innerText()).replace(/\s+/g, ' ').trim()
  const pickedModelName = (await modelItems.nth(1).locator('b').innerText()).trim()
  const pickedProviderLabel = (await modelItems.nth(1).locator('em').innerText()).trim()
  await modelItems.nth(1).click()
  await waitFor('选完菜单自动收起', async () => (await page.locator('.paint-model-menu').count()) === 0, 6000)
  check('⑮ 选中后按钮上的名字换成所选模型（不再是「自动」）',
    (await page.locator('.paint-model-name').innerText()).trim() === pickedModelName,
    { chip: await page.locator('.paint-model-name').innerText(), pickedText, pickedProviderLabel })

  // 真正发一次请求，确认 model / provider 被带到服务端（拦截在本地，不扣费）
  await page.locator('.paint-prompt-input').fill('验收用：换模型后出图')
  const callsBefore = sentModelBodies.length
  await page.locator('.paint-gen-btn').click()
  await waitFor('换模型后的出图请求打到 /api/ai/image/generate',
    async () => sentModelBodies.length > callsBefore, 20000)
  const sentAfterPick = sentModelBodies[sentModelBodies.length - 1]
  check('⑮ 选中的模型名真的随请求发给服务端（没被悄悄退回默认模型）',
    sentAfterPick.model === pickedModelName && sentAfterPick.model !== '',
    { sent: sentAfterPick, pickedModelName, pickedProviderLabel })

  // 切回「自动」，请求里不带模型名，仍走后台默认
  await waitFor('出图结束、可以再次操作', async () => (await page.locator('.paint-gen-btn').isDisabled()) === false, 30000)
  await modelChip.click()
  await waitFor('菜单再次展开', async () => (await page.locator('.paint-model-menu').count()) === 1, 6000)
  await page.locator('.paint-model-menu .paint-model-item').first().click()
  await waitFor('切回自动', async () => (await page.locator('.paint-model-name').innerText()).trim() === '自动', 6000)
  check('⑮ 可以切回「自动」', (await page.locator('.paint-model-name').innerText()).trim() === '自动', {})

  const callsBeforeAuto = sentModelBodies.length
  await page.locator('.paint-gen-btn').click()
  await waitFor('切回自动后的出图请求', async () => sentModelBodies.length > callsBeforeAuto, 20000)
  check('⑮ 选「自动」时请求里不带模型名（服务端按后台默认挑）',
    sentModelBodies[sentModelBodies.length - 1].model === '', sentModelBodies[sentModelBodies.length - 1])

  const composerOverflow = await page.evaluate(() => {
    const bar = document.querySelector('.paint-prompt-bar')
    if (!bar) return null
    return { scrollW: bar.scrollWidth, clientW: bar.clientWidth }
  })
  check('⑮ 加了模型下拉后底部提示词条没有横向溢出',
    Boolean(composerOverflow) && composerOverflow.scrollW <= composerOverflow.clientW + 1, composerOverflow)

  // ---------- ⑯ 颜色是独立工具（以前点颜色弹出来的是画笔浮层，用户报的 BUG） ----------
  const colorBtn = page.locator('.paint-color-btn')
  await waitFor('工具栏上有独立的颜色入口', async () => (await colorBtn.count()) === 1, 6000)
  const brushToolBtn = page.locator('.paint-tool[title^="画笔"]')

  // 先把工具切到橡皮：换颜色不该顺手把当前工具改掉
  await page.locator('.paint-tool[title^="橡皮"]').click()
  await waitFor('切到橡皮', async () => ((await page.locator('.paint-tool.is-active').getAttribute('title')) || '').startsWith('橡皮'), 5000)
  const brushPopBeforeColor = await page.locator('.paint-brush-pop').count()

  await colorBtn.click()
  await waitFor('点颜色弹出颜色面板', async () => (await page.locator('.paint-color-pop').count()) === 1, 6000)
  check('⑯ 点「颜色」只弹颜色面板，不弹画笔浮层（这就是用户报的 BUG）',
    (await page.locator('.paint-brush-pop').count()) === 0 && brushPopBeforeColor === 0,
    { brushPopNow: await page.locator('.paint-brush-pop').count(), brushPopBeforeColor })
  check('⑯ 颜色面板里没有画笔列表（彻底不和画笔共用同一个浮层）',
    (await page.locator('.paint-color-pop .paint-brush').count()) === 0,
    { brushRows: await page.locator('.paint-color-pop .paint-brush').count() })
  check('⑯ 打开颜色面板不改动当前工具（仍是橡皮）',
    ((await page.locator('.paint-tool.is-active').getAttribute('title')) || '').startsWith('橡皮'),
    await page.locator('.paint-tool.is-active').getAttribute('title'))
  check('⑯ 颜色入口有「展开中」状态（橙色外环，和选中工具的橙色标记一致）',
    ((await colorBtn.getAttribute('class')) || '').includes('is-open'),
    await colorBtn.evaluate((el) => getComputedStyle(el).boxShadow))

  const cpGeo = await page.evaluate(() => {
    const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })
    const pop = document.querySelector('.paint-color-pop').getBoundingClientRect()
    const btn = document.querySelector('.paint-color-btn').getBoundingClientRect()
    const body = document.querySelector('.paint-board-body').getBoundingClientRect()
    return {
      pop: round(pop),
      btn: round(btn),
      body: { y: Math.round(body.y), h: Math.round(body.height) },
      swatches: document.querySelectorAll('.paint-color-pop .paint-cp-sw').length,
      hasCustom: Boolean(document.querySelector('.paint-color-pop input[type="color"]')),
      titles: [...document.querySelectorAll('.paint-color-pop .paint-cp-title')].map((el) => el.textContent.trim()),
    }
  })
  // 箭头在面板顶往下 26px 处，箭头中心 ≈ pop.y + 31，应该正好指着颜色按钮的圆心
  check('⑯ 颜色面板贴着颜色按钮展开（而不是弹到工具栏最顶上，看起来像画笔浮层）',
    Math.abs(cpGeo.pop.y + 31 - (cpGeo.btn.y + cpGeo.btn.h / 2)) <= 10, { pop: cpGeo.pop, btn: cpGeo.btn })
  check('⑯ 颜色面板不超出画板上下边界（不会被屏幕裁掉）',
    cpGeo.pop.y >= cpGeo.body.y - 1 && cpGeo.pop.y + cpGeo.pop.h <= cpGeo.body.y + cpGeo.body.h + 1, cpGeo)
  check('⑯ 面板里「常用色」和「更多颜色」两组都在', cpGeo.titles.includes('常用色') && cpGeo.titles.includes('更多颜色'), cpGeo.titles)
  check('⑯ 色块数量够用（常用 7 + 更多颜色 28）', cpGeo.swatches >= 28, { swatches: cpGeo.swatches })
  check('⑯ 有「自己调一个」的自定义取色器', cpGeo.hasCustom, cpGeo.hasCustom)

  // 换成红色 #ef4444，看按钮底色、色值显示、最近用过三处是否同步
  await page.locator('.paint-color-pop .paint-cp-sw[aria-label="颜色 #ef4444"]').click()
  await waitFor('换上红色', async () => ((await page.locator('.paint-cp-now').innerText()).trim() === '#EF4444'), 5000)
  // ⚠️ .paint-color-btn 上有 transition（没写属性名 = all），背景色要 160ms 才过渡到位。
  // 立刻读 getComputedStyle 会拿到插值中间态，误判成「换色没生效」。
  await delay(320)
  const pickedColorUi = await page.evaluate(() => {
    const btn = document.querySelector('.paint-color-btn')
    let recent = []
    try { recent = JSON.parse(window.localStorage.getItem('art-studio-paint-recent-colors') || '[]') } catch { recent = [] }
    return { bg: getComputedStyle(btn).backgroundColor, recent }
  })
  check('⑯ 换色后工具栏色块真的变红', pickedColorUi.bg === 'rgb(239, 68, 68)', pickedColorUi.bg)
  check('⑯ 换色后写进「最近用过」（换色有记忆，下次打开还在）',
    Array.isArray(pickedColorUi.recent) && pickedColorUi.recent[0] === '#ef4444', pickedColorUi.recent)

  // 关面板 → 切回画笔 → 清空图层 → 真画一笔红的，取像素当硬证据
  await page.locator('.paint-color-pop .paint-bp-close').click()
  await waitFor('颜色面板收起', async () => (await page.locator('.paint-color-pop').count()) === 0, 5000)
  await brushToolBtn.click()
  await waitFor('画笔浮层展开', async () => (await page.locator('.paint-brush-pop').count()) === 1, 5000)
  await page.locator('.paint-brush-pop .paint-bp-close').click()
  await waitFor('画笔浮层收起', async () => (await page.locator('.paint-brush-pop').count()) === 0, 5000)
  await page.locator('.paint-more-wrap .paint-icon-btn').click()
  await page.locator('.paint-more-menu button', { hasText: '清空当前图层' }).click()
  await waitFor('提示条消失再画', async () => (await page.locator('.paint-toast').count()) === 0, 8000).catch(() => 0)
  await delay(200)

  const redStageBox = await page.locator('.pb-stage').boundingBox()
  const redCx = redStageBox.x + redStageBox.width / 2
  const redCy = redStageBox.y + redStageBox.height / 2
  await page.mouse.move(redCx - 60, redCy)
  await page.mouse.down()
  await page.mouse.move(redCx, redCy, { steps: 12 })
  await page.mouse.move(redCx + 60, redCy, { steps: 12 })
  await page.mouse.up()
  await delay(400)
  const redInk = await page.evaluate(() => {
    const canvas = document.querySelector('.pb-canvas')
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    const box = { x: Math.max(0, Math.round(w / 2) - 200), y: Math.max(0, Math.round(h / 2) - 30), w: 400, h: 60 }
    const data = ctx.getImageData(box.x, box.y, box.w, box.h).data
    let red = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200 && data[i] > 140 && data[i] - data[i + 1] > 50 && data[i] - data[i + 2] > 50) red += 1
    }
    return red
  })
  check('⑯ 在颜色工具里选的红色，画到纸上就是红色（换色真的生效，不只是按钮变红）', redInk > 30, { redInk })
  await page.screenshot({ path: path.join(OUT_DIR, '10-color-tool.png') })

  // 画笔浮层里的「更多颜色」应该跳进颜色面板，并且画笔浮层自动收起（不许两个浮层叠在一起）
  await brushToolBtn.click()
  await waitFor('画笔浮层再次展开', async () => (await page.locator('.paint-brush-pop').count()) === 1, 5000)
  await page.locator('.paint-bp-more').click()
  const jumpedToColor = await waitFor('点「更多颜色」跳到颜色面板', async () => {
    const colorOpen = (await page.locator('.paint-color-pop').count()) === 1
    const brushClosed = (await page.locator('.paint-brush-pop').count()) === 0
    return colorOpen && brushClosed ? { colorOpen, brushClosed } : 0
  }, 6000)
  check('⑯ 画笔浮层里的「更多颜色」能跳进颜色面板，且画笔浮层自动收起',
    jumpedToColor.colorOpen && jumpedToColor.brushClosed, jumpedToColor)
  await page.locator('.paint-color-pop .paint-bp-close').click()
  await waitFor('收尾：颜色面板收起', async () => (await page.locator('.paint-color-pop').count()) === 0, 5000)

  // ---------- ⑰ 色环取色器（用户嫌网格色块不好用，要画图软件那种色环） ----------
  await colorBtn.click()
  await waitFor('再开颜色面板', async () => (await page.locator('.paint-color-pop').count()) === 1, 6000)
  await waitFor('色环出现', async () => (await page.locator('.paint-wheel-canvas').count()) === 1, 6000)
  const ringBox = await page.locator('.paint-wheel').boundingBox()
  check('⑰ 颜色面板里有画图软件那种色环（不再只有网格色块）',
    ringBox.width >= 140 && Math.abs(ringBox.width - ringBox.height) <= 2, ringBox)

  // 环上真画出了连续色相：顶点应是红，135° 处应是绿（色相 0° 在正上方、顺时针）
  const ringTone = await page.evaluate(() => {
    const canvas = document.querySelector('.paint-wheel-canvas')
    const ctx = canvas.getContext('2d')
    // 色环整块 150px、环带宽 14 → 环中心半径 (150-14)/2 = 68
    const scale = canvas.width / 150
    const center = canvas.width / 2
    const radius = 68 * scale
    const read = (deg) => {
      const rad = ((deg - 90) * Math.PI) / 180
      const x = Math.round(center + Math.cos(rad) * radius)
      const y = Math.round(center + Math.sin(rad) * radius)
      return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3)
    }
    return { top: read(0), green: read(135), bottom: read(180) }
  })
  check('⑰ 色环真画出了连续色相（顶点红、135° 绿、底边青）',
    ringTone.top[0] > 200 && ringTone.top[1] < 70 && ringTone.top[2] < 70
      && ringTone.green[1] > 180 && ringTone.green[0] < 90
      && ringTone.bottom[2] > 180 && ringTone.bottom[0] < 90,
    ringTone)

  // 指针得指着当前颜色：此刻画笔是 #ef4444（红），指针应该停在正上方
  const hueDotAtRed = await page.evaluate(() => {
    const dot = document.querySelector('.paint-wheel-hue')
    const ring = document.querySelector('.paint-wheel')
    if (!dot || !ring) return null
    const d = dot.getBoundingClientRect()
    const r = ring.getBoundingClientRect()
    const dx = d.left + d.width / 2 - (r.left + r.width / 2)
    const dy = d.top + d.height / 2 - (r.top + r.height / 2)
    return { deg: Math.round(((((Math.atan2(dy, dx) * 180) / Math.PI) + 90 + 360) % 360)) }
  })
  check('⑰ 色环指针指着当前颜色（红色 ⇒ 指针在正上方 0°）',
    Boolean(hueDotAtRed) && (hueDotAtRed.deg <= 6 || hueDotAtRed.deg >= 354), hueDotAtRed)

  const ringCx = ringBox.x + ringBox.width / 2
  const ringCy = ringBox.y + ringBox.height / 2
  // 环带宽 14，环中心那道线的半径 = 外径/2 - 环宽/2 = width/2 - 7
  const ringR = ringBox.width / 2 - 7
  const ringPointAt = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return { x: ringCx + Math.cos(rad) * ringR, y: ringCy + Math.sin(rad) * ringR }
  }

  // 点色环 220°（蓝紫一带）→ 画笔颜色跟着换色相
  const bluePoint = ringPointAt(220)
  await page.mouse.move(bluePoint.x, bluePoint.y)
  await page.mouse.down()
  await page.mouse.move(bluePoint.x, bluePoint.y + 1, { steps: 3 })
  await page.mouse.up()
  await delay(300)
  const afterRingPick = await page.evaluate(() => {
    const now = document.querySelector('.paint-cp-now').textContent.trim()
    const hex = now.replace('#', '')
    return {
      now,
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      bg: getComputedStyle(document.querySelector('.paint-color-btn')).backgroundColor,
    }
  })
  check('⑰ 点色环就换色相（点蓝紫一带，颜色真的变蓝）',
    afterRingPick.b > 90 && afterRingPick.b > afterRingPick.r && afterRingPick.b > afterRingPick.g,
    afterRingPick)

  // 色域方块：现在是嵌在色环中间，不是单独铺在下面（用户嫌色环太大、太占地方）
  const svBox = await page.locator('.paint-wheel-sv').boundingBox()
  const svInside = svBox.x >= ringBox.x && svBox.x + svBox.width <= ringBox.x + ringBox.width
    && svBox.y >= ringBox.y && svBox.y + svBox.height <= ringBox.y + ringBox.height
  check('⑰ 色域方块嵌在色环里面（不再单独占一块，整盘只占一个方）',
    svInside && svBox.width >= 70 && Math.abs(svBox.width - svBox.height) <= 2, { svBox, ringBox })
  await page.mouse.move(svBox.x + svBox.width * 0.96, svBox.y + svBox.height * 0.04)
  await page.mouse.down()
  await page.mouse.up()
  await delay(300)
  const afterSv = await page.evaluate(() => {
    const now = document.querySelector('.paint-cp-now').textContent.trim()
    const hex = now.replace('#', '')
    const dot = document.querySelector('.paint-wheel-sv-dot')
    return {
      now,
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      dotLeft: dot?.style.left || '',
      dotTop: dot?.style.top || '',
    }
  })
  check('⑰ 色域方块右上角就是最浓最亮的一色', Math.max(afterSv.r, afterSv.g, afterSv.b) >= 240, afterSv)
  check('⑰ 色域方块上的指针跟着走（点右上角，指针也在右上）',
    Number.parseFloat(afterSv.dotLeft) >= 90 && Number.parseFloat(afterSv.dotTop) <= 10, afterSv)

  // 吸管：从面板里直接切到取色状态，再在画纸上点一下
  const pickBtn = page.locator('.paint-cp-pick')
  check('⑰ 颜色面板里有「吸管取色」入口', (await pickBtn.count()) === 1, { count: await pickBtn.count() })
  await pickBtn.click()
  const pipetteOn = await waitFor('点吸管后收起面板并切到吸管工具', async () => {
    const popGone = (await page.locator('.paint-color-pop').count()) === 0
    const active = ((await page.locator('.paint-tool.is-active').getAttribute('title')) || '')
    return popGone && active.startsWith('吸管') ? { popGone, active } : 0
  }, 6000)
  check('⑰ 点「吸管取色」收起面板并切到吸管工具（接下来点画纸就能取色）',
    pipetteOn.popGone && pipetteOn.active.startsWith('吸管'), pipetteOn)

  // ⑯ 里刚画过一条红线，在它附近点一下应该吸到红、并自动切回画笔
  await page.mouse.click(redCx + 20, redCy)
  const tookColor = await waitFor('从画纸吸到颜色并切回画笔', async () => {
    const active = ((await page.locator('.paint-tool.is-active').getAttribute('title')) || '')
    return active.startsWith('画笔') ? { tool: active } : 0
  }, 6000)
  // ⚠️ .paint-color-btn 的 background 有 .16s 过渡（蓝→红要动画过去），
  //    切回画笔是同步完成的，此刻立刻读会读到过渡中间态（会误判成「没吸到红」）。等过渡走完再读。
  await delay(320)
  const tookInk = await page.evaluate(() => {
    const bg = getComputedStyle(document.querySelector('.paint-color-btn')).backgroundColor
    const nums = bg.match(/\d+/g)?.map(Number) || []
    return { bg, r: nums[0], g: nums[1], b: nums[2] }
  })
  check('⑰ 吸完色自动切回画笔（不用再手动点一次工具）', tookColor.tool.startsWith('画笔'), tookColor)
  check('⑰ 吸到的就是画纸上那条红线', tookInk.r > 200 && tookInk.g < 95 && tookInk.b < 95, tookInk)

  check('⑩ 无 JS 运行时异常', pageErrors.length === 0, pageErrors.slice(0, 3))
  check('⑩ 无异常 console.error', consoleErrors.length === 0, consoleErrors.slice(0, 3))

  await writeFile(path.join(OUT_DIR, 'summary.json'), JSON.stringify({ results, createdDocuments }, null, 2), 'utf8')

  // ---------- 清理临时记录（走 DELETE /api/me/documents/:id，不动业务库里的真实作品） ----------
  const uniqueDocuments = [...new Set(createdDocuments)]
  for (const id of uniqueDocuments) {
    const response = await fetch(`${WEB}/api/me/documents/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Cookie: session } })
    console.error(`清理临时手绘稿 ${id} -> HTTP ${response.status}`)
  }
} catch (error) {
  check('脚本整体执行完成', false, String(error?.stack || error).slice(0, 800))
} finally {
  await browser?.close().catch(() => {})
}

const passed = results.filter((item) => item.pass).length
console.error(`\n===== ${passed}/${results.length} 通过 =====`)
if (failures.length) {
  console.error('失败项：')
  failures.forEach((item) => console.error(` - ${item}`))
  process.exitCode = 1
}
