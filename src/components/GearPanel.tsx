import { For, Show } from 'solid-js';
import type { DesignModel } from '../lib/design';
import {
  nudgeGearTeeth,
  resetAllOverrides,
  resetGearOverride,
  selectGear,
  setGearTeeth,
  studioState,
} from '../state/store';

interface GearPanelProps {
  model: DesignModel;
}

export function GearPanel(props: GearPanelProps) {
  const manualCount = () => props.model.gears.filter((gear) => gear.manual).length;

  const demoDenseFix = () => {
    setGearTeeth('G3', 34);
    setGearTeeth('G5', 30);
  };

  return (
    <div class="panel-stack">
      <section class="card">
        <div class="card-title-row">
          <div>
            <h2>局部齿数覆盖</h2>
            <p>点选 3D 齿轮或下方编号；橙色表示手调，改整组间距不会冲掉。</p>
          </div>
          <span class="badge badge-amber">{manualCount()} 个手调</span>
        </div>

        <div class="action-row">
          <button type="button" class="button button-soft" onClick={demoDenseFix}>
            示例：调大 G3 / G5
          </button>
          <button
            type="button"
            class="button button-ghost"
            disabled={manualCount() === 0}
            onClick={resetAllOverrides}
          >
            全部恢复基础齿数
          </button>
        </div>

        <div class="gear-list">
          <For each={props.model.gears}>
            {(gear) => {
              const active = () => studioState.selectedGearId === gear.id;
              return (
                <article class="gear-row" classList={{ active: active(), manual: gear.manual }}>
                  <button
                    type="button"
                    class="gear-row-head"
                    onClick={() => selectGear(active() ? null : gear.id)}
                  >
                    <span class="gear-id">{gear.id}</span>
                    <span class="gear-summary">
                      <strong>z{gear.teeth}</strong>
                      <small>
                        X {gear.position.x} · Y {gear.position.y}
                      </small>
                    </span>
                    <Show when={gear.manual} fallback={<span class="badge badge-blue">跟随基础</span>}>
                      <span class="badge badge-amber">已手调</span>
                    </Show>
                  </button>

                  <div class="gear-edit">
                    <button
                      type="button"
                      class="icon-button"
                      title="减少 2 齿"
                      onClick={() => nudgeGearTeeth(gear.id, -2)}
                    >
                      −2
                    </button>
                    <input
                      class="range-input gear-range"
                      type="range"
                      min={12}
                      max={120}
                      step={1}
                      value={gear.teeth}
                      onInput={(event) => setGearTeeth(gear.id, event.currentTarget.valueAsNumber)}
                    />
                    <input
                      class="number-input gear-number"
                      type="number"
                      min={12}
                      max={120}
                      value={gear.teeth}
                      onInput={(event) => {
                        const value = event.currentTarget.valueAsNumber;
                        if (Number.isFinite(value)) setGearTeeth(gear.id, value);
                      }}
                    />
                    <button
                      type="button"
                      class="icon-button"
                      title="增加 2 齿"
                      onClick={() => nudgeGearTeeth(gear.id, 2)}
                    >
                      +2
                    </button>
                    <button
                      type="button"
                      class="icon-button icon-reset"
                      title="恢复该齿轮跟随整组参数"
                      disabled={!gear.manual}
                      onClick={() => resetGearOverride(gear.id)}
                    >
                      ↺
                    </button>
                  </div>
                </article>
              );
            }}
          </For>
        </div>
      </section>

      <section class="card card-note">
        <h3>状态保留规则</h3>
        <ol class="note-list">
          <li>齿数覆盖按稳定件号 G1…Gn 存在 <code>overrides</code> 表。</li>
          <li>修改 S 只改变派生 X 坐标和栅条排布，不写入任何齿轮齿数。</li>
          <li>修改基础齿数 z₀ 时，未手调齿轮跟随；手调齿轮仍保留自己的 z。</li>
          <li>减少齿轮数量后再增加，原 G 编号覆盖仍可恢复。</li>
        </ol>
      </section>
    </div>
  );
}
