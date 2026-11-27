const ratios = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9']
const inputBlockTypes = new Set(['image', 'images', 'text', 'textarea', 'select', 'switch', 'count', 'ratio'])

export const skillBlockCatalog = [
  { type: 'image', label: '单图上传', input: true, defaultSpan: 6 },
  { type: 'images', label: '多图上传', input: true, defaultSpan: 12 },
  { type: 'text', label: '提示词', input: true, defaultSpan: 6 },
  { type: 'textarea', label: '多行提示词', input: true, defaultSpan: 12 },
  { type: 'select', label: '下拉选择', input: true, defaultSpan: 6 },
  { type: 'switch', label: '开关选项', input: true, defaultSpan: 6 },
  { type: 'count', label: '生成数量', input: true, defaultSpan: 6 },
  { type: 'ratio', label: '画面比例', input: true, defaultSpan: 6 },
  { type: 'heading', label: '标题说明', input: false, defaultSpan: 12 },
  { type: 'example', label: '示例图片', input: false, defaultSpan: 12 },
  { type: 'submit', label: '生成按钮', input: false, defaultSpan: 12 },
  { type: 'result', label: '生成结果', input: false, defaultSpan: 12 },
]

function id(prefix = 'block') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function defaultWorkflow(skillType = 'image') {
  const isVideo = skillType === 'video'
  return {
    version: 1,
    nodes: [
      { id: 'upload-1', type: 'upload', position: { x: 40, y: 250 }, data: { title: isVideo ? '用户图片输入' : '参考图片输入', image: '' } },
      { id: 'prompt-1', type: 'prompt', position: { x: 330, y: 305 }, data: { title: '创作提示词', prompt: isVideo ? '描述人物动作与镜头' : '描述希望生成的画面' } },
      { id: 'video-1', type: isVideo ? 'video' : 'image', position: { x: 600, y: 260 }, data: { title: isVideo ? 'Agnes 图生视频' : 'AI 图像生成', description: isVideo ? '' : '根据提示词与参考图生成图片' } },
      { id: 'result-1', type: 'result', position: { x: 860, y: 310 }, data: { title: isVideo ? '视频结果' : '图片结果', state: 'idle' } },
    ],
    edges: [
      { id: 'edge-upload-prompt', source: 'upload-1', target: 'prompt-1', type: 'default' },
      { id: 'edge-prompt-video', source: 'prompt-1', target: 'video-1', type: 'default' },
      { id: 'edge-video-result', source: 'video-1', target: 'result-1', type: 'default' },
    ],
    settings: { prompt: '', model: isVideo ? 'agnes-video-v2.0' : '', duration: 5, ratio: isVideo ? '16:9' : '1:1', resolution: '720P', creativity: 65 },
    edgesVisible: true,
  }
}

export function defaultStudentBlocks(skillType = 'image') {
  const isVideo = skillType === 'video'
  return [
    { id: id(), type: 'heading', span: 12, label: isVideo ? '人物动态短片' : 'AI 图像创作', description: isVideo ? '上传图片并描述动作，一键生成动态短片。' : '上传参考图并描述画面，生成你的创意作品。' },
    { id: id(), type: 'image', key: 'reference_image', binding: 'upload-1', span: 6, label: '参考图片', required: isVideo, placeholder: '点击或拖拽上传图片' },
    { id: id(), type: 'textarea', key: 'subject', binding: 'prompt-1', span: 6, label: isVideo ? '动作描述' : '画面描述', required: true, placeholder: isVideo ? '例如：女孩在海边奔跑，镜头缓慢环绕' : '描述你想生成的画面' },
    { id: id(), type: 'ratio', key: 'ratio', binding: 'runtime.ratio', span: 6, label: '画面比例', required: true, options: ratios.map((value) => ({ label: value, value })) },
    ...(!isVideo ? [{ id: id(), type: 'count', key: 'count', binding: 'runtime.count', span: 6, label: '生成张数', required: true }] : []),
    { id: id(), type: 'submit', span: 12, label: isVideo ? '生成视频' : '生成图片' },
    { id: id(), type: 'result', span: 12, label: isVideo ? '视频结果' : '图片结果' },
  ]
}

export function defaultSkillConfiguration(skillType = 'image') {
  const isVideo = skillType === 'video'
  return {
    schemaVersion: 2,
    presentation: { coverUrl: '', coverSource: '', coverGeneratedAt: '', exampleUrl: '', badge: '', grade: '' },
    workflow: defaultWorkflow(skillType),
    studentPage: { layoutVersion: 1, columns: 12, blocks: defaultStudentBlocks(skillType) },
    runtime: {
      provider: isVideo ? 'agnes' : 'volcengine', model: isVideo ? 'agnes-video-v2.0' : '',
      capability: isVideo ? 'image-to-video' : 'text-to-image', promptTemplate: '{{subject}}', negativePrompt: '',
      ratio: isVideo ? '16:9' : '1:1', quality: 'standard', resolution: '720P', duration: '5s', frameRate: 24, count: 1,
      testedAt: '',
    },
    limits: { dailyLimit: 0 },
    h5Workflow: { studentSelectable: false, estimatedMinutes: 0, pageCount: 0, flowSummary: [] },
    bindings: {},
  }
}

export function inputFieldsFromBlocks(blocks = []) {
  return blocks.filter((block) => inputBlockTypes.has(block.type)).map((block) => ({
    key: block.key,
    label: block.label,
    type: block.type === 'images' ? 'image' : block.type === 'count' ? 'select' : block.type === 'ratio' ? 'select' : block.type,
    required: Boolean(block.required),
    placeholder: block.placeholder || '',
    defaultValue: block.defaultValue ?? (block.type === 'switch' ? false : ''),
    maxLength: block.type === 'textarea' ? 1000 : 200,
    options: block.type === 'count'
      ? [1, 2, 3, 4].map((value) => ({ label: String(value), value: String(value) }))
      : (block.options || []),
  })).filter((field) => field.key)
}

export function normalizeSkillForSave(configuration, skillType) {
  const next = JSON.parse(JSON.stringify(configuration || defaultSkillConfiguration(skillType)))
  next.schemaVersion = 2
  next.studentPage ||= { layoutVersion: 1, columns: 12, blocks: [] }
  next.workflow ||= defaultWorkflow(skillType)
  next.runtime ||= next.generation || defaultSkillConfiguration(skillType).runtime
  next.generation = { ...next.runtime }
  next.inputFields = inputFieldsFromBlocks(next.studentPage.blocks)
  next.bindings = Object.fromEntries((next.studentPage.blocks || []).filter((block) => block.key && block.binding).map((block) => [block.key, block.binding]))
  return next
}

export function validateSkillDraft(configuration, skillType, requireTest = false) {
  const errors = []
  const blocks = configuration?.studentPage?.blocks || []
  const workflow = configuration?.workflow || {}
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []
  // 草稿允许先保存未完成的页面，发布或真实测试时再要求完整组件结构。
  if (requireTest) {
    if (!blocks.some((block) => inputBlockTypes.has(block.type))) errors.push('用户页面至少需要一个输入组件')
    if (!blocks.some((block) => block.type === 'submit')) errors.push('用户页面缺少生成按钮')
    if (!blocks.some((block) => block.type === 'result')) errors.push('用户页面缺少生成结果组件')
  }
  const keys = new Set()
  blocks.filter((block) => block.key).forEach((block) => {
    if (keys.has(block.key)) errors.push(`用户字段标识重复：${block.key}`)
    keys.add(block.key)
    if (block.binding && !block.binding.startsWith('runtime.') && !nodes.some((node) => node.id === block.binding)) errors.push(`${block.label}绑定的画布节点不存在`)
  })
  if (!nodes.some((node) => ['video', 'image'].includes(node.type))) errors.push('工作流缺少生成节点')
  // 结果节点是选填的：画布上只有一个生成节点时，系统自动取它当结果；
  // 有多个生成节点时才需要用它指定「哪个产物算最终结果」。
  // 以前这里强制要求存在，老师重搭节点后就会永远卡在「工作流缺少结果节点」且无法自愈。
  if (!edges.length) errors.push('工作流至少需要一条连线')
  const runtime = configuration?.runtime || {}
  if (!['agnes', 'volcengine'].includes(runtime.provider)) errors.push('请选择 Agnes 或火山引擎')
  if (skillType === 'video' && runtime.provider !== 'agnes') errors.push('视频玩法当前仅支持 Agnes')
  if (!runtime.promptTemplate?.trim()) errors.push('请填写提示词模板')
  if (requireTest && !runtime.testedAt) errors.push('发布前必须先完成一次真实测试')
  return errors
}

// 工作流与用户页面是两个独立配置步骤，第一步保存时不应要求页面组件已经完成。
export function validateWorkflowDraft(configuration, skillType) {
  const workflow = configuration?.workflow || {}
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []
  const errors = []
  if (!nodes.some((node) => ['video', 'image'].includes(node.type))) errors.push('工作流缺少生成节点')
  // 结果节点选填，理由同 validateSkillDraft：没有就由服务端取最后一个生成节点。
  if (!edges.length) errors.push('工作流至少需要一条连线')
  if (skillType === 'video' && !nodes.some((node) => node.type === 'video')) errors.push('视频玩法缺少视频生成节点')
  return errors
}
