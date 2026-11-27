import { createOwnAssetFromBuffer } from './asset-store.js'
import { readRemoteArtwork } from './artwork-image.js'

/**
 * 出图结果「落地」成站内素材。
 *
 * 为什么必须做这件事：
 * 火山方舟 / Agnes 返回的图片地址是**带签名的临时链接**（`X-Tos-Expires=86400`，24 小时）。
 * 链接一过期，服务器直接 403。如果把这个临时链接原样存进作品数据，第二天
 * 画布节点、作品广场、我的素材库会同时变成破图 —— 图其实还在上游，但拿不到了。
 *
 * 所以在出图返回前先下载一遍、存进学生自己的素材库，把「别人的临时链接」
 * 换成「我们自己的文件」（`/api/assets/<id>`，不会过期）。
 */

// 每张图的下载上限给 20 秒：出图本身已经等了几十秒，这里不能把总时长拖到超时。
const DOWNLOAD_TIMEOUT_MS = 20000
// 一次出图最多 4 张，并发 4 足够；多步工作流可能十几张，限流避免把上游打满。
const DEFAULT_CONCURRENCY = 4

/** 只按文件头判断格式。上游 content-type 偶尔和真实字节不一致，不能信它。 */
function sniffImageMime(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.alloc(0)
  if (bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'image/png'
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return ''
}

function extensionForMime(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}

/**
 * 把一个图片对象里的临时外链换成站内地址。
 *
 * 只处理 `http(s)://`：
 * - `data:` 本身就是内嵌数据，不会过期，不用动；
 * - `/api/assets/<id>` 已经是站内地址，也不用动。
 *
 * @returns {Promise<{ images: Array, stored: number, failed: number, skipped?: string }>}
 *   失败时**保留原链接**——宁可这张图 24 小时后过期，也不能因为下载失败就让整次出图报错。
 */
export async function preserveGeneratedImages(images, options = {}) {
  const {
    user,
    dataDir,
    kind = 'ai-generated',
    download = readRemoteArtwork,
    store = createOwnAssetFromBuffer,
    concurrency = DEFAULT_CONCURRENCY,
    logger = console,
  } = options

  const list = Array.isArray(images) ? images : []
  if (!list.length) return { images: list, stored: 0, failed: 0 }
  // 只有学生能往自己素材库写东西（asset-store 的硬约束）；后台预览没有个人素材库，原样返回。
  if (user?.role !== 'student' || !dataDir) return { images: list, stored: 0, failed: 0, skipped: 'no-student' }

  const targets = []
  // 两种形态都要认：出图接口给的是 { imageUrl } 对象，玩法 / H5 报告的多步执行器给的是纯字符串地址。
  // 以前只认对象，字符串那两条路的上游临时链接一张都没转存，第二天报告里就是破图。
  list.forEach((item, index) => {
    const url = String((typeof item === 'string' ? item : item?.imageUrl) || '').trim()
    if (/^https?:\/\//i.test(url)) targets.push({ index, url })
  })
  if (!targets.length) return { images: list, stored: 0, failed: 0 }

  const next = list.slice()
  let cursor = 0
  let stored = 0
  let failed = 0

  async function worker() {
    while (cursor < targets.length) {
      const task = targets[cursor]
      cursor += 1
      try {
        const buffer = await download(task.url, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS))
        const mimeType = sniffImageMime(buffer)
        if (!mimeType) throw new Error('返回的不是 PNG/JPEG/WebP 图片')
        const asset = await store(user, {
          buffer,
          mimeType,
          originalName: `${kind}-${Date.now()}-${task.index + 1}.${extensionForMime(mimeType)}`,
          kind,
        }, dataDir)
        const assetUrl = `/api/assets/${encodeURIComponent(asset.id)}`
        // 进来是字符串就还给字符串，是对象就只换地址、保留其余字段（调用方按原形态继续用）
        next[task.index] = typeof list[task.index] === 'string'
          ? assetUrl
          : { ...list[task.index], imageUrl: assetUrl, assetId: asset.id }
        stored += 1
      } catch (error) {
        failed += 1
        logger.warn?.('[generated-image] 转存失败，保留原链接：', error?.message || error)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker))
  return { images: next, stored, failed }
}
