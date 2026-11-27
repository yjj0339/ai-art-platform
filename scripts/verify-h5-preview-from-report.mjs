// 端到端验收：报告列表「查看预览」→ 独立预览页 → 手机外壳里显示真实结果图。
// 自己造一份临时报告 + 一张临时结果图，验完立刻删干净，不碰任何真实记录。
// 用法：node scripts/verify-h5-preview-from-report.mjs
import { createRequire } from 'node:module'
import zlib from 'node:zlib'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3000'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// 落盘接口只收 png/jpeg/webp，所以临时图用 PNG 手写：竖版纯色 + 中间一条白带，方便肉眼确认没被裁。
const png = (w = 864, h = 1536, rgb = [47, 158, 110]) => {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const bandTop = Math.round(h * 0.45)
  const bandBottom = Math.round(h * 0.55)
  const rows = []
  for (let y = 0; y < h; y += 1) {
    const row = Buffer.alloc(1 + w * 3)
    for (let x = 0; x < w; x += 1) {
      const white = y >= bandTop && y < bandBottom
      row[1 + x * 3] = white ? 255 : rgb[0]
      row[2 + x * 3] = white ? 255 : rgb[1]
      row[3 + x * 3] = white ? 255 : rgb[2]
    }
    rows.push(row)
  }
  const idat = zlib.deflateSync(Buffer.concat(rows))
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')}`
}

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
if (!login.ok) throw new Error(`登录失败 ${login.status}`)
const cookieHeader = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
const cookies = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).map((pair) => {
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1), domain: '127.0.0.1', path: '/' }
})
const authHeaders = { 'Content-Type': 'application/json', cookie: cookieHeader }

const reportId = `verify_reportsource_${Date.now().toString(36)}`
const pageIds = ['workflow-1', 'workflow-2']
let createdReport = false

try {
  // ① 先存两张结果图到磁盘（模拟工作流已经出过图）
  for (const [index, pageId] of pageIds.entries()) {
    const upload = await fetch(`${API}/api/h5-reports/${encodeURIComponent(reportId)}/pages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ pageId, imageData: png(864, 1536, index === 0 ? [47, 158, 110] : [64, 120, 200]) }),
    })
    if (!upload.ok) throw new Error(`结果图落盘失败 ${upload.status} ${await upload.text()}`)
  }

  // ② 建一份临时报告，带上 pageImages
  const save = await fetch(`${API}/api/h5-reports`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      id: reportId,
      title: '临时验收报告（验完即删）',
      difficulty: 'pro',
      strategyId: 'h5-canvas-workflow',
      h5TemplateId: 'h5-ai-tech',
      pages: [{ id: 'idea', type: 'idea', title: '我的想法', body: '这是一份临时验收报告，用来验证手机外壳能不能显示结果图。' }],
      pageImages: pageIds.map((id, index) => ({ id, label: `临时结果图 ${index + 1}` })),
      submit: false,
    }),
  })
  if (!save.ok) throw new Error(`建报告失败 ${save.status} ${await save.text()}`)
  const savedReport = (await save.json())?.report
  createdReport = true
  console.log(`临时报告已建立：${savedReport?.id}，结果图 ${(savedReport?.pageImages || []).length} 张\n`)

  const browser = await chromium.launch({ executablePath: CHROME })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addCookies(cookies)
    await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    // ③ 直接按「从报告列表查看预览」的跳转方式进页面
    await page.goto(`${BASE}/student/h5-report?reportId=${encodeURIComponent(reportId)}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await delay(4500)

    check('从报告列表点「查看预览」直接进独立预览页', page.url().includes('/student/h5-report/preview'), page.url())
    check('没有弹出旧版「自动排版预览」弹窗', (await page.locator('.h5-designed-preview').count()) === 0)
    check('页面出现手机外壳', (await page.locator('.phone-renderer-wrap .phone-shell').count()) === 1)
    check('手机屏幕里有结果图', (await page.locator('.phone-renderer-wrap .image-stage img').count()) === 1)
    check('不再显示空状态', (await page.locator('.phone-empty').count()) === 0)

    // 等图片真正解码完成
    for (let i = 0; i < 40; i += 1) {
      const ready = await page.locator('.phone-renderer-wrap .image-stage img').evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false)
      if (ready) break
      await delay(250)
    }
    const info = await page.evaluate(() => {
      const rect = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) } }
      const image = document.querySelector('.phone-renderer-wrap .image-stage img')
      return {
        shell: rect('.phone-renderer-wrap .phone-shell'),
        stage: rect('.phone-renderer-wrap .image-stage'),
        img: rect('.phone-renderer-wrap .image-stage img'),
        natural: image ? { w: image.naturalWidth, h: image.naturalHeight } : null,
        src: image?.getAttribute('src') || '',
        ratioLabel: document.querySelector('.stage-heading > small')?.textContent?.trim() || '',
        navCount: document.querySelectorAll('.chapter-sidebar nav button').length,
      }
    })
    check('结果图真的解码成功（不是坏图）', Boolean(info.natural && info.natural.w > 0), info.natural ? `${info.natural.w}×${info.natural.h}` : '未加载')
    check('图片地址指向本服务落盘的结果图', info.src.includes('/api/h5-report-assets/'), info.src)
    check('顶部标注画幅为 9:16 竖图', info.ratioLabel === '9:16 竖图', info.ratioLabel)
    check('左侧导航按结果图数量生成（2 张）', info.navCount === 2, `找到 ${info.navCount} 个`)
    if (info.stage && info.natural) {
      const stageRatio = info.stage.w / info.stage.h
      const imgRatio = info.natural.w / info.natural.h
      check('屏幕比例 = 图片真实比例', Math.abs(stageRatio - imgRatio) < 0.02, `屏幕 ${stageRatio.toFixed(3)} vs 图 ${imgRatio.toFixed(3)}`)
      check('图片铺满屏幕无黑边', info.img && Math.abs(info.img.w - info.stage.w) < 2 && Math.abs(info.img.h - info.stage.h) < 2, `图 ${info.img?.w}×${info.img?.h} / 屏 ${info.stage.w}×${info.stage.h}`)
    }
    check('外壳是深色机身', (await page.locator('.phone-renderer-wrap .phone-shell').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(13, 33, 59)')
    check('全过程无脚本报错', errors.length === 0, errors.slice(0, 2).join(' | '))

    await page.screenshot({ path: 'logs/verify-h5-preview-from-report.png', fullPage: false })
    console.log('\n截图：logs/verify-h5-preview-from-report.png')
  } finally {
    await browser.close()
  }
} finally {
  // ④ 清理：删掉临时报告与落盘的临时图，不留在真实数据里
  if (createdReport) {
    const del = await fetch(`${API}/api/h5-reports/${encodeURIComponent(reportId)}`, { method: 'DELETE', headers: authHeaders })
    console.log(`临时报告已删除：${del.status}`)
  }
}

const failed = results.filter((item) => !item.pass)
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
if (failed.length) process.exitCode = 1
