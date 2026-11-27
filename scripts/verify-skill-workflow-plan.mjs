// 画布工作流执行器回归验收（纯内存，不连数据库、不调模型、不产生费用）
//
// 验证的是「老师在无限画布上搭的流程」能不能被正确翻译成执行步骤：
//   1. 单节点：学生上传的图 + 填的字，有没有进到请求里
//   2. 双节点：第二步能不能读到第一步的提示词
//   3. 占位文案：画布默认文案不能被当成老师写的提示词
//   4. 兜底追加：模板没引用学生字段时，学生写的内容不能丢
//   5. 护栏：无生成节点 / 没提示词 / 变量对不上 / 连线成环 / 视频多节点
//
// 执行：node scripts/verify-skill-workflow-plan.mjs
import { buildSkillWorkflowRequest, hasSkillWorkflow, planSkillWorkflow } from '../server/ai-skill-store.js'

let pass = 0
let fail = 0
const check = (ok, label, extra = '') => {
  if (ok) pass += 1
  else fail += 1
  console.log((ok ? '  OK   ' : '  FAIL ') + label + (extra ? ' → ' + extra : ''))
}
const expectThrow = (fn, keyword, label) => {
  try {
    fn()
    check(false, label, '没有报错，但应该被拦住')
  } catch (error) {
    check(String(error?.message || '').includes(keyword), label, error?.message || '')
  }
}

// 一套最小可用的学生页面板：上传 + 文字 + 生成按钮 + 结果
const baseBlocks = (fields = {}) => [
  { id: 'b0', type: 'heading', label: '玩法' },
  fields.image ? { id: 'b1', type: 'image', key: fields.image.key, label: '上传素材', binding: fields.image.binding, required: true } : null,
  fields.text ? { id: 'b2', type: 'textarea', key: fields.text.key, label: '想画什么', binding: fields.text.binding, maxLength: 1000 } : null,
  fields.extra || null,
  { id: 'b8', type: 'submit', label: '生成图片' },
  { id: 'b9', type: 'result', label: '图片结果' },
].filter(Boolean)

console.log('\n[1] 单节点：上传图 + 学生填字')
{
  const cfg = {
    runtime: { provider: 'volcengine', capability: 'image-to-image', promptTemplate: '把{{subject}}画成{{style}}风格的小插画', ratio: '3:4', count: 1 },
    workflow: {
      nodes: [
        { id: 'upload-1', type: 'upload', data: { title: '上传素材' } },
        { id: 'prompt-1', type: 'prompt', data: { title: '创作提示词' } },
        { id: 'image-1', type: 'image', data: { title: '出图' } },
        { id: 'result-1', type: 'result', data: { title: '结果' } },
      ],
      edges: [
        { source: 'upload-1', target: 'prompt-1' },
        { source: 'prompt-1', target: 'image-1' },
        { source: 'image-1', target: 'result-1' },
      ],
    },
    studentPage: { blocks: baseBlocks({
      image: { key: 'reference_image', binding: 'upload-1' },
      text: { key: 'subject', binding: 'prompt-1' },
      extra: { id: 'b3', type: 'select', key: 'style', label: '风格', binding: 'prompt-1', options: [{ label: '水墨', value: '水墨' }] },
    }) },
  }
  const prepared = buildSkillWorkflowRequest({ skillType: 'image', configuration: cfg }, {
    reference_image: 'https://example.test/student-upload.png', subject: '森林里的小狐狸', style: '水墨',
  })
  check(prepared.steps.length === 1, '识别出 1 个生成步骤', String(prepared.steps.length))
  check(prepared.steps[0].request.prompt.includes('森林里的小狐狸'), '学生填的主体进入提示词')
  check(prepared.steps[0].request.prompt.includes('水墨'), '学生选的风格进入提示词')
  check(!/{{|}}/.test(prepared.steps[0].request.prompt), '提示词没有残留未替换的变量', prepared.steps[0].request.prompt)
  check(prepared.steps[0].request.images.length === 1, '学生上传的图进入素材', String(prepared.steps[0].request.images.length))
  check(prepared.steps[0].request.capability === 'image-to-image', '有素材时自动走图生图', prepared.steps[0].request.capability)
}

console.log('\n[2] 双节点：第二步读第一步的产物')
{
  const cfg = {
    runtime: { provider: 'volcengine', capability: 'image-to-image', promptTemplate: '{{subject}}', ratio: '1:1', count: 1 },
    workflow: {
      nodes: [
        { id: 'upload-1', type: 'upload', data: { title: '上传' } },
        { id: 'prompt-1', type: 'prompt', data: { prompt: '把这张图变成{{style}}风格，主体是{{subject}}' } },
        { id: 'image-1', type: 'image', data: { title: '第一版' } },
        { id: 'prompt-2', type: 'prompt', data: { prompt: '在上一版基础上加上金色描边' } },
        { id: 'image-2', type: 'image', data: { title: '精修版' } },
        { id: 'result-1', type: 'result', data: { title: '结果' } },
      ],
      edges: [
        { source: 'upload-1', target: 'image-1' },
        { source: 'prompt-1', target: 'image-1' },
        { source: 'image-1', target: 'image-2' },
        { source: 'prompt-2', target: 'image-2' },
        { source: 'image-2', target: 'result-1' },
      ],
    },
    studentPage: { blocks: baseBlocks({
      image: { key: 'reference_image', binding: 'upload-1' },
      text: { key: 'subject', binding: 'prompt-1' },
      extra: { id: 'b3', type: 'select', key: 'style', label: '风格', binding: 'prompt-1', options: [{ label: '水墨', value: '水墨' }] },
    }) },
  }
  const prepared = buildSkillWorkflowRequest({ skillType: 'image', configuration: cfg }, {
    reference_image: 'https://example.test/a.png', subject: '一只猫', style: '水墨',
  })
  check(prepared.steps.length === 2, '两个生成节点被识别为两步', String(prepared.steps.length))
  check(prepared.steps[0].request.prompt.includes('一只猫') && prepared.steps[0].request.prompt.includes('水墨'), '第一步插值正确', prepared.steps[0].request.prompt)
  check(prepared.steps[1].request.prompt.includes('金色描边'), '第二步用自己的提示词节点', prepared.steps[1].request.prompt)
  check(prepared.steps[1].request.prompt.includes('一只猫'), '第二步能看到上游提示词', prepared.steps[1].request.prompt)
  check(prepared.steps[0].request.images.length === 1, '第一步带上了学生上传的图')
  check(prepared.request === prepared.steps[1].request, '返回的 request 指向最后一步（兼容老调用方）')
}

console.log('\n[3] 占位文案：画布默认说明不能当提示词')
{
  const cfg = {
    runtime: { provider: 'volcengine', capability: 'text-to-image', promptTemplate: '画一只{{subject}}', ratio: '1:1', count: 1 },
    workflow: {
      nodes: [
        { id: 'prompt-1', type: 'prompt', data: { prompt: '描述希望生成的画面' } },
        { id: 'image-1', type: 'image', data: { title: '出图' } },
        { id: 'result-1', type: 'result', data: {} },
      ],
      edges: [{ source: 'prompt-1', target: 'image-1' }, { source: 'image-1', target: 'result-1' }],
    },
    studentPage: { blocks: baseBlocks({ text: { key: 'subject', binding: 'prompt-1' } }) },
  }
  const prepared = buildSkillWorkflowRequest({ skillType: 'image', configuration: cfg }, { subject: '猫' })
  const prompt = prepared.steps[0].request.prompt
  check(!prompt.includes('描述希望生成的画面'), '占位说明没被当成提示词', prompt)
  check(prompt === '画一只猫', '回落到工作流配置里的提示词模板', prompt)
}

console.log('\n[4] 兜底追加：模板没引用学生字段时不能丢内容')
{
  const cfg = {
    runtime: { provider: 'volcengine', capability: 'text-to-image', promptTemplate: '', ratio: '1:1', count: 1 },
    workflow: {
      nodes: [
        { id: 'prompt-1', type: 'prompt', data: { prompt: '画一只可爱的猫' } },
        { id: 'image-1', type: 'image', data: {} },
        { id: 'result-1', type: 'result', data: {} },
      ],
      edges: [{ source: 'prompt-1', target: 'image-1' }, { source: 'image-1', target: 'result-1' }],
    },
    studentPage: { blocks: baseBlocks({ text: { key: 'subject', binding: 'prompt-1' } }) },
  }
  const prepared = buildSkillWorkflowRequest({ skillType: 'image', configuration: cfg }, { subject: '狐狸' })
  const prompt = prepared.steps[0].request.prompt
  check(prompt.includes('画一只可爱的猫'), '老师写的提示词保留', prompt)
  check(prompt.includes('狐狸'), '学生写的内容作为补充追加', prompt)
}

console.log('\n[5] 护栏：做错了会给出人话提示')
{
  expectThrow(() => planSkillWorkflow({
    generation: { promptTemplate: '画{{subject}}' },
    workflow: {
      nodes: [{ id: 'upload-1', type: 'upload', data: {} }, { id: 'prompt-1', type: 'prompt', data: {} }, { id: 'result-1', type: 'result', data: {} }],
      edges: [{ source: 'upload-1', target: 'prompt-1' }, { source: 'prompt-1', target: 'result-1' }],
    },
  }, { subject: '猫' }), '还没有图像/视频生成节点', '画布上没搭生成节点 → 拦住')

  check(hasSkillWorkflow({ workflow: { nodes: [{ id: 'upload-1', type: 'upload' }] } }) === false, '没有生成节点时判定为老玩法（走旧逻辑）')

  const blankPromptCfg = {
    runtime: { provider: 'volcengine', capability: 'text-to-image', promptTemplate: '', ratio: '1:1', count: 1 },
    workflow: {
      nodes: [{ id: 'prompt-1', type: 'prompt', data: { prompt: '描述希望生成的画面' } }, { id: 'image-1', type: 'image', data: {} }, { id: 'result-1', type: 'result', data: {} }],
      edges: [{ source: 'prompt-1', target: 'image-1' }, { source: 'image-1', target: 'result-1' }],
    },
    studentPage: { blocks: baseBlocks({ text: { key: 'subject', binding: 'prompt-1' } }) },
  }
  expectThrow(() => buildSkillWorkflowRequest({ skillType: 'image', configuration: blankPromptCfg }, { subject: '猫' }), '提示词是空的', '画布和配置里都没写提示词 → 拦住')

  const badVarCfg = JSON.parse(JSON.stringify(blankPromptCfg))
  badVarCfg.runtime.promptTemplate = '画一只{{style}}'
  expectThrow(() => buildSkillWorkflowRequest({ skillType: 'image', configuration: badVarCfg }, { subject: '猫' }), '没有对应的填写项', '模板用了 {{style}} 但学生页没这个字段 → 拦住')

  const cycleCfg = {
    runtime: { provider: 'volcengine', capability: 'text-to-image', promptTemplate: '画{{subject}}', ratio: '1:1', count: 1 },
    workflow: {
      nodes: [{ id: 'prompt-1', type: 'prompt', data: { prompt: '画{{subject}}' } }, { id: 'image-1', type: 'image', data: {} }, { id: 'result-1', type: 'result', data: {} }],
      edges: [{ source: 'prompt-1', target: 'image-1' }, { source: 'image-1', target: 'prompt-1' }, { source: 'image-1', target: 'result-1' }],
    },
    studentPage: { blocks: baseBlocks({ text: { key: 'subject', binding: 'prompt-1' } }) },
  }
  expectThrow(() => buildSkillWorkflowRequest({ skillType: 'image', configuration: cycleCfg }, { subject: '猫' }), '循环', '连线绕成环 → 拦住')

  const twoVideoCfg = {
    runtime: { provider: 'agnes', capability: 'text-to-video', promptTemplate: '镜头：{{subject}}', ratio: '9:16', count: 1 },
    workflow: {
      nodes: [
        { id: 'prompt-1', type: 'prompt', data: { prompt: '镜头：{{subject}}' } },
        { id: 'video-1', type: 'video', data: {} },
        { id: 'video-2', type: 'video', data: {} },
        { id: 'result-1', type: 'result', data: {} },
      ],
      edges: [{ source: 'prompt-1', target: 'video-1' }, { source: 'video-1', target: 'video-2' }, { source: 'video-2', target: 'result-1' }],
    },
    studentPage: { blocks: [{ id: 'b1', type: 'textarea', key: 'subject', binding: 'prompt-1' }, { id: 'b8', type: 'submit' }, { id: 'b9', type: 'result' }] },
  }
  expectThrow(() => buildSkillWorkflowRequest({ skillType: 'video', configuration: twoVideoCfg }, { subject: '森林' }), '暂不支持多个生成节点', '视频玩法搭了两个生成节点 → 拦住')
}

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
