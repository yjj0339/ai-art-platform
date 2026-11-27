// 只读探测：画布节点右上角的卡槽胶囊，是不是被左侧工具栏（.tool-rail）盖住了。
//
// 背景：verify-h5-slot-binding 报「.rail-action[aria-label=画布模板] intercepts pointer events」，
// 点不到 .slot-pill.is-image。要么是工具栏真的压在胶囊上（布局回归），
// 要么只是那个节点的胶囊刚好跑到工具栏底下了（脚本对节点位置敏感）。
// 这个脚本不改任何东西，只把几何数据打出来判断。
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const loginStatus = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
    return res.status
  })
  console.log('登录状态：', loginStatus)
  await page.goto(`${BASE}/admin/h5-report-workflows`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.locator('.row:not(.add):not(.empty-row)').first().click()
  await page.waitForURL(/\/admin\/ai-skills\/.+\/workflow/, { timeout: 60000 })
  await page.waitForTimeout(3000)

  const report = await page.evaluate(() => {
    const rail = document.querySelector('.tool-rail')?.getBoundingClientRect()
    const pills = [...document.querySelectorAll('.slot-pill.is-image')].map((el) => {
      const box = el.getBoundingClientRect()
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      const hit = document.elementFromPoint(cx, cy)
      return {
        text: el.textContent.replace(/[▾\s]/g, ''),
        x: Math.round(box.x), y: Math.round(box.y),
        w: Math.round(box.width), h: Math.round(box.height),
        // 胶囊中心点真正点到了谁
        hitClass: hit?.className?.toString?.().slice(0, 60) || '',
        hitAria: hit?.getAttribute?.('aria-label') || '',
        coveredByRail: Boolean(rail && box.x < rail.right),
      }
    })
    return {
      rail: rail ? { x: Math.round(rail.x), y: Math.round(rail.y), w: Math.round(rail.width), h: Math.round(rail.height), right: Math.round(rail.right) } : null,
      railButtons: [...document.querySelectorAll('.rail-action')].map((el) => {
        const b = el.getBoundingClientRect()
        return { label: el.getAttribute('aria-label'), y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom) }
      }),
      pills,
    }
  })

  console.log('工具栏：', JSON.stringify(report.rail))
  console.log('\n工具栏按钮：')
  report.railButtons.forEach((b) => console.log(`  ${b.label}  y=${b.y} h=${b.h} bottom=${b.bottom}`))
  console.log('\n图像卡槽胶囊：')
  report.pills.forEach((p) => console.log(`  ${p.text}  x=${p.x} y=${p.y} w=${p.w} h=${p.h}  压在工具栏下=${p.coveredByRail}  点击命中=${p.hitClass}${p.hitAria ? ` / ${p.hitAria}` : ''}`))
} finally {
  await browser.close()
}
