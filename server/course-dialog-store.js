/**
 * 课程对话（课程页右侧智能体）的会话存储。
 *
 * 落点：user_documents，document_type='course-dialog'，resource_key=课程ID。
 *
 * 为什么必须按 resource_key 隔离：
 *   以前学生端智能体的记忆是「一个账号一个文件、五个页面共用」（agent-memory-store.js），
 *   在绘画页聊过的东西跑到课程页还能看到，反过来课程 A 的甲方需求会污染课程 B 的对话。
 *   这里课程 ID 就是资源键，(org, owner, 'course-dialog', courseId) 上唯一，
 *   A 课程的对话在数据库里就是另一行，物理上不可能串到 B 课程。
 *
 * 为什么不用 agent-memory-store：
 *   那个是「聊天流水」，没有阶段、没有轮次、没有已收集信息，撑不起「甲方把需求问齐才结束」
 *   这个流程。对话状态必须结构化落库，才能做到刷新页面/换设备继续聊。
 */
import { randomBytes } from 'node:crypto'
import { queryAsUser } from './db.js'

export const COURSE_DIALOG_TYPE = 'course-dialog'

/** 阶段推进顺序：开场 → 答题 → 对话 → 收尾 → 结束。只允许往前走，不回头。 */
export const DIALOG_STAGES = ['intro', 'quiz', 'dialog', 'wrapup', 'done']

const MAX_MESSAGES = 120
const MAX_CONTENT = 2000

function fail(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function newMessageId() {
  return `m_${randomBytes(9).toString('base64url')}`
}

export function assertStudent(user) {
  if (!user?.id || !user?.organization?.id) throw fail('请先登录。', 401)
  if (user.role !== 'student') throw fail('课程对话只有小画家账号可以使用。', 403)
}

function text(value, max = MAX_CONTENT) {
  return String(value ?? '').trim().slice(0, max)
}

/** 空会话：还没跟这门课聊过时用它开第一句。 */
export function emptyDialogState(courseId, persona, maxRounds) {
  return {
    courseId,
    persona,
    stage: 'intro',
    rounds: 0,
    maxRounds,
    quiz: { total: 0, answers: [] },
    collected: [],
    messages: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: '',
  }
}

/**
 * 把数据库里那一行洗成前端能直接用的会话状态。
 * 字段缺失一律给安全默认值：宁可当成「还没开始」，也不能因为一条脏数据把整个页面卡死。
 */
export function normalizeDialogState(courseId, data = {}, { persona, maxRounds, questionCount = 0 } = {}) {
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const stage = DIALOG_STAGES.includes(String(source.stage || '')) ? String(source.stage) : 'intro'
  const quiz = source.quiz && typeof source.quiz === 'object' ? source.quiz : {}
  const answers = (Array.isArray(quiz.answers) ? quiz.answers : [])
    .map((item) => ({
      questionIndex: Number(item?.questionIndex),
      choice: text(item?.choice, 4).toUpperCase(),
      correct: item?.correct === true,
      at: text(item?.at, 40),
    }))
    .filter((item) => Number.isInteger(item.questionIndex) && item.questionIndex >= 0)
  const collected = (Array.isArray(source.collected) ? source.collected : [])
    .map((item) => ({ label: text(item?.label, 40), value: text(item?.value, 400) }))
    .filter((item) => item.label && item.value)
  const messages = (Array.isArray(source.messages) ? source.messages : [])
    .map((item) => ({
      id: text(item?.id, 60) || newMessageId(),
      role: item?.role === 'student' ? 'student' : 'agent',
      kind: ['text', 'quiz', 'notice'].includes(String(item?.kind || '')) ? String(item.kind) : 'text',
      content: text(item?.content),
      at: text(item?.at, 40) || new Date().toISOString(),
    }))
    .filter((item) => item.content)
    .slice(-MAX_MESSAGES)
  const rounds = Math.max(0, Math.min(Number(source.rounds) || 0, 40))
  return {
    courseId,
    persona: ['client', 'teacher'].includes(String(source.persona || '')) ? String(source.persona) : persona,
    stage,
    rounds,
    maxRounds: Number(source.maxRounds) > 0 ? Math.min(Number(source.maxRounds), 20) : maxRounds,
    quiz: { total: Number(quiz.total) || questionCount, answers },
    collected,
    messages,
    startedAt: text(source.startedAt, 40),
    updatedAt: text(source.updatedAt, 40),
    finishedAt: text(source.finishedAt, 40),
  }
}

/** 追加一句话（同时裁剪长度，避免对话无限膨胀把 JSONB 撑大）。 */
export function appendDialogMessage(state, { role, content, kind = 'text' }) {
  const body = text(content)
  if (!body) return state
  state.messages = [...(state.messages || []), {
    id: newMessageId(),
    role: role === 'student' ? 'student' : 'agent',
    kind: ['text', 'quiz', 'notice'].includes(kind) ? kind : 'text',
    content: body,
    at: new Date().toISOString(),
  }].slice(-MAX_MESSAGES)
  state.updatedAt = new Date().toISOString()
  return state
}

/** 阶段只能往前推，不能退：防止前端传个旧 stage 把已完成的对话题重新拉回答题。 */
export function advanceStage(state, next) {
  const currentIndex = DIALOG_STAGES.indexOf(state.stage)
  const nextIndex = DIALOG_STAGES.indexOf(next)
  if (nextIndex > currentIndex) state.stage = next
  return state
}

/**
 * 记一道选择题的作答。
 *
 * 同一题重答以最后一次为准（学生会改主意），所以先按 questionIndex 过滤再 push，
 * 不然后台看到的「答了 6 题」其实是同一题点了 6 次。
 */
export function recordQuizAnswer(state, { questionIndex, choice, correct }) {
  const index = Number(questionIndex)
  if (!Number.isInteger(index) || index < 0) return state
  const answers = (state.quiz?.answers || []).filter((item) => item.questionIndex !== index)
  answers.push({
    questionIndex: index,
    choice: text(choice, 4).toUpperCase(),
    correct: correct === true,
    at: new Date().toISOString(),
  })
  answers.sort((left, right) => left.questionIndex - right.questionIndex)
  state.quiz = { total: Number(state.quiz?.total) || 0, answers }
  state.updatedAt = new Date().toISOString()
  return state
}

/** 已作答的题目数量（按题目去重）。 */
export function quizAnsweredCount(state) {
  return new Set((state.quiz?.answers || []).map((item) => item.questionIndex)).size
}

/**
 * 读这门课的对话。
 *
 * 用 queryAsUser 走 RLS：哪怕 SQL 条件写漏了，数据库层也只吐出当前学生自己的行。
 */
export async function loadCourseDialog(user, courseId) {
  assertStudent(user)
  const result = await queryAsUser(user,
    `SELECT id, data, version FROM user_documents
     WHERE organization_id = $1 AND owner_user_id = $2 AND document_type = $3
       AND resource_key = $4 AND deleted_at IS NULL
     LIMIT 1`,
    [user.organization.id, user.id, COURSE_DIALOG_TYPE, text(courseId, 160)],
  )
  const row = result.rows[0]
  return row
    ? { documentId: row.id, version: Number(row.version) || 1, data: row.data || {} }
    : { documentId: '', version: 0, data: {} }
}

/** 写回这门课的对话。第一次写就 insert，之后 update，靠版本号防两端互相覆盖。 */
export async function saveCourseDialog(user, courseId, state, existing = {}) {
  assertStudent(user)
  const payload = JSON.stringify(state)
  if (existing.documentId) {
    const result = await queryAsUser(user,
      `UPDATE user_documents
       SET data = $1::jsonb, version = version + 1, updated_at = now()
       WHERE id = $2 AND organization_id = $3 AND owner_user_id = $4 AND deleted_at IS NULL
       RETURNING id, version`,
      [payload, existing.documentId, user.organization.id, user.id],
    )
    if (!result.rows[0]) throw fail('对话保存失败，请刷新页面后重试。', 409)
    return { documentId: result.rows[0].id, version: Number(result.rows[0].version) || 1 }
  }
  const id = `doc_${randomBytes(18).toString('base64url')}`
  try {
    const result = await queryAsUser(user,
      `INSERT INTO user_documents (id, organization_id, campus_id, owner_user_id, document_type, resource_key, title, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, version`,
      [id, user.organization.id, user.campus?.id || null, user.id, COURSE_DIALOG_TYPE,
        text(courseId, 160), '课程对话', payload],
    )
    return { documentId: result.rows[0].id, version: Number(result.rows[0].version) || 1 }
  } catch (error) {
    // 同一门课并发点两次「说」时，唯一键会撞。这里重查一次改成更新，不能把学生刚说的话丢掉。
    if (error?.code !== '23505') throw error
    const again = await loadCourseDialog(user, courseId)
    if (!again.documentId) throw fail('对话保存失败，请刷新页面后重试。', 409)
    return saveCourseDialog(user, courseId, state, again)
  }
}
