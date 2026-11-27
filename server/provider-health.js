// 模型平台健康状态：连续失败 → 冷却一段时间；冷却期间出图优先走后台配置的备用模型。
// 做法参考开源网关（LiteLLM、New API）：失败计数 + 冷却时间，成功一次就清零。
// 只记在内存里：服务重启后清零（冷却只是临时避让，不需要持久化）。
//
// 什么算「平台故障」：上游返回 401/402/403/404/408/429/5xx，或者网络层连不上 / 超时。
// 上游返回 400（请求内容不合规、参数不对）不算：换个平台重试只会同样失败，或者变成绕过内容审核。

export const FAILURE_THRESHOLD = 3
export const BASE_COOLDOWN_MS = 60 * 1000
export const MAX_COOLDOWN_MS = 10 * 60 * 1000

const PROVIDER_FAILURE_STATUS = new Set([401, 402, 403, 404, 408, 429])
const states = new Map()

function stateOf(key) {
  const id = String(key || '').trim()
  if (!states.has(id)) {
    states.set(id, { consecutiveFailures: 0, trips: 0, cooldownUntil: 0, lastError: '', lastErrorAt: 0, lastSuccessAt: 0 })
  }
  return states.get(id)
}

/** 这个错误是不是「平台这边的故障」（值得冷却、值得换备用模型）。 */
export function isProviderFailure(error) {
  const status = Number(error?.upstreamStatus || 0)
  if (status) return PROVIDER_FAILURE_STATUS.has(status) || status >= 500
  const stage = String(error?.diagnostic?.stage || '')
  return stage === 'upstream_fetch' || stage === 'curl_fallback'
}

export function recordProviderSuccess(key, now = Date.now()) {
  const state = stateOf(key)
  state.consecutiveFailures = 0
  state.trips = 0
  state.cooldownUntil = 0
  state.lastSuccessAt = now
}

/** 记一次失败。只统计平台故障；连续达到阈值就进入冷却，冷却时间逐次翻倍，最长 10 分钟。 */
export function recordProviderFailure(key, error, now = Date.now()) {
  if (!isProviderFailure(error)) return false
  const state = stateOf(key)
  state.consecutiveFailures += 1
  state.lastError = String(error?.message || '未知错误').slice(0, 200)
  state.lastErrorAt = now
  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    state.trips += 1
    state.cooldownUntil = now + Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** (state.trips - 1))
    state.consecutiveFailures = 0
  }
  return true
}

export function isProviderCooling(key, now = Date.now()) {
  return stateOf(key).cooldownUntil > now
}

/** 后台显示用：状态、剩余冷却秒数、最近一次错误。没出过图的平台是 unknown。 */
export function providerHealthView(key, now = Date.now()) {
  const state = stateOf(key)
  const cooling = state.cooldownUntil > now
  const status = cooling ? 'cooling' : state.consecutiveFailures ? 'failing' : (state.lastSuccessAt || state.lastErrorAt) ? 'ok' : 'unknown'
  return {
    status,
    consecutiveFailures: state.consecutiveFailures,
    cooldownSeconds: cooling ? Math.ceil((state.cooldownUntil - now) / 1000) : 0,
    cooldownUntil: cooling ? new Date(state.cooldownUntil).toISOString() : '',
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt ? new Date(state.lastErrorAt).toISOString() : '',
    lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : '',
  }
}

/** 管理员手动「立即恢复」：清掉冷却和失败计数。 */
export function resetProviderHealth(key) {
  states.delete(String(key || '').trim())
}
