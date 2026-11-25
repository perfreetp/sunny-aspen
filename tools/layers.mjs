/* 分层调试：把单个图元单独渲染，定位视觉问题。 */
import { sampleScene } from '../src/lib/scene.js';
import { projectFromTemplate, totalFrames } from '../src/lib/doc.js';
import fs from 'node:fs';
import { sceneToSvg } from '../src/lib/svg.js';

const out = new URL('./out/dbg/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const doc = projectFromTemplate(process.argv[2] || 'plinian');
const f = +(process.argv[3] || 256);
const s = sampleScene(doc, f, { ghost: false, labels: false });

const groups = {
  cone: (p) => p.t === 'poly' && p.pts.length === 124 && p.fill && p.fill.type === 'linear',
  tephra: (p) => p.t === 'poly' && (p.pts.length === 29 || (p.pts.length === 124 && typeof p.fill === 'string')),
  plume: (p) => p.t === 'poly' && p.pts.length === 54,
  puffs: (p) => p.t === 'radial'
};

for (const [name, fn] of Object.entries(groups)) {
  const prims = s.prims.filter(fn);
  fs.writeFileSync(new URL(`${name}.svg`, out), sceneToSvg({ prims }));
  console.log(name, prims.length);
}
