/* AI 创作伙伴生成的图片 / 视频落地。
 * 学生账号的出图已由 preserveGeneratedImages 存进个人素材库（/api/assets/<id>）。
 * 剩下几种情况在这里兜底，避免对话记录里存着 24 小时就过期的临时链接或几 MB 的 data URL：
 *   1. 上游直接返回 base64（例如 gpt-image-1），preserveGeneratedImages 按设计不处理 data:；
 *   2. 管理员 / 讲师账号没有个人素材库；
 *   3. 视频：供应商给的是临时下载地址，生成完成后转存到本站。
 * 文件按账号分目录存放，读取时只在当前登录账号自己的目录里找，别人拿到文件名也读不到。
 */
import { randomBytes, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { join } from 'node:path'
import { publicAddress, readRemoteArtwork } from './artwork-image.js'

const MAX_BYTES = 15 * 1024 * 1024
const MAX_VIDEO_BYTES = 60 * 1024 * 1024
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120000
const FILE_PATTERN = /^[a-z0-9]+-[a-f0-9]{24}\.(png|jpg|webp|mp4)$/
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

function sniffImageMime(buffer) {
  if (buffer.length > 8 && buffer.readUInt32BE(0) === 0x89504e47) return 'png'
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return ''
}

function looksLikeMp4(buffer) {
  return buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp'
}

function userFolder(dataDir, user) {
  const key = createHash('sha256').update(String(user?.id || '')).digest('hex').slice(0, 32)
  return join(dataDir, 'agent-images', key)
}

function newFileName(extension) {
  return `${Date.now().toString(36)}-${randomBytes(12).toString('hex')}.${extension}`
}

/** 把一张图片地址换成本站长期可用的地址；失败时返回原地址（不让一次转存失败毁掉整轮对话）。 */
export async function persistAgentImage(imageUrl, { user, dataDir }) {
  const source = String(imageUrl || '').trim()
  if (!source || /^\/api\/(assets|agent-images)\//.test(source) || !user?.id) return source
  try {
    let buffer
    const dataMatch = source.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i)
    if (dataMatch) buffer = Buffer.from(dataMatch[1].replace(/\s+/g, ''), 'base64')
    else if (/^https:\/\//i.test(source)) buffer = await readRemoteArtwork(source, AbortSignal.timeout(20000))
    else return source
    if (!buffer?.length || buffer.length > MAX_BYTES) return source
    const extension = sniffImageMime(buffer)
    if (!extension) return source
    const folder = userFolder(dataDir, user)
    mkdirSync(folder, { recursive: true })
    const fileName = newFileName(extension)
    writeFileSync(join(folder, fileName), buffer)
    return `/api/agent-images/${fileName}`
  } catch (error) {
    console.warn('[agent-image] 图片转存失败，保留原地址：', error?.message || error)
    return source
  }
}

/** 只在当前账号自己的目录里查找文件。 */
export function agentImagePath(fileName, { user, dataDir }) {
  if (!user?.id || !FILE_PATTERN.test(String(fileName || ''))) return ''
  const file = join(userFolder(dataDir, user), fileName)
  return existsSync(file) ? file : ''
}

/**
 * 站内图片地址 /api/agent-images/<file> → data URL。
 * 外部模型读不到站内路径，用作参考图 / 视频首帧前必须先转换；不是本人的文件返回空串。
 */
export function agentImageDataUrl(url, { user, dataDir }) {
  const match = String(url || '').trim().match(/^\/api\/agent-images\/([a-z0-9]+-[a-f0-9]{24}\.(png|jpg|webp))$/)
  if (!match) return ''
  const file = agentImagePath(match[1], { user, dataDir })
  if (!file) return ''
  return `data:${IMAGE_MIME[match[2]]};base64,${readFileSync(file).toString('base64')}`
}

/**
 * 下载视频。与后台配置的供应商同源的地址直接读取（请求本来就发往那里）；
 * 其他地址必须是公开 HTTPS，DNS 解析结果固定到实际连接，重定向每一跳重新校验，防止被利用去访问内网。
 */
async function downloadVideo(source, trustedOrigin, redirects = 0) {
  let url
  try { url = new URL(source) } catch { throw new Error('视频地址无效') }
  if (url.username || url.password || !/^https?:$/.test(url.protocol)) throw new Error('视频地址无效')
  const trusted = Boolean(trustedOrigin) && url.origin === trustedOrigin
  let pinned = null
  if (!trusted) {
    if (url.protocol !== 'https:' || (url.port && url.port !== '443')) throw new Error('视频地址必须是公开的 HTTPS 地址')
    const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true })
    if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error('不能读取私网或本机地址')
    pinned = addresses[0]
  }
  const client = url.protocol === 'https:' ? https : http
  return await new Promise((resolve, reject) => {
    const options = { signal: AbortSignal.timeout(VIDEO_DOWNLOAD_TIMEOUT_MS) }
    if (pinned) options.lookup = (_hostname, lookupOptions, callback) => (lookupOptions.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family))
    const request = client.get(url, options, (response) => {
      const status = response.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume()
        if (redirects >= 3) { reject(new Error('视频地址重定向次数过多')); return }
        let next
        try { next = new URL(response.headers.location, url).toString() } catch { reject(new Error('视频地址无效')); return }
        downloadVideo(next, trustedOrigin, redirects + 1).then(resolve, reject)
        return
      }
      if (status !== 200) { response.resume(); reject(new Error(`视频下载失败（${status}）`)); return }
      if (Number(response.headers['content-length'] || 0) > MAX_VIDEO_BYTES) { response.destroy(); reject(new Error('视频文件过大')); return }
      let bytes = 0
      const chunks = []
      response.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > MAX_VIDEO_BYTES) response.destroy(new Error('视频文件过大'))
        else chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.on('error', reject)
  })
}

/** 把生成好的视频转存到本人目录，返回 /api/agent-images/<file>.mp4；失败抛错（由调用方决定重试或回退）。 */
export async function persistAgentVideo(videoUrl, { user, dataDir, trustedOrigin = '' }) {
  const source = String(videoUrl || '').trim()
  if (!source || !user?.id) throw new Error('缺少视频地址')
  let buffer
  const dataMatch = source.match(/^data:video\/mp4;base64,([A-Za-z0-9+/=\s]+)$/i)
  if (dataMatch) buffer = Buffer.from(dataMatch[1].replace(/\s+/g, ''), 'base64')
  else buffer = await downloadVideo(source, trustedOrigin)
  if (!buffer?.length) throw new Error('视频文件为空')
  if (buffer.length > MAX_VIDEO_BYTES) throw new Error('视频文件过大')
  if (!looksLikeMp4(buffer)) throw new Error('视频格式无法识别')
  const folder = userFolder(dataDir, user)
  mkdirSync(folder, { recursive: true })
  const fileName = newFileName('mp4')
  await writeFile(join(folder, fileName), buffer)
  return `/api/agent-images/${fileName}`
}
