import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { inlinePlayer } from './tools/player-plugin.js';

export default defineConfig({
  plugins: [svelte(), inlinePlayer()],
  server: { host: '127.0.0.1', port: 5173, watch: { ignored: ['**/tools/**', '**/dist/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 2600, assetsInlineLimit: 0 }
});
