import type { Solution } from '../core/types';

interface Props {
  solution: Solution;
  onHover?: (u: number | null) => void;
}

/**
 * Pressure profile along the main, drawn from the headworks to the house tail.
 * It is the numeric backing for the pressure zones on the plan: the same bands,
 * the same end-of-zone labels, plus the emitter design head as a reference line.
 */
export function PressureProfile({ solution, onHover }: Props) {
  const segs = solution.main.segments;
  if (!segs.length) return null;

  const W = 1000;
  const H = 150;
  const padL = 46;
  const padR = 16;
  const padT = 16;
  const padB = 30;

  const u0 = segs[0].from;
  const u1 = segs[segs.length - 1].to;
  const span = Math.max(1e-6, u1 - u0);

  const kpas = segs.flatMap((s) => [s.headIn * 9.81, s.headOut * 9.81]);
  const lo = Math.max(0, Math.min(...kpas) - 12);
  const hi = Math.max(...kpas) + 12;

  const X = (u: number) => padL + ((u - u0) / span) * (W - padL - padR);
  const Y = (kpa: number) => padT + (1 - (kpa - lo) / Math.max(1e-6, hi - lo)) * (H - padT - padB);

  const pts: string[] = [];
  for (const s of segs) {
    pts.push(`${X(s.from).toFixed(1)},${Y(s.headIn * 9.81).toFixed(1)}`);
    pts.push(`${X(s.to).toFixed(1)},${Y(s.headOut * 9.81).toFixed(1)}`);
  }
  const line = pts.join(' ');
  const area = `M ${X(u0)},${H - padB} L ${line.replace(/ /g, ' L ')} L ${X(u1)},${H - padB} Z`;

  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v));
  const zoneMarks = solution.main.zones;

  return (
    <div className="profile">
      <div className="profile-head">
        <span className="profile-title">沿程压力纵剖面</span>
        <span className="muted small">
          首部 { (solution.main.headworksHead * 9.81).toFixed(0) } kPa → 棚尾{' '}
          {(segs[segs.length - 1].headOut * 9.81).toFixed(0)} kPa
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="profile-svg"
        role="img"
        aria-label="主管沿程压力曲线"
        onMouseLeave={() => onHover?.(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const u = u0 + ((px - padL) / Math.max(1, W - padL - padR)) * span;
          if (u >= u0 && u <= u1) onHover?.(u);
        }}
      >
        <defs>
          <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a7aa8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2a7aa8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={Y(v)} y2={Y(v)} stroke="#e2ded3" strokeWidth="1" />
            <text x={padL - 7} y={Y(v) + 3} className="profile-tick" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text x={padL - 7} y={padT - 4} className="profile-unit" textAnchor="end">
          kPa
        </text>

        {zoneMarks.map((z) => (
          <line
            key={`z${z.index}`}
            x1={X(z.uTo)}
            x2={X(z.uTo)}
            y1={padT}
            y2={H - padB}
            stroke="#1d5c86"
            strokeWidth="0.8"
            strokeDasharray="2 3"
            opacity="0.35"
          />
        ))}

        <path d={area} fill="url(#pf-fill)" />
        <polyline points={line} fill="none" stroke="#1d5c86" strokeWidth="2" strokeLinejoin="round" />

        {zoneMarks.map((z) => (
          <g key={`zl${z.index}`}>
            <circle cx={X(z.uTo)} cy={Y(z.endKPa)} r="3" fill="#fff" stroke="#1d5c86" strokeWidth="1.6" />
            <text x={X(z.uTo)} y={H - padB + 14} className="profile-zone" textAnchor="middle">
              {z.endKPa.toFixed(0)}
            </text>
          </g>
        ))}

        <text x={X(u0)} y={H - 5} className="profile-x" textAnchor="start">
          首部
        </text>
        <text x={X(u1)} y={H - 5} className="profile-x" textAnchor="end">
          棚尾 {span.toFixed(1)} m
        </text>
      </svg>
    </div>
  );
}
