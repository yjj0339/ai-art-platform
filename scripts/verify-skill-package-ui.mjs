// 技能包「行式列表 + 分类表 + 批量管理 + 学生端分类标签」界面验收。
//
// 覆盖：
//  ① 后台进入技能包列表，标题/工具条/行式列表结构正确
//  ② 分类下拉：创建分类（原位出 input）→ 改名（✓）→ 删除（×），未分类不可删不可改名
//  ③ 一个 zip 里两个 SKILL.md → 导入 2 条（曾经只导第 1 条）
//  ④ 归分类：编辑信息弹窗里选分类 → 列表 cat-tag 跟着变
//  ⑤ 批量改名：加前缀 + 查找替换，预览与结果一致
//  ⑥ 批量上下线：未转玩法应被 skipped 并给出原因
//  ⑦ 转成玩法 → 学生端「技能玩法」出现分类标签，点标签只筛卡不跳页
//
// 全程零花费：不调 /test 真实出图，发布前用 PATCH 直接补 runtime.testedAt。
// 只造自己的数据（标题带「验收」+ 时间戳），跑完按 id 精确清理。
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
// jszip 从项目 node_modules 取，用同样的压缩方式造一个含两个 SKILL.md 的 zip
const JSZip = createRequire(path.join(process.cwd(), 'package.json'))('jszip')

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// el-dropdown 的菜单项会残留在 DOM 里（旧的那份 display:none），
// 直接 .first() 会点到隐藏项并一直等它可见。只点真正可见的那一个。
async function clickVisibleMenuItem(page, text) {
  const items = page.locator('.el-dropdown-menu__item', { hasText: text })
  const count = await items.count()
  for (let i = 0; i < count; i += 1) {
    const item = items.nth(i)
    if (await item.isVisible().catch(() => false)) {
      await item.click()
      return true
    }
  }
  throw new Error(`没找到可见的下拉项「${text}」（共 ${count} 个候选，全部隐藏）`)
}

const results = []
const failures = []
function check(name, ok, detail) {
  results.push({ name, pass: Boolean(ok), detail })
  // 注意：JSON.stringify(undefined) 返回 undefined，直接 .slice 会崩，这里先兜成字符串。
  if (!ok) failures.push(`${name} :: ${String(JSON.stringify(detail) ?? '')}`.slice(0, 300))
  const shown = detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail) ?? '')
  console.log(`${ok ? '✅' : '❌'} ${name}${shown ? ` — ${shown.slice(0, 200)}` : ''}`)
}

const STAMP = Date.now().toString(36).slice(-5)
const CAT_NEW = `验收分类${STAMP}`
const CAT_RENAMED = `${CAT_NEW}改`
const PACK_A = `验收包A${STAMP}`
const PACK_B = `验收包B${STAMP}`
const PREFIX = '【验】'

function skillMd(displayName, key) {
  return `---
name: verify-${key}
display_name: ${displayName}
description: 验收技能包导入链路的临时技能
description_zh: 验收技能包导入链路的临时技能，跑完就删
version: 1.0.0
author: 验收脚本
tags: [验收, 海报]
examples_zh:
  - 一张儿童美术活动宣传海报，紫色主视觉，大标题居中，极简留白
  - 一张国风插画海报，水墨晕染背景，竖排标题
---

# ${displayName}

## 使用说明

提示词：一张活动宣传海报，主体是{{subject}}，大标题居中，暖色调，印刷质感

## 注意

不要发送任何脚本命令。
`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  // 一个 zip 里放两个技能包，各自带 SKILL.md —— 专门验「多包只导第 1 个」的老 bug
  const zip = new JSZip()
  zip.file(`packA/SKILL.md`, skillMd(PACK_A, `a-${STAMP}`))
  zip.file(`packB/SKILL.md`, skillMd(PACK_B, `b-${STAMP}`))
  const zipPath = path.join(OUT_DIR, `verify-packages-${STAMP}.zip`)
  await writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }))

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  const failedRequests = []
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })

  let createdCategoryId = ''
  const createdPackageIds = []
  let convertedSkillId = ''

  try {
    /* ---------- 登录管理员 ---------- */
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.evaluate(async () => {
      await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
      })
    })
    await delay(600)

    await page.goto(`${BASE}/admin?module=featureManagement&type=image`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.skill-subnav', { timeout: 30000 })
    await delay(1500)

    const packageTab = page.locator('.skill-subnav button', { hasText: '技能包' })
    check('玩法中心出现「技能包」tab', await packageTab.count() > 0)
    await packageTab.first().click()
    await delay(1800)

    /* ---------- ① 页面结构 ---------- */
    check('进入技能包列表面板', await page.locator('.package-page').count() > 0)
    const headerText = (await page.locator('.package-header h2').first().textContent().catch(() => '')) || ''
    check('标题已改为「技能包列表」', headerText.includes('技能包列表'), headerText.trim())
    check('工具条含分类按钮', await page.locator('.toolbar .tool-btn', { hasText: '分类' }).count() > 0)
    check('工具条含批量管理按钮', await page.locator('.toolbar .tool-btn', { hasText: '批量管理' }).count() > 0)
    check('上传按钮在工具条里（不是页头）', await page.locator('.toolbar .upload-group input[type="file"]').count() >= 2)
    await page.screenshot({ path: path.join(OUT_DIR, 'pkg-01-list.png'), fullPage: true })

    /* ---------- ② 分类下拉：创建 / 改名 / 删除 ---------- */
    await page.locator('.toolbar .tool-btn', { hasText: '分类' }).first().click()
    await delay(600)
    check('分类下拉展开', await page.locator('.cat-panel').count() > 0)
    check('第一项是「创建分类」', await page.locator('.cat-panel .cat-create').count() > 0)

    // 创建：点「创建分类」→ 原位出 input
    await page.locator('.cat-panel .cat-create').first().click()
    await delay(400)
    const createInput = page.locator('.cat-panel .cat-row.editing input')
    check('点「创建分类」后原位出现输入框', await createInput.count() > 0)
    await createInput.first().fill(CAT_NEW)
    await page.screenshot({ path: path.join(OUT_DIR, 'pkg-02-create-category.png'), fullPage: true })
    await page.locator('.cat-panel .cat-row.editing .cat-icon.ok').first().click()
    await delay(1500)

    const catRow = page.locator('.cat-panel .cat-row', { hasText: CAT_NEW })
    check('新分类出现在分类列表里', await catRow.count() > 0, CAT_NEW)
    const defaultRow = page.locator('.cat-panel .cat-row', { hasText: '未分类' }).first()
    const defaultRenameDisabled = await defaultRow.locator('.cat-icon.ok').first().isDisabled().catch(() => null)
    const defaultDeleteDisabled = await defaultRow.locator('.cat-icon').last().isDisabled().catch(() => null)
    check('「未分类」的改名/删除按钮被禁用', defaultRenameDisabled === true && defaultDeleteDisabled === true, { defaultRenameDisabled, defaultDeleteDisabled })

    // 取到分类 id 备用（清理用）
    createdCategoryId = await page.evaluate(async (name) => {
      const res = await fetch('/api/admin/ai-skill-package-categories')
      const json = await res.json()
      return (json.categories || []).find((item) => item.name === name)?.id || ''
    }, CAT_NEW)
    check('分类已落库（接口能查到）', Boolean(createdCategoryId), createdCategoryId)

    // 改名：点该分类的 ✓
    await catRow.first().locator('.cat-icon.ok').click()
    await delay(400)
    const renameInput = page.locator('.cat-panel .cat-row.editing input')
    check('点 ✓ 后该分类原位变成输入框', await renameInput.count() > 0)
    await renameInput.first().fill(CAT_RENAMED)
    await page.locator('.cat-panel .cat-row.editing .cat-icon.ok').first().click()
    await delay(1500)
    check('分类改名生效', await page.locator('.cat-panel .cat-row', { hasText: CAT_RENAMED }).count() > 0, CAT_RENAMED)
    await page.screenshot({ path: path.join(OUT_DIR, 'pkg-03-category-panel.png'), fullPage: true })

    // 关掉下拉
    await page.locator('.package-header h2').first().click()
    await delay(500)

    /* ---------- ③ 导入一个含两个 SKILL.md 的 zip ---------- */
    await page.setInputFiles('.toolbar .upload-group input[type="file"]', zipPath)
    await delay(4000)
    const rowA = page.locator('.list-row', { hasText: PACK_A })
    const rowB = page.locator('.list-row', { hasText: PACK_B })
    check('zip 内第 1 个 SKILL.md 导入成功', await rowA.count() > 0, PACK_A)
    check('zip 内第 2 个 SKILL.md 也导入成功（老 bug 回归）', await rowB.count() > 0, PACK_B)
    check('列表是行式结构（有 list-head 表头）', await page.locator('.package-list .list-head').count() > 0)

    const idsInApi = await page.evaluate(async (titles) => {
      const res = await fetch('/api/admin/ai-skill-packages')
      const json = await res.json()
      return (json.packages || []).filter((item) => titles.includes(item.title)).map((item) => item.id)
    }, [PACK_A, PACK_B])
    createdPackageIds.push(...idsInApi)

    // 新导入的包默认应落在「未分类」
    const catTagA = (await rowA.first().locator('.cat-tag').textContent().catch(() => '')) || ''
    check('新导入的包默认归「未分类」', catTagA.includes('未分类'), catTagA.trim())
    await page.screenshot({ path: path.join(OUT_DIR, 'pkg-04-rows.png'), fullPage: true })

    /* ---------- ④ 归分类：编辑信息弹窗 ---------- */
    await rowA.first().locator('.col-more .icon-button').click()
    await delay(600)
    await clickVisibleMenuItem(page, '编辑信息')
    await delay(1200)
    const editDialog = page.locator('.el-dialog', { hasText: '编辑技能包信息' })
    check('打开「编辑技能包信息」弹窗', await editDialog.count() > 0)
    const catSelect = editDialog.locator('select')
    check('弹窗里有分类下拉', await catSelect.count() > 0)
    await catSelect.first().selectOption({ label: CAT_RENAMED })
    await delay(300)
    await editDialog.locator('.el-dialog__footer button', { hasText: '保存' }).last().click()
    await delay(2500)

    const catTagAfter = (await page.locator('.list-row', { hasText: PACK_A }).first().locator('.cat-tag').textContent().catch(() => '')) || ''
    check('归分类后列表 cat-tag 变成新分类', catTagAfter.includes(CAT_RENAMED), catTagAfter.trim())
    await page.screenshot({ path: path.join(OUT_DIR, 'pkg-05-categorized.png'), fullPage: true })

    // 按分类筛选：只剩 A
    await page.locator('.toolbar .tool-btn', { hasText: '分类' }).first().click()
    await delay(500)
    await page.locator('.cat-panel .cat-row', { hasText: CAT_RENAMED }).first().locator('.cat-name').click()
    await delay(1800)
    const filteredHasA = await page.locator('.list-row', { hasText: PACK_A }).count()
    const filteredHasB = await page.locator('.list-row', { hasText: PACK_B }).count()
    check('按分类筛选只显示该分类的包', filteredHasA > 0 && filteredHasB === 0, { filteredHasA, filteredHasB })

    // 回全部
    await page.locator('.toolbar .tool-btn', { hasText: '分类' }).first().click()
    await delay(500)
    await page.locator('.cat-panel .cat-row').first().locator('.cat-name').click()
    await delay(1800)

    /* ---------- ⑤ 批量改名 ---------- */
    await page.locator('.toolbar .tool-btn', { hasText: '批量管理' }).first().click()
    await delay(600)
    await clickVisibleMenuItem(page, '批量改名')
    await delay(800)
    check('进入批量模式并出现批量操作条', await page.locator('.bulk-bar').count() > 0)

    // 只勾自己那两个包，绝不「全选」（历史事故：曾把真实数据全删）
    await page.locator('.list-row', { hasText: PACK_A }).first().locator('.col-check input').check()
    await page.locator('.list-row', { hasText: PACK_B }).first().locator('.col-check input').check()
    await delay(400)
    const selectedText = (await page.locator('.bulk-bar').first().textContent()) || ''
    check('已选数量为 2（未误选其它记录）', /已选\s*2\s*个/.test(selectedText.replace(/\s+/g, ' ')) || selectedText.includes('已选 2'), selectedText.replace(/\s+/g, ' ').slice(0, 60))

    await page.locator('.bulk-bar button', { hasText: '批量改名' }).click()
    await delay(1000)
    const renameDialog = page.locator('.el-dialog', { hasText: '批量改名' })
    check('打开批量改名弹窗', await renameDialog.count() > 0)

    await renameDialog.locator('input').nth(0).fill(PREFIX)      // 前缀
    await renameDialog.locator('input').nth(2).fill('验收包')      // 查找
    await renameDialog.locator('input').nth(3).fill('批量包')      // 替换
    await delay(700)
    const previewText = (await renameDialog.locator('.rename-preview').textContent().catch(() => '')) || ''
    check('改名预览显示替换+前缀结果', previewText.includes(`${PREFIX}批量包A`), previewText.replace(/\s+/g, ' ').slice(0, 120))
    await page.screenshot({ path: path.join(OUT_DIR, 'pkg-06-rename.png'), fullPage: true })

    await renameDialog.locator('.el-dialog__footer button', { hasText: '确认改名' }).click()
    await delay(3000)
    check('批量改名后 A 出现在列表', await page.locator('.list-row', { hasText: `${PREFIX}批量包A${STAMP}` }).count() > 0, `${PREFIX}批量包A${STAMP}`)
    check('批量改名后 B 出现在列表', await page.locator('.list-row', { hasText: `${PREFIX}批量包B${STAMP}` }).count() > 0, `${PREFIX}批量包B${STAMP}`)

    /* ---------- ⑥ 批量上下线：未转玩法应被跳过 ---------- */
    await page.locator('.bulk-bar button', { hasText: '批量上下线' }).click()
    await delay(1000)
    const visDialog = page.locator('.el-dialog', { hasText: '批量上下线' })
    check('打开批量上下线弹窗', await visDialog.count() > 0)
    await visDialog.locator('.type-switch button', { hasText: '上线' }).first().click()
    await delay(300)
    await visDialog.locator('.el-dialog__footer button', { hasText: '确认' }).click()
    await delay(2500)
    const warnText = (await page.locator('.el-message').first().textContent().catch(() => '')) || ''
    check('未转玩法上线被拦下并说明原因', /还没转成玩法/.test(warnText), warnText.trim().slice(0, 80))
    await page.screenshot({ path: path.join(OUT_DIR, 'pkg-07-visibility.png'), fullPage: true })

    // 退出批量
    await page.locator('.bulk-bar button', { hasText: '退出批量' }).click()
    await delay(600)

    /* ---------- ⑦ 转成玩法 → 发布 → 学生端分类标签 ---------- */
    await page.locator('.list-row', { hasText: `${PREFIX}批量包A${STAMP}` }).first().locator('.col-more .icon-button').click()
    await delay(600)
    await clickVisibleMenuItem(page, '转成玩法')
    await delay(1500)
    const convertDialog = page.locator('.el-dialog', { hasText: '把技能包转成玩法' })
    check('打开「转成玩法」弹窗', await convertDialog.count() > 0)
    const promptBox = convertDialog.locator('.prompt-input')
    check('转玩法弹窗有生成提示词框', await promptBox.count() > 0)
    const promptValue = await promptBox.first().inputValue().catch(() => '')
    check('提示词框默认带入候选内容', promptValue.length > 0, promptValue.slice(0, 50))
    await promptBox.first().fill('一张活动宣传海报，主体是{{subject}}，大标题居中，紫色主视觉，极简留白，高清印刷质感')
    await delay(300)
    await convertDialog.locator('.el-dialog__footer button', { hasText: '生成草稿玩法' }).click()
    await delay(4500)
    const confirmBox = page.locator('.el-message-box')
    if (await confirmBox.count()) {
      const laterBtn = confirmBox.locator('button', { hasText: '稍后再说' })
      if (await laterBtn.count()) await laterBtn.click()
      await delay(800)
    }

    // 零花费发布：PATCH 补 runtime.testedAt，再 publish（不调 /test 真实出图）
    const publishInfo = await page.evaluate(async (title) => {
      const listRes = await fetch('/api/admin/ai-skills')
      const listJson = await listRes.json()
      const hit = (listJson.skills || []).find((item) => item.title === title)
      if (!hit) return { error: '没找到转出来的玩法' }
      const cfg = hit.draftConfiguration || hit.configuration || {}
      const runtime = { ...(cfg.runtime || {}), testedAt: new Date().toISOString() }
      const nextCfg = { ...cfg, runtime }
      const patchRes = await fetch(`/api/admin/ai-skills/${hit.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: nextCfg, draftConfiguration: nextCfg }),
      })
      if (!patchRes.ok) return { error: `PATCH ${patchRes.status}` }
      const pubRes = await fetch(`/api/admin/ai-skills/${hit.id}/publish`, { method: 'POST' })
      return { id: hit.id, status: pubRes.status, categoryId: hit.categoryId || hit.category_id || '' }
    }, `${PREFIX}批量包A${STAMP}`)
    check('零花费把玩法发布出去', publishInfo.status === 200, JSON.stringify(publishInfo).slice(0, 160))
    convertedSkillId = publishInfo.id || ''
    check('玩法卡带上了技能包的分类', Boolean(publishInfo.categoryId), publishInfo.categoryId)

    /* ---------- 学生端分类标签 ---------- */
    const studentPage = await context.newPage()
    const studentErrors = []
    studentPage.on('pageerror', (error) => studentErrors.push(error.message))
    await studentPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    // 先清掉管理员会话，再以学生登录
    await studentPage.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
      localStorage.setItem('art-studio-difficulty', 'pro')
      // 「上次没做完的作品」浮层会挡住侧栏，先标记掉
      localStorage.setItem('art-studio-resume-dismissed', '1')
    })
    await studentPage.evaluate(async () => {
      await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
      })
    })
    await delay(800)
    await studentPage.goto(`${BASE}/student/paint`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await delay(4000)
    // 关掉可能存在的「继续上次作品」浮层
    for (const text of ['不用了', '重新开始', '关闭']) {
      const btn = studentPage.locator('button', { hasText: text })
      if (await btn.count()) { await btn.first().click().catch(() => {}); await delay(600); break }
    }
    await delay(1200)

    const chipCount = await studentPage.locator('.workflow-category-chip').count()
    check('学生端「技能玩法」出现分类标签', chipCount > 1, `${chipCount} 个标签`)
    const chipNames = await studentPage.locator('.workflow-category-chip').allTextContents()
    check('标签里有「全部」', chipNames.some((text) => text.includes('全部')), chipNames.join(' | '))
    check('标签里有验收分类', chipNames.some((text) => text.includes(CAT_RENAMED)), chipNames.join(' | '))

    const cardsBefore = await studentPage.locator('.paint-skill-card').count()
    const targetChip = studentPage.locator('.workflow-category-chip', { hasText: CAT_RENAMED })
    await targetChip.first().click()
    await delay(1200)
    const cardsAfter = await studentPage.locator('.paint-skill-card').count()
    check('点分类标签后只筛卡不跳页', studentPage.url().includes('/student/paint'), studentPage.url())
    check('点分类标签后卡片数变化（筛选生效）', cardsAfter > 0 && cardsAfter <= cardsBefore, { cardsBefore, cardsAfter })
    const visibleTitles = await studentPage.locator('.paint-skill-card strong').allTextContents()
    check('筛出来的卡里有验收玩法', visibleTitles.some((text) => text.includes('批量包A')), visibleTitles.join(' | ').slice(0, 120))
    await studentPage.screenshot({ path: path.join(OUT_DIR, 'pkg-08-student-category.png'), fullPage: true })

    // 回到「全部」
    await studentPage.locator('.workflow-category-chip', { hasText: '全部' }).first().click()
    await delay(1000)
    const cardsAll = await studentPage.locator('.paint-skill-card').count()
    check('点「全部」后卡片恢复', cardsAll >= cardsAfter, { cardsAfter, cardsAll })
    await studentPage.close()

    /* ---------- 控制台与接口健康度 ---------- */
    const realConsoleErrors = consoleErrors.filter((text) => !/401 \(Unauthorized\)/.test(text))
    check('浏览器控制台无报错', realConsoleErrors.length === 0, realConsoleErrors.slice(0, 2).join(' | '))
    const realFailures = failedRequests.filter((item) => !/^401 \/api\/auth\/me$/.test(item))
    check('登录后没有接口报错', realFailures.length === 0, realFailures.slice(0, 4).join(' | '))
  } catch (error) {
    check('验收流程未中断', false, `${error.message}`)
    console.log('出错位置：\n' + String(error.stack || '').split('\n').slice(0, 6).join('\n'))
    await page.screenshot({ path: path.join(OUT_DIR, 'pkg-error.png'), fullPage: true }).catch(() => {})
  } finally {
    /* ---------- 清理：只删本次造的数据 ---------- */
    try {
      const api = context.request
      // 学生端那段调过 /api/auth/logout，管理员会话已被清掉，
      // 不重新登录的话下面所有 /api/admin/* 都会 403，清理会静默失败（曾经真的漏了数据）。
      await api.post(`${BASE}/api/auth/login`, {
        data: { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' },
      })
      if (convertedSkillId) {
        await api.delete(`${BASE}/api/admin/ai-skills/${convertedSkillId}`).catch(() => {})
      }
      const listRes = await api.get(`${BASE}/api/admin/ai-skill-packages`)
      const listJson = await listRes.json()
      const mine = (listJson.packages || []).filter((item) => String(item.title || '').includes(STAMP))
      for (const item of mine) {
        if (item.convertedSkillId) await api.delete(`${BASE}/api/admin/ai-skills/${item.convertedSkillId}`).catch(() => {})
      }
      if (mine.length) {
        await api.post(`${BASE}/api/admin/ai-skill-packages/bulk`, { data: { action: 'delete', ids: mine.map((item) => item.id) } })
      }
      if (createdCategoryId) {
        await api.delete(`${BASE}/api/admin/ai-skill-package-categories/${createdCategoryId}`).catch(() => {})
      }
      // 复查：清理后不该再有带本次 STAMP 的包，否则明确报出来，别假装干净。
      const after = await api.get(`${BASE}/api/admin/ai-skill-packages`)
      const afterJson = await after.json()
      const rest = (afterJson.packages || []).filter((item) => String(item.title || '').includes(STAMP))
      if (rest.length) console.log(`⚠️ 清理后仍有 ${rest.length} 条残留：${rest.map((item) => item.title).join('、')}`)
      console.log(`— 已清理 ${mine.length} 个技能包、1 个分类、${convertedSkillId ? 1 : 0} 个玩法 —`)
    } catch (error) {
      console.log('清理时出错（需手工检查）：', error.message)
    }
    await browser.close()
  }

  const passed = results.filter((item) => item.pass).length
  console.log(`\n结果：${passed}/${results.length} 通过`)
  if (failures.length) { console.log('失败项：'); failures.forEach((item) => console.log('  ' + item)) }
  process.exit(failures.length ? 1 : 0)
}

main()
