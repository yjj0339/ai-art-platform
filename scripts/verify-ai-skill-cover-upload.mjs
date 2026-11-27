// 玩法卡片图上传 —— 端到端验收脚本（真实后端 + 真实浏览器 + 真实数据库）
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy node scripts/verify-ai-skill-cover-upload.mjs
//
// 覆盖用户 2026-10-31 两点诉求：
//   ① 「图像玩法的这个编辑基础信息我觉得有点乱」→ 弹窗必须分组：基础信息 / 玩法卡片图 / 高级设置（供应商+模型折叠）
//   ② 「技能玩法图像没有上传的地方，我需要后台能有这个」→ 后台能选图上传，学生端卡片真的显示这张图
//
// ⚠️ 数据安全（2026-11-01 修复）：
//   历史版本会「从库里随便挑一条已发布的图像玩法」当测试对象，而报告工作流库与技能玩法共用 ai_skills 表，
//   于是验收会把真实的「童话绘本封面」卡片图改掉，看起来就像动了报告工作流库。
//   现在改为：**自建一条临时玩法 → 测完立刻删除**，全程只写自己创建的这条记录。
//   另外在开头/结尾各快照一次全量玩法，断言除临时记录外没有任何一条被改动（D1）。
//
// 断言清单：
//   A 后台上传
//     A0  后端健康检查
//     A0b 成功自建临时玩法（不是从真实数据里挑）
//     A1 弹窗内存在「玩法卡片图」分组标题
//     A2 存在文件选择控件 accept=image/png,image/jpeg,image/webp
//     A3 「卡片封面地址」纯文本输入框已移除（不再要求老师贴 URL）
//     A4 供应商/模型被收进「高级设置」折叠区，默认不展开
//     A5 选图后可预览（img src 以 /api/ai-skill-covers/ 开头）
//     A6 点保存后接口 200，草稿 configuration.presentation.coverUrl 已落库
//     A7 已发布玩法的 published_configuration.presentation.coverUrl 同步（否则学生端看不到）
//     A8 后台列表缩略图 background-image 指向该图
//   B 学生端显示
//     B1 /student/paint 技能玩法卡片 .paint-skill-art 背景图 = 上传图
//     B2 卡片不再叠加 CSS 插画（has-cover 时伪元素 display:none）
//     B3 图片请求真实 200 且 content-type=image/webp
//   C 干净
//     C1 后台全程无浏览器控制台报错（忽略 favicon / 未登录会话探测的 401）
//     C2 学生端全程无控制台报错
//   D 不误伤
//     D1 除临时记录外，没有任何已存在的玩法被改动
//     D2 临时记录已删除（学生端/后台都查不到）
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const PLAYWRIGHT_BASE = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/'
const require = createRequire(PLAYWRIGHT_BASE)
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const WEB_PORT = Number(process.env.WEB_PORT || 5173)
const API_PORT = Number(process.env.API_PORT || 3000)
const BASE = `http://127.0.0.1:${WEB_PORT}`
const API = `http://127.0.0.1:${API_PORT}`
const OUT_DIR = path.join(projectDir, '.ai-skill-cover-verify')
const UPLOAD_PNG = path.join(OUT_DIR, 'upload-source.png')

const ACCOUNT = { account: 'guanliyuan88', password: '123456789', organizationCode: 'demo-school' }
// 学生端验收必须用学生账号，管理员访问 /student/* 会被路由守卫送回 /admin
const STUDENT = { account: process.env.STUDENT_ACCOUNT || 'ceshi2', password: process.env.STUDENT_PASSWORD || '123456789', organizationCode: 'demo-school' }

// 临时记录的标题带时间戳，避免上一轮残留（正常不会有）撞名
const TEMP_TITLE = `【自动验收·临时】卡片图 ${Date.now().toString(36)}`

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const passes = []

function check(name, ok, detail) {
  if (ok) { passes.push(name); console.error(`PASS  ${name}`) }
  else { failures.push(`${name} :: ${JSON.stringify(detail ?? '').slice(0, 400)}`); console.error(`FAIL  ${name}  ::  ${JSON.stringify(detail ?? '').slice(0, 400)}`) }
}

async function waitFor(fn, { timeout = 20000, interval = 200, label = 'condition' } = {}) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeout) {
    try { const v = await fn(); if (v) return v; last = v } catch (error) { last = error.message }
    await delay(interval)
  }
  throw new Error(`等待超时：${label}（最后值 ${JSON.stringify(last)?.slice(0, 200)}）`)
}

let vite = null
function killTree(child) {
  if (!child || child.killed) return
  try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* 忽略 */ }
}

// 临时玩法的完整图像配置：结构对齐 src/utils/aiSkillSchema.js 的 defaultSkillConfiguration，
// 但节点标题写清楚是验收临时数据，避免将来排查时误认成业务玩法。
function tempImageSkillConfiguration() {
  const block = (type, extra = {}) => ({ id: `${type}_${Math.random().toString(36).slice(2, 9)}`, type, ...extra })
  return {
    schemaVersion: 2,
    presentation: { coverUrl: '', coverSource: '', coverGeneratedAt: '', exampleUrl: '', badge: '', grade: '' },
    workflow: {
      version: 1,
      nodes: [
        { id: 'upload-1', type: 'upload', position: { x: 40, y: 250 }, data: { title: '参考图片输入', image: '' } },
        { id: 'prompt-1', type: 'prompt', position: { x: 330, y: 305 }, data: { title: '创作提示词', prompt: '描述希望生成的画面' } },
        { id: 'image-1', type: 'image', position: { x: 600, y: 260 }, data: { title: 'AI 图像生成', description: '验收临时节点' } },
        { id: 'result-1', type: 'result', position: { x: 860, y: 310 }, data: { title: '图片结果', state: 'idle' } },
      ],
      edges: [
        { id: 'edge-upload-prompt', source: 'upload-1', target: 'prompt-1', type: 'default' },
        { id: 'edge-prompt-image', source: 'prompt-1', target: 'image-1', type: 'default' },
        { id: 'edge-image-result', source: 'image-1', target: 'result-1', type: 'default' },
      ],
      settings: { prompt: '', model: '', duration: 5, ratio: '1:1', resolution: '720P', creativity: 65 },
      edgesVisible: true,
    },
    studentPage: {
      layoutVersion: 1,
      columns: 12,
      blocks: [
        block('heading', { span: 12, label: 'AI 图像创作', description: '验收临时玩法，测完即删' }),
        block('image', { key: 'reference_image', binding: 'upload-1', span: 6, label: '参考图片', required: false, placeholder: '点击或拖拽上传图片' }),
        block('textarea', { key: 'subject', binding: 'prompt-1', span: 6, label: '画面描述', required: true, placeholder: '描述你想生成的画面' }),
        block('submit', { span: 12, label: '生成图片' }),
        block('result', { span: 12, label: '图片结果' }),
      ],
    },
    runtime: {
      provider: 'volcengine', model: '', capability: 'text-to-image', promptTemplate: '{{subject}}', negativePrompt: '',
      ratio: '1:1', quality: 'standard', resolution: '720P', duration: '5s', frameRate: 24, count: 1, testedAt: '',
    },
    limits: { dailyLimit: 0 },
    h5Workflow: { studentSelectable: false, estimatedMinutes: 0, pageCount: 0, flowSummary: [] },
    bindings: {},
  }
}

// 全量玩法快照：只比对「谁被改过」，不写入任何东西。
async function snapshotSkills(context) {
  const resp = await context.request.get(`${BASE}/api/admin/ai-skills`)
  const json = await resp.json()
  const map = new Map()
  for (const skill of json.skills || []) {
    map.set(skill.id, {
      title: skill.title,
      status: skill.status,
      updatedAt: String(skill.updatedAt || ''),
      draftCover: skill.draftConfiguration?.presentation?.coverUrl || '',
      publishedCover: skill.configuration?.presentation?.coverUrl || '',
    })
  }
  return map
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  // 造一张颜色容易识别的图：纯青绿色，方便和默认插画区分
  await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 22, g: 160, b: 133 } } }).png().toFile(UPLOAD_PNG)

  // 后端必须活着（真实库）
  const health = await fetch(`${API}/api/health`).then((r) => r.json()).catch(() => null)
  check('A0 后端健康检查', Boolean(health?.ok && health?.databaseConfigured), health)

  // ⚠️ 后端 APP_ORIGIN 锁死在 http://127.0.0.1:5173，登录等写操作会校验 Origin。
  // 如果脚本另起一个端口（如 5191），浏览器发出的 Origin 不在白名单里 → 登录直接 403「请求来源未获授权」。
  // 所以这里必须跑在 5173；端口已被 dev 占用时直接复用，只在空闲时才自己拉起。
  const portBusy = await fetch(`${BASE}/`).then((r) => r.ok).catch(() => false)
  if (portBusy) {
    console.error(`复用已运行的 vite：${BASE}`)
  } else {
    vite = spawn(path.join(projectDir, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
      cwd: projectDir,
      shell: true,
      env: { ...process.env, VITE_AUTH_MODE: 'server', VITE_SERVER_PORT: String(API_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    vite.stdout.on('data', () => {})
    vite.stderr.on('data', () => {})
    await waitFor(() => fetch(`${BASE}/`).then((r) => r.ok).catch(() => false), { timeout: 90000, label: 'vite 启动' })
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const consoleErrors = []
  const failedResponses = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('response', (res) => {
    if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.request().method()} ${res.url()}`)
  })

  let tempSkillId = ''
  let uploadedPath = ''
  let baseline = new Map()
  let studentContext = null

  try {
    // ---------- 登录 ----------
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    // 登录页默认是学生入口，先切到「管理员」角色，按钮文案才会变成「进入管理员后台」
    await page.locator('.role-tab-btn').filter({ hasText: /管理员/ }).first().click({ timeout: 15000 })
    await page.locator('.el-input__inner').nth(0).fill(ACCOUNT.account)
    await page.locator('.el-input__inner').nth(1).fill(ACCOUNT.organizationCode)
    await page.locator('.el-input__inner').nth(2).fill(ACCOUNT.password)
    await page.getByRole('button', { name: /进入管理员后台|进入|登录/ }).first().click()
    await waitFor(() => !page.url().includes('/login'), { timeout: 25000, label: '登录跳转' })
    console.error(`登录成功：${page.url()}`)

    // 动手之前先拍一张快照，用来事后证明「别人的数据没被碰」
    baseline = await snapshotSkills(context)

    // ---------- 自建临时玩法 ----------
    // 为什么不用真实记录：报告工作流库与技能玩法共用 ai_skills 表，
    // 任何对真实记录的 PATCH 都会同时改掉工作流库里的那一行。
    const createResp = await context.request.post(`${BASE}/api/admin/ai-skills`, {
      data: { title: TEMP_TITLE, summary: '自动化验收临时数据，脚本结束即删除', skillType: 'image', scopeType: 'organization', configuration: tempImageSkillConfiguration() },
    })
    const createJson = await createResp.json().catch(() => ({}))
    tempSkillId = createJson?.skill?.id || ''
    check('A0b 自建临时图像玩法（不碰真实记录）', createResp.status() === 201 && Boolean(tempSkillId), { status: createResp.status(), tempSkillId, message: createJson?.message })

    // 发布门槛要求 runtime.testedAt，但真实调用「测试」接口会花供应商的钱出图。
    // 这里只给临时记录写一个 testedAt，让它能被发布、能被学生端看到；不调用生成接口。
    const testedAt = new Date().toISOString()
    const patchConfig = tempImageSkillConfiguration()
    patchConfig.runtime.testedAt = testedAt
    const markResp = await context.request.patch(`${BASE}/api/admin/ai-skills/${encodeURIComponent(tempSkillId)}`, {
      data: { title: TEMP_TITLE, summary: '自动化验收临时数据，脚本结束即删除', sortOrder: 0, draftRevision: Number(createJson?.skill?.draftRevision || 0), configuration: patchConfig },
    })
    if (markResp.status() !== 200) {
      const body = await markResp.text().catch(() => '')
      throw new Error(`临时玩法写入 testedAt 失败：${markResp.status()} ${body.slice(0, 200)}`)
    }
    const publishResp = await context.request.post(`${BASE}/api/admin/ai-skills/${encodeURIComponent(tempSkillId)}/publish`, { data: {} })
    if (publishResp.status() !== 200) {
      const body = await publishResp.text().catch(() => '')
      throw new Error(`临时玩法发布失败：${publishResp.status()} ${body.slice(0, 200)}`)
    }

    // ---------- 后台列表 ----------
    await page.goto(`${BASE}/admin?module=featureManagement&type=image`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('.skill-row').filter({ hasText: TEMP_TITLE }).first()
    await row.waitFor({ state: 'visible', timeout: 30000 })

    // 打开「编辑基础信息」
    await row.locator('.icon-button').click()
    await page.getByRole('menuitem', { name: '编辑基础信息' }).click()
    const dialog = page.locator('.el-dialog').filter({ hasText: '编辑玩法基础信息' })
    await dialog.waitFor({ state: 'visible', timeout: 15000 })

    // A1 分组标题
    const groupTitles = await dialog.locator('.group-title').allInnerTexts()
    check('A1 弹窗按「基础信息 / 玩法卡片图」分组', groupTitles.some((t) => t.includes('基础信息')) && groupTitles.some((t) => t.includes('玩法卡片图')), groupTitles)

    // A2 文件选择控件
    const fileInput = dialog.locator('input[type="file"]')
    const accept = await fileInput.getAttribute('accept').catch(() => null)
    check('A2 提供图片选择控件（PNG/JPG/WEBP）', accept === 'image/png,image/jpeg,image/webp', accept)

    // A3 旧的「卡片封面地址」文本输入已移除
    const coverTextInput = await dialog.locator('label:has-text("卡片封面地址") input').count()
    check('A3 已移除「卡片封面地址」纯文本输入框', coverTextInput === 0, { count: coverTextInput })

    // A4 供应商/模型收进高级设置折叠区，默认不展开
    const detailsOpen = await dialog.locator('details.advanced-group').evaluate((el) => el.open).catch(() => null)
    const providerVisible = await dialog.locator('select').nth(1).isVisible().catch(() => false)
    check('A4 供应商/模型收进「高级设置」且默认折叠', detailsOpen === false && providerVisible === false, { detailsOpen, providerVisible })

    await page.screenshot({ path: path.join(OUT_DIR, '01-dialog-empty.png') })

    // A5 选图上传 → 预览出现
    await fileInput.setInputFiles(UPLOAD_PNG)
    const previewImg = dialog.locator('.cover-preview img')
    await previewImg.waitFor({ state: 'visible', timeout: 30000 })
    // 上传要等接口回来、按钮文案才会变成「更换图片」，不能靠固定 sleep
    const changeBtnText = await waitFor(async () => {
      const text = await dialog.locator('.cover-buttons button').first().innerText()
      return text.includes('更换') ? text : false
    }, { timeout: 40000, label: '上传结束按钮变为更换图片' }).catch(() => '')
    check('A5b 已有图时按钮变为「更换图片」', changeBtnText.includes('更换'), changeBtnText)

    const previewSrc = await dialog.locator('.cover-preview img').getAttribute('src')
    check('A5 选图后出现预览，地址指向上传资源', /^\/api\/ai-skill-covers\//.test(previewSrc || ''), previewSrc)
    uploadedPath = previewSrc || ''
    await page.screenshot({ path: path.join(OUT_DIR, '02-dialog-uploaded.png') })

    // A6 保存落库
    const saveResp = page.waitForResponse((r) => /\/api\/admin\/ai-skills\//.test(r.url()) && r.request().method() === 'PATCH', { timeout: 30000 })
    await dialog.getByRole('button', { name: '保存' }).click()
    const saved = await saveResp
    check('A6 保存接口返回 200', saved.status() === 200, saved.status())
    await dialog.waitFor({ state: 'hidden', timeout: 20000 })

    const afterResp = await context.request.get(`${BASE}/api/admin/ai-skills/${encodeURIComponent(tempSkillId)}`)
    const afterJson = await afterResp.json()
    const draftCover = afterJson.skill?.draftConfiguration?.presentation?.coverUrl
    check('A6b 草稿已落库 coverUrl', draftCover === uploadedPath, { draftCover, uploadedPath })
    const publishedCover = afterJson.skill?.configuration?.presentation?.coverUrl
    check('A7 已发布配置同步 coverUrl（学生端才看得到）', publishedCover === uploadedPath, { publishedCover, uploadedPath })

    // A8 后台列表缩略图
    await waitFor(async () => {
      const rowNow = page.locator('.skill-row').filter({ hasText: TEMP_TITLE }).first()
      const bg = await rowNow.locator('.skill-thumb').evaluate((el) => getComputedStyle(el).backgroundImage)
      return bg.includes('ai-skill-covers') ? bg : false
    }, { timeout: 20000, label: '列表缩略图更新' }).then(
      (bg) => check('A8 后台列表缩略图指向上传图', true, bg),
      (error) => check('A8 后台列表缩略图指向上传图', false, error.message),
    )
    await page.screenshot({ path: path.join(OUT_DIR, '03-admin-list.png') })

    // ---------- B 学生端 ----------
    // 学生端必须用学生账号：管理员访问 /student/* 会被路由守卫送回 /admin，卡片列表永远为空。
    studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
    const studentLogin = await studentContext.request.post(`${BASE}/api/auth/login`, {
      data: STUDENT,
      headers: { Origin: BASE },
    })
    check('B0 学生账号登录成功', studentLogin.status() === 200, studentLogin.status())
    const studentPage = await studentContext.newPage()
    const studentErrors = []
    studentPage.on('console', (m) => { if (m.type() === 'error') studentErrors.push(m.text()) })
    studentPage.on('pageerror', (e) => studentErrors.push(`pageerror: ${e.message}`))
    await studentPage.addInitScript(() => {
      // 技能玩法卡片只在高年级难度显示（初级/入门走提示词库），这里直接锁定高级版
      window.localStorage.setItem('art-studio-difficulty', 'pro')
    })
    await studentPage.goto(`${BASE}/student/paint`, { waitUntil: 'domcontentloaded' })
    await waitFor(() => studentPage.url().includes('/student/paint'), { timeout: 20000, label: '学生端进入绘画页' })
      .catch((error) => { throw new Error(`学生端被重定向到 ${studentPage.url()}：${error.message}`) })
    const card = studentPage.locator('.paint-skill-card').filter({ hasText: TEMP_TITLE }).first()
    await card.waitFor({ state: 'visible', timeout: 40000 }).catch(async (error) => {
      const titles = await studentPage.locator('.paint-skill-card').allInnerTexts().catch(() => [])
      throw new Error(`学生端找不到临时玩法卡片；当前卡片=${JSON.stringify(titles.slice(0, 12))}；${error.message}`)
    })

    const artBg = await waitFor(async () => {
      const bg = await card.locator('.paint-skill-art').evaluate((el) => getComputedStyle(el).backgroundImage)
      return bg.includes('ai-skill-covers') ? bg : false
    }, { timeout: 30000, label: '学生端卡片背景图' }).catch((e) => e.message)
    check('B1 学生端技能玩法卡片显示上传图', typeof artBg === 'string' && artBg.includes(uploadedPath), artBg)

    const pseudoHidden = await card.locator('.paint-skill-art').evaluate((el) => getComputedStyle(el, '::before').display)
    check('B2 有封面时不再叠加 CSS 插画', pseudoHidden === 'none', pseudoHidden)

    const imgStatus = await studentPage.evaluate(async (url) => {
      const res = await fetch(url, { credentials: 'include' })
      return { status: res.status, type: res.headers.get('content-type'), size: (await res.arrayBuffer()).byteLength }
    }, uploadedPath)
    check('B3 卡片图真实可访问且为 webp', imgStatus.status === 200 && /webp/.test(imgStatus.type || '') && imgStatus.size > 0, imgStatus)

    await studentPage.screenshot({ path: path.join(OUT_DIR, '04-student-paint.png') })

    // B4 窄屏（手机竖屏）视觉核对：只截图取证，卡片布局在窄屏下会换成侧栏，不强制断言背景图位置。
    await studentPage.setViewportSize({ width: 390, height: 844 })
    await studentPage.waitForTimeout(600)
    await studentPage.screenshot({ path: path.join(OUT_DIR, '05-student-paint-mobile.png') })
    await studentPage.setViewportSize({ width: 1440, height: 900 })

    // 登录页在未登录状态下会先请求 /api/auth/me 探测会话，必然 401，属正常行为，不算报错。
    const onlyAuthProbeFailed = failedResponses.length > 0 && failedResponses.every((r) => r.includes('/api/auth/me'))
    const realErrors = consoleErrors.filter((t) => !/favicon|ERR_NETWORK|net::ERR/i.test(t)
      && !(onlyAuthProbeFailed && /401 \(Unauthorized\)/.test(t)))
    check('C1 后台无控制台报错', realErrors.length === 0, realErrors.length ? { errors: realErrors.slice(0, 4), failedResponses: failedResponses.slice(0, 8) } : '无')
    const realStudentErrors = studentErrors.filter((t) => !/favicon|ERR_NETWORK|net::ERR/i.test(t))
    check('C2 学生端无控制台报错', realStudentErrors.length === 0, realStudentErrors.slice(0, 4))
  } finally {
    // ---------- D 收尾：删掉临时记录，并证明别人的数据没被改 ----------
    if (tempSkillId) {
      const delResp = await context.request.delete(`${BASE}/api/admin/ai-skills/${encodeURIComponent(tempSkillId)}`).catch(() => null)
      if (delResp?.status() !== 200) console.error(`⚠️ 临时玩法删除失败：${delResp?.status()}，请手动清理 ${tempSkillId}`)
    }
    // 上传时服务端按「当前时间 + 随机串」生成文件名，这个文件是本脚本刚造出来的，可以安全删除。
    if (uploadedPath) {
      const fileName = path.basename(uploadedPath)
      const orgDir = path.basename(path.dirname(uploadedPath))
      if (/^cover-\d+-[a-f0-9]+\.webp$/.test(fileName) && orgDir) {
        await unlink(path.join(projectDir, 'server', 'data', 'ai-skill-covers', orgDir, fileName)).catch(() => {})
      }
    }

    if (baseline.size) {
      const after = await snapshotSkills(context).catch(() => new Map())
      const changed = []
      for (const [id, before] of baseline) {
        const now = after.get(id)
        if (!now) { changed.push(`${before.title} :: 记录消失`); continue }
        if (now.updatedAt !== before.updatedAt || now.draftCover !== before.draftCover || now.publishedCover !== before.publishedCover) {
          changed.push(`${before.title} :: ${before.publishedCover || '(空)'} → ${now.publishedCover || '(空)'}`)
        }
      }
      check('D1 除临时记录外没有任何玩法被改动', changed.length === 0, changed.slice(0, 6))
      const stillThere = after.has(tempSkillId)
      check('D2 临时记录已删除干净', Boolean(tempSkillId) && !stillThere, { tempSkillId, stillThere, remaining: after.size })
    }

    if (studentContext) await studentContext.close().catch(() => {})
    await browser.close()
    await writeFile(path.join(OUT_DIR, 'result.json'), JSON.stringify({ passes, failures, uploadedPath, tempSkillId, tempTitle: TEMP_TITLE }, null, 2))
  }
}

main()
  .catch((error) => {
    failures.push(`脚本异常 :: ${error.message}`)
    console.error('脚本异常：', error)
  })
  .finally(async () => {
    killTree(vite)
    console.error(`\n通过 ${passes.length} 项，失败 ${failures.length} 项`)
    if (failures.length) { failures.forEach((f) => console.error('  -', f)); process.exitCode = 1 }
  })
