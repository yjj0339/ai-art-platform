// 端到端验证「结果展示」节点入口：
// 自建临时玩法 → 删掉结果节点（模拟用户重搭后没有结果节点）→ 拖线松手加回「结果展示」→ 保存草稿 → 断言 → 删除临时玩法
import { createRequire } from 'node:module'
import path from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE_PATH,
    'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core',
    'playwright-core', 'playwright',
  ].filter(Boolean)
  for (const name of candidates) { try { return require(name) } catch {} }
  throw new Error('找不到 playwright-core')
}

const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3000'
const SHOT_DIR = path.resolve(process.cwd(), 'scripts/tmp-shots')
mkdirSync(SHOT_DIR, { recursive: true })
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
})
const cookieHeader = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
const cookies = cookieHeader.split('; ').map((pair) => {
  const idx = pair.indexOf('=')
  return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: '127.0.0.1', path: '/' }
})

const api = (method, url, body) => fetch(`${API}${url}`, {
  method,
  headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
})

// 1. 自建临时玩法（默认模板自带结果节点）
const configuration = {
  schemaVersion: 2,
  presentation: {},
  workflow: {
    version: 1,
    nodes: [
      { id: 'prompt-1', type: 'prompt', position: { x: 330, y: 305 }, data: { title: '创作提示词', prompt: '画一只{{subject}}' } },
      { id: 'image-1', type: 'image', position: { x: 620, y: 260 }, data: { title: '图像生成' } },
      { id: 'result-1', type: 'result', position: { x: 900, y: 310 }, data: { title: '图片结果', state: 'idle' } },
    ],
    edges: [
      { id: 'e1', source: 'prompt-1', target: 'image-1', type: 'default' },
      { id: 'e2', source: 'image-1', target: 'result-1', type: 'default' },
    ],
  },
  studentPage: {
    layoutVersion: 1,
    columns: 12,
    blocks: [
      { id: 'b1', type: 'textarea', key: 'subject', binding: 'prompt-1', span: 12, label: '画面描述', required: true, placeholder: '描述你想生成的画面' },
      { id: 'b2', type: 'submit', span: 12, label: '生成图片' },
      { id: 'b3', type: 'result', span: 12, label: '图片结果' },
    ],
  },
  runtime: { provider: 'volcengine', model: 'doubao-seedream-4-0-250828', capability: 'text-to-image', promptTemplate: '画一只{{subject}}', ratio: '1:1', count: 1, testedAt: '' },
  limits: { dailyLimit: 0 },
}
const created = await api('POST', '/api/admin/ai-skills', { title: `临时验证-结果节点-${Date.now().toString(36)}`, skillType: 'image', configuration })
const createdText = await created.text()
if (!created.ok) throw new Error(`创建临时玩法失败 ${created.status} ${createdText.slice(0, 200)}`)
const skillId = (JSON.parse(createdText).skill || {}).id
console.log('临时玩法:', skillId)
if (!skillId) throw new Error('没拿到 skillId')

const results = []
const check = (name, pass, extra = '') => { results.push({ name, pass }); console.log(`断言 ${name}: ${pass ? 'PASS' : 'FAIL'}${extra ? ` (${extra})` : ''}`) }

let browser
try {
  const pw = loadPlaywright()
  browser = await pw.chromium.launch({ headless: true, executablePath: existsSync(EXE) ? EXE : undefined })
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } })
  await context.addCookies(cookies)
  const page = await context.newPage()

  await page.goto(`${BASE}/admin/ai-skills/${skillId}/workflow`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node', { timeout: 40000 })
  await page.waitForTimeout(1500)
  const initialNodes = await page.locator('.vue-flow__node').count()
  const initialResult = await page.locator('.vue-flow__node-result').count()
  const initialEdges = await page.locator('.vue-flow__edge').count()
  console.log('初始节点:', initialNodes, '结果节点:', initialResult, '连线:', initialEdges)
  check('初始画布带结果节点', initialResult >= 1)

  // 2. 删掉结果节点（点选 → 按 Delete）
  const resultNode = page.locator('.vue-flow__node-result').first()
  await resultNode.click({ position: { x: 40, y: 60 } })
  await page.waitForTimeout(500)
  await page.keyboard.press('Delete')
  await page.waitForTimeout(900)
  const afterDelete = await page.locator('.vue-flow__node-result').count()
  console.log('删除后结果节点:', afterDelete)
  check('结果节点已被删除', afterDelete === 0)

  // 3. 从「图像生成」右侧圆点拖线到空白处松手 → 弹出菜单
  const imageNode = page.locator('.vue-flow__node-image').first()
  const imageBox = await imageNode.boundingBox()
  if (!imageBox) throw new Error('拿不到图像生成节点位置')
  const sourceHandle = imageNode.locator('.vue-flow__handle.source, .vue-flow__handle-right').first()
  const handleBox = await sourceHandle.boundingBox()
  if (!handleBox) throw new Error('拿不到右侧连线圆点位置')
  const startX = handleBox.x + handleBox.width / 2
  const startY = handleBox.y + handleBox.height / 2
  // 落点要挑右侧面板之外的空地，否则松手菜单会被面板盖住，鼠标点不到（真实用户也会遇到，属正常布局）
  const dropX = startX - 30
  const dropY = startY + 240
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 40, startY + 10, { steps: 6 })
  await page.mouse.move(dropX, dropY, { steps: 12 })
  await page.mouse.up()

  const connMenu = page.locator('.connection-create-menu')
  await connMenu.waitFor({ timeout: 8000 })
  const connOptions = (await connMenu.locator('button').allTextContents()).map((s) => s.trim())
  console.log('拖线松手菜单:', connOptions.join(' / '))
  check('菜单里有「结果展示」', connOptions.includes('结果展示'))
  await page.screenshot({ path: path.join(SHOT_DIR, 'conn-menu.png') })
  await connMenu.locator('button', { hasText: '结果展示' }).first().click()
  await page.waitForTimeout(1200)

  const afterAdd = await page.locator('.vue-flow__node-result').count()
  const afterAddEdges = await page.locator('.vue-flow__edge').count()
  console.log('拖线加回后 结果节点:', afterAdd, '连线:', afterAddEdges)
  check('结果节点已加回', afterAdd === 1)
  check('自动连上一条线', afterAddEdges === initialEdges + 1, `${initialEdges} → ${afterAddEdges}`)
  await page.screenshot({ path: path.join(SHOT_DIR, 'result-node-added.png') })

  // 3b. 顺便验证「创作」菜单里也有结果展示
  await page.locator('button[aria-label="创作"]').click()
  const popover = page.locator('.create-popover')
  await popover.waitFor({ timeout: 8000 })
  const optionLabels = (await popover.locator('.create-options button').allTextContents()).map((s) => s.trim())
  console.log('创作菜单项:', optionLabels.join(' / '))
  check('创作菜单里有「结果展示」', optionLabels.includes('结果展示'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 4. 保存草稿
  await page.locator('.file-menu-trigger').click()
  await page.waitForTimeout(400)
  await page.locator('.file-menu button', { hasText: '保存草稿' }).first().click()
  await page.waitForTimeout(3000)
  const toasts = (await page.locator('.el-message').allTextContents()).map((s) => s.trim())
  console.log('保存提示:', JSON.stringify(toasts))
  check('保存没有报「缺少结果节点」', !toasts.some((t) => t.includes('缺少结果节点')))
  await page.screenshot({ path: path.join(SHOT_DIR, 'after-save.png') })

  // 5. 回读数据库里的草稿
  const detail = await api('GET', `/api/admin/ai-skills/${skillId}`)
  const data = (await detail.json()).skill || {}
  const wf = (data.draftConfiguration || {}).workflow || {}
  const nodes = wf.nodes || []
  const types = nodes.map((n) => n.type)
  const resultNodeIds = new Set(nodes.filter((n) => n.type === 'result').map((n) => n.id))
  const resultEdges = (wf.edges || []).filter((e) => resultNodeIds.has(e.target))
  console.log('草稿节点类型:', types.join(','), '| 连线数:', (wf.edges || []).length)
  console.log('指向结果节点的连线:', JSON.stringify(resultEdges.map((e) => `${e.source}→${e.target}`)))
  check('草稿里有结果节点', types.includes('result'))
  check('结果节点有上游连线', resultEdges.length >= 1)
} finally {
  if (browser) await browser.close()
  const del = await api('DELETE', `/api/admin/ai-skills/${skillId}`)
  console.log('删除临时玩法:', del.status)
  const failed = results.filter((r) => !r.pass)
  console.log(`\n总计 ${results.length} 项，通过 ${results.length - failed.length} 项`)
  if (failed.length) {
    console.log('未通过:', failed.map((r) => r.name).join(' / '))
    process.exitCode = 1
  }
}
