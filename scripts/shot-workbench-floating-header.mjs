// 学生工作台「无导航条底」效果截图 + 量尺寸（只读，不改数据）
// 跑法：env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY node scripts/shot-workbench-floating-header.mjs
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = process.env.APP_WEB_ORIGIN || 'http://127.0.0.1:5173'
const API = process.env.APP_API_ORIGIN || 'http://127.0.0.1:3000'
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const ACCOUNT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }

const response = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ACCOUNT),
})
if (!response.ok) throw new Error(`登录失败：${response.status}`)
const cookies = (response.headers.getSetCookie?.() || []).map((raw) => raw.split(';')[0]).map((pair) => {
  const index = pair.indexOf('=')
  return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: new URL(BASE).hostname, path: '/' }
})

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addCookies(cookies)
await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
const page = await context.newPage()
const issues = []
page.on('console', (m) => { if (m.type() === 'error') issues.push(m.text()) })
page.on('requestfailed', (r) => issues.push(`FAIL ${r.url()}`))

await page.goto(`${BASE}/student/workbench`, { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(1800)

const info = await page.evaluate(() => {
  const header = document.querySelector('.topbar')
  const orbit = document.querySelector('.pro-orbit')
  if (!header) return null
  const style = getComputedStyle(header)
  const rect = header.getBoundingClientRect()
  const navButtons = [...header.querySelectorAll('nav button')].map((button) => {
    const buttonStyle = getComputedStyle(button)
    return {
      text: button.textContent.trim(),
      background: buttonStyle.backgroundColor,
      color: buttonStyle.color,
      height: Math.round(button.getBoundingClientRect().height),
    }
  })
  return {
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    boxShadow: style.boxShadow,
    borderWidth: style.borderWidth,
    borderRadius: style.borderRadius,
    backdropFilter: style.backdropFilter,
    orbitTop: orbit ? Math.round(orbit.getBoundingClientRect().top) : null,
    gapToOrbit: orbit ? Math.round(orbit.getBoundingClientRect().top - rect.bottom) : null,
    navButtons,
  }
})

console.log('topbar 实测：', JSON.stringify(info, null, 2))
console.log('控制台问题：', JSON.stringify(issues.slice(0, 6)))
await page.screenshot({ path: 'logs-workbench-floating-header-1440.png' })
await page.setViewportSize({ width: 1280, height: 800 })
await page.waitForTimeout(600)
await page.screenshot({ path: 'logs-workbench-floating-header-1280.png' })
await browser.close()
