/**
 * 学生端智能体的记忆（落盘到服务器，不存浏览器）。
 *
 * 一个账号只有一份记忆：AI 绘画、视频、3D、课程、报告五个页面共用同一份，
 * 切页面、刷新页面、换设备登录都能接上之前聊过的内容。
 *
 * 🔴 账号隔离是本文件的头等大事：A 账号的对话绝不可能被 B 账号读到。
 * 靠三层保险，不是靠「同一个文件里按 ID 分个组」：
 *   1. 物理隔离：一个账号一个文件 <dataDir>/agent-memory/<文件名>.json，
 *      A 的对话和 B 的对话根本不在同一个文件里；
 *   2. 文件名不会撞：safe(账号ID) + sha256(账号ID) 前 12 位，两个不同 ID
 *      哪怕净化后长得一样，hash 也一定不同 → 绝不可能落到同一个文件；
 *   3. 读的时候再核对一次 userId：万一文件被换过、被手工改过，
 *      内容里的 userId 跟当前登录账号不一致就当成空的（宁可忘记，不可串号）。
 *
 * 存储结构（每个账号一个文件）：
 * {
 *   "version": 2,
 *   "userId": "8f3c...",
 *   "userName": "测试学生",
 *   "organizationId": "demo-school",
 *   "updatedAt": "2026-11-14T06:30:00.000Z",
 *   "messages": [
 *     { "id": "...", "role": "student|agent", "content": "...", "page": "paint", "at": "..." }
 *   ]
 * }
 *
 * 为什么不用数据库：本项目现在跑在老师自己的电脑上（未上架），
 * 文件存储零依赖、能直接看能直接备份；上服务器后 dataDir 指向持久化目录即可，
 * 后续要换数据库只需替换本文件里的读写实现，接口和前端都不用动。
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 每个账号最多留多少句：超了丢最早的，避免文件无限变大 */
const MAX_MESSAGES_PER_OWNER = 400
/** 单条内容上限，跟智能体接口的文本上限保持一致 */
const MAX_CONTENT_LENGTH = 2000
/** 允许的来源页面，防止前端传脏值（五个页面实际传的是下方这些值） */
const PAGES = new Set(['paint', 'video', 'model3d', 'course', 'courses', 'report', ''])
/** 一个账号一个文件的目录名（挂在 dataDir 下面） */
const MEMORY_DIR_NAME = 'agent-memory'
/** 老版本的单文件存储（所有账号挤在一个文件里），只用于一次性迁移 */
const LEGACY_FILE_NAME = 'agent-memory.json'

export function agentMemoryDir(dataDir) {
  return join(dataDir, MEMORY_DIR_NAME)
}

/** 老版本单文件路径，兼容历史数据 */
export function agentMemoryPath(dataDir) {
  return join(dataDir, LEGACY_FILE_NAME)
}

/**
 * 账号 ID → 文件名。
 * 前半段给人看（方便运维直接认出是哪个账号），后半段 hash 保证唯一：
 * 两个不同 ID 绝不可能算出同一个文件名，从根上杜绝「串号」。
 */
export function agentMemoryFile(dataDir, ownerId) {
  const raw = String(ownerId || '').trim() || 'demo-student'
  const readable = raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48)
  const fingerprint = createHash('sha256').update(raw).digest('hex').slice(0, 12)
  return join(agentMemoryDir(dataDir), `${readable}-${fingerprint}.json`)
}

/**
 * 记忆挂在账号上：登录用户用 ID。
 * 万一某个账号没 ID（不该发生），退一步用「机构 + 姓名」当身份，
 * 而不是全部塞进同一个 demo-student —— 那才是真的串号。
 */
export function agentMemoryOwnerId(user) {
  const id = String(user?.id || '').trim()
  if (id) return id
  const name = String(user?.name || '').trim()
  const org = String(user?.organization?.id || '').trim()
  if (name || org) return `no-id/${org}/${name}`
  return 'demo-student'
}

function emptyOwner(ownerId = '') {
  return { version: 2, userId: ownerId, userName: '', organizationId: '', updatedAt: '', messages: [] }
}

function toMessage(entry) {
  if (!entry || typeof entry !== 'object') return null
  const content = String(entry.content || '').trim().slice(0, MAX_CONTENT_LENGTH)
  if (!content) return null
  return {
    id: String(entry.id || ''),
    role: entry.role === 'agent' ? 'agent' : 'student',
    content,
    page: PAGES.has(String(entry.page || '')) ? String(entry.page || '') : '',
    at: String(entry.at || ''),
  }
}

/**
 * 读某个账号的记忆文件。
 * 第三层保险在这里：文件里记的 userId 跟当前账号对不上就当成空的，
 * 不把别人的对话吐给这个人。
 */
function readOwnerFile(dataDir, ownerId) {
  const file = agentMemoryFile(dataDir, ownerId)
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return emptyOwner(ownerId)
  }
  if (!parsed || typeof parsed !== 'object') return emptyOwner(ownerId)
  const storedId = String(parsed.userId || '').trim()
  if (storedId && storedId !== ownerId) {
    console.warn(`[agent-memory] 账号 ${ownerId} 的记忆文件里记的是 ${storedId}，已按空记忆处理，避免串号。`)
    return emptyOwner(ownerId)
  }
  return {
    version: 2,
    userId: ownerId,
    userName: String(parsed.userName || ''),
    organizationId: String(parsed.organizationId || ''),
    updatedAt: String(parsed.updatedAt || ''),
    messages: Array.isArray(parsed.messages) ? parsed.messages.map(toMessage).filter(Boolean) : [],
  }
}

function writeOwnerFile(dataDir, owner) {
  const dir = agentMemoryDir(dataDir)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const payload = {
    version: 2,
    userId: owner.userId,
    userName: owner.userName || '',
    organizationId: owner.organizationId || '',
    updatedAt: new Date().toISOString(),
    messages: owner.messages || [],
  }
  writeFileSync(agentMemoryFile(dataDir, owner.userId), JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

/**
 * 把老版本「所有账号挤一个文件」的数据，按账号拆成一个一个文件。
 * 只在老文件存在且里面还有账号时才动手，拆完把老文件清空（只留空壳，不删）。
 * 返回值给日志/验收脚本看，正常情况是 0。
 */
export function migrateLegacyAgentMemory(dataDir) {
  const legacyFile = agentMemoryPath(dataDir)
  if (!existsSync(legacyFile)) return 0
  let parsed
  try {
    parsed = JSON.parse(readFileSync(legacyFile, 'utf8'))
  } catch {
    return 0
  }
  const owners = parsed?.owners && typeof parsed.owners === 'object' ? parsed.owners : {}
  const ownerIds = Object.keys(owners)
  if (!ownerIds.length) return 0
  let moved = 0
  for (const ownerId of ownerIds) {
    const existing = readOwnerFile(dataDir, ownerId)
    // 新文件已经有内容就不覆盖（迁移只做一次，不能反过来吞掉新数据）
    if (existing.messages.length) continue
    const messages = (Array.isArray(owners[ownerId]?.messages) ? owners[ownerId].messages : [])
      .map(toMessage)
      .filter(Boolean)
    if (!messages.length) continue
    writeOwnerFile(dataDir, {
      userId: ownerId,
      userName: String(owners[ownerId]?.userName || ''),
      organizationId: String(owners[ownerId]?.organizationId || ''),
      messages,
    })
    moved += 1
  }
  // 老文件里已经没有数据了，留个空壳说明「已迁移」，不再往里写
  writeFileSync(legacyFile, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), owners: {} }, null, 2), 'utf8')
  if (moved) console.log(`[agent-memory] 已把老版单文件里的 ${moved} 个账号拆成独立文件。`)
  return moved
}

export function listAgentMessages(dataDir, user, options = {}) {
  const ownerId = agentMemoryOwnerId(user)
  migrateLegacyAgentMemory(dataDir)
  const owner = readOwnerFile(dataDir, ownerId)
  const all = owner.messages
  const requested = Number(options.limit)
  const limit = Math.min(Math.max(Number.isFinite(requested) && requested > 0 ? requested : 60, 1), MAX_MESSAGES_PER_OWNER)
  return {
    messages: all.slice(-limit),
    total: all.length,
    updatedAt: owner.updatedAt,
  }
}

export function appendAgentMessage(dataDir, user, payload = {}) {
  const content = String(payload.content || '').trim().slice(0, MAX_CONTENT_LENGTH)
  if (!content) {
    const error = new Error('记下来的内容不能是空的。')
    error.statusCode = 400
    throw error
  }
  const ownerId = agentMemoryOwnerId(user)
  migrateLegacyAgentMemory(dataDir)
  const owner = readOwnerFile(dataDir, ownerId)
  const message = {
    id: `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
    role: payload.role === 'agent' ? 'agent' : 'student',
    content,
    page: PAGES.has(String(payload.page || '')) ? String(payload.page || '') : '',
    at: new Date().toISOString(),
  }
  const messages = [...owner.messages, message].slice(-MAX_MESSAGES_PER_OWNER)
  writeOwnerFile(dataDir, {
    userId: ownerId,
    userName: String(user?.name || owner.userName || '').slice(0, 60),
    organizationId: String(user?.organization?.id || owner.organizationId || ''),
    messages,
  })
  return { message, total: messages.length }
}

export function clearAgentMessages(dataDir, user) {
  const ownerId = agentMemoryOwnerId(user)
  // 老数据还没拆的话先拆，否则「清空」只清了个壳，下次读取又把老数据搬回来
  migrateLegacyAgentMemory(dataDir)
  const owner = readOwnerFile(dataDir, ownerId)
  const removed = owner.messages.length
  const file = agentMemoryFile(dataDir, ownerId)
  try {
    if (existsSync(file)) unlinkSync(file)
  } catch {
    // 删不掉就写成空记忆，效果一样
    writeOwnerFile(dataDir, { userId: ownerId, userName: owner.userName, organizationId: owner.organizationId, messages: [] })
  }
  return { removed }
}

/** 只给运维/验收脚本看：当前有哪些账号有记忆（不含对话内容） */
export function listAgentMemoryOwners(dataDir) {
  const dir = agentMemoryDir(dataDir)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'))
        return {
          file: name,
          userId: String(parsed.userId || ''),
          userName: String(parsed.userName || ''),
          total: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
          updatedAt: String(parsed.updatedAt || ''),
        }
      } catch {
        return { file: name, userId: '', userName: '', total: 0, updatedAt: '' }
      }
    })
}
