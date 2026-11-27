/**
 * 量一下学生端各页导航条的真实高度（只读，不改数据）。
 * 跑法：env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY node scripts/measure-headers.mjs
 */
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = process.env.APP_WEB_ORIGIN || 'http://127.0.0.1:5173'
const API = process.env.APP_API_ORIGIN || 'http://127.0.0.1:3000'
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const ACCOUNT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }

const PAGES = [
  ['学生工作台', '/student/workbench', '.topbar'],
  ['AI 绘画', '/student/paint', '.paint-header'],
  ['AI 视频', '/student/video', '.video-header'],
  ['3D 建模', '/student/model3d', '.creator-header'],
  ['课程中心', '/student/courses', '.course-header, .course-list-top'],
  ['报告总览', '/student/reports', '.reports-toolbar'],
  ['高级报告', '/student/h5-report', '.advanced-report-header'],
  ['作品广场', '/student/gallery', '.gallery-header'],
  ['我的作品集', '/student/portfolio', '.portfolio-header'],
  ['个人中心', '/profile', '.profile-topbar'],
]

async function loginCookies() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ACCOUNT),
  })
  if (!response.ok) throw new Error(`登录失败：${response.status}`)
  return (response.headers.getSetCookie?.() || []).map((raw) => raw.split(';')[0]).map((pair) => {
    const index = pair.indexOf('=')
    return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: new URL(BASE).hostname, path: '/' }
  })
}

const cookies = await loginCookies()
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addCookies(cookies)
const page = await context.newPage()

const rows = []
for (const [name, route, selector] of PAGES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(900)
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return {
      top: Math.round(rect.top), height: Math.round(rect.height), width: Math.round(rect.width),
      minHeight: style.minHeight, padding: style.padding,
    }
  }, selector)
  rows.push({ name, route, selector, info })
  console.log(`${name.padEnd(7, '　')} ${route}  →  `, info ? JSON.stringify(info) : '（没找到元素）')
}

console.log('\n--- 汇总 ---')
for (const row of rows) console.log(`${row.name}: ${row.info ? `${row.info.height}px` : 'N/A'}`)

await browser.close()
