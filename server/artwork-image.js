import sharp from 'sharp'
import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { applyArtworkAdjustments } from '../src/utils/artworkAdjust.js'

export const MAX_EDIT_BYTES = 25 * 1024 * 1024
export const MAX_EDIT_PIXELS = 16 * 1024 * 1024
export function editError(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }) }

export function decodeImageData(value) {
  const match = String(value || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/)
  if (!match) throw editError('请使用有效的 PNG、JPEG 或 WebP 图片。')
  const body = Buffer.from(match[2], 'base64')
  if (!body.length || body.length > MAX_EDIT_BYTES) throw editError('图片超过 25MB 限制。', 413)
  return body
}

export function publicAddress(address) {
  if (isIP(address) === 6) {
    // 拒绝本地、映射 IPv4、组播和特殊 IPv6；只允许全球单播。
    return /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:(db8|0):/i.test(address)
  }
  const [a, b] = address.split('.').map(Number)
  return isIP(address) === 4 && a > 0 && a !== 10 && a !== 127 && a !== 169 && a < 224
    && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0))
    && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19))
}

// 将 DNS 验证结果固定到实际连接，拒绝私网、重定向和凭据，避免图片代理变成 SSRF。
export async function readRemoteArtwork(source, signal) {
  let url
  try { url = new URL(source) } catch { throw editError('作品图片地址无效。') }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw editError('远程图片必须使用公开 HTTPS 地址。')
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true })
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw editError('不能读取私网或本机图片地址。')
  const address = addresses[0]
  return await new Promise((resolve, reject) => {
    const request = https.get(url, { signal, lookup: (_hostname, options, callback) => options.all
      ? callback(null, [address]) : callback(null, address.address, address.family) }, (response) => {
      if (response.statusCode !== 200 || !/^image\/(png|jpeg|webp)(;|$)/i.test(response.headers['content-type'] || '')) {
        response.resume(); reject(editError('远程图片不可用，请重新导入原图。', 502)); return
      }
      let bytes = 0; const chunks = []
      response.on('data', (chunk) => { bytes += chunk.length; if (bytes > MAX_EDIT_BYTES) response.destroy(editError('图片超过 25MB 限制。', 413)); else chunks.push(chunk) })
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.setTimeout(15000, () => request.destroy(editError('读取图片超时，请稍后重试。', 504)))
    request.on('error', reject)
  })
}

export async function normalizeArtwork(buffer) {
  try {
    const metadata = await sharp(buffer, { limitInputPixels: MAX_EDIT_PIXELS, animated: false }).metadata()
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || metadata.pages > 1) throw editError('仅支持静态 PNG、JPEG 和 WebP 图片。')
    return await sharp(buffer, { limitInputPixels: MAX_EDIT_PIXELS }).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  } catch (error) {
    if (error.statusCode) throw error
    throw editError('图片损坏或像素超过 1600 万，请换一张较小的图片。')
  }
}

export async function encodeArtwork(data, width, height) {
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

export async function adjustArtwork(original, adjustments) {
  const data = Buffer.from(original.data)
  applyArtworkAdjustments(data, adjustments)
  return encodeArtwork(data, original.info.width, original.info.height)
}

export async function prepareArtworkMask(original, maskData) {
  const mask = await normalizeArtwork(decodeImageData(maskData))
  const { width, height } = original.info
  if (mask.info.width !== width || mask.info.height !== height) throw editError('选区尺寸与原图不一致，请重新选择区域。')
  const weights = Buffer.alloc(width * height)
  let selected = 0
  for (let i = 0; i < weights.length; i++) {
    weights[i] = Math.round(mask.data[i * 4] * mask.data[i * 4 + 3] / 255)
    if (weights[i]) selected++
  }
  if (!selected) throw editError('请先涂抹要修改的区域。')
  if (selected === weights.length) throw editError('选区覆盖整张图片，请保留一些不修改的区域。')
  return weights
}

export async function prepareModelArtwork(original, weights, size = '1024x1024') {
  const [width, height] = size.split('x').map(Number)
  const scale = Math.min(width / original.info.width, height / original.info.height)
  const contentWidth = Math.max(1, Math.round(original.info.width * scale))
  const contentHeight = Math.max(1, Math.round(original.info.height * scale))
  const left = Math.floor((width - contentWidth) / 2), top = Math.floor((height - contentHeight) / 2)
  const image = await sharp(original.data, { raw: original.info }).resize(contentWidth, contentHeight)
    .extend({ left, top, right: width - contentWidth - left, bottom: height - contentHeight - top, background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer()
  const alpha = Buffer.alloc(weights.length * 4, 255)
  for (let i = 0; i < weights.length; i++) alpha[i * 4 + 3] = 255 - weights[i]
  const mask = await sharp(alpha, { raw: { width: original.info.width, height: original.info.height, channels: 4 } })
    .resize(contentWidth, contentHeight, { kernel: 'nearest' })
    .extend({ left, top, right: width - contentWidth - left, bottom: height - contentHeight - top, background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer()
  return { image, mask, width, height, contentWidth, contentHeight, left, top }
}

export async function mergeArtworkEdit(original, generated, weights, geometry) {
  // 只在选区内柔化边缘；选区外始终逐字节复制原始 RGBA。
  const decoded = await normalizeArtwork(generated)
  const modelCanvas = await sharp(decoded.data, { raw: decoded.info }).resize(geometry.width, geometry.height, { fit: 'fill' }).png().toBuffer()
  const edited = await sharp(modelCanvas)
    .extract({ left: geometry.left, top: geometry.top, width: geometry.contentWidth, height: geometry.contentHeight })
    .resize(original.info.width, original.info.height, { fit: 'fill' }).raw().toBuffer()
  const blurred = await sharp(weights, { raw: { width: original.info.width, height: original.info.height, channels: 1 } }).blur(1.2).greyscale().raw().toBuffer()
  const result = Buffer.from(original.data)
  for (let i = 0; i < weights.length; i++) {
    if (!weights[i]) continue
    const weight = Math.min(weights[i], blurred[i]) / 255
    for (let c = 0; c < 4; c++) result[i * 4 + c] = Math.round(original.data[i * 4 + c] * (1 - weight) + edited[i * 4 + c] * weight)
  }
  return encodeArtwork(result, original.info.width, original.info.height)
}
