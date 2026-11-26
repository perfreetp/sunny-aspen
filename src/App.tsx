import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type CanvasHandle } from './render/Canvas';
import type { RenderOptions } from './render/PaperRenderer';
import { ParamsPanel } from './ui/ParamsPanel';
import { BranchInspector } from './ui/BranchInspector';
import { WarningList, ConflictTable, warnSummary } from './ui/WarningList';
import { Legend } from './ui/Legend';
import { PressureProfile } from './ui/PressureProfile';
import { PRESETS, applyPreset, clone, newProject } from './core/defaults';
import type { ProjectDoc, ProjectParams } from './core/types';
import { compute, clearDoc, countOverrides, emptyOverrides, loadDoc, saveDoc } from './state';
import { bomCsv, conflictsCsv, downloadText, emittersCsv, segmentsCsv } from './export/csv';
import { pipe } from './core/catalogue';
import { NumberField } from './ui/Field';

type Tab = 'params' | 'branch' | 'warnings' | 'check';

const fmtKPa = (kpa: number) => `${kpa.toFixed(0)} kPa`;

export default function App() {
  const [doc, setDoc] = useState<ProjectDoc>(() => loadDoc() ?? newProject());
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [highlightEmitter, setHighlightEmitter] = useState<{ branchIndex: number; emitterIndex: number } | null>(
    null,
  );
  const [tab, setTab] = useState<Tab>('params');
  const [render, setRender] = useState<RenderOptions>({
    showLabels: true,
    showRanges: false,
    showBeds: true,
    showZones: true,
  });
  const [fitToken, setFitToken] = useState(0);
  const [saved, setSaved] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const handleRef = useRef<CanvasHandle | null>(null);

  const solution = useMemo(() => compute(doc), [doc]);
  const summary = warnSummary(solution.warnings);
  const overrides = countOverrides(doc.overrides);

  // ---- persistence ---------------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => {
      const ok = saveDoc(doc);
      setSaved(ok ? 'ok' : 'fail');
      if (ok) {
        const t2 = setTimeout(() => setSaved('idle'), 1400);
        return () => clearTimeout(t2);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [doc]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  // ---- mutations -----------------------------------------------------------
  const patchParams = useCallback((mut: (p: ProjectParams) => void) => {
    setDoc((d) => {
      const next = clone(d);
      mut(next.params);
      return next;
    });
  }, []);

  const setSeed = useCallback((seed: number) => {
    setDoc((d) => ({ ...clone(d), seed }));
  }, []);

  const regenerate = useCallback(() => {
    setDoc((d) => clone(d));
    setFitToken((t) => t + 1);
    showToast('已按当前种子与参数重新生成');
  }, [showToast]);

  const moveBranch = useCallback((key: string, u: number) => {
    setDoc((d) => {
      const next = clone(d);
      next.overrides.branchOffset[key] = Math.round(u * 100) / 100;
      return next;
    });
  }, []);

  const setBranchSpacing = useCallback((key: string, spacing: number) => {
    setDoc((d) => {
      const next = clone(d);
      next.overrides.branchSpacing[key] = spacing;
      return next;
    });
  }, []);

  const clearBranchSpacing = useCallback((key: string) => {
    setDoc((d) => {
      const next = clone(d);
      delete next.overrides.branchSpacing[key];
      return next;
    });
  }, []);

  const clearBranchPosition = useCallback((key: string) => {
    setDoc((d) => {
      const next = clone(d);
      delete next.overrides.branchOffset[key];
      return next;
    });
  }, []);

  const resetOverrides = useCallback(() => {
    setDoc((d) => ({ ...clone(d), overrides: emptyOverrides() }));
    showToast('已清除全部手动修改');
  }, [showToast]);

  const fixConflict = useCallback(
    (branchIndex: number, u: number) => {
      const branch = solution.layout.branches.find((b) => b.index === branchIndex);
      if (!branch) return;
      moveBranch(branch.key, u);
      setSelectedBranch(branchIndex);
      showToast(`支管 Z${branchIndex + 1} 已移到 ${u.toFixed(2)} m`);
    },
    [solution, moveBranch, showToast],
  );

  const loadPreset = useCallback(
    (id: string) => {
      const { params, seed } = applyPreset(id);
      setDoc({ ...newProject(), params, seed, overrides: emptyOverrides() });
      setSelectedBranch(null);
      setHighlightEmitter(null);
      setFitToken((t) => t + 1);
      const p = PRESETS.find((x) => x.id === id);
      showToast(`已载入示例:${p?.name ?? id}`);
    },
    [showToast],
  );

  const exportSvg = useCallback(() => {
    const svg = handleRef.current?.exportSvg();
    if (!svg) {
      showToast('SVG 导出失败');
      return;
    }
    downloadText(`${slug(doc.name)}.svg`, svg, 'image/svg+xml;charset=utf-8');
    showToast('已导出 SVG');
  }, [doc.name, showToast]);

  const exportOne = useCallback(
    (kind: 'segments' | 'emitters' | 'conflicts' | 'bom') => {
      const text =
        kind === 'segments'
          ? segmentsCsv(solution)
          : kind === 'emitters'
            ? emittersCsv(solution)
            : kind === 'conflicts'
              ? conflictsCsv(solution)
              : bomCsv(solution);
      const names = {
        segments: '分段水力计算表',
        emitters: '灌水器清单',
        conflicts: '穿作业道清单',
        bom: '材料表',
      };
      downloadText(`${slug(doc.name)}-${names[kind]}.csv`, text);
      showToast(`已导出「${names[kind]}」`);
    },
    [solution, doc.name, showToast],
  );

  const hardReset = useCallback(() => {
    clearDoc();
    setDoc(newProject());
    setSelectedBranch(null);
    setFitToken((t) => t + 1);
    showToast('已恢复默认工程');
  }, [showToast]);

  // keyboard: Escape clears selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBranch(null);
        setHighlightEmitter(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedLayoutBranch =
    selectedBranch !== null
      ? solution.layout.branches.find((b) => b.index === selectedBranch)
      : null;
  const activeZones = solution.main.zones;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-drop" />
          </span>
          <div>
            <h1>温室灌溉管网接出</h1>
            <p>源 → 首部 → 主管 → 支管 → 滴头 / 喷头</p>
          </div>
        </div>

        <div className="topbar-stats">
          <Stat label="总流量" value={`${(solution.totals.flowLph / 1000).toFixed(2)} m³/h`} />
          <Stat label="支管" value={`${solution.totals.branchCount} 条`} />
          <Stat label="滴头" value={`${solution.totals.dripCount} 个`} />
          <Stat label="喷头" value={`${solution.totals.sprinklerCount} 个`} />
          <Stat
            label="首部压力"
            value={fmtKPa(solution.main.headworksHead * 9.81)}
            tone={solution.main.requiredSourceKPa > doc.params.hydraulic.sourceKPa + 1 ? 'warn' : 'ok'}
            title={`设计要求水源 ${solution.main.requiredSourceKPa.toFixed(0)} kPa`}
          />
          <Stat
            label="校核"
            value={summary.errors ? `${summary.errors} 错误` : summary.warns ? `${summary.warns} 警告` : '通过'}
            tone={summary.errors ? 'bad' : summary.warns ? 'warn' : 'ok'}
          />
        </div>

        <div className="topbar-actions">
          <select
            className="preset-select"
            aria-label="示例工程"
            value=""
            onChange={(e) => {
              if (e.target.value) loadPreset(e.target.value);
              e.currentTarget.value = '';
            }}
          >
            <option value="">载入示例…</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id} title={p.description}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="export-menu">
            <span className="muted small">
              {saved === 'ok' ? '已存本地' : saved === 'fail' ? '本地存储不可用' : ''}
            </span>
            <button type="button" className="btn" onClick={exportSvg}>
              导出 SVG
            </button>
            <details className="dropdown">
              <summary className="btn btn-ghost">导出 CSV</summary>
              <div className="dropdown-panel">
                <button type="button" onClick={() => exportOne('segments')}>
                  分段水力计算表
                </button>
                <button type="button" onClick={() => exportOne('emitters')}>
                  灌水器清单
                </button>
                <button type="button" onClick={() => exportOne('conflicts')}>
                  穿作业道清单
                </button>
                <button type="button" onClick={() => exportOne('bom')}>
                  材料表
                </button>
              </div>
            </details>
            <button type="button" className="btn btn-ghost" onClick={hardReset} title="清除本地存档并恢复默认">
              重置
            </button>
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="side side-left" aria-label="参数">
          <div className="side-scroll">
            <ParamsPanel
              params={doc.params}
              seed={doc.seed}
              onChange={patchParams}
              onSeed={setSeed}
              onRegenerate={regenerate}
              onResetOverrides={resetOverrides}
              overrideCount={overrides}
              fingerprint={solution.fingerprint}
            />
          </div>
        </aside>

        <section className="stage" aria-label="管网图">
          <div className="stage-toolbar">
            <div className="view-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={render.showBeds}
                  onChange={(e) => setRender({ ...render, showBeds: e.target.checked })}
                />
                苗床/作业道
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={render.showZones}
                  onChange={(e) => setRender({ ...render, showZones: e.target.checked })}
                />
                压力标注
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={render.showLabels}
                  onChange={(e) => setRender({ ...render, showLabels: e.target.checked })}
                />
                编号/管径
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={render.showRanges}
                  onChange={(e) => setRender({ ...render, showRanges: e.target.checked })}
                />
                喷头射程
              </label>
            </div>
            <div className="view-actions">
              {selectedLayoutBranch ? (
                <span className="selection-chip">
                  Z{selectedLayoutBranch.index + 1}
                  {selectedLayoutBranch.pinned ? ' · 手动定位' : ''}
                  {selectedLayoutBranch.spacingOverridden
                    ? ` · 滴头间距 ${selectedLayoutBranch.dripSpacingM.toFixed(2)} m`
                    : ''}
                  <button type="button" onClick={() => setSelectedBranch(null)} aria-label="取消选择">
                    ×
                  </button>
                </span>
              ) : null}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFitToken((t) => t + 1)}>
                缩放复位
              </button>
            </div>
          </div>

          <Canvas
            solution={solution}
            selectedBranch={selectedBranch}
            highlightEmitter={highlightEmitter}
            render={render}

            sprinklerRadiusM={doc.params.sprinkler.radiusM}
            onSelectBranch={(i) => {
              setSelectedBranch(i);
              if (i !== null) setTab('branch');
            }}
            onSelectEmitter={(bi, ei) => setHighlightEmitter({ branchIndex: bi, emitterIndex: ei })}
            onMoveBranch={moveBranch}
            onSetBranchSpacing={setBranchSpacing}
            onHandle={(h) => {
              handleRef.current = h;
            }}
            fitToken={fitToken}
          />

          <PressureProfile solution={solution} />

          <div className="stage-footer">
            <Legend pipeM={solution.totals.pipeM} />
            <div className="pressure-strip">
              <div className="pressure-strip-head">
                <span>首部 → 棚尾 压力分段</span>
                <span className="muted small">每段末端挂压力标注 · 共 {activeZones.length} 段</span>
              </div>
              <div className="pressure-bar">
                {activeZones.map((z) => {
                  const max = Math.max(...activeZones.map((x) => x.startKPa), 1);
                  const min = Math.min(...activeZones.map((x) => x.endKPa), 0);
                  const t = (z.startKPa - min) / Math.max(1e-6, max - min);
                  return (
                    <span
                      key={z.index}
                      className="pressure-cell"
                      style={{
                        flexGrow: Math.max(0.4, z.lengthM),
                        background: `hsl(${198 + t * 14} 46% ${72 - t * 26}%)`,
                      }}
                      title={`${z.uFrom.toFixed(1)}–${z.uTo.toFixed(1)} m · DN${pipe(z.diameterId).dn} · 末 ${z.endKPa.toFixed(0)} kPa · ${z.branchCount} 条支管`}
                    >
                      <b>{z.endKPa.toFixed(0)}</b>
                      <i>kPa</i>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <aside className="side side-right" aria-label="检查">
          <nav className="tabs" role="tablist">
            {(
              [
                ['branch', `支管${selectedBranch !== null ? ' Z' + (selectedBranch + 1) : ''}`],
                ['warnings', `校核 ${summary.errors + summary.warns || ''}`.trim()],
                ['check', `穿道清单 ${solution.conflicts.length || ''}`.trim()],
                ['params', '工程'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`tab${tab === id ? ' is-active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="side-scroll side-scroll-right">
            {tab === 'branch' ? (
              <BranchInspector
                solution={solution}
                selectedBranch={selectedBranch}
                onSelect={(i) => setSelectedBranch(i)}
                onSetSpacing={setBranchSpacing}
                onClearSpacing={clearBranchSpacing}
                onClearPosition={clearBranchPosition}
              />
            ) : null}

            {tab === 'warnings' ? (
              <WarningList
                solution={solution}
                onFocusBranch={(i) => {
                  setSelectedBranch(i);
                  setTab('branch');
                }}
                onFocusPoint={() => {
                  setFitToken((t) => t + 1);
                }}
                onFixConflict={fixConflict}
              />
            ) : null}

            {tab === 'check' ? (
              <div className="check-panel">
                <h3>支管穿作业道</h3>
                <p className="hint">
                  作业道是整跨横向的通行面,支管一旦落在作业道宽度内,整条支管就压在人行面上,必须移开或改道。
                </p>
                <ConflictTable
                  solution={solution}
                  onFix={fixConflict}
                  onFocus={(i) => {
                    setSelectedBranch(i);
                    setTab('branch');
                  }}
                />
                <div className="divider" />
                <h4>作业道一览</h4>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>起 m</th>
                        <th>止 m</th>
                        <th>宽 m</th>
                      </tr>
                    </thead>
                    <tbody>
                      {solution.layout.aisles.map((a, i) => {
                        const hit = solution.conflicts.filter((c) => c.aisleIndex === i).length;
                        return (
                          <tr key={i} className={hit ? 'row-warn' : ''}>
                            <td>{i + 1}</td>
                            <td>{a.u0.toFixed(2)}</td>
                            <td>{a.u1.toFixed(2)}</td>
                            <td>{(a.u1 - a.u0).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === 'params' ? (
              <div className="project-panel">
                <h3>工程</h3>
                <label className="field">
                  <span className="field-label">工程名称</span>
                  <span className="field-input">
                    <input
                      type="text"
                      value={doc.name}
                      onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value }))}
                    />
                  </span>
                </label>
                <NumberField
                  label="布置种子"
                  value={doc.seed}
                  min={1}
                  max={2_147_483_647}
                  step={1}
                  digits={0}
                  onChange={setSeed}
                  hint="同一参数 + 同一种子 ⇔ 同一布置"
                />
                <dl className="facts">
                  <Fact k="布置指纹" v={solution.fingerprint} mono />
                  <Fact k="支管间距" v={`${doc.params.branch.spacingM.toFixed(2)} m`} />
                  <Fact k="主管" v={`DN${pipe(doc.params.main.headDiameterId).dn}${doc.params.main.autoTaper ? ' + 自动变径' : ''}`} />
                  <Fact k="压力段" v={`${solution.main.zones.length} 段`} />
                  <Fact k="手动修改" v={`${overrides} 处`} />
                  <Fact k="总流量" v={`${(solution.totals.flowLph / 1000).toFixed(2)} m³/h`} />
                  <Fact k="需要水源" v={`${solution.main.requiredSourceKPa.toFixed(0)} kPa`} />
                  <Fact k="现有水源" v={`${doc.params.hydraulic.sourceKPa} kPa`} />
                </dl>
                <div className="divider" />
                <h4>管材用量</h4>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>管径</th>
                        <th>长度 m</th>
                        <th>用途</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(solution.totals.pipeM)
                        .filter(([, m]) => m > 0.05)
                        .sort((a, b) => pipe(b[0]).dn - pipe(a[0]).dn)
                        .map(([id, m]) => (
                          <tr key={id}>
                            <td>DN{pipe(id).dn}</td>
                            <td>{m.toFixed(1)}</td>
                            <td>{pipe(id).use}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </main>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
  title?: string;
}) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`} title={title}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="fact">
      <dt>{k}</dt>
      <dd className={mono ? 'mono' : undefined}>{v}</dd>
    </div>
  );
}

const slug = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || 'irrigation';
