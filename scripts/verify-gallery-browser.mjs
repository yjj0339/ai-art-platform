// 由 verify-gallery-workflow.mjs 提供独立服务、账号与测试数据。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

export async function verifyGalleryBrowser({ webPort,port,cookies,evidence,check,request,saveRules,studentDoc }) {
  const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
  const pause = ms => new Promise(done => setTimeout(done,ms))
  const diagnostics = { errors:[],failed:[],http:[] }
  let browser
  // 使用已构建的正式页面，避免其他开发进程共享依赖预编译缓存。
  let webLogs = ''
  const web = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--outDir',process.env.GALLERY_BUILD_DIR || 'dist','--host','127.0.0.1','--port',String(webPort),'--strictPort'],{ env:{ ...process.env,VITE_AUTH_MODE:'server',VITE_AI_MODE:'api',VITE_API_PROXY_TARGET:`http://127.0.0.1:${port}` },stdio:['ignore','pipe','pipe'] })
  web.stdout.on('data',chunk => { webLogs += chunk }); web.stderr.on('data',chunk => { webLogs += chunk })
  try {
    let ready = false
    for (let n = 0; n < 100; n++) { if (web.exitCode !== null) throw new Error('构建预览启动失败，请查看 web.log'); try { if ((await fetch(`http://127.0.0.1:${webPort}`,{ signal:AbortSignal.timeout(1000) })).ok) { ready = true; break } } catch {}; await pause(100) }
    if (!ready) throw new Error('构建预览启动超时')
    browser = await chromium.launch({ headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) })
    async function pageFor(role) {
      const context = await browser.newContext({ viewport:{ width:1440,height:1000 } })
      await context.addCookies([{ name:cookies[role].split('=')[0],value:cookies[role].slice(cookies[role].indexOf('=')+1),url:`http://127.0.0.1:${webPort}` }])
      await context.addInitScript(() => { localStorage.setItem('art-studio-difficulty','pro'); localStorage.setItem('art-studio-muted','true') })
      const page = await context.newPage(); page.setDefaultTimeout(45000)
      page.on('pageerror',error => diagnostics.errors.push(error.message)); page.on('requestfailed',req => { if (!req.failure()?.errorText?.includes('ERR_ABORTED')) diagnostics.failed.push({ url:req.url(),error:req.failure()?.errorText }) }); page.on('response',res => { if (res.status() >= 400) diagnostics.http.push({ path:new URL(res.url()).pathname,status:res.status() }) })
      return page
    }
    const admin = await pageFor('admin')
    await admin.goto(`http://127.0.0.1:${webPort}/admin?module=audit`); await admin.locator('.audit-rule-cards').waitFor()
    check('真实浏览器打开唯一内容审核面板',await admin.locator('.gallery-audit-panel').count() === 1)
    const auditInput = admin.locator('#audit-requirements'); assert.ok(await auditInput.isDisabled())
    await admin.getByRole('switch',{ name:'启用自定义审核要求',exact:true }).click(); await auditInput.fill('浏览器保存的审核要求：适合儿童浏览')
    await admin.getByRole('switch',{ name:'启用自定义优秀作品标准',exact:true }).click(); await admin.locator('#selection-requirements').fill('浏览器保存的优秀标准：重视想象力')
    await admin.getByRole('button',{ name:'保存并启用',exact:true }).click(); await admin.getByText('审核规则已保存到服务端',{ exact:true }).waitFor()
    await admin.reload(); await admin.locator('.audit-rule-cards').waitFor(); check('两类开关输入保存后刷新仍正确',await auditInput.inputValue() === '浏览器保存的审核要求：适合儿童浏览' && !(await auditInput.isDisabled()))
    await auditInput.fill(''); await admin.getByRole('button',{ name:'保存并启用',exact:true }).click(); await admin.getByText('请填写自定义审核要求，或关闭对应开关。',{ exact:true }).waitFor(); check('开启空要求阻止保存且表单保留',await auditInput.inputValue() === '')
    await auditInput.fill('浏览器保存的审核要求：适合儿童浏览')
    await admin.getByRole('button',{ name:'选择作品试审',exact:true }).click(); const trialDialog = admin.getByRole('dialog',{ name:'选择作品试审' }); check('平台预算为0时试审按钮禁用且原因可见',await trialDialog.getByRole('button',{ name:'开始试审（计入额度）' }).isDisabled())
    await admin.setViewportSize({ width:390,height:844 }); await pause(200); const trialBox = await trialDialog.boundingBox(); check('试审弹窗在390宽度内可见',trialBox.x >= 0 && trialBox.x+trialBox.width <= 391); await admin.screenshot({ path:join(evidence,'试审弹窗-390.png'),fullPage:true }); await trialDialog.getByRole('button',{ name:'关闭',exact:true }).click(); await admin.setViewportSize({ width:1440,height:1000 })
    await auditInput.fill('未保存的草稿'); await admin.getByRole('button',{ name:/账号权限/ }).click(); await admin.locator('.el-message-box').waitFor(); await admin.locator('.el-message-box').getByRole('button',{ name:'继续编辑' }).click(); check('内部导航的未保存提示可取消',await auditInput.inputValue() === '未保存的草稿')
    await admin.getByRole('button',{ name:'刷新',exact:true }).click(); await admin.locator('.el-message-box').getByRole('button',{ name:'放弃并刷新',exact:true }).click(); await admin.locator('.audit-rule-cards').waitFor(); await pause(200)
    await admin.waitForFunction(() => !document.querySelector('.el-message')); await admin.screenshot({ path:join(evidence,'后台内容审核-桌面.png'),fullPage:true })
    for (const [width,height] of [[1024,900],[390,844]]) { await admin.setViewportSize({ width,height }); await pause(200); check(`后台${width}宽度无页面横向溢出`,await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)); await admin.screenshot({ path:join(evidence,`后台内容审核-${width}.png`),fullPage:true }) }
    await admin.setViewportSize({ width:1440,height:1000 })
    const row = admin.locator('tr').filter({ hasText:'浏览器待审作品' })
    await row.getByRole('button',{ name:'详情',exact:true }).click(); const detail = admin.getByRole('dialog',{ name:'作品审核详情' }); await detail.locator('img').waitFor(); await detail.locator('img').evaluate(img => img.decode()); check('详情读取有权限的真实图片',await detail.locator('img').evaluate(img => img.naturalWidth > 0)); await detail.getByRole('button',{ name:/关闭|Close/ }).click()
    await row.getByRole('button',{ name:'通过',exact:true }).click(); await admin.locator('.el-message-box__input input').fill('浏览器人工核对图片通过'); await admin.locator('.el-message-box').getByRole('button',{ name:'确认处理' }).click(); await row.getByText('已上架',{ exact:true }).waitFor(); check('后台人工处理按钮真实上架')
    await row.getByRole('button',{ name:'下架',exact:true }).click(); await admin.locator('.el-message-box__input input').fill('浏览器核对下架功能'); await admin.locator('.el-message-box').getByRole('button',{ name:'确认处理' }).click(); await row.getByText('已下架',{ exact:true }).waitFor(); check('后台下架按钮真实生效')
    await row.getByRole('button',{ name:'重新上架',exact:true }).click(); await admin.locator('.el-message-box__input input').fill('浏览器重新核对通过'); await admin.locator('.el-message-box').getByRole('button',{ name:'确认处理' }).click(); await row.getByText('已上架',{ exact:true }).waitFor()
    await admin.getByRole('button',{ name:'学校授权',exact:true }).click(); check('学校授权页显示真实登记依据',await admin.getByText('学校公开授权登记',{ exact:true }).isVisible())
    const consentRow = admin.locator('tr').filter({ has:admin.getByRole('cell',{ name:'验收student',exact:true }) }); await consentRow.getByRole('button',{ name:'登记 / 更新' }).click(); await admin.locator('.el-message-box textarea').fill('隔离浏览器验收：学校已授权审核和公开展示'); await admin.locator('.el-message-box').getByRole('button',{ name:'登记确认' }).click(); await consentRow.getByText('隔离浏览器验收：学校已授权审核和公开展示',{ exact:true }).waitFor(); check('学校授权登记按钮真实保存依据')
    await admin.getByRole('button',{ name:'规则设置',exact:true }).click(); await saveRules({ qualityThreshold:87 }); await auditInput.fill('并发修改保留的输入'); await admin.getByRole('button',{ name:'保存并启用',exact:true }).click(); await admin.getByText('设置已被其他管理员修改，请刷新后重新编辑。',{ exact:true }).waitFor(); check('界面版本冲突保留草稿并明确提示',await auditInput.inputValue() === '并发修改保留的输入')
    await admin.getByRole('button',{ name:'刷新',exact:true }).click(); await admin.locator('.el-message-box').getByRole('button',{ name:'放弃并刷新',exact:true }).click(); await admin.locator('.audit-rule-cards').waitFor()
    await admin.route('**/api/admin/gallery-meta',route => route.fulfill({ status:503,contentType:'application/json',body:JSON.stringify({ message:'隔离验证：审核记录暂时不可用' }) })); await admin.reload(); await admin.getByText('隔离验证：审核记录暂时不可用',{ exact:false }).first().waitFor(); check('后台加载失败与空记录区分且禁用保存',await admin.getByRole('button',{ name:'保存并启用',exact:true }).isDisabled()); await admin.unroute('**/api/admin/gallery-meta'); await admin.getByRole('button',{ name:'重新加载',exact:true }).click(); await admin.locator('.audit-rule-cards').waitFor()
    const student = await pageFor('student')
    await request('/api/me/gallery-consent',{ method:'PUT',body:{ optedIn:false } })
    await student.goto(`http://127.0.0.1:${webPort}/student/portfolio`); const card = student.locator('.portfolio-card').filter({ hasText:'浏览器学生投稿作品' }); await card.waitFor()
    const participation = student.locator('.auto-select-setting').getByRole('switch'), participationButton = student.locator('.auto-select-setting .el-switch:not(.is-disabled) .el-switch__core'); await participationButton.click(); await student.locator('.el-message-box').getByRole('button',{ name:'允许参与' }).click(); await student.getByText('已允许后续最终作品参与系统精选',{ exact:true }).waitFor(); await student.reload(); await card.waitFor(); await student.locator('.auto-select-setting .el-switch.is-checked').waitFor(); check('学生参与开关确认后持久化',await participation.getAttribute('aria-checked') === 'true'); await participationButton.click(); await student.getByText('已关闭后续自动精选；已上架作品可逐件撤回',{ exact:true }).waitFor(); check('学生关闭参与开关真实生效',!(await request('/api/me/gallery-consent')).data.consent.opted_in)
    await card.click(); await student.getByRole('button',{ name:'投稿到作品广场',exact:true }).click()
    const form = student.getByRole('dialog',{ name:'投稿到作品广场',exact:true }); check('投稿必须勾选公开说明',await form.getByRole('button',{ name:'提交审核',exact:true }).isDisabled()); await form.locator('.el-checkbox').click(); assert.ok(await form.getByRole('checkbox').isChecked())
    await student.setViewportSize({ width:390,height:844 }); await pause(200); const formBox = await form.boundingBox(); check('学生投稿弹窗适应390宽度',formBox.x >= 0 && formBox.x+formBox.width <= 391); await student.screenshot({ path:join(evidence,'学生投稿-390.png'),fullPage:true }); await student.setViewportSize({ width:1440,height:1000 })
    await student.route('**/api/me/gallery-submissions',route => route.request().method() === 'POST' ? route.fulfill({ status:503,contentType:'application/json',body:JSON.stringify({ message:'隔离验证：暂时无法提交，请重试' }) }) : route.continue())
    await form.getByRole('button',{ name:'提交审核',exact:true }).click(); await student.getByText('隔离验证：暂时无法提交，请重试',{ exact:true }).waitFor(); check('投稿失败保留表单和可读错误',await form.isVisible()); await student.unroute('**/api/me/gallery-submissions')
    await form.getByRole('button',{ name:'提交审核',exact:true }).click(); await form.waitFor({ state:'hidden' }); const portfolioDetail = student.getByRole('dialog',{ name:'单个素材浏览' }); await portfolioDetail.getByText('待人工复核',{ exact:true }).waitFor(); check('学生展示服务端实际待审状态')
    await portfolioDetail.getByRole('button',{ name:'撤回广场作品' }).click(); await student.locator('.el-message-box').getByRole('button',{ name:'确认撤回' }).click(); await portfolioDetail.getByText('已撤回',{ exact:true }).waitFor(); check('学生可撤回单件作品'); await portfolioDetail.getByRole('button',{ name:/关闭|Close/ }).click()
    await student.screenshot({ path:join(evidence,'学生素材库.png'),fullPage:true })
    await student.goto(`http://127.0.0.1:${webPort}/student/gallery`); await student.locator('.gallery-card').first().waitFor(); check('广场实际封面路径转换正确',(await student.locator('.cover').first().evaluate(el => getComputedStyle(el).backgroundImage)).includes('/api/gallery/submissions/')); await student.screenshot({ path:join(evidence,'作品广场.png'),fullPage:true })
    await student.setViewportSize({ width:390,height:844 }); check('学生广场窄屏没有页面横向溢出',await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)); await student.screenshot({ path:join(evidence,'作品广场-390.png'),fullPage:true }); await student.locator('.gallery-card').first().click(); const publicDetail = student.getByRole('dialog',{ name:'作品详情',exact:true }); const publicBox = await publicDetail.boundingBox(); check('广场详情弹窗适应390宽度',publicBox.x >= 0 && publicBox.x+publicBox.width <= 391); await publicDetail.getByRole('button',{ name:/关闭|Close/ }).click()
    await student.setViewportSize({ width:1440,height:1000 }); await student.goto(`http://127.0.0.1:${webPort}/student/workbench`); await student.getByRole('tab',{ name:'选择作品广场' }).click(); await student.getByRole('button',{ name:'浏览作品广场',exact:true }).click(); await student.locator('.gallery-card').first().waitFor(); check('工作台作品广场入口保持可用并读取真实列表')
    const publicData = (await request('/api/gallery/public?pageSize=1')).data, course = publicData.works[0].course
    const filtered = (await request(`/api/gallery/public?pageSize=1&course=${encodeURIComponent(course)}`)).data; check('公开课程完整分类与服务端分页筛选正确',publicData.courses.includes(course) && filtered.works.length === 1 && filtered.works.every(work => work.course === course) && filtered.total >= 1)
    const absent = (await request('/api/gallery/public?course='+encodeURIComponent('隔离不存在分类'))).data; check('公开分类无匹配时返回真实空列表',absent.total === 0 && absent.works.length === 0)
    await Promise.all([student.waitForResponse(res => new URL(res.url()).pathname === '/api/gallery/public'),student.getByRole('button',{ name:course,exact:true }).click()]); check('广场课程按钮发起服务端筛选',await student.locator('.gallery-card').count() > 0)
    await student.route('**/api/gallery/public*',route => route.fulfill({ contentType:'application/json',body:JSON.stringify({ works:[],total:0,page:1,pageSize:20,courses:[] }) })); await student.getByRole('button',{ name:'刷新作品',exact:true }).click(); await student.getByText('暂时没有符合条件的公开作品',{ exact:true }).waitFor(); check('隔离空响应下广场显示空状态'); await student.unroute('**/api/gallery/public*')
    await student.goto(`http://127.0.0.1:${webPort}/student/paint?projectId=${studentDoc.data.id}`); await student.locator('.paint-page').waitFor(); check('受保护绘画入口仍可进入，未调用生成')
    await admin.getByRole('button',{ name:'学校授权',exact:true }).click(); await consentRow.getByRole('button',{ name:'撤回授权',exact:true }).click(); await admin.locator('.el-message-box').getByRole('button',{ name:'确认撤回',exact:true }).click(); await consentRow.getByText('未登记',{ exact:true }).waitFor(); await student.goto(`http://127.0.0.1:${webPort}/student/portfolio`); await student.getByText('学校尚未登记公开授权，自动精选和投稿暂不可用。',{ exact:true }).waitFor(); check('学校撤回授权后学生参与禁用',await participation.isDisabled())
    await admin.getByRole('button',{ name:'规则设置',exact:true }).click(); await auditInput.fill('退出时未保存草稿'); await admin.getByRole('button',{ name:'退出登录',exact:true }).click(); await admin.locator('.el-message-box').getByRole('button',{ name:'放弃并离开',exact:true }).click(); await admin.waitForURL('**/login'); check('后台退出登录的脏草稿确认与导航正常'); check('退出时即使作品同步失败也清空审核缓存',await student.evaluate(async () => { const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; const projects = pinia._s.get('project'); if (!projects) throw new Error('未加载作品状态'); projects.flushServerWrites = async () => { throw new Error('隔离验证保存失败') }; await pinia._s.get('user').logout(); const gallery = pinia._s.get('gallery'); return gallery.adminWorks.length === 0 && gallery.ownWorks.length === 0 && !gallery.ownLoaded && !gallery.settings.aiAudit }))
    check('浏览器没有未捕获运行错误',diagnostics.errors.length === 0)
  } finally {
    if (browser) { for (const [index,context] of browser.contexts().entries()) for (const page of context.pages()) { await page.screenshot({ path:join(evidence,`页面现场-${index}.png`),fullPage:true }).catch(() => {}); await writeFile(join(evidence,`页面文字-${index}.txt`),await page.locator('body').innerText().catch(() => '页面不可读')) }; await browser.close() }
    if (web.exitCode === null) { const ended = once(web,'exit'); web.kill(); await ended }
    await writeFile(join(evidence,'browser-diagnostics.json'),JSON.stringify(diagnostics,null,2))
    await writeFile(join(evidence,'web.log'),webLogs)
  }
}
