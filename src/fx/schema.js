// 特效参数 Schema、机场材质预设与联动规则。
// 该文件不依赖 Vue / Three，可同时被界面、导出脚本和科目配置工具引用。

export const PACKAGE_FORMAT = 'flight-fx-package'
export const PACKAGE_VERSION = 1

export const SURFACE_PRESETS = {
  concrete: {
    id: 'concrete',
    label: '水泥混凝土',
    runwayColor: '#777b78',
    shoulderColor: '#646861',
    dustColor: '#c7c0b2',
    dust: {
      concentration: 0.62,
      diffusion: 0.72,
      riseSpeed: 1.05,
      coarseness: 0.48,
      particleCount: 1900,
      ringRadius: 6.2,
      outwardSpeed: 4.6,
      lifetime: 2.6
    }
  },
  asphalt: {
    id: 'asphalt',
    label: '沥青跑道',
    runwayColor: '#343a3f',
    shoulderColor: '#4d5354',
    dustColor: '#8d8a82',
    dust: {
      concentration: 0.52,
      diffusion: 0.62,
      riseSpeed: 0.85,
      coarseness: 0.4,
      particleCount: 1600,
      ringRadius: 5.6,
      outwardSpeed: 4.1,
      lifetime: 2.25
    }
  },
  gravel: {
    id: 'gravel',
    label: '砂石/碎石道面',
    runwayColor: '#8a765c',
    shoulderColor: '#71624d',
    dustColor: '#d2b184',
    dust: {
      concentration: 0.9,
      diffusion: 1.18,
      riseSpeed: 1.55,
      coarseness: 0.82,
      particleCount: 3000,
      ringRadius: 8.4,
      outwardSpeed: 6.4,
      lifetime: 3.4
    }
  },
  dirt: {
    id: 'dirt',
    label: '土质/草地机场',
    runwayColor: '#766342',
    shoulderColor: '#59633e',
    dustColor: '#b98d5c',
    dust: {
      concentration: 1,
      diffusion: 1.35,
      riseSpeed: 1.85,
      coarseness: 0.92,
      particleCount: 3600,
      ringRadius: 9.2,
      outwardSpeed: 6.9,
      lifetime: 3.8
    }
  },
  snow: {
    id: 'snow',
    label: '压实积雪',
    runwayColor: '#d7e0e4',
    shoulderColor: '#b9c5c8',
    dustColor: '#f4fbff',
    dust: {
      concentration: 0.82,
      diffusion: 0.95,
      riseSpeed: 1.25,
      coarseness: 0.58,
      particleCount: 2600,
      ringRadius: 7.4,
      outwardSpeed: 5.4,
      lifetime: 2.9
    }
  }
}

export function createDefaultParameters() {
  return {
    schema: PACKAGE_FORMAT,
    packageVersion: PACKAGE_VERSION,
    meta: {
      name: '起飞接地科目 · 尾流扬尘特效',
      subjectCode: 'TAKEOFF_LANDING',
      variant: 'default',
      author: '',
      note: '发动机尾流与接地扬尘参数包；同一 seed + actionProfile 必须回放同一套确定性烟效。'
    },
    seed: 20261126,
    surfaceId: 'concrete',
    controlMode: 'sequence', // sequence | manual
    actionProfile: 'takeoff', // takeoff | landing | touch_go
    playing: true,
    timeScale: 1,
    flight: {
      // 手动模式下使用；序列模式下由 FlightDirector 回写。
      throttle: 0,
      ratedThrustKn: 160,
      airspeed: 0,
      altitude: 0,
      gearDown: true,
      weightOnWheels: true,
      headingDeg: 0
    },
    wake: {
      enabled: true,
      // length/particleCount 是“满推力基准值”。实时长度还会乘油门动力系数。
      length: 28,
      particleCount: 2600,
      concentration: 0.68,
      diffusion: 0.82,
      riseSpeed: 0.55,
      coarseness: 0.58,
      turbulence: 0.52,
      lifetimeScale: 1,
      opacity: 0.24
    },
    dust: {
      enabled: true,
      particleCount: 2200,
      concentration: 0.72,
      diffusion: 0.9,
      riseSpeed: 1.25,
      coarseness: 0.66,
      ringRadius: 6.4,
      outwardSpeed: 4.8,
      lifetime: 2.8,
      opacity: 0.38
    },
    simulation: {
      fixedStep: 1 / 60,
      collision: true,
      showColliders: false,
      followCamera: true
    },
    // 被手调过的联动字段保持 true；发动机推力变化不得覆盖这些基准值。
    locks: {
      'wake.length': false,
      'wake.particleCount': false
    }
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function suggestWakeLinkage(ratedThrustKn) {
  const t = clamp((ratedThrustKn - 90) / (280 - 90), 0, 1)
  return {
    // 160kN 恰好校准到出厂手调基准：28m、2600 粒。
    'wake.length': Math.round(18 + t * 27),
    'wake.particleCount': Math.round((1600 + t * 2700) / 100) * 100
  }
}

export function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

export function setPath(obj, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  const target = keys.reduce((acc, key) => {
    if (acc[key] == null || typeof acc[key] !== 'object') acc[key] = {}
    return acc[key]
  }, obj)
  target[last] = value
}

/**
 * 修改发动机额定推力。
 * 未手调/未锁定的联动字段跟随建议值；一旦教员手调过，基准值原样保留。
 */
export function applyRatedThrust(params, thrustKn) {
  params.flight.ratedThrustKn = Math.round(thrustKn)
  const suggestions = suggestWakeLinkage(params.flight.ratedThrustKn)
  for (const [path, value] of Object.entries(suggestions)) {
    if (!params.locks[path]) setPath(params, path, value)
  }
  return suggestions
}

export function markManualField(params, path) {
  if (Object.prototype.hasOwnProperty.call(params.locks, path)) {
    params.locks[path] = true
  }
}

export function resetLinkedField(params, path) {
  params.locks[path] = false
  const suggestions = suggestWakeLinkage(params.flight.ratedThrustKn)
  if (suggestions[path] !== undefined) setPath(params, path, suggestions[path])
}

export function resetAllLinkedFields(params) {
  for (const path of Object.keys(params.locks)) params.locks[path] = false
  applyRatedThrust(params, params.flight.ratedThrustKn)
}

export function applySurfacePreset(params, surfaceId) {
  const preset = SURFACE_PRESETS[surfaceId]
  if (!preset) return
  params.surfaceId = surfaceId
  Object.assign(params.dust, preset.dust)
}

export function buildPackage(params, extras = {}) {
  const cloned = JSON.parse(JSON.stringify(params))
  const surface = SURFACE_PRESETS[params.surfaceId] || SURFACE_PRESETS.concrete
  const suggestions = suggestWakeLinkage(params.flight.ratedThrustKn)

  return {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    subject: {
      code: params.meta.subjectCode || 'TAKEOFF_LANDING',
      name: params.meta.name,
      triggerEvents: ['flight.touchdown', 'flight.liftoff', 'flight.gear_changed'],
      attachPoint: 'aircraft.root'
    },
    deterministic: {
      seed: params.seed >>> 0,
      fixedStep: params.simulation.fixedStep,
      rng: 'mulberry32',
      rule: 'same seed + actionProfile + parameters => same particle stream'
    },
    action: {
      profile: params.actionProfile,
      controlMode: params.controlMode,
      timeScale: params.timeScale
    },
    surface: {
      id: surface.id,
      label: surface.label,
      dustColor: surface.dustColor
    },
    parameters: cloned,
    linkage: {
      source: 'flight.ratedThrustKn',
      manualLocks: { ...params.locks },
      thrustSuggestions: suggestions,
      runtimeThrottleFormula:
        'power01 = idleFloor + (1-idleFloor)*throttle; actualWakeLength = wake.length * (0.18 + 0.82*power01); concentration scales emission and alpha.',
      preserveRule:
        'Locked/manual wake.length and wake.particleCount are baseline values and must not be overwritten by thrust changes.'
    },
    bindings: {
      throttle: 'flight.throttle',
      ratedThrustKn: 'flight.ratedThrustKn',
      airspeedMps: 'flight.airspeed',
      altitudeM: 'flight.altitude',
      gearDown: 'flight.gearDown',
      weightOnWheels: 'flight.weightOnWheels',
      touchdownEvent: 'flight.touchdown',
      liftoffEvent: 'flight.liftoff'
    },
    effects: [
      {
        id: 'engine-wake',
        type: 'gpu-point-smoke',
        anchors: ['engine_L_exhaust', 'engine_R_exhaust'],
        emitWhen: 'wake.enabled && throttle > 0.01',
        update: 'world-space particles, seeded turbulence, AABB obstacle avoidance'
      },
      {
        id: 'ground-dust-ring',
        type: 'gpu-point-smoke-burst',
        anchors: ['gear_nose_contact', 'gear_main_L_contact', 'gear_main_R_contact'],
        emitWhen: 'touchdown rising edge OR (dust.enabled && gearDown && weightOnWheels && airspeed > 1)',
        stopWhen: 'weightOnWheels === false'
      }
    ],
    collision: {
      mode: 'expanded-aabb-slide-and-rise',
      colliderSource: 'scene.landscape.buildings',
      noClip: true
    },
    ...extras
  }
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function validatePackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return false
  if (pkg.format !== PACKAGE_FORMAT) return false
  if (!pkg.parameters || typeof pkg.parameters !== 'object') return false
  return true
}
