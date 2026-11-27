// 用**真实技能包**跑完整链路验收（brand-ip.zip，26KB，来自 ~/.workbuddy/skills）：
//  ① 上传 zip → 自动解出 SKILL.md → 列表出现卡片（标题/作者/候选提示词都对）
//  ② 转成玩法（老师填提示词）→ 草稿卡出现在图像玩法列表
//  ③ 学生端此时看不到
//  ④ 标记测试通过 → 发布 → 学生端「技能玩法」能看到这张卡，且带封面/标题
//
// 全程不调付费出图接口（发布门槛用 PATCH 写 testedAt 满足，不跑真实生成）。
import { createRequire } from 'node:module'
import path from 'node:path'
import { existsSync } from 'node:fs'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3000'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
const ZIP_PATH = path.join(OUT_DIR, 'brand-ip.zip')
const COVER_PATH = path.join(OUT_DIR, 'test-cover.png')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const failures = []
function check(name, ok, detail) {
  results.push({ name, pass: Boolean(ok), detail })
  if (!ok) failures.push(`${name} :: ${String(JSON.stringify(detail ?? '')).slice(0, 300)}`)
  // detail 可能没传（undefined）：JSON.stringify(undefined) 返回 undefined，直接 .slice 会崩，先兜一层。
  const shown = typeof detail === 'string' ? detail : String(JSON.stringify(detail ?? '')).slice(0, 200)
  console.log(`${ok ? '✅' : '❌'} ${name}${shown ? ` — ${shown}` : ''}`)
}

async function login() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
  })
  const cookie = (response.headers.getSetCookie?.() || []).map((item) => item.split(';')[0]).join('; ')
  const payload = await response.json()
  return { cookie, user: payload.user }
}
// 学生端要用学生账号看：管理员身份进 /student/paint 的侧边栏口径不同，看到的不是学生真实视图。
async function studentLogin() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
  })
  const raw = (response.headers.getSetCookie?.() || []).join('; ')
  return raw.match(/ai_art_session=([^;]+)/)?.[1] || ''
}

async function api(cookie, method, pathname, body) {  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: response.status, json, text }
}

async function main() {
  if (!existsSync(ZIP_PATH)) { console.log(`缺少 ${ZIP_PATH}，先打 zip`); process.exit(1) }

  const admin = await login()
  check('管理员登录成功', Boolean(admin.user?.id), admin.user?.account)

  let browser
  const created = { packageIds: [], skillIds: [] }
  try {
    browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.evaluate(async () => {
      await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }),
      })
    })
    await page.goto(`${BASE}/admin?module=featureManagement&type=packages`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.package-page', { timeout: 30000 })
    await delay(1500)

    // ① 上传真实 zip
    await page.setInputFiles('.package-header input[type="file"]', ZIP_PATH)
    await delay(5000)

    const cards = page.locator('.package-card')
    const cardCount = await cards.count()
    check('上传真实 zip 后出现技能包卡片', cardCount > 0, `${cardCount} 张`)

    const firstCard = cards.first()
    const title = (await firstCard.locator('strong').first().textContent().catch(() => '')).trim()
    check('从 zip 里自动识别出标题', Boolean(title) && title !== '（这个技能包没有写简介）', title)

    const metaText = await firstCard.locator('.card-meta').textContent().catch(() => '')
    check('卡片显示候选提示词条数', /条候选提示词/.test(metaText || ''), metaText?.replace(/\s+/g, ' ').trim().slice(0, 80))

    // 通过接口确认解析细节
    const listRes = await api(admin.cookie, 'GET', '/api/admin/ai-skill-packages')
    const imported = (listRes.json?.packages || [])[0]
    if (imported) created.packageIds.push(imported.id)
    check('后端解析出 packageKey', Boolean(imported?.packageKey), imported?.packageKey)
    check('后端解析出作者信息', Boolean(imported?.metadata?.author), imported?.metadata?.author)
    // 列表接口按设计不返回正文（正文很大），正文只在详情接口返回。
    const detailRes = await api(admin.cookie, 'GET', `/api/admin/ai-skill-packages/${imported?.id}`)
    const bodyLength = (detailRes.json?.package?.body || '').length
    check('详情接口返回正文', bodyLength > 200, `${bodyLength} 字`)

    // ② 转成玩法
    await firstCard.locator('button', { hasText: '转成玩法' }).click()
    await delay(1200)
    const dialog = page.locator('.el-dialog', { hasText: '把技能包转成玩法' })
    check('打开转成玩法对话框', await dialog.count() > 0)

    // 用第一条候选，但改造成画面描述（老师真实操作就是这样）
    const promptBox = dialog.locator('.prompt-input')
    await promptBox.first().fill('一个原创卡通IP角色设定卡，主体是{{subject}}，正面站立，白色背景，清晰轮廓，角色设定稿风格，配色明快')
    const titleInput = dialog.locator('input').first()
    const finalTitle = `验收IP角色${Date.now().toString(36).slice(-4)}`
    await titleInput.fill(finalTitle)

    // 上传封面图：真实技能包里通常没有配图（brand-ip.zip 里只有 SKILL.md 和 json），
    // 封面只能老师自己传。这一步必须验，否则学生端卡片永远是灰占位。
    if (existsSync(COVER_PATH)) {
      await dialog.locator('input[type="file"]').setInputFiles(COVER_PATH)
      await delay(4000)
      const coverPreview = await dialog.locator('.cover-preview img').count()
      check('封面图上传后出现预览', coverPreview > 0, `${coverPreview} 张预览`)
    }
    await delay(300)
    await dialog.locator('.el-dialog__footer button', { hasText: '生成草稿玩法' }).click()
    await delay(4500)

    const msgBox = page.locator('.el-message-box')
    if (await msgBox.count()) {
      const later = msgBox.locator('button', { hasText: '稍后再说' })
      if (await later.count()) await later.click()
      await delay(800)
    }

    // 从接口拿转出来的 skillId
    const afterConvert = await api(admin.cookie, 'GET', '/api/admin/ai-skill-packages')
    const conv = (afterConvert.json?.packages || []).find((item) => item.id === imported?.id)
    if (conv?.convertedSkillId) created.skillIds.push(conv.convertedSkillId)
    check('技能包状态变「已转玩法」', conv?.status === 'converted', conv?.status)
    check('回填了玩法 ID', Boolean(conv?.convertedSkillId), conv?.convertedSkillId)

    const skillRes = await api(admin.cookie, 'GET', `/api/admin/ai-skills/${conv?.convertedSkillId}`)
    const skill = skillRes.json?.skill
    // 草稿配置在 draftConfiguration（configuration 是已发布配置，草稿阶段为空对象）。
    const draftConfig = skill?.draftConfiguration || skill?.configuration || {}
    check('转出的玩法是草稿状态', skill?.status === 'draft', skill?.status)
    check('提示词写进了 runtime', String(draftConfig?.runtime?.promptTemplate || '').includes('{{subject}}'), String(draftConfig?.runtime?.promptTemplate || '').slice(0, 60))

    // ③ 学生端此时看不到
    const studentBefore = await api(admin.cookie, 'GET', '/api/ai-skills?type=image')
    const visibleBefore = (studentBefore.json?.skills || []).some((item) => item.id === skill?.id)
    check('草稿玩法学生端看不到', !visibleBefore, `学生端共 ${(studentBefore.json?.skills || []).length} 个`)

    // ④ 标记测试通过 → 发布
    await api(admin.cookie, 'PATCH', `/api/admin/ai-skills/${skill.id}`, {
      configuration: { ...draftConfig, runtime: { ...(draftConfig?.runtime || {}), testedAt: new Date().toISOString() } },
    })
    const publish = await api(admin.cookie, 'POST', `/api/admin/ai-skills/${skill.id}/publish`, {})
    check('测试通过后可发布', publish.status < 400 && publish.json?.skill?.status === 'published', publish.status)

    const studentAfter = await api(admin.cookie, 'GET', '/api/ai-skills?type=image')
    const visible = (studentAfter.json?.skills || []).find((item) => item.id === skill.id)
    check('发布后学生端「技能玩法」能看到', Boolean(visible), visible?.title)
    check('学生端拿到的卡片带标题', visible?.title === finalTitle, visible?.title)

    // ⑤ 学生端页面真的渲染出这张卡
    // 必须换成**学生账号**访问：管理员看到的侧边栏口径不同，而且 starter 难度默认停在「提示词库」，
    // 卡片列表被 v-else 挡住。这里直接用 pro 难度，侧边栏标题就是「技能玩法」，卡片列表直接可见。
    const studentSession = await studentLogin()
    check('学生账号登录成功', Boolean(studentSession), 'ceshi2')
    const studentContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await studentContext.addCookies([{ name: 'ai_art_session', value: studentSession, url: BASE }])
    await studentContext.addInitScript(() => window.localStorage.setItem('art-studio-difficulty', 'pro'))
    const studentPage = await studentContext.newPage()
    const studentErrors = []
    studentPage.on('pageerror', (e) => studentErrors.push(`pageerror: ${e.message}`))

    await studentPage.goto(`${BASE}/student/paint`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await delay(4000)

    // 学生账号本地可能残留上次的草稿，进页面会弹「发现上次没做完的作品」，它会盖住侧边栏导致点不到卡片。
    // 点「新建」把它关掉，不然后面所有点击都会被遮罩拦下。
    const resumeDialog = studentPage.locator('.el-dialog', { hasText: '发现上次没做完的作品' })
    if (await resumeDialog.count()) {
      const freshBtn = resumeDialog.locator('button', { hasText: '新建' })
      if (await freshBtn.count()) await freshBtn.first().click()
      await delay(1000)
    }

    const sidebarTitle = await studentPage.locator('.workflow-card h2').first().textContent().catch(() => '')
    check('侧边栏是「技能玩法」', /技能玩法/.test(sidebarTitle || ''), sidebarTitle?.trim())

    const cardTexts = await studentPage.$$eval('.paint-skill-card', (els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
    check('学生端「技能玩法」列表出现这张卡', cardTexts.some((text) => text.includes(finalTitle)), cardTexts.slice(0, 8))

    // 卡片封面是背景图（不是 img），要读 has-cover 类 + 计算后的 backgroundImage。
    const coverState = await studentPage.evaluate((wanted) => {
      const card = [...document.querySelectorAll('.paint-skill-card')].find((el) => el.textContent.includes(wanted))
      if (!card) return { found: false }
      const art = card.querySelector('.paint-skill-art')
      const bg = art ? getComputedStyle(art).backgroundImage : ''
      return { found: true, hasCover: Boolean(art?.classList.contains('has-cover')), bg: (bg || '').slice(0, 120) }
    }, finalTitle)
    check('学生端卡片真的用上了封面图', coverState.found && coverState.hasCover && /url\(/.test(coverState.bg), coverState)

    await studentPage.screenshot({ path: path.join(OUT_DIR, 'skill-package-student-visible.png'), fullPage: true })

    // ⑥ 点进去能打开独立页面
    if (cardTexts.some((text) => text.includes(finalTitle))) {
      const target = studentPage.locator('.paint-skill-card', { hasText: finalTitle }).first()
      // 用 force + 短超时：万一还有别的浮层，也不要让整条验收卡 30 秒。
      await target.click({ force: true, timeout: 8000 }).catch(() => target.evaluate((el) => el.click()))
      await delay(3500)
      const url = studentPage.url()
      check('点击卡片跳到独立技能页面', /\/student\/skills\//.test(url), url.replace(BASE, ''))
      // 根类名是 student-skill-page；加载成功才会出现 runner-shell（表单区）。
      const pageRendered = await studentPage.locator('.student-skill-page').count()
      check('独立页面正常渲染学生表单', pageRendered > 0, `${pageRendered} 个 .student-skill-page`)
      const shellRendered = await studentPage.locator('.runner-shell').count()
      check('技能配置加载成功（出现表单区）', shellRendered > 0, `.runner-shell ${shellRendered} 个`)
      const loadError = await studentPage.locator('.runner-state.error').textContent().catch(() => '')
      check('页面没有加载失败提示', !loadError, (loadError || '').trim().slice(0, 80))
      // 卡片封面：有封面就渲染 img，没有就是占位渐变，两种情况都算「卡片能看」
      const hasCover = await studentPage.locator('.student-skill-page img').count()
      check('独立页面没有报错白屏', (await studentPage.locator('body').textContent()).trim().length > 20, `图片元素 ${hasCover} 个`)
      await studentPage.screenshot({ path: path.join(OUT_DIR, 'skill-package-student-runner.png'), fullPage: true })
    }
    check('学生端页面无 JS 报错', studentErrors.length === 0, studentErrors.slice(0, 2).join(' | '))
    await studentContext.close()

    check('页面无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))
  } catch (error) {
    check('验收流程未中断', false, error.message)
  } finally {
    // 清理：先删玩法（技能包引用会 SET NULL），再删技能包
    for (const id of created.skillIds) await api(admin.cookie, 'DELETE', `/api/admin/ai-skills/${id}`).catch(() => {})
    if (created.packageIds.length) {
      await api(admin.cookie, 'POST', '/api/admin/ai-skill-packages/bulk', { action: 'delete', ids: created.packageIds }).catch(() => {})
    }
    console.log('— 已清理本次验收数据 —')
    if (browser) await browser.close()
  }

  const passed = results.filter((item) => item.pass).length
  console.log(`\n结果：${passed}/${results.length} 通过`)
  if (failures.length) { console.log('失败项：'); failures.forEach((item) => console.log('  ' + item)) }
  process.exit(failures.length ? 1 : 0)
}

main()
