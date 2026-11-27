// 端到端验证：文字节点生成是否真的"看到"上游图片，且不把自述当正文写回。
// 用 demo 模式起一个独立后端（3301），避免影响正在跑的 3000 服务。
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import http from 'node:http'

const PORT = 3301
const ROOT = process.cwd()
const imageBase64 = readFileSync('.canvas-empty-start-verify/probe-small.png').toString('base64')
const dataUrl = `data:image/png;base64,${imageBase64}`

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request({
      host: '127.0.0.1', port: PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let raw = ''
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(raw) }) }
        catch { resolve({ status: res.statusCode, json: { raw } }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), AUTH_MODE: 'demo', HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '', ALL_PROXY: '', all_proxy: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
child.stdout.on('data', (chunk) => { serverLog += chunk })
child.stderr.on('data', (chunk) => { serverLog += chunk })

async function waitReady() {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/ai/health', method: 'GET' }, (r) => { r.resume(); resolve(r.statusCode) })
        req.on('error', reject); req.end()
      })
      if (res) return true
    } catch {}
  }
  return false
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${String(detail).slice(0, 400)}` : ''}`)
}

try {
  const ready = await waitReady()
  check('demo 后端在 3301 启动', ready)
  if (!ready) throw new Error(`后端未启动：${serverLog.slice(0, 500)}`)

  // 案例 1：有上游图片，要求整理商品信息
  const r1 = await post('/api/ai/canvas/assistant', {
    operation: 'generate-text',
    message: '整理这张图的商品信息：品类、外观、卖点，分三段。',
    selectedNode: { id: 'node-text-1', type: 'text', mode: 'text-generation', title: '商品信息整理' },
    upstream: [{
      id: 'node-upload-1', type: 'upload', mode: 'upload', title: '鞋子参考图',
      image: dataUrl, assetId: '', text: '', prompt: '',
    }],
  })
  const body1 = r1.json || {}
  const proposal1 = (body1.proposals || []).find((item) => item.type === 'set_node_text')
  const text1 = String(proposal1?.payload?.text || '').trim()
  check('案例1 接口返回 200', r1.status === 200, JSON.stringify(body1).slice(0, 300))
  check('案例1 返回 set_node_text 提案', Boolean(text1), text1.slice(0, 300))
  check('案例1 正文提及鞋/运动鞋（说明真的看到图）', /鞋/.test(text1), text1.slice(0, 200))
  check('案例1 正文不含自述（我打算/请确认/我将为你）', !/(我打算|请确认|我将为你|我会先|接下来我|请告诉我)/.test(text1), text1.slice(0, 200))
  check('案例1 记录了 vision.images>0', Number(body1.vision?.images || 0) > 0, JSON.stringify(body1.vision || {}))

  // 案例 2：只有上游文字，无图片（回归：不应因缺图报错）
  const r2 = await post('/api/ai/canvas/assistant', {
    operation: 'generate-text',
    message: '把下面素材改写成 3 条卖点短句。',
    selectedNode: { id: 'node-text-2', type: 'text', mode: 'text-generation', title: '卖点提炼' },
    upstream: [{ id: 'node-text-up', type: 'text', mode: 'text-generation', title: '原始描述', text: '白色网面运动鞋，厚底轻便，后跟带提拉环。' }],
  })
  const body2 = r2.json || {}
  const text2 = String((body2.proposals || []).find((item) => item.type === 'set_node_text')?.payload?.text || '').trim()
  check('案例2 纯文字上游可用', r2.status === 200 && Boolean(text2), text2.slice(0, 200))
  check('案例2 正文不含自述', !/(我打算|请确认|我将为你|我会先)/.test(text2), text2.slice(0, 200))

  // 案例 3：上游图打不开（坏地址）→ 必须给出可见告警，不能静默当成没图
  const r3 = await post('/api/ai/canvas/assistant', {
    operation: 'generate-text',
    message: '描述这张商品图。',
    selectedNode: { id: 'node-text-3', type: 'text', mode: 'text-generation', title: '坏图测试' },
    upstream: [{ id: 'node-upload-bad', type: 'upload', title: '坏图', image: '/api/assets/not-exist-id' }],
  })
  const body3 = r3.json || {}
  const warnings3 = Array.isArray(body3.warnings) ? body3.warnings : []
  const text3 = String((body3.proposals || []).find((item) => item.type === 'set_node_text')?.payload?.text || '')
  check('案例3 坏图给出可见告警（或失败原因含读不到）',
    warnings3.some((item) => /无法读取|看不到|未能读取/.test(item)) || /无法读取|未能读取/.test(String(body3.message || '')),
    JSON.stringify(warnings3).slice(0, 300) || String(body3.message || '').slice(0, 200))
  check('案例3 不把"我看不到图"的说明写进节点（无 set_node_text 正文）',
    !text3, text3.slice(0, 200))

  // 案例 4：operation=assist 仍走原工作流 Agent（回归）
  const r4 = await post('/api/ai/canvas/assistant', {
    operation: 'assist',
    message: '你好',
    selectedNode: null,
    upstream: [],
    canvas: { nodes: [], edges: [] },
  })
  check('案例4 assist 分支未被破坏', r4.status === 200 && Boolean(r4.json?.reply), String(r4.json?.reply || '').slice(0, 120))
} catch (error) {
  console.log('EXCEPTION:', error.message)
  results.push({ name: '执行异常', ok: false, detail: error.message })
} finally {
  child.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 800))
  const passed = results.filter((item) => item.ok).length
  console.log(`\n=== ${passed}/${results.length} 通过 ===`)
  process.exit(passed === results.length ? 0 : 1)
}
