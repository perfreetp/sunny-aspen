import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '../store';
import { CurveEditor } from './CurveEditor';
import { formatTime, trackTotalDuration } from '../lib/timing';
import { getDescendantTracks, getTimelineInterval, isGroup, isTrack } from '../lib/tree';
import { validateFabricClearance } from '../lib/trackGeometry';
import type { ID, TrackNode } from '../types';

function Section({ title, hint, children, right }: { title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <header className="section-head">
        <div>
          <h3>{title}</h3>
          {hint ? <p>{hint}</p> : null}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function NumberField({
  label, value, onChange, min, max, step = 1, unit, help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  help?: string;
}) {
  const format = (v: number) => String(Math.round(v * 1000) / 1000);
  const [draft, setDraft] = useState(format(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(format(value));
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-unit">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={() => { focused.current = true; }}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(v)) onChange(v);
          }}
          onBlur={() => {
            focused.current = false;
            const v = Number(draft);
            if (draft.trim() === '' || !Number.isFinite(v)) setDraft(format(value));
            else setDraft(format(value));
          }}
        />
        {unit ? <em>{unit}</em> : null}
      </div>
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TrackInspector({ track }: { track: TrackNode }) {
  const {
    renameNode, updateTrack, updateDevice, setEndpoint, changeOpenDuration,
    addPause, updatePause, removePause, applyRhythmPreset, toggleVisible,
  } = useAppStore();
  const parentGroup = useAppStore((s) => {
    const parent = Object.values(s.project.nodes).find((n) => isGroup(n) && n.children.includes(track.id));
    return parent;
  });
  const clearance = validateFabricClearance(track.z, track.endpointA, track.endpointB);
  const endpointDistance = Math.round((track.endpointB - track.endpointA) * 100);

  return (
    <div className="inspector-scroll">
      <Section title="轨道" hint="从方案轨道层导入，可在三维视图直接拖端点">
        <div className="track-title-row">
          <input className="name-input" value={track.name} onChange={(e) => renameNode(track.id, e.target.value)} />
          <button type="button" className="btn tiny" onClick={() => toggleVisible(track.id)}>
            {track.visible ? '隐藏' : '显示'}
          </button>
        </div>
        <div className="meta-line"><span>{track.code}</span><span>Z = {track.z.toFixed(1)} m</span></div>
        {parentGroup ? <div className="parent-line">所属编排组：<b>{parentGroup.name}</b> · 改时长会等比重排该组关键帧</div> : <div className="parent-line warn">未编组：时长变化只重排本轨道</div>}
      </Section>

      <Section title="收拢 / 展开端点" hint="两个端点独立调整，端点间距同步为实际行程">
        <label className="field range-field">
          <span><i className="dot dot-a" />收拢端 A：{(track.endpointA * 100).toFixed(0)}%</span>
          <input type="range" min={1} max={98} step={0.5} value={track.endpointA * 100}
            onChange={(e) => setEndpoint(track.id, 'A', Number(e.target.value) / 100)} />
        </label>
        <label className="field range-field">
          <span><i className="dot dot-b" />展开端 B：{(track.endpointB * 100).toFixed(0)}%</span>
          <input type="range" min={2} max={99} step={0.5} value={track.endpointB * 100}
            onChange={(e) => setEndpoint(track.id, 'B', Number(e.target.value) / 100)} />
        </label>
        <div className="kv-grid">
          <div><span>端点弧长区间</span><b>{endpointDistance}%</b></div>
          <div><span>设备行程</span><b>{(track.device.strokeMm / 1000).toFixed(2)} m</b></div>
          <div><span>最小棚顶净距</span><b className={clearance.ok ? 'ok-text' : 'warn-text'}>{clearance.min.toFixed(2)} m</b></div>
        </div>
      </Section>

      <Section title="设备参数" hint="读取自设备清单；改行程会同步帘布长度与展开时间">
        <div className="form-grid two">
          <TextField label="电机型号" value={track.device.motorModel} onChange={(v) => updateDevice(track.id, { motorModel: v })} />
          <TextField label="驱动型号" value={track.device.model} onChange={(v) => updateDevice(track.id, { model: v })} />
          <NumberField label="行程" unit="mm" step={50} min={1000} value={track.device.strokeMm} onChange={(v) => updateDevice(track.id, { strokeMm: v })} />
          <NumberField label="额定线速度" unit="m/s" step={0.01} min={0.05} value={track.device.speedMps} onChange={(v) => updateDevice(track.id, { speedMps: v })} help={`${(track.device.speedMps * 60).toFixed(1)} m/min`} />
          <NumberField label="电压" unit="V" step={10} value={track.device.voltageV} onChange={(v) => updateDevice(track.id, { voltageV: v })} />
          <NumberField label="功率" unit="kW" step={0.05} min={0.1} value={track.device.powerKw} onChange={(v) => updateDevice(track.id, { powerKw: v })} />
        </div>
      </Section>

      <Section title="电机行程与启停节奏" hint="缓启缓停秒数会用于机械时长估算和曲线预设">
        <div className="preset-row">
          <button type="button" className="btn tiny" onClick={() => applyRhythmPreset(track.id, 'soft')}>缓启缓停</button>
          <button type="button" className="btn tiny" onClick={() => applyRhythmPreset(track.id, 'standard')}>标准节奏</button>
          <button type="button" className="btn tiny" onClick={() => applyRhythmPreset(track.id, 'fast')}>快速启停</button>
        </div>
        <div className="form-grid two">
          <NumberField label="起步缓升" unit="s" step={0.1} min={0} value={track.device.rampUpS} onChange={(v) => updateDevice(track.id, { rampUpS: v })} />
          <NumberField label="到位缓停" unit="s" step={0.1} min={0} value={track.device.rampDownS} onChange={(v) => updateDevice(track.id, { rampDownS: v })} />
          <NumberField label="启动延时" unit="s" step={0.1} min={0} value={track.device.startDelayS} onChange={(v) => updateDevice(track.id, { startDelayS: v })} />
          <NumberField label="启停频次上限" unit="次/h" step={1} min={1} value={track.device.maxStartsPerHour} onChange={(v) => updateDevice(track.id, { maxStartsPerHour: v })} />
        </div>
      </Section>

      <Section title="编排时长与中途停顿" hint={`整条开合片段 ${formatTime(trackTotalDuration(track))}`}>
        <NumberField
          label="展开运动时长（改组会等比重排关键帧）"
          unit="s" step={0.5} min={2} max={120}
          value={track.openDuration}
          onChange={(v) => changeOpenDuration(track.id, v)}
        />
        <div className="form-grid two">
          <NumberField label="全开保持" unit="s" step={0.5} min={0} value={track.holdDuration} onChange={(v) => updateTrack(track.id, { holdDuration: v })} />
          <NumberField label="收拢时长" unit="s" step={0.5} min={0.5} value={track.closeDuration} onChange={(v) => updateTrack(track.id, { closeDuration: v })} />
        </div>
        <div className="pause-list">
          {track.pauses.map((pause, index) => (
            <div className="pause-card" key={pause.id}>
              <div className="pause-card-head">
                <b>停顿 {index + 1}</b>
                <button type="button" className="link-danger" onClick={() => removePause(track.id, pause.id)}>删除</button>
              </div>
              <label className="field range-field">
                <span>展开到 {(pause.at * 100).toFixed(0)}% 时停住</span>
                <input type="range" min={5} max={95} step={1} value={pause.at * 100}
                  onChange={(e) => updatePause(track.id, pause.id, { at: Number(e.target.value) / 100 })} />
              </label>
              <NumberField label="停顿时长" unit="s" step={0.5} min={0.5} value={pause.duration}
                onChange={(v) => updatePause(track.id, pause.id, { duration: v })} />
            </div>
          ))}
        </div>
        <button type="button" className="btn secondary block" onClick={() => addPause(track.id)}>＋ 添加中途停顿</button>
      </Section>

      <CurveEditor track={track} />
    </div>
  );
}

function GroupInspector({ groupId }: { groupId: ID }) {
  const project = useAppStore((s) => s.project);
  const group = project.nodes[groupId];
  const checkedIds = useAppStore((s) => s.checkedIds);
  const { renameNode, playGroup, createSubgroup, ungroup, addToGroup, removeFromParent, select } = useAppStore();
  if (!isGroup(group)) return null;
  const interval = getTimelineInterval(project, groupId);
  const tracks = getDescendantTracks(project, groupId);
  const addOptions = Object.values(project.nodes).filter((n) => n.id !== groupId && !group.children.includes(n.id));

  return (
    <div className="inspector-scroll">
      <Section title="编组" hint="组内可继续嵌套组；拖动整组时间条即可联合预览">
        <input className="name-input" value={group.name} onChange={(e) => renameNode(groupId, e.target.value)} />
        <div className="kv-grid">
          <div><span>片段区间</span><b>{interval.start.toFixed(1)}–{interval.end.toFixed(1)}s</b></div>
          <div><span>嵌套轨道</span><b>{tracks.length} 条</b></div>
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => playGroup(groupId)}>▶ 预览整组</button>
          <button type="button" className="btn secondary" onClick={() => createSubgroup(groupId, checkedIds.filter((id) => isTrack(project.nodes[id])))}>
            新建嵌套子组{checkedIds.length ? `（${checkedIds.length}）` : ''}
          </button>
        </div>
        <button type="button" className="btn ghost block danger" onClick={() => ungroup(groupId)}>取消编组（保留轨道）</button>
      </Section>

      <Section title="组内节点" hint="可把其他轨道或子组加入当前组">
        <div className="child-list">
          {group.children.map((id) => {
            const node = project.nodes[id];
            if (!node) return null;
            return (
              <div className="child-row" key={id}>
                <button type="button" className="child-name" onClick={() => select(id)}>
                  {isGroup(node) ? '▣' : '━'} {node.name}
                </button>
                <button type="button" className="link-muted" onClick={() => removeFromParent(id)}>移出</button>
              </div>
            );
          })}
        </div>
        <label className="field">
          <span>加入已有节点</span>
          <select value="" onChange={(e) => { if (e.target.value) addToGroup(groupId, e.target.value); }}>
            <option value="" disabled>选择轨道或子组…</option>
            {addOptions.map((n) => <option key={n.id} value={n.id}>{isGroup(n) ? '组：' : '轨：'}{n.name}</option>)}
          </select>
        </label>
      </Section>

      <Section title="比例重排规则" hint="回放与拖动预览共用同一个时间采样函数">
        <ol className="explain-list">
          <li>修改组内任意轨道的「展开运动时长」。</li>
          <li>系统以组起点为原点计算缩放比。</li>
          <li>组内所有轨道的起点、时长、停顿段和关键帧等比重排。</li>
          <li>时间条、关键帧菱形和三维帘布位置均由同一采样结果驱动。</li>
        </ol>
      </Section>
    </div>
  );
}

function ProjectInspector() {
  const project = useAppStore((s) => s.project);
  const { resetProject, setExportOpen } = useAppStore();
  const tracks = Object.values(project.nodes).filter(isTrack);
  const groups = Object.values(project.nodes).filter(isGroup);
  const pauses = tracks.reduce((sum, t) => sum + t.pauses.length, 0);
  return (
    <div className="inspector-scroll">
      <Section title="编排总览" hint={project.meta.planCode}>
        <div className="stat-grid">
          <div><b>{tracks.length}</b><span>导入轨道</span></div>
          <div><b>{groups.length}</b><span>编组/子组</span></div>
          <div><b>{pauses}</b><span>中途停顿</span></div>
        </div>
        <button type="button" className="btn primary block" onClick={() => setExportOpen(true)}>导出甲方验收演示</button>
        <button type="button" className="btn ghost block" onClick={resetProject}>恢复示例方案</button>
      </Section>
      <Section title="操作路径">
        <ol className="explain-list">
          <li>在左侧方案结构勾选多条轨道，点击「编为一组」。</li>
          <li>在三维视图点轨道，拖动绿/橙球调整两个端点。</li>
          <li>在右侧改行程、线速度、启停节奏或展开时长。</li>
          <li>拖动速度曲线上的点，帘布即时变速。</li>
          <li>给轨道添加中途停顿，时间条会出现琥珀色停顿段。</li>
          <li>拖动组时间条或点击「预览整组」检查联动。</li>
        </ol>
      </Section>
    </div>
  );
}

export function Inspector() {
  const selectedId = useAppStore((s) => s.selectedId);
  const node = useAppStore((s) => (selectedId ? s.project.nodes[selectedId] : undefined));
  return (
    <aside className="panel inspector-panel">
      <div className="panel-title">参数检查器</div>
      {!node ? <ProjectInspector /> : isTrack(node) ? <TrackInspector track={node} /> : <GroupInspector groupId={node.id} />}
    </aside>
  );
}
