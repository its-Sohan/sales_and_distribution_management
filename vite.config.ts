import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Mirror the production static headers in preview so browser checks exercise CSP.
const assetHeaders = Object.fromEntries(readFileSync(new URL('./public/_headers', import.meta.url), 'utf8')
  .split('/*\n')[1].trim().split('\n').map(line => {
    const colon = line.indexOf(':')
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
  }))

export default defineConfig({
  plugins: [react()],
  preview: { headers: assetHeaders },
  server: {
    headers: {
      ...assetHeaders,
      // Vite injects inline refresh code and connects to its local HMR socket.
      'Content-Security-Policy': assetHeaders['Content-Security-Policy']
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:* ws://[::1]:*"),
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        configure(proxy) {
          // The worker checks Origin against its request URL. Browsers send
          // the Vite page origin, so align it with the local proxy target.
          proxy.on('proxyReq', proxyReq => proxyReq.setHeader('Origin', 'http://127.0.0.1:8787'))
        },
      },
    },
  },
})
