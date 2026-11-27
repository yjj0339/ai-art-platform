/**
 * 登录账号命名规则（前端版本）。
 *
 * 服务端权威实现是 server/account-rules.js，两边规则必须保持一致。
 * 前端这份只负责「提前拦住 + 自动转小写 + 给出中文提示」，最终仍以服务端校验为准。
 *
 *  - 3–20 位
 *  - 只允许小写字母和数字（不接受下划线、横杠、空格、中文）
 *  - 允许纯数字，方便直接用手机号 / 学号 / 工号当账号
 */

export const ACCOUNT_MIN_LENGTH = 3
export const ACCOUNT_MAX_LENGTH = 20
export const ACCOUNT_PATTERN = /^[a-z0-9]+$/
export const ACCOUNT_RULE_TEXT = '账号需 3–20 位，只能用字母和数字（不要下划线、空格、中文）。'

/** 去空格 + 转小写。输入框实时调用，边打字边纠正。 */
export function normalizeAccount(value) {
  return String(value ?? '').trim().toLowerCase()
}

/** 只保留允许的字符（用于输入框实时过滤，避免出现中文/符号）。 */
export function sanitizeAccountInput(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** 返回中文错误文案，合法时返回空字符串。 */
export function accountFormatError(account) {
  const value = normalizeAccount(account)
  if (!value) return '登录账号不能为空。'
  if (value.length < ACCOUNT_MIN_LENGTH || value.length > ACCOUNT_MAX_LENGTH) return ACCOUNT_RULE_TEXT
  if (!ACCOUNT_PATTERN.test(value)) return ACCOUNT_RULE_TEXT
  return ''
}
