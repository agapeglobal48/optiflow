import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Proxy so the frontend can call same-origin `/api/...` in dev without
    // CORS headaches - the API's own CORS_ORIGIN config is still there as
    // a second line of defense for non-dev environments.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/webhooks': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
