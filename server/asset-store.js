import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { logAudit } from './auth.js'
import { queryAsUser } from './db.js'

const MAX_ASSET_BYTES = Number(process.env.MAX_ASSET_BYTES || 25 * 1024 * 1024)

function newId() {
  return `ast_${randomBytes(18).toString('base64url')}`
}

function httpError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function safeExtension(name, mimeType) {
  const provided = extname(basename(String(name || ''))).toLowerCase()
  if (/^\.[a-z0-9]{1,10}$/.test(provided)) return provided
  const byMime = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'model/gltf-binary': '.glb', 'application/pdf': '.pdf',
  }
  return byMime[mimeType] || '.bin'
}

function decodeBase64(value) {
  const normalized = String(value || '').replace(/^data:[^;]+;base64,/, '')
  if (!normalized || !/^[A-Za-z0-9+/=\r\n]+$/.test(normalized)) throw httpError('文件内容必须是有效的 Base64 数据。')
  const buffer = Buffer.from(normalized, 'base64')
  if (!buffer.length || buffer.length > MAX_ASSET_BYTES) throw httpError(`文件大小必须在 1 字节到 ${MAX_ASSET_BYTES} 字节之间。`, 413)
  return buffer
}

function storagePath(dataDir, storageKey) {
  const root = resolve(dataDir, 'protected-assets')
  const target = resolve(root, storageKey)
  const relativePath = relative(root, target)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) throw httpError('资产存储路径无效。', 500)
  return { root, target }
}

/**
 * 落盘并登记一条个人资产。base64 入口和「远程图片转存」入口共用这一段，
 * 保证两边的存储路径、去重摘要、审计日志完全一致。
 */
async function persistAsset(user, { body, mimeType, originalName, kind }, dataDir) {
  const id = newId()
  const extension = safeExtension(originalName, mimeType)
  const digest = createHash('sha256').update(body).digest('hex').slice(0, 16)
  const storageKey = `${user.organization.id}/${user.id}/${randomBytes(24).toString('hex')}-${digest}${extension}`
  const { root, target } = storagePath(dataDir, storageKey)
  await mkdir(join(root, user.organization.id, user.id), { recursive: true })
  const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temporary, body, { flag: 'wx' })
  try {
    await rename(temporary, target)
    const result = await queryAsUser(user,
      `INSERT INTO user_assets (id, organization_id, campus_id, owner_user_id, asset_kind, original_name, mime_type, storage_key, byte_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, asset_kind, original_name, mime_type, byte_size, created_at`,
      [id, user.organization.id, user.campus?.id || null, user.id, String(kind || 'file').slice(0, 60),
        basename(String(originalName || 'file')).slice(0, 200), mimeType, storageKey, body.length],
    )
    await logAudit(user.id, user.organization.id, 'asset.create', 'asset', id, { kind: kind || 'file', byteSize: body.length })
    return result.rows[0]
  } catch (error) {
    await unlink(target).catch(() => {})
    throw error
  }
}

export async function createOwnAsset(user, payload, dataDir) {
  if (user.role !== 'student') throw httpError('只有小画家账号可以创建个人资产。', 403)
  const mimeType = String(payload.mimeType || '').trim().toLowerCase().slice(0, 120)
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)) throw httpError('文件 MIME 类型无效。')
  const body = decodeBase64(payload.base64)
  return persistAsset(user, { body, mimeType, originalName: payload.originalName, kind: payload.kind }, dataDir)
}

/**
 * 已经拿到二进制时走这里（例如把 AI 出图结果转存进学生自己的素材库）。
 * 不重复做 base64 解码，其余校验与 createOwnAsset 一致。
 */
export async function createOwnAssetFromBuffer(user, payload, dataDir) {
  if (user.role !== 'student') throw httpError('只有小画家账号可以创建个人资产。', 403)
  const mimeType = String(payload.mimeType || '').trim().toLowerCase().slice(0, 120)
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)) throw httpError('文件 MIME 类型无效。')
  const body = Buffer.isBuffer(payload.buffer) ? payload.buffer : Buffer.alloc(0)
  if (!body.length) throw httpError('图片内容为空。', 400)
  if (body.length > MAX_ASSET_BYTES) throw httpError(`文件大小必须在 1 字节到 ${MAX_ASSET_BYTES} 字节之间。`, 413)
  return persistAsset(user, { body, mimeType, originalName: payload.originalName, kind: payload.kind }, dataDir)
}

export async function getAccessibleAsset(user, assetId, dataDir) {
  const result = await queryAsUser(user,
    `SELECT id, owner_user_id, original_name, mime_type, storage_key, byte_size
     FROM user_assets
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [assetId, user.organization.id],
  )
  if (!result.rows[0]) throw httpError('未找到该资产，或当前账号没有权限。', 404)
  const { target } = storagePath(dataDir, result.rows[0].storage_key)
  let data
  try {
    data = await readFile(target)
  } catch {
    throw httpError('资产文件暂时不可用。', 503)
  }
  return { ...result.rows[0], data }
}
