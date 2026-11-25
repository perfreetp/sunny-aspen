import { useEffect, useMemo, useRef } from 'react';
import { GreenhouseStage } from '../three/GreenhouseStage';
import { useAppStore } from '../store';
import { validateFabricClearance } from '../lib/trackGeometry';
import { isTrack } from '../lib/tree';

export function Viewport() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<GreenhouseStage | null>(null);
  const selectedId = useAppStore((s) => s.selectedId);
  const project = useAppStore((s) => s.project);
  const roofVisible = useAppStore((s) => s.roofVisible);
  const setRoofVisible = useAppStore((s) => s.setRoofVisible);

  useEffect(() => {
    if (!hostRef.current) return;
    const stage = new GreenhouseStage(hostRef.current, {
      onSelectTrack: (id) => useAppStore.getState().select(id),
      onEndpointChange: (id, endpoint, u) => useAppStore.getState().setEndpoint(id, endpoint, u),
    });
    stageRef.current = stage;
    if (import.meta.env.DEV) {
      (window as unknown as { __stage?: GreenhouseStage }).__stage = stage;
    }
    const unsubscribe = useAppStore.subscribe((state) => {
      stage.setState(state.project, state.currentTime, state.selectedId, state.roofVisible);
    });
    const state = useAppStore.getState();
    stage.setState(state.project, state.currentTime, state.selectedId, state.roofVisible);
    return () => {
      unsubscribe();
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  const selectedNode = selectedId ? project.nodes[selectedId] : undefined;
  const clearance = useMemo(() => {
    if (!isTrack(selectedNode)) {
      const all = Object.values(project.nodes).filter(isTrack);
      const mins = all.map((t) => validateFabricClearance(t.z, t.endpointA, t.endpointB).min);
      return { min: Math.min(...mins), ok: mins.every((m) => m >= 0.08) };
    }
    return validateFabricClearance(selectedNode.z, selectedNode.endpointA, selectedNode.endpointB);
  }, [project, selectedNode]);

  return (
    <section className="panel viewport-panel">
      <div className="viewport-host" ref={hostRef} />
      <div className="viewport-topbar">
        <div>
          <div className="viewport-title">棚体与遮阳帘叠合预览</div>
          <div className="viewport-subtitle">左键旋转 · 滚轮缩放 · 拖动绿/橙端点球单独调整收拢与展开位置</div>
        </div>
        <div className="viewport-actions">
          <button type="button" className="btn subtle" onClick={() => setRoofVisible(!roofVisible)}>
            {roofVisible ? '隐藏棚顶' : '显示棚顶'}
          </button>
          <button type="button" className="btn subtle" onClick={() => stageRef.current?.resetCamera()}>
            复位视角
          </button>
        </div>
      </div>
      <div className="viewport-legend">
        <span><i className="dot dot-a" />收拢端 A</span>
        <span><i className="dot dot-b" />展开端 B</span>
        <span><i className="dot dot-track" />遮阳帘轨道</span>
      </div>
      <div className={`clearance-badge ${clearance.ok ? 'ok' : 'bad'}`}>
        <strong>{clearance.ok ? '防穿出校验通过' : '净距不足'}</strong>
        <span>帘布/棚顶最小净距 {clearance.min.toFixed(2)} m</span>
      </div>
    </section>
  );
}
