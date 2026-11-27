import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 240000,
  withCredentials: true,
})

// 网页演示版（GitHub Pages，打包时设 VITE_STATIC_DEMO=1）没有服务器：接口请求不再发出去等一个必然的 404，
// 直接给一句看得懂的提示。服务器部署和本地开发都不设这个变量，不受影响。
if (import.meta.env.VITE_STATIC_DEMO === '1') {
  apiClient.interceptors.request.use(() => Promise.reject(Object.assign(new Error('网页演示版没有连接服务器，这一项要在正式环境里使用'), { code: 'STATIC_DEMO' })))
}
