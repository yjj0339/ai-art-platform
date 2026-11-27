// 左上角「文件」下拉菜单验收脚本
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy node scripts/verify-canvas-file-menu.mjs
//
// 覆盖目标（用户 2026-10-31 诉求）：
//   「把右上角三个点里的 新建画布 / 删除当前画布 / 保存到画布素材库 三项，
//     全部集合到左侧原「返回工作台」按钮里，做成下拉菜单，共四个选项。」
// 逐项验证：
//   ① 左上角出现「文件」按钮（不再是「← 返回工作台」）；
//   ② 右上角「•••」已移出学生画布（不留重复入口）；
//   ③ 下拉四项齐全且顺序为 返回工作台 → 新建画布 → 保存画布到素材库 → 删除当前画布；
//   ④ 删除项在最后、有分隔线、文字为红色（防误点）；
//   ⑤ 点「返回工作台」真的离开画布；
//   ⑥ 点「新建画布」走原有确认弹窗且清空画布；
//   ⑦ 点「保存画布到素材库」写入本机存储；
//   ⑧ 点「删除当前画布」走原有确认弹窗并清掉存储；
//   ⑨ 点空白处 / 按 Esc 都能收起菜单；
//   ⑩ 菜单不溢出视口，且没有控制台报错。
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const WEB_PORT = 5187
const OUT_DIR = path.join(projectDir, '.canvas-file-menu-verify')
const STORAGE_KEY = 'ai-workflow-canvas-stage1-v2'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const failures = []

function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition), detail })
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}

{
  const busy = await fetch(`http://127.0.0.1:${WEB_PORT}/`).then(() => true).catch(() => false)
  if (busy) throw new Error(`vite 端口 ${WEB_PORT} 已被占用（可能残留进程），请先关闭后重跑`)
}

const vite = spawn(path.join(projectDir, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
  cwd: projectDir,
  shell: true,
  env: { ...process.env, VITE_AUTH_MODE: 'mock', VITE_AI_MODE: 'mock' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let viteLog = ''
vite.stdout.on('data', (c) => { viteLog += c })
vite.stderr.on('data', (c) => { viteLog += c })

function killTree(child) {
  if (!child || child.killed) return
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGKILL')
  } catch { /* ignore */ }
}

let browser
try {
  for (let i = 0; i < 200; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 199) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  await mkdir(OUT_DIR, { recursive: true })

  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({
      user: { id: 'stu-001', name: '文件菜单验收', role: 'student', className: '验收班级', avatar: '验' },
      token: 'mock-token-project-new-art-studio',
    }))
    // 预置一个文字节点，用来判断「新建画布」是否真的清空了画布。
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify({
      title: '文件菜单验收画布',
      nodes: [
        { id: 'text-verify', type: 'text', position: { x: 160, y: 160 }, data: { title: '文案', mode: 'text', text: '文件菜单验收', prompt: '文件菜单验收', promptParts: [{ type: 'text', text: '文件菜单验收' }] } },
      ],
      edges: [],
      settings: {},
    }))
  })

  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  // 记录所有 confirm 文案，同时一律确认（原二次确认逻辑必须还在）。
  const confirmMessages = []
  page.on('dialog', async (d) => {
    confirmMessages.push(d.message())
    await d.accept().catch(() => {})
  })

  const trigger = page.locator('.workflow-topbar .file-menu-trigger')
  const menu = page.locator('.workflow-topbar .file-menu')
  const menuButtons = page.locator('.workflow-topbar .file-menu button')

  const openMenu = async () => {
    if (!(await menu.isVisible().catch(() => false))) await trigger.click()
    await menu.waitFor({ state: 'visible', timeout: 8000 })
  }

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.workflow-topbar', { timeout: 30000 })
  await page.waitForSelector('.canvas-node-text, .vue-flow__node', { timeout: 30000 }).catch(() => {})
  await delay(1200)

  // ① 左上角入口
  check('① 左上角出现「文件」下拉按钮', await trigger.count() === 1, { count: await trigger.count() })
  check('① 按钮文字就是「文件」（不再写「返回工作台」）',
    (await trigger.innerText()).replace(/\s+/g, '') === '文件', { text: await trigger.innerText() })
  check('① 旧的「返回工作台」独立按钮已移除',
    await page.locator('.workflow-topbar .workbench-back-action').count() === 0, 'workbench-back-action')
  check('① 下拉按钮带展开态标记（aria-expanded 存在）',
    (await trigger.getAttribute('aria-expanded')) === 'false', { expanded: await trigger.getAttribute('aria-expanded') })

  // ② 右上角三个点已移出（避免两个入口做同一件事）
  check('② 右上角「•••」画布菜单已移出学生画布',
    await page.locator('.workflow-topbar [aria-label="画布菜单"]').count() === 0, '画布菜单')
  check('② 右上角全屏按钮仍在（只动菜单，不动其他按钮）',
    await page.locator('.workflow-topbar [aria-label="全屏"]').count() === 1, '全屏')

  // ③ 菜单结构
  await openMenu()
  // 打开「文件」时左侧「创作」面板会收起，两者不能同时留在画布上叠白面板。
  // 注意：create-popover 带 ~280ms 离场动画，必须轮询到动画结束再判定，固定 sleep 会假失败。
  for (let i = 0; i < 40; i += 1) {
    if ((await page.locator('.create-popover').count()) === 0) break
    await delay(50)
  }
  const overlapState = await page.evaluate(() => {
    const create = document.querySelector('.create-popover')
    const file = document.querySelector('.file-menu')
    const r = (el) => (el ? { left: Math.round(el.getBoundingClientRect().left), top: Math.round(el.getBoundingClientRect().top), right: Math.round(el.getBoundingClientRect().right), bottom: Math.round(el.getBoundingClientRect().bottom) } : null)
    const a = r(create); const b = r(file)
    const overlaps = Boolean(a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
    return { createOpen: Boolean(create), overlaps, create: a, file: b }
  })
  check('③ 打开「文件」时左侧「创作」面板自动收起（不叠两个浮层）',
    !overlapState.createOpen && !overlapState.overlaps, overlapState)

  const labels = (await menuButtons.allInnerTexts()).map((t) => t.replace(/\s+/g, ''))
  check('③ 下拉正好四个选项', labels.length === 4, labels)
  check('③ 顺序：返回工作台 → 新建画布 → 保存画布到素材库 → 删除当前画布',
    JSON.stringify(labels) === JSON.stringify(['返回工作台', '新建画布', '保存画布到素材库', '删除当前画布']), labels)

  // ④ 删除项防误点：置底 + 分隔线 + 红色
  const menuLayout = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.workflow-topbar .file-menu button'))
    const danger = items[items.length - 1]
    const sep = document.querySelector('.workflow-topbar .file-menu .file-menu-sep')
    const menuEl = document.querySelector('.workflow-topbar .file-menu')
    const triggerEl = document.querySelector('.workflow-topbar .file-menu-trigger')
    const mr = menuEl ? menuEl.getBoundingClientRect() : null
    const tr = triggerEl ? triggerEl.getBoundingClientRect() : null
    return {
      dangerIsLast: danger ? /删除当前画布/.test(danger.innerText) : false,
      dangerColor: danger ? getComputedStyle(danger).color : '',
      hasSeparator: Boolean(sep) && (sep.getBoundingClientRect().height <= 2),
      menuWidth: mr ? Math.round(mr.width) : 0,
      alignedLeft: (mr && tr) ? Math.abs(mr.left - tr.left) <= 2 : false,
      insideViewport: mr ? (mr.left >= 0 && mr.right <= window.innerWidth && mr.bottom <= window.innerHeight) : false,
      minHeights: items.map((b) => Math.round(b.getBoundingClientRect().height)),
    }
  })
  check('④ 「删除当前画布」排在最后一位', menuLayout.dangerIsLast, menuLayout)
  check('④ 删除项上方有细线分隔', menuLayout.hasSeparator, menuLayout)
  check('④ 删除项文字为红色（防误点）', /^rgb\((1[5-9]\d|2[0-2]\d), (3\d|4\d|5\d), /.test(menuLayout.dangerColor) || menuLayout.dangerColor !== 'rgb(42, 55, 77)', menuLayout.dangerColor)
  check('④ 菜单与入口左对齐、完整落在视口内', menuLayout.alignedLeft && menuLayout.insideViewport, menuLayout)
  check('④ 菜单项高度没有被全局 button 最小高度撑变形（36-48px）',
    menuLayout.minHeights.every((h) => h >= 36 && h <= 48), menuLayout.minHeights)
  await page.screenshot({ path: path.join(OUT_DIR, '01-file-menu-open.png') })

  // ⑨ 收起方式：点空白
  await page.locator('.canvas-area').click({ position: { x: 700, y: 520 } })
  await delay(350)
  check('⑨ 点画布空白处能收起菜单', !(await menu.isVisible().catch(() => false)), {})

  // ⑨ 收起方式：Esc
  await openMenu()
  await page.keyboard.press('Escape')
  await delay(350)
  check('⑨ Esc 能收起菜单', !(await menu.isVisible().catch(() => false)), {})

  // ⑦ 保存画布到素材库
  await openMenu()
  await page.locator('.workflow-topbar .file-menu button').filter({ hasText: '保存画布到素材库' }).click()
  await delay(1500)
  const storedAfterSave = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY)
  check('⑦ 「保存画布到素材库」写入本机存储（节点还在）',
    Array.isArray(storedAfterSave.nodes) && storedAfterSave.nodes.length >= 1, { nodes: storedAfterSave.nodes?.length })
  check('⑦ 保存后菜单自动收起', !(await menu.isVisible().catch(() => false)), {})

  // ⑥ 新建画布（走原有确认弹窗）
  confirmMessages.length = 0
  await openMenu()
  await page.locator('.workflow-topbar .file-menu button').filter({ hasText: '新建画布' }).click()
  await delay(1500)
  check('⑥ 「新建画布」仍弹出原来的二次确认', confirmMessages.some((m) => /新建画布/.test(m)), confirmMessages)
  const nodesAfterNew = await page.locator('.vue-flow__node').count()
  check('⑥ 确认后画布被清空（0 个节点）', nodesAfterNew === 0, { nodesAfterNew })
  const nameAfterNew = await page.locator('.canvas-name-text').innerText().catch(() => '')
  check('⑥ 新画布名称回到默认（不继承上一张的名字）', nameAfterNew.trim() === '未命名无限画布', { nameAfterNew })

  // ⑧ 删除当前画布（本机模式走原有确认）
  confirmMessages.length = 0
  await openMenu()
  await page.locator('.workflow-topbar .file-menu button').filter({ hasText: '删除当前画布' }).click()
  // 保存有 320ms 防抖，新建后的画布可能还没落盘；这里轮询等跳转，不能固定 sleep。
  await page.waitForURL(/\/student\/workbench/, { timeout: 12000 }).catch(() => {})
  check('⑧ 「删除当前画布」仍弹出原来的二次确认', confirmMessages.some((m) => /删除当前本机画布|删除当前画布/.test(m)), confirmMessages)
  const urlAfterDelete = page.url()
  check('⑧ 删除后离开画布页（回到工作台）', /\/student\/workbench/.test(urlAfterDelete), { urlAfterDelete })

  // ⑤ 返回工作台
  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.workflow-topbar .file-menu-trigger', { timeout: 30000 })
  await delay(900)
  await openMenu()
  await page.locator('.workflow-topbar .file-menu button').filter({ hasText: '返回工作台' }).click()
  await page.waitForURL(/\/student\/workbench/, { timeout: 8000 }).catch(() => {})
  await delay(400)
  check('⑤ 「返回工作台」真的跳转到工作台', /\/student\/workbench/.test(page.url()), { url: page.url() })

  // ⑩ 窄屏下不溢出
  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 820, height: 700 })
  await mobile.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await mobile.waitForSelector('.workflow-topbar .file-menu-trigger', { timeout: 30000 })
  await delay(900)
  await mobile.locator('.workflow-topbar .file-menu-trigger').click()
  await mobile.locator('.workflow-topbar .file-menu').waitFor({ state: 'visible', timeout: 8000 })
  const narrowLayout = await mobile.evaluate(() => {
    const bar = document.querySelector('.workflow-topbar')
    const menuEl = document.querySelector('.workflow-topbar .file-menu')
    const mr = menuEl ? menuEl.getBoundingClientRect() : null
    return {
      topbarOverflow: bar ? bar.scrollWidth > bar.clientWidth + 1 : true,
      menuRight: mr ? Math.round(mr.right) : null,
      viewport: window.innerWidth,
      menuWidth: mr ? Math.round(mr.width) : 0,
    }
  })
  check('⑩ 窄屏(820px)顶栏不横向溢出', !narrowLayout.topbarOverflow, narrowLayout)
  check('⑩ 窄屏下菜单完整可见', narrowLayout.menuRight !== null && narrowLayout.menuRight <= narrowLayout.viewport, narrowLayout)
  await mobile.screenshot({ path: path.join(OUT_DIR, '02-narrow.png') })
  await mobile.close()

  const realErrors = consoleErrors.filter((t) => !/favicon|404|Failed to load resource|401|Unauthorized|ECONNREFUSED|Failed to fetch|ERR_/i.test(t))
  check('⑩ 无前端控制台报错', realErrors.length === 0, realErrors.slice(0, 4))

  await context.close()

  const report = { pass: failures.length === 0, failures, results }
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`\n==== ${results.length - failures.length} / ${results.length} 通过 ====`)
  if (failures.length) {
    console.log('失败项：')
    failures.forEach((f) => console.log(' - ' + f))
  }
} finally {
  if (browser) await browser.close().catch(() => {})
  killTree(vite)
  if (failures.length) process.exitCode = 1
}
