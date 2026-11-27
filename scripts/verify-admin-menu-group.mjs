// 后台左侧栏「功能管理」折叠分组 + 导航区滚动 验收：
//  ① 顶层菜单从 10 项降到 7 项，「功能管理」是唯一分组
//  ② 默认收起；点开出现 8 个子项（API配置 / AI玩法中心 / AI图像功能管理 / 工作台管理 / 提示词库管理 / 报告工作流库 / AI用量与计费 / 智能体配置）
//  ③ 点子项能正常切页（左侧该子项高亮），组保持展开且高亮
//  ④ 刷新后仍保持展开（localStorage 记住）
//  ⑤ 视口变矮时只有导航区滚，「退出登录」不被顶出屏幕
//
// 只读验收：不点保存、不点真实测试、不产生任何 AI 调用。
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
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
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const EXPECT_TOP = ['数据大盘', '账号权限', '课程库管理', 'H5报告中心', '功能管理', '作品广场', '系统设置']
const EXPECT_CHILD = ['API 配置', 'AI玩法中心', 'AI图像功能管理', '工作台管理', '提示词库管理', '报告工作流库', 'AI 用量与计费', '智能体配置']
// 「功能管理」组是第一个分组；「作品广场」组是第二个。选择器必须按组限定，否则两个组会互相串。
const FM = '.nav-group:nth-of-type(1)'
const GS = '.nav-group:nth-of-type(2)'

try {
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

  const topLabels = async () => page.$$eval('.admin-nav > button, .admin-nav > .nav-group > .nav-group-toggle', (els) =>
    els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()))

  // ① 顶层 7 项、文案与顺序
  const labels = await topLabels()
  check('① 顶层菜单 7 项', labels.length === 7, labels)
  check('① 顶层文案与顺序正确', EXPECT_TOP.every((t, i) => (labels[i] || '').includes(t)), labels)
  check('① 原来的 5 个 AI 菜单已不在顶层', !labels.some((t) => /API 配置|AI玩法中心|提示词库管理|报告工作流库|智能体配置/.test(t)), labels)

  // ② 默认收起 + 点开展开 8 个子项（只看「功能管理」组）
  const bodyVisibleBefore = await page.locator(`${FM} .nav-group-body`).isVisible()
  check('② 默认收起（子项不可见）', bodyVisibleBefore === false, { bodyVisibleBefore })
  await page.locator(`${FM} .nav-group-toggle`).click()
  await delay(350)
  const bodyVisibleAfter = await page.locator(`${FM} .nav-group-body`).isVisible()
  const childLabels = await page.$$eval(`${FM} .nav-group-body .nav-child`, (els) =>
    els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
  check('② 点开后子项可见', bodyVisibleAfter === true, { bodyVisibleAfter })
  check('② 子项 8 个且文案正确', childLabels.length === 8 && EXPECT_CHILD.every((t, i) => (childLabels[i] || '').includes(t)), childLabels)
  const caretRotated = await page.evaluate((sel) => {
    const caret = document.querySelector(`${sel} .nav-group-toggle .nav-caret`)
    return getComputedStyle(caret).transform
  }, FM)
  // 展开态是 rotate(45deg) → matrix(cos45, sin45, -sin45, cos45) ，b 分量 > 0.3 即视为翻上来了
  const caretSin = Number((/matrix\(([^)]+)\)/.exec(caretRotated)?.[1] || '').split(',')[1])
  check('② 展开后箭头翻转（sin 分量 > 0.3）', caretSin > 0.3, { caretRotated, caretSin })
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-menu-group-open.png') })

  // ③ 点子项切页 + 高亮
  await page.locator(`${FM} .nav-group-body .nav-child`, { hasText: '智能体配置' }).click()
  await delay(1200)
  const afterChild = await page.evaluate((sel) => ({
    activeChild: document.querySelector(`${sel} .nav-group-body .nav-child.active`)?.textContent?.replace(/\s+/g, ' ').trim() || '',
    groupActive: document.querySelector(`${sel} .nav-group-toggle`)?.classList.contains('active'),
    groupOpen: document.querySelector(`${sel} .nav-group-toggle`)?.classList.contains('open'),
    bodyVisible: !!document.querySelector(`${sel} .nav-group-body`) && getComputedStyle(document.querySelector(`${sel} .nav-group-body`)).display !== 'none',
    childActive: [...document.querySelectorAll(`${sel} .nav-group-body .nav-child`)]
      .filter((el) => el.classList.contains('active'))
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
  }), FM)
  check('③ 点子项后左侧高亮切到「智能体配置」', afterChild.activeChild.includes('智能体配置'), afterChild)
  check('③ 分组按钮保持展开 + 高亮', afterChild.groupActive && afterChild.groupOpen && afterChild.bodyVisible, afterChild)
  check('③ 只有被点的子项高亮', afterChild.childActive.length === 1 && afterChild.childActive[0].includes('智能体配置'), afterChild)

  // ④ 刷新后仍展开
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.admin-nav', { timeout: 30000 })
  await delay(1000)
  const afterReload = await page.evaluate((sel) => ({
    bodyVisible: !!document.querySelector(`${sel} .nav-group-body`) && getComputedStyle(document.querySelector(`${sel} .nav-group-body`)).display !== 'none',
    stored: window.localStorage.getItem('admin-nav-function-group-open-functionManagement'),
  }), FM)
  check('④ 刷新后分组仍展开', afterReload.bodyVisible === true && afterReload.stored === '1', afterReload)

  // ⑤ 视口变矮：导航区自己滚，退出登录留在屏幕里
  await page.setViewportSize({ width: 1440, height: 620 })
  await delay(600)
  const scrollState = await page.evaluate(() => {
    const nav = document.querySelector('.admin-nav')
    const footer = document.querySelector('.sidebar-footer')
    const logout = footer?.querySelector('button')
    const navRect = nav.getBoundingClientRect()
    const navStyle = getComputedStyle(nav)
    return {
      overflowY: navStyle.overflowY,
      scrollHeight: nav.scrollHeight,
      clientHeight: nav.clientHeight,
      scrollable: nav.scrollHeight > nav.clientHeight + 2,
      navBottom: Math.round(navRect.bottom),
      footerTop: footer ? Math.round(footer.getBoundingClientRect().top) : null,
      logoutBottom: logout ? Math.round(logout.getBoundingClientRect().bottom) : null,
      viewportH: window.innerHeight,
      pageScrollHeight: document.documentElement.scrollHeight,
    }
  })
  check('⑤ 导航区可纵向滚动（overflow-y:auto 且内容超出）', scrollState.overflowY === 'auto' && scrollState.scrollable, scrollState)
  check('⑤ 导航区没有压住底部（nav 底 <= footer 顶）', scrollState.navBottom <= (scrollState.footerTop ?? 0), scrollState)
  check('⑤ 「退出登录」仍在视口内', (scrollState.logoutBottom ?? 9999) <= scrollState.viewportH, scrollState)
  await page.evaluate(() => { document.querySelector('.admin-nav').scrollTop = 9999 })
  await delay(300)
  const scrolled = await page.evaluate(() => {
    const nav = document.querySelector('.admin-nav')
    const logout = document.querySelector('.sidebar-footer button')
    return { scrollTop: Math.round(nav.scrollTop), logoutBottom: Math.round(logout.getBoundingClientRect().bottom), viewportH: window.innerHeight }
  })
  check('⑤ 滚到底后「退出登录」没有跟着滚走', scrolled.scrollTop > 0 && scrolled.logoutBottom <= scrolled.viewportH, scrolled)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-menu-nav-scroll.png') })

  // ⑥ 收起后子项隐藏，localStorage 记为 0
  await page.setViewportSize({ width: 1440, height: 900 })
  await delay(400)
  await page.locator(`${FM} .nav-group-toggle`).click()
  await delay(300)
  const collapsed = await page.evaluate((sel) => ({
    bodyVisible: !!document.querySelector(`${sel} .nav-group-body`) && getComputedStyle(document.querySelector(`${sel} .nav-group-body`)).display !== 'none',
    stored: window.localStorage.getItem('admin-nav-function-group-open-functionManagement'),
  }), FM)
  check('⑥ 再点一次收起且记住状态', collapsed.bodyVisible === false && collapsed.stored === '0', collapsed)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-menu-group-collapsed.png') })

  // ⑦ 点「报告工作流库」子项能进到工作流库页面
  await page.locator(`${FM} .nav-group-toggle`).click()
  await delay(250)
  await page.locator(`${FM} .nav-group-body .nav-child`, { hasText: '报告工作流库' }).click()
  await delay(1500)
  check('⑦ 子项「报告工作流库」能打开工作流库页面', /\/admin\/h5-report-workflows$/.test(new URL(page.url()).pathname), page.url())

  // ⑧ 窄屏（手机）下折叠组独占一整行，且不出现横向滚动
  await page.setViewportSize({ width: 760, height: 900 })
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.admin-nav', { timeout: 30000 })
  await delay(900)
  const mobile = await page.evaluate(() => {
    const nav = document.querySelector('.admin-nav')
    const group = document.querySelector('.nav-group')
    const navRect = nav.getBoundingClientRect()
    const groupRect = group.getBoundingClientRect()
    return {
      overflowY: getComputedStyle(nav).overflowY,
      groupWidthRatio: Math.round((groupRect.width / navRect.width) * 100) / 100,
      hScroll: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  check('⑧ 窄屏下折叠组独占一行（宽度占比 > 0.9）', mobile.groupWidthRatio > 0.9, mobile)
  check('⑧ 窄屏下没有横向滚动条', mobile.hScroll <= 2, mobile)
  check('⑧ 窄屏下导航区不再圈成滚动框', mobile.overflowY !== 'auto', mobile)
  await page.screenshot({ path: path.join(OUT_DIR, 'admin-menu-group-mobile.png') })

  // ⑨ 「作品广场」组：把原来顶层的「内容审核」收进来，并新增「分类管理」
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.admin-nav', { timeout: 30000 })
  await delay(900)
  const gsToggle = page.locator(`${GS} .nav-group-toggle`)
  check('⑨ 「作品广场」组存在且文案正确', (await gsToggle.textContent()).includes('作品广场'), await gsToggle.textContent())
  await gsToggle.click()
  await delay(350)
  const gsChildren = await page.$$eval(`${GS} .nav-group-body .nav-child`, (els) =>
    els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
  check('⑨ 「作品广场」下有 2 个子项：分类管理 + 内容审核',
    gsChildren.length === 2 && gsChildren[0].includes('分类管理') && gsChildren[1].includes('内容审核'), gsChildren)
  check('⑨ 「内容审核」已不在顶层', !(await topLabels()).some((t) => t.includes('内容审核')), await topLabels())

  // 点「分类管理」能打开面板
  await page.locator(`${GS} .nav-group-body .nav-child`, { hasText: '分类管理' }).click()
  await delay(1500)
  const catPanel = await page.evaluate(() => ({
    hasPanel: !!document.querySelector('.gallery-category-panel'),
    url: location.href,
    text: document.querySelector('.gallery-category-panel')?.innerText?.slice(0, 200) || '',
  }))
  check('⑨ 点「分类管理」打开分类面板', catPanel.hasPanel, catPanel)
  check('⑨ 地址栏带 module=galleryCategories', catPanel.url.includes('module=galleryCategories'), catPanel.url)

  // 两个组各存各的展开状态，互不影响：先清掉「功能管理」的键，只动「作品广场」，看会不会把它带起来
  await page.evaluate(() => { window.localStorage.removeItem('admin-nav-function-group-open-functionManagement') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.admin-nav', { timeout: 30000 })
  await delay(900)
  const gsOnly = await page.evaluate((sel) => ({
    fmOpen: !!document.querySelector(`${sel} .nav-group-body`) && getComputedStyle(document.querySelector(`${sel} .nav-group-body`)).display !== 'none',
    gsOpen: !!document.querySelector('.nav-group:nth-of-type(2) .nav-group-body') && getComputedStyle(document.querySelector('.nav-group:nth-of-type(2) .nav-group-body')).display !== 'none',
  }), FM)
  check('⑨ 「功能管理」收起时「作品广场」仍独立展开（存储键没串）', gsOnly.fmOpen === false && gsOnly.gsOpen === true, gsOnly)

  const fatal = errors.filter((t) => !/favicon|ResizeObserver|Failed to load resource/i.test(t))
  check('⑨ 控制台无新报错', fatal.length === 0, fatal.slice(0, 4))
} catch (error) {
  check('脚本执行未抛异常', false, String(error?.stack || error).slice(0, 500))
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.pass).length
console.log(`\n==== ${passed}/${results.length} 项通过 ====`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((f) => console.log(' - ' + f))
  process.exitCode = 1
}
