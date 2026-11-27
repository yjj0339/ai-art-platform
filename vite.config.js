import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  if (mode === 'production' && env.VITE_AUTH_MODE !== 'server') {
    throw new Error('生产构建必须设置 VITE_AUTH_MODE=server，禁止发布 Mock Token 模式。')
  }
  return {
  plugins: [vue()],
  // 两套开发服务（例如一套给人预览、一套跑自动化测试）同时运行时，各自用独立的依赖缓存目录，
  // 否则会互相改写 node_modules/.vite/deps，出现 EPERM 和页面空白。
  cacheDir: env.VITE_CACHE_DIR || 'node_modules/.vite',
  server: {
    proxy: {
      '/api': {
        target: env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${env.VITE_SERVER_PORT || 3000}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          element: ['element-plus', '@element-plus/icons-vue'],
          media: ['three', 'video.js'],
          canvasTools: ['fabric'],
          reportTools: ['pptxgenjs', 'jspdf', 'html2canvas'],
        },
      },
    },
  },
  }
})
