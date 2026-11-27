// 验收：H5 报告预览页的手机框。
// 1) 框里只显示「工作流结果图」，旧排版页不许出现
// 2) 手机外壳跟着图片真实画幅走：竖图=竖手机、横图=横手机、方图=方手机
// 3) 任何画幅下整张图都完整可见，不裁边、不变形
// 全程脱网、不调任何模型（草稿是种进去的假数据）。
// 用法：node scripts/verify-h5-preview-images.mjs
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3000'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// 每张图颜色不同，便于肉眼核对翻页是不是真的换了图。宽高可指定，用来模拟不同画幅。
const img = (tag, width = 390, height = 844) => {
  const hue = [...tag].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="hsl(${hue},70%,55%)"/><text x="${width / 2}" y="${height / 2}" font-size="${Math.round(Math.min(width, height) / 8)}" text-anchor="middle" fill="#fff">${tag}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
if (!login.ok) throw new Error(`登录失败 ${login.status}`)
const cookies = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).map((pair) => {
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1), domain: '127.0.0.1', path: '/' }
})

const projectData = {
  id: `verify-preview-${Date.now().toString(36)}`,
  title: '预览页结果图验收',
  difficulty: 'pro',
  prompt: '水彩风格的下雨城市',
  sketchOriginal: img('sketch'),
  versions: [{ id: 'v1', imageUrl: img('v1') }],
  finalVersionId: 'v1',
  videos: [],
  models3d: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// 工作流实际可能出的三种画幅
const PORTRAIT = { width: 864, height: 1536 }   // 9:16 竖屏
const LANDSCAPE = { width: 1536, height: 864 }  // 16:9 横屏
const SQUARE = { width: 1024, height: 1024 }    // 1:1 方图

// 模拟「工作流出了 3 张结果图」之后，生成页写进 sessionStorage 的那份草稿（默认竖图）
const draft = {
  projectId: projectData.id,
  reportTitle: '我的城市观察报告',
  idea: '我想画一条下雨的街道',
  templateId: 'h5-ai-tech',
  availableTemplateIds: ['h5-ai-tech'],
  currentPageIndex: 0,
  pageImages: [
    { id: 'workflow-1', label: '结果图 1', url: img('R1', PORTRAIT.width, PORTRAIT.height) },
    { id: 'workflow-2', label: '结果图 2', url: img('R2', PORTRAIT.width, PORTRAIT.height) },
    { id: 'workflow-3', label: '结果图 3', url: img('R3', PORTRAIT.width, PORTRAIT.height) },
  ],
}

// 打开预览页并等图片就位，返回量好的尺寸
async function openPreview(context, pageDraft) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.addInitScript((seed) => {
    localStorage.setItem('art-studio-difficulty', 'pro')
    localStorage.setItem('art-studio-current-draft', JSON.stringify(seed.project))
    localStorage.setItem('art-studio-projects', JSON.stringify([seed.project]))
    sessionStorage.setItem('advanced-h5-preview-draft', JSON.stringify(seed.draft))
  }, { project: projectData, draft: pageDraft })
  await page.goto(`${BASE}/student/h5-report/preview`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  for (let i = 0; i < 80; i += 1) {
    if (await page.locator('.phone-renderer-wrap .image-stage img').count()) break
    await delay(250)
  }
  // 等图片 onload 上报画幅、外壳重算完成
  await delay(900)
  return { page, errors }
}

// 量外壳、屏幕区、图片三层的实际尺寸
function measure(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { width: +r.width.toFixed(1), height: +r.height.toFixed(1), top: +r.top.toFixed(1), left: +r.left.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1) }
    }
    const image = document.querySelector('.phone-renderer-wrap .image-stage img')
    return {
      wrap: rect('.phone-renderer-wrap'),
      shell: rect('.phone-shell'),
      stage: rect('.phone-renderer-wrap .image-stage'),
      img: rect('.phone-renderer-wrap .image-stage img'),
      natural: image ? { width: image.naturalWidth, height: image.naturalHeight } : null,
      ratioLabel: document.querySelector('.stage-heading > small')?.textContent?.trim() || '',
      headingLabel: document.querySelector('.stage-heading span')?.textContent?.trim() || '',
      stageOverflow: (() => {
        const stage = document.querySelector('.phone-renderer-wrap .image-stage')
        return stage ? stage.scrollHeight - stage.clientHeight : 0
      })(),
    }
  })
}

const near = (a, b, tolerance = 0.02) => Math.abs(a - b) <= tolerance * Math.max(Math.abs(a), Math.abs(b), 1)

// img 用了 object-fit: contain，元素外框 ≠ 真正看到的画面。
// 按 contain 规则算出画面实际占的宽高，用来判断「有没有被裁、有没有变形」。
function containFit(box, natural) {
  const scale = Math.min(box.width / natural.width, box.height / natural.height)
  return { width: natural.width * scale, height: natural.height * scale }
}

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies(cookies)

  // ---------- ① 竖图：外壳必须是竖着的手机 ----------
  const { page, errors } = await openPreview(context, draft)
  const portrait = await measure(page)

  check('手机框里渲染出结果图', portrait.img !== null)
  check('第一页就是工作流第 1 张结果图', (await page.locator('.phone-renderer-wrap .image-stage img').getAttribute('src')) === draft.pageImages[0].url)
  check('手机框里没有旧版排版渲染器', (await page.locator('.phone-renderer-wrap .report-renderer').count()) === 0)
  check('手机框里没有旧版产品故事页', (await page.locator('.phone-renderer-wrap .product-story-image-page').count()) === 0)

  // 外壳存在（深色机身），不是一张裸图
  const shellBg = await page.locator('.phone-shell').evaluate((el) => getComputedStyle(el).backgroundColor)
  check('有手机外壳（深色机身）', shellBg === 'rgb(13, 33, 59)', shellBg)

  check('竖图时手机是竖着的', portrait.shell.height > portrait.shell.width, `${portrait.shell.width}×${portrait.shell.height}`)
  check('屏幕区域比例 = 图片真实比例(9:16)', near(portrait.stage.width / portrait.stage.height, PORTRAIT.width / PORTRAIT.height), `屏幕 ${(portrait.stage.width / portrait.stage.height).toFixed(4)} vs 图 ${(PORTRAIT.width / PORTRAIT.height).toFixed(4)}`)
  check('图片完整铺满屏幕（无留白无裁切）', near(portrait.img.width / portrait.img.height, PORTRAIT.width / PORTRAIT.height) && near(portrait.img.width, portrait.stage.width) && near(portrait.img.height, portrait.stage.height), `图 ${portrait.img.width}×${portrait.img.height} / 屏 ${portrait.stage.width}×${portrait.stage.height}`)
  check('外壳没有超出中间区域', portrait.shell.top >= portrait.wrap.top - 1 && portrait.shell.bottom <= portrait.wrap.bottom + 1 && portrait.shell.left >= portrait.wrap.left - 1 && portrait.shell.right <= portrait.wrap.right + 1)
  check('屏幕区没有内部溢出', portrait.stageOverflow <= 0, `${portrait.stageOverflow}px`)
  check('顶部标注画幅为 9:16 竖图', /9:16/.test(portrait.ratioLabel) && /竖/.test(portrait.ratioLabel), portrait.ratioLabel)
  check('顶部标题写“竖版”', /竖版/.test(portrait.headingLabel), portrait.headingLabel)
  // 风格切换已经按用户要求删除：报告外观只由工作流结果图决定，再摆风格卡是误导。
  check('右侧不再有「H5报告风格」切换面板', (await page.locator('.preview-settings .style-block').count()) === 0 && (await page.locator('.preview-template-list').count()) === 0)
  check('顶部不再显示「当前风格」', !/当前风格/.test(await page.locator('.preview-title small').innerText()))

  // 左侧导航 + 翻页
  const navLabels = await page.locator('.chapter-sidebar nav button strong').allInnerTexts()
  check('左侧导航按结果图数量生成', navLabels.join(',') === '结果图 1,结果图 2,结果图 3', navLabels.join(','))
  check('页码按结果图张数计算', (await page.locator('.stage-controls span').innerText()).trim() === '1 / 3')

  await page.locator('.stage-controls button').last().click()
  await delay(400)
  check('点下一页换成第 2 张结果图', (await page.locator('.phone-renderer-wrap .image-stage img').getAttribute('src')) === draft.pageImages[1].url)
  check('翻页后页码同步', (await page.locator('.stage-controls span').innerText()).trim() === '2 / 3')

  await page.locator('.chapter-sidebar nav button').nth(2).click()
  await delay(400)
  check('点左侧导航跳到第 3 张结果图', (await page.locator('.phone-renderer-wrap .image-stage img').getAttribute('src')) === draft.pageImages[2].url)

  await page.screenshot({ path: 'logs/verify-h5-preview-images.png', fullPage: false })
  check('竖图页无脚本报错', errors.length === 0, errors.slice(0, 2).join(' | '))
  await page.close()

  // ---------- ② 横图：外壳必须变成横躺的手机 ----------
  const { page: landscapePage, errors: landscapeErrors } = await openPreview(context, {
    ...draft,
    pageImages: [{ id: 'workflow-1', label: '结果图 1', url: img('L1', LANDSCAPE.width, LANDSCAPE.height) }],
  })
  const landscape = await measure(landscapePage)
  check('横图时手机变成横躺的', landscape.shell.width > landscape.shell.height, `${landscape.shell.width}×${landscape.shell.height}`)
  check('横图屏幕比例 = 图片真实比例(16:9)', near(landscape.stage.width / landscape.stage.height, LANDSCAPE.width / LANDSCAPE.height), `屏幕 ${(landscape.stage.width / landscape.stage.height).toFixed(4)}`)
  check('横图完整显示不裁边', near(landscape.img.width / landscape.img.height, LANDSCAPE.width / LANDSCAPE.height) && near(landscape.img.width, landscape.stage.width), `图 ${landscape.img.width}×${landscape.img.height}`)
  check('横图外壳没超出中间区域', landscape.shell.top >= landscape.wrap.top - 1 && landscape.shell.bottom <= landscape.wrap.bottom + 1 && landscape.shell.left >= landscape.wrap.left - 1 && landscape.shell.right <= landscape.wrap.right + 1, `壳 ${landscape.shell.top}~${landscape.shell.bottom} / 区 ${landscape.wrap.top}~${landscape.wrap.bottom}`)
  check('顶部标注画幅为 16:9 横图', /16:9/.test(landscape.ratioLabel) && /横/.test(landscape.ratioLabel), landscape.ratioLabel)
  check('顶部标题写“横版”', /横版/.test(landscape.headingLabel), landscape.headingLabel)
  check('横图页无脚本报错', landscapeErrors.length === 0, landscapeErrors.slice(0, 2).join(' | '))
  await landscapePage.screenshot({ path: 'logs/verify-h5-preview-landscape.png', fullPage: false })
  await landscapePage.close()

  // ---------- ③ 方图：家庭手机没有方屏，必须装进竖手机里 ----------
  const { page: squarePage, errors: squareErrors } = await openPreview(context, {
    ...draft,
    pageImages: [{ id: 'workflow-1', label: '结果图 1', url: img('S1', SQUARE.width, SQUARE.height) }],
  })
  const square = await measure(squarePage)
  check('方图时外壳仍是竖手机（不出现方形手机）', square.shell.height > square.shell.width, `${square.shell.width}×${square.shell.height}`)
  check('方图外壳比例接近 9:16 竖屏', Math.abs(square.shell.width / square.shell.height - 9 / 16) < 0.06, `${(square.shell.width / square.shell.height).toFixed(3)}`)
  // img 元素被撑满整个屏幕框，真正看到的画面由 object-fit:contain 决定。
  // 方图装进竖屏后应该上下留白、画面本身仍是 1:1 且完整（不是被拉扁或裁掉）。
  const squareShown = containFit(square.stage, SQUARE)
  check('方图完整显示不被裁切', near(squareShown.width / squareShown.height, 1) && squareShown.width <= square.stage.width + 1 && squareShown.height <= square.stage.height + 1, `显示 ${Math.round(squareShown.width)}×${Math.round(squareShown.height)} / 屏 ${square.stage.width}×${square.stage.height}`)
  check('顶部标注画幅为 1:1 方图', /1:1/.test(square.ratioLabel) && /方/.test(square.ratioLabel), square.ratioLabel)
  check('方图页无脚本报错', squareErrors.length === 0, squareErrors.slice(0, 2).join(' | '))
  await squarePage.screenshot({ path: 'logs/verify-h5-preview-square.png', fullPage: false })
  await squarePage.close()

  // ---------- ④ 同一份报告里竖图和横图混着出现，外壳要跟着换 ----------
  const { page: mixedPage, errors: mixedErrors } = await openPreview(context, {
    ...draft,
    pageImages: [
      { id: 'workflow-1', label: '结果图 1', url: img('M1', PORTRAIT.width, PORTRAIT.height) },
      { id: 'workflow-2', label: '结果图 2', url: img('M2', LANDSCAPE.width, LANDSCAPE.height) },
    ],
  })
  const mixedFirst = await measure(mixedPage)
  await mixedPage.locator('.stage-controls button').last().click()
  await delay(700)
  const mixedSecond = await measure(mixedPage)
  check('混排报告：第 1 页竖图竖着显示', mixedFirst.shell.height > mixedFirst.shell.width, `${mixedFirst.shell.width}×${mixedFirst.shell.height}`)
  check('混排报告：翻到横图后外壳自动转横', mixedSecond.shell.width > mixedSecond.shell.height, `${mixedSecond.shell.width}×${mixedSecond.shell.height}`)
  check('混排报告：横图同样完整显示', near(mixedSecond.img.width / mixedSecond.img.height, LANDSCAPE.width / LANDSCAPE.height), `${mixedSecond.img.width}×${mixedSecond.img.height}`)
  check('混排页无脚本报错', mixedErrors.length === 0, mixedErrors.slice(0, 2).join(' | '))
  await mixedPage.close()

  // ---------- ⑤ 窗口变小时外壳要跟着缩，不能溢出 ----------
  const { page: resizePage, errors: resizeErrors } = await openPreview(context, draft)
  const sizes = [[1280, 800], [1100, 700], [980, 640]]
  let resizeOk = true
  const resizeDetail = []
  for (const [width, height] of sizes) {
    await resizePage.setViewportSize({ width, height })
    await delay(700)
    const m = await measure(resizePage)
    const inside = m.shell.top >= m.wrap.top - 1 && m.shell.bottom <= m.wrap.bottom + 1 && m.shell.left >= m.wrap.left - 1 && m.shell.right <= m.wrap.right + 1
    const filled = m.img && near(m.img.width, m.stage.width) && near(m.img.height, m.stage.height)
    if (!inside || !filled) resizeOk = false
    resizeDetail.push(`${width}×${height}:壳${m.shell.width}×${m.shell.height}${inside ? '' : '(溢出)'}${filled ? '' : '(图未填满)'}`)
  }
  check('窗口缩小后手机外壳始终完整可见', resizeOk, resizeDetail.join(' | '))
  check('窗口缩放无脚本报错', resizeErrors.length === 0, resizeErrors.slice(0, 2).join(' | '))
  await resizePage.setViewportSize({ width: 1100, height: 700 })
  await delay(500)
  await resizePage.screenshot({ path: 'logs/verify-h5-preview-small-window.png', fullPage: false })
  await resizePage.close()

  // ---------- ⑥ 没有结果图时不能退回假页 ----------
  const { page: emptyPage, errors: emptyErrors } = await openPreview(context, { ...draft, pageImages: [] })
  check('没结果图时不渲染任何假页', (await emptyPage.locator('.phone-renderer-wrap .report-renderer').count()) === 0)
  // 手机外壳必须还在：以前空状态把整台手机藏了，学生点「预览」只看到一片白，以为功能坏了。
  const emptyShell = await emptyPage.locator('.phone-renderer-wrap .phone-shell').count()
  check('没结果图时手机外壳仍然显示', emptyShell === 1, `找到 ${emptyShell} 个 .phone-shell`)
  const emptyShellBg = emptyShell ? await emptyPage.locator('.phone-renderer-wrap .phone-shell').evaluate((el) => getComputedStyle(el).backgroundColor) : ''
  check('空状态时外壳仍是深色机身', emptyShellBg === 'rgb(13, 33, 59)', emptyShellBg)
  const emptyShellBox = emptyShell ? await emptyPage.locator('.phone-renderer-wrap .phone-shell').boundingBox() : null
  check('空状态外壳有实际尺寸（不是 0×0）', Boolean(emptyShellBox && emptyShellBox.width > 100 && emptyShellBox.height > 100), emptyShellBox ? `${Math.round(emptyShellBox.width)}×${Math.round(emptyShellBox.height)}` : '无')
  const emptyInsideShell = await emptyPage.locator('.phone-shell .phone-empty').count()
  check('空状态文字装在手机屏幕里', emptyInsideShell === 1, `找到 ${emptyInsideShell} 个`)
  const emptyText = await emptyPage.locator('.phone-empty').innerText().catch(() => '')
  check('没结果图时给出明确空状态', /还没有结果图/.test(emptyText), emptyText.replace(/\s+/g, ' ').slice(0, 60))
  check('空状态页无脚本报错', emptyErrors.length === 0, emptyErrors.slice(0, 2).join(' | '))
  await emptyPage.screenshot({ path: 'logs/verify-h5-preview-empty.png', fullPage: false })
  await emptyPage.close()
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.pass)
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
process.exit(failed.length ? 1 : 0)
