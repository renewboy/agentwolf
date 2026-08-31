import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const apiOrigin = process.env['AGENTWOLF_API_ORIGIN'] ?? 'http://127.0.0.1:4310'
const webPort = Number(process.env['AGENTWOLF_WEB_PORT'] ?? '5173')

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'react/jsx-runtime': fileURLToPath(
        new URL('./node_modules/react/jsx-runtime.js', import.meta.url),
      ),
      'react/jsx-dev-runtime': fileURLToPath(
        new URL('./node_modules/react/jsx-dev-runtime.js', import.meta.url),
      ),
      react: fileURLToPath(new URL('./node_modules/react/index.js', import.meta.url)),
      'react-dom/client': fileURLToPath(
        new URL('./node_modules/react-dom/client.js', import.meta.url),
      ),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom/index.js', import.meta.url)),
    },
  },
  server: {
    port: webPort,
    proxy: {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        ws: true,
      },
      '/mcp': {
        target: apiOrigin,
        changeOrigin: true,
      },
    },
  },
})
