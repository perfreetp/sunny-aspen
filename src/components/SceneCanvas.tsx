import { createEffect, on, onCleanup, onMount } from 'solid-js';
import type { DesignModel } from '../lib/design';
import { BabylonViewer } from '../viewer/BabylonViewer';
import { selectGear, studioState } from '../state/store';

interface SceneCanvasProps {
  model: DesignModel;
  refreshNonce: number;
  batchFlash: boolean;
}

export function SceneCanvas(props: SceneCanvasProps) {
  let canvasRef: HTMLCanvasElement | undefined;
  let viewer: BabylonViewer | undefined;

  onMount(() => {
    if (!canvasRef) return;
    viewer = new BabylonViewer(canvasRef, selectGear);
    viewer.renderDesign(props.model, { fit: true });
  });

  createEffect(
    on(
      () => props.model,
      (model) => {
        viewer?.renderDesign(model);
      },
    ),
  );

  createEffect(
    on(
      () => studioState.selectedGearId,
      (gearId) => {
        viewer?.setSelectedGear(gearId);
      },
    ),
  );

  createEffect(
    on(
      () => props.refreshNonce,
      () => {
        viewer?.renderDesign(props.model, { fit: true });
      },
      { defer: true },
    ),
  );

  onCleanup(() => viewer?.dispose());

  const fit = () => viewer?.frameModel(props.model);
  const toggleRotate = (event: MouseEvent) => {
    const active = viewer?.toggleAutoRotate() ?? false;
    (event.currentTarget as HTMLButtonElement).classList.toggle('active', active);
  };

  return (
    <div class="scene-shell" classList={{ 'batch-flash': props.batchFlash }}>
      <canvas ref={canvasRef} class="scene-canvas" aria-label="齿轮、齿条和栅格的 Babylon.js 三维预览" />

      <div class="scene-topbar">
        <div class="scene-stats">
          <span><b>{props.model.gears.length}</b> 齿轮</span>
          <span><b>1</b> 齿条</span>
          <span><b>{props.model.grid.vertical.length * 2 + props.model.grid.horizontal.length * 2}</b> 栅条</span>
          <span class="scene-fingerprint">{props.model.fingerprint}</span>
        </div>
        <div class="scene-actions">
          <button type="button" class="scene-button" onClick={toggleRotate}>
            自动环游
          </button>
          <button type="button" class="scene-button" onClick={fit}>
            适应视角
          </button>
        </div>
      </div>

      <div class="scene-legend">
        <span><i class="dot dot-blue" />标准跟随件</span>
        <span><i class="dot dot-amber" />手调齿数件</span>
        <span><i class="dot dot-yellow" />栅格条</span>
        <span><i class="dot dot-orange" />栅格外框</span>
      </div>

      <div class="scene-hint">
        左键拖动旋转 · 滚轮缩放 · 右键平移 · 点击齿轮可选中并局部调齿
      </div>

      <div class="batch-overlay" classList={{ show: props.batchFlash }}>
        整排批量刷新中：齿轮 · 齿条 · 栅格同步重建
      </div>
    </div>
  );
}
