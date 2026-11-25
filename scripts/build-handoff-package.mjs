// 生成交给科目配置人员的静态特效包。
// 运行：npm run package:handoff
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  applySurfacePreset,
  buildPackage,
  createDefaultParameters,
  SURFACE_PRESETS
} from '../src/fx/schema.js'

const outDir = resolve('handoff')
await mkdir(outDir, { recursive: true })

const baseParams = createDefaultParameters()
const basePackage = buildPackage(baseParams, {
  handoff: {
    configKey: 'effects.takeoffLanding',
    fileName: 'flight-takeoff-landing-fx.package.json',
    importExample: `import pkg from './flight-takeoff-landing-fx.package.json' with { type: 'json' }\nsubjectConfig.effects.takeoffLanding = pkg`,
    integration: [
      '将 parameters 合并到特效运行时',
      '把 flight.throttle / ratedThrustKn / gearDown / weightOnWheels 接到真实飞行参数',
      '监听 touchdown / liftoff 事件',
      '同一 seed 下重播 actionProfile 可复现烟效'
    ]
  }
})

const variants = Object.values(SURFACE_PRESETS).map((preset) => {
  const params = createDefaultParameters()
  applySurfacePreset(params, preset.id)
  params.meta.variant = preset.id
  return {
    surfaceId: preset.id,
    surfaceLabel: preset.label,
    file: `flight-takeoff-landing-${preset.id}.package.json`,
    package: buildPackage(params)
  }
})

const batch = {
  format: 'flight-fx-material-batch',
  formatVersion: 1,
  sharedSeed: baseParams.seed,
  sharedAction: baseParams.actionProfile,
  variants
}

const subjectConfigExample = {
  subjectCode: 'TAKEOFF_LANDING',
  title: '起飞、接地科目特效',
  effects: {
    takeoffLanding: {
      enabled: true,
      packageKey: 'flight-fx-package',
      packageFile: './flight-takeoff-landing-fx.package.json',
      materialVariantMap: Object.fromEntries(
        variants.map((v) => [v.surfaceId, `./${v.file}`])
      ),
      bindings: basePackage.bindings,
      events: {
        touchdown: 'GroundDustRing.burst',
        liftoff: 'GroundDustRing.stopContinuousEmission',
        throttleChanged: 'EngineWake.setPower'
      }
    }
  }
}

await writeFile(resolve(outDir, 'flight-takeoff-landing-fx.package.json'), JSON.stringify(basePackage, null, 2), 'utf8')
await writeFile(resolve(outDir, 'material-variants.json'), JSON.stringify(batch, null, 2), 'utf8')
await writeFile(resolve(outDir, 'subject-config.example.json'), JSON.stringify(subjectConfigExample, null, 2), 'utf8')

for (const variant of variants) {
  await writeFile(resolve(outDir, variant.file), JSON.stringify(variant.package, null, 2), 'utf8')
}

console.log(`[handoff] wrote 1 base package, ${variants.length} material variants and subject-config example to ${outDir}`)
