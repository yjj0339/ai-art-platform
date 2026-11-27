/**
 * 验收：AI 出图结果会被转存成站内素材，不再直接暴露上游的 24 小时临时链接。
 *
 * 为什么要验这件事：
 * 火山方舟 / Agnes 返回的图片地址带 `X-Tos-Expires=86400` 签名，24 小时后 403。
 * 以前这个临时链接被原样存进作品数据，第二天画布节点、作品广场、我的素材库
 * 同时变破图。现在 /api/ai/image/generate 在返回前会把图下载下来存进学生素材库，
 * 换回 /api/assets/<id>（不会过期）。
 *
 * 零花费做法：不去调真实模型，而是直接调「转存」这一层的纯函数 + 用本地 HTTP
 * 起一个假上游图床，验证 4 条：
 *   ① 外链 → 变成 /api/assets/<id>
 *   ② data: 内嵌图 → 原样不动（本来就不会过期）
 *   ③ 下载失败 → 保留原链接，不抛错（宁可过期也不能让出图报错）
 *   ④ 非学生账号 → 原样返回（后台预览没有个人素材库）
 *
 * 用法：node scripts/verify-generated-image-persist.mjs
 */
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = process.cwd()
const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  → ${JSON.stringify(detail)}`}`)
}

// 1×1 红色 PNG。真实字节，能被 sniffImageMime 认成 image/png。
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// ---- 假上游图床：模拟火山那种「临时签名链接」 ----
const hits = []
const upstream = createServer((req, res) => {
  hits.push(req.url)
  if (req.url === '/expired.png') {
    // 模拟链接过期：上游直接 403，body 不是图片
    res.writeHead(403, { 'content-type': 'text/plain' })
    res.end('expired')
    return
  }
  res.writeHead(200, { 'content-type': 'image/png' })
  res.end(RED_PNG)
})
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
const upstreamPort = upstream.address().port

const { preserveGeneratedImages } = await import(pathToFileURL(path.join(ROOT, 'server/generated-image-store.js')).href)

// ---- 假存储：只记下收到了什么，不碰真实数据库/磁盘 ----
const stored = []
const fakeStore = async (user, payload) => {
  const id = `asset-test-${stored.length + 1}`
  stored.push({ id, kind: payload.kind, mimeType: payload.mimeType, bytes: payload.buffer.length, sha: createHash('sha256').update(payload.buffer).digest('hex').slice(0, 8) })
  return { id }
}
// 真实的 readRemoteArtwork 只允许 https 且拒绝私网，本地假图床是 http+127.0.0.1，
// 所以这里注入一个等价的下载器（只放开协议限制，其余行为一致：非 200 就抛错）。
const fakeDownload = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`上游返回 ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

const student = { role: 'student', organization: { id: 'org-test' } }
const common = { user: student, dataDir: '/tmp/does-not-matter', download: fakeDownload, store: fakeStore, logger: { warn() {} } }

// ---- ① 外链转存 ----
const external = `http://127.0.0.1:${upstreamPort}/fresh.png?X-Tos-Expires=86400`
const r1 = await preserveGeneratedImages(
  [{ id: 'v1', imageUrl: external, prompt: '红' }, { id: 'v2', imageUrl: external }],
  common,
)
check('① 两张外链图都被转存', r1.stored === 2 && r1.failed === 0, r1)
check('① 地址换成了站内 /api/assets/<id>', r1.images.every((item) => /^\/api\/assets\/[A-Za-z0-9_-]+$/.test(item.imageUrl)), r1.images.map((i) => i.imageUrl))
check('① 每张图都带上了 assetId', r1.images.every((item) => item.assetId), r1.images.map((i) => i.assetId))
check('① 原有字段没被丢掉（prompt 还在）', r1.images[0].prompt === '红', r1.images[0])
check('① 存进去的是真 PNG（按文件头判断）', stored.every((item) => item.mimeType === 'image/png' && item.bytes === RED_PNG.length), stored)
check('① 两次下载都真的打到了上游', hits.filter((u) => u.startsWith('/fresh.png')).length === 2, hits)

// ---- ② data: 内嵌图不动 ----
const dataUrl = `data:image/png;base64,${RED_PNG.toString('base64')}`
const r2 = await preserveGeneratedImages([{ id: 'v3', imageUrl: dataUrl }], common)
check('② data: 内嵌图原样返回（本来就不会过期）', r2.images[0].imageUrl === dataUrl, { got: r2.images[0].imageUrl.slice(0, 40) })
check('② data: 不触发任何转存', r2.stored === 0 && r2.failed === 0, r2)

// ---- ③ 下载失败保留原链接、不抛错 ----
const expired = `http://127.0.0.1:${upstreamPort}/expired.png`
let threw = null
let r3 = null
try {
  r3 = await preserveGeneratedImages([{ id: 'v4', imageUrl: expired }], common)
} catch (error) {
  threw = error.message
}
check('③ 上游 403 时整个函数不抛错（不能因为一张图失败就让出图白花钱）', !threw, threw)
check('③ 失败的图保留原链接', r3?.images?.[0]?.imageUrl === expired, r3?.images?.[0])
check('③ 失败计数为 1', r3?.failed === 1 && r3?.stored === 0, r3)

// ---- ④ 非学生账号原样返回 ----
const r4 = await preserveGeneratedImages([{ id: 'v5', imageUrl: external }], { ...common, user: { role: 'admin' } })
check('④ 非学生账号原样返回（后台预览没有个人素材库）', r4.images[0].imageUrl === external && r4.skipped === 'no-student', r4)

// ---- ⑤ 站内地址不重复转存 ----
const r5 = await preserveGeneratedImages([{ id: 'v6', imageUrl: '/api/assets/already-stored' }], common)
check('⑤ 已经是站内地址的不再转存', r5.stored === 0 && r5.images[0].imageUrl === '/api/assets/already-stored', r5)

// ---- ⑥ 混合场景：真实出图常见「1 张成功 + 1 张过期」 ----
const r6 = await preserveGeneratedImages(
  [{ id: 'a', imageUrl: external }, { id: 'b', imageUrl: expired }],
  common,
)
check('⑥ 混合场景：好的存了、坏的留原样、整体不崩', r6.stored === 1 && r6.failed === 1
  && /^\/api\/assets\//.test(r6.images[0].imageUrl) && r6.images[1].imageUrl === expired, r6.images)

// ---- ⑦ 纯字符串地址（玩法 / H5 报告的多步执行器给的就是这种）----
const r7 = await preserveGeneratedImages([external, expired, dataUrl, '/api/assets/already-stored'], common)
check('⑦ 字符串外链也会转存，转完还是字符串', r7.stored === 1 && typeof r7.images[0] === 'string' && /^\/api\/assets\/[A-Za-z0-9_-]+$/.test(r7.images[0]), r7.images[0])
check('⑦ 字符串：过期的留原样、data: 和站内地址不动', r7.failed === 1 && r7.images[1] === expired && r7.images[2] === dataUrl && r7.images[3] === '/api/assets/already-stored', r7.images.map((item) => String(item).slice(0, 40)))

upstream.close()

// ---- 汇总 ----
const failed = checks.filter((item) => !item.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`)
if (failed.length) {
  console.log('失败项：')
  failed.forEach((item) => console.log(`  - ${item.name}`))
  process.exit(1)
}
console.log('全部通过：出图结果已落地成站内素材，不再依赖 24 小时临时链接。')
