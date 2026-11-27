/**
 * 画板绘制引擎（Canvas 2D，无第三方依赖）
 *
 * 设计要点：
 * 1. 每个图层是一张独立的离屏 canvas，文档坐标系固定（默认 1200×1500），
 *    显示时的缩放/平移只影响「合成」这一步，不影响笔迹数据。
 * 2. 一笔画在 strokeCanvas 上做「整笔统一透明度」合成，避免半透明笔刷
 *    在路径自相交处叠色变深；抬笔才落到图层上。
 * 3. 历史用「命令栈」而不是位图快照：一笔存一条点位记录，撤销时重放该层。
 *    历史上限 maxOps 条，超出的最早记录会被「烘焙」进该层的 baseCanvas，
 *    而不是直接丢掉 —— 否则一旦丢掉的是一条「填充」，重放时它面对的是一张
 *    空图层，会把整层刷成纯色（撤销一次整张纸就废了）。
 * 4. 颗粒笔刷的随机点用固定种子，保证撤销重放后画面完全一致。
 * 5. 点位存 {x, y, p, r}：r 是当时算出的笔尖半径。存下来才能保证「以后再调
 *    笔刷参数，老笔画不会跟着变形」，也才能让 speedThin 这类依赖采样率的
 *    效果在重放时一模一样。
 */

const TAU = Math.PI * 2

/** 混合模式（与 Canvas globalCompositeOperation 对应） */
export const BLEND_LIST = [
  { id: 'normal', name: '正常' },
  { id: 'multiply', name: '正片叠底' },
  { id: 'screen', name: '滤色' },
  { id: 'overlay', name: '叠加' },
  { id: 'darken', name: '变暗' },
  { id: 'lighten', name: '变亮' },
]

const BLEND_MODES = BLEND_LIST.reduce((acc, item) => {
  acc[item.id] = item.id === 'normal' ? 'source-over' : item.id
  return acc
}, {})

/** 调色板（效果图里的 7 个色块） */
export const PALETTE = ['#2b3440', '#ff7a00', '#36bffa', '#34d399', '#f472b6', '#ffe08a', '#ffffff']

/**
 * 笔刷定义。size 为默认直径（文档像素），spacing 为印章间距系数（×直径）。
 *
 * 让 11 种笔刷「真的不一样」靠的是结构差异，不是只调 opacity：
 * - shape/aspect：方头笔（马克笔、油画棒、粉笔）
 * - jitter：每一枚印章随机偏移（彩铅、粉笔、海绵的毛糙感）
 * - speedThin：画得越快越细（毛笔）
 * - speckle：颗粒撒得更散（粉笔）
 * - holes：印章里挖掉小洞（海绵的多孔感）
 */
export const BRUSH_LIST = [
  { id: 'pencil', name: '铅笔', note: '细线 · 起形', size: 7, spacing: 0.1, opacity: 0.8, softness: 0.05, grain: 0.3, jitter: 0.1, pressure: 1 },
  { id: 'colorpencil', name: '彩铅', note: '毛边 · 上色', size: 11, spacing: 0.1, opacity: 0.82, softness: 0.1, grain: 0.6, jitter: 0.18, pressure: 0.9 },
  { id: 'marker', name: '马克笔', note: '方头 · 平涂', size: 26, spacing: 0.06, opacity: 0.72, softness: 0.02, grain: 0, shape: 'square', aspect: 0.48, pressure: 0.12 },
  { id: 'watercolor', name: '水彩笔', note: '软边 · 淡彩', size: 34, spacing: 0.1, opacity: 0.3, softness: 0.9, grain: 0.15, pressure: 0.45 },
  { id: 'crayon', name: '蜡笔', note: '粗颗粒 · 摩擦感', size: 18, spacing: 0.22, opacity: 0.82, softness: 0.14, grain: 0.8, jitter: 0.12, pressure: 0.6 },
  { id: 'oilpastel', name: '油画棒', note: '厚涂 · 油亮', size: 30, spacing: 0.1, opacity: 0.95, softness: 0.4, grain: 0.5, shape: 'square', aspect: 0.75, jitter: 0.1, pressure: 0.7 },
  { id: 'airbrush', name: '喷枪', note: '极软 · 雾状', size: 56, spacing: 0.16, opacity: 0.14, softness: 1, grain: 0.05, pressure: 0.3 },
  { id: 'ink', name: '勾线笔', note: '硬边 · 描线', size: 5, spacing: 0.05, opacity: 1, softness: 0.02, grain: 0, speedThin: 0.15, pressure: 0.85 },
  { id: 'brushpen', name: '毛笔', note: '提按 · 快细慢粗', size: 22, spacing: 0.06, opacity: 0.95, softness: 0.55, grain: 0.25, speedThin: 0.55, pressure: 0.85 },
  { id: 'chalk', name: '粉笔', note: '飞白 · 干涩', size: 18, spacing: 0.3, opacity: 0.78, softness: 0.18, grain: 1, jitter: 0.35, shape: 'square', aspect: 0.85, speckle: 1.7, pressure: 0.4 },
  { id: 'sponge', name: '海绵', note: '多孔 · 肌理', size: 34, spacing: 0.38, opacity: 0.5, softness: 0.5, grain: 1.1, jitter: 0.35, holes: 0.85, pressure: 0.25 },
]

/** 橡皮不属于「笔刷选择」列表，但走同一套绘制管线 */
export const ERASER_BRUSH = { id: 'eraser', name: '橡皮', note: '擦回白色', size: 28, spacing: 0.08, opacity: 1, softness: 0.3, grain: 0, pressure: 0.3, erase: true }

export const BRUSH_MAP = [...BRUSH_LIST, ERASER_BRUSH].reduce((acc, b) => {
  acc[b.id] = b
  return acc
}, {})

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/** 需要频繁 getImageData 的 canvas 用这个建，避免浏览器把它放在 GPU 侧读回全 0 */
function createReadableCanvas(width, height) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return { canvas, ctx }
}

/** 确定性伪随机：同一笔画在不同次重放中必须画出同样的颗粒 */
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hexToRgbTuple(hex) {
  const value = String(hex || '#000000').replace('#', '').trim()
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value.padEnd(6, '0').slice(0, 6)
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ]
}

function rgbToHex(r, g, b) {
  const part = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** 压力 → 笔尖半径。pressure 越接近 1 的笔刷越吃压感 */
function radiusFor(brush, baseSize, pressure) {
  const base = Math.max(0.5, baseSize / 2)
  const pk = brush.pressure ?? 0.5
  if (pk <= 0.01) return base
  const minScale = 1 - 0.75 * pk
  const p = Math.min(1, Math.max(0.05, pressure))
  return Math.max(0.4, base * (minScale + (1 - minScale) * Math.pow(p, 0.7)))
}

/**
 * 盖一个印章。rgb 为 "r,g,b" 字符串，恒为不透明，整笔透明度在合成时统一施加。
 * angle 只在方头笔刷（shape==='square'）时生效。
 */
function stampSeal(ctx, brush, rgb, x, y, radius, seed, angle = 0) {
  if (radius <= 0.15) return
  const jitter = brush.jitter || 0
  let px = x
  let py = y
  // 颗粒笔刷的每一枚印章都要有点偏移，否则边缘是一条光滑的机械边
  if (jitter > 0) {
    const jrand = mulberry32(((seed || 1) * 2246822519) >>> 0)
    px += (jrand() - 0.5) * radius * jitter * 2
    py += (jrand() - 0.5) * radius * jitter * 2
  }

  const softness = brush.softness || 0
  const square = brush.shape === 'square'
  if (square) {
    const aspect = brush.aspect || 0.7
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle)
    if (softness < 0.06) {
      ctx.fillStyle = `rgb(${rgb})`
      ctx.fillRect(-radius, -radius * aspect, radius * 2, radius * aspect * 2)
    } else {
      const core = Math.max(0.02, 1 - softness)
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
      gradient.addColorStop(0, `rgba(${rgb},1)`)
      gradient.addColorStop(core, `rgba(${rgb},1)`)
      gradient.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = gradient
      ctx.fillRect(-radius, -radius * aspect, radius * 2, radius * aspect * 2)
    }
    ctx.restore()
  } else if (softness < 0.06) {
    ctx.fillStyle = `rgb(${rgb})`
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, TAU)
    ctx.fill()
  } else {
    const core = Math.max(0.02, 1 - softness)
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius)
    gradient.addColorStop(0, `rgba(${rgb},1)`)
    gradient.addColorStop(core, `rgba(${rgb},1)`)
    gradient.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, TAU)
    ctx.fill()
  }

  const grain = brush.grain || 0
  if (grain > 0 && radius > 1.2) {
    const rand = mulberry32(((seed || 1) * 2654435761) >>> 0)
    const dots = Math.max(1, Math.round(grain * 7))
    const spread = brush.speckle || 1
    ctx.fillStyle = `rgb(${rgb})`
    for (let i = 0; i < dots; i += 1) {
      const dotAngle = rand() * TAU
      const dist = radius * (0.5 + rand() * 0.8) * spread
      const dot = radius * (0.07 + rand() * 0.15)
      ctx.beginPath()
      ctx.arc(px + Math.cos(dotAngle) * dist, py + Math.sin(dotAngle) * dist, dot, 0, TAU)
      ctx.fill()
    }
  }

  // 海绵的多孔感：在印章里挖掉一批小洞，让下层透出来
  const holes = brush.holes || 0
  if (holes > 0 && radius > 2) {
    const hrand = mulberry32(((seed || 1) * 1103515245) >>> 0)
    const count = Math.max(2, Math.round(holes * 8))
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < count; i += 1) {
      const hAngle = hrand() * TAU
      const dist = radius * hrand() * 0.95
      const hole = radius * (0.1 + hrand() * 0.22)
      ctx.beginPath()
      ctx.arc(px + Math.cos(hAngle) * dist, py + Math.sin(hAngle) * dist, hole, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** 把两点之间按间距铺满印章，返回新的游标点 */
function strokeSegment(ctx, brush, rgb, from, to, seedBase) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  const avgRadius = (from.r + to.r) / 2
  const step = Math.max(0.7, avgRadius * 2 * (brush.spacing || 0.12))
  const count = Math.max(1, Math.ceil(dist / step))
  // 方头笔刷跟着运笔方向转，马克笔才有「斜切笔尖」的手感
  const angle = brush.shape === 'square' ? Math.atan2(dy, dx) : 0
  for (let i = 1; i <= count; i += 1) {
    const t = i / count
    const radius = from.r + (to.r - from.r) * t
    stampSeal(ctx, brush, rgb, from.x + dx * t, from.y + dy * t, radius, seedBase + i, angle)
  }
  return to
}

/**
 * 把一条笔画记录完整画到目标 ctx 上（用于撤销后的重放）。
 * ctx 的 globalAlpha 由调用方设置，这里不碰合成模式。
 */
function replayStroke(ctx, op) {
  const brush = BRUSH_MAP[op.brushId] || BRUSH_MAP.pencil
  const rgb = hexToRgbTuple(op.color).join(',')
  const points = op.points || []
  if (!points.length) return
  const rendered = points.map((p) => ({
    x: p.x,
    y: p.y,
    // 新记录直接带 r；老记录（只有 p）退回按压力算，保证兼容
    r: typeof p.r === 'number' ? p.r : radiusFor(brush, op.size, p.p ?? 0.5),
  }))
  if (rendered.length === 1) {
    stampSeal(ctx, brush, rgb, rendered[0].x, rendered[0].y, rendered[0].r, op.seed)
    return
  }
  for (let i = 1; i < rendered.length; i += 1) {
    strokeSegment(ctx, brush, rgb, rendered[i - 1], rendered[i], op.seed + i * 131)
  }
}

/**
 * 油漆桶：扫描线洪水填充。直接改传入的 ImageData，返回是否真的改了像素。
 * tolerance 是 RGB+A 距离阈值，允许线稿边缘的抗锯齿灰阶也被算作同一区域。
 */
function floodFillImageData(imageData, startX, startY, rgb, tolerance) {
  const { width, height, data } = imageData
  const sx = Math.round(startX)
  const sy = Math.round(startY)
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return false

  const index = (x, y) => (y * width + x) * 4
  const start = index(sx, sy)
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]]
  const [fr, fg, fb] = rgb
  // 目标色和填充色几乎一致就没必要动手，否则会白写一遍像素
  if (target[0] === fr && target[1] === fg && target[2] === fb && target[3] === 255) return false

  const tol = Math.max(1, tolerance)
  const matches = (offset) => {
    const dr = Math.abs(data[offset] - target[0])
    const dg = Math.abs(data[offset + 1] - target[1])
    const db = Math.abs(data[offset + 2] - target[2])
    const da = Math.abs(data[offset + 3] - target[3])
    return dr + dg + db + da <= tol
  }

  const filled = new Uint8Array(width * height)
  const stack = [sx, sy]
  while (stack.length) {
    const y = stack.pop()
    const x = stack.pop()
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    if (filled[y * width + x]) continue
    if (!matches(index(x, y))) continue
    let left = x
    let right = x
    while (left > 0 && !filled[y * width + left - 1] && matches(index(left - 1, y))) left -= 1
    while (right < width - 1 && !filled[y * width + right + 1] && matches(index(right + 1, y))) right += 1
    for (let i = left; i <= right; i += 1) {
      const offset = index(i, y)
      data[offset] = fr
      data[offset + 1] = fg
      data[offset + 2] = fb
      data[offset + 3] = 255
      filled[y * width + i] = 1
      if (y > 0 && !filled[(y - 1) * width + i] && matches(index(i, y - 1))) stack.push(i, y - 1)
      if (y < height - 1 && !filled[(y + 1) * width + i] && matches(index(i, y + 1))) stack.push(i, y + 1)
    }
  }
  let changed = false
  for (let i = 0; i < filled.length && !changed; i += 1) {
    if (filled[i]) changed = true
  }
  return changed
}

/**
 * 把任意角度收成 0 / 90 / 180 / 270。画纸只转直角，转 37° 那种斜着画画没意义，
 * 还会让笔迹坐标换算变复杂（子像素采样一圈算下来线条会发虚）。
 */
export function normalizeRotation(value) {
  const deg = Number(value)
  if (!Number.isFinite(deg)) return 0
  const snapped = Math.round(deg / 90) * 90
  return ((snapped % 360) + 360) % 360
}

/**
 * 旋转后那张纸的外框（包围盒）尺寸。
 * 转 90°/270° 宽高互换；0°/180° 不变。舞台适配、鼠标坐标反算、导出尺寸都靠它，
 * 千万别再用 this.width / this.height 直接当外框，一转就错。
 */
export function rotatedBox(width, height, rotation) {
  const rot = normalizeRotation(rotation)
  return rot % 180 === 0 ? { w: width, h: height } : { w: height, h: width }
}

/**
 * 把一张画好的画布按角度转出来（导出 / 保存用）。
 * 方向必须和屏幕上的 render 一致（顺时针），否则用户看到的是横的、导出来是竖的。
 */
export function rotateCanvas(source, rotation) {
  const rot = normalizeRotation(rotation)
  if (!rot || typeof document === 'undefined') return source
  const swap = rot % 180 !== 0
  const out = createCanvas(swap ? source.height : source.width, swap ? source.width : source.height)
  const ctx = out.getContext('2d')
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return out
}

let layerSeq = 0

export class PaintDocument {
  constructor(options = {}) {
    this.width = Math.max(16, Math.round(options.width || 1200))
    this.height = Math.max(16, Math.round(options.height || 1500))
    this.layers = []
    this.ops = []
    this.undone = []
    this.maxOps = options.maxOps || 120
    this.strokeCanvas = createCanvas(this.width, this.height)
    this.strokeCtx = this.strokeCanvas.getContext('2d')
    this.stroke = null
    this.activeLayerId = ''
    /** 任何会改变画面的操作都 +1，页面拿它判断缩略图/保存状态要不要刷新 */
    this.revision = 0

    // 复用的临时画布，避免每次撤销都新建一张 7MB 的 canvas
    this.replayCanvas = createCanvas(this.width, this.height)
    this.replayCtx = this.replayCanvas.getContext('2d')
    const readable = createReadableCanvas(this.width, this.height)
    this.fillCanvas = readable.canvas
    this.fillCtx = readable.ctx
    const scratch = createReadableCanvas(this.width, this.height)
    this.scratchCanvas = scratch.canvas
    this.scratchCtx = scratch.ctx

    this.addLayer('图层 1')
    this.activeLayerId = this.layers[0].id
  }

  // ---------- 图层管理 ----------

  addLayer(name) {
    const canvas = createCanvas(this.width, this.height)
    const baseCanvas = createCanvas(this.width, this.height)
    const layer = {
      id: `layer-${layerSeq += 1}`,
      name: name || `图层 ${this.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'normal',
      canvas,
      ctx: canvas.getContext('2d'),
      /** 语义：本层 ops 里第一条记录之前的像素状态。历史上限触发时把最老的记录烘焙进来 */
      baseCanvas,
      baseCtx: baseCanvas.getContext('2d'),
    }
    this.layers.unshift(layer)
    this.activeLayerId = layer.id
    this.revision += 1
    return layer
  }

  layerById(id) {
    return this.layers.find((l) => l.id === id) || null
  }

  get activeLayer() {
    return this.layers.find((l) => l.id === this.activeLayerId) || this.layers[0]
  }

  get canDeleteLayer() {
    return this.layers.length > 1
  }

  removeLayer(id) {
    if (this.layers.length <= 1) return false
    const index = this.layers.findIndex((l) => l.id === id)
    if (index === -1) return false
    const [removed] = this.layers.splice(index, 1)
    // 该层的笔画一并丢弃，避免重放时找不到目标层
    this.ops = this.ops.filter((op) => op.layerId !== id)
    this.undone = []
    if (this.activeLayerId === id) this.activeLayerId = this.layers[Math.min(index, this.layers.length - 1)].id
    if (this.stroke && this.stroke.layerId === id) this.cancelStroke()
    // 把尺寸置 0，显存才会真的被回收
    this.disposeCanvas(removed.canvas)
    this.disposeCanvas(removed.baseCanvas)
    this.revision += 1
    return true
  }

  disposeCanvas(canvas) {
    if (!canvas) return
    canvas.width = 0
    canvas.height = 0
  }

  reorderLayer(id, toIndex) {
    const from = this.layers.findIndex((l) => l.id === id)
    if (from === -1) return false
    const target = Math.max(0, Math.min(this.layers.length - 1, Math.round(toIndex)))
    if (from === target) return false
    const [layer] = this.layers.splice(from, 1)
    this.layers.splice(target, 0, layer)
    this.revision += 1
    return true
  }

  setLayerProp(id, patch = {}) {
    const layer = this.layerById(id)
    if (!layer) return false
    let changed = false
    if (typeof patch.name === 'string' && patch.name.trim() && patch.name !== layer.name) {
      layer.name = patch.name.trim().slice(0, 20)
      changed = true
    }
    if (typeof patch.visible === 'boolean' && patch.visible !== layer.visible) {
      layer.visible = patch.visible
      changed = true
    }
    if (typeof patch.locked === 'boolean' && patch.locked !== layer.locked) {
      layer.locked = patch.locked
      changed = true
    }
    if (Number.isFinite(patch.opacity)) {
      const next = Math.max(0, Math.min(1, patch.opacity))
      if (next !== layer.opacity) {
        layer.opacity = next
        changed = true
      }
    }
    if (typeof patch.blend === 'string' && BLEND_MODES[patch.blend] && patch.blend !== layer.blend) {
      layer.blend = patch.blend
      changed = true
    }
    if (changed) this.revision += 1
    return changed
  }

  // ---------- 绘制 ----------

  canPaint() {
    const layer = this.activeLayer
    return Boolean(layer && layer.visible && !layer.locked)
  }

  beginStroke({ x, y, pressure, brushId, color, size, opacity, id }) {
    if (!this.canPaint()) return false
    const brush = BRUSH_MAP[brushId] || BRUSH_MAP.pencil
    this.stroke = {
      id: id || `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      layerId: this.activeLayerId,
      brushId: brush.id,
      color: color || '#2b3440',
      size: Math.max(1, size || brush.size),
      opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : (brush.opacity ?? 1),
      erase: Boolean(brush.erase),
      seed: Math.floor(Math.random() * 100000),
      points: [],
      cursor: null,
      lastRadius: 0,
    }
    this.strokeCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.strokeCtx.globalCompositeOperation = 'source-over'
    this.strokeCtx.globalAlpha = 1
    this.strokeCtx.clearRect(0, 0, this.width, this.height)
    this.pushPoint(x, y, pressure)
    return true
  }

  pushPoint(x, y, pressure = 0.5) {
    const stroke = this.stroke
    if (!stroke) return
    const brush = BRUSH_MAP[stroke.brushId] || BRUSH_MAP.pencil
    const rgb = hexToRgbTuple(stroke.color).join(',')
    let radius = radiusFor(brush, stroke.size, pressure)

    // 毛笔：画得越快笔尖越细。用相邻两点的距离当速度代理
    const speedThin = brush.speedThin || 0
    const prev = stroke.points.length ? stroke.points[stroke.points.length - 1] : null
    if (speedThin > 0 && prev) {
      const distance = Math.hypot(x - prev.x, y - prev.y)
      const speed = Math.min(1, distance / Math.max(4, stroke.size * 1.6))
      radius = Math.max(0.4, radius * (1 - speedThin * speed))
    }

    const point = { x, y, p: pressure, r: radius }
    stroke.points.push(point)

    if (!stroke.cursor) {
      stroke.cursor = { x, y, r: radius }
      stampSeal(this.strokeCtx, brush, rgb, x, y, radius, stroke.seed)
      stroke.lastRadius = radius
      return
    }
    const next = { x, y, r: radius }
    strokeSegment(this.strokeCtx, brush, rgb, stroke.cursor, next, stroke.seed + stroke.points.length * 131)
    stroke.cursor = next
    stroke.lastRadius = radius
  }

  /** 结束当前笔画：落到图层并记入历史，返回是否需要刷新 */
  endStroke() {
    const stroke = this.stroke
    if (!stroke) return false
    this.stroke = null
    if (stroke.points.length === 0) return false

    const layer = this.layerById(stroke.layerId)
    if (!layer) return false

    const op = {
      type: 'stroke',
      layerId: stroke.layerId,
      brushId: stroke.brushId,
      color: stroke.color,
      size: stroke.size,
      opacity: stroke.opacity,
      erase: stroke.erase,
      seed: stroke.seed,
      points: stroke.points,
    }
    this.blitStroke(layer.ctx, op)
    this.strokeCtx.clearRect(0, 0, this.width, this.height)

    this.ops.push(op)
    this.undone = []
    this.trimHistory()
    this.revision += 1
    return true
  }

  /** 把手势打断的半成品笔画丢掉（双指缩放会用到） */
  cancelStroke() {
    if (!this.stroke) return false
    this.stroke = null
    this.strokeCtx.clearRect(0, 0, this.width, this.height)
    return true
  }

  /**
   * 把一条笔画图层记录「整笔统一透明度」地叠到目标 ctx 上。
   * 目标 ctx 的变换必须是单位矩阵（调用方负责）。
   */
  blitStroke(targetCtx, op) {
    const sctx = this.replayCtx
    sctx.setTransform(1, 0, 0, 1, 0, 0)
    sctx.globalAlpha = 1
    sctx.globalCompositeOperation = 'source-over'
    sctx.clearRect(0, 0, this.width, this.height)
    replayStroke(sctx, op)
    targetCtx.save()
    targetCtx.globalAlpha = op.opacity ?? 1
    targetCtx.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over'
    targetCtx.drawImage(this.replayCanvas, 0, 0)
    targetCtx.restore()
  }

  /**
   * 历史上限到了，把最老的记录烘焙进该层的 baseCanvas 再丢弃。
   * 这一步是「填充 + 撤销不会把整层刷成纯色」的关键。
   */
  trimHistory() {
    while (this.ops.length > this.maxOps) {
      const op = this.ops.shift()
      const layer = this.layerById(op.layerId)
      if (!layer) continue
      this.bakeOp(layer, op)
    }
  }

  bakeOp(layer, op) {
    const ctx = layer.baseCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (op.type === 'fill') {
      this.floodFillCanvas(layer.baseCanvas, { x: op.x, y: op.y, color: op.color, tolerance: op.tolerance })
      return
    }
    if (op.type === 'image') {
      ctx.globalAlpha = op.opacity ?? 1
      ctx.globalCompositeOperation = 'source-over'
      if (op.source) ctx.drawImage(op.source, op.dx ?? 0, op.dy ?? 0, op.dw ?? this.width, op.dh ?? this.height)
      ctx.globalAlpha = 1
      return
    }
    this.blitStroke(ctx, op)
  }

  // ---------- 油漆桶 ----------

  /**
   * 在目标 canvas 上做洪水填充（只采样这张 canvas 自己的像素）。
   * 返回是否真的填了东西。
   */
  floodFillCanvas(targetCanvas, { x, y, color, tolerance = 32 }) {
    const fctx = this.fillCtx
    fctx.setTransform(1, 0, 0, 1, 0, 0)
    fctx.globalAlpha = 1
    fctx.globalCompositeOperation = 'source-over'
    fctx.clearRect(0, 0, this.width, this.height)
    fctx.drawImage(targetCanvas, 0, 0)
    const imageData = fctx.getImageData(0, 0, this.width, this.height)
    const changed = floodFillImageData(imageData, x, y, hexToRgbTuple(color), tolerance)
    if (!changed) return false
    fctx.putImageData(imageData, 0, 0)

    const tctx = targetCanvas.getContext('2d')
    tctx.save()
    tctx.setTransform(1, 0, 0, 1, 0, 0)
    tctx.globalAlpha = 1
    tctx.globalCompositeOperation = 'source-over'
    tctx.clearRect(0, 0, this.width, this.height)
    tctx.drawImage(this.fillCanvas, 0, 0)
    tctx.restore()
    return true
  }

  fill(x, y, color, options = {}) {
    if (!this.canPaint()) return false
    const layer = this.activeLayer
    const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 32
    if (!this.floodFillCanvas(layer.canvas, { x, y, color, tolerance })) return false
    const op = { type: 'fill', layerId: layer.id, x, y, color, tolerance }
    this.ops.push(op)
    this.undone = []
    this.trimHistory()
    this.revision += 1
    return true
  }

  /** 吸管：取「看到的那一色」，所以采样的是合成后的画面 */
  pickColor(x, y) {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return null
    const sctx = this.scratchCtx
    sctx.setTransform(1, 0, 0, 1, 0, 0)
    sctx.globalAlpha = 1
    sctx.globalCompositeOperation = 'source-over'
    sctx.clearRect(0, 0, this.width, this.height)
    this.compose(sctx)
    const data = sctx.getImageData(px, py, 1, 1).data
    if (data[3] === 0) return null
    return rgbToHex(data[0], data[1], data[2])
  }

  // ---------- 图片图层（AI 图贴回画纸） ----------

  /**
   * 新增一个「贴图图层」。image 可以是 HTMLImageElement / ImageBitmap / canvas。
   * fit=cover 表示铺满画纸（超出部分居中裁掉），contain 表示完整放进画纸。
   */
  addImageLayer(name, image, options = {}) {
    const width = image?.width || image?.naturalWidth || 0
    const height = image?.height || image?.naturalHeight || 0
    if (!width || !height) return null
    const layer = this.addLayer(name || 'AI 图层')
    const fit = options.fit === 'contain' ? 'contain' : 'cover'
    const scale = fit === 'cover'
      ? Math.max(this.width / width, this.height / height)
      : Math.min(this.width / width, this.height / height)
    const dw = width * scale
    const dh = height * scale
    const dx = (this.width - dw) / 2
    const dy = (this.height - dh) / 2
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0)
    layer.ctx.globalAlpha = 1
    layer.ctx.globalCompositeOperation = 'source-over'
    layer.ctx.drawImage(image, dx, dy, dw, dh)
    this.ops.push({ type: 'image', layerId: layer.id, source: image, dx, dy, dw, dh, opacity: 1 })
    this.undone = []
    this.trimHistory()
    this.revision += 1
    return layer
  }

  // ---------- 撤销 / 重做 ----------

  replayLayer(layerId) {
    const layer = this.layerById(layerId)
    if (!layer) return
    const ctx = layer.ctx
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, this.width, this.height)
    // 先铺「被裁掉的老操作」烘焙成的底子，再按顺序重放剩下的记录
    ctx.drawImage(layer.baseCanvas, 0, 0)
    this.ops.forEach((op) => {
      if (op.layerId !== layerId) return
      if (op.type === 'fill') {
        this.floodFillCanvas(layer.canvas, { x: op.x, y: op.y, color: op.color, tolerance: op.tolerance })
        return
      }
      if (op.type === 'image') {
        ctx.globalAlpha = op.opacity ?? 1
        ctx.globalCompositeOperation = 'source-over'
        if (op.source) ctx.drawImage(op.source, op.dx ?? 0, op.dy ?? 0, op.dw ?? this.width, op.dh ?? this.height)
        return
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      this.blitStroke(ctx, op)
    })
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  }

  undo() {
    if (!this.ops.length) return false
    const op = this.ops.pop()
    this.undone.push(op)
    this.replayLayer(op.layerId)
    this.revision += 1
    return true
  }

  redo() {
    if (!this.undone.length) return false
    const op = this.undone.pop()
    this.ops.push(op)
    this.replayLayer(op.layerId)
    this.revision += 1
    return true
  }

  clearActiveLayer() {
    if (!this.canPaint()) return false
    const layer = this.activeLayer
    if (!layer) return false
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0)
    layer.ctx.clearRect(0, 0, this.width, this.height)
    layer.baseCtx.setTransform(1, 0, 0, 1, 0, 0)
    layer.baseCtx.clearRect(0, 0, this.width, this.height)
    this.ops = this.ops.filter((op) => op.layerId !== layer.id)
    this.undone = []
    this.revision += 1
    return true
  }

  get historyState() {
    return {
      canUndo: this.ops.length > 0,
      canRedo: this.undone.length > 0,
      undoDepth: this.ops.length,
      redoDepth: this.undone.length,
      revision: this.revision,
    }
  }

  // ---------- 合成 ----------

  /**
   * 把整份作品画到目标 ctx 上（假定调用方已经把视图变换设好）。
   *
   * 顺序：白纸 → 活动层之下逐层 → 活动层+进行中笔画 → 活动层之上逐层。
   * 关键点是「活动层 + 进行中的笔画」先合成到一张 scratch 再一次性叠上去：
   * 这样橡皮的 destination-out 只擦得掉本层，不会把白纸擦出透明洞、
   * 也不会把下层擦穿露出舞台背景。
   */
  compose(ctx, options = {}) {
    const { paperShadow = false, shadowScale = 1, paper = '#ffffff' } = options
    const strokeLayerId = this.stroke ? this.stroke.layerId : ''
    const activeIndex = (() => {
      if (strokeLayerId) {
        const index = this.layers.findIndex((l) => l.id === strokeLayerId)
        if (index !== -1) return index
      }
      return this.layers.findIndex((l) => l.id === this.activeLayerId)
    })()

    // 1. 纸
    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    if (paperShadow) {
      ctx.shadowColor = 'rgba(31,41,55,.16)'
      ctx.shadowBlur = 22 / shadowScale
      ctx.shadowOffsetY = 6 / shadowScale
    }
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, this.width, this.height)
    // 纸边描一圈细线：纸是纯白、画纸台是浅灰蓝，纸一放大就糊成一片，
    // 加这条线老师一眼能看出「纸到哪儿为止」。
    //
    // ⚠️ 只在屏幕上画（paperShadow 为 true 就是屏幕渲染那一趟）。
    // 这行线绝不能进合成图，否则：
    //   ① 换画纸尺寸时要把旧纸拍平再贴进新纸，旧纸的框会被一起拍进去，
    //      缩放后变成纸面上两条莫名其妙的暗线（踩过）；
    //   ② 导出、取参考图会多出一圈灰边，AI 会把它当成画的一部分。
    // 阴影同理必须在这里彻底关掉——上面为了纸的投影设过 shadow，
    // 不关掉描边会被影子糊成一坨。线宽按「屏幕上 1px」反算（shadowScale 是视图缩放），
    // 否则纸一缩小线就变粗。
    if (paperShadow) {
      const hairline = Math.max(0.5, Math.min(3, 1 / (shadowScale || 1)))
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
      ctx.strokeStyle = 'rgba(31, 41, 55, .16)'
      ctx.lineWidth = hairline
      // 描在纸内侧，免得半条线漏到纸外
      ctx.strokeRect(hairline / 2, hairline / 2, this.width - hairline, this.height - hairline)
    }
    ctx.restore()

    const drawLayer = (layer) => {
      if (!layer || !layer.visible || layer.opacity <= 0) return
      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.globalCompositeOperation = BLEND_MODES[layer.blend] || 'source-over'
      ctx.drawImage(layer.canvas, 0, 0)
      ctx.restore()
    }

    // 2. 活动层之下（数组下标越大越靠下），从最底层往上
    for (let i = this.layers.length - 1; i > activeIndex; i -= 1) drawLayer(this.layers[i])

    // 3. 活动层（可能带着进行中的笔画）
    const active = activeIndex >= 0 ? this.layers[activeIndex] : null
    if (active) {
      if (!this.stroke) {
        drawLayer(active)
      } else {
        const sctx = this.scratchCtx
        sctx.setTransform(1, 0, 0, 1, 0, 0)
        sctx.globalAlpha = 1
        sctx.globalCompositeOperation = 'source-over'
        sctx.clearRect(0, 0, this.width, this.height)
        sctx.drawImage(active.canvas, 0, 0)
        sctx.globalAlpha = this.stroke.opacity
        sctx.globalCompositeOperation = this.stroke.erase ? 'destination-out' : 'source-over'
        sctx.drawImage(this.strokeCanvas, 0, 0)
        sctx.globalAlpha = 1
        sctx.globalCompositeOperation = 'source-over'
        if (active.visible && active.opacity > 0) {
          ctx.save()
          ctx.globalAlpha = active.opacity
          ctx.globalCompositeOperation = BLEND_MODES[active.blend] || 'source-over'
          ctx.drawImage(this.scratchCanvas, 0, 0)
          ctx.restore()
        }
      }
    }

    // 4. 活动层之上，从紧邻的一层往上
    const topEnd = activeIndex >= 0 ? activeIndex - 1 : this.layers.length - 1
    for (let i = topEnd; i >= 0; i -= 1) drawLayer(this.layers[i])

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  /**
   * 合成到屏幕画布。view = { scale, tx, ty, rotation }，单位均为 CSS 像素。
   *
   * tx / ty 是「旋转后那张纸的外框（包围盒）左上角」在屏幕上的位置，不是原纸的左上角——
   * 转 90° 之后纸的宽高互换，如果还按原宽高算偏移，纸会跑到舞台外面去。
   * rotation 只接受 0 / 90 / 180 / 270，围绕纸中心转，所以转多少圈笔迹都还在纸中央。
   */
  render(targetCtx, viewWidth, viewHeight, dpr, view, options = {}) {
    const ctx = targetCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, Math.ceil(viewWidth * dpr), Math.ceil(viewHeight * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.save()
    const rot = normalizeRotation(view.rotation)
    const box = rotatedBox(this.width, this.height, rot)
    ctx.translate(view.tx, view.ty)
    ctx.scale(view.scale, view.scale)
    // 先把原点挪到外框中心，转，再挪回纸中心：纸始终绕自己的中心转
    ctx.translate(box.w / 2, box.h / 2)
    if (rot) ctx.rotate((rot * Math.PI) / 180)
    ctx.translate(-this.width / 2, -this.height / 2)
    this.compose(ctx, {
      paperShadow: options.paperShadow !== false,
      shadowScale: view.scale || 1,
    })
    ctx.restore()
  }

  /** 合成一张原尺寸位图（导出 / 取参考图都走这里，保证「导出 == 屏幕」） */
  composeToCanvas(targetWidth = this.width, targetHeight = this.height) {
    const out = createCanvas(targetWidth, targetHeight)
    const ctx = out.getContext('2d')
    ctx.setTransform(targetWidth / this.width, 0, 0, targetHeight / this.height, 0, 0)
    this.compose(ctx)
    return out
  }

  /** 导出合并后的 PNG 数据（白底） */
  exportBlob(type = 'image/png') {
    const out = this.composeToCanvas()
    return new Promise((resolve) => out.toBlob((blob) => resolve(blob), type, 0.92))
  }

  /**
   * 导出给 AI 当参考图用的 dataURL。maxSize 限制长边，默认转 JPEG 压小，
   * 因为参考图只需要看个大概，传 1008px 的 PNG 会白白多几百 KB。
   */
  exportDataUrl({ maxSize = 768, type = 'image/jpeg', quality = 0.72 } = {}) {
    const longSide = Math.max(this.width, this.height)
    const ratio = maxSize > 0 ? Math.min(1, maxSize / longSide) : 1
    const out = this.composeToCanvas(Math.round(this.width * ratio), Math.round(this.height * ratio))
    return out.toDataURL(type, quality)
  }

  /** 图层面板用的小缩略图。返回到处可用的 canvas，页面直接塞进 DOM */
  layerThumbnail(layerId, width = 56, height = 42) {
    const layer = this.layerById(layerId)
    const out = createCanvas(width, height)
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    if (!layer) return out
    const scale = Math.min(out.width / this.width, out.height / this.height)
    const dw = this.width * scale
    const dh = this.height * scale
    ctx.drawImage(layer.canvas, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh)
    return out
  }

  /** 整份作品的缩略图（图层列表底部「合成预览」可用） */
  documentThumbnail(width = 56, height = 42) {
    const out = createCanvas(width, height)
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    const scale = Math.min(out.width / this.width, out.height / this.height)
    const dw = this.width * scale
    const dh = this.height * scale
    const composed = this.composeToCanvas(Math.round(dw), Math.round(dh))
    ctx.drawImage(composed, (out.width - dw) / 2, (out.height - dh) / 2)
    return out
  }

  /** 把整份作品序列化成可存储的 JSON（不含位图，只有笔画数据） */
  serialize() {
    return {
      width: this.width,
      height: this.height,
      layers: this.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        blend: l.blend,
      })),
      ops: this.ops.filter((op) => op.type !== 'image').map((op) => ({
        type: op.type,
        layerId: op.layerId,
        brushId: op.brushId,
        color: op.color,
        size: op.size,
        opacity: op.opacity,
        erase: op.erase,
        seed: op.seed,
        points: op.points,
        x: op.x,
        y: op.y,
        tolerance: op.tolerance,
      })),
    }
  }
}
