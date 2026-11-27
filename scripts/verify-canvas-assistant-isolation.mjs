/**
 * 验证「无限画布助手的对话按账号分开」：同一台电脑换人登录，看不到上一个人的对话。
 *
 * 背景：以前画布助手把最近 10 条对话存在一个写死的浏览器键 `canvas-assistant-session-v1` 里，
 * 不分账号、退出登录也不清 —— A 学生退出、B 学生登录，B 打开助手就能看到 A 的全部对话。
 * 现在键名后面拼了账号指纹（见 src/utils/accountScope.js），A 的键和 B 的键不是同一个键。
 *
 * 全程零花费：`/api/ai/health` 与 `/api/ai/canvas/assistant` 都用假回包，
 * 不调用真实模型、不建节点、不出图。
 *
 * 用法：node scripts/verify-canvas-assistant-isolation.mjs
 * 前置：scripts/dev.mjs 已在 3000/5173 跑起来。
 */
import { createRequire } from 'node:module'

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// ───────────────────────── 第一段：存储层（纯函数） ─────────────────────────
console.log('\n=== 第一段：键名算法（不连服务器） ===')

// accountScope 只依赖 window.localStorage，给它一个假壳就能在 Node 里跑
const memoryStore = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
    setItem: (key, value) => memoryStore.set(key, String(value)),
    removeItem: (key) => memoryStore.delete(key),
  },
}
const {
  scopedStorageKey,
  readAccountText,
  writeAccountText,
  readAccountJson,
  writeAccountJson,
  removeAccountText,
  discardLegacyStorageKey,
} = await import('../src/utils/accountScope.js')

const BASE = 'canvas-assistant-session-v1'
const keyA = scopedStorageKey(BASE, 'user-a-0001')
const keyB = scopedStorageKey(BASE, 'user-b-0002')
check(keyA !== keyB, '两个账号算出两个不同的键', `${keyA} / ${keyB}`)
check(keyA.startsWith(`${BASE}::`), '键名保留了基础名（方便人肉认出这是什么数据）', keyA)
check(keyA === scopedStorageKey(BASE, 'user-a-0001'), '同一个账号每次算出来的键完全一样')
// 净化后长得一样的 ID，必须还是落到不同键（靠 hash 兜住）
const weird1 = scopedStorageKey(BASE, 'a/b:c')
const weird2 = scopedStorageKey(BASE, 'a_b_c')
check(weird1 !== weird2, '净化后长得一样的 ID 不会撞到同一个键', `${weird1} vs ${weird2}`)
check(scopedStorageKey(BASE, '') === scopedStorageKey(BASE, null), '拿不到账号时退成同一份 anonymous，不会乱指')

// 写读隔离
writeAccountJson(BASE, 'user-a-0001', { messages: [{ id: 'a1', text: '甲说的话' }] })
check(readAccountText(BASE, 'user-b-0002') === '', 'B 读不到 A 写的任何东西')
check(!JSON.stringify(readAccountJson(BASE, 'user-b-0002') || {}).includes('甲说的话'), 'B 读出来的内容里没有 A 的话')
writeAccountJson(BASE, 'user-b-0002', { messages: [{ id: 'b1', text: '乙说的话' }] })
check(JSON.stringify(readAccountJson(BASE, 'user-a-0001')).includes('甲说的话'), 'B 写东西没覆盖 A')
check(JSON.stringify(readAccountJson(BASE, 'user-a-0001')).includes('乙说的话') === false, 'A 那边一条乙的内容都没有')

// 坏数据自愈：键里塞一段不是 JSON 的东西
writeAccountText(BASE, 'user-a-0001', '{坏掉的')
check(readAccountJson(BASE, 'user-a-0001') === null, '坏掉的 JSON 当空处理，不抛错')
check(readAccountText(BASE, 'user-a-0001') === '', '坏掉的那条已被顺手清掉')

// 清只清自己
writeAccountJson(BASE, 'user-a-0001', { messages: [{ id: 'a2', text: '甲又说一句' }] })
removeAccountText(BASE, 'user-a-0001')
check(readAccountJson(BASE, 'user-a-0001') === null, '清掉 A 之后 A 是空的')
check(JSON.stringify(readAccountJson(BASE, 'user-b-0002')).includes('乙说的话'), '清 A 没影响 B')

// 老的不分账号的键必须被丢掉，不能继承给当前登录的人
memoryStore.set(BASE, JSON.stringify({ messages: [{ id: 'legacy', text: '不知道是谁的老对话' }] }))
check(discardLegacyStorageKey(BASE) === true, '检测到不分账号的老键')
check(memoryStore.has(BASE) === false, '老键已被删掉（不继承给任何人）')
check(discardLegacyStorageKey(BASE) === false, '没有老键时再清一次也不报错')

delete globalThis.window

// ───────────────────────── 第二段：真实浏览器换账号 ─────────────────────────
console.log('\n=== 第二段：同一浏览器换账号（真实后端 + 假模型回包） ===')
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const base = 'http://127.0.0.1:5173'

const health = await fetch(`${base}/api/health`).then((res) => res.json()).catch(() => null)
if (!health?.ok) {
  console.log('SKIP  第二段：本地服务没起来（先跑 scripts/dev.mjs）')
  console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join('、')}` : '第一段全部通过'}`)
  process.exit(fails.length ? 1 : 0)
}

const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

// 假模型：一个可用的文本模型 + 画布助手永远只回一句话，不产生任何节点
await page.route('**/api/ai/health', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    ok: true,
    defaultProvider: 'stub',
    activeProvider: 'stub',
    providers: { stub: { label: '验收桩', configured: true, imageModel: '', imageModels: [], videoModel: '', videoModels: [], textModel: 'stub-text', textModels: ['stub-text'] } },
  }),
}))
let assistantReply = ''
await page.route('**/api/ai/canvas/assistant', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    ok: true,
    reply: assistantReply,
    actions: [],
    warnings: [],
    proposals: [],
    phase: 'clarifying',
    plan: [],
    agentState: { phase: 'clarifying' },
    provider: 'stub',
    model: 'stub-text',
  }),
}))

async function loginAs(account, password) {
  await page.goto(`${base}/login?redirect=/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const inputs = page.locator('.el-input__inner')
  await inputs.nth(0).fill(account)
  await inputs.nth(1).fill('demo-school')
  await inputs.nth(2).fill(password)
  await page.getByRole('button', { name: /进入学生工作台/ }).click()
  await page.waitForTimeout(3200)
}

async function logout() {
  await page.request.post(`${base}/api/auth/logout`).catch(() => {})
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
}

async function openCanvas() {
  await page.goto(`${base}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3600)
  // 助手区默认展开，但不排除被折叠过；找不到输入框就点开面板
  if (!(await page.locator('.assistant-composer textarea').count())) {
    const header = page.locator('.accordion-section.assistant-section .accordion-header')
    if (await header.count()) {
      await header.first().click().catch(() => {})
      await page.waitForTimeout(900)
    }
  }
}

async function say(text, reply) {
  assistantReply = reply
  const box = page.locator('.assistant-composer textarea').first()
  await box.waitFor({ state: 'visible', timeout: 15000 })
  await box.fill(text)
  await box.press('Enter')
  await page.waitForTimeout(1800)
}

async function assistantText() {
  const box = page.locator('.assistant-messages').first()
  if (!(await box.count())) return ''
  return (await box.innerText()).replace(/\s+/g, ' ')
}

async function storageKeys() {
  return page.evaluate(() => Object.keys(localStorage))
}

async function storageValue(key) {
  return page.evaluate((k) => localStorage.getItem(k) || '', key)
}

const lineA = '甲同学问：帮我搭一个海报流程'
const lineB = '乙同学问：帮我搭一个视频流程'

// —— 甲登录 ——
await loginAs('ceshi2', '123456789')
// 埋一个老版本的全局键：进画布后它必须被清掉、内容不能被任何人继承
await page.evaluate(() => localStorage.setItem('canvas-assistant-session-v1', JSON.stringify({ messages: [{ id: 'legacy-1', role: 'user', text: '老版本不分账号的一句话' }], state: {} })))
await openCanvas()
const keysAfterAOpen = await storageKeys()
check(!keysAfterAOpen.includes('canvas-assistant-session-v1'), '不分账号的老键已被清掉')
check(!(await assistantText()).includes('老版本不分账号的一句话'), '老对话没有继承给甲')

await say(lineA, '甲的老师：好的，先确认海报主题。')
const aText = await assistantText()
check(aText.includes(lineA), '甲自己说的话显示出来了', aText.slice(0, 40))
const aKeys = (await storageKeys()).filter((key) => key.startsWith('canvas-assistant-session-v1::'))
check(aKeys.length === 1, '甲只对应一个带账号指纹的键', aKeys.join(' , '))
const aKey = aKeys[0]
check((await storageValue(aKey)).includes(lineA), '甲的话确实落在这个账号专属的键里')

// 刷新一下，甲的对话还得在（体验不能退）
await openCanvas()
check((await assistantText()).includes(lineA), '甲刷新后自己的对话还在')

// —— 换乙登录（同一个浏览器、同一份 localStorage） ——
await logout()
await loginAs('ceshi3', '123456789')
await openCanvas()
const bInitialText = await assistantText()
check(!bInitialText.includes(lineA), '乙登录后看不到甲说的话', bInitialText.slice(0, 40))
const bKeysBefore = (await storageKeys()).filter((key) => key.startsWith('canvas-assistant-session-v1::'))
// 乙还没说话，助手对话键理应只有甲那一条（乙的键在第一次说话时才建）
check(bKeysBefore.length === 1 && bKeysBefore[0] === aKey, '乙还没说话时，浏览器里只有甲那一条对话键', bKeysBefore.join(' , '))

await say(lineB, '乙的老师：好的，先确认视频时长。')
const bText = await assistantText()
check(bText.includes(lineB), '乙自己说的话显示出来了', bText.slice(0, 40))
check(!bText.includes(lineA), '乙的对话区里一条甲的内容都没有')
const bKeysAfter = (await storageKeys()).filter((key) => key.startsWith('canvas-assistant-session-v1::'))
check(bKeysAfter.length === 2, '说完话后甲、乙各有一条对话键，互不覆盖', bKeysAfter.join(' , '))
const bKey = bKeysAfter.find((key) => key !== aKey)
check(Boolean(bKey) && (await storageValue(bKey)).includes(lineB), '乙的话落在乙自己的键里', bKey || '未找到乙的键')
check(!(await storageValue(aKey)).includes(lineB), '乙的话没有写进甲的键')

// 「上次打开哪张画布」也按账号分（否则换人登录会去翻别人的画布）
const canvasDocKeys = (await storageKeys()).filter((key) => key.startsWith('ai-workflow-canvas-document-id::'))
check(canvasDocKeys.length >= 1, '「记住上次画布」的键也带了账号指纹', canvasDocKeys.join(' , '))
check(!(await storageKeys()).includes('ai-workflow-canvas-document-id'), '不再有不分账号的画布 ID 键')

// —— 甲再登回来 ——
await logout()
await loginAs('ceshi2', '123456789')
await openCanvas()
const aBackText = await assistantText()
check(aBackText.includes(lineA), '甲登回来后自己的对话还在', aBackText.slice(0, 40))
check(!aBackText.includes(lineB), '甲看不到乙说的话')

// 收尾：清掉这次验收留在浏览器里的东西（不碰服务器数据）
await page.evaluate(() => {
  Object.keys(localStorage)
    .filter((key) => key.startsWith('canvas-assistant-session-v1::') || key.startsWith('ai-workflow-canvas-document-id::'))
    .forEach((key) => localStorage.removeItem(key))
})
check(pageErrors.length === 0, '页面没有 JS 报错', pageErrors.slice(0, 2).join(' | '))

await browser.close()
console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join('、')}` : '全部通过'}`)
process.exit(fails.length ? 1 : 0)
