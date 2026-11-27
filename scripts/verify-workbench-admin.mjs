// 验收：后台「工作台管理」
//
// 覆盖 4 件事：
//   1. 学生端 /api/workbench-config 在「后台什么都没配」时返回完整 9 张卡的默认配置（不是空对象）
//   2. 上传卡片图 / LOGO / 背景视频 → 保存 → 学生端配置里真的带上这些地址
//   3. 背景视频走 Range 请求能拿到 206 + Content-Range（iOS 能播、进度条能拖）
//   4. 非法值（外链 / 越级路径 / 假卡片 id）被后端丢弃；恢复默认能回到内置外观
//
// 跑法：env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY node scripts/verify-workbench-admin.mjs
// 零花费：全程不调任何 AI 接口，图片用 1×1 PNG 现造。
// 零污染：验收前把原配置备份到内存，结束后原样写回，不覆盖用户已有的真实配置。
//
// ⚠️ 认证走 HttpOnly cookie（ai_art_session），不是 Bearer token。
//    所以所有请求都发到 5173 的同源 /api 代理，让浏览器自己带 cookie；
//    直接打 3000 端口拿不到 cookie，会一路 401。
import { createRequire } from 'node:module'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const WEB = process.env.WEB_BASE || 'http://127.0.0.1:5173'
const ADMIN = { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }
// 学生端必须用学生账号验收：管理员会被路由守卫弹回 /admin。
const STUDENT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }

let passed = 0
let failed = 0
const failures = []

function ok(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

// 1×1 纯色 PNG：够 sharp 处理，又小到不会拖慢验收。
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
// 最小 MP4 头（ftyp + 空 moov）：只为验证落盘与 Range，不要求真能播放画面。
const TINY_MP4_BASE64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhmcmVl'

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  // 所有请求走同源 /api：vite 代理转发到 3000，cookie 自动带上。
  const api = `${WEB}/api`
  let backup = null
  // 本次验收上传的假素材，结束后逐个删掉，别在服务器上越堆越多。
  const uploadedAssets = []

  try {
    section('一、登录后台并确认菜单里有「工作台管理」')
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' })
    const loginResult = await page.evaluate(async ({ api, admin }) => {
      const response = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(admin),
      })
      return { status: response.status, body: await response.json() }
    }, { api, admin: ADMIN })
    ok('管理员登录成功', loginResult.status === 200 && loginResult.body?.ok, `status=${loginResult.status}`)
    ok('登录身份是管理员', loginResult.body?.user?.role === 'admin', loginResult.body?.user?.role)

    // 先备份原配置，验收结束原样写回，绝不覆盖用户真实配置。
    backup = await page.evaluate(async ({ api }) => {
      const response = await fetch(`${api}/admin/workbench-config`)
      if (!response.ok) return null
      return (await response.json()).config
    }, { api })
    ok('读到当前配置（用于验收后还原）', backup !== null)

    await page.goto(`${WEB}/admin`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    // 「功能管理」是折叠组，先展开才看得到子项。
    // ⚠️ 必须点 .nav-group-toggle：组标题和子项都是 button，
    //    只按文字找会点到别的东西，或者因为 v-show 没展开而 innerText 拿不到子项。
    // ⚠️ 选择器按「功能管理」文字限定，不能用 .first() —— 页面上还有「作品广场」分组。
    // 🔴 展开状态记在 localStorage 里，上一个脚本可能已经留成展开态，这时再点一下反而收起（踩过）。
    //    更坑的是「读 isVisible 判断」也不可靠：页面刚进 admin 时组件还没把 localStorage 的状态应用上，
    //    读到「未展开」→ 点一下 → 此刻状态恢复成已展开 → 这一下把面板关掉 → 后面所有子项断言全挂。
    //    所以不能猜当前状态，改成「点完用 aria-expanded 复核，不对就再点」，最多 3 次，与初始状态无关。
    const fmGroup = page.locator('.nav-group').filter({ hasText: '功能管理' }).first()
    const fmToggle = fmGroup.locator('.nav-group-toggle')
    const fmBody = fmGroup.locator('.nav-group-body')
    const fmExpanded = () => fmToggle.getAttribute('aria-expanded').catch(() => null)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if ((await fmExpanded()) === 'true' && (await fmBody.isVisible().catch(() => false))) break
      await fmToggle.click({ timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(400)
    }
    ok('「功能管理」分组已展开', (await fmExpanded()) === 'true', `aria-expanded=${await fmExpanded()}`)
    const menuText = await page.locator('.admin-nav').innerText().catch(() => '')
    ok('侧栏出现「工作台管理」', menuText.includes('工作台管理'), menuText.replace(/\s+/g, ' ').slice(0, 240))
    const workbenchChildVisible = await fmGroup.locator('.nav-child', { hasText: '工作台管理' }).isVisible().catch(() => false)
    ok('「工作台管理」在功能管理分组里可见', workbenchChildVisible)

    section('二、默认配置：后台没配过时必须是完整 9 张卡')
    const initial = await page.evaluate(async ({ api }) => {
      const response = await fetch(`${api}/workbench-config`)
      return { status: response.status, body: await response.json() }
    }, { api })
    ok('学生端能读到配置', initial.status === 200 && initial.body?.ok, `status=${initial.status}`)
    const config0 = initial.body?.config || {}
    ok('返回 9 张卡', Array.isArray(config0.cards) && config0.cards.length === 9, `实际 ${config0.cards?.length}`)
    ok('每张卡都有 id / title / visible', (config0.cards || []).every((card) => card.id && card.title && typeof card.visible === 'boolean'))
    ok('卡片顺序是内置顺序', (config0.cards || []).map((c) => c.id).join(',') === 'courses,paint,sketchpad,video,canvas,model3d,gallery,portfolio,reports', (config0.cards || []).map((c) => c.id).join(','))

    const adminConfig = await page.evaluate(async ({ api }) => {
      const response = await fetch(`${api}/admin/workbench-config`)
      return { status: response.status, body: await response.json() }
    }, { api })
    ok('后台读配置接口可用', adminConfig.status === 200 && adminConfig.body?.ok, `status=${adminConfig.status}`)
    ok('后台能拿到 5 个构图位置', Object.keys(adminConfig.body?.positions || {}).length === 5, `实际 ${Object.keys(adminConfig.body?.positions || {}).length}`)

    // 从这一步开始是「空配置」基线，先清空，保证后面断言不受历史配置影响。
    await page.evaluate(async ({ api }) => {
      await fetch(`${api}/admin/workbench-config/reset`, { method: 'POST' })
    }, { api })

    section('三、上传卡片图（sharp 压缩成 720×960 webp）')
    const cardUpload = await page.evaluate(async ({ api, png }) => {
      const response = await fetch(`${api}/admin/workbench-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'card', mediaType: 'image', imageData: `data:image/png;base64,${png}` }),
      })
      return { status: response.status, body: await response.json() }
    }, { api, png: TINY_PNG_BASE64 })
    ok('卡片图上传成功', cardUpload.status === 201 && cardUpload.body?.ok, `status=${cardUpload.status} ${cardUpload.body?.message || ''}`)
    const cardUrl = cardUpload.body?.assetUrl || ''
    if (cardUrl) uploadedAssets.push(cardUrl)
    ok('返回 /api/workbench-assets/ 前缀地址', cardUrl.startsWith('/api/workbench-assets/'), cardUrl)
    ok('文件名是 card- 前缀 + webp', /\/card-\d+-[a-z0-9]+\.(webp|png|jpg)$/.test(cardUrl), cardUrl)

    section('四、上传 LOGO（必须未登录也能取到，否则登录页换不了）')
    const logoUpload = await page.evaluate(async ({ api, png }) => {
      const response = await fetch(`${api}/admin/workbench-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'logo', mediaType: 'image', imageData: `data:image/png;base64,${png}` }),
      })
      return { status: response.status, body: await response.json() }
    }, { api, png: TINY_PNG_BASE64 })
    const logoUrl = logoUpload.body?.assetUrl || ''
    if (logoUrl) uploadedAssets.push(logoUrl)
    ok('LOGO 上传成功', logoUpload.status === 201 && logoUrl.startsWith('/api/workbench-assets/logo-'), `status=${logoUpload.status} ${logoUpload.body?.message || ''}`)

    // 换一个干净 context（没有 cookie）来验「未登录也能拿 LOGO」。
    const anonContext = await browser.newContext()
    const anonPage = await anonContext.newPage()
    await anonPage.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' })
    const anonLogo = await anonPage.evaluate(async ({ api, url }) => {
      const response = await fetch(`${api}${url.replace(/^\/api/, '')}`)
      return { status: response.status, type: response.headers.get('content-type') }
    }, { api, url: logoUrl })
    ok('未登录也能读到 LOGO 图', anonLogo.status === 200, `status=${anonLogo.status}`)
    ok('LOGO 返回图片类型', String(anonLogo.type || '').startsWith('image/'), anonLogo.type)

    const anonCard = await anonPage.evaluate(async ({ api, url }) => {
      const response = await fetch(`${api}${url.replace(/^\/api/, '')}`)
      return { status: response.status }
    }, { api, url: cardUrl })
    ok('未登录读不到卡片图（只有 LOGO 例外）', anonCard.status === 401, `status=${anonCard.status}`)
    await anonContext.close()

    section('五、上传背景视频并验证 Range（iOS 播放的前提）')
    const videoUpload = await page.evaluate(async ({ api, mp4 }) => {
      const response = await fetch(`${api}/admin/workbench-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'bg', mediaType: 'video', dataBase64: mp4 }),
      })
      return { status: response.status, body: await response.json() }
    }, { api, mp4: TINY_MP4_BASE64 })
    const videoUrl = videoUpload.body?.assetUrl || ''
    if (videoUrl) uploadedAssets.push(videoUrl)
    ok('背景视频上传成功', videoUpload.status === 201 && videoUrl.startsWith('/api/workbench-assets/bg-'), `status=${videoUpload.status} ${videoUpload.body?.message || ''}`)

    const rangeResult = await page.evaluate(async ({ api, url }) => {
      const response = await fetch(`${api}${url.replace(/^\/api/, '')}`, { headers: { Range: 'bytes=0-7' } })
      return {
        status: response.status,
        contentRange: response.headers.get('content-range'),
        acceptRanges: response.headers.get('accept-ranges'),
        contentLength: response.headers.get('content-length'),
      }
    }, { api, url: videoUrl })
    ok('Range 请求返回 206', rangeResult.status === 206, `status=${rangeResult.status}`)
    ok('带 Content-Range 响应头', /^bytes 0-7\/\d+$/.test(rangeResult.contentRange || ''), rangeResult.contentRange)
    ok('带 Accept-Ranges: bytes', rangeResult.acceptRanges === 'bytes', rangeResult.acceptRanges)
    ok('返回长度等于请求区间', rangeResult.contentLength === '8', rangeResult.contentLength)

    section('六、保存配置 → 学生端读到新图')
    const saveResult = await page.evaluate(async ({ api, cardUrl, logoUrl, videoUrl }) => {
      const response = await fetch(`${api}/admin/workbench-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            brand: { logoUrl },
            background: { imageUrl: '', videoUrl },
            cards: [
              { id: 'paint', imageUrl: cardUrl, position: 'right', visible: true },
              { id: 'video', imageUrl: '', position: 'center', visible: false },
            ],
          },
        }),
      })
      return { status: response.status, body: await response.json() }
    }, { api, cardUrl, logoUrl, videoUrl })
    ok('保存配置成功', saveResult.status === 200 && saveResult.body?.ok, `status=${saveResult.status}`)
    const savedConfig = saveResult.body?.config || {}
    const savedPaint = (savedConfig.cards || []).find((card) => card.id === 'paint')
    const savedVideo = (savedConfig.cards || []).find((card) => card.id === 'video')
    ok('AI绘画卡的图已保存', savedPaint?.imageUrl === cardUrl, savedPaint?.imageUrl)
    ok('AI绘画卡的构图位置已保存', savedPaint?.position === 'right', savedPaint?.position)
    ok('AI视频卡已设为隐藏', savedVideo?.visible === false, String(savedVideo?.visible))
    ok('LOGO 已保存', savedConfig.brand?.logoUrl === logoUrl)
    ok('背景视频已保存', savedConfig.background?.videoUrl === videoUrl)
    ok('保存后带上了更新时间', Boolean(savedConfig.updatedAt))

    const studentConfig = await page.evaluate(async ({ api }) => {
      const response = await fetch(`${api}/workbench-config`)
      return (await response.json()).config
    }, { api })
    const studentPaint = (studentConfig.cards || []).find((card) => card.id === 'paint')
    ok('学生端读到同一张卡片图', studentPaint?.imageUrl === cardUrl, studentPaint?.imageUrl)
    ok('学生端卡片顺序仍是内置顺序', studentConfig.cards[0].id === 'courses' && studentConfig.cards[8].id === 'reports', studentConfig.cards.map((c) => c.id).join(','))

    const brandApi = await page.evaluate(async ({ api }) => {
      const response = await fetch(`${api}/brand-logo`)
      return (await response.json()).logoUrl
    }, { api })
    ok('未登录品牌接口吐出了 LOGO 地址', brandApi === logoUrl, brandApi)

    section('七、非法值一律被丢弃（防止后台把卡片填成外链）')
    const dirtySave = await page.evaluate(async ({ api }) => {
      const response = await fetch(`${api}/admin/workbench-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            brand: { logoUrl: 'https://evil.example.com/x.png' },
            background: { imageUrl: '../../etc/passwd', videoUrl: 'javascript:alert(1)' },
            cards: [
              { id: 'paint', imageUrl: 'https://evil.example.com/a.png', position: 'hacked', visible: true },
              { id: 'not-a-real-card', imageUrl: '/assets/x.png', visible: true },
            ],
          },
        }),
      })
      return (await response.json()).config
    }, { api })
    ok('外链 LOGO 被丢弃', dirtySave.brand?.logoUrl === '', dirtySave.brand?.logoUrl)
    ok('越级路径被丢弃', dirtySave.background?.imageUrl === '', dirtySave.background?.imageUrl)
    ok('javascript: 伪协议被丢弃', dirtySave.background?.videoUrl === '', dirtySave.background?.videoUrl)
    const dirtyPaint = (dirtySave.cards || []).find((card) => card.id === 'paint')
    ok('外链卡片图被丢弃', dirtyPaint?.imageUrl === '', dirtyPaint?.imageUrl)
    ok('非法构图位置退回居中', dirtyPaint?.position === 'center', dirtyPaint?.position)
    ok('不认识的卡片 id 被忽略', (dirtySave.cards || []).length === 9, `实际 ${dirtySave.cards?.length}`)

    section('八、旧素材可删除（换图后不留垃圾，但正在用的不许删）')
    // 专门传一张「用完就删」的图来验删除，不占用后面第九段还要用的 cardUrl。
    const throwaway = await page.evaluate(async ({ api, png }) => {
      const response = await fetch(`${api}/admin/workbench-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'card', mediaType: 'image', imageData: `data:image/png;base64,${png}` }),
      })
      return (await response.json()).assetUrl || ''
    }, { api, png: TINY_PNG_BASE64 })
    ok('临时素材上传成功（用于验删除）', Boolean(throwaway), throwaway)

    // 先把它挂到 paint 卡上，此时它「正在使用」，删除必须被拒。
    await page.evaluate(async ({ api, throwaway }) => {
      await fetch(`${api}/admin/workbench-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { cards: [{ id: 'paint', imageUrl: throwaway }] } }),
      })
    }, { api, throwaway })
    const deleteInUse = await page.evaluate(async ({ api, url }) => {
      const fileName = decodeURIComponent(url.split('/').pop() || '')
      const response = await fetch(`${api}/admin/workbench-assets`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      })
      return { status: response.status, body: await response.json() }
    }, { api, url: throwaway })
    ok('正在使用的素材不许删（409）', deleteInUse.status === 409 && deleteInUse.body?.ok === false, `status=${deleteInUse.status}`)

    const stillReadable = await page.evaluate(async ({ api, url }) => {
      const response = await fetch(`${api}${url.replace(/^\/api/, '')}`)
      return response.status
    }, { api, url: throwaway })
    ok('被拒绝后图片仍然读得到（没被误删）', stillReadable === 200, `status=${stillReadable}`)

    // 解除引用后同一个文件必须能删掉 —— 这条是「换图不留垃圾」的核心保证。
    await page.evaluate(async ({ api }) => {
      await fetch(`${api}/admin/workbench-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { cards: [] } }),
      })
    }, { api })
    const deleteFree = await page.evaluate(async ({ api, url }) => {
      const fileName = decodeURIComponent(url.split('/').pop() || '')
      const response = await fetch(`${api}/admin/workbench-assets`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      })
      return { status: response.status, body: await response.json() }
    }, { api, url: throwaway })
    ok('解除引用后可以删除（200）', deleteFree.status === 200 && deleteFree.body?.ok === true, `status=${deleteFree.status}`)

    const afterDelete = await page.evaluate(async ({ api, url }) => {
      // 必须绕开缓存：素材带强缓存头，直接 fetch 会命中缓存返回 200，测的就不是磁盘状态了。
      const response = await fetch(`${api}${url.replace(/^\/api/, '')}`, { cache: 'no-store' })
      return response.status
    }, { api, url: throwaway })
    ok('删掉之后图片读不到了', afterDelete === 404, `status=${afterDelete}`)

    // 非法文件名一律拒绝：不能靠它去删配置、删别人的文件。
    const badNames = ['../../etc/passwd', '../workbench-config.json', 'logo-1-x.png', '']
    const badStatuses = []
    for (const bad of badNames) {
      const result = await page.evaluate(async ({ api, fileName }) => {
        const response = await fetch(`${api}/admin/workbench-assets`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName }),
        })
        return response.status
      }, { api, fileName: bad })
      badStatuses.push(result)
    }
    ok('非法文件名全部被拒（400）', badStatuses.every((s) => s === 400), badStatuses)

    // 未登录必须 401：这里 page 带着登录 cookie，得另开一个匿名 context。
    const anonCtx2 = await browser.newContext()
    const anonPage2 = await anonCtx2.newPage()
    await anonPage2.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' })
    const anonDeleteStatus = await anonPage2.evaluate(async ({ api, url }) => {
      const fileName = decodeURIComponent(url.split('/').pop() || '')
      const response = await fetch(`${api}/admin/workbench-assets`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      })
      return response.status
    }, { api, url: logoUrl })
    await anonCtx2.close()
    ok('未登录不能删素材（401）', anonDeleteStatus === 401, `status=${anonDeleteStatus}`)

    section('九、学生端页面真的用上了配置')
    // 重新写入一份干净配置，再去看页面。
    await page.evaluate(async ({ api, cardUrl, logoUrl, videoUrl }) => {
      await fetch(`${api}/admin/workbench-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            brand: { logoUrl },
            background: { imageUrl: '', videoUrl },
            cards: [
              { id: 'paint', imageUrl: cardUrl, position: 'right', visible: true },
              { id: 'video', imageUrl: '', position: 'center', visible: false },
            ],
          },
        }),
      })
    }, { api, cardUrl, logoUrl, videoUrl })

    // 轨道卡片只在 pro 难度下出现，直接置位避免多跑一轮点击。
    // ⚠️ 必须用学生账号：管理员打开 /student/workbench 会被路由守卫弹回 /admin，
    //    页面上永远找不到卡片（这个坑踩过一次，别再拿管理员身份验学生端）。
    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()
    await studentPage.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' })
    const studentLogin = await studentPage.evaluate(async ({ api, student }) => {
      const response = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(student),
      })
      return { status: response.status, body: await response.json() }
    }, { api, student: STUDENT })
    ok('学生账号登录成功', studentLogin.status === 200 && studentLogin.body?.ok, `status=${studentLogin.status} ${studentLogin.body?.message || ''}`)

    await studentPage.evaluate(() => localStorage.setItem('art-studio-difficulty', 'pro'))
    await studentPage.goto(`${WEB}/student/workbench`, { waitUntil: 'domcontentloaded' })
    await studentPage.waitForTimeout(2800)
    const landedPath = new URL(studentPage.url()).pathname
    ok('学生留在工作台（没被弹走）', landedPath.includes('/student/workbench'), landedPath)
    const cardCount = await studentPage.locator('.orbit-card').count()
    // 9 张卡里隐藏了 1 张 → 应该剩 8 张。
    ok('隐藏 1 张后只剩 8 张卡', cardCount === 8, `实际 ${cardCount} 张`)
    const surfaceStyles = await studentPage.evaluate(() => [...document.querySelectorAll('.orbit-card__surface')].map((el) => el.style.backgroundImage))
    ok('卡片图用上了后台配的地址', surfaceStyles.some((style) => style.includes('/api/workbench-assets/card-')), surfaceStyles.join(' | ').slice(0, 200))
    const bgVideoSrc = await studentPage.evaluate(() => document.querySelector('.workbench-bg__video')?.getAttribute('src') || '')
    ok('背景用上了后台配的视频', bgVideoSrc.includes('/api/workbench-assets/bg-'), bgVideoSrc)
    // ⚠️ 这里传的是「只有 ftyp 头、没有视频轨」的假 MP4，浏览器必然解码失败。
    //    所以不能断言「视频在播」，而应该断言「播不出来时正确兜底」——
    //    这才是这个假文件能验到的东西，也是真实场景（文件坏了 / 弱网断了）的兜底路径。
    //    兜底顺序（2026-11-25 起）：后台传过背景图 → 铺那张图；没传（本用例 imageUrl=''）→ 内置「动态光影」。
    const bgFallback = await studentPage.evaluate(() => {
      const el = document.querySelector('.workbench-bg')
      return {
        ambient: Boolean(el?.querySelector('.ambient-bg')),
        isFallback: el?.classList.contains('is-fallback'),
        videoHidden: document.querySelector('.workbench-bg__video')?.style.display === 'none',
      }
    })
    ok('假视频播不出来、又没配背景图时退回内置动态光影（不留灰底）', bgFallback.ambient === true && bgFallback.isFallback === false, JSON.stringify(bgFallback).slice(0, 180))
    ok('退回时视频被藏起来', bgFallback.videoHidden === true, String(bgFallback.videoHidden))
    await studentContext.close()

    // 登录页 LOGO：换个干净 context 打开 /login，看 .brand-mark 里有没有 img。
    const logoContext = await browser.newContext()
    const logoPage = await logoContext.newPage()
    await logoPage.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' })
    await logoPage.waitForTimeout(1500)
    const loginLogo = await logoPage.evaluate(() => {
      const mark = document.querySelector('.brand-mark')
      return { hasImg: Boolean(mark?.querySelector('img')), src: mark?.querySelector('img')?.getAttribute('src') || '', text: mark?.textContent?.trim() || '' }
    })
    ok('登录页显示的是上传的 LOGO', loginLogo.hasImg && loginLogo.src.includes('/api/workbench-assets/logo-'), `hasImg=${loginLogo.hasImg} src=${loginLogo.src}`)
    ok('登录页不再显示「AI」文字方块', loginLogo.text === '', `text=${loginLogo.text}`)
    await logoContext.close()

    section('十、恢复默认 → 回到内置外观')
    const resetResult = await page.evaluate(async ({ api }) => {
      const response = await fetch(`${api}/admin/workbench-config/reset`, { method: 'POST' })
      return { status: response.status, body: await response.json() }
    }, { api })
    ok('恢复默认成功', resetResult.status === 200 && resetResult.body?.ok, `status=${resetResult.status}`)
    const resetConfig = resetResult.body?.config || {}
    ok('卡片图已清空', (resetConfig.cards || []).every((card) => card.imageUrl === ''))
    ok('背景与 LOGO 已清空', resetConfig.background?.videoUrl === '' && resetConfig.brand?.logoUrl === '')
    ok('所有卡片恢复显示', (resetConfig.cards || []).every((card) => card.visible === true))

    const brandAfterReset = await page.evaluate(async ({ api }) => {
      const response = await fetch(`${api}/brand-logo`)
      return (await response.json()).logoUrl
    }, { api })
    ok('未登录品牌接口回到空值', brandAfterReset === '', brandAfterReset)
  } finally {
    // 还原用户原有配置（备份为空则保持默认），绝不给用户留一份验收用的假配置。
    if (backup) {
      await page.evaluate(async ({ api, config }) => {
        await fetch(`${api}/admin/workbench-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        })
      }, { api, config: backup }).catch(() => {})
      console.log('\n· 已把验收前的原配置写回')
    }
    // 顺序不能反：必须先把配置还原（假素材已不再被引用），再删文件。
    // 否则服务端会以「这张图还在使用中」拒绝删除，假文件就留下了。
    if (uploadedAssets.length) {
      const removed = await page.evaluate(async ({ api, urls }) => {
        let count = 0
        for (const url of urls) {
          const fileName = decodeURIComponent(url.split('/').pop() || '')
          if (!fileName) continue
          const response = await fetch(`${api}/admin/workbench-assets`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName }),
          })
          if (response.ok) count += 1
        }
        return count
      }, { api, urls: uploadedAssets }).catch(() => 0)
      console.log(`· 已清理本次验收上传的假素材 ${removed}/${uploadedAssets.length} 个`)
    }
    await browser.close().catch(() => {})
  }

  console.log(`\n${'='.repeat(56)}`)
  console.log(`通过 ${passed} 项，失败 ${failed} 项`)
  if (failed) {
    console.log('失败项：')
    failures.forEach((item) => console.log(`  - ${item}`))
  }
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error('\n验收脚本异常：', error)
  process.exit(1)
})
