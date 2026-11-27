// 截图静态样张 docs/h5-mockups/pro-h5-report-v6-agent.html
import { createRequire } from 'node:module'
import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
const SHOT_DIR = path.join(process.cwd(), 'docs', 'h5-mockups', 'shots')
await mkdir(OUT_DIR, { recursive: true })
await mkdir(SHOT_DIR, { recursive: true })
const target = pathToFileURL(path.join(process.cwd(), 'docs', 'h5-mockups', 'pro-h5-report-v6-agent.html')).href

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(target, { waitUntil: 'load' })
  await page.waitForTimeout(500)
  const off = path.join(OUT_DIR, 'mock-v6-agent.png')
  await page.screenshot({ path: off })

  const check = () => page.evaluate(() => {
    const pick = (el) => {
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const $ = (s) => document.querySelector(s)
    const side = pick($('.guide-side'))
    const main = pick($('.guide-main'))
    const left = pick($('.left'))
    const mid = pick($('.mid'))
    return {
      grid: getComputedStyle($('.grid')).gridTemplateColumns,
      left, mid, side, main,
      对齐: {
        卡左边缘减左栏左边缘: side.x - left.x,
        右块左边缘减中栏左边缘: main.x - mid.x,
        右块右边缘减中栏右边缘: main.right - mid.right,
        左块右边缘减左栏右边缘: side.right - left.right,
        左块与右块间隙: main.x - side.right,
        上排底边到向导卡顶边: side.y - left.bottom,
        左右两块等高: side.h === main.h,
      },
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      overflowY: document.documentElement.scrollHeight > window.innerHeight,
    }
  })

  console.log('--- 关闭态 ---')
  console.log(JSON.stringify(await check(), null, 2))

  if (process.env.HIDE_NOTE === '1') {
    await page.addStyleTag({ content: '.mock-note{display:none !important}' })
    await page.waitForTimeout(120)
  }
  await page.click('#agentSwitch')
  await page.waitForTimeout(320)
  const on = path.join(OUT_DIR, 'mock-v6-agent-on.png')
  await page.screenshot({ path: on })
  const onInfo = await check()
  console.log('--- 开启态 ---')
  console.log(JSON.stringify({ 对齐: onInfo.对齐, overflowX: onInfo.overflowX, overflowY: onInfo.overflowY, side: onInfo.side, main: onInfo.main }, null, 2))

  await copyFile(off, path.join(SHOT_DIR, '高级创作报告-v6版式-开关关闭.png'))
  await copyFile(on, path.join(SHOT_DIR, '高级创作报告-v6版式-智能体开启.png'))
} finally {
  await browser.close()
}
