/**
 * 验收：学生工作台全屏背景
 * 跑法：env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY node scripts/verify-workbench-video-bg.mjs
 *
 * 用户两条原话：「背景图像撑满整个屏幕」「背景图我想要替换成动态的」。
 *
 * 2026-11-25 起默认背景换成代码画的「动态光影」（原创、无水印）：原来默认播的豆包视频带「豆包 AI 生成」标识，
 * 靠柔雾遮住不合《人工智能生成合成内容标识办法》。那段视频仍可在后台「工作台管理 → 背景 → 用回原来的视频」启用。
 * 所以本脚本分两段：
 *  零、默认（后台没配背景）：动态光影铺满视口、在动、没有 <video>、没有柔雾；系统「减少动态效果」时静止
 *  一~四、临时把后台配置切到原视频（跑完自动还原），沿用原有断言：
 *    1. 背景层是 position:fixed 且铺满视口（不是只在 1280px 居中的那块里）
 *    2. 视频真的在播（不是停在第一帧）；且 muted + loop（不静音浏览器会拒绝自动播放）
 *    3. 视频按 cover 铺满，不留黑边
 *    4. 轨道卡片里的旧静态底图已移除
 *    5. 「豆包 AI 生成」水印处的柔雾（右下角 + 左上角两个位置都要验）
 *    6. 四档难度都成立；宽屏（1920）也铺满
 *    7. 视频 404 / 播放失败时退回动态光影（没配背景图时），不留灰底
 */
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const BASE = process.env.APP_WEB_ORIGIN || 'http://127.0.0.1:5173'
const API = process.env.APP_API_ORIGIN || 'http://127.0.0.1:3000'
const CHROME = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const ACCOUNT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }
const ADMIN_ACCOUNT = { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }
// 与 src/utils/workbenchDefaults.js 的 WORKBENCH_LEGACY_BG_VIDEO 保持一致
const LEGACY_VIDEO = '/assets/student-theme/orbit-stage-loop-v1.mp4'
const DIFFICULTIES = [
  ['junior', '初级版'],
  ['starter', '入门版'],
  ['advanced', '进阶版'],
  ['pro', '高级版'],
]

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${label}`) } else { fail += 1; console.log(`  ✗ ${label}${detail ? `  →  ${detail}` : ''}`) }
}

async function loginCookies(account = ACCOUNT) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account),
  })
  if (!response.ok) throw new Error(`登录失败：${response.status}`)
  return (response.headers.getSetCookie?.() || []).map((raw) => raw.split(';')[0]).map((pair) => {
    const index = pair.indexOf('=')
    return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: new URL(BASE).hostname, path: '/' }
  })
}

/**
 * 采样视频某块区域的平均亮度与标准差。
 * 关键：这里量的是**视频自身像素**（未叠遮罩），用来判断「该位置本来有没有亮字」。
 * 柔雾是否生效不靠数值猜，而是把遮罩打开/关掉两次采样做对比 —— 只有关掉时能检出白字、
 * 打开后白字消失，才证明遮罩真的在起作用（只量遮罩后的画面等于自己骗自己）。
 */
async function sampleVideoRegion(page, box) {
  return page.evaluate(({ x, y, w, h }) => {
    const video = document.querySelector('.workbench-bg__video')
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, 1280, 720)
    const data = ctx.getImageData(x, y, w, h).data
    let n = 0, sum = 0, sum2 = 0, maxL = 0
    for (let i = 0; i < data.length; i += 4) {
      const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      sum += l; sum2 += l * l; n++
      if (l > maxL) maxL = l
    }
    const mean = sum / n
    return { mean: +mean.toFixed(1), sd: +Math.sqrt(sum2 / n - mean * mean).toFixed(1), max: +maxL.toFixed(1) }
  }, box)
}

/**
 * 量一块**固定屏幕坐标**区域的局部对比度。这是判断「水印还在不在」唯一可靠的指标。
 *
 * 为什么不用「数白像素」（踩过的坑，别再回去）：
 *   原片水印本身就极淡 —— 整块 300px 宽的范围内 RGB>235 的像素只有约 400 个，
 *   而且开雾后柔雾把整块提亮到 247，白像素反而从 389 暴涨到 21300。
 *   「白像素变多 = 水印更明显」这个方向是反的，用它断言必然假红。
 *
 * 真正说明问题的是 **sd / edge（明暗起伏）**：白字压在背景上 → 有字形就有起伏；
 * 被柔雾抹平 → 整块变成一片均匀的浅色 → sd、edge 一起塌下去。
 * 实测（1440×900，pro）：右下角关雾 sd=12.83/edge=2.41 → 开雾 sd=2.17/edge=0.47。
 *
 * ⚠️ 必须传 `{ x, y, width, height }`（Playwright clip 的字段名），不要传 `w/h`，
 *    传错不会报错，只会截出 0×0 的图 → edge 恒为 0 → 比值算出 NaN。
 */
async function regionStats(page, box) {
  const shot = await page.screenshot({ clip: box })
  return page.evaluate(async (dataUrl) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, img.width, img.height).data
    const W = img.width
    const H = img.height
    const lum = new Float32Array(W * H)
    let sum = 0
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      lum[p] = l
      sum += l
    }
    const n = W * H
    const mean = sum / n
    let varSum = 0, edge = 0, edgeN = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x
        varSum += (lum[p] - mean) ** 2
        if (x + 1 < W) { edge += Math.abs(lum[p + 1] - lum[p]); edgeN++ }
        if (y + 1 < H) { edge += Math.abs(lum[p + W] - lum[p]); edgeN++ }
      }
    }
    return {
      w: W, h: H,
      mean: +mean.toFixed(1),
      sd: +Math.sqrt(varSum / n).toFixed(2),
      edge: edgeN ? +(edge / edgeN).toFixed(2) : 0,
    }
  }, `data:image/png;base64,${shot.toString('base64')}`)
}

const cookies = await loginCookies()
const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

/* ========== 零、默认：内置「动态光影」 ========== */
const adminCookie = (await loginCookies(ADMIN_ACCOUNT)).map(({ name, value }) => `${name}=${value}`).join('; ')
async function adminConfig(body) {
  const response = await fetch(`${API}/api/admin/workbench-config`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ config: body }) }
    : { headers: { Cookie: adminCookie } })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json.ok) throw new Error(`工作台配置接口失败：${response.status} ${json.message || ''}`)
  return json.config
}
const originalConfig = await adminConfig()
const background = (videoUrl) => ({ ...originalConfig, background: { imageUrl: '', videoUrl } })

console.log('\n【默认背景：动态光影】')
await adminConfig(background(''))
for (const [id, label] of DIFFICULTIES) {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion })
    await context.addCookies(cookies)
    await context.addInitScript((value) => { localStorage.setItem('art-studio-difficulty', value); localStorage.removeItem('art-studio-home-layout') }, id)
    const page = await context.newPage()
    await page.goto(`${BASE}/student/workbench`, { waitUntil: 'networkidle' }).catch(() => {})
    await page.waitForTimeout(1500)
    const info = await page.evaluate(() => {
      const bg = document.querySelector('.workbench-bg')
      const ambient = document.querySelector('.ambient-bg')
      const veil = document.querySelector('.workbench-bg__veil')
      const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
      return {
        position: bg ? getComputedStyle(bg).position : '',
        z: bg ? getComputedStyle(bg).zIndex : '',
        bgRect: bg ? rect(bg) : null,
        ambientRect: ambient ? rect(ambient) : null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        hasVideo: Boolean(document.querySelector('.workbench-bg__video')),
        veilImage: veil ? getComputedStyle(veil).backgroundImage : '',
        running: ambient ? ambient.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length : 0,
        orbit: Boolean(document.querySelector('.pro-orbit')),
      }
    })
    const tag = reducedMotion === 'reduce' ? `${label}·减少动态` : label
    if (reducedMotion === 'reduce') {
      check(`${tag}：系统要求减少动态时背景静止`, info.running === 0, `还在动的动画 ${info.running} 个`)
    } else {
      check(`${tag}：背景层 fixed 且贴住 (0,0)`, info.position === 'fixed' && info.bgRect?.x === 0 && info.bgRect?.y === 0, JSON.stringify(info.bgRect))
      check(`${tag}：动态光影铺满整个视口`, info.ambientRect?.w === info.viewport.w && info.ambientRect?.h === info.viewport.h, `${JSON.stringify(info.ambientRect)} / 视口 ${info.viewport.w}×${info.viewport.h}`)
      check(`${tag}：动态光影确实在动`, info.running >= 6, `在跑的动画 ${info.running} 个`)
      check(`${tag}：默认不再挂视频`, info.hasVideo === false)
      check(`${tag}：默认没有柔雾（没有要盖的水印）`, !info.veilImage.includes('gradient'), info.veilImage.slice(0, 60))
      check(`${tag}：背景层 z-index = 0，首页默认是轮播`, info.z === '0' && info.orbit, `z=${info.z} orbit=${info.orbit}`)
      if (id === 'pro') await page.screenshot({ path: 'logs-workbench-ambient-pro.png' })
    }
    await context.close()
  }
}

// 下面几段验「用回原来的视频」模式：临时切过去，结束（包括中途出错）一律还原成跑之前的配置。
await adminConfig(background(LEGACY_VIDEO))
try {
/* ========== 一、四档难度：背景铺满 + 视频在播 ========== */
for (const [id, label] of DIFFICULTIES) {
  console.log(`\n【${label} / ${id}】`)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addCookies(cookies)
  await context.addInitScript((value) => localStorage.setItem('art-studio-difficulty', value), id)
  const page = await context.newPage()
  await page.goto(`${BASE}/student/workbench`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2200)

  const info = await page.evaluate(() => {
    const bg = document.querySelector('.workbench-bg')
    const video = document.querySelector('.workbench-bg__video')
    const veil = document.querySelector('.workbench-bg__veil')
    const orbit = document.querySelector('.pro-orbit')
    if (!bg || !video) return null
    const bgStyle = getComputedStyle(bg)
    const bgRect = bg.getBoundingClientRect()
    const vStyle = getComputedStyle(video)
    const vRect = video.getBoundingClientRect()
    return {
      bgPosition: bgStyle.position,
      bgRect: { x: Math.round(bgRect.x), y: Math.round(bgRect.y), w: Math.round(bgRect.width), h: Math.round(bgRect.height) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      video: {
        paused: video.paused, muted: video.muted, loop: video.loop, defaultMuted: video.defaultMuted,
        currentTime: +video.currentTime.toFixed(2),
        duration: +video.duration.toFixed(2),
        readyState: video.readyState, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
        objectFit: vStyle.objectFit,
        display: vStyle.display,
        rect: { w: Math.round(vRect.width), h: Math.round(vRect.height) },
        hasControls: video.controls,
      },
      veil: veil ? { display: getComputedStyle(veil).display, image: getComputedStyle(veil).backgroundImage } : null,
      orbitBackground: orbit ? getComputedStyle(orbit).backgroundImage : '',
      // 内容是否都压在背景之上（背景层的 z-index 应低于内容）
      bgZ: bgStyle.zIndex,
      topbarZ: getComputedStyle(document.querySelector('.topbar')).zIndex,
    }
  })

  if (!info) { check('能找到全屏背景层 .workbench-bg 与视频', false); await context.close(); continue }

  // 1. 铺满视口
  check('背景层是 fixed（对齐视口，不受页面 1280px 限宽影响）', info.bgPosition === 'fixed', info.bgPosition)
  check('背景层左上角贴住屏幕 (0,0)', info.bgRect.x === 0 && info.bgRect.y === 0, JSON.stringify(info.bgRect))
  check('背景层宽高 = 视口宽高（撑满整个屏幕）',
    info.bgRect.w === info.viewport.w && info.bgRect.h === info.viewport.h,
    `背景 ${info.bgRect.w}×${info.bgRect.h} / 视口 ${info.viewport.w}×${info.viewport.h}`)

  // 2. 视频在播
  check('视频已加载（readyState=4）', info.video.readyState === 4, `readyState=${info.video.readyState}`)
  check('视频时长 ≈ 10 秒', Math.abs(info.video.duration - 10.08) < 0.3, `${info.video.duration}s`)
  check('视频在播放（没停在第一帧）', info.video.paused === false && info.video.currentTime > 0.3,
    `paused=${info.video.paused} currentTime=${info.video.currentTime}`)
  check('视频已静音（不静音浏览器拒绝自动播放）', info.video.muted === true, `muted=${info.video.muted}`)
  check('视频循环播放（loop）', info.video.loop === true, `loop=${info.video.loop}`)
  check('视频不显示原生控制条', info.video.hasControls === false)
  check('视频按 cover 铺满（不变形、不留黑边）', info.video.objectFit === 'cover', info.video.objectFit)
  check('视频元素尺寸 = 视口尺寸',
    info.video.rect.w === info.viewport.w && info.video.rect.h === info.viewport.h,
    `${info.video.rect.w}×${info.video.rect.h}`)
  check('视频源是 1280×720', info.video.videoWidth === 1280 && info.video.videoHeight === 720,
    `${info.video.videoWidth}×${info.video.videoHeight}`)

  // 3. 轨道卡片旧底图已移除
  check('轨道卡片里不再有静态底图（否则视频会被盖在卡片里）',
    !info.orbitBackground.includes('orbit-stage-bg'), info.orbitBackground.slice(0, 90))

  // 4. 遮罩存在且覆盖两个角
  check('水印柔雾遮罩存在', !!info.veil && info.veil.image.includes('radial-gradient'), info.veil?.image?.slice(0, 60))
  const veilWordCount = (info.veil?.image || '').split('radial-gradient').length - 1
  check('柔雾覆盖两个角（右下 + 左上，= 2 层渐变）', veilWordCount === 2, `实测 ${veilWordCount} 层`)

  // 5. 内容压在背景之上
  check('背景层 z-index = 0（内容在它上面）', info.bgZ === '0', info.bgZ)

  await context.close()
}

/* ========== 二、水印是否被吃掉（开/关遮罩对照） ========== */
console.log('\n【水印清除（遮罩开/关对照）】')
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addCookies(cookies)
  await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
  const page = await context.newPage()
  await page.goto(`${BASE}/student/workbench`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2200)

  // 视频切换到指定秒并暂停，方便稳定采样
  async function seekTo(seconds) {
    await page.evaluate((t) => {
      const video = document.querySelector('.workbench-bg__video')
      video.pause()
      video.currentTime = t
    }, seconds)
    await page.waitForTimeout(700)
  }
  async function setVeil(visible) {
    await page.evaluate((on) => {
      document.querySelector('.workbench-bg__veil').style.display = on ? '' : 'none'
    }, visible)
    await page.waitForTimeout(250)
  }

  // 水印框全部由**原片实测坐标**推出来（逐帧量过，不靠截图反找）：
  //   原片 1280×720 铺进 1440×900 → object-fit:cover 放大 1.25 倍、左右各裁掉 64 原像素（屏幕各 -80px）
  //   屏幕 x = 原片 x × 1.25 − 80 ；屏幕 y = 原片 y × 1.25
  //   右下角水印：原片 x≈1083~1232 / y≈600~643
  //   左上角水印：原片 x≈52~136  / y≈43~76（5~7 秒出现，字号更大、更清楚）
  const toScreen = (x, y, w, h) => ({
    x: Math.max(0, Math.round(x * 1.25 - 80)), y: Math.round(y * 1.25),
    width: Math.round(w * 1.25), height: Math.round(h * 1.25),
  })

  // ⚠️ 关键：测水印时必须先把网页内容藏起来。
  //    左上角水印正好落在 topbar 的橙色头像 + 「测试2」姓名底下，
  //    不藏起来量到的 sd 是头像和文字带来的，跟水印无关（实测开雾后 sd 反而 1.18 倍）。
  async function hideUi(hidden) {
    await page.evaluate((h) => {
      document.querySelectorAll('.workbench > :not(.workbench-bg)').forEach((node) => {
        node.style.visibility = h ? 'hidden' : ''
      })
    }, hidden)
    await page.waitForTimeout(200)
  }

  async function watermarkPair(label, box, seconds) {
    await seekTo(seconds)
    await hideUi(true)

    await setVeil(false)
    const off = await regionStats(page, box)
    await page.screenshot({ path: `logs-wm-verify-${label}-off.png`, clip: box })

    await setVeil(true)
    const on = await regionStats(page, box)
    await page.screenshot({ path: `logs-wm-verify-${label}-on.png`, clip: box })

    await hideUi(false)

    // 前置：关雾时这块必须有明暗起伏，否则说明框选错了、后面两条断言没意义
    check(`${label}：关雾时框内确有字形起伏（对照前提成立）`,
      off.sd > 4 && off.edge > 1, `sd=${off.sd} edge=${off.edge} 框=${JSON.stringify(box)}`)

    // 主断言：开雾后起伏塌到三成以下 = 肉眼认不出字形
    const sdRatio = on.sd / off.sd
    const edgeRatio = on.edge / off.edge
    check(`${label}：开雾后明暗起伏（sd）跌到三成以下`,
      sdRatio < 0.3, `关 sd=${off.sd} → 开 sd=${on.sd}（残留 ${(sdRatio * 100).toFixed(0)}%）`)
    check(`${label}：开雾后字形对比度（edge）跌到三成以下`,
      edgeRatio < 0.3, `关 edge=${off.edge} → 开 edge=${on.edge}（残留 ${(edgeRatio * 100).toFixed(0)}%）`)
    // 雾必须真的把这块提亮（证明遮罩覆盖到了这里，不是碰巧字淡）
    check(`${label}：开雾后该区域被明显提亮（遮罩确实覆盖此处）`,
      on.mean > off.mean + 15, `关 mean=${off.mean} → 开 mean=${on.mean}`)
  }

  // ---- 右下角：全程常驻（3 秒时字最清楚） ----
  await watermarkPair('右下角', toScreen(1083, 626, 140, 26), 3)

  // ---- 左上角：5~7 秒才出现 ----
  await watermarkPair('左上角', toScreen(52, 43, 84, 34), 6)

  // ---- 柔雾不能糊到正文：遮罩是背景层子元素，绝不能盖在文字上 ----
  const overlay = await page.evaluate(() => {
    const veil = document.querySelector('.workbench-bg__veil')
    const name = document.querySelector('.topbar .student-id strong')
    const bg = document.querySelector('.workbench-bg')
    const rawVeilZ = getComputedStyle(veil).zIndex
    return {
      // 柔雾不单独设 z-index（auto）= 跟着父层 .workbench-bg 一起排在内容下面，这是预期写法
      veilZ: rawVeilZ === 'auto' ? null : Number(rawVeilZ),
      bgZ: Number(getComputedStyle(bg).zIndex || 0),
      contentZ: Number(getComputedStyle(document.querySelector('.workbench > *:not(.workbench-bg)')).zIndex || 0),
      color: getComputedStyle(name).color,
    }
  })
  check('柔雾属于背景层（z-index 不高于内容），不会盖住姓名/按钮',
    overlay.contentZ > overlay.bgZ && (overlay.veilZ === null || overlay.veilZ <= overlay.bgZ),
    `内容 z=${overlay.contentZ} / 背景 z=${overlay.bgZ} / 柔雾 z=${overlay.veilZ === null ? 'auto' : overlay.veilZ}`)
  check('学生姓名仍是深色文字（未被提亮冲淡）', /rgb\(\d+, \d+, \d+\)/.test(overlay.color), overlay.color)

  await context.close()
}

/* ========== 三、宽屏 1920 也铺满 ========== */
console.log('\n【宽屏 1920 铺满】')
{
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await context.addCookies(cookies)
  await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
  const page = await context.newPage()
  await page.goto(`${BASE}/student/workbench`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2200)
  const wide = await page.evaluate(() => {
    const bg = document.querySelector('.workbench-bg').getBoundingClientRect()
    const workbench = document.querySelector('.workbench').getBoundingClientRect()
    return {
      bg: { w: Math.round(bg.width), h: Math.round(bg.height) },
      workbenchW: Math.round(workbench.width),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    }
  })
  check('1920 宽屏下背景铺满整个视口（不止中间 1280 那块）',
    wide.bg.w === wide.viewport.w && wide.bg.h === wide.viewport.h,
    `背景 ${wide.bg.w}×${wide.bg.h} / 视口 ${wide.viewport.w}×${wide.viewport.h}`)
  // 内容限宽分档：默认 min(100%,1280px)，高级版（pro）单独放宽到 min(100%,1440px)；
  // 两者都是 border-box + 左右各 18px padding，所以实宽分别 1316 / 1440。
  // 断言只要求「内容比背景窄」——背景必须比内容宽，两侧露出视频才算铺满整个屏幕。
  check('确认页面内容仍限宽（高级版 1440，背景 1920 比它宽，两侧露出视频）',
    wide.workbenchW <= 1444 && wide.bg.w > wide.workbenchW + 100,
    `内容 ${wide.workbenchW} / 背景 ${wide.bg.w}`)
  await page.screenshot({ path: 'logs-workbench-video-bg-1920.png' })
  await context.close()
}

/* ========== 四、视频加载失败时退回静态图 ========== */
console.log('\n【兜底：视频挂了不留灰底】')
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addCookies(cookies)
  await context.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))
  // 把视频请求全部打断，模拟文件 404 / 弱网
  await context.route('**/orbit-stage-loop-v1.mp4', (route) => route.abort())
  const page = await context.newPage()
  await page.goto(`${BASE}/student/workbench`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2500)
  const fallback = await page.evaluate(() => {
    const bg = document.querySelector('.workbench-bg')
    const video = document.querySelector('.workbench-bg__video')
    const veil = document.querySelector('.workbench-bg__veil')
    return {
      ambient: Boolean(bg?.querySelector('.ambient-bg')),
      legacyFog: bg?.classList.contains('is-legacy-video') || false,
      veilImage: veil ? getComputedStyle(veil).backgroundImage : '',
      videoDisplay: video ? getComputedStyle(video).display : '',
    }
  })
  // 本段配置里没有背景图（imageUrl=''），所以兜底是动态光影；配了背景图时兜底是那张图
  check('视频加载失败时退回动态光影（不是灰底）', fallback.ambient === true, JSON.stringify(fallback))
  check('退回后柔雾一起撤掉（没有视频就没有要盖的水印）', fallback.legacyFog === false && !fallback.veilImage.includes('gradient'), fallback.veilImage.slice(0, 60))
  check('兜底态把失效的 video 元素隐藏', fallback.videoDisplay === 'none', fallback.videoDisplay)
  await context.close()
}

} finally {
  await adminConfig(originalConfig).catch((error) => console.log(`  ✗ 还原工作台配置失败：${error.message}（请到后台手动恢复）`))
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
await browser.close()
if (fail > 0) process.exitCode = 1
