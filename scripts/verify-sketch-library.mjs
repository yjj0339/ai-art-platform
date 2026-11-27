// 临时验收：手绘稿能否在「AI绘画 / AI视频」的资源库弹窗里被选到（学生自己去选那条闭环）。
import { createRequire } from 'node:module'
import sharp from 'sharp'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const pass = (label) => console.log(`通过：${label}`)

const png = await sharp({ create: { width: 1600, height: 1200, channels: 4, background: '#ffffff' } }).composite([{
  input: Buffer.from('<svg width="1600" height="1200"><circle cx="800" cy="600" r="320" fill="#ff7a00"/></svg>'),
  top: 0, left: 0,
}]).png().toBuffer()
const dataUrl = `data:image/png;base64,${png.toString('base64')}`
const title = `验收手绘稿-资源库-${Date.now()}`

const browser = await chromium.launch({ executablePath: CHROME })
const problems = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (err) => problems.push(String(err)))
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const login = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
    })
    return res.status
  })
  if (login !== 200) throw new Error(`学生登录失败 ${login}`)

  const created = await page.evaluate(async ({ dataUrl, title }) => {
    const assetRes = await fetch('/api/me/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ kind: 'sketch', originalName: `${title}.png`, mimeType: 'image/png', base64: dataUrl }),
    })
    const assetBody = await assetRes.json()
    if (!assetBody.asset?.id) throw new Error(`素材落盘失败：${JSON.stringify(assetBody)}`)
    const imageUrl = `/api/assets/${assetBody.asset.id}`
    const docRes = await fetch('/api/me/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ type: 'sketch', resourceKey: assetBody.asset.id, title, data: { assetId: assetBody.asset.id, imageUrl, width: 1600, height: 1200 } }),
    })
    const docBody = await docRes.json()
    return { documentId: docBody.document?.id || '', imageUrl }
  }, { dataUrl, title })
  if (!created.documentId) throw new Error('手绘稿文档没建成')
  pass(`测试手绘稿已入库：${created.documentId}`)

  // AI 绘画资源库
  await page.goto(`${BASE}/student/paint`, { waitUntil: 'domcontentloaded' })
  await page.locator('.reference-card').first().waitFor({ timeout: 30000 })
  // 学生账号里可能留着上次没做完的草稿，页面会先弹「发现上次没做完的作品」，挡住所有点击，先关掉。
  const resumeDialog = page.locator('.el-dialog', { hasText: '发现上次没做完的作品' })
  if (await resumeDialog.count()) {
    await resumeDialog.locator('button', { hasText: '继续' }).first().click()
    await resumeDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
    await delay(400)
  }
  await page.locator('.reference-card').first().click()
  await page.locator('.reference-menu button', { hasText: '资源库' }).click()
  const paintDialog = page.locator('.el-dialog', { hasText: '选择参考素材' })
  await paintDialog.waitFor({ timeout: 20000 })
  await delay(600)
  const paintHit = await paintDialog.locator(`article[title="${title}"]`).count()
  if (!paintHit) throw new Error('AI绘画资源库里找不到这张手绘稿')
  pass('AI绘画资源库能看到手绘稿')
  const paintThumbOk = await page.evaluate(() => {
    const thumbs = [...document.querySelectorAll('.library-grid .library-thumb')]
    return thumbs.some((el) => (getComputedStyle(el).backgroundImage || '').includes('/api/assets/'))
  })
  if (!paintThumbOk) throw new Error('AI绘画资源库里手绘稿缩略图没有加载出图片')
  pass('AI绘画资源库缩略图加载出真实图片')
  await paintDialog.locator(`article[title="${title}"]`).click()
  await delay(500)
  const refCount = await page.locator('.reference-stack-image').count()
  if (!refCount) throw new Error('选了手绘稿之后参考图区没有出现缩略图')
  pass('选中手绘稿后进入参考图区')

  // AI 视频资源库
  await page.goto(`${BASE}/student/video`, { waitUntil: 'domcontentloaded' })
  await page.locator('.video-reference-card').first().waitFor({ timeout: 30000 })
  await page.locator('.video-reference-card').first().click()
  await page.locator('.video-reference-menu button', { hasText: '资源库' }).click()
  const videoDialog = page.locator('.el-dialog', { hasText: '从资源库选择参考素材' })
  await videoDialog.waitFor({ timeout: 20000 })
  await delay(600)
  const videoHit = await videoDialog.locator(`article[title="${title}"]`).count()
  if (!videoHit) throw new Error('AI视频资源库里找不到这张手绘稿')
  pass('AI视频资源库能看到手绘稿')

  const cleaned = await page.evaluate(async (id) => {
    const res = await fetch(`/api/me/documents/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    return res.status
  }, created.documentId)
  console.log(`清理测试文档：HTTP ${cleaned}`)
  if (problems.length) problems.slice(0, 5).forEach((item) => console.log(`页面报错：${item}`))
  console.log(problems.length ? '完成，但有页面报错' : '全部通过')
} finally {
  await browser.close()
}
