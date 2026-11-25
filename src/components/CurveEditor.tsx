import { useMemo, useRef } from 'react';
import type { SpeedPoint, TrackNode } from '../types';
import { useAppStore } from '../store';
import { createSpeedProfile, formatTime, sampleTrack } from '../lib/timing';

const W = 340;
const H = 214;
const M = { top: 18, right: 16, bottom: 32, left: 36 };
const Y_MIN = 0;
const Y_MAX = 3;

interface Props {
  track: TrackNode;
}

export function CurveEditor({ track }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const currentTime = useAppStore((s) => s.currentTime);
  const addSpeedPoint = useAppStore((s) => s.addSpeedPoint);
  const updateSpeedPoint = useAppStore((s) => s.updateSpeedPoint);
  const removeSpeedPoint = useAppStore((s) => s.removeSpeedPoint);
  const resetSpeedCurve = useAppStore((s) => s.resetSpeedCurve);

  const sorted = useMemo(() => [...track.speedPoints].sort((a, b) => a.x - b.x), [track.speedPoints]);
  const profile = useMemo(() => createSpeedProfile(track.speedPoints), [track.speedPoints]);
  const sample = useMemo(() => sampleTrack(track, currentTime), [track, currentTime]);

  const x = (p: number) => M.left + p * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - Y_MIN) / (Y_MAX - Y_MIN)) * (H - M.top - M.bottom);

  const path = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${x(sorted[sorted.length - 1]?.x ?? 1)} ${H - M.bottom} L ${x(sorted[0]?.x ?? 0)} ${H - M.bottom} Z`;

  function eventToProgress(event: { clientX: number; clientY: number }): { px: number; vy: number } {
    const svg = svgRef.current;
    if (!svg) return { px: 0.5, vy: 1 };
    const rect = svg.getBoundingClientRect();
    const logicalX = ((event.clientX - rect.left) / rect.width) * W;
    const logicalY = ((event.clientY - rect.top) / rect.height) * H;
    const px = Math.min(1, Math.max(0, (logicalX - M.left) / (W - M.left - M.right)));
    const vy = Y_MIN + (1 - (logicalY - M.top) / (H - M.top - M.bottom)) * (Y_MAX - Y_MIN);
    return { px, vy: Math.min(2.8, Math.max(0.2, vy)) };
  }

  function movePoint(event: React.PointerEvent, point: SpeedPoint) {
    if (event.buttons !== 1) return;
    const { px, vy } = eventToProgress(event);
    updateSpeedPoint(track.id, point.id, { x: px, y: vy });
  }

  const markerX = x(sample.progress);
  const markerY = y(profile.speedAtProgress(sample.progress));
  const physical = Math.abs(sample.physicalSpeed);

  return (
    <div className="curve-editor">
      <div className="curve-head">
        <div>
          <strong>独立开合速度曲线</strong>
          <span>横轴展开进度 · 纵轴速度倍率；拖点即改帘布快慢</span>
        </div>
        <button type="button" className="btn tiny" onClick={() => resetSpeedCurve(track.id)}>重置</button>
      </div>
      <svg
        ref={svgRef}
        className="curve-svg"
        viewBox={`0 0 ${W} ${H}`}
        onDoubleClick={(e) => {
          const { px, vy } = eventToProgress(e);
          addSpeedPoint(track.id, px, Math.round(vy * 100) / 100);
        }}
        role="img"
        aria-label="开合速度曲线编辑器"
      >
        <defs>
          <linearGradient id={`curveFill-${track.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={track.color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={track.color} stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((tick) => (
          <g key={tick}>
            <line x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} className="curve-grid" />
            <text x={M.left - 8} y={y(tick) + 4} textAnchor="end" className="axis-text">{tick}×</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <text key={tick} x={x(tick)} y={H - 10} textAnchor="middle" className="axis-text">
            {Math.round(tick * 100)}%
          </text>
        ))}
        <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} className="curve-axis" />
        <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} className="curve-axis" />
        <path d={areaPath} fill={`url(#curveFill-${track.id})`} />
        <path d={path} fill="none" stroke={track.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {sample.phase === 'open' || sample.phase === 'pause' || sample.phase === 'close' ? (
          <g>
            <line x1={markerX} x2={markerX} y1={M.top} y2={H - M.bottom} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 4" />
            <circle cx={markerX} cy={markerY} r="6" fill="#fbbf24" stroke="#1f2937" strokeWidth="2" />
          </g>
        ) : null}

        {sorted.map((point) => (
          <circle
            key={point.id}
            cx={x(point.x)}
            cy={y(point.y)}
            r="6.5"
            fill="#f8fafc"
            stroke={track.color}
            strokeWidth="3"
            className="curve-point"
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => movePoint(e, point)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              removeSpeedPoint(track.id, point.id);
            }}
          >
            <title>拖动调速；双击删除</title>
          </circle>
        ))}
        <text x={W - M.right} y={12} textAnchor="end" className="curve-live">
          当前 {physical.toFixed(3)} m/s · {sample.phase === 'pause' ? '停顿中' : `进度 ${(sample.progress * 100).toFixed(0)}%`}
        </text>
      </svg>
      <div className="curve-foot">
        <span>展开时长 {formatTime(track.openDuration)}（不含停顿）</span>
        <span>双击空白可增加控制点</span>
      </div>
    </div>
  );
}
