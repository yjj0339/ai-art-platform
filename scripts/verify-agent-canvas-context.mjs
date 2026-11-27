/**
 * 验收「智能体看得见学生画布上的设置」。
 *
 * 零花费：/api/student/agent/understand 用假回包顶替，不调真实模型、不出图。
 * 验的是三件事：
 *   1. 前端真的把提示词/风格/比例/张数发出去了（抓请求体）
 *   2. 后端真的把它拼进了提示词（直接调模块函数，不发网络）
 *   3. 学生说「改一下」时，模型拿到的是「在原来那张上改」而不是「另编一个」
 *
 * 用法：node scripts/verify-agent-canvas-context.mjs
 * 前置：dev 服务已在 5173/3000 运行（node scripts/dev.mjs --web-port 5173 --server-port 3000）
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')

const WEB = process.env.WEB_ORIGIN || 'http://127.0.0.1:5173'
const API = process.env.API_ORIGIN || 'http://127.0.0.1:3000'
const ACCOUNT = { account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  —— ${detail}` : ''}`)
}

async function findChromium() {
  const candidates = [
    'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ]
  for (const item of candidates) if (existsSync(item)) return item
  throw new Error('找不到 Edge/Chrome，请检查浏览器安装路径')
}

async function main() {
  /* —— 第 1 关：抓前端请求体 —— */
  console.log('启动浏览器…')
  const browser = await chromium.launch({ executablePath: await findChromium(), headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  console.log('登录…')
  const login = await page.request.post(`${API}/api/auth/login`, { data: ACCOUNT })
  check('登录成功', login.ok(), `status=${login.status()}`)

  // 难度必须提前定成 pro，否则绘画页停在选择弹层上，找不到智能体
  await page.addInitScript(() => localStorage.setItem('art-studio-difficulty', 'pro'))

  // 造一张「上一张已经画出来」的草稿，否则画布上根本没有可参考的画，
  // 前端当然发不出提示词。只拦不发出去，服务器上的真实草稿一条都不动。
  const paintedPrompt = '一只橘猫坐在窗台上看夕阳'
  await page.route('**/api/me/documents**', async (route) => {
    const url = route.request().url()
    if (!url.includes('type=draft')) return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        documents: [
          {
            id: 'verify-tmp-draft',
            version: 1,
            data: {
              id: 'verify-tmp-project',
              title: '验收用临时画作',
              versions: [
                {
                  id: 'verify-tmp-version',
                  title: 'AI生成图',
                  batchPrompt: paintedPrompt,
                  prompt: paintedPrompt,
                  background: 'linear-gradient(135deg, #ff7a00, #ffd166)',
                  createdAt: '刚刚',
                },
              ],
              finalVersionId: 'verify-tmp-version',
            },
          },
        ],
      }),
    })
  })

  /** 抓到的请求体放这里 */
  let captured = null
  await page.route('**/api/student/agent/understand', async (route) => {
    captured = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        agentName: 'AI 老师',
        intent: 'generate_image',
        isCommand: true,
        readyToRun: false, // 故意不给 readyToRun，避免脚本真的去出图烧钱
        confidence: 0.9,
        actionKey: 'action.clarify',
        reply: '好，我在这张的基础上改。',
        prompt: '',
        additions: [],
        missing: [],
        questions: [],
        reason: '验收用假回包',
      }),
    })
  })

  console.log('打开绘画页…')
  await page.goto(`${WEB}/student/paint`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3600)

  // 先把提示词写进去（这就是「画布上的提示词」），再进智能体模式说话
  console.log('填写画布提示词…')
  const promptBox = page.locator('.pro-prompt-textarea')
  await promptBox.waitFor({ state: 'visible', timeout: 20000 })
  const canvasPrompt = '一只橘猫坐在窗台上看夕阳'
  await promptBox.fill(canvasPrompt)
  await page.waitForTimeout(400)

  // 点人物进智能体模式
  console.log('进入智能体模式…')
  const figure = page.locator('.sa-figure-btn').first()
  await figure.waitFor({ state: 'visible', timeout: 20000 })
  await figure.click()
  await page.waitForTimeout(900)

  // 智能体模式下大框就是「跟老师说的话」
  console.log('跟老师说一句…')
  await promptBox.fill('耳朵改大一点，再来一张')
  await page.locator('.pro-action-stack button').last().click().catch(() => {})
  await page.waitForTimeout(2600)

  if (!captured) {
    // 没抓到就退回直接调组件，把这条明确标成失败，不假装通过
    check('前端发出了理解请求', false, '没抓到 /understand 请求')
  } else {
    check('前端发出了理解请求', true)
    check('请求里带了 canvasContext', Boolean(captured.canvasContext), JSON.stringify(captured.canvasContext || null))
    const ctx = captured.canvasContext || {}
    check('请求里带了画布提示词', typeof ctx.prompt === 'string' && ctx.prompt.length > 0, `prompt=${ctx.prompt || '(空)'}`)
    check('请求里带了比例', Boolean(ctx.ratio), `ratio=${ctx.ratio || '(空)'}`)
    check('请求里带了张数', ctx.count !== undefined && ctx.count !== '', `count=${ctx.count}`)
    check('请求里带了已画张数', ctx.doneCount !== undefined, `doneCount=${ctx.doneCount}`)
    // 关键：智能体模式下大框里是「学生对老师说的话」，不能自己当画布内容传回去
    check('画布提示词不是学生刚说的那句话', ctx.prompt !== '耳朵改大一点，再来一张', `prompt=${ctx.prompt || '(空)'}`)
  }

  await browser.close()

  /* —— 第 2 关：后端真的拼进提示词 —— */
  const probe = `
import { readFileSync } from 'node:fs'
const src = readFileSync('server/index.js', 'utf8')
// 这段不 import 整个 index.js（会起服务），只把几个纯函数抠出来跑。
// 注意：必须连 clipText / textValue 一起抠，否则跑的是仿造版，测不出真问题。
const pick = (from, to) => {
  const start = src.indexOf(from)
  const end = src.indexOf(to, start)
  if (start < 0 || end < 0) throw new Error('抠代码失败：' + from)
  return src.slice(start, end)
}
const helpers = pick('function textValue(', 'function parseAgentModelKey')
const body = pick('function normalizeAgentCanvasContext', '// 学生端只允许')
const mod = helpers + body + '\\nexport { normalizeAgentCanvasContext, agentCanvasContextLines }'
const dataUrl = 'data:text/javascript;base64,' + Buffer.from(mod).toString('base64')
const { normalizeAgentCanvasContext, agentCanvasContextLines } = await import(dataUrl)

const cleaned = normalizeAgentCanvasContext({
  prompt: '一只橘猫坐在窗台上看夕阳',
  style: '水彩风格',
  ratio: '16:9',
  count: '2',
  negativePrompt: '模糊，畸形',
  doneCount: 4,
  hacker: '不该出现的字段',
})
const lines = agentCanvasContextLines(cleaned)
const out = {
  cleaned,
  lines,
  hasUnknownField: Object.prototype.hasOwnProperty.call(cleaned, 'hacker'),
  emptyBecomesNull: normalizeAgentCanvasContext({}) === null,
  nullStaysNull: normalizeAgentCanvasContext(null) === null,
}
console.log(JSON.stringify(out))
`
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '' },
  })
  if (run.status !== 0) {
    check('后端快照清洗可独立运行', false, (run.stderr || '').slice(0, 300))
  } else {
    const out = JSON.parse(run.stdout.trim())
    check('后端快照清洗可独立运行', true)
    check('白名单之外的字段被丢掉', out.hasUnknownField === false)
    check('空快照返回 null（不拼空标题）', out.emptyBecomesNull === true)
    check('null 快照返回 null', out.nullStaysNull === true)
    check('提示词进了提示词段', out.lines.includes('一只橘猫坐在窗台上看夕阳'), out.lines.replace(/\n/g, ' | '))
    check('风格进了提示词段', out.lines.includes('水彩风格'))
    check('比例进了提示词段', out.lines.includes('16:9'))
    check('张数进了提示词段', out.lines.includes('2'))
    check('已画张数进了提示词段', out.lines.includes('4 张'))
    check('负面词进了提示词段', out.lines.includes('模糊'))
  }

  /* —— 汇总 —— */
  const passed = results.filter((item) => item.pass).length
  console.log(`\n${passed}/${results.length} PASS`)
  const failed = results.filter((item) => !item.pass)
  if (failed.length) {
    console.log('\n未通过：')
    failed.forEach((item) => console.log(`- ${item.name}  ${item.detail}`))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('验收脚本自身出错：', error)
  process.exitCode = 1
})
