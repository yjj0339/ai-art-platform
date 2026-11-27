/**
 * 验证高级版 H5 报告工作台改版后的三栏排版：
 *   左 = 风格模板（9:16 手机框撑满栏高、横滑、无风格名/圆点/标题）
 *   中 = 创作素材（标题 + 换项目 + 缩略图勾选）
 *   右 = 创作叙事 + 提示词 + 预览/生成
 * 外加：顶部返回按钮、提示词默认带出原句、改过能「恢复原来的」。
 *
 * 零花费：不进生成流程，只读页面结构与尺寸。
 * 用法：node scripts/verify-advanced-report-layout.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3000'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

let fails = 0
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails += 1
}

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
const cookies = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).map((pair) => {
  const at = pair.indexOf('=')
  return { name: pair.slice(0, at), value: pair.slice(at + 1), domain: '127.0.0.1', path: '/' }
})

const dataUrl = (tag, w, h) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#4a9"/><text x="${w / 2}" y="${h / 2}" font-size="90" text-anchor="middle" fill="#fff">${tag}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const PROMPT = '水彩城市，暖橘色的傍晚，房子一层层叠着'
const project = {
  id: 'verify-ar-layout-project',
  title: '排版回归用项目',
  difficulty: 'pro',
  prompt: PROMPT,
  sketchOriginal: dataUrl('sketch', 600, 800),
  versions: [
    { id: 'v1', imageUrl: dataUrl('v1', 864, 1536) },
    { id: 'v2', imageUrl: dataUrl('v2', 864, 1536) },
  ],
  finalVersionId: 'v1',
  videos: [],
  models3d: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addCookies(cookies)
await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))

const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

// 项目在 server 模式下是从 /me/documents 拉的，localStorage 塞不进去。
// 这里把接口改成返回上面那个假的 pro 项目：既能控制 prompt 一定有值，又完全不动学生的真实记录。
await page.route('**/api/me/documents**', async (route) => {
  const req = route.request()
  if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  const type = new URL(req.url()).searchParams.get('type') || 'project'
  const documents = type === 'project'
    ? [{ id: 'verify-ar-layout-doc', version: 1, data: project }]
    : []
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents }) })
})

await page.goto(`${BASE}/student/h5-report`, { waitUntil: 'domcontentloaded' })
// dev server 首次访问要现编译，机器忙的时候（尤其两个验收脚本同时跑）10 秒内出不来。
// 别写死小超时，给足 45 秒；真出来就直接过，不用干等。
await page.waitForSelector('.advanced-report-workbench', { timeout: 45000 })
await delay(2500)

check(pageErrors.length === 0, '页面无脚本报错', pageErrors.slice(0, 3).join(' | '))

// ---- 顶部导航条 + 返回按钮 ----
const back = page.locator('.advanced-back')
check(await back.count() === 1, '顶部有返回按钮')
const backBox = await back.boundingBox()
check(Boolean(backBox && backBox.width > 40 && backBox.height >= 30), '返回按钮有实际尺寸', backBox ? `${Math.round(backBox.width)}×${Math.round(backBox.height)}` : '不可见')
check((await back.innerText()).includes('返回'), '返回按钮写着「返回」')
check(await page.locator('.advanced-brand strong').first().innerText() === '高级创作报告', '仍保留「高级创作报告」标题')
check(await page.locator('.advanced-header-actions .advanced-outline-btn').count() === 1, '仍保留「保存草稿」')

// 返回按钮真能回到报告列表
await back.click()
await delay(700)
check(page.url().includes('/student/reports'), '点返回跳到报告列表', page.url())
await page.goBack()
await page.waitForSelector('.advanced-report-workbench', { timeout: 15000 })
await delay(1800)

// ---- 左栏：风格模板（纯手机框横滑）----
check(await page.locator('.ar-strip').count() === 1, '左栏是横滑风格条 .ar-strip')
check(await page.locator('.ar-style-n').count() === 0, '风格名文字已删除（无 .ar-style-n）')
check(await page.locator('.ar-seg').count() === 0, '左栏分类按钮已删除（无 .ar-seg）')
check(await page.locator('.ar-rec').count() === 0, '「推荐」角标已删除')

const leftText = (await page.locator('.ar-left').innerText()).trim()
check(!leftText.includes('风格模板'), '左栏没有「风格模板」标题文字', JSON.stringify(leftText.slice(0, 40)))
check(!leftText.includes('9:16'), '左栏没有「9:16」说明文字')
check(!leftText.includes('左右滑动'), '左栏没有「左右滑动」提示文字')

const styleCount = await page.locator('.ar-style').count()
check(styleCount > 0, '有可选的风格卡', String(styleCount))

if (styleCount > 0) {
  const geo = await page.evaluate(() => {
    const panel = document.querySelector('.ar-left')
    const strip = document.querySelector('.ar-strip')
    const card = document.querySelector('.ar-style')
    const tp = document.querySelector('.ar-tp')
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
    return {
      panel: r(panel), strip: r(strip), card: r(card), tp: r(tp),
      stripScrollW: strip.scrollWidth, stripClientW: strip.clientWidth,
      cardCount: document.querySelectorAll('.ar-style').length,
    }
  })
  const ratio = geo.tp.w / geo.tp.h
  check(Math.abs(ratio - 9 / 16) < 0.02, '手机框是 9:16', `实际 ${ratio.toFixed(4)}（${Math.round(geo.tp.w)}×${Math.round(geo.tp.h)}）`)
  // 撑满：框顶到栏顶的间距 = 栏底到框底的间距 = 10（风格条内边距）
  const gapTop = geo.tp.y - geo.panel.y
  const gapBottom = (geo.panel.y + geo.panel.h) - (geo.tp.y + geo.tp.h)
  check(gapTop <= 14 && gapBottom <= 14, '手机框从栏顶撑到栏底', `上 ${Math.round(gapTop)}px / 下 ${Math.round(gapBottom)}px`)
  /* ⚠ 原来是「手机框横向贴着栏边（左 ≤14px）」，那是「卡靠左」时代的判据。
     现在只有一张卡时套了 margin-inline:auto 居中，左边必然空出约 40px，
     这条永远为假。改成「左右留白相等」——居中才是现在想要的样子。 */
  /* ⚠ 这条原来叫「手机框横向居中（左右留白相等）」，只在「后台只发布 1 张风格卡」时成立。
     现在后台发布了 2 张卡，风格条是能横滑的滚动容器，第一张卡必须贴左吸附
     （居中会导致后面的卡永远滑不到），所以左右留白本来就不该相等。
     真正要守的东西只有一条：卡完整落在内边距里，左边不被容器边框削掉。
     单卡时另加居中判据（那时才该左右对称）。 */
  const gapLeft = geo.tp.x - geo.panel.x
  const gapRight = (geo.panel.x + geo.panel.w) - (geo.tp.x + geo.tp.w)
  if (geo.cardCount === 1) {
    check(Math.abs(gapLeft - gapRight) <= 16, '单张卡时手机框横向居中（左右留白相等）', `左 ${Math.round(gapLeft)}px / 右 ${Math.round(gapRight)}px`)
  } else {
    check(gapLeft >= 8, '多张卡时首卡贴左但没被削掉左边（左留白 ≥ 内边距 10px）', `左 ${Math.round(gapLeft)}px / ${geo.cardCount} 张卡`)
  }
  // 单张卡不该撑出滚动条（撑出来浏览器会自动居中，把卡左边削掉一条）；
  // 两张以上时则必须能滚，否则后面那张永远看不到。
  check(styleCount > 1 ? geo.stripScrollW > geo.stripClientW : geo.stripScrollW <= geo.stripClientW + 1,
    styleCount > 1 ? '风格条可横向滚动' : '单张卡不撑出横向滚动',
    `内容 ${geo.stripScrollW} / 可视 ${geo.stripClientW}`)
  check(geo.cardCount === styleCount, '每张卡都渲染出来了', `${geo.cardCount}`)

  // 滚轮能横翻（后台只发布了一个画布风格时没有可翻的，跳过）
  // ⚠ 别断言「scrollLeft 小幅增长」。风格条是 `scroll-snap-type: x mandatory`，
  //   滚 200px 根本到不了下一张的吸附点，浏览器会当场吸回原处 —— 曾经的实现就是
  //   `scrollLeft += deltaY`，实测 10 → 10，学生反馈「滚了没反应」。
  //   现在改成「一次手势翻一整张」，所以要断言的是：滚动位置变了，而且正好落在
  //   某一张卡的吸附点上（= 卡左边缘对齐内边距），不是随便停在中途。
  if (styleCount > 1) {
    const before = await page.evaluate(() => document.querySelector('.ar-strip').scrollLeft)
    await page.locator('.ar-strip').hover()
    await page.mouse.wheel(0, 200)
    await delay(700)
    const after = await page.evaluate(() => {
      const strip = document.querySelector('.ar-strip')
      const cards = [...strip.querySelectorAll('.ar-style')]
      const sr = strip.getBoundingClientRect()
      /* 「没卡在半截」的判据：滚动停止后，至少有一张卡完整落在可视区里。
         不写「卡左边缘正好对齐 10px 内边距」——滚到最右端时 scrollLeft 撞到
         max（= scrollWidth - clientWidth），比最后一张卡的吸附点还差一个右内边距，
         卡会停在离左沿 15px 而不是 10px，那条断言会在「滚到底」这个正确状态上误报。 */
      const wholeVisible = cards.some((c) => {
        const r = c.getBoundingClientRect()
        return r.left >= sr.left - 1 && r.right <= sr.right + 1
      })
      return { scrollLeft: strip.scrollLeft, wholeVisible }
    })
    check(after.scrollLeft > before, '鼠标滚轮能把风格条横着滚', `${before} → ${after.scrollLeft}`)
    check(after.wholeVisible, '滚完有整张卡完整可见（没卡在半截）', after.wholeVisible ? '有整张可见' : '全是半截')
  } else {
    console.log('SKIP  鼠标滚轮横翻 — 后台目前只发布了 1 个画布风格，没有第二张可翻')
  }

  // 选中态靠描边 + 对勾，不靠文字
  const onCard = page.locator('.ar-style.on')
  check(await onCard.count() === 1, '同时只有一张卡是选中态')
  check(await page.locator('.ar-style.on .ar-chk').isVisible(), '选中卡右上角显示对勾')

  // 对勾要「看得见」：封面多是暖白/米色，白描边浅底的角标远看只是一个脏点。
  // 这里直接读实际渲染色，比的是「底色和描边色不能一样」，也不锁死具体色值。
  const chk = await page.evaluate(() => {
    const el = document.querySelector('.ar-style.on .ar-chk')
    if (!el) return null
    const s = getComputedStyle(el)
    const b = el.getBoundingClientRect()
    return { bg: s.backgroundColor, border: s.borderTopColor, w: Math.round(b.width), h: Math.round(b.height), right: Math.round(window.innerWidth - b.right), top: Math.round(b.top) }
  })
  check(Boolean(chk && chk.w >= 18 && chk.h >= 18), '对勾角标有实际尺寸', chk ? `${chk.w}×${chk.h}` : '不存在')
  check(Boolean(chk && chk.bg !== chk.border), '对勾底色和描边不同色（不会被看成水印）', chk ? `底 ${chk.bg} / 边 ${chk.border}` : '')
}

// ---- 中栏：创作素材 ----
const midH2 = await page.locator('.ar-mid .ar-panel-h h2').innerText()
check(midH2.trim() === '创作素材', '中栏标题是「创作素材」', midH2)
check(await page.locator('.ar-mid .ar-thumbs .ar-th').count() > 0, '中栏有素材缩略图', String(await page.locator('.ar-mid .ar-th').count()))
check(await page.locator('.ar-mid .ar-src-switch').count() === 1, '中栏保留「换项目」')
check(await page.locator('.ar-left .ar-thumbs').count() === 0, '左栏不再放素材缩略图')

// 点缩略图能取消参与
const firstTh = page.locator('.ar-mid .ar-th').first()
const wasOff = (await firstTh.getAttribute('class') || '').includes('is-off')
await firstTh.click()
await delay(300)
const nowOff = (await firstTh.getAttribute('class') || '').includes('is-off')
check(wasOff !== nowOff, '点缩略图能切换参与状态')
await firstTh.click()
await delay(200)

// ---- 右栏：叙事 + 提示词 ----
check((await page.locator('.ar-right-h h2').innerText()).trim() === '创作叙事', '右栏上半是「创作叙事」')
const narration = page.locator('.ar-editor textarea')
check(await narration.count() === 1 && await narration.isEditable(), '叙事输入框可写')

check(await page.locator('.ar-prompt textarea').count() === 1, '叙事下面有独立的提示词输入框')
check((await page.locator('.ar-prompt-h b').innerText()).trim() === '提示词', '提示词框有小标题')
const promptVal = await page.locator('.ar-prompt textarea').inputValue()
check(promptVal.trim() === PROMPT, '提示词框默认带出画图时写的那句', JSON.stringify(promptVal))
check(await page.locator('.ar-prompt-reset').count() === 0, '没改过时不显示「恢复原来的」')

// 叙事框在上、提示词框在下
const order = await page.evaluate(() => {
  const a = document.querySelector('.ar-editor').getBoundingClientRect()
  const b = document.querySelector('.ar-prompt').getBoundingClientRect()
  return { editorY: a.y, editorBottom: a.bottom, promptY: b.y }
})
check(order.promptY >= order.editorBottom - 1, '提示词框在叙事框下面', `叙事底 ${Math.round(order.editorBottom)} / 提示词顶 ${Math.round(order.promptY)}`)

// 改了提示词 → 出现「恢复原来的」，点了能恢复
await page.locator('.ar-prompt textarea').fill('改成暖黄色，突出夕阳')
await delay(300)
check(await page.locator('.ar-prompt-reset').count() === 1, '改了提示词就出现「恢复原来的」')
await page.locator('.ar-prompt-reset').click()
await delay(300)
check((await page.locator('.ar-prompt textarea').inputValue()).trim() === PROMPT, '点「恢复原来的」能还原')
check(await page.locator('.ar-prompt-reset').count() === 0, '还原后按钮自己消失')

// 提示词框要有「能用」的高度：右栏底部让了 104px 给人物，
// 各块都是 flex:0 0 auto，挤不下的只会被裁，不会自动撑高，所以要盯一下实际高度。
const promptBox = await page.locator('.ar-prompt textarea').boundingBox()
check(Boolean(promptBox && promptBox.height >= 60), '提示词输入框有可用高度', promptBox ? `${Math.round(promptBox.width)}×${Math.round(promptBox.height)}` : '不可见')

// 风格卡的横向落位只允许两种「整齐」状态，不许出现半截：
//   a) 卡放得下（scrollWidth ≤ clientWidth）：左右留白要对称，居中；
//   b) 卡放不下（栏比卡窄，卡只能被裁掉一条边）：必须贴在左起点，否则卡左边会被凭空削掉。
// 实测 1440×900 就是 b：卡 448 宽、栏内 464 减去左右各 10 的内边距只剩 444，注定要滑。
// ⚠ 断言「scrollLeft === 0」成立的前提是风格条上有 `scroll-padding-inline: 10px`。
//   少了那条，scroll-snap 会连 padding 一起滚掉、起点天然是 10，卡左边缘顶死在容器边框上。
// ⚠ 量之前 MUST 先把风格条复位到起点：上一段滚轮测试已经把它滚到最右端了，
//   不复位就会读到「第二张卡在 left=-443」并被判成「左边被削掉」（纯属测量顺序问题）。
await page.evaluate(() => {
  const strip = document.querySelector('.ar-strip')
  if (strip) strip.scrollLeft = 0
})
await delay(350)
const stripFit = await page.evaluate(() => {
  const strip = document.querySelector('.ar-strip')
  const card = document.querySelector('.ar-style')
  if (!strip || !card) return null
  const s = strip.getBoundingClientRect()
  const c = card.getBoundingClientRect()
  return {
    overflow: strip.scrollWidth - strip.clientWidth,
    scrollLeft: strip.scrollLeft,
    left: Math.round(c.left - s.left),
    right: Math.round(s.right - c.right),
  }
})
if (!stripFit) {
  console.log('SKIP  风格卡横向落位 — 没有找到风格条')
} else if (stripFit.overflow > 1) {
  check(Math.abs(stripFit.scrollLeft) <= 1, '卡放不下时贴着左起点（不凭空削掉左边）', `scrollLeft ${stripFit.scrollLeft} / 卡左 ${stripFit.left}px`)
  check(stripFit.left >= 8, '卡左边缘留在内边距里，没顶死在容器边框上', `卡左 ${stripFit.left}px`)
} else {
  check(Math.abs(stripFit.left - stripFit.right) <= 16, '卡放得下时左右留白对称', `左 ${stripFit.left} / 右 ${stripFit.right}`)
}

// ---- 操作按钮仍在右栏底部 ----
check(await page.locator('.ar-right .ar-acts .ar-prev').count() === 1, '右栏有「预览」')
check(await page.locator('.ar-right .ar-acts .ar-go').count() === 1, '右栏有「生成 H5 报告」')

// ---- 右栏「往下不留空」：提示词框 → 按钮条 必须一路贴到栏底 ----
// 学生原话：「提示词输入位置不太对，下面留空了，没有和底边对齐」。
// 以前的实现给人物让了 104px 空白，结果提示词框和按钮之间吊着一条大空白。
// 现在反过来：按钮条压栏底，提示词框紧贴按钮条，多出来的高度全归叙事框。
const bottomFit = await page.evaluate(() => {
  const pick = (sel) => {
    const n = document.querySelector(sel)
    if (!n) return null
    const r = n.getBoundingClientRect()
    return { y: Math.round(r.y), bottom: Math.round(r.bottom), h: Math.round(r.height) }
  }
  const right = document.querySelector('.ar-right')
  const cs = getComputedStyle(right)
  return {
    right: pick('.ar-right'),
    padBottom: Math.round(parseFloat(cs.paddingBottom) || 0),
    prompt: pick('.ar-prompt'),
    acts: pick('.ar-acts'),
    viewH: window.innerHeight,
  }
})
if (!bottomFit.prompt || !bottomFit.acts || !bottomFit.right) {
  console.log('SKIP  右栏贴底 — 没有找到提示词框 / 按钮条')
} else {
  // 按钮条下沿 ≈ 栏内沿（栏底减去自己的内边距），差 2px 以内算贴合
  const slackToBottom = bottomFit.right.bottom - bottomFit.padBottom - bottomFit.acts.bottom
  check(Math.abs(slackToBottom) <= 2, '按钮条压在栏底（下方不留空）', `栏内沿 ${bottomFit.right.bottom - bottomFit.padBottom} / 按钮底 ${bottomFit.acts.bottom}`)
  const gapPromptActs = bottomFit.acts.y - bottomFit.prompt.bottom
  // ⚠ 这条判据改过两版，别再改回去：
  //   第一版要求「间隙 ≤2px」—— 当时想法是「贴着才不浪费高度」，但实测贴成 0px 后，
  //   提示词框最后一行字就压在边框线上，学生看截图说「按钮把输入框压住了」。
  //   现在必须留一道 8~14px 的正常栏内间距：小于 8 就是视觉上贴死、大于 14 才是裂开。
  check(gapPromptActs >= 8 && gapPromptActs <= 14, '提示词框和按钮条之间留了正常间距（不贴死也不裂开）', `${gapPromptActs}px`)
  check(bottomFit.prompt.h >= 108, '提示词框仍有可用高度（约 3 行字）', `${bottomFit.prompt.h}px`)
}

// ---- 右栏中部不能出现「撑出来的空带」----
// 叙事框吃掉所有富余高度，其余块都是 0 0 auto：一旦哪块被写成 flex:1，
// 中间就会重新长出一条空带（这次就是被人物让位的旧写法咬到的）。
const stretchCheck = await page.evaluate(() => {
  const sel = ['.ar-editor', '.ar-ai-row', '.ar-ai-meta', '.ar-prompt', '.ar-acts']
  return sel.map((s) => {
    const n = document.querySelector(s)
    if (!n) return { sel: s, grow: null, h: 0 }
    const cs = getComputedStyle(n)
    return { sel: s, grow: cs.flexGrow, h: Math.round(n.getBoundingClientRect().height) }
  })
})
for (const item of stretchCheck) {
  if (item.grow === null) continue
  const isEditor = item.sel === '.ar-editor'
  check(isEditor ? item.grow !== '0' : item.grow === '0', isEditor ? '叙事框是唯一吃富余高度的那块' : `${item.sel} 不吃富余高度（免得撑出空带）`, `flex-grow ${item.grow} / 高 ${item.h}`)
}

// ---- 右下角智能体人物：站在提示词框上方，且不压任何文字/按钮 ----
// 右栏改版后比原来高了不少（多了提示词块），人物是 fixed 浮层，
// 必须要问一句「还挡不挡得住」，否则学生点不到按钮也看不出原因。
// ⚠ 量之前先把浮动动画定住：人物带着 translateY(-6px~0) 的 saFloat 循环，
//   随机时刻量出来能差 6px，会把「脚刚好在框顶上方 10px」误判成「压进框里」。
const dockGeom = await (async () => {
  /* 等 --ar-prompt-top-gap 收敛再量。
     页面里这个变量是「量 → 写 → 再量」的短轮询（keepSyncStable），刚进页面时
     可能还停在上一轮的值上（实测差 10px），这时量出来的位置是假的。
     这里等它连续 3 次读数一致才算稳定，最多等 6 秒。 */
  await page.evaluate(() => new Promise((resolve) => {
    const root = document.querySelector('.advanced-report-page') || document.querySelector('main')
    let last = null
    let same = 0
    let tries = 0
    const tick = () => {
      const now = root ? root.style.getPropertyValue('--ar-prompt-top-gap') : ''
      same = now && now === last ? same + 1 : 0
      last = now
      tries += 1
      if (same >= 3 || tries > 30) return resolve(now)
      setTimeout(tick, 200)
    }
    tick()
  }))
  await page.addStyleTag({ content: '.report-agent-dock .sa-figure, .report-agent-dock .sa-figure-shadow { animation: none !important; }' })
  await delay(200)
  return page.evaluate(() => {
    const el = document.querySelector('.report-agent-dock')
    if (!el) return null
    const b = el.getBoundingClientRect()
    if (!b.width || !b.height) return null
    const pick = (sel) => {
      const n = document.querySelector(sel)
      if (!n) return null
      const r = n.getBoundingClientRect()
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }
    }
    return {
      dock: { x: b.x, y: b.y, right: b.right, bottom: b.bottom },
      prompt: pick('.ar-prompt'),
      acts: pick('.ar-acts'),
      editor: pick('.ar-editor'),
      aiRow: pick('.ar-ai-row'),
      aiBtn: pick('.ar-ai-btn'),
      aiMeta: pick('.ar-ai-meta'),
      /* 模型行只到「文字真正结束的地方」为止。
         .ar-ai-meta 是个撑满整栏的块，为了给人物让位还带了 72px 右内边距；
         直接拿它的框去算重叠，会把右侧那块「本来就空白」的让位区也算成压字，
         读数永远卡在 12% 上下（人物一浮动就翻红/翻绿）。
         这里取最后一个可见 span 的右边缘当文字终点，和人物右边缘比 —— 才是学生眼里的「压没压字」。 */
      aiMetaTextRight: (() => {
        const row = document.querySelector('.ar-ai-meta')
        if (!row) return null
        let right = null
        for (const sp of row.querySelectorAll(':scope > span')) {
          const r = sp.getBoundingClientRect()
          if (!r.width) continue
          right = right === null ? r.right : Math.max(right, r.right)
        }
        return right
      })(),
      aiMetaScrollW: document.querySelector('.ar-ai-meta')?.scrollWidth ?? null,
      aiMetaClientW: document.querySelector('.ar-ai-meta')?.clientWidth ?? null,
      leftFill: pick('.ar-fill'),
    }
  })
})()
if (!dockGeom) {
  console.log('SKIP  智能体人物浮层 — 本页没有渲染出人物')
} else {
  // 人物本身是贴图（脸在上、脚下有影子），它「碰到」一行字并不等于字读不出来。
  // 所以判断分两层：
  //   1) 硬重叠（面积 > 0）绝不允许出现在「要点的东西」上：按钮、输入框；
  //   2) 会压到文字的块（叙事框 / 说明行 / 模型行），要求重叠面积不超过人物自身的 12%
  //      （人物右边缘贴着栏内沿站，最多只是擦到一行字的右端，不会盖住半行）。
  const inter = (a, b) => {
    if (!a || !b) return 0
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y))
    return w * h
  }
  const dockArea = Math.max(1, (dockGeom.dock.right - dockGeom.dock.x) * (dockGeom.dock.bottom - dockGeom.dock.y))
  const pct = (r) => Math.round((inter(dockGeom.dock, r) / dockArea) * 100)
  const fmt = (r) => `x${Math.round(r.x)}-${Math.round(r.right)} / y${Math.round(r.y)}-${Math.round(r.bottom)}`
  // 学生原话：「智能体的图是在提示词框子的上方边缘」——脚掌要踩在那道边线（框顶）上。
  // ⚠ 这条判据来回改过几次，最终结论（别再改回去）：
  // 学生原话「智能体的图是在提示词框子的上方边缘」—— 脚掌踩在框顶那道边线上。
  //   CSS 里 bottom = 屏幕底→框顶 的距离，值和位置一一对应，所以「人底 - 框顶」必须是 0。
  //   差成负数说明人钻进框里（盖字）；差成 +3 以上说明符号被改成加号、人浮到半空去了。
  //   ⚠ 别再用 `calc(var() - 1px)` 追求「压住边线」：浏览器把 var 算出的长度按
  //   1/64px 取整（303-1 → 302），实际是往下钻 1.01px，判定和视觉两头都不稳。
  const footDelta = dockGeom.dock.bottom - dockGeom.prompt.y
  check(Math.abs(footDelta) <= 1.5, '人物脚掌踩在提示词框顶边线上', `人物底 ${Math.round(dockGeom.dock.bottom)} / 提示词顶 ${Math.round(dockGeom.prompt.y)}，差 ${Math.round(footDelta)}px`)
  // 脚正好落在边线上时，包围盒可能擦到边框 1px 内沿；框高 117px，≤1% 就只有那道线
  check(pct(dockGeom.prompt) <= 1, '人物没有盖住提示词框里的文字和输入区', `重叠 ${pct(dockGeom.prompt)}%；提示词 ${fmt(dockGeom.prompt)}`)
  check(inter(dockGeom.dock, dockGeom.acts) === 0, '人物浮层不压「预览 / 生成」按钮', `按钮 ${fmt(dockGeom.acts)}`)
  check(inter(dockGeom.dock, dockGeom.aiBtn) === 0, '人物浮层不压「整理创作构思」按钮', `按钮 ${fmt(dockGeom.aiBtn)}`)
  // 模型行：判「人物右边缘有没有越过文字右边缘」，不再用面积百分比。
  // 面积百分比会把让位留白也算进去，人物一上下浮动读数就抖，红绿不定。
  const metaTextRight = dockGeom.aiMetaTextRight
  const clearMeta = metaTextRight === null ? 0 : dockGeom.dock.x - metaTextRight
  check(clearMeta >= 0, '人物没有盖住「整理用哪个模型」那行字', metaTextRight === null ? '这一行没渲染' : `人物左 ${Math.round(dockGeom.dock.x)} / 文字右 ${Math.round(metaTextRight)}，空出 ${Math.round(clearMeta)}px`)
  // 让位留白不能反过来把文字挤掉尾字（72px 留白 + 6px 右侧内沿之后，模型名要还能完整显示）
  check(dockGeom.aiMetaScrollW !== null && dockGeom.aiMetaScrollW <= dockGeom.aiMetaClientW + 1, '模型行给人物让位后没把字挤成省略号', `需要 ${dockGeom.aiMetaScrollW}px / 可用 ${dockGeom.aiMetaClientW}px`)
  check(pct(dockGeom.editor) <= 12, '人物没有盖住创作叙事框的文字', `重叠 ${pct(dockGeom.editor)}%`)
  check(dockGeom.dock.bottom <= (await page.evaluate(() => window.innerHeight)) + 1, '人物浮层没有掉到屏幕外', fmt(dockGeom.dock))
  if (dockGeom.leftFill) {
    check(dockGeom.leftFill.right - dockGeom.leftFill.x > 120, '左栏「页面图片填充」块没被挤没', `${Math.round(dockGeom.leftFill.right - dockGeom.leftFill.x)}px 宽`)
  }
}

// ---- 右栏每一块文字都没被压扁：横向溢出的元素不该出现 ----
// 「不知道怎么写？」那行原来允许折行，一折就把说明压成两行、把叙事框挤矮，
// 现在说明行单行 + 省略号，任何一块的 scrollWidth 都不该超出自身宽度太多。
const squished = await page.evaluate(() => {
  return [...document.querySelectorAll('.ar-right .ar-ai-row > *, .ar-right .ar-prompt-h > *')]
    .filter((el) => el.scrollWidth - el.clientWidth > 2 && getComputedStyle(el).textOverflow !== 'ellipsis')
    .map((el) => `${el.className || el.tagName}: ${el.scrollWidth}>${el.clientWidth}`)
})
check(squished.length === 0, '右栏说明文字没有横向挤爆', squished.join(' | ') || 'none')

// ---- 三栏没被挤坏 ----
const cols = await page.evaluate(() => {
  const g = document.querySelector('.ar-grid')
  const kids = [...g.querySelectorAll(':scope > .ar-left, :scope > .ar-mid, :scope > .ar-right')]
  return kids.map((el) => { const b = el.getBoundingClientRect(); return { cls: el.className, x: Math.round(b.x), w: Math.round(b.width) } })
})
check(cols.length === 3, '三栏都在', JSON.stringify(cols))
check(cols.every((c) => c.w > 180), '三栏都不窄于 180px')
check(cols[0].x < cols[1].x && cols[1].x < cols[2].x, '三栏顺序：风格 → 素材 → 叙事')

// 无横向溢出
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
check(overflow <= 1, '页面没有横向溢出', `${overflow}px`)

await page.screenshot({ path: 'logs/verify-ar-layout-1440.png' })

// ---- 窄屏降级 ----
await page.setViewportSize({ width: 900, height: 900 })
await delay(700)
const stacked = await page.evaluate(() => {
  const kids = [...document.querySelectorAll('.ar-grid > .ar-left, .ar-grid > .ar-mid, .ar-grid > .ar-right')]
  return kids.map((el) => Math.round(el.getBoundingClientRect().x))
})
check(new Set(stacked).size === 1, '窄屏三栏堆成一列', JSON.stringify(stacked))
const smallOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
check(smallOverflow <= 1, '窄屏没有横向溢出', `${smallOverflow}px`)
await page.screenshot({ path: 'logs/verify-ar-layout-900.png' })

await browser.close()
console.log(fails ? `\n${fails} 项未通过` : '\n全部通过')
process.exit(fails ? 1 : 0)
