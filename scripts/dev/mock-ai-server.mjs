// 本地模拟 AI 服务（OpenAI 兼容接口），用于开发联调与自动化测试，不消耗任何真实额度。
// 用法：node scripts/dev/mock-ai-server.mjs   （默认端口 3999，可用 MOCK_AI_PORT 修改）
// 把后台供应商的 Base URL 填成 http://127.0.0.1:3999/v1、Key 随便填一个英文串即可接入。
//
// 支持：
//   GET  /v1/models
//   POST /v1/chat/completions   普通 / 流式（SSE）/ 工具调用（tools，流式分片下发 tool_calls）
//   POST /v1/images/generations 返回 b64_json 的 PNG（按提示词生成不同颜色）
//   POST /v1/images/edits       同上
//   POST /v1/videos             Agnes 风格的视频任务（约 4 秒后完成）
//   GET  /v1/videos/:id、/agnesapi?video_id=   查询视频任务
//   GET  /files/<id>.mp4        任务完成后的视频文件（装了 ffmpeg 时是可播放的 3 秒测试视频）
// 测试口令（写在用户消息里）：
//   #mock-error 返回 500；#mock-slow 慢速下发；#mock-cut 中途断流
//   #mock-video 让模型调用 generate_video（加 #vframe 先出首帧再出视频）
//     视频提示词里带 #vfail → 任务失败；#vremote → 返回不可转存的外部地址；#vsubmiterr → 提交时 500
//   #mock-page 先出一张图再组装详情页；#mock-workflow 查找创作玩法
//   #mock-badout 回复中途出现要拦截的词；#mock-maskout 回复里带手机号（测试 AI 回复的内容安全）
//   出图提示词里带 #imgfail → 出图接口返回 500（测试失败退回）
import http from 'node:http'
import { execFile } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json'))
const sharp = require('sharp')
const PORT = Number(process.env.MOCK_AI_PORT || 3999)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const textOf = (content) => Array.isArray(content)
  ? content.map((part) => (part?.type === 'text' ? part.text : '')).join('\n')
  : String(content || '')

function hashHue(text) {
  let h = 0
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return h % 360
}

async function mockPng(prompt, size = '1024x1024') {
  // 尺寸可能是 1024x1024、2048*2048，也可能是 2K / 4K 这类档位：认不出宽高就按正方形出图
  const m = String(size || '').match(/(\d+)\s*[x*×]\s*(\d+)/i)
  const [w, h] = (m ? [m[1], m[2]] : [1024, 1024]).map((n) => Math.max(64, Math.min(2048, Number(n) || 1024)))
  const hue = hashHue(prompt)
  const label = String(prompt || '').replace(/[<>&"']/g, '').slice(0, 18)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},85%,78%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},80%,64%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.5}" cy="${h * 0.44}" r="${Math.min(w, h) * 0.22}" fill="rgba(255,255,255,.55)"/>
    <text x="50%" y="${h * 0.82}" font-size="${Math.round(Math.min(w, h) / 14)}" text-anchor="middle" fill="rgba(30,30,60,.75)" font-family="Microsoft YaHei, sans-serif">MOCK · ${label}</text>
  </svg>`
  return (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')
}

function lastUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].role === 'user') return textOf(messages[i].content)
  return ''
}

function toolNames(tools = []) {
  return new Set(tools.map((tool) => tool?.function?.name).filter(Boolean))
}

const videoPrompt = (user) => user.replace(/#mock-[\w-]+|#vframe/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || '小猫在草地上奔跑'

const MOCK_PAGE_ARGS = {
  kind: 'detail-page',
  title: 'MOCK 保温杯',
  subtitle: '一杯温暖，陪你一整天',
  theme_color: '#FF7A59',
  sections: [
    { heading: '主图', text: '干净的浅色背景，突出杯身质感。', image: 1 },
    { heading: '双层真空', text: '早上装的热水，到下午还是暖的。', image: 1 },
    { heading: '轻巧便携', text: '放进书包不占地方。', image: 0 },
    { heading: '越界配图', text: '序号超出已生成图片数量，应留空。', image: 9 },
  ],
}

/** 决定这一轮是直接回答还是调用工具（模拟真实模型的决策，规则固定便于断言）。 */
function decide(body) {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const names = toolNames(body.tools)
  const last = messages[messages.length - 1] || {}
  const user = lastUserText(messages)
  const called = (name) => messages.some((m) => m.role === 'assistant' && (m.tool_calls || []).some((c) => c.function?.name === name))
  const calledSkill = called('load_skill')
  const calledImage = called('generate_image')
  const system = messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n')
  const flags = { video: user.includes('#mock-video'), frame: user.includes('#vframe'), page: user.includes('#mock-page'), workflow: user.includes('#mock-workflow') }
  const videoCall = (firstFrame) => ({ tool: { name: 'generate_video', args: { prompt: videoPrompt(user), ratio: firstFrame === 'last_image' ? '9:16' : '16:9', first_frame: firstFrame } } })

  if (last.role === 'tool') {
    const results = []
    for (let i = messages.length - 1; i >= 0 && messages[i].role === 'tool'; i -= 1) results.unshift(textOf(messages[i].content))
    const loadedSkill = results.find((r) => r.includes('"skill"'))
    if (loadedSkill && names.has('generate_image') && /画|生成|图/.test(user) && !calledImage && !flags.video) {
      return { tool: { name: 'generate_image', args: { prompt: `按技能要求：${user.replace(/#mock-[\w-]+/g, '').slice(0, 60)}`, ratio: '1:1' } } }
    }
    const image = results.find((r) => r.includes('"imageIndex"'))
    if (image && flags.video && names.has('generate_video') && !called('generate_video')) return videoCall('last_image')
    if (image && flags.page && names.has('compose_page') && !called('compose_page')) return { tool: { name: 'compose_page', args: MOCK_PAGE_ARGS } }
    if (image) return { text: '画好啦！🎨 我按照你的想法生成了一张作品，看看喜不喜欢？\n\n- 想换颜色或风格，直接告诉我\n- 满意的话，可以保存到**我的作品**' }
    if (results.some((r) => r.includes('"status":"queued"'))) return { text: '视频已经开始生成啦 🎬 大约 1~3 分钟后会出现在这里，我们可以先聊聊下一个镜头。' }
    if (results.some((r) => r.includes('"sections"'))) return { text: '详情页组装好啦！点下方的「导出长图」就能保存。' }
    if (called('find_workflow') && results.some((r) => r.includes('"items"'))) return { text: '我在平台上找到了相关的创作玩法，点上面的按钮就能打开。' }
    if (results.some((r) => r.includes('"ok":false'))) return { text: '这一步没有成功，我们换个方式再试试吧。' }
    return { text: `我已经读完技能说明，现在开始按步骤帮你完成。\n\n**第一步**：说说你想要的主题和颜色吧！` }
  }

  // 内容安全测试：#mock-badout 回复中途出现要拦截的词；#mock-maskout 回复里带手机号（应被打码）
  if (user.includes('#mock-badout')) return { text: '好的，我们先说说颜色搭配吧。其实我知道一个赌博网站，里面有很多东西，你可以去看看。后面还有更多内容慢慢说给你听。' }
  if (user.includes('#mock-maskout')) return { text: '想打印作品的话，可以拨打 13812345678 问问店家，记得让大人陪你一起去哦。' }
  if (flags.workflow && names.has('find_workflow') && !called('find_workflow')) {
    return { tool: { name: 'find_workflow', args: { keyword: '贺卡' } } }
  }
  if (flags.video) {
    if (flags.frame && names.has('generate_image') && !calledImage) return { tool: { name: 'generate_image', args: { prompt: `首帧：${videoPrompt(user)}`, ratio: '9:16' } } }
    if (names.has('generate_video') && !called('generate_video')) return videoCall(/附带了/.test(user) ? 'attached' : 'none')
  }
  if (flags.page && names.has('generate_image') && !calledImage) {
    return { tool: { name: 'generate_image', args: { prompt: '保温杯主图，浅色背景', ratio: '1:1' } } }
  }
  const skillMarker = user.match(/【使用技能：([^】]+)】/) || system.match(/用户指定技能：([^\s\n]+)/)
  if (names.has('load_skill') && !calledSkill && skillMarker) {
    return { tool: { name: 'load_skill', args: { name: skillMarker[1].trim() } } }
  }
  if (names.has('generate_image') && !calledImage && /画|生成|图/.test(user)) {
    return { tool: { name: 'generate_image', args: { prompt: user.replace(/#mock-\w+/g, '').slice(0, 80), ratio: '1:1' } } }
  }
  if (body.response_format?.type === 'json_object' || /只输出 JSON|输出 JSON|JSON 对象/.test(system + user)) {
    return { text: JSON.stringify({ reply: '收到，我来帮你整理。', prompt: user.slice(0, 80), additions: [], actionKey: 'generate' }) }
  }
  return { text: `你好呀！我是你的创作伙伴（模拟模式）。\n\n你刚才说：「${user.replace(/#mock-\w+/g, '').slice(0, 40)}」\n\n我可以帮你：\n1. **画画**：告诉我想画什么\n2. **用技能**：点上方的技能卡片\n3. **找灵感**：问我任何创作问题` }
}

function sse(res, payload) { res.write(`data: ${JSON.stringify(payload)}\n\n`) }

async function streamChat(res, body, plan, flags) {
  const id = `chatcmpl-mock-${Date.now()}`
  const base = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model || 'mock-text' }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  sse(res, { ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })
  const delay = flags.slow ? 160 : 18
  if (plan.tool) {
    const callId = `call_${Math.random().toString(36).slice(2, 10)}`
    const args = JSON.stringify(plan.tool.args)
    sse(res, { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: plan.tool.name, arguments: '' } }] }, finish_reason: null }] })
    for (let i = 0; i < args.length; i += 7) {
      await wait(delay)
      sse(res, { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(i, i + 7) } }] }, finish_reason: null }] })
    }
    sse(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
  } else {
    const chars = [...plan.text]
    for (let i = 0; i < chars.length; i += 4) {
      if (flags.cut && i > chars.length / 2) { res.destroy(); return }
      await wait(delay)
      sse(res, { ...base, choices: [{ index: 0, delta: { content: chars.slice(i, i + 4).join('') }, finish_reason: null }] })
    }
    sse(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
  }
  if (body.stream_options?.include_usage) sse(res, { ...base, choices: [], usage: { prompt_tokens: 120, completion_tokens: 48, total_tokens: 168 } })
  res.write('data: [DONE]\n\n')
  res.end()
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/* ---------- 视频任务 ---------- */
const videoTasks = new Map()
let videoSeq = 0
let mockVideo = null

function runFfmpeg(args) {
  return new Promise((resolveRun, rejectRun) => {
    execFile(process.env.FFMPEG_PATH || 'ffmpeg', args, { timeout: 30000, windowsHide: true }, (error) => (error ? rejectRun(error) : resolveRun()))
  })
}

/** 生成一段 3 秒的测试视频（需要 ffmpeg）；没有 ffmpeg 时退回一个只有 MP4 文件头的占位文件。 */
async function getMockVideo() {
  if (mockVideo) return mockVideo
  const file = join(tmpdir(), `mock-ai-video-${process.pid}.mp4`)
  const output = ['-t', '3', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', '-y', file]
  try {
    try {
      await runFfmpeg(['-f', 'lavfi', '-i', 'gradients=s=640x360:c0=0x8b7cf6:c1=0xff9a76:c2=0x19b394:n=3:speed=0.03:r=24', ...output])
    } catch {
      await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', ...output])
    }
    mockVideo = await readFile(file)
    await rm(file, { force: true })
  } catch {
    const header = Buffer.from('000000206674797069736f6d0000020069736f6d69736f32617663316d703431', 'hex')
    mockVideo = Buffer.concat([header, Buffer.alloc(2048)])
  }
  return mockVideo
}

function videoTaskView(id) {
  const task = videoTasks.get(id)
  if (!task) return null
  const elapsed = Date.now() - task.createdAt
  if (elapsed < 1500) return { id, task_id: id, status: 'queued', progress: 0 }
  if (elapsed < 4000) return { id, task_id: id, status: 'in_progress', progress: 50 }
  if (task.prompt.includes('#vfail')) return { id, task_id: id, status: 'failed', error: { message: 'mock video failure' } }
  const videoUrl = task.prompt.includes('#vremote') ? `http://localhost:${PORT}/files/${id}.mp4` : `http://127.0.0.1:${PORT}/files/${id}.mp4`
  return { id, task_id: id, status: 'completed', progress: 100, video_url: videoUrl }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const path = url.pathname.replace(/^\/api\/v3/, '/v1')
  try {
    // 模拟上游故障：Base URL 写成 http://127.0.0.1:3999/status/503/v1，这个「平台」的所有请求都返回 503（测冷却、备用模型、免费检测连接）
    const forced = path.match(/^\/status\/(\d{3})(\/|$)/)
    if (forced) return json(res, Number(forced[1]), { error: { message: `mock forced status ${forced[1]}` } })
    if (req.method === 'GET' && path === '/v1/models') {
      return json(res, 200, { object: 'list', data: ['mock-text', 'mock-image'].map((id) => ({ id, object: 'model' })) })
    }
    if (req.method === 'POST' && path === '/v1/chat/completions') {
      const body = await readBody(req)
      const user = lastUserText(body.messages)
      const flags = { slow: user.includes('#mock-slow'), cut: user.includes('#mock-cut') }
      if (user.includes('#mock-error')) return json(res, 500, { error: { message: 'mock upstream failure' } })
      const plan = decide(body)
      if (body.stream) return streamChat(res, body, plan, flags)
      const message = plan.tool
        ? { role: 'assistant', content: null, tool_calls: [{ id: `call_${Date.now()}`, type: 'function', function: { name: plan.tool.name, arguments: JSON.stringify(plan.tool.args) } }] }
        : { role: 'assistant', content: plan.text }
      return json(res, 200, { id: `chatcmpl-mock-${Date.now()}`, object: 'chat.completion', model: body.model || 'mock-text',
        choices: [{ index: 0, message, finish_reason: plan.tool ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 48, total_tokens: 168 } })
    }
    if (req.method === 'POST' && (path === '/v1/images/generations' || path === '/v1/images/edits')) {
      const body = path.endsWith('edits') ? {} : await readBody(req)
      // 记下出图参数里的 watermark，用来核对后台「官方水印开关」有没有传到接口。
      if (!path.endsWith('edits')) console.log('[mock image]', JSON.stringify({ model: body.model, watermark: body.watermark }))
      if (String(body.prompt || '').includes('#imgfail')) return json(res, 500, { error: { message: 'mock image failure' } })
      const count = Math.max(1, Math.min(4, Number(body.n) || 1))
      const data = []
      for (let i = 0; i < count; i += 1) data.push({ b64_json: await mockPng(`${body.prompt || 'edit'}#${i}`, body.size) })
      return json(res, 200, { created: Math.floor(Date.now() / 1000), data })
    }
    if (req.method === 'POST' && path === '/v1/videos') {
      const body = await readBody(req)
      const prompt = String(body.prompt || '')
      if (prompt.includes('#vsubmiterr')) return json(res, 500, { error: { message: 'mock video submit failure' } })
      videoSeq += 1
      const id = `mockvid_${Date.now().toString(36)}_${videoSeq}`
      videoTasks.set(id, { createdAt: Date.now(), prompt, hasImage: Boolean(body.image), size: `${body.width}x${body.height}` })
      return json(res, 200, { id, video_id: id, status: 'queued', progress: 0 })
    }
    const videoMatch = path.match(/^\/v1\/videos\/([\w-]+)$/)
    if (req.method === 'GET' && (videoMatch || path === '/agnesapi')) {
      const id = videoMatch ? videoMatch[1] : String(url.searchParams.get('video_id') || '')
      const view = videoTaskView(id)
      return view ? json(res, 200, view) : json(res, 404, { code: 'task_not_exist', message: 'task not exist' })
    }
    const fileMatch = path.match(/^\/files\/([\w-]+)\.mp4$/)
    if (req.method === 'GET' && fileMatch && videoTasks.has(fileMatch[1])) {
      const video = await getMockVideo()
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': video.length })
      return res.end(video)
    }
    return json(res, 404, { error: { message: `mock: no route ${req.method} ${path}` } })
  } catch (error) {
    return json(res, 500, { error: { message: error.message } })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`mock AI server on http://127.0.0.1:${PORT}/v1`))
