/*
 * 把 AI 伙伴拼好的版面（详情页 / 分镜）画成一张竖长图，方便保存和分享。
 * 只用站内图片（/api/agent-images/…、/api/assets/…），同源加载，画布不会被「污染」，可以正常导出。
 */

const BASE_WIDTH = 750
const PADDING = 48
// iPad / iPhone Safari 单张画布最多约 1670 万像素，留一点余量。
const MAX_PIXELS = 16_000_000

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** 按像素宽度把一段文字折成多行（中文逐字折行，英文单词尽量不拆）。 */
function wrapLines(ctx, text, maxWidth) {
  const lines = []
  for (const paragraph of String(text || '').split(/\n+/)) {
    const tokens = paragraph.match(/[A-Za-z0-9'’.,!?:;%-]+|\s+|./gu) || []
    let line = ''
    for (const token of tokens) {
      const next = line + token
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next
        continue
      }
      lines.push(line.trimEnd())
      line = token.trimStart()
      // 极长的英文串：逐字硬折
      while (ctx.measureText(line).width > maxWidth && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut -= 1
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    if (line.trim()) lines.push(line.trimEnd())
  }
  return lines
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

const FONT = "system-ui, -apple-system, 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', sans-serif"

/**
 * layout: { kind, title, subtitle, color, sections: [{ heading, text, image }] }
 * 返回 PNG Blob。
 */
export async function renderLayoutLongImage(layout) {
  const color = /^#[0-9a-fA-F]{6}$/.test(layout?.color || '') ? layout.color : '#6c5ce7'
  const sections = Array.isArray(layout?.sections) ? layout.sections : []
  const images = await Promise.all(sections.map((section) => loadImage(section.image)))
  const contentWidth = BASE_WIDTH - PADDING * 2

  const measure = document.createElement('canvas').getContext('2d')
  const titleFont = `700 44px ${FONT}`
  const subtitleFont = `400 26px ${FONT}`
  const headingFont = `700 34px ${FONT}`
  const textFont = `400 27px ${FONT}`

  measure.font = titleFont
  const titleLines = wrapLines(measure, layout?.title || '我的作品', contentWidth)
  measure.font = subtitleFont
  const subtitleLines = wrapLines(measure, layout?.subtitle || '', contentWidth)
  const headerHeight = PADDING + titleLines.length * 60 + (subtitleLines.length ? 16 + subtitleLines.length * 40 : 0) + PADDING

  const blocks = sections.map((section, index) => {
    const image = images[index]
    const imageHeight = image ? Math.min(Math.round(contentWidth * (image.naturalHeight / image.naturalWidth)), contentWidth * 1.6) : 0
    measure.font = headingFont
    const headingLines = section.heading ? wrapLines(measure, section.heading, contentWidth) : []
    measure.font = textFont
    const textLines = section.text ? wrapLines(measure, section.text, contentWidth) : []
    const height = (imageHeight ? imageHeight + 28 : 0)
      + headingLines.length * 48 + (headingLines.length && textLines.length ? 10 : 0)
      + textLines.length * 46
    return { image, imageHeight, headingLines, textLines, height }
  })
  const footerHeight = 96
  const totalHeight = headerHeight + PADDING + blocks.reduce((sum, block) => sum + block.height + 56, 0) + footerHeight
  const scale = Math.max(0.5, Math.min(2, Math.sqrt(MAX_PIXELS / (BASE_WIDTH * totalHeight))))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(BASE_WIDTH * scale)
  canvas.height = Math.round(totalHeight * scale)
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.textBaseline = 'top'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, BASE_WIDTH, totalHeight)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, BASE_WIDTH, headerHeight)

  let y = PADDING
  ctx.fillStyle = '#ffffff'
  ctx.font = titleFont
  for (const line of titleLines) { ctx.fillText(line, PADDING, y); y += 60 }
  if (subtitleLines.length) {
    y += 16
    ctx.globalAlpha = 0.88
    ctx.font = subtitleFont
    for (const line of subtitleLines) { ctx.fillText(line, PADDING, y); y += 40 }
    ctx.globalAlpha = 1
  }

  y = headerHeight + PADDING
  for (const block of blocks) {
    if (block.image) {
      ctx.save()
      roundedRect(ctx, PADDING, y, contentWidth, block.imageHeight, 24)
      ctx.clip()
      // 图片按宽铺满，过高的部分居中裁掉
      const drawHeight = contentWidth * (block.image.naturalHeight / block.image.naturalWidth)
      ctx.drawImage(block.image, PADDING, y - (drawHeight - block.imageHeight) / 2, contentWidth, drawHeight)
      ctx.restore()
      y += block.imageHeight + 28
    }
    ctx.fillStyle = '#1f2340'
    ctx.font = headingFont
    for (const line of block.headingLines) { ctx.fillText(line, PADDING, y); y += 48 }
    if (block.headingLines.length && block.textLines.length) y += 10
    ctx.fillStyle = '#50567a'
    ctx.font = textFont
    for (const line of block.textLines) { ctx.fillText(line, PADDING, y); y += 46 }
    y += 56
  }

  ctx.fillStyle = '#9a9fbf'
  ctx.font = `400 22px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('和 AI 伙伴一起创作', BASE_WIDTH / 2, totalHeight - footerHeight + 30)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('长图生成失败，请再试一次。'))), 'image/png')
  })
}

/** 触发浏览器下载（iPad 上会打开预览，长按即可存到相册）。 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
