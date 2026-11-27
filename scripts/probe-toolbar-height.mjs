// 探针：测量素材库工具栏内部各元素的实际高度，定位是谁把横栏撑到 58px。
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const MOCK_SESSION = { user: { id: 'stu-001', name: '小画家阿橙', role: 'student', className: 'AI创意美术A班', avatar: '艺', difficulty: 'pro' }, token: 'mock-token-project-new-art-studio' }

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await ctx.newPage()
await page.addInitScript((s) => localStorage.setItem('art-studio-user', JSON.stringify(s)), MOCK_SESSION)
await page.goto('http://127.0.0.1:5199/student/portfolio', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.portfolio-toolbar')
await new Promise((r) => setTimeout(r, 600))

const data = await page.evaluate(() => {
  const out = {}
  const pick = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      h: +r.height.toFixed(1), w: +r.width.toFixed(1),
      minH: cs.minHeight, height: cs.height, pad: cs.padding, border: cs.borderWidth,
      margin: cs.margin, lineH: cs.lineHeight, fontSize: cs.fontSize,
      overflow: cs.overflow, alignItems: cs.alignItems,
    }
  }
  out.toolbar = pick('.portfolio-toolbar')
  out.tabs = pick('.type-tabs')
  out.tabBtn = pick('.type-tabs button')
  out.gear = pick('.consent-entry')
  out.batchTrigger = pick('.portfolio-batch-trigger')
  // 批量触发器内部
  const bt = document.querySelector('.portfolio-batch-trigger')
  if (bt) {
    out.batchTriggerChildren = [...bt.children].map((c) => {
      const cs = getComputedStyle(c); const r = c.getBoundingClientRect()
      return { cls: c.className, h: +r.height.toFixed(1), minH: cs.minHeight, pad: cs.padding, lineH: cs.lineHeight }
    })
  }
  return out
})
console.log(JSON.stringify(data, null, 2))
await browser.close()
