import { PIPES, pipe } from '../core/catalogue';

interface Props {
  pipeM: Record<string, number>;
}

export function Legend({ pipeM }: Props) {
  const dns = Object.entries(pipeM)
    .filter(([, m]) => m > 0.05)
    .sort((a, b) => pipe(b[0]).dn - pipe(a[0]).dn);
  const maxDn = dns.length ? Math.max(...dns.map(([id]) => pipe(id).dn)) : 32;
  const items = PIPES.filter((p) => dns.some(([id]) => id === p.id)).sort((a, b) => b.dn - a.dn);

  return (
    <div className="legend" aria-label="图例">
      <div className="legend-block">
        <div className="legend-title">管径(线宽 ∝ DN)</div>
        <div className="legend-pipes">
          {items.map((p) => {
            const w = Math.max(2, Math.min(14, 1.2 + p.dn / 11));
            const len = p.dn === maxDn ? 46 : Math.max(20, (p.dn / maxDn) * 46);
            return (
              <div className="legend-row" key={p.id}>
                <span className="legend-swatch">
                  <span
                    className="legend-line"
                    style={{ height: `${w}px`, width: `${len}px`, background: '#1d5c86' }}
                  />
                </span>
                <span className="legend-text">
                  DN{p.dn}
                  <em>{pipeM[p.id] ? `${pipeM[p.id].toFixed(0)} m` : ''}</em>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="legend-block">
        <div className="legend-title">要素</div>
        <div className="legend-rows">
          <div className="legend-row">
            <span className="dot dot-drip" />
            <span className="legend-text">滴头</span>
          </div>
          <div className="legend-row">
            <span className="dot dot-spr" />
            <span className="legend-text">喷头</span>
          </div>
          <div className="legend-row">
            <span className="swatch-warn" />
            <span className="legend-text">压降超限</span>
          </div>
          <div className="legend-row">
            <span className="swatch-danger" />
            <span className="legend-text">流速超限 / 穿作业道</span>
          </div>
          <div className="legend-row">
            <span className="swatch-bed" />
            <span className="legend-text">苗床</span>
          </div>
          <div className="legend-row">
            <span className="swatch-aisle" />
            <span className="legend-text">作业道</span>
          </div>
          <div className="legend-row">
            <span className="swatch-badge">120</span>
            <span className="legend-text">压力段末 (kPa)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
