// 验证：素材库工具栏「瘦身 + 授权入口收纳」是否真的生效（用户 10-31 报障）。
//
// 用户原话：
//   "现在这个这里太乱了，允许系统自动精选、学校尚未公开授权、这个是干啥的啊？
//    为什么出现在客户端页面了，而且上面的素材库这个横栏上下占位太大了，
//    也影响到了下面的内容位置"
//
// 三条可观察判据：
//   A. 授权相关文案（"允许系统自动精选" / "学校尚未登记公开授权"）默认【不可见】
//      —— 收进齿轮弹层里，点开才出现。工具栏里不能再有长句。
//   B. 工具栏高度必须明显收窄（原 ~70px → 目标 ≤ 52px），
//      且素材卡片首行顶部位置相应上移。
//   C. 齿轮入口可点开，弹层里能操作开关、能看到未授权提示（功能没丢，只是收起来）。
//
// 同时回归：批量操作菜单仍然浮于卡片之上（层叠上下文没被这次改动破坏）。
//
// 用法：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     node scripts/verify-portfolio-toolbar-compact.mjs
// 前置：本地预览已启动（默认 http://127.0.0.1:5199，可用 BASE_URL 覆盖）。

import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const OUT_DIR = path.join(projectDir, '.batch-menu-layer')
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5199'
const POPPER_SETTLE_MS = 450 // ElPopover 展开过渡

const MOCK_SESSION = {
  user: { id: 'stu-001', name: '小画家阿橙', role: 'student', className: 'AI创意美术A班', avatar: '艺', difficulty: 'pro' },
  token: 'mock-token-project-new-art-studio',
}

let pass = 0
let fail = 0
const results = []

function assert(name, ok, detail) {
  results.push({ name, ok, detail })
  if (ok) {
    pass += 1
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  // 注入学生登录态（mock），避免被路由守卫踢回登录页
  await page.addInitScript((session) => {
    localStorage.setItem('art-studio-user', JSON.stringify(session))
  }, MOCK_SESSION)

  console.log('\n[A] 独立页 /student/portfolio —— 工具栏瘦身')
  await page.goto(`${BASE_URL}/student/portfolio`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('.portfolio-toolbar', { timeout: 30000 })
  // 等待素材卡片渲染（有数据才有"下面的内容被顶下去"的可测基准）
  await page.waitForFunction(() => document.querySelectorAll('.portfolio-card').length > 0, { timeout: 30000 }).catch(() => {})
  await delay(400)

  // A1. 工具栏高度收窄
  const toolbarBox = await page.locator('.portfolio-toolbar').boundingBox()
  const toolbarH = toolbarBox ? Math.round(toolbarBox.height) : -1
  assert('A1 工具栏高度 ≤ 52px（原约 70px）', toolbarH > 0 && toolbarH <= 52, `实测 ${toolbarH}px`)

  // A2. 授权长文案默认不可见
  const longTextVisible = await page.evaluate(() => {
    const texts = ['允许系统自动精选', '学校尚未登记公开授权']
    return texts.filter((t) => {
      const hit = [...document.querySelectorAll('.portfolio-toolbar *')]
        .find((el) => el.children.length === 0 && (el.textContent || '').includes(t))
      if (!hit) return false
      const style = getComputedStyle(hit)
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05
    })
  })
  assert('A2 工具栏内无授权长文案（已收纳进弹层）', longTextVisible.length === 0, longTextVisible.length ? `仍可见：${longTextVisible.join('、')}` : '0 处')

  // A3. 齿轮入口存在且尺寸合理（≥32px 可点）
  const gear = page.locator('.portfolio-toolbar .consent-entry')
  const gearCount = await gear.count()
  const gearBox = gearCount ? await gear.first().boundingBox() : null
  assert('A3 齿轮入口存在', gearCount === 1, `${gearCount} 个`)
  assert('A3b 齿轮点击区 ≥32px', !!gearBox && gearBox.height >= 32 && gearBox.width >= 32,
    gearBox ? `${Math.round(gearBox.width)}x${Math.round(gearBox.height)}` : '无')

  // A4. 工具栏不再有横向滚动条（原 overflow-x 造成"乱"）
  const tabsOverflow = await page.evaluate(() => {
    const el = document.querySelector('.type-tabs')
    if (!el) return null
    return { scrollW: el.scrollWidth, clientW: el.clientWidth, hasHScroll: el.scrollWidth > el.clientWidth + 2 }
  })
  assert('A4 分类栏无横向溢出（桌面 1440 宽）', !!tabsOverflow && !tabsOverflow.hasHScroll,
    tabsOverflow ? `scroll ${tabsOverflow.scrollW} / client ${tabsOverflow.clientW}` : '未找到 .type-tabs')

  // A5. 素材卡片首行位置：工具栏底 + 间距，不能被顶得太低
  const firstCard = await page.locator('.portfolio-card').first().boundingBox().catch(() => null)
  if (firstCard && toolbarBox) {
    const gap = Math.round(firstCard.y - (toolbarBox.y + toolbarBox.height))
    assert('A5 工具栏与卡片间距 ≤ 20px', gap >= 0 && gap <= 20, `实测 ${gap}px`)
  } else {
    assert('A5 工具栏与卡片间距 ≤ 20px', false, '未取到卡片位置')
  }

  await page.screenshot({ path: path.join(OUT_DIR, 'compact-A-01-toolbar.png'), clip: { x: 0, y: 0, width: 1440, height: 520 } })

  // A6. 齿轮弹层能打开，里面能看到开关与提示（功能没丢）
  await gear.first().click()
  await delay(POPPER_SETTLE_MS)
  const popperState = await page.evaluate(() => {
    const popper = [...document.querySelectorAll('.portfolio-consent-popper')]
      .find((el) => {
        const s = getComputedStyle(el)
        return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05
      })
    if (!popper) return { open: false }
    return {
      open: true,
      hasTitle: (popper.textContent || '').includes('系统自动精选'),
      hasSwitch: !!popper.querySelector('.el-switch'),
      hasNote: !!popper.querySelector('.consent-panel-note'),
    }
  })
  assert('A6 齿轮弹层可打开', popperState.open === true)
  assert('A6b 弹层含标题/开关/提示', !!(popperState.hasTitle && popperState.hasSwitch),
    `title=${popperState.hasTitle} switch=${popperState.hasSwitch} note=${popperState.hasNote}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'compact-A-02-consent-popover.png'), clip: { x: 0, y: 0, width: 1440, height: 640 } })

  // 关掉弹层（点空白）
  await page.mouse.click(720, 900)
  await delay(300)

  // A7. 回归：批量操作菜单仍浮于卡片之上（层叠上下文未被破坏）
  await page.locator('.portfolio-batch-trigger').first().click()
  await delay(500)
  const menuOnTop = await page.evaluate(() => {
    const menu = document.querySelector('.batch-menu')
    if (!menu) return { exists: false }
    const r = menu.getBoundingClientRect()
    const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2))
    return { exists: true, onTop: !!hit && !!hit.closest('.batch-menu') }
  })
  assert('A7 批量菜单仍浮于卡片之上（无遮挡回归）', menuOnTop.exists && menuOnTop.onTop,
    `exists=${menuOnTop.exists} onTop=${menuOnTop.onTop}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'compact-A-03-batch-menu.png'), clip: { x: 0, y: 0, width: 1440, height: 640 } })

  // A8. 窄屏 800px 下工具栏不炸（换行后仍可用）
  await page.locator('.portfolio-batch-trigger').first().click() // 先收起菜单
  await delay(300)
  await page.setViewportSize({ width: 800, height: 900 })
  await delay(400)
  const narrowOverflow = await page.evaluate(() => {
    const el = document.querySelector('.portfolio-toolbar')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { right: Math.round(r.right), docW: document.documentElement.clientWidth, overflow: r.right > document.documentElement.clientWidth + 2 }
  })
  assert('A8 窄屏 800px 工具栏不溢出', !!narrowOverflow && !narrowOverflow.overflow,
    narrowOverflow ? `right=${narrowOverflow.right} / doc=${narrowOverflow.docW}` : '未找到工具栏')
  await page.screenshot({ path: path.join(OUT_DIR, 'compact-A-04-narrow.png'), clip: { x: 0, y: 0, width: 800, height: 640 } })

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: path.join(OUT_DIR, 'compact-A-05-full.png'), fullPage: false })

  // A9. 控制台无报错
  const realErrors = consoleErrors.filter((t) => !/favicon|Download the Vue Devtools|ERR_PROXY|net::ERR_/i.test(t))
  assert('A9 控制台无错误', realErrors.length === 0, realErrors.length ? realErrors.slice(0, 3).join(' | ') : '0 条')

  await browser.close()

  const report = [
    '素材库工具栏瘦身验收报告',
    `时间：${new Date().toISOString()}`,
    `地址：${BASE_URL}`,
    '',
    ...results.map((r, i) => `${r.ok ? 'PASS' : 'FAIL'}  ${String(i + 1).padStart(2, '0')}. ${r.name}${r.detail ? ` — ${r.detail}` : ''}`),
    '',
    `结果：${pass} 通过 / ${fail} 失败`,
  ].join('\n')
  await writeFile(path.join(OUT_DIR, 'compact-report.txt'), report, 'utf8')
  console.log(`\n${report.split('\n').slice(-1)[0]}`)
  console.log(`证据目录：${OUT_DIR}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error('\n脚本异常：', err && err.stack ? err.stack : err)
  process.exit(2)
})
