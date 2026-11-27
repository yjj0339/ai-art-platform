// 验证：从素材库点「导入参考图」到绘画页 → 参考图缩略图能不能正常显示、提示词是否是空的。
//
// 为什么单独写脚本：这两个都是「眼睛才能看出来」的问题，断言文字没用。
//   1) 缩略图破图：素材封面是 css background（url("...")）或渐变占位，
//      旧代码把它原样塞进 referenceImages，绘画页读 item.preview 拿到 undefined → 破图；
//   2) 自动带提示词：旧代码把源项目 prompt 拼进去，学生一进来就有一堆文案。
// 本脚本用真实学生账号登录、自建临时项目当靶子，结束自动删干净。
//
// 用法（前置：本地预览已启动）：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     MSYS_NO_PATHCONV=1 node scripts/verify-reference-import.mjs
// 输出：.reference-import/*.png + 控制台判定

import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const projectDir = process.cwd()
const OUT_DIR = path.join(projectDir, '.reference-import')
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173'
const ACCOUNT = process.env.STUDENT_ACCOUNT || 'ceshi2'
const PASSWORD = process.env.STUDENT_PASSWORD || '123456789'
const ORG_CODE = process.env.ORG_CODE || 'demo-school'

// 一张真实可解码的小图（8x8 红点 PNG），走 data URI 存进临时项目，
// 这样「图片能不能显示」是可判定的真事实，而不是靠占位渐变糊过去。
const PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJUlEQVQoz2P8z8Dwn4EIwESMolGFlC9kGpUwKmFUwqiEUQmjEkYlAQB1oQIB0fK5zQAAAABJRU5ErkJggg=='
const TEMP_TITLE = `参考图验证临时素材-${Date.now()}`

let pass = 0
let fail = 0
const results = []

function assert(name, ok, detail) {
  if (ok) { pass += 1; results.push(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail += 1; results.push(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`) }
}

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME })
let tempDocumentId = ''

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await login(page)
  tempDocumentId = await createTempProject(page)
  assert('已创建临时项目（用完会删）', Boolean(tempDocumentId), tempDocumentId)

  // ---------- 1. 素材页：打开详情 → 点「导入参考图」 ----------
  await page.goto(`${BASE_URL}/student/portfolio`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.portfolio-card', { timeout: 20000 })
  await page.waitForTimeout(700)

  // 有版本记录时卡片标题取版本名（见 portfolioItems 构造），所以按版本名找。
  const card = page.locator('.portfolio-card', { hasText: '参考图验证 V1' }).first()
  assert('临时素材卡片出现在列表里', (await card.count()) > 0)

  await card.click()
  await page.waitForSelector('.portfolio-detail-actions', { timeout: 10000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT_DIR, 'step1-detail.png') })

  await page.getByRole('button', { name: '导入参考图' }).click()
  await page.waitForURL((url) => url.pathname.includes('/student/paint'), { timeout: 20000 })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: path.join(OUT_DIR, 'step2-paint.png') })

  // ---------- 2. 提示词必须是空的（不能被自动塞文案） ----------
  const promptText = await page.evaluate(() => {
    const editor = document.querySelector('.pro-prompt-textarea')
    return editor ? editor.innerText.trim() : '__NO_EDITOR__'
  })
  assert('绘画页提示词输入框是空的（不自动带提示词）',
    promptText === '', promptText === '__NO_EDITOR__' ? '找不到输入框' : `实际内容="${promptText.slice(0, 60)}"`)

  // ---------- 3. 参考图缩略图必须真的渲染出来（不是破图） ----------
  const thumbInfo = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.reference-stack-image img, .reference-thumb img')]
    return imgs.map((img) => ({
      src: String(img.getAttribute('src') || ''),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }))
  })
  assert('参考图缩略图已渲染', thumbInfo.length > 0, `缩略图数=${thumbInfo.length}`)

  const broken = thumbInfo.filter((img) => !img.src || img.src === 'undefined' || img.src === 'null')
  assert('缩略图 src 不是 undefined/null（旧 bug 特征）', broken.length === 0,
    broken.length ? broken.map((img) => `src="${img.src}"`).join(' / ') : '全部有正常 src')

  const decoded = thumbInfo.filter((img) => img.complete && img.naturalWidth > 0)
  assert('缩略图真正解码成功（非破图）', decoded.length === thumbInfo.length && decoded.length > 0,
    `解码成功 ${decoded.length}/${thumbInfo.length}` + (decoded[0] ? `，首图 ${decoded[0].naturalWidth}x${decoded[0].naturalHeight}` : ''))

  const isRealImage = thumbInfo.every((img) => /^(data:image\/|blob:|https?:\/\/|\/)/.test(img.src))
  assert('缩略图 src 是真实图片地址（不是 CSS 渐变串）', isRealImage,
    thumbInfo.map((img) => img.src.slice(0, 48)).join(' | '))

  // ---------- 4. 页面没有 JS 报错 ----------
  const realErrors = pageErrors.filter((text) => !/401|Unauthorized/i.test(text))
  assert('页面无 JS 报错（忽略首屏 401 探测）', realErrors.length === 0, realErrors.slice(0, 2))

  // ---------- 5. 刷新后参考图仍在（不是只在内存里对） ----------
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1600)
  const afterReload = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.reference-stack-image img, .reference-thumb img')]
    return {
      count: imgs.length,
      decoded: imgs.filter((img) => img.complete && img.naturalWidth > 0).length,
      prompt: (document.querySelector('.pro-prompt-textarea')?.innerText || '').trim(),
    }
  })
  assert('刷新后参考图还在且能显示', afterReload.count > 0 && afterReload.decoded === afterReload.count,
    `缩略图 ${afterReload.decoded}/${afterReload.count} 可显示`)
  assert('刷新后提示词仍然是空的', afterReload.prompt === '', `实际="${afterReload.prompt.slice(0, 40)}"`)

  await page.screenshot({ path: path.join(OUT_DIR, 'step3-reload.png') })
} catch (error) {
  assert('脚本未抛异常', false, error.message)
} finally {
  // 清掉临时项目，不碰学生任何真实作品
  if (tempDocumentId) {
    const page = browser.contexts()[0]?.pages()[0]
    if (page) {
      const removed = await page.evaluate(async (id) => {
        const response = await fetch(`/api/me/documents/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        return response.ok
      }, tempDocumentId).catch(() => false)
      results.push(`  [CLEANUP] 临时项目 ${tempDocumentId} ${removed ? '已删除' : '删除失败，请手动清理'}`)
    }
  }
  await browser.close()
}

console.log('\n=== 素材导入参考图 验收 ===')
results.forEach((line) => console.log(line))
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
console.log(`截图目录：${OUT_DIR}`)
process.exit(fail === 0 ? 0 : 1)

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.login-form .el-input__inner', { timeout: 20000 })
  const inputs = page.locator('.login-form .el-input__inner')
  await inputs.nth(0).fill(ACCOUNT)
  if (await inputs.count() > 2) await inputs.nth(1).fill(ORG_CODE)
  await page.locator('.login-form input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: '进入学生工作台' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })
  await page.waitForTimeout(800)
}

/** 建一条带真实图片版本的学生临时项目，作为「导入参考图」的源素材 */
async function createTempProject(page) {
  return page.evaluate(async ({ title, png }) => {
    const response = await fetch('/api/me/documents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'project',
        resourceKey: `verify-reference-import-${Date.now()}`,
        title,
        data: {
          title,
          // 故意给它一段提示词：如果导入后绘画页带出了这句，说明 bug 还在
          prompt: '这段提示词不该被带到参考图创作页',
          theme: '参考图验证',
          difficulty: 'pro',
          ratio: '4:3',
          // 封面故意用 CSS background 写法（历史数据长这样），验证能被抽出真实地址
          cover: `url("${png}") center / cover no-repeat`,
          versions: [{
            id: 'v1',
            title: '参考图验证 V1',
            imageUrl: png,
            background: `url("${png}") center / cover no-repeat`,
            ratio: '4:3',
            createdAt: new Date().toISOString(),
          }],
          finalVersionId: 'v1',
        },
      }),
    })
    if (!response.ok) throw new Error(`创建失败 HTTP ${response.status}`)
    const payload = await response.json()
    return payload.document?.id || payload.id || ''
  }, { title: TEMP_TITLE, png: PIXEL_PNG })
}
