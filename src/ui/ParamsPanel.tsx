import { DRIPS, SPRINKLERS, PIPES, HEADWORKS, pipe } from '../core/catalogue';
import { NumberField, SelectField, Toggle } from './Field';
import type { ProjectParams } from '../core/types';

export interface Props {
  params: ProjectParams;
  seed: number;
  onChange: (mut: (p: ProjectParams) => void) => void;
  onSeed: (seed: number) => void;
  onRegenerate: () => void;
  onResetOverrides: () => void;
  overrideCount: number;
  fingerprint: string;
}

export function ParamsPanel({
  params,
  seed,
  onChange,
  onSeed,
  onRegenerate,
  onResetOverrides,
  overrideCount,
  fingerprint,
}: Props) {
  const set = <K extends keyof ProjectParams>(group: K, patch: Partial<ProjectParams[K]>) =>
    onChange((p) => {
      Object.assign(p[group], patch);
    });
  void set;

  const dripSpec = DRIPS.find((d) => d.id === params.drip.specId) ?? DRIPS[0];

  return (
    <div className="params">
      <section className="param-group">
        <h4>棚体</h4>
        <NumberField
          label="棚长"
          unit="m"
          value={params.greenhouse.lengthM}
          min={8}
          max={200}
          step={0.5}
          onChange={(v) => set('greenhouse', { lengthM: v })}
        />
        <NumberField
          label="棚宽(跨度)"
          unit="m"
          value={params.greenhouse.spanM}
          min={4}
          max={40}
          step={0.5}
          onChange={(v) => set('greenhouse', { spanM: v })}
        />
        <SelectField
          label="主管走向"
          value={params.greenhouse.mainAxis}
          options={[
            { value: 'length', label: '沿棚长(纵向)' },
            { value: 'span', label: '沿跨度(横向)' },
          ]}
          onChange={(v) => set('greenhouse', { mainAxis: v })}
          hint="主管沿棚体纵向布到棚尾;支管垂直于主管沿苗床走向"
        />
        <NumberField
          label="首部距端墙"
          unit="m"
          value={params.greenhouse.headMarginM}
          min={0.2}
          max={20}
          step={0.1}
          onChange={(v) => set('greenhouse', { headMarginM: v })}
        />
        <NumberField
          label="主管距侧墙"
          unit="m"
          value={params.greenhouse.mainOffsetM}
          min={0.2}
          max={10}
          step={0.1}
          onChange={(v) => set('greenhouse', { mainOffsetM: v })}
        />
      </section>

      <section className="param-group">
        <h4>主管</h4>
        <SelectField
          label="首部主管管径"
          value={params.main.headDiameterId}
          options={PIPES.map((p) => ({ value: p.id, label: `DN${p.dn} (${p.innerMm} mm)` }))}
          onChange={(v) => set('main', { headDiameterId: v })}
          hint="下游各段按流量自动变径,不超过此管径"
        />
        <Toggle
          label="沿程自动变径"
          checked={params.main.autoTaper}
          onChange={(v) => set('main', { autoTaper: v })}
          hint="流量减小后自动降一档管径;关闭则整条主管同一管径"
        />
        <p className="hint small">
          当前分段:{' '}
          {Array.from(new Set(params.main.autoTaper ? [] : [params.main.headDiameterId].map((i) => `DN${pipe(i).dn}`))).join(' / ') || '自动'}
        </p>
      </section>

      <section className="param-group">
        <h4>支管</h4>
        <NumberField
          label="支管间距"
          unit="m"
          value={params.branch.spacingM}
          min={0.8}
          max={20}
          step={0.1}
          onChange={(v) => set('branch', { spacingM: v })}
        />
        <NumberField
          label="首支管偏移"
          unit="m"
          value={params.branch.firstOffsetM}
          min={0.2}
          max={30}
          step={0.1}
          onChange={(v) => set('branch', { firstOffsetM: v })}
        />
        <SelectField
          label="支管管径"
          value={params.branch.diameterId}
          options={PIPES.filter((p) => p.dn <= 63).map((p) => ({
            value: p.id,
            label: `DN${p.dn} (${p.innerMm} mm)`,
          }))}
          onChange={(v) => set('branch', { diameterId: v })}
        />
        <NumberField
          label="喷灌段长"
          unit="m"
          value={params.branch.sprinklerZoneM}
          min={0}
          max={40}
          step={0.1}
          onChange={(v) => set('branch', { sprinklerZoneM: v })}
          hint="支管末端改为喷头的长度;0 = 全条滴灌"
        />
        <Toggle
          label="支管沿苗床中线"
          checked={params.branch.followBeds}
          onChange={(v) => set('branch', { followBeds: v })}
          hint="把每条支管吸附到最近的苗床中线,让滴灌带压在作物行上"
        />
        <Toggle
          label="支管避让作业道"
          checked={params.branch.avoidAisles}
          onChange={(v) => set('branch', { avoidAisles: v })}
          hint="生成时把落进作业道的支管推到作业道边;关闭则保留并红框标出"
        />
      </section>

      <section className="param-group">
        <h4>滴灌</h4>
        <SelectField
          label="滴头型号"
          value={params.drip.specId}
          options={DRIPS.map((d) => ({ value: d.id, label: d.name }))}
          onChange={(v) => {
            const spec = DRIPS.find((d) => d.id === v) ?? DRIPS[0];
            set('drip', {
              specId: spec.id,
              qnLph: spec.qnLph,
              hNomM: spec.hNomM,
              exponent: spec.exponent,
              cv: spec.cv,
            });
          }}
        />
        <NumberField
          label="滴头流量"
          unit="L/h"
          value={params.drip.qnLph}
          min={0.3}
          max={20}
          step={0.1}
          onChange={(v) => set('drip', { qnLph: v })}
        />
        <NumberField
          label="工作压力"
          unit="m"
          value={params.drip.hNomM}
          min={2}
          max={40}
          step={0.5}
          onChange={(v) => set('drip', { hNomM: v })}
        />
        <NumberField
          label="滴头间距"
          unit="m"
          value={params.drip.spacingM}
          min={0.05}
          max={2}
          step={0.05}
          onChange={(v) => set('drip', { spacingM: v })}
        />
        <NumberField
          label="首滴头距"
          unit="m"
          value={params.drip.firstOffsetM}
          min={0.05}
          max={2}
          step={0.05}
          onChange={(v) => set('drip', { firstOffsetM: v })}
        />
        <NumberField
          label="排布抖动"
          unit="mm"
          value={params.drip.jitterMm}
          min={0}
          max={40}
          step={1}
          digits={0}
          onChange={(v) => set('drip', { jitterMm: v })}
          hint={`由种子产生的确定性扰动,±${params.drip.jitterMm} mm;0 = 完全等距`}
        />
        <p className="hint small">
          {dripSpec.name} · 流态指数 x={dripSpec.exponent} · Cv={dripSpec.cv}
        </p>
      </section>

      <section className="param-group">
        <h4>喷灌</h4>
        <SelectField
          label="喷头型号"
          value={params.sprinkler.specId}
          options={SPRINKLERS.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => {
            const spec = SPRINKLERS.find((s) => s.id === v) ?? SPRINKLERS[0];
            set('sprinkler', {
              specId: spec.id,
              qLph: spec.qLph,
              hNomM: spec.hNomM,
              exponent: spec.exponent,
              radiusM: spec.radiusM,
            });
          }}
        />
        <NumberField
          label="喷头流量"
          unit="L/h"
          value={params.sprinkler.qLph}
          min={20}
          max={2000}
          step={10}
          digits={0}
          onChange={(v) => set('sprinkler', { qLph: v })}
        />
        <NumberField
          label="射程"
          unit="m"
          value={params.sprinkler.radiusM}
          min={0.5}
          max={12}
          step={0.1}
          onChange={(v) => set('sprinkler', { radiusM: v })}
        />
        <NumberField
          label="间距系数"
          value={params.sprinkler.spacingFactor}
          min={0.8}
          max={1.6}
          step={0.05}
          onChange={(v) => set('sprinkler', { spacingFactor: v })}
          hint="喷头间距 = 射程 × 系数;1.2 为常规全圆重叠布法"
        />
        <p className="hint small">
          实际喷头间距 {(params.sprinkler.radiusM * params.sprinkler.spacingFactor).toFixed(2)} m · 覆盖半径{' '}
          {params.sprinkler.radiusM} m
        </p>
      </section>

      <section className="param-group">
        <h4>苗床与作业道</h4>
        <NumberField
          label="苗床宽"
          unit="m"
          value={params.beds.widthM}
          min={0.4}
          max={4}
          step={0.05}
          onChange={(v) => set('beds', { widthM: v })}
        />
        <NumberField
          label="苗床净距"
          unit="m"
          value={params.beds.gapM}
          min={0.2}
          max={3}
          step={0.05}
          onChange={(v) => set('beds', { gapM: v })}
        />
        <NumberField
          label="每 N 床设作业道"
          value={params.beds.bedsPerBlock}
          min={1}
          max={12}
          step={1}
          digits={0}
          onChange={(v) => set('beds', { bedsPerBlock: v })}
        />
        <NumberField
          label="作业道宽"
          unit="m"
          value={params.beds.aisleWidthM}
          min={0.5}
          max={4}
          step={0.1}
          onChange={(v) => set('beds', { aisleWidthM: v })}
        />
      </section>

      <section className="param-group">
        <h4>水力</h4>
        <NumberField
          label="水源压力"
          unit="kPa"
          value={params.hydraulic.sourceKPa}
          min={40}
          max={600}
          step={5}
          digits={0}
          onChange={(v) => set('hydraulic', { sourceKPa: v })}
        />
        <NumberField
          label="允许出流偏差"
          unit="%"
          value={params.hydraulic.allowDropPct}
          min={2}
          max={30}
          step={1}
          digits={0}
          onChange={(v) => set('hydraulic', { allowDropPct: v })}
          hint="由 q∝h^x 反算支管允许压降,默认 10%"
        />
        <NumberField
          label="主管允许压降"
          unit="% 工作水头"
          value={params.hydraulic.mainDropPct}
          min={5}
          max={100}
          step={5}
          digits={0}
          onChange={(v) => set('hydraulic', { mainDropPct: v })}
        />
        <NumberField
          label="允许流速"
          unit="m/s"
          value={params.hydraulic.maxVelocity}
          min={0.4}
          max={3}
          step={0.1}
          onChange={(v) => set('hydraulic', { maxVelocity: v })}
        />
        <NumberField
          label="地面坡降"
          unit="‰"
          value={params.hydraulic.slopePermille}
          min={-20}
          max={20}
          step={0.5}
          onChange={(v) => set('hydraulic', { slopePermille: v })}
          hint="正值 = 棚尾更低,水压沿程略增"
        />
        <NumberField
          label="压力分段档距"
          unit="kPa"
          value={params.hydraulic.zoneKPa}
          min={2}
          max={80}
          step={1}
          digits={0}
          onChange={(v) => set('hydraulic', { zoneKPa: v })}
          hint="压力每降一档或管径变化处,划为新的一段并挂压力标注"
        />
      </section>

      <section className="param-group">
        <h4>首部</h4>
        <SelectField
          label="首部形式"
          value={params.headworks.specId}
          options={HEADWORKS.map((h) => ({ value: h.id, label: h.name }))}
          onChange={(v) => {
            const spec = HEADWORKS.find((h) => h.id === v) ?? HEADWORKS[0];
            set('headworks', { specId: spec.id, lossKPa: spec.lossKPa });
          }}
        />
        <NumberField
          label="首部水头损失"
          unit="kPa"
          value={params.headworks.lossKPa}
          min={0}
          max={250}
          step={5}
          digits={0}
          onChange={(v) => set('headworks', { lossKPa: v })}
        />
        <Toggle
          label="含施肥系统"
          checked={params.headworks.fertigation}
          onChange={(v) => set('headworks', { fertigation: v })}
        />
      </section>

      <section className="param-group seed-group">
        <h4>种子与复现</h4>
        <NumberField
          label="布置种子"
          value={seed}
          min={1}
          max={2_147_483_647}
          step={1}
          digits={0}
          onChange={(v) => onSeed(Math.round(v))}
          hint="相同参数 + 相同种子 => 支管与滴头布置完全一致"
        />
        <div className="seed-actions">
          <button type="button" className="btn" onClick={onRegenerate}>
            按种子重生成
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onSeed(Math.floor(Math.random() * 1e8) + 1)}>
            换种子
          </button>
        </div>
        <p className="hint small">
          布置指纹 <code>{fingerprint}</code>
        </p>
        <div className="divider" />
        <p className="hint small">
          手动修改:{overrideCount} 处(支管位置 / 滴头间距)
          {overrideCount > 0 ? '。改管径、改种子后仍会保留。' : ''}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-danger"
          disabled={overrideCount === 0}
          onClick={onResetOverrides}
        >
          清除手动修改
        </button>
      </section>
    </div>
  );
}
