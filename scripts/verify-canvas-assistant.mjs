// 画布助手浏览器验收脚本
// 用法：
//   1) 另开终端启动 mock dev server（必须去掉系统代理，否则 127.0.0.1 会被代理劫持成 502）：
//      env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy VITE_AUTH_MODE=mock \
//        ./node_modules/.bin/vite --port 5200 --host 127.0.0.1
//   2) 运行本脚本（同样要去代理）：
//      env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
//        "C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" scripts/verify-canvas-assistant.mjs
// 覆盖点：画布加载 / 助手输入框 / 执行小票样式 / 图片附件挂载 / 旧版"未接入"提示已消除
import pw from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'
const { chromium } = pw

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:5200'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-proxy-server', '--no-sandbox', '--disable-proxy-config'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

// mock 登录：作用域用 context，且只在同源下写入
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '测试学生', role: 'student', className: 'AI创意美术A班', avatar: '艺' }, token: 'mock-token-project-new-art-studio' }))
  } catch {}
})

await page.goto(`${BASE}/student/canvas`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e)=>console.log('goto warn:', e.message.slice(0,120)))
await page.waitForTimeout(3500)

let url = page.url()
if (!/canvas/i.test(url)) {
  // 尝试从首页进入
  await page.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(()=>{})
  await page.waitForTimeout(1500)
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href')).filter(Boolean))
  const canvasLink = links.find(h => /canvas/i.test(h))
  if (canvasLink) { await page.goto(BASE + canvasLink, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500) }
}

check('画布页可加载', /canvas/i.test(page.url()), page.url())

// 助手面板默认展开；若已收起则点开
let composer = page.locator('.assistant-composer textarea')
if (await composer.count() === 0) {
  const assistantHeader = page.locator('.accordion-section.assistant-section .accordion-header')
  if (await assistantHeader.count()) { await assistantHeader.first().click().catch(()=>{}); await page.waitForTimeout(800) }
  composer = page.locator('.assistant-composer textarea')
}
check('助手输入框可见', await composer.count() > 0)

// 助手消息区可渲染 ticket 样式（注入一条模拟小票到 DOM 无法直接验证业务逻辑，
// 改为验证样式类已编译进 CSS）
const cssHasTicket = await page.evaluate(() => {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (rule.selectorText && rule.selectorText.includes('.assistant-message.ticket')) return true
      }
    } catch {}
  }
  return false
})
check('执行小票样式已生效', cssHasTicket)

// 附件 input 存在且 accept 覆盖图片
const fileInput = page.locator('.assistant-composer input[type=file]')
check('附件上传入口存在', await fileInput.count() > 0)
if (await fileInput.count()) {
  const accept = await fileInput.first().getAttribute('accept')
  check('附件支持图片类型', /image/.test(accept || ''), accept || '')
}

// 触发一次附件上传（PNG），验证不再直接报"未接入"
if (await fileInput.count()) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await fileInput.first().setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: png })
  await page.waitForTimeout(1000)
  const attachShown = await page.locator('.assistant-attachment').count()
  check('图片附件可挂载到输入框', attachShown > 0)
  const attachText = attachShown ? await page.locator('.assistant-attachment').first().innerText() : ''
  check('附件显示文件名', /ref\.png/.test(attachText), attachText.replace(/\n/g, ' '))
}

// mock 模式无后端，接口 401/404 属预期；重点验证没有组件级运行时异常
const runtimeErrors = errors.filter(e => !/favicon|Failed to fetch|net::ERR|status of 40\d|401 \(Unauthorized\)|404 \(Not Found\)/i.test(e))
check('无组件级运行时异常', runtimeErrors.length === 0, runtimeErrors.slice(0,3).join(' | '))

// 关键行为：发送消息后，旧版"附件分析尚未接入真实解析链路"提示必须消失
if (await composer.count()) {
  await composer.first().fill('这个参考图适合做什么样的工作流？')
  await composer.first().press('Enter')
  await page.waitForTimeout(2500)
  const body = await page.locator('.assistant-messages').innerText().catch(()=> '')
  check('旧版"未接入"提示已消除', !/尚未接入真实解析链路/.test(body), body.replace(/\n/g,' ').slice(0,160))
}

await page.screenshot({ path: 'C:/Users/Administrator/AppData/Local/Temp/assistant-verify.png', fullPage: false })
await browser.close()

const passed = results.filter(r => r.ok).length
console.log(`\n==== ${passed}/${results.length} 通过 ====`)
process.exit(passed === results.length ? 0 : 1)
