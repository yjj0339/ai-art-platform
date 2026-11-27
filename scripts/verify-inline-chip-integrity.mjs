// 回归：提示词输入框结构片「绝不被降级为纯文本」（reference / element 两条链路）
// 用法：node scripts/verify-inline-chip-integrity.mjs
//
// 背景 bug：`@` 引用片插入时若光标停在模板渲染出的 <span class="inline-prompt-text"> 内部，
// chip 会被插进这个壳里；只读第 1 层的 inlinePromptPartsFromEditor 会把整个壳当纯文本读走，
// promptParts 里的 reference 被永久降级成 text（数据损坏）。本脚本覆盖该 bug 的修复。
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3216
const WEB_PORT = 5178
const OUT_DIR = path.join(projectDir, '.chip-integrity')
const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const results = {}
const failures = []
function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 420)}`}`)
}

const stub = http.createServer((req, res) => {
  req.on('data', () => {})
  req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ description: '青苹果', candidates: ['青苹果'], ok: true })) })
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

const SEED = `
  if (!sessionStorage.getItem('chip-seeded')) {
    sessionStorage.setItem('chip-seeded','1');
    const img = ${JSON.stringify(TINY)};
    const base = { title: '图像生成', mode: 'image-generation', status: 'succeeded', config: { model: 'agnes-image-2.0-flash', ratio: '1:1' }, outputAspectRatio: 1, error: '' };
    const canvas = { version: 2, nodes: [
      { id: 'upload-1', type: 'upload', position: { x: 360, y: 360 }, data: { title: '图片', originalName: '上游素材图', image: img } },
      { id: 'image-1', type: 'image', position: { x: 360, y: -10 }, data: Object.assign({}, base, { prompt: '阿斯顿', promptParts: [{ type: 'text', text: '阿斯顿' }], output: { url: img, imageData: img, originalName: '编辑中的输出图' } }) },
      { id: 'image-2', type: 'image', position: { x: 820, y: -10 }, data: Object.assign({}, base, { prompt: '别的节点', promptParts: [{ type: 'text', text: '别的节点' }], output: { url: img, imageData: img, originalName: '画布另一张图' } }) },
    ], edges: [{ id: 'e-u-i', source: 'upload-1', target: 'image-1', type: 'default', interactionWidth: 28 }], settings: {}, edgesVisible: true };
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas));
  }
`

try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch {}
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1200)}`)
    await delay(250)
  }
  await mkdir(OUT_DIR, { recursive: true })

  // ---------- 静态断言 ----------
  {
    const source = await readFile(path.join(projectDir, 'src', 'views', 'CanvasStudio.vue'), 'utf8')
    const fnBody = (name) => {
      const i = source.indexOf(`function ${name}(`)
      if (i < 0) return ''
      const start = source.indexOf('{', i)
      let depth = 0
      for (let j = start; j < source.length; j += 1) {
        if (source[j] === '{') depth += 1
        else if (source[j] === '}') { depth -= 1; if (depth === 0) return source.slice(start, j + 1) }
      }
      return ''
    }
    check('修复：读取结构片改为递归（collectInlinePromptParts 递归子节点）', /function collectInlinePromptParts[\s\S]{0,900}Array\.from\(node\.childNodes \|\| \[\]\)\.forEach\(visit\)/.test(source), { ok: true })
    check('修复：@ 引用片改为「数据优先」（insertReferenceToPrompt 直接写 promptParts，共用 promptPartsWithPart）',
      fnBody('insertReferenceToPrompt').includes('promptPartsWithPart') && !fnBody('insertReferenceToPrompt').includes("createElement('span')"), { body: fnBody('insertReferenceToPrompt').slice(0, 200) })
    check('修复：拖动换位也保证 chip 落在 editor 层（handlePromptDrop 用 insertChipAtEditorCaret）',
      fnBody('handlePromptDrop').includes('insertChipAtEditorCaret'), { ok: true })
    check('修复：不再手工往 DOM 塞引用 chip（无 range.insertNode(chip)）', !source.includes('range.insertNode(chip)'), { ok: true })
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  await context.addInitScript(() => {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '验收学生', role: 'student', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
  })
  await context.addInitScript(SEED)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
  await delay(700)
  const closePalette = page.locator('button[aria-label="关闭创建节点面板"]')
  if (await closePalette.count()) await closePalette.first().click().catch(() => {})
  await delay(200)

  const openComposer = async (id) => {
    await page.evaluate((nid) => { const w = document.querySelector(`.vue-flow__node[data-id="${nid}"]`); if (w) w.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })) }, id)
    await page.waitForSelector(`.vue-flow__node[data-id="${id}"] .image-composer-panel`, { timeout: 15000 })
    await delay(350)
  }
  // 把光标放进模板渲染出的文本 span 内部（正是触发 bug 的条件）
  const caretInSpan = (offsetFromEnd = 0) => page.evaluate((back) => {
    const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
    const span = ed?.querySelector('.inline-prompt-text')
    const tn = span?.firstChild
    if (!tn) return false
    ed.focus()
    const r = document.createRange()
    r.setStart(tn, Math.max(0, tn.textContent.length - back))
    r.collapse(true)
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    return true
  }, offsetFromEnd)
  const snap = () => page.evaluate(() => {
    const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
    let data = null
    try { data = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}').nodes.find((n) => n.id === 'image-1')?.data } catch {}
    const parts = data?.promptParts || []
    return {
      parts,
      prompt: data?.prompt,
      textHasAt: parts.some((p) => p.type === 'text' && String(p.text || '').includes('@')),
      refs: parts.filter((p) => p.type === 'reference').length,
      elements: parts.filter((p) => p.type === 'element').length,
      refChipsInDom: ed ? ed.querySelectorAll('.inline-prompt-reference:not(.inline-prompt-element)').length : -1,
      elementChipsInDom: ed ? ed.querySelectorAll('.inline-prompt-element').length : -1,
      // chip 必须是 editor 的直接子节点（不能嵌在文本壳里）
      chipNested: ed ? Array.from(ed.querySelectorAll('.inline-prompt-reference')).some((c) => c.parentElement !== ed) : false,
    }
  })

  await openComposer('image-1')

  // ---- 1. 光标在文本 span 内 → 点 @（bug 触发条件） ----
  await caretInSpan(0)
  await page.locator('.vue-flow__node[data-id="image-1"] .upstream-thumb-mention').first().click()
  await delay(450)
  const s1 = await snap()
  check('BUG修复：光标在文本 span 内点 @ → promptParts 仍是 reference（未降级成 text）', s1.refs === 1 && !s1.textHasAt, s1)
  check('BUG修复：chip 未被嵌入文本 span（是 editor 的直接子节点）', s1.chipNested === false && s1.refChipsInDom === 1, s1)
  await page.screenshot({ path: path.join(OUT_DIR, '01-ref-insert-caret-in-span.png') })

  // ---- 2. 切换节点往返 → 外观与数据都保持 ----
  await openComposer('image-2')
  await delay(400)
  await openComposer('image-1')
  await delay(500)
  const s2 = await snap()
  check('BUG修复：切换节点往返后 reference 仍在、外观仍是引用片', s2.refs === 1 && s2.refChipsInDom === 1 && !s2.textHasAt, s2)
  await page.screenshot({ path: path.join(OUT_DIR, '02-after-switch-back.png') })

  // ---- 3. 刷新后仍保持 ----
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 20000 })
  await delay(700)
  await openComposer('image-1')
  const s3 = await snap()
  check('BUG修复：刷新后 reference 仍保持为引用片', s3.refs === 1 && s3.refChipsInDom === 1 && !s3.textHasAt, s3)

  // ---- 4. 光标在文字中间插入 → 顺序保持（阿斯 | chip | 顿） ----
  // 先清空重来：删除当前 chip（直接改数据 + 重载）
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2'))
    const n = raw.nodes.find((x) => x.id === 'image-1')
    n.data.promptParts = [{ type: 'text', text: '阿斯顿' }]
    n.data.elements = []
    n.data.prompt = '阿斯顿'
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(raw))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 20000 })
  await delay(700)
  await openComposer('image-1')
  await caretInSpan(1) // 光标在「顿」之前
  await page.locator('.vue-flow__node[data-id="image-1"] .upstream-thumb-mention').first().click()
  await delay(450)
  const s4 = await snap()
  check('光标在文字中间插入：文本被正确拆分，顺序为「阿斯」+ 引用片 +「顿」',
    s4.refs === 1 && !s4.textHasAt && JSON.stringify(s4.parts) === JSON.stringify([{ type: 'text', text: '阿斯' }, { type: 'reference', id: 'upload-1' }, { type: 'text', text: '顿' }]), s4)
  await page.screenshot({ path: path.join(OUT_DIR, '03-mid-text-insert.png') })

  // ---- 5. 拖动引用片换位 → 数据仍是 reference ----
  const chip = page.locator('.vue-flow__node[data-id="image-1"] .inline-prompt-reference').first()
  const edBox = await page.locator('.vue-flow__node[data-id="image-1"] .inline-prompt-editor').boundingBox()
  const dropped = await chip.dragTo(page.locator('.vue-flow__node[data-id="image-1"] .inline-prompt-editor'), {
    targetPosition: edBox ? { x: Math.max(4, edBox.width - 8), y: Math.max(4, edBox.height / 2) } : undefined,
  }).then(() => true).catch(() => false)
  await delay(400)
  const s5 = await snap()
  check('拖动引用片换位后，promptParts 仍是 reference（未降级）', dropped && s5.refs === 1 && !s5.textHasAt && s5.chipNested === false, { dropped, ...s5 })

  // ---- 6. element chip 与 reference chip 共存 + 光标在文本 span 内标记 ----
  // 这一段的每一步都可能触发「输入框 DOM 回读」，而回读会整块覆盖 promptParts。
  // 因此每一步都拍一次快照：reference 片在哪一步丢的，日志里能直接看出来（偶发问题必须可定位）。
  await caretInSpan(0)
  await page.locator('.vue-flow__node[data-id="image-1"] .image-composer-controls button[title="标记"]').click()
  await page.waitForSelector('.mark-mode-bar', { timeout: 10000 })
  await delay(400)
  const s6a = await snap()
  console.error('[第6步-进入标记模式后]', JSON.stringify(s6a).slice(0, 400))
  const imgBox = await page.locator('.vue-flow__node[data-id="image-2"] img.mark-target').boundingBox()
  if (imgBox) await page.mouse.click(imgBox.x + imgBox.width * 0.5, imgBox.y + imgBox.height * 0.3)
  await delay(600)
  const s6b = await snap()
  console.error('[第6步-点图打标记后]', JSON.stringify(s6b).slice(0, 400))
  await page.locator('.mark-mode-back').click()
  await page.waitForSelector('.mark-mode-bar', { state: 'detached', timeout: 8000 })
  await delay(600)
  const s6 = await snap()
  console.error('[第6步-退出标记模式后]', JSON.stringify(s6).slice(0, 400))
  check('element chip 与 reference chip 共存：两者都在 promptParts、都没有降级成文本',
    s6.refs === 1 && s6.elements === 1 && !s6.textHasAt, s6)
  check('共存时 DOM 上两个 chip 都渲染、且都不是嵌套子节点', s6.refChipsInDom === 1 && s6.elementChipsInDom === 1 && s6.chipNested === false, s6)
  await page.screenshot({ path: path.join(OUT_DIR, '04-ref-and-element-coexist.png') })

  // 切换往返 + 刷新后再确认一次
  await openComposer('image-2')
  await delay(300)
  await openComposer('image-1')
  await delay(500)
  const s7 = await snap()
  check('共存后切换节点往返：reference + element 全部保持', s7.refs === 1 && s7.elements === 1 && !s7.textHasAt, s7)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 20000 })
  await delay(700)
  await openComposer('image-1')
  const s8 = await snap()
  check('共存后刷新：reference + element 全部保持', s8.refs === 1 && s8.elements === 1 && !s8.textHasAt, s8)
  await page.screenshot({ path: path.join(OUT_DIR, '05-after-reload.png') })

  // ---- 9. 护栏不能「反过来」：用户主动断开连线后，引用片必须真的被移除 ----
  // 护栏的判据是「连线还在就补回来」。这条断言防的是护栏过度：如果它把已经断开的引用也补回来，
  // 用户就会觉得「引用删不掉」——那比丢片更难受，而且无法自行解决。
  const removed = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2'))
    // 断开 upload-1 → image-1 的连线（等同于用户点「移除引用」的效果）
    raw.edges = (raw.edges || []).filter((e) => !(e.source === 'upload-1' && e.target === 'image-1'))
    localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(raw))
    return raw.edges.length
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 20000 })
  await delay(700)
  await openComposer('image-1')
  // 断线后必须真触发一次「输入框 DOM 回读」，否则这条断言等于没测（数据没机会被重建）。
  // 踩过的坑：直接 click editor 可能落在 chip 上（chip 是 contenteditable=false），也没焦点；
  // 而 page.keyboard.type 对全角字符不产生 input。因此这里显式设置光标到 editor 末尾，
  // 用 insertText 插入（会真触发 input），仍无效再退化为派发 input 事件，两条路都是产品真实路径。
  const readBack = await page.evaluate(async () => {
    const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
    if (!ed) return { focused: false }
    ed.focus()
    const r = document.createRange()
    r.selectNodeContents(ed)
    r.collapse(false)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
    return { focused: document.activeElement === ed }
  })
  await page.keyboard.insertText('！')
  // 数据落盘要经过一次 blur（commitInlinePrompt → scheduleSave），所以这里也走真实的失焦路径，
  // 然后轮询 localStorage 看脏片有没有被剪掉——不写固定 sleep，避免把「还没保存」误判成「没修好」。
  const refsNow = () => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}')
    const parts = raw.nodes?.find((n) => n.id === 'image-1')?.data?.promptParts || []
    return parts.filter((p) => p.type === 'reference').length
  })
  const blurEditor = () => page.evaluate(() => {
    document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')?.blur()
  })
  await blurEditor()
  let mode = 'insertText+blur'
  for (let i = 0; i < 30 && (await refsNow()) !== 0; i += 1) await delay(150)
  if ((await refsNow()) !== 0) {
    // 退化路径：显式派发 input，强制走一次回读（等价于用户在框里敲了一下再失焦）。
    mode = 'dispatch-input+blur'
    await page.evaluate(() => {
      const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
      if (!ed) return
      ed.focus()
      ed.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
      ed.blur()
    })
    for (let i = 0; i < 30 && (await refsNow()) !== 0; i += 1) await delay(150)
  }
  // 失焦可能让浮层收起：重新打开一次再做最终快照，保证 refChipsInDom 有意义。
  await openComposer('image-1')
  const s9 = await snap()
  check('断线后引用片被真正移除（护栏不会把已断开的引用又补回来）',
    s9.refs === 0 && s9.elements === 1 && !s9.textHasAt,
    { edgesLeft: removed, readBack, mode, ...s9 })
  await page.screenshot({ path: path.join(OUT_DIR, '06-after-unlink.png') })

  check('控制台无未处理异常', pageErrors.length === 0, { pageErrors })

  await browser.close()
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify({ pass: failures.length === 0, failures, results }, null, 2))
  console.error(`\n==== 结果：${failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`} ====`)
  if (failures.length) console.error(failures.join('\n'))
  process.exitCode = failures.length === 0 ? 0 : 1
} catch (error) {
  console.error('CHIP_INTEGRITY_ERROR', error?.stack || error)
  process.exitCode = 1
} finally {
  killTree(vite)
  stub.close()
}
