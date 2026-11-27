// 模型平台配置的纯函数：模型类型推断、Base URL 纠正、火山方舟域名识别。
// 不依赖服务器其它状态，可以单独测试。

const MODEL_KINDS = ['image', 'video', 'text']

// 后台新的「模型列表」只写统一的 models，用户端却按 图像 / 视频 / 文字 三类取模型。
// 没归类的模型按「平台声明的唯一能力」或「模型名」推断类型；后台模型列表里可以逐个改，改过的以后台为准。
// 规则和后台 src/views/AdminDashboard.vue 的 guessProviderModelKind 保持一致。
export function inferModelCapability(model, capabilities = []) {
  const declared = (Array.isArray(capabilities) ? capabilities : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => MODEL_KINDS.includes(item))
  if (declared.length === 1) return declared[0]
  const name = String(model || '')
  if (/t2v|i2v|v2v/i.test(name)) return 'video'
  if (/t2i|i2i/i.test(name)) return 'image'
  if (/video|seedance|kling|veo|sora|wan-?2|hailuo|vidu|runway|pika|pixverse/i.test(name)) return 'video'
  if (/image|seedream|seededit|dall-?e|flux|stable-?diffusion|sdxl|sd3|kolors|cogview|wanx|midjourney|ideogram|recraft|nano-?banana|jimeng|hidream/i.test(name)) return 'image'
  return 'text'
}

// 管理员常把完整接口地址（…/v3/images/generations）当成 Base URL 粘进来，
// 请求时再拼一次就成了 …/images/generations/images/generations，直接 404。这里去掉接口后缀和结尾的斜杠。
const ENDPOINT_SUFFIX = /\/(?:images\/generations|images\/edits|chat\/completions|embeddings|videos|contents\/generations\/tasks)\/?$/i

export function normalizeProviderBaseUrl(value) {
  let url = String(value || '').trim()
  for (let round = 0; round < 3 && ENDPOINT_SUFFIX.test(url); round += 1) url = url.replace(ENDPOINT_SUFFIX, '')
  return url.replace(/\/+$/, '')
}

// 火山方舟（*.volces.com）的出图接口支持官方 watermark 参数；自建平台只要接的是方舟，也受后台水印开关管。
export function isArkHostedBaseUrl(value) {
  try {
    return /(^|\.)volces\.com$/i.test(new URL(String(value || '').trim()).hostname)
  } catch {
    return false
  }
}
