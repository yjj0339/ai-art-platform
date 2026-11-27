/**
 * 课程素材落盘 + 登记。
 *
 * 为什么单独一个文件而不是塞进 course-store.js：
 *  - course-store.js 只碰数据库，纯 SQL；这里碰文件系统和磁盘路径校验。
 *    混在一起以后想把文件搬到对象存储（OSS/COS）时，要改的地方只有一个。
 *
 * 与 asset-store.js（学生个人资产）的差异：
 *  - 学生资产是「一人一份，只有本人能看」，用 user_assets + RLS 天然隔离；
 *  - 课程素材是「一份素材，按课程授权给一批学生看」，所以落 course_assets 表登记归属，
 *    读权限不看 owner，而是看「这个素材挂在哪门课上、你有没有那门课的权限」。
 *
 * 路径约定：course-assets/{organizationId}/{userId}/{random24hex}-{sha256前16}{ext}
 *  - 带 organizationId 是为了将来按机构清理/迁移；
 *  - 带 random 是为了不可枚举（学生拿到自己的 assetId 也猜不到别人的）；
 *  - 带 sha256 前 16 位是为了排错时能对上是同一份文件。
 */
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { registerCourseAsset } from './course-store.js'

// 视频单独放宽：一节 20 分钟的课程视频几千兆很正常，和学生头像/作品图不是一个量级。
const MAX_COURSE_ASSET_BYTES = Number(process.env.MAX_COURSE_ASSET_BYTES || 32 * 1024 * 1024)
const MAX_COURSE_VIDEO_BYTES = Number(process.env.MAX_COURSE_VIDEO_BYTES || 512 * 1024 * 1024)

const START_ASSET_ROOT = 'course-assets'

function httpError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function safeExtension(name, mimeType) {
  const provided = extname(basename(String(name || ''))).toLowerCase()
  if (/^\.[a-z0-9]{1,10}$/.test(provided)) return provided
  const byMime = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'application/pdf': '.pdf',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  }
  return byMime[mimeType] || '.bin'
}

function assetRoot(dataDir) {
  return resolve(dataDir, START_ASSET_ROOT)
}

/**
 * 把「数据库里存的相对 key」翻译成「磁盘绝对路径」，并挡住 ../ 越界。
 * 和 asset-store.js 的 storagePath 同一套写法，出错一律当 500（是我们的 bug，不是用户的）。
 */
export function courseAssetPath(dataDir, storageKey) {
  const root = assetRoot(dataDir)
  const target = resolve(root, storageKey)
  const relativePath = relative(root, target)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw httpError('课程素材存储路径无效。', 500)
  }
  return target
}

export function maxBytesForKind(kind) {
  return String(kind) === 'video' ? MAX_COURSE_VIDEO_BYTES : MAX_COURSE_ASSET_BYTES
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} 字节`
}

/**
 * 落盘 + 登记。调用方负责先做角色校验（只有老师/管理员能上传课程素材）。
 * 返回 course_assets 的行 + 可直接放进课程数据里的 url。
 */
export async function persistCourseAsset(user, { buffer, mimeType, originalName, assetKind }, dataDir) {
  const kind = String(assetKind || '').trim()
  if (!['cover', 'video', 'ppt', 'pdf'].includes(kind)) throw httpError('素材类型不正确（只支持封面/视频/课件）。')
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.alloc(0)
  const limit = maxBytesForKind(kind)
  if (!body.length) throw httpError('文件内容为空。')
  if (body.length > limit) {
    throw httpError(`文件太大：${kind === 'video' ? '课程视频' : '该素材'}上限 ${formatBytes(limit)}，当前 ${formatBytes(body.length)}。`, 413)
  }
  const type = String(mimeType || '').trim().toLowerCase().slice(0, 120) || 'application/octet-stream'
  const extension = safeExtension(originalName, type)
  const digest = createHash('sha256').update(body).digest('hex').slice(0, 16)
  const storageKey = `${user.organization.id}/${user.id}/${randomBytes(24).toString('hex')}-${digest}${extension}`
  const target = courseAssetPath(dataDir, storageKey)
  await mkdir(join(assetRoot(dataDir), user.organization.id, user.id), { recursive: true })
  const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`
  // flag:'wx' 保证临时文件不会被并发请求互相覆盖；写完 rename 才对外可见，
  // 中途失败（磁盘满/进程被杀）不会留下半截文件被当成正常素材读出去。
  await writeFile(temporary, body, { flag: 'wx' })
  try {
    await rename(temporary, target)
    const record = await registerCourseAsset(user, {
      assetKind: kind,
      originalName,
      mimeType: type,
      storageKey,
      byteSize: body.length,
    })
    return { ...record, url: `/api/course-assets/${encodeURIComponent(record.id)}` }
  } catch (error) {
    await unlink(target).catch(() => {})
    await unlink(temporary).catch(() => {})
    throw error
  }
}

/**
 * 大文件（课程视频）走这条路：请求体是裸二进制，直接边收边写盘，不在内存里攒一份 Buffer。
 * 一个 500MB 视频如果走 base64 JSON，光字符串就要占 670MB 内存，服务端很容易被打爆。
 *
 * 用 pipeline 而不是 for await 是为了在客户端断线时能自动 abort 并清理临时文件。
 */
export async function persistCourseAssetFromStream(user, { stream, mimeType, originalName, assetKind, contentLength }, dataDir) {
  const kind = String(assetKind || '').trim()
  if (!['cover', 'video', 'ppt', 'pdf'].includes(kind)) throw httpError('素材类型不正确（只支持封面/视频/课件）。')
  const limit = maxBytesForKind(kind)
  if (Number(contentLength) > limit) {
    throw httpError(`文件太大：${kind === 'video' ? '课程视频' : '该素材'}上限 ${formatBytes(limit)}，当前 ${formatBytes(contentLength)}。`, 413)
  }
  const type = String(mimeType || '').trim().toLowerCase().slice(0, 120) || 'application/octet-stream'
  const extension = safeExtension(originalName, type)
  const storageKey = `${user.organization.id}/${user.id}/${randomBytes(24).toString('hex')}-stream${extension}`
  const target = courseAssetPath(dataDir, storageKey)
  await mkdir(join(assetRoot(dataDir), user.organization.id, user.id), { recursive: true })
  const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`

  let bytes = 0
  let overflow = false
  const guard = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      if (bytes > limit) {
        overflow = true
        callback(httpError(`文件太大：${kind === 'video' ? '课程视频' : '该素材'}上限 ${formatBytes(limit)}。`, 413))
        return
      }
      callback(null, chunk)
    },
  })

  try {
    await pipeline(stream, guard, createWriteStream(temporary, { flags: 'wx' }))
  } catch (error) {
    await unlink(temporary).catch(() => {})
    if (overflow) throw error
    throw httpError(`上传中断，请重试（${error?.message || '连接异常'}）。`, 400)
  }
  if (!bytes) {
    await unlink(temporary).catch(() => {})
    throw httpError('文件内容为空。')
  }
  try {
    await rename(temporary, target)
    const record = await registerCourseAsset(user, {
      assetKind: kind,
      originalName,
      mimeType: type,
      storageKey,
      byteSize: bytes,
    })
    return { ...record, url: `/api/course-assets/${encodeURIComponent(record.id)}` }
  } catch (error) {
    await unlink(target).catch(() => {})
    await unlink(temporary).catch(() => {})
    throw error
  }
}

/** 落盘之后的实际读取：给 Range 用的绝对路径 + 大小。 */
export async function resolveCourseAssetFile(record, dataDir) {
  const target = courseAssetPath(dataDir, record.storage_key)
  if (!existsSync(target)) throw httpError('课程素材文件暂时不可用，请重新上传。', 503)
  return { path: target, size: statSync(target).size, stream: (options) => createReadStream(target, options) }
}
