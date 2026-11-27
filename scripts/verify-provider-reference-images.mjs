// 「上游参考图能否真正送进模型」验收脚本（覆盖所有供应商 + 后台新建平台场景）
//
// 用法：
//   node scripts/verify-provider-reference-images.mjs          # 默认：本地假平台，零费用、零外网
//   node scripts/verify-provider-reference-images.mjs --live    # 额外用真实 Key 对已配置平台做一次真实出图
//
// 为什么要有这个脚本：
//   历史上火山方舟 / OpenAI 的参考图是「静默丢弃」的 —— 界面显示上游缩略图，请求里却没有 image 字段，
//   用户只能靠肉眼对比出图才发现。本脚本直接抓服务端发出的上游请求体，把「有没有真的带上参考图」
//   变成机器可断言的事实，新增任何模型商后跑一次即可确认。
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createAssetRefFixture, DEFAULT_DB_URL } from './lib/asset-ref-fixture.mjs'

const projectDir = process.cwd()
const STUB_PORT = 3231
const SERVER_PORT = 3232
// server 模式（需真实 DB）验证 `/api/assets/<id>` 解析，单开端口避免和 demo 实例抢。
const ASSET_SERVER_PORT = 3233
const tempDir = path.join(os.tmpdir(), `refimg-verify-${Date.now()}`)
const REAL_PROVIDER_CONFIG = path.join(projectDir, 'server', 'data', 'ai-providers.json')
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const TINY_B64 = TINY_PNG.split(',')[1]

// 生成内容互不相同的纯色 PNG data URL，用于「多图」用例 —— 必须真的不同，
// 否则去重后会被正确合并成一张，测不出「多图传成数组」的行为。
function solidPngDataUrl(rgb) {
  const size = 8
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
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}
const IMG_RED = solidPngDataUrl([255, 0, 0])
const IMG_GREEN = solidPngDataUrl([0, 255, 0])
const LIVE = process.argv.includes('--live')

const results = []
const failures = []
function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition), detail })
  if (!condition) failures.push(`${name} -> ${JSON.stringify(detail)}`)
  console.error(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ::  ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fileHash(filePath) {
  return existsSync(filePath) ? createHash('sha256').update(readFileSync(filePath)).digest('hex') : '(不存在)'
}

// 用 node:http 直接请求回环地址，绕开系统 HTTP(S)_PROXY 对 localhost 的劫持。
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
        try { json = JSON.parse(text) } catch { /* 非 JSON 响应保留原文 */ }
        resolve({ status: res.statusCode, text, json })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

// ---------------- 假模型平台：记录服务端真实发出的每一个请求 ----------------
const captured = []
const stub = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const raw = Buffer.concat(chunks)
    captured.push({ method: req.method, url: req.url || '', contentType: req.headers['content-type'] || '', body: raw })
    const send = (code, payload) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    if ((req.url || '').includes('/images/edits')) return send(200, { data: [{ b64_json: TINY_B64 }] })
    if ((req.url || '').includes('/images/generations')) return send(200, { data: [{ url: TINY_PNG }] })
    if ((req.url || '').includes('/models')) return send(200, { data: [{ id: 'stub-image-model' }] })
    return send(200, { data: [] })
  })
})

function lastCall(urlPart, method = 'POST') {
  for (let index = captured.length - 1; index >= 0; index -= 1) {
    const item = captured[index]
    if (item.method === method && item.url.includes(urlPart)) return item
  }
  return null
}
function jsonOf(item) {
  if (!item) return {}
  try { return JSON.parse(item.body.toString('utf8') || '{}') } catch { return {} }
}
function textOf(item) {
  return item ? item.body.toString('utf8') : ''
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

let serverProcess = null
const realConfigHashBefore = fileHash(REAL_PROVIDER_CONFIG)

try {
  mkdirSync(tempDir, { recursive: true })
  // 预先写入一份空配置：避免 readProviderConfig 在“临时目录无配置”时回退去读真实业务配置，
  // 从而保证本脚本绝不会用真实 Key 发起付费调用、也不会读写真实业务数据。
  writeFileSync(path.join(tempDir, 'ai-providers.json'), JSON.stringify({ providers: {} }, null, 2), 'utf8')

  await new Promise((resolve) => stub.listen(STUB_PORT, '127.0.0.1', resolve))

  const stubBase = `http://127.0.0.1:${STUB_PORT}/v1`
  // demo 实例与 server 模式实例共用同一份环境（供应商全部指向 stub，绝不碰真实平台）。
  const baseEnv = {
    ...process.env,
    AI_DATA_DIR: tempDir,
    AGNES_BASE_URL: stubBase,
    VOLCENGINE_BASE_URL: stubBase,
    OPENAI_BASE_URL: stubBase,
    AGNES_API_KEY: 'stub-key',
    VOLCENGINE_API_KEY: 'stub-key',
    OPENAI_API_KEY: 'stub-key',
    AGNES_IMAGE_MODEL: 'stub-image-model',
    VOLCENGINE_IMAGE_MODEL: 'stub-image-model',
    OPENAI_IMAGE_MODEL: 'stub-image-model',
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    http_proxy: '',
    https_proxy: '',
    ALL_PROXY: '',
    all_proxy: '',
  }
  serverProcess = spawn(process.execPath, [path.join(projectDir, 'server', 'index.js')], {
    cwd: projectDir,
    env: { ...baseEnv, PORT: String(SERVER_PORT), AUTH_MODE: 'demo' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  serverProcess.stdout.on('data', (chunk) => { serverLog += chunk.toString('utf8') })
  serverProcess.stderr.on('data', (chunk) => { serverLog += chunk.toString('utf8') })

  const ready = await waitForServer(SERVER_PORT)
  if (!ready) throw new Error(`服务端未能在 30 秒内启动：\n${serverLog.slice(-1500)}`)

  const generate = (payload) => request(SERVER_PORT, 'POST', '/api/ai/image/generate', {
    prompt: '参考图转发验收：请以参考图主色为基础生成同色系色块图。',
    ratio: '1:1',
    quality: 'standard',
    count: 1,
    ...payload,
  })

  // ---- 1. 火山方舟：参考图必须出现在请求体顶层 image 字段 ----
  captured.length = 0
  const volcSingle = await generate({ provider: 'volcengine', images: [TINY_PNG] })
  const volcPayload = jsonOf(lastCall('/images/generations'))
  check('火山方舟 · 单图写进请求体顶层 image', typeof volcPayload.image === 'string' && volcPayload.image.startsWith('data:image/png'),
    { image: String(volcPayload.image || '').slice(0, 40), keys: Object.keys(volcPayload) })
  check('火山方舟 · 响应回报转发张数', volcSingle.json?.forwardedImageCount === 1 && volcSingle.json?.referenceImageCount === 1,
    volcSingle.json)

  // ---- 1b. 前端真实形态：images:[首图] + referenceImage:首图（同一张）必须去重成单图字符串 ----
  captured.length = 0
  const volcDedup = await generate({ provider: 'volcengine', images: [TINY_PNG], referenceImage: TINY_PNG })
  const volcDedupPayload = jsonOf(lastCall('/images/generations'))
  check('火山方舟 · images+referenceImage 同图去重成单图字符串（不虚报为 2）',
    typeof volcDedupPayload.image === 'string' && volcDedup.json?.referenceImageCount === 1 && volcDedup.json?.forwardedImageCount === 1,
    { imageType: typeof volcDedupPayload.image, referenceImageCount: volcDedup.json?.referenceImageCount, forwardedImageCount: volcDedup.json?.forwardedImageCount })

  // ---- 2. 火山方舟：多张【互不相同】的输入图必须传成数组（同图重复会被去重成单图字符串） ----
  captured.length = 0
  await generate({ provider: 'volcengine', images: [IMG_RED, IMG_GREEN], referenceImage: IMG_RED })
  const volcMultiPayload = jsonOf(lastCall('/images/generations'))
  check('火山方舟 · 多图传成数组且长度=2（首图重复被去重）',
    Array.isArray(volcMultiPayload.image) && volcMultiPayload.image.length === 2
    && volcMultiPayload.image[0] !== volcMultiPayload.image[1],
    { imageType: Array.isArray(volcMultiPayload.image) ? 'array' : typeof volcMultiPayload.image, length: volcMultiPayload.image?.length })

  // ---- 3. Agnes：参考图必须写进 extra_body.image ----
  captured.length = 0
  const agnesResponse = await generate({ provider: 'agnes', images: [TINY_PNG] })
  const agnesPayload = jsonOf(lastCall('/images/generations'))
  check('Agnes · 参考图写进 extra_body.image',
    Array.isArray(agnesPayload.extra_body?.image) && agnesPayload.extra_body.image.length === 1,
    { extraBody: agnesPayload.extra_body ? Object.keys(agnesPayload.extra_body) : null })
  check('Agnes · 响应回报转发张数', agnesResponse.json?.forwardedImageCount === 1, agnesResponse.json)

  // ---- 4. OpenAI：必须改走 /images/edits 且是 multipart ----
  captured.length = 0
  const openaiResponse = await generate({ provider: 'openai', images: [TINY_PNG] })
  const editsCall = lastCall('/images/edits')
  check('OpenAI · 带参考图时改走 /images/edits（multipart）',
    Boolean(editsCall) && editsCall.contentType.includes('multipart/form-data'),
    { url: editsCall?.url || null, contentType: editsCall?.contentType || null })
  check('OpenAI · multipart 中确实带上了图片文件',
    /name="image"/.test(textOf(editsCall)) && /filename="reference-1\./.test(textOf(editsCall)),
    { hasImageField: /name="image"/.test(textOf(editsCall)) })
  check('OpenAI · 响应回报转发张数', openaiResponse.json?.forwardedImageCount === 1, openaiResponse.json)

  // ---- 5. 无参考图时不得凭空写入 image 字段（防止把空图误发给平台） ----
  captured.length = 0
  await generate({ provider: 'volcengine' })
  const volcNoImage = jsonOf(lastCall('/images/generations'))
  check('无上游图时不写入 image 字段', volcNoImage.image === undefined, { keys: Object.keys(volcNoImage) })

  // ---- 6. 后台新建平台（未声明参考图协议）：仍要转发，并回传提示 ----
  const customCreate = await request(SERVER_PORT, 'POST', '/api/admin/ai-providers', {
    key: 'stub-custom',
    label: '假平台-未声明',
    category: 'custom',
    baseUrl: `${stubBase}`,
    imageModel: 'stub-image-model',
    imageModels: ['stub-image-model'],
    models: ['stub-image-model'],
    defaultModel: 'stub-image-model',
    apiKey: 'stub-key',
  })
  captured.length = 0
  const customResponse = await generate({ provider: 'stub-custom', images: [TINY_PNG] })
  const customPayload = jsonOf(lastCall('/images/generations'))
  check('后台新建平台 · 未声明协议时按 OpenAI 兼容转发参考图',
    customCreate.json?.ok === true && typeof customPayload.image === 'string',
    { create: customCreate.status, image: String(customPayload.image || '').slice(0, 30) })
  check('后台新建平台 · 回传「未声明协议」提示',
    Array.isArray(customResponse.json?.warnings) && customResponse.json.warnings.length === 1,
    customResponse.json?.warnings)

  // ---- 7. 后台声明「不支持参考图」：必须明确报错，不许静默丢弃 ----
  const noneCreate = await request(SERVER_PORT, 'POST', '/api/admin/ai-providers', {
    key: 'stub-none',
    label: '假平台-不支持参考图',
    category: 'custom',
    baseUrl: `${stubBase}`,
    imageModel: 'stub-image-model',
    imageModels: ['stub-image-model'],
    models: ['stub-image-model'],
    defaultModel: 'stub-image-model',
    apiKey: 'stub-key',
    imageInput: { mode: 'none' },
  })
  const noneResponse = await generate({ provider: 'stub-none', images: [TINY_PNG] })
  check('声明不支持参考图 · 传图时明确报错（不静默丢弃）',
    noneCreate.json?.ok === true && noneResponse.status === 400 && /不支持参考图/.test(noneResponse.json?.message || ''),
    { status: noneResponse.status, message: noneResponse.json?.message })
  const noneNoImage = await generate({ provider: 'stub-none' })
  check('声明不支持参考图 · 不传图时仍可正常出图', noneNoImage.status === 200, { status: noneNoImage.status })

  // ---- 8. 防静默守卫：确实收到图却一张都没转发 -> 直接报错 ----
  // 用一张「通过了可读性检查、但无法解析成可上传文件」的图片，模拟转发环节失败。
  const editsCreate = await request(SERVER_PORT, 'POST', '/api/admin/ai-providers', {
    key: 'stub-edits',
    label: '假平台-edits 但图不可解析',
    category: 'custom',
    baseUrl: `${stubBase}`,
    imageModel: 'stub-image-model',
    imageModels: ['stub-image-model'],
    models: ['stub-image-model'],
    defaultModel: 'stub-image-model',
    apiKey: 'stub-key',
    imageInput: { mode: 'edits', maxImages: 1 },
  })
  const guardResponse = await generate({ provider: 'stub-edits', images: ['data:image/png;base64,'] })
  check('防静默守卫 · 参考图无法转发时直接报错（不静默出图）',
    editsCreate.json?.ok === true && guardResponse.status === 502 && /一张都没能转发/.test(guardResponse.json?.message || ''),
    { status: guardResponse.status, message: guardResponse.json?.message })

  // ---- 8b. 「收到图但可用 0 张」必须是硬报错，不许静默 200 ----
  // 用一个既非 http(s) URL、也非 data:image、也解析不出本地资产的值：全部不可用 ->
  // 应当在“进入供应商之前”就以 400 硬报错，而不是安安静静地用“没有参考图”的请求出图。
  captured.length = 0
  const allDropped = await generate({ provider: 'volcengine', images: ['/api/assets/ast_doesnotexist'] })
  check('收到图但可用 0 张 · 硬报错 400（而非静默 200）',
    allDropped.status === 400
    && /一张都没能用于模型/.test(allDropped.json?.message || '')
    && /收到了 1 张参考图/.test(allDropped.json?.message || '')
    && /local-api-path/.test(allDropped.json?.message || ''),
    { status: allDropped.status, message: allDropped.json?.message })
  check('收到图但可用 0 张 · 未向上游发出任何请求（真正拦截在转发前）',
    lastCall('/images/generations') === null,
    { upstreamCalls: captured.length })

  // ---- 8c. 部分图不可用：照常出图，但必须给出可见告警（同样不静默） ----
  captured.length = 0
  const partialDrop = await generate({ provider: 'volcengine', images: [TINY_PNG, '/api/assets/ast_doesnotexist'] })
  check('部分图不可用 · 照常出图但返回「已忽略」告警（不静默）',
    partialDrop.status === 200
    && partialDrop.json?.forwardedImageCount === 1
    && (partialDrop.json?.warnings || []).some((item) => /无法使用/.test(item) && /local-api-path/.test(item)),
    { status: partialDrop.status, warnings: partialDrop.json?.warnings })

  // ---- 8d. `/api/assets/<id>` 形态的参考图能被解析并真正写进上游请求体 ----
  // 必须走 AUTH_MODE=server + 真实 DB：getAccessibleAsset 要查 user_assets 且校验组织归属，
  // demo 模式没有登录态，无法覆盖这条路径。用自造资产（临时 stub 数据目录），不依赖真实 data 目录。
  const assetFixture = await createAssetRefFixture({
    dbUrl: process.env.REFIMG_DB_URL || DEFAULT_DB_URL,
    dataDir: tempDir,
    log: (message) => console.error(message),
  })
  if (!assetFixture.available) {
    console.error(`SKIP  /api/assets 解析：${assetFixture.reason}（未连本地 Postgres 时属预期）`)
  } else {
    let assetServer = null
    try {
      assetServer = spawn(process.execPath, [path.join(projectDir, 'server', 'index.js')], {
        cwd: projectDir,
        env: { ...baseEnv, PORT: String(ASSET_SERVER_PORT), AUTH_MODE: 'server', DATABASE_URL: process.env.REFIMG_DB_URL || DEFAULT_DB_URL },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let assetLog = ''
      assetServer.stdout.on('data', (chunk) => { assetLog += chunk.toString('utf8') })
      assetServer.stderr.on('data', (chunk) => { assetLog += chunk.toString('utf8') })

      const assetReady = await waitForServer(ASSET_SERVER_PORT, 30000, () => true)
      if (!assetReady) throw new Error(`server 模式实例未能在 30 秒内启动：\n${assetLog.slice(-1500)}`)

      captured.length = 0
      const assetResponse = await request(ASSET_SERVER_PORT, 'POST', '/api/ai/image/generate', {
        provider: 'volcengine',
        model: 'doubao-seedream-4-0-250828',
        prompt: '参考图转发验收：把 /api/assets/<id> 解析成 data URL 后送进上游。',
        ratio: '1:1',
        count: 1,
        images: [`/api/assets/${assetFixture.assetId}`],
      }, { Cookie: assetFixture.cookie })
      const assetPayload = jsonOf(lastCall('/images/generations'))
      const sentImage = assetPayload.image
      const decoded = typeof sentImage === 'string' && sentImage.startsWith('data:image/png;base64,')
        ? Buffer.from(sentImage.slice('data:image/png;base64,'.length), 'base64')
        : null
      check('/api/assets 参考图 · 服务端解析为 data URL 并写进上游 image 字段',
        assetResponse.status === 200
        && assetResponse.json?.forwardedImageCount === 1
        && typeof sentImage === 'string' && sentImage.startsWith('data:image/png;base64,'),
        { status: assetResponse.status, forwardedImageCount: assetResponse.json?.forwardedImageCount, imageHead: String(sentImage || '').slice(0, 40) })
      check('/api/assets 参考图 · 上游收到的字节与磁盘文件完全一致',
        Boolean(decoded) && decoded.length === assetFixture.expectedBytes && decoded.equals(readFileSync(assetFixture.assetPath)),
        { forwardedBytes: decoded ? decoded.length : null, expectedBytes: assetFixture.expectedBytes })

      // 未登录态：server 模式所有 /api/* 一律 401，资产内容不得被解析出来。
      const noAuth = await request(ASSET_SERVER_PORT, 'POST', '/api/ai/image/generate', {
        provider: 'volcengine', prompt: '无登录态', images: [`/api/assets/${assetFixture.assetId}`],
      })
      check('/api/assets 参考图 · 未登录态返回 401（不泄露资产）', noAuth.status === 401, { status: noAuth.status })
    } finally {
      if (assetServer) {
        assetServer.kill()
        await delay(300)
        if (!assetServer.killed) assetServer.kill('SIGKILL')
      }
      await assetFixture.cleanup()
    }
  }

  // ---- 9. 安全：绝不能改写真实业务配置 ----
  check('安全 · 真实 server/data 下的 API 配置未被改写',
    fileHash(REAL_PROVIDER_CONFIG) === realConfigHashBefore,
    { before: realConfigHashBefore.slice(0, 12), after: fileHash(REAL_PROVIDER_CONFIG).slice(0, 12) })

  // ---- 10. 可选：真实平台连通性（--live，会产生少量出图费用） ----
  if (LIVE) {
    const config = await request(SERVER_PORT, 'GET', '/api/admin/ai-providers')
    const providers = Object.entries(config.json?.providers || {})
      .filter(([key, item]) => key !== 'hunyuan3d' && item.configured && item.imageModels?.length)
    for (const [key, item] of providers) {
      const response = await request(SERVER_PORT, 'POST', '/api/admin/ai-providers/test', { provider: key, checkReferenceImage: true })
      const check11 = response.json?.referenceImageCheck
      check(`真实平台自检 · ${item.label || key}（${check11?.model || item.imageModel}）`,
        check11?.ok === true, check11 || response.json)
    }
    if (!providers.length) console.error('SKIP  真实平台自检：当前没有「已配置 Key 且有图像模型」的平台')
  }
} catch (error) {
  check('脚本执行未抛异常', false, { message: error?.message })
} finally {
  if (serverProcess) {
    serverProcess.kill()
    await delay(400)
    if (!serverProcess.killed) serverProcess.kill('SIGKILL')
  }
  await new Promise((resolve) => stub.close(resolve))
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* 临时目录清理失败不影响结论 */ }
}

const passed = results.filter((item) => item.pass).length
console.error(`\n参考图转发验收：${passed}/${results.length} 通过`)
if (failures.length) {
  console.error('失败项：')
  failures.forEach((item) => console.error(`  - ${item}`))
  process.exit(1)
}
console.error('全部通过：上游参考图会真正送进模型；未声明协议的平台会被明确提示，不再静默丢弃。')
