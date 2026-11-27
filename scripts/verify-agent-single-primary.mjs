// 核对「学生端只有一个智能体」：切换主人、保存后真的只留一个、备用智能体不再被自动补回
// 用法：先起 dev.mjs，再 node scripts/verify-agent-single-primary.mjs
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const OUT = path.join(process.cwd(), 'docs', 'shots')
fs.mkdirSync(OUT, { recursive: true })

let pass = 0
let fail = 0
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`) }
  else { fail += 1; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`) }
}

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const issues = []
page.on('pageerror', (e) => issues.push('pageerror: ' + e.message))

await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
const inputs = page.locator('.login-form input')
await inputs.nth(0).fill('guanliyuan88')
if ((await inputs.count()) >= 3) {
  await inputs.nth(1).fill('demo-school')
  await inputs.nth(2).fill('123456789')
} else {
  await inputs.nth(1).fill('123456789')
}
await page.locator('.login-form .base-button').first().click()
await page.waitForURL(/\/admin/, { timeout: 30000 })
await page.waitForSelector('.admin-nav', { timeout: 20000 })

let navBtn = page.locator('.admin-nav button', { hasText: '智能体配置' }).first()
if (!(await navBtn.isVisible().catch(() => false))) {
  const groupBtn = page.locator('.admin-nav button', { hasText: '功能管理' }).first()
  if (await groupBtn.count()) await groupBtn.click()
  await page.waitForTimeout(400)
  navBtn = page.locator('.admin-nav button', { hasText: '智能体配置' }).first()
}
await navBtn.click()
await page.waitForTimeout(1500)

console.log('\n① 列表页只有一个「学生端在用」')
const primaryTags = await page.locator('.agent-card-badge.on').count()
ok(primaryTags === 1, '在用标记唯一', `实际 ${primaryTags} 个`)
ok((await page.locator('.agent-card').count()) >= 1, '列表是卡片式', `${await page.locator('.agent-card').count()} 张卡`)
ok(!(await page.locator('.agent-filter-card select').count() > 2), '筛选区不再有「绑定流程」下拉', `下拉数 ${await page.locator('.agent-filter-card select').count()}`)

console.log('\n② 编辑页不再有 20 条勾选')
const primaryName = await page.locator('.agent-card.primary .agent-card-name h3').first().innerText()
await page.locator('.agent-card-name h3').first().click()
await page.waitForSelector('.agent-primary-hint', { timeout: 15000 })
ok((await page.locator('.agent-flow-grouped').count()) === 0, '旧勾选块已移除')

console.log('\n③ 切换主人：把一个备用智能体设为在用')
const hintBefore = (await page.locator('.agent-primary-hint').innerText()).replace(/\s+/g, ' ')
await page.locator('.agent-back-list').click()
await page.waitForSelector('.agent-card-list', { timeout: 10000 })
const backupRow = page.locator('.agent-card').filter({ hasNot: page.locator('.agent-card-badge.on') }).first()
const backupName = await backupRow.locator('.agent-card-name h3').innerText()
await backupRow.locator('button', { hasText: '设为在用' }).click()
await page.waitForTimeout(600)
const afterSwitch = await page.locator('.agent-card-badge.on').count()
ok(afterSwitch === 1, '切换后仍然只有一个在用', `${backupName} ← 接替 ${primaryName}`)
const tagRowName = await page.locator('.agent-card.primary .agent-card-name h3').first().innerText()
ok(tagRowName.trim() === backupName.trim(), '在用标记跟着移到新智能体', tagRowName)

console.log('\n④ 保存后刷新，状态保持')
await page.locator('.agent-actions button', { hasText: '保存配置' }).first().click()
await page.waitForTimeout(2500)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
navBtn = page.locator('.admin-nav button', { hasText: '智能体配置' }).first()
if (!(await navBtn.isVisible().catch(() => false))) {
  await page.locator('.admin-nav button', { hasText: '功能管理' }).first().click()
  await page.waitForTimeout(400)
  navBtn = page.locator('.admin-nav button', { hasText: '智能体配置' }).first()
}
await navBtn.click()
await page.waitForTimeout(1800)
const afterReload = await page.locator('.agent-card.primary .agent-card-name h3').first().innerText()
ok(afterReload.trim() === backupName.trim(), '刷新后仍是在用的那个', afterReload)
ok((await page.locator('.agent-card-badge.on').count()) === 1, '刷新后仍只有一个在用')

console.log('\n⑤ 后端绑定表：所有流程都指向同一个智能体（学生端不会串人）')
const cfg = await page.evaluate(async () => {
  const res = await fetch('/api/admin/report-agent-config', { credentials: 'include' })
  return res.ok ? await res.json() : null
})
if (cfg) {
  // 接口直接返回配置对象（不是 { config }），这里两种都兼容
  const conf = cfg.config || cfg
  const ids = new Set(Object.values(conf.bindings || {}))
  ok(ids.size === 1, '20 条流程全部指向同一个智能体', `不同智能体数 ${ids.size} / 共 ${Object.keys(conf.bindings || {}).length} 条`)
  ok(ids.has(conf.activeAgentId), '指向的正是「在用」那个')
} else {
  ok(false, '读不到配置（接口异常）')
}

console.log('\n⑥ 还原：切回原来的学生端智能体')
const primaryRow = page.locator('.agent-card').filter({ has: page.locator('.agent-card-name h3', { hasText: primaryName }) }).first()
const restoreBtn = primaryRow.locator('button', { hasText: '设为在用' })
if (await restoreBtn.count()) {
  await restoreBtn.click()
  await page.waitForTimeout(500)
  await page.locator('.agent-actions button', { hasText: '保存配置' }).first().click()
  await page.waitForTimeout(2500)
}
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
navBtn = page.locator('.admin-nav button', { hasText: '智能体配置' }).first()
if (!(await navBtn.isVisible().catch(() => false))) {
  await page.locator('.admin-nav button', { hasText: '功能管理' }).first().click()
  await page.waitForTimeout(400)
  navBtn = page.locator('.admin-nav button', { hasText: '智能体配置' }).first()
}
await navBtn.click()
await page.waitForTimeout(1500)
const restored = await page.locator('.agent-card.primary .agent-card-name h3').first().innerText().catch(() => '')
ok(restored.trim() === primaryName.trim(), '已还原成原来的学生端智能体', restored || '（读取失败，请人工确认）')

await page.screenshot({ path: path.join(OUT, 'agent-single-primary.png'), fullPage: true })
console.log('\n页面错误：', issues.length ? JSON.stringify(issues.slice(0, 4)) : '无')
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
