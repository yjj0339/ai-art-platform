/* 技能包（外部 SKILL.md）导入区
 * ------------------------------------------------------------------
 * 这里只负责「原料」：把一份 SKILL.md 解析成一条待整理记录。
 * 学生能点的是 ai_skills 里的玩法卡，不是这里。中间必须有老师补提示词那一步，
 * 因为 SKILL.md 正文是写给 AI 助手看的操作说明，不是图像模型能懂的画面描述。
 */
import { createHash, randomBytes } from 'node:crypto'
import { logAudit } from './auth.js'
import { query, withTransaction } from './db.js'
import { ensureDefaultPackageCategory } from './ai-skill-package-category-store.js'

const PACKAGE_STATUSES = new Set(['pending', 'converted', 'ignored'])
const SKILL_TYPES = new Set(['image', 'video'])

// 正文上限：真实 SKILL.md 大多 5~40KB，留足余量但挡住误传的大文件。
const MAX_BODY_LENGTH = 200_000
// 候选话术单条上限。图像模型的提示词再长也没意义，超过就是整段文档被误抓。
const MAX_CANDIDATE_LENGTH = 400
const MAX_CANDIDATES = 12
// 标题上限（单条编辑与批量改名共用一套口径）。
const TITLE_MAX = 80
const SUMMARY_MAX = 300

function newId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`
}

function fail(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function cleanText(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength)
}

async function assertOrgAdmin(user) {
  if (user?.role !== 'admin' || !user?.organization?.id) throw fail('仅机构管理员可以管理技能包', 403)
  const result = await query(
    'SELECT 1 FROM admin_scopes WHERE admin_user_id = $1 AND organization_id = $2 LIMIT 1',
    [user.id, user.organization.id],
  )
  if (!result.rows[0]) throw fail('当前管理员没有机构管理范围', 403)
}

/* ---------------- frontmatter 解析 ----------------
 * 只解析 SKILL.md 里真实出现过的写法：key: value / key: "value" / key: >- 折行 /
 * 以及 - item 列表。故意不引 yaml 库：为这点格式加一个依赖不值得，
 * 而且真实技能包的 frontmatter 都在这几种写法内。
 */
function splitFrontmatter(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const matched = normalized.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!matched) return { frontmatter: {}, body: normalized }
  return { frontmatter: parseSimpleYaml(matched[1]), body: normalized.slice(matched[0].length) }
}

function parseSimpleYaml(source = '') {
  const result = {}
  const lines = String(source).split('\n')
  let currentKey = ''
  let folded = ''
  let folding = false
  const listKey = { name: '' }

  const flushFold = () => {
    if (folding && currentKey) result[currentKey] = cleanText(folded.replace(/\s+/g, ' '), 4000)
    folded = ''
    folding = false
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    if (!line.trim()) continue
    // 折行内容（> 或 >- 之后缩进的行）
    if (folding && /^\s{2,}\S/.test(line)) {
      folded += ` ${line.trim()}`
      continue
    }
    flushFold()
    const listItem = line.match(/^\s*-\s+(.*)$/)
    if (listItem && listKey.name) {
      const value = cleanText(listItem[1].replace(/^["']|["']$/g, ''), 4000)
      if (value) {
        if (!Array.isArray(result[listKey.name])) result[listKey.name] = []
        result[listKey.name].push(value)
      }
      continue
    }
    const pair = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!pair) continue
    const [, key, rest] = pair
    const value = rest.trim()
    listKey.name = ''
    if (!value) {
      // 空值：下一段缩进列表挂到这个键上
      listKey.name = key
      result[key] = []
      continue
    }
    if (value === '>-' || value === '>' || value === '|' || value === '|-') {
      currentKey = key
      folding = true
      folded = ''
      continue
    }
    result[key] = cleanText(value.replace(/^["']|["']$/g, ''), 4000)
  }
  flushFold()
  return result
}

/* ---------------- 候选话术提取 ----------------
 * 目的：老师点「转成玩法」时，提示词框不是空的，而是已经填了一句能用的。
 * 只从三处取，且都要求带画面类词汇，避免把「不要发送 auto」这类操作说明抓进来。
 */
const VISUAL_HINTS = ['构图', '光线', '镜头', '景别', '画面', '风格', '色彩', '背景', '质感', '氛围', '视角', '海报', '插画', '分镜', '比例', '主体', '渲染']
const INSTRUCTION_HINTS = ['不要发送', '请先', '你必须', '执行前', '如果用户', '脚本', '命令', 'python', 'bash', '运行']

function looksLikePrompt(text = '') {
  const value = String(text || '').trim()
  if (value.length < 12 || value.length > MAX_CANDIDATE_LENGTH) return false
  if (!/[\u4e00-\u9fa5]/.test(value) && !/^[A-Za-z]/.test(value)) return false
  const lower = value.toLowerCase()
  if (INSTRUCTION_HINTS.some((hint) => lower.includes(hint.toLowerCase()))) return false
  return VISUAL_HINTS.some((hint) => value.includes(hint)) || /prompt\s*[:：]/i.test(value)
}

function extractPromptCandidates(frontmatter = {}, body = '') {
  const candidates = []
  const seen = new Set()
  const push = (value) => {
    const text = cleanText(String(value || '').replace(/^["'「『]|["'」』]$/g, '').replace(/^(提示词|prompt)\s*[:：]\s*/i, ''), MAX_CANDIDATE_LENGTH)
    if (!text || seen.has(text) || candidates.length >= MAX_CANDIDATES) return
    seen.add(text)
    candidates.push(text)
  }

  // ① frontmatter 里的示例提问：是作者亲手写的「怎么用」，最接近真实需求
  for (const key of ['examples_zh', 'examples', 'examples_en', 'example_zh', 'example']) {
    const value = frontmatter[key]
    if (Array.isArray(value)) value.forEach((item) => push(item))
    else if (typeof value === 'string') push(value)
  }

  // ② 正文里明确标了「提示词：」「Prompt:」的行
  for (const line of String(body).split('\n')) {
    if (/^\s*[-*]?\s*(提示词|prompt)\s*[:：]/i.test(line)) push(line)
  }

  // ③ 正文里带画面词汇的独立段落（含列表项），跳过代码块
  let inFence = false
  for (const line of String(body).split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const trimmed = line.trim()
    if (!trimmed) continue
    const bare = trimmed.replace(/^[-*>\d.]+\s+/, '').replace(/^["'「『]|["'」』]$/g, '')
    if (looksLikePrompt(bare)) push(bare)
  }

  return candidates
}

/* ---------------- 解析入口 ---------------- */
export function parseSkillPackage(text = '', fileName = '') {
  const raw = String(text || '')
  if (!raw.trim()) throw fail('技能包内容是空的')
  if (raw.length > MAX_BODY_LENGTH) throw fail(`技能包太大（${Math.round(raw.length / 1024)}KB），请只上传 SKILL.md 本身`)
  const { frontmatter, body } = splitFrontmatter(raw)
  const packageKey = cleanText(frontmatter.name || frontmatter.slug || '', 120)
  const title = cleanText(
    frontmatter.display_name_zh || frontmatter.display_name || frontmatter.title || frontmatter.name || fileName.replace(/\.(md|zip)$/i, ''),
    80,
  ) || '未命名技能包'
  const summary = cleanText(
    frontmatter.description_zh || frontmatter.description || frontmatter.summary || '',
    300,
  )
  const promptCandidates = extractPromptCandidates(frontmatter, body)
  const metadata = {
    // 只留对老师判断有用的，正文已在 body 里
    displayName: cleanText(frontmatter.display_name || '', 120),
    version: cleanText(frontmatter.version || '', 40),
    author: cleanText(frontmatter.author || '', 80),
    category: cleanText(frontmatter.category || '', 60),
    tags: (Array.isArray(frontmatter.tags) ? frontmatter.tags : []).slice(0, 12).map((item) => cleanText(item, 30)).filter(Boolean),
    hasScripts: /```(?:bash|sh|python|shell)?[\s\S]{0,200}?(?:python|node|bash)\s+[^\n]*\.(?:py|mjs|js|sh)/i.test(body),
    bodyLength: body.length,
  }
  return {
    packageKey, title, summary, body: body.slice(0, MAX_BODY_LENGTH), promptCandidates, metadata,
    contentHash: createHash('sha256').update(`${packageKey}\n${body}`).digest('hex'),
  }
}

/* ---------------- 入库 ---------------- */
export async function importSkillPackages(user, items = []) {
  await assertOrgAdmin(user)
  const list = (Array.isArray(items) ? items : []).slice(0, 30)
  if (!list.length) throw fail('没有收到可导入的技能包')
  const imported = []
  const skipped = []
  // 新导入的包一律先落在「未分类」，老师之后再在列表里归到具体分类。
  const defaultCategory = await ensureDefaultPackageCategory(user.organization.id)

  for (const item of list) {
    const fileName = cleanText(item?.fileName || 'SKILL.md', 160)
    try {
      const parsed = parseSkillPackage(item?.content || '', fileName)
      const existing = await query(
        'SELECT id, title FROM ai_skill_packages WHERE organization_id=$1 AND content_hash=$2 LIMIT 1',
        [user.organization.id, parsed.contentHash],
      )
      if (existing.rows[0]) {
        skipped.push({ fileName, reason: `已导入过（${existing.rows[0].title}）` })
        continue
      }
      const id = newId('skillpkg')
      const result = await query(
        `INSERT INTO ai_skill_packages
           (id, organization_id, category_id, file_name, package_key, title, summary, body, prompt_candidates, metadata, content_hash, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12) RETURNING *`,
        [
          id, user.organization.id, defaultCategory?.id || '', fileName, parsed.packageKey, parsed.title, parsed.summary,
          parsed.body, JSON.stringify(parsed.promptCandidates), JSON.stringify(parsed.metadata),
          parsed.contentHash, user.id,
        ],
      )
      // 卡片图可选：前端从 zip 里取到图才传，取不到就留空，老师之后在玩法卡里补。
      if (item?.coverUrl) {
        await query('UPDATE ai_skill_packages SET cover_url=$1 WHERE id=$2', [cleanText(item.coverUrl, 2000), id])
      }
      imported.push(toPackage({
        ...result.rows[0],
        cover_url: item?.coverUrl || '',
        category_name: defaultCategory?.name || '',
      }))
    } catch (error) {
      skipped.push({ fileName, reason: error?.message || '解析失败' })
    }
  }

  if (imported.length) {
    await logAudit(user.id, user.organization.id, 'ai_skill_package.import', 'ai_skill_package', imported.map((item) => item.id).join(','), {
      imported: imported.length, skipped: skipped.length,
    })
  }
  return { imported, skipped }
}

function toPackage(row, includeBody = false) {
  const base = {
    id: row.id,
    fileName: row.file_name || '',
    packageKey: row.package_key || '',
    title: row.title || '',
    summary: row.summary || '',
    coverUrl: row.cover_url || '',
    promptCandidates: Array.isArray(row.prompt_candidates) ? row.prompt_candidates : [],
    metadata: row.metadata || {},
    status: row.status,
    categoryId: row.category_id || '',
    categoryName: row.category_name || '',
    convertedSkillId: row.converted_skill_id || '',
    // 学生可见 = 已转出的玩法处于 published。没转玩法的包一律 false（学生端本来就没这张卡）。
    studentVisible: Boolean(row.skill_status === 'published'),
    skillStatus: row.skill_status || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (includeBody) base.body = row.body || ''
  return base
}

// 列表统一走这个 JOIN：一次带出分类名 + 学生可见状态，避免前端再补一次请求。
const LIST_SELECT = `
  SELECT p.*, c.name AS category_name, s.status AS skill_status
  FROM ai_skill_packages p
  LEFT JOIN ai_skill_package_categories c ON c.id = p.category_id
  LEFT JOIN ai_skills s ON s.id = p.converted_skill_id`

export async function listSkillPackages(user, options = {}) {
  await assertOrgAdmin(user)
  // 兼容旧调用：第二参数传字符串时当作 status 过滤。
  const opts = typeof options === 'string' ? { status: options } : (options || {})
  const filter = cleanText(opts.status, 20)
  const categoryId = cleanText(opts.categoryId, 80)
  const keyword = cleanText(opts.keyword, 60)
  const values = [user.organization.id]
  let sql = `${LIST_SELECT} WHERE p.organization_id=$1`
  if (PACKAGE_STATUSES.has(filter)) { values.push(filter); sql += ` AND p.status=$${values.length}` }
  if (categoryId && categoryId !== 'all') {
    if (categoryId === 'uncategorized') sql += ' AND p.category_id IS NULL'
    else { values.push(categoryId); sql += ` AND p.category_id=$${values.length}` }
  }
  if (keyword) {
    values.push(`%${keyword}%`)
    sql += ` AND (p.title ILIKE $${values.length} OR p.summary ILIKE $${values.length})`
  }
  sql += ' ORDER BY p.created_at DESC LIMIT 300'
  const result = await query(sql, values)
  return result.rows.map((row) => toPackage(row))
}

export async function getSkillPackageDetail(user, packageId) {
  await assertOrgAdmin(user)
  const result = await query(`${LIST_SELECT} WHERE p.id=$1 AND p.organization_id=$2 LIMIT 1`, [packageId, user.organization.id])
  if (!result.rows[0]) throw fail('技能包不存在', 404)
  return toPackage(result.rows[0], true)
}

/* ---------------- 转成玩法 ----------------
 * 产出的是一张「草稿」玩法卡：默认学生页面 + 默认画布 + 老师填的提示词。
 * 状态停在 draft，必须老师测试并发布，学生端才看得到 —— 这一步不能省。
 */
function defaultPackageWorkflow(skillType) {
  const isVideo = skillType === 'video'
  return {
    version: 1,
    nodes: [
      { id: 'upload-1', type: 'upload', position: { x: 40, y: 250 }, data: { title: isVideo ? '小画家图片输入' : '参考图片输入', image: '' } },
      { id: 'prompt-1', type: 'prompt', position: { x: 330, y: 305 }, data: { title: '创作提示词', prompt: isVideo ? '描述人物动作与镜头' : '描述希望生成的画面' } },
      { id: 'gen-1', type: isVideo ? 'video' : 'image', position: { x: 600, y: 260 }, data: { title: isVideo ? '图生视频' : 'AI 图像生成', description: isVideo ? '' : '根据提示词与参考图生成图片' } },
      { id: 'result-1', type: 'result', position: { x: 860, y: 310 }, data: { title: isVideo ? '视频结果' : '图片结果', state: 'idle' } },
    ],
    edges: [
      { id: 'edge-upload-prompt', source: 'upload-1', target: 'prompt-1', type: 'default' },
      { id: 'edge-prompt-gen', source: 'prompt-1', target: 'gen-1', type: 'default' },
      { id: 'edge-gen-result', source: 'gen-1', target: 'result-1', type: 'default' },
    ],
    settings: { prompt: '', model: isVideo ? 'agnes-video-v2.0' : '', duration: 5, ratio: isVideo ? '16:9' : '1:1', resolution: '720P', creativity: 65 },
    edgesVisible: true,
  }
}

function defaultPackageBlocks(skillType) {
  const isVideo = skillType === 'video'
  const blockId = (suffix) => `block_${randomBytes(6).toString('hex')}_${suffix}`
  return [
    { id: blockId('head'), type: 'heading', span: 12, label: isVideo ? '人物动态短片' : 'AI 图像创作', description: isVideo ? '上传图片并描述动作，一键生成动态短片。' : '描述你想要的画面，生成你的创意作品。' },
    { id: blockId('img'), type: 'image', key: 'reference_image', binding: 'upload-1', span: 6, label: '参考图片', required: isVideo, placeholder: '点击或拖拽上传图片' },
    { id: blockId('sub'), type: 'textarea', key: 'subject', binding: 'prompt-1', span: 6, label: isVideo ? '动作描述' : '画面描述', required: true, placeholder: isVideo ? '例如：女孩在海边奔跑，镜头缓慢环绕' : '描述你想生成的画面' },
    { id: blockId('rat'), type: 'ratio', key: 'ratio', binding: 'runtime.ratio', span: 6, label: '画面比例', required: true, options: ['1:1', '4:3', '3:4', '16:9', '9:16'].map((value) => ({ label: value, value })) },
    ...(!isVideo ? [{ id: blockId('cnt'), type: 'count', key: 'count', binding: 'runtime.count', span: 6, label: '生成张数', required: true }] : []),
    { id: blockId('go'), type: 'submit', span: 12, label: isVideo ? '生成视频' : '生成图片' },
    { id: blockId('res'), type: 'result', span: 12, label: isVideo ? '视频结果' : '图片结果' },
  ]
}

export function buildPackageSkillConfiguration({ skillType = 'image', promptTemplate = '', coverUrl = '' } = {}) {
  const type = SKILL_TYPES.has(skillType) ? skillType : 'image'
  const isVideo = type === 'video'
  const runtime = {
    provider: isVideo ? 'agnes' : 'volcengine',
    model: isVideo ? 'agnes-video-v2.0' : '',
    capability: isVideo ? 'image-to-video' : 'text-to-image',
    promptTemplate,
    negativePrompt: '',
    ratio: isVideo ? '16:9' : '1:1',
    quality: 'standard',
    resolution: '720P',
    duration: '5s',
    frameRate: 24,
    count: 1,
    testedAt: '',
  }
  const blocks = defaultPackageBlocks(type)
  return {
    schemaVersion: 2,
    presentation: { coverUrl, coverSource: coverUrl ? 'upload' : '', coverGeneratedAt: '', exampleUrl: '', badge: '', grade: '' },
    workflow: defaultPackageWorkflow(type),
    studentPage: { layoutVersion: 1, columns: 12, blocks },
    runtime,
    generation: runtime,
    limits: { dailyLimit: 0 },
    h5Workflow: { studentSelectable: false, estimatedMinutes: 0, pageCount: 0, flowSummary: [] },
    bindings: Object.fromEntries(blocks.filter((block) => block.key && block.binding).map((block) => [block.key, block.binding])),
  }
}

/* ---------------- 单条编辑 ----------------
 * 只允许改「展示层」三件：标题、简介、封面。
 * 正文（SKILL.md 原文）和 content_hash 不改 —— 改了就等于换了一个包，
 * 去重键会对不上，下次重新上传同一份又会重复导入。
 */
export async function updateSkillPackage(user, packageId, body = {}) {
  await assertOrgAdmin(user)
  const current = await query(
    'SELECT id, title, summary, cover_url FROM ai_skill_packages WHERE id=$1 AND organization_id=$2 LIMIT 1',
    [packageId, user.organization.id],
  )
  const row = current.rows[0]
  if (!row) throw fail('技能包不存在', 404)

  const fields = []
  const values = []
  if (body.title !== undefined) {
    const title = cleanText(body.title, TITLE_MAX)
    if (!title) throw fail('标题不能为空')
    values.push(title)
    fields.push(`title=$${values.length}`)
  }
  if (body.summary !== undefined) {
    values.push(cleanText(body.summary, SUMMARY_MAX))
    fields.push(`summary=$${values.length}`)
  }
  if (body.coverUrl !== undefined) {
    values.push(cleanText(body.coverUrl, 2000))
    fields.push(`cover_url=$${values.length}`)
  }
  if (!fields.length) throw fail('没有需要保存的内容')

  values.push(packageId, user.organization.id)
  const result = await query(
    `UPDATE ai_skill_packages SET ${fields.join(', ')}, updated_at=now()
     WHERE id=$${values.length - 1} AND organization_id=$${values.length} RETURNING *`,
    values,
  )
  // 已转出的玩法，标题/简介跟着来源一起变，否则后台改完学生端还是旧名字。
  if (row.converted_skill_id && (body.title !== undefined || body.summary !== undefined)) {
    const nextTitle = body.title !== undefined ? cleanText(body.title, TITLE_MAX) : ''
    const nextSummary = body.summary !== undefined ? cleanText(body.summary, SUMMARY_MAX) : ''
    await query(
      `UPDATE ai_skills SET
         title = CASE WHEN $1::text <> '' THEN $1::text ELSE title END,
         summary = CASE WHEN $2::boolean THEN $3::text ELSE summary END,
         updated_at = now()
       WHERE id=$4 AND organization_id=$5`,
      [nextTitle, body.summary !== undefined, nextSummary, row.converted_skill_id, user.organization.id],
    )
  }
  await logAudit(user.id, user.organization.id, 'ai_skill_package.update', 'ai_skill_package', packageId, {
    title: body.title, summaryChanged: body.summary !== undefined, coverChanged: body.coverUrl !== undefined,
  })
  return toPackage(result.rows[0])
}

/* ---------------- 批量改名 ----------------
 * 老师一次导入二三十个包，名字前面都带同一个前缀（"anthropic-skills-"之类），
 * 一个个改太慢。这里只做三件事：加前缀、加后缀、查找替换。
 * 长度上限跟单条一致（80），超了就跳过并在 skipped 里说明，不静默截断。
 */
export async function renameSkillPackages(user, body = {}) {
  await assertOrgAdmin(user)
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter(Boolean).slice(0, 100)
  if (!ids.length) throw fail('请先选择技能包')
  const prefix = cleanText(body.prefix, 40)
  const suffix = cleanText(body.suffix, 40)
  const find = String(body.find ?? '')
  const replace = String(body.replace ?? '')
  if (!prefix && !suffix && !find) throw fail('请至少填写前缀、后缀或查找内容中的一项')

  const rows = await query(
    'SELECT id, title, converted_skill_id FROM ai_skill_packages WHERE organization_id=$1 AND id = ANY($2::text[])',
    [user.organization.id, ids],
  )
  const updated = []
  const skipped = []

  await withTransaction(async (client) => {
    for (const row of rows.rows) {
      const before = String(row.title || '')
      let next = find ? before.split(find).join(replace) : before
      next = `${prefix}${next}${suffix}`
      next = next.trim()
      if (!next) { skipped.push({ id: row.id, title: before, reason: '改名后标题为空' }); continue }
      if ([...next].length > TITLE_MAX) {
        skipped.push({ id: row.id, title: before, reason: `改名后超过 ${TITLE_MAX} 字` })
        continue
      }
      if (next === before) { skipped.push({ id: row.id, title: before, reason: '名称没有变化' }); continue }
      await client.query('UPDATE ai_skill_packages SET title=$1, updated_at=now() WHERE id=$2', [next, row.id])
      if (row.converted_skill_id) {
        await client.query('UPDATE ai_skills SET title=$1, updated_at=now() WHERE id=$2 AND organization_id=$3', [next, row.converted_skill_id, user.organization.id])
      }
      updated.push({ id: row.id, from: before, to: next })
    }
  })

  await logAudit(user.id, user.organization.id, 'ai_skill_package.rename', 'ai_skill_package', ids.join(','), {
    prefix, suffix, find, replace, updated: updated.length, skipped: skipped.length,
  })
  return { ok: true, updated, skipped }
}

/* ---------------- 批量上下线（= 学生可见开关） ----------------
 * 学生能不能看到这张卡，取决于「包转出来的那个玩法」是否 published。
 * 所以这里的上下线本质是去动 ai_skills.status，而不是给包表加一个假开关。
 *
 * 上线必须过测试闸：玩法没跑过一次真实出图（runtime.testedAt 为空）不能发布，
 * 这条规矩在 publishAdminSkill 里已经写死，这里不绕过 —— 只把原因回报给老师。
 */
export async function setPackagesVisibility(user, body = {}) {
  await assertOrgAdmin(user)
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter(Boolean).slice(0, 100)
  if (!ids.length) throw fail('请先选择技能包')
  const visible = body.visible !== false

  const rows = await query(
    `SELECT p.id, p.title, p.converted_skill_id, s.status AS skill_status, s.draft_configuration AS draft_configuration, s.skill_type, s.usage_kind
     FROM ai_skill_packages p
     LEFT JOIN ai_skills s ON s.id = p.converted_skill_id
     WHERE p.organization_id=$1 AND p.id = ANY($2::text[])`,
    [user.organization.id, ids],
  )

  const updated = []
  const skipped = []
  for (const row of rows.rows) {
    if (!row.converted_skill_id) {
      skipped.push({ id: row.id, title: row.title, reason: '还没转成玩法，小画家端本来就没有这张卡' })
      continue
    }
    if (visible) {
      if (row.skill_status === 'published') { skipped.push({ id: row.id, title: row.title, reason: '已经是上线状态' }); continue }
      const testedAt = row.draft_configuration?.runtime?.testedAt
      if (!testedAt) {
        skipped.push({ id: row.id, title: row.title, reason: '玩法还没通过测试，先去玩法中心点一次测试再上线' })
        continue
      }
      await query(
        `UPDATE ai_skills SET status='published', published_configuration=draft_configuration, updated_at=now()
         WHERE id=$1 AND organization_id=$2`,
        [row.converted_skill_id, user.organization.id],
      )
    } else {
      if (row.skill_status !== 'published') { skipped.push({ id: row.id, title: row.title, reason: '当前不是上线状态' }); continue }
      await query(
        `UPDATE ai_skills SET status='offline', updated_at=now() WHERE id=$1 AND organization_id=$2`,
        [row.converted_skill_id, user.organization.id],
      )
    }
    updated.push({ id: row.id, title: row.title })
  }

  await logAudit(user.id, user.organization.id, 'ai_skill_package.visibility', 'ai_skill_package', ids.join(','), {
    visible, updated: updated.length, skipped: skipped.length,
  })
  return { ok: true, visible, updated, skipped }
}

/* ---------------- 状态变更 ---------------- */
export async function markSkillPackages(user, ids = [], status = '') {
  await assertOrgAdmin(user)
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean).slice(0, 100)
  if (!list.length) throw fail('请先选择技能包')
  if (!PACKAGE_STATUSES.has(status)) throw fail('状态不正确')
  // 已转成玩法的记录不允许被改成 pending/ignored：否则玩法还在学生端，
  // 来源记录却显示「未整理」，以后查不到这张卡是从哪来的。
  const result = await query(
    `UPDATE ai_skill_packages SET status=$1, updated_at=now()
     WHERE organization_id=$2 AND id = ANY($3::text[]) AND status <> 'converted'
     RETURNING id`,
    [status, user.organization.id, list],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill_package.status', 'ai_skill_package', list.join(','), { status, updated: result.rowCount })
  return { ok: true, updatedIds: result.rows.map((row) => row.id) }
}

export async function removeSkillPackages(user, ids = []) {
  await assertOrgAdmin(user)
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean).slice(0, 100)
  if (!list.length) throw fail('请先选择技能包')
  // 只删技能包记录，不动已转出的玩法：玩法已经独立存在于学生端，删来源不该连坐。
  const result = await query(
    'DELETE FROM ai_skill_packages WHERE organization_id=$1 AND id = ANY($2::text[]) RETURNING id',
    [user.organization.id, list],
  )
  await logAudit(user.id, user.organization.id, 'ai_skill_package.delete', 'ai_skill_package', list.join(','), { deleted: result.rowCount })
  return { ok: true, deletedIds: result.rows.map((row) => row.id) }
}

export async function bindPackageToSkill(user, packageId, skillId) {
  await assertOrgAdmin(user)
  // 转玩法时把技能包的分类一起带给新玩法卡：
  // 学生端只读 ai_skills，分类不带过去的话，老师明明归过类，学生端标签仍是空的。
  const result = await query(
    `UPDATE ai_skill_packages SET status='converted', converted_skill_id=$1, updated_at=now()
     WHERE id=$2 AND organization_id=$3 RETURNING category_id`,
    [skillId, packageId, user.organization.id],
  )
  const categoryId = result.rows[0]?.category_id || null
  if (categoryId) {
    await query(
      'UPDATE ai_skills SET category_id=$1, updated_at=now() WHERE id=$2 AND organization_id=$3',
      [categoryId, skillId, user.organization.id],
    )
  }
}
