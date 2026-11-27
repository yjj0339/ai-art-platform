// 测试辅助：造一套「真实用户 + 真实 DB 资产 + 有效会话」，用于验证服务端能把
// `/api/assets/<id>`（画布本地资产引用）解析成 data URL 并真正写进上游请求体。
//
// 为什么必须走真实 DB：`getAccessibleAsset()` 是查 `user_assets` 表 + 读
// `<AI_DATA_DIR>/protected-assets/<storage_key>`，不是纯文件逻辑；且必须带登录态
// （`currentUser.organization.id`）才能过组织归属校验。demo 模式下没有登录用户，
// 因此这一条只能在 AUTH_MODE=server 下验证。
//
// 所有写入（资产行、会话行、磁盘文件）都会在 cleanup() 里删除，不污染真实数据。
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import path from 'node:path'

// 本机数据库连接串：先看环境变量 DATABASE_URL，再读 server/.env。
// 以前直接写在这里，带着数据库口令，不能进仓库。
export const DEFAULT_DB_URL = process.env.DATABASE_URL || readLocalDatabaseUrl()

function readLocalDatabaseUrl() {
  try {
    return readFileSync(path.join(process.cwd(), 'server', '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim() || ''
  } catch {
    return ''
  }
}

// 8×8 纯色 PNG，作为"自造资产"的内容（不依赖任何图形库）。
function solidPng(rgb) {
  const size = 8
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
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

export function assetPngBuffer() {
  return solidPng([0, 255, 0])
}

// 成功：{ available: true, assetId, cookie, expectedBytes, cleanup }
// 不可用（无 DB / 无用户 / 连不上）：{ available: false, reason, cleanup }
export async function createAssetRefFixture({ dbUrl = DEFAULT_DB_URL, dataDir, sessionCookieName = 'ai_art_session', log = () => {} } = {}) {
  let pg
  try {
    ;({ default: pg } = await import('pg'))
  } catch (error) {
    return { available: false, reason: `未安装 pg 模块（${error.message}）`, cleanup: async () => {} }
  }
  const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 })
  try {
    await client.connect()
  } catch (error) {
    return { available: false, reason: `连不上数据库：${error.message}`, cleanup: async () => {} }
  }

  const cleanup = async () => {
    try { await client.query('DELETE FROM user_assets WHERE id = $1', [assetId]) } catch { /* 已删/无权限 */ }
    try { await client.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]) } catch { /* ignore */ }
    try { if (assetPath) rmSync(assetPath, { force: true }) } catch { /* ignore */ }
    try { await client.end() } catch { /* ignore */ }
  }

  let assetId = ''
  let assetPath = ''
  let tokenHash = ''
  try {
    const user = await client.query(
      `SELECT u.id, u.organization_id FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.status = 'active' ORDER BY u.created_at LIMIT 1`,
    )
    if (!user.rows.length) { await client.end(); return { available: false, reason: '数据库里没有可用的 active 用户', cleanup: async () => {} } }
    const userId = user.rows[0].id
    const organizationId = user.rows[0].organization_id

    assetId = `ast_${randomBytes(18).toString('base64url')}`
    const storageKey = `${organizationId}/__refprobe__/${randomBytes(24).toString('hex')}-probe.png`
    assetPath = path.join(dataDir, 'protected-assets', storageKey)
    mkdirSync(path.dirname(assetPath), { recursive: true })
    const bytes = assetPngBuffer()
    writeFileSync(assetPath, bytes)

    await client.query(
      `INSERT INTO user_assets (id, organization_id, campus_id, owner_user_id, asset_kind, original_name, mime_type, storage_key, byte_size)
       VALUES ($1, $2, NULL, $3, 'ref-probe', 'probe.png', 'image/png', $4, $5)`,
      [assetId, organizationId, userId, storageKey, bytes.length],
    )

    const rawToken = randomBytes(32).toString('base64url')
    tokenHash = createHash('sha256').update(rawToken).digest('hex')
    await client.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [`ses_${randomBytes(18).toString('base64url')}`, userId, tokenHash],
    )

    log(`  fixture: user=${userId} org=${organizationId} asset=${assetId}（${bytes.length} 字节）`)
    return {
      available: true,
      assetId,
      assetPath,
      expectedBytes: bytes.length,
      cookie: `${sessionCookieName}=${rawToken}`,
      cleanup,
    }
  } catch (error) {
    await cleanup()
    return { available: false, reason: `构造测试资产失败：${error.message}`, cleanup: async () => {} }
  }
}
