// 验收：服务端「第 N 个图像卡槽节点 = 学生第 N 张图」的排序规则（不碰数据库、不调 AI）。
// 这套规则前端 CanvasStudio.slotOrderMap 有一份一模一样的实现，两边必须算出同一个结果，
// 否则老师在后台看到的「图 3」和学生端真正填进去的第 3 张图会对不上。
// 用法：node scripts/verify-h5-slot-order.mjs

import { h5ImageSlotOrder, h5ResultNodeOrder, h5AppendStudentWords } from '../server/ai-skill-store.js'

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const y = (id, top, left = 0, extra = {}) => ({ id, type: 'image', position: { x: left, y: top }, data: extra })
const order = (nodes) => h5ImageSlotOrder({ workflow: { nodes } }).map((node) => node.id)

// ① 都不填号：从上到下；同一行从左到右
check(
  '不填号时按画布位置从上到下排',
  JSON.stringify(order([y('c', 300), y('a', 100), y('b', 200)])) === JSON.stringify(['a', 'b', 'c']),
  order([y('c', 300), y('a', 100), y('b', 200)]).join(','),
)
check(
  '同一高度按从左到右排',
  JSON.stringify(order([y('right', 100, 500), y('left', 100, 100)])) === JSON.stringify(['left', 'right']),
  order([y('right', 100, 500), y('left', 100, 100)]).join(','),
)

// ② 填了号就是字面意思：谁填 1 谁在第一格，跟画布位置无关
check(
  '填了号按号排，不看画布位置',
  JSON.stringify(order([y('top', 100, 0, { studentSlot: { role: 'image', index: 2 } }), y('bottom', 900, 0, { studentSlot: { role: 'image', index: 1 } })])) === JSON.stringify(['bottom', 'top']),
  order([y('top', 100, 0, { studentSlot: { role: 'image', index: 2 } }), y('bottom', 900, 0, { studentSlot: { role: 'image', index: 1 } })]).join(','),
)

// ③ 只有一部分填了号：填号的先占位，没填的按画布顺序补进空位
check(
  '部分填号时其余节点自动补空位',
  JSON.stringify(order([
    y('a', 100, 0),
    y('b', 200, 0, { studentSlot: { role: 'image', index: 2 } }),
    y('c', 300, 0),
  ])) === JSON.stringify(['a', 'b', 'c']),
  order([y('a', 100, 0), y('b', 200, 0, { studentSlot: { role: 'image', index: 2 } }), y('c', 300, 0)]).join(','),
)

// ④ 号填超了不产生空格：3 个节点，有人填第 9 格
check(
  '号填超了自动排到最后，不留空格',
  JSON.stringify(order([
    y('a', 100, 0),
    y('b', 200, 0),
    y('c', 300, 0, { studentSlot: { role: 'image', index: 9 } }),
  ])) === JSON.stringify(['a', 'b', 'c']),
  order([y('a', 100, 0), y('b', 200, 0), y('c', 300, 0, { studentSlot: { role: 'image', index: 9 } })]).join(','),
)

// ⑤ 撞号不能丢节点：两个都填第 1 格，后来的按画布顺序往后排
const tie = order([
  y('a', 100, 0, { studentSlot: { role: 'image', index: 1 } }),
  y('b', 200, 0, { studentSlot: { role: 'image', index: 1 } }),
])
check('两个节点撞同一个号也不会丢', tie.length === 2 && tie[0] === 'a' && tie[1] === 'b', tie.join(','))

// ⑥ 「不上前端」的图像节点不占格子
check(
  '标了「不上前端」的图像节点不占学生端的格子',
  JSON.stringify(order([
    y('keep', 100, 0),
    y('skip', 200, 0, { studentSlot: { role: 'none', index: 0 } }),
  ])) === JSON.stringify(['keep']),
  order([y('keep', 100, 0), y('skip', 200, 0, { studentSlot: { role: 'none', index: 0 } })]).join(','),
)

// ⑦ 提示词节点就算被标成 image 也不算卡槽（老版本曾造出永远不出图的「图?」）
check(
  '非图像类型的节点不占图像卡槽',
  JSON.stringify(h5ImageSlotOrder({ workflow: { nodes: [
    y('real', 100, 0),
    { id: 'p1', type: 'prompt', position: { x: 0, y: 200 }, data: { studentSlot: { role: 'image', index: 2 } } },
  ] } }).map((node) => node.id)) === JSON.stringify(['real']),
  h5ImageSlotOrder({ workflow: { nodes: [
    y('real', 100, 0),
    { id: 'p1', type: 'prompt', position: { x: 0, y: 200 }, data: { studentSlot: { role: 'image', index: 2 } } },
  ] } }).map((node) => node.id).join(','),
)

// ⑧ 空画布不报错
check('空画布返回空数组', Array.isArray(h5ImageSlotOrder({})) && h5ImageSlotOrder({}).length === 0)

// ⑨ 有上游连线的图像节点是「结果出口」，不占学生上传格。
// 老模板右半边 8 个结果节点曾被算成素材格，卡槽算出 15 格、顺序还被 y 打乱。
const withEdge = (nodes, edges) => h5ImageSlotOrder({ workflow: { nodes, edges } }).map((node) => node.id)
check(
  '有上游连线的图像节点不算学生上传格',
  JSON.stringify(withEdge(
    [y('entry', 100), y('result', 100, 600), y('entry2', 300)],
    [{ id: 'e1', source: 'entry', target: 'result' }],
  )) === JSON.stringify(['entry', 'entry2']),
  withEdge([y('entry', 100), y('result', 100, 600), y('entry2', 300)], [{ id: 'e1', source: 'entry', target: 'result' }]).join(','),
)
check(
  '结果节点老师主动填了「第几格」仍然照填的算',
  JSON.stringify(withEdge(
    [y('entry', 100), y('result', 100, 600, { studentSlot: { role: 'image', index: 2 } })],
    [{ id: 'e1', source: 'entry', target: 'result' }],
  )) === JSON.stringify(['entry', 'result']),
)

// ⑩ 结果图顺序：有入线的图像节点按画布从上到下、从左到右，和上传格无关
check(
  '结果节点按画布位置排出 1~N',
  JSON.stringify(h5ResultNodeOrder({ workflow: {
    nodes: [y('r3', 300, 600), y('entry', 100, 0), y('r1', 100, 600), y('r2', 200, 600)],
    edges: [
      { id: 'e1', source: 'entry', target: 'r1' },
      { id: 'e2', source: 'entry', target: 'r2' },
      { id: 'e3', source: 'entry', target: 'r3' },
    ],
  } }).map((node) => node.id)) === JSON.stringify(['r1', 'r2', 'r3']),
)
check('没有连线的画布算不出结果节点', h5ResultNodeOrder({ workflow: { nodes: [y('a', 100)] } }).length === 0)

// ⑨ 文字卡槽拼接：学生的创作自述必须接在老师原文后面，不能把原文顶掉。
// ⚠️ 文字节点的正文存在 data.text，提示词节点存在 data.prompt —— 拼错字段等于删掉老师写的文案。
const words = '我画的是下雨天的小猫'
check(
  '文字节点（data.text）：学生自述接在后面，老师正文不丢',
  (() => {
    const next = h5AppendStudentWords({ text: '老师写的正文', title: '文字生成' }, words)
    return next.text === `老师写的正文\n${words}` && !next.prompt
  })(),
)
check(
  '提示词节点（data.prompt）：学生自述接在后面',
  (() => {
    const next = h5AppendStudentWords({ prompt: '老师写的提示词' }, words)
    return next.prompt === `老师写的提示词\n${words}` && !next.text
  })(),
)
check(
  '两个字段都有时拼给 data.prompt',
  h5AppendStudentWords({ prompt: 'P', text: 'T' }, words).prompt === `P\n${words}`,
)
check(
  '空节点只放学生自述、不残留空行',
  h5AppendStudentWords({}, words).prompt === words,
)
check(
  '没有学生自述时原样返回',
  JSON.stringify(h5AppendStudentWords({ text: '只保留原文' }, '')) === JSON.stringify({ text: '只保留原文' }),
)
check(
  '不改动原对象（纯函数）',
  (() => {
    const origin = { text: '原文' }
    h5AppendStudentWords(origin, words)
    return origin.text === '原文'
  })(),
)

const failed = results.filter((item) => !item.pass)
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`)
if (failed.length) {
  failed.forEach((item) => console.log(`  FAIL: ${item.name} ${item.detail}`))
  process.exitCode = 1
}
