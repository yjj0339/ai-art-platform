/**
 * 按账号分开的浏览器本地存储。
 *
 * 为什么要有这一层：
 * 同一个浏览器换账号登录时，localStorage 不会自动清空。只要键名写死成一个
 * （比如 canvas-assistant-session-v1），A 退出、B 登录，B 照样能读到 A 的对话，
 * 这就是真正的串号 —— 不是「记得太多」，是「记到别人身上」。
 *
 * 做法：
 * 键名 = 基础键 + 账号指纹。指纹前半段是净化后的账号 ID（方便人肉排查是谁的数据），
 * 后半段是 hash（保证两个净化后长得一样的 ID 也不会落到同一个键上）。
 * A 的键和 B 的键根本不是同一个键，谁也不会读到谁的。
 *
 * 为什么不用加密、不用后端：
 * 这里存的是「界面上已经显示过的最近几条对话」，属于本机体验数据；
 * 目标是「不串号」，不是「防本机的人翻 devtools」。真要防翻，得搬到服务器，
 * 那是另一件事（用户端智能体的记忆已经搬了，见 server/agent-memory-store.js）。
 */

/** FNV-1a 32 位：用来区分账号足够，不用于任何安全用途 */
function fingerprint(raw) {
  let hash = 0x811c9dc5
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 算出某个账号专用的键名。
 * 没登录（拿不到账号）时退成 anonymous：那种情况下本来就没有「别人」可言。
 */
export function scopedStorageKey(baseKey, userId) {
  const raw = String(userId || '').trim() || 'anonymous'
  const readable = raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32)
  return `${baseKey}::${readable}-${fingerprint(raw)}`
}

export function readAccountText(baseKey, userId) {
  try {
    return window.localStorage.getItem(scopedStorageKey(baseKey, userId)) || ''
  } catch {
    return ''
  }
}

export function writeAccountText(baseKey, userId, value) {
  try {
    window.localStorage.setItem(scopedStorageKey(baseKey, userId), String(value))
    return true
  } catch {
    // 隐私模式或空间满了：写不进去不该影响正常使用
    return false
  }
}

export function readAccountJson(baseKey, userId) {
  const raw = readAccountText(baseKey, userId)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    removeAccountText(baseKey, userId)
    return null
  }
}

export function writeAccountJson(baseKey, userId, value) {
  try {
    return writeAccountText(baseKey, userId, JSON.stringify(value))
  } catch {
    return false
  }
}

export function removeAccountText(baseKey, userId) {
  try {
    window.localStorage.removeItem(scopedStorageKey(baseKey, userId))
    return true
  } catch {
    return false
  }
}

/**
 * 丢掉「不分账号」的老键。
 *
 * 老键里装的对话不知道属于谁，挪给当前登录的人就等于把上一个人的话送给他，
 * 所以只能丢掉，不能继承。返回是否真的丢了东西（给验收脚本和日志看）。
 */
export function discardLegacyStorageKey(baseKey) {
  try {
    const had = window.localStorage.getItem(baseKey) !== null
    window.localStorage.removeItem(baseKey)
    return had
  } catch {
    return false
  }
}
