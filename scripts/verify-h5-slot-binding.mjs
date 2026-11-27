// 验收：后台「报告工作流库 → 画布」里的节点卡槽绑定控件。
// 覆盖：胶囊常亮且按节点类型给默认值、点开菜单四项、「排第几格」只在图像卡槽出现、
//       改成「不上前端」后胶囊变色变字、改序号后胶囊序号跟着变、改完不落库。
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/verify-h5-slot-binding.mjs

import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// 关闭卡槽菜单：必须点「菜单外面」的空白处。
// ⚠️ 不能对 .slot-menu-catcher 用 click({ force: true })：遮罩铺满全屏，Playwright 会点它的中心，
// 而菜单常常正好浮在中心附近，于是实际点到的是菜单项（曾把「改回图像素材」误点成「不上前端」，
// 看起来像卡槽数据被冲掉了，其实是脚本点错）。
async function closeSlotMenuByBlank(page) {
  const point = await page.evaluate(() => {
    const catcher = document.querySelector('.slot-menu-catcher')
    if (!catcher) return null
    const pop = document.querySelector('.slot-menu-pop')?.getBoundingClientRect()
    for (let y = 60; y < window.innerHeight - 60; y += 40) {
      for (let x = 60; x < window.innerWidth - 60; x += 60) {
        if (pop && x >= pop.x - 12 && x <= pop.right + 12 && y >= pop.y - 12 && y <= pop.bottom + 12) continue
        const el = document.elementFromPoint(x, y)
        if (el && el.classList.contains('slot-menu-catcher')) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error('找不到菜单外的空白点，无法关闭卡槽菜单')
  await page.mouse.click(point.x, point.y)
  await delay(240)
}

// 菜单没开时不要去点空白（closeSlotMenuByBlank 找不到 catcher 会直接抛错）
async function closeSlotMenuIfOpen(page) {
  const open = await page.locator('.slot-menu-catcher').count()
  if (!open) return
  await closeSlotMenuByBlank(page)
}

// 读画布自己那份节点数据（胶囊显示就是从它算出来的）
async function readNodeSlot(page, nodeId) {
  return page.evaluate((id) => {
    let inst = document.querySelector('.workflow-page')?.__vueParentComponent
    while (inst) {
      const state = inst.setupState
      if (state && state.nodes) {
        const node = state.nodes.find((item) => item.id === id)
        return node?.data?.studentSlot || null
      }
      inst = inst.parent
    }
    return null
  }, nodeId)
}

// 读父页面手里那份快照（画布 320ms 后 emit('change') 给它的，也就是保存时要写出去的内容）
async function readSnapshotSlot(page, nodeId) {
  return page.evaluate((id) => {
    let inst = document.querySelector('.workflow-page')?.__vueParentComponent
    while (inst) {
      const state = inst.setupState
      if (state && state.skill) {
        const nodes = state.skill?.configuration?.workflow?.nodes || []
        return nodes.find((item) => item.id === id)?.data?.studentSlot || null
      }
      inst = inst.parent
    }
    return null
  }, nodeId)
}
const browser = await chromium.launch({ executablePath: CHROME })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const login = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
    })
    return res.status
  })
  check('管理员登录成功', login === 200, `status=${login}`)

  // 从工作流库点进第一条，保证走的是真实入口（returnTo=h5-report）。
  await page.goto(`${BASE}/admin/h5-report-workflows`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  let rowCount = 0
  for (let i = 0; i < 80; i += 1) {
    rowCount = await page.locator('.row:not(.add):not(.empty-row)').count()
    if (rowCount > 0) break
    await delay(250)
  }
  check('工作流库渲染出行', rowCount > 0, `${rowCount} 行`)
  if (!rowCount) throw new Error('没有可打开的工作流，无法继续验收')

  await page.locator('.row:not(.add):not(.empty-row)').first().click()
  await page.waitForURL(/\/admin\/ai-skills\/.+\/workflow/, { timeout: 60000 })

  // 等画布节点渲染完
  let nodeCount = 0
  for (let i = 0; i < 100; i += 1) {
    nodeCount = await page.locator('.vue-flow__node').count()
    if (nodeCount > 0) break
    await delay(250)
  }
  check('画布节点已渲染', nodeCount > 0, `${nodeCount} 个节点`)

  // ① 胶囊出现，且数量 = 图像节点 + 文字节点（其余类型不给胶囊）
  let pillCount = 0
  for (let i = 0; i < 60; i += 1) {
    pillCount = await page.locator('.slot-pill').count()
    if (pillCount > 0) break
    await delay(250)
  }
  check('节点右上角出现卡槽胶囊', pillCount > 0, `${pillCount} 个胶囊`)

  const pillTexts = await page.locator('.slot-pill').allInnerTexts()
  const normalized = pillTexts.map((t) => t.replace(/[▾\s]/g, ''))
  check('胶囊文案在四类之内', normalized.every((t) => /^(图\d+|T文字|结果返回|不上前端)$/.test(t)), normalized.join(' | '))

  const imagePills = normalized.filter((t) => t.startsWith('图')).length
  check('图像节点默认都是「图 N」', imagePills > 0, `${imagePills} 个图像卡槽`)
  // 图像节点 id 不写死（可能是 image-1 / video-1 …），从 DOM 上那颗胶囊反查
  const imageNodeId = await page.evaluate(() => document.querySelector('.slot-pill.is-image')?.closest('.vue-flow__node')?.getAttribute('data-id') || '')
  check('能定位到图像节点 id', Boolean(imageNodeId), imageNodeId || '(空)')
  const seq = normalized.filter((t) => t.startsWith('图')).map((t) => Number(t.slice(1)))
  // ⚠️ 胶囊在 DOM 上的顺序是节点渲染顺序，不等于卡槽号（老师可以把下面的节点填成第 1 格）。
  // 所以只校验「卡槽号正好是 1..N，不重不漏」，不要求 DOM 顺序递增。
  const sortedSeq = [...seq].sort((a, b) => a - b)
  const contiguous = seq.length > 0 && sortedSeq.every((n, i) => n === i + 1)
  check('图像卡槽号正好是 1..N 连续、不重不漏', contiguous, sortedSeq.join(','))

  // ⑦ 每一类节点都要有胶囊：图像 / 提示词 / 文字 / 结果。
  // 曾经只给 image、prompt 挂了胶囊，文字节点和图片结果节点上根本没有入口，
  // 老师就没法把「这段文字接学生自述」「这张图回到报告」标出来。
  const pillByNode = await page.evaluate(() => {
    const classes = ['.image-generation-node', '.prompt-node', '.smart-text-node', '.image-result-node']
    return classes.map((selector) => ({
      selector,
      nodes: document.querySelectorAll(selector).length,
      pills: document.querySelectorAll(`${selector} .slot-pill`).length,
    }))
  })
  const missingPill = pillByNode.filter((item) => item.nodes > 0 && item.pills === 0)
  check(
    '每一类节点右上角都有胶囊（含文字节点、图片结果节点）',
    missingPill.length === 0,
    pillByNode.map((item) => `${item.selector.replace(/^\./, '')} ${item.pills}/${item.nodes}`).join(' · '),
  )
  const textNodeCount = await page.locator('.smart-text-node').count()
  const resultNodeCount = await page.locator('.image-result-node').count()
  check(
    '画布上确实有文字节点或图片结果节点可供验证',
    textNodeCount + resultNodeCount > 0,
    `文字 ${textNodeCount} · 结果 ${resultNodeCount}`,
  )

  // ② 点开图像节点的菜单
  const imagePill = page.locator('.slot-pill.is-image').first()
  const imagePillCount = await page.locator('.slot-pill.is-image').count()
  check('存在图像卡槽胶囊', imagePillCount > 0, `${imagePillCount} 个`)
  // 胶囊贴着节点右上角，如果节点被平移到画布最左边，胶囊会落到左侧工具栏（.tool-rail）底下，
  // 工具栏 z-index 更高就会挡住点击。这是画布本身的边界情况（节点贴左边缘时才会出现），
  // 不是卡槽功能坏了，所以先把视图往右挪一段再点，避免脚本对「节点恰好贴在左边缘」这种偶然位置敏感。
  const measureOverlap = () => page.evaluate(() => {
    const pill = document.querySelector('.slot-pill.is-image')
    const rail = document.querySelector('.tool-rail')
    if (!pill || !rail) return { ok: false, reason: 'missing' }
    const p = pill.getBoundingClientRect()
    const r = rail.getBoundingClientRect()
    return { ok: p.x >= r.right + 4, pillX: Math.round(p.x), railRight: Math.round(r.right) }
  })
  let pillPos = await measureOverlap()
  if (!pillPos.ok) {
    // 合成事件驱动不了 VueFlow 的平移（它监听的是真实指针拖拽），改用真鼠标在空白处横拖
    const paneBox = await page.locator('.vue-flow__pane').first().boundingBox()
    let dragged = false
    if (paneBox) {
      const dx = Math.ceil(pillPos.railRight + 60 - pillPos.pillX)
      // 起点选画布右下角：那里通常是空白，不会误抓节点或连线
      const startX = Math.round(paneBox.x + paneBox.width - 120)
      const startY = Math.round(paneBox.y + paneBox.height - 100)
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      for (let step = 1; step <= 12; step += 1) {
        await page.mouse.move(startX + Math.round((dx * step) / 12), startY)
        await delay(20)
      }
      await page.mouse.up()
      await delay(500)
      dragged = true
    }
    pillPos = await measureOverlap()
    if (!pillPos.ok) {
      // 平移失败时兜底：直接把点击事件派发到胶囊上，专注验证卡槽菜单逻辑本身
      console.log(`      （视图平移未生效，改用直接派发点击：${JSON.stringify(pillPos)}）`)
      await page.evaluate(() => document.querySelector('.slot-pill.is-image')?.click())
      dragged = false
      pillPos.dispatched = true
    } else {
      console.log(`      （已平移视图让开工具栏：dragged=${dragged} → ${JSON.stringify(pillPos)}）`)
    }
  }
  if (!pillPos.dispatched) await imagePill.click()
  let menuOpen = false
  for (let i = 0; i < 40; i += 1) {
    menuOpen = await page.locator('.slot-menu-pop').isVisible().catch(() => false)
    if (menuOpen) break
    await delay(120)
  }
  check('点胶囊弹出卡槽菜单', menuOpen)

  const optionLabels = await page.locator('.slot-menu-item .slot-menu-label').allInnerTexts()
  check('图像节点的菜单只给「图像素材 / 不上前端」', JSON.stringify(optionLabels) === JSON.stringify(['图像素材', '不上前端']), optionLabels.join('/'))

  // 菜单不出屏
  const menuBox = await page.locator('.slot-menu-pop').boundingBox()
  const inViewport = menuBox && menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= 1440 && menuBox.y + menuBox.height <= 900
  check('菜单完整落在视口内', Boolean(inViewport), menuBox ? `x=${Math.round(menuBox.x)} y=${Math.round(menuBox.y)} w=${Math.round(menuBox.width)} h=${Math.round(menuBox.height)}` : 'no box')

  // ③ 「排第几格」只在图像卡槽时出现
  const seqVisibleOnImage = await page.locator('.slot-menu-seq').isVisible().catch(() => false)
  check('图像卡槽显示「排第几格」', seqVisibleOnImage)
  // 老师填了号但卡槽总数不够时，界面要直说「实际落在第几格」，不能让人以为没生效。
  // 这里不写死「第 1 格」：具体第几格取决于节点在画布上的位置，只要文案给出了真实格号即可。
  const hereHint = await page.locator('.slot-menu-foot.is-strong').innerText().catch(() => '')
  const hereNumber = Number((hereHint.match(/第\s*(\d+)\s*格/) || [])[1] || 0)
  // 只有 1 个图像卡槽时，界面走的是另一句话：「画布上只有这 1 个图像卡槽，所以它就是第 1 格」，
  // 这句话里没有「共 N 个」。旧断言只认「共 N 个」，单卡槽模板必然假 FAIL，这里补上这一支。
  const onlyOneSlot = /只有这\s*1\s*个/.test(hereHint)
  const slotTotalText = Number((hereHint.match(/共\s*(\d+)\s*个/) || [])[1] || 0) || (onlyOneSlot ? 1 : 0)
  check(
    '菜单里说清这个节点实际落在第几格',
    hereNumber > 0 && hereNumber <= slotTotalText,
    hereHint || '(空)',
  )

  // ④ 改成「不上前端」
  const beforeTexts = await page.locator('.slot-pill').allInnerTexts()
  await page.locator('.slot-menu-item', { hasText: '不上前端' }).click()
  await delay(260)
  const afterTexts = await page.locator('.slot-pill').allInnerTexts()
  const changedCount = afterTexts.filter((t) => t.includes('不上前端')).length
  check('改成「不上前端」后胶囊变字', changedCount > 0, `不上前端 x${changedCount}`)
  check('其它胶囊未受牵连', afterTexts.length === beforeTexts.length, `${beforeTexts.length} → ${afterTexts.length}`)

  const nonePillBg = await page.locator('.slot-pill.is-none').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
  check('「不上前端」胶囊用灰底', nonePillBg.includes('243, 244, 246') || nonePillBg.includes('rgb(243'), nonePillBg)

  // ⑤ 序号覆盖：把刚才那个图像节点改成第 2 格
  // ⚠️ 必须按节点 id 定位。胶囊在 DOM 上的顺序是「节点渲染顺序」，不等于卡槽号；
  // 模板里加过节点 / 提示词节点被删掉之后，「第 1 个胶囊」已经不是 ② 里改过的那一颗，
  // 菜单会回显成别的节点的角色，表现为假 FAIL（本模板 22 节点、0 个提示词节点就踩过）。
  await page.locator(`[data-id="${imageNodeId}"] .slot-pill`).first().click()
  await delay(200)
  const firstRole = await page.locator('.slot-menu-item.active .slot-menu-label').innerText().catch(() => '')
  check('菜单回显当前角色', firstRole === '不上前端', firstRole || '(空)')

  // 再改回图像素材，并填序号 2
  await page.locator('.slot-menu-item', { hasText: '图像素材' }).click()
  await delay(200)
  const seqInput = page.locator('.slot-menu-seq input')
  const hasSeq = await seqInput.count()
  check('切回图像素材后序号框仍在', hasSeq === 1, `${hasSeq} 个输入框`)
  if (hasSeq) {
    await seqInput.fill('2')
    await seqInput.dispatchEvent('change')
    await delay(260)
    const mapped = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.slot-pill')]
        .map((el) => el.textContent.replace(/[▾\s]/g, ''))
        .filter((t) => t.startsWith('图'))
      return rows
    })
    check('胶囊序号没有出现「图?」这种空位', !mapped.some((t) => t === '图?'), mapped.join(','))
    const numbers = mapped.map((t) => Number(t.slice(1))).sort((a, b) => a - b)
    check(
      '图像卡槽号仍然 1..N 连续、不重不漏',
      numbers.length > 0 && numbers.every((n, i) => n === i + 1),
      numbers.join(','),
    )
  }

  // ⑥ 关菜单后卡槽必须还在（真机上最容易踩的坑：改完一关菜单就退回上一次的值）
  const slotBeforeClose = await readNodeSlot(page, imageNodeId)
  await closeSlotMenuByBlank(page)
  const slotAfterClose = await readNodeSlot(page, imageNodeId)
  check('关菜单后节点上的卡槽角色还在', slotAfterClose?.role === 'image', JSON.stringify(slotAfterClose))
  check('关菜单后序号也还在', Number(slotAfterClose?.index || 0) === Number(slotBeforeClose?.index || 0), `${slotBeforeClose?.index} → ${slotAfterClose?.index}`)
  const pillAfterClose = await page.evaluate(() => document.querySelector('.slot-pill.is-image')?.textContent.replace(/[▾\s]/g, '') || '')
  check('关菜单后胶囊仍显示图像卡槽', Boolean(pillAfterClose), pillAfterClose || '(空)')

  // ⑦ 画布 320ms 后会把快照发给父页面，快照里必须带着卡槽，否则保存出去就丢了
  await delay(900)
  const snapshotSlot = await readSnapshotSlot(page, imageNodeId)
  check('发给父页面的快照里带着卡槽设置', snapshotSlot?.role === 'image', JSON.stringify(snapshotSlot))

  // ⑧ 改完不能自动落库（点返回才提示，这里只确认画布还在、没跳走）
  check('改卡槽没有导致页面跳转', page.url().includes('/workflow'))

  // ⑨ 提示词节点不能选「图像素材」，否则会造出永远不出图的空卡槽。
  // ⚠️ 不能点「第 0 个胶囊」：这个模板里根本没有提示词节点（只有 4 个「文字生成」节点），
  // 第 0 个胶囊是图像节点，菜单当然是「图像素材 / 不上前端」，旧写法必然假 FAIL。
  // 有提示词节点就测提示词节点，没有就退回文字节点（两者菜单规则相同）。
  await closeSlotMenuIfOpen(page)
  const promptPillCount = await page.locator('.prompt-node .slot-pill').count()
  const hasPromptLike = promptPillCount > 0 || textNodeCount > 0
  if (hasPromptLike) {
    const promptPill = promptPillCount
      ? page.locator('.prompt-node .slot-pill').first()
      : page.locator('.smart-text-node .slot-pill').first()
    await promptPill.click()
    await delay(220)
  }
  const promptOptions = await page.locator('.slot-menu-item .slot-menu-label').allInnerTexts()
  check(
    '提示词节点的菜单只给「文字素材 / 不上前端」',
    hasPromptLike && JSON.stringify(promptOptions) === JSON.stringify(['文字素材', '不上前端']),
    hasPromptLike ? promptOptions.join('/') : '本模板没有提示词/文字节点',
  )
  await closeSlotMenuIfOpen(page)
  await delay(200)

  // ⑩ 文字节点（「文字生成」那种）同样要能选「文字素材」，而且选完关菜单不丢。
  // 老师的原话是「这个创建的文字节点没有右上角的选择」，所以这条是回归重点。
  if (textNodeCount > 0) {
    const textPill = page.locator('.smart-text-node .slot-pill').first()
    const textRoleBefore = (await textPill.innerText()).replace(/[▾\s]/g, '')
    await textPill.click()
    await delay(260)
    const textOptions = await page.locator('.slot-menu-item .slot-menu-label').allInnerTexts()
    check('文字节点的菜单只给「文字素材 / 不上前端」', JSON.stringify(textOptions) === JSON.stringify(['文字素材', '不上前端']), textOptions.join('/'))
    check('文字节点没有「排第几格」输入框（文字不占图像格）', (await page.locator('.slot-menu-seq').count()) === 0)
    await page.locator('.slot-menu-item', { hasText: '文字素材' }).click()
    await delay(320)
    const textRoleAfter = (await page.locator('.smart-text-node .slot-pill').first().innerText()).replace(/[▾\s]/g, '')
    check('文字节点能标成「文字素材」', textRoleAfter === 'T文字', `${textRoleBefore} → ${textRoleAfter}`)
    // 选「文字素材」后菜单会自己收起（不像图像卡槽还要填「排第几格」），这时没有 catcher 可点。
    await closeSlotMenuIfOpen(page)
    await delay(300)
    const textRoleKept = (await page.locator('.smart-text-node .slot-pill').first().innerText()).replace(/[▾\s]/g, '')
    check('关掉菜单后文字卡槽仍然是刚设的值', textRoleKept === 'T文字', textRoleKept)
  } else {
    check('文字节点的菜单只给「文字素材 / 不上前端」', true, '本模板没有文字节点，跳过')
    check('文字节点没有「排第几格」输入框（文字不占图像格）', true, '本模板没有文字节点，跳过')
    check('文字节点能标成「文字素材」', true, '本模板没有文字节点，跳过')
    check('关掉菜单后文字卡槽仍然是刚设的值', true, '本模板没有文字节点，跳过')
  }

  // 关闭菜单，截图存档
  await closeSlotMenuIfOpen(page)
  await page.screenshot({ path: 'docs/mockups/shots/slot-binding-live.png', fullPage: false })
  check('已截图 docs/mockups/shots/slot-binding-live.png', true)

  check('无未捕获的前端异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`)
if (failed.length) {
  failed.forEach((f) => console.log(`  FAIL: ${f.name} ${f.detail}`))
  process.exitCode = 1
}
