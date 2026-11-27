const STORY_LAYOUT = 'product-design-story'

function pickUrl(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.preview || item.cover || item.thumbnail || item.imageUrl || item.previewUrl || item.url || item.src || ''
}

function finalArtwork(project = {}) {
  const final = (project.versions || []).find((item) => item.id === project.finalVersionId) || project.versions?.[0]
  return pickUrl(final) || pickUrl(project.cover)
}

function compact(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function makePage(data) {
  return {
    layoutVariant: `${data.storyStep}-student-product-a`,
    backgroundStyle: 'blueprint-paper',
    character: { assetKey: 'student-guide-v1', pose: data.pose, position: 'right-bottom' },
    narration: { original: data.original || data.text, polished: data.text, highlight: data.highlight || '' },
    slots: data.slots || {},
    cards: data.cards || [],
    ...data,
  }
}

export function isProductDesignStory(template = {}) {
  return template?.layout === STORY_LAYOUT
}

export function productDesignStoryPages(project = {}, report = {}, template = {}) {
  const assignments = project.h5LayoutDraft?.assignments || {}
  const assigned = (slot, fallback = '') => pickUrl(assignments[slot]) || fallback
  const references = (project.referenceImages || []).map(pickUrl).filter(Boolean)
  const versions = (project.versions || []).map(pickUrl).filter(Boolean)
  const final = assigned('story-cover.hero', assigned('cover', finalArtwork(project)))
  const sketchOriginal = assigned('story-sketch.original', assigned('sketch-original', project.sketchOriginal || ''))
  const sketchRefined = assigned('story-sketch.refined', assigned('sketch', project.sketchOptimized || sketchOriginal))
  const model = assigned('story-model.hero', assigned('model', pickUrl(project.models3d?.[0])))
  const video = pickUrl(project.videos?.[0])
  const studentName = project.studentName || '林同学'
  const projectTitle = project.title && project.title !== '新的AI绘画项目' ? project.title : '我的产品设计'
  const idea = compact(report.idea || project.reportIdea || project.ideaSummary || project.courseIdeaText, '我先从生活里的观察开始，把自己最想解决的问题画下来。')
  const selectedVariants = versions.slice(0, 3)
  const inspiration = assigned('story-inspiration.hero', assigned('inspiration', references[0] || sketchOriginal || final))
  const scene = assigned('story-scene.hero', assigned('scene', references[1] || final))
  const processTimeline = [references[0], sketchOriginal, selectedVariants[0], model || final, final].filter(Boolean)

  const pageDesign = (key) => template.pageDesigns?.[key] || {}
  const decorate = (page) => {
    const design = pageDesign(page.storyStep)
    return {
      ...page,
      layoutVariant: design.variant || page.layoutVariant,
      backgroundStyle: design.backgroundStyle || page.backgroundStyle,
      character: { ...page.character, pose: design.characterPose || page.character?.pose, position: design.characterPosition || page.character?.position },
      disabledByTemplate: design.enabled === false,
    }
  }

  const basePages = [
    makePage({
      id: 'story-cover', type: 'cover', storyStep: 'cover', label: '这是我的设计', eyebrow: '我的产品设计故事', pose: 'presenting',
      title: projectTitle,
      text: `大家好，我是${studentName}。这是我设计的作品，我想从自己的灵感、修改过程和最后的选择开始讲起。`,
      highlight: '这是我自己一步一步完成的设计。', src: final,
      images: [final, assigned('story-cover.detail', sketchOriginal), assigned('story-cover.material', references[0])].filter(Boolean),
      slots: { hero: { sourceType: 'finalWork', src: final }, detailA: { sourceType: 'sketch', src: sketchOriginal } },
    }),
    makePage({
      id: 'story-inspiration', type: 'inspiration', storyStep: 'inspiration', label: '我的灵感从哪里来', eyebrow: '生活观察', pose: 'thinking',
      title: '我的灵感从哪里来', text: idea, highlight: '我把生活里的发现，变成了设计的起点。', src: inspiration,
      images: [inspiration, assigned('story-inspiration.detail', references[1]), assigned('story-inspiration.sketch', sketchOriginal)].filter(Boolean),
      slots: { hero: { sourceType: 'reference', src: inspiration }, detailA: { sourceType: 'sketch', src: sketchOriginal } },
    }),
    makePage({
      id: 'story-problem', type: 'problem', storyStep: 'problem', label: '我想解决的问题', eyebrow: '设计目标', pose: 'pointing',
      title: '我想解决的问题', text: '我希望我的设计可以帮助真正使用它的人，让原来不方便、不安全或不够舒服的地方，变得更轻松一点。',
      highlight: '我先想清楚：我要帮助谁？', src: assigned('story-problem.hero', assigned('problem', references[1] || inspiration || final)),
      images: [assigned('story-problem.context', references[0]), assigned('story-problem.hero', references[1] || inspiration), final].filter(Boolean),
      cards: ['我观察到的困难', '我想帮助的人', '我的设计目标'],
    }),
    makePage({
      id: 'story-sketch', type: 'sketch', storyStep: 'sketch', label: '我画下第一版想法', eyebrow: '草图与修改', pose: 'drawing',
      title: '我画下第一版想法', text: compact(project.sketchComment, '我先用草图记录结构和比例，再把不满意的地方圈出来，一点一点调整成更接近我想法的样子。'),
      highlight: '第一版不完美，但它让我知道下一步怎么改。', src: sketchRefined || sketchOriginal || final,
      images: [sketchOriginal, sketchRefined, final].filter(Boolean),
      slots: { hero: { sourceType: 'sketch', src: sketchOriginal }, detailA: { sourceType: 'sketch', src: sketchRefined } },
    }),
    makePage({
      id: 'story-ai', type: 'ai', storyStep: 'ai', label: '我和AI一起试方案', eyebrow: '方案比较', pose: 'comparing',
      title: '我和AI一起试方案', text: project.prompt ? `我把自己的想法整理成提示词，再比较不同方案。我保留了最符合原来构想的造型和细节。` : '我比较了不同的AI方案，保留最符合自己原来想法的造型和细节。',
      highlight: 'AI帮我尝试，我自己做选择。', src: assigned('story-ai.a', assigned('ai-1', selectedVariants[0] || final)),
      images: [assigned('story-ai.a', selectedVariants[0]), assigned('story-ai.b', selectedVariants[1]), assigned('story-ai.c', selectedVariants[2])].filter(Boolean),
      cards: ['我选择了它', '我保留了什么', '我放弃了什么'],
    }),
    makePage({
      id: 'story-model', type: 'model', storyStep: 'model', label: model ? '我把它做成立体的' : '我的结构与制作思考', eyebrow: model ? '3D验证' : '结构思考', pose: 'modeling',
      title: model ? '我把它做成立体的' : '我怎样思考它的结构',
      text: model ? '变成立体以后，我从不同角度观察它的结构，也发现哪些细节还可以继续调整。' : '我还没有完成3D作品，但我已经在草图里思考了它的结构、空间和实际使用方式。',
      highlight: model ? '从平面到立体，我看见了新的问题。' : '即使没有3D，我也认真想过它怎样被做出来。', src: model || sketchRefined || final,
      images: model ? [model, assigned('story-model.detail', final), sketchRefined].filter(Boolean) : [sketchOriginal, sketchRefined, final].filter(Boolean),
      emptyTitle: '我的3D作品还在制作中', emptyText: '完成后，这里会自动展示不同角度和细节。',
    }),
    makePage({
      id: 'story-scene', type: 'scene', storyStep: 'scene', label: '我想象它真正被使用', eyebrow: '环境搭配', pose: 'explaining',
      title: '我想象它真正被使用', text: '我希望它能走进真实生活，让使用它的人觉得轻松、安心，也愿意多停下来看看周围。',
      highlight: '我希望它不只好看，也真的好用。', src: scene,
      images: [scene, assigned('story-scene.detail', final), assigned('story-scene.reference', references[0])].filter(Boolean),
    }),
    makePage({
      id: 'story-reflection', type: 'reflection', storyStep: 'reflection', label: '这是我的收获', eyebrow: '我的创作收获', pose: 'celebrating',
      title: '这是我的收获', text: compact(report.summary, '我最满意的是，我把一个最初的想法一步一步画出来、改出来，也讲清楚了它为什么是这个样子。'),
      highlight: '下次，我还想继续把它做得更好。', src: assigned('story-reflection.hero', assigned('reflection', final)),
      images: [assigned('story-reflection.hero', final), ...processTimeline].filter(Boolean), videoSrc: video,
      cards: ['我最满意的部分', '我遇到的困难', '下次我想继续改进'],
    }),
  ]

  const continuationPages = []
  if (references.length > 2) {
    continuationPages.push(makePage({ id: 'story-inspiration-more', type: 'inspiration', storyStep: 'inspiration', label: '更多灵感记录', eyebrow: '灵感续页', pose: 'thinking', title: '我还记录了这些发现', text: '这些观察让我继续调整颜色、比例和使用场景，让设计更接近我心里想象的样子。', highlight: '每一次观察，都让我的想法更清楚。', src: references[2], images: references.slice(2, 5) }))
  }
  if ((project.versions || []).length > 3) {
    continuationPages.push(makePage({ id: 'story-ai-more', type: 'ai', storyStep: 'ai', label: '更多方案比较', eyebrow: '方案续页', pose: 'comparing', title: '我继续比较不同方案', text: '我把更多版本放在一起看，最后只保留真正能帮助我表达设计目标的选择。', highlight: '选择不是越多越好，而是越符合自己的想法越好。', src: versions[3], images: versions.slice(3, 6), cards: ['继续比较', '保留重点', '做出选择'] }))
  }
  if ((project.models3d || []).length > 2) {
    continuationPages.push(makePage({ id: 'story-model-more', type: 'model', storyStep: 'model', label: '更多3D细节', eyebrow: '3D细节页', pose: 'modeling', title: '我继续查看立体细节', text: '我从更多角度观察结构和材质，让作品在变成立体后依然保持清楚和好用。', highlight: '细节会让设计真正站得住。', src: pickUrl(project.models3d?.[1]), images: (project.models3d || []).slice(1, 4).map(pickUrl) }))
  }
  if (references.length > 4) {
    continuationPages.push(makePage({ id: 'story-scene-more', type: 'scene', storyStep: 'scene', label: '更多使用场景', eyebrow: '场景续页', pose: 'explaining', title: '我想象更多使用方式', text: '不同的环境让我看见这个作品还可以怎样被使用，也让我继续思考什么才是真正贴心的设计。', highlight: '我希望它能在真实生活里帮上忙。', src: references[4], images: references.slice(4, 6) }))
  }
  const maxPages = Math.min(12, Math.max(6, Number(template.maxPages || report.maxPages || 12)))
  return [...basePages, ...continuationPages]
    .map(decorate)
    .filter((page) => !page.disabledByTemplate)
    .slice(0, maxPages)
}

export function productDesignStoryTemplate() {
  return {
    id: 'h5-product-design-story', name: '我的产品设计故事', layout: STORY_LAYOUT,
    description: '高级版用户用第一人称讲述产品灵感、草图、AI方案、3D验证与真实使用场景。',
    status: 'published', renderVersion: 2,
    theme: { primary: '#1559d6', secondary: '#0bd0e8', accent: '#f59a23', background: '#eef5ff', surface: '#ffffff', text: '#163565' },
    fontFamily: 'Microsoft YaHei', contentDensity: 'standard', coverImage: '/assets/h5-report/product-design-story.png',
    pageMode: 'paged', storyPreset: 'product-design-story', minPages: 6, maxPages: 12,
    pageDesigns: { cover: { enabled: true, variant: 'cover-student-product-a', backgroundStyle: 'blueprint-collage', characterPose: 'presenting', characterPosition: 'right-bottom' } },
    moduleOrder: ['cover', 'inspiration', 'problem', 'sketch', 'ai', 'model', 'scene', 'reflection'], hiddenModules: [],
    displayOptions: { studentInfo: true, chapterNav: true, social: true, download: true, official: true }, officialButtonText: '进入官网', officialUrl: '', builtIn: true,
  }
}
