import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const aiBaseUrl = env.VITE_AI_BASE_URL || 'https://api.openai.com'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api/ai': {
          target: aiBaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ai/, '/v1'),
        },
        '/api/feishu': {
          target: 'https://open.feishu.cn',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/feishu/, '/open-apis'),
        },
      },
    },
  }
})
