// 单次真实模型验收，仅发送合成文字和坐标，不读取学生项目或上传学生图片。
// 复用现有模型配置；只在显式设置 H5_REAL_AI=1 时调用一次，不自动重试。
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { compileH5Layout, createH5HandbookDesign, validateH5Design } from '../src/utils/h5Layout.js'
assert.equal(process.env.H5_REAL_AI, '1', '真实AI验收需要显式设置H5_REAL_AI=1')
const temporaryRoot = resolve(tmpdir()), temporary = await mkdtemp(join(temporaryRoot, 'h5-real-layout-'))
const evidence = resolve('.workbuddy/evidence/h5-template-studio/real-ai')
await mkdir(evidence, { recursive: true })
let server, outcome
try {
  await writeFile(join(temporary, 'ai-providers.json'), await readFile('server/data/ai-providers.json'))
  const portServer = http.createServer(); await new Promise(done => portServer.listen(0, '127.0.0.1', done)); const port = portServer.address().port; await new Promise(done => portServer.close(done))
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, AI_DATA_DIR: temporary, AUTH_MODE: 'demo', PORT: String(port), GALLERY_WORKER_ENABLED: 'false' }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break } catch {} await new Promise(done => setTimeout(done, 100)) }
  const design = compileH5Layout(createH5HandbookDesign(), [{ type: 'cover', title: '创意生态空间', body: '我观察自然，把想法画成草图，再比较不同方案。这是一段不含个人信息的验收文案。' }], { title: '创意生态空间', finalArtworkUrl: '/assets/h5-report/product-design-story.png' })
  design.pages = [design.pages[0]]
  const started = Date.now()
  const response = await fetch(`http://127.0.0.1:${port}/api/admin/h5-report-layout/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(65000), body: JSON.stringify({ design, instruction: '保持现有结构，将标题水平位置从80调整到100，其余元素位置保持不变。' }) })
  const data = await response.json()
  outcome = { date: new Date().toISOString(), status: response.status, success: response.ok && validateH5Design(data.layout, { resolved: true }).length === 0, provider: data.provider || '', model: data.model || '', elapsedMs: Date.now() - started, calls: 1, note: response.ok ? '真实文本模型返回了通过结构、边界和文字校验的布局；使用合成文案，不包含学生数据。' : String(data.message || '模型调用失败').replace(/https?:\/\/\S+/g, '[供应商地址]') }
  if (response.ok) await writeFile(join(evidence, 'layout.json'), JSON.stringify(data.layout, null, 2))
} catch (error) { outcome = { date: new Date().toISOString(), success: false, calls: 1, note: error.name === 'TimeoutError' ? '真实模型请求超时，未重试。' : '真实模型请求未完成，需检查供应商和网络。' } }
finally {
  if (server?.exitCode === null) { const exit = once(server, 'exit'); server.kill(); await exit }
  const target = resolve(temporary), child = relative(temporaryRoot, target)
  if (child && !child.startsWith('..') && !child.includes(':') && child.startsWith('h5-real-layout-')) await rm(target, { recursive: true })
  await writeFile(join(evidence, 'result.json'), JSON.stringify(outcome, null, 2))
  console.log(JSON.stringify(outcome))
}
