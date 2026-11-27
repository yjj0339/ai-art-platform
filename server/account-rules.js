/**
 * 登录账号命名规则（服务端唯一权威版本）。
 *
 * 前端有一份等价实现 src/utils/accountRules.js，改规则必须两边同时改。
 * 之所以不共享模块：server 是纯 Node ESM，src 走 Vite 打包，跨目录 import 会打乱构建。
 *
 * 规则来源：账号会被当作登录名，要求「好记、不会打错、不能出现中文」。
 *  - 3–20 位
 *  - 只允许小写字母和数字（不接受下划线、横杠、空格、中文）
 *  - 允许纯数字，方便直接用手机号 / 学号 / 工号当账号
 *  - 输入的大写自动转小写（登录本来就不区分大小写）
 */

export const ACCOUNT_MIN_LENGTH = 3
export const ACCOUNT_MAX_LENGTH = 20
export const ACCOUNT_PATTERN = /^[a-z0-9]+$/
export const ACCOUNT_RULE_TEXT = '账号需 3–20 位，只能用字母和数字（不要下划线、空格、中文）。'

/** 统一入口：去空格 + 转小写。任何写入 users.account 的地方都必须先过它。 */
export function normalizeAccount(value) {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * 校验账号格式，返回中文错误文案；合法时返回空字符串。
 * 入参应是 normalizeAccount 之后的值。
 */
export function accountFormatError(account) {
  const value = normalizeAccount(account)
  if (!value) return '登录账号不能为空。'
  if (value.length < ACCOUNT_MIN_LENGTH || value.length > ACCOUNT_MAX_LENGTH) return ACCOUNT_RULE_TEXT
  if (!ACCOUNT_PATTERN.test(value)) return ACCOUNT_RULE_TEXT
  return ''
}

/** 校验并返回规范化后的账号；不合法直接抛错（由调用方决定错误码）。 */
export function requireValidAccount(value) {
  const account = normalizeAccount(value)
  const message = accountFormatError(account)
  return { account, message }
}
