/* AI 创作伙伴（智能体）运行时
 * ------------------------------------------------------------------
 * 一次对话请求的流程：
 *   1. 读配置 → 每日条数上限 → 敏感词检查 →（可选）按「AI 文字」计费
 *   2. 组装系统提示：人设 + 安全规则 + 工具说明 + 技能目录（+ 用户选定技能的完整说明）
 *   3. 以流式方式调用 OpenAI 兼容的 /chat/completions（带 tools），边收边通过 SSE 推给前端
 *   4. 模型要求调用工具时在服务端执行（出图、出视频、读技能、组装详情页、查玩法/课程…），
 *      把结果交回模型继续，最多 maxSteps 轮
 *   5. 保存用户消息与助手消息（含工具卡片、图片、视频任务、版面），记录调用日志
 *
 * 推给前端的 SSE 事件：meta / delta / replace / notice / tool / skill / image / video / layout / action / usage / done / error。
 *   replace = 风控把已输出的回复整段替换（打码或换成友好提示）；notice = 提醒（如因多次违规 AI 功能被暂停）。
 * 前端断开（点"停止"或关页面）时立即中止上游请求，已生成的部分以"已停止"状态保存。
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createParser } from 'eventsource-parser'
import { getSkillForRuntime, listPublishedSkills, recordSkillUse } from './agent-skill-store.js'
import { appendMessage, countUserMessagesToday, createConversation, getOwnConversation, listMessages } from './agent-conversation-store.js'

const RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16']
const VIDEO_RATIOS = ['16:9', '9:16', '1:1']
const STAFF_ROLES = new Set(['admin', 'teacher'])
const MAX_INPUT_CHARS = 1200
const MAX_ATTACHMENTS = 3
const HARD_MAX_IMAGES = 6
const MAX_LAYOUT_SECTIONS = 8
const IDLE_TIMEOUT_MS = Number(process.env.AGENT_IDLE_TIMEOUT_MS) > 0 ? Number(process.env.AGENT_IDLE_TIMEOUT_MS) : 60000

/** 前端可直接跳转的创作页面（suggest_tool 工具用）。 */
export const AGENT_TOOL_ROUTES = {
  paint: { label: 'AI 绘画', path: '/student/paint' },
  canvas: { label: '无限画布', path: '/student/canvas' },
  board: { label: '手绘画板', path: '/student/board' },
  scan: { label: '扫描草图', path: '/student/paint?scan=1' },
  video: { label: 'AI 视频', path: '/student/video' },
  model3d: { label: 'AI 3D', path: '/student/model3d' },
  courses: { label: '课程中心', path: '/student/courses' },
  gallery: { label: '作品广场', path: '/student/gallery' },
  portfolio: { label: '我的作品', path: '/student/portfolio' },
  prompts: { label: '提示词库', path: '/student/prompts' },
}

export const AGENT_TOOL_LABELS = {
  generate_image: '生成图片',
  generate_video: '生成视频',
  compose_page: '组装版面',
  load_skill: '使用技能',
  read_skill_resource: '查看技能资料',
  find_workflow: '查找创作玩法',
  search_prompt_library: '查找提示词',
  list_courses: '查找课程',
  list_my_works: '查看我的作品',
  suggest_tool: '推荐创作工具',
}

// 用户流露出伤心或伤害自己的念头时（风控词库里的「自伤关注」类），这一轮先关心人，不推进创作、不调用工具。
const CARE_NOTE = '【本轮特别提醒】对方刚才的话里可能流露出难过、想伤害自己或不想活下去的念头。这一轮请先放下创作任务：1. 用温柔、真诚的语气关心对方，告诉对方这些感受很重要，你愿意听；2. 建议对方马上和家人或信任的大人聊一聊，不要一个人扛着；3. 如果有危险或已经伤害到自己，请立刻告诉身边的大人，或拨打 110 / 120，也可以拨打全国心理援助热线 12356；4. 不要说教、不要追问细节、不要开玩笑，也不要调用任何工具。'
const TOOL_SWITCHES = ['generate_image', 'generate_video', 'compose_page', 'find_workflow', 'search_prompt_library', 'list_courses', 'list_my_works', 'suggest_tool']

export function defaultAgentConfig() {
  return {
    enabled: true,
    name: '小艺',
    avatar: '',
    greeting: '嗨，我是小艺，你的 AI 创作伙伴！想画什么、做什么，都可以告诉我～',
    persona: '你热爱艺术和设计，说话亲切、有耐心，善于把复杂的知识讲得简单有趣，会真诚地夸奖对方作品里的亮点。',
    provider: '',
    model: '',
    imageProvider: '',
    imageModel: '',
    temperature: 0.7,
    // 一轮里"读技能 → 出 4~5 张图 → 组装详情页 → 总结"需要 7~8 步，默认给到 8。
    maxSteps: 8,
    maxImagesPerTurn: 2,
    maxVideosPerTurn: 1,
    historyTurns: 8,
    maxReplyTokens: 1200,
    dailyMessageLimit: 100,
    vision: false,
    tools: Object.fromEntries(TOOL_SWITCHES.map((key) => [key, true])),
    // 文字对话成本很低，默认不扣积分（只限每日条数）；出图 / 出视频与平台其他入口一样按次计费。
    billing: { chargeTurns: false, chargeImages: true, chargeVideos: true },
    quickPrompts: ['帮我画一只会飞的小猫', '做一个商品详情页', '把我的画变成一段小视频'],
    blockedReply: '这个话题我们先不聊啦～换个创作的想法吧，比如画一画你最喜欢的动物？',
    updatedAt: '',
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max)
}

export function normalizeAgentConfig(input = {}) {
  const base = defaultAgentConfig()
  const source = input && typeof input === 'object' ? input : {}
  const tools = { ...base.tools }
  for (const key of TOOL_SWITCHES) {
    if (source.tools && typeof source.tools[key] === 'boolean') tools[key] = source.tools[key]
  }
  return {
    enabled: source.enabled !== false,
    name: cleanText(source.name, 16) || base.name,
    avatar: /^(\/api\/|\/assets\/|data:image\/)/.test(String(source.avatar || '')) ? String(source.avatar).slice(0, 300000) : '',
    greeting: cleanText(source.greeting, 200) || base.greeting,
    persona: cleanText(source.persona ?? base.persona, 2000),
    provider: cleanText(source.provider, 80),
    model: cleanText(source.model, 160),
    imageProvider: cleanText(source.imageProvider, 80),
    imageModel: cleanText(source.imageModel, 160),
    temperature: clampNumber(source.temperature, 0, 1.5, base.temperature),
    maxSteps: Math.round(clampNumber(source.maxSteps, 1, 10, base.maxSteps)),
    maxImagesPerTurn: Math.round(clampNumber(source.maxImagesPerTurn, 0, 4, base.maxImagesPerTurn)),
    maxVideosPerTurn: Math.round(clampNumber(source.maxVideosPerTurn, 0, 2, base.maxVideosPerTurn)),
    historyTurns: Math.round(clampNumber(source.historyTurns, 0, 20, base.historyTurns)),
    maxReplyTokens: Math.round(clampNumber(source.maxReplyTokens, 200, 4000, base.maxReplyTokens)),
    dailyMessageLimit: Math.round(clampNumber(source.dailyMessageLimit, 0, 1000, base.dailyMessageLimit)),
    vision: source.vision === true,
    tools,
    billing: {
      chargeTurns: source.billing?.chargeTurns === true,
      chargeImages: source.billing?.chargeImages !== false,
      chargeVideos: source.billing?.chargeVideos !== false,
    },
    quickPrompts: (Array.isArray(source.quickPrompts) ? source.quickPrompts : base.quickPrompts)
      .map((item) => cleanText(item, 40)).filter(Boolean).slice(0, 6),
    blockedReply: cleanText(source.blockedReply, 200) || base.blockedReply,
    updatedAt: cleanText(source.updatedAt, 40),
  }
}

function newId(prefix) {
  return `${prefix}_${randomBytes(16).toString('base64url')}`
}

function httpError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function safeJsonParse(text) {
  if (!text || typeof text !== 'string') return {}
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    // 少数模型会在参数外包一层代码块
    const match = text.match(/\{[\s\S]*\}/)
    if (match) { try { return JSON.parse(match[0]) } catch {} }
    return {}
  }
}

function friendlyUpstreamMessage(status, raw = '') {
  if (status === 401 || status === 403) return 'AI 服务的密钥无效或没有权限，请管理员在后台检查模型配置。'
  if (status === 402) return 'AI 服务账户余额不足，请管理员充值后再试。'
  if (status === 429) return '找 AI 的人有点多，请稍等几秒再试。'
  if (status >= 500) return 'AI 服务暂时不稳定，请稍后再试。'
  const detail = String(raw || '').replace(/\s+/g, ' ').slice(0, 160)
  return `AI 服务返回错误（${status}）${detail ? `：${detail}` : ''}`
}

function looksLikeToolUnsupported(status, raw = '') {
  return status === 400 && /tool|function/i.test(String(raw || ''))
}

// 内容安全统一走 server/risk-store.js（后台「风控管理」维护词库和规则）；没有注入时（单测等）一律放行。
function passVerdict(text) {
  const value = String(text || '')
  return { action: 'pass', ok: true, text: value, safeText: value, hits: [], categories: [], message: '', selfHarm: false, banned: null }
}

/** 技能可以在 YAML 的 metadata 里声明 max_images，让需要多张图的技能（如电商详情页）一轮多出几张。 */
function skillImageCap(skill) {
  const metadata = skill?.frontmatter?.metadata || {}
  const value = Number(metadata.max_images ?? metadata['max-images'] ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.min(HARD_MAX_IMAGES, Math.round(value)) : 0
}

/**
 * @param {object} deps 由 server/index.js 注入，避免本模块依赖巨型入口文件。
 */
export function createAgentRuntime(deps) {
  const toolUnsupported = new Set()
  const activeStreams = new Map()

  function configFile() {
    return join(deps.dataDir(), 'agent-assistant-config.json')
  }

  function readConfig() {
    try {
      const file = configFile()
      if (existsSync(file)) return normalizeAgentConfig(JSON.parse(readFileSync(file, 'utf8')))
    } catch {}
    return normalizeAgentConfig({})
  }

  function writeConfig(input) {
    const next = normalizeAgentConfig({ ...input, updatedAt: new Date().toISOString() })
    mkdirSync(deps.dataDir(), { recursive: true })
    writeFileSync(configFile(), JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  /** 后台下拉框用：有可用 Key 的供应商及其文字 / 图像模型。 */
  function modelOptions() {
    const providers = deps.getProviders()
    const text = []
    const image = []
    for (const [key, provider] of Object.entries(providers)) {
      if (!deps.providerKeyUsable(provider) || provider.enabled === false) continue
      for (const model of deps.availableModels(provider, 'text')) text.push({ provider: key, model, label: `${provider.label} · ${model}` })
      for (const model of deps.availableModels(provider, 'image')) image.push({ provider: key, model, label: `${provider.label} · ${model}` })
    }
    const video = deps.videoTarget()
    return { text, image, video: video ? [{ ...video, label: `${video.label} · ${video.model}` }] : [] }
  }

  function textCandidates(config) {
    const providers = deps.getProviders()
    const list = []
    const seen = new Set()
    const push = (key, model) => {
      const provider = providers[key]
      if (!provider || !deps.providerKeyUsable(provider) || !model || !deps.modelEnabled(provider, model)) return
      const id = `${key}:${model}`
      if (seen.has(id)) return
      seen.add(id)
      list.push({ provider: { key, ...provider }, model })
    }
    if (config.provider && config.model) push(config.provider, config.model)
    const preferred = String(config.provider || deps.defaultTextProvider() || '').toLowerCase()
    const order = preferred && providers[preferred] ? [preferred, ...Object.keys(providers).filter((key) => key !== preferred)] : Object.keys(providers)
    for (const key of order) {
      const provider = providers[key]
      if (!provider || !deps.providerKeyUsable(provider)) continue
      for (const model of deps.availableModels(provider, 'text').slice(0, 2)) push(key, model)
    }
    return list.slice(0, 4)
  }

  function imageTarget(config) {
    const providers = deps.getProviders()
    if (config.imageProvider && providers[config.imageProvider] && deps.providerKeyUsable(providers[config.imageProvider])) {
      const provider = providers[config.imageProvider]
      const model = config.imageModel && deps.modelEnabled(provider, config.imageModel) ? config.imageModel : deps.availableModels(provider, 'image')[0]
      if (model) return { provider: config.imageProvider, model }
    }
    const preferred = deps.defaultImageProvider()
    const order = preferred && providers[preferred] ? [preferred, ...Object.keys(providers).filter((key) => key !== preferred)] : Object.keys(providers)
    for (const key of order) {
      const provider = providers[key]
      if (!provider || !deps.providerKeyUsable(provider) || provider.category === 'model3d') continue
      const model = deps.availableModels(provider, 'image')[0]
      if (model) return { provider: key, model }
    }
    return null
  }

  function capabilities(config) {
    const image = config.tools.generate_image && config.maxImagesPerTurn > 0 ? imageTarget(config) : null
    const video = config.tools.generate_video && config.maxVideosPerTurn > 0 ? deps.videoTarget() : null
    return { image, video }
  }

  async function publicConfig(user) {
    const config = readConfig()
    let skills = []
    try { skills = await listPublishedSkills(user) } catch {}
    let remainingToday = null
    if (!STAFF_ROLES.has(user.role) && config.dailyMessageLimit > 0) {
      const used = await countUserMessagesToday(user).catch(() => 0)
      remainingToday = Math.max(0, config.dailyMessageLimit - used)
    }
    const caps = capabilities(config)
    return {
      enabled: config.enabled,
      name: config.name,
      avatar: config.avatar,
      greeting: config.greeting,
      quickPrompts: config.quickPrompts,
      ready: textCandidates(config).length > 0,
      canGenerateImages: Boolean(caps.image),
      canGenerateVideos: Boolean(caps.video),
      dailyMessageLimit: config.dailyMessageLimit,
      remainingToday,
      chargeTurns: config.billing.chargeTurns,
      skills,
    }
  }

  function toolDefinitions(config, { hasAttachment, caps, imageCount }) {
    const fn = (name, description, properties = {}, required = []) => ({
      type: 'function',
      function: { name, description, parameters: { type: 'object', properties, required } },
    })
    const defs = [
      fn('load_skill', '读取一个技能的完整说明。当用户的需求和某个技能匹配时先调用它，然后严格按说明执行。',
        { name: { type: 'string', description: '技能的 name（英文标识）' } }, ['name']),
      fn('read_skill_resource', '读取技能附带的参考文件（技能说明里提到某个文件时使用）。', {
        name: { type: 'string', description: '技能 name' },
        path: { type: 'string', description: '文件路径，例如 references/colors.md' },
      }, ['name', 'path']),
    ]
    if (caps.image) {
      defs.push(fn('generate_image', '根据中文画面描述生成一张图片，图片会直接展示给用户并自动保存。描述要具体：主体、动作、场景、光线、色彩、画风。', {
        prompt: { type: 'string', description: '完整的中文画面描述，不超过 300 字' },
        ratio: { type: 'string', enum: RATIOS, description: '画面比例，默认 1:1' },
        use_last_image: { type: 'boolean', description: '是否以本次对话里最近生成的一张图作为参考（在它的基础上修改）' },
        ...(hasAttachment ? { use_attached_image: { type: 'boolean', description: '是否以用户附加的图片（例如扫描的草图、商品照片）作为参考图' } } : {}),
      }, ['prompt']))
    }
    if (caps.video) {
      defs.push(fn('generate_video', '生成一段约 5 秒的短视频（异步生成，约 1~3 分钟后自动出现在对话里）。最好先用 generate_image 做好首帧，再以它为首帧生成。', {
        prompt: { type: 'string', description: '中文视频描述：主体在做什么动作、镜头怎么运动（推近 / 环绕 / 平移）、氛围和光线，不超过 300 字' },
        ratio: { type: 'string', enum: VIDEO_RATIOS, description: '画面比例：16:9 横屏、9:16 竖屏、1:1 方形，默认 16:9' },
        first_frame: { type: 'string', enum: ['none', 'last_image', ...(hasAttachment ? ['attached'] : [])], description: '首帧：last_image 用最近生成的图；attached 用用户附加的图；none 纯文字生成' },
      }, ['prompt']))
    }
    if (config.tools.compose_page) {
      defs.push(fn('compose_page', '把文案和已生成的图片组装成一个版面展示给用户（电商详情页或视频分镜），用户可以一键导出长图。', {
        kind: { type: 'string', enum: ['detail-page', 'storyboard'], description: 'detail-page 商品详情页；storyboard 视频分镜' },
        title: { type: 'string', description: '主标题，不超过 20 字' },
        subtitle: { type: 'string', description: '副标题或一句话卖点，不超过 40 字' },
        theme_color: { type: 'string', description: '主题色，例如 #FF7A59' },
        sections: {
          type: 'array',
          description: `版块列表（最多 ${MAX_LAYOUT_SECTIONS} 个），按从上到下的顺序`,
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: '小标题，不超过 16 字' },
              text: { type: 'string', description: '说明文字，不超过 120 字' },
              image: { type: 'integer', description: `配图序号：本次对话里生成图片的先后顺序，1 = 最早的一张${imageCount ? `（目前已有 ${imageCount} 张）` : ''}；不配图填 0` },
            },
            required: ['heading'],
          },
        },
      }, ['kind', 'title', 'sections']))
    }
    if (config.tools.find_workflow) {
      defs.push(fn('find_workflow', '查找平台上管理员配置好的「创作玩法」（固定步骤的工作流，比如证件照、节日贺卡、风格转换）。用户的需求和某个玩法相似时使用，会给用户显示打开按钮。',
        { keyword: { type: 'string', description: '关键词，例如 海报、贺卡、视频、风格' } }, ['keyword']))
    }
    if (config.tools.search_prompt_library) {
      defs.push(fn('search_prompt_library', '在平台的提示词库里查找灵感提示词。',
        { keyword: { type: 'string', description: '关键词，例如 小猫、太空、水彩' } }, ['keyword']))
    }
    if (config.tools.list_courses) {
      defs.push(fn('list_courses', '查看用户可以学习的课程，可按关键词筛选。用户想学习某个主题时使用。',
        { keyword: { type: 'string', description: '可选的关键词' } }))
    }
    if (config.tools.list_my_works) {
      defs.push(fn('list_my_works', '查看用户最近保存的作品和项目标题，用于回顾或继续创作。',
        { limit: { type: 'integer', description: '数量，默认 6' } }))
    }
    if (config.tools.suggest_tool) {
      defs.push(fn('suggest_tool', '在对话里给用户显示一个按钮，点一下就能打开平台的某个创作工具。', {
        tool: { type: 'string', enum: Object.keys(AGENT_TOOL_ROUTES), description: '工具：paint 绘画 / canvas 无限画布 / board 手绘画板 / scan 扫描草图 / video 视频 / model3d 3D / courses 课程 / gallery 作品广场 / portfolio 我的作品 / prompts 提示词库' },
        reason: { type: 'string', description: '一句话说明为什么推荐' },
      }, ['tool']))
    }
    return defs
  }

  function buildSystemPrompt({ config, user, skills, activeSkill, page, hasAttachment, canSeeImages, caps, imageCap, imageCount }) {
    const lines = [
      `你是「${config.name}」，一个 AI 创作平台上的创作伙伴，陪用户画画、做设计、拍短视频、学习美术知识。`,
      config.persona,
      '',
      '## 说话方式',
      '- 使用简体中文，语言简单、亲切、积极，多鼓励，少说教。',
      '- 回复尽量简短（一般不超过 150 字），需要分步骤时用列表；一次最多问 2 个问题。',
      '- 可以使用 Markdown 的加粗和列表，不要使用表格和代码块。',
      '',
      '## 安全规则（必须遵守，优先级最高）',
      '- 只聊创作、美术、设计、学习相关的话题；别的话题礼貌地引导回创作。',
      '- 绝不生成或描述暴力、恐怖、色情、赌博、毒品、自残、歧视、违法等内容，不讨论政治话题；遇到这类请求，温和拒绝并换一个健康的创作方向。',
      '- 不询问、不记录真实姓名、电话、住址、所在单位、照片等个人信息；对方主动说出时，提醒他注意保护隐私。',
      '- 尊重原创，不模仿知名品牌标志或受版权保护的卡通角色，引导对方做出自己的原创版本。',
      '- 不确定的事实就说不确定，不编造。',
      '',
      '## 工具',
      caps.image
        ? `- 用户想要图片时调用 generate_image。本轮最多生成 ${imageCap} 张；生成前先把画面描述整理清楚。图片会自动展示，你不需要输出图片链接。`
        : '- 当前没有可用的图像模型，不要承诺生成图片，可以给出画面描述让用户去「AI 绘画」页面生成。',
      caps.video
        ? `- 用户想要视频时调用 generate_video（本轮最多 ${config.maxVideosPerTurn} 个，每个约 5 秒）。推荐流程：先用 generate_image 生成首帧让用户确认，再用 first_frame=last_image 生成视频。视频在后台生成，告诉用户稍等 1~3 分钟，期间可以继续聊。`
        : '- 当前不能生成视频，用户想要视频时，帮他把想法整理成画面和动作描述，并推荐「AI 视频」页面。',
      '- 需要把文案和多张图组织成商品详情页或视频分镜时，调用 compose_page，用户可以一键导出长图。图片里不要画文字，文字放在版面里。',
      '- 推荐平台功能时调用 suggest_tool 显示按钮，不要让用户自己去找；用户想做的事和平台的「创作玩法」相似时调用 find_workflow。',
    ]
    if (imageCount) lines.push(`- 本次对话里已经生成过 ${imageCount} 张图片，需要在它基础上修改时，调用 generate_image 并设置 use_last_image 为 true。`)
    if (hasAttachment) {
      lines.push('- 用户这次附带了图片（通常是扫描的手绘草图或商品照片）。需要以它为基础出图时，调用 generate_image 并设置 use_attached_image 为 true。')
      lines.push(canSeeImages
        ? '- 你能看到用户附带的图片，可以描述画面内容。'
        : '- 你看不到图片的具体内容，不要假装看到了；需要了解画面时，请用户用一句话说说画了什么。')
    }
    if (skills.length) {
      lines.push('', '## 可用技能', '下面是平台提供的技能。用户的需求和某个技能匹配时，先调用 load_skill 读取完整说明，再按说明一步步执行：')
      for (const skill of skills.slice(0, 40)) lines.push(`- ${skill.slug}：${skill.title}——${skill.description}`)
    }
    if (activeSkill) {
      lines.push('', `## 当前技能：${activeSkill.title}`, '用户已经选择了这个技能，请直接按下面的说明工作（无需再调用 load_skill）：', '', activeSkill.instructions)
      if (activeSkill.resourceNames?.length) lines.push('', `这个技能附带参考文件：${activeSkill.resourceNames.join('、')}，需要时用 read_skill_resource 读取。`)
    }
    if (page) lines.push('', '## 场景', `用户当前在「${page}」页面。`)
    const nickname = String(user?.name || '').trim().slice(0, 12)
    if (nickname) lines.push('', `用户的昵称：${nickname}（可以偶尔用昵称称呼对方）。`)
    return lines.filter((line) => line !== undefined && line !== null).join('\n')
  }

  async function callModel({ provider, model, messages, tools, config, signal, onDelta }) {
    const useTools = tools?.length && !toolUnsupported.has(`${provider.key}:${model}`)
    const payload = {
      model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxReplyTokens,
      stream: true,
      stream_options: { include_usage: true },
      ...(useTools ? { tools, tool_choice: 'auto' } : {}),
    }
    // 空闲超时：首字或两段数据之间超过 IDLE_TIMEOUT_MS 没动静就放弃，避免请求永远挂着。
    const idle = new AbortController()
    let idleTimer = null
    const touch = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => idle.abort(), IDLE_TIMEOUT_MS)
    }
    const combined = AbortSignal.any([signal, idle.signal])
    const url = `${String(provider.baseUrl || '').replace(/\/+$/, '')}/chat/completions`
    const request = () => fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal: combined,
    })
    const rethrow = (error) => {
      if (signal.aborted) throw error
      if (idle.signal.aborted) {
        const timeout = httpError('AI 回复超时了，请稍后再试。', 504)
        timeout.upstreamStatus = 504
        throw timeout
      }
      if (error.statusCode) throw error
      const network = httpError('暂时连不上 AI 服务，请检查网络后再试。', 502)
      network.networkError = true
      throw network
    }
    let response
    touch()
    try {
      try {
        response = await request()
      } catch (error) {
        // 连接被掐断这类瞬时网络故障只重试一次；超时 / 用户停止不重试。
        if (signal.aborted || idle.signal.aborted || !(error?.cause?.code || error?.code)) throw error
        await new Promise((resolve) => setTimeout(resolve, 800))
        touch()
        response = await request()
      }
    } catch (error) {
      clearTimeout(idleTimer)
      rethrow(error)
    }
    if (!response.ok) {
      clearTimeout(idleTimer)
      const raw = await response.text().catch(() => '')
      if (useTools && looksLikeToolUnsupported(response.status, raw)) {
        toolUnsupported.add(`${provider.key}:${model}`)
        return callModel({ provider, model, messages, tools: [], config, signal, onDelta })
      }
      const error = httpError(friendlyUpstreamMessage(response.status, raw), 502)
      error.upstreamStatus = response.status
      throw error
    }
    try {
      return await readModelResponse(response, onDelta, touch)
    } catch (error) {
      rethrow(error)
    } finally {
      clearTimeout(idleTimer)
    }
  }

  async function readModelResponse(response, onDelta, touch) {
    const contentType = String(response.headers.get('content-type') || '')
    if (!contentType.includes('text/event-stream')) {
      // 少数网关忽略 stream 参数，直接返回完整 JSON
      const data = await response.json().catch(() => ({}))
      if (data?.error) throw httpError(`AI 服务返回错误：${cleanText(data.error.message || data.error, 120)}`, 502)
      const message = data?.choices?.[0]?.message || {}
      const text = typeof message.content === 'string' ? message.content : ''
      if (text) onDelta(text)
      return {
        text,
        toolCalls: (message.tool_calls || []).map((call, index) => ({ id: call.id || `call_${index}`, name: call.function?.name || '', arguments: call.function?.arguments || '{}' })).filter((call) => call.name),
        finishReason: data?.choices?.[0]?.finish_reason || 'stop',
        usage: data?.usage || null,
      }
    }
    let text = ''
    let finishReason = ''
    let usage = null
    const calls = []
    const parser = createParser({
      onEvent(event) {
        if (!event.data || event.data === '[DONE]') return
        let chunk
        try { chunk = JSON.parse(event.data) } catch { return }
        if (chunk.usage) usage = chunk.usage
        if (chunk.error) throw httpError(`AI 服务返回错误：${cleanText(chunk.error.message || chunk.error, 120)}`, 502)
        const choice = chunk.choices?.[0]
        if (!choice) return
        const delta = choice.delta || {}
        if (typeof delta.content === 'string' && delta.content) {
          text += delta.content
          onDelta(delta.content)
        }
        for (const item of delta.tool_calls || []) {
          const index = Number.isInteger(item.index) ? item.index : calls.length
          const slot = calls[index] || (calls[index] = { id: '', name: '', arguments: '' })
          if (item.id) slot.id = item.id
          const name = item.function?.name
          if (name) slot.name = !slot.name ? name : (name === slot.name ? slot.name : slot.name + name)
          if (item.function?.arguments) slot.arguments += item.function.arguments
        }
        if (choice.finish_reason) finishReason = choice.finish_reason
      },
    })
    const decoder = new TextDecoder()
    for await (const chunk of response.body) {
      touch()
      parser.feed(decoder.decode(chunk, { stream: true }))
    }
    parser.feed(decoder.decode())
    return {
      text,
      toolCalls: calls.filter((call) => call && call.name).map((call, index) => ({ id: call.id || `call_${index}_${Date.now()}`, name: call.name, arguments: call.arguments || '{}' })),
      finishReason: finishReason || 'stop',
      usage,
    }
  }

  function historyMessages(history, turns) {
    if (!turns) return []
    const picked = history.filter((item) => item.status !== 'error' && (item.content || item.parts?.length)).slice(-turns * 2)
    return picked.map((item) => {
      if (item.role === 'user') {
        const attached = (item.parts || []).filter((part) => part.type === 'attachment').length
        return { role: 'user', content: `${item.content}${attached ? `\n（附带了 ${attached} 张图片）` : ''}` }
      }
      const parts = item.parts || []
      const images = parts.filter((part) => part.type === 'image').map((part) => part.prompt).filter(Boolean)
      const videos = parts.filter((part) => part.type === 'video').map((part) => part.prompt).filter(Boolean)
      const skills = parts.filter((part) => part.type === 'skill').map((part) => part.title)
      const layouts = parts.filter((part) => part.type === 'layout').map((part) => part.title)
      const notes = [
        ...(skills.length ? [`（本轮使用了技能：${skills.join('、')}）`] : []),
        ...(images.length ? [`（本轮已生成图片：${images.map((p) => p.slice(0, 60)).join('；')}）`] : []),
        ...(videos.length ? [`（本轮已提交视频：${videos.map((p) => p.slice(0, 60)).join('；')}）`] : []),
        ...(layouts.length ? [`（本轮已组装版面：${layouts.join('、')}）`] : []),
      ]
      return { role: 'assistant', content: `${item.content || ''}${notes.length ? `\n${notes.join('\n')}` : ''}`.trim() || '（已完成）' }
    })
  }

  /** 本次对话里已经生成过的图片（按时间顺序），供 use_last_image / compose_page 引用。 */
  function historyImages(history) {
    const urls = []
    for (const item of history) {
      if (item.role !== 'assistant') continue
      for (const part of item.parts || []) if (part.type === 'image' && part.url) urls.push(part.url)
    }
    return urls.slice(-12)
  }

  function normalizeAttachments(list) {
    return (Array.isArray(list) ? list : []).slice(0, MAX_ATTACHMENTS).map((item) => {
      const url = String(item?.url || '')
      if (/^\/api\/assets\/[A-Za-z0-9_-]+$/.test(url)) return { type: 'image', url, name: cleanText(item.name, 60) || '图片' }
      return null
    }).filter(Boolean)
  }

  /**
   * 处理一次对话（SSE）。body: { conversationId?, message, skill?, attachments?, page?, testDraft? }
   */
  async function streamChat(req, res, user, body = {}) {
    // 同一账号同一时间只允许一条回答在进行（多开标签页连点也不会并发扣费、并发出图）。
    if (activeStreams.has(user.id)) throw httpError('上一条消息还在回答中，请稍等一下。', 429)
    activeStreams.set(user.id, Date.now())
    try {
      return await streamChatInner(req, res, user, body)
    } finally {
      activeStreams.delete(user.id)
    }
  }

  async function streamChatInner(req, res, user, body) {
    const config = readConfig()
    if (!config.enabled) throw httpError('AI 创作伙伴暂时关闭了，请稍后再来～', 403)
    const text = String(body.message || '').trim().slice(0, MAX_INPUT_CHARS)
    const attachments = normalizeAttachments(body.attachments)
    if (!text && !attachments.length) throw httpError('先说点什么吧～', 400)

    const isStaff = STAFF_ROLES.has(user.role)
    const billable = !isStaff && deps.authMode === 'server'
    const allowDraft = user.role === 'admin' && body.testDraft === true
    if (!isStaff && config.dailyMessageLimit > 0) {
      const used = await countUserMessagesToday(user)
      if (used >= config.dailyMessageLimit) throw httpError(`今天已经聊了 ${used} 条啦，休息一下，明天再来继续创作吧～`, 429)
    }
    // 先过风控：被拦截的消息以打码形式存档（不把原话写进聊天记录）；需要打码的（如手机号）打码后再发给 AI。
    const inputVerdict = text && deps.checkContent ? await deps.checkContent(user, text, { scope: 'chat' }) : passVerdict(text)
    const storedText = inputVerdict.action === 'block' ? inputVerdict.safeText : inputVerdict.text
    const outputCheck = deps.riskChecker ? await deps.riskChecker(user) : null
    const screen = (value, scope) => (deps.checkContent ? deps.checkContent(user, value, { scope, countForBan: false, actor: 'ai' }) : passVerdict(value))
    const skills = await listPublishedSkills(user).catch(() => [])
    let activeSkill = null
    if (body.skill) {
      activeSkill = await getSkillForRuntime(user, body.skill, { allowDraft })
      if (!activeSkill) throw httpError('这个技能已下架或不存在，请换一个试试。', 404)
    }

    let conversation
    if (body.conversationId) conversation = await getOwnConversation(user, body.conversationId)
    else conversation = await createConversation(user, { skillSlug: activeSkill?.slug || '' })
    const history = body.conversationId ? await listMessages(user, conversation.id, { limit: Math.max(24, config.historyTurns * 2 + 2) }) : []

    const assistantId = newId('amsg')
    const controller = new AbortController()
    const signal = controller.signal
    const startedAt = Date.now()
    const parts = []
    const knownImages = historyImages(history)
    let content = ''
    let status = 'done'
    let usedModel = null
    let usageTotal = null
    let imagesThisTurn = 0
    let videosThisTurn = 0
    let imageCap = Math.min(HARD_MAX_IMAGES, Math.max(config.maxImagesPerTurn, skillImageCap(activeSkill)))
    let finished = false
    let turnCharged = null
    let outputBlocked = false
    let blockedOutput = ''

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const send = (event, data) => {
      if (res.writableEnded) return
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n') }, 15000)
    res.on('close', () => { if (!finished) controller.abort() })

    const userParts = [
      ...(activeSkill ? [{ type: 'skill', slug: activeSkill.slug, title: activeSkill.title, icon: activeSkill.icon }] : []),
      ...attachments.map((item) => ({ type: 'attachment', url: item.url, name: item.name })),
    ]
    const pushSkill = (skill) => {
      if (parts.some((item) => item.type === 'skill' && item.slug === skill.slug)) return
      const part = { type: 'skill', slug: skill.slug, title: skill.title, icon: skill.icon }
      parts.push(part)
      send('skill', part)
    }

    try {
      await appendMessage(user, conversation.id, { role: 'user', content: storedText, parts: userParts })
      send('meta', { conversationId: conversation.id, messageId: assistantId, title: conversation.title || storedText.slice(0, 24) })

      if (!inputVerdict.ok) {
        content = inputVerdict.banned ? `${config.blockedReply}\n\n${inputVerdict.banned.message}` : config.blockedReply
        send('delta', { text: content })
        if (inputVerdict.banned) send('notice', { kind: 'ai_paused', message: inputVerdict.banned.message, ban: inputVerdict.banned })
        return
      }

      const candidates = textCandidates(config)
      if (!candidates.length) throw httpError('还没有可用的文字模型：请管理员先在后台「功能管理 → API 配置」里填好文字模型的密钥，再到「AI 创作伙伴」里选择模型。', 503)

      if (billable && config.billing.chargeTurns) {
        turnCharged = await deps.chargeAbility(user, { ability: 'ai_text', count: 1, bizType: 'agent-turn', bizId: assistantId })
        if (turnCharged?.charged) send('usage', { credits: turnCharged.charged, balance: turnCharged.balance })
      }

      let visionImages = []
      if (attachments.length && config.vision) {
        visionImages = (await Promise.all(attachments.map((item) => deps.visionDataUrl(item.url, user).catch(() => '')))).filter(Boolean)
      }
      const caps = capabilities(config)
      const hasAttachment = attachments.length > 0
      const systemPrompt = buildSystemPrompt({
        config, user, skills, activeSkill, page: cleanText(body.page, 30), hasAttachment,
        canSeeImages: visionImages.length > 0, caps, imageCap, imageCount: knownImages.length,
      })
      // 流露出自伤念头的这一轮不调用工具，只好好聊。
      const tools = inputVerdict.selfHarm ? [] : toolDefinitions(config, { hasAttachment, caps, imageCount: knownImages.length })
      const textForModel = storedText || '请看看我附上的图片。'
      const userContent = visionImages.length
        ? [{ type: 'text', text: textForModel }, ...visionImages.map((url) => ({ type: 'image_url', image_url: { url } }))]
        : hasAttachment ? `${textForModel}\n（我附带了 ${attachments.length} 张图片）` : storedText
      const messages = [
        { role: 'system', content: inputVerdict.selfHarm ? `${systemPrompt}\n\n${CARE_NOTE}` : systemPrompt },
        ...historyMessages(history, config.historyTurns),
        { role: 'user', content: userContent },
      ]

      if (activeSkill) {
        pushSkill(activeSkill)
        recordSkillUse(activeSkill.id)
      }

      const referenceFor = (useAttached, useLast) => {
        if (useAttached && hasAttachment) return attachments.map((item) => item.url)
        if (useLast && knownImages.length) return [knownImages[knownImages.length - 1]]
        return []
      }

      const toolHandlers = {
        async load_skill(args, finish) {
          const skill = await getSkillForRuntime(user, args.name, { allowDraft })
          if (!skill) return finish('error', `没有找到技能「${cleanText(args.name, 30)}」`, { ok: false, error: '没有这个技能，请从可用技能列表里选择。' })
          recordSkillUse(skill.id)
          pushSkill(skill)
          imageCap = Math.min(HARD_MAX_IMAGES, Math.max(imageCap, skillImageCap(skill)))
          return finish('done', `已读取「${skill.title}」`, { ok: true, skill: skill.slug, title: skill.title, instructions: skill.instructions, resources: skill.resourceNames, maxImagesThisTurn: imageCap })
        },
        async read_skill_resource(args, finish) {
          const skill = await getSkillForRuntime(user, args.name, { allowDraft })
          const path = String(args.path || '').replace(/\\/g, '/').replace(/^\.\//, '')
          const value = skill?.resources?.[path]
          if (!skill || typeof value !== 'string') return finish('error', '没有找到这个资料文件', { ok: false, error: '文件不存在', available: skill?.resourceNames || [] })
          return finish('done', `已查看 ${path}`, { ok: true, path, content: value.slice(0, 20000) })
        },
        async generate_image(args, finish) {
          if (!caps.image) return finish('error', '图像模型未配置', { ok: false, error: '当前不能生成图片' })
          if (imagesThisTurn >= imageCap) return finish('error', '本轮图片数量已达上限', { ok: false, error: `本轮最多生成 ${imageCap} 张，请让用户确认后在下一轮继续。` })
          let prompt = cleanText(args.prompt, 800)
          if (!prompt) return finish('error', '缺少画面描述', { ok: false, error: '缺少 prompt' })
          const promptVerdict = await screen(prompt, 'prompt')
          if (!promptVerdict.ok) return finish('error', '画面内容不合适，已跳过', { ok: false, error: '画面描述包含不适合的内容，请换一个健康、适合小朋友的主题。' })
          prompt = promptVerdict.text
          const ratio = RATIOS.includes(args.ratio) ? args.ratio : '1:1'
          const references = referenceFor(args.use_attached_image, args.use_last_image)
          const bizId = `${assistantId}:i${imagesThisTurn}`
          imagesThisTurn += 1
          let charged = null
          if (billable && config.billing.chargeImages) {
            charged = await deps.chargeAbility(user, { ability: 'image', provider: caps.image.provider, model: caps.image.model, count: 1, bizType: 'agent-image', bizId })
          }
          try {
            const result = await deps.generateImage({ prompt, ratio, provider: caps.image.provider, model: caps.image.model, count: 1, images: references }, user)
            const image = result.images?.[0]
            if (!image?.imageUrl) throw httpError('没有拿到图片结果', 502)
            const part = { type: 'image', url: image.imageUrl, prompt, ratio }
            parts.push(part)
            knownImages.push(image.imageUrl)
            send('image', part)
            if (charged?.charged) send('usage', { credits: charged.charged, balance: charged.balance })
            return finish('done', '图片已生成', { ok: true, shownToUser: true, imageIndex: knownImages.length, prompt })
          } catch (error) {
            if (charged) {
              const back = await deps.refundAbility(user, { ability: 'image', bizType: 'agent-image', bizId, charge: charged }).catch(() => null)
              if (back?.refunded) send('usage', { refunded: back.refunded, balance: back.balance })
            }
            throw error
          }
        },
        async generate_video(args, finish) {
          if (!caps.video) return finish('error', '视频模型未配置', { ok: false, error: '当前不能生成视频' })
          if (videosThisTurn >= config.maxVideosPerTurn) return finish('error', '本轮视频数量已达上限', { ok: false, error: `本轮最多生成 ${config.maxVideosPerTurn} 个视频，请让用户先看看效果。` })
          let prompt = cleanText(args.prompt, 800)
          if (!prompt) return finish('error', '缺少视频描述', { ok: false, error: '缺少 prompt' })
          const promptVerdict = await screen(prompt, 'prompt')
          if (!promptVerdict.ok) return finish('error', '视频内容不合适，已跳过', { ok: false, error: '视频描述包含不适合的内容，请换一个健康、适合小朋友的主题。' })
          prompt = promptVerdict.text
          const ratio = VIDEO_RATIOS.includes(args.ratio) ? args.ratio : '16:9'
          const frame = args.first_frame === 'attached' ? referenceFor(true, false) : args.first_frame === 'last_image' ? referenceFor(false, true) : []
          const bizId = `${assistantId}:v${videosThisTurn}`
          videosThisTurn += 1
          let charged = null
          if (billable && config.billing.chargeVideos) {
            charged = await deps.chargeAbility(user, { ability: 'video', provider: caps.video.provider, model: caps.video.model, count: 1, bizType: 'agent-video', bizId })
          }
          try {
            const task = await deps.submitVideo({ prompt, ratio, images: frame.slice(0, 1), provider: caps.video.provider, model: caps.video.model }, user, {
              charge: charged, bizType: 'agent-video', bizId,
            })
            const part = { type: 'video', taskId: task.taskId, status: task.status || 'queued', prompt, ratio, firstFrame: frame[0] || '' }
            parts.push(part)
            send('video', part)
            if (charged?.charged) send('usage', { credits: charged.charged, balance: charged.balance })
            return finish('done', '视频已开始生成', { ok: true, status: 'queued', shownToUser: true, note: '视频正在后台生成（约 1~3 分钟），完成后会自动出现在对话里，用户可以先继续聊。' })
          } catch (error) {
            if (charged) {
              const back = await deps.refundAbility(user, { ability: 'video', bizType: 'agent-video', bizId, charge: charged }).catch(() => null)
              if (back?.refunded) send('usage', { refunded: back.refunded, balance: back.balance })
            }
            throw error
          }
        },
        async compose_page(args, finish) {
          const kind = args.kind === 'storyboard' ? 'storyboard' : 'detail-page'
          const sections = (Array.isArray(args.sections) ? args.sections : []).slice(0, MAX_LAYOUT_SECTIONS).map((section) => {
            const index = Math.round(Number(section?.image) || 0)
            return {
              heading: cleanText(section?.heading, 24),
              text: cleanText(section?.text, 200),
              image: index >= 1 && index <= knownImages.length ? knownImages[index - 1] : '',
            }
          }).filter((section) => section.heading || section.text || section.image)
          if (!sections.length) return finish('error', '版面内容为空', { ok: false, error: 'sections 不能为空' })
          const title = cleanText(args.title, 30) || (kind === 'storyboard' ? '视频分镜' : '商品详情页')
          const subtitle = cleanText(args.subtitle, 60)
          const layoutVerdict = await screen([title, subtitle, ...sections.flatMap((s) => [s.heading, s.text])].join('\n'), 'chat')
          if (!layoutVerdict.ok) return finish('error', '版面内容不合适，已跳过', { ok: false, error: '内容包含不适合的词语，请换一种说法。' })
          // 版面是分字段展示的，需要打码的词逐个字段打码。
          const tidy = (value) => (outputCheck && value ? outputCheck(value, 'chat').text : value)
          for (const section of sections) { section.heading = tidy(section.heading); section.text = tidy(section.text) }
          const color = /^#[0-9a-fA-F]{6}$/.test(String(args.theme_color || '')) ? args.theme_color : ''
          const part = { type: 'layout', kind, title: tidy(title), subtitle: tidy(subtitle), color, sections }
          parts.push(part)
          send('layout', part)
          const missing = (Array.isArray(args.sections) ? args.sections : []).filter((s) => Number(s?.image) > knownImages.length).length
          return finish('done', kind === 'storyboard' ? '分镜已组装' : '详情页已组装', {
            ok: true, shownToUser: true, sections: sections.length,
            ...(missing ? { warning: `有 ${missing} 个版块的配图序号超出了已生成图片数量（${knownImages.length} 张），已留空。` } : {}),
          })
        },
        async find_workflow(args, finish) {
          const items = await deps.findWorkflows(user, cleanText(args.keyword, 30))
          for (const item of items.slice(0, 3)) {
            const action = { type: 'action', kind: 'workflow', label: `打开「${cleanText(item.title, 20)}」`, path: item.path, reason: cleanText(item.summary, 60) }
            parts.push(action)
            send('action', action)
          }
          return finish('done', items.length ? `找到 ${items.length} 个玩法` : '没有找到相关玩法', {
            ok: true,
            items: items.map(({ title, summary, type }) => ({ title, summary, type })),
            shownToUser: items.length > 0,
            ...(items.length ? {} : { note: '平台上暂时没有相关玩法，可以直接在对话里帮用户完成。' }),
          })
        },
        async search_prompt_library(args, finish) {
          const items = await deps.searchPrompts(user, cleanText(args.keyword, 30))
          return finish('done', items.length ? `找到 ${items.length} 条提示词` : '没有找到相关提示词', { ok: true, items })
        },
        async list_courses(args, finish) {
          const items = await deps.listCourses(user, cleanText(args.keyword, 30))
          if (items.length) {
            const action = { type: 'action', kind: 'courses', label: '打开课程中心', path: AGENT_TOOL_ROUTES.courses.path }
            parts.push(action)
            send('action', action)
          }
          return finish('done', items.length ? `找到 ${items.length} 门课程` : '暂时没有相关课程', { ok: true, items })
        },
        async list_my_works(args, finish) {
          const items = await deps.listWorks(user, Math.round(clampNumber(args.limit, 1, 12, 6)))
          return finish('done', items.length ? `找到 ${items.length} 个作品` : '还没有保存的作品', { ok: true, items })
        },
        async suggest_tool(args, finish) {
          const route = AGENT_TOOL_ROUTES[args.tool]
          if (!route) return finish('error', '未知的工具', { ok: false, error: '工具名无效' })
          const action = { type: 'action', kind: args.tool, label: `打开${route.label}`, path: route.path, reason: cleanText(args.reason, 60) }
          parts.push(action)
          send('action', action)
          return finish('done', `推荐了${route.label}`, { ok: true, shownToUser: true })
        },
      }

      const runTool = async (call) => {
        const args = safeJsonParse(call.arguments)
        const label = AGENT_TOOL_LABELS[call.name] || call.name
        const part = { type: 'tool', id: call.id, name: call.name, label, status: 'running', summary: '' }
        parts.push(part)
        send('tool', part)
        const finish = (statusValue, summary, result) => {
          part.status = statusValue
          part.summary = summary
          send('tool', { ...part })
          return result
        }
        const handler = Object.hasOwn(toolHandlers, call.name) ? toolHandlers[call.name] : null
        try {
          if (!handler) return finish('error', '未知的工具', { ok: false, error: `没有名为 ${call.name} 的工具` })
          return await handler(args, finish)
        } catch (error) {
          if (signal.aborted) throw error
          return finish('error', cleanText(error.message || '工具执行失败', 80), { ok: false, error: cleanText(error.message || '工具执行失败', 200) })
        }
      }

      const addUsage = (usage) => {
        if (!usage) return
        usageTotal = {
          prompt_tokens: (usageTotal?.prompt_tokens || 0) + (usage.prompt_tokens || 0),
          completion_tokens: (usageTotal?.completion_tokens || 0) + (usage.completion_tokens || 0),
        }
      }
      // AI 的回复也要过风控：边输出边看最近一段（新内容 + 前 40 个字，一个词不会比这更长），
      // 一旦出现要拦截的内容就停止输出、整段换成友好提示（replace 事件）；需要打码的在结束时统一打码。
      const onDelta = (chunk) => {
        if (outputBlocked) return
        content += chunk
        if (outputCheck && outputCheck(content.slice(-(chunk.length + 40)), 'chat').action === 'block') {
          outputBlocked = true
          blockedOutput = content
          content = config.blockedReply
          send('replace', { text: content })
          controller.abort()
          return
        }
        send('delta', { text: chunk })
      }

      let candidateIndex = 0
      for (let step = 0; step < config.maxSteps; step += 1) {
        let result
        for (;;) {
          const candidate = candidates[candidateIndex]
          const before = content.length
          try {
            result = await callModel({ provider: candidate.provider, model: candidate.model, messages, tools, config, signal, onDelta })
            usedModel = { provider: candidate.provider.key, model: candidate.model }
            break
          } catch (error) {
            if (signal.aborted) throw error
            const streamedAny = content.length > before
            const retryable = !streamedAny && candidateIndex < candidates.length - 1 && (!error.upstreamStatus || error.upstreamStatus >= 500 || error.upstreamStatus === 429 || error.upstreamStatus === 404)
            if (!retryable) throw error
            candidateIndex += 1
          }
        }
        addUsage(result.usage)
        if (!result.toolCalls.length) break
        messages.push({ role: 'assistant', content: result.text || null, tool_calls: result.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } })) })
        for (const call of result.toolCalls.slice(0, 6)) {
          const output = await runTool(call)
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) })
        }
        if (step === config.maxSteps - 1) {
          // 工具轮次用完：再请求一次纯文字总结，避免对话停在半截。
          const final = await callModel({ provider: candidates[candidateIndex].provider, model: candidates[candidateIndex].model, messages, tools: [], config, signal, onDelta })
          addUsage(final.usage)
        }
      }
      if (outputCheck && content && !outputBlocked) {
        const finalVerdict = outputCheck(content, 'chat')
        if (finalVerdict.action === 'block') {
          blockedOutput = content
          content = config.blockedReply
          send('replace', { text: content })
        } else if (finalVerdict.text !== content) {
          content = finalVerdict.text
          send('replace', { text: content })
        }
      }
      if (!content.trim() && !parts.some((part) => ['image', 'video', 'layout'].includes(part.type))) {
        content = '我好像没想好怎么回答，换个说法再试试吧～'
        send('delta', { text: content })
      }
    } catch (error) {
      if (outputBlocked) {
        status = 'done'
      } else if (signal.aborted || error?.name === 'AbortError') {
        status = 'stopped'
      } else {
        status = 'error'
        // 记进后台「异常管理」（AI 调用失败），不影响给用户的提示。
        if (deps.reportError) Promise.resolve(deps.reportError(user, error)).catch(() => {})
        const message = error.statusCode && error.statusCode < 500 ? error.message : (error.message || 'AI 服务出了点问题，请稍后再试。')
        send('error', { message, code: error.statusCode || 500 })
        // 一个字都没回出来就失败：这一轮不算钱，免费次数也还回去。
        if (turnCharged && !content.trim() && !parts.some((part) => ['image', 'video'].includes(part.type))) {
          const back = await deps.refundAbility(user, { ability: 'ai_text', bizType: 'agent-turn', bizId: assistantId, charge: turnCharged }).catch(() => null)
          if (back?.refunded) send('usage', { refunded: back.refunded, balance: back.balance })
        }
        parts.push({ type: 'error', message: cleanText(message, 200) })
      }
    } finally {
      finished = true
      clearInterval(heartbeat)
      try {
        if (content || parts.length) {
          await appendMessage(user, conversation.id, {
            id: assistantId, role: 'assistant', content, parts, status,
            provider: usedModel?.provider, model: usedModel?.model, usage: usageTotal || {},
          })
        }
      } catch {}
      if (blockedOutput && deps.checkContent) deps.checkContent(user, blockedOutput, { scope: 'chat', countForBan: false, actor: 'ai' }).catch(() => {})
      const toolCount = parts.filter((p) => p.type === 'tool').length
      deps.recordCall({
        status: status === 'error' ? 'error' : 'ok',
        provider: usedModel?.provider || '',
        model: usedModel?.model || '',
        durationMs: Date.now() - startedAt,
        summary: `输入 ${text.length} 字${attachments.length ? `，附图 ${attachments.length}` : ''}${toolCount ? `，工具 ${toolCount} 次` : ''}${imagesThisTurn ? `，出图 ${imagesThisTurn}` : ''}${videosThisTurn ? `，视频 ${videosThisTurn}` : ''}${activeSkill ? `，技能 ${activeSkill.title}` : ''}`,
        error: status === 'error' ? (parts.find((p) => p.type === 'error')?.message || '') : '',
        agentName: config.name,
      })
      // 管理员 / 讲师能看到这一轮实际用的是哪个模型（后台「测试连接」和试用技能要显示），普通用户不下发。
      send('done', { messageId: assistantId, conversationId: conversation.id, status, ...(isStaff && usedModel ? { provider: usedModel.provider, model: usedModel.model } : {}) })
      if (!res.writableEnded) res.end()
    }
  }

  return { readConfig, writeConfig, publicConfig, modelOptions, streamChat, imageTarget, textCandidates }
}
