import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readPort(flag, fallback) {
  const index = process.argv.indexOf(flag)
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : fallback
}

function readFlag(flag, fallback) {
  const index = process.argv.indexOf(flag)
  const value = index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
  return value || fallback
}

const serverPort = readPort('--server-port', Number(process.env.PORT || 3000))
const webPort = readPort('--web-port', Number(process.env.VITE_PREVIEW_PORT || 5173))
// 默认只监听本机；平板/手机要连就传 --host 0.0.0.0，脚本会把局域网地址自动加进来源白名单。
const host = readFlag('--host', '127.0.0.1')
const proxyTarget = `http://127.0.0.1:${serverPort}`

/**
 * 前端可能被三种地址打开：127.0.0.1、localhost、局域网 IP。
 * 服务端的写操作有来源校验，只配一个值就会让另外两种打开方式全部 403（连登录都过不去），
 * 所以这里把本机所有 IPv4 都拼进去，交给服务端按逗号分隔解析。
 */
function allowedOrigins() {
  const set = new Set([`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`])
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list || []) {
      if (item.family !== 'IPv4' || item.internal) continue
      set.add(`http://${item.address}:${webPort}`)
    }
  }
  return [...set].join(',')
}

const appOrigin = process.env.APP_ORIGIN || allowedOrigins()

const services = [
  spawn(process.execPath, ['server/index.js'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(serverPort), APP_ORIGIN: appOrigin },
  }),
  spawn(process.execPath, [
    'node_modules/vite/bin/vite.js',
    '--host', host,
    '--port', String(webPort),
    '--strictPort',
  ], { cwd: projectRoot, stdio: 'inherit', env: { ...process.env, VITE_API_PROXY_TARGET: proxyTarget } }),
]

if (host !== '127.0.0.1') {
  console.log(`\n局域网访问（平板/手机）：${allowedOrigins().split(',').filter((item) => !item.includes('127.0.0.1') && !item.includes('localhost')).join('  ')}\n`)
}

let stopping = false

function stopAll(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const service of services) {
    if (!service.killed) service.kill()
  }
  process.exitCode = exitCode
}

for (const service of services) {
  service.on('error', () => stopAll(1))
  service.on('exit', (code) => {
    // 前端或后端任一服务退出时，同时结束另一项服务，避免留下半启动状态。
    if (!stopping) stopAll(code || 1)
  })
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
