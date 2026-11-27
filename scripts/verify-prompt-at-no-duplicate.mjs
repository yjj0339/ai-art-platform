// 验收：在节点提示词输入框里打字后，直接点上游 @ 插入引用片，不得出现「同一段提示词显示两遍」。
// 根因：@ 按钮上有 @pointerdown.stop，输入框不会失焦，浏览器键入留下的原生文字节点不会被 Vue 清掉，
// 于是它与 Vue 按数据画出的文字块并存（看起来两遍，刷新后仍在，且会被提交给模型）。
// 修复：插入引用片前先回读输入框真实内容进数据，再换 promptEditorDomKeys 钥匙整块重渲染。
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const projectDir = process.cwd()
const STUB_PORT = 3303
const WEB_PORT = 5203
const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ::  ${JSON.stringify(detail)}`}`)
}

const stub = http.createServer((req, res) => {
  req.on('data', () => {})
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

const vite = spawn(
  path.join(projectDir, 'node_modules', '.bin', 'vite'),
  ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'],
  {
    cwd: projectDir,
    shell: true,
    env: { ...process.env, VITE_AUTH_MODE: 'mock', VITE_AI_MODE: 'api', VITE_API_BASE_URL: '/api', VITE_SERVER_PORT: String(STUB_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
const kill = (c) => { if (!c || c.killed) return; try { spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {} }

const SEED = `
  if (!sessionStorage.getItem('at-dup-seeded')) {
    sessionStorage.setItem('at-dup-seeded', '1');
    const img = ${JSON.stringify(TINY)};
    const canvas = { version: 2, nodes: [
      { id: 'upload-1', type: 'upload', position: { x: 360, y: 430 }, data: { title: '图片', originalName: '上游素材图', image: img } },
      { id: 'image-1', type: 'image', position: { x: 360, y: -10 }, data: {
        title: '图像生成', mode: 'image-generation', status: 'succeeded',
        config: { model: 'agnes-image-2.0-flash', ratio: '1:1' }, outputAspectRatio: 1, error: '',
        prompt: '', promptParts: [], output: { url: img, imageData: img, originalName: 'x' },
      } },
    ], edges: [{ id: 'e1', source: 'upload-1', target: 'image-1', type: 'default', interactionWidth: 28 }], settings: {}, edgesVisible: true };
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas));
  }
`

const NODE = '.vue-flow__node[data-id="image-1"]'

try {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch {}
    if (i === 159) throw new Error('vite 启动失败')
    await delay(250)
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
  const makePage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    await ctx.addInitScript(() => {
      localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '验收', role: 'student', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    })
    await ctx.addInitScript(SEED)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
    await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(NODE, { timeout: 30000 })
    await delay(900)
    const closePalette = page.locator('button[aria-label="关闭创建节点面板"]')
    if (await closePalette.count()) await closePalette.first().click().catch(() => {})
    await delay(150)
    await page.evaluate(() => {
      const wrapper = document.querySelector('.vue-flow__node[data-id="image-1"]')
      if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })
    await page.waitForSelector(`${NODE} .image-composer-panel`, { timeout: 15000 })
    await delay(400)
    return { ctx, page }
  }

  const snapshot = (page) => page.evaluate(() => {
    const editor = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
    let data = null
    try { data = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}').nodes.find((n) => n.id === 'image-1')?.data } catch {}
    const parts = Array.isArray(data?.promptParts) ? data.promptParts : []
    return {
      // innerText 是用户真正看到的内容（含浏览器原生文字节点与 Vue 绘制的文字块）
      visibleText: editor ? editor.innerText.replace(/\n/g, '') : null,
      chipCount: editor ? editor.querySelectorAll('.inline-prompt-reference').length : -1,
      elementChipCount: editor ? editor.querySelectorAll('.inline-prompt-element').length : -1,
      partsText: parts.filter((p) => p.type === 'text').map((p) => p.text).join('|'),
      referenceIds: parts.filter((p) => p.type === 'reference').map((p) => p.id),
      elementIds: parts.filter((p) => p.type === 'element').map((p) => p.id),
      prompt: data?.prompt,
      elements: Array.isArray(data?.elements) ? data.elements.map((e) => e.id) : [],
    }
  })

  const typeIntoEditor = async (page, text) => {
    await page.locator(`${NODE} .inline-prompt-editor`).click()
    await page.keyboard.type(text, { delay: 25 })
    await delay(450)
  }
  const clickAt = async (page) => {
    await page.locator(`${NODE} .upstream-thumb-mention`).first().click()
    await delay(700)
  }

  // ── 场景 1：打字后直接点 @（原来出错的路径）
  {
    const { ctx, page } = await makePage()
    await typeIntoEditor(page, '一只橘猫坐在窗台上')
    await clickAt(page)
    const s = await snapshot(page)
    check('1 打字后点@：界面文字不重复', s.visibleText === '一只橘猫坐在窗台上@上游素材图', s.visibleText)
    check('1 打字后点@：数据文字不重复', s.partsText === '一只橘猫坐在窗台上', s.partsText)
    check('1 打字后点@：引用片恰为 1 个', s.chipCount === 1 && s.referenceIds.length === 1, { chip: s.chipCount, ids: s.referenceIds })
    await page.screenshot({ path: '.verify-prompt-at-fixed.png' })
    await ctx.close()
  }

  // ── 场景 2：连续点 @ 三次，不得叠加/复制文字
  {
    const { ctx, page } = await makePage()
    await typeIntoEditor(page, '一只橘猫坐在窗台上')
    await clickAt(page); await clickAt(page); await clickAt(page)
    const s = await snapshot(page)
    check('2 连点@三次：界面文字仍只一份', s.visibleText === '一只橘猫坐在窗台上@上游素材图@上游素材图@上游素材图', s.visibleText)
    check('2 连点@三次：数据文字仍只一份', s.partsText === '一只橘猫坐在窗台上', s.partsText)
    check('2 连点@三次：引用片 3 个', s.referenceIds.length === 3, s.referenceIds)
    await ctx.close()
  }

  // ── 场景 3：点 @ 后刷新页面，文字与引用片都要还在且不重复
  {
    const { ctx, page } = await makePage()
    await typeIntoEditor(page, '一只橘猫坐在窗台上')
    await clickAt(page)
    await delay(1200) // 等自动保存落盘
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(NODE, { timeout: 30000 })
    await delay(1200)
    await page.evaluate(() => {
      const wrapper = document.querySelector('.vue-flow__node[data-id="image-1"]')
      if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })
    await delay(800)
    const s = await snapshot(page)
    check('3 刷新后：界面文字不重复', s.visibleText === '一只橘猫坐在窗台上@上游素材图', s.visibleText)
    check('3 刷新后：数据文字不重复', s.partsText === '一只橘猫坐在窗台上', s.partsText)
    check('3 刷新后：引用片保留', s.chipCount === 1, s.chipCount)
    await ctx.close()
  }

  // ── 场景 4：光标停在文字中间时点 @，还必须插在光标处（原有能力不能退化）
  {
    const { ctx, page } = await makePage()
    await typeIntoEditor(page, '一只橘猫')
    // 把光标放到「猫」与「坐」之间
    await page.evaluate(() => {
      const editor = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      const target = walker.nextNode()
      if (!target) return
      const range = document.createRange()
      range.setStart(target, 2)
      range.collapse(true)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    })
    await delay(200)
    await clickAt(page)
    const s = await snapshot(page)
    const order = await page.evaluate(() => {
      const editor = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
      return editor ? Array.from(editor.children).map((n) => (n.classList.contains('inline-prompt-reference') ? '@chip' : (n.textContent || '').trim())).filter(Boolean) : []
    })
    console.log('    子节点顺序 =', JSON.stringify(order))
    // 光标在「一只|橘猫」之间，插入后应为 一只 + chip + 橘猫；断言按子节点序列判，不靠全文字符串匹配
    //（chip 文字「@上游素材图」会打断整词匹配，用整串比对会误判）。
    const orderOk = order.length === 3 && order[0] === '一只' && order[1] === '@chip' && order[2] === '橘猫'
    const textOnly = order.filter((item) => item !== '@chip').join('')
    check('4 光标中间插@：插在光标处（一只 / chip / 橘猫）', orderOk, order)
    check('4 光标中间插@：文字无重复（拼回后仍是一只橘猫）', textOnly === '一只橘猫' && s.partsText.replace(/\|/g, '') === '一只橘猫', { textOnly, partsText: s.partsText })
    check('4 光标中间插@：引用片 1 个', s.referenceIds.length === 1, s.referenceIds)
    await ctx.close()
  }

  // ── 场景 5：已有标记元素片的节点，点 @ 不得把 element 片弄丢
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    await ctx.addInitScript(() => {
      localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '验收', role: 'student', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    })
    await ctx.addInitScript(`
      if (!sessionStorage.getItem('at-el-seeded')) {
        sessionStorage.setItem('at-el-seeded', '1');
        const img = ${JSON.stringify(TINY)};
        const canvas = { version: 2, nodes: [
          { id: 'upload-1', type: 'upload', position: { x: 360, y: 430 }, data: { title: '图片', originalName: '上游素材图', image: img } },
          { id: 'image-1', type: 'image', position: { x: 360, y: -10 }, data: {
            title: '图像生成', mode: 'image-generation', status: 'succeeded',
            config: { model: 'agnes-image-2.0-flash', ratio: '1:1' }, outputAspectRatio: 1, error: '',
            prompt: '红色花朵', promptParts: [{ type: 'element', id: 'el-1' }],
            elements: [{ id: 'el-1', label: '红花', thumb: img, x: 0.5, y: 0.5 }],
            output: { url: img, imageData: img, originalName: 'x' },
          } },
        ], edges: [{ id: 'e1', source: 'upload-1', target: 'image-1', type: 'default', interactionWidth: 28 }], settings: {}, edgesVisible: true };
        localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas));
      }
    `)
    const page = await ctx.newPage()
    await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(NODE, { timeout: 30000 })
    await delay(900)
    const closePalette = page.locator('button[aria-label="关闭创建节点面板"]')
    if (await closePalette.count()) await closePalette.first().click().catch(() => {})
    await delay(150)
    await page.evaluate(() => {
      const wrapper = document.querySelector('.vue-flow__node[data-id="image-1"]')
      if (wrapper) wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })
    await delay(600)
    await clickAt(page)
    const s = await snapshot(page)
    check('5 有标记片时点@：element 片未丢失', s.elementIds.includes('el-1') && s.elementChipCount >= 1, { ids: s.elementIds, chip: s.elementChipCount })
    check('5 有标记片时点@：data.elements 未被清空', s.elements.includes('el-1'), s.elements)
    check('5 有标记片时点@：文字仍只一份', (s.visibleText.match(/红色花朵/g) || []).length === 1, s.visibleText)
    await ctx.close()
  }

  await browser.close()
} catch (e) {
  console.log('ERR', e?.stack || e)
} finally {
  kill(vite)
  stub.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n==== 合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} ====`)
if (failed.length) {
  failed.forEach((f) => console.log(`  - ${f.name} :: ${JSON.stringify(f.detail)}`))
  process.exitCode = 1
}
