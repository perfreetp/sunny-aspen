import type { Solution, Warning } from '../core/types';

interface Props {
  solution: Solution;
  onFocusBranch: (index: number) => void;
  onFocusPoint: (u: number) => void;
  onFixConflict: (branchIndex: number, u: number) => void;
}

export function WarningList({ solution, onFocusBranch, onFocusPoint, onFixConflict }: Props) {
  const errors = solution.warnings.filter((w) => w.severity === 'error');
  const warns = solution.warnings.filter((w) => w.severity === 'warn');
  const infos = solution.warnings.filter((w) => w.severity === 'info');

  return (
    <div className="warnings">
      <div className="warnings-head">
        <h3>校核提示</h3>
        <span className="muted">
          {errors.length} 错误 · {warns.length} 警告
        </span>
      </div>
      {solution.warnings.length === 0 ? (
        <p className="hint">全部段落都在允许压降与流速范围内。</p>
      ) : null}
      {[...errors, ...warns, ...infos].map((w) => (
        <article key={w.id} className={`warning warning-${w.severity}`}>
          <header>
            <span className={`dot-status ${w.severity}`} />
            <strong>{w.title}</strong>
          </header>
          <p>{w.detail}</p>
          {w.advice ? (
            <p className="warning-advice">
              <span>处理</span>
              {w.advice}
            </p>
          ) : null}
          <footer>
            {w.branchIndex !== undefined ? (
              <button type="button" className="link" onClick={() => onFocusBranch(w.branchIndex!)}>
                定位支管
              </button>
            ) : null}
            {w.u !== undefined ? (
              <button type="button" className="link" onClick={() => onFocusPoint(w.u!)}>
                定位主管段
              </button>
            ) : null}
            {w.kind === 'aisle' && w.branchIndex !== undefined ? (
              <button
                type="button"
                className="link link-strong"
                onClick={() => {
                  const c = solution.conflicts.find((x) => x.branchIndex === w.branchIndex);
                  if (c && c.suggestedU !== null) onFixConflict(w.branchIndex!, c.suggestedU);
                }}
                title="把支管移到作业道边上(会记为该支管的手动位置)"
              >
                移到作业道边
              </button>
            ) : null}
          </footer>
        </article>
      ))}
    </div>
  );
}

export function ConflictTable({
  solution,
  onFix,
  onFocus,
}: {
  solution: Solution;
  onFix: (branchIndex: number, u: number) => void;
  onFocus: (index: number) => void;
}) {
  if (!solution.conflicts.length) {
    return <p className="hint">没有支管穿过作业道。</p>;
  }
  return (
    <div className="table-scroll">
      <table className="conflict-table">
        <thead>
          <tr>
            <th>支管</th>
            <th>位置 m</th>
            <th>作业道</th>
            <th>占用 m</th>
            <th>建议位置</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {solution.conflicts.map((c) => {
            const br = solution.layout.branches.find((b) => b.index === c.branchIndex);
            return (
              <tr key={`${c.branchIndex}-${c.aisleIndex}`}>
                <td>Z{c.branchIndex + 1}</td>
                <td>{br ? br.u.toFixed(2) : '—'}</td>
                <td>#{c.aisleIndex + 1}</td>
                <td>
                  {c.aisle.u0.toFixed(2)}–{c.aisle.u1.toFixed(2)}
                </td>
                <td>{c.suggestedU !== null ? `${c.suggestedU.toFixed(2)} m` : '—'}</td>
                <td className="row-actions">
                  <button type="button" className="link" onClick={() => onFocus(c.branchIndex)}>
                    定位
                  </button>
                  {c.suggestedU !== null ? (
                    <button
                      type="button"
                      className="link link-strong"
                      onClick={() => onFix(c.branchIndex, c.suggestedU!)}
                    >
                      移开
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function warnSummary(warnings: Warning[]) {
  const errors = warnings.filter((w) => w.severity === 'error').length;
  const warns = warnings.filter((w) => w.severity === 'warn').length;
  return { errors, warns };
}
