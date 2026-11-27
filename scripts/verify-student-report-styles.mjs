// 学生端「选一个风格」= 后台「报告工作流库」的已发布模板。
// 验的事：一个已发布工作流 → 一张卡；卡片名字/封面取工作流自己的；点了能切；没发布的点了不给跑。
// 用法：env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//   BASE_URL=http://127.0.0.1:5273 node scripts/verify-student-report-styles.mjs
// 数据：脚本自己造 2 条临时工作流（skill_VERIFY_STYLE_A/B），跑完在 finally 里删干净，
//       不碰老师真实记录——所以可以反复重跑，不需要先手工准备数据。

import { createRequire } from 'node:module'
import { mkdir, rm, readFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5273'
const OUT_DIR = path.join(process.cwd(), '.workbuddy', 'evidence')
await mkdir(OUT_DIR, { recursive: true })

const A = 'skill_VERIFY_STYLE_A'
const B = 'skill_VERIFY_STYLE_B'
const DRAFT_UNPUBLISHED = 'skill_EbJnFoBYySN5TwZDx-T5bVpl'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let pass = 0
const fails = []
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fails.push(name)
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ---- 临时数据：造 2 条「已发布 + 学生可选 + 已分发」的报告工作流，用 3:1 封面区分开 ----
const TMP_COVER_DIR = path.join(process.cwd(), 'public', 'verify-tmp')
const envText = await readFile(path.join(process.cwd(), 'server', '.env'), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const s = line.trim()
  if (!s || s.startsWith('#')) continue
  const i = s.indexOf('=')
  if (i < 0) continue
  env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const pg = (await import('pg')).default
const sharp = (await import('sharp')).default
const db = new pg.Client({ connectionString: env.DATABASE_URL })
await db.connect()

async function seedTmpStyles() {
  await rm(TMP_COVER_DIR, { recursive: true, force: true })
  await mkdir(TMP_COVER_DIR, { recursive: true })

  const covers = [
    { file: 'style-warm.webp', from: '#f6b26b', to: '#c0574a' },
    { file: 'style-cool.webp', from: '#6fa8dc', to: '#274b6d' },
  ]
  for (const cover of covers) {
    const svg = `<svg width="900" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cover.from}"/><stop offset="1" stop-color="${cover.to}"/></linearGradient></defs><rect width="900" height="300" fill="url(#g)"/></svg>`
    await sharp({ create: { width: 900, height: 300, channels: 3, background: cover.from } })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .webp({ quality: 82 })
      .toFile(path.join(TMP_COVER_DIR, cover.file))
  }

  // 借一条真实工作流的配置当骨架，组织 id 也从库里取，不写死
  const baseRow = (await db.query(
    "SELECT organization_id, draft_configuration FROM ai_skills WHERE usage_kind='report_workflow' ORDER BY updated_at DESC LIMIT 1",
  )).rows[0]
  if (!baseRow?.organization_id) throw new Error('库里还没有任何报告工作流，无法取骨架配置')
  const ORG = baseRow.organization_id
  const base = baseRow.draft_configuration || {}
  await db.query('DELETE FROM ai_skill_daily_usage WHERE skill_id = ANY($1)', [[A, B]])
  await db.query('DELETE FROM ai_skill_assignments WHERE skill_id = ANY($1)', [[A, B]])
  await db.query('DELETE FROM ai_skill_versions WHERE skill_id = ANY($1)', [[A, B]])
  await db.query('DELETE FROM ai_skills WHERE id = ANY($1)', [[A, B]])

  const seeds = [
    { id: A, title: '验收用·暖日水彩风', cover: '/verify-tmp/style-warm.webp', sort: 900, pages: 8 },
    { id: B, title: '验收用·冷静胶片风', cover: '/verify-tmp/style-cool.webp', sort: 901, pages: 6 },
  ]
  for (const seed of seeds) {
    const config = JSON.parse(JSON.stringify(base))
    config.h5Workflow = { pageCount: seed.pages, flowSummary: ['参考图片输入', '创作提示词', 'AI 图像生成', '图片结果'], estimatedMinutes: 5, studentSelectable: true }
    config.presentation = { ...(config.presentation || {}), coverUrl: seed.cover }
    const versionId = `${seed.id}_v1`
    await db.query(
      `INSERT INTO ai_skills (id, organization_id, scope_type, skill_type, usage_kind, title, summary, status, sort_order, draft_configuration, draft_revision)
       VALUES ($1,$2,'organization','image','report_workflow',$3,$4,'published',$5,$6::jsonb,1)`,
      [seed.id, ORG, seed.title, '验收用临时数据，验完即删', seed.sort, JSON.stringify(config)],
    )
    await db.query(
      'INSERT INTO ai_skill_versions (id, skill_id, version_number, configuration) VALUES ($1,$2,1,$3::jsonb)',
      [versionId, seed.id, JSON.stringify(config)],
    )
    await db.query(
      'UPDATE ai_skills SET published_version_id=$2, published_configuration=$3::jsonb, updated_at=now() WHERE id=$1',
      [seed.id, versionId, JSON.stringify(config)],
    )
    await db.query(
      `INSERT INTO ai_skill_assignments (id, skill_id, version_id, organization_id, scope_type, status)
       VALUES ($1,$2,$3,$4,'organization','enabled')`,
      [`asg_${seed.id}`, seed.id, versionId, ORG],
    )
  }
}

async function cleanTmpStyles() {
  const ids = [A, B]
  const tables = (await db.query(
    `SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='skill_id'`,
  )).rows.map((r) => r.table_name)
  for (const t of tables) {
    if (t === 'ai_skills') continue
    await db.query(`DELETE FROM ${t} WHERE skill_id = ANY($1)`, [ids])
  }
  await db.query('DELETE FROM ai_skills WHERE id = ANY($1)', [ids])
  await rm(TMP_COVER_DIR, { recursive: true, force: true })
}

await seedTmpStyles()

const browser = await chromium.launch({ executablePath: CHROME })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const consoleErrors = []
  const isNoise = (text) => /Failed to load resource|401 \(Unauthorized\)/i.test(text)
  page.on('console', (msg) => { if (msg.type() === 'error' && !isNoise(msg.text())) consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const login = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
    })
    return res.status
  })
  check('学生登录成功', login === 200, `HTTP ${login}`)

  // ① 服务端：runtime-config 把工作流拼成策略
  const cfg = await page.evaluate(async () => {
    const res = await fetch('/api/h5-report/runtime-config?difficulty=pro', { credentials: 'include' })
    return { status: res.status, body: await res.json() }
  })
  const strategies = cfg.body?.strategies || []
  const mine = strategies.filter((item) => item.source === 'report-workflow-library')
  check('runtime-config 返回 200', cfg.status === 200, `HTTP ${cfg.status}`)
  check('两条已发布工作流各出一张卡', mine.length === 2, `实际 ${mine.length} 条：${mine.map((i) => i.name).join(' / ')}`)
  check('卡片名字取工作流标题', mine.some((i) => i.name === '验收用·暖日水彩风') && mine.some((i) => i.name === '验收用·冷静胶片风'), mine.map((i) => i.name).join(' / '))
  check('workflowId 就是工作流 id', mine.every((i) => i.workflowId === i.id))
  check('封面取工作流自己的', mine.every((i) => /verify-tmp/.test(String(i.coverUrl || ''))), mine.map((i) => i.coverUrl).join(' / '))
  check('老方案2 h5-canvas-workflow 不再返回', !strategies.some((i) => i.id === 'h5-canvas-workflow'))
  check('默认落在第一张卡', cfg.body?.defaultStrategyId === A && cfg.body?.strategy?.id === A, `defaultStrategyId=${cfg.body?.defaultStrategyId} strategy=${cfg.body?.strategy?.id}`)

  // ② 页面：卡片渲染
  await page.goto(`${BASE}/student/h5-report?difficulty=pro`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  let cards = []
  for (let i = 0; i < 60; i += 1) {
    cards = await page.locator('.ar-style-list .ar-style').all()
    if (cards.length >= 2) break
    await delay(250)
  }
  const headerText = await page.locator('.ar-right-h').innerText().catch(() => '')
  check('右栏标题是「选一个风格」', headerText.includes('选一个风格'), headerText.replace(/\n/g, ' '))
  check('页面上出现 2 张风格卡', cards.length === 2, `实际 ${cards.length} 张`)
  const cardText = cards.length ? (await Promise.all(cards.map((c) => c.innerText()))).join(' | ') : ''
  check('卡片上写着工作流名字', cardText.includes('暖日水彩风') && cardText.includes('冷静胶片风'), cardText.replace(/\n/g, ' '))
  check('旧的「图文排版」分类按钮没了', !headerText.includes('图文排版') && !(await page.locator('.ar-seg').count()))
  const coverStyles = cards.length ? await Promise.all(cards.map((c) => c.locator('.ar-tp-art').evaluate((el) => getComputedStyle(el).backgroundImage))) : []
  check('卡片封面用的工作流封面', coverStyles.length === 2 && coverStyles.every((s) => /verify-tmp/.test(s)), coverStyles.join(' / ').slice(0, 160))

  const firstOn = await page.locator('.ar-style-list .ar-style.on').innerText().catch(() => '')
  check('进页面默认选中第一张', firstOn.includes('暖日水彩风'), firstOn.replace(/\n/g, ' '))
  await page.screenshot({ path: path.join(OUT_DIR, 'student-style-cards.png'), fullPage: false })

  // ③ 点第二张 → 选中态切过去
  if (cards.length === 2) await cards[1].click()
  let switched = ''
  for (let i = 0; i < 60; i += 1) {
    switched = await page.locator('.ar-style-list .ar-style.on').innerText().catch(() => '')
    if (switched.includes('冷静胶片风')) break
    await delay(250)
  }
  check('点第二张就切到第二张', switched.includes('冷静胶片风'), switched.replace(/\n/g, ' '))
  const cfgB = await page.evaluate(async () => {
    const res = await fetch('/api/h5-report/runtime-config?difficulty=pro&strategy=skill_VERIFY_STYLE_B', { credentials: 'include' })
    return (await res.json())?.strategy
  })
  check('切过去后执行的是 B 这个工作流', cfgB?.workflowId === B, `workflowId=${cfgB?.workflowId}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'student-style-cards-switched.png'), fullPage: false })

  // ④ 没发布的工作流不许跑（不会真出图，走 409 早退）
  const runDraft = await page.evaluate(async (workflowId) => {
    const res = await fetch('/api/h5-report/canvas-workflow/run', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: 'pro', workflowId, materials: [], report: { title: 'x', summary: '', pages: [] } }),
    })
    return { status: res.status, body: await res.json() }
  }, DRAFT_UNPUBLISHED)
  check('没发布/没开放的工作流被拦下', runDraft.status === 409 && /还没发布/.test(String(runDraft.body?.message || '')), `HTTP ${runDraft.status} ${runDraft.body?.message || ''}`)

  const runEmpty = await page.evaluate(async () => {
    const res = await fetch('/api/h5-report/canvas-workflow/run', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: 'pro', workflowId: '', materials: [], report: { pages: [] } }),
    })
    return { status: res.status, body: await res.json() }
  })
  check('没选风格就点生成会提示先选', runEmpty.status === 409 && /先.*选一个风格/.test(String(runEmpty.body?.message || '')), `HTTP ${runEmpty.status} ${runEmpty.body?.message || ''}`)

  check('全程没有前端异常', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
} finally {
  await browser.close()
  // 不管断言成功与否，临时数据都要清掉
  await cleanTmpStyles().catch((e) => console.error('清理临时数据失败:', e.message))
  await db.end().catch(() => {})
}

console.log(`\n通过 ${pass} 项${fails.length ? `，失败 ${fails.length} 项：\n- ${fails.join('\n- ')}` : '，全部通过'}`)
process.exitCode = fails.length ? 1 : 0
