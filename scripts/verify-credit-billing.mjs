// 计费面板验收：后台「功能管理 → AI 用量与计费」
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/verify-credit-billing.mjs
// 输出：.workbuddy/evidence/billing-*.png
//
// 只读为主：唯一会写库的两步（改每日赠送次数、改文案）都在结尾还原成原值。

import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
await mkdir(OUT_DIR, { recursive: true })

const results = []
const pass = (name, detail = '') => { results.push({ ok: true, name, detail }); console.log(`✅ ${name}${detail ? ' — ' + detail : ''}`) }
const fail = (name, detail = '') => { results.push({ ok: false, name, detail }); console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`) }

const browser = await chromium.launch({ executablePath: CHROME })
const consoleErrors = []

async function newSession(account, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    data: { account, password, organizationCode: 'demo-school' },
    headers: { Origin: BASE },
  })
  if (!res.ok()) throw new Error(`登录失败 ${account}: ${res.status()}`)
  return { context, page }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT_DIR, `billing-${name}.png`) })

try {
  const { context, page } = await newSession('guanliyuan88', '123456789')
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })

  /* ---------- 1. 侧栏能找到入口 ---------- */
  const groupToggle = page.locator('.nav-group-toggle', { hasText: '功能管理' })
  if (await groupToggle.count()) pass('侧栏有「功能管理」分组')
  else fail('侧栏缺少「功能管理」分组')

  const billingBtn = page.locator('.nav-child', { hasText: 'AI 用量与计费' })
  if (!(await billingBtn.isVisible().catch(() => false))) {
    await groupToggle.click()
    await page.waitForTimeout(250)
  }
  if (await billingBtn.count() && await billingBtn.isVisible()) pass('分组里出现「AI 用量与计费」')
  else fail('分组里没有「AI 用量与计费」')

  await billingBtn.click()
  await page.waitForSelector('.credit-billing-page', { timeout: 10000 })
  pass('点击后进入计费面板')
  await page.waitForSelector('.billing-ability', { timeout: 10000 })
  await page.waitForTimeout(700)
  await shot(page, '01-panel')

  /* ---------- 2. 五类能力行 ---------- */
  const rows = await page.$$eval('.billing-ability', (els) => els.map((el) => {
    const name = el.querySelector('.billing-ability-name strong')?.textContent.trim() || ''
    const inputs = [...el.querySelectorAll('input[type=number]')].map((i) => i.value)
    return { name, free: inputs[0], credits: inputs[1] }
  }))
  const expected = { 出图: ['8', '5'], 视频: ['1', '30'], '3D 模型': ['1', '20'], 'H5 报告': ['1', '40'], 'AI 文字': ['5', '2'] }
  const bad = rows.filter((r) => {
    const want = expected[r.name]
    return !want || r.free !== want[0] || r.credits !== want[1]
  })
  if (rows.length === 5 && bad.length === 0) {
    pass('五类能力额度与单价正确', rows.map((r) => `${r.name} ${r.free}次/${r.credits}分`).join('、'))
  } else {
    fail('五类能力额度不符', `实际=${JSON.stringify(rows)} 不符=${bad.map((r) => r.name).join(',')}`)
  }

  /* ---------- 3. 模型表自动列出已配置模型 ---------- */
  const modelRows = await page.$$eval('.billing-model-row', (els) => els.map((el) => ({
    ability: el.children[0]?.textContent.trim(),
    provider: el.children[1]?.textContent.trim(),
    model: el.querySelector('.billing-model-name')?.textContent.trim(),
    credits: el.querySelector('input[type=number]')?.value || '',
    state: el.querySelector('.billing-model-clear')?.textContent.trim(),
  })))
  if (modelRows.length > 0) {
    pass(`模型表自动列出 ${modelRows.length} 个模型`, modelRows.slice(0, 6).map((r) => `${r.ability}/${r.provider}/${r.model}`).join('  '))
  } else {
    fail('模型表是空的（应自动读 API 配置里的模型）')
  }
  const allDefault = modelRows.every((r) => r.credits === '' && r.state === '用默认价')
  if (allDefault) pass('未单独定价的模型显示「用默认价」、输入框留空')
  else fail('模型默认价状态显示异常', JSON.stringify(modelRows.filter((r) => r.credits !== '')))

  /* ---------- 4. 提示文案六个输入框 ---------- */
  const msgItems = await page.$$eval('.billing-message-item', (els) => els.map((el) => ({
    label: el.querySelector('span')?.textContent.trim(),
    value: el.querySelector('textarea')?.value || '',
    placeholders: el.querySelector('small')?.textContent.trim(),
  })))
  if (msgItems.length === 6) pass('提示文案区有 6 条', msgItems.map((m) => m.label).join(' / '))
  else fail('提示文案条数不对', `实际 ${msgItems.length}`)
  const notEnough = msgItems.find((m) => m.label?.includes('积分不够'))
  if (notEnough?.value.includes('{shortfall}') && notEnough.value.includes('联系老师充值')) {
    pass('「积分不够」文案已预填且带占位符', notEnough.value)
  } else {
    fail('「积分不够」文案没读到', JSON.stringify(notEnough))
  }

  /* ---------- 5. 改一个数字 → 保存 → 重进仍在 → 还原 ---------- */
  const imageRow = page.locator('.billing-ability').first()
  const freeInput = imageRow.locator('input[type=number]').first()
  const originFree = await freeInput.inputValue()
  const probe = String(Number(originFree) + 3)
  await freeInput.fill(probe)
  await page.locator('.credit-billing-page button', { hasText: '保存计费设置' }).click()
  await page.waitForSelector('.billing-page .ax-note.is-ok', { timeout: 15000 })
  const notice = (await page.locator('.billing-page .ax-note.is-ok').innerText()).trim()
  if (notice.includes('已保存')) pass('保存计费设置成功', notice)
  else fail('保存后没出现成功提示', notice)

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const stillOpen = await page.locator('.nav-child', { hasText: 'AI 用量与计费' }).isVisible().catch(() => false)
  if (!stillOpen) {
    await page.locator('.nav-group-toggle', { hasText: '功能管理' }).click()
    await page.waitForTimeout(200)
  }
  await page.locator('.nav-child', { hasText: 'AI 用量与计费' }).click()
  await page.waitForSelector('.billing-ability', { timeout: 12000 })
  await page.waitForTimeout(600)
  const afterReload = await page.locator('.billing-ability').first().locator('input[type=number]').first().inputValue()
  if (afterReload === probe) pass('刷新后仍是刚保存的数字（真的落库了）', `${originFree} → ${probe}`)
  else fail('刷新后数字回到旧值（没存进去）', `${originFree} → 期望 ${probe}，实际 ${afterReload}`)

  // 还原
  await page.locator('.billing-ability').first().locator('input[type=number]').first().fill(originFree)
  await page.locator('.credit-billing-page button', { hasText: '保存计费设置' }).click()
  await page.waitForTimeout(1500)
  const restored = await page.locator('.billing-ability').first().locator('input[type=number]').first().inputValue()
  if (restored === originFree) pass('已还原成原值', originFree)
  else fail('还原失败', restored)

  /* ---------- 6. 文案能改能存能还原 ---------- */
  const textarea = page.locator('.billing-page .ax-field textarea').first()
  await textarea.scrollIntoViewIfNeeded()
  const originMsg = await textarea.inputValue()
  await textarea.fill(`${originMsg}【面板自测】`)
  // 页面上有两个主按钮（保存计费设置 / 保存提示文字），只能按文本点
  const saveMsgBtn = page.locator('.credit-billing-page button', { hasText: '保存提示文字' })
  await saveMsgBtn.click()
  await page.waitForTimeout(1200)
  const msgNotice = (await page.locator('.billing-page .ax-note.is-ok').innerText()).trim()
  if (msgNotice.includes('提示文字已保存')) pass('提示文字保存成功', msgNotice)
  else fail('提示文字保存没反馈', msgNotice)

  // 从接口确认文案真的写库了
  const check = await context.request.get(`${BASE}/api/admin/credit-messages`, { headers: { Origin: BASE } })
  const body = await check.json()
  if (String(body.messages?.freeExhausted || '').includes('【面板自测】')) pass('接口回读确认文案已落库')
  else fail('接口回读没有新文案', JSON.stringify(body.messages?.freeExhausted))

  // 还原：清空这一条 → 后端回退默认文案
  await textarea.fill('')
  await saveMsgBtn.click()
  await page.waitForTimeout(1200)
  const afterMsg = await textarea.inputValue()
  if (!afterMsg.includes('【面板自测】') && afterMsg.trim().length > 0) pass('文案已还原成默认', afterMsg.slice(0, 30))
  else fail('文案还原失败', afterMsg.slice(0, 40))

  await shot(page, '02-after-save')

  /* ---------- 7. 窄屏不塌 ---------- */
  await page.setViewportSize({ width: 820, height: 900 })
  await page.waitForTimeout(500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow <= 2) pass('820px 宽无横向溢出')
  else fail('820px 宽出现横向滚动', `溢出 ${overflow}px`)
  await shot(page, '03-narrow')
  await page.setViewportSize({ width: 1440, height: 960 })

  /* ---------- 8. 没有 JS 报错 ---------- */
  const fatal = consoleErrors.filter((t) => !/favicon|404 \(Not Found\)|ResizeObserver/i.test(t))
  if (fatal.length === 0) pass('控制台无报错')
  else fail('控制台有报错', fatal.slice(0, 3).join(' | '))

  await context.close()
} catch (error) {
  fail('脚本异常中断', error?.message || String(error))
} finally {
  await browser.close()
}

const okCount = results.filter((r) => r.ok).length
console.log(`\n合计 ${results.length} 项，通过 ${okCount} 项，失败 ${results.length - okCount} 项`)
if (okCount !== results.length) process.exitCode = 1
