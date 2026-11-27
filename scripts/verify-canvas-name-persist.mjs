// 画布名称（顶栏「AI创作画布」卡片里改名）端到端验收脚本
// 用法：node scripts/verify-canvas-name-persist.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
//
// 覆盖目标（用户诉求）：
//   「无限画布左上角的 AI创作画布 卡片里加一个画布名称，可以点击输入修改，
//     保存画布时保留名字，之后能在素材库里认出这个画布。」
// 因此逐项验证：
//   ① 默认显示「未命名无限画布」；② 点击进入输入态并自动聚焦全选；
//   ③ 回车提交 / Esc 取消 / 失焦提交；④ 保存后本机存储里带 title；
//   ⑤ 刷新后名字还在；⑥ 素材库卡片显示同一个名字；⑦ 新建画布回到默认名；
//   ⑧ 长名字不撑破顶栏（不出现横向溢出）。
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const WEB_PORT = 5179
const OUT_DIR = path.join(projectDir, '.canvas-name-verify')
const STORAGE_KEY = 'ai-workflow-canvas-stage1-v2'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = {}
const failures = []

function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}

{
  const busy = await fetch(`http://127.0.0.1:${WEB_PORT}/`).then(() => true).catch(() => false)
  if (busy) throw new Error(`vite 端口 ${WEB_PORT} 已被占用（可能残留进程），请先关闭后重跑`)
}

// pnpm 结构下 node node_modules/vite/bin/vite.js 可能是空壳，用 .bin/vite。
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

try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1500)}`)
    await delay(250)
  }

  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  // /ai/health 在 mock 模式没有后端，资源加载失败属预期噪声。
  const ignoreConsole = (text = '') => /favicon|Devtools|Development mode|\[Vue warn\]|Failed to load resource|ERR_/i.test(text) === false
  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } })
  await context.addInitScript(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '画布命名验收', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
  })

  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && ignoreConsole(m.text())) consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  // 「新建画布」会弹 window.confirm，验收里直接确认。
  page.on('dialog', (d) => d.accept().catch(() => {}))

  const nameButton = page.locator('.canvas-name-action')
  const nameInput = page.locator('.canvas-name-input')
  const nameText = () => page.locator('.canvas-name-action .canvas-name-text').innerText()
  // 保存有 320ms 防抖，再给一次落盘余量。
  const waitSaved = () => delay(1200)
  const readStored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY)

  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.canvas-name-action', { timeout: 30000 })
  await delay(800)

  // ① 默认名
  check('① 顶栏默认识别为「未命名无限画布」', (await nameText()).trim() === '未命名无限画布', { text: await nameText() })

  // ② 点击进入编辑态：输入框出现且获得焦点、原值被选中
  await nameButton.click()
  await page.waitForSelector('.canvas-name-input', { timeout: 8000 })
  const focusState = await page.evaluate(() => {
    const el = document.querySelector('.canvas-name-input')
    return {
      focused: document.activeElement === el,
      selected: el ? el.value.slice(el.selectionStart, el.selectionEnd) : '',
      placeholder: el?.getAttribute('placeholder') || '',
      maxlength: el?.getAttribute('maxlength') || '',
    }
  })
  check('② 点击后出现输入框并自动聚焦', focusState.focused, focusState)
  check('② 空名进入编辑时给出占位提示文案', focusState.placeholder === '给画布起个名字', focusState)
  check('② 输入框限长 40（与保存截断一致）', focusState.maxlength === '40', focusState)
  check('② 编辑态下原来的名字按钮隐藏（同一位置不叠两层）', !(await nameButton.isVisible().catch(() => false)), {})

  // Esc 取消：不改名
  await nameInput.fill('临时改错的名字')
  await nameInput.press('Escape')
  await delay(400)
  check('③ Esc 取消编辑，名字保持原样', (await nameText()).trim() === '未命名无限画布' && !(await nameInput.isVisible().catch(() => false)), { text: await nameText() })

  // ③ 真实键入 + 回车提交
  await nameButton.click()
  await page.waitForSelector('.canvas-name-input', { timeout: 8000 })
  await nameInput.fill('三年级水彩第3课 海洋')
  await nameInput.press('Enter')
  await delay(500)
  check('③ 回车提交后按钮显示新名字', (await nameText()).trim() === '三年级水彩第3课 海洋', { text: await nameText() })
  check('③ 提交后输入框收起', !(await nameInput.isVisible().catch(() => false)), {})

  // ④ 保存落盘：本机存储根级 title
  await waitSaved()
  const storedAfterRename = await readStored()
  check('④ 保存后本机存储里带上 title', storedAfterRename.title === '三年级水彩第3课 海洋', { title: storedAfterRename.title })
  const saveStateText = await page.locator('.save-state').innerText().catch(() => '')
  check('④ 顶栏保存状态显示已保存', /已保存/.test(saveStateText), { saveStateText })

  // ⑤ 刷新后名字还在
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.canvas-name-action', { timeout: 30000 })
  await delay(900)
  check('⑤ 刷新页面后名字仍在（这就是「保存时保留名字」）', (await nameText()).trim() === '三年级水彩第3课 海洋', { text: await nameText() })

  // ⑥ 素材库能看到同一个名字
  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/portfolio`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.portfolio-grid, .portfolio-empty', { timeout: 30000 })
  await delay(900)
  const canvasCardTitles = await page.evaluate(() => Array.from(document.querySelectorAll('.portfolio-card'))
    .map((card) => ({
      title: card.querySelector('.portfolio-cover-info strong')?.textContent?.trim() || '',
      kind: card.querySelector('.kind-chip')?.textContent?.trim() || '',
    })))
  const canvasCard = canvasCardTitles.find((item) => item.kind === '无限画布') || {}
  check('⑥ 素材库的画布卡片标题 == 画布上起的名字（后期能靠它找到画布）',
    canvasCard.title === '三年级水彩第3课 海洋', { cards: canvasCardTitles })
  await page.screenshot({ path: path.join(OUT_DIR, '01-portfolio-card.png') })

  // ⑦ 回到画布 → 失焦提交也应生效；再验证长名字不撑破顶栏
  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.canvas-name-action', { timeout: 30000 })
  await delay(900)
  await nameButton.click()
  await page.waitForSelector('.canvas-name-input', { timeout: 8000 })
  await nameInput.fill('四年级综合材料课 · 旧物改造与色彩构成 · 第二阶段作业（长名字挤压测试）')
  await page.locator('.canvas-area').click({ position: { x: 400, y: 300 } })
  await delay(600)
  const longNameLayout = await page.evaluate(() => {
    const bar = document.querySelector('.workflow-topbar')
    const btn = document.querySelector('.canvas-name-action')
    const actions = document.querySelector('.topbar-actions')
    return {
      overflows: bar ? bar.scrollWidth > bar.clientWidth + 1 : true,
      btnWidth: btn ? Math.round(btn.getBoundingClientRect().width) : 0,
      nameTruncated: (() => {
        const t = document.querySelector('.canvas-name-action .canvas-name-text')
        return t ? t.scrollWidth > t.clientWidth + 1 : false
      })(),
      actionsRight: actions ? Math.round(actions.getBoundingClientRect().right) : 0,
      viewport: window.innerWidth,
    }
  })
  check('⑦ 失焦（点空白处）也会提交名字', (await nameText()).trim().startsWith('四年级综合材料课'), { text: await nameText() })
  check('⑦ 超长名字不撑破顶栏（不横向溢出、按钮限宽 + 省略号）',
    !longNameLayout.overflows && longNameLayout.btnWidth <= 240 && longNameLayout.nameTruncated, longNameLayout)
  check('⑦ 右侧动作区仍在视口内，没被名字挤出去',
    longNameLayout.actionsRight <= longNameLayout.viewport, longNameLayout)
  await page.screenshot({ path: path.join(OUT_DIR, '02-long-name.png') })

  // ⑧ 新建画布 → 回到默认名
  // 入口已从右上角「•••」迁到左上角「文件」下拉（见 2026-10-31 改动）。
  await page.locator('.file-menu-trigger').click()
  await page.waitForSelector('.file-menu button', { timeout: 8000 })
  await page.locator('.file-menu button').filter({ hasText: '新建画布' }).click()
  await delay(1200)
  check('⑧ 新建画布后名称回到「未命名无限画布」', (await nameText()).trim() === '未命名无限画布', { text: await nameText() })

  check('运行期：无控制台错误', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })

  await browser.close()

  const report = { pass: failures.length === 0, failures, results }
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.error(`\n==== 结果：${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`} ====`)
  if (failures.length) console.error(failures.join('\n'))
  process.exitCode = failures.length === 0 ? 0 : 1
} finally {
  killTree(vite)
}
