/**
 * 量一下高级创作报告页右栏当前的真实几何：
 *  - 左侧风格条能不能左右滑（还有几张卡没露出来）
 *  - 提示词框上下高度
 *  - 创作叙事框的上下位置
 *  - 智能体人物（.report-agent-dock）在哪、朝向哪边、有没有压住提示词框
 *
 * 只读，不改任何东西，不花钱。
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3000'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
const cookies = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).map((pair) => {
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1), domain: '127.0.0.1', path: '/' }
})

const dataUrl = (tag, w, h) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#4a9"/><text x="${w / 2}" y="${h / 2}" font-size="90" text-anchor="middle" fill="#fff">${tag}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
const project = {
  id: 'measure-ar-project',
  title: '量尺寸用项目',
  difficulty: 'pro',
  prompt: '水彩城市，暖橘色的傍晚，房子一层层叠着',
  sketchOriginal: dataUrl('sketch', 600, 800),
  versions: [{ id: 'v1', imageUrl: dataUrl('v1', 864, 1536) }, { id: 'v2', imageUrl: dataUrl('v2', 864, 1536) }],
  finalVersionId: 'v1',
  videos: [], models3d: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await context.addCookies(cookies)
await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
await page.route('**/api/me/documents**', async (route) => {
  const req = route.request()
  if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  const type = new URL(req.url()).searchParams.get('type') || 'project'
  const documents = type === 'project' ? [{ id: 'measure-doc', version: 1, data: project }] : []
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents }) })
})
// 真实环境里可能只有 1 张风格卡（不够滑），这里塞 4 张假的，用来量「箭头出来之后」的版面
if (process.env.FAKE_STYLES !== '0') {
  await page.route('**/api/h5-report/runtime-config**', async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    const base = (json.strategies || []).find((s) => s.type === 'canvas-workflow') || { id: 'fake-0', name: '画布整页' }
    json.strategies = [0, 1, 2, 3].map((i) => ({ ...base, id: `fake-${i}`, name: `${base.name || '画布整页'}-${i + 1}`, pageCount: 9 }))
    return route.fulfill({ response: res, json })
  })
}

await page.goto(`${BASE}/student/h5-report`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.advanced-report-workbench', { timeout: 45000 })
await delay(2500)

const geo = await page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  const strip = document.querySelector('.ar-strip')
  const fig = document.querySelector('.sa-figure')
  const figureImg = fig ? getComputedStyle(fig) : null
  const navPrev = document.querySelector('.ar-strip-nav.is-prev')
  const navNext = document.querySelector('.ar-strip-nav.is-next')
  const prompt = document.querySelector('.ar-prompt')
  const dock = document.querySelector('.report-agent-dock')
  const acts = document.querySelector('.ar-acts')
  const root = document.querySelector('.advanced-report-workbench') || document.documentElement
  const box = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  return {
    viewport: { w: innerWidth, h: innerHeight },
    vars: {
      promptTopGap: root.style.getPropertyValue('--ar-prompt-top-gap') || '(未写)',
      // --ar-prompt-box-h 声明在 .ar-right 上，自定义属性不往上继承，得从那儿读
      promptBoxH: (document.querySelector('.ar-right') ? getComputedStyle(document.querySelector('.ar-right')).getPropertyValue('--ar-prompt-box-h').trim() : '(无)'),
      actsH: getComputedStyle(root).getPropertyValue('--ar-acts-h').trim() || '(无)',
    },
    left: r('.ar-left'),
    strip: r('.ar-strip'),
    stripScroll: strip ? { scrollW: strip.scrollWidth, clientW: strip.clientWidth, scrollLeft: Math.round(strip.scrollLeft), overflowX: getComputedStyle(strip).overflowX } : null,
    styleCards: document.querySelectorAll('.ar-style').length,
    firstCard: r('.ar-style'),
    navPrev: navPrev ? { visible: getComputedStyle(navPrev).display !== 'none' && navPrev.getBoundingClientRect().width > 0, ...box(navPrev) } : null,
    navNext: navNext ? { visible: getComputedStyle(navNext).display !== 'none' && navNext.getBoundingClientRect().width > 0, ...box(navNext) } : null,
    right: r('.ar-right'),
    storyH: r('.ar-right-h'),
    editor: r('.ar-editor'),
    aiRow: r('.ar-ai-row'),
    aiMeta: r('.ar-ai-meta'),
    prompt: r('.ar-prompt'),
    promptTextarea: (() => {
      const ta = document.querySelector('.ar-prompt textarea')
      if (!ta) return null
      const b = ta.getBoundingClientRect()
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), scrollH: ta.scrollHeight, clientH: ta.clientHeight }
    })(),
    acts: r('.ar-acts'),
    dock: r('.report-agent-dock'),
    figBtn: r('.sa-figure-btn'),
    // 人物底边离提示词框顶边多少（>0 表示人物在框上方，<0 表示压进去了）
    dockBottomToPromptTop: dock && prompt ? Math.round(prompt.getBoundingClientRect().top - dock.getBoundingClientRect().bottom) : null,
    // 人物底边离按钮条顶边多少（>0 表示没压按钮）
    dockBottomToActsTop: dock && acts ? Math.round(acts.getBoundingClientRect().top - dock.getBoundingClientRect().bottom) : null,
    figureTransform: figureImg ? figureImg.transform : null,
    figureAnimation: figureImg ? figureImg.animationName : null,
    hint: r('.sa-hint'),
  }
})
console.log(JSON.stringify(geo, null, 2))
console.log('pageErrors:', pageErrors.slice(0, 3))


// —— 追加：量按钮行里那个按钮的右边界 vs 人物左边界，确认没被盖住 ——
const overlap = await page.evaluate(() => {
  const btn = document.querySelector('.ar-ai-btn')
  const dock = document.querySelector('.report-agent-dock')
  const hint = document.querySelector('.sa-hint')
  if (!btn || !dock) return null
  const b = btn.getBoundingClientRect(), d = dock.getBoundingClientRect()
  const h = hint ? hint.getBoundingClientRect() : null
  return {
    btnRight: Math.round(b.right), btnTop: Math.round(b.top), btnBottom: Math.round(b.bottom),
    dockLeft: Math.round(d.left), dockTop: Math.round(d.top),
    btnDockClear: Math.round(d.left - b.right),
    hintRight: h ? Math.round(h.right) : null,
    hintClipped: h ? h.right > innerWidth : null,
  }
})
console.log('overlap:', JSON.stringify(overlap, null, 2))


const dockDbg = await page.evaluate(() => {
  const dock = document.querySelector('.report-agent-dock')
  const fig = document.querySelector('.sa-figure')
  const btn = document.querySelector('.sa-figure-btn')
  const cs = getComputedStyle(dock)
  const fcs = fig ? getComputedStyle(fig) : null
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { y: Math.round(b.y), bottom: Math.round(b.bottom), h: Math.round(b.height) } }
  return {
    dockCS: { position: cs.position, bottom: cs.bottom, right: cs.right, height: cs.height, top: cs.top },
    dockRect: r(dock), figRect: r(fig), btnRect: r(btn),
    figCS: fcs ? { transform: fcs.transform, animationName: fcs.animationName, width: fcs.width, height: fcs.height } : null,
    cls: dock ? dock.className : null,
  }
})
console.log('dockDbg:', JSON.stringify(dockDbg, null, 2))


await delay(3000)
const stab = await page.evaluate(() => {
  const dock = document.querySelector('.report-agent-dock')
  const prompt = document.querySelector('.ar-prompt')
  const root = document.querySelector('.advanced-report-workbench')
  const b = dock.getBoundingClientRect(), pb = prompt.getBoundingClientRect()
  return {
    var: root.style.getPropertyValue('--ar-prompt-top-gap'),
    innerH: innerHeight,
    dockBottom: Math.round(b.bottom), promptTop: Math.round(pb.top),
    diff: Math.round(pb.top - b.bottom),
  }
})
console.log('stab(3s后):', JSON.stringify(stab))
await delay(3000)
const stab2 = await page.evaluate(() => {
  const dock = document.querySelector('.report-agent-dock')
  const prompt = document.querySelector('.ar-prompt')
  const root = document.querySelector('.advanced-report-workbench')
  const b = dock.getBoundingClientRect(), pb = prompt.getBoundingClientRect()
  return { var: root.style.getPropertyValue('--ar-prompt-top-gap'), dockBottom: Math.round(b.bottom), promptTop: Math.round(pb.top), diff: Math.round(pb.top - b.bottom) }
})
console.log('stab(6s后):', JSON.stringify(stab2))


const align = await page.evaluate(() => {
  const dock = document.querySelector('.report-agent-dock')
  const fig = document.querySelector('.sa-figure')
  const btn = document.querySelector('.sa-figure-btn')
  const r = (el) => { const b = el.getBoundingClientRect(); return { y: +b.y.toFixed(2), bottom: +b.bottom.toFixed(2), h: +b.height.toFixed(2) } }
  return { innerH: innerHeight, dock: r(dock), fig: r(fig), btn: r(btn), figAnim: getComputedStyle(fig).animationName, figTransform: getComputedStyle(fig).transform, dockBottomStyle: getComputedStyle(dock).bottom }
})
console.log('align:', JSON.stringify(align, null, 1))

await page.screenshot({ path: 'docs/mockups/shots/ar-after-adjust.png' })
await browser.close()
