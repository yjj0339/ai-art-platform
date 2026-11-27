// H5 编辑器、服务端校验与报告阅读共用的数据规则；不依赖浏览器状态。
export const H5_CHAPTERS = [
  ['cover', '这是我的设计'], ['inspiration', '我的灵感从哪里来'], ['problem', '我想解决的问题'],
  ['sketch', '我画下第一版想法'], ['ai', '我和 AI 一起试方案'], ['model', '我把它做成立体的'],
  ['scene', '我想象它真正被使用'], ['reflection', '这是我的收获'],
].map(([id, label]) => ({ id, label }))
export const H5_BINDINGS = [
  ['page.title', '当前章节标题'], ['page.body', '当前章节文案'], ['project.title', '项目名称'],
  ['student.name', '用户名称'], ['image:0', '本章主图'], ['image:1', '本章第二张图'],
  ['image:2', '本章第三张图'], ['final', '用户最终作品'], ['sketch', '原始草图'], ['refined', '优化草图'],
].map(([value, label]) => ({ value, label }))
export const cloneLayout = value => JSON.parse(JSON.stringify(value))
const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback
const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, number(value, fallback)))
const text = (value, max = 3000) => typeof value === 'string' ? value.slice(0, max) : ''
export const safeH5Media = value => {
  const src = text(value, 2000000).trim()
  if (src.includes('\\') || src.startsWith('/') && /(?:\.\.|%2e|%2f|%5c)/i.test(src)) return ''
  return /^(?:\/assets\/|\/api\/(?:assets|h5-visual-template-assets|public\/h5-reports)\/|https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(src) && !/[<>"'\r\n]/.test(src) ? src : ''
}
const color = (value, fallback) => /^#[\da-f]{3,8}$/i.test(value || '') ? value : fallback
const fonts = ['Microsoft YaHei', 'KaiTi', 'SimSun', 'sans-serif']

export function normalizeH5Element(value = {}, index = 0) {
  const type = ['text', 'image', 'shape'].includes(value.type) ? value.type : 'text'
  const width = clamp(value.w, 40, 1080, 400), height = clamp(value.h, 30, 1920, 200)
  return {
    id: text(value.id, 80) || `element-${index}`, type, name: text(value.name, 60) || ({ text: '文字', image: '图片', shape: '装饰' }[type]),
    role: ['title', 'body', 'decor'].includes(value.role) ? value.role : (type === 'text' ? 'body' : 'decor'),
    binding: H5_BINDINGS.some(item => item.value === value.binding) ? value.binding : '',
    text: text(value.text), src: safeH5Media(value.src), x: clamp(value.x, 0, 1080 - width, 80), y: clamp(value.y, 0, 1920 - height, 100), w: width, h: height,
    z: clamp(value.z, 0, 100, index), rotation: clamp(value.rotation, -15, 15, 0), opacity: clamp(value.opacity, 0.1, 1, 1),
    fontSize: clamp(value.fontSize, 34, 150, type === 'text' && value.role === 'title' ? 78 : 44),
    fontFamily: fonts.includes(value.fontFamily) ? value.fontFamily : 'Microsoft YaHei',
    lineHeight: clamp(value.lineHeight, 1, 2, 1.5), color: color(value.color, '#244574'), fill: color(value.fill, type === 'shape' ? '#fff4ce' : '#ffffff'),
    align: ['left', 'center', 'right'].includes(value.align) ? value.align : 'left', radius: clamp(value.radius, 0, 120, 18),
    fit: value.fit === 'cover' ? 'cover' : 'contain', cropX: clamp(value.cropX, 0, 100, 50), cropY: clamp(value.cropY, 0, 100, 50),
    bold: value.bold === true, hidden: value.hidden === true, locked: value.locked === true,
  }
}

export function normalizeH5Design(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.pages) || !value.pages.length) return null
  const pageIds = new Set()
  return { version: 1, width: 1080, height: 1920, pages: value.pages.slice(0, 24).map((page, index) => {
    let id = text(page.id, 80) || `page-${index}`
    if (pageIds.has(id)) id = `${id}-${index}`
    pageIds.add(id)
    const ids = new Set()
    const elements = (Array.isArray(page.elements) ? page.elements : []).slice(0, 48).map(normalizeH5Element).map((element, i) => {
      if (ids.has(element.id)) element.id += `-${i}`
      ids.add(element.id)
      return element
    })
    return { id, chapter: H5_CHAPTERS.some(item => item.id === page.chapter) ? page.chapter : 'reflection', title: text(page.title, 80) || '新页面',
      background: color(page.background, '#f2f7ff'), backgroundImage: safeH5Media(page.backgroundImage), enabled: page.enabled !== false, elements }
  }) }
}

export function createH5HandbookDesign() {
  return normalizeH5Design({ version: 1, pages: H5_CHAPTERS.map((chapter, index) => {
    const elements = [
      { id: 'tape', type: 'shape', name: '蓝色胶带', x: 80, y: 70, w: 220, h: 48, fill: '#c8dcff', rotation: -3, opacity: 0.8, z: 0 },
      { id: 'title', type: 'text', role: 'title', name: '章节标题', binding: 'page.title', x: 80, y: 150, w: 920, h: 230, fontSize: 78, fontFamily: 'KaiTi', color: '#123f88', bold: true, z: 4 },
      { id: 'paper', type: 'shape', name: '作品纸张', x: 68, y: 410, w: 944, h: 900, fill: '#ffffff', rotation: index % 2 ? -1 : 1, z: 0 },
      { id: 'hero', type: 'image', name: '作品主图', binding: 'image:0', x: 90, y: 435, w: 900, h: 850, fit: 'contain', z: 2 },
      { id: 'note', type: 'shape', name: '创作便签', x: 70, y: 1370, w: 940, h: 390, fill: '#fff8dd', rotation: -1, z: 0 },
      { id: 'body', type: 'text', role: 'body', name: '章节说明', binding: 'page.body', x: 110, y: 1410, w: 860, h: 310, fontSize: 44, z: 3 },
      { id: 'footer', type: 'text', role: 'decor', name: '档案标记', text: '观察 · 探索 · 创造', x: 90, y: 1820, w: 700, h: 60, fontSize: 36, color: '#8198b7', z: 1 },
    ]
    if (chapter.id === 'ai' || chapter.id === 'sketch' || chapter.id === 'inspiration') {
      Object.assign(elements.find(item => item.id === 'hero'), { w: 570, h: 850 })
      elements.push({ id: 'detail-1', type: 'image', name: '第二张图片', binding: 'image:1', x: 690, y: 435, w: 300, h: 390, z: 2 })
      elements.push({ id: 'detail-2', type: 'image', name: '第三张图片', binding: 'image:2', x: 690, y: 875, w: 300, h: 390, z: 2 })
    }
    return { id: chapter.id, chapter: chapter.id, title: chapter.label, background: index % 2 ? '#f5f9ff' : '#edf5ff', elements }
  }) })
}

export function estimateH5TextHeight(element, value = element.text) {
  const columns = Math.max(1, Math.floor(element.w / element.fontSize) - 1)
  const lines = String(value || '').split('\n').reduce((count, line) => count + Math.max(1, Math.ceil([...line].reduce((n, char) => n + (/[^\x00-\xff]/.test(char) ? 1 : 0.6), 0) / columns)), 0)
  return lines * element.fontSize * element.lineHeight
}

export function validateH5Design(value, { resolved = false } = {}) {
  const design = normalizeH5Design(value), errors = []
  if (!design) return ['没有可用的 H5 页面布局']
  if (value.pages.length > 24 || value.pages.some(page => (page.elements || []).length > 48)) errors.push('报告最多24页，每页最多48个元素')
  for (const page of value.pages || []) for (const element of page.elements || []) {
    if (![element.x, element.y, element.w, element.h].every(Number.isFinite) || element.x < 0 || element.y < 0 || element.w < 40 || element.h < 30 || element.x + element.w > 1080 || element.y + element.h > 1920) errors.push(`${page.title}：元素超出页面范围或尺寸无效`)
  }
  design.pages.filter(page => page.enabled).forEach(page => {
    const visible = page.elements.filter(item => !item.hidden)
    if (!visible.some(item => item.type === 'text')) errors.push(`${page.title}：至少需要一个文字元素`)
    visible.forEach(element => {
      if (element.type === 'text' && (resolved || !element.binding) && estimateH5TextHeight(element) > element.h + 3) errors.push(`${page.title}：${element.name}文字过长，请扩大文字框或分页`)
      if (resolved && element.type === 'image' && element.binding && !element.src) errors.push(`${page.title}：${element.name}没有可用素材`)
    })
    const content = visible.filter(item => item.type === 'text' && item.role !== 'decor' || item.type === 'image' && (item.src || item.binding))
    content.forEach((a, i) => content.slice(i + 1).forEach(b => {
      const area = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      if ((a.type === 'text' || b.type === 'text') && area > Math.min(a.w * a.h, b.w * b.h) * 0.1) errors.push(`${page.title}：${a.name}与${b.name}互相遮挡`)
    }))
  })
  if (!design.pages.some(page => page.enabled)) errors.push('至少保留一页')
  return [...new Set(errors)]
}

const imageSource = item => safeH5Media(typeof item === 'string' ? item : item?.imageUrl || item?.src || item?.preview || item?.cover || item?.thumbnail || item?.previewUrl || item?.url || String(item?.background || '').match(/^url\(["']?(.*?)["']?\)$/)?.[1] || '')
export function collectH5Materials(project = {}) {
  const versions = (project.versions || []).map(item => ({ ...item, src: imageSource(item) })).filter(item => item.src)
  const selected = versions.find(item => item.id === project.finalVersionId)
  return {
    final: imageSource(project.finalArtworkUrl || selected || project.finalImage || project.cover),
    sketch: imageSource(project.sketchOriginal), refined: imageSource(project.sketchOptimized),
    versions: versions.map(item => item.src), inspiration: (project.referenceImages || []).map(imageSource).filter(Boolean),
    model: (project.models3d || []).map(imageSource).filter(Boolean), scene: (project.sceneImages || []).map(imageSource).filter(Boolean),
  }
}

export function recordedH5Pages(project = {}) {
  const materials = collectH5Materials(project)
  const body = {
    cover: materials.final ? '这是我选择并保存的最终作品。' : '',
    inspiration: project.idea || project.ideaSummary || project.courseIdeaText || project.courseIdeaVoiceText || '',
    problem: project.courseDescription || '',
    sketch: project.sketchComment || (materials.sketch ? '这是我保存的原始草图。' : ''),
    ai: [materials.versions.length ? `我保存了${materials.versions.length}个作品版本。` : '', project.prompt ? `我记录的提示词：${project.prompt}` : ''].join('\n').trim(),
    model: project.modelDescription || (materials.model.length ? `我保存了${materials.model.length}张3D作品预览。` : ''),
    scene: project.sceneDescription || (materials.scene.length ? '这是我保存的作品场景。' : ''),
    reflection: project.reflection || project.reportReflection || '',
  }
  return H5_CHAPTERS.map(chapter => ({ id: chapter.id, type: chapter.id, title: chapter.id === 'cover' ? project.title || chapter.label : chapter.label, body: String(body[chapter.id] || '') })).filter(page => page.body || page.type === 'cover')
}

const chapterType = value => ({ idea: 'inspiration', process: 'sketch', aiProcess: 'ai', aiPrompt: 'ai', finalWork: 'cover', aiReview: 'reflection', teacherComment: 'reflection', backCover: 'reflection', course: 'problem', model3d: 'model' }[value] || value)
function splitH5Text(element, value) {
  const chunks = []; let chunk = ''
  for (const char of String(value || '')) {
    if (chunk && estimateH5TextHeight(element, chunk + char) > element.h - 4) { chunks.push(chunk); chunk = '' }
    if (estimateH5TextHeight(element, char) > element.h - 4) throw new Error('正文框高度不足一行，请先调整模板')
    chunk += char
  }
  if (chunk) chunks.push(chunk)
  return chunks
}
export function compileH5Layout(designValue, pages = [], project = {}) {
  const design = normalizeH5Design(designValue)
  if (!design) throw new Error('模板尚未配置可视化布局')
  const materials = collectH5Materials(project), output = []
  design.pages.filter(page => page.enabled).forEach(templatePage => {
    const chapter = templatePage.chapter
    const sources = pages.filter(page => chapterType(page.storyStep || page.type || page.id) === chapter)
    let images = chapter === 'cover' || chapter === 'reflection' ? [materials.final] : chapter === 'sketch' ? [materials.sketch, materials.refined] : chapter === 'ai' ? materials.versions : chapter === 'model' ? materials.model : chapter === 'scene' ? materials.scene : materials.inspiration
    images = [...new Set(images.filter(Boolean))]
    if (['sketch', 'model', 'ai'].includes(chapter) && !images.length) return
    if (!sources.length && !images.length && chapter !== 'cover' && templatePage.elements.some(element => element.binding)) return
    if (!sources.length) sources.push({ title: chapter === 'cover' ? project.title : templatePage.title, body: chapter === 'model' ? `我保存了 ${images.length} 张立体作品预览。` : chapter === 'scene' && images.length ? `这是我的作品场景记录。` : '' })
    sources.forEach((source, sourceIndex) => {
    const body = text(source?.body || source?.text || '', 6000)
    if (!body && !images.length && chapter !== 'cover') return
    const page = cloneLayout(templatePage)
    page.id = `${templatePage.id}${sourceIndex ? `-source-${sourceIndex}` : ''}`
    page.elements = page.elements.filter(element => {
      const binding = element.binding
      if (element.type === 'text') element.text = binding === 'page.title' ? (source?.title || project.title || page.title) : binding === 'page.body' ? body : binding === 'project.title' ? project.title || '' : binding === 'student.name' ? project.studentName || '用户' : element.text
      if (element.type === 'image' && binding) element.src = binding.startsWith('image:') ? images[Number(binding.split(':')[1])] || '' : materials[binding] || ''
      return !(element.type === 'image' && binding && !element.src)
    })
    const hero = page.elements.find(item => item.id === 'hero')
    if (hero && images.length <= 1 && !hero.locked && hero.x === 90 && hero.y === 435) { hero.w = 900; hero.h = 850 }
    if (!images.length) page.elements = page.elements.filter(item => item.id !== 'paper')
    const bodyElement = page.elements.find(item => item.binding === 'page.body')
    if (bodyElement && !images.length && !bodyElement.locked) {
      Object.assign(bodyElement, { y: 450, h: 1250 })
      const note = page.elements.find(item => item.id === 'note')
      if (note) Object.assign(note, { y: 410, h: 1340 })
    }
    if (bodyElement && bodyElement.text) {
      const chunks = splitH5Text(bodyElement, bodyElement.text)
      chunks.forEach((chunk, index) => {
        const continuation = cloneLayout(page)
        continuation.id = `${page.id}${index ? `-continued-${index}` : ''}`
        continuation.elements.find(item => item.id === bodyElement.id).text = chunk
        output.push(continuation)
      })
    } else output.push(page)
    const imageSlots = templatePage.elements.filter(element => element.type === 'image' && element.binding.startsWith('image:'))
    const perPage = imageSlots.length ? Math.max(...imageSlots.map(element => Number(element.binding.split(':')[1]))) + 1 : 0
    if (sourceIndex === 0 && perPage) for (let offset = perPage; offset < images.length; offset += perPage) {
      const extra = cloneLayout(page); extra.id = `${page.id}-images-${offset}`
      extra.elements = extra.elements.filter(element => {
        if (element.binding.startsWith('image:')) element.src = images[offset + Number(element.binding.split(':')[1])] || ''
        if (element.binding === 'page.body') element.text = ''
        return !(element.type === 'image' && element.binding && !element.src)
      })
      output.push(extra)
    }
    })
  })
  if (!output.length) throw new Error('当前项目没有可生成的报告内容')
  if (output.length > 24) throw new Error('报告内容过多，请先精简章节文案后再生成')
  for (const page of output) for (const element of page.elements.filter(item => item.type === 'text' && item.binding !== 'page.body')) {
    while (estimateH5TextHeight(element) > element.h - 4 && element.fontSize > 34 && !element.locked) element.fontSize--
  }
  const result = normalizeH5Design({ version: 1, pages: output }), errors = validateH5Design(result, { resolved: true })
  if (errors.length) throw new Error(errors[0])
  return result
}

export function applyH5LayoutProposal(baseValue, proposal) {
  const base = normalizeH5Design(baseValue)
  if (!base || !Array.isArray(proposal?.pages) || proposal.pages.length !== base.pages.length) throw new Error('AI 返回的页面结构无效，原稿已保留')
  const next = cloneLayout(base), seen = new Set()
  const pages = proposal.pages.map(patch => {
    const page = next.pages.find(item => item.id === patch.id)
    if (!page || seen.has(page.id) || !Array.isArray(patch.elements)) throw new Error('AI 引用了无效页面')
    seen.add(page.id)
    const changed = new Set()
    patch.elements.forEach(update => {
      const element = page.elements.find(item => item.id === update.id)
      if (!element || changed.has(update.id)) throw new Error('AI 引用了不存在或重复的元素')
      changed.add(update.id)
      if (element.locked) return
      for (const key of ['x', 'y', 'w', 'h', 'fontSize', 'rotation']) if (update[key] !== undefined) {
        if (!Number.isFinite(update[key])) throw new Error('AI 返回的尺寸不是有效数字')
        element[key] = update[key]
      }
      if (element.x < 0 || element.y < 0 || element.w < 40 || element.h < 30 || element.x + element.w > 1080 || element.y + element.h > 1920 || element.fontSize < 34 || element.fontSize > 150 || Math.abs(element.rotation) > 15) throw new Error('AI 返回的布局超出页面范围')
    })
    return page
  })
  const result = { ...next, pages }, errors = validateH5Design(result, { resolved: true })
  if (errors.length) throw new Error(errors[0])
  return result
}
