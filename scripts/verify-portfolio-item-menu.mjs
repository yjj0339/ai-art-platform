// 验证：素材库卡片右上角「三个点」菜单（下载 / 重命名 / 删除）。
//
// 为什么单独写脚本：这块最容易出的不是「按钮没渲染」，而是
//   1) 点三个点顺带把卡片详情弹窗打开（点击冒泡没拦住）；
//   2) 改名只改了内存、没落到服务端，刷新就还原；
//   3) 删除点了「取消」还是删了，或者点了「确认」啥也没发生。
// 所以本脚本用学生账号 + 自建临时项目，端到端跑一遍并在结束时删干净临时记录。
//
// 用法（前置：本地预览已启动，默认 http://127.0.0.1:5173）：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     MSYS_NO_PATHCONV=1 node scripts/verify-portfolio-item-menu.mjs
// 账号可用 STUDENT_ACCOUNT / STUDENT_PASSWORD / ORG_CODE 覆盖。
// 输出：.portfolio-item-menu/real-*.png + 控制台判定

import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const OUT_DIR = path.join(projectDir, '.portfolio-item-menu')
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173'
const ACCOUNT = process.env.STUDENT_ACCOUNT || 'ceshi2'
const PASSWORD = process.env.STUDENT_PASSWORD || '123456789'
const ORG_CODE = process.env.ORG_CODE || 'demo-school'
const TEMP_TITLE = `菜单验证临时素材-${Date.now()}`
const RENAMED_TITLE = `${TEMP_TITLE}-已改名`

let pass = 0
let fail = 0
const results = []

function assert(name, ok, detail) {
  if (ok) { pass += 1; results.push(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail += 1; results.push(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`) }
}

const VISIBLE_OVERLAYS = () => [...document.querySelectorAll('.el-overlay')]
  .filter((el) => {
    const style = getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05
  }).length

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME })
let tempDocumentId = ''
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (error) => results.push(`  [PAGEERROR] ${error.message}`))

  await login(page)
  tempDocumentId = await createTempProject(page)
  assert('已创建临时项目（用完会删）', Boolean(tempDocumentId), tempDocumentId)

  await page.goto(`${BASE_URL}/student/portfolio`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.portfolio-card', { timeout: 20000 })
  await page.waitForTimeout(600)

  // ---------- 1. 每张卡都有三个点，且在封面右上角 ----------
  const cardCount = await page.locator('.portfolio-card').count()
  const triggerCount = await page.locator('.pim-trigger').count()
  assert('素材卡片已渲染', cardCount > 0, `卡片数=${cardCount}`)
  assert('每张卡片都有一个「三个点」按钮', triggerCount === cardCount, `三个点数=${triggerCount} / 卡片数=${cardCount}`)

  const target = page.locator('.portfolio-card', { hasText: TEMP_TITLE }).first()
  const targetExists = await target.count()
  assert('临时素材卡片出现在列表里', targetExists > 0)

  const geo = await target.evaluate((card) => {
    const cover = card.querySelector('.portfolio-cover')
    const btn = card.querySelector('.pim-trigger')
    if (!cover || !btn) return null
    const c = cover.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    return {
      insideCover: b.top >= c.top - 1 && b.right <= c.right + 1,
      gapTop: Math.round(b.top - c.top),
      gapRight: Math.round(c.right - b.right),
      size: `${Math.round(b.width)}x${Math.round(b.height)}`,
    }
  })
  assert('三个点落在封面右上角内', Boolean(geo?.insideCover), geo ? `距顶=${geo.gapTop}px 距右=${geo.gapRight}px 尺寸=${geo.size}` : '取不到位置')

  await page.screenshot({ path: path.join(OUT_DIR, 'real-01-cards.png') })

  // ---------- 2. 展开菜单：3 项，且不弹详情 ----------
  await target.locator('.pim-trigger').click()
  await page.waitForTimeout(450)
  // 每个卡片的菜单都常驻 DOM（只是 display:none），所以只数「当前可见」那一个 popper
  const menuItems = await page.evaluate(() => {
    const poppers = [...document.querySelectorAll('.portfolio-item-menu-popper')]
      .filter((el) => getComputedStyle(el).display !== 'none' && Number(getComputedStyle(el).opacity) > 0.5)
    if (!poppers.length) return []
    return [...poppers[poppers.length - 1].querySelectorAll('.el-dropdown-menu__item')]
      .map((el) => ({ label: el.textContent.trim(), disabled: el.classList.contains('is-disabled') }))
  })
  assert('菜单展开且正好 3 项：下载 / 重命名 / 删除',
    menuItems.length === 3 && menuItems[0].label === '下载' && menuItems[1].label === '重命名' && menuItems[2].label === '删除',
    menuItems.map((item) => `${item.label}${item.disabled ? '(灰)' : ''}`).join(' / '))
  const overlaysAfterOpen = await page.evaluate(VISIBLE_OVERLAYS)
  assert('点三个点不会误开作品详情弹窗', overlaysAfterOpen === 0, `可见弹层=${overlaysAfterOpen}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'real-02-menu.png') })

  // ---------- 2.5 下载：必须真的落地一个文件 ----------
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)
  await page.locator('.portfolio-item-menu-popper:visible .el-dropdown-menu__item', { hasText: '下载' }).click()
  const download = await downloadPromise
  const fileName = download ? download.suggestedFilename() : ''
  assert('点「下载」真的存下了一个文件', Boolean(download) && /\.(png|jpg|jpeg|webp|mp4|txt)$/i.test(fileName), fileName || '没收到下载事件')
  // 下载会收起菜单，重命名步骤要重新打开
  await target.locator('.pim-trigger').click()
  await page.waitForTimeout(400)

  // ---------- 3. 重命名：取消不生效，保存后生效并落服务端 ----------
  await page.locator('.portfolio-item-menu-popper:visible .el-dropdown-menu__item', { hasText: '重命名' }).click()
  await page.waitForSelector('.portfolio-item-rename-box', { timeout: 5000 })
  const inputValue = await page.locator('.portfolio-item-rename-box input').first().inputValue()
  assert('改名弹窗预填了原名', inputValue === TEMP_TITLE, `预填=${inputValue}`)
  await page.locator('.portfolio-item-rename-box .el-message-box__btns button', { hasText: '取消' }).click()
  await page.waitForTimeout(300)
  const titleAfterCancel = await target.locator('.portfolio-cover-info strong').textContent()
  assert('改名点取消不改名字', titleAfterCancel.trim() === TEMP_TITLE, `当前=${titleAfterCancel.trim()}`)

  await target.locator('.pim-trigger').click()
  await page.waitForTimeout(400)
  await page.locator('.portfolio-item-menu-popper:visible .el-dropdown-menu__item', { hasText: '重命名' }).click()
  await page.waitForSelector('.portfolio-item-rename-box', { timeout: 5000 })
  await page.locator('.portfolio-item-rename-box input').first().fill(RENAMED_TITLE)
  await page.locator('.portfolio-item-rename-box .el-message-box__btns .el-button--primary').click()
  await page.waitForTimeout(800)
  const titleAfterRename = await target.locator('.portfolio-cover-info strong').textContent()
  assert('改名保存后卡片标题立即变化', titleAfterRename.trim() === RENAMED_TITLE, `当前=${titleAfterRename.trim()}`)

  await page.waitForTimeout(1200) // 等 PATCH 落库
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.portfolio-card', { timeout: 20000 })
  await page.waitForTimeout(600)
  const persisted = await page.locator('.portfolio-cover-info strong', { hasText: RENAMED_TITLE }).count()
  assert('刷新后新名字仍在（改名已写入服务端）', persisted > 0, `匹配卡片数=${persisted}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'real-03-renamed.png') })

  // ---------- 4. 删除：取消不删，确认才删 ----------
  const renamedCard = page.locator('.portfolio-card', { hasText: RENAMED_TITLE }).first()
  await renamedCard.locator('.pim-trigger').click()
  await page.waitForTimeout(400)
  await page.locator('.portfolio-item-menu-popper:visible .el-dropdown-menu__item', { hasText: '删除' }).click()
  await page.waitForSelector('.portfolio-item-delete-box', { timeout: 5000 })
  const confirmText = await page.locator('.portfolio-item-delete-box .el-message-box__message').textContent()
  assert('删除前弹出确认框（含作品名）', confirmText.includes(RENAMED_TITLE) && confirmText.includes('不可恢复'), confirmText.trim())
  await page.screenshot({ path: path.join(OUT_DIR, 'real-04-confirm.png') })
  await page.locator('.portfolio-item-delete-box .el-message-box__btns button', { hasText: '取消' }).click()
  await page.waitForTimeout(400)
  const stillThere = await page.locator('.portfolio-card', { hasText: RENAMED_TITLE }).count()
  assert('删除点取消后卡片仍在', stillThere > 0, `匹配卡片数=${stillThere}`)

  await page.locator('.portfolio-card', { hasText: RENAMED_TITLE }).first().locator('.pim-trigger').click()
  await page.waitForTimeout(400)
  await page.locator('.portfolio-item-menu-popper:visible .el-dropdown-menu__item', { hasText: '删除' }).click()
  await page.waitForSelector('.portfolio-item-delete-box', { timeout: 5000 })
  await page.locator('.portfolio-item-delete-box .el-message-box__btns .el-button--primary').click()
  await page.waitForTimeout(1500)
  const afterDelete = await page.locator('.portfolio-card', { hasText: RENAMED_TITLE }).count()
  assert('删除点确认后卡片消失', afterDelete === 0, `残留卡片数=${afterDelete}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'real-05-deleted.png') })

  const leftOnServer = await countServerDocuments(page, RENAMED_TITLE)
  assert('服务端也不再保留这条临时素材', leftOnServer === 0, `残留文档数=${leftOnServer}`)
  if (leftOnServer === 0) tempDocumentId = ''

  // ---------- 5. 批量态下三个点让位 ----------
  await page.click('.portfolio-batch-trigger')
  await page.waitForTimeout(450)
  await page.locator('.batch-menu-item').first().click() // 选「批量删除」才真正进入批量态
  await page.waitForTimeout(500)
  const triggersInBatch = await page.locator('.pim-trigger').count()
  assert('进入批量选择后三个点自动隐藏', triggersInBatch === 0, `三个点数=${triggersInBatch}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'real-06-batch-hidden.png') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
} catch (error) {
  fail += 1
  results.push(`  [FAIL] 脚本异常：${error.message}`)
} finally {
  // 兜底清理：脚本中途失败也要把临时记录删掉，别把垃圾留在学生账号里
  if (tempDocumentId) {
    try {
      const page = await browser.newPage()
      await login(page).catch(() => {})
      await page.evaluate(async (id) => {
        await fetch(`/api/me/documents/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      }, tempDocumentId)
      results.push(`  [CLEANUP] 已删除临时文档 ${tempDocumentId}`)
      await page.close()
    } catch (error) {
      results.push(`  [CLEANUP-FAIL] ${error.message}`)
    }
  }
  await browser.close()
  console.log(results.join('\n'))
  console.log(`\n汇总：PASS ${pass} / FAIL ${fail}　截图目录：${OUT_DIR}`)
  process.exit(fail ? 1 : 0)
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.login-form .el-input__inner', { timeout: 20000 })
  const inputs = page.locator('.login-form .el-input__inner')
  await inputs.nth(0).fill(ACCOUNT)
  if (await inputs.count() > 2) await inputs.nth(1).fill(ORG_CODE)
  await page.locator('.login-form input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: '进入学生工作台' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })
  await page.waitForTimeout(800)
}

/** 用学生自己的会话建一条临时项目，作为「被改被删」的靶子 */
async function createTempProject(page) {
  return page.evaluate(async (title) => {
    const response = await fetch('/api/me/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'project',
        resourceKey: `verify-item-menu-${Date.now()}`,
        title,
        data: {
          title,
          prompt: '菜单验证用临时素材，可随时删除',
          theme: '菜单验证',
          difficulty: 'starter',
          ratio: '4:3',
          cover: 'linear-gradient(135deg, #dfe6ff, #f6e7ff)',
          versions: [],
        },
      }),
    })
    if (!response.ok) throw new Error(`创建失败 HTTP ${response.status}`)
    const payload = await response.json()
    return payload.document?.id || payload.id || ''
  }, TEMP_TITLE)
}

async function countServerDocuments(page, title) {
  return page.evaluate(async (needle) => {
    const response = await fetch('/api/me/documents?type=project', { credentials: 'include' })
    if (!response.ok) return -1
    const payload = await response.json()
    return (payload.documents || []).filter((doc) => String(doc.title || doc.data?.title || '').includes(needle)).length
  }, title)
}
