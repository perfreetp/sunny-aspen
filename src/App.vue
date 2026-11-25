<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">FX</div>
        <div>
          <h1>起飞 / 接地特效调校台</h1>
          <p>Vue 3 · three.js · 确定性尾流与地面扬尘 · 科目参数包导出</p>
        </div>
      </div>
      <div class="top-actions">
        <span class="seed-chip">种子 #{{ params.seed }}</span>
        <button type="button" class="btn primary" @click="exportCurrent">打包当前特效</button>
      </div>
      <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onImportFile" />
    </header>

    <main class="workspace">
      <section class="viewport-column">
        <div class="viewport-card">
          <SceneViewport ref="viewportRef" :params="params" @telemetry="telemetry = $event" />

          <div class="hud">
            <div class="hud-title">
              <b>{{ actionTitle }}</b>
              <span>{{ telemetry.surfaceLabel || surfaceLabel }}</span>
            </div>
            <div class="hud-chips">
              <span>{{ telemetry.fps || 60 }} FPS</span>
              <span :class="{ ok: telemetry.gearDown }">起落架 {{ telemetry.gearDown ? '放下' : '收上' }}</span>
              <span :class="{ warn: telemetry.weightOnWheels }">轮载 {{ telemetry.weightOnWheels ? '在地面' : '离地' }}</span>
              <span>碰撞绕流 {{ params.simulation.collision ? '开' : '关' }}</span>
            </div>
          </div>

          <div class="viewport-tip">
            鼠标左键旋转 · 右键平移 · 滚轮缩放；参数修改会在下一个固定仿真步即时生效
          </div>
        </div>
      </section>

      <ControlPanel
        :params="params"
        :telemetry="telemetry"
        @replay="onReplay"
        @burst="() => viewportRef?.burst()"
        @reset-camera="() => viewportRef?.resetCamera()"
        @linked-input="onLinkedInput"
        @thrust-input="onThrustInput"
        @reset-link="onResetLink"
        @reset-all-links="onResetAllLinks"
        @surface-change="onSurfaceChange"
        @random-seed="onRandomSeed"
        @apply-seed="onApplySeed"
        @export-current="exportCurrent"
        @export-materials="exportMaterialBatch"
        @import-click="triggerImport"
        @reset-all="resetAll"
      />
    </main>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import SceneViewport from './components/SceneViewport.vue'
import ControlPanel from './components/ControlPanel.vue'
import {
  applyRatedThrust,
  applySurfacePreset,
  buildPackage,
  createDefaultParameters,
  downloadJson,
  markManualField,
  resetAllLinkedFields,
  resetLinkedField,
  setPath,
  SURFACE_PRESETS,
  validatePackage
} from './fx/schema.js'

const params = reactive(createDefaultParameters())
const telemetry = ref({})
const viewportRef = ref(null)
const fileInput = ref(null)

const surfaceLabel = computed(() => SURFACE_PRESETS[params.surfaceId]?.label || '')
const actionTitle = computed(() => {
  if (params.controlMode === 'manual') return '手动飞行挂参调试'
  return {
    takeoff: '起飞科目 · 发动机尾流',
    landing: '接地科目 · 地面尘环',
    touch_go: '连续起落 · 接地后复飞'
  }[params.actionProfile] || '起飞 / 接地'
})

function onReplay(profile) {
  // 选择/重播科目动作时明确交还脚本控制权，避免停留在 manual 导致动作不播放。
  params.controlMode = 'sequence'
  if (profile) params.actionProfile = profile
  params.playing = true
  viewportRef.value?.replay(params.actionProfile)
}

function onLinkedInput(path, value) {
  setPath(params, path, value)
  markManualField(params, path)
}

function onThrustInput(value) {
  applyRatedThrust(params, value)
}

function onResetLink(path) {
  resetLinkedField(params, path)
}

function onResetAllLinks() {
  resetAllLinkedFields(params)
}

function onSurfaceChange(surfaceId) {
  applySurfacePreset(params, surfaceId)
}

function onRandomSeed() {
  params.seed = Math.floor(Math.random() * 0xffffffff) >>> 0
  params.playing = true
  viewportRef.value?.applySeed()
}

function onApplySeed() {
  params.seed = Number(params.seed) >>> 0
  params.playing = true
  viewportRef.value?.applySeed()
}

function packageFilename(suffix = '') {
  return `flight-fx-TAKEOFF_LANDING-${params.surfaceId}${suffix}-seed${params.seed}.flightfx.json`
}

function exportCurrent() {
  const pkg = buildPackage(params, {
    runtimeSnapshot: telemetry.value,
    handoff: {
      subjectConfigKey: 'effects.takeoffLanding',
      mount: 'registerFlightFxPackage(packageJson)',
      note: '配置人员只需保存此 JSON，并在起飞接地科目事件中绑定 effects 数组。'
    }
  })
  downloadJson(pkg, packageFilename())
}

function exportMaterialBatch() {
  const variants = Object.values(SURFACE_PRESETS).map((preset) => {
    const variantParams = JSON.parse(JSON.stringify(params))
    applySurfacePreset(variantParams, preset.id)
    variantParams.meta.variant = preset.id
    return {
      surfaceId: preset.id,
      surfaceLabel: preset.label,
      filename: packageFilename(`-${preset.id}`),
      package: buildPackage(variantParams, { runtimeSnapshot: telemetry.value })
    }
  })

  const batch = {
    format: 'flight-fx-material-batch',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    sharedSeed: params.seed >>> 0,
    sharedAction: params.actionProfile,
    deterministicRule: '所有材质版本共享 seed 与动作；材质预设只改变扬尘颜色和形态参数。',
    variants
  }
  downloadJson(batch, `flight-fx-material-variants-seed${params.seed}.json`)
}

function triggerImport() {
  fileInput.value?.click()
}

async function onImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const json = JSON.parse(text)
    const pkg = json.format === 'flight-fx-material-batch' ? json.variants?.[0]?.package : json
    if (!validatePackage(pkg)) throw new Error('不是有效的 flight-fx-package 文件')

    const merged = deepMerge(createDefaultParameters(), pkg.parameters)
    replaceReactive(params, merged)
    params.playing = true
    await Promise.resolve()
    viewportRef.value?.replay(params.actionProfile)
  } catch (error) {
    window.alert(`导入失败：${error.message}`)
  }
}

function resetAll() {
  if (!window.confirm('确定恢复全部参数、锁定状态和种子为出厂值吗？')) return
  replaceReactive(params, createDefaultParameters())
  params.playing = true
  viewportRef.value?.replay(params.actionProfile)
}

function replaceReactive(target, source) {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, source)
}

function deepMerge(base, override) {
  if (Array.isArray(base)) return override ?? base
  if (base && typeof base === 'object') {
    const output = { ...base }
    for (const key of Object.keys(override || {})) {
      output[key] = key in base ? deepMerge(base[key], override[key]) : override[key]
    }
    return output
  }
  return override === undefined ? base : override
}
</script>
