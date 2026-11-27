#!/usr/bin/env node
/**
 * 火山方舟「组图参数」回归检查（纯静态，不调接口、不花钱）
 *
 * 背景：doubao-seedream-5-0-flash 只要请求体里出现 sequential_image_generation
 * 就整单 400（值写 disabled 也没用），而 4.x 需要显式传这个开关。
 * 所以后端必须是「白名单里才发」。这个脚本守住这条线：
 *   1. 白名单判定逻辑还在；
 *   2. 4.x 判为支持、5.x 与未知型号判为不支持；
 *   3. payload 对象字面量里不再无条件写这个字段。
 *
 * 用法：node scripts/verify-volcengine-sequential-param.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(projectRoot, 'server', 'index.js'), 'utf8')

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`PASS  ${label}${detail ? '  ' + detail : ''}`)
  } else {
    fail += 1
    console.log(`FAIL  ${label}${detail ? '  ' + detail : ''}`)
  }
}

// 1. 判定函数存在
check(
  '存在 volcengineSupportsSequential 判定函数',
  /function volcengineSupportsSequential\s*\(/.test(source)
)

// 2. 白名单常量存在，并能提取出正则源码
const patternBlock = source.match(/const VOLCENGINE_SEQUENTIAL_MODEL_PATTERNS\s*=\s*\[([\s\S]*?)\]/)
check('存在 VOLCENGINE_SEQUENTIAL_MODEL_PATTERNS 白名单', Boolean(patternBlock))

if (patternBlock) {
  const literals = [...patternBlock[1].matchAll(/\/((?:\\.|[^/\n])+)\/([a-z]*)/g)]
  check('白名单里至少有一条型号规则', literals.length > 0, `共 ${literals.length} 条`)

  const patterns = literals.map((m) => new RegExp(m[1], m[2]))
  const supports = (model) => patterns.some((re) => re.test(String(model || '').trim()))

  // 3. 实际型号判定
  const mustSupport = ['doubao-seedream-4-0-250828', 'doubao-seedream-4-5-250915']
  const mustReject = [
    'doubao-seedream-5-0-flash-260915',
    'doubao-seedream-5-0-260915',
    'jimeng-3.0',
    '',
  ]
  for (const model of mustSupport) {
    check(`4.x 应带上组图参数：${model}`, supports(model) === true)
  }
  for (const model of mustReject) {
    check(`5.x/未知应不发组图参数：${model || '(空)'}`, supports(model) === false)
  }
}

// 4. payload 字面量里不能再无条件写这个字段
const payloadBlock = source.match(/const payload = \{([\s\S]*?)\n    \}/)
check('找到出图 payload 字面量', Boolean(payloadBlock))
if (payloadBlock) {
  check(
    'payload 字面量里已无 sequential_image_generation（改为条件添加）',
    !/sequential_image_generation/.test(payloadBlock[1])
  )
}
check(
  '仅在判定通过时设置该字段',
  /if\s*\(volcengineSupportsSequential\(model\)\)\s*\{\s*\n\s*payload\.sequential_image_generation/.test(source)
)

console.log(`\n合计 ${pass + fail} 项：PASS ${pass} / FAIL ${fail}`)
process.exit(fail === 0 ? 0 : 1)
