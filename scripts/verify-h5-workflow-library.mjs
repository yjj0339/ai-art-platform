// 验收：后台「报告工作流库」（方案 2）页面是否可用且与样张一致。
// 覆盖：工具条统计、行栅格、缩略图叠层、学生可选开关尺寸、节点/页数单行、
//       设置抽屉的三个封面入口与分段按钮等宽、多选态勾选框展开。
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   node scripts/verify-h5-workflow-library.mjs

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

  await page.goto(`${BASE}/admin/h5-report-workflows`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // 轮询等列表：vite 首次按需编译会拖慢首帧，禁止固定 sleep。
  let rowCount = 0
  for (let i = 0; i < 80; i += 1) {
    rowCount = await page.locator('.row:not(.add):not(.empty-row)').count()
    if (rowCount > 0) break
    await delay(250)
  }
  check('工作流列表已渲染出行', rowCount > 0, `${rowCount} 行`)

  const title = await page.locator('h1').first().innerText()
  check('页面标题正确', title.includes('报告工作流库'), title)

  const toolbarText = await page.locator('.toolbar').first().innerText()
  check('工具条统计文案齐全', /共\s*\d+\s*条/.test(toolbarText) && /已发布/.test(toolbarText) && /学生可选/.test(toolbarText), toolbarText.replace(/\s+/g, ' ').slice(0, 60))

  const layout = await page.evaluate(() => {
    const row = document.querySelector('.row:not(.add):not(.empty-row)')
    const cs = getComputedStyle(row)
    const swBtn = row.querySelector('.sw button')
    const metaSpan = row.querySelector('.meta span')
    const cover = row.querySelector('.thumb .cover')
    const pg = row.querySelectorAll('.thumb .pg')
    const metaRect = metaSpan ? metaSpan.getBoundingClientRect() : null
    const metaCS = metaSpan ? getComputedStyle(metaSpan) : null
    return {
      columns: cs.gridTemplateColumns.split(' ').length,
      columnsRaw: cs.gridTemplateColumns,
      swW: swBtn ? Math.round(swBtn.getBoundingClientRect().width) : 0,
      swH: swBtn ? Math.round(swBtn.getBoundingClientRect().height) : 0,
      swAfter: swBtn ? getComputedStyle(swBtn, '::after').width : '',
      metaText: metaSpan?.textContent?.trim() || '',
      metaH: metaRect ? Math.round(metaRect.height) : 0,
      metaLine: metaCS ? parseFloat(metaCS.lineHeight) : 0,
      metaWrap: metaCS ? metaCS.whiteSpace : '',
      coverZ: cover ? getComputedStyle(cover).zIndex : '',
      coverTransform: cover ? getComputedStyle(cover).transform : '',
      pgCount: pg.length,
      pgZ: [...pg].map((n) => getComputedStyle(n).zIndex),
    }
  })
  check('行栅格为 7 列（勾选/封面/信息/元信息/状态/开关/更多）', layout.columns === 7, layout.columnsRaw)
  check('学生可选开关尺寸为 38×21（未被全局按钮 min-height 撑高）', layout.swW === 38 && layout.swH === 21, `${layout.swW}×${layout.swH}`)
  check('开关滑块伪元素存在（16px 圆点）', layout.swAfter === '16px', layout.swAfter)
  check('节点/页数文案单行不折行', layout.metaWrap === 'nowrap' && layout.metaH <= Math.ceil(layout.metaLine), `${layout.metaText} / h=${layout.metaH}`)
  check('缩略图有封面层 + 2 张内页', Boolean(layout.coverZ) && layout.pgCount === 2, `cover z=${layout.coverZ}, pages=${layout.pgCount}`)
  check('封面层在最前（z-index 大于内页）', Number(layout.coverZ) > Math.max(...layout.pgZ.map(Number)), `cover=${layout.coverZ} pages=${layout.pgZ.join(',')}`)
  check('封面有 -2deg 倾斜（叠放感）', layout.coverTransform !== 'none', layout.coverTransform)

  // 点行分工：行本身 → 进无限画布（主操作）；工作流设置 → 行尾「⋯」菜单。
  // 这两条必须成对验证，否则很容易改回「点行弹抽屉」而没人发现。
  await page.locator('.row:not(.add):not(.empty-row)').first().locator('.info .nm span').first().click()
  let canvasUrl = ''
  for (let i = 0; i < 60; i += 1) {
    const current = page.url()
    if (/\/admin\/ai-skills\/[^/]+\/workflow/.test(current)) { canvasUrl = current; break }
    await delay(150)
  }
  check('点行进入无限画布页（不再弹设置抽屉）', Boolean(canvasUrl), canvasUrl || page.url())
  check('进画布带回跳参数 returnTo=h5-report', /[?&]returnTo=h5-report/.test(canvasUrl), canvasUrl)

  // 画布页不再有页面顶栏的返回箭头：返回收进了左上角「文件 ▾」菜单。
  // 从工作流库进来时，菜单项应写「返回工作流库」，点了要回库本身（不是报告中心）。
  await page.locator('.file-menu-trigger').first().click()
  await page.locator('.file-menu button', { hasText: '返回工作流库' }).first().waitFor({ state: 'visible', timeout: 8000 })
  await page.locator('.file-menu button', { hasText: '返回工作流库' }).first().click()
  let backUrl = ''
  for (let i = 0; i < 80; i += 1) {
    if (/\/admin\/h5-report-workflows/.test(page.url())) { backUrl = page.url(); break }
    await delay(150)
  }
  check('画布页「文件 → 返回工作流库」回到工作流库（非报告中心）', Boolean(backUrl), backUrl || page.url())

  // 回列表再验抽屉：从行尾「⋯」→「工作流设置」进。
  for (let i = 0; i < 80; i += 1) {
    if (await page.locator('.row:not(.add):not(.empty-row)').count()) break
    await delay(250)
  }
  await page.locator('.row:not(.add):not(.empty-row)').first().locator('.more').click()
  await delay(250)
  await page.locator('.menu button', { hasText: '工作流设置' }).first().click()
  let drawerOpen = false
  for (let i = 0; i < 40; i += 1) {
    drawerOpen = await page.locator('.drawer').isVisible().catch(() => false)
    if (drawerOpen) break
    await delay(100)
  }
  check('行尾「⋯」→「工作流设置」可打开设置抽屉', drawerOpen)

  if (drawerOpen) {
    await delay(350)
    const drawer = await page.evaluate(() => {
      const d = document.querySelector('.drawer')
      const segs = [...d.querySelectorAll('.seg')].map((seg) => [...seg.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().width)))
      const ops = [...d.querySelectorAll('.cover-ops button')].map((b) => ({
        text: b.innerText.trim(),
        w: Math.round(b.getBoundingClientRect().width),
        h: Math.round(b.getBoundingClientRect().height),
        scrollW: b.scrollWidth,
        whiteSpace: getComputedStyle(b).whiteSpace,
      }))
      const box = d.querySelector('.cover-box')
      return {
        width: Math.round(d.getBoundingClientRect().width),
        coverOps: ops,
        segs,
        coverBox: box ? { w: Math.round(box.getBoundingClientRect().width), h: Math.round(box.getBoundingClientRect().height) } : null,
        labels: [...d.querySelectorAll('.fld > label')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()),
      }
    })
    const opsText = drawer.coverOps.map((o) => o.text).join('|')
    check('封面有三个入口（上传 / AI 生成 / 用画布第一页）',
      ['上传图片', 'AI 生成封面', '用画布第一页当封面'].every((t) => opsText.includes(t)), opsText)
    check('封面三个按钮单行不换行', drawer.coverOps.every((o) => o.whiteSpace === 'nowrap' && o.scrollW <= o.w + 2 && o.h <= 34),
      drawer.coverOps.map((o) => `${o.text}:${o.w}x${o.h}`).join(', '))
    check('封面预览框为 96×128', drawer.coverBox?.w === 96 && drawer.coverBox?.h === 128, JSON.stringify(drawer.coverBox))
    const stageSeg = drawer.segs[0] || []
    check('运行状态三段等宽', stageSeg.length === 3 && new Set(stageSeg).size === 1, stageSeg.join('/'))
    const visibleSeg = drawer.segs[1] || []
    check('学生端可见两段等宽', visibleSeg.length === 2 && new Set(visibleSeg).size === 1, visibleSeg.join('/'))
    check('抽屉字段齐全（封面/名称/运行状态/学生端可见/预计耗时/每日上限）',
      ['封面图', '工作流名称', '运行状态', '学生端可见', '预计耗时', '每日调用上限'].every((k) => drawer.labels.some((l) => l.includes(k))),
      drawer.labels.map((l) => l.split(' ')[0]).join(','))

    // 端到端：真实点一次「用画布第一页当封面」。
    // 画布成图存在 data.output.url（不是 data.image），取图口径已收敛到服务端 h5WorkflowCanvasCoverSource()，
    // 所以这里只验两件事：点下去要有明确反馈（成功落库 / 或可操作的 409 提示），且不抛页面级异常。
    const coverBefore = await page.evaluate(async () => {
      const res = await fetch('/api/admin/h5-report-workflows')
      if (!res.ok) return null
      const data = await res.json()
      return (data.workflows || []).map((w) => ({ id: w.id, coverUrl: w.coverUrl || '', coverSource: w.coverSource || '' }))
    })
    const errCountBefore = pageErrors.length
    await page.locator('.drawer .cover-ops button', { hasText: '用画布第一页当封面' }).first().click()
    let coverMsg = ''
    for (let i = 0; i < 40; i += 1) {
      coverMsg = await page.evaluate(() => [...document.querySelectorAll('.el-message')].map((n) => n.innerText.trim()).join('|'))
      if (coverMsg) break
      await delay(100)
    }
    check('点「用画布第一页当封面」有明确反馈（落库成功或 409 可操作提示）',
      /已用画布第一页当封面|画布里还没有生成过图片/.test(coverMsg), coverMsg || '(无提示)')
    check('点「用画布第一页当封面」不抛页面级异常',
      pageErrors.length === errCountBefore, pageErrors.slice(errCountBefore, errCountBefore + 2).join(' | '))
    // 该按钮成功时会把封面写进真实数据，跑完按原值 PATCH 回去，保证脚本可反复执行。
    if (/已用画布第一页当封面/.test(coverMsg) && Array.isArray(coverBefore)) {
      await page.evaluate(async (before) => {
        for (const item of before) {
          await fetch(`/api/admin/h5-report-workflows/${encodeURIComponent(item.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coverUrl: item.coverUrl, coverSource: item.coverSource }),
          })
        }
      }, coverBefore)
      await delay(300)
    }

    // 关掉抽屉，避免遮挡后续操作
    await page.evaluate(() => document.querySelector('.drawer header button')?.click())
    await delay(350)
  }

  // 多选态
  await page.locator('.toolbar button', { hasText: '多选' }).first().click()
  await delay(400)
  const selecting = await page.evaluate(() => {
    const toolbar = document.querySelector('.toolbar')
    const row = document.querySelector('.row:not(.add):not(.empty-row)')
    const cb = row.querySelector('.cb')
    const delBtn = [...toolbar.querySelectorAll('button')].find((b) => b.innerText.trim() === '删除')
    return {
      hasClass: toolbar.classList.contains('selecting'),
      cbW: Math.round(cb.getBoundingClientRect().width),
      cols: getComputedStyle(row).gridTemplateColumns.split(' ')[0],
      info: toolbar.querySelector('.sel-info').innerText.replace(/\s+/g, ' ').trim(),
      delDisabledBefore: delBtn.disabled,
    }
  })
  check('多选态工具条切换', selecting.hasClass && /已选 0 项/.test(selecting.info), selecting.info)
  check('多选态勾选框展开到 26px', selecting.cbW === 26 && selecting.cols === '26px', `${selecting.cbW}px / ${selecting.cols}`)
  check('未选中时删除按钮禁用', selecting.delDisabledBefore === true)

  await page.locator('.row:not(.add):not(.empty-row)').first().locator('.cb').click()
  await delay(300)
  const afterPick = await page.evaluate(() => {
    const toolbar = document.querySelector('.toolbar')
    const delBtn = [...toolbar.querySelectorAll('button')].find((b) => b.innerText.trim() === '删除')
    return {
      info: toolbar.querySelector('.sel-info').innerText.replace(/\s+/g, ' ').trim(),
      delDisabled: delBtn.disabled,
      picked: document.querySelectorAll('.row.picked').length,
    }
  })
  check('选中一行后统计切「已选 1 项」', /已选 1 项/.test(afterPick.info) && afterPick.picked === 1, afterPick.info)
  check('选中后删除按钮可用', afterPick.delDisabled === false)

  check('无页面级 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
if (failed.length) {
  console.log('FAILED:', failed.map((r) => r.name).join(', '))
  process.exitCode = 1
}
