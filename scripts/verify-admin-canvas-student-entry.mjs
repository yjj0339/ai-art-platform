// 验收：普通玩法（非 H5 报告工作流）的画布页，顶栏删掉后
// 「学生使用页面」这个入口是否还能从「文件 ▾」菜单里走通。
// 原来的按钮是「下一步：学生页面」，现在收进菜单，功能不能丢。
import { createRequire } from 'node:module'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const ACCOUNT = process.env.ADMIN_ACCOUNT || 'guanliyuan88'
const PASSWORD = process.env.ADMIN_PASSWORD || '123456789'
const ORG = process.env.ADMIN_ORG || 'demo-school'

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`PASS  ${name}${detail ? `  — ${detail}` : ''}`) }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`) }
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e?.message || e)))

  try {
    const res = await page.request.post(`${BASE}/api/auth/login`, {
      data: { account: ACCOUNT, password: PASSWORD, organizationCode: ORG },
    })
    check('管理员登录成功', res.status() === 200, `status=${res.status()}`)

    // 找一个普通（非 H5）玩法的 id：直接问接口，带 module 过滤。
    const listRes = await page.request.get(`${BASE}/api/admin/ai-skills?module=featureManagement&type=image`)
    const listJson = await listRes.json().catch(() => ({}))
    const list = listJson.skills || listJson.items || []
    const plain = list.find((skill) => skill?.id)
    if (!plain) {
      check('找到一个普通玩法用于验收', false, '列表里没有可用玩法')
      return
    }
    check('找到一个普通玩法用于验收', true, `${plain.title || plain.id}`)

    // 不带 returnTo=h5-report，就是普通玩法画布页。
    await page.goto(`${BASE}/admin/ai-skills/${encodeURIComponent(plain.id)}/workflow`, { waitUntil: 'domcontentloaded' })
    await page.locator('.file-menu-trigger').first().waitFor({ state: 'visible', timeout: 30000 })
    check('普通玩法画布页打开、文件按钮可见', true)

    check('普通玩法页也没有旧顶栏 .editor-header', await page.locator('.editor-header').count() === 0)

    await page.locator('.file-menu-trigger').first().click()
    await page.locator('.file-menu').first().waitFor({ state: 'visible', timeout: 6000 })
    const items = await page.locator('.file-menu [role="menuitem"]').allInnerTexts()
    const labels = items.map((text) => text.trim()).filter(Boolean)
    check('菜单里有「学生使用页面」', labels.some((t) => t.includes('学生使用页面')), labels.join(' / '))
    check('菜单里有「返回玩法列表」', labels.some((t) => t.includes('返回玩法列表')), labels.join(' / '))

    const studentBtn = page.locator('.file-menu [role="menuitem"]', { hasText: '学生使用页面' }).first()
    await studentBtn.click()
    let url = ''
    for (let i = 0; i < 100; i += 1) {
      if (/\/student-page/.test(page.url())) { url = page.url(); break }
      await delay(120)
    }
    check('点「学生使用页面」跳到学生使用页面', Boolean(url), url || page.url())
    check('跳到的是同一个玩法的学生页面', url.includes(encodeURIComponent(plain.id)) || url.includes(plain.id), url)

    check('无前端控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '))
  } finally {
    await browser.close()
  }
  console.log(`\n==== ${passed} / ${passed + failed} 通过 ====`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('脚本异常：', error?.message || error)
  process.exitCode = 1
})
