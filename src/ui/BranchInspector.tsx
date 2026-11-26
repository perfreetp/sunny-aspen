import type { BranchResult, Solution } from '../core/types';
import { pipe } from '../core/catalogue';

interface Props {
  solution: Solution;
  selectedBranch: number | null;
  onSelect: (i: number) => void;
  onSetSpacing: (key: string, spacing: number) => void;
  onClearSpacing: (key: string) => void;
  onClearPosition: (key: string) => void;
}

export function BranchInspector({
  solution,
  selectedBranch,
  onSelect,
  onSetSpacing,
  onClearSpacing,
  onClearPosition,
}: Props) {
  const sel = selectedBranch !== null ? solution.branches.find((b) => b.index === selectedBranch) : null;
  const layoutBr =
    selectedBranch !== null ? solution.layout.branches.find((b) => b.index === selectedBranch) : null;

  return (
    <div className="inspector">
      <div className="inspector-head">
        <h3>支管检查</h3>
        <span className="muted">{solution.branches.length} 条</span>
      </div>

      {!sel || !layoutBr ? (
        <p className="hint">
          点选图上任意支管查看分段水力。拖动支管可调整其沿主管的位置;拖动支管上的一个滴头,只改这一条支管的滴头间距。
        </p>
      ) : (
        <BranchDetail
          br={sel}
          layoutBr={layoutBr}
          onSetSpacing={onSetSpacing}
          onClearSpacing={onClearSpacing}
          onClearPosition={onClearPosition}
        />
      )}

      <div className="branch-list" role="list">
        {solution.branches.map((b) => {
          const lb = solution.layout.branches.find((x) => x.index === b.index);
          const flagged = b.flags > 0;
          const selected = b.index === selectedBranch;
          return (
            <button
              type="button"
              role="listitem"
              key={b.index}
              className={`branch-row${selected ? ' is-selected' : ''}${flagged ? ' is-flagged' : ''}`}
              onClick={() => onSelect(b.index)}
            >
              <span className="branch-row-name">Z{b.index + 1}</span>
              <span className="branch-row-meta">{lb?.pinned ? '手动' : '自动'}</span>
              <span className="branch-row-q">{b.flowLph.toFixed(0)} L/h</span>
              <span className="branch-row-dn">DN{pipe(b.diameterId).dn}</span>
              {flagged ? <span className="chip chip-warn">{b.flags} 段超限</span> : <span className="chip chip-ok">正常</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BranchDetail({
  br,
  layoutBr,
  onSetSpacing,
  onClearSpacing,
  onClearPosition,
}: {
  br: BranchResult;
  layoutBr: Solution['layout']['branches'][number];
  onSetSpacing: (key: string, spacing: number) => void;
  onClearSpacing: (key: string) => void;
  onClearPosition: (key: string) => void;
}) {
  const worst = br.segments.reduce(
    (acc, s) => (s.cumLoss / Math.max(s.budget, 1e-6) > acc ? s.cumLoss / Math.max(s.budget, 1e-6) : acc),
    0,
  );
  const firstDrip = layoutBr.emitters.find((e) => e.type === 'drip');
  const sprCount = layoutBr.emitters.filter((e) => e.type === 'sprinkler').length;
  const dripCount = layoutBr.emitters.length - sprCount;

  return (
    <div className="branch-detail">
      <div className="kv-grid">
        <Kv k="入口压力" v={`${(br.inletHead * 9.81).toFixed(0)} kPa`} />
        <Kv k="末端压力" v={`${(br.endHead * 9.81).toFixed(0)} kPa`} />
        <Kv k="管径" v={`DN${pipe(br.diameterId).dn}`} />
        <Kv k="长度" v={`${layoutBr.lengthM.toFixed(2)} m`} />
        <Kv k="滴头间距" v={`${layoutBr.dripSpacingM.toFixed(2)} m`} />
        <Kv k="滴头 / 喷头" v={`${dripCount} / ${sprCount}`} />
        <Kv k="支管流量" v={`${br.flowLph.toFixed(0)} L/h`} />
        <Kv k="出流偏差" v={`${br.flowDeviationPct.toFixed(1)} %`} />
        <Kv k="最低压力" v={`${br.minKPa.toFixed(0)} kPa`} />
        <Kv k="摩阻消耗" v={`${(br.segments.at(-1)?.cumLoss ?? 0).toFixed(2)} / ${(br.segments.at(-1)?.budget ?? 0).toFixed(2)} m`} />
        <Kv k="状态" v={br.flags ? `${br.flags} 段超限` : '正常'} tone={br.flags ? 'warn' : 'ok'} />
        <Kv k="布置" v={layoutBr.pinned ? '手动定位' : '自动生成'} />
      </div>

      <div className="branch-edits">
        <label className="inline-field">
          <span>滴头间距</span>
          <input
            type="number"
            min={0.05}
            max={2}
            step={0.05}
            value={Number(layoutBr.dripSpacingM.toFixed(3))}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0.05) onSetSpacing(layoutBr.key, Math.min(2, v));
            }}
          />
          <span className="unit">m</span>
        </label>
        <button
          type="button"
          className="link"
          onClick={() => onClearSpacing(layoutBr.key)}
          disabled={!layoutBr.spacingOverridden}
          title="恢复按全局滴头间距排布"
        >
          恢复默认间距
        </button>
        {layoutBr.pinned ? (
          <button
            type="button"
            className="link"
            onClick={() => onClearPosition(layoutBr.key)}
            title="让这条支管回到自动生成的位置"
          >
            取消手动定位
          </button>
        ) : null}
      </div>

      <div className="meter" title={`最大摩阻占允许值 ${(worst * 100).toFixed(0)}%`}>
        <div
          className={`meter-fill${worst > 1 ? ' is-over' : worst > 0.8 ? ' is-near' : ''}`}
          style={{ width: `${Math.min(100, worst * 100)}%` }}
        />
      </div>
      <div className="meter-caption">
        摩阻占用 {Math.min(999, Math.round(worst * 100))}% 的允许压降
        {worst > 1 ? ' — 建议加粗一级或缩短支管' : ''}
      </div>

      <details className="segments">
        <summary>分段明细({br.segments.length} 段)</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>段</th>
                <th>起 m</th>
                <th>止 m</th>
                <th>流量 L/h</th>
                <th>流速 m/s</th>
                <th>摩阻 m</th>
                <th>累计 m</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {br.segments.map((s) => (
                <tr key={s.index} className={s.status !== 'ok' ? `row-${s.status}` : ''}>
                  <td>{s.index + 1}</td>
                  <td>{s.from.toFixed(2)}</td>
                  <td>{s.to.toFixed(2)}</td>
                  <td>{s.flowLph.toFixed(0)}</td>
                  <td>{s.velocity.toFixed(2)}</td>
                  <td>{s.hf.toFixed(3)}</td>
                  <td>{s.cumLoss.toFixed(2)}</td>
                  <td>{s.status === 'ok' ? '正常' : s.status === 'warn' ? '压降超限' : '流速超限'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {br.segments.some((s) => s.advice) ? (
        <p className="advice">
          <strong>建议:</strong> {br.segments.find((s) => s.advice)?.advice}
        </p>
      ) : null}

      {firstDrip ? null : <p className="hint small">此支管为纯喷灌段(无滴头)。</p>}
    </div>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="kv">
      <span className="kv-key">{k}</span>
      <span className={`kv-val${tone ? ` tone-${tone}` : ''}`}>{v}</span>
    </div>
  );
}
