// 验收：画布工作流跑完之后，哪些图会进 H5 报告、按什么顺序。
// 全程脱网、不调任何模型（出图函数是假的），所以可以反复跑。
// 用法：node scripts/verify-h5-result-images.mjs

import { runImageSteps } from '../server/image-step-runner.js'

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// 假出图：谁跑出来的图就叫 fake://<nodeId>
function makeGenerator() {
  const calls = []
  const generate = async (request, step) => {
    const nodeId = step?.nodeId || ''
    calls.push({ nodeId, refs: (request.images || []).length, capability: request.capability, prompt: request.prompt })
    return { provider: 'fake', images: [{ id: `img-${nodeId}`, imageUrl: `fake://${nodeId}` }] }
  }
  return { generate, calls }
}

// 一个模板：左边 3 个素材格 → 右边 3 个结果的入口是同一个提示词节点
const slot = (id, order) => ({ nodeId: id, nodeType: 'image', slotOrder: order, slotPassthrough: true, upstreamNodeIds: [], request: { prompt: 'p', images: [`material://${id}.png`] } })
const result = (id, order) => ({ nodeId: id, nodeType: 'image', resultOrder: order, upstreamNodeIds: ['prompt1'], request: { prompt: 'p', images: [] } })

// ① 结果图全收，按 resultOrder 排（不是按执行顺序）
{
  const { generate, calls } = makeGenerator()
  const run = await runImageSteps({
    steps: [slot('s1', 1), slot('s2', 2), result('r3', 3), result('r1', 1), result('r2', 2)],
  }, { generate })
  check('3 个素材格 + 3 个结果节点 → 报告拿到 3 张结果图', run.images.length === 3, run.images.join(','))
  check('结果图按 resultOrder 排，不按执行顺序', JSON.stringify(run.images) === JSON.stringify(['fake://r1', 'fake://r2', 'fake://r3']), run.images.join(','))
  check('素材图单独返回，不混进报告的图里', JSON.stringify(run.materialImages) === JSON.stringify(['material://s1.png', 'material://s2.png']), run.materialImages.join(','))
  check('素材格原样透传、不调模型', calls.length === 3 && calls.every((call) => call.nodeId.startsWith('r')), `调了 ${calls.length} 次`)
}

// ② 8 个并排的结果节点互不拿对方当参考图（原来会接力）
{
  const { generate, calls } = makeGenerator()
  const steps = [slot('s1', 1), slot('s2', 2)]
  for (let i = 1; i <= 8; i += 1) steps.push(result(`r${i}`, i))
  const run = await runImageSteps({ steps }, { generate })
  check('8 个结果节点全部回来', run.images.length === 8, `${run.images.length} 张`)
  check('8 个结果节点各自都不带参考图（互不污染）', calls.every((call) => call.refs === 0), calls.map((call) => call.refs).join(','))
}

// ③ 上游真出过图的节点，下游要拿到它的图当参考
{
  const { generate, calls } = makeGenerator()
  const run = await runImageSteps({
    steps: [
      { nodeId: 'a', nodeType: 'image', upstreamNodeIds: [], request: { prompt: 'p', images: [] } },
      { nodeId: 'b', nodeType: 'image', upstreamNodeIds: ['a'], request: { prompt: 'p', images: [] } },
    ],
  }, { generate })
  check('下游节点拿到直接上游的图当参考', calls[1]?.refs === 1 && calls[1]?.capability === 'image-to-image', JSON.stringify(calls[1] || {}))
  check('没有槽位标记时兜底收图', run.images.length === 2, run.images.join(','))
}

// ④ 素材格 → 结果节点串起来：结果节点用学生原图当参考
{
  const { generate, calls } = makeGenerator()
  const run = await runImageSteps({
    steps: [
      slot('s1', 1),
      { nodeId: 'out', nodeType: 'image', resultOrder: 1, upstreamNodeIds: ['s1'], request: { prompt: 'p', images: [] } },
    ],
  }, { generate })
  check('结果节点能吃到素材格透传下来的学生原图', calls[0]?.refs === 1, `refs=${calls[0]?.refs}`)
  check('结果图仍是报告里的那张', JSON.stringify(run.images) === JSON.stringify(['fake://out']), run.images.join(','))
}

// ⑤ 老模板（没有 upstreamNodeIds）保持「上一步产物」的老行为，不能突然全断参考
{
  const { generate, calls } = makeGenerator()
  await runImageSteps({
    steps: [
      { nodeId: 'a', nodeType: 'image', request: { prompt: 'p', images: [] } },
      { nodeId: 'b', nodeType: 'image', request: { prompt: 'p', images: [] } },
    ],
  }, { generate })
  check('老模板没连线信息时，后一步仍拿上一步产物当参考（向后兼容）', calls[1]?.refs === 1, `refs=${calls[1]?.refs}`)
}

// ⑥ 只有素材格、没有结果节点：回落到素材原图，不能返回空
{
  const { generate } = makeGenerator()
  const run = await runImageSteps({ steps: [slot('s1', 1), slot('s2', 2)] }, { generate })
  check('只标了素材格的老模板，报告仍能拿到图', run.images.length === 2, run.images.join(','))
  check('此时 materialImages 与 images 一致', JSON.stringify(run.images) === JSON.stringify(run.materialImages))
}

// ⑦ 空规划不炸
{
  const { generate } = makeGenerator()
  const run = await runImageSteps({ request: { prompt: 'p', images: [] } }, { generate })
  check('没有 steps 时按单次出图兜底', run.images.length === 1, run.images.join(','))
}

const failed = results.filter((item) => !item.pass)
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`)
if (failed.length) {
  failed.forEach((item) => console.log(`  FAIL: ${item.name} ${item.detail}`))
  process.exitCode = 1
}
