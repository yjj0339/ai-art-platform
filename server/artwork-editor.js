import { randomBytes } from 'node:crypto'
import { createOwnDocument, getOwnDocument, updateOwnDocument } from './document-store.js'
import { createOwnAsset, getAccessibleAsset } from './asset-store.js'
import { adjustArtwork, decodeImageData, editError, encodeArtwork, MAX_EDIT_BYTES, mergeArtworkEdit, normalizeArtwork, prepareArtworkMask, prepareModelArtwork, readRemoteArtwork } from './artwork-image.js'
import { normalizeArtworkAdjustments } from '../src/utils/artworkAdjust.js'

export function normalizeImageEditSpec(value) {
  if (!value || value.protocol !== 'openai-mask') return { protocol: 'none', models: [], size: '1024x1024' }
  return {
    protocol: 'openai-mask',
    models: [...new Set((Array.isArray(value.models) ? value.models : []).filter((model) => typeof model === 'string').map((model) => model.trim()).filter(Boolean))],
    size: ['1024x1024', '1536x1024', '1024x1536'].includes(value.size) ? value.size : '1024x1024',
  }
}

function assertStudent(user) {
  if (!user) throw editError('请使用小画家账号登录后修改作品。', 401)
  if (user.role !== 'student') throw editError('只能由作者本人修改自己的作品。', 403)
}

function sourceUrl(version) {
  return String(version.imageUrl || version.preview || version.url || String(version.background || '').match(/url\(["']?([^"')]+)["']?\)/)?.[1] || '')
}

function projectVersions(document) { return document.data.versions || document.data.thumbnails || [] }

export function createArtworkEditor({ dataDir, getProviders, availableModels, requireModelEnabled, stores = {} }) {
  const documents = { get: getOwnDocument, create: createOwnDocument, update: updateOwnDocument, ...stores.documents }
  const assets = { get: getAccessibleAsset, create: createOwnAsset, ...stores.assets }
  const active = new Set(), attempts = new Map()
  function capabilities(user) {
    assertStudent(user)
    return Object.entries(getProviders()).flatMap(([key, provider]) => {
      const spec = normalizeImageEditSpec(provider.imageEdit)
      if (provider.enabled === false || !provider.apiKey || spec.protocol === 'none') return []
      return spec.models.filter((model) => availableModels(provider).includes(model))
        .map((model) => ({ provider: key, model, label: `${provider.label || key} · ${model}`, size: spec.size }))
    })
  }
  async function readSource(user, documentId, versionId, signal) {
    assertStudent(user)
    const document = await documents.get(user, documentId)
    if (document.type !== 'project') throw editError('请选择绘画项目中的作品。')
    const version = projectVersions(document).find((item) => item.id === versionId)
    if (!version) throw editError('未找到所选作品版本，请刷新后重试。', 404)
    const source = sourceUrl(version)
    let buffer
    const assetId = source.match(/^\/api\/assets\/([A-Za-z0-9_-]+)$/)?.[1]
    if (assetId) {
      const asset = await assets.get(user, assetId, dataDir)
      if (asset.owner_user_id !== user.id) throw editError('只能修改自己的图片资产。', 403)
      buffer = asset.data
    }
    else if (source.startsWith('data:image/')) buffer = decodeImageData(source)
    else if (source.startsWith('https://')) buffer = await readRemoteArtwork(source, signal)
    else throw editError('该版本没有可编辑的真实图片，请重新导入原图。')
    return { document, version, original: await normalizeArtwork(buffer) }
  }
  async function source(user, documentId, versionId) {
    const { original } = await readSource(user, documentId, versionId, AbortSignal.timeout(20000))
    return { data: await encodeArtwork(original.data, original.info.width, original.info.height), mime_type: 'image/png', original_name: '作品原图.png' }
  }
  async function edit(user, body) {
    assertStudent(user)
    const operation = String(body.operation || '')
    if (!['adjust', 'repaint', 'erase', 'background'].includes(operation)) throw editError('请选择有效的修改工具。')
    if (active.has(user.id)) throw editError('上一项修改正在处理中，请等待完成。', 429)
    const timeoutMs = Math.min(180000, Math.max(1000, Number(process.env.ARTWORK_EDIT_TIMEOUT_MS || 180000)))
    const signal = AbortSignal.timeout(timeoutMs)
    active.add(user.id)
    try {
      const { document, version, original } = await readSource(user, body.documentId, body.versionId, signal)
      let output, providerKey = '', model = '', adjustments, prompt = ''
      if (operation === 'adjust') {
        try { adjustments = normalizeArtworkAdjustments(body.adjustments) } catch (error) { throw editError(error.message) }
        if (!Object.values(adjustments).some(Boolean)) throw editError('请先调整画面的色彩或亮度。')
        output = await adjustArtwork(original, adjustments)
      } else {
        prompt = String(body.prompt || '').trim()
        if (operation !== 'erase' && (!prompt || prompt.length > 2000)) throw editError('请填写 1～2000 字的修改说明。')
        if (/(儿童色情|未成年.*裸|制造炸弹|恐怖袭击教程)/i.test(prompt)) throw editError('这项修改要求不适合创作，请换一种描述。')
        const provider = getProviders()[body.provider]
        const spec = normalizeImageEditSpec(provider?.imageEdit)
        model = String(body.model || '')
        if (!provider || !provider.apiKey || provider.enabled === false || spec.protocol !== 'openai-mask' || !spec.models.includes(model) || !availableModels(provider).includes(model)) throw editError('当前模型未配置真实选区编辑能力，请联系管理员配置支持遮罩的模型。', 409)
        requireModelEnabled(provider, model)
        providerKey = String(body.provider)
        const weights = await prepareArtworkMask(original, body.mask)
        const geometry = await prepareModelArtwork(original, weights, spec.size)
        const now = Date.now()
        for (const [key, times] of attempts) if (!times.some((time) => now - time < 60000)) attempts.delete(key)
        const times = (attempts.get(user.id) || []).filter((time) => now - time < 60000)
        const limit = Math.max(1, Number(process.env.ARTWORK_EDIT_RATE_PER_MINUTE || 3))
        if (times.length >= limit) throw editError('修改次数较频繁，请一分钟后再试。', 429)
        attempts.set(user.id, [...times, now])
        const instructions = operation === 'erase'
          ? '移除透明选区中的物体，依据周围场景自然补全背景，不添加新的主体。'
          : operation === 'background' ? `仅替换透明选区中的背景，保留未选中的主体及其细节。新背景：${prompt}` : `仅修改透明选区，保持原有画面风格。修改要求：${prompt}`
        const form = new FormData()
        form.set('model', model); form.set('prompt', instructions); form.set('n', '1'); form.set('size', spec.size)
        form.set('image', new Blob([geometry.image], { type: 'image/png' }), 'original.png')
        form.set('mask', new Blob([geometry.mask], { type: 'image/png' }), 'mask.png')
        const response = await fetch(`${String(provider.baseUrl).replace(/\/+$/, '')}/images/edits`, {
          method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}` }, body: form, signal,
        })
        // 对上游响应限制体积，避免异常响应耗尽服务内存。
        const chunks = []; let bytes = 0
        for await (const chunk of response.body) {
          bytes += chunk.length
          if (bytes > MAX_EDIT_BYTES * 1.5) throw editError('模型返回的图片过大，请降低输出尺寸。', 502)
          chunks.push(chunk)
        }
        let result
        try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw editError('模型返回格式不正确，请稍后重试。', 502) }
        if (!response.ok || result.error) {
          const code = String(result.error?.code || result.error?.type || '')
          if (/safety|content|moderation/i.test(code)) throw editError('模型未通过内容安全检查，请调整修改说明。', 422)
          if (response.status === 429) throw editError('模型限流或额度不足，请稍后重试或联系管理员。', 429)
          if (/quota|balance|billing/i.test(code)) throw editError('模型余额或额度不足，请联系管理员。', 402)
          throw editError('图片编辑服务暂时不可用，请稍后重试或联系管理员检查模型配置。', 502)
        }
        if (result.moderation?.flagged || result.data?.[0]?.moderation?.flagged) throw editError('生成结果未通过内容安全检查，请调整说明。', 422)
        const image = result.data?.[0]
        if (!image?.b64_json && !image?.url) throw editError('模型没有返回图片，请稍后重试。', 502)
        const generated = image.b64_json ? decodeImageData(`data:image/png;base64,${image.b64_json}`)
          : await readRemoteArtwork(image.url, signal)
        output = await mergeArtworkEdit(original, generated, weights, geometry)
      }
      const asset = await assets.create(user, { kind: 'artwork-edit', originalName: '作品修改.png', mimeType: 'image/png', base64: output.toString('base64') }, dataDir)
      const imageUrl = `/api/assets/${encodeURIComponent(asset.id)}`
      const titles = { adjust: '整体调整', repaint: '局部重绘', erase: '消除物体', background: '更换背景' }
      const createdAt = new Date().toISOString()
      const next = {
        ...version, id: `version-${randomBytes(16).toString('hex')}`, title: titles[operation], imageUrl,
        background: `url("${imageUrl}") center / cover no-repeat`, preview: imageUrl, assetId: asset.id, taskId: '', provider: providerKey || 'local-adjust', model,
        createdAt, batchId: `edit-${randomBytes(10).toString('hex')}`, batchPrompt: prompt || titles[operation],
        batchMeta: { ...version.batchMeta, model: model || '基础色彩调整', count: 1 },
        edit: { sourceVersionId: version.id, operation, prompt, adjustments, provider: providerKey, model, createdAt },
      }
      const pending = await documents.create(user, { type: 'artwork-edit', title: titles[operation], data: { documentId: document.id, version: next } })
      return { ok: true, pendingId: pending.id, version: next }
    } catch (error) {
      if (signal.aborted || error.name === 'TimeoutError' || error.name === 'AbortError') throw editError('修改超时，选区和说明已保留，可稍后重试。', 504)
      throw error
    } finally { active.delete(user.id) }
  }
  async function save(user, body) {
    assertStudent(user)
    const pending = await documents.get(user, body.pendingId)
    if (pending.type !== 'artwork-edit') throw editError('修改结果无效。')
    const document = await documents.get(user, pending.data.documentId)
    if (document.type !== 'project') throw editError('作品项目无效。')
    if (projectVersions(document).some((item) => item.id === pending.data.version.id)) return { ok: true, document, versionId: pending.data.version.id }
    if (document.version !== Number(body.expectedVersion)) throw editError('作品已在其他位置更新。请重新加载版本后再次保存，本次结果仍保留。', 409)
    const next = { ...pending.data.version, title: `V${projectVersions(document).length + 1} · ${pending.title}` }
    const versions = [...projectVersions(document), next]
    let saved
    try {
      saved = await documents.update(user, document.id, { title: document.title, version: document.version,
        data: { ...document.data, versions, thumbnails: versions, updatedAt: '刚刚' } })
    } catch (error) {
      if (error.statusCode === 404) throw editError('作品已更新，请重新加载后保存，本次结果仍保留。', 409)
      throw error
    }
    return { ok: true, document: saved, versionId: next.id }
  }
  return { capabilities, source, edit, save }
}
