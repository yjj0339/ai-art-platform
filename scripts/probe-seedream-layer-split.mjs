/**
 * 探针：验证火山方舟 Seedream 5.0「图层拆分」在本账号是否可用
 * 用法：node scripts/probe-seedream-layer-split.mjs [图片相对路径] [模型]
 * 默认：public/assets/h5-report/product-design-story.png + flash（省钱）
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'server/data/ai-providers.json'), 'utf8'))
const key = cfg.providers?.volcengine?.apiKey
if (!key) { console.error('未找到火山方舟 apiKey'); process.exit(1) }

const rel = process.argv[2] || 'public/assets/h5-report/product-design-story.png'
const model = process.argv[3] || 'doubao-seedream-5-0-flash-260915'
const file = path.resolve(root, rel)
const buf = fs.readFileSync(file)
const ext = path.extname(file).slice(1).toLowerCase()
const b64 = buf.toString('base64')
console.log(`输入：${rel}  ${(buf.length / 1024 / 1024).toFixed(2)}MB  base64 ${(b64.length / 1024 / 1024).toFixed(2)}MB`)
console.log(`模型：${model}`)

const body = {
  model,
  image: `data:image/${ext};base64,${b64}`,
  layer_decomposition: true,
  size: '1K',
  output_format: 'png',
  response_format: 'url',
  watermark: false
}

const t0 = Date.now()
let res, json
try {
  res = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  })
  json = await res.json()
} catch (e) {
  console.error('请求异常：', e.message)
  process.exit(1)
}
const cost = ((Date.now() - t0) / 1000).toFixed(1)

console.log(`\nHTTP ${res.status}  耗时 ${cost}s`)
if (!res.ok) {
  console.log('失败响应：', JSON.stringify(json, null, 2).slice(0, 2000))
  process.exit(2)
}

const data = json.data || []
console.log(`返回 ${data.length} 项（1 底图 + ${Math.max(0, data.length - 1)} 图层）`)
console.log('usage:', JSON.stringify(json.usage))

const rows = data.map((d, i) => {
  const bb = d.bounding_box
  const n = bb?.normalized
  const a = bb?.absolute
  const norm = n ? `norm[${n.join(',')}]` : ''
  const abs = a ? `abs[${a.join(',')}]` : ''
  return {
    idx: i,
    z: d.z_index,
    size: d.size,
    fmt: d.output_format,
    name: d.name || '(底图)',
    desc: (d.description || '').slice(0, 40),
    box: `${norm} ${abs}`.trim(),
    // 映射到 1080x1920 画布
    el: n ? `x=${Math.round(n[0] / 1000 * 1080)} y=${Math.round(n[1] / 1000 * 1920)} w=${Math.round((n[2] - n[0]) / 1000 * 1080)} h=${Math.round((n[3] - n[1]) / 1000 * 1920)}` : ''
  }
})
console.table(rows)

// 落盘前 3 个图层看是否真透明
const outDir = path.join(root, 'scripts/.probe-layers')
fs.mkdirSync(outDir, { recursive: true })
for (const d of data.slice(0, 3)) {
  try {
    const r = await fetch(d.url)
    const b = Buffer.from(await r.arrayBuffer())
    const f = path.join(outDir, `z${d.z_index}.png`)
    fs.writeFileSync(f, b)
    console.log(`已下载 z${d.z_index} → ${path.relative(root, f)}  ${(b.length / 1024).toFixed(0)}KB`)
  } catch (e) { console.log(`下载 z${d.z_index} 失败：${e.message}`) }
}
console.log('\n完整首项：', JSON.stringify(data[1] || data[0], null, 1).slice(0, 800))
