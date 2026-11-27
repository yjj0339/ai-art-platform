// 用「用户真实画布」的图，实测火山方舟 doubao-seedream-4-0-250828 在 4 种 image 形态下
// 到底哪一种才真的「按上游图 + 标记元素来出图」。
//
// 背景：用户画布 doc_5M9ekxS5TB22tbGwQ7-mr3gs（「电商广告视频」）里，
//   上游图 = 一张电商海报（本地资产 /api/assets/ast__orxNwT0WowEYZAUWglb9J1C）
//   标记元素 = elements[0].thumb（小男孩头部/脸部区域裁剪图）
//   目标节点 = image-1791798676966-exgixu（doubao-seedream-4-0-250828）
// 现象：火山方舟出图成功，但用户觉得「没读到上游 + 标记没效果」。
//
// 本脚本不经过我们的服务端，直接用真实 key 打 Ark，隔离「平台行为」与「我们的代码」。
//
// 4 种形态（各 1 张）：
//   A: image = 上游图（字符串）
//   B: image = 标记裁剪图（字符串）
//   C: image = [标记裁剪图, 上游图]（数组，用户当前实际形态）
//   D: image = [上游图, 标记裁剪图]（数组，顺序反转）
//
// 用法：
//   node scripts/probe-ark-marked-element.mjs            # 默认读 DB，输出到 docs/ark-marked-probe
//   node scripts/probe-ark-marked-element.mjs --node <id> --out <dir>
//
// 成本：4 张 2K 出图。出网失败会如实打印错误原文。
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT_DIR = process.cwd()
// 本机数据库连接串：PROBE_DATABASE_URL → DATABASE_URL → server/.env。
// 以前直接写在这里，带着数据库口令，不能进仓库。
const DB_URL = process.env.PROBE_DATABASE_URL || process.env.DATABASE_URL || (() => {
  try {
    return readFileSync(path.join(PROJECT_DIR, 'server', '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim() || ''
  } catch {
    return ''
  }
})()
const DOC_ID = process.env.PROBE_DOC_ID || 'doc_5M9ekxS5TB22tbGwQ7-mr3gs'
const argOf = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : '' }
const TARGET_NODE_ID = argOf('--node') || 'image-1791798676966-exgixu'
const OUT_DIR = path.resolve(argOf('--out') || path.join(PROJECT_DIR, 'docs', 'ark-marked-probe'))
const CONFIG_PATH = path.join(PROJECT_DIR, 'server', 'data', 'ai-providers.json')

mkdirSync(OUT_DIR, { recursive: true })

const detectMime = (buf) => {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return 'application/octet-stream'
}
const toDataUrl = (buf) => `data:${detectMime(buf)};base64,${buf.toString('base64')}`

// ---------------------------------------------------------------------------
// 网络（fetch 优先，失败回退 curl 并带系统代理）
// ---------------------------------------------------------------------------
const curlPath = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe')
const proxyArg = () => {
  const proxy = String(process.env.HTTPS_PROXY || process.env.https_proxy || '').trim()
  return proxy ? ['--proxy', proxy] : []
}
async function postJson(url, headers, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    return { status: res.status, text: await res.text() }
  } catch (error) {
    const tmp = path.join(os.tmpdir(), `ark-marked-${Date.now()}.json`)
    writeFileSync(tmp, JSON.stringify(body), 'utf8')
    try {
      const out = execFileSync(curlPath(), [
        '--silent', '--show-error', '--ipv4', '--connect-timeout', '20', '--max-time', '180',
        ...proxyArg(), '--request', 'POST', url,
        ...Object.entries(headers).flatMap(([k, v]) => ['--header', `${k}: ${v}`]),
        '--data-binary', `@${tmp}`, '--write-out', '\n__HTTP_CODE__%{http_code}',
      ], { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 })
      const marker = out.lastIndexOf('__HTTP_CODE__')
      return { status: Number(out.slice(marker + '__HTTP_CODE__'.length).trim()) || 0, text: out.slice(0, marker) }
    } catch (curlError) {
      throw new Error(`fetch 失败（${error?.cause?.code || error?.message || error}），curl 回退也失败：${curlError?.stdout || curlError?.message || curlError}`)
    }
  }
}
async function downloadBuffer(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } catch (error) {
    const tmp = path.join(os.tmpdir(), `ark-marked-dl-${Date.now()}.bin`)
    try {
      execFileSync(curlPath(), ['--silent', '--show-error', '--ipv4', '--location', '--connect-timeout', '20', '--max-time', '180', ...proxyArg(), '--output', tmp, url], { encoding: 'utf8' })
      return readFileSync(tmp)
    } catch (curlError) {
      throw new Error(`下载失败：fetch（${error?.cause?.code || error?.message || error}）；curl（${curlError?.message || curlError}）`)
    }
  }
}

// ---------------------------------------------------------------------------
// 从 DB 提取「上游图」与「标记裁剪图」
// ---------------------------------------------------------------------------
async function loadAssetsFromDoc() {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()
  try {
    const doc = await client.query('SELECT title, data FROM user_documents WHERE id = $1', [DOC_ID])
    if (!doc.rows.length) throw new Error(`找不到文档 ${DOC_ID}`)
    const raw = doc.rows[0].data
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    const byId = Object.fromEntries((data.nodes || []).map((n) => [n.id, n]))
    const target = byId[TARGET_NODE_ID]
    if (!target) throw new Error(`文档里找不到节点 ${TARGET_NODE_ID}（现有节点：${Object.keys(byId).join(', ')}）`)

    // 标记裁剪图
    const element = (target.data?.elements || [])[0]
    if (!element?.thumb) throw new Error(`节点 ${TARGET_NODE_ID} 没有 elements[0].thumb`)
    const cropBuffer = Buffer.from(String(element.thumb).replace(/^data:[^;]+;base64,/, ''), 'base64')

    // 上游图：沿 edges 找指向该节点的 source
    const edges = data.edges || []
    const upstreamId = edges.find((e) => e.target === TARGET_NODE_ID)?.source
    const upstreamOutput = byId[upstreamId]?.data?.output || {}
    const upstreamUrl = upstreamOutput.url || upstreamOutput.imageData || ''
    if (!upstreamUrl) throw new Error(`节点 ${TARGET_NODE_ID} 找不到上游图（upstreamId=${upstreamId}）`)

    let upstreamBuffer
    let upstreamSource
    if (upstreamUrl.startsWith('/api/assets/')) {
      const assetId = upstreamUrl.replace('/api/assets/', '')
      const asset = await client.query('SELECT storage_key, mime_type FROM user_assets WHERE id = $1', [assetId])
      if (!asset.rows.length) throw new Error(`user_assets 找不到资产 ${assetId}`)
      const file = path.join(PROJECT_DIR, 'server', 'data', 'protected-assets', asset.rows[0].storage_key)
      if (!existsSync(file)) throw new Error(`资产文件不存在：${file}`)
      upstreamBuffer = readFileSync(file)
      upstreamSource = `本地资产 ${upstreamUrl} → ${asset.rows[0].storage_key}`
    } else if (upstreamUrl.startsWith('data:')) {
      upstreamBuffer = Buffer.from(upstreamUrl.replace(/^data:[^;]+;base64,/, ''), 'base64')
      upstreamSource = '节点内联 data URL'
    } else if (/^https?:/i.test(upstreamUrl)) {
      upstreamBuffer = await downloadBuffer(upstreamUrl)
      upstreamSource = `远程 URL ${upstreamUrl.slice(0, 80)}…`
    } else {
      throw new Error(`不认识的上游图地址形态：${String(upstreamUrl).slice(0, 80)}`)
    }

    // 复刻前端 effectiveGeneratorPrompt 的 promptPartsToText：element 片替换成它的内容文字。
    const promptPartsToText = (() => {
      const parts = Array.isArray(target.data?.promptParts) ? target.data.promptParts : []
      if (!parts.length) return ''
      const elements = Array.isArray(target.data?.elements) ? target.data.elements : []
      const map = new Map(elements.map((el) => [el.id, el]))
      return parts.map((part) => {
        if (part?.type === 'element') {
          const el = map.get(part.id) || (part?.thumb ? part : null)
          const name = String(el?.content || el?.label || '').trim()
          return name ? ` ${name} ` : ''
        }
        if (part?.type === 'reference') return ''
        if (part?.type && part.type !== 'text') return ''
        return String(part?.text || '')
      }).join('').replace(/\u200b/g, '').replace(/[ \t]{2,}/g, ' ').trim()
    })()

    return {
      title: doc.rows[0].title,
      targetModel: target.data?.config?.model || '',
      targetRatio: target.data?.config?.ratio || '',
      targetStatus: target.data?.status || '',
      prompt: String(target.data?.prompt || ''),
      // 前端真正发给服务端的提示词（element 片会展开成「小男孩头部和脸部特写」）。
      effectivePrompt: promptPartsToText || String(target.data?.prompt || ''),
      elementLabel: element.label || element.content || '',
      upstreamId,
      upstreamSource,
      existingOutputUrl: upstreamOutput.url && target.data?.output?.url ? target.data.output.url : '',
      cropBuffer,
      upstreamBuffer,
    }
  } finally {
    await client.end()
  }
}

// ---------------------------------------------------------------------------
// Chromium 解码 + 粗指标
// ---------------------------------------------------------------------------
function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE_PATH,
    'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core',
    'playwright-core', 'playwright',
  ].filter(Boolean)
  const require = createRequire(import.meta.url)
  const errors = []
  for (const c of candidates) { try { return require(c) } catch (e) { errors.push(`${c}: ${e.message}`) } }
  throw new Error(`找不到 playwright-core。已尝试：\n  ${errors.join('\n  ')}`)
}
function findChromiumExecutable(pw) {
  if (process.env.PROBE_CHROME_PATH && existsSync(process.env.PROBE_CHROME_PATH)) return process.env.PROBE_CHROME_PATH
  const root = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright')
  if (existsSync(root)) {
    const dirs = readdirSync(root).filter((n) => n.startsWith('chromium-')).sort((a, b) => (Number(b.split('-')[1]) || 0) - (Number(a.split('-')[1]) || 0))
    for (const dir of dirs) {
      const exe = path.join(root, dir, 'chrome-win64', 'chrome.exe')
      if (existsSync(exe)) return exe
    }
  }
  try { return pw.chromium.executablePath() } catch { return '' }
}

async function analyzeImage(browser, buffer) {
  const dataUrl = toDataUrl(buffer)
  const page = await browser.newPage()
  try {
    return await page.evaluate(async (source) => {
      const image = new Image()
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('decode failed')); image.src = source })
      const w = image.naturalWidth; const h = image.naturalHeight
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
      const px = ctx.getImageData(0, 0, w, h).data
      let r = 0; let g = 0; let b = 0; let white = 0
      let x0 = w; let y0 = h; let x1 = -1; let y1 = -1
      for (let i = 0; i < px.length; i += 4) {
        const R = px[i]; const G = px[i + 1]; const B = px[i + 2]
        r += R; g += G; b += B
        const isWhite = R >= 235 && G >= 235 && B >= 235
        if (isWhite) { white += 1 } else {
          const idx = i / 4; const x = idx % w; const y = Math.floor(idx / w)
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
        }
      }
      const n = px.length / 4
      const whiteRatio = white / n
      const bbox = x1 < 0 ? null : { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h }
      return {
        width: w, height: h,
        r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n),
        whiteRatio: Number(whiteRatio.toFixed(4)),
        subjectRatio: Number((1 - whiteRatio).toFixed(4)),
        bbox: bbox ? Object.fromEntries(Object.entries(bbox).map(([k, v]) => [k, Number(v.toFixed(3))])) : null,
        bboxCoverage: bbox ? Number(((bbox.w * bbox.h)).toFixed(3)) : 0,
      }
    }, dataUrl)
  } finally { await page.close() }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
console.log('==================== 火山方舟「标记 + 上游图」形态对照（用户真实图） ====================')
const assets = await loadAssetsFromDoc()
const cropPath = path.join(OUT_DIR, 'user-mark-crop.png')
const upstreamPath = path.join(OUT_DIR, 'user-upstream.png')
writeFileSync(cropPath, assets.cropBuffer)
writeFileSync(upstreamPath, assets.upstreamBuffer)

console.log(`文档        : ${assets.title}（${DOC_ID}）`)
console.log(`目标节点    : ${TARGET_NODE_ID}（model=${assets.targetModel}, ratio=${assets.targetRatio}, status=${assets.targetStatus}）`)
console.log(`标记元素    : ${assets.elementLabel}（裁剪图 ${assets.cropBuffer.length} 字节）`)
console.log(`上游节点    : ${assets.upstreamId}（${assets.upstreamSource}）`)
console.log(`用户 prompt : ${JSON.stringify(assets.prompt)}`)
console.log(`输出目录    : ${OUT_DIR}`)
console.log('')

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
const volc = config.providers?.volcengine || {}
const baseUrl = String(volc.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '')
const apiKey = String(volc.apiKey || '')
const model = assets.targetModel || String(volc.imageModel || 'doubao-seedream-4-0-250828')
if (!apiKey) { console.error('volcengine.apiKey 为空，无法实测。'); process.exit(1) }

const upstreamDataUrl = toDataUrl(assets.upstreamBuffer)
const cropDataUrl = toDataUrl(assets.cropBuffer)

const variants = [
  { key: 'A', file: 'A-string-upstream.jpg', label: 'A: image=上游图（字符串）', image: upstreamDataUrl },
  { key: 'B', file: 'B-string-crop.jpg', label: 'B: image=标记裁剪图（字符串）', image: cropDataUrl },
  { key: 'C', file: 'C-array-crop-first.jpg', label: 'C: image=[裁剪图, 上游图]（用户当前形态）', image: [cropDataUrl, upstreamDataUrl] },
  { key: 'D', file: 'D-array-upstream-first.jpg', label: 'D: image=[上游图, 裁剪图]（数组倒序）', image: [upstreamDataUrl, cropDataUrl] },
  // E/F：完全复刻应用真实请求（提示词用前端 effectiveGeneratorPrompt，size 用服务端为 9:16 算出的 864x1536）。
  { key: 'E', file: 'E-app-prompt-864x1536.jpg', label: 'E: 应用同款(prompt含元素名+864x1536)+[裁剪,上游]', image: [cropDataUrl, upstreamDataUrl], prompt: assets.effectivePrompt, size: '864x1536' },
  { key: 'F', file: 'F-app-prompt-2K.jpg', label: 'F: 应用同款 prompt + 2K + [裁剪,上游]', image: [cropDataUrl, upstreamDataUrl], prompt: assets.effectivePrompt, size: '2K' },
  // G：修复前「未重启」的旧服务端真实形态 —— images=[裁剪,上游] + referenceImage=裁剪 → 不去重 → [裁剪,上游,裁剪]。
  { key: 'G', file: 'G-app-prefix-crop-upstream-crop.jpg', label: 'G: 修复前真实形态 [裁剪,上游,裁剪]（重复裁剪）', image: [cropDataUrl, upstreamDataUrl, cropDataUrl], prompt: assets.effectivePrompt, size: '864x1536' },
  // H：完全不传 image（纯文本）—— 用来判断「用户看到的写实小男孩」是否就是"参考图根本没送到"的产物。
  { key: 'H', file: 'H-no-image-text-only.jpg', label: 'H: 不传 image（纯文本基线）', image: null, prompt: assets.effectivePrompt, size: '864x1536' },
]

// --only A,B 只用指定形态（避免重复付费）
const only = argOf('--only')
const selected = only ? variants.filter((v) => only.split(',').map((s) => s.trim().toUpperCase()).includes(v.key)) : variants

const pw = loadPlaywright()
const exe = findChromiumExecutable(pw)
if (!exe) { console.error('找不到 Chromium 可执行文件（可用 PROBE_CHROME_PATH 指定）'); process.exit(1) }
const browser = await pw.chromium.launch({ headless: true, executablePath: exe })
console.log(`Chromium: ${exe}`)
console.log(`本次运行形态: ${selected.map((v) => v.key).join(', ')}\n`)

const results = []
for (const variant of selected) {
  const body = {
    model,
    prompt: variant.prompt || assets.prompt,
    size: variant.size || '2K',
    sequential_image_generation: 'disabled',
    response_format: 'url',
    stream: false,
    watermark: true,
  }
  if (variant.image) body.image = variant.image
  const entry = { ...variant, imageShape: variant.image ? (Array.isArray(variant.image) ? `数组 ×${variant.image.length}` : '字符串') : '(不传 image)', usedPrompt: body.prompt, usedSize: body.size, status: 0, error: '', raw: '', file: '', metrics: null }
  console.log(`---- ${variant.label} ----`)
  console.log(`  image 形态: ${entry.imageShape} | size=${entry.usedSize}`)
  console.log(`  prompt: ${JSON.stringify(entry.usedPrompt)}`)
  try {
    const response = await postJson(`${baseUrl}/images/generations`, { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body)
    entry.status = response.status
    let json = null
    try { json = JSON.parse(response.text) } catch { /* 非 JSON */ }
    if (response.status !== 200 || !json?.data?.[0]?.url) {
      entry.error = `HTTP ${response.status} 或响应缺少 url`
      entry.raw = response.text.slice(0, 700)
      console.log(`  失败：${entry.error}\n  原始响应：${entry.raw}`)
    } else {
      const buffer = await downloadBuffer(json.data[0].url)
      const file = path.join(OUT_DIR, variant.file)
      writeFileSync(file, buffer)
      entry.file = file
      entry.metrics = await analyzeImage(browser, buffer)
      const m = entry.metrics
      console.log(`  HTTP 200  返回 ${m.width}×${m.height}（${Math.round(buffer.length / 1024)}KB）`)
      console.log(`  平均 RGB=(${m.r},${m.g},${m.b})  近白占比=${(m.whiteRatio * 100).toFixed(1)}%  主体占比=${(m.subjectRatio * 100).toFixed(1)}%`)
      console.log(`  内容包围盒=${JSON.stringify(m.bbox)}  覆盖率=${(m.bboxCoverage * 100).toFixed(1)}%`)
      console.log(`  已保存: ${file}`)
    }
  } catch (error) {
    entry.error = '请求异常'
    entry.raw = error?.message || String(error)
    console.log(`  请求异常（原文，未编造）：${entry.raw}`)
  }
  results.push(entry)
  console.log('')
}

// 结论表
const pad = (text, width) => { const s = String(text ?? ''); let w = 0; for (const ch of s) w += /[\u4e00-\u9fa5（）]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(0, width - w)) }
console.log('==================== 结果对照表 ====================')
console.log([pad('形态', 42), pad('HTTP', 6), pad('尺寸', 12), pad('平均 RGB', 16), pad('近白占比', 10), pad('主体占比', 10), pad('包围盒覆盖率', 14)].join(' | '))
console.log('-'.repeat(130))
for (const e of results) {
  const m = e.metrics
  console.log([
    pad(e.label, 42), pad(e.status || '-', 6),
    pad(m ? `${m.width}×${m.height}` : '-', 12),
    pad(m ? `(${m.r},${m.g},${m.b})` : '-', 16),
    pad(m ? `${(m.whiteRatio * 100).toFixed(1)}%` : '-', 10),
    pad(m ? `${(m.subjectRatio * 100).toFixed(1)}%` : '-', 10),
    pad(m ? `${(m.bboxCoverage * 100).toFixed(1)}%` : '-', 14),
  ].join(' | '))
}
console.log('')
console.log('判读提示：用户想要「只保留标记的小男孩 + 其它都不要 + 纯白背景」→')
console.log('  理想：近白占比高、主体占比低、包围盒是一个紧凑的中部区域；若包围盒接近满幅则说明模型把整张海报都画进去了。')

writeFileSync(path.join(OUT_DIR, 'probe-report.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  docId: DOC_ID, targetNodeId: TARGET_NODE_ID, model,
  prompt: assets.prompt, elementLabel: assets.elementLabel, upstreamId: assets.upstreamId,
  variants: results.map((e) => ({ key: e.key, file: e.file, imageShape: e.imageShape, usedSize: e.usedSize, usedPrompt: e.usedPrompt, status: e.status, error: e.error, metrics: e.metrics })),
}, null, 2), 'utf8')

await browser.close()
console.log(`\n报告已写入：${path.join(OUT_DIR, 'probe-report.json')}`)
if (results.some((e) => e.error)) process.exitCode = 1
