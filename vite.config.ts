import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const aiBaseUrl = (env.VITE_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const wintalentProxyUrl = (env.VITE_WINTALENT_PROXY_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '')
  const metricsProxyUrl = (env.VITE_METRICS_PROXY_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '')

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
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
          rewrite: (requestPath) => requestPath.replace(/^\/api\/ai/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Log large requests for debugging
              if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 1000000) {
                console.log(`[Proxy] Large request: ${Math.round(parseInt(req.headers['content-length']) / 1024)}KB`);
              }
            });
          },
        },
        '/api/feishu': {
          target: 'https://open.feishu.cn',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/feishu/, '/open-apis'),
        },
        '/api/wintalent': {
          target: wintalentProxyUrl,
          changeOrigin: true,
        },
        '/api/metrics': {
          target: metricsProxyUrl,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const host = req.headers.host
              if (host) {
                proxyReq.setHeader('x-forwarded-host', host)
              }

              const referer = req.headers.referer
              const protocol = typeof referer === 'string' && referer.startsWith('https://') ? 'https' : 'http'
              proxyReq.setHeader('x-forwarded-proto', protocol)
            })
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
    },
  }
})
