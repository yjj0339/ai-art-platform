/**
 * 验证 H5 报告生成页（高级创作报告）的两处改动：
 *
 * 1. 智能体只剩一个——右下角真实人物（.sa-dock），左下角「小画同学」假卡片（.ar-guide）已删除；
 * 2. 素材栏能「换项目」——素材来自哪个项目由学生自己定，不再静默抓最近一个有图的项目。
 *
 * 零花费：所有出图 / 智能体接口一律 abort，只看界面与状态。
 * 用户数据安全：切换项目那一段用「自己新建的临时项目」来验，跑完立刻删掉，不碰学生的真实作品。
 *
 * 用法：node scripts/verify-h5-report-material-source.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const base = 'http://127.0.0.1:5173'
const route = '/student/h5-report'
const shotDir = 'docs/mockups/shots'

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// 阻止一切真实出图 / 智能体 / 付费请求
await page.route('**/api/student/agent/understand', (r) => r.abort())
await page.route('**/api/**/generate**', (r) => r.abort())
await page.route('**/api/**/workflow**run**', (r) => r.abort())

// ---- 登录（学生账号） ----
await page.goto(`${base}/login?redirect=${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
const inputs = page.locator('.el-input__inner')
await inputs.nth(0).fill('ceshi2')
await inputs.nth(1).fill('demo-school')
await inputs.nth(2).fill('123456789')
await page.getByRole('button', { name: /进入学生工作台/ }).click()
await page.waitForTimeout(3000)

// 报告版本 = 高级版（pro），与页面自身的难度判定对齐
await page.evaluate(() => localStorage.setItem('art-studio-difficulty', 'pro'))

// ---- 先造一个临时的同版本项目（跑完删掉），这样才能验「真的换过去」 ----
const stamp = Date.now()
const tempProjectId = `p-verify-${stamp}`
const tempTitle = `临时素材验证项目 ${stamp}`
const created = await page.evaluate(async ({ id, title }) => {
  const data = {
    id,
    title,
    difficulty: 'pro',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    // 一张 1×1 透明 PNG 当素材，够触发「这个项目有素材」
    versions: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='],
  }
  const r = await fetch('/api/me/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ type: 'project', resourceKey: id, title, data }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}, { id: tempProjectId, title: tempTitle })
const tempDocId = created.body?.document?.id || ''
console.log(`临时项目创建：HTTP ${created.status}，文档 ${tempDocId || '(无)'}\n`)

await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await page.evaluate(() => document.querySelectorAll('.el-message, .el-notification').forEach((n) => n.remove()))

// 关掉可能存在的引导弹窗，别挡住素材栏
for (let i = 0; i < 4; i += 1) {
  const overlay = page.locator('.el-overlay').first()
  if (!(await overlay.count())) break
  const closer = page
    .locator('.el-dialog__headerbtn, .el-overlay-dialog button:has-text("取消"), .el-overlay-dialog button:has-text("不要了"), .el-overlay-dialog button:has-text("以后再说")')
    .first()
  if (await closer.count()) await closer.click({ force: true }).catch(() => {})
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}
if (await page.locator('.el-overlay').count()) {
  await page.evaluate(() => document.querySelectorAll('.el-overlay').forEach((n) => n.remove()))
  await page.waitForTimeout(300)
}

// ---- ① 智能体只有一个 ----
check(await page.locator('.advanced-report-page').count() > 0, '报告生成页已加载')
check(await page.locator('.ar-guide').count() === 0, '左下「小画同学」假卡片已不存在（.ar-guide = 0）')
check(await page.locator('.sa-dock').count() === 1, '页面上只剩一个智能体入口（.sa-dock = 1）', `实际 ${await page.locator('.sa-dock').count()} 个`)
check(await page.locator('.ar-guide-compose, .ar-agent-switch').count() === 0, '假卡片的输入框 / 开关也没有残留')
check(await page.locator('.sa-dock .sa-figure-btn').count() === 1, '右下角真实人物可点（.sa-figure-btn 存在）')

// 人物不能压住左栏素材区（曾贴在屏幕左下 x14-106，正好盖住「这些图会怎么用」提示块）
const overlap = await page.evaluate(() => {
  const box = (sel) => {
    const n = document.querySelector(sel)
    if (!n) return null
    const b = n.getBoundingClientRect()
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width }
  }
  const hit = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  const dock = box('.sa-dock')
  const tips = box('.ar-tips')
  const thumbs = box('.ar-left-body')
  const acts = box('.ar-acts')
  return {
    dock,
    coversTips: hit(dock, tips),
    coversThumbs: hit(dock, thumbs),
    coversActs: hit(dock, acts),
    onRightHalf: !!dock && dock.left > innerWidth / 2,
  }
})
check(!overlap.coversTips, '人物不压「这些图会怎么用」提示块', JSON.stringify(overlap.dock))
check(!overlap.coversThumbs, '人物不压素材缩略图区')
check(!overlap.coversActs, '人物不压「预览 / 生成 H5 报告」按钮')
check(overlap.onRightHalf, '人物在屏幕右半边（用户选的「右下人物」）', `left=${Math.round(overlap.dock?.left)}`)

// ---- ② 素材栏的「换项目」 ----
const srcText = await page.locator('.ar-src').innerText().catch(() => '')
check(!!srcText.trim(), '素材栏写着素材来自哪个项目', srcText.trim().replace(/\n/g, ' / '))
// 项目名不能被操作提示挤掉（曾整行省略，学生看不到「来自哪个项目」）
const srcParts = await page.evaluate(() => {
  const n = document.querySelector('.ar-src')
  if (!n) return null
  const b = n.querySelector('b')
  return b ? { name: b.textContent.trim(), clipped: b.scrollWidth > b.clientWidth + 1 } : null
})
check(!!srcParts && /「.+」/.test(srcParts.name), '项目名单独占一行、完整可读', srcParts?.name || '')
check(srcParts && !srcParts.clipped, '项目名没有被省略号截断', srcParts?.clipped ? '被截断了' : '完整')
const switcher = page.locator('.ar-src-switch').first()
check(await switcher.count() === 1, '有「换项目」按钮', await switcher.innerText().catch(() => ''))
check(await page.locator('.ar-proj-list').count() === 0, '默认收起，不占地方')
await page.screenshot({ path: `${shotDir}/report-material-source-1-collapsed.png` })

const totalText = await page.locator('.ar-panel-h em').first().innerText().catch(() => '')
const thumbsBefore = await page.locator('.ar-th').count()

await switcher.click()
await page.waitForTimeout(700)
check(await page.locator('.ar-proj-list').count() === 1, '点「换项目」展开项目列表')
check((await switcher.innerText()).trim() === '收起', '按钮文字变成「收起」')

const options = await page.locator('.ar-proj').evaluateAll((nodes) =>
  nodes.map((n) => ({
    title: n.querySelector('.ar-proj-copy b')?.textContent?.trim() || '',
    meta: n.querySelector('.ar-proj-copy em')?.textContent?.trim() || '',
    on: n.classList.contains('on'),
  })),
)
console.log('\n可选项目：')
options.forEach((o, i) => console.log(`  ${i + 1}. ${o.title}  [${o.meta}]${o.on ? '  ← 当前' : ''}`))
console.log(`\n当前素材：${totalText}；缩略图 ${thumbsBefore} 个\n`)

check(options.length >= 2, '列表里列出了多个可选项目', `${options.length} 个`)
check(options.filter((o) => o.on).length === 1, '当前项目被标出来（✓ 高亮只有一个）')
check(await page.locator('.ar-proj.on i').count() === 1, '当前项目右侧显示 ✓')
check(options.some((o) => o.title === tempTitle), '临时项目出现在列表里（说明能读到 project 文档）')
check(options.every((o) => /张素材/.test(o.meta)), '每张卡都写明有几张素材', options[0]?.meta || '')
await page.screenshot({ path: `${shotDir}/report-material-source-2-picker.png` })

// ---- ③ 真的切过去 ----
const target = page.locator('.ar-proj', { hasText: tempTitle }).first()
if (await target.count()) {
  await target.click()
  await page.waitForTimeout(900)

  // 换项目会清空叙事框，有内容时会弹确认——点「我保存好了，换」
  const confirmBtn = page.locator('.el-message-box__btns button:has-text("我保存好了")').first()
  if (await confirmBtn.count()) {
    await confirmBtn.click({ force: true })
    await page.waitForTimeout(900)
  }

  const srcAfter = await page.locator('.ar-src').innerText().catch(() => '')
  const totalAfter = await page.locator('.ar-panel-h em').first().innerText().catch(() => '')
  const thumbsAfter = await page.locator('.ar-th').count()
  const titleAfter = await page.locator('.report-title input, input[placeholder*="报告"], .ar-title input').first().inputValue().catch(() => '')
  console.log(`\n换到「${tempTitle}」后：\n  来源行 = ${srcAfter.trim()}\n  素材 = ${totalAfter}，缩略图 ${thumbsAfter} 个\n  报告标题 = ${titleAfter || '(未取到)'}\n`)

  check(srcAfter.includes(tempTitle), '「来自…」跟着换成了新项目', srcAfter.trim())
  check(thumbsAfter === 1, '素材缩略图按新项目重新算（临时项目只有 1 张）', `${thumbsBefore} → ${thumbsAfter}`)
  check(await page.locator('.ar-proj-list').count() === 0, '换完自动收起列表')
  check((await page.locator('.ar-src-switch').innerText()).trim() === '换项目', '按钮文字恢复「换项目」')
  check(await page.locator('.ar-th.is-off').count() === 0, '换项目后勾选状态被重置（新素材全部参与，不带上一项的取消勾选）')
  if (titleAfter) check(titleAfter.includes(tempTitle), '报告标题跟着换', titleAfter)
  await page.screenshot({ path: `${shotDir}/report-material-source-3-switched.png` })

  // ---- ④ 再展开，确认「当前项目」的勾现在落在临时项目上 ----
  await page.locator('.ar-src-switch').first().click()
  await page.waitForTimeout(600)
  const onTitle = await page.locator('.ar-proj.on .ar-proj-copy b').innerText().catch(() => '')
  check(onTitle.trim() === tempTitle, '再展开时 ✓ 落在刚换过去的新项目上', onTitle.trim())
  await page.screenshot({ path: `${shotDir}/report-material-source-4-reopened.png` })
} else {
  check(false, '列表里找不到临时项目，无法验证切换')
}

// ---- 清理临时项目，绝不留脏数据 ----
if (tempDocId) {
  const del = await page.evaluate(async (docId) => {
    const r = await fetch(`/api/me/documents/${encodeURIComponent(docId)}`, { method: 'DELETE', credentials: 'include' })
    return r.status
  }, tempDocId)
  console.log(`\n临时项目已删除：HTTP ${del}`)
  check(del === 200 || del === 204, '临时项目清理成功', `HTTP ${del}`)
}

console.log(fails.length ? `\n✗ ${fails.length} 项未通过：\n  - ${fails.join('\n  - ')}` : '\n✓ 全部通过')
await browser.close()
process.exit(fails.length ? 1 : 0)
