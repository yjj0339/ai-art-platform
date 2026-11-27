// 后台「智能体配置」页重排后的截图核对：身份卡 / 按页分组 / 试跑 / 调用记录
// 用法：先起 dev.mjs，再 node scripts/shot-agent-console.mjs
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const OUT = path.join(process.cwd(), 'docs', 'shots')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const issues = []
page.on('console', m => { if (m.type() === 'error') issues.push(m.text()) })
page.on('pageerror', e => issues.push('pageerror: ' + e.message))
const log = (...a) => console.log(...a)

await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })

const inputs = page.locator('.login-form input')
await inputs.nth(0).fill('guanliyuan88')
if (await inputs.count() >= 3) {
  await inputs.nth(1).fill('demo-school')
  await inputs.nth(2).fill('123456789')
} else {
  await inputs.nth(1).fill('123456789')
}
await page.locator('.login-form .base-button').first().click()
await page.waitForURL(/\/admin/, { timeout: 30000 })
log('登录成功 →', page.url())

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

log('\n== 列表页：只允许一个学生端智能体在用 ==')
log('筛选区下拉：', JSON.stringify(await page.$$eval('.agent-filter-card select', els => els.map(el => el.options[0]?.textContent?.trim()))))
log('卡片数：', await page.locator('.agent-card').count())
log('「学生端在用」标记数：', await page.locator('.agent-card-badge.on').count())
log('备用卡片数：', await page.locator('.agent-card:not(.primary)').count())
const cards = await page.$$eval('.agent-card', els => els.map(el => ({
  name: el.querySelector('.agent-card-name h3')?.textContent?.trim(),
  role: el.querySelector('.agent-card-role')?.textContent?.trim(),
  meta: el.querySelector('.agent-card-meta')?.textContent?.replace(/\s+/g, ' ').trim(),
  actions: [...el.querySelectorAll('.agent-card-actions button')].map(b => b.textContent.trim()).join('｜'),
})))
cards.forEach(c => log(`  · ${c.name} ｜ ${c.meta} ｜ 按钮：${c.actions}\n      角色：${c.role}`))
await page.screenshot({ path: path.join(OUT, 'agent-console-list.png'), fullPage: true })
log('已截 agent-console-list.png')

log('\n== 编辑页：20 条勾选已移除 ==')
await page.locator('.agent-card-name h3').first().click()
await page.waitForSelector('.agent-primary-hint', { timeout: 15000 })
log('旧勾选块：', await page.locator('.agent-flow-grouped').count() ? '还在（异常）' : '已移除 ✓')
log('在用提示：', (await page.locator('.agent-primary-hint').innerText()).replace(/\s+/g, ' '))
await page.locator('.agent-primary-hint').scrollIntoViewIfNeeded()
await page.screenshot({ path: path.join(OUT, 'agent-console-flow-groups.png') })
log('已截 agent-console-flow-groups.png')

log('\n== 编辑页：试跑 ==')
if (process.env.SKIP_DRY === '1') {
  log('SKIP_DRY=1，跳过试跑（省一次模型调用）')
} else {
const samples = page.locator('.agent-dry-run-samples button')
log('示例句：', JSON.stringify(await samples.allInnerTexts()))
await samples.first().click()
log('已填入：', await page.locator('.agent-dry-run-input').inputValue())
await page.locator('.agent-dry-run .agent-create-btn').click()
try {
  await page.waitForSelector('.agent-dry-run-result', { timeout: 90000 })
  const badges = await page.locator('.agent-dry-run-badges em').allInnerTexts()
  log('徽标：', JSON.stringify(badges))
  const blocks = await page.$$eval('.agent-dry-run-block', els => els.map(el => ({
    title: el.querySelector('strong')?.textContent?.trim(),
    body: [...el.querySelectorAll('li')].map(li => li.textContent.trim()).join(' ／ ') || el.querySelector('p')?.textContent?.trim(),
  })))
  blocks.forEach(b => log(`  ${b.title}：${b.body}`))
  await page.locator('.agent-dry-run-result').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(OUT, 'agent-console-dryrun.png') })
  log('已截 agent-console-dryrun.png')
} catch (err) {
  log('试跑结果未出现：', err.message.slice(0, 200))
  log('页面错误提示：', JSON.stringify(await page.locator('.agent-dry-run-error').allInnerTexts().catch(() => [])))
}
}

log('\n== 调用记录 ==')
await page.locator('.agent-subnav button', { hasText: '调用记录' }).first().click()
await page.waitForTimeout(2500)
log('记录表头：', JSON.stringify(await page.locator('.agent-log-head span').allInnerTexts()))
const rows = await page.$$eval('.agent-log-row', els => els.map(el => el.textContent.replace(/\s+/g, ' ').trim()))
log('记录行数：', rows.length)
rows.slice(0, 5).forEach(r => log('  ·', r))
if (!rows.length) log('  空态文案：', (await page.locator('.agent-empty').innerText().catch(() => '')).replace(/\s+/g, ' '))
await page.screenshot({ path: path.join(OUT, 'agent-console-logs.png'), fullPage: true })
log('已截 agent-console-logs.png')

log('\n控制台错误：', issues.length ? JSON.stringify(issues.slice(0, 6)) : '无')
await browser.close()
