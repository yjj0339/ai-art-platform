/**
 * 作品广场验收：导航条统一变窄 + 作品改瀑布流
 *
 * 验收的是学生明确要求的两个效果：
 *  1) 顶部导航条统一 58px（和 AI 绘画 / AI 视频页同高），且不再有小字；
 *  2) 作品改成瀑布流：每张图按真实画幅完整显示、不被裁切，第一排是最新几张并排。
 *
 * 数据用拦截接口的假作品（不同画幅的真实图片），不碰真实记录、不产生任何费用。
 * 跑法：env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY node scripts/verify-gallery-masonry.mjs
 */
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = process.env.APP_WEB_ORIGIN || 'http://127.0.0.1:5173'
const API = process.env.APP_API_ORIGIN || 'http://127.0.0.1:3000'
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const ACCOUNT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }

let passed = 0
const failures = []
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`) }
  else { failures.push(`${name}${detail ? `  ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`) }
}

/** 生成指定宽高的真实图片（data URL），用来喂假作品 */
function coverUrl(width, height, seed) {
  const hue = (seed * 47) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue},60%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},70%,62%)"/>
    </linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
    <circle cx="${width * 0.3}" cy="${height * 0.32}" r="${Math.min(width, height) * 0.2}" fill="#fff" opacity=".35"/>
  </svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// 故意混搭画幅：竖 9:16 / 横 16:9 / 方 1:1 / 竖 3:4 / 横 4:3
const SHAPES = [
  [900, 1600], [1200, 900], [900, 1200], [1000, 1000], [1600, 900], [900, 1600],
  [1200, 900], [900, 1200], [1000, 1000], [1600, 900], [900, 1600], [900, 1200],
]
const FAKE_WORKS = SHAPES.map(([width, height], index) => ({
  id: `fake-${index + 1}`,
  title: `验收作品 ${index + 1}`,
  author: `作者${index + 1}`,
  course: `课程${index + 1}`,
  ageRange: '8-10岁',
  likes: index,
  pinned: index === 0,
  cover: coverUrl(width, height, index + 1),
  status: 'published',
  publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
  naturalRatio: Number((width / height).toFixed(4)),
}))

async function loginCookies() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ACCOUNT),
  })
  if (!response.ok) throw new Error(`登录失败：${response.status}`)
  return (response.headers.getSetCookie?.() || []).map((raw) => raw.split(';')[0]).map((pair) => {
    const index = pair.indexOf('=')
    return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: new URL(BASE).hostname, path: '/' }
  })
}

const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addCookies(await loginCookies())
const page = await context.newPage()

await page.route('**/api/gallery/public**', (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({
    ok: true, works: FAKE_WORKS, total: FAKE_WORKS.length, page: 1, pageSize: 40,
    courses: [...new Set(FAKE_WORKS.map((work) => work.course))],
  }),
}))

await page.goto(`${BASE}/student/gallery`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.gallery-card', { timeout: 45000 })
await page.waitForTimeout(2000)

const measure = () => page.evaluate(() => {
  const header = document.querySelector('.gallery-header')
  const headerBox = header.getBoundingClientRect()
  const toolbar = document.querySelector('.gallery-toolbar')
  const cards = [...document.querySelectorAll('.gallery-card')]
  const columns = [...document.querySelectorAll('.masonry-col')]
  return {
    headerHeight: Math.round(headerBox.height),
    headerH1Count: header.querySelectorAll('h1').length,
    headerText: header.innerText.replace(/\s+/g, ' ').trim(),
    headerBottom: Math.round(headerBox.bottom),
    toolbarTop: Math.round(toolbar.getBoundingClientRect().top),
    gridTop: Math.round(cards[0].getBoundingClientRect().top),
    columnCount: columns.length,
    // 单张卡片宽度：用户要「图小一点」，这个数就是验收锚点（原来 4 列时是 340px）
    cardWidth: cards.length ? Math.round(cards[0].getBoundingClientRect().width) : 0,
    cardsPerColumn: columns.map((column) => column.querySelectorAll('.gallery-card').length),
    columnHeights: columns.map((column) => Math.round(column.getBoundingClientRect().height)),
    // 每张卡：图片自身的宽高比 vs 页面上实际显示的宽高比
    ratios: cards.map((card) => {
      const image = card.querySelector('img')
      const box = card.querySelector('.cover').getBoundingClientRect()
      return {
        title: card.querySelector('h2')?.textContent?.trim(),
        natural: image ? Number((image.naturalWidth / image.naturalHeight).toFixed(4)) : null,
        shown: Number((box.width / box.height).toFixed(4)),
        subtitle: card.querySelector('.gallery-overlay p')?.textContent?.trim() || '',
      }
    }),
    firstRow: cards.slice(0, columns.length).map((card) => Math.round(card.getBoundingClientRect().top)),
    // 每列第一张卡的 top（判断第一排是不是并排）
    columnFirstTops: columns.map((column) => {
      const first = column.querySelector('.gallery-card')
      return first ? Math.round(first.getBoundingClientRect().top) : null
    }),
  }
})

const wide = await measure()

console.log('\n【1】导航条：统一 58px、只剩标题')
check('导航条高度是 58px（跟绘画页/视频页一致）', wide.headerHeight === 58, `实测 ${wide.headerHeight}px`)
check('导航条里只有一个 h1 标题', wide.headerH1Count === 1, `实测 ${wide.headerH1Count} 个`)
check('导航条不再有 CURATED CREATIONS 小字', !/CURATED/i.test(wide.headerText), wide.headerText)
check('导航条不再有「浏览审核通过的公开作品」说明文字', !/浏览审核通过/.test(wide.headerText), wide.headerText)
check('导航条只显示「返回工作台 / 作品广场 / 刷新作品」', /返回工作台/.test(wide.headerText) && /作品广场/.test(wide.headerText) && /刷新作品/.test(wide.headerText), wide.headerText)
check('导航条变窄后，筛选条紧贴在下方（间距 ≤ 16px）', wide.toolbarTop - wide.headerBottom <= 16, `间距 ${wide.toolbarTop - wide.headerBottom}px`)

console.log('\n【2】瀑布流：按真实画幅显示、不裁切')
check('作品区用的是瀑布流结构（.gallery-masonry + .masonry-col）', wide.columnCount > 0, `列数 ${wide.columnCount}`)
check('宽屏下分成 5 列（单张卡约 275px，比原来 4 列小两成）', wide.columnCount === 5, `实测 ${wide.columnCount} 列`)
check('单张卡片宽度落在 240~300px（确实是「小一点」而不是又变回去了）', wide.cardWidth >= 240 && wide.cardWidth <= 300, `实测 ${wide.cardWidth}px`)
check('所有作品都渲染出来了（12 张）', wide.ratios.length === 12, `实测 ${wide.ratios.length} 张`)
const ratioDrifts = wide.ratios
  .filter((item) => item.natural !== null)
  .map((item) => ({ ...item, drift: Math.abs(item.shown - item.natural) }))
check('每张图都能读到原始尺寸（用的是真 <img>，不是背景色块）', ratioDrifts.length === 12, `读到 ${ratioDrifts.length} 张`)
const worstDrift = ratioDrifts.reduce((max, item) => Math.max(max, item.drift), 0)
check('每张图都按真实画幅显示，没有被裁切或拉伸（误差 ≤ 0.01）', worstDrift <= 0.01, `最大误差 ${worstDrift.toFixed(4)}`)
check('竖图（9:16）显示成竖的、明显比横图高', (() => {
  const portrait = wide.ratios.find((item) => item.natural && Math.abs(item.natural - 0.5625) < 0.01)
  const landscape = wide.ratios.find((item) => item.natural && Math.abs(item.natural - 1.7778) < 0.01)
  return Boolean(portrait && landscape && portrait.shown < landscape.shown)
})())

console.log('\n【3】第一排是最新几张并排')
const firstRowTops = wide.columnFirstTops.filter((top) => top !== null)
check('每列都至少有一张作品', wide.cardsPerColumn.every((count) => count > 0), `每列 ${wide.cardsPerColumn.join('/')} 张`)
check('五列的第一张卡在同一水平线上（第一排并排）', firstRowTops.length === 5 && Math.max(...firstRowTops) - Math.min(...firstRowTops) <= 2, `各列首卡 top ${firstRowTops.join('/')}`)

console.log('\n【4】列高铺得平：不留大片空白')
const columnSpread = Math.max(...wide.columnHeights) - Math.min(...wide.columnHeights)
// 竖图 9:16 与横图 16:9 本身就差 3 倍高，瀑布流列底不可能像素级齐平；
// 这里只守住「别差出一屏」，实测 50px 左右。
check('最长列与最短列的高度差 ≤ 200px（不会空出一屏）', columnSpread <= 200, `高度差 ${columnSpread}px（各列 ${wide.columnHeights.join('/')}）`)
check('每列作品数量差距不超过 1 张（没有全堆到同一列）', Math.max(...wide.cardsPerColumn) - Math.min(...wide.cardsPerColumn) <= 1, `每列 ${wide.cardsPerColumn.join('/')} 张`)

console.log('\n【5】卡片文字')
check('卡片副标题是「作者 · 课程 · 年龄段」', /作者1 · 课程1 · 8-10岁/.test(wide.ratios[0].subtitle), wide.ratios[0].subtitle)

console.log('\n【6】窄屏列数跟着变')
for (const [width, expected] of [[1100, 4], [850, 3], [600, 2], [440, 1]]) {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(600)
  const narrow = await measure()
  check(`窗口宽 ${width}px 时分成 ${expected} 列`, narrow.columnCount === expected, `实测 ${narrow.columnCount} 列`)
  check(`窗口宽 ${width}px 时导航条仍是 58px`, narrow.headerHeight === 58, `实测 ${narrow.headerHeight}px`)
}

await browser.close()

console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`)
if (failures.length) {
  console.log('失败清单：')
  failures.forEach((item) => console.log(` - ${item}`))
  process.exit(1)
}
