/**
 * 高级创作报告页四项版面调整的验收：
 *  1) 左侧风格条能左右滑：卡装不下时出箭头，滑到两端箭头各自消失，点箭头能真的翻过去
 *  2) 智能体人物左右镜像（scaleX(-1)，且浮动动画没把镜像顶掉）
 *  3) 人物踩在「提示词」框的上方边缘（底边落在框顶边 ±2px 内），且不压框里的字、不压按钮行
 *  4) 提示词框变矮、创作叙事框变高（叙事框底部 = 提示词框顶边 - 间隙，中间没空白）
 *  5) 三栏面板贴屏幕底（底边离屏幕底 16px，不悬空），且左栏 9:16 手机框不被裁
 *  6) 上面两条在 673 / 720 / 800 / 1000 几档窗口高度下都成立
 *
 * 只跑本地页面 + 假数据，不花钱、不碰真实记录。
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3000'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
const fails = []
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✓ ${name}${extra ? '  ' + extra : ''}`) }
  else { fails.push(name + (extra ? '  ' + extra : '')); console.log(`  ✗ ${name}${extra ? '  ' + extra : ''}`) }
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
const project = {
  id: 'verify-ar-tweaks', title: '版面验收项目', difficulty: 'pro',
  prompt: '水彩城市，暖橘色的傍晚，房子一层层叠着',
  sketchOriginal: dataUrl('sketch', 600, 800),
  versions: [{ id: 'v1', imageUrl: dataUrl('v1', 864, 1536) }],
  finalVersionId: 'v1', videos: [], models3d: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}

const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
await context.addCookies(cookies)
await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
await page.route('**/api/me/documents**', async (route) => {
  const req = route.request()
  if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  const type = new URL(req.url()).searchParams.get('type') || 'project'
  const documents = type === 'project' ? [{ id: 'verify-doc', version: 1, data: project }] : []
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents }) })
})
// 塞 4 张风格卡（现实里可能只有 1 张，那就不用验滑动，这里专门造出「装不下」的场景）
await page.route('**/api/h5-report/runtime-config**', async (route) => {
  const res = await route.fetch()
  const json = await res.json()
  const base = (json.strategies || []).find((s) => s.type === 'canvas-workflow') || { id: 'fake-0', name: '画布整页' }
  json.strategies = [0, 1, 2, 3].map((i) => ({ ...base, id: `fake-${i}`, name: `${base.name || '画布整页'}-${i + 1}`, pageCount: 9 }))
  return route.fulfill({ response: res, json })
})

await page.goto(`${BASE}/student/h5-report`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.advanced-report-workbench', { timeout: 45000 })
await delay(2500)

const geo = () => page.evaluate(() => {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), right: Math.round(b.right), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) } }
  const q = (s) => document.querySelector(s)
  const navPrev = q('.ar-strip-nav.is-prev')
  const navNext = q('.ar-strip-nav.is-next')
  const strip = q('.ar-strip')
  const fig = q('.sa-figure')
  const root = q('.advanced-report-page') || q('main')
  const cs = fig ? getComputedStyle(fig) : null
  const wb = q('.advanced-report-workbench')
  const rightEl = q('.ar-right')
  const rightCs = rightEl ? getComputedStyle(rightEl) : null
  // 9:16 风格卡：.ar-style 是 aspect-ratio:9/16 的框，卡宽/卡高应正好 0.5625。
  // 这里量的是「第一张卡」（scrollLeft=0 时应该完整可见），存在多张卡是正常的，
  // 所以只看第一张有没有被容器右边切掉 —— 那正是「栏变高、宽度算式没跟上」时的症状。
  const phoneCard = q('.ar-style')
  const cardBox = phoneCard ? phoneCard.getBoundingClientRect() : null
  const stripRect = strip ? strip.getBoundingClientRect() : null
  const stripCs = strip ? getComputedStyle(strip) : null
  return {
    vh: window.innerHeight,
    workbench: box(wb),
    // 三栏面板内沿底（= 右栏底 - 自身 padding-bottom），按钮条是否「压在栏底」要跟它比
    rightInnerBottom: rightEl && rightCs
      ? Math.round(rightEl.getBoundingClientRect().bottom - parseFloat(rightCs.paddingBottom || '0'))
      : null,
    cardRatio: cardBox ? Number((cardBox.width / cardBox.height).toFixed(4)) : null,
    cardOverflow: cardBox && stripRect && stripCs
      ? Math.round(cardBox.right - (stripRect.right - parseFloat(stripCs.paddingRight || '0')))
      : null,
    promptTopGap: root?.style.getPropertyValue('--ar-prompt-top-gap') || '',
    strip: strip ? { scrollLeft: Math.round(strip.scrollLeft), scrollW: strip.scrollWidth, clientW: strip.clientWidth } : null,
    navPrevVisible: Boolean(navPrev) && navPrev.getBoundingClientRect().width > 0,
    navNextVisible: Boolean(navNext) && navNext.getBoundingClientRect().width > 0,
    right: box(q('.ar-right')),
    editor: box(q('.ar-editor')),
    storyH: box(q('.ar-right-h')),
    prompt: box(q('.ar-prompt')),
    promptTa: box(q('.ar-prompt textarea')),
    acts: box(q('.ar-acts')),
    aiRow: box(q('.ar-ai-row')),
    aiBtn: box(q('.ar-ai-btn')),
    dock: box(q('.report-agent-dock')),
    hint: box(q('.sa-hint')),
    figureTransform: cs ? cs.transform : null,
    figureAnimation: cs ? cs.animationName : null,
    textareaHasScroll: q('.ar-prompt textarea') ? q('.ar-prompt textarea').scrollHeight > q('.ar-prompt textarea').clientHeight + 1 : null,
  }
})

console.log('\n【1】左侧风格条左右滑动')
let g = await geo()
check('风格卡数量 ≥ 2 时出现「下一个」箭头', g.navNextVisible)
check('还没滑动时不出现「上一个」箭头', !g.navPrevVisible)
check('风格条溢出可滑（scrollWidth > clientWidth）', g.strip.scrollW > g.strip.clientW + 2, `${g.strip.scrollW} > ${g.strip.clientW}`)

await page.click('.ar-strip-nav.is-next')
await delay(900)
g = await geo()
check('点「下一个」真的滑过去', g.strip.scrollLeft > 50, `scrollLeft=${g.strip.scrollLeft}`)
check('滑过去之后「上一个」箭头出现', g.navPrevVisible)

// 滚到最右端，「下一个」箭头应该消失
await page.evaluate(() => {
  const strip = document.querySelector('.ar-strip')
  strip.scrollLeft = strip.scrollWidth
  strip.dispatchEvent(new Event('scroll'))
})
await delay(500)
g = await geo()
check('滚到最右端，「下一个」箭头消失', !g.navNextVisible)

await page.click('.ar-strip-nav.is-prev')
await delay(900)
g = await geo()
check('点「上一个」能倒回来', g.strip.scrollLeft < 1000, `scrollLeft=${g.strip.scrollLeft}`)
// 回到最左，「上一个」箭头应该消失
await page.evaluate(() => {
  const strip = document.querySelector('.ar-strip')
  strip.scrollLeft = 0
  strip.dispatchEvent(new Event('scroll'))
})
await delay(500)
g = await geo()
check('滚回最左端，「上一个」箭头消失', !g.navPrevVisible)
check('回到最左后「下一个」箭头还在', g.navNextVisible)

console.log('\n【2】人物左右镜像')
const negativeScale = /^matrix\(-1,/.test(String(g.figureTransform || ''))
check('人物 transform 是水平镜像（matrix(-1,…)）', negativeScale, String(g.figureTransform))
check('浮动动画换成了带镜像的版本（否则一动就翻回去）', String(g.figureAnimation || '').startsWith('arMirrorFloat'), String(g.figureAnimation))
// 等一个动画周期的一半，确认动画中途仍是镜像
await delay(2200)
const mid = await geo()
check('动画播到中途仍然是镜像状态', /^matrix\(-1,/.test(String(mid.figureTransform || '')), String(mid.figureTransform))

console.log('\n【3】人物踩在提示词框的上方边缘')
g = await geo()
const footLine = g.dock.bottom
const promptTop = g.prompt.y
check('人物底边落在提示词框顶边 ±3px 内', Math.abs(footLine - promptTop) <= 3, `脚底 ${footLine} / 框顶 ${promptTop}`)
// 设计上脚掌轻轻压住框顶那道 2px 边线（看起来是「站在框沿上」），不超过 3px 都算站在边线上
check('人物只踩住框顶边线、没压进框里的文字区', footLine <= promptTop + 3, `脚底 ${footLine} ≤ 框顶+3 ${promptTop + 3}`)
check('人物没有压住「整理创作构思」按钮', g.dock.x >= g.aiBtn.right, `人物左 ${g.dock.x} ≥ 按钮右 ${g.aiBtn.right}`)
check('人物没有超出屏幕右边被裁', g.dock.right <= 1440, `右边界 ${g.dock.right}`)
check('「点我说话」气泡完整可见', g.hint && g.hint.right <= 1440, g.hint ? `气泡右 ${g.hint.right}` : '气泡不存在')
check('人物落在右栏里（左边界不超右栏左边界）', g.dock.x >= (g.right ? g.right.x : 957), `人物左 ${g.dock.x} / 右栏左 ${g.right ? g.right.x : 957}`)
check('人物没有盖住「整理创作构思」按钮的同一水平带', g.dock.x >= g.aiBtn.right, `人物左 ${g.dock.x} ≥ 按钮右 ${g.aiBtn.right}`)
check('位置变量已被量到并写入', Boolean(g.promptTopGap), g.promptTopGap)

console.log('\n【4】提示词框变矮 / 叙事框变高')
check('提示词框高度 ≤ 150px（不再是抢剩余高度的 194px）', g.prompt.h <= 151, `实测 ${g.prompt.h}px`)
check('提示词框高度 ≥ 92px（学生还看得见 2 行提示词）', g.prompt.h >= 92, `实测 ${g.prompt.h}px`)
check('提示词文字没有被挤到要滚动', g.textareaHasScroll === false)
// 中间夹着两行（「整理创作构思」按钮行 + 模型说明行），所以量的是「叙事框 → 提示词框」整段，
// 只要这几块的顶部首尾相接、没有人为的空档即可（合计 ≤ 78px，改前是 74px 空档 + 更矮的叙事框）
const storyGap = g.prompt.y - g.editor.bottom
check('叙事框到提示词框之间只有按钮行+说明行，没有多余空档（≤ 80px）', storyGap >= 0 && storyGap <= 80, `合计 ${storyGap}px`)
check('叙事框吃掉腾出来的高度（≥ 380px，改前 350px）', g.editor.h >= 380, `叙事框 ${g.editor.h}px`)
check('提示词框顶边比改前更靠下（叙事框往下挪了，> 560）', g.prompt.y > 560, `提示词框顶边 ${g.prompt.y}`)
check('叙事框底边明显下移（> 之前 130+153=283 的旧位置）', g.editor.bottom > 400, `底边 ${g.editor.bottom}`)
// 按钮条是否「压在栏底」必须跟**栏内沿**比，不能写死像素：
// 页面高度基准改过一次（100vh-128 → 100vh-16），所有绝对位置整体下移了约 100px，
// 写死的 740~772 会永远报错，但界面其实是对的。这里只校验「按钮条底边离栏内沿 ≤ 24px」。
const actsToInner = g.rightInnerBottom - g.acts.bottom
check('按钮条仍压在栏底（离栏内沿 ≤ 24px，没被挤跑）', actsToInner >= 0 && actsToInner <= 24, `按钮条底 ${g.acts.bottom} / 栏内沿 ${g.rightInnerBottom} / 差 ${actsToInner}`)

console.log('\n【5】三栏面板贴屏幕底、9:16 手机框不被裁')
// 这一组是「底部悬空」回归的守护网：曾经 height 写了 calc(100vh - 128px)，
// 但这个页面挂在根 RouterView 上、外层没有顶栏，于是页面底部凭空空出 128px，三栏面板整体悬空。
check('工作台底边距屏幕底正好 16px（不再悬空）', Math.abs(g.vh - g.workbench.bottom - 16) <= 1, `工作台底 ${g.workbench.bottom} / 视口高 ${g.vh}`)
check('工作台高度 ≈ 视口 - 16（没有多减顶栏的那 112px）', Math.abs(g.workbench.h - (g.vh - 16)) <= 2, `工作台高 ${g.workbench.h} / 视口 ${g.vh}`)
check('9:16 手机框没横向溢出到栏外', g.cardOverflow !== null && g.cardOverflow <= 1, `溢出 ${g.cardOverflow}px`)
check('9:16 手机框仍是标准比例 0.5625', g.cardRatio !== null && Math.abs(g.cardRatio - 0.5625) <= 0.004, `实测 ${g.cardRatio}`)

// 换几档窗口高度再量一遍：这次改动的两处（工作台高度、顶栏高度变量写在哪）
// 在矮屏（顶栏折行、变高变矮）最容易露出来，只在 900 高上验是不够的。
console.log('\n【6】多档窗口高度下都不悬空、不裁卡')
for (const h of [673, 720, 800, 1000]) {
  await page.setViewportSize({ width: 1440, height: h })
  await delay(700)
  const m = await geo()
  const gap = m.vh - m.workbench.bottom
  check(`窗口高 ${h}：底部空白仍是 16px`, Math.abs(gap - 16) <= 1, `空白 ${gap}px / 工作台底 ${m.workbench.bottom}`)
  check(`窗口高 ${h}：9:16 手机框没被栏右侧裁掉`, m.cardOverflow !== null && m.cardOverflow <= 1, `溢出 ${m.cardOverflow}px`)
  check(`窗口高 ${h}：9:16 手机框比例仍 0.5625`, m.cardRatio !== null && Math.abs(m.cardRatio - 0.5625) <= 0.004, `实测 ${m.cardRatio}`)
}
await page.setViewportSize({ width: 1440, height: 900 })
await delay(700)


check('页面没有 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await page.screenshot({ path: 'docs/mockups/shots/verify-ar-layout-tweaks.png' })
await browser.close()

console.log(`\n=== ${pass} 项通过，${fails.length} 项失败 ===`)
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1) }
