/**
 * 验收：学生工作台顶部「不要导航条、文字直接悬浮」
 * 跑法：env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY node scripts/verify-workbench-floating-header.mjs
 *
 * 断言重点：
 *  1. .topbar 不再有白底 / 阴影 / 描边 / 圆角（= 不是一条导航条了）
 *  2. 高度仍是 58px（跟别的页面切来切去不跳动）
 *  3. 右侧按钮没有胶囊白底（纯文字）
 *  4. 顶部条和轨道舞台之间仍有 8~14px 呼吸间距（贴太紧会像粘在一起）
 *  5. 四种难度都成立（低龄版到高级版共用同一个工作台）
 */
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = process.env.APP_WEB_ORIGIN || 'http://127.0.0.1:5173'
const API = process.env.APP_API_ORIGIN || 'http://127.0.0.1:3000'
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const ACCOUNT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }
const DIFFICULTIES = [
  ['junior', '初级版'],
  ['starter', '入门版'],
  ['advanced', '进阶版'],
  ['pro', '高级版'],
]

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${label}`) } else { fail += 1; console.log(`  ✗ ${label}${detail ? `  →  ${detail}` : ''}`) }
}

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

for (const [id, label] of DIFFICULTIES) {
  console.log(`\n【${label} / ${id}】`)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addCookies(cookies)
  await context.addInitScript((value) => localStorage.setItem('art-studio-difficulty', value), id)
  const page = await context.newPage()
  await page.goto(`${BASE}/student/workbench`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1500)

  const info = await page.evaluate(() => {
    const header = document.querySelector('.topbar')
    const orbit = document.querySelector('.pro-orbit')
    if (!header) return null
    const style = getComputedStyle(header)
    const rect = header.getBoundingClientRect()
    const buttons = [...header.querySelectorAll('nav button')].filter((button) => button.getBoundingClientRect().height > 0)
    return {
      height: Math.round(rect.height),
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      borderWidth: style.borderTopWidth,
      borderRadius: style.borderTopLeftRadius,
      backdropFilter: style.backdropFilter,
      orbitTop: orbit ? Math.round(orbit.getBoundingClientRect().top) : null,
      headerBottom: Math.round(rect.bottom),
      buttons: buttons.map((button) => ({
        text: button.textContent.trim(),
        background: getComputedStyle(button).backgroundColor,
      })),
    }
  })

  if (!info) { check('能找到顶部条 .topbar', false); await context.close(); continue }

  check('顶部条高度 58px（和别的页面一致，切换不跳动）', info.height === 58, `实测 ${info.height}px`)
  check('顶部条没有白色底', info.backgroundColor === 'rgba(0, 0, 0, 0)', info.backgroundColor)
  check('顶部条没有背景图 / 渐变', info.backgroundImage === 'none', info.backgroundImage)
  check('顶部条没有阴影', info.boxShadow === 'none', info.boxShadow)
  check('顶部条没有描边', info.borderWidth === '0px', info.borderWidth)
  check('顶部条没有圆角（不是一张卡片了）', info.borderRadius === '0px', info.borderRadius)
  check('顶部条没有毛玻璃', info.backdropFilter === 'none', info.backdropFilter)
  check('右侧按钮 ≥ 4 个且都渲染出来了', info.buttons.length >= 4, `实测 ${info.buttons.length} 个`)
  const solidButtons = info.buttons.filter((button) => button.background !== 'rgba(0, 0, 0, 0)')
  check('右侧按钮没有胶囊白底（纯文字悬浮）', solidButtons.length === 0,
    solidButtons.map((button) => `${button.text}=${button.background}`).join(' / '))
  const gap = info.orbitTop - info.headerBottom
  check('顶部文字和下方轨道区之间留 8~14px 呼吸间距', gap >= 8 && gap <= 14, `实测 ${gap}px`)

  await context.close()
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
await browser.close()
if (fail > 0) process.exitCode = 1
