// 积分模块一期验收：后台加列/弹窗/兑换码页签 + 学生个人中心兑换
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/verify-credit-module.mjs
// 输出：.workbuddy/evidence/credit-*.png

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

async function loginViaApi(context, account, password) {
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    data: { account, password },
    headers: { Origin: BASE },
  })
  if (!res.ok()) throw new Error(`登录失败 ${account}: ${res.status()}`)
  return res.json()
}

async function newSession(account, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  await loginViaApi(context, account, password)
  return { context, page }
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `credit-${name}.png`), fullPage: false })
}

try {
  /* ---------- 1. 后台：账号列表积分列 + 弹窗加分 ---------- */
  const admin = await newSession('guanliyuan88', '123456789')
  const { page: adminPage } = admin
  await adminPage.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  await adminPage.getByRole('button', { name: /账号权限/ }).click()
  await adminPage.waitForSelector('.account-table-surface .permission-head')

  const headers = await adminPage.$$eval('.account-table-surface .permission-head > *', (els) => els.map((e) => e.textContent.trim()))
  if (headers.includes('积分')) pass('后台账号表出现「积分」列', headers.join(' | '))
  else fail('后台账号表缺少「积分」列', headers.join(' | '))

  const firstCell = adminPage.locator('.account-credit-cell').first()
  const beforeText = (await firstCell.innerText()).replace(/\s+/g, ' ')
  if (await firstCell.count() === 0) fail('积分单元格未渲染')
  else pass('积分单元格已渲染', beforeText)
  await shot(adminPage, '01-admin-account-table')

  await firstCell.click()
  await adminPage.waitForSelector('.credit-dialog', { timeout: 8000 })
  pass('点击积分单元格弹出积分管理弹窗')
  await adminPage.waitForTimeout(600)
  await adminPage.locator('.credit-quick-row button').filter({ hasText: '+100' }).click()
  await adminPage.locator('.credit-adjust-form textarea').fill('E2E 弹窗加分')
  await shot(adminPage, '02-admin-credit-dialog')
  await adminPage.locator('.credit-dialog-actions .admin-primary-btn').click()
  await adminPage.waitForSelector('.el-message--success', { timeout: 10000 })
  const toast = await adminPage.locator('.el-message--success').first().innerText()
  if (/\d/.test(toast)) pass('弹窗加分成功并回显余额', toast.trim())
  else fail('弹窗加分未提示余额', toast.trim())
  await adminPage.waitForTimeout(800)
  const dialogBalance = await adminPage.locator('.credit-dialog-metrics article').first().innerText()
  pass('弹窗余额已刷新', dialogBalance.replace(/\s+/g, ' '))
  await shot(adminPage, '03-admin-credit-dialog-after')
  await adminPage.locator('.credit-dialog-actions .account-dialog-secondary').click()

  /* ---------- 2. 后台：兑换码页签发码 ---------- */
  await adminPage.getByRole('button', { name: '积分兑换码' }).click()
  await adminPage.waitForSelector('.credit-code-form')
  const faceInput = adminPage.locator('.credit-code-form input').nth(0)
  await faceInput.fill('60')
  await adminPage.locator('.credit-code-form input').nth(1).fill('1')
  await adminPage.locator('.credit-code-form input').nth(2).fill('E2EUI')
  await adminPage.locator('.credit-code-form input').nth(4).fill('JFE2EUI001')
  await adminPage.locator('.credit-code-form input').nth(5).fill('E2E 页面发码')
  await adminPage.locator('.credit-code-form button[type="submit"]').click()
  await adminPage.waitForSelector('.el-message--success', { timeout: 10000 })
  await adminPage.waitForTimeout(1200)

  const rows = adminPage.locator('.credit-code-row')
  const rowCount = await rows.count()
  if (rowCount > 0) pass('兑换码页签已列出发放记录', `共 ${rowCount} 行`)
  else fail('兑换码页签未列出发放记录')

  const newestCode = (await rows.first().locator('.credit-code-value').innerText()).trim()
  const newestStatus = (await rows.first().locator('.code-status').innerText()).trim()
  pass('拿到新生成的积分码', `${newestCode} / ${newestStatus}`)
  await shot(adminPage, '04-admin-credit-codes')

  /* ---------- 3. 学生端：粘贴兑换 ---------- */
  const student = await newSession('ceshi2', '123456789')
  const { page: stuPage } = student
  await stuPage.goto(`${BASE}/profile`, { waitUntil: 'networkidle' })
  await stuPage.waitForSelector('.profile-nav')
  await stuPage.locator('.profile-nav button', { hasText: '我的积分' }).click()
  await stuPage.waitForSelector('.code-redeem-row input')
  const balanceBefore = (await stuPage.locator('.wallet-metric.main strong').innerText()).trim()
  pass('学生「我的积分」显示当前余额', balanceBefore)
  await shot(stuPage, '05-student-wallet')

  await stuPage.locator('.code-redeem-row input').fill(newestCode.toLowerCase())
  await stuPage.locator('.code-redeem-row button').click()
  await stuPage.waitForSelector('.el-message--success', { timeout: 10000 })
  const redeemToast = await stuPage.locator('.el-message--success').first().innerText()
  pass('兑换成功提示', redeemToast.trim())
  await stuPage.waitForTimeout(1200)
  const balanceAfter = (await stuPage.locator('.wallet-metric.main strong').innerText()).trim()
  if (Number(balanceAfter) === Number(balanceBefore) + 60) pass('余额按面额增加 60', `${balanceBefore} → ${balanceAfter}`)
  else fail('余额未按面额增加', `${balanceBefore} → ${balanceAfter}`)
  await shot(stuPage, '06-student-wallet-after')

  const ledgerRows = await stuPage.locator('.wallet-ledger .ledger-list article').count()
  if (ledgerRows > 0) pass('流水已出现记录', `${ledgerRows} 条`)
  else fail('流水无记录')

  /* ---------- 4. 学生端：重复兑换报错 ---------- */
  await stuPage.locator('.code-redeem-row input').fill(newestCode)
  await stuPage.locator('.code-redeem-row button').click()
  await stuPage.waitForSelector('.el-message--error', { timeout: 10000 })
  const errToast = await stuPage.locator('.el-message--error').first().innerText()
  if (errToast.includes('已被使用')) pass('重复兑换被拦截', errToast.trim())
  else fail('重复兑换提示不符预期', errToast.trim())
  await shot(stuPage, '07-student-redeem-dup')

  /* ---------- 5. 后台：确认收款 ---------- */
  await adminPage.locator('.credit-code-head-actions button', { hasText: '刷新' }).click()
  await adminPage.waitForTimeout(1500)
  const targetRow = adminPage.locator('.credit-code-row', { hasText: newestCode }).first()
  const stRedeemed = (await targetRow.locator('.code-status').innerText()).trim()
  if (stRedeemed.includes('已兑换待核对')) pass('兑换后码状态变为待核对', stRedeemed)
  else fail('兑换后码状态不符', stRedeemed)

  await targetRow.locator('button', { hasText: '确认收款' }).click()
  await adminPage.waitForSelector('.el-message--success', { timeout: 10000 })
  await adminPage.waitForTimeout(1200)
  const stConfirmed = (await targetRow.locator('.code-status').innerText()).trim()
  if (stConfirmed.includes('已核对收款')) pass('确认收款后状态更新', stConfirmed)
  else fail('确认收款未生效', stConfirmed)
  await shot(adminPage, '09-admin-code-confirmed')

  /* ---------- 6. 学生端：积分充值板块生成订单 ---------- */
  await stuPage.locator('.profile-nav button', { hasText: '积分充值' }).click()
  await stuPage.waitForSelector('.package-card')
  const packCount = await stuPage.locator('.package-card').count()
  if (packCount === 4) pass('充值板块列出 4 个档位', `${packCount} 档`)
  else fail('充值档位数量不符', `${packCount} 档`)
  if (await stuPage.locator('.mock-qr').count() === 0) pass('没有假二维码占位')
  else fail('充值页仍存在假二维码')

  await stuPage.locator('.package-card').nth(1).locator('button').click()
  await stuPage.waitForSelector('.order-info .order-no', { timeout: 8000 })
  const orderNo = (await stuPage.locator('.order-info .order-no').innerText()).replace(/^订单号：/, '').trim()
  if (/^JF\d{10,}$/.test(orderNo)) pass('生成订单号', orderNo)
  else fail('订单号格式异常', orderNo)
  const payGuide = await stuPage.locator('.pay-guide').innerText()
  if (payGuide.includes('收款码')) pass('付款指引文案已显示', payGuide.replace(/\s+/g, ' ').slice(0, 60))
  else fail('付款指引缺失', payGuide.replace(/\s+/g, ' ').slice(0, 60))
  await shot(stuPage, '07b-student-payment')

  await stuPage.waitForSelector('.el-message', { state: 'detached', timeout: 8000 }).catch(() => {})
  await stuPage.locator('.order-info .order-copy').click()
  await stuPage.waitForSelector('.el-message--success', { timeout: 8000 })
  const copyToast = await stuPage.locator('.el-message--success').first().innerText()
  if (copyToast.includes('已复制')) pass('订单号可复制', copyToast.trim())
  else fail('订单号复制无反馈', copyToast.trim())

  await stuPage.locator('.pay-actions button', { hasText: '我已付款' }).click()
  await stuPage.waitForSelector('.code-redeem-row input', { timeout: 8000 })
  pass('「我已付款·去兑换」跳到我的积分')

  /* ---------- 7. 家长端余额接真数据 ---------- */
  try {
    const parent = await newSession('jiazhang3', '123456789')
    // 别用 networkidle：作品区有外部图床（火山 TOS）的图，慢或被墙时永远等不到空闲。
    await parent.page.goto(`${BASE}/parent`, { waitUntil: 'domcontentloaded' })
    await parent.page.waitForSelector('.parent-summary', { timeout: 15000 })
    const summaryText = await parent.page.locator('.parent-summary').innerText()
    if (summaryText.includes('积分余额')) pass('家长端显示积分余额', summaryText.replace(/\s+/g, ' ').slice(0, 90))
    else fail('家长端未显示积分余额', summaryText.replace(/\s+/g, ' ').slice(0, 90))
    await shot(parent.page, '08-parent-portal')
    await parent.context.close()
  } catch (error) {
    fail('家长端验证异常', error.message)
  }
} catch (error) {
  fail('脚本异常', error.message)
} finally {
  const bad = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - bad.length} 项，失败 ${bad.length} 项`)
  if (consoleErrors.length) console.log('控制台错误：\n' + [...new Set(consoleErrors)].slice(0, 8).join('\n'))
  await browser.close()
  process.exit(bad.length ? 1 : 0)
}
