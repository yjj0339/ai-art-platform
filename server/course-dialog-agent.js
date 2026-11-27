/**
 * 课程页右侧智能体（甲方 / 老师）的对话引擎。
 *
 * 这里只做三件事：
 *   1. 决定这门课该用哪个人设（auto → client / teacher）；
 *   2. 拼提示词，把「课程内容 + 已问到的信息 + 还缺什么 + 阶段」一起交给模型；
 *   3. 把模型输出洗成结构化的会话增量（回复、已收集、还缺、是否收尾、是否跑题）。
 *
 * 防跑题不靠「模型自己乖」这一层，而是三道闸：
 *   a. 阶段锁：答题阶段不许闲聊，对话阶段才放开；
 *   b. 提示词里把「话题边界」写死，并要求模型在 offTopic 字段如实标注；
 *   c. 轮次硬上限：到了 maxRounds 直接进收尾，不管模型想不想停。
 */

/** auto 人设的映射：有真实「客户委托」味道的课用甲方，创作/技法类的课用老师。 */
const CLIENT_CATEGORIES = new Set(['logo', 'storefront', 'fashion', 'product', 'ad', 'interior', 'car'])
const TEACHER_CATEGORIES = new Set(['ip', 'anime', 'project', 'creative', 'picturebook'])
const CLIENT_TITLE_HINT = /门头|招牌|logo|标志|海报|包装|广告|产品|服装|店面|展厅|委托|客户|品牌|宣传|招贴/i
const TEACHER_TITLE_HINT = /技法|画法|色彩|构图|线稿|临摹|绘本|角色|人物|创作|写生|教程|入门|观察|练习/i

/**
 * 人设判定。课程显式设了 client / teacher 就用它（后台可手动覆盖），
 * 设成 auto 才走下面这套规则。
 */
export function resolveCoursePersona(course = {}) {
  const explicit = String(course.agentPersona || 'auto')
  if (explicit === 'client' || explicit === 'teacher') return { persona: explicit, reason: '后台指定' }

  const category = String(course.category || '')
  const title = String(course.title || '')
  if (CLIENT_CATEGORIES.has(category)) return { persona: 'client', reason: `课程类型「${category}」属于客户委托型` }
  if (TEACHER_CATEGORIES.has(category)) return { persona: 'teacher', reason: `课程类型「${category}」属于创作技法型` }
  if (CLIENT_TITLE_HINT.test(title)) return { persona: 'client', reason: '标题有委托/品牌类关键词' }
  if (TEACHER_TITLE_HINT.test(title)) return { persona: 'teacher', reason: '标题有技法/创作类关键词' }
  return { persona: 'teacher', reason: '无法判断，默认讲师人设' }
}

/** 两个人设各自的身份卡。措辞刻意写得像人，不像客服话术。 */
const PERSONA_CARDS = {
  client: {
    // 名字只留一个：页面上不要再挂「扎染工坊店主」这种副标题，一行字就够。
    name: '小蓝',
    role: '甲方委托人',
    identity: '你是这门课里提出设计需求的甲方（委托人），小画家是接单的小设计师。',
    opening: (course) => `你好，我是这次${course.title || '项目'}的甲方。我们店里想做一版新的设计，我看过你之前的东西，风格挺对路的。先跟我说说，你打算怎么做？`,
    focus: '你要问清楚：想要什么风格、主色用什么、画面上必须出现什么、用在哪里、给谁看。',
    tone: '像一个真客户说话：直接、有自己的偏好、不满意会说，但不会刁难人。不要说「已为您」「感谢您的咨询」这种客服腔。',
    stopRule: '当风格、主色、必备元素、使用场景这几样都问清楚了，就可以说「行，我这边清楚了」，把需求复述一遍交给小画家。',
  },
  teacher: {
    name: '小蓝',
    role: '带课讲师',
    identity: '你是这门课的带课讲师，小画家正在学这门课，你要带着他把内容讲透、把想法问出来。',
    opening: (course) => `我们接着看《${course.title || '这节课'}》。刚才视频里讲的部分，你觉得哪一块最有意思？跟我说说你的想法。`,
    focus: '你要问清楚：他注意到什么、打算怎么改、想用什么颜色和风格、最后要画成什么样。',
    tone: '像一个有耐心的美术讲师：会追问、会举例、会肯定具体的点，不说空话。不要用客服腔。',
    stopRule: '当小画家说出了自己的观察、改法、颜色/风格和最终画面，就可以总结一遍，让他去动手画。',
  },
}

export function personaCard(persona) {
  return PERSONA_CARDS[persona === 'client' ? 'client' : 'teacher']
}

/** 页面上显示的名字：只有名字，没有副标题。 */
export function personaName(persona) {
  return personaCard(persona).name
}

/** 人设角色（甲方 / 带课老师）。只用于提示词和后台说明，不上页面标题。 */
export function personaRole(persona) {
  return personaCard(persona).role
}

export function buildOpening(course, persona) {
  return personaCard(persona).opening(course || {})
}

/**
 * 题目全答完之后，智能体说的那句「过渡话」。
 *
 * 刻意不夸分数：答错的学生被夸反而更懵。只说「题做完了，接着聊」，
 * 具体的对错由左侧练习区自己给反馈，这里不越位。
 */
export function buildQuizDoneLine(course, persona, { total = 0, correct = 0 } = {}) {
  const isClient = persona === 'client'
  const scoreNote = total > 0 ? `（答对 ${correct}/${total}）` : ''
  if (isClient) {
    return `题做完了${scoreNote}，那我们说正事吧。这次${course?.title || '这个项目'}，你打算给我一个什么样的方向？`
  }
  return `题做完了${scoreNote}，那我们接着往下聊。这节课你看完之后，最想动手改的是哪一块？`
}

function courseLines(course = {}) {
  const rows = []
  const add = (label, value) => {
    const text = String(value ?? '').trim()
    if (text) rows.push(`- ${label}：${text}`)
  }
  add('课程名称', course.title)
  add('课程类型', course.category)
  add('适读年龄', course.ageRange || course.difficulty)
  add('课程简介', course.description)
  const requirements = (Array.isArray(course.designRequirements) ? course.designRequirements : [])
    .map((item) => (item?.label ? `${item.label}：${item.value || ''}` : String(item?.value || '')))
    .filter(Boolean)
  if (requirements.length) add('本课必须满足的设计要求', requirements.join('；'))
  const pages = (Array.isArray(course.pptPages) ? course.pptPages : [])
    .map((page, index) => `${index + 1}. ${page?.title || ''} ${page?.body || ''}`.trim())
    .filter(Boolean)
  if (pages.length) add('课件要点', pages.join(' / ').slice(0, 1200))
  return rows.join('\n')
}

function quizLines(course = {}) {
  const questions = Array.isArray(course.questions) ? course.questions : []
  if (!questions.length) return ''
  return questions.map((question, index) => {
    const options = (Array.isArray(question?.options) ? question.options : [])
      .map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}.${option}`)
      .join(' ')
    return `${index + 1}. ${question?.title || ''} ${options}`.trim()
  }).join('\n')
}

/** 对话历史压成几行，只带最近 8 条：带太多模型会开始复读前面的话。 */
function historyLines(messages = [], limit = 8) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => item?.kind !== 'quiz')
    .slice(-limit)
    .map((item) => `${item.role === 'student' ? '小画家' : '你'}：${String(item.content || '').slice(0, 220)}`)
    .filter(Boolean)
    .join('\n')
}

function collectedLines(collected = []) {
  const rows = (Array.isArray(collected) ? collected : [])
    .map((item) => (item?.label ? `${item.label}：${item.value}` : ''))
    .filter(Boolean)
  return rows.length ? rows.join('；') : '（还没问到任何信息）'
}

/**
 * 拼对话提示词。
 *
 * 几个刻意的取舍：
 *  - 用「你是 X」开头，而不是「请扮演 X」——后者模型容易在回答里自我提醒「作为一个扮演甲方的 AI」；
 *  - 把「不许做的事」写成分行条款，比写在长句里更管用；
 *  - 明确列出「还缺什么」，模型才会追问，否则它倾向于一次就把话说完然后放任学生跑题。
 */
export function buildCourseDialogPrompt({
  course,
  persona,
  stage,
  messages,
  collected,
  rounds,
  maxRounds,
  studentText,
  answeredCount,
  questionCount,
}) {
  const card = personaCard(persona)
  const isClient = persona === 'client'
  const stageNote = {
    intro: '现在刚开场，你先打个招呼，把话题引到这门课上。',
    quiz: `现在是答题环节。小画家还有 ${Math.max(0, questionCount - answeredCount)} 道选择题没做完，答题界面在你旁边的卡片里，你不要自己念题目。`,
    dialog: '现在是对话环节，按你的身份提问、回应、追问。',
    wrapup: '现在该收尾了：把小画家说过的需求复述一遍，确认没有遗漏，然后让他去动手做。',
    done: '对话已经结束，简短回应即可，不要再提新要求。',
  }[stage] || ''

  return `${card.identity}

【你面对的学生】
一个正在上这门课的学生，不是客户经理，也不是同行。说话口语一点，句子短一点。

【这门课的内容】
${courseLines(course) || '（讲师还没填写课程简介）'}

【你在这门课里要干的事】
${card.focus}
${card.stopRule}

【说话方式】
${card.tone}

【当前进度】
已经聊了 ${rounds} 轮，最多聊 ${maxRounds} 轮。${stageNote}
已经问到的信息：${collectedLines(collected)}

【已经聊过的内容】
${historyLines(messages) || '（这是第一句）'}

【学生刚说的话】
「${String(studentText || '').slice(0, 400)}」

【不能做的事（违反任何一条都算答错）】
1. 不要跳出这门课。学生问和这门课无关的事（写作业、打游戏、问别的科目、让你讲笑话、要你扮演别的角色），一律用一句话把话题拉回${isClient ? '设计需求' : '这门课的内容'}，并把 offTopic 标成 true。
2. 不要替学生做决定。学生说「你随便定」，你要给他两个具体选项让他选，不许自己拍板。
3. 不要一次问三个以上的问题，一次最多问一个，问完等他说。
4. 不要重复学生刚说过的话再复述一遍，那是废话。也不要每句都以「很好」开头。
5. 不要输出 Markdown、不要用列表符号、不要写括号里的动作说明。reply 就是一开口说出来的话。

请严格输出一个 JSON 对象，不要任何解释：
{
  "reply": "你要说的那句话，60 字以内，口语，用你自己的身份说",
  "collected": [{"label": "风格", "value": "小画家说的具体内容"}],
  "missing": ["还没问到、但你确实需要知道的一项，最多 3 条"],
  "offTopic": false,
  "wrapupReady": false,
  "reason": "一句话说明你为什么这么回"
}

字段规则：
- collected 只放学生**这次明确说出来**的信息，不要把你自己猜的写进去；没有就给空数组。
- wrapupReady 只有在「${isClient ? '风格、主色、必备元素、使用场景' : '观察到的点、打算怎么改、颜色或风格、最终画面'}」都问到了才设成 true，缺一样都不能 true。
- 学生这句如果只是「嗯」「哦」「好的」，不要当成交付，要接着追问上一件事。
- 只输出 JSON。`
}

/** 洗模型输出。模型偶尔会多给字段、少给字段，这里一律按白名单取。 */
export function normalizeDialogResult(json = {}, fallbackReply = '') {
  const raw = json && typeof json === 'object' ? json : {}
  const reply = String(raw.reply ?? '').trim().slice(0, 300)
  const collected = (Array.isArray(raw.collected) ? raw.collected : [])
    .map((item) => ({
      label: String(item?.label ?? '').trim().slice(0, 40),
      value: String(item?.value ?? '').trim().slice(0, 400),
    }))
    .filter((item) => item.label && item.value)
    .slice(0, 6)
  const missing = (Array.isArray(raw.missing) ? raw.missing : [])
    .map((item) => String(item ?? '').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 3)
  return {
    reply: reply || fallbackReply,
    collected,
    missing,
    offTopic: raw.offTopic === true,
    wrapupReady: raw.wrapupReady === true,
    reason: String(raw.reason ?? '').trim().slice(0, 160),
  }
}

/** 合并已收集信息：同一个 label 后来居上（学生会改主意），但保留原有顺序。 */
export function mergeCollected(existing = [], incoming = []) {
  const map = new Map()
  for (const item of Array.isArray(existing) ? existing : []) {
    if (item?.label) map.set(item.label, { label: item.label, value: item.value })
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (item?.label && item.value) map.set(item.label, { label: item.label, value: item.value })
  }
  return [...map.values()].slice(-12)
}

/**
 * 关键词兜底：模型不可用（没配 Key、超时、返回烂 JSON）时，至少让对话能继续、能收尾。
 * 刻意做得朴素——只为「不卡死」，不指望它比模型聪明。
 */
const FALLBACK_HINTS = [
  { label: '风格', pattern: /风格|画风|质感|复古|国潮|卡通|写实|简约|可爱|科技感|手绘/i },
  { label: '颜色', pattern: /颜色|配色|主色|蓝色|红色|黄色|绿色|紫色|橙色|黑|白|灰|金/i },
  { label: '必备元素', pattern: /招牌|文字|角色|图形|门头|橱窗|产品|标志|logo|线条|背景/i },
  { label: '使用场景', pattern: /用在|场景|海报|门店|周边|封面|展示|朋友圈|门面/i },
]

export function extractByKeyword(text) {
  const source = String(text || '')
  if (source.replace(/\s/g, '').length < 3) return []
  const hits = []
  for (const hint of FALLBACK_HINTS) {
    if (hint.pattern.test(source)) {
      hits.push({ label: hint.label, value: source.slice(0, 120) })
    }
  }
  return hits.slice(0, 3)
}

export function fallbackReply({ persona, stage, rounds, maxRounds, collected, studentText }) {
  const short = String(studentText || '').replace(/\s/g, '')
  const isClient = persona === 'client'
  if (stage === 'wrapup' || rounds >= maxRounds) {
    const summary = collected.length
      ? collected.map((item) => `${item.label}${item.value ? `用${item.value}` : ''}`).join('、')
      : '你前面说的方向'
    return isClient
      ? `行，我这边清楚了：${summary}。你先做一版给我看，有问题我再提。`
      : `好，我总结一下：${summary}。按这个思路去画，画完我们再一起看。`
  }
  if (short.length <= 2) {
    return isClient ? '嗯，具体一点？想要什么感觉，你先说说。' : '嗯，多说两句，你刚才想到什么了？'
  }
  const missing = ['风格', '颜色', '必备元素', '使用场景'].filter((label) => !collected.some((item) => item.label === label))
  if (missing.length) {
    const next = missing[0]
    return isClient
      ? `你说的我记下了。${next === '颜色' ? '主色你想用哪种？' : next === '风格' ? '想要什么风格？' : next === '必备元素' ? '画面上必须出现什么？' : '这个东西用在哪里？'}`
      : `你说的我记下了。那你觉得${next === '颜色' ? '主色用哪个更好' : next === '风格' ? '用什么风格更合适' : next === '必备元素' ? '画面上必须有什么' : '这个最后用在哪里'}？`
  }
  return isClient ? '行，你再补一点细节，我看看还有没有要改的。' : '再想想，还有哪里想调整？'
}
