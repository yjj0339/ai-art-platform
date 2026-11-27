import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browserPort = 9224
const previewPort = 5184
const projectDir = process.cwd()
const outputDir = 'D:\\ruanjian\\Codex\\Codex-chanwu\\产品设计'
const profileDir = path.join(outputDir, '.canvas-browser-test')
const sourceImage = path.join(projectDir, 'public', 'login-tech-portrait.png')
const tabletMode = process.argv.includes('--tablet')
const videoMode = process.argv.includes('--video')
const nodeSelector = videoMode ? '.video-generation-node' : '.image-generation-node'
const panelSelector = videoMode ? '.video-composer-panel' : '.image-composer-panel'
const toolbarSelector = videoMode ? '.video-action-toolbar' : '.image-action-toolbar'
const viewport = tabletMode ? { width: 946, height: 714 } : { width: 1440, height: 1000 }
const screenshotPath = path.join(outputDir, `无限画布${videoMode ? '视频' : '图像'}节点验收-${tabletMode ? '平板' : '桌面'}-20260818.png`)

await mkdir(profileDir, { recursive: true })
await mkdir(outputDir, { recursive: true })

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let viteExit = null
let viteLog = ''
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(previewPort)], {
  cwd: projectDir,
  env: { ...process.env, VITE_AUTH_MODE: 'local' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
vite.stdout.on('data', (chunk) => { viteLog = `${viteLog}${chunk}`.slice(-4000) })
vite.stderr.on('data', (chunk) => { viteLog = `${viteLog}${chunk}`.slice(-4000) })
vite.on('exit', (code, signal) => { viteExit = { code, signal } })

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${previewPort}/student/canvas`)
    if (response.ok) break
  } catch {}
  if (attempt === 59) throw new Error('无限画布测试预览启动失败')
  await delay(250)
}

const browser = spawn(edgePath, [
  '--headless=new',
  `--remote-debugging-port=${browserPort}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  `--window-size=${viewport.width},${viewport.height}`,
  'about:blank',
], { stdio: 'ignore' })

async function waitForTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${browserPort}/json/list`).then((response) => response.json())
      const target = targets.find((item) => item.type === 'page')
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl
    } catch {}
    await delay(250)
  }
  throw new Error('无法连接浏览器调试端口')
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
    this.events = []
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) {
        if (['Runtime.exceptionThrown', 'Log.entryAdded', 'Network.loadingFailed'].includes(message.method)) {
          this.events.push(message)
        }
        return
      }
      if (!this.pending.has(message.id)) return
      const { resolve, reject, method } = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(`${method}: ${message.error.message}`))
      else resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method}: 等待浏览器响应超时`))
      }, 10000)
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket.close()
  }
}

const client = new CdpClient(await waitForTarget())

async function evaluate(expression, returnByValue = true) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '页面脚本执行失败')
  return result.result
}

async function clickElement(selector, index = 0) {
  const target = (await evaluate(`(() => {
    const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: element.textContent.trim() }
  })()`)).value
  if (!target) throw new Error(`没有找到可点击元素：${selector}[${index}]`)
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 })
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 })
  return target
}

async function clickCanvasBlank() {
  const target = (await evaluate(`(() => {
    const pane = document.querySelector('.vue-flow__pane')
    if (!pane) return null
    const rect = pane.getBoundingClientRect()
    for (let y = rect.top + 24; y < rect.bottom - 24; y += 48) {
      for (let x = rect.left + 24; x < rect.right - 24; x += 48) {
        const hit = document.elementFromPoint(x, y)
        if (hit === pane) return { x, y }
      }
    }
    return null
  })()`)).value
  if (!target) throw new Error('没有找到可点击的画布空白点')
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 })
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 })
}

try {
  console.error('阶段 1/6：连接浏览器')
  await client.open()
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('DOM.enable')
  await client.send('Log.enable')
  await client.send('Network.enable')
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('art-studio-user', JSON.stringify({ user: { id: 'stu-001', name: '画布验收学生', role: 'student', className: '验收班级', avatar: '验' }, token: 'mock-token-project-new-art-studio' }))`,
  })
  await client.send('Page.navigate', { url: `http://127.0.0.1:${previewPort}/student/canvas` })
  let pageReady = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    pageReady = Boolean((await evaluate(`Boolean(document.querySelector('.rail-action'))`)).value)
    if (pageReady) break
    await delay(250)
  }
  if (!pageReady) {
    const pageState = (await evaluate(`({ url: location.href, title: document.title, bodyText: document.body?.innerText?.slice(0, 500) || '' })`)).value
    throw new Error(`画布页面未完成加载：${JSON.stringify({ pageState, viteExit, viteLog, browserEvents: client.events.slice(-12) })}`)
  }

  console.error('阶段 2/6：创建图像生成节点')
  if (!(await evaluate(`Boolean(document.querySelector('.create-options'))`)).value) {
    await clickElement('.rail-action', 0)
    await delay(250)
  }
  const createMenuState = (await evaluate(`({
    railTexts: Array.from(document.querySelectorAll('.rail-action')).map((button) => button.textContent.trim()),
    optionTexts: Array.from(document.querySelectorAll('.create-options button')).map((button) => button.textContent.trim()),
    optionCount: document.querySelectorAll('.create-options button').length,
  })`)).value
  if (createMenuState.optionCount < 3) throw new Error(`创建菜单选项不足：${JSON.stringify(createMenuState)}`)
  await clickElement('.create-options button', videoMode ? 3 : 2)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await evaluate(`Boolean(document.querySelector(${JSON.stringify(nodeSelector)}))`)).value) break
    await delay(150)
  }

  const nodeBeforeUpload = (await evaluate(`(() => {
    const node = Array.from(document.querySelectorAll(${JSON.stringify(nodeSelector)})).at(-1)
    const panel = document.querySelector(${JSON.stringify(panelSelector)})
    const toolbar = document.querySelector(${JSON.stringify(toolbarSelector)})
    return {
      nodeCount: document.querySelectorAll('.image-generation-node').length,
      nodeVisible: Boolean(node),
      panelVisible: Boolean(panel),
      toolbarVisible: Boolean(toolbar),
      nodeRect: node ? { width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height } : null,
    }
  })()`)).value
  if (!nodeBeforeUpload.nodeVisible || !nodeBeforeUpload.panelVisible) {
    throw new Error(`图像节点未按预期创建或展开：${JSON.stringify({ createMenuState, nodeBeforeUpload })}`)
  }

  if (!videoMode) {
    console.error('阶段 3/6：替换节点图片')
    await evaluate(`Array.from(document.querySelectorAll('.image-action-toolbar button')).find((button) => button.textContent.includes('替换图片'))?.click()`)
    const documentNode = await client.send('DOM.getDocument', { depth: -1, pierce: true })
    const fileInputs = await client.send('DOM.querySelectorAll', { nodeId: documentNode.root.nodeId, selector: 'input[type="file"]' })
    if (fileInputs.nodeIds.length < 2) throw new Error('没有找到图像节点替换图片文件框')
    await client.send('DOM.setFileInputFiles', { nodeId: fileInputs.nodeIds[1], files: [sourceImage] })
    await delay(1800)
  } else console.error('阶段 3/6：检查空视频节点')

  console.error('阶段 4/6：读取选中状态尺寸')
  const selectedState = (await evaluate(`(() => {
    const node = Array.from(document.querySelectorAll(${JSON.stringify(nodeSelector)})).at(-1)
    const preview = document.querySelector(${JSON.stringify(videoMode ? '.video-generation-preview' : '.image-generation-preview')})
    const image = preview?.querySelector('img')
    const panel = document.querySelector(${JSON.stringify(panelSelector)})
    const toolbar = document.querySelector(${JSON.stringify(toolbarSelector)})
    const canvas = document.querySelector('.canvas-area')
    const rightPanel = document.querySelector('.right-panel')
    const rect = (element) => element ? ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }) : null
    const overlaps = (first, second) => Boolean(first && second && first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y)
    const canvasRect = rect(canvas)
    const rightPanelRect = rightPanel && getComputedStyle(rightPanel).width !== '0px' ? rect(rightPanel) : null
    const nodeRect = rect(node)
    const panelRect = rect(panel)
    const toolbarRect = rect(toolbar)
    const fullyInsideViewport = (target) => Boolean(target && target.x >= 0 && target.y >= 0 && target.x + target.width <= innerWidth && target.y + target.height <= innerHeight)
    const fullyInsideCanvas = (target) => Boolean(target && canvasRect && target.x >= canvasRect.x && target.x + target.width <= canvasRect.x + canvasRect.width)
    return {
      viewport: { width: innerWidth, height: innerHeight },
      imageLoaded: Boolean(image?.complete && image?.naturalWidth),
      naturalSize: image ? { width: image.naturalWidth, height: image.naturalHeight } : null,
      nodeRect,
      previewRect: rect(preview),
      panelRect,
      toolbarRect,
      canvasRect,
      rightPanelRect,
      nodeInsideCanvas: fullyInsideCanvas(nodeRect),
      panelInsideCanvas: fullyInsideCanvas(panelRect),
      toolbarInsideCanvas: fullyInsideCanvas(toolbarRect),
      panelInsideViewport: fullyInsideViewport(panelRect),
      toolbarInsideViewport: fullyInsideViewport(toolbarRect),
      overlapsRightPanel: [nodeRect, panelRect, toolbarRect].some((target) => overlaps(target, rightPanelRect)),
      imageObjectFit: image ? getComputedStyle(image).objectFit : '',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })()`)).value

  if (!videoMode && (!selectedState.imageLoaded || selectedState.imageObjectFit !== 'contain')) {
    throw new Error(`图像未按真实比例完整显示：${JSON.stringify(selectedState)}`)
  }
  if (!selectedState.nodeInsideCanvas || !selectedState.panelInsideCanvas || !selectedState.toolbarInsideCanvas || !selectedState.panelInsideViewport || !selectedState.toolbarInsideViewport || selectedState.overlapsRightPanel) {
    throw new Error(`图像节点或操作浮层超出可操作区域：${JSON.stringify(selectedState)}`)
  }
  if (selectedState.horizontalOverflow) {
    throw new Error(`页面出现水平溢出：${JSON.stringify(selectedState)}`)
  }

  console.error('阶段 5/6：保存验收截图')
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))

  await clickCanvasBlank()
  await delay(350)
  console.error('阶段 6/6：检查取消选中状态')
  const collapsedState = (await evaluate(`({
    panelVisible: Boolean(document.querySelector(${JSON.stringify(panelSelector)})),
    toolbarVisible: Boolean(document.querySelector(${JSON.stringify(toolbarSelector)})),
  })`)).value
  if (collapsedState.panelVisible || collapsedState.toolbarVisible) {
    throw new Error(`取消选中后节点浮层仍然显示：${JSON.stringify(collapsedState)}`)
  }

  console.log(JSON.stringify({ nodeBeforeUpload, selectedState, collapsedState, screenshotPath }, null, 2))
} finally {
  client.close()
  browser.kill()
  vite.kill()
}

process.exit(0)
