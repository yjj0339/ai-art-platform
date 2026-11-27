// 复现：节点 `data.elements` 仍存在、但 `promptParts` 里的 element 片被静默丢掉（导致标记裁剪图不进参考图）。
// 判定口径（与 DB 证据一致）：elements 里有 id，而 promptParts 中没有对应的 {type:'element',id}。
//
// 用法（Windows 必须剥离代理）：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     node scripts/repro-element-part-loss.mjs
// 输出：.element-loss-repro/<flow>.png + console 逐流程 PASS/FAIL
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
const STUB_PORT = 3223
const WEB_PORT = 5183
const OUT_DIR = path.join(projectDir, '.element-loss-repro')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
    const url = req.url || ''
    if (req.method === 'POST' && url === '/api/ai/image/describe-region') {
      return setTimeout(() => send(200, { description: '蓝色外套男孩', candidates: ['蓝色外套男孩', '卡通男孩'], provider: 'stub', model: 'stub' }), 120)
    }
    if (url.startsWith('/api/')) return send(200, { ok: true })
    return send(404, { ok: false })
  })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

{
  const busy = await fetch(`http://127.0.0.1:${WEB_PORT}/`).then(() => true).catch(() => false)
  if (busy) throw new Error(`vite 端口 ${WEB_PORT} 已被占用`)
}

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
  if (!sessionStorage.getItem('el-loss-seeded')) {
  sessionStorage.setItem('el-loss-seeded', '1');
  const makeImage = (spec) => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 400;
    const ctx = c.getContext('2d');
    ctx.fillStyle = spec.base; ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = spec.quad; ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = spec.center; ctx.beginPath(); ctx.arc(250, 250, 60, 0, Math.PI * 2); ctx.fill();
    return c.toDataURL('image/png');
  };
  const imgA = makeImage({ base: '#f4f4f4', quad: '#d5d5d5', center: '#ffd400' });
  const imgB = makeImage({ base: '#eeeeee', quad: '#8e44ad', center: '#e67e22' });
  const imgC = makeImage({ base: '#2ecc71', quad: '#27ae60', center: '#f1c40f' });
  const baseImage = { title: '图像生成', mode: 'image-generation', status: 'succeeded', config: { model: 'agnes-image-2.0-flash', ratio: '1:1' }, outputAspectRatio: 1, error: '' };
  const image1 = Object.assign({}, baseImage, { prompt: '', output: { url: imgA, imageData: imgA, originalName: 'output-A', provider: 'seed', model: 'seed' } });
  const image2 = Object.assign({}, baseImage, { prompt: '上游图', output: { url: imgC, imageData: imgC, originalName: 'output-C', provider: 'seed', model: 'seed' } });
  const canvas = {
    version: 2,
    nodes: [
      { id: 'image-1', type: 'image', position: { x: 460, y: 40 }, data: image1 },
      { id: 'image-2', type: 'image', position: { x: 880, y: -20 }, data: image2 },
      { id: 'upload-1', type: 'upload', position: { x: 500, y: 420 }, data: { title: '图片', originalName: '素材', image: imgB } }
    ],
    edges: [],
    settings: {}, edgesVisible: true,
  };
  localStorage.setItem('ai-workflow-canvas-stage1-v2', JSON.stringify(canvas));
  }
`

// ---------------- 流程矩阵 ----------------
// 统一前置：打开 image-1 面板 → 进入元素选择模式 → 点 image-2 的图 → 等到 chip 识别完成
const flows = [
  { id: 'F01-mark-then-type-end', note: '标记后在输入框末尾打字', run: async (h) => { await h.typeAtEditorEnd('再加一点光晕') } },
  { id: 'F02-type-before-mark', note: '先打字 → 再标记 → 再打字', pre: async (h) => { await h.typeAtEditorEnd('我想要把标记的') }, run: async (h) => { await h.typeAtEditorEnd('元素单独独立出来，纯白色背景') } },
  { id: 'F03-caret-in-span', note: '标记后把光标放进文字 span 内打字', run: async (h) => { await h.caretInTextSpan('image-1', 0); await h.typeRaw('甲') } },
  { id: 'F04-type-before-chip', note: '标记后把光标放到 chip 之前打字', run: async (h) => { await h.caretBeforeChip('image-1'); await h.typeRaw('前面') } },
  { id: 'F05-selectall-then-type', note: '标记后全选输入框再打字（整段替换）', run: async (h) => { await h.selectAllInEditor('image-1'); await h.typeRaw('完全替换的新提示词') } },
  { id: 'F06-backspace-before-chip', note: '标记后把光标放到 chip 前按退格', run: async (h) => { await h.caretAfterChip('image-1'); await h.pressKey('Backspace') } },
  { id: 'F07-drag-chip-out', note: '标记后把 chip 拖到编辑器之外松开', run: async (h) => { await h.dragChip('image-1', 'outside') } },
  { id: 'F08-drag-chip-inside', note: '标记后在编辑器内拖动 chip 换位', run: async (h) => { await h.dragChip('image-1', 'inside') } },
  { id: 'F09-reload-then-type', note: '标记后刷新页面再打字', run: async (h) => { await h.reload(); await h.openComposer('image-1'); await h.typeAtEditorEnd('刷新后补充') } },
  { id: 'F10-switch-node-then-type', note: '标记后切到别的节点再切回来打字', run: async (h) => { await h.openComposer('image-2'); await delay(300); await h.openComposer('image-1'); await h.typeAtEditorEnd('切回补充') } },
  { id: 'F11-element-menu-choose', note: '标记后点 chip 箭头选候选，再打字', run: async (h) => { await h.chooseElementCandidate('image-1', '卡通男孩'); await h.typeAtEditorEnd('选完补充') } },
  { id: 'F12-insert-reference-then-type', note: '标记后插入 @ 引用片再打字', run: async (h) => { await h.typeAtEditorEnd('引用') } },
  { id: 'F13-blur-refocus-type', note: '标记后点空白失焦，再点回来打字', run: async (h) => { await h.blurEditor('image-1'); await h.focusEditor('image-1'); await h.typeRaw('失焦后') } },
  { id: 'F14-two-marks-then-type', note: '标记两次后再打字', run: async (h) => { await h.captureMark('image-1', 'upload-1'); await h.typeAtEditorEnd('两个标记后') } },
  { id: 'F15-mark-then-paste', note: '标记后粘贴一段文字', run: async (h) => { await h.pasteAtEditorEnd('粘贴进来的内容') } },
]

// 用 ONLY=F01,F05 只跑指定流程：调试单条路径时不必等 15 条全跑完（脚本本身较慢）。
const ONLY = String(process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean)
const selectedFlows = ONLY.length ? flows.filter((flow) => ONLY.some((key) => flow.id.startsWith(key))) : flows

const out = {}
const results = []
try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/canvas`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1200)}`)
    await delay(250)
  }
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })

  for (const flow of selectedFlows) {
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
    await context.addInitScript(() => {
      localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '验收学生', role: 'student', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))
    })
    await context.addInitScript((s) => { /* eslint-disable-next-line no-new-func */ new Function(s)() }, SEED)
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    const h = makeHelpers(page)

    let record = { id: flow.id, note: flow.note }
    try {
      await page.goto(`http://127.0.0.1:${WEB_PORT}/student/canvas`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.vue-flow__node[data-id="image-1"]', { timeout: 30000 })
      await delay(700)
      const closePalette = page.locator('button[aria-label="关闭创建节点面板"]')
      if (await closePalette.count()) await closePalette.first().click().catch(() => {})
      await delay(250)

      await h.captureMark('image-1', 'image-2') // 前置：标记成功且 chip 已渲染
      record.afterMark = await h.partsState('image-1')
      if (flow.pre) await flow.pre(h)
      await flow.run(h)
      await h.blurEditor('image-1')
      await delay(400)
      record.afterFlow = await h.partsState('image-1')
      record.consistent = record.afterFlow.ok
      if (!record.afterFlow.ok) {
        record.rootCauseHint = `elements 保留 ${JSON.stringify(record.afterFlow.elementIds)}，但 promptParts 里缺少 ${JSON.stringify(record.afterFlow.missingIds)}`
      }
    } catch (error) {
      record.error = String(error?.stack || error)
      record.consistent = false
    }
    record.pageErrors = pageErrors
    await page.screenshot({ path: path.join(OUT_DIR, `${flow.id}.png`) }).catch(() => {})
    await context.close()

    results.push(record)
    out[flow.id] = record
    const flag = record.consistent ? 'ok  ' : 'LOSS'
    console.error(`${flag} ${flow.id.padEnd(28)} ${flow.note}  mark时parts=${JSON.stringify(record.afterMark?.partTypes)} 之后parts=${JSON.stringify(record.afterFlow?.partTypes)} elements=${record.afterFlow?.elementIds?.length ?? '?'}${record.error ? '  ERROR' : ''}`)
    // ERROR 只打个标记等于没线索：把错误首行与关键行一起打出来，否则要去翻 flows.json 才能知道卡在哪一步。
    if (record.error) {
      const lines = String(record.error).split('\n').filter((line) => line.trim())
      console.error(`      ERROR: ${lines[0]}`)
      const at = lines.find((line) => /at .*repro-element-part-loss|Timeout|waiting for/.test(line))
      if (at) console.error(`      ${at.trim()}`)
    }
    if (!record.consistent && record.rootCauseHint) console.error(`      ${record.rootCauseHint}`)
  }

  await browser.close()
  await writeFile(path.join(OUT_DIR, 'flows.json'), JSON.stringify(out, null, 2))
  const lost = results.filter((r) => !r.consistent).map((r) => r.id)
  console.error(`\n==== 丢片流程：${lost.length ? lost.join(', ') : '(none)'} ====`)
  console.error(`详细结果：${path.join(OUT_DIR, 'flows.json')}`)
} catch (error) {
  console.error('REPRO_ERROR ' + (error?.stack || error))
  process.exitCode = 1
} finally {
  killTree(vite)
  stub.close()
}

function makeHelpers(page) {
  const NS = (id) => `.vue-flow__node[data-id="${id}"]`
  const editor = (id) => page.locator(`${NS(id)} .inline-prompt-editor`)

  const partsState = (id) => page.evaluate((nid) => {
    let data = null
    try { data = JSON.parse(localStorage.getItem('ai-workflow-canvas-stage1-v2') || '{}').nodes.find((n) => n.id === nid)?.data || null } catch { /* ignore */ }
    const elements = Array.isArray(data?.elements) ? data.elements : []
    const parts = Array.isArray(data?.promptParts) ? data.promptParts : []
    const partIds = new Set(parts.filter((p) => p?.type === 'element').map((p) => String(p.id)))
    const missingIds = elements.filter((e) => !partIds.has(String(e.id))).map((e) => e.id)
    const domChips = document.querySelectorAll(`.vue-flow__node[data-id="${nid}"] .inline-prompt-element`).length
    return {
      ok: elements.length === 0 || missingIds.length === 0,
      elementIds: elements.map((e) => e.id),
      missingIds,
      partTypes: parts.map((p) => `${p.type}:${p.id || ''}`),
      prompt: data?.prompt || '',
      domChips,
    }
  }, id)

  const openComposer = async (id) => {
    await page.waitForSelector(NS(id), { timeout: 30000 })
    await delay(400)
    await page.evaluate((nid) => {
      const wrap = document.querySelector(`.vue-flow__node[data-id="${nid}"]`)
      if (wrap) wrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, id)
    await page.waitForSelector(`${NS(id)} .image-composer-panel`, { timeout: 15000 })
    await delay(400)
  }

  const enterMarking = async (id) => {
    await page.locator(`${NS(id)} .image-composer-controls button[title="标记"]`).click()
    await page.waitForSelector('.mark-mode-bar', { timeout: 10000 })
    await delay(350)
  }

  const clickImage = async (id, rx = 0.5, ry = 0.5) => {
    const box = await page.locator(`${NS(id)} img.mark-target`).boundingBox()
    if (!box) throw new Error(`找不到 ${id} 的图`)
    await page.mouse.click(box.x + box.width * rx, box.y + box.height * ry)
    await delay(400)
  }

  const waitRecognized = async (id) => {
    await page.waitForFunction((nid) => {
      const names = Array.from(document.querySelectorAll(`.vue-flow__node[data-id="${nid}"] .inline-element-name`)).map((n) => n.textContent.trim())
      return names.length > 0 && names.every((n) => n && n !== '识别中')
    }, id, { timeout: 12000 }).catch(() => {})
    await delay(250)
  }

  // 前置：完成一次标记（发起 id，标记 targetId 的图），并断言 chip 已渲染
  const captureMark = async (id, targetId) => {
    const panelOpen = await page.locator(`${NS(id)} .image-composer-panel`).count()
    if (!panelOpen) await openComposer(id)
    const marking = await page.locator('.mark-mode-bar').count()
    if (!marking) await enterMarking(id)
    await clickImage(targetId)
    await waitRecognized(id)
  }

  const typeRaw = async (text) => { await page.keyboard.type(text, { delay: 12 }); await delay(250) }
  const pressKey = async (key) => { await page.keyboard.press(key); await delay(250) }

  const typeAtEditorEnd = async (text) => {
    const box = await editor('image-1').boundingBox()
    if (box) { await page.mouse.click(box.x + box.width - 10, box.y + box.height - 10); await delay(150) }
    await typeRaw(text)
  }

  const pasteAtEditorEnd = async (text) => {
    const box = await editor('image-1').boundingBox()
    if (box) { await page.mouse.click(box.x + box.width - 10, box.y + box.height - 10); await delay(150) }
    await page.evaluate((value) => {
      const ed = document.querySelector('.vue-flow__node[data-id="image-1"] .inline-prompt-editor')
      if (!ed) return
      ed.focus()
      const dt = new DataTransfer()
      dt.setData('text/plain', value)
      ed.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
    }, text)
    await delay(300)
  }

  const caretInTextSpan = async (id, offset) => {
    await page.evaluate(({ nid, off }) => {
      const ed = document.querySelector(`.vue-flow__node[data-id="${nid}"] .inline-prompt-editor`)
      const tn = ed?.querySelector('.inline-prompt-text')?.firstChild
      if (!ed || !tn) return
      ed.focus()
      const r = document.createRange()
      r.setStart(tn, Math.min(off, tn.textContent.length)); r.collapse(true)
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    }, { nid: id, off: offset })
    await delay(150)
  }

  const caretBeforeChip = async (id) => {
    await page.evaluate((nid) => {
      const ed = document.querySelector(`.vue-flow__node[data-id="${nid}"] .inline-prompt-editor`)
      const chip = ed?.querySelector('.inline-prompt-element')
      if (!ed || !chip) return
      ed.focus()
      const r = document.createRange()
      r.setStartBefore(chip); r.collapse(true)
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    }, id)
    await delay(150)
  }

  const caretAfterChip = async (id) => {
    await page.evaluate((nid) => {
      const ed = document.querySelector(`.vue-flow__node[data-id="${nid}"] .inline-prompt-editor`)
      const chip = ed?.querySelector('.inline-prompt-element')
      if (!ed || !chip) return
      ed.focus()
      const r = document.createRange()
      r.setStartAfter(chip); r.collapse(true)
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    }, id)
    await delay(150)
  }

  const selectAllInEditor = async (id) => {
    const box = await editor(id).boundingBox()
    if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await delay(100) }
    await page.keyboard.press('Control+A')
    await delay(200)
  }

  const blurEditor = async (id) => {
    const box = await page.locator('.flow-canvas').boundingBox()
    if (box) await page.mouse.click(box.x + box.width - 40, box.y + box.height - 40)
    await delay(350)
  }

  const focusEditor = async (id) => {
    const box = await editor(id).boundingBox()
    if (box) await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12)
    await delay(200)
  }

  const chooseElementCandidate = async (id, text) => {
    await page.locator(`${NS(id)} .inline-element-caret`).first().click()
    await page.waitForSelector('.element-menu-pop', { timeout: 8000 })
    await delay(200)
    const item = page.locator('.element-menu-item', { hasText: text })
    if (await item.count()) await item.first().click()
    else await page.keyboard.press('Escape')
    await delay(400)
  }

  // 拖动 chip：inside=编辑器内换位；outside=拖到画布空白处松手
  const dragChip = async (id, mode) => {
    await page.evaluate(({ nid, where }) => {
      const ed = document.querySelector(`.vue-flow__node[data-id="${nid}"] .inline-prompt-editor`)
      const chip = ed?.querySelector('.inline-prompt-element')
      if (!ed || !chip) return
      const dt = new DataTransfer()
      const ev = (target, type, x, y) => {
        const e = new DragEvent(type, { bubbles: true, cancelable: true, view: window, dataTransfer: dt, clientX: x, clientY: y })
        target.dispatchEvent(e)
        return e
      }
      const cr = chip.getBoundingClientRect()
      ev(chip, 'dragstart', cr.left + 5, cr.top + 5)
      const er = ed.getBoundingClientRect()
      if (where === 'inside') {
        const tx = Math.round(er.left + 6), ty = Math.round(er.top + 16)
        ev(ed, 'dragover', tx, ty)
        ev(ed, 'drop', tx, ty)
        ev(chip, 'dragend', tx, ty)
      } else {
        // 松手位置在编辑器之外（画布左下空白），此时既不是 dragover 也不是 drop 目标
        const tx = 200, ty = 900
        ev(document.querySelector('.flow-canvas') || document.body, 'dragover', tx, ty)
        ev(document.querySelector('.flow-canvas') || document.body, 'drop', tx, ty)
        ev(chip, 'dragend', tx, ty)
        // 浏览器原生行为：拖到非法目标后源节点仍留在原处；这里再模拟「用户以为删掉了」的失焦提交
      }
    }, { nid: id, where: mode })
    await delay(400)
  }

  const reload = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(NS('image-1'), { timeout: 20000 })
    await delay(650)
  }

  return { partsState, openComposer, enterMarking, clickImage, waitRecognized, captureMark, typeRaw, pressKey, typeAtEditorEnd, pasteAtEditorEnd, caretInTextSpan, caretBeforeChip, caretAfterChip, selectAllInEditor, blurEditor, focusEditor, chooseElementCandidate, dragChip, reload }
}
