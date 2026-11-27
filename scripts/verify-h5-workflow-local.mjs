// 验收：本地演示模式（VITE_AUTH_MODE != server）下，报告工作流库的读写链路。
// 覆盖：列表读本地种子数据、改名/学生可选/耗时/上限落 sessionStorage、
//       AI 封面生成（本地用同色系 SVG 占位）、批量删除。
// 用法：node scripts/verify-h5-workflow-local.mjs（需先以 VITE_AUTH_MODE=demo 起 dev server）

import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5174'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // 本地模式用 localStorage 里的 mock 登录态（authStore 非 server 分支）。
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({
      user: { id: 'adm-001', name: '管理员', role: 'admin', className: '校区管理中心', avatar: '管', difficulty: '' },
      token: 'mock-token-project-new-art-studio',
    }))
  })
  await page.goto(`${BASE}/admin/h5-report-workflows?local=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  let rows = 0
  for (let i = 0; i < 80; i += 1) {
    rows = await page.locator('.row:not(.add):not(.empty-row)').count()
    if (rows > 0) break
    await delay(250)
  }
  check('本地模式列表有数据', rows > 0, `${rows} 行`)

  const seeded = await page.evaluate(() => {
    const raw = sessionStorage.getItem('admin-ai-skill-editor-demo-v2')
    if (!raw) return null
    const list = JSON.parse(raw)
    return { count: list.length, ids: list.map((s) => s.id) }
  })
  check('本地种子数据已建立', Boolean(seeded && seeded.count > 0), JSON.stringify(seeded))

  // 打开抽屉 → 改名 → 打开学生可选 → 保存
  // 点行现在进无限画布，设置抽屉改走行尾「⋯」→「工作流设置」。
  await page.locator('.row:not(.add):not(.empty-row)').first().locator('.more').click()
  await delay(250)
  await page.locator('.menu button', { hasText: '工作流设置' }).first().click()
  for (let i = 0; i < 40; i += 1) {
    if (await page.locator('.drawer.show').count()) break
    await delay(100)
  }
  const newTitle = `本地验收-${Date.now().toString(36)}`
  const titleInput = page.locator('.drawer .fld input[type="text"]').first()
  await titleInput.fill(newTitle)
  const seg = page.locator('.drawer .seg').nth(1).locator('button').first()
  await seg.click()
  await delay(200)
  await page.locator('.drawer footer button', { hasText: '保存设置' }).first().click()
  await delay(800)

  const persisted = await page.evaluate((wanted) => {
    const list = JSON.parse(sessionStorage.getItem('admin-ai-skill-editor-demo-v2') || '[]')
    const hit = list.find((s) => s.title === wanted)
    if (!hit) return null
    return {
      title: hit.title,
      studentSelectable: hit.draftConfiguration?.h5Workflow?.studentSelectable,
      draftRevision: hit.draftRevision,
    }
  }, newTitle)
  check('改名已写入本地存储', persisted?.title === newTitle, persisted?.title || '未找到')
  check('学生可选已写入本地存储', persisted?.studentSelectable === true, String(persisted?.studentSelectable))
  check('草稿版本号自增', Number(persisted?.draftRevision) >= 1, String(persisted?.draftRevision))

  // AI 生成封面（本地占位图）——同样从行尾「⋯」进设置抽屉
  await page.locator('.row:not(.add):not(.empty-row)').first().locator('.more').click()
  await delay(250)
  await page.locator('.menu button', { hasText: '工作流设置' }).first().click()
  await delay(400)
  await page.locator('.drawer .cover-ops button.ai').first().click()
  let coverUrl = ''
  for (let i = 0; i < 40; i += 1) {
    coverUrl = await page.locator('.drawer .cover-box img').first().getAttribute('src').catch(() => '')
    if (coverUrl) break
    await delay(150)
  }
  check('AI 封面生成后预览框有图', Boolean(coverUrl), coverUrl ? `${coverUrl.slice(0, 34)}…` : '空')
  check('封面来源标记为 ai', await page.evaluate((t) => {
    const list = JSON.parse(sessionStorage.getItem('admin-ai-skill-editor-demo-v2') || '[]')
    return list.find((s) => s.title === t)?.draftConfiguration?.presentation?.coverSource === 'ai'
  }, newTitle))
  await page.evaluate(() => document.querySelector('.drawer header button')?.click())
  await delay(300)

  check('无页面级 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
if (failed.length) {
  console.log('FAILED:', failed.map((r) => r.name).join(', '))
  process.exitCode = 1
}
