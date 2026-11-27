// 后台「API 配置」模型列表输入回归脚本
// 用法：node scripts/verify-provider-model-input.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
//
// 背景（本脚本守护的缺陷）：
//   模板里写成 @click="addProviderModel"（漏括号）时，Vue 会把原生 DOM 事件当作第一个参数传进去，
//   String(event) === "[object PointerEvent]" 会被当成合法模型名写进 providerForm.models，
//   点保存后落盘污染 server/data/ai-providers.json（曾真实污染过 hunyuan3d.models）。
//   同族缺陷还有 @click="openProviderList" → providerCategory 被写成事件对象。
//
// 覆盖：
//   A 输入框为空点「添加模型」 → 只提示，不新增
//   B 输入文字点「添加模型」   → 新增的必须是输入的文字，且列表中不得出现 "[object"
//   C 输入文字按 Enter        → 同上
//   D 点「返回API配置列表」   → 能正常回到列表（providerCategory 未被写坏）
//   E 清理：删除本脚本新增的模型，恢复初始状态
//
// 安全：全程不点「保存」，不会改动 server/data/ai-providers.json。
import { createRequire } from 'node:module'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const WEB = process.env.WEB_URL || 'http://127.0.0.1:5173'
const ACCOUNT = process.env.ADMIN_ACCOUNT || 'guanliyuan88'
const PASSWORD = process.env.ADMIN_PASSWORD || '123456789'
const ORG = process.env.ADMIN_ORG || 'demo-school'

const MODEL_A = 'REG-TEST-CLICK'
const MODEL_B = 'REG-TEST-ENTER'

const results = []
const failures = []
let shotIndex = 0

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures.push(`${name}${detail ? ' — ' + detail : ''}`)
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  ' + detail : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const consoleErrors = []
  let collecting = false // 登录成功后才开始收集，避免把未登录时的会话探测 401 误判为缺陷
  page.on('pageerror', (e) => { if (collecting) consoleErrors.push(String(e.message)) })
  page.on('console', (m) => { if (collecting && m.type() === 'error') consoleErrors.push(m.text()) })

  try {
    // ---------- 登录 ----------
    // 带 redirect=/admin 进入，登录页会自动选中「管理员」角色，提交按钮文案随之变为「进入管理员后台」。
    await page.goto(`${WEB}/login?redirect=/admin`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.login-form input', { timeout: 20000 })
    const inputs = page.locator('.login-form input')
    const visible = []
    const count = await inputs.count()
    for (let i = 0; i < count; i += 1) {
      const el = inputs.nth(i)
      if (await el.isVisible().catch(() => false)) visible.push(el)
    }
    if (visible.length < 3) throw new Error(`登录表单可见输入框只有 ${visible.length} 个，找不到账号/机构代码/密码`)
    await visible[0].fill(ACCOUNT)
    await visible[1].fill(ORG)
    await visible[2].fill(PASSWORD)
    await page.locator('.login-form button', { hasText: /进入管理员后台|登录/ }).first().click()
    // 注意：不能用 /\/admin/ 匹配，登录页 URL 是 /login?redirect=/admin 也会命中。
    await page.waitForSelector('nav.admin-nav', { timeout: 25000 })
    await page.waitForURL((u) => new URL(u).pathname.startsWith('/admin'), { timeout: 15000 })
    collecting = true
    check('管理员登录', true, `已进入 ${new URL(page.url()).pathname}`)

    // ---------- 进入 API 配置 ----------
    // 「API 配置」现在收在左侧「功能管理」折叠组里：收起状态先展开再点。
    const apiNavBtn = page.locator('nav.admin-nav .nav-child', { hasText: 'API 配置' }).first()
    if (!(await apiNavBtn.isVisible().catch(() => false))) {
      await page.locator('nav.admin-nav .nav-group-toggle').first().click()
      await new Promise((r) => setTimeout(r, 400))
    }
    await page.locator('nav.admin-nav button', { hasText: 'API 配置' }).first().click()
    await page.waitForSelector('.api-page', { timeout: 15000 })
    await page.waitForSelector('.api-provider', { timeout: 15000 })
    check('进入 API 配置列表', true)

    // ---------- 打开一个 provider 表单 ----------
    await page.locator('.api-provider .api-edit-btn').first().click()
    await page.waitForSelector('.api-back-btn', { timeout: 10000 })
    const modelList = page.locator('.api-model-row')
    // 新版 API 配置页（2026-11-26 重做）始终列出全部模型，不再有「展开全部」折叠。
    // 等模型列表渲染稳定（连续两次读取一致），避免竞态把「已渲染子集」当成初始状态
    let initialModels = []
    for (let i = 0; i < 20; i += 1) {
      const snapshot = (await modelList.locator('.api-model-name').allInnerTexts()).map((t) => t.trim())
      await sleep(250)
      const again = (await modelList.locator('.api-model-name').allInnerTexts()).map((t) => t.trim())
      if (JSON.stringify(snapshot) === JSON.stringify(again) && snapshot.length > 0) { initialModels = snapshot; break }
      initialModels = again
    }
    check('打开 provider 编辑表单（已展开全部模型）', true, `初始模型 ${initialModels.length} 个：${JSON.stringify(initialModels)}`)

    const draftInput = page.locator('.api-model-add input').first()
    const addButton = page.locator('.api-model-add button', { hasText: '添加模型' }).first()

    // ---------- A 空输入 ----------
    await draftInput.fill('')
    await addButton.click()
    await sleep(400)
    const afterEmpty = await modelList.locator('.api-model-name').allInnerTexts()
    check('A 空输入点「添加模型」不新增', afterEmpty.length === initialModels.length,
      `前 ${initialModels.length} → 后 ${afterEmpty.length}`)

    // ---------- B 输入文字后点按钮 ----------
    await draftInput.fill(MODEL_A)
    await addButton.click()
    await sleep(400)
    let list = await modelList.locator('.api-model-name').allInnerTexts()
    check('B 点「添加模型」新增的是输入的文字', list.some((t) => t.trim() === MODEL_A),
      `新增后：${JSON.stringify(list)}`)

    // ---------- C 输入文字后按 Enter ----------
    await draftInput.fill(MODEL_B)
    await draftInput.press('Enter')
    await sleep(400)
    list = await modelList.locator('.api-model-name').allInnerTexts()
    check('C 按 Enter 新增的是输入的文字', list.some((t) => t.trim() === MODEL_B),
      `新增后：${JSON.stringify(list)}`)

    // ---------- 核心断言：无 [object ...] 污染 ----------
    const polluted = list.filter((t) => t.includes('[object'))
    check('D 列表中不存在 [object ...] 污染', polluted.length === 0,
      polluted.length ? JSON.stringify(polluted) : '扫描 0 处')

    // ---------- E 清理测试数据 ----------
    for (const name of [MODEL_A, MODEL_B]) {
      const row = page.locator('.api-model-row', { hasText: name }).first()
      if (await row.count()) {
        await row.locator('button', { hasText: '删除' }).click()
        await sleep(250)
      }
    }
    const restored = await modelList.locator('.api-model-name').allInnerTexts()
    check('E 测试模型已清理、恢复初始状态',
      JSON.stringify(restored) === JSON.stringify(initialModels),
      `初始 ${JSON.stringify(initialModels)} / 现在 ${JSON.stringify(restored)}`)

    // ---------- F 返回列表（守护 openProviderList 漏括号） ----------
    await page.locator('.api-back-btn').click()
    await sleep(500)
    const listRows = await page.locator('.api-provider').count()
    check('F 点「返回平台列表」能正常回到列表', listRows > 0, `列表可见 ${listRows} 行`)

    // ---------- 控制台 ----------
    const realErrors = consoleErrors.filter((t) => !/favicon|404 \(Not Found\)/i.test(t))
    check('G 无前端运行时报错', realErrors.length === 0, realErrors.slice(0, 2).join(' | ') || '0 条')

    await page.screenshot({ path: path.join(process.cwd(), `tmp_provider-model-verify-${++shotIndex}.png`) })
  } catch (error) {
    check('脚本执行未中断', false, error.message)
    try { await page.screenshot({ path: path.join(process.cwd(), `tmp_provider-model-verify-error.png`) }) } catch {}
  } finally {
    await browser.close()
  }

  console.log('\n================ 汇总 ================')
  console.log(`通过 ${results.filter((r) => r.ok).length} / ${results.length}`)
  if (failures.length) {
    console.log('失败项：')
    for (const f of failures) console.log('  - ' + f)
  }
  console.log(failures.length ? 'RESULT: FAIL' : 'RESULT: PASS')
  process.exit(failures.length ? 1 : 0)
}

main()
