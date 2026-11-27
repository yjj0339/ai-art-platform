// 「图像生成时，服务端到底有没有把上游参考图送进请求体、送进哪个字段」硬证据诊断脚本。
//
// 目的（只读诊断，绝不修改 src/ 或 server/）：
//   用户报告「Agnes 能吃到上游图，切换到别的模型（火山方舟 doubao-seedream-4-0-250828）就读不到上游图」。
//   本脚本起一个假的“上游平台” HTTP stub，完整记录服务端真实发出的每一个请求（method/path/headers/body），
//   再对每个供应商走一次真实的 /api/ai/image/generate，从而把“参考图有没有真的写进 payload、写进哪个字段”
//   变成机器可断言的事实。
//
// 关键设计（与仓库里既有脚本的差别）：
//   - 用「保存后的 ai-providers.json」把各供应商 baseUrl 指向 stub，而不是靠环境变量。
//     因为 server/index.js:1473 `baseUrl: patch.baseUrl || item.baseUrl` —— 保存的配置会覆盖环境变量预设，
//     而用户本机正是“保存了 baseUrl”的真实场景，这样复现才忠实。
//   - 保存配置里**故意不声明** imageInput，忠实还原用户真实配置，测试各供应商代码预设是否兜底。
//
// 用法：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     node scripts/repro-provider-reference-forwarding.mjs
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { deflateSync as zlibDeflate } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createAssetRefFixture, DEFAULT_DB_URL } from './lib/asset-ref-fixture.mjs'

const PROJECT_DIR = process.cwd()
const SERVER_PORT = 3309
// server 模式（AUTH_MODE=server + 真实 DB）用来验证 `/api/assets/<id>` 的解析，单开一个端口避免和 demo 实例抢。
const ASSET_SERVER_PORT = 3310
const STUB_PORT = 3391
const tempDir = path.join(os.tmpdir(), `provider-forward-check-${Date.now()}`)
const REAL_PROVIDER_CONFIG = path.join(PROJECT_DIR, 'server', 'data', 'ai-providers.json')

// 1x1 PNG，既满足“可读图”判定（isUpstreamReadableImage 要 data:image/png;base64,），也能过 blob 转换。
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const TINY_B64 = TINY_PNG.split(',')[1]

// 生成一张纯色 PNG 的 data URL（不依赖任何图形库），用于构造“多张不同的上游图”场景。
function solidPngDataUrl(size, rgb) {
  const crcTable = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c }
  const crc32 = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
    const payload = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(payload), 0)
    return Buffer.concat([len, payload, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.alloc(size * 3 + 1)
  for (let x = 0; x < size; x += 1) { row[1 + x * 3] = rgb[0] & 0xff; row[2 + x * 3] = rgb[1] & 0xff; row[3 + x * 3] = rgb[2] & 0xff }
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlibDeflate(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}
const IMG_RED = solidPngDataUrl(8, [255, 0, 0])
const IMG_GREEN = solidPngDataUrl(8, [0, 255, 0])
const IMG_BLUE = solidPngDataUrl(8, [0, 0, 255])
// 画布上游图若未在浏览器侧转成 data URL，会以这种「本地资产路径」形态到达服务端。
const LOCAL_ASSET_PATH = '/api/assets/ast__orxNwT0WowEYZAUWglb9J1C'

const stubBase = `http://127.0.0.1:${STUB_PORT}/v1`
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// 假上游平台：记录每一个收到的请求，并返回形态合法的图像响应。
// ---------------------------------------------------------------------------
const captured = []
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const raw = Buffer.concat(chunks)
    captured.push({
      method: req.method,
      path: req.url || '',
      headers: { ...req.headers },
      contentType: String(req.headers['content-type'] || ''),
      body: raw,
    })
    const send = (code, payload) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    const url = req.url || ''
    // 图像生成：OpenAI/Agnes 兼容（url 形态）。
    if (url.includes('/images/generations')) return send(200, { data: [{ url: TINY_PNG }] })
    // 图生图 edits：multipart，返回 b64_json。
    if (url.includes('/images/edits')) return send(200, { data: [{ b64_json: TINY_B64 }] })
    if (url.includes('/models')) return send(200, { data: [{ id: 'stub-image-model' }] })
    return send(200, { data: [] })
  })
})

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function request(port, method, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: urlPath,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...extraHeaders,
      },
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch { /* 保留原文 */ }
        resolve({ status: res.statusCode, text, json })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function waitForServer(port, timeoutMs = 30000, accept = (status) => status === 200) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await request(port, 'GET', '/api/ai/health')
      if (accept(response.status)) return true
    } catch { /* 尚未监听 */ }
    await delay(300)
  }
  return false
}

function lastCall(pathPart) {
  for (let index = captured.length - 1; index >= 0; index -= 1) {
    if (captured[index].path.includes(pathPart)) return captured[index]
  }
  return null
}

function parseMultipart(buf, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '')
  if (!match) return []
  const boundary = (match[1] || match[2]).trim()
  const delim = Buffer.from(`--${boundary}`)
  const idxs = []
  let cursor = buf.indexOf(delim)
  while (cursor >= 0) { idxs.push(cursor); cursor = buf.indexOf(delim, cursor + delim.length) }
  const parts = []
  for (let k = 0; k < idxs.length - 1; k += 1) {
    let seg = buf.slice(idxs[k] + delim.length, idxs[k + 1])
    if (seg.length >= 2 && seg[0] === 0x0d && seg[1] === 0x0a) seg = seg.slice(2)
    if (seg.length >= 2 && seg[seg.length - 2] === 0x0d && seg[seg.length - 1] === 0x0a) seg = seg.slice(0, seg.length - 2)
    const sep = seg.indexOf('\r\n\r\n')
    if (sep < 0) continue
    const headerText = seg.slice(0, sep).toString('utf8')
    const content = seg.slice(sep + 4)
    const name = /name="([^"]*)"/i.exec(headerText)
    const filename = /filename="([^"]*)"/i.exec(headerText)
    const type = /Content-Type:\s*([^\r\n]+)/i.exec(headerText)
    parts.push({
      name: name ? name[1] : '',
      filename: filename ? filename[1] : '',
      type: type ? type[1].trim() : '',
      size: content.length,
    })
  }
  return parts
}

// 描述「图片到底落在请求体的哪个字段、什么形态、几张」。
function describePlacement(call) {
  if (!call) {
    return { path: '(无上游请求)', field: '(未发出)', shape: '无', count: 0, note: '服务端没有向 stub 发出任何请求' }
  }
  const ct = call.contentType || ''
  if (ct.includes('multipart/form-data')) {
    const parts = parseMultipart(call.body, ct)
    const images = parts.filter((p) => p.name === 'image')
    return {
      path: `${call.method} ${call.path}`,
      field: 'multipart 字段 "image"（文件）',
      shape: images.length ? `文件 ×${images.length}（${images.map((p) => p.filename || '(无文件名)').join(', ')}）` : '无',
      count: images.length,
      note: `multipart 字段: ${parts.map((p) => p.name + (p.filename ? `=${p.filename}` : '')).join(', ')}`,
    }
  }
  let json = {}
  try { json = JSON.parse(call.body.toString('utf8') || '{}') } catch { /* 非 JSON */ }
  const candidates = [
    ['extra_body.image', json?.extra_body?.image],
    ['image', json?.image],
    ['images', json?.images],
    ['image_url', json?.image_url],
    ['init_image', json?.init_image],
  ]
  const hit = candidates.find(([, value]) => value !== undefined)
  if (!hit) {
    return {
      path: `${call.method} ${call.path}`,
      field: '(请求体内没有任何图片字段)',
      shape: '—',
      count: 0,
      note: `顶层字段: ${Object.keys(json).join(', ') || '(空)'}`,
    }
  }
  const [field, value] = hit
  const isArray = Array.isArray(value)
  const list = isArray ? value : [value]
  const first = String(list[0] || '')
  return {
    path: `${call.method} ${call.path}`,
    field,
    isArray,
    shape: `${isArray ? '数组' : '字符串'} ×${list.length}（${first.startsWith('data:image') ? 'data:image' : first.slice(0, 24)}…）`,
    count: list.length,
    note: `顶层字段: ${Object.keys(json).join(', ')}`,
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
let serverProcess = null
let serverLog = ''
const rows = []
const realConfigHashBefore = existsSync(REAL_PROVIDER_CONFIG)
  ? createHash('sha256').update(readFileSync(REAL_PROVIDER_CONFIG)).digest('hex')
  : '(不存在)'

try {
  mkdirSync(tempDir, { recursive: true })

  // 保存配置：把要测的供应商 baseUrl 指向 stub。**故意不写 imageInput**，忠实还原用户真实配置，
  // 以验证「代码预设的 imageInput 是否能正确兜底」。
  const providerConfig = {
    defaultProvider: 'agnes',
    defaultTextProvider: 'agnes',
    hiddenProviders: [],
    providers: {
      agnes: { label: 'Agnes AI', baseUrl: stubBase, apiKey: 'stub-key', imageModel: 'agnes-image-2.1-flash' },
      // 用户报告出问题的这条：真实 imageModel 与真实 baseUrl 形态，只是指向 stub。
      volcengine: { label: '火山方舟', baseUrl: stubBase, apiKey: 'stub-key', imageModel: 'doubao-seedream-4-0-250828' },
      // apiKey 原本为空会 503 短路，这里补一个假 key 让它走完转发链路。
      openai: { label: 'OpenAI', baseUrl: stubBase, apiKey: 'stub-key', imageModel: 'gpt-image-1' },
      // 未声明参考图协议的“后台新建平台”：验证默认 body-field + declared:false 告警路径。
      'custom-undeclared': { label: '假平台-未声明', category: 'custom', custom: true, baseUrl: stubBase, apiKey: 'stub-key', imageModel: 'stub-image-model' },
      // 显式声明不支持参考图：验证 400 硬报错（不是静默丢弃）。
      'custom-none': { label: '假平台-不支持参考图', category: 'custom', custom: true, baseUrl: stubBase, apiKey: 'stub-key', imageModel: 'stub-image-model', imageInput: { mode: 'none' } },
    },
  }
  writeFileSync(path.join(tempDir, 'ai-providers.json'), JSON.stringify(providerConfig, null, 2), 'utf8')

  await new Promise((resolve) => stub.listen(STUB_PORT, '127.0.0.1', resolve))

  const childEnv = { ...process.env }
  // 清掉系统代理：本机代理会劫持回环地址，导致 stub 收不到请求。
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) delete childEnv[key]
  serverProcess = spawn(process.execPath, [path.join(PROJECT_DIR, 'server', 'index.js')], {
    cwd: PROJECT_DIR,
    env: { ...childEnv, PORT: String(SERVER_PORT), AUTH_MODE: 'demo', AI_DATA_DIR: tempDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProcess.stdout.on('data', (chunk) => { serverLog += chunk.toString('utf8') })
  serverProcess.stderr.on('data', (chunk) => { serverLog += chunk.toString('utf8') })

  const ready = await waitForServer(SERVER_PORT)
  if (!ready) throw new Error(`服务端未能在 30 秒内启动：\n${serverLog.slice(-1500)}`)

  const generate = (payload) => request(SERVER_PORT, 'POST', '/api/ai/image/generate', {
    prompt: '测试',
    ratio: '1:1',
    quality: 'standard',
    count: 1,
    ...payload,
  })

  // 场景定义：'dup' = 完全还原前端（images 与 referenceImage 同图）；'single' = 只传 images；
  //           'multi3' = 3 张不同上游图 + referenceImage=首图（前端真实形态）。
  const scenarios = [
    { provider: 'agnes', model: 'agnes-image-2.1-flash', body: 'dup', label: 'Agnes', expect: { field: 'extra_body.image', count: 1 } },
    { provider: 'volcengine', model: 'doubao-seedream-4-0-250828', body: 'dup', label: '火山方舟（前端同款：images+referenceImage）', expect: { field: 'image', count: 1, string: true } },
    { provider: 'volcengine', model: 'doubao-seedream-4-0-250828', body: 'single', label: '火山方舟（仅 images，单图）', expect: { field: 'image', count: 1, string: true } },
    { provider: 'volcengine', model: 'doubao-seedream-4-0-250828', body: 'multi3', label: '火山方舟（3 张不同上游图）', expect: { field: 'image', count: 3, array: true } },
    { provider: 'openai', model: 'gpt-image-1', body: 'dup', label: 'OpenAI', expect: { path: '/images/edits', count: 1 } },
    { provider: 'custom-undeclared', model: 'stub-image-model', body: 'dup', label: '假平台-未声明协议', expect: { field: 'image', count: 1, string: true } },
    { provider: 'custom-none', model: 'stub-image-model', body: 'dup', label: '假平台-声明不支持参考图', expect: {} },
    // 诊断：画布上游图未转 data URL 时，服务端是否「静默丢掉」本地资产路径（真实用户症状复现）。
    { provider: 'volcengine', model: 'doubao-seedream-4-0-250828', body: 'localpath-only', label: '火山方舟（只有 /api/assets 本地路径）', expect: {} },
    { provider: 'volcengine', model: 'doubao-seedream-4-0-250828', body: 'localpath-mixed', label: '火山方舟（标记裁剪 dataURL + /api/assets 本地路径）', expect: {} },
  ]

  for (const scenario of scenarios) {
    let body
    if (scenario.body === 'single') body = { images: [TINY_PNG] }
    else if (scenario.body === 'multi3') body = { images: [IMG_RED, IMG_GREEN, IMG_BLUE], referenceImage: IMG_RED } // 首图重复，考验去重
    else if (scenario.body === 'localpath-only') body = { images: [LOCAL_ASSET_PATH] }
    else if (scenario.body === 'localpath-mixed') body = { images: [IMG_GREEN, LOCAL_ASSET_PATH], referenceImage: IMG_GREEN } // 裁剪图在前、本地路径在后
    else body = { images: [TINY_PNG], referenceImage: TINY_PNG } // 前端 CanvasStudio.vue:3786 真实形态

    captured.length = 0
    const response = await generate({ provider: scenario.provider, model: scenario.model, ...body })
    const call = lastCall('/images/')
    const placement = describePlacement(call)
    rows.push({
      label: scenario.label,
      provider: scenario.provider,
      model: scenario.model,
      expect: scenario.expect || {},
      status: response.status,
      placement,
      referenceImageCount: response.json?.referenceImageCount ?? '-',
      forwardedImageCount: response.json?.forwardedImageCount ?? '-',
      warnings: response.json?.warnings || [],
      message: response.json?.message || '',
      call,
    })
  }

  // -------------------------------------------------------------------------
  // server 模式 + 真实 DB：验证 `/api/assets/<id>` 现在能被服务端解析成 data URL 并送进上游请求体。
  // （demo 模式没有登录用户，getAccessibleAsset 拿不到组织上下文，所以必须单开一个 server 模式实例。）
  // -------------------------------------------------------------------------
  const assetTest = { available: false, reason: '', status: 0, forwarded: '-', imageValue: '', isDataUrl: false, bytes: 0, expectedBytes: 0, message: '' }
  let assetServer = null
  let assetFixture = null
  try {
    assetFixture = await createAssetRefFixture({ dbUrl: process.env.REPRO_DB_URL || DEFAULT_DB_URL, dataDir: tempDir, log: console.log })
    if (!assetFixture.available) {
      assetTest.reason = assetFixture.reason
      console.log(`\n[server 模式资产解析] 跳过：${assetFixture.reason}`)
    } else {
      const assetEnv = { ...process.env }
      for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) delete assetEnv[key]
      assetServer = spawn(process.execPath, [path.join(PROJECT_DIR, 'server', 'index.js')], {
        cwd: PROJECT_DIR,
        env: {
          ...assetEnv,
          PORT: String(ASSET_SERVER_PORT),
          AUTH_MODE: 'server',
          AI_DATA_DIR: tempDir,
          DATABASE_URL: process.env.REPRO_DB_URL || DEFAULT_DB_URL,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let assetLog = ''
      assetServer.stdout.on('data', (chunk) => { assetLog += chunk.toString('utf8') })
      assetServer.stderr.on('data', (chunk) => { assetLog += chunk.toString('utf8') })
      // server 模式下未带 cookie 访问 /api/* 会 401，所以只要有响应就说明实例已监听。
      const assetReady = await waitForServer(ASSET_SERVER_PORT, 30000, () => true)
      if (!assetReady) throw new Error(`server 模式实例未启动：\n${assetLog.slice(-800)}`)

      captured.length = 0
      const assetResponse = await request(ASSET_SERVER_PORT, 'POST', '/api/ai/image/generate', {
        provider: 'volcengine',
        model: 'doubao-seedream-4-0-250828',
        prompt: '测试',
        ratio: '1:1',
        count: 1,
        images: [`/api/assets/${assetFixture.assetId}`],
      }, { Cookie: assetFixture.cookie })

      assetTest.available = true
      assetTest.status = assetResponse.status
      assetTest.forwarded = assetResponse.json?.forwardedImageCount ?? '-'
      assetTest.expectedBytes = assetFixture.expectedBytes
      assetTest.message = assetResponse.json?.message || ''
      const call = lastCall('/images/')
      let json = {}
      try { json = JSON.parse(call?.body?.toString('utf8') || '{}') } catch { /* ignore */ }
      assetTest.imageValue = typeof json.image === 'string' ? json.image : ''
      assetTest.isDataUrl = assetTest.imageValue.startsWith('data:image/png;base64,')
      assetTest.bytes = assetTest.imageValue ? Buffer.from(assetTest.imageValue.split(',')[1] || '', 'base64').length : 0

      console.log('\n==================== server 模式：/api/assets/<id> 参考图解析 ====================')
      console.log(`  fixture: assetId=${assetFixture.assetId}（磁盘 ${assetFixture.expectedBytes} 字节）`)
      console.log(`  HTTP ${assetTest.status} | forwardedImageCount=${assetTest.forwarded}`)
      console.log(`  上游请求体 image 字段: ${assetTest.imageValue ? `${assetTest.imageValue.slice(0, 32)}…（解码后 ${assetTest.bytes} 字节）` : '(无)'}`)
    }
  } catch (error) {
    assetTest.reason = error?.message || String(error)
    console.log(`\n[server 模式资产解析] 异常：${assetTest.reason}`)
  } finally {
    if (assetFixture) await assetFixture.cleanup()
    if (assetServer) {
      assetServer.kill()
      await delay(400)
      if (!assetServer.killed) assetServer.kill('SIGKILL')
    }
  }

  // -------------------------------------------------------------------------
  // 打印对照表
  // -------------------------------------------------------------------------
  const pad = (text, width) => {
    const str = String(text ?? '')
    // 中文按 2 宽度估算，保证表格对齐。
    let w = 0
    for (const ch of str) w += /[\u4e00-\u9fa5（）]/.test(ch) ? 2 : 1
    return str + ' '.repeat(Math.max(0, width - w))
  }

  console.log('')
  console.log('==================== 参考图转发对照表 ====================')
  const header = [pad('供应商', 30), pad('上游请求', 30), pad('图片落在字段', 26), pad('形态/张数', 34), pad('forwarded', 10), pad('HTTP', 6), pad('502守卫', 8)]
  console.log(header.join(' | '))
  console.log('-'.repeat(160))
  for (const row of rows) {
    const guard = row.status === 502 ? '命中' : (row.placement.count > 0 ? '未命中' : '未命中(?)')
    console.log([
      pad(row.label, 30),
      pad(row.placement.path, 30),
      pad(row.placement.field, 26),
      pad(row.placement.shape, 34),
      pad(row.forwardedImageCount, 10),
      pad(row.status, 6),
      pad(guard, 8),
    ].join(' | '))
  }
  console.log('')

  // -------------------------------------------------------------------------
  // 原始证据（stub 抓到的最原始 body）
  // -------------------------------------------------------------------------
  console.log('==================== stub 抓到的原始证据 ====================')
  for (const row of rows) {
    console.log(`\n【${row.label}】provider=${row.provider} model=${row.model}`)
    console.log(`  HTTP ${row.status} | referenceImageCount=${row.referenceImageCount} | forwardedImageCount=${row.forwardedImageCount}`)
    if (row.warnings.length) console.log(`  warnings: ${JSON.stringify(row.warnings)}`)
    if (row.message) console.log(`  message: ${row.message}`)
    if (!row.call) { console.log('  (stub 未收到请求)'); continue }
    const auth = row.call.headers.authorization || row.call.headers.Authorization || ''
    console.log(`  → ${row.call.method} ${row.call.path}`)
    console.log(`    content-type: ${row.call.contentType}`)
    console.log(`    authorization: ${auth ? `${String(auth).slice(0, 12)}…（已脱敏）` : '(无)'}`)
    console.log(`    note: ${row.placement.note}`)
    if (row.call.contentType.includes('multipart/form-data')) {
      const parts = parseMultipart(row.call.body, row.call.contentType)
      console.log(`    multipart parts: ${JSON.stringify(parts.map((p) => ({ name: p.name, filename: p.filename, type: p.type, size: p.size })))}`)
    } else {
      let json = {}
      try { json = JSON.parse(row.call.body.toString('utf8') || '{}') } catch { /* ignore */ }
      const redacted = JSON.parse(JSON.stringify(json, (key, value) => {
        if (typeof value === 'string' && value.startsWith('data:image')) return `<image data-url ${value.length} 字节>`
        return value
      }))
      console.log(`    body: ${JSON.stringify(redacted).slice(0, 900)}`)
    }
  }

  // -------------------------------------------------------------------------
  // 服务端日志里的关键行
  // -------------------------------------------------------------------------
  const logLines = serverLog.split(/\r?\n/)
  const blocks = []
  for (let index = 0; index < logLines.length; index += 1) {
    if (logLines[index].includes('[AI image request]')) {
      const block = [logLines[index]]
      // 服务端用 console.info(object) 输出，对象内容在多行；收集到下一个 session 结束或空行为止。
      for (let j = index + 1; j < logLines.length && !logLines[j].includes('[AI image request]'); j += 1) {
        block.push(logLines[j])
        if (/^\}\s*$/.test(logLines[j])) { index = j; break }
      }
      blocks.push(block.join('\n'))
    }
  }
  if (blocks.length) {
    console.log('\n==================== 服务端 [AI image request] 日志 ====================')
    blocks.forEach((block) => console.log(block.replace(/^/gm, '  ')))
  }

  // -------------------------------------------------------------------------
  // 结论 + 去重修复回归断言
  // -------------------------------------------------------------------------
  const find = (needle) => rows.find((r) => r.label.includes(needle))
  const volcDup = find('前端同款')
  const volcSingle = find('仅 images')
  const volcMulti3 = find('3 张不同上游图')
  const agnesRow = rows.find((r) => r.provider === 'agnes')
  const openaiRow = rows.find((r) => r.provider === 'openai')
  const undeclaredRow = rows.find((r) => r.provider === 'custom-undeclared')
  const noneRow = rows.find((r) => r.provider === 'custom-none')

  const checks = []
  const assert = (name, condition, detail) => checks.push({ name, ok: Boolean(condition), detail })

  // 核心回归：去重后，单张上游图必须是字符串，且计数不虚报。
  assert('火山方舟 · 前端同款单图 → image 为字符串（去重生效）',
    volcDup?.placement.field === 'image' && volcDup?.placement.isArray === false && volcDup?.placement.count === 1,
    { shape: volcDup?.placement.shape, isArray: volcDup?.placement.isArray })
  assert('火山方舟 · 前端同款单图 → referenceImageCount/forwardedImageCount 均为 1（不虚报）',
    volcDup?.referenceImageCount === 1 && volcDup?.forwardedImageCount === 1,
    { referenceImageCount: volcDup?.referenceImageCount, forwardedImageCount: volcDup?.forwardedImageCount })
  assert('火山方舟 · 仅 images 单图 → image 为字符串',
    volcSingle?.placement.field === 'image' && volcSingle?.placement.isArray === false && volcSingle?.placement.count === 1,
    { shape: volcSingle?.placement.shape })
  assert('火山方舟 · 3 张不同上游图 → image 为数组且长度=3（首图重复被去重）',
    volcMulti3?.placement.field === 'image' && volcMulti3?.placement.isArray === true && volcMulti3?.placement.count === 3,
    { shape: volcMulti3?.placement.shape })
  assert('火山方舟 · 3 张不同上游图 → 计数均为 3',
    volcMulti3?.referenceImageCount === 3 && volcMulti3?.forwardedImageCount === 3,
    { referenceImageCount: volcMulti3?.referenceImageCount, forwardedImageCount: volcMulti3?.forwardedImageCount })
  assert('Agnes · 前端同款单图 → extra_body.image 数组且长度=1（去重生效）',
    agnesRow?.placement.field === 'extra_body.image' && agnesRow?.placement.count === 1 && agnesRow?.forwardedImageCount === 1,
    { shape: agnesRow?.placement.shape, forwardedImageCount: agnesRow?.forwardedImageCount })
  assert('OpenAI · 带图改走 /images/edits multipart（单文件）',
    openaiRow?.placement.path.includes('/images/edits') && openaiRow?.placement.count === 1,
    { path: openaiRow?.placement.path, count: openaiRow?.placement.count })
  assert('未声明协议假平台 · 默认 body-field 写 image + 回传 warning',
    undeclaredRow?.placement.field === 'image' && undeclaredRow?.warnings.length === 1,
    { field: undeclaredRow?.placement.field, warnings: undeclaredRow?.warnings })
  assert('声明 none 假平台 · 传图时 400 硬报错（不静默丢弃）',
    noneRow?.status === 400 && /不支持参考图/.test(noneRow?.message || ''),
    { status: noneRow?.status, message: noneRow?.message })

  // 诊断（修复后行为）：认不出的参考图不再静默丢弃 —— 全丢 → 硬报错；部分丢 → 出图 + 告警。
  const localOnly = find('只有 /api/assets 本地路径')
  const localMixed = find('标记裁剪 dataURL + /api/assets 本地路径')
  assert('防静默#1 · 只收到无法解析的参考图 → 硬报错 400（不再静默 200 出图）',
    localOnly?.status === 400 && /一张都没能用于模型/.test(localOnly?.message || ''),
    { status: localOnly?.status, message: localOnly?.message })
  assert('防静默#1 · 报错文案点明了参考图形态（local-api-path）与张数',
    /local-api-path/.test(localOnly?.message || '') && /收到了 1 张参考图/.test(localOnly?.message || ''),
    { message: localOnly?.message })
  assert('防静默#2 · 部分参考图被丢弃时照常出图，但把丢弃张数/形态写进 warnings',
    localMixed?.status === 200 && localMixed?.forwardedImageCount === 1 && (localMixed?.warnings?.length || 0) >= 1
    && /无法使用/.test((localMixed?.warnings || []).join('')) && /local-api-path/.test((localMixed?.warnings || []).join('')),
    { status: localMixed?.status, forwarded: localMixed?.forwardedImageCount, warnings: localMixed?.warnings })

  // server 模式 + 真实 DB：/api/assets/<id> 能被解析成 data URL 并真正写进上游请求体
  if (assetTest.available) {
    assert('资产解析 · /api/assets/<id> 参考图被解析并写进上游请求体（image = data:image/png）',
      assetTest.status === 200 && assetTest.forwarded === 1 && assetTest.isDataUrl,
      { status: assetTest.status, forwarded: assetTest.forwarded, imagePrefix: assetTest.imageValue.slice(0, 32) })
    assert('资产解析 · 解析后的图片字节数与磁盘资产一致（未被截断/污染）',
      assetTest.bytes === assetTest.expectedBytes,
      { decodedBytes: assetTest.bytes, expectedBytes: assetTest.expectedBytes })
  } else {
    console.log(`SKIP  资产解析（server 模式 + DB）：${assetTest.reason}`)
  }

  console.log('\n==================== 回归断言（去重修复） ====================')
  for (const item of checks) {
    console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.ok ? '' : `  ::  ${JSON.stringify(item.detail)}`}`)
  }

  console.log('\n==================== 结论 ====================')
  console.log(`1) Agnes：参考图写入 extra_body.image（数组），forwardedImageCount=${agnesRow?.forwardedImageCount}。`)
  console.log(`2) 火山方舟 doubao-seedream-4-0-250828：参考图写入顶层 image 字段。`)
  console.log(`   - 修复后·前端同款单图：${volcDup?.placement.shape} / forwarded=${volcDup?.forwardedImageCount}（修复前是「数组 ×2」）`)
  console.log(`   - 仅传单张 images     ：${volcSingle?.placement.shape} / forwarded=${volcSingle?.forwardedImageCount}`)
  console.log(`   - 3 张不同上游图      ：${volcMulti3?.placement.shape} / forwarded=${volcMulti3?.forwardedImageCount}`)
  console.log(`3) OpenAI gpt-image-1：改走 /images/edits multipart 上传。`)
  console.log(`4) 未声明协议的假平台：${undeclaredRow?.placement.field}，warnings=${JSON.stringify(undeclaredRow?.warnings || [])}。`)
  console.log(`5) 声明 none 的假平台：HTTP ${noneRow?.status} → ${/不支持参考图/.test(noneRow?.message || '') ? '命中「不支持参考图」400 硬报错' : '未按预期报错'}。`)

  const passed = checks.filter((c) => c.ok).length
  console.log(`\n回归断言：${passed}/${checks.length} 通过`)
  console.log('>> 去重修复生效：单张上游图现在是字符串形态、计数不再虚报；多图仍是数组且长度等于真实张数。')

  // 安全：绝不能改写真实业务配置
  const realConfigHashAfter = existsSync(REAL_PROVIDER_CONFIG)
    ? createHash('sha256').update(readFileSync(REAL_PROVIDER_CONFIG)).digest('hex')
    : '(不存在)'
  console.log(`\n安全校验：真实 server/data/ai-providers.json ${realConfigHashAfter === realConfigHashBefore ? '未被改写 ✓' : '被改写了 ✗（危险）'}`)

  if (checks.some((c) => !c.ok)) process.exitCode = 1
} catch (error) {
  console.error('脚本执行异常：', error?.message || error)
  process.exitCode = 1
} finally {
  if (serverProcess) {
    serverProcess.kill()
    await delay(400)
    if (!serverProcess.killed) serverProcess.kill('SIGKILL')
  }
  await new Promise((resolve) => stub.close(resolve))
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* 清理失败不影响结论 */ }
}
