// 直连火山方舟（Ark）验证：doubao-seedream-4-0-250828 到底认不认参考图、认哪种 image 形态。
//
// 隔离原则：本脚本**不经过我们的服务端**，直接用真实 key 打 Ark，把「Ark 自身行为」与「我们代码」彻底分开。
//
// 做法：
//   1. 从 server/data/ai-providers.json 读 volcengine 的 key/baseUrl/model。
//   2. 生成一张 64×64 纯 #00FF00 绿的 PNG data URL 作为参考图（语义可断言：主色是绿）。
//   3. 用能强制体现参考图主色的 prompt，分别以两种 image 形态各出 1 张图：
//        (a) image = 字符串（修复后的服务端行为）
//        (b) image = [同一张, 同一张]（修复前的服务端行为）
//   4. 下载返回图到本地，用 Chromium(canvas) 解码，算全图平均 RGB。
//      判定「参考图被采纳」：G > R+40 且 G > B+40（否则视为未被采纳）。
//
// 用法（代理会劫持回环地址，但本次打的是外网；如直连失败会自动回退 curl 并带上系统代理）：
//   env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
//     node scripts/probe-ark-reference-image.mjs
//   可选：--out <目录>   指定返回图保存目录（默认存到系统临时目录）
//
// 成本：2 张 2K 出图。若出网被拦/超时，会**如实打印错误原文**，绝不编造结果。
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT_DIR = process.cwd()
const CONFIG_PATH = path.join(PROJECT_DIR, 'server', 'data', 'ai-providers.json')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const outArgIndex = process.argv.indexOf('--out')
const OUT_DIR = outArgIndex >= 0 && process.argv[outArgIndex + 1]
  ? path.resolve(process.argv[outArgIndex + 1])
  : mkdtempSync(path.join(os.tmpdir(), 'ark-reference-probe-'))

const PROMPT = '以参考图的主色铺满整个画面，输出一张纯色背景图，不要任何其它元素'

// ---------------------------------------------------------------------------
// 64×64 纯色 PNG（自写编码，不依赖图形库）
// ---------------------------------------------------------------------------
function solidPngDataUrl(size, rgb) {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c }
  const crc32 = (buf) => { let c = -1; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
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

function maskKey(value) {
  const str = String(value || '')
  return str ? `${str.slice(0, 6)}…${str.slice(-4)}（长度 ${str.length}）` : '(空)'
}

function detectMime(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return 'application/octet-stream'
}

// ---------------------------------------------------------------------------
// 网络：优先 Node fetch（直连）；失败则回退 curl.exe（会带上系统代理），并把原始错误如实抛出。
// ---------------------------------------------------------------------------
function curlPath() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe')
}
function proxyArg() {
  const proxy = String(process.env.HTTPS_PROXY || process.env.https_proxy || '').trim()
  return proxy ? ['--proxy', proxy] : []
}

async function postJson(url, headers, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await res.text()
    return { status: res.status, text }
  } catch (error) {
    // 回退 curl：把请求体写临时文件，避免命令行过长。
    const tmp = path.join(os.tmpdir(), `ark-probe-${Date.now()}.json`)
    writeFileSync(tmp, JSON.stringify(body), 'utf8')
    try {
      const out = execFileSync(curlPath(), [
        '--silent', '--show-error', '--ipv4', '--connect-timeout', '20', '--max-time', '180',
        ...proxyArg(), '--request', 'POST', url,
        ...Object.entries(headers).flatMap(([k, v]) => ['--header', `${k}: ${v}`]),
        '--data-binary', `@${tmp}`,
        '--write-out', '\n__HTTP_CODE__%{http_code}',
      ], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 })
      const marker = out.lastIndexOf('__HTTP_CODE__')
      const status = Number(out.slice(marker + '__HTTP_CODE__'.length).trim()) || 0
      return { status, text: out.slice(0, marker) }
    } catch (curlError) {
      throw new Error(`fetch 失败（${error?.cause?.code || error?.message || error}），curl 回退也失败：${curlError?.stdout || curlError?.message || curlError}`)
    }
  }
}

async function download(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } catch (error) {
    const tmp = path.join(os.tmpdir(), `ark-probe-dl-${Date.now()}.bin`)
    try {
      execFileSync(curlPath(), ['--silent', '--show-error', '--ipv4', '--location', '--connect-timeout', '20', '--max-time', '180', ...proxyArg(), '--output', tmp, url], { encoding: 'utf8' })
      return readFileSync(tmp)
    } catch (curlError) {
      throw new Error(`下载返回图失败：fetch（${error?.cause?.code || error?.message || error}）；curl（${curlError?.message || curlError}）`)
    }
  }
}

// ---------------------------------------------------------------------------
// 浏览器：用 Chromium + canvas 解码任意格式图片，算全图平均 RGB。
// ---------------------------------------------------------------------------
function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE_PATH,
    'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core',
    'playwright-core',
    'playwright',
  ].filter(Boolean)
  const require = createRequire(import.meta.url)
  const errors = []
  for (const candidate of candidates) {
    try { return require(candidate) } catch (error) { errors.push(`${candidate}: ${error.message}`) }
  }
  throw new Error(`找不到 playwright-core / playwright。已尝试：\n  ${errors.join('\n  ')}`)
}

function findChromiumExecutable(pw) {
  if (process.env.PROBE_CHROME_PATH && existsSync(process.env.PROBE_CHROME_PATH)) return process.env.PROBE_CHROME_PATH
  const root = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright')
  if (existsSync(root)) {
    const dirs = readdirSync(root).filter((name) => name.startsWith('chromium-')).sort((a, b) => {
      const va = Number(a.split('-')[1]) || 0; const vb = Number(b.split('-')[1]) || 0; return vb - va
    })
    for (const dir of dirs) {
      const exe = path.join(root, dir, 'chrome-win64', 'chrome.exe')
      if (existsSync(exe)) return exe
    }
  }
  try { return pw.chromium.executablePath() } catch { return '' }
}

async function averageRgb(pw, browser, buffer) {
  const mime = detectMime(buffer)
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
  const page = await browser.newPage()
  try {
    return await page.evaluate(async (source) => {
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = () => reject(new Error('image decode failed'))
        image.src = source
      })
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let r = 0; let g = 0; let b = 0
      for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2] }
      const n = pixels.length / 4
      return { width: canvas.width, height: canvas.height, r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
    }, dataUrl)
  } finally {
    await page.close()
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const results = []
let exitCode = 0

mkdirSync(OUT_DIR, { recursive: true })

let config
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
} catch (error) {
  console.error(`无法读取 ${CONFIG_PATH}：${error.message}`)
  process.exit(1)
}
const volc = config.providers?.volcengine || {}
const baseUrl = String(volc.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '')
const apiKey = String(volc.apiKey || '')
const model = String(volc.imageModel || 'doubao-seedream-4-0-250828')

console.log('==================== 火山方舟参考图形态实测 ====================')
console.log(`baseUrl : ${baseUrl}`)
console.log(`model   : ${model}`)
console.log(`apiKey  : ${maskKey(apiKey)}`)
console.log(`输出目录: ${OUT_DIR}`)
console.log(`探针参考图: 64×64 纯 #00FF00 绿`)
console.log('')

if (!apiKey) {
  console.error('volcengine.apiKey 为空，无法实测。')
  process.exit(1)
}

const green = solidPngDataUrl(64, [0, 255, 0])
const variants = [
  { key: 'a', label: '(a) image = 字符串（修复后行为）', image: green },
  { key: 'b', label: '(b) image = 2 元素数组 [同图, 同图]（修复前行为）', image: [green, green] },
]

let pw = null
let browser = null
try {
  pw = loadPlaywright()
  const exe = findChromiumExecutable(pw)
  if (!exe) throw new Error('找不到 Chromium 可执行文件，请设置 PROBE_CHROME_PATH')
  browser = await pw.chromium.launch({ headless: true, executablePath: exe })
  console.log(`Chromium: ${exe}\n`)
} catch (error) {
  console.error(`无法启动解码用 Chromium：${error.message}`)
  if (browser) await browser.close()
  process.exit(1)
}

for (const variant of variants) {
  const body = {
    model,
    prompt: PROMPT,
    size: '2K',
    sequential_image_generation: 'disabled',
    response_format: 'url',
    stream: false,
    watermark: true,
    image: variant.image,
  }
  console.log(`---- ${variant.label} ----`)
  console.log(`  请求 image 形态: ${Array.isArray(variant.image) ? `数组 ×${variant.image.length}` : '字符串'}`)
  let entry = { ...variant, status: 0, error: '', avg: null, file: '', size: '', rawError: '' }
  try {
    const response = await postJson(`${baseUrl}/images/generations`, {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }, body)
    entry.status = response.status
    let json = null
    try { json = JSON.parse(response.text) } catch { /* 非 JSON */ }
    if (response.status !== 200) {
      entry.error = '上游返回非 200'
      entry.rawError = response.text.slice(0, 800)
      console.log(`  HTTP ${response.status}  原始响应: ${entry.rawError}`)
    } else {
      const url = json?.data?.[0]?.url || ''
      entry.size = json?.data?.[0]?.size || ''
      if (!url) {
        entry.error = '响应里没有 data[0].url'
        entry.rawError = response.text.slice(0, 800)
        console.log(`  响应缺少图片 URL: ${entry.rawError}`)
      } else {
        const buffer = await download(url)
        const file = path.join(OUT_DIR, `ark-${variant.key}-${STAMP}${detectMime(buffer) === 'image/jpeg' ? '.jpg' : detectMime(buffer) === 'image/png' ? '.png' : '.bin'}`)
        writeFileSync(file, buffer)
        entry.file = file
        entry.mime = detectMime(buffer)
        entry.bytes = buffer.length
        entry.avg = await averageRgb(pw, browser, buffer)
        const { r, g, b } = entry.avg
        const greenDominance = g - Math.max(r, b)
        entry.greenDominance = greenDominance
        entry.adopted = g > r + 40 && g > b + 40
        console.log(`  HTTP 200  返回图 ${entry.avg.width}×${entry.avg.height}（${entry.mime}, ${Math.round(buffer.length / 1024)}KB）`)
        console.log(`  平均 RGB = (${r}, ${g}, ${b})  绿通道优势 G-max(R,B) = ${greenDominance}`)
        console.log(`  判定: ${entry.adopted ? '参考图被采纳（主色为绿）' : '未见绿色主导 → 参考图可能未被采纳'}`)
        console.log(`  已保存: ${file}`)
      }
    }
  } catch (error) {
    entry.error = '请求异常'
    entry.rawError = error?.message || String(error)
    console.log(`  请求异常（原始错误原文，未编造结果）：${entry.rawError}`)
  }
  results.push(entry)
  console.log('')
}

// ---------------------------------------------------------------------------
// 结论
// ---------------------------------------------------------------------------
console.log('==================== 结论 ====================')
const pad = (text, width) => {
  const str = String(text ?? '')
  let w = 0
  for (const ch of str) w += /[\u4e00-\u9fa5（）]/.test(ch) ? 2 : 1
  return str + ' '.repeat(Math.max(0, width - w))
}
console.log([pad('形态', 44), pad('HTTP', 6), pad('平均 RGB', 18), pad('G-max(R,B)', 12), pad('是否采纳参考图', 16)].join(' | '))
console.log('-'.repeat(110))
for (const entry of results) {
  const rgb = entry.avg ? `(${entry.avg.r}, ${entry.avg.g}, ${entry.avg.b})` : '(无)'
  const verdict = entry.avg ? (entry.adopted ? '是' : '否') : `失败：${entry.error}`
  console.log([pad(entry.label, 44), pad(entry.status || '-', 6), pad(rgb, 18), pad(entry.greenDominance ?? '-', 12), pad(verdict, 16)].join(' | '))
}
console.log('')

const a = results.find((r) => r.key === 'a')
const b = results.find((r) => r.key === 'b')
if (a?.adopted && b?.adopted) {
  console.log('>> 两种形态【都会被采纳】：说明平台对 image 的 string / 重复数组 都能吃，形态差异不是根因。')
} else if (a?.adopted && b && !b.adopted) {
  console.log('>> 字符串形态被采纳、重复数组形态【未被采纳】：说明平台对「重复图数组」的解析有问题 —— 去重修复是必要的。')
} else if (a && !a.adopted && b?.adopted) {
  console.log('>> 字符串形态未被采纳、重复数组被采纳：与预期相反，需进一步核查。')
} else if (a?.adopted === false && b?.adopted === false) {
  console.log('>> 两种形态都【未被采纳】：问题不在形态，而在「Ark 是否真的按参考图主色出图」或我们的判定/探针设计。')
} else {
  console.log('>> 至少一种形态请求失败，见上表与错误原文；不要据此下结论。')
  exitCode = 1
}

if (browser) await browser.close()
if (results.some((r) => r.error && r.status === 0)) exitCode = 1
console.log(`\n返回图已保存到：${OUT_DIR}`)
process.exit(exitCode)
