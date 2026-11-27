/**
 * 验证「智能体记忆的账号隔离」：A 账号的对话绝不可能跑到 B 账号那里。
 *
 * 分两段跑，全程零花费（/understand 用假回包，不调用真实模型、不出图）：
 *
 * 第一段（不需要服务器，纯模块）：
 *   - A 写 2 条 → B 读到 0 条
 *   - B 写 3 条 → A 仍是 2 条
 *   - 磁盘上确实是两个不同文件，各自记着自己的 userId
 *   - 两个「长得差不多」的 ID 也会落到不同文件（不会撞车）
 *   - 同一个 ID 两次算出的文件名完全一致（不会越聊越多文件）
 *   - 万一文件被改成了别人的 userId，读出来必须是空的（宁可忘记，不可串号）
 *   - A 清空后 A=0，B 的 3 条一条不少
 *   - 老版本「所有账号挤一个文件」的数据能自动拆开，不丢
 *
 * 第二段（真实浏览器 + 真实后端）：两个浏览器各登录一个学生账号，
 *   各说一句话，互相看不到；清掉一个，另一个不受影响。
 *
 * 用法：node scripts/verify-agent-memory-isolation.mjs
 * 前置：scripts/dev.mjs 已在 3000/5173 跑起来（改了 server/*.js 要重启）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  agentMemoryFile,
  agentMemoryOwnerId,
  appendAgentMessage,
  clearAgentMessages,
  listAgentMemoryOwners,
  listAgentMessages,
  migrateLegacyAgentMemory,
} from '../server/agent-memory-store.js'

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// ───────────────────────── 第一段：模块级隔离 ─────────────────────────
console.log('\n=== 第一段：模块级（不连服务器） ===')
const sandbox = join(tmpdir(), `agent-memory-isolation-${Date.now()}`)
mkdirSync(sandbox, { recursive: true })

const userA = { id: 'user-a-0001', name: '学生甲', organization: { id: 'demo-school' } }
const userB = { id: 'user-b-0002', name: '学生乙', organization: { id: 'demo-school' } }

appendAgentMessage(sandbox, userA, { role: 'student', content: '甲说的第一句：画一只蓝鲸', page: 'paint' })
appendAgentMessage(sandbox, userA, { role: 'agent', content: '甲的老师回话：蓝鲸在云上', page: 'paint' })

let a = listAgentMessages(sandbox, userA)
let b = listAgentMessages(sandbox, userB)
check(a.total === 2, 'A 自己读到 2 条', `total=${a.total}`)
check(b.total === 0, 'B 读到 0 条（看不到 A 的对话）', `total=${b.total}`)

appendAgentMessage(sandbox, userB, { role: 'student', content: '乙说的第一句：画一只白兔', page: 'video' })
appendAgentMessage(sandbox, userB, { role: 'agent', content: '乙的老师回话：白兔在雪地', page: 'video' })
appendAgentMessage(sandbox, userB, { role: 'student', content: '乙说的第二句：再加点梅花', page: 'video' })

a = listAgentMessages(sandbox, userA)
b = listAgentMessages(sandbox, userB)
check(b.total === 3, 'B 自己读到 3 条', `total=${b.total}`)
check(a.total === 2, 'B 说话没有污染 A（A 仍是 2 条）', `total=${a.total}`)
check(
  !a.messages.some((item) => item.content.includes('白兔')) && !a.messages.some((item) => item.content.includes('梅花')),
  'A 的对话里一条 B 的内容都没有',
)
check(
  !b.messages.some((item) => item.content.includes('蓝鲸')),
  'B 的对话里一条 A 的内容都没有',
)

// 磁盘上确实是两个文件
const files = readdirSync(join(sandbox, 'agent-memory')).filter((name) => name.endsWith('.json'))
check(files.length === 2, '磁盘上是两个独立文件', files.join(' , '))
const fileA = JSON.parse(readFileSync(agentMemoryFile(sandbox, userA.id), 'utf8'))
const fileB = JSON.parse(readFileSync(agentMemoryFile(sandbox, userB.id), 'utf8'))
check(fileA.userId === userA.id && fileA.messages.length === 2, 'A 的文件里只装 A 的 2 条', `userId=${fileA.userId}`)
check(fileB.userId === userB.id && fileB.messages.length === 3, 'B 的文件里只装 B 的 3 条', `userId=${fileB.userId}`)

// 文件名不会撞车：两个净化后长得一样的 ID，必须落到不同文件
const weird1 = agentMemoryFile(sandbox, 'a/b:c')
const weird2 = agentMemoryFile(sandbox, 'a_b_c')
check(weird1 !== weird2, '长得像的 ID 不会撞到同一个文件', `${weird1.split(/[\\\\/]/).pop()} vs ${weird2.split(/[\\\\/]/).pop()}`)
check(agentMemoryFile(sandbox, 'same-id') === agentMemoryFile(sandbox, 'same-id'), '同一个 ID 永远对应同一个文件')

// 第三层保险：文件被改成别人的 userId，读出来必须是空的
const victimFile = agentMemoryFile(sandbox, userA.id)
const tampered = JSON.parse(readFileSync(victimFile, 'utf8'))
writeFileSync(victimFile, JSON.stringify({ ...tampered, userId: userB.id }, null, 2), 'utf8')
a = listAgentMessages(sandbox, userA)
check(a.total === 0, '文件里记的是别人 → 一律当空记忆，不吐给当前账号', `total=${a.total}`)
// 恢复现场
writeFileSync(victimFile, JSON.stringify(tampered, null, 2), 'utf8')
a = listAgentMessages(sandbox, userA)
check(a.total === 2, '恢复后 A 的记忆完好', `total=${a.total}`)

// 清空只清自己
const cleared = clearAgentMessages(sandbox, userA)
b = listAgentMessages(sandbox, userB)
check(cleared.removed === 2, 'A 清掉 2 条', `removed=${cleared.removed}`)
check(listAgentMessages(sandbox, userA).total === 0, '清空后 A 归零')
check(b.total === 3, 'A 清空后 B 的 3 条一条不少', `total=${b.total}`)

// 空内容拒绝
let rejected = false
try {
  appendAgentMessage(sandbox, userA, { role: 'student', content: '   ' })
} catch (error) {
  rejected = error.statusCode === 400
}
check(rejected, '空内容写不进去（400）')

// 老版本单文件迁移
const legacyDir = join(tmpdir(), `agent-memory-legacy-${Date.now()}`)
mkdirSync(legacyDir, { recursive: true })
writeFileSync(
  join(legacyDir, 'agent-memory.json'),
  JSON.stringify({
    version: 1,
    updatedAt: '2026-11-14T00:00:00.000Z',
    owners: {
      'legacy-a': { userId: 'legacy-a', userName: '老甲', organizationId: 'demo-school', messages: [{ id: 'm1', role: 'student', content: '老数据甲的这句要保住', page: 'paint', at: '' }] },
      'legacy-b': { userId: 'legacy-b', userName: '老乙', organizationId: 'demo-school', messages: [{ id: 'm2', role: 'student', content: '老数据乙的这句要保住', page: 'video', at: '' }] },
    },
  }, null, 2),
  'utf8',
)
const movedCount = migrateLegacyAgentMemory(legacyDir)
check(movedCount === 2, '老版单文件里的 2 个账号被拆成独立文件', `moved=${movedCount}`)
check(
  listAgentMessages(legacyDir, { id: 'legacy-a' }).total === 1
  && listAgentMessages(legacyDir, { id: 'legacy-b' }).total === 1,
  '拆完之后两个账号各读各的，老数据没丢',
)
const legacyAfter = JSON.parse(readFileSync(join(legacyDir, 'agent-memory.json'), 'utf8'))
check(Object.keys(legacyAfter.owners || {}).length === 0, '老文件已清空，不会再把数据搬回来')
check(listAgentMessages(legacyDir, { id: 'legacy-a' }).total === 1, '再读一次不会被老数据重复写入')

// 运维视角：只列账号不列内容
const owners = listAgentMemoryOwners(sandbox)
check(owners.length === 1 && owners[0].userId === userB.id, '运维列表只看到还有记忆的账号（B）', JSON.stringify(owners.map((i) => i.userId)))
check(!JSON.stringify(owners).includes('白兔'), '运维列表不含对话正文')

rmSync(sandbox, { recursive: true, force: true })
rmSync(legacyDir, { recursive: true, force: true })

// ───────────────────────── 第二段：两个真实浏览器 ─────────────────────────
console.log('\n=== 第二段：两个真实浏览器各登录一个学生 ===')
const { createRequire } = await import('node:module')
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const base = 'http://127.0.0.1:5173'

const health = await fetch(`${base}/api/health`).then((res) => res.json()).catch(() => null)
if (!health?.ok) {
  console.log('SKIP  第二段：本地服务没起来（先跑 scripts/dev.mjs）')
  console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join('、')}` : '模块级全部通过'}`)
  process.exit(fails.length ? 1 : 0)
}

const browser = await chromium.launch({ executablePath: CHROME })

async function loginAs(account, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  // 假回包：只验隔离，绝不调用真实模型
  await page.route('**/api/student/agent/understand', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      agentName: 'AI 小画师',
      reply: `我是 ${account} 的老师`,
      readyToRun: false,
      prompt: '',
      additions: [],
      missing: [],
      questions: [],
      actionKey: '',
    }),
  }))
  await page.goto(`${base}/login?redirect=/student/video`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const inputs = page.locator('.el-input__inner')
  await inputs.nth(0).fill(account)
  await inputs.nth(1).fill('demo-school')
  await inputs.nth(2).fill(password)
  await page.getByRole('button', { name: /进入学生工作台/ }).click()
  await page.waitForTimeout(3000)
  await page.evaluate(() => localStorage.setItem('art-studio-difficulty', 'pro'))
  return { context, page }
}

async function openPanel(page, route, waitMs = 2600) {
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(waitMs)
  const figure = page.locator('.sa-figure-btn').first()
  await figure.waitFor({ state: 'visible', timeout: 20000 })
  if (!(await page.locator('.sa-panel').first().isVisible().catch(() => false))) {
    await figure.click({ force: true })
  }
  await page.waitForTimeout(800)
}

async function say(page, text) {
  const input = page.locator('.sa-panel .sa-input').first()
  await input.fill(text)
  await page.locator('.sa-panel .sa-send, .sa-panel button:has-text("发送")').first().click({ force: true })
  await page.waitForTimeout(1600)
}

async function streamText(page) {
  const stream = page.locator('.sa-panel .sa-stream').first()
  if (!(await stream.count())) return ''
  return (await stream.innerText()).replace(/\s+/g, ' ')
}

const alice = await loginAs('ceshi2', '123456789')
const bob = await loginAs('ceshi3', '123456789')

// 两个人各自先清干净，保证起点是有意的（不是碰巧）
await alice.page.request.delete(`${base}/api/student/agent/memory`)
await bob.page.request.delete(`${base}/api/student/agent/memory`)

const aliceLine = '甲同学说的：我要画一只蓝鲸'
const bobLine = '乙同学说的：我要画一只白兔'

await openPanel(alice.page, '/student/video')
await say(alice.page, aliceLine)
await openPanel(bob.page, '/student/video')
let bobStream = await streamText(bob.page)
check(!bobStream.includes(aliceLine), '乙刚进来时看不到甲说的话', bobStream.slice(0, 40))

await say(bob.page, bobLine)
await openPanel(alice.page, '/student/video')
const aliceStream = await streamText(alice.page)
check(aliceStream.includes(aliceLine), '甲自己刷新后还能看到自己的话')
check(!aliceStream.includes(bobLine), '甲看不到乙说的话')

const aliceMemory = await alice.page.request.get(`${base}/api/student/agent/memory?limit=50`).then((res) => res.json())
const bobMemory = await bob.page.request.get(`${base}/api/student/agent/memory?limit=50`).then((res) => res.json())
const aliceContents = (aliceMemory.messages || []).map((item) => item.content).join(' | ')
const bobContents = (bobMemory.messages || []).map((item) => item.content).join(' | ')
check(aliceContents.includes(aliceLine) && !aliceContents.includes(bobLine), '接口层：甲只拿到自己的', aliceContents)
check(bobContents.includes(bobLine) && !bobContents.includes(aliceLine), '接口层：乙只拿到自己的', bobContents)

// 清掉甲，乙不受影响
await alice.page.request.delete(`${base}/api/student/agent/memory`)
const bobAfter = await bob.page.request.get(`${base}/api/student/agent/memory?limit=50`).then((res) => res.json())
check(bobAfter.total > 0, '甲清空后乙的记忆还在', `total=${bobAfter.total}`)

// 收尾：把两个人的测试对话都清掉，不留垃圾
await bob.page.request.delete(`${base}/api/student/agent/memory`)
await browser.close()

console.log(`\n${fails.length ? `失败 ${fails.length} 项：${fails.join('、')}` : '全部通过'}`)
process.exit(fails.length ? 1 : 0)
