import { createMemo, createSignal, For, Show } from 'solid-js';
import type { DesignParams } from '../lib/design';
import { deleteSnapshot, loadSnapshot, saveSnapshot, studioState } from '../state/store';

interface CompareModalProps {
  open: boolean;
  onClose: () => void;
}

const PARAM_LABELS: Record<keyof DesignParams, string> = {
  module: '模数',
  pressureAngle: '压力角',
  gearCount: '齿轮数量',
  baseTeeth: '基础齿数',
  spacing: '整组/栅格间距',
  thickness: '厚度',
  profile: '齿形',
  boreDiameter: '轴孔直径',
  gridThickness: '栅格条厚度',
  gridHeight: '栅格高度',
  gridClearance: '栅格净距',
  seed: '种子',
  batchCount: '批量套数',
};

export function CompareModal(props: CompareModalProps) {
  const [aId, setAId] = createSignal<string>('');
  const [bId, setBId] = createSignal<string>('');

  const snapshotA = createMemo(
    () => studioState.snapshots.find((s) => s.id === aId()) ?? studioState.snapshots[1] ?? studioState.snapshots[0],
  );
  const snapshotB = createMemo(
    () => studioState.snapshots.find((s) => s.id === bId()) ?? studioState.snapshots[0],
  );

  const paramDiffs = createMemo(() => {
    const a = snapshotA();
    const b = snapshotB();
    if (!a || !b) return [];
    return (Object.keys(PARAM_LABELS) as Array<keyof DesignParams>)
      .map((key) => ({
        key,
        label: PARAM_LABELS[key],
        a: String(a.params[key]),
        b: String(b.params[key]),
        changed: a.params[key] !== b.params[key],
      }))
      .filter((row) => row.changed);
  });

  const overrideDiffs = createMemo(() => {
    const a = snapshotA();
    const b = snapshotB();
    if (!a || !b) return [];
    const ids = new Set([...Object.keys(a.overrides), ...Object.keys(b.overrides)]);
    return [...ids]
      .sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))
      .map((id) => ({
        id,
        a: a.overrides[id] == null ? `基础 z${a.params.baseTeeth}` : `z${a.overrides[id]}`,
        b: b.overrides[id] == null ? `基础 z${b.params.baseTeeth}` : `z${b.overrides[id]}`,
        changed: a.overrides[id] !== b.overrides[id],
      }));
  });

  return (
    <Show when={props.open}>
      <div class="modal-backdrop" onClick={props.onClose}>
        <section class="modal" role="dialog" aria-modal="true" aria-label="方案版本比对" onClick={(e) => e.stopPropagation()}>
          <header class="modal-header">
            <div>
              <h2>两版方案比对</h2>
              <p>换种子前保存 A，换种子重生成后保存 B；指纹不同即派生件或参数不同。</p>
            </div>
            <button type="button" class="icon-button" onClick={props.onClose}>
              ✕
            </button>
          </header>

          <Show
            when={studioState.snapshots.length >= 2}
            fallback={
              <div class="modal-body">
                <div class="empty-state">
                  <h3>还需要至少两个方案快照</h3>
                  <p>当前已有 {studioState.snapshots.length} 个。先保存当前方案，换种子/调参数后再保存第二版。</p>
                  <button type="button" class="button button-primary" onClick={() => saveSnapshot()}>
                    保存当前方案
                  </button>
                </div>
                <Show when={studioState.snapshots.length === 1}>
                  <SnapshotList onLoad={props.onClose} />
                </Show>
              </div>
            }
          >
            <div class="modal-body compare-body">
              <div class="compare-selects">
                <label>
                  <span class="micro-label">基准 A</span>
                  <select
                    class="select-input"
                    value={snapshotA()?.id}
                    onInput={(e) => setAId(e.currentTarget.value)}
                  >
                    <For each={studioState.snapshots}>
                      {(snapshot) => <option value={snapshot.id}>{snapshot.name}</option>}
                    </For>
                  </select>
                </label>
                <span class="compare-arrow">⇄</span>
                <label>
                  <span class="micro-label">对比 B</span>
                  <select
                    class="select-input"
                    value={snapshotB()?.id}
                    onInput={(e) => setBId(e.currentTarget.value)}
                  >
                    <For each={studioState.snapshots}>
                      {(snapshot) => <option value={snapshot.id}>{snapshot.name}</option>}
                    </For>
                  </select>
                </label>
              </div>

              <div class="compare-fingerprints">
                <div>
                  <span class="micro-label">A 指纹 / 种子</span>
                  <code>{snapshotA()?.fingerprint}</code>
                  <small>{snapshotA()?.seedCode}</small>
                </div>
                <div>
                  <span class="micro-label">B 指纹 / 种子</span>
                  <code>{snapshotB()?.fingerprint}</code>
                  <small>{snapshotB()?.seedCode}</small>
                </div>
              </div>

              <section>
                <h3>参数差异（{paramDiffs().length}）</h3>
                <Show when={paramDiffs().length > 0} fallback={<p class="no-diff">主参数完全一致；若指纹不同，请检查手调齿数覆盖。</p>}>
                  <table class="diff-table">
                    <thead><tr><th>参数</th><th>A</th><th>B</th></tr></thead>
                    <tbody>
                      <For each={paramDiffs()}>
                        {(diff) => (
                          <tr>
                            <td>{diff.label}</td>
                            <td>{diff.a}</td>
                            <td class="diff-changed">{diff.b}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>
              </section>

              <section>
                <h3>手调齿数差异</h3>
                <table class="diff-table">
                  <thead><tr><th>件号</th><th>A</th><th>B</th></tr></thead>
                  <tbody>
                    <For each={overrideDiffs()}>
                      {(diff) => (
                        <tr classList={{ 'diff-row-changed': diff.changed }}>
                          <td>{diff.id}</td>
                          <td>{diff.a}</td>
                          <td class={diff.changed ? 'diff-changed' : ''}>{diff.b}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </section>

              <SnapshotList onLoad={props.onClose} />
            </div>
          </Show>
        </section>
      </div>
    </Show>
  );
}

function SnapshotList(props: { onLoad: () => void }) {
  return (
    <section class="snapshot-list-section">
      <h3>已存方案</h3>
      <div class="snapshot-list">
        <For each={studioState.snapshots}>
          {(snapshot) => (
            <article class="snapshot-row">
              <div>
                <strong>{snapshot.name}</strong>
                <small>{snapshot.savedAt} · {snapshot.fingerprint} · BOM 总量 {snapshot.totalBomQty}</small>
              </div>
              <div class="action-row compact">
                <button
                  type="button"
                  class="button button-soft"
                  onClick={() => {
                    loadSnapshot(snapshot.id);
                    props.onLoad();
                  }}
                >
                  载入
                </button>
                <button type="button" class="button button-ghost" onClick={() => deleteSnapshot(snapshot.id)}>
                  删除
                </button>
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}
