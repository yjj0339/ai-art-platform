// 智能体调用记录（后台「调用记录」页签的数据源）。
//
// 只做一件事：把每次走流程的文本模型调用记下来，方便老师回看
// 「学生说没反应」到底卡在哪一步：是没被识别、是模型报错、还是没配 Key。
//
// 三条硬规则：
//   1. 只存摘要，不存提示词全文和学生原话 —— 这里可能出现学生个人信息，落盘要克制。
//   2. 任何异常都不能往上抛：日志写失败绝不能连带让 AI 调用失败。
//   3. 环形保留，最多 limit 条，最新的在最前面。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_LIMIT = 500
const SUMMARY_LIMIT = 80
const ERROR_LIMIT = 200

function safeReadList(filePath) {
  try {
    if (!filePath || !existsSync(filePath)) return []
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeWriteList(filePath, list) {
  try {
    if (!filePath) return false
    mkdirSync(dirname(filePath), { recursive: true })
    // 先写临时文件再改名，避免进程被杀时留下半截 JSON 把整个记录读废。
    const tmpPath = `${filePath}.tmp`
    writeFileSync(tmpPath, JSON.stringify(list, null, 2), 'utf8')
    renameSync(tmpPath, filePath)
    return true
  } catch {
    return false
  }
}

function textValue(value, limit) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return limit > 0 ? text.slice(0, limit) : text
}

export function createAgentCallLog(options = {}) {
  const resolvePath = typeof options.resolvePath === 'function'
    ? options.resolvePath
    : () => options.filePath || ''
  const limit = Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : DEFAULT_LIMIT

  function append(entry = {}) {
    try {
      const filePath = resolvePath()
      if (!filePath) return null
      const record = {
        id: `call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        at: new Date().toISOString(),
        flowKey: textValue(entry.flowKey, 60),
        agentId: textValue(entry.agentId, 60),
        agentName: textValue(entry.agentName, 60),
        provider: textValue(entry.provider, 40),
        model: textValue(entry.model, 80),
        status: entry.status === 'error' ? 'error' : 'ok',
        durationMs: Math.max(0, Math.round(Number(entry.durationMs) || 0)),
        source: textValue(entry.source, 40),
        summary: textValue(entry.summary, SUMMARY_LIMIT),
        error: textValue(entry.error, ERROR_LIMIT),
      }
      const list = safeReadList(filePath)
      list.unshift(record)
      safeWriteList(filePath, list.slice(0, limit))
      return record
    } catch {
      return null
    }
  }

  function query(filter = {}) {
    const filePath = resolvePath()
    const flowKey = textValue(filter.flowKey, 60)
    const status = textValue(filter.status, 20)
    const requested = Math.floor(Number(filter.limit))
    const take = requested > 0 ? Math.min(requested, limit) : 100
    return safeReadList(filePath)
      .filter((item) => (flowKey ? item.flowKey === flowKey : true))
      .filter((item) => (status && status !== 'all' ? item.status === status : true))
      .slice(0, take)
  }

  function clear() {
    const filePath = resolvePath()
    return safeWriteList(filePath, [])
  }

  return { append, query, clear, resolvePath }
}
