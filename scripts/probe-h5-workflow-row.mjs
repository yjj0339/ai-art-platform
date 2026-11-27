// 运行时探测：报告工作流库行内的缩略图/开关/元信息真实计算样式。
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
  })
  await page.goto(`${BASE}/admin/h5-report-workflows`, { waitUntil: 'domcontentloaded' })
  for (let i = 0; i < 60; i += 1) {
    if (await page.locator('.row:not(.add):not(.empty-row)').count()) break
    await delay(300)
  }
  await delay(500)
  const probe = await page.evaluate(() => {
    const row = document.querySelector('.row:not(.add):not(.empty-row)')
    if (!row) return { error: 'no row' }
    const q = (s) => row.querySelector(s)
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), bg: cs.backgroundColor, display: cs.display }
    }
    const swBtn = q('.sw button')
    const afterCS = swBtn ? getComputedStyle(swBtn, '::after') : null
    const cover = q('.thumb .cover')
    const meta = q('.meta')
    return {
      cover: box(cover),
      coverText: cover?.textContent || '',
      coverClass: cover?.className || '',
      thumb: box(q('.thumb')),
      pg1: box(q('.pg1')),
      pg2: box(q('.pg2')),
      sw: box(swBtn),
      swAfter: afterCS ? { content: afterCS.content, w: afterCS.width, h: afterCS.height, bg: afterCS.backgroundColor, left: afterCS.left, top: afterCS.top } : null,
      metaBox: meta ? { w: Math.round(meta.getBoundingClientRect().width), h: Math.round(meta.getBoundingClientRect().height), text: meta.innerText.replace(/\n/g, '\\n'), lineHeight: getComputedStyle(meta).lineHeight } : null,
      rowH: Math.round(row.getBoundingClientRect().height),
    }
  })
  console.log(JSON.stringify(probe, null, 2))
} finally {
  await browser.close()
}
