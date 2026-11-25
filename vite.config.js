import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5217, strictPort: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
