import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { flattenVisibleRows, getProjectDuration, getTimelineInterval, isGroup, isTrack } from '../lib/tree';
import {
  formatClock,
  getKeyframes,
  getRelativePauses,
  openEndRelative,
  trackTotalDuration,
} from '../lib/timing';
import type { GroupNode, TrackNode } from '../types';

const LABEL_W = 228;

function usePlaybackLoop() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      useAppStore.getState().tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

function Ruler({ width, pps, duration }: { width: number; pps: number; duration: number }) {
  const seek = useAppStore((s) => s.seek);
  const ticks = [];
  const step = pps < 16 ? 5 : pps < 26 ? 2 : 1;
  for (let t = 0; t <= duration + 0.001; t += step) {
    ticks.push(t);
  }

  function scrub(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / pps;
    seek(Math.max(0, x));
  }

  return (
    <div className="tl-row ruler-row">
      <div className="tl-corner" style={{ width: LABEL_W }}>时间标尺</div>
      <div
        className="tl-lane ruler-lane"
        style={{ width }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub(e);
        }}
        onPointerMove={(e) => { if (e.buttons === 1) scrub(e); }}
      >
        {ticks.map((t) => (
          <div key={t} className="ruler-tick" style={{ left: t * pps }}>
            <i />
            <span>{t}s</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupTimelineBar({ group, depth, pps, width }: { group: GroupNode; depth: number; pps: number; width: number }) {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedId);
  const { select, seek, playGroup, toggleCollapsed } = useAppStore();
  const interval = getTimelineInterval(project, group.id);
  const left = interval.start * pps;
  const barWidth = Math.max(90, (interval.end - interval.start) * pps);

  function scrub(event: React.PointerEvent<HTMLDivElement>) {
    const lane = event.currentTarget.closest('.tl-lane') as HTMLElement | null;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    seek((event.clientX - rect.left) / pps);
  }

  return (
    <div className={`tl-row group-tl-row ${selectedId === group.id ? 'selected' : ''}`}>
      <div className="tl-label group-label" style={{ width: LABEL_W, paddingLeft: 8 + depth * 14 }}>
        <button type="button" className="collapse-btn" onClick={() => toggleCollapsed(group.id)}>{group.collapsed ? '▸' : '▾'}</button>
        <button type="button" className="timeline-name" onClick={() => select(group.id)}>
          <span className="tree-icon group" style={{ color: group.color }}>▣</span>{group.name}
        </button>
      </div>
      <div className="tl-lane group-lane" style={{ width }} onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - rect.left) / pps);
        }
      }}>
        <div
          className="group-time-bar"
          style={{ left, width: barWidth, borderColor: group.color, background: `linear-gradient(90deg, ${group.color}33, ${group.color}14)` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub(e);
          }}
          onPointerMove={(e) => { if (e.buttons === 1) scrub(e); }}
          onDoubleClick={() => playGroup(group.id)}
          title="左右拖动预览整组；双击循环播放整组"
          role="slider"
          aria-label={`${group.name}整组预览条`}
          aria-valuemin={interval.start}
          aria-valuemax={interval.end}
        >
          <span className="group-grip">⇔</span>
          <b>拖我预览整组</b>
          <span className="group-duration">{(interval.end - interval.start).toFixed(1)}s</span>
          <button
            type="button"
            className="group-play"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); playGroup(group.id); }}
          >▶</button>
        </div>
      </div>
    </div>
  );
}

function TrackTimelineRow({ track, depth, pps, width }: { track: TrackNode; depth: number; pps: number; width: number }) {
  const selectedId = useAppStore((s) => s.selectedId);
  const { select, changeOpenDuration, moveTrackStart } = useAppStore();
  const clipDrag = useRef<{ pointerX: number; start: number; pointerId: number } | null>(null);
  const selected = selectedId === track.id;
  const total = trackTotalDuration(track);
  const openEnd = openEndRelative(track);
  const holdEnd = openEnd + track.holdDuration;
  const relativePauses = getRelativePauses(track);
  const keyframes = getKeyframes(track);
  const clipWidth = Math.max(44, total * pps);

  return (
    <div className={`tl-row track-tl-row ${selected ? 'selected' : ''}`}>
      <div className="tl-label track-label" style={{ width: LABEL_W, paddingLeft: 12 + depth * 14 }}>
        <span className="color-chip" style={{ background: track.color }} />
        <button type="button" className="timeline-name" onClick={() => select(track.id)} title={track.name}>{track.name}</button>
        <div className="duration-stepper">
          <button type="button" onClick={() => changeOpenDuration(track.id, track.openDuration - 1)} title="减少1秒并按比例重排本组关键帧">−</button>
          <b>{track.openDuration.toFixed(0)}s</b>
          <button type="button" onClick={() => changeOpenDuration(track.id, track.openDuration + 1)} title="增加1秒并按比例重排本组关键帧">＋</button>
        </div>
      </div>
      <div className="tl-lane track-lane" style={{ width }}>
        <div
          className={`track-clip ${selected ? 'selected' : ''}`}
          style={{ left: track.start * pps, width: clipWidth, ['--track-color' as string]: track.color }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            e.stopPropagation();
            select(track.id);
            e.currentTarget.setPointerCapture(e.pointerId);
            clipDrag.current = { pointerX: e.clientX, start: track.start, pointerId: e.pointerId };
          }}
          onPointerMove={(e) => {
            const drag = clipDrag.current;
            if (!drag || e.pointerId !== drag.pointerId || e.buttons !== 1) return;
            moveTrackStart(track.id, drag.start + (e.clientX - drag.pointerX) / pps);
          }}
          onPointerUp={(e) => {
            if (clipDrag.current?.pointerId === e.pointerId) clipDrag.current = null;
          }}
        >
          <div className="clip-seg delay" style={{ width: track.device.startDelayS * pps }} title="电机启动延时" />
          <div className="clip-seg open" style={{ left: track.device.startDelayS * pps, width: (openEnd - track.device.startDelayS) * pps }} />
          <div className="clip-seg hold" style={{ left: openEnd * pps, width: track.holdDuration * pps }} title="全开保持" />
          <div className="clip-seg close" style={{ left: holdEnd * pps, width: track.closeDuration * pps }} title="收拢段" />
          {relativePauses.map((p) => (
            <div
              key={p.id}
              className="pause-segment"
              style={{ left: p.startRel * pps, width: Math.max(18, p.duration * pps) }}
              title={`中途停顿 ${p.duration.toFixed(1)}s`}
            >
              {p.duration * pps > 42 ? <span>停顿 {p.duration.toFixed(1)}s</span> : null}
            </div>
          ))}
          {keyframes.map((kf) => (
            <i
              key={kf.id}
              className={`keyframe kf-${kf.kind}`}
              style={{ left: (kf.time - track.start) * pps }}
              title={`${kf.label} · ${formatClock(kf.time)}`}
            />
          ))}
          <span className="clip-title">{track.code} · 拖动移动编排位置</span>
        </div>
      </div>
    </div>
  );
}

export function Timeline() {
  usePlaybackLoop();
  const project = useAppStore((s) => s.project);
  const currentTime = useAppStore((s) => s.currentTime);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const rate = useAppStore((s) => s.rate);
  const loop = useAppStore((s) => s.loop);
  const playbackRange = useAppStore((s) => s.playbackRange);
  const { togglePlay, seek, setRate, toggleLoop, clearPlaybackRange } = useAppStore();
  const [pps, setPps] = useState(20);
  const rows = useMemo(() => flattenVisibleRows(project), [project]);
  const duration = useMemo(() => getProjectDuration(project), [project]);
  const width = duration * pps + 80;

  return (
    <section className="panel timeline-panel">
      <header className="timeline-toolbar">
        <div className="playback-controls">
          <button type="button" className={`btn primary play-btn ${isPlaying ? 'playing' : ''}`} onClick={togglePlay}>
            {isPlaying ? '❚❚ 暂停' : '▶ 回放'}
          </button>
          <button type="button" className="btn icon-btn" onClick={() => { seek(0); clearPlaybackRange(); }} title="回到开头">⏮</button>
          <div className="time-readout"><b>{formatClock(currentTime)}</b><span>/ {formatClock(duration)}</span></div>
          <label className="rate-select">
            倍速
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
            </select>
          </label>
          <button type="button" className={`btn tiny ${loop ? 'active' : ''}`} onClick={toggleLoop}>循环 {loop ? '开' : '关'}</button>
          {playbackRange ? (
            <span className="range-pill">
              整组预览 {playbackRange.start.toFixed(1)}–{playbackRange.end.toFixed(1)}s
              <button type="button" onClick={clearPlaybackRange}>×</button>
            </span>
          ) : null}
        </div>
        <div className="timeline-tools">
          <span className="reorder-hint">◆ 关键帧等比重排已启用：改组内轨道 <b>±秒</b> 或检查器时长</span>
          <label className="zoom-control">
            缩放
            <input type="range" min={10} max={42} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
          </label>
        </div>
      </header>

      <div className="timeline-scroll">
        <div className="timeline-inner" style={{ width: LABEL_W + width }}>
          <Ruler width={width} pps={pps} duration={duration} />
          {rows.map((row) => {
            const node = project.nodes[row.id];
            if (!node) return null;
            return isGroup(node)
              ? <GroupTimelineBar key={row.id} group={node} depth={row.depth} pps={pps} width={width} />
              : isTrack(node)
                ? <TrackTimelineRow key={row.id} track={node} depth={row.depth} pps={pps} width={width} />
                : null;
          })}
          <div
            className="playhead"
            style={{ left: LABEL_W + currentTime * pps }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="playhead-handle" />
          </div>
        </div>
      </div>
    </section>
  );
}
