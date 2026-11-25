import { assetRegistry } from '../state/assets';
import { createLayer } from '../state/defaultProject';
import { store } from '../state/store';
import { uid } from '../lib/format';
import { drawCover, drawScaledContain, loadImageFile } from '../lib/importMedia';
import type { Layer, LayerKind } from '../types';

export function addEffectLayer(kind: Extract<LayerKind, 'spark' | 'smoke' | 'light'>): void {
  const count = store.project.layers.filter((layer) => layer.kind === kind).length + 1;
  const cascade = (count % 6) * 28 - 70;
  const presets = {
    spark: {
      name: `火星层 ${count}`,
      texture: 'fx-spark',
      width: 820,
      height: 540,
      duration: 2.8,
      opacity: 0.86,
      blendMode: 'lighter' as const,
    },
    smoke: {
      name: `烟雾层 ${count}`,
      texture: 'fx-smoke',
      width: 900,
      height: 600,
      duration: 5.5,
      opacity: 0.66,
      blendMode: 'normal' as const,
    },
    light: {
      name: `灯光闪烁层 ${count}`,
      texture: 'fx-light',
      width: 1180,
      height: 700,
      duration: 4.5,
      opacity: 0.72,
      blendMode: 'screen' as const,
    },
  } as const;

  const preset = presets[kind];
  const layer = createLayer({
    ...preset,
    kind,
    x: store.project.width / 2 + cascade,
    y: store.project.height * (kind === 'spark' ? 0.56 : kind === 'smoke' ? 0.62 : 0.42) + cascade * 0.4,
    start: Math.max(0, Math.round(store.currentTime * 10) / 10),
    effect: { seed: Math.floor(Math.random() * 1_000_000_000) },
  });
  store.insertLayer(layer);
  store.setTool('select');
  store.notify(`已添加${layer.name}，可在画布中拖动或变换`, 'success');
}

export function useDemoBackdrop(side: boolean): void {
  const before = store.capture();
  let background = store.project.layers.find((layer) => layer.kind === 'background');
  if (!background) {
    background = createLayer({
      name: side ? '侧面现场照片（示例）' : '正面现场照片（示例）',
      kind: 'background',
      texture: side ? 'bg-side' : 'bg-front',
      x: store.project.width / 2,
      y: store.project.height / 2,
      width: store.project.width,
      height: store.project.height,
      start: 0,
      duration: store.project.duration,
    });
    store.project.layers.unshift(background);
  } else {
    background.texture = side ? 'bg-side' : 'bg-front';
    background.name = side ? '侧面现场照片（示例）' : '正面现场照片（示例）';
    background.width = store.project.width;
    background.height = store.project.height;
    background.x = store.project.width / 2;
    background.y = store.project.height / 2;
    background.scaleX = 1;
    background.scaleY = 1;
    background.rotation = 0;
    background.assetId = undefined;
    background.assetName = undefined;
    background.strokes = [];
  }
  store.commitGesture(side ? '切换侧面底图' : '切换正面底图', before);
  store.select(background.id);
  store.requestFit();
  store.notify(side ? '已换成侧面底图；各层顺序和透明度保留，请重新对齐位置' : '已换成正面示例底图', 'success');
}

export async function importBaseImage(file: File): Promise<void> {
  try {
    store.notify(`正在读取 ${file.name}…`);
    const image = await loadImageFile(file);
    const canvas = drawCover(image, store.project.width, store.project.height);
    const assetId = uid('asset');
    assetRegistry.set(assetId, canvas);

    const before = store.capture();
    let background = store.project.layers.find((layer) => layer.kind === 'background');
    if (!background) {
      background = createLayer({
        name: file.name.replace(/\.[^.]+$/, ''),
        kind: 'background',
        texture: 'imported-image',
        assetId,
        assetName: file.name,
        x: store.project.width / 2,
        y: store.project.height / 2,
        width: store.project.width,
        height: store.project.height,
        start: 0,
        duration: store.project.duration,
      });
      background.assetId = assetId;
      background.assetName = file.name;
      store.project.layers.unshift(background);
    } else {
      background.texture = 'imported-image';
      background.assetId = assetId;
      background.assetName = file.name;
      background.name = file.name.replace(/\.[^.]+$/, '');
      background.width = store.project.width;
      background.height = store.project.height;
      background.x = store.project.width / 2;
      background.y = store.project.height / 2;
      background.scaleX = 1;
      background.scaleY = 1;
      background.rotation = 0;
      background.strokes = [];
    }
    store.commitGesture('导入现场底图', before);
    store.select(background.id);
    store.requestFit();
    store.notify('底图已铺入；各效果层顺序、时间点和透明度保留', 'success');
  } catch (error) {
    console.error(error);
    store.notify(error instanceof Error ? error.message : '导入底图失败', 'error');
  }
}

export async function importEffectImages(files: FileList | File[], kind: LayerKind = 'image'): Promise<void> {
  const list = [...files].filter((file) => file.type.startsWith('image/'));
  if (list.length === 0) {
    store.notify('请选择 PNG、JPG 或 WebP 图片', 'error');
    return;
  }

  try {
    const imported: Layer[] = [];
    for (const [index, file] of list.entries()) {
      const image = await loadImageFile(file);
      const canvas = drawScaledContain(image, 1280, 1280);
      const assetId = uid('asset');
      assetRegistry.set(assetId, canvas);
      const layerKind = kind === 'background' ? 'image' : kind;
      const layer = createLayer({
        name: file.name.replace(/\.[^.]+$/, ''),
        kind: layerKind,
        texture: 'imported-image',
        assetId,
        assetName: file.name,
        width: canvas.width,
        height: canvas.height,
        x: store.project.width / 2 + (index % 5) * 34 - 68,
        y: store.project.height / 2 + (index % 5) * 26 - 52,
        start: Math.max(0, Math.round(store.currentTime * 10) / 10),
        duration: 4,
        opacity: 0.9,
      });
      imported.push(layer);
    }

    const before = store.capture();
    // Insert through the same rank-aware path without creating one history entry per file.
    for (const layer of imported) {
      const rank = layer.kind === 'light' ? 3 : layer.kind === 'smoke' ? 2 : 1;
      let at = store.project.layers.length;
      for (let i = 0; i < store.project.layers.length; i += 1) {
        const currentRank = store.project.layers[i].kind === 'light' ? 3 : store.project.layers[i].kind === 'smoke' ? 2 : store.project.layers[i].kind === 'background' ? 0 : 1;
        if (currentRank > rank) {
          at = i;
          break;
        }
        if (currentRank === rank) at = i + 1;
      }
      store.project.layers.splice(at, 0, layer);
    }
    store.commitGesture(`导入 ${imported.length} 个素材`, before);
    store.select(imported.map((layer) => layer.id));
    store.notify(`已导入 ${imported.length} 个素材层，可拖动、框选或继续画笔触蒙版`, 'success');
  } catch (error) {
    console.error(error);
    store.notify(error instanceof Error ? error.message : '导入素材失败', 'error');
  }
}
