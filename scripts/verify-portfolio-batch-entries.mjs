// 验证：素材库「批量操作」在真实页面可用，且下拉菜单不被卡片遮挡。
//
// 入口现状（重要）：
//   可达入口 = 独立页 /student/portfolio。
//   工作台 /student/workbench 的经典看板（含「我的素材库」标签页）被 ProWorkbenchOrbit
//   取代：`v-if="['junior','starter','advanced','pro'].includes(difficulty)"` 覆盖了
//   difficultyList 的全部 4 个取值，其 `<template v-else>` 永不成立 —— 经典看板目前是
//   不可达代码。所以本脚本用「非 Pro 轨道难度」强制渲染经典看板，单独验证该预留路径。
//
// 覆盖的真实故障与语义：
//   1) 层叠上下文遮挡：容器带 backdrop-filter 时内部 .batch-menu 的 z-index 被封死 →
//      菜单被后面的素材卡片盖住。断言：菜单中心点 elementFromPoint 必须命中 .batch-menu。
//   2) 卡片点击冲突：批量态点卡片必须「勾选」，不能同时弹出作品详情。
//   3) 菜单内容：4 项，第 4 项「批量投稿到作品广场」必须 disabled 且带「即将开放」。
//   4) 批量重命名 / 批量删除 + 撤销 端到端可用。
//
// 用法：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     node scripts/verify-portfolio-batch-entries.mjs
// 前置：本地预览已启动（默认 http://127.0.0.1:5199，可用 BASE_URL 覆盖）。
// 输出：.batch-menu-layer/real-*.png + real-report.txt + 控制台判定

import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const OUT_DIR = path.join(projectDir, '.batch-menu-layer')
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5199'
const MENU_SETTLE_MS = 450 // 菜单过渡 160ms，留足余量

const MOCK_SESSION = {
  user: { id: 'stu-001', name: '小画家阿橙', role: 'student', className: 'AI创意美术A班', avatar: '艺', difficulty: 'pro' },
  token: 'mock-token-project-new-art-studio',
}

let pass = 0
let fail = 0
const results = []

function assert(name, ok, detail) {
  if (ok) { pass += 1; results.push(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail += 1; results.push(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ENTRIES = [
  {
    key: 'A-独立页',
    url: '/student/portfolio',
    card: '.portfolio-card',
    label: '独立页 /student/portfolio（当前唯一可达入口）',
    storage: {},
    deep: true,
  },
  {
    key: 'B-工作台经典看板',
    url: '/student/workbench?tab=portfolio',
    card: '.portfolio-cover-card',
    label: '工作台经典看板（被 ProWorkbenchOrbit 取代的预留路径，需强制非 Pro 难度）',
    // 'classic-board' 不在 difficultyList 里 → 绕过 ProWorkbenchOrbit 的 v-if，渲染经典看板
    storage: { 'art-studio-difficulty': 'classic-board' },
    deep: false,
  },
]

/** 详情弹窗判定：Element Plus 的 .el-overlay 常驻 DOM，收起时靠 display:none，不能只数节点 */
const VISIBLE_OVERLAYS = () => [...document.querySelectorAll('.el-overlay')]
  .filter((el) => {
    const style = getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05
  }).length

async function readCardTitles(page) {
  return page.evaluate(() => [...document.querySelectorAll('.portfolio-cover-info strong')]
    .map((el) => el.textContent.trim()))
}

async function runEntry(browser, entry) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const label = entry.key
  try {
    // 先落到同源页面才能写 localStorage，再跳目标路由
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(({ session, extra }) => {
      localStorage.setItem('art-studio-user', JSON.stringify(session))
      Object.entries(extra).forEach(([key, value]) => localStorage.setItem(key, value))
    }, { session: MOCK_SESSION, extra: entry.storage })

    await page.goto(`${BASE_URL}${entry.url}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.portfolio-batch-trigger', { timeout: 20000 })
    await page.waitForTimeout(700)

    const cardCount = await page.locator(entry.card).count()
    assert(`${label} 素材卡片已渲染`, cardCount > 0, `卡片数=${cardCount}`)
    if (!cardCount) return

    // ---------- 1. 展开菜单，测层叠层级 ----------
    await page.click('.portfolio-batch-trigger')
    await page.waitForTimeout(MENU_SETTLE_MS)

    const menuProbe = await page.evaluate(() => {
      const describe = (el) => {
        if (!el) return 'null'
        const cls = typeof el.className === 'string' ? el.className.trim() : ''
        return `${el.tagName.toLowerCase()}${cls ? `.${cls.split(/\s+/).join('.')}` : ''}`
      }
      const menu = document.querySelector('.batch-menu')
      if (!menu) return { found: false }
      const r = menu.getBoundingClientRect()
      const cx = Math.round(r.left + r.width / 2)
      const cy = Math.round(r.top + r.height / 2)
      const top = document.elementFromPoint(cx, cy)
      return {
        found: true,
        visible: getComputedStyle(menu).visibility === 'visible' && Number(getComputedStyle(menu).opacity) > 0.5,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        center: { cx, cy },
        topEl: describe(top),
        hitMenu: Boolean(top && top.closest('.batch-menu')),
        stack: document.elementsFromPoint(cx, cy).slice(0, 5).map(describe),
      }
    })

    assert(`${label} 下拉菜单已展开`, menuProbe.found && menuProbe.visible, `visible=${menuProbe.visible}`)
    assert(
      `${label} 菜单中心点最顶层属于 .batch-menu（未被卡片遮挡）`,
      menuProbe.hitMenu,
      menuProbe.found
        ? `命中=${menuProbe.topEl} @(${menuProbe.center.cx},${menuProbe.center.cy}) 叠放序=${menuProbe.stack.join(' > ')}`
        : '未找到 .batch-menu',
    )
    await page.screenshot({ path: path.join(OUT_DIR, `real-${entry.key}-01-menu.png`) })

    // ---------- 2. 菜单内容：4 项 + 第 4 项 disabled ----------
    const menuItems = await page.evaluate(() => [...document.querySelectorAll('.batch-menu-item')].map((el) => ({
      label: el.querySelector('strong')?.textContent?.trim() || '',
      disabled: el.disabled,
      badge: el.querySelector('.batch-menu-badge')?.textContent?.trim() || '',
    })))
    assert(`${label} 菜单含 4 项`, menuItems.length === 4, `实际=${menuItems.map((i) => i.label).join(' / ')}`)
    const submit = menuItems.find((item) => item.label.includes('投稿'))
    assert(`${label} 「批量投稿到作品广场」已置灰并标注即将开放`, Boolean(submit?.disabled && submit.badge === '即将开放'), JSON.stringify(submit || {}))

    // ---------- 3. 选「批量重命名」进入批量态 ----------
    await page.click('.batch-menu-item >> nth=1')
    await page.waitForTimeout(300)

    const barVisible = await page.locator('.batch-action-bar').isVisible().catch(() => false)
    assert(`${label} 底部批量操作条已出现（Teleport 到 body）`, barVisible)

    const selectBoxCount = await page.locator('.portfolio-select-box').count()
    assert(`${label} 卡片出现勾选框`, selectBoxCount > 0, `勾选框数=${selectBoxCount}`)

    // ---------- 4. 点卡片 = 勾选，且不得弹出详情弹窗 ----------
    await page.locator(entry.card).nth(0).click()
    await page.waitForTimeout(200)
    await page.locator(entry.card).nth(1).click()
    await page.waitForTimeout(250)

    const pickState = await page.evaluate((cardSel) => ({
      picked: document.querySelectorAll(`${cardSel}.is-picked`).length,
      checkedBoxes: document.querySelectorAll('.portfolio-select-box.checked').length,
      overlays: [...document.querySelectorAll('.el-overlay')].filter((el) => {
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05
      }).length,
      barCount: document.querySelector('.batch-bar-info strong')?.textContent?.trim() || '',
    }), entry.card)

    assert(`${label} 两张卡片进入选中态`, pickState.picked === 2, `is-picked=${pickState.picked}`)
    assert(`${label} 勾选框显示已勾选`, pickState.checkedBoxes === 2, `checked=${pickState.checkedBoxes}`)
    assert(`${label} 批量态点卡片不再弹出作品详情`, pickState.overlays === 0, `可见 el-overlay 数=${pickState.overlays}`)
    assert(`${label} 操作条计数同步为 2`, pickState.barCount === '2', `计数=${pickState.barCount}`)
    await page.screenshot({ path: path.join(OUT_DIR, `real-${entry.key}-02-picked.png`) })

    if (entry.deep) {
      // ---------- 5. 批量重命名端到端 ----------
      const PREFIX = '批量验证-'
      await page.click('.batch-bar-primary') // 执行重命名
      await page.waitForSelector('.batch-rename', { timeout: 5000 })
      await page.fill('.batch-rename .el-input__inner', PREFIX)
      await page.getByRole('button', { name: '确认重命名' }).click()
      await page.waitForTimeout(600)
      const titles = await readCardTitles(page)
      const renamed = titles.filter((title) => title.startsWith(PREFIX)).length
      assert(`${label} 批量重命名生效（前缀+序号）`, renamed === 2, `命中=${renamed} 标题=${titles.join(' | ')}`)
      const afterRenameBars = await page.locator('.batch-action-bar').count()
      assert(`${label} 重命名完成后自动退出批量态`, afterRenameBars === 0)

      // ---------- 6. 批量删除 + 撤销端到端 ----------
      await page.click('.portfolio-batch-trigger')
      await page.waitForTimeout(MENU_SETTLE_MS)
      await page.click('.batch-menu-item >> nth=0') // 批量删除
      await page.waitForTimeout(300)
      await page.locator(entry.card).nth(0).click()
      await page.waitForTimeout(150)
      await page.locator(entry.card).nth(1).click()
      await page.waitForTimeout(200)
      await page.click('.batch-bar-primary')
      await page.getByRole('button', { name: /删除 2 项/ }).click()
      await page.waitForTimeout(800)
      const afterDelete = await page.locator(entry.card).count()
      assert(`${label} 批量删除后卡片减少`, afterDelete < cardCount, `删除前=${cardCount} 删除后=${afterDelete}`)

      const undoVisible = await page.locator('.batch-undo-bar').isVisible().catch(() => false)
      assert(`${label} 出现可撤销提示条`, undoVisible)
      await page.screenshot({ path: path.join(OUT_DIR, `real-${entry.key}-03-undo.png`) })

      await page.locator('.batch-undo-bar button').first().click()
      await page.waitForTimeout(800)
      const afterUndo = await page.locator(entry.card).count()
      assert(`${label} 撤销后素材完整恢复`, afterUndo === cardCount, `恢复后=${afterUndo} 原始=${cardCount}`)
    }

    // ---------- 7. 退出批量：勾选框消失、点卡片恢复打开详情 ----------
    const stillBatch = await page.locator('.batch-action-bar').count()
    if (stillBatch) {
      // 不能用 name:'退出'（会同时命中顶部「退出登录」和触发器的「退出批量」）
      await page.locator('.batch-action-bar .batch-bar-ghost').nth(2).click()
      await page.waitForTimeout(300)
    }
    const afterExit = await page.evaluate(() => ({
      selectBoxes: document.querySelectorAll('.portfolio-select-box').length,
      bars: document.querySelectorAll('.batch-action-bar').length,
    }))
    assert(`${label} 退出批量后勾选框与操作条均消失`, afterExit.selectBoxes === 0 && afterExit.bars === 0, JSON.stringify(afterExit))

    await page.locator(entry.card).nth(0).click()
    await page.waitForTimeout(600)
    const overlaysAfterNormalClick = await page.evaluate(() => [...document.querySelectorAll('.el-overlay')].filter((el) => {
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05
    }).length)
    assert(`${label} 普通态点卡片仍能打开详情`, overlaysAfterNormalClick > 0, `可见 el-overlay 数=${overlaysAfterNormalClick}`)
  } catch (error) {
    fail += 1
    results.push(`  [FAIL] ${label} 执行异常 — ${error?.message || error}`)
  } finally {
    await page.close()
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  try {
    for (const entry of ENTRIES) {
      results.push(`\n── ${entry.key}  ${entry.url}`)
      results.push(`   说明：${entry.label}`)
      await runEntry(browser, entry)
    }
  } finally {
    await browser.close()
  }

  await writeFile(
    path.join(OUT_DIR, 'real-report.txt'),
    [
      '素材库「批量操作」双入口真机验收',
      `BASE_URL：${BASE_URL}`,
      results.join('\n'),
      '',
      `结果：${pass} 通过 / ${fail} 失败`,
    ].join('\n'),
    'utf8',
  )

  console.log(results.join('\n'))
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  console.log(`证据目录：${OUT_DIR}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(2) })
