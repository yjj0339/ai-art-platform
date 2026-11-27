import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createHash, randomBytes } from 'node:crypto'
import pg from 'pg'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// 隔离真实配置和付费平台：只调用本机假上游，验证真实网关行为。
const root = process.cwd()
const dir = mkdtempSync(path.join(os.tmpdir(), 'model-switch-'))
const realFile = path.join(root, 'server/data/ai-providers.json')
const hash = () => createHash('sha256').update(readFileSync(realFile)).digest('hex')
const before = hash()
let upstreamCalls = 0
const stub = http.createServer((req, res) => {
  upstreamCalls++
  req.resume()
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url.includes('/images/')) res.end(JSON.stringify({ data: [{ url: 'data:image/png;base64,aGVsbG8=' }] }))
    else if (req.url.includes('/videos')) res.end(JSON.stringify({ id: 'test-video', status: 'queued' }))
    else res.end(JSON.stringify({ choices: [{ message: { content: '{"reply":"测试成功","prompt":"测试提示词","actions":[]}' } }] }))
  })
})
await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${stub.address().port}/v1`
writeFileSync(path.join(dir, 'ai-providers.json'), JSON.stringify({ defaultProvider: 'openai', defaultTextProvider: 'openai', hiddenProviders: ['agnes', 'deepseek', 'volcengine'], providers: { openai: { label: '开关测试平台', baseUrl, apiKey: 'isolated-test-key', imageModel: 'image-a', imageModels: ['image-a', 'image-b'], textModel: 'text-a', textModels: ['text-a', 'text-b'], videoModel: 'video-a', videoModels: ['video-a', 'video-b'], models: ['image-a', 'image-b', 'text-a', 'text-b', 'video-a', 'video-b'] }, hunyuan3d: { models: ['3.0', '3.1'], defaultModel: '3.0' } } }))
const port = Number(process.env.MODEL_SWITCH_TEST_PORT || 3242)
const env = { ...process.env, PORT: String(port), AUTH_MODE: 'demo', AI_DATA_DIR: dir, OPENAI_API_KEY: 'isolated-test-key', OPENAI_BASE_URL: baseUrl, OPENAI_IMAGE_MODEL: 'image-a', OPENAI_TEXT_MODEL: 'text-a', HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '' }
let server
let web
async function boot(mode = 'demo') {
  server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...env, AUTH_MODE: mode }, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  server.stderr.on('data', (chunk) => { logs += chunk })
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/ai/health`); if (r.ok || r.status === 401) return } catch {}
    if (server.exitCode !== null) throw new Error(logs || '测试服务启动失败')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('测试服务启动超时')
}
async function stopServer() { server.kill(); await once(server, 'exit') }
async function request(route, body, cookie = '') {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
  return { status: response.status, data: await response.json() }
}
const toggle = (model, enabled) => request('/api/admin/ai-providers/model-status', { provider: 'openai', model, enabled })
try {
  await boot()
  assert.equal((await request('/api/ai/health')).data.providers.openai.imageModels.length, 2)
  assert.equal((await toggle('image-a', false)).status, 200)
  let health = (await request('/api/ai/health')).data
  assert.deepEqual(health.providers.openai.imageModels, ['image-b'])
  assert.equal(health.providers.openai.imageModel, 'image-b')
  assert.deepEqual(health.providers.openai.textModels, ['text-a', 'text-b'])
  const calls = upstreamCalls
  assert.equal((await request('/api/ai/image/generate', { provider: 'openai', model: 'image-a', prompt: '测试' })).status, 403)
  assert.equal(upstreamCalls, calls)
  assert.equal((await request('/api/ai/image/generate', { provider: 'openai', model: 'image-b', prompt: '测试' })).status, 200)
  await request('/api/admin/ai-providers', { key: 'openai', label: '开关测试平台' })
  assert.deepEqual((await request('/api/admin/ai-providers')).data.providers.openai.disabledModels, ['image-a'])
  await stopServer(); await boot()
  assert.deepEqual((await request('/api/ai/health')).data.providers.openai.imageModels, ['image-b'])
  await toggle('image-b', false)
  assert.deepEqual((await request('/api/ai/health')).data.providers.openai.imageModels, [])
  assert.equal((await request('/api/ai/image/generate', { provider: 'openai', prompt: '测试' })).status, 403)
  await toggle('image-a', true)
  assert.deepEqual((await request('/api/ai/health')).data.providers.openai.imageModels, ['image-a'])
  assert.equal((await toggle('unknown', false)).status, 400)
  assert.equal((await toggle('image-a', 'false')).status, 400)
  await toggle('text-a', false)
  assert.deepEqual((await request('/api/ai/health')).data.providers.openai.textModels, ['text-b'])
  const beforeText = upstreamCalls
  assert.equal((await request('/api/ai/canvas/assistant', { provider: 'openai', model: 'text-a', message: '写一段文字', operation: 'generate-text' })).status, 403)
  assert.equal(upstreamCalls, beforeText)
  assert.equal((await request('/api/ai/canvas/assistant', { provider: 'openai', model: 'text-b', message: '写一段文字', operation: 'generate-text' })).status, 200)
  assert.equal((await request('/api/ai/prompt/optimize', { prompt: '一只小猫' })).status, 200)
  assert.equal(JSON.stringify((await request('/api/admin/ai-providers')).data).includes('isolated-test-key'), false)
  await request('/api/admin/ai-providers', { key: 'agnes', baseUrl, apiKey: 'isolated-test-key', videoModel: 'video-a', videoModels: ['video-a', 'video-b'], models: ['video-a', 'video-b'] })
  await request('/api/admin/ai-providers/model-status', { provider: 'agnes', model: 'video-a', enabled: false })
  const beforeVideo = upstreamCalls
  assert.equal((await request('/api/ai/video/generate', { provider: 'agnes', model: 'video-a', prompt: '测试' })).status, 403)
  assert.equal(upstreamCalls, beforeVideo)
  assert.equal((await request('/api/ai/video/generate', { provider: 'agnes', model: 'video-b', prompt: '测试' })).status, 202)
  await request('/api/admin/ai-providers/model-status', { provider: 'hunyuan3d', model: '3.0', enabled: false })
  assert.equal((await request('/api/ai/model3d/generate', { model: '3.0', edition: 'pro', prompt: '测试' })).status, 403)
  assert.equal((await request('/api/ai/model3d/config')).data.enabled, true)
  await request('/api/admin/ai-providers/model-status', { provider: 'hunyuan3d', model: '3.1', enabled: false })
  assert.equal((await request('/api/ai/model3d/config')).data.enabled, false)
  await toggle('video-a', false)
  assert.deepEqual((await request('/api/ai/health')).data.providers.openai.videoModels, ['video-b'])
  await stopServer(); await boot('server')
  assert.equal((await toggle('image-a', false)).status, 401)
  const localEnv = Object.fromEntries(readFileSync('server/.env', 'utf8').split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('=')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index).trim(), line.slice(index + 1).trim()] }))
  const connectionString = process.env.DATABASE_URL || localEnv.DATABASE_URL
  if (connectionString) {
    const client = new pg.Client({ connectionString })
    await client.connect()
    try {
      for (const role of ['admin', 'student', 'teacher', 'parent']) {
        const { rows } = await client.query('SELECT id FROM users WHERE role = $1 AND status = $2 LIMIT 1', [role, 'active'])
        if (!rows.length) { console.log(`未验证：数据库无可用${role}测试账号`); continue }
        const token = randomBytes(32).toString('base64url')
        const tokenHash = createHash('sha256').update(token).digest('hex')
        const sessionId = `ses_${randomBytes(18).toString('base64url')}`
        await client.query("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')", [sessionId, rows[0].id, tokenHash])
        try {
          const result = await request('/api/admin/ai-providers/model-status', { provider: 'openai', model: 'image-a', enabled: true }, `${process.env.SESSION_COOKIE_NAME || localEnv.SESSION_COOKIE_NAME || 'ai_art_session'}=${token}`)
          assert.equal(result.status, role === 'admin' ? 200 : 403)
          console.log(`PASS：${role}角色模型开关权限`)
        } finally { await client.query('DELETE FROM sessions WHERE id = $1', [sessionId]) }
      }
    } finally { await client.end() }
  } else console.log('未验证：未配置数据库，跳过正式登录角色权限验证')
  await stopServer(); await boot()
  assert.equal(hash(), before)
  console.log('PASS：独立开关、同平台隔离、隐藏、禁止调用、开启恢复、非法输入、编辑保留、重启持久化、未登录拦截、真实配置未变、文本/提示词/视频链路回归、3D关闭拦截。')
  if (process.argv.includes('--serve')) {
    web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5242', '--strictPort'], { cwd: root, env: { ...env, VITE_AUTH_MODE: 'demo', VITE_AI_MODE: 'api', VITE_API_PROXY_TARGET: `http://127.0.0.1:${port}` }, stdio: 'inherit' })
    console.log(`浏览器验证：隔离前端 http://127.0.0.1:5242，测试数据 ${dir}`)
    await new Promise((resolve) => { process.on('SIGINT', resolve); process.on('SIGTERM', resolve) })
  }
} finally {
  if (web) web.kill()
  if (server && server.exitCode === null) server.kill()
  stub.close()
  assert.equal(hash(), before)
}
