import { NumberField, SegmentedControl } from './Fields';
import {
  PARAM_LIMITS,
  PROFILE_LABELS,
  standardCenterSpacing,
  type DesignModel,
  type ToothProfileId,
} from '../lib/design';
import {
  adoptStandardSpacing,
  randomizeSeed,
  resetWorkspace,
  setNumericParam,
  setProfile,
  studioState,
} from '../state/store';

interface ParameterPanelProps {
  model: DesignModel;
}

export function ParameterPanel(props: ParameterPanelProps) {
  const standardSpacing = () => standardCenterSpacing(studioState.params);
  const spacingIsStandard = () => Math.abs(studioState.params.spacing - standardSpacing()) < 0.5;
  const gridOverLimit = () => studioState.params.gridThickness > props.model.grid.thicknessMax;

  return (
    <div class="panel-stack">
      <section class="card">
        <div class="card-title-row">
          <div>
            <h2>① 供应商基础规格</h2>
            <p>模数与压力角来自五金供应商齿轮/齿条样本。</p>
          </div>
          <span class="badge badge-blue">m / α</span>
        </div>

        <div class="grid-2">
          <NumberField
            label="模数 m"
            value={studioState.params.module}
            {...PARAM_LIMITS.module}
            unit="mm"
            hint="常用 1.5 / 2 / 2.5 / 3"
            onChange={(v) => setNumericParam('module', v)}
          />
          <NumberField
            label="压力角 α"
            value={studioState.params.pressureAngle}
            {...PARAM_LIMITS.pressureAngle}
            unit="°"
            onChange={(v) => setNumericParam('pressureAngle', v)}
          />
        </div>

        <SegmentedControl<ToothProfileId>
          label="齿形选择"
          value={studioState.params.profile}
          options={[
            { value: 'involute', label: PROFILE_LABELS.involute, title: '按基圆和渐开线函数近似生成' },
            { value: 'trapezoidal', label: PROFILE_LABELS.trapezoidal, title: '直线齿廓，便于低成本切割' },
            { value: 'arc', label: PROFILE_LABELS.arc, title: '圆弧齿顶，降低啮合冲击' },
          ]}
          onChange={setProfile}
        />
      </section>

      <section class="card">
        <div class="card-title-row">
          <div>
            <h2>② 整组基础参数</h2>
            <p>先给整排传动件一个基准；之后可单独覆盖任意齿轮齿数。</p>
          </div>
          <span class="badge badge-cyan">{studioState.params.gearCount} 件</span>
        </div>

        <div class="grid-2">
          <NumberField
            label="齿轮数量"
            value={studioState.params.gearCount}
            {...PARAM_LIMITS.gearCount}
            unit="个"
            onChange={(v) => setNumericParam('gearCount', v)}
          />
          <NumberField
            label="基础齿数 z₀"
            value={studioState.params.baseTeeth}
            {...PARAM_LIMITS.baseTeeth}
            unit="齿"
            onChange={(v) => setNumericParam('baseTeeth', v)}
          />
        </div>

        <NumberField
          label="整组间距 / 栅格节距 S"
          value={studioState.params.spacing}
          {...PARAM_LIMITS.spacing}
          unit="mm"
          hint={
            spacingIsStandard()
              ? `当前等于标准啮合节距 m×z₀=${standardSpacing()}mm。`
              : `标准啮合节距为 ${standardSpacing()}mm；修改 S 只移动位置，不覆盖手调齿数。`
          }
          onChange={(v) => setNumericParam('spacing', v)}
        />
        <button type="button" class="button button-soft button-block" onClick={adoptStandardSpacing}>
          采用标准啮合间距 {standardSpacing()}mm
        </button>

        <div class="grid-2">
          <NumberField
            label="齿/板厚度"
            value={studioState.params.thickness}
            {...PARAM_LIMITS.thickness}
            unit="mm"
            onChange={(v) => setNumericParam('thickness', v)}
          />
          <NumberField
            label="传动轴孔 Ø"
            value={studioState.params.boreDiameter}
            {...PARAM_LIMITS.boreDiameter}
            unit="mm"
            hint="小齿轮会自动卡在安全轴孔上限"
            onChange={(v) => setNumericParam('boreDiameter', v)}
          />
        </div>
      </section>

      <section class="card">
        <div class="card-title-row">
          <div>
            <h2>③ 外侧栅格遮挡件</h2>
            <p>前后两片，竖条和横条使用同一个间距规则。</p>
          </div>
          <span class="badge" classList={{ 'badge-amber': gridOverLimit(), 'badge-green': !gridOverLimit() }}>
            条厚上限 {props.model.grid.thicknessMax}mm
          </span>
        </div>

        <NumberField
          label="栅格条厚度 t"
          value={studioState.params.gridThickness}
          min={PARAM_LIMITS.gridThickness.min}
          max={props.model.grid.thicknessMax}
          step={1}
          unit="mm"
          warning={gridOverLimit()}
          hint={`依赖规则：t ≤ 0.42S 且 S−t ≥ 12mm；S=${studioState.params.spacing}mm 时上限 ${props.model.grid.thicknessMax}mm。`}
          onChange={(v) => setNumericParam('gridThickness', v)}
        />

        <div class="grid-2">
          <NumberField
            label="栅格高度下限"
            value={studioState.params.gridHeight}
            {...PARAM_LIMITS.gridHeight}
            unit="mm"
            hint={`实际外廓高度 ${props.model.grid.height}mm`}
            onChange={(v) => setNumericParam('gridHeight', v)}
          />
          <NumberField
            label="齿面到栅格净距"
            value={studioState.params.gridClearance}
            {...PARAM_LIMITS.gridClearance}
            unit="mm"
            onChange={(v) => setNumericParam('gridClearance', v)}
          />
        </div>
      </section>

      <section class="card card-seed">
        <div class="card-title-row">
          <div>
            <h2>④ 种子与复现</h2>
            <p>种子只驱动确定性的减重孔排布等派生细节；同参数 + 同种子 + 同手调覆盖必定复现。</p>
          </div>
        </div>

        <div class="seed-row">
          <NumberField
            label="种子 Seed"
            value={studioState.params.seed}
            {...PARAM_LIMITS.seed}
            onChange={(v) => setNumericParam('seed', v)}
          />
          <button type="button" class="button button-primary seed-button" onClick={randomizeSeed}>
            换种子
          </button>
        </div>

        <div class="fingerprint-grid">
          <div>
            <span class="micro-label">复现指纹</span>
            <code class="fingerprint">{props.model.fingerprint}</code>
          </div>
          <div>
            <span class="micro-label">种子编码</span>
            <code class="fingerprint">{props.model.seedCode}</code>
          </div>
        </div>

        <button type="button" class="button button-ghost button-block" onClick={resetWorkspace}>
          恢复示例初始参数
        </button>
      </section>
    </div>
  );
}
