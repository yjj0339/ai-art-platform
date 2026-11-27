import JSZip from 'jszip'

const FALLBACK_THEME = {
  bg: 'F7FBFA',
  surface: 'FFFFFF',
  primary: '1F9D8A',
  secondary: '2563EB',
  accent: 'D9F99D',
  title: '12343B',
  text: '334155',
  muted: '64748B',
  soft: 'ECFDF5',
}

const SUPPORTED_IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const DECOR_PLACEMENTS = ['top-right', 'bottom-left', 'bottom-right', 'top-left']
const DEFAULT_SLIDE_SIZE = { cx: 12192000, cy: 6858000 }
const SLIDE_INCHES = { w: 13.333, h: 7.5 }

function normalizeHex(value) {
  const hex = String(value || '').replace('#', '').trim().toUpperCase()
  return /^[0-9A-F]{6}$/.test(hex) ? hex : ''
}

function hexToRgb(hex) {
  const value = normalizeHex(hex)
  if (!value) return { r: 255, g: 255, b: 255 }
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  return [r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function saturation(hex) {
  const { r, g, b } = hexToRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function mix(hex, targetHex, amount) {
  const a = hexToRgb(hex)
  const b = hexToRgb(targetHex)
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  })
}

function colorDistance(a, b) {
  const first = hexToRgb(a)
  const second = hexToRgb(b)
  return Math.abs(first.r - second.r) + Math.abs(first.g - second.g) + Math.abs(first.b - second.b)
}

function collectHexColors(xml = '') {
  const colors = []
  for (const match of xml.matchAll(/<(?:a:)?srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/g)) {
    const hex = normalizeHex(match[1])
    if (hex) colors.push(hex)
  }
  for (const match of xml.matchAll(/<(?:a:)?sysClr\b[^>]*\blastClr="([0-9A-Fa-f]{6})"/g)) {
    const hex = normalizeHex(match[1])
    if (hex) colors.push(hex)
  }
  return colors
}

function countColors(colors) {
  const counts = new Map()
  colors.forEach((color) => counts.set(color, (counts.get(color) || 0) + 1))
  return [...counts.entries()].map(([hex, count]) => ({ hex, count }))
}

function pickPrimary(colors) {
  const ranked = countColors(colors)
    .filter(({ hex }) => saturation(hex) > 0.12 && luminance(hex) > 0.08 && luminance(hex) < 0.92)
    .sort((a, b) => (saturation(b.hex) * 3 + b.count) - (saturation(a.hex) * 3 + a.count))
  return ranked[0]?.hex || FALLBACK_THEME.primary
}

function pickSecondary(colors, primary) {
  const ranked = countColors(colors)
    .filter(({ hex }) => hex !== primary && colorDistance(hex, primary) > 80 && luminance(hex) > 0.08 && luminance(hex) < 0.92)
    .sort((a, b) => (saturation(b.hex) * 2 + b.count) - (saturation(a.hex) * 2 + a.count))
  return ranked[0]?.hex || mix(primary, '2563EB', 0.45)
}

function pickBackground(colors, primary) {
  const ranked = countColors(colors)
    .filter(({ hex }) => luminance(hex) > 0.84 || luminance(hex) < 0.18)
    .sort((a, b) => b.count - a.count)
  return ranked[0]?.hex || mix(primary, 'FFFFFF', 0.92)
}

function extractFonts(xml = '') {
  const fonts = []
  for (const match of xml.matchAll(/\btypeface="([^"]+)"/g)) {
    const value = String(match[1] || '').trim()
    if (value && value !== '+mj-lt' && value !== '+mn-lt' && value !== '+mj-ea' && value !== '+mn-ea') fonts.push(value)
  }
  return [...new Set(fonts)]
}

async function readText(zip, path) {
  const file = zip.file(path)
  return file ? file.async('string') : ''
}

async function readManyText(zip, pattern) {
  const files = Object.keys(zip.files)
    .filter((path) => pattern.test(path) && !zip.files[path].dir)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const entries = await Promise.all(files.map(async (path) => ({ path, xml: await readText(zip, path) })))
  return entries
}

function mediaMime(path = '') {
  const ext = path.split('.').pop()?.toLowerCase()
  return SUPPORTED_IMAGE_TYPES[ext] || ''
}

function isSupportedMedia(path = '') {
  return path.startsWith('ppt/media/') && Boolean(mediaMime(path))
}

function normalizeTargetPath(basePath, target = '') {
  if (!target || target.startsWith('http')) return ''
  const baseParts = basePath.split('/').slice(0, -1)
  const parts = `${baseParts.join('/')}/${target}`.split('/')
  const resolved = []
  parts.forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') resolved.pop()
    else resolved.push(part)
  })
  return resolved.join('/')
}

function xmlAttr(node = '', name = '') {
  return node.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1] || ''
}

function parseRelationships(xml = '', relsPath = '') {
  const map = new Map()
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = xmlAttr(match[0], 'Id')
    const target = normalizeTargetPath(relsPath, xmlAttr(match[0], 'Target'))
    if (id && isSupportedMedia(target)) map.set(id, target)
  }
  return map
}

function imageRefIds(xml = '') {
  return [...xml.matchAll(/<(?:a:)?blip\b[^>]*(?:r:embed|embed)="([^"]+)"/g)].map((match) => match[1])
}

function parseSlideSize(xml = '') {
  const node = xml.match(/<(?:p:)?sldSz\b[^>]*>/)?.[0] || ''
  const cx = Number(xmlAttr(node, 'cx'))
  const cy = Number(xmlAttr(node, 'cy'))
  return cx > 0 && cy > 0 ? { cx, cy } : DEFAULT_SLIDE_SIZE
}

function nodeBlocks(xml = '', tag = '') {
  const escaped = tag.replace(':', ':?')
  return [...xml.matchAll(new RegExp(`<${escaped}\\b[\\s\\S]*?<\\/${escaped}>`, 'g'))].map((match) => match[0])
}

function parseBounds(node = '', slideSize = DEFAULT_SLIDE_SIZE) {
  const xfrm = node.match(/<(?:a:)?xfrm\b[\s\S]*?<\/(?:a:)?xfrm>/)?.[0] || ''
  const off = xfrm.match(/<(?:a:)?off\b[^>]*\/?>/)?.[0] || ''
  const ext = xfrm.match(/<(?:a:)?ext\b[^>]*\/?>/)?.[0] || ''
  const x = Number(xmlAttr(off, 'x'))
  const y = Number(xmlAttr(off, 'y'))
  const cx = Number(xmlAttr(ext, 'cx'))
  const cy = Number(xmlAttr(ext, 'cy'))
  if (![x, y, cx, cy].every(Number.isFinite) || cx <= 0 || cy <= 0) return null
  return {
    x: Math.max(0, Math.min(1, x / slideSize.cx)),
    y: Math.max(0, Math.min(1, y / slideSize.cy)),
    w: Math.max(0.02, Math.min(1, cx / slideSize.cx)),
    h: Math.max(0.02, Math.min(1, cy / slideSize.cy)),
  }
}

function slotArea(slot = {}) {
  return Number(slot.w || 0) * Number(slot.h || 0)
}

function slotToPptBox(slot = {}) {
  return {
    x: Number(slot.x || 0) * SLIDE_INCHES.w,
    y: Number(slot.y || 0) * SLIDE_INCHES.h,
    w: Number(slot.w || 0.1) * SLIDE_INCHES.w,
    h: Number(slot.h || 0.1) * SLIDE_INCHES.h,
  }
}

function textRunSizes(node = '') {
  return [...node.matchAll(/\bsz="(\d+)"/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function placeholderType(node = '') {
  const ph = node.match(/<(?:p:)?ph\b[^>]*\/?>/)?.[0] || ''
  return xmlAttr(ph, 'type') || ''
}

function inferTextSlotType(node = '', bounds = null, index = 0) {
  const phType = placeholderType(node)
  const sizes = textRunSizes(node)
  const maxSize = Math.max(0, ...sizes)
  if (['title', 'ctrTitle'].includes(phType) || maxSize >= 3000 || (bounds?.y || 0) < 0.18) return index === 0 ? 'title' : 'subtitle'
  if (['subTitle'].includes(phType)) return 'subtitle'
  if ((bounds?.y || 0) > 0.82 || ['dt', 'ftr', 'sldNum'].includes(phType)) return 'footer'
  return 'body'
}

function extractTemplateSlots(xml = '', slideSize = DEFAULT_SLIDE_SIZE) {
  const textSlots = nodeBlocks(xml, 'p:sp')
    .map((block, index) => {
      const bounds = parseBounds(block, slideSize)
      const text = slideText(block)
      const phType = placeholderType(block)
      if (!bounds) return null
      if (!text && !['pic', 'obj', 'body'].includes(phType)) return null
      if (!text && ['pic', 'obj'].includes(phType)) {
        return { id: `slot-shape-${index + 1}`, type: 'image', x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, source: 'placeholder' }
      }
      return {
        id: `slot-text-${index + 1}`,
        type: inferTextSlotType(block, bounds, index),
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        source: 'text',
        sampleText: text.slice(0, 80),
      }
    })
    .filter(Boolean)

  const imageSlots = nodeBlocks(xml, 'p:pic')
    .map((block, index) => {
      const bounds = parseBounds(block, slideSize)
      const refId = imageRefIds(block)[0] || ''
      if (!bounds) return null
      const area = slotArea(bounds)
      const isBackground = bounds.x < 0.04 && bounds.y < 0.04 && bounds.w > 0.84 && bounds.h > 0.84
      if (isBackground || area > 0.62 || area < 0.08) return null
      return { id: `slot-image-${index + 1}`, type: 'image', x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, source: 'picture', refId }
    })
    .filter(Boolean)

  const slots = [...textSlots, ...imageSlots]
    .filter((slot) => slotArea(slot) > 0.006)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .slice(0, 10)

  if (!slots.some((slot) => slot.type === 'title')) {
    const firstText = slots.find((slot) => ['body', 'subtitle'].includes(slot.type))
    if (firstText) firstText.type = 'title'
  }
  return slots.map((slot, index) => ({ ...slot, id: slot.id || `slot-${index + 1}` }))
}

function pictureInstances(xml = '', slideSize = DEFAULT_SLIDE_SIZE) {
  return nodeBlocks(xml, 'p:pic')
    .map((block, index) => ({
      refId: imageRefIds(block)[0] || '',
      bounds: parseBounds(block, slideSize),
      index,
    }))
    .filter((item) => item.refId && item.bounds)
}

function backgroundRefIds(xml = '') {
  const refs = []
  for (const match of xml.matchAll(/<p:bg[\s\S]*?<\/p:bg>/g)) refs.push(...imageRefIds(match[0]))
  return refs
}

function slideText(xml = '') {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map((match) => match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim())
    .filter(Boolean)
    .join(' ')
}

function inferTemplatePage(index, total, xml = '') {
  const text = slideText(xml)
  const imageRefs = imageRefIds(xml)
  const textCount = (xml.match(/<a:t>/g) || []).length
  const shapeCount = (xml.match(/<p:sp\b/g) || []).length
  const lowered = text.toLowerCase()
  if (index === 0) return { role: 'cover', layout: 'cover-hero', title: '封面模板' }
  if (index === total - 1) return { role: 'backCover', layout: 'back-cover', title: '封底模板' }
  if (/点评|评价|建议|review/.test(text)) return { role: 'aiReview', layout: 'review-card', title: '点评模板' }
  if (/老师|教师|评语|comment/.test(text)) return { role: 'teacher', layout: 'comment', title: '讲师评语模板' }
  if (/过程|步骤|时间|迭代|timeline|process/.test(text) || shapeCount > 10) return { role: 'iteration', layout: 'timeline', title: '过程模板' }
  if (/作品|展示|成果|成品|portfolio|work/.test(text) || imageRefs.length >= 2) return { role: 'finalDesign', layout: 'image-text', title: '作品展示模板' }
  if (/课程|目标|理解|brief|course/.test(text) || lowered.includes('lesson')) return { role: 'understanding', layout: 'text-focus', title: '课程理解模板' }
  return { role: 'content', layout: imageRefs.length ? 'image-text' : 'text-focus', title: `内容模板 ${index + 1}` }
}

async function readImageAsset(zip, path) {
  const mime = mediaMime(path)
  if (!mime) return null
  const base64 = await zip.file(path)?.async('base64')
  if (!base64) return null
  const src = `data:${mime};base64,${base64}`
  return {
    name: path.split('/').pop(),
    path,
    src: await compactImageDataUrl(src),
  }
}

function compactImageDataUrl(src) {
  if (src.length < 900000 || typeof Image === 'undefined' || typeof document === 'undefined') return src
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 1280 / image.naturalWidth, 720 / image.naturalHeight)
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    image.onerror = () => resolve(src)
    image.src = src
  })
}

async function extractImageAssets(zip, entries) {
  const relMaps = new Map()
  await Promise.all(entries.map(async (entry) => {
    const relsPath = entry.path.replace(/([^/]+)$/, '_rels/$1.rels')
    relMaps.set(entry.path, parseRelationships(await readText(zip, relsPath), entry.path))
  }))

  const rankedPaths = []
  const backgroundPaths = []
  entries.forEach((entry) => {
    const rels = relMaps.get(entry.path) || new Map()
    backgroundRefIds(entry.xml).forEach((id) => {
      const path = rels.get(id)
      if (path) backgroundPaths.push(path)
    })
    imageRefIds(entry.xml).forEach((id) => {
      const path = rels.get(id)
      if (path) rankedPaths.push(path)
    })
  })

  Object.keys(zip.files)
    .filter((path) => isSupportedMedia(path) && !zip.files[path].dir)
    .forEach((path) => rankedPaths.push(path))

  const uniquePaths = [...new Set(rankedPaths)]
  const backgroundPath = [...new Set(backgroundPaths)].find(Boolean) || uniquePaths[0] || ''
  const decorPaths = uniquePaths.filter((path) => path !== backgroundPath).slice(0, 4)
  const [backgroundAsset, ...decorAssets] = await Promise.all([
    backgroundPath ? readImageAsset(zip, backgroundPath) : null,
    ...decorPaths.map((path) => readImageAsset(zip, path)),
  ])

  return {
    backgroundImage: backgroundAsset?.src || '',
    backgroundImageName: backgroundAsset?.name || '',
    decorImages: decorAssets
      .filter(Boolean)
      .map((asset, index) => ({
        id: `decor-${index + 1}`,
        name: asset.name,
        src: asset.src,
        placement: DECOR_PLACEMENTS[index] || 'bottom-right',
      })),
    mediaCount: uniquePaths.length,
  }
}

async function extractEntryImageAssets(zip, entry, slideSize = DEFAULT_SLIDE_SIZE) {
  const relsPath = entry.path.replace(/([^/]+)$/, '_rels/$1.rels')
  const rels = parseRelationships(await readText(zip, relsPath), entry.path)
  const backgroundPaths = []
  backgroundRefIds(entry.xml).forEach((id) => {
    const path = rels.get(id)
    if (path) backgroundPaths.push(path)
  })
  const pictures = pictureInstances(entry.xml, slideSize)
  const rankedPictures = pictures
    .map((pic) => ({ ...pic, path: rels.get(pic.refId), area: slotArea(pic.bounds) }))
    .filter((pic) => pic.path)
    .sort((a, b) => b.area - a.area)
  const fullBleedPicture = rankedPictures.find((pic) => (
    pic.bounds.x < 0.04
    && pic.bounds.y < 0.04
    && pic.bounds.w > 0.84
    && pic.bounds.h > 0.84
  ))
  const contentPicturePaths = new Set(rankedPictures
    .filter((pic) => pic.area >= 0.08 && pic.area <= 0.62 && pic !== fullBleedPicture)
    .map((pic) => pic.path))
  const rankedPaths = rankedPictures.map((pic) => pic.path)
  const uniquePaths = [...new Set(rankedPaths)]
  const backgroundPath = [...new Set(backgroundPaths)].find(Boolean) || fullBleedPicture?.path || ''
  const decorPaths = uniquePaths
    .filter((path) => path !== backgroundPath && !contentPicturePaths.has(path))
    .slice(0, 4)
  const [backgroundAsset, ...decorAssets] = await Promise.all([
    backgroundPath ? readImageAsset(zip, backgroundPath) : null,
    ...decorPaths.map((path) => readImageAsset(zip, path)),
  ])
  return {
    backgroundImage: backgroundAsset?.src || '',
    backgroundImageName: backgroundAsset?.name || '',
    decorImages: decorAssets
      .filter(Boolean)
      .map((asset, index) => ({
        id: `slide-${entry.index + 1}-decor-${index + 1}`,
        name: asset.name,
        src: asset.src,
        placement: DECOR_PLACEMENTS[index] || 'bottom-right',
      })),
    mediaCount: uniquePaths.length,
  }
}

async function buildTemplatePages(zip, slideEntries, slideSize = DEFAULT_SLIDE_SIZE) {
  const total = slideEntries.length
  const pages = await Promise.all(slideEntries.slice(0, 12).map(async (entry, index) => {
    const assets = await extractEntryImageAssets(zip, { ...entry, index }, slideSize)
    const inferred = inferTemplatePage(index, total, entry.xml)
    const textRunCount = (entry.xml.match(/<a:t>/g) || []).length
    const imageCount = imageRefIds(entry.xml).length
    const slots = extractTemplateSlots(entry.xml, slideSize)
    return {
      id: `template-page-${index + 1}`,
      sourceIndex: index + 1,
      title: inferred.title,
      role: inferred.role,
      layout: inferred.layout,
      backgroundImage: assets.backgroundImage,
      decorImages: assets.decorImages,
      slotProfile: imageCount >= 2 ? 'gallery' : imageCount === 1 ? 'image-text' : 'text',
      slots,
      textRunCount,
      imageCount,
      shapeCount: (entry.xml.match(/<p:sp\b/g) || []).length,
    }
  }))
  return pages
}

async function firstPreviewImage(zip, imageAssets) {
  if (imageAssets?.backgroundImage) {
    return {
      name: imageAssets.backgroundImageName,
      dataUrl: imageAssets.backgroundImage,
    }
  }
  const path = Object.keys(zip.files).find((name) => {
    const ext = name.split('.').pop()?.toLowerCase()
    return name.startsWith('ppt/media/') && SUPPORTED_IMAGE_TYPES[ext] && !zip.files[name].dir
  })
  if (!path) return null
  const ext = path.split('.').pop().toLowerCase()
  const base64 = await zip.file(path).async('base64')
  return {
    name: path.split('/').pop(),
    dataUrl: `data:${SUPPORTED_IMAGE_TYPES[ext]};base64,${base64}`,
  }
}

function inferRendererPreset({ primary, slideXml, slideCount, imageCount, shapeCount, textRunCount }) {
  const colorText = primary.toUpperCase()
  if (imageCount >= Math.max(2, slideCount) || imageCount > textRunCount / 3) return 'portfolio'
  if (shapeCount > 18 || ['4F46E5', '0EA5E9', '0891B2', '2563EB'].some((hex) => colorDistance(colorText, hex) < 90)) return 'brand'
  if (slideXml.includes('timeline') || slideCount >= 8 || ['EA580C', 'F97316', '7C3AED'].some((hex) => colorDistance(colorText, hex) < 90)) return 'growth'
  return 'classroom'
}

function buildTheme(colors) {
  const primary = pickPrimary(colors)
  const secondary = pickSecondary(colors, primary)
  const bg = pickBackground(colors, primary)
  const bgIsDark = luminance(bg) < 0.32
  const surface = bgIsDark ? mix(bg, 'FFFFFF', 0.08) : 'FFFFFF'
  const accent = bgIsDark ? mix(primary, 'FFFFFF', 0.25) : mix(primary, 'FFFFFF', 0.68)
  const soft = bgIsDark ? mix(bg, primary, 0.22) : mix(primary, 'FFFFFF', 0.88)
  return {
    bg,
    surface,
    primary,
    secondary,
    accent,
    title: bgIsDark ? 'F8FAFC' : mix(primary, '000000', 0.68),
    text: bgIsDark ? 'DDE7F0' : '334155',
    muted: bgIsDark ? 'AEBECD' : '64748B',
    soft,
  }
}

export async function parsePptxTemplate(file) {
  if (!file?.name?.toLowerCase().endsWith('.pptx')) {
    throw new Error('只能解析 PPTX 模板文件')
  }

  const zip = await JSZip.loadAsync(file)
  const themeXml = await readText(zip, 'ppt/theme/theme1.xml')
  const presentationXml = await readText(zip, 'ppt/presentation.xml')
  const slideSize = parseSlideSize(presentationXml)
  const slideEntries = await readManyText(zip, /^ppt\/slides\/slide\d+\.xml$/)
  const layoutEntries = await readManyText(zip, /^ppt\/slideLayouts\/slideLayout\d+\.xml$/)
  const masterEntries = await readManyText(zip, /^ppt\/slideMasters\/slideMaster\d+\.xml$/)
  const firstSlideXml = slideEntries[0]?.xml || ''
  const allXml = [themeXml, presentationXml, ...slideEntries.map((item) => item.xml), ...layoutEntries.map((item) => item.xml), ...masterEntries.map((item) => item.xml)].join('\n')

  const mediaCount = Object.keys(zip.files).filter((path) => path.startsWith('ppt/media/') && !zip.files[path].dir).length
  const imageCount = (allXml.match(/<p:pic\b/g) || []).length || mediaCount
  const shapeCount = (allXml.match(/<p:sp\b/g) || []).length
  const textRunCount = (allXml.match(/<a:t>/g) || []).length
  const imageAssets = await extractImageAssets(zip, [...slideEntries.slice(0, 2), ...layoutEntries.slice(0, 2), ...masterEntries.slice(0, 2)])
  const templatePages = await buildTemplatePages(zip, slideEntries, slideSize)
  const firstTemplateAssetPage = templatePages.find((page) => page.backgroundImage)
  const colors = collectHexColors(allXml)
  if (!colors.length && !imageAssets.backgroundImage && !templatePages.some((page) => page.slots?.length)) throw new Error('没有从 PPTX 中识别到可用颜色、背景图或版式槽位')
  const paletteSource = colors.length ? colors : Object.values(FALLBACK_THEME)
  const theme = buildTheme(colors)
  const fonts = extractFonts(themeXml || allXml)
  const preview = await firstPreviewImage(zip, firstTemplateAssetPage || imageAssets)
  const rendererPreset = inferRendererPreset({
    primary: theme.primary,
    slideXml: allXml,
    slideCount: slideEntries.length,
    imageCount,
    shapeCount,
    textRunCount,
  })

  return {
    theme,
    rendererPreset,
    category: rendererPreset,
    fontFamily: fonts[0] || 'Microsoft YaHei',
    previewImage: preview?.dataUrl || '',
    backgroundImage: firstTemplateAssetPage?.backgroundImage || imageAssets.backgroundImage,
    decorImages: firstTemplateAssetPage?.decorImages?.length ? firstTemplateAssetPage.decorImages : imageAssets.decorImages,
    templatePages,
    assetMode: 'structured-assets',
    parseStatus: 'parsed',
    parseMessage: imageAssets.backgroundImage
      ? `已从 ${file.name} 解析颜色、字体、版式和背景图`
      : `已从 ${file.name} 解析颜色、字体和版式特征，未提取到背景图`,
    sourceUpdatedAt: new Date().toISOString(),
    importMeta: {
      parser: 'pptx-structure-v1',
      sourceName: file.name,
      sourceSize: file.size,
      slideCount: slideEntries.length,
      imageCount,
      shapeCount,
      textRunCount,
      assetMode: 'structured-assets',
      backgroundImageName: imageAssets.backgroundImageName,
      decorImageCount: imageAssets.decorImages.length,
      templatePageCount: templatePages.length,
      templateSlotCount: templatePages.reduce((sum, page) => sum + (page.slots?.length || 0), 0),
      slideSize,
      mediaCount: imageAssets.mediaCount,
      palette: countColors(paletteSource).sort((a, b) => b.count - a.count).slice(0, 8).map((item) => item.hex),
      fonts,
      previewImageName: preview?.name || '',
      parsedAt: new Date().toISOString(),
    },
  }
}
