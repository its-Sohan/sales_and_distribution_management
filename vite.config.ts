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
  // The production CSP allows font-src 'self' only. Keep every font as a
  // same-origin file instead of letting Vite inline the small subset woff2
  // files as data: URLs, which the browser blocks.
  build: { assetsInlineLimit: 0 },
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
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
        configure(proxy) {
          const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:8787'
          // The worker checks Origin against its request URL. Align it with the target origin.
          proxy.on('proxyReq', proxyReq => proxyReq.setHeader('Origin', new URL(apiTarget).origin))
        },
      },
    },
  },
})
