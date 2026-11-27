// 画布工作流的串行执行与结果收集（纯逻辑，出图函数从外面注入，方便离线验收）。
//
// 这里只回答一个问题：跑完这条画布，哪些图该进 H5 报告、按什么顺序排。
//   · 素材格（有卡槽号、带学生原图）→ 原样透传，不调模型、不重绘
//   · 结果节点（有上游连线，标了 resultOrder）→ 跑出来的图按 1~N 收好
//   · 其余出图节点 → 兜底累积
//
// ⚠️ 参考图必须按「自己那一路上游」取，不能拿「上一步的产物」：
// 8 个并排的结果节点如果接力，第 2 张会拿第 1 张当参考图，越跑越走形。

function imageUrlOf(item) {
  if (!item) return ''
  if (typeof item === 'string') return item.trim()
  return String(item.imageUrl || item.url || item.src || item.preview || '').trim()
}

function sortBuckets(buckets) {
  return [...buckets.keys()].sort((left, right) => left - right).flatMap((key) => buckets.get(key))
}

/**
 * @param {{ steps?: Array, request?: Object }} prepared 规划结果（buildH5WorkflowRequest 的产物）
 * @param {{ generate: (request: Object, step?: Object) => Promise<{ images?: Array, provider?: string }> }} deps
 * @returns {Promise<{ images: string[], resultImages: string[], materialImages: string[], stepResults: Array }>}
 */
export async function runImageSteps(prepared, { generate } = {}) {
  if (typeof generate !== 'function') throw new Error('runImageSteps 需要一个出图函数')
  const steps = Array.isArray(prepared?.steps) && prepared.steps.length
    ? prepared.steps
    : [{ request: prepared?.request || {} }]

  const stepResults = []
  // nodeId → 这个节点产出的图片 URL。供下游按连线取参考图。
  const outputs = new Map()
  let carried = []
  const slotBuckets = new Map()
  const resultBuckets = new Map()
  const loose = []
  // 有画布连线信息就按 DAG 走；老模板没这个字段，退回「上一步的产物」，保留原有行为。
  const hasDag = steps.some((step) => Array.isArray(step.upstreamNodeIds))

  for (const step of steps) {
    const nodeId = step.nodeId || ''
    const own = Array.isArray(step.request?.images) ? step.request.images.filter(Boolean) : []

    // 素材格原样透传：学生画的/上传的图直接进报告，不花一次出图钱，也不会被模型改掉画面。
    if (step.slotPassthrough && own.length) {
      const urls = [imageUrlOf(own[0])].filter(Boolean)
      outputs.set(nodeId, urls)
      slotBuckets.set(Number(step.slotOrder || 0), urls)
      stepResults.push({
        nodeId, nodeType: step.nodeType || 'image', title: step.title || '',
        provider: 'material', material: true, images: urls.map((url) => ({ imageUrl: url })),
      })
      continue
    }

    const upstream = hasDag
      ? [...new Set((step.upstreamNodeIds || []).flatMap((upstreamId) => outputs.get(upstreamId) || []))]
      : carried
    const request = own.length || !upstream.length
      ? { ...step.request, images: own }
      : { ...step.request, images: upstream, referenceImage: upstream[0], capability: 'image-to-image' }

    // 第二个参数带上当前 step：真实出图只读第一个参数，验收脚本靠它区分是哪个节点跑出来的。
    const result = await generate(request, step)
    const images = result?.images || []
    const urls = images.map(imageUrlOf).filter(Boolean)
    carried = urls
    outputs.set(nodeId, urls)
    stepResults.push({
      nodeId, nodeType: step.nodeType || 'image', title: step.title || '',
      provider: result?.provider || '', images,
    })

    const slotOrder = Number(step.slotOrder || 0)
    const resultOrder = Number(step.resultOrder || 0)
    if (slotOrder > 0) slotBuckets.set(slotOrder, urls)
    else if (resultOrder > 0) resultBuckets.set(resultOrder, urls)
    else loose.push(...urls)
  }

  const materialImages = sortBuckets(slotBuckets)
  const resultImages = sortBuckets(resultBuckets)
  // 报告里优先用「结果图」：这才是这条工作流跑出来的东西。
  // 没有结果节点（老模板只标了素材格）时才回落到素材原图，再退回普通出图节点的产出。
  const images = resultImages.length
    ? resultImages
    : (materialImages.length ? materialImages : [...new Set(loose)])

  return { images, resultImages, materialImages, stepResults }
}
