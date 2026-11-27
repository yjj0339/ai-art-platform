// 验证：提示词输入框的浅灰占位符只在「真正为空（无文字、无 chip）」时显示，绝不与正文/chip 重叠。
//
// 背景：原实现是 CSS `.inline-prompt-editor .inline-prompt-text:only-child:empty::before`。
//   contenteditable 里浏览器把键入的文字插成 editor 的裸文本节点，Vue 托管的空 .inline-prompt-text
//   仍是「唯一的元素子节点」（结构伪类不统计文本节点）→ 占位符与正文重叠。
// 修复后：占位符改为 `.inline-prompt-editor.is-empty::before`，由 JS + MutationObserver 依据
//   「真实内容（文字或 chip）」切换 .is-empty。
//
// 用法（Windows 必须剥离代理）：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     node scripts/repro-prompt-placeholder.mjs
// 输出：.prompt-placeholder-repro/<case>.png + 控制台逐用例判定
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3224
const WEB_PORT = 5184
const OUT_DIR = path.join(projectDir, '.prompt-placeholder-repro')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const EDITOR = '.vue-flow__node[data-id="image-1"] .inline-prompt-editor'

const stub = http.createServer((req, res) => {
  req.on('data', () => {})
  req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })) })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

const vite = spawn(path.join(projectDir, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
  cwd: projectDir,
  shell: true,
  env: { ...process.env, VITE_AUTH_MODE: 'mock', VITE_AI_MODE: 'api', VITE_API_BASE_URL: '/api', VITE_SERVER_PORT: String(STUB_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let viteLog = ''
vite.stdout.on('data', (c) => { viteLog += c })
vite.stderr.on('data', (c) => { viteLog += c })
function killTree(child) { if (!child || child.killed) return; try { if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL') } catch { /* ignore */ } }

const SEED = `
  if (!sessionStorage.getItem('ph-seeded')) {
    sessionStorage.setItem('ph-seeded', '1');
    const c = document.createElement('canvas'); c.width = 400; c.height = 400;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.arc(200, 200, 90, 0, Math.PI * 2); ctx.fill();
    const imgA = c.toDataURL('image/png');
    const canvas = {
      version: 2,
      nodes: [
        { id: 'image-1', type: 'image', position: { x: 220, y: 40 }, data: {
          title: '图像生成', mode: 'image-generation', status: 'idle', error: '',
          config: { model: 'agnes-image-2.1-flash', ratio: '1:1' }, outputAspectRatio: 1,
          prompt: '', promptParts: [], output: { url: imgA, imageData: imgA, originalName: 'o', provider: 'seed', model: 'seed' },
        } },
        { id: 'upload-1', type: 'upload', position: { x: 40, y: 460 }, data: { title: '图片', originalName: '素材', image: imgA, imageData: imgA } },
      ],
      edges: [{ id: 'e-up-1', source: 'upload-1', target: 'image-1' }],
      settings: {}, edgesVisible: true,
    };
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas));
  }
`

// 每个用例：先断言「初始为空时占位符必须显示」，再按 caret 位置打字，断言「有正文后占位符必须消失」。
const cases = [
  { id: 'C01-caret-at-start', note: '光标放最前面再打字', caret: 'start' },
  { id: 'C02-caret-at-end', note: '光标放最末尾再打字', caret: 'end' },
  { id: 'C03-inside-span', note: '光标放进空 text span 内再打字', caret: 'span' },
  { id: 'C04-many-lines', note: '连续键入多行文字', caret: 'end', text: '第一行\n第二行\n第三行' },
]

async function positionCaret(page, mode) {
  await page.evaluate(({ m }) => {
    const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
    if (!ed) return
    ed.focus()
    const s = getSelection(); s.removeAllRanges()
    const r = document.createRange()
    if (m === 'end') { r.selectNodeContents(ed); r.collapse(false) }
    else if (m === 'span') { const tn = ed.querySelector('.inline-prompt-text')?.firstChild; if (tn) { r.setStart(tn, 0); r.collapse(true) } else { r.setStart(ed, 0); r.collapse(true) } }
    else { r.setStart(ed, 0); r.collapse(true) }
    s.addRange(r)
  }, { m: mode })
}

async function measure(page) {
  return page.evaluate(() => {
    const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
    if (!ed) return { missing: true }
    const span = ed.querySelector('.inline-prompt-text')
    const chips = ed.querySelectorAll('.inline-prompt-reference, .inline-prompt-element').length
    let before = null
    try { before = getComputedStyle(ed, '::before').content } catch { before = 'ERR' }
    const isEmptyClass = ed.classList.contains('is-empty')
    const placeholderVisible = isEmptyClass && before && before !== 'none' && before !== 'normal' && before !== '""'
    return {
      isEmptyClass,
      beforeContent: before,
      placeholderVisible,
      chips,
      spanOnlyChild: span ? span.matches(':only-child') : null,
      spanEmpty: span ? span.matches(':empty') : null,
      editorText: ed.textContent,
      childNodes: Array.from(ed.childNodes).map((n) => (n.nodeType === 3 ? { t: 'text', v: JSON.stringify(n.nodeValue) } : { t: 'el', cls: String(n.className) })),
    }
  })
}

// C05 专用：image-1 的 promptParts 里带一个「上游引用片」，用来验证「有 chip、无文字」时占位符必须消失。
const SEED_CHIP = SEED.replace(
  "prompt: '', promptParts: [], output:",
  "prompt: '', promptParts: [{ type: 'reference', id: 'upload-1' }], output:",
)

const results = []
try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1200)}`)
    await delay(250)
  }
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })

  // 用例组一：空 → 打字
  for (const kase of cases) {
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
    await context.addInitScript(() => {
      localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '验收学生', role: 'student', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    })
    await context.addInitScript((s) => { new Function(s)() }, SEED)
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    const record = { id: kase.id, note: kase.note }
    try {
      await openCanvas(page)
      const before = await measure(page)
      await positionCaret(page, kase.caret)
      await page.keyboard.type(kase.text || '根据提示词帮我生成图像', { delay: 12 })
      await delay(450)
      const after = await measure(page)
      record.before = before
      record.after = after
      // 通过条件：空态必须显示占位符；有正文后必须不显示。
      record.pass = Boolean(before.placeholderVisible) && !after.placeholderVisible && String(after.editorText || '').trim().length > 0
      record.emptyOk = Boolean(before.placeholderVisible)
      record.typedOk = !after.placeholderVisible
    } catch (error) { record.error = String(error?.stack || error) }
    record.pageErrors = pageErrors
    await page.screenshot({ path: path.join(OUT_DIR, `${kase.id}.png`) }).catch(() => {})
    await context.close()
    results.push(record)
    console.error(`${record.pass ? 'PASS' : 'FAIL'} ${kase.id.padEnd(20)} ${kase.note}`)
    console.error(`      空态: is-empty=${record.before?.isEmptyClass} ::before=${JSON.stringify(record.before?.beforeContent)} 可见=${record.before?.placeholderVisible}`)
    console.error(`      打字后: is-empty=${record.after?.isEmptyClass} ::before=${JSON.stringify(record.after?.beforeContent)} 可见=${record.after?.placeholderVisible} chips=${record.after?.chips} text=${JSON.stringify(record.after?.editorText)}`)
    if (record.error) console.error(`      ERROR ${record.error.split('\n')[0]}`)
  }

  // 用例组二：有 chip（上游引用）但无文字 → 占位符必须不显示
  {
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
    await context.addInitScript(() => {
      localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '验收学生', role: 'student', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    })
    await context.addInitScript((s) => { new Function(s)() }, SEED_CHIP)
    const page = await context.newPage()
    const record = { id: 'C05-chip-no-text', note: '只有上游 chip、无文字 → 占位符不应显示' }
    try {
      await openCanvas(page)
      const m = await measure(page)
      record.after = m
      record.pass = m.chips > 0 && !m.placeholderVisible
    } catch (error) { record.error = String(error?.stack || error) }
    await page.screenshot({ path: path.join(OUT_DIR, 'C05-chip-no-text.png') }).catch(() => {})
    await context.close()
    results.push(record)
    console.error(`${record.pass ? 'PASS' : 'FAIL'} C05-chip-no-text      ${record.note}`)
    console.error(`      chips=${record.after?.chips} is-empty=${record.after?.isEmptyClass} 占位符可见=${record.after?.placeholderVisible}`)
    if (record.error) console.error(`      ERROR ${record.error.split('\n')[0]}`)
  }

  await browser.close()
  await writeFile(path.join(OUT_DIR, 'cases.json'), JSON.stringify(results, null, 2))
  const failed = results.filter((r) => !r.pass).map((r) => r.id)
  console.error(`\n==== 结果：${results.length - failed.length}/${results.length} 通过${failed.length ? `，失败：${failed.join(', ')}` : ''} ====`)
  if (failed.length) process.exitCode = 1
} catch (error) {
  console.error('REPRO_ERROR ' + (error?.stack || error))
  process.exitCode = 1
} finally {
  killTree(vite)
  stub.close()
}

async function openCanvas(page) {
  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
  await delay(700)
  const closePalette = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await closePalette.count()) await closePalette.first().click().catch(() => {})
  await delay(250)
  await page.evaluate(() => {
    const wrap = document.querySelector('.vue-flow__node[data-id="image-1"]')
    if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await page.waitForSelector(EDITOR, { timeout: 15000 })
  await delay(500)
}
