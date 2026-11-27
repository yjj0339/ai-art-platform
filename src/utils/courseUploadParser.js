import JSZip from 'jszip'

const CATEGORY_OPTIONS = [
  { label: '门头设计', value: 'storefront' },
  { label: 'LOGO设计', value: 'logo' },
  { label: 'IP形象设计', value: 'ip' },
  { label: '广告设计', value: 'ad' },
  { label: '漫画人物设计', value: 'anime' },
  { label: '产品设计', value: 'product' },
  { label: '室内设计', value: 'interior' },
  { label: '汽车造型设计', value: 'car' },
  { label: '创意画', value: 'creative' },
  { label: '教育绘本', value: 'picturebook' },
  { label: '综合项目', value: 'project' },
]

const FIELD_LABELS = [
  '课程课题名称', '教学课题', '课题名称', '课程题目', '课程标题', '教案名称', '活动名称', '主题名称', '教学主题', '本课主题', '课程主题', '课程名称', '课程课题', '课题', '主题',
  '课程画面主题', '课程项目主题', '作品主题', '课程类型', '课程分类', '项目类型', '类型', '分类', '难度/适龄', '难度 / 适龄', '难度适龄', '难度',
  '适龄范围', '适合年龄', '课程年龄阶段', '适用年龄', '适用年级', '适龄', '年龄段', '课程简介', '课程介绍', '课程说明', '课程内容简介',
  '课程概述', '课程概况', '课程摘要', '课程导语', '课程背景', '课程亮点', '教学内容', '教学说明', '教学简介', '本课简介', '简介', '介绍',
  '教学目标', '课程目标', '教学重点', '课程回顾主题', '趣味问答', '课堂问答', '互动问答', '课程问答', '引导问题', '引导性选择题', '选择题',
  '作业任务', '课堂互动', '问题', '提问', '设计尺寸', '尺寸规格', '必备元素', '需要元素', '形象来源', '设计来源', '风格要求', '使用场景',
]

const choiceLabels = ['A', 'B', 'C', 'D']
const optionLabelMap = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  1: 'A',
  2: 'B',
  3: 'C',
  4: 'D',
  '①': 'A',
  '②': 'B',
  '③': 'C',
  '④': 'D',
}

function categoryLabel(value) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || '综合项目'
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeXmlEntities(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

function stripMarkdownDecorators(value) {
  return String(value || '')
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[（(]?\d+[）).、]\s*/, '')
    .replace(/^\s*[（(]?[一二三四五六七八九十]+[）).、]\s*/, '')
    .replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
    .trim()
}

function cleanFieldValue(value) {
  return stripMarkdownDecorators(value)
    .replace(/^[:：|｜\-\s]+/, '')
    .replace(/^["“”'《]+|["“”'》]+$/g, '')
    .trim()
}

function normalizeDocumentText(source) {
  const labelPattern = FIELD_LABELS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  return String(source || '')
    .replace(/\r/g, '\n')
    .replace(new RegExp(`\\s+(${labelPattern})\\s*[:：]`, 'g'), '\n$1：')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeFieldLabel(value) {
  return stripMarkdownDecorators(value)
    .replace(/^#+\s*/, '')
    .replace(/[：:|｜\-\s]/g, '')
    .trim()
}

function getDocumentTableValue(source, labels) {
  const normalizedLabels = labels.map(normalizeFieldLabel).filter(Boolean)
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)

  for (const line of lines) {
    const cells = line.split(/[|｜]/).map((cell) => cleanFieldValue(cell)).filter(Boolean)
    if (cells.length < 2) continue
    for (let index = 0; index < cells.length - 1; index += 1) {
      const label = normalizeFieldLabel(cells[index])
      if (normalizedLabels.includes(label)) return cleanFieldValue(cells[index + 1])
    }
  }
  return ''
}

function getDocumentField(source, labels) {
  const tableValue = getDocumentTableValue(source, labels)
  if (tableValue) return tableValue

  const labelPattern = labels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const allLabelPattern = FIELD_LABELS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^(?:${labelPattern})(?:\\s*[:：|｜\\-—]\\s*|\\s+)?(.*)$`, 'i'))
    if (!match) continue
    let value = (match[1] || '').trim()
    if (!value) {
      const nextLine = lines[index + 1] || ''
      if (!new RegExp(`^(?:${allLabelPattern})(?:\\s*[:：|｜\\-—]|\\s+|$)`, 'i').test(nextLine)) value = nextLine.trim()
    }
    return cleanFieldValue(value.replace(new RegExp(`\\s+(?:${allLabelPattern})\\s*[:：].*$`, 'i'), ''))
  }
  return ''
}

function hasDocumentField(source, labels) {
  return Boolean(getDocumentField(source, labels))
}

function isQuestionSectionTitle(line) {
  return /^(趣味问答|课堂问答|互动问答|课程问答|课程回顾|课程回顾主题|引导问题|引导性选择题|选择题|问题|提问)\b/.test(line)
}

function getDocumentSection(source, labels, maxLines = 4) {
  const labelPattern = labels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const allLabelPattern = FIELD_LABELS
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^(?:${labelPattern})(?:\\s*[:：|｜\\-—]\\s*|\\s+)?(.*)$`, 'i'))
    if (!match) continue
    const result = []
    if ((match[1] || '').trim()) result.push(cleanFieldValue(match[1]))
    for (let offset = index + 1; offset < lines.length && result.length < maxLines; offset += 1) {
      const line = lines[offset]
      if (/^(?:[一二三四五六七八九十]+、|第.+[章节]|课程基本信息|教学流程|课堂流程)/.test(line)) break
      if (isQuestionSectionTitle(line)) break
      if (new RegExp(`^(?:${allLabelPattern})(?:\\s*[:：|｜\\-—]|\\s+|$)`, 'i').test(line)) break
      result.push(line)
    }
    return result.join('；').replace(/\s+/g, ' ').trim()
  }
  return ''
}

function getDocumentLineValue(source, labels) {
  const tableValue = getDocumentTableValue(source, labels)
  if (tableValue) return tableValue

  const labelPattern = labels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)
  for (const line of lines) {
    const match = line.match(new RegExp(`^(?:${labelPattern})(?:\\s*[:：|｜\\-—]\\s*|\\s+)(.+)$`, 'i'))
    if (match?.[1]) return cleanFieldValue(match[1])
  }
  return ''
}

function getDocumentHeadingTitle(source) {
  const lines = String(source || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines.slice(0, 12)) {
    const rawHeading = line.match(/^\s{0,3}#{1,6}\s*(.+)$/)
    const candidate = stripMarkdownDecorators(rawHeading ? rawHeading[1] : line)
    if (!candidate || /^(一|二|三|四|五|六|七|八|九|十)、/.test(candidate)) continue
    if (/^(课程基本信息|教学目标|教学重点|教学流程|课程流程|趣味问答|课堂问答|课程回顾|作业任务)/.test(candidate)) continue
    const titleMatch = candidate.match(/(?:视频教案|课程教案|教案|课程标题|课程题目|课题名称|课程主题|课程课题|课题|主题)\s*[:：]\s*[《“"]?(.+?)[》”"]?$/)
    if (titleMatch?.[1]) return cleanFieldValue(titleMatch[1])
    if (/[《“"].+[》”"]/.test(candidate)) return cleanFieldValue(candidate.replace(/^.*?[《“"](.+?)[》”"].*$/, '$1'))
  }
  return ''
}

function inferCategoryFromText(source, explicitValue = '', fallback = 'project') {
  const text = `${explicitValue}\n${source || ''}`
  const explicitMatch = CATEGORY_OPTIONS.find((item) => text.includes(item.label) || text.includes(item.value))
  if (explicitMatch) return explicitMatch.value

  const keywordGroups = [
    { value: 'storefront', words: ['门头', '招牌', '店铺', '商铺', '橱窗'] },
    { value: 'logo', words: ['logo', '标志', '商标'] },
    { value: 'ip', words: ['IP形象', '吉祥物', '角色形象', '品牌形象'] },
    { value: 'ad', words: ['广告', '海报', '宣传', '版式'] },
    { value: 'anime', words: ['漫画', '人物', '角色设计', '分镜'] },
    { value: 'product', words: ['产品', '包装', '器物', '商品'] },
    { value: 'interior', words: ['室内', '空间', '家居', '软装'] },
    { value: 'car', words: ['汽车', '车身', '交通工具', '造型设计'] },
    { value: 'picturebook', words: ['绘本', '故事书', '儿童故事', '插画书'] },
    { value: 'creative', words: ['梵高', '星月夜', '名画', '色彩', '笔触', '创意表达', '情绪表达', '创意画'] },
  ]
  return keywordGroups.find((group) => group.words.some((word) => text.includes(word)))?.value || fallback || 'project'
}

// 级别识别：只按文档里写明的级别词判断，不再从年龄、年级反推。
// 级别和年龄无关，同一个级别任何年龄段都能用，所以这里一个「岁」字都不出现。
// 顺序从高到低：文档同时写「高级/进阶」时取更高的那个，避免一份进阶教案被判成入门。
function inferDifficultyLevel(source, explicitValue = '') {
  const text = `${explicitValue}
${source || ''}`
  const rules = [
    { pattern: /高级|专业级|专业版|大师|全参数/, label: '高级' },
    { pattern: /进阶|提高|提升|创作级/, label: '进阶' },
    { pattern: /入门|基础|初学|零基础/, label: '入门' },
    { pattern: /初级|启蒙|体验|亲子/, label: '初级' },
  ]
  const hit = rules.find((rule) => rule.pattern.test(text))
  return hit ? hit.label : ''
}

function cleanCourseSnippet(value, maxLength = 80) {
  return stripMarkdownDecorators(value)
    .replace(/[|｜]/g, '，')
    .replace(/\s+/g, ' ')
    .replace(/[。；;]\s*$/, '')
    .slice(0, maxLength)
}

function normalizeChoiceMarker(value) {
  const raw = String(value || '').trim().replace(/^[选项\s]*/g, '').replace(/[.、)）:：-]$/g, '')
  return optionLabelMap[raw.toUpperCase()] || optionLabelMap[raw] || ''
}

function hasOptionMarker(value) {
  return Boolean(normalizeChoiceMarker(value))
}

function defaultDesignRequirements(category = 'storefront') {
  const presets = {
    storefront: ['横向门头画面，招牌文字清晰可读', '店名、招牌、入口、橱窗或产品符号', '从店铺商品、品牌名称和目标顾客中提取', '亲和、醒目，与店铺定位一致', '实体门店门头与品牌展示'],
    ip: ['完整角色正面稿，缩小后仍容易识别', '角色轮廓、表情、标志配件和主色', '从动物、植物、食物或品牌故事中提取', '造型简洁、特点明确、方便延展动作', '海报、周边、表情包和品牌宣传'],
  }
  const values = presets[category] || ['适合课程最终作品展示', '主题主体、核心文字和必要装饰', '从课程主题与真实需求中提取', '层级清晰，符合目标人群', '课程展示与作品集归档']
  return ['尺寸规格', '必备元素', '形象来源', '风格要求', '使用场景'].map((label, index) => ({ label, value: values[index] }))
}

function buildDescriptionFromCourseText(source, category, title) {
  const descriptionLabels = ['课程内容简介', '课程简介', '课程介绍', '课程说明', '课程概述', '课程概况', '课程摘要', '课程导语', '课程背景', '课程亮点', '教学内容', '教学说明', '教学简介', '本课简介', '简介', '介绍']
  const explicitDescription = getDocumentTableValue(source, descriptionLabels)
    || getDocumentSection(source, descriptionLabels, 5)
    || getDocumentField(source, descriptionLabels)
  if (explicitDescription) return explicitDescription

  const theme = getDocumentField(source, ['课程画面主题', '课程项目主题', '课程回顾主题', '作业任务'])
  const goal = getDocumentSection(source, ['教学目标', '课程目标'], 3)
  const focus = getDocumentSection(source, ['教学重点'], 2)
  const categoryName = categoryLabel(category)
  const subject = cleanCourseSnippet(title || theme || categoryName, 42)
  const goalText = cleanCourseSnippet(goal, 70)
  const focusText = cleanCourseSnippet(focus, 55)

  if (goalText || focusText || theme) {
    return [
      `本课程围绕${subject}展开`,
      goalText ? `引导用户${goalText}` : `引导用户观察${categoryName}中的造型、色彩和视觉表达`,
      focusText ? `重点训练${focusText}` : '完成观察、构思与AI绘画创作',
    ].join('，') + '。'
  }
  return `本课程围绕${categoryName}展开，引导用户从画面主题、色彩关系和创作表达中整理设计思路，并完成AI绘画创作。`
}

function parseChoiceQuestions(value) {
  return String(value || '').split('\n').map((line) => parsePipeChoiceLine(line)).filter(Boolean)
}

function parsePipeChoiceLine(line) {
    const parts = line.split(/[|｜]/).map((item) => item.trim()).filter(Boolean)
    if (!parts.length) return null
    const labeledOptionIndex = parts.findIndex((part) => hasOptionMarker(part))
    if (labeledOptionIndex > 0) {
      const title = parts.slice(0, labeledOptionIndex).join(' ')
      const options = {}
      let answer = 'A'
      for (let index = labeledOptionIndex; index < parts.length; index += 1) {
        if (/^(?:正确答案|答案|参考答案)$/i.test(parts[index]) && parts[index + 1]) {
          answer = normalizeChoiceMarker(parts[index + 1]) || answer
          index += 1
          continue
        }
        const label = normalizeChoiceMarker(parts[index])
        if (label && parts[index + 1]) {
          options[label] = cleanFieldValue(parts[index + 1])
          index += 1
          continue
        }
        const answerMatch = parts[index].match(/^(?:正确答案|答案|参考答案)\s*[:：]?\s*([ABCD]|[1-4]|[①②③④])$/i)
        if (answerMatch) answer = normalizeChoiceMarker(answerMatch[1]) || 'A'
      }
      const optionList = choiceLabels.map((label) => options[label]).filter(Boolean)
      if (title && optionList.length >= 4) {
        return {
          type: 'choice',
          title: normalizeQuestionTitle(title),
          options: optionList.slice(0, 4),
          answer,
        }
      }
    }
    const [title, optionA = '突出品牌特点', optionB = '随意装饰', optionC = '只写文字', optionD = '忽略主题要求', answer = 'A'] = parts
    return {
      type: 'choice',
      title,
      options: [optionA, optionB, optionC, optionD],
      answer: choiceLabels.includes(String(answer).toUpperCase()) ? String(answer).toUpperCase() : 'A',
    }
}

function normalizeQuestionTitle(value) {
  return cleanFieldValue(value)
    .replace(/^(?:Q\s*)?\d+\s*[.、)）:：-]\s*/i, '')
    .replace(/^(?:问题|提问|题目|问答|选择题)\s*\d*\s*[:：.、-]?\s*/i, '')
    .trim()
}

function normalizeOptionLine(value) {
  const line = cleanFieldValue(value)
  const match = line.match(/^(?:选项\s*)?([ABCD]|[1-4]|[①②③④])\s*[.、)）:：-]?\s*(.+)$/i)
  const label = match ? optionLabelMap[String(match[1]).toUpperCase()] || optionLabelMap[match[1]] : ''
  return match && label ? { label, text: cleanFieldValue(match[2]) } : null
}

function normalizeAnswerLine(value) {
  const line = cleanFieldValue(value)
  const match = line.match(/^(?:正确答案|答案|参考答案)\s*[:：]?\s*([ABCD]|[1-4]|[①②③④])/i)
  const raw = match?.[1] ? String(match[1]).toUpperCase() : ''
  return optionLabelMap[raw] || optionLabelMap[match?.[1]] || ''
}

function parseInlineChoiceQuestion(line) {
  const text = cleanFieldValue(line)
  const answerMatch = text.match(/(?:正确答案|答案|参考答案)\s*[:：]?\s*([ABCD]|[1-4]|[①②③④])/i)
  const answer = normalizeAnswerLine(text) || normalizeChoiceMarker(answerMatch?.[1])
  const compact = text
    .replace(/(?:正确答案|答案|参考答案)\s*[:：]?\s*([ABCD]|[1-4]|[①②③④]).*$/i, '')
    .replace(/([^\s；;，,])([ABCD]|[1-4]|[①②③④])([.、)）:：-])/g, '$1 $2$3')
    .replace(/\s+/g, ' ')
  const match = compact.match(/(.+?)[\s；;，,]*(?:A|1|①)[.、)）:：-]?\s*(.+?)[\s；;，,]+(?:B|2|②)[.、)）:：-]?\s*(.+?)[\s；;，,]+(?:C|3|③)[.、)）:：-]?\s*(.+?)[\s；;，,]+(?:D|4|④)[.、)）:：-]?\s*(.+)$/i)
  if (!match) return null
  return {
    type: 'choice',
    title: normalizeQuestionTitle(match[1]),
    options: [cleanFieldValue(match[2]), cleanFieldValue(match[3]), cleanFieldValue(match[4]), cleanFieldValue(match[5])],
    answer: choiceLabels.includes(answer) ? answer : 'A',
  }
}

function isLikelySectionTitle(line) {
  return /^(?:[一二三四五六七八九十]+、|第.+[章节]|课程基本信息|课程目标|教学目标|教学重点|教学难点|教学流程|课堂流程|作业任务|课程简介|课程介绍|课程说明|课件内容|课程总结|素材准备)/.test(line)
}

function parseChoiceQuestionsFromSection(source) {
  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)
  const sectionLines = []
  let inQuestionSection = false

  for (const line of lines) {
    if (isQuestionSectionTitle(line)) {
      inQuestionSection = true
      const afterTitle = line.replace(/^(趣味问答|课堂问答|互动问答|课程问答|课程回顾|课程回顾主题|引导问题|引导性选择题|选择题|问题|提问)\s*[:：]?\s*/, '').trim()
      if (afterTitle) sectionLines.push(afterTitle)
      continue
    }
    if (inQuestionSection && isLikelySectionTitle(line)) break
    if (inQuestionSection) sectionLines.push(line)
  }

  const candidates = sectionLines.length ? sectionLines : lines
  const questions = []
  let current = null
  const flush = () => {
    if (!current?.title) return
    const options = choiceLabels.map((label) => current.options[label]).filter(Boolean)
    if (options.length >= 4) {
      questions.push({
        type: 'choice',
        title: current.title,
        options: options.slice(0, 4),
        answer: choiceLabels.includes(current.answer) ? current.answer : 'A',
      })
    }
    current = null
  }

  for (const line of candidates) {
    const inlineQuestion = parseInlineChoiceQuestion(line)
    if (inlineQuestion?.title && inlineQuestion.options.length >= 4) {
      flush()
      questions.push(inlineQuestion)
      continue
    }
    const option = normalizeOptionLine(line)
    if (option) {
      if (!current) current = { title: '', options: {}, answer: 'A' }
      current.options[option.label] = option.text
      continue
    }
    const answer = normalizeAnswerLine(line)
    if (answer) {
      if (!current) current = { title: '', options: {}, answer: 'A' }
      current.answer = answer
      continue
    }
    const questionTitle = /[?？]$/.test(line) || /^(?:Q\s*)?\d+\s*[.、)）:：-]|^(?:问题|提问|题目|问答|选择题)/i.test(line)
      ? normalizeQuestionTitle(line)
      : ''
    if (questionTitle) {
      flush()
      current = { title: questionTitle, options: {}, answer: 'A' }
    }
  }
  flush()
  return questions.slice(0, 6)
}

function buildQuestionsFromCourseText(source, category, title) {
  const pipeQuestions = String(source || '').split(/\r?\n/).filter((line) => line.split(/[|｜]/).filter(Boolean).length >= 5)
  const parsedPipeQuestions = parseChoiceQuestions(pipeQuestions.join('\n'))
  if (parsedPipeQuestions.length) return parsedPipeQuestions

  const sectionQuestions = parseChoiceQuestionsFromSection(source)
  if (sectionQuestions.length) return sectionQuestions

  const lines = normalizeDocumentText(source).split(/\n+/).map((line) => stripMarkdownDecorators(line)).filter(Boolean)
  const extracted = []
  let inQuestionSection = false
  for (const line of lines) {
    if (/趣味问答|课程回顾主题|课堂互动|问题|提问|问答|选择题/.test(line)) inQuestionSection = true
    if (inQuestionSection && /[?？]/.test(line)) {
      const questionTitle = line
        .replace(/^(趣味问答|课程回顾主题|课堂互动|问题|提问|问答|选择题)\s*[:：]?\s*/, '')
        .replace(/^[ABC]\s*[.、]\s*/, '')
        .trim()
      if (questionTitle.length >= 6) {
        extracted.push({
          type: 'choice',
          title: questionTitle,
          options: ['结合课程内容认真观察', '随意选择喜欢的效果', '只看图片大小', '忽略课程主题要求'],
          answer: 'A',
        })
      }
    }
    if (extracted.length >= 3) break
    if (inQuestionSection && /^(?:[一二三四五六七八九十]+、|第.+[章节]|作业任务|教学流程)/.test(line)) inQuestionSection = false
  }
  if (extracted.length) return extracted

  const subject = cleanCourseSnippet(title || categoryLabel(category), 36)
  const categoryName = categoryLabel(category)
  return [
    { type: 'choice', title: '这节课主要围绕什么主题展开观察与创作？', options: [subject, '页面按钮位置', '文件保存方式', '浏览器地址'], answer: 'A' },
    { type: 'choice', title: `学习${subject}时，最需要关注哪一类画面信息？`, options: ['色彩、造型、笔触和情绪表达', '图片文件名', '屏幕亮度', '登录账号'], answer: 'A' },
    { type: 'choice', title: '把课堂内容转成AI绘画提示词时，应该写清楚什么？', options: [`${categoryName}主题、风格、色彩和细节`, '只写生成图片', '只写好看', '只写快一点'], answer: 'A' },
  ]
}

function decodeDocumentXml(value) {
  return decodeXmlEntities(String(value || '')
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ''))
}

function extractDocxTextFragment(fragment) {
  const textRuns = [...String(fragment || '').matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlEntities(match[1]))
  const text = textRuns.length ? textRuns.join('') : decodeDocumentXml(fragment)
  return text.replace(/\s+/g, ' ').trim()
}

function extractDocxCellText(cellXml) {
  const paragraphs = [...String(cellXml || '').matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => extractDocxTextFragment(match[0]))
    .filter(Boolean)
  return (paragraphs.length ? paragraphs.join(' ') : extractDocxTextFragment(cellXml)).trim()
}

function extractDocxTextFromXml(xml) {
  const source = String(xml || '')
  const tableBlocks = [...source.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)].map((match) => match[0])
  const tableLines = tableBlocks.flatMap((tableXml) => (
    [...tableXml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)].map((rowMatch) => {
      const cells = [...rowMatch[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)]
        .map((cellMatch) => extractDocxCellText(cellMatch[0]))
        .filter(Boolean)
      return cells.join('｜')
    }).filter(Boolean)
  ))

  const withoutTables = source.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g, '\n')
  const paragraphLines = [...withoutTables.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => extractDocxTextFragment(match[0]))
    .filter(Boolean)

  return [...tableLines, ...paragraphLines].join('\n').trim()
}

async function readZipText(zip, path) {
  const entry = zip.file(path)
  return entry ? entry.async('text') : ''
}

export async function readCourseDocumentText(file) {
  const fileName = String(file?.name || '').toLowerCase()
  if (!file) return ''
  if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
    throw new Error('旧版 .doc 暂不支持前端直接解析，请另存为 .docx 后上传')
  }
  if (file.type === 'text/plain' || fileName.endsWith('.txt')) return file.text()

  if (fileName.endsWith('.docx')) {
    const archive = await JSZip.loadAsync(await file.arrayBuffer())
    const documentXml = archive.file('word/document.xml')
    if (!documentXml) return ''
    return extractDocxTextFromXml(await documentXml.async('text'))
  }

  if (fileName.endsWith('.pdf')) {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const pages = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent()
      pages.push(content.items.map((item) => item.str).join(' '))
    }
    return normalizeDocumentText(pages.join('\n'))
  }

  return ''
}

export async function readCoursePptPages(file) {
  const name = String(file?.name || '').toLowerCase()
  if (!file || !name.endsWith('.pptx')) return []
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return Promise.all(slidePaths.slice(0, 12).map(async (path, index) => {
    const xml = await readZipText(zip, path)
    const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXmlEntities(match[1]).trim())
      .filter(Boolean)
      .join(' ')
    return {
      title: text.split(/[。！？!?]/)[0]?.slice(0, 40) || `课程页 ${index + 1}`,
      body: text.slice(0, 240),
    }
  }))
}

function buildPptPagesFromCourse(category) {
  return [
    { title: '课程导入', body: `认识${categoryLabel(category)}的真实应用场景和设计目标` },
    { title: '观察分析', body: '从品牌、用户、场景、色彩中提取设计关键词' },
    { title: '创作任务', body: '把观察结果整理成AI绘画提示词并生成作品' },
  ]
}

export function parseCourseDocument(source, fileName, defaults = {}) {
  const documentText = String(source || '')
  const normalizedText = normalizeDocumentText(documentText)
  const textLength = normalizedText.replace(/\s/g, '').length
  const explicitCategory = getDocumentField(documentText, ['课程类型', '课程分类', '项目类型', '类型', '分类'])
  const category = inferCategoryFromText(`${documentText}\n${fileName}`, explicitCategory, defaults.category)
  const categoryName = categoryLabel(category)
  const titleLabels = ['课程课题名称', '教学课题', '课题名称', '课程题目', '课程标题', '教案名称', '活动名称', '主题名称', '教学主题', '本课主题', '课程主题', '课程名称', '课程课题', '课题']
  const explicitTitle = getDocumentLineValue(documentText, titleLabels) || getDocumentField(documentText, titleLabels)
  const headingTitle = getDocumentHeadingTitle(documentText)
  const themeTitle = getDocumentField(documentText, ['课程画面主题', '课程项目主题', '课程回顾主题', '作业任务'])
  const title = explicitTitle || headingTitle || themeTitle || `${categoryName}趣味课程`
  const explicitDifficulty = getDocumentField(documentText, ['难度/适龄', '难度 / 适龄', '难度适龄', '难度', '适龄范围', '适合年龄', '适龄', '年龄段'])
  const ageStage = getDocumentField(documentText, ['课程年龄阶段', '适用年龄', '适用年级'])
  const difficulty = explicitDifficulty || inferAgeDifficulty(documentText, ageStage) || defaults.difficulty || '少儿基础 · 8-10岁'
  const description = buildDescriptionFromCourseText(documentText, category, title)
  const questions = buildQuestionsFromCourseText(documentText, category, title)
  const designRequirements = [
    { label: '尺寸规格', value: getDocumentField(documentText, ['设计尺寸', '尺寸规格']) },
    { label: '必备元素', value: getDocumentField(documentText, ['必备元素', '需要元素']) },
    { label: '形象来源', value: getDocumentField(documentText, ['形象来源', '设计来源']) },
    { label: '风格要求', value: getDocumentField(documentText, ['风格要求']) },
    { label: '使用场景', value: getDocumentField(documentText, ['使用场景']) },
  ]
  const defaultsRequirements = defaultDesignRequirements(category)
  designRequirements.forEach((item, index) => {
    if (!item.value) item.value = defaultsRequirements[index].value
  })
  const fieldCount = [
    Boolean(explicitTitle || headingTitle || themeTitle),
    Boolean(explicitCategory || category !== defaults.category),
    Boolean(explicitDifficulty || ageStage || inferAgeDifficulty(documentText)),
    hasDocumentField(documentText, ['课程内容简介', '课程简介', '课程介绍', '课程说明', '课程概述', '课程概况', '课程摘要', '课程导语', '课程背景', '课程亮点', '教学内容', '教学说明', '教学简介', '本课简介', '简介', '介绍', '教学目标', '课程目标', '教学重点']),
  ].filter(Boolean).length
  const parseMode = fieldCount ? 'fields' : (textLength >= 120 ? 'inferred' : 'failed')

  return {
    title,
    category,
    difficulty,
    description,
    questions,
    designRequirements,
    pptPages: buildPptPagesFromCourse(category),
    fieldCount,
    textLength,
    parseMode,
    preview: normalizedText.split(/\n+/).slice(0, 4).join(' / ').slice(0, 160),
  }
}
