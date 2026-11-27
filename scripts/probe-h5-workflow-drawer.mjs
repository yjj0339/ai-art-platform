// 探测设置抽屉：分段按钮宽度是否均等、封面三按钮是否单行。
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
  await page.locator('.row:not(.add):not(.empty-row)').first().locator('.info .nm span').first().click()
  await delay(700)
  const out = await page.evaluate(() => {
    const d = document.querySelector('.drawer')
    if (!d) return { error: 'no drawer' }
    const r = (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } }
    const segs = [...d.querySelectorAll('.seg')].map((seg) => ({
      items: [...seg.querySelectorAll('button')].map((b) => ({ text: b.innerText.trim(), ...r(b), whiteSpace: getComputedStyle(b).whiteSpace })),
    }))
    const ops = [...d.querySelectorAll('.cover-ops button')].map((b) => ({ text: b.innerText.trim(), ...r(b), scrollW: b.scrollWidth }))
    const box = d.querySelector('.cover-box')
    return {
      drawer: r(d),
      coverBox: box ? r(box) : null,
      segs,
      coverOps: ops,
      scrollable: d.scrollHeight > d.clientHeight,
    }
  })
  console.log(JSON.stringify(out, null, 2))
} finally {
  await browser.close()
}
