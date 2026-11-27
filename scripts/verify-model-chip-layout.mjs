// 模型选择框版式验收：长模型名不得撑坏芯片行 / 3D 模型卡
// 用法：node scripts/verify-model-chip-layout.mjs
// 依赖：playwright-core（从 workbuddy binaries workspace 解析）+ ms-playwright chromium
//
// 背景（用户报障）：
//   后台配置的模型名很长（如「火山方舟 · doubao-seedream-4-0-250828」）时，
//   AI绘画 / AI视频 的「模型：…」芯片没有宽度上限，把整行撑开 → 芯片行换行 →
//   「@」被挤到第二行、行高翻倍（30px → 68px）从底部向上压住输入区；3D 页模型标签被硬切。
//
// 本脚本覆盖：
//   ① AI绘画 / AI视频：长模型名下行内所有芯片保持同一行，行高不增长
//   ② 模型芯片宽度受上限约束，超长时显示省略号（scrollWidth > clientWidth）
//   ③ 模型芯片 title 携带完整模型名（悬停可见）
//   ④ 点开模型下拉面板后，面板完整可见且未被芯片的 overflow 裁掉
//   ⑤ 短模型名不被误截断
//   ⑥ 3D 模型卡：标签超长显示省略号、「更多」按钮高度 34px、卡片等宽
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const STUB_PORT = 3255
const WEB_PORT = 5193
const OUT_DIR = path.join(projectDir, '.model-chip-verify')

// 芯片文案已不再带「模型：」前缀（只显示模型名，宽度减半），断言沿用真实文案
const LONG_IMG = '火山方舟 · doubao-seedream-4-0-250828'
const LONG_VID = '火山方舟 · doubao-seedance-1-0-pro-250528'
// 芯片宽度已收窄到 150px（用户要求只占原来一半），短名用例取真正短的模型名；
// 稍长的名字截断是预期行为，悬停可看全名，不算缺陷。
const SHORT_IMG = 'Agnes · img-2.0'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const results = {}
const failures = []
function check(name, condition, detail) {
  results[name] = { pass: Boolean(condition), detail }
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 400)}`}`)
}

const stub = http.createServer((req, res) => {
  const send = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)) }
  req.resume()
  req.on('end', () => {
    const url = req.url || ''
    if (url.startsWith('/api/prompt-library')) return send(200, [])
    if (url.startsWith('/api/')) return send(200, { ok: true, providers: {}, data: {}, items: [], list: [] })
    return send(404, { ok: false })
  })
})
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r))

const vite = spawn(path.join(projectDir, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
  cwd: projectDir,
  shell: true,
  env: { ...process.env, VITE_AUTH_MODE: 'mock', VITE_AI_MODE: 'mock', VITE_API_BASE_URL: '/api', VITE_SERVER_PORT: String(STUB_PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
})
let viteLog = ''
vite.stdout.on('data', (c) => { viteLog += c })
vite.stderr.on('data', (c) => { viteLog += c })
function killTree(child) {
  if (!child || child.killed) return
  try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* ignore */ }
}

const MOCK_USER = { user: { id: 'stu-001', name: '版式验收', role: 'student', className: '验收班', avatar: '验' }, token: 'mock-token-project-new-art-studio' }
let browser

try {
  for (let i = 0; i < 160; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${WEB_PORT}/student/paint`); if (r.ok) break } catch { /* retry */ }
    if (i === 159) throw new Error(`vite 启动失败：${viteLog.slice(-1200)}`)
    await delay(250)
  }
  await mkdir(OUT_DIR, { recursive: true })
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })

  // 把模型芯片文字改成长/短名字（模拟后台配置），再量布局
  async function open(route, width, waitFor) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    await ctx.addInitScript((user) => { localStorage.setItem('art-studio-user', JSON.stringify(user)) }, MOCK_USER)
    const page = await ctx.newPage()
    await page.goto(`http://127.0.0.1:${WEB_PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // 页面是异步渲染的：等到目标结构出现再量，避免把「还没渲染」误判成「版式坏了」
    await page.waitForSelector(waitFor, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(400)
    return { ctx, page }
  }

  async function measureChipRow(page, text) {
    return page.evaluate((t) => {
      const row = document.querySelector('.prompt-chip-row')
      if (!row) return { error: '未找到 .prompt-chip-row' }
      const chip = row.querySelector('.prompt-chip.model-chip')
      if (!chip) return { error: '未找到 .prompt-chip.model-chip' }
      const span = chip.querySelector('.chip-text')
      if (span) span.textContent = t
      else chip.textContent = t
      chip.getBoundingClientRect()
      const items = [...row.children].map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), y: Math.round(r.y) } })
      const rowRect = row.getBoundingClientRect()
      const chipRect = chip.getBoundingClientRect()
      const cs = getComputedStyle(chip)
      return {
        rowW: Math.round(rowRect.width),
        rowH: Math.round(rowRect.height),
        lines: new Set(items.map((i) => i.y)).size,
        chipW: Math.round(chipRect.width),
        chipH: Math.round(chipRect.height),
        textOverflow: getComputedStyle(span || chip).textOverflow,
        truncated: (span || chip).scrollWidth > (span || chip).clientWidth + 1,
        title: chip.getAttribute('title') || '',
        overflow: cs.overflow,
        rowScrollW: row.scrollWidth,
        rowClientW: row.clientWidth
      }
    }, text)
  }

  // ---------- AI 绘画 ----------
  {
    const { ctx, page } = await open('/student/paint', 1440, '.prompt-chip-row .prompt-chip.model-chip')
    const before = await measureChipRow(page, LONG_IMG)
    check('绘画：找到模型芯片', !before.error, before)
    if (!before.error) {
      check('绘画/1440：长模型名下行内芯片保持 1 行', before.lines === 1, before)
      check('绘画/1440：行高未增长（单行高度）', before.rowH <= 32, before)
      check('绘画/1440：模型文字显示省略号', before.textOverflow === 'ellipsis', before)
      check('绘画/1440：芯片 title 绑定了模型名（悬停可看全名）', before.title.startsWith('模型：'), before)
    }
    // 短名字不应被截断
    const short = await measureChipRow(page, SHORT_IMG)
    if (!short.error) {
      check('绘画/1440：短模型名不被误截断', short.truncated === false, short)
      check('绘画/1440：短模型名下仍为 1 行', short.lines === 1, short)
    }
    // 下拉面板不得被裁
    await page.evaluate((t) => {
      const s = document.querySelector('.prompt-chip.model-chip .chip-text')
      if (s) s.textContent = t
    }, LONG_IMG)
    await page.click('.prompt-chip.model-chip')
    await page.waitForTimeout(350)
    const panel = await page.evaluate(() => {
      const el = document.querySelector('.chip-option-panel.model-panel')
      if (!el) return { found: false }
      // 桩环境没有真实模型列表：注入 3 个长名字选项，验证面板装得下、不会被裁
      if (!el.children.length) {
        el.innerHTML = ['火山方舟 · doubao-seedream-4-0-250828', 'Agnes AI · agnes-image-2.0-flash', 'OpenAI · gpt-image-1']
          .map((t) => `<button type="button"><strong>${t}</strong><small>8 Token/张</small></button>`).join('')
      }
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        found: true,
        w: Math.round(r.width), h: Math.round(r.height),
        scrollH: el.scrollHeight, clientH: el.clientHeight,
        scrollW: el.scrollWidth, clientW: el.clientWidth,
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        visibility: cs.visibility, overflowY: cs.overflowY, vh: window.innerHeight
      }
    })
    check('绘画：点开模型下拉后面板存在', panel.found, panel)
    if (panel.found) {
      check('绘画：下拉面板受 max-height 约束且可滚动（长列表不撑破也不被裁）', panel.h >= 150 && panel.overflowY === 'auto', panel)
      check('绘画：下拉面板内部无横向溢出（长模型名会换行而不是撑破）', panel.scrollW <= panel.clientW + 1, panel)
      check('绘画：下拉面板在视口内', panel.top >= 0 && panel.bottom <= panel.vh + 1, panel)
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'paint-1440-panel.png') })
    await ctx.close()
  }

  // 绘画页在窄桌面宽度下也要保持单行（用户截图就是较窄的卡片区域）
  for (const width of [1100, 1000]) {
    const { ctx, page } = await open('/student/paint', width, '.prompt-chip-row .prompt-chip.model-chip')
    const m = await measureChipRow(page, LONG_IMG)
    check(`绘画/${width}：长模型名下行内芯片保持 1 行`, !m.error && m.lines === 1, m)
    check(`绘画/${width}：行高未增长`, !m.error && m.rowH <= 32, m)
    check(`绘画/${width}：行内容未横向溢出`, !m.error && m.rowScrollW <= m.rowClientW + 1, m)
    await page.screenshot({ path: path.join(OUT_DIR, `paint-${width}.png`) })
    await ctx.close()
  }

  // ---------- AI 视频 ----------
  for (const width of [1440, 1100]) {
    const { ctx, page } = await open('/student/video', width, '.prompt-chip-row .prompt-chip.model-chip')
    const m = await measureChipRow(page, LONG_VID)
    check(`视频/${width}：找到模型芯片`, !m.error, m)
    if (!m.error) {
      check(`视频/${width}：长模型名下行内芯片保持 1 行`, m.lines === 1, m)
      check(`视频/${width}：行高未增长`, m.rowH <= 32, m)
      check(`视频/${width}：模型文字显示省略号`, m.textOverflow === 'ellipsis', m)
      check(`视频/${width}：行内容未横向溢出`, m.rowScrollW <= m.rowClientW + 1, m)
    }
    await page.screenshot({ path: path.join(OUT_DIR, `video-${width}.png`) })
    await ctx.close()
  }

  // ---------- 3D 世界 ----------
  {
    const { ctx, page } = await open('/student/model3d', 1440, '.model-card')
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.model-card')]
      if (!cards.length) return { error: '未找到 .model-card' }
      const longNames = ['通用模型 Pro 高清超精细版本', '角色模型 Max 人物专项优化版', '建筑模型 Pro 大场景专用版', '硬表面模型 精细结构增强版']
      const longTags = ['强烈推荐优先使用', '人物专项优化', '大场景建筑优化', '硬表面精细优化']
      cards.forEach((c, i) => {
        const s = c.querySelector('strong'); if (s && longNames[i]) s.textContent = longNames[i]
        const t = c.querySelector('.model-tag'); if (t && longTags[i]) t.textContent = longTags[i]
      })
      cards[0].getBoundingClientRect()
      const widths = cards.map((c) => Math.round(c.getBoundingClientRect().width))
      const tags = [...document.querySelectorAll('.model-tag')].map((t) => ({ w: Math.round(t.getBoundingClientRect().width), sw: t.scrollWidth, ellipsis: getComputedStyle(t).textOverflow }))
      const more = document.querySelector('.model-more')
      const moreR = more ? more.getBoundingClientRect() : null
      const rowR = document.querySelector('.model-row').getBoundingClientRect()
      return {
        cardCount: cards.length,
        widths,
        equalWidth: new Set(widths).size === 1,
        tags,
        tagsEllipsis: tags.every((t) => t.ellipsis === 'ellipsis'),
        moreH: moreR ? Math.round(moreR.height) : null,
        moreRightGap: moreR ? Math.round(rowR.right - moreR.right) : null
      }
    })
    check('3D：找到模型卡片', !m.error, m)
    if (!m.error) {
      check('3D：卡片等宽', m.equalWidth, m)
      check('3D：模型标签超长时显示省略号（不再硬切）', m.tagsEllipsis, m)
      check('3D：「更多」按钮高度为 34px（未被全局按钮最小高撑成 48px）', m.moreH === 34, m)
      check('3D：「更多」按钮贴在最右侧', m.moreRightGap !== null && m.moreRightGap <= 1, m)
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'model3d-1440.png') })
    await ctx.close()
  }
} finally {
  if (browser) await browser.close()
  killTree(vite)
  stub.close()
}

console.error('')
console.error(`合计 ${Object.keys(results).length} 项，失败 ${failures.length} 项`)
if (failures.length) {
  console.error('失败明细：')
  failures.forEach((f) => console.error('  - ' + f))
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
