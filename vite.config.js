import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5183,
    strictPort: false
  },
  preview: {
    port: 43173,
    strictPort: true
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    chunkSizeWarningLimit: 1200
  }
})
