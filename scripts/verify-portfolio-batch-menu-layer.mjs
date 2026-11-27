// 验证：素材库「批量操作」下拉菜单必须浮在素材卡片之上，不被遮挡。
//
// 背景（根因）：.portfolio-toolbar 带 backdrop-filter，会自成一个层叠上下文；
//   于是内部 .batch-menu 的 z-index 只能在这一层里比较，DOM 顺序靠后的卡片整体盖住了工具栏。
//   修复：给 .portfolio-toolbar 加 z-index，使其层叠上下文高于卡片网格。
//
// 断言方式：展开菜单（等过渡动画结束）后取菜单矩形中心点，用 elementFromPoint 看
//   "该点最顶上到底是谁"，必须落在 .batch-menu 内。
//   同时做「反证」用例：临时把工具栏 z-index 还原成 auto，断言此时中心点被卡片盖住
//   —— 用来证明本测试确实能抓到该 bug（非空断言）。
//
// 用法：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     node scripts/verify-portfolio-batch-menu-layer.mjs
// 输出：.batch-menu-layer/<case>.png + report.txt + 控制台判定

import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const OUT_DIR = path.join(projectDir, '.batch-menu-layer')
const TARGET = path.join(projectDir, '.workbuddy', 'preview', 'portfolio-batch-ops.html')
const MENU_SETTLE_MS = 400 // 菜单过渡 160ms，留足余量

let pass = 0
let fail = 0
const results = []

function assert(name, ok, detail) {
  if (ok) { pass += 1; results.push(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail += 1; results.push(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`) }
}

// 只做测量，不改状态（本函数会被序列化进浏览器执行，不能引用外部作用域的变量）
const MEASURE = () => {
  const describe = (el) => {
    if (!el) return 'null'
    const cls = typeof el.className === 'string' ? el.className.trim() : ''
    return `${el.tagName.toLowerCase()}${cls ? `.${cls.split(/\s+/).join('.')}` : ''}`
  }
  const menu = document.getElementById('batchMenu')
  const r = menu.getBoundingClientRect()
  const cx = Math.round(r.left + r.width / 2)
  const cy = Math.round(r.top + r.height / 2)
  const top = document.elementFromPoint(cx, cy)
  const stack = document.elementsFromPoint(cx, cy).slice(0, 5).map(describe)
  return {
    menuVisible: getComputedStyle(menu).visibility === 'visible',
    menuOpacity: getComputedStyle(menu).opacity,
    menuZ: getComputedStyle(menu).zIndex,
    toolbarZ: getComputedStyle(document.querySelector('.portfolio-toolbar')).zIndex,
    menuRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    center: { cx, cy },
    topEl: describe(top),
    hitMenu: Boolean(top && top.closest('#batchMenu')),
    stack,
  }
}

async function openMenu(page) {
  await page.click('#batchBtn')
  await page.waitForTimeout(MENU_SETTLE_MS)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(pathToFileURL(TARGET).href, { waitUntil: 'load' })
    await page.waitForTimeout(300)

    // ---------- 用例 1：修复后，菜单中心点最顶层必须是菜单自身 ----------
    await openMenu(page)
    const fixed = await page.evaluate(MEASURE)
    await page.screenshot({ path: path.join(OUT_DIR, '01-fixed.png') })
    assert('菜单已展开可见', fixed.menuVisible, `visibility=${fixed.menuVisible} opacity=${fixed.menuOpacity}`)
    assert('工具栏 z-index 已提升', fixed.toolbarZ !== 'auto', `toolbar z-index=${fixed.toolbarZ}`)
    assert(
      '菜单中心点最顶层元素属于 .batch-menu（未被卡片遮挡）',
      fixed.hitMenu,
      `命中=${fixed.topEl} @(${fixed.center.cx},${fixed.center.cy}) 叠放序=${fixed.stack.join(' > ')}`,
    )

    // ---------- 用例 2：反证 —— 还原工具栏 z-index 为 auto，必须复现遮挡 ----------
    await page.evaluate(() => {
      document.getElementById('batchMenu').classList.remove('show') // 先收起
      document.querySelector('.portfolio-toolbar').style.zIndex = 'auto'
    })
    await page.waitForTimeout(MENU_SETTLE_MS)
    await openMenu(page)
    const broken = await page.evaluate(MEASURE)
    await page.screenshot({ path: path.join(OUT_DIR, '02-broken-regression.png') })
    assert(
      '反证：还原 auto 后菜单中心点被卡片盖住（证明本测试能抓到该 bug）',
      !broken.hitMenu,
      `命中=${broken.topEl} 叠放序=${broken.stack.join(' > ')}`,
    )

    await writeFile(
      path.join(OUT_DIR, 'report.txt'),
      [
        '素材库「批量操作」下拉菜单层级验证',
        `目标文件：${TARGET}`,
        '',
        `[修复后] toolbar z-index=${fixed.toolbarZ}  menu z-index=${fixed.menuZ}`,
        `  菜单矩形 x=${fixed.menuRect.x} y=${fixed.menuRect.y} w=${fixed.menuRect.w} h=${fixed.menuRect.h}`,
        `  中心点 (${fixed.center.cx},${fixed.center.cy}) 最顶层=${fixed.topEl}  命中菜单=${fixed.hitMenu}`,
        `  该点叠放序：${fixed.stack.join(' > ')}`,
        '',
        `[反证-还原 auto] 中心点最顶层=${broken.topEl}  命中菜单=${broken.hitMenu}`,
        `  该点叠放序：${broken.stack.join(' > ')}`,
        '',
        results.join('\n'),
        '',
        `结果：${pass} 通过 / ${fail} 失败`,
      ].join('\n'),
      'utf8',
    )
  } finally {
    await browser.close()
  }

  console.log(results.join('\n'))
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  console.log(`证据目录：${OUT_DIR}`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(2) })
