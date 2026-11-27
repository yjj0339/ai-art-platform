/**
 * 验证 A 档语音：智能体回话会被念出来 + 静音开关 + 麦克风按钮能听能停。
 *
 * 不花钱：朗读被劫持成记录文本，不出声；麦克风用 Chromium 的假设备。
 * 用法：node scripts/verify-agent-voice.mjs [页面路径]
 */
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const { chromium } = require('playwright-core')
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'

const base = 'http://127.0.0.1:5173'
const route = process.argv[2] || '/student/paint'
const shotDir = 'docs/mockups/shots'

/**
 * 绘画页从「一个输入框，两种模式」之后，面板里不再有自己的输入框和麦克风：
 * 输入、语音、发送全部搬到底部那个大框旁边。其余四页仍是面板自带的一套。
 * 这里只做选择器适配，断言内容一模一样。
 */
const isPaint = route === '/student/paint'
const inputSel = isPaint ? '.pro-prompt-textarea' : '.sa-input'
const micSel = isPaint ? '.voice-action-btn' : '.sa-mic'
const micLiveSel = isPaint ? '.voice-action-btn.active' : '.sa-mic.is-live'

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const fails = []
function check(ok, label, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) fails.push(label)
}

// 朗读劫持成「记下念了什么」，不出声；并关掉实时识别，强制走录音兜底
await page.addInitScript(() => {
  window.__spoken = []
  try {
    const synth = window.speechSynthesis
    synth.speak = (utterance) => {
      window.__spoken.push(String(utterance?.text || ''))
      window.__lastUtterance = utterance
    }
    synth.cancel = () => {}
  } catch {}
  // 真机播报结束会回调 onend，测试里没有真的播，用这个手动「播完」
  window.__finishSpeech = () => { try { window.__lastUtterance?.onend?.() } catch {} }
  try {
    window.SpeechRecognition = undefined
    window.webkitSpeechRecognition = undefined
  } catch {}
})

await page.goto(`${base}/login?redirect=${route}`, { waitUntil: 'domcontentloaded' })
// 这一轮只验语音和对话，绝不真出图、不真转写：拦截付费接口（绘画页尤其要拦）
if (isPaint) {
  await page.route('**/api/ai/image/generate', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'blocked', results: [] }) }))
  await page.route('**/api/ai/audio/transcribe', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '' }) }))
}
await page.waitForTimeout(800)
const inputs = page.locator('.el-input__inner')
await inputs.nth(0).fill('ceshi2')
await inputs.nth(1).fill('demo-school')
await inputs.nth(2).fill('123456789')
await page.getByRole('button', { name: /进入学生工作台/ }).click()
await page.waitForTimeout(3000)

await page.evaluate(() => {
  localStorage.setItem('art-studio-difficulty', 'pro')
  localStorage.removeItem('ai-agent-voice-muted')
})
await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await page.evaluate(() => document.querySelectorAll('.el-message, .el-notification').forEach((n) => n.remove()))

for (let i = 0; i < 4; i += 1) {
  const overlay = page.locator('.el-overlay').first()
  if (!(await overlay.count())) break
  const closer = page.locator('.el-dialog__headerbtn, .el-overlay-dialog button:has-text("取消"), .el-overlay-dialog button:has-text("不要了")').first()
  if (await closer.count()) await closer.click({ force: true }).catch(() => {})
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}
if (await page.locator('.el-overlay').count()) {
  await page.evaluate(() => document.querySelectorAll('.el-overlay').forEach((n) => n.remove()))
  await page.waitForTimeout(300)
}

await page.locator('.sa-figure-btn').first().click()
await page.waitForTimeout(700)

check(await page.locator('.sa-panel').count() > 0, '面板已打开')
const hasPageToggle = await page.locator('.paint-page .mute-btn').count() > 0
const soundCount = await page.locator('.sa-sound').count()
console.log(`[开关] 页面顶栏开关 ${hasPageToggle} 个，面板喇叭 ${soundCount} 个`)
// 每个页面、包括绘画页，面板里都必须有一个能看见的朗读开关
check(soundCount === 1, '面板里有朗读开关', await page.locator('.sa-sound').innerText())
check(/朗读/.test(await page.locator('.sa-sound').innerText()), '开关上有文字（不只是个小喇叭图标）')
check(await page.locator('.sa-mic').count() > 0 || isPaint, '输入框旁边有麦克风按钮', isPaint ? '麦克风在大框旁边' : '')
if (isPaint) {
  check(await page.locator('.sa-input').count() === 0, '面板里没有第二套输入框（已并入大框）')
  check(await page.locator('.sa-mic').count() === 0, '面板里没有第二套麦克风（已并在大框旁边）')
}

/** 发一句「只问不画」的话，等回话 */
async function askAndWait(text) {
  if (isPaint) {
    // 大框是 contenteditable：先清掉残留草稿，再整句打进去，最后点旁边的发送
    const editor = page.locator(inputSel).first()
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.type(text)
    await page.waitForTimeout(200)
    await page.locator('.pro-action-stack button:has-text("发送")').click()
  } else {
    await page.locator(inputSel).fill(text)
    await page.locator(inputSel).press('Enter')
  }
  for (let i = 0; i < 90; i += 1) {
    await page.waitForTimeout(1000)
    const thinking = await page.locator('.sa-bubble.is-thinking').count()
    const agentBubbles = await page.locator('.sa-bubble.is-agent').allTextContents()
    if (!thinking && agentBubbles.length >= 2) return agentBubbles[agentBubbles.length - 1].trim()
  }
  return ''
}

// ① 开着声音：回复要念出来
const reply1 = await askAndWait('我想画恐龙，但不知道背景画什么')
check(!!reply1, '第一句有回话', reply1.slice(0, 40))
await page.waitForTimeout(600)
const spoken1 = await page.evaluate(() => window.__spoken || [])
check(spoken1.length > 0, '回话被念出来了', spoken1.map((s) => s.slice(0, 24)).join(' | '))
check(
  spoken1.some((s) => reply1 && s.includes(reply1.slice(0, 8))),
  '念的内容就是回话本身',
  spoken1[spoken1.length - 1]?.slice(0, 40) || '',
)
await page.screenshot({ path: `${shotDir}/agent-voice-1-spoken.png` })

// ①·2 每句话前面的小喇叭：能单独念、能单独停，总开关关着一律不响
const bubbleCount = await page.locator('.sa-line .sa-speak').count()
check(bubbleCount >= 1, '老师每句话前面都有一个小喇叭', `${bubbleCount} 个`)
const lastSpeak = page.locator('.sa-line .sa-speak').last()
// 回话一到就自动念了，这一句的灯应该是亮的
const autoOn = await lastSpeak.evaluate((n) => n.classList.contains('is-on'))
check(autoOn, '回话一到就自动念，这句的喇叭亮着')
// 模拟设备播报结束（真机上由 onend 通知，这里没有真声音）
await page.evaluate(() => window.__finishSpeech?.())
await page.waitForTimeout(200)
const autoOff = await lastSpeak.evaluate((n) => n.classList.contains('is-on'))
check(!autoOff, '念完了喇叭自己熄灭（不会一直显示在念）')
const afterAuto = (await page.evaluate(() => window.__spoken || [])).length
await lastSpeak.click()
await page.waitForTimeout(300)
const manualSpoken = await page.evaluate(() => window.__spoken || [])
check(manualSpoken.length > afterAuto, '点小喇叭能单句重念', `${afterAuto} → ${manualSpoken.length}`)
const playing = await lastSpeak.evaluate((n) => n.classList.contains('is-on'))
check(playing, '正在念的那句，喇叭亮起来（能看出在念哪句）')
await lastSpeak.click()
await page.waitForTimeout(300)
const stoppedOn = await lastSpeak.evaluate((n) => n.classList.contains('is-on'))
check(!stoppedOn, '再点一下同一句就停（不会停不下来）')

// ② 关掉声音：一律点面板里那个「朗读」开关（每页都有，不再依赖顶栏）
await page.locator('.sa-sound').click()
await page.waitForTimeout(300)
const mutedText = await page.locator('.sa-sound').innerText()
check(/关闭/.test(mutedText), '点一下变成「朗读关闭」', mutedText)
const mutedFlag = await page.evaluate(() => localStorage.getItem('ai-agent-voice-muted'))
console.log('[静音标记] ai-agent-voice-muted =', String(mutedFlag))
if (hasPageToggle) {
  const pageActive = await page.locator('.paint-page .mute-btn').evaluate((n) => n.classList.contains('active'))
  check(pageActive, '绘画页顶栏那个开关跟着一起变成静音', pageActive ? '顶栏显示静音' : '没跟着变')
}
const before = (await page.evaluate(() => window.__spoken || [])).length
const reply2 = await askAndWait('那背景用什么颜色好')
await page.waitForTimeout(600)
const after = (await page.evaluate(() => window.__spoken || [])).length
check(!!reply2, '第二句有回话（静音不影响对话）', reply2.slice(0, 40))
check(after === before, '静音之后没有再念', `${before} → ${after}`)
// 总开关关着，点单句的小喇叭也不能出声
await lastSpeak.click()
await page.waitForTimeout(500)
const afterTapWhenMuted = (await page.evaluate(() => window.__spoken || [])).length
check(afterTapWhenMuted === before, '总开关关着时点小喇叭也不出声', `${before} → ${afterTapWhenMuted}`)
await page.screenshot({ path: `${shotDir}/agent-voice-2-muted.png` })

// ②·2 再点一下要能打开，并且立刻念一句确认
await page.locator('.sa-sound').click()
await page.waitForTimeout(900)
check(/开启/.test(await page.locator('.sa-sound').innerText()), '再点一下回到「朗读开启」')
const reopened = (await page.evaluate(() => window.__spoken || [])).length
check(reopened > after, '打开后立刻念一句，学生知道生效了', `${after} → ${reopened}`)
// 打开状态留着会影响后面麦克风那段，关回去
await page.locator('.sa-sound').click()
await page.waitForTimeout(300)
const mutedFlag2 = await page.evaluate(() => localStorage.getItem('ai-agent-voice-muted'))
check(mutedFlag2 === 'true', '开关状态会存下来（下次进页面还是静音）', String(mutedFlag2))

// ③ 麦克风：点一下开始听，再点一下停
// 绘画页的麦克风在大框旁边，走的是页面自己那套识别；其余页在面板输入框旁边
await page.locator(micSel).first().click()
await page.waitForTimeout(1200)
const live = await page.locator(micLiveSel).count()
check(live > 0, '点麦克风进入「正在听」', live ? '按钮高亮' : '没高亮')
if (!isPaint) {
  const placeholder = await page.locator('.sa-input').getAttribute('placeholder')
  check(/正在听/.test(placeholder || ''), '输入框提示切成了正在听', placeholder || '')
}
await page.screenshot({ path: `${shotDir}/agent-voice-3-listening.png` })

await page.locator(micSel).first().click()
// 录音 1.2 秒基本是静音，转写可能失败——只看它有没有停在「正在听」不动
let settled = false
for (let i = 0; i < 40; i += 1) {
  await page.waitForTimeout(1000)
  if (await page.locator(micLiveSel).count() === 0) { settled = true; break }
}
check(settled, '再点一下能结束录音，不会卡在「正在听」')
const micBubbles = await page.locator('.sa-bubble.is-agent').allTextContents()
const heardFail = micBubbles.some((t) => /没听清/.test(t))
console.log(heardFail
  ? '[录音兜底] 转写没拿到字，面板已用大白话提示学生重说'
  : '[录音兜底] 转写没报错（或录到了内容）')
await page.screenshot({ path: `${shotDir}/agent-voice-4-after-mic.png` })

console.log(`\n${fails.length ? '有失败项：' + fails.join('、') : '全部通过'}`)
await browser.close()
process.exit(fails.length ? 1 : 0)
