// 多场景复现：`@` 引用片降级条件排查
// 用法：node scripts/repro-ref-chip-scenarios.mjs
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3215
const WEB_PORT = 5177
const OUT_DIR = path.join(projectDir, '.refchip-repro')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const stub = http.createServer((req, res) => {
  req.on('data', () => {})
  req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ description: 'x', candidates: ['x'], ok: true })) })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))
const busy = await fetch(`http://127.0.0.1:${WEB_PORT}/`).then(() => true).catch(() => false)
if (busy) throw new Error(`端口 ${WEB_PORT} 被占用`)
const vite = spawn(path.join(projectDir, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
  cwd: projectDir, shell: true,
  env: { ...process.env, VITE_AUTH_MODE: 'mock', VITE_AI_MODE: 'api', VITE_API_BASE_URL: '/api', VITE_SERVER_PORT: String(STUB_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let viteLog = ''
vite.stdout.on('data', (c) => { viteLog += c })
vite.stderr.on('data', (c) => { viteLog += c })
function killTree(child) { if (!child || child.killed) return; try { if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL') } catch {} }

const makeSeed = (withParts) => `
  if (!sessionStorage.getItem('repro-seeded')) {
  sessionStorage.setItem('repro-seeded', '1');
  const img = ${JSON.stringify(TINY)};
  const base = { title: '图像生成', mode: 'image-generation', status: 'succeeded', config: { model: 'agnes-image-2.0-flash', ratio: '1:1' }, outputAspectRatio: 1, error: '' };
  const image1 = Object.assign({}, base, { prompt: '阿斯顿', output: { url: img, imageData: img, originalName: '编辑中的输出图', provider: 'seed', model: 'seed' } });
  if (${withParts}) image1.promptParts = [{ type: 'text', text: '阿斯顿' }];
  const canvas = {
    version: 2,
    nodes: [
      { id: 'upload-1', type: 'upload', position: { x: 360, y: 340 }, data: { title: '图片', originalName: '上游素材图', image: img } },
      { id: 'image-1', type: 'image', position: { x: 360, y: -10 }, data: image1 },
      { id: 'image-2', type: 'image', position: { x: 820, y: -10 }, data: Object.assign({}, base, { prompt: '别的节点', output: { url: img, originalName: '另一个节点' } }) },
    ],
    edges: [{ id: 'e-u-i', source: 'upload-1', target: 'image-1', type: 'default', interactionWidth: 28 }],
    settings: {}, edgesVisible: true,
  };
  localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas));
  }
`

const scenarios = [
  { name: 'caret-in-span-then-mention', withParts: true, prep: (h) => h.placeCaretInSpan(), run: async () => {} },
  { name: 'caret-in-span-mention-then-switch', withParts: true, prep: (h) => h.placeCaretInSpan(), run: async (h) => { await h.switchAwayBack() } },
  { name: 'caret-in-editor-mention-then-switch', withParts: true, prep: (h) => h.placeCaretInEditor(), run: async (h) => { await h.switchAwayBack() } },
  { name: 'baseline', withParts: true, run: async (h) => { await h.switchAwayBack() } },
  { name: 'type-after-insert', withParts: true, run: async (h) => { await h.typeInEditor('好'); await h.switchAwayBack() } },
  { name: 'click-pane-deselect', withParts: true, run: async (h) => { await h.clickPane(); await h.open('image-1') } },
  { name: 'reload-after-insert', withParts: true, run: async (h) => { await h.reload(); await h.open('image-1') } },
  { name: 'double-switch', withParts: true, run: async (h) => { await h.switchAwayBack(); await h.switchAwayBack() } },
  { name: 'no-promptParts-seed', withParts: false, run: async (h) => { await h.switchAwayBack() } },
]

const out = {}
try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch {}
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1200)}`)
    await delay(250)
  }
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })

  for (const sc of scenarios) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 980 } })
    await context.addInitScript((s) => {
      localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '验收学生', role: 'student', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
      // eslint-disable-next-line no-new-func
      new Function(s)()
    }, makeSeed(sc.withParts))
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
    await delay(650)
    const closePalette = page.locator('button[aria-label="关闭创建节点面板"]')
    if (await closePalette.count()) await closePalette.first().click().catch(() => {})
    await delay(200)
    await page.evaluate(() => {
      window.__ev = []
      document.addEventListener('input', (e) => { if (e.target?.classList?.contains('inline-prompt-editor')) window.__ev.push(`input#${e.target.closest('.vue-flow__node')?.dataset.id}`) }, true)
      document.addEventListener('focusout', (e) => { if (e.target?.classList?.contains('inline-prompt-editor')) window.__ev.push(`focusout#${e.target.closest('.vue-flow__node')?.dataset.id}`) }, true)
    })

    const snap = () => page.evaluate(() => {
      const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
      let data = null
      try { data = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}').nodes.find((n) => n.id === 'image-1')?.data } catch {}
      const refChip = ed ? ed.querySelectorAll('.inline-prompt-reference').length : -1
      const parts = data?.promptParts || null
      const degraded = Array.isArray(parts) && parts.some((p) => p.type === 'text' && String(p.text || '').includes('@'))
      return { refChip, parts, prompt: data?.prompt, degraded, html: ed ? ed.innerHTML.slice(0, 260) : null }
    })
    const h = {
      open: async (id) => {
        await page.evaluate((nid) => { const w = document.querySelector(`.vue-flow__node[data-id="${nid}"]`); if (w) w.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })) }, id)
        await page.waitForSelector(`.vue-flow__node[data-id="${id}"] .image-composer-panel`, { timeout: 15000 })
        await delay(350)
      },
      mention: async () => { await page.locator('.vue-flow__node[data-id="image-1"] .upstream-thumb-mention').first().click(); await delay(450) },
      switchAwayBack: async () => { await h.open('image-2'); await delay(450); await h.open('image-1'); await delay(550) },
      typeInEditor: async (t) => {
        const box = await page.locator('.vue-flow__node[data-id="image-1"] .inline-prompt-editor').boundingBox()
        if (box) await page.mouse.click(box.x + box.width - 6, box.y + box.height - 6)
        await page.keyboard.type(t)
        await delay(350)
      },
      clickEditor: async () => {
        const box = await page.locator('.vue-flow__node[data-id="image-1"] .inline-prompt-editor').boundingBox()
        if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await delay(250)
      },
      clickPane: async () => {
        await page.evaluate(() => { const p = document.querySelector('.vue-flow__pane'); if (p) p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })) })
        await delay(400)
      },
      // 把光标放进「渲染出来的文本 span」内部（等价于用户先在提示词框里点了一下定位光标）
      placeCaretInSpan: async () => {
        await page.evaluate(() => {
          const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
          const span = ed?.querySelector('.inline-prompt-text')
          const tn = span?.firstChild
          if (!tn) return
          ed.focus()
          const r = document.createRange()
          r.setStart(tn, tn.textContent.length)
          r.collapse(true)
          const s = window.getSelection()
          s.removeAllRanges(); s.addRange(r)
        })
        await delay(150)
      },
      // 把光标放进编辑器元素本身（等价于点空白处）
      placeCaretInEditor: async () => {
        await page.evaluate(() => {
          const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
          if (!ed) return
          ed.focus()
          const r = document.createRange()
          r.selectNodeContents(ed)
          r.collapse(false)
          const s = window.getSelection()
          s.removeAllRanges(); s.addRange(r)
        })
        await delay(150)
      },
      reload: async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 20000 }); await delay(650) },
    }

    await h.open('image-1')
    const beforeInsert = await snap()
    await sc.prep?.(h)
    await h.mention()
    const afterInsert = await snap()
    afterInsert.childKinds = await page.evaluate(() => {
      const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
      return ed ? Array.from(ed.childNodes).map((c) => (c.nodeType === 1 ? `el[${c.className}]{${Array.from(c.childNodes).map((x) => (x.nodeType === 1 ? `el.${x.className}` : `t:'${String(x.textContent).slice(0, 10)}'`)).join(',')}}` : `t:'${String(c.textContent).slice(0, 14)}'`)) : null
    })
    await sc.run(h)
    const final = await snap()
    const ev = (await page.evaluate(() => window.__ev)) || []
    await page.screenshot({ path: path.join(OUT_DIR, `sc-${sc.name}.png`) })
    out[sc.name] = { beforeInsert, afterInsert, final, ev, pageErrors }
    const bad = final.degraded || final.refChip === 0
    console.error(`${bad ? 'DOWNGRADED' : 'ok'}  ${sc.name}  refChip(afterInsert=${afterInsert.refChip}, final=${final.refChip})  parts=${JSON.stringify(final.parts)}  ev=${ev.join(',')}`)
    console.error(`   afterInsert.parts=${JSON.stringify(afterInsert.parts)}`)
    console.error(`   afterInsert.childKinds=${JSON.stringify(afterInsert.childKinds)}`)
    await context.close()
  }

  await browser.close()
  await writeFile(path.join(OUT_DIR, 'scenarios.json'), JSON.stringify(out, null, 2))
  const downgraded = Object.entries(out).filter(([, v]) => v.final?.degraded || v.final?.refChip === 0).map(([k]) => k)
  console.error(`\nDOWNGRADED SCENARIOS: ${downgraded.length ? downgraded.join(', ') : '(none)'}`)
} catch (error) {
  console.error('SCENARIO_ERROR', error?.stack || error)
  process.exitCode = 1
} finally {
  killTree(vite)
  stub.close()
}
