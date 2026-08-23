import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiOrigin = process.env['AGENTWOLF_API_ORIGIN'] ?? 'http://127.0.0.1:4310'
const webPort = Number(process.env['AGENTWOLF_WEB_PORT'] ?? '5173')

export default defineConfig({
  plugins: [react()],
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
