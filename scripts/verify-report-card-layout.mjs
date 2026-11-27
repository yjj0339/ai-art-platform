// 项目报告页排版验收（零花费：/api/me/documents 全部假回包，不生成任何内容）
//
// 验证「9:16 竖版封面 + 5 列 + 三个点菜单」这套排版在真浏览器里确实成立：
//   1. 桌面 5 列，封面严格 9:16，文字区与操作区高度被压到 44 / 39 上下
//   2. 竖长报告页铺满、方图画作完整显示（is-wide 才出模糊底），两者都不裁人物
//   3. 三个点菜单能弹出、四项齐全、不超出视口；点空白处自动收起
//   4. 没有结果图的报告退回浅灰待生成态，不凭空造图
//   5. 窄屏按 4 / 3 / 2 / 1 列降级
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3000'

let pass = 0
const fails = []
function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    fails.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
function near(value, target, tolerance) {
  return Math.abs(value - target) <= tolerance
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
if (!login.ok) throw new Error(`登录失败 ${login.status}`)
const cookies = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).map((pair) => {
  const i = pair.indexOf('=')
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: '127.0.0.1', path: '/' }
})

// 封面用磁盘上的真实图（9:19 竖版报告页 / 1:1 方图画作）。
// 这些图属于别的账号，直接请求会 403，所以下面把读图路由也拦下来直接回真实字节，
// 这样验收的是「排版逻辑」，不是「谁能读谁的图」。
import { readFileSync } from 'node:fs'
const ASSET_DIR = new URL('../server/data/h5-report-assets/', import.meta.url)
const TALL = '/api/h5-report-assets/verify-tall/workflow-1'
const SQUARE = '/api/h5-report-assets/verify-square/workflow-1'
// 9:19 竖版「有内容的报告页」（真实画作那一页）
const TALL_PAGE = readFileSync(new URL('h5_story_msrlp53r_uuep4m/story-ai.webp', ASSET_DIR))
// 9:19 竖版「模板封面页」：整页只有标题 +「等待学生作品」占位，必须被跳过
const TEMPLATE_COVER_PAGE = readFileSync(new URL('h5_story_msrlp53r_uuep4m/story-cover.webp', ASSET_DIR))
const ASSET_BYTES = {
  '/api/h5-report-assets/verify-tall/workflow-1': TALL_PAGE,
  '/api/h5-report-assets/verify-square/workflow-1': readFileSync(new URL('h5_canvas_mwftno28_2lodsg/workflow-1.webp', ASSET_DIR)),
  '/api/h5-report-assets/verify-templatecover/workflow-1': TEMPLATE_COVER_PAGE,
}

const project = {
  id: 'verify-layout-project',
  title: '排版验收项目',
  difficulty: 'pro',
  versions: [{ id: 'v1', preview: '' }],
  models3d: [],
  videos: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  reports: [
    {
      id: 'verify-layout-r1',
      title: '蓝银民族少女创作报告',
      type: 'single',
      course: 'AI创意美术课',
      createdAt: '2026-11-13T23:53:00.000Z',
      materialTypes: ['painting'],
      materialStats: { sketches: 1, versions: 3, models3d: 0, videos: 0 },
      pageImages: [
        { id: 'workflow-1', label: '结果图 1', url: TALL },
        { id: 'workflow-2', label: '结果图 2', url: TALL },
        { id: 'workflow-3', label: '结果图 3', url: TALL },
      ],
    },
    {
      id: 'verify-layout-r2',
      title: '机甲战士主题创作（标题很长很长很长很长很长很长很长很长很长很长）',
      type: 'single',
      course: 'AI创意美术课',
      createdAt: '2026-11-13T10:50:00.000Z',
      materialTypes: ['painting'],
      materialStats: { sketches: 1, versions: 2, models3d: 0, videos: 0 },
      pageImages: [{ id: 'workflow-1', label: '结果图 1', url: SQUARE }],
    },
    {
      id: 'verify-layout-r3',
      title: '秋季作品集 · 综合材料',
      type: 'collection',
      course: 'AI创意美术课',
      createdAt: '2026-11-05T16:16:00.000Z',
      materialTypes: ['collection'],
      materialStats: { sketches: 2, versions: 4, models3d: 1, videos: 0 },
      pageImages: [{ id: 'workflow-1', label: '结果图 1', url: TALL }],
    },
    {
      id: 'verify-layout-r4',
      title: '还没有生成结果图的报告',
      type: 'single',
      course: 'AI创意美术课',
      createdAt: '2026-11-02T09:20:00.000Z',
      materialTypes: ['painting'],
      materialStats: { sketches: 0, versions: 0, models3d: 0, videos: 0 },
      pageImages: [],
      cover: 'linear-gradient(135deg, #ff7a00, #ffd166)',
    },
    {
      id: 'verify-layout-r6',
      title: '产品故事类报告（第 1 页是模板封面页）',
      type: 'single',
      course: 'AI创意美术课',
      createdAt: '2026-10-30T09:20:00.000Z',
      materialTypes: ['painting'],
      materialStats: { sketches: 1, versions: 2, models3d: 0, videos: 0 },
      pageImages: [
        { id: 'story-cover', label: '这是我的设计', url: '/api/h5-report-assets/verify-templatecover/workflow-1' },
        { id: 'story-ai', label: '我和AI一起试方案', url: TALL },
      ],
    },
    {
      id: 'verify-layout-r5',
      title: '封面图读不出来的报告',
      type: 'single',
      course: 'AI创意美术课',
      createdAt: '2026-11-01T09:20:00.000Z',
      materialTypes: ['painting'],
      materialStats: { sketches: 1, versions: 1, models3d: 0, videos: 0 },
      pageImages: [{ id: 'workflow-1', label: '结果图 1', url: '/api/h5-report-assets/verify-missing/workflow-1' }],
    },
  ],
}

const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
await context.addCookies(cookies)
await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(`${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`))
await page.route('**/api/me/documents**', async (route) => {
  const req = route.request()
  // 写请求要按真实后端格式回 {ok, document}：store 的 queueServerWrite 会读
  // data.document.id / data.document.version，只回 {ok:true} 会抛 TypeError 污染「无 JS 报错」断言
  if (req.method() !== 'GET') {
    const body = JSON.parse(req.postData() || '{}')
    const isPatch = req.method() === 'PATCH'
    return route.fulfill({
      status: isPatch ? 200 : 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        document: {
          id: 'verify-layout-doc',
          version: isPatch ? 2 : 1,
          title: body.title || 'verify',
          data: body.data || {},
        },
      }),
    })
  }
  const type = new URL(req.url()).searchParams.get('type') || 'project'
  const documents = type === 'project' ? [{ id: 'verify-layout-doc', version: 1, data: project }] : []
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents }) })
})
// 读图路由：按路径回真实图片字节；未登记的路径回 404（用来验证破图兜底）
await page.route('**/api/h5-report-assets/**', async (route) => {
  const pathname = new URL(route.request().url()).pathname
  const bytes = ASSET_BYTES[pathname]
  if (!bytes) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' })
  return route.fulfill({ status: 200, contentType: 'image/webp', body: bytes })
})

await page.goto(`${BASE}/student/reports`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.report-card', { timeout: 45000 })
await delay(1200)

console.log('\n[1] 桌面 5 列与卡片尺寸')
const geo = await page.evaluate(() => {
  const grid = document.querySelector('.report-grid')
  const cards = [...document.querySelectorAll('.report-card')]
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  }
  const first = cards[0]
  const cover = first.querySelector('.report-cover')
  return {
    count: cards.length,
    cols: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
    card: box(first),
    cover: box(cover),
    coverAspect: cover.getBoundingClientRect().width / cover.getBoundingClientRect().height,
    meta: box(first.querySelector('.card-meta')),
    acts: box(first.querySelector('.card-acts')),
    titleLines: (() => {
      const h = first.querySelector('.card-meta h2')
      const lh = parseFloat(getComputedStyle(h).lineHeight)
      return Math.round(h.getBoundingClientRect().height / lh)
    })(),
    titleOverflow: (() => {
      const h = first.querySelector('.card-meta h2')
      return h.scrollWidth > h.clientWidth + 1
    })(),
    subText: first.querySelector('.card-meta p')?.textContent?.trim(),
    actMainClipped: (() => {
      const b = first.querySelector('.act-main')
      return b ? b.scrollWidth > b.clientWidth + 1 : true
    })(),
    actMainScrollW: first.querySelector('.act-main')?.scrollWidth,
    actMainClientW: first.querySelector('.act-main')?.clientWidth,
  }
})
ok('6 张卡片全部渲染', geo.count === 6, `实际 ${geo.count}`)
ok('桌面 1440 宽是 5 列', geo.cols === 5, `实际 ${geo.cols}`)
ok('单卡宽 230~300px（5 列不挤成细条）', geo.card.w >= 230 && geo.card.w <= 300, `${geo.card.w}px`)
ok('封面严格 9:16', near(geo.coverAspect, 9 / 16, 0.02), `实际 ${geo.coverAspect.toFixed(3)}`)
ok('封面占卡片高度 ≥ 84%', geo.cover.h / geo.card.h >= 0.84, `${(geo.cover.h / geo.card.h * 100).toFixed(1)}%`)
ok('文字区压到 44px 上下', geo.meta.h <= 50, `${geo.meta.h}px`)
ok('操作区压到 40px 上下', geo.acts.h <= 44, `${geo.acts.h}px`)
ok('标题只有一行', geo.titleLines === 1, `${geo.titleLines} 行`)
ok('第二行是「日期 · N 张」', /月.*日\s*·\s*\d+\s*张/.test(geo.subText || ''), geo.subText)
ok('文字+按钮合计不超过 90px', geo.meta.h + geo.acts.h <= 90, `${geo.meta.h + geo.acts.h}px`)
ok('「查看预览」按钮文字不被压成省略', geo.actMainClipped === false, `scrollW ${geo.actMainScrollW} / clientW ${geo.actMainClientW}`)

console.log('\n[2] 两种画幅的封面处理')
const covers = await page.evaluate(() => [...document.querySelectorAll('.report-cover')].map((el) => {
  const fg = el.querySelector('.cover-fg')
  const bg = el.querySelector('.cover-bg')
  return {
    wide: el.classList.contains('is-wide'),
    empty: el.classList.contains('is-empty'),
    hasFg: !!fg,
    fgFit: fg ? getComputedStyle(fg).objectFit : '',
    fgLoaded: fg ? fg.naturalWidth : 0,
    fgRatio: fg && fg.naturalHeight ? fg.naturalWidth / fg.naturalHeight : 0,
    bgVisible: bg ? getComputedStyle(bg).display !== 'none' : false,
    badge: el.querySelector('.badge-type')?.textContent?.trim() || '',
    page: el.querySelector('.badge-page')?.textContent?.trim() || '',
    fgSrc: fg ? fg.getAttribute('src') : '',
    emptyBg: el.querySelector('.cover-empty') ? getComputedStyle(el.querySelector('.cover-empty')).backgroundColor : '',
  }
}))
ok('竖长报告页铺满（object-fit:cover）', covers[0].fgFit === 'cover', covers[0].fgFit)
ok('竖长报告页不加模糊底', covers[0].bgVisible === false)
ok('方图画作切成完整显示（contain）', covers[1].wide === true && covers[1].fgFit === 'contain', `wide=${covers[1].wide} fit=${covers[1].fgFit}`)
ok('方图画作才出模糊底', covers[1].bgVisible === true)
ok('封面图都真正加载成功', covers.slice(0, 3).every((c) => c.fgLoaded > 0), covers.slice(0, 3).map((c) => c.fgLoaded).join(','))
ok('类型角标正确（绘画/合集）', covers[0].badge === '绘画报告' && covers[2].badge === '合集报告', `${covers[0].badge} / ${covers[2].badge}`)
ok('页数角标正确', covers[0].page === '3 页' && covers[1].page === '1 页', `${covers[0].page} / ${covers[1].page}`)
ok('没有结果图时退回色块、不造图', covers[3].empty === true && covers[3].hasFg === false)
ok('空封面不显示页数角标', covers[3].page === '')
ok('封面图读不到时退回色块、不留破图', covers[4].empty === true && covers[4].hasFg === false)
ok('空封面不是刺眼的橙色块', !/255,\s*122,\s*0|251,\s*146,\s*60/.test(covers[3].emptyBg + covers[4].emptyBg), covers[3].emptyBg)
ok('产品故事类报告跳过模板封面页', covers[5].fgSrc === TALL, covers[5].fgSrc)

console.log('\n[3] 三个点下拉菜单')
const menu = page.locator('.report-card').nth(0)
await menu.locator('.act-more').click()
await delay(220)
const menuState = await page.evaluate(() => {
  const card = document.querySelector('.report-card')
  const m = card.querySelector('.card-menu')
  const r = m.getBoundingClientRect()
  return {
    open: m.classList.contains('open'),
    items: [...m.querySelectorAll('button')].map((b) => b.textContent.trim()),
    inViewport: r.top >= 0 && r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    aboveButton: r.bottom <= card.querySelector('.card-acts').getBoundingClientRect().top,
    dangerRed: getComputedStyle(m.querySelector('button.danger')).color,
    moreOn: card.querySelector('.act-more').classList.contains('on'),
  }
})
ok('菜单能弹出', menuState.open === true)
ok('菜单四项齐全', JSON.stringify(menuState.items) === JSON.stringify(['重新生成', '导出', '分享海报', '删除']), menuState.items.join('/'))
ok('菜单不超出视口', menuState.inViewport === true)
ok('菜单向上弹、不挡按钮', menuState.aboveButton === true)
ok('删除项标红', /220,\s*38,\s*38|dc2626/.test(menuState.dangerRed), menuState.dangerRed)
ok('三个点按钮进入选中态', menuState.moreOn === true)
await page.screenshot({ path: 'docs/report-layout-preview/real-menu-open.png' })

await page.mouse.click(20, 20)
await delay(200)
const closed = await page.evaluate(() => !document.querySelector('.card-menu.open'))
ok('点空白处自动收起菜单', closed === true)

await page.locator('.report-card').nth(0).locator('.act-more').click()
await delay(150)
await page.locator('.report-card').nth(1).locator('.act-more').click()
await delay(200)
const onlyOne = await page.evaluate(() => document.querySelectorAll('.card-menu.open').length)
ok('同时只开一个菜单', onlyOne === 1, `实际 ${onlyOne} 个`)
await page.mouse.click(20, 20)
await delay(150)

console.log('\n[4] 卡片高度一致（标题长短不影响排版）')
const heights = await page.evaluate(() => [...document.querySelectorAll('.report-card')].map((el) => Math.round(el.getBoundingClientRect().height)))
ok('6 张卡片等高', new Set(heights).size === 1, heights.join(' / '))
const longTitle = await page.evaluate(() => {
  const h = document.querySelectorAll('.report-card')[1].querySelector('.card-meta h2')
  return { overflow: h.scrollWidth > h.clientWidth + 1, lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)) }
})
ok('超长标题只占一行并省略', longTitle.lines === 1 && longTitle.overflow === true, `行数 ${longTitle.lines}`)

console.log('\n[5] 窄屏降列')
for (const [vw, expect] of [[1100, 4], [860, 3], [600, 2], [440, 1]]) {
  await page.setViewportSize({ width: vw, height: 1000 })
  await delay(320)
  const cols = await page.evaluate(() => {
    const g = document.querySelector('.report-grid')
    return getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length
  })
  ok(`${vw}px 宽降为 ${expect} 列`, cols === expect, `实际 ${cols}`)
}
await page.setViewportSize({ width: 1440, height: 1000 })
await delay(300)
// 截图放在批量删除之前：删完只剩 5 张卡，排版截图要的是完整 6 张
await page.screenshot({ path: 'docs/report-layout-preview/real-1440.png', fullPage: false })
await page.screenshot({ path: 'docs/report-layout-preview/real-1440-full.png', fullPage: true })

console.log('\n[6] 顶部导航条')
const toolbar = await page.evaluate(() => {
  const t = document.querySelector('.reports-toolbar')
  const r = t.getBoundingClientRect()
  return {
    h: Math.round(r.height),
    oneLine: r.height <= 62,
    hasSearch: !!t.querySelector('.search-input'),
    searchPlaceholder: t.querySelector('.search-input')?.getAttribute('placeholder') || '',
    selects: [...t.querySelectorAll('.toolbar-select')].length,
    selectTexts: [...t.querySelectorAll('.el-select')].map((el) => el.textContent.trim()),
    hasSortSelect: [...t.querySelectorAll('.el-select__placeholder, .el-select__selected-item')]
      .some((el) => el.textContent.trim() === '最新'),
  }
})
ok('导航条仍是一行 58px', toolbar.oneLine === true, `${toolbar.h}px`)
ok('导航条上有搜索框', toolbar.hasSearch === true)
ok('搜索框有提示文字', toolbar.searchPlaceholder.length > 0, toolbar.searchPlaceholder)
ok('「最新 / 课程分组」下拉已删除', toolbar.hasSortSelect === false, toolbar.selectTexts.join(' | '))
ok('只剩类型筛选一个下拉（无分类时）', toolbar.selects === 1, `实际 ${toolbar.selects} 个`)

console.log('\n[7] 搜索')
const searchInput = page.locator('.search-input')
await searchInput.fill('机甲')
await delay(320)
const searched = await page.evaluate(() => ({
  count: document.querySelectorAll('.report-card').length,
  titles: [...document.querySelectorAll('.card-meta h2')].map((el) => el.textContent.trim()),
}))
ok('搜标题能筛出唯一一份', searched.count === 1, `实际 ${searched.count} 份`)
ok('筛出的就是「机甲战士」那份', /机甲/.test(searched.titles[0] || ''), searched.titles.join(' / '))

await searchInput.fill('AI创意美术课')
await delay(320)
const byCourse = await page.evaluate(() => document.querySelectorAll('.report-card').length)
ok('搜课程名也能匹配', byCourse === 6, `实际 ${byCourse} 份`)

await searchInput.fill('不存在的关键词xyz')
await delay(320)
const noHit = await page.evaluate(() => ({
  cards: document.querySelectorAll('.report-card').length,
  emptyTitle: document.querySelector('.empty-reports h2')?.textContent?.trim() || '',
  hasReset: [...document.querySelectorAll('.empty-actions button')].some((b) => b.textContent.includes('清空筛选')),
}))
ok('搜不到时显示空状态', noHit.cards === 0 && /没有找到/.test(noHit.emptyTitle), noHit.emptyTitle)
ok('空状态提供「清空筛选条件」', noHit.hasReset === true)

await page.locator('.empty-actions button', { hasText: '清空筛选条件' }).click()
await delay(320)
const afterReset = await page.evaluate(() => ({
  cards: document.querySelectorAll('.report-card').length,
  value: document.querySelector('.search-input')?.value || '',
}))
ok('点清空筛选恢复全部', afterReset.cards === 6 && afterReset.value === '', `${afterReset.cards} 份 / "${afterReset.value}"`)

console.log('\n[8] 批量管理')
await page.locator('.action-zone button', { hasText: '批量管理' }).click()
await delay(320)
const batchUi = await page.evaluate(() => {
  const bar = document.querySelector('.batch-bar')
  return {
    barVisible: !!bar,
    buttons: bar ? [...bar.querySelectorAll('button')].map((b) => b.textContent.trim().replace(/\s+/g, '')) : [],
    countText: bar?.querySelector('.batch-count')?.textContent?.replace(/\s+/g, '') || '',
    dots: document.querySelectorAll('.pick-dot').length,
    barSticky: bar ? getComputedStyle(bar).position : '',
  }
})
ok('批量操作条出现', batchUi.barVisible === true)
ok('批量条含 全选/批量导出/分类设置/批量删除', ['全选', '批量导出', '分类设置', '批量删除'].every((n) => batchUi.buttons.some((b) => b.includes(n))), batchUi.buttons.join(' | '))
ok('每张卡片都有勾选圈', batchUi.dots === 6, `实际 ${batchUi.dots} 个`)
ok('批量条吸顶', batchUi.barSticky === 'sticky', batchUi.barSticky)
ok('初始选中 0 份', /已选0份/.test(batchUi.countText), batchUi.countText)

const disabledBefore = await page.evaluate(() => [...document.querySelectorAll('.batch-btn')].map((b) => b.disabled))
ok('没选任何报告时批量按钮全禁用', disabledBefore.every(Boolean), disabledBefore.join(','))

// 点卡片本体（不是点勾选圈）也要能选中
await page.locator('.report-card').nth(0).locator('.card-meta').click()
await delay(220)
const onePicked = await page.evaluate(() => ({
  count: document.querySelectorAll('.report-card.is-picked').length,
  countText: document.querySelector('.batch-count')?.textContent?.replace(/\s+/g, ''),
  dotOn: document.querySelectorAll('.pick-dot.on').length,
  ring: getComputedStyle(document.querySelector('.report-card.is-picked')).boxShadow,
}))
ok('点卡片本体即可选中', onePicked.count === 1, `实际 ${onePicked.count} 份`)
ok('选中计数同步', /已选1份/.test(onePicked.countText || ''), onePicked.countText)
ok('勾选圈同步变选中态', onePicked.dotOn === 1, `实际 ${onePicked.dotOn} 个`)
ok('选中卡片有橙色描边', /255,\s*122,\s*0|rgb\(255/.test(onePicked.ring), onePicked.ring)

await page.locator('.batch-btn', { hasText: '批量导出' }).click()
await delay(400)
const exportToast = await page.evaluate(() => document.querySelector('.el-message')?.textContent?.trim() || '')
ok('批量导出只针对选中的 1 份', /1\s*份/.test(exportToast), exportToast)
await page.evaluate(() => document.querySelectorAll('.el-message').forEach((el) => el.remove()))

// 全选
await page.locator('.pick-all').click()
await delay(220)
const allPicked = await page.evaluate(() => ({
  count: document.querySelectorAll('.report-card.is-picked').length,
  label: document.querySelector('.pick-all')?.textContent?.replace(/\s+/g, ''),
}))
ok('全选选中全部 6 份', allPicked.count === 6, `实际 ${allPicked.count} 份`)
ok('全选后按钮变成「取消全选」', /取消全选/.test(allPicked.label || ''), allPicked.label)
await page.screenshot({ path: 'docs/report-layout-preview/real-batch-mode.png' })
await page.locator('.pick-all').click()
await delay(220)
const nonePicked = await page.evaluate(() => document.querySelectorAll('.report-card.is-picked').length)
ok('再点一次取消全选', nonePicked === 0, `实际 ${nonePicked} 份`)

console.log('\n[9] 分类设置')
await page.locator('.report-card').nth(0).locator('.card-meta').click()
await page.locator('.report-card').nth(1).locator('.card-meta').click()
await delay(200)
await page.locator('.batch-btn', { hasText: '分类设置' }).click()
await delay(400)
const catDialog = await page.evaluate(() => ({
  visible: !!document.querySelector('.category-dialog'),
  chips: [...document.querySelectorAll('.cat-chip')].map((b) => b.textContent.trim()),
  hasInput: !!document.querySelector('.category-dialog input'),
  hint: document.querySelector('.cat-hint')?.textContent?.trim() || '',
}))
ok('分类弹窗能打开', catDialog.visible === true)
ok('有预设分类可点', catDialog.chips.length >= 4, catDialog.chips.join('/'))
ok('弹窗说明写清了影响份数', /2\s*份/.test(catDialog.hint), catDialog.hint)

await page.locator('.cat-chip', { hasText: '期末作品' }).click()
await delay(150)
await page.locator('.dlg-btn.primary').click()
await delay(500)
const afterCat = await page.evaluate(() => ({
  badges: [...document.querySelectorAll('.badge-cat')].map((el) => el.textContent.trim()),
  cards: document.querySelectorAll('.report-card').length,
}))
ok('分类保存后封面出现分类角标', afterCat.badges.length === 2 && afterCat.badges.every((b) => b === '期末作品'), afterCat.badges.join('/'))
ok('设置分类不影响卡片数量', afterCat.cards === 6, `实际 ${afterCat.cards} 份`)

await page.locator('.action-zone button', { hasText: '退出批量' }).click()
await delay(320)
const catFilter = await page.evaluate(() => ({
  selects: [...document.querySelectorAll('.toolbar-select')].length,
  hasCatOption: [...document.querySelectorAll('.el-select')].some((el) => el.textContent.includes('全部分类')),
}))
ok('有分类后自动出现「分类」筛选下拉', catFilter.selects === 2 && catFilter.hasCatOption, `下拉 ${catFilter.selects} 个`)

console.log('\n[10] 批量删除')
await page.locator('.action-zone button', { hasText: '批量管理' }).click()
await delay(300)
// 先清掉之前「已归到期末作品」的提示，否则后面 querySelector('.el-message')
// 抓到的是那条旧提示，会把「删除后有成功提示」误判成失败
await page.evaluate(() => document.querySelectorAll('.el-message').forEach((el) => el.remove()))
await page.locator('.report-card').nth(5).locator('.card-meta').click()
await delay(200)
await page.locator('.batch-btn', { hasText: '批量删除' }).click()
await delay(500)
const confirmBox = await page.evaluate(() => ({
  visible: !!document.querySelector('.el-message-box'),
  text: document.querySelector('.el-message-box__message')?.textContent?.trim() || '',
  title: document.querySelector('.el-message-box__title')?.textContent?.trim() || '',
}))
ok('批量删除先弹二次确认', confirmBox.visible === true, confirmBox.title)
ok('确认框写清删除份数', /1\s*份/.test(confirmBox.text), confirmBox.text.slice(0, 60))
await page.locator('.el-message-box__btns button', { hasText: '全部删除' }).click()
await delay(700)
const afterDelete = await page.evaluate(() => ({
  cards: document.querySelectorAll('.report-card').length,
  toast: document.querySelector('.el-message')?.textContent?.trim() || '',
}))
ok('确认后真的少了一份', afterDelete.cards === 5, `实际 ${afterDelete.cards} 份`)
ok('删除后有成功提示', /已删除/.test(afterDelete.toast), afterDelete.toast)

console.log('\n[11] 无脚本报错')
ok('页面无 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await browser.close()

console.log(`\n通过 ${pass} 项，失败 ${fails.length} 项`)
if (fails.length) {
  console.log('失败项：')
  fails.forEach((f) => console.log(' - ' + f))
  process.exit(1)
}
