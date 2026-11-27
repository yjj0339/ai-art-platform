/**
 * 只看一件事：登录后 /api/ai/health 里哪些供应商被算成「已配置」。
 * 用来确认 .env 里的中文占位 Key 没有再把前端下拉框带偏。
 */
const base = process.env.PROBE_BASE || 'http://127.0.0.1:3000'

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'ceshi2', organizationCode: 'demo-school', password: '123456789' }),
})
const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
console.log('[登录]', login.status, cookie ? 'ok' : '无 cookie')

const res = await fetch(`${base}/api/ai/health`, { headers: { Cookie: cookie } })
const json = await res.json()
const providers = json?.data?.providers || json?.providers || {}
console.log('[状态]', res.status, '活跃供应商=', json?.data?.activeProvider || json?.activeProvider)
for (const [key, item] of Object.entries(providers)) {
  console.log(
    key.padEnd(12),
    'configured=' + String(item.configured).padEnd(5),
    '图=' + ((item.imageModels || []).join(',') || '-'),
  )
}
