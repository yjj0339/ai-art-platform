// 仅使用名称包含 test 的专用数据库；测试课程与图片是验收夹具，不调用付费 AI。
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { courseLearningState } from '../src/utils/courseLearning.js'

const testUrl = process.env.TEST_DATABASE_URL
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('需要名称包含 test 的专用 TEST_DATABASE_URL，禁止使用业务库。')
process.env.DATABASE_URL = testUrl
const { query, closeDb } = await import('../server/db.js')
const { hashPassword } = await import('../server/auth.js')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const suffix = randomBytes(5).toString('hex')
const org = `course_test_${suffix}`, password = randomBytes(16).toString('hex')
const evidence = resolve('.workbuddy/evidence/course-center', suffix)
await mkdir(resolve(evidence, 'data'), { recursive: true })
const users = {}, cookies = {}, results = [], errors = []
let services = [], browser, logs = '', port, webPort
const check = (name, condition = true) => { assert.ok(condition, name); results.push(name); console.log('通过：' + name) }
async function freePort() {
  const instance = http.createServer()
  await new Promise(done => instance.listen(0, '127.0.0.1', done))
  const value = instance.address().port
  await new Promise(done => instance.close(done))
  return value
}
async function boot() {
  const env = { ...process.env, PORT: String(port), AUTH_MODE: 'server', VITE_AUTH_MODE: 'server', AI_DATA_DIR: resolve(evidence, 'data'), APP_ORIGIN: `http://127.0.0.1:${webPort}`, VITE_API_PROXY_TARGET: `http://127.0.0.1:${port}` }
  // 与 pnpm dev 启动同一套前后端；直接持有子进程，避免 Windows 进程树清理依赖额外系统权限。
  services = [spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] }), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { env, stdio: ['ignore', 'pipe', 'pipe'] })]
  for (const service of services) { service.stdout.on('data', chunk => { logs += chunk }); service.stderr.on('data', chunk => { logs += chunk }) }
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok && (await fetch(`http://127.0.0.1:${webPort}`)).ok) return } catch {}
    if (services.some(service => service.exitCode !== null)) throw new Error('全栈启动失败：' + logs.slice(-1000))
    await new Promise(done => setTimeout(done, 150))
  }
  throw new Error('全栈启动超时')
}
async function request(path, method = 'GET', body, role = 'student') {
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookies[role] || '' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
async function stop() {
  for (const service of services) {
    if (service.exitCode !== null || service.signalCode !== null) continue
    const exited = once(service, 'exit')
    service.kill()
    await exited
  }
  services = []
}
const fixture = { id: `course-${suffix}`, title: '课程中心验收课程', category: 'creative', status: 'published', difficulty: '少儿基础', authorizedClasses: ['验收班'], authorizedStudents: [], ageRange: '8-10岁', duration: '45分钟', icon: '课', description: '用于验证学习记录、问答、创意与作品提交。', videoUrl: '', pptPages: [{ title: '课程导入', body: '先观察主题，记录创意，再完成作品。' }, { title: '课程总结', body: '整理你的创作想法。' }], questions: [{ title: '创作前先做什么？', options: ['观察主题', '随意点击', '忽略任务'], answer: 'A' }] }
try {
  // 只在专用测试库建立基础表，不修改业务库结构。
  await query(await readFile('server/schema.sql', 'utf8'))
  await query('INSERT INTO organizations (id,code,name) VALUES ($1,$1,$1)', [org])
  const hash = await hashPassword(password)
  for (const role of ['student', 'other', 'teacher', 'parent', 'admin']) {
    users[role] = `${role}_${suffix}`
    await query('INSERT INTO users (id,organization_id,account,password_hash,display_name,role,class_name,permissions) VALUES ($1,$2,$1,$3,$1,$4,$5,$6)', [users[role], org, hash, role === 'other' ? 'student' : role, '验收班', JSON.stringify({ studentAccess: true, courses: true, aiCreate: true, reports: true, teacherAccess: true, parentAccess: true, adminAccess: true })])
  }
  port = await freePort(); webPort = await freePort(); await boot()
  for (const role of Object.keys(users)) {
    const login = await request('/auth/login', 'POST', { organizationCode: org, account: users[role], password }, role)
    assert.equal(login.status, 200); cookies[role] = login.cookie
  }
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const [cookieName, cookieValue] = cookies.student.split('=')
  await context.addCookies([{ name: cookieName, value: cookieValue, url: `http://127.0.0.1:${webPort}` }])
  await context.addInitScript(({ course }) => {
    const layoutCourses = Array.from({ length: 9 }, (_, index) => ({ ...course, id: `${course.id}-layout-${index}`, title: index % 2 ? `网格排版验收${index}` : `较长课程标题的排版与卡片对齐验收${index}`, category: 'ip', questions: [] }))
    localStorage.setItem('art-studio-courses', JSON.stringify([course, ...layoutCourses]))
    localStorage.setItem('art-studio-difficulty', 'starter')
  }, { course: { ...fixture, authorizedStudents: [users.student], authorizedClasses: ['AI创意美术A班', '验收班'] } })
  const page = await context.newPage()
  page.on('pageerror', error => { errors.push(`${page.url()}: ${error.message}`); console.log('脚本错误：' + error.message) })
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('503')) { errors.push(`${page.url()}: ${message.text()}`); console.log('控制台错误：' + message.text()) } })
  page.on('response', response => { if (response.status() >= 400 && response.status() !== 503) console.log(`请求失败：${response.status()} ${new URL(response.url()).pathname}`) })
  await page.goto(`http://127.0.0.1:${webPort}/student/courses?course=${fixture.id}`)
  await page.locator('.learning-primary').waitFor()
  check('真实学生页面加载、空记录显示未开始', (await page.locator('.learning-meta').textContent()).includes('未开始'))
  check('初始不使用演示课程百分比', (await page.locator('.learning-meta').textContent()).includes('0 / 4'))
  const bounds = await page.locator('.learning-panel').boundingBox(), right = await page.locator('.course-grid-panel').boundingBox()
  check('桌面左侧课程情况、右侧课程选择', bounds.x < right.x && Math.abs(bounds.y - right.y) < 2)
  check('列表移除课程成果面板', await page.locator('.learning-results').count() === 0)
  for (const [width, height] of [[1280, 800], [1024, 768], [834, 1194], [768, 1024], [1024, 600]]) {
    await page.setViewportSize({ width, height })
    const layout = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect()
      const left = box('.learning-panel'), right = box('.course-grid-panel'), heading = box('.course-grid-heading'), filters = box('.learning-filters')
      const grid = document.querySelector('.course-grid'), cover = box('.course-cover')
      const cards = [...document.querySelectorAll('.course-card')].map(el => el.getBoundingClientRect())
      return { overflow: document.documentElement.scrollWidth > innerWidth, verticalOverflow: document.documentElement.scrollHeight > innerHeight + 1, sideBySide: left.x < right.x && Math.abs(left.y - right.y) < 1, aligned: Math.abs(left.bottom - right.bottom) < 1, equalCards: Math.max(...cards.map(b => b.height)) - Math.min(...cards.map(b => b.height)) < 1, ratio: cover.width / cover.height, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, scrollable: grid.scrollHeight > grid.clientHeight, compact: heading.height <= 54 && filters.y >= heading.y && filters.bottom <= heading.bottom }
    })
    check(`${width}×${height} 平板保持左右双栏且底部齐平`, layout.sideBySide && layout.aligned)
    check(`${width}×${height} 课程网格等高、封面16:9`, layout.equalCards && Math.abs(layout.ratio - 16 / 9) < .01 && layout.columns === (width >= 1100 ? 3 : 2))
    check(`${width}×${height} 筛选与标题同排且页面不溢出`, layout.compact && !layout.overflow && !layout.verticalOverflow)
    check(`${width}×${height} 右侧列表独立滚动`, layout.scrollable)
    await page.screenshot({ path: resolve(evidence, `tablet-${width}-${height}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  const headingY = await page.locator('.course-grid-heading').evaluate(el => el.getBoundingClientRect().y)
  await page.locator('.course-grid').hover()
  await page.mouse.wheel(0, 600)
  await page.waitForFunction(() => document.querySelector('.course-grid').scrollTop > 0)
  check('滚动课程时标题固定且整页不移动', await page.locator('.course-grid-heading').evaluate(el => el.getBoundingClientRect().y) === headingY && await page.evaluate(() => scrollY === 0))
  await page.locator('.course-grid').focus()
  await page.keyboard.press('End')
  await page.waitForFunction(() => { const el = document.querySelector('.course-grid'); return el.scrollTop + el.clientHeight >= el.scrollHeight - 2 })
  check('键盘可以滚到最后一排课程')
  await page.locator('.course-grid').evaluate(el => el.scrollTop = 0)
  const secondCourse = page.locator('.course-title-button').nth(1)
  const secondTitle = await secondCourse.textContent()
  await secondCourse.click()
  check('点击课程更新左侧情况', await page.locator('.learning-current h3').textContent() === secondTitle)
  await page.locator('.course-title-button').filter({ hasText: fixture.title }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: resolve(evidence, 'desktop.png'), fullPage: true })
  if (process.env.COURSE_DIAGNOSTIC === 'console') {
    await page.locator('.learning-primary').click()
    await page.locator('.lesson-shell').waitFor()
    await page.getByRole('button', { name: '我已完成课程学习', exact: true }).click()
    await page.locator('.answer-option').first().click()
    await page.locator('.submit-btn').click()
    await page.getByRole('button', { name: '创意想法⌄', exact: true }).click()
    await page.locator('.idea-card textarea').fill('控制台诊断创意')
    await page.getByRole('button', { name: '保存创意', exact: true }).click()
    await page.locator('.lesson-left-title .icon-back').click()
    await page.goto(`http://127.0.0.1:${webPort}/student/workbench`)
    await page.locator('.orbit-card').first().waitFor()
    await page.waitForTimeout(1000)
    console.log('独立控制台诊断：' + JSON.stringify(errors))
  } else {
  await page.locator('.learning-primary').click()
  await page.locator('.lesson-shell').waitFor()
  await page.getByRole('button', { name: '我已完成课程学习', exact: true }).click()
  await page.getByRole('button', { name: '课程学习已完成', exact: true }).waitFor()
  await page.locator('.submit-btn').click()
  check('随堂练习缺答时提示、不计完成', !(await request('/me/documents?type=course-learning')).data.documents[0].data.answersSubmitted)
  await page.locator('.answer-option').first().click()
  await page.locator('.submit-btn').click()
  await page.locator('.answer-result').waitFor()
  await page.getByRole('button', { name: '创意想法⌄', exact: true }).click()
  await page.locator('.idea-card textarea').fill('设计一个温暖的社区小店标志。')
  await page.getByRole('button', { name: '保存创意', exact: true }).click()
  await page.getByRole('button', { name: '已保存', exact: true }).waitFor()
  await page.locator('.lesson-left-title .icon-back').click()
  await page.locator('.learning-primary').waitFor()
  check('学习、问答、创意完成后75%，作品仍待提交', (await page.locator('.learning-meta').textContent()).includes('3 / 4'))
  await page.reload(); await page.locator('.learning-primary').waitFor()
  check('刷新恢复学习记录与创意', (await page.locator('.learning-meta').textContent()).includes('3 / 4'))
  await page.locator('.learning-filters [aria-pressed="false"]').filter({ hasText: '未开始' }).click()
  check('状态筛选隐藏学习中的目标课程', await page.locator('.course-title-button').filter({ hasText: fixture.title }).count() === 0)
  await page.locator('.learning-filters button').filter({ hasText: '全部' }).click()
  await page.locator('.course-search input').fill('没有这个课程')
  check('搜索空状态', await page.locator('.learning-empty').filter({ hasText: '暂无符合条件' }).isVisible())
  await page.locator('.course-search input').fill('')
  await page.locator('.learning-toolbar select').selectOption('creative')
  check('原课程分类筛选保留', await page.locator('.course-title-button').filter({ hasText: fixture.title }).count() === 1)
  await page.locator('.learning-toolbar select').selectOption('all')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    check(`${width}px 无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: resolve(evidence, `mobile-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  const project = await request('/me/documents', 'POST', { type: 'project', title: fixture.title, data: { id: `project-${suffix}`, title: fixture.title, courseId: fixture.id, courseTitle: fixture.title, finalVersionId: 'final', versions: [{ id: 'final', imageUrl: image }] } })
  assert.equal(project.status, 201)
  await page.reload(); await page.locator('.learning-step-button').click()
  await page.locator('.learning-work').first().waitFor()
  await page.getByRole('button', { name: '提交课程作品', exact: true }).filter({ visible: true }).evaluateAll(buttons => buttons.find(button => !button.disabled).click())
  await page.waitForFunction(() => document.querySelector('.learning-meta')?.textContent.includes('4 / 4') && !document.querySelector('.learning-save-state')?.textContent.includes('正在保存'))
  check('终稿提交完成四个环节', (await page.locator('.learning-meta').textContent()).includes('已完成'))
  let record = (await request('/me/documents?type=course-learning')).data.documents[0]
  check('课程记录服务端保存且关联本人项目', record.data.submittedProjectId === `project-${suffix}` && record.data.submittedVersionId === 'final')
  check('没有编造老师反馈', await page.getByText('暂无老师反馈', { exact: true }).count() > 0)
  await page.keyboard.press('Escape')
  await page.locator('.el-dialog').waitFor({ state: 'hidden' })
  await page.locator('.learning-primary').click()
  check('已完成课程通过回顾按钮打开原作品与反馈', await page.locator('.course-work-dialog').isVisible())
  await page.keyboard.press('Escape')
  await page.locator('.el-dialog').waitFor({ state: 'hidden' })
  // 确认失败提示和显式重试，随后继续使用真实服务。
  await page.route('**/api/me/documents/*', async route => {
    if (route.request().method() === 'PATCH') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '测试：学习记录暂时无法保存' }) })
    else await route.continue()
  })
  await page.locator('.course-card').filter({ has: page.locator('.course-title-button').filter({ hasText: fixture.title }) }).locator('.start-btn').click()
  await page.locator('.learning-error').waitFor()
  check('保存失败不跳转、不伪装成功', await page.locator('.course-list-shell').isVisible())
  await page.unroute('**/api/me/documents/*')
  await page.getByRole('button', { name: '重试保存', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.learning-error'))
  check('保存失败重试恢复')
  await page.route('**/api/me/documents?type=course-learning', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '测试：学习记录读取失败' }) }))
  await page.reload(); await page.locator('.learning-error').waitFor()
  check('加载失败显示错误并禁用开始学习', await page.locator('.start-btn').first().isDisabled())
  await page.unroute('**/api/me/documents?type=course-learning')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.locator('.learning-primary').waitFor()
  check('加载失败重试恢复')
  await page.goto(`http://127.0.0.1:${webPort}/student/workbench`)
  await page.locator('.orbit-card').first().waitFor()
  check('工作台删除课程情况并保留课程选择', await page.locator('.orbit-card h2').filter({ hasText: '课程情况' }).count() === 0 && await page.locator('.orbit-card h2').filter({ hasText: '课程选择' }).count() === 1)
  const own = await request(`/me/documents/${record.id}`)
  check('本人读取正确', own.status === 200)
  check('另一学生列表不含本人的学习记录', (await request('/me/documents?type=course-learning', 'GET', undefined, 'other')).data.documents.length === 0)
  check('另一学生读取记录被拒绝', (await request(`/me/documents/${record.id}`, 'GET', undefined, 'other')).status === 404)
  check('另一学生修改记录被拒绝', (await request(`/me/documents/${record.id}`, 'PATCH', { data: {} }, 'other')).status === 404)
  for (const role of ['teacher', 'parent', 'admin']) check(`${role}不能代写学习记录`, (await request(`/me/documents/${record.id}`, 'PATCH', { data: {} }, role)).status === 403)
  check('未登录读取被拒绝', (await request('/me/documents?type=course-learning', 'GET', undefined, 'anonymous')).status === 401)
  check('错误输入被拒绝', (await request(`/me/documents/${record.id}`, 'PATCH', { data: [] })).status === 400)
  check('浏览器无未处理脚本或控制台错误', errors.length === 0)
  // 先关浏览器，再主动重启服务，避免把测试制造的开发服务器断连算作页面错误。
  await context.close()
  await stop(); await boot()
  check('重启全栈后学习记录仍在', (await request(`/me/documents/${record.id}`)).data.document.data.submittedVersionId === 'final')
  const restored = (await request(`/me/documents/${record.id}`)).data.document
  const state = courseLearningState(fixture, restored.data, [project.data.document.data])
  check('四个完成条件均成立', state.status === 'completed')
  check('删除提交版本后不再假称已完成', courseLearningState(fixture, restored.data, [{ ...project.data.document.data, versions: [] }]).status !== 'completed')
  console.log(`课程中心验收 ${results.length} 项通过；证据目录：${evidence}`)
  }
} finally {
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify({ results, errors }, null, 2))
  await browser?.close(); await stop()
  // 只清理本脚本创建的验收机构及其数据。
  await query('DELETE FROM audit_logs WHERE organization_id = $1', [org])
  await query('DELETE FROM user_documents WHERE organization_id = $1', [org])
  await query('DELETE FROM users WHERE organization_id = $1', [org])
  await query('DELETE FROM organizations WHERE id = $1', [org])
  await closeDb()
}
