/* Vite 插件：把独立播放器（PixiJS + 采样引擎 + 渲染器）现场打成单文件字符串，
 * 通过虚拟模块 virtual:player-runtime 提供给导出功能。开发与构建行为一致。 */
import { build } from 'esbuild';

export function inlinePlayer() {
  const VIRT = 'virtual:player-runtime';
  const RESOLVED = '\0' + VIRT;
  let cache = null;

  return {
    name: 'inline-player',
    resolveId(id) {
      if (id === VIRT) return RESOLVED;
    },
    async load(id) {
      if (id !== RESOLVED) return;
      if (!cache) {
        const res = await build({
          entryPoints: ['src/player/main.js'],
          bundle: true,
          format: 'iife',
          minify: true,
          target: 'es2022',
          write: false,
          legalComments: 'none',
          logLevel: 'silent'
        });
        cache = res.outputFiles[0].text;
      }
      return `export default ${JSON.stringify(cache)};`;
    },
    watchChange() { cache = null; },
    handleHotUpdate(ctx) {
      if (/src\/(player|lib)\//.test(ctx.file)) cache = null;
    }
  };
}
