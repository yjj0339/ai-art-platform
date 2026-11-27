/**
 * 验证：中文提示词 + 参考图（图生图）能否出图。
 *
 * 背景：`generateOpenAIEditedImages` 走 multipart，曾抛
 *   Cannot convert argument to a ByteString because the character at index 7 ...
 * 只要提示词里有中文就必挂。
 *
 * 用法：node scripts/verify-image-cn-prompt.mjs
 * 成本：1 张出图。
 */
import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'

const require = createRequire('C:/Users/Administrator/.workbuddy/binaries/node/workspace/')
const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:3000'

// 64×64 纯橙 PNG，做参考图
function solidPngDataUrl(size, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const p = row + 1 + x * 3
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

const res0 = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: BASE },
  body: JSON.stringify({ account: 'ceshi2', password: '123456789', organizationCode: 'demo-school' }),
})
if (!res0.ok) throw new Error(`登录失败 ${res0.status}`)
const cookie = (res0.headers.getSetCookie?.() || []).map((v) => v.split(';')[0]).join('; ')
console.log('[登录] ok')

const prompt = '一只猫坐在月球表面，抬头望向星空；深蓝近黑的宇宙，银灰色月壤，手绘水彩绘本感，画面比例 1:1'
const body = {
  prompt,
  // 不写死供应商：服务端会用自己的默认出图模型。写死 openai 会撞上 .env 里
  // 「你的OpenAI密钥」这种中文占位 Key，报 ByteString 错，误判成出图坏了。
  ...(process.env.PROBE_PROVIDER ? { provider: process.env.PROBE_PROVIDER } : {}),
  ...(process.env.PROBE_MODEL ? { model: process.env.PROBE_MODEL } : {}),
  ratio: '1:1',
  count: 1,
  referenceImages: [solidPngDataUrl(64, [230, 126, 34])],
}

const started = Date.now()
const res = await fetch(`${BASE}/api/ai/image/generate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie, origin: BASE },
  body: JSON.stringify(body),
})
const cost = Date.now() - started
const data = await res.json().catch(() => ({}))
console.log(`\n[状态] ${res.status}  用时 ${(cost / 1000).toFixed(1)}s`)
console.log('[参考图] 送出', data.referenceImageCount, '/ 转发', data.forwardedImageCount)

if (!res.ok) {
  console.log('[失败]', JSON.stringify(data, null, 2).slice(0, 600))
  process.exit(1)
}
const images = data.images || []
console.log('[出图]', images.length, '张')
images.slice(0, 1).forEach((img) => {
  const url = String(img.url || img.imageUrl || '')
  console.log('  ', url.startsWith('data:') ? `data URL ${Math.round(url.length / 1024)}KB` : url.slice(0, 90))
})
console.log(images.length ? '\n中文提示词 + 参考图：出图成功' : '\n出图 0 张，需要排查')
process.exit(images.length ? 0 : 1)
