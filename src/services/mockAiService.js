const mockGallery = [
  'linear-gradient(135deg, #ff7a00 0%, #ffd166 46%, #fff7ed 100%)',
  'linear-gradient(135deg, #36bffa 0%, #a7f3d0 52%, #f0f9ff 100%)',
  'linear-gradient(135deg, #f472b6 0%, #c084fc 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #34d399 0%, #60a5fa 48%, #ffffff 100%)',
]

function escapeXml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function shortText(value = '', max = 54) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function mockArtworkBackground({ prompt, style, difficulty, title, index }) {
  const palettes = [
    ['#ff7a00', '#ffd166', '#fff7ed'],
    ['#36bffa', '#a7f3d0', '#f0f9ff'],
    ['#f472b6', '#c084fc', '#fef3c7'],
    ['#34d399', '#60a5fa', '#ffffff'],
  ]
  const [start, mid, end] = palettes[index % palettes.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${start}"/><stop offset="52%" stop-color="${mid}"/><stop offset="100%" stop-color="${end}"/></linearGradient></defs>
    <rect width="1200" height="900" rx="44" fill="url(#bg)"/>
    <circle cx="980" cy="140" r="118" fill="#fff" opacity=".24"/><circle cx="210" cy="720" r="150" fill="#fff" opacity=".18"/>
    <rect x="118" y="155" width="964" height="590" rx="34" fill="#fff" opacity=".9"/>
    <text x="170" y="250" fill="#ff7a00" font-family="Microsoft YaHei, Arial" font-size="34" font-weight="800">示意图 · 未调用真实 AI</text>
    <text x="170" y="320" fill="#111827" font-family="Microsoft YaHei, Arial" font-size="58" font-weight="900">${escapeXml(title)}</text>
    <text x="170" y="395" fill="#334155" font-family="Microsoft YaHei, Arial" font-size="30" font-weight="700">风格/难度：${escapeXml(style || '课堂创作')} / ${escapeXml(difficulty || 'student')}</text>
    <rect x="170" y="455" width="860" height="150" rx="20" fill="#fff7ed"/>
    <text x="205" y="515" fill="#111827" font-family="Microsoft YaHei, Arial" font-size="30" font-weight="800">提示词摘要</text>
    <text x="205" y="570" fill="#475569" font-family="Microsoft YaHei, Arial" font-size="26">${escapeXml(shortText(prompt, 66))}</text>
    <text x="170" y="675" fill="#64748b" font-family="Microsoft YaHei, Arial" font-size="24">演示用：只用来走通流程，正式环境会换成真实 AI 出图。</text>
  </svg>`
  // 括号和单引号也要转义：页面会用 /url\(["']?([^"')]+)["']?\)/ 从这串里取图片地址，SVG 里的 url(#bg) 会把它截断
  const encoded = encodeURIComponent(svg).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `url("data:image/svg+xml;charset=utf-8,${encoded}") center / cover no-repeat`
}

export async function optimizePrompt({ prompt, strength }) {
  await new Promise((resolve) => setTimeout(resolve, 500))
  const toneMap = {
    safe: '保留原始想法，画面清晰、主体明确、适合少儿美术课堂展示',
    balanced: '增加色彩层次、构图细节和创意元素，保持儿童友好与视觉统一',
    creative: '强化想象力、故事感和场景氛围，加入明亮光影与可爱的艺术细节',
  }
  return `${prompt || '一个充满想象力的儿童AI绘画作品'}，${toneMap[strength] || toneMap.balanced}。`
}

export async function generateArtwork({ prompt, difficulty, style }) {
  await new Promise((resolve) => setTimeout(resolve, 1100))
  return mockGallery.map((background, index) => {
    const title = ['主作品', '梦幻配色', '卡通版本', '课堂展示版'][index]
    return {
      id: `mock-art-${Date.now()}-${index}`,
      title,
      prompt,
      promptSummary: shortText(prompt, 80),
      difficulty,
      style,
      background: mockArtworkBackground({ prompt, style, difficulty, title, index }),
      rawMockBackground: background,
      createdAt: new Date().toISOString(),
    }
  })
}

export async function organizeIdea({ answers, style = 'balanced' }) {
  await new Promise((resolve) => setTimeout(resolve, 650))
  const cleanAnswers = answers.map((item) => item || '还没有补充').join('；')
  return {
    summary: `这个作品围绕孩子的想法展开：${cleanAnswers}。整体表达清楚，适合继续发展成完整的AI绘画作品。`,
    prompt: `${cleanAnswers}，儿童美术课堂作品，主体明确，色彩明亮，细节丰富，${style === 'formal' ? '完整设计说明风格' : '保留儿童口语想象力'}。`,
  }
}

export async function optimizeSketch({ preview }) {
  await new Promise((resolve) => setTimeout(resolve, 800))
  return {
    original: preview,
    optimized: preview,
    score: 4,
    comment: '线条比较清晰，AI能较好识别。可以确认使用，也可以重新拍一张更清楚的草稿。',
    steps: ['扶正裁剪完成', '去除阴影完成', '线稿增强完成'],
  }
}

export async function createVariant({ baseArtwork, prompt, action }) {
  await new Promise((resolve) => setTimeout(resolve, 900))
  const background = mockGallery[Math.floor(Math.random() * mockGallery.length)]
  return {
    id: `version-${Date.now()}`,
    title: action || '修改版',
    prompt: `${prompt || baseArtwork?.prompt || 'AI创意作品'}，${action || '生成新的变化版本'}`,
    background,
    note: action || '一键变体',
    createdAt: new Date().toISOString(),
  }
}

export async function repaintLocalArea({ baseArtwork, prompt, brushSize }) {
  await new Promise((resolve) => setTimeout(resolve, 900))
  return {
    id: `version-${Date.now()}`,
    title: '局部重绘版',
    prompt: `${baseArtwork?.prompt || 'AI创意作品'}，局部修改：${prompt || '增加细节'}，画笔：${brushSize}`,
    background: baseArtwork?.background || mockGallery[0],
    note: `局部重绘：${prompt || '增加细节'}`,
    createdAt: new Date().toISOString(),
  }
}

export async function generateReportPages(project) {
  await new Promise((resolve) => setTimeout(resolve, 700))
  const finalVersion = project.versions?.find((item) => item.id === project.finalVersionId) || project.versions?.[0]
  return [
    { title: '封面页', subtitle: project.title || '我的AI创意作品', body: '用户名称：小画家阿橙｜班级：AI创意美术A班｜创作时间：今天', visual: finalVersion?.background || project.cover || 'linear-gradient(135deg, #ff7a00, #ffd166)' },
    { title: '我的创作想法', subtitle: '孩子原始构思 + AI整理说明', body: project.ideaSummary || project.prompt || '等待同步创作构思。' },
    { title: '创意从这里开始', subtitle: '手绘原创草图', body: project.sketchScore ? `草图评分：${project.sketchScore}星。${project.sketchComment || ''}` : '暂未使用草图。' },
    { title: '一步步变得更好看', subtitle: '创作优化过程', body: (project.versions || []).map((item, index) => `V${index + 1}：${item.note || item.title}`).join('\n') || '暂未生成版本记录。' },
    { title: '最终成果展示', subtitle: finalVersion?.title || '最终作品', body: finalVersion?.prompt || project.prompt || '等待选择最终版。', visual: finalVersion?.background },
    { title: 'AI 伙伴的小建议', subtitle: '色彩、构图、创意亮点', body: '色彩明亮，主体突出，创意表达积极。下一步可以继续增加背景故事和角色动作。' },
    { title: '讲师评语页', subtitle: '课堂点评预留', body: '评分：____  讲师评语：________________  讲师签字：____' },
    { title: '封底页', subtitle: 'AI辅助创意创作', body: '机构LOGO / 联系方式 / 二维码预留' },
  ]
}

export function createApiPlaceholders() {
  return {
    imageProvider: 'volcengine-doubao-image-placeholder',
    safetyProvider: 'volcengine-content-safety-placeholder',
    billingMode: 'token-framework-reserved',
  }
}
