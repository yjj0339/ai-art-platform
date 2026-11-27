// 学生端「图像风格」封面图网格 验收：
//  ① 后台上架的风格，学生端立刻出现在面板里（配好即生效）
//  ② 卡片是方形封面图 + 名字，图片真的加载出来（naturalWidth > 0）
//  ②b 一屏正好 8 个（两排 × 4 张），卡片更小、不用滑动就能看全
//  ③ 多个分组时出现分组标签（单行不换行），点标签只留该组卡片
//  ④ 选一张卡片 → 按钮文案变、卡片高亮唯一、草稿记住、刷新后还在
//  ⑤ 后台一个风格都没配时，回退内置 8 种风格（带「推荐/插画/摄影/中国风」这类分类）
//
// 注：「不指定」不占卡片位，它挪到面板标题右侧当「不用风格」按钮——8 个格子全留给真正的风格。
//
// 只创建/删除自己建的「验收*」临时风格，不碰后台已有真实数据；零 AI 花费。
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

const SEED = [
  { name: '验收水墨', groupName: '验收中国风', prompt: '水墨写意，留白雅致，宣纸质感', rgb: [38, 52, 74] },
  { name: '验收水彩', groupName: '验收插画', prompt: '透明水彩，柔和晕染，纸纹清晰', rgb: [244, 163, 122] },
  { name: '验收胶片', groupName: '验收摄影', prompt: '胶片质感，低饱和，颗粒细腻', rgb: [96, 122, 108] },
]
const isSeed = (item) => SEED.some((seed) => seed.name === item.name) || /^验收/.test(item.name || '')

async function solidPng(rgb) {
  const buffer = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .png().toBuffer()
  return `data:image/png;base64,${buffer.toString('base64')}`
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password: '123456789', organizationCode: 'demo-school' }),
  })
  const cookies = (response.headers.getSetCookie?.() || []).map((item) => item.split(';')[0]).join('; ')
  const payload = await response.json()
  return { cookie: cookies, user: payload.user }
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
let orgCoverDir = ''

try {
  const admin = await login('guanliyuan88')
  const student = await login('ceshi2')
  check('登录：管理员 + 学生都成功', Boolean(admin.user?.id && student.user?.id), { admin: admin.user?.account, student: student.user?.account })

  // 先清掉上次跑崩留下的「验收*」残留，真实风格保持不动
  const existing = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  for (const item of existing.json?.styles || []) {
    if (isSeed(item)) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
  }
  const afterClean = await api(admin.cookie, 'GET', '/api/admin/image-styles')
  const realStyles = (afterClean.json?.styles || []).filter((item) => !isSeed(item))

  // 上架 3 个风格（3 个分组，才会出现分组标签）
  for (const seed of SEED) {
    const uploaded = await api(admin.cookie, 'POST', '/api/admin/image-style-covers', { imageData: await solidPng(seed.rgb) })
    check(`上传封面成功：${seed.name}`, uploaded.status >= 200 && uploaded.status < 300 && /^\/api\/image-style-covers\//.test(uploaded.json?.assetUrl || ''), uploaded.json)
    const saved = await api(admin.cookie, 'POST', '/api/admin/image-styles', {
      name: seed.name,
      groupName: seed.groupName,
      prompt: seed.prompt,
      coverImageUrl: uploaded.json?.assetUrl || '',
      status: 'enabled',
    })
    check(`创建风格成功：${seed.name}`, saved.status >= 200 && saved.status < 300 && Boolean(saved.json?.style?.id), saved.json)
    if (saved.json?.style?.id) {
      created.push({ ...saved.json.style, coverAssetPath: uploaded.json?.assetUrl || '' })
      if (uploaded.json?.assetUrl) createdCovers.push(String(uploaded.json.assetUrl).split('/').pop())
    }
  }
  check('临时风格共 3 个', created.length === 3, created.map((item) => item.name))
  const coverPath = created[0]?.coverAssetPath || ''
  orgCoverDir = coverPath ? path.join(COVER_DIR, coverPath.split('/')[3] || '') : ''

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
      body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
    })
  })
  await page.goto(`${BASE}/student/paint`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.prompt-chip-row', { timeout: 30000 })
  await delay(1800)
  await dismissOverlays(page)

  const styleChip = page.locator('.chip-menu-wrap .prompt-chip', { hasText: '图像风格' })
  check('① 底部有「图像风格」按钮', await styleChip.count() === 1, await styleChip.count())
  await styleChip.first().click()
  await page.waitForSelector('.chip-option-panel.style-panel', { timeout: 15000 })
  await delay(900)

  const panel = await page.evaluate(() => {
    const wrap = document.querySelector('.chip-option-panel.style-panel')
    const scroll = wrap.querySelector('.style-card-scroll')
    const cards = [...wrap.querySelectorAll('.style-card')]
    const rects = cards.map((el) => el.getBoundingClientRect())
    const scrollRect = scroll.getBoundingClientRect()
    // 一屏可见 = 横向完全落在滚动容器可视区内
    const visible = rects.filter((rect) => rect.left >= scrollRect.left - 1 && rect.right <= scrollRect.right + 1)
    return {
      className: wrap.className,
      headText: wrap.querySelector('.style-panel-head')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      noneBtnText: wrap.querySelector('.style-none-btn')?.textContent?.trim() || '',
      noneBtnSelected: Boolean(wrap.querySelector('.style-none-btn.selected')),
      panelWidth: Math.round(wrap.getBoundingClientRect().width),
      panelBox: (() => {
        const rect = wrap.getBoundingClientRect()
        return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) }
      })(),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      overflowY: getComputedStyle(wrap).overflowY,
      overflowX: getComputedStyle(scroll).overflowX,
      scrollTotal: Math.round(scroll.scrollWidth),
      scrollClient: Math.round(scroll.clientWidth),
      cardCount: cards.length,
      cardWidth: Math.round(rects[0].width),
      rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
      perRow: (() => {
        const firstTop = Math.round(rects[0].top)
        return rects.filter((rect) => Math.round(rect.top) === firstTop).length
      })(),
      visibleCount: visible.length,
      names: cards.map((el) => el.querySelector('.style-card-name')?.textContent?.trim() || ''),
      tabs: [...document.querySelectorAll('.style-group-tab')].map((el) => el.textContent.trim()),
      tabsHeight: Math.round(document.querySelector('.style-group-tabs')?.getBoundingClientRect().height || 0),
      sizes: cards.map((el) => {
        const cover = el.querySelector('.style-card-cover').getBoundingClientRect()
        return { w: Math.round(cover.width), h: Math.round(cover.height) }
      }),
      images: cards.map((el) => {
        const img = el.querySelector('img')
        return img ? { src: img.getAttribute('src'), natural: img.naturalWidth } : null
      }),
    }
  })

  // ⚠️ 库里可能已有真实风格（如「3D毛绒」）：不能写死「只有 3 张卡 / 只有 4 个标签」，
  // 否则真实数据一多就假红。统一用「基线 + 本次 3 个」相对算，并且只断言我们这 3 条在里面。
  const expectCards = 3 + realStyles.length
  const expectTabs = 1 + new Set(SEED.map((seed) => seed.groupName)).size
  check('① 面板里是后台配的 3 个风格 + 基线真实风格（「不指定」不占卡片位）',
    panel.cardCount === expectCards && SEED.every((seed) => panel.names.includes(seed.name)),
    { cardCount: panel.cardCount, expectCards, names: panel.names })
  check('① 「不用风格」按钮在标题行、当前处于选中态', panel.noneBtnText === '不用风格' && panel.noneBtnSelected, { text: panel.noneBtnText, selected: panel.noneBtnSelected })
  check('② 封面是方形（宽高差 ≤ 2px）且更小了（≤ 90px）', panel.sizes.every((size) => Math.abs(size.w - size.h) <= 2 && size.w > 40 && size.w <= 90), panel.sizes)
  check('② 封面图真的加载出来（naturalWidth ≥ 200）', panel.images.every((img) => img && img.natural >= 200), panel.images)
  // 面板是「两排网格 + 横向排列」：满 8 张时是两排 × 4，不足 8 张时会折成更少的列。
  // 所以只断言「不超过两排」这个真正在意的点，行数具体几排交给「每排 4 张」那条去判。
  check('② 面板最多两排（卡片不竖着排一长串）', panel.rows >= 1 && panel.rows <= 2, { rows: panel.rows, cardCount: panel.cardCount, perRow: panel.perRow, names: panel.names })
  check('② 每排 4 张（卡片宽 ≈ 84px）且面板不溢出到窗口外', panel.cardWidth >= 78 && panel.cardWidth <= 92 && /cols-4/.test(panel.className) && panel.panelWidth <= 400, { cardWidth: panel.cardWidth, panelWidth: panel.panelWidth, className: panel.className })
  check('② 面板完整落在窗口内（左右不越界）', panel.panelBox.left >= 0 && panel.panelBox.right <= panel.viewport.w, panel.panelBox)
  // 卡片总数 ≤ 8 时才应该「一屏看全」，超过 8 张本来就该横向滑动（基线真实风格太多时不算失败）
  if (expectCards <= 8) {
    check('② 卡片不多时不需要横向滑动', panel.overflowX === 'auto' && panel.scrollTotal <= panel.scrollClient + 2, { overflowX: panel.overflowX, scrollTotal: panel.scrollTotal, scrollClient: panel.scrollClient, expectCards })
  } else {
    console.error(`NOTE  本次共 ${expectCards} 张卡（含基线真实风格），跳过「一屏看全」检查`)
  }
  check('③ 出现分组标签（全部 + 本次 3 组 + 基线已有分组）',
    panel.tabs.length >= expectTabs && panel.tabs.length === 1 + new Set([...SEED.map((seed) => seed.groupName), ...realStyles.map((item) => item.groupName || '推荐')]).size && panel.tabs[0] === '全部',
    { tabs: panel.tabs, expectTabs, realGroups: realStyles.map((item) => item.groupName) })
  check('③ 分组标签单行不换行（换行会把两排卡片往下挤）', panel.tabsHeight > 0 && panel.tabsHeight < 34, panel.tabsHeight)
  check('③ 面板顶部有标题行（默认「图像风格」）', panel.headText.startsWith('图像风格'), panel.headText)
  await page.screenshot({ path: path.join(OUT_DIR, 'student-style-grid-all.png') })

  // ③ 切分组：只剩该组卡片（「不用风格」是独立按钮，不在卡片流里）
  await page.locator('.style-group-tab', { hasText: '验收插画' }).click()
  await delay(500)
  const filtered = await page.evaluate(() => [...document.querySelectorAll('.style-card-name')].map((el) => el.textContent.trim()))
  check('③ 点「验收插画」只剩该组卡片', filtered.length === 1 && filtered.includes('验收水彩'), filtered)
  await page.screenshot({ path: path.join(OUT_DIR, 'student-style-grid-group.png') })

  // ④ 选一张卡片
  await page.locator('.style-group-tab', { hasText: '全部' }).click()
  await delay(300)
  await page.locator('.style-card', { hasText: '验收水墨' }).click()
  await delay(800)
  const afterPick = await page.evaluate(() => ({
    chipText: [...document.querySelectorAll('.prompt-chip')].map((el) => el.textContent.trim()).find((text) => text.startsWith('图像风格')) || '',
    panelOpen: Boolean(document.querySelector('.chip-option-panel.style-panel')),
  }))
  check('④ 点卡片后按钮文案变成所选风格', afterPick.chipText.includes('验收水墨'), afterPick.chipText)
  check('④ 选完面板自动收起', afterPick.panelOpen === false, afterPick.panelOpen)

  // 重新打开面板，确认高亮只落在这张卡上（面板关着时卡片已被 v-if 卸载，不能此时数）
  await page.locator('.chip-menu-wrap .prompt-chip', { hasText: '图像风格' }).first().click()
  await page.waitForSelector('.chip-option-panel.style-panel', { timeout: 15000 })
  await delay(600)
  const highlight = await page.evaluate(() => ({
    selectedCount: document.querySelectorAll('.style-card.selected').length,
    selectedName: document.querySelector('.style-card.selected .style-card-name')?.textContent?.trim() || '',
    tabs: [...document.querySelectorAll('.style-group-tab')].map((el) => el.textContent.trim()),
    activeTab: document.querySelector('.style-group-tab.selected')?.textContent?.trim() || '',
  }))
  check('④ 高亮卡片唯一且正确', highlight.selectedCount === 1 && highlight.selectedName === '验收水墨', highlight)
  check('④ 打开面板时自动停在所选风格所在分组', highlight.activeTab === '验收中国风', highlight)
  await page.locator('.chip-menu-wrap .prompt-chip', { hasText: '图像风格' }).first().click()
  await delay(300)

  // 刷新后还在
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.prompt-chip-row', { timeout: 30000 })
  await delay(1800)
  await dismissOverlays(page)
  const afterReload = await page.evaluate(() => [...document.querySelectorAll('.prompt-chip')].map((el) => el.textContent.trim()).find((text) => text.startsWith('图像风格')) || '')
  check('④ 刷新后仍保持所选风格', afterReload.includes('验收水墨'), afterReload)
  await page.screenshot({ path: path.join(OUT_DIR, 'student-style-selected.png') })

  // ⑤ 后台清空 → 回退内置风格（只在后台没有真实风格时执行，避免动到线上数据）
  for (const item of created) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
  created.length = 0
  if (!realStyles.length) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.prompt-chip-row', { timeout: 30000 })
    await delay(1800)
    await dismissOverlays(page)
    await page.locator('.chip-menu-wrap .prompt-chip', { hasText: '图像风格' }).first().click()
    await page.waitForSelector('.chip-option-panel.style-panel', { timeout: 15000 })
    await delay(700)
    const fallback = await page.evaluate(() => {
      const wrap = document.querySelector('.chip-option-panel.style-panel')
      const scroll = document.querySelector('.style-card-scroll')
      const scrollRect = scroll.getBoundingClientRect()
      const rects = [...document.querySelectorAll('.style-card')].map((el) => el.getBoundingClientRect())
      const visible = rects.filter((rect) => rect.left >= scrollRect.left - 1 && rect.right <= scrollRect.right + 1)
      return {
        cardCount: document.querySelectorAll('.style-card').length,
        names: [...document.querySelectorAll('.style-card-name')].map((el) => el.textContent.trim()),
        tabs: [...document.querySelectorAll('.style-group-tab')].map((el) => el.textContent.trim()),
        tabsHeight: Math.round(document.querySelector('.style-group-tabs')?.getBoundingClientRect().height || 0),
        rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
        perRow: (() => {
          const firstTop = Math.round(rects[0].top)
          return rects.filter((rect) => Math.round(rect.top) === firstTop).length
        })(),
        visibleCount: visible.length,
        visibleNames: visible.map((rect) => {
          const el = [...document.querySelectorAll('.style-card')][rects.indexOf(rect)]
          return el.querySelector('.style-card-name')?.textContent?.trim()
        }),
        scrollTotal: Math.round(scroll.scrollWidth),
        scrollClient: Math.round(scroll.clientWidth),
        noneBtnText: wrap.querySelector('.style-none-btn')?.textContent?.trim() || '',
      }
    })
    check('⑤ 后台零配置时回退内置 8 种（「不指定」不占卡片位）', fallback.cardCount === 8, fallback)
    check('⑤ 内置风格名字都在', ['国画风格', '油画风格', '水彩风格', '儿童插画'].every((name) => fallback.names.includes(name)), fallback.names)
    check('⑤ 内置风格自带分类标签（推荐/插画/摄影/中国风这类）', fallback.tabs.length >= 3 && fallback.tabs[0] === '全部' && fallback.tabs.includes('插画'), fallback.tabs)
    check('⑤ 分类标签单行不换行', fallback.tabsHeight > 0 && fallback.tabsHeight < 34, fallback.tabsHeight)
    check('⑤ 8 个风格一屏看全（两排 × 4，不用滑动）', fallback.rows === 2 && fallback.perRow === 4 && fallback.visibleCount === 8 && fallback.scrollTotal <= fallback.scrollClient + 2, { rows: fallback.rows, perRow: fallback.perRow, visibleCount: fallback.visibleCount, scrollTotal: fallback.scrollTotal, scrollClient: fallback.scrollClient })
    check('⑤ 有「不用风格」按钮兜底（学生不想用风格时能取消）', fallback.noneBtnText === '不用风格', fallback.noneBtnText)
    await page.screenshot({ path: path.join(OUT_DIR, 'student-style-builtin-fallback.png') })
  } else {
    console.error(`SKIP  ⑤ 后台已有 ${realStyles.length} 个真实风格，跳过「零配置回退内置风格」检查`)
  }

  const fatal = errors.filter((text) => !/favicon|ResizeObserver|Failed to load resource/i.test(text))
  check('⑥ 控制台无新报错', fatal.length === 0, fatal.slice(0, 4))
} catch (error) {
  check('脚本执行未抛异常', false, String(error?.stack || error).slice(0, 600))
} finally {
  if (browser) await browser.close()
  // 兜底清理：删掉本次建的临时风格，顺带验证封面文件是否会一起清掉
  try {
    const admin = await login('guanliyuan88')
    const list = await api(admin.cookie, 'GET', '/api/admin/image-styles')
    for (const item of list.json?.styles || []) {
      if (isSeed(item)) await api(admin.cookie, 'DELETE', `/api/admin/image-styles/${encodeURIComponent(item.id)}?mode=permanent`)
    }
    const left = await api(admin.cookie, 'GET', '/api/admin/image-styles')
    check('⑦ 临时风格已清空', (left.json?.styles || []).filter((item) => isSeed(item)).length === 0, left.json?.styles?.map((item) => item.name))
    if (orgCoverDir && createdCovers.length) {
      const files = await readdir(orgCoverDir).catch(() => [])
      const leftovers = createdCovers.filter((name) => files.includes(name))
      check('⑦ 删除后封面文件也被清掉', leftovers.length === 0, leftovers)
    }
  } catch (error) {
    check('⑦ 清理阶段未抛异常', false, String(error).slice(0, 300))
  }
}

const passed = results.filter((r) => r.pass).length
console.log(`\n==== ${passed}/${results.length} 项通过 ====`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((f) => console.log(' - ' + f))
  process.exitCode = 1
}
