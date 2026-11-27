// P0 验收（确定性版）：用本地桩数据拦截 /api/ai/canvas/assistant，
// 直接验证「一次返回多步 → 前端整批执行 → 逐条小票 → 单步撤销」这条被改动的链路，
// 不依赖外部大模型的响应速度。
//
// 前置：
//  1) 后端：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy PORT=3311 AUTH_MODE=demo node server/index.js
//  2) 前端：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy VITE_AUTH_MODE=mock \
//             VITE_API_PROXY_TARGET=http://127.0.0.1:3311 ./node_modules/.bin/vite --port 5200 --host 127.0.0.1
//  3) 运行：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
//             "C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" scripts/verify-canvas-assistant-batch.mjs
import pw from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:5200'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
}

// 桩：一次返回 3 步（create_node text → create_node image → create_edge）
const STUB_PLAN = {
  ok: true,
  reply: '将搭建文案节点与封面图节点，并建立连线。',
  actions: [
    { type: 'create_node', clientId: 'stub-text', nodeType: 'text', position: { x: 320, y: 0 }, data: { title: '海报文案', prompt: '围绕品牌“疾风”写海报文案' } },
    { type: 'create_node', clientId: 'stub-image', nodeType: 'image', position: { x: 700, y: 0 }, data: { title: '封面图', prompt: '1:1 运动鞋促销海报封面', config: { ratio: '1:1' } } },
    { type: 'create_edge', source: 'stub-text', target: 'stub-image' },
  ],
  warnings: [],
  proposals: [],
  provider: 'stub', model: 'stub',
  phase: 'executing',
  plan: ['创建文案节点', '创建封面图节点', '连接两者'],
  agentState: { phase: 'executing' },
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-proxy-server', '--no-sandbox', '--disable-proxy-config'] })
const ctx = await browser.newContext({ viewport: { width: 1560, height: 940 } })
const page = await ctx.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

let assistCalls = 0
await page.route('**/api/ai/canvas/assistant', async (route) => {
  assistCalls += 1
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUB_PLAN) })
})

await ctx.addInitScript(() => {
  try {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '测试学生', role: 'student', className: 'AI创意美术A班', avatar: '艺' }, token: 'mock-token-project-new-art-studio' }))
  } catch {}
})

await page.goto(`${BASE}/student/canvas`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => console.log('goto warn:', e.message.slice(0, 120)))
await page.waitForTimeout(3500)

let composer = page.locator('.assistant-composer textarea')
if (await composer.count() === 0) {
  const header = page.locator('.accordion-section.assistant-section .accordion-header')
  if (await header.count()) { await header.first().click().catch(() => {}); await page.waitForTimeout(800) }
  composer = page.locator('.assistant-composer textarea')
}
check('画布页可加载', /canvas/i.test(page.url()), page.url())
check('助手输入框可见', await composer.count() > 0)
if (await composer.count() === 0) { await browser.close(); console.log('\n无法继续：助手面板不可用'); process.exit(1) }

const nodesBefore = await page.locator('.vue-flow__node').count()

await composer.first().fill('帮我搭一个海报工作流：先写文案再出封面图')
await composer.first().press('Enter')
await page.waitForTimeout(6000)

const ticketCount = await page.locator('.assistant-message.ticket').count()
const nodesAfter = await page.locator('.vue-flow__node').count()
const messagesText = await page.locator('.assistant-messages').innerText().catch(() => '')

check('助手接口只被请求一次（不再是「一步一问」）', assistCalls === 1, `calls=${assistCalls}`)
check('一次返回的 3 步全部执行并逐条出小票', ticketCount === 3, `ticket=${ticketCount}`)
check('画布实际新增 2 个节点', nodesAfter === nodesBefore + 2, `before=${nodesBefore} after=${nodesAfter}`)
check('出现「共 3 步」完成提示', /共 3 步/.test(messagesText), messagesText.replace(/\n/g, ' ').slice(-120))

// 单步撤销：点第一张小票
const firstUndo = page.locator('.assistant-message.ticket .ticket-undo').first()
if (await firstUndo.count()) {
  await firstUndo.click()
  await page.waitForTimeout(1500)
  const undone = await page.locator('.assistant-message.ticket .ticket-undone').count()
  const nodesUndone = await page.locator('.vue-flow__node').count()
  check('第一张小票可单步撤销（历史下标精确）', undone === 1, `undone=${undone}`)
  check('撤销后画布节点数随之回退', nodesUndone === nodesBefore, `before=${nodesBefore} undone=${nodesUndone}`)
} else {
  check('第一张小票可单步撤销（历史下标精确）', false, '未找到撤销按钮')
}

await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/assistant-batch-verify.png', fullPage: false })

const ignore = /favicon|Failed to fetch|net::ERR|status of 40\d|401 \(Unauthorized\)|404 \(Not Found\)|ResizeObserver/i
const runtimeErrors = errors.filter(e => !ignore.test(e))
check('无组件级运行时异常', runtimeErrors.length === 0, runtimeErrors.slice(0, 3).join(' | '))

await browser.close()
const passed = results.filter(r => r.ok).length
console.log(`\n==== ${passed}/${results.length} 通过 ====`)
process.exit(passed === results.length ? 0 : 1)
