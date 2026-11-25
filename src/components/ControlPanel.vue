<template>
  <aside class="control-panel">
    <section class="panel-block status-block">
      <div class="block-title">
        <span>实时飞行挂参</span>
        <span class="phase-pill">{{ phaseLabel }}</span>
      </div>
      <div class="telemetry-grid">
        <div><b>{{ Math.round(telemetry.airspeed || 0) }}</b><span>空速 m/s</span></div>
        <div><b>{{ (telemetry.altitude || 0).toFixed(1) }}</b><span>高度 m</span></div>
        <div><b>{{ Math.round((telemetry.throttle || 0) * 100) }}%</b><span>油门</span></div>
        <div><b>{{ (telemetry.targetWakeLength || 0).toFixed(1) }}</b><span>实时尾流 m</span></div>
        <div><b>{{ telemetry.wakeActive || 0 }}</b><span>尾流颗粒</span></div>
        <div><b>{{ telemetry.dustActive || 0 }}</b><span>扬尘颗粒</span></div>
      </div>
    </section>

    <details class="panel-block" open>
      <summary>
        <span>1. 起飞 / 接地动作</span>
        <small>固定步长 · 可复现</small>
      </summary>

      <div class="profile-grid">
        <button
          v-for="item in profiles"
          :key="item.id"
          type="button"
          class="profile-btn"
          :class="{ active: params.actionProfile === item.id && params.controlMode === 'sequence' }"
          @click="emit('replay', item.id)"
        >
          <b>{{ item.label }}</b>
          <span>{{ item.desc }}</span>
        </button>
      </div>

      <div class="button-row">
        <button type="button" class="btn primary" @click="emit('replay')">↻ 重播同一套动作</button>
        <button type="button" class="btn" @click="params.playing = !params.playing">
          {{ params.playing ? '⏸ 暂停' : '▶ 继续' }}
        </button>
      </div>
      <div class="button-row">
        <button type="button" class="btn" @click="emit('burst')">💥 手动触发接地扬尘</button>
        <button type="button" class="btn" @click="emit('reset-camera')">🎥 复位镜头</button>
      </div>

      <ParamSlider
        label="油门（拖动即手动接管）"
        :model-value="throttlePreview"
        :min="0"
        :max="1"
        :step="0.01"
        percent
        @update:model-value="onThrottlePreview"
      />

      <label class="switch-row">
        <span>手动挂参调试（关闭动作脚本）</span>
        <input type="checkbox" v-model="manualMode" />
      </label>

      <template v-if="params.controlMode === 'manual'">
        <ParamSlider label="模拟空速" v-model="params.flight.airspeed" :min="0" :max="80" :step="1" unit="m/s" :digits="0" />
        <ParamSlider label="离地高度" v-model="params.flight.altitude" :min="0" :max="60" :step="0.5" unit="m" :digits="1" />
        <label class="switch-row">
          <span>起落架放下</span>
          <input type="checkbox" v-model="params.flight.gearDown" />
        </label>
        <label class="switch-row">
          <span>轮载 / 贴地（WoW）</span>
          <input type="checkbox" v-model="params.flight.weightOnWheels" />
        </label>
      </template>
    </details>

    <details class="panel-block" open>
      <summary>
        <span>2. 发动机与联动保护</span>
        <small>手调值不被推力覆盖</small>
      </summary>
      <ParamSlider
        label="发动机额定推力"
        :model-value="params.flight.ratedThrustKn"
        :min="90"
        :max="280"
        :step="5"
        unit="kN"
        :digits="0"
        @update:model-value="thrustInput"
      />
      <div class="link-note">
        推力只重算未锁定的建议值。拖过“尾流长度 / 颗粒数”后会显示
        <b>🔒 手调保留</b>，再改推力也不会冲掉。
      </div>
      <div class="button-row">
        <button type="button" class="btn subtle" @click="emit('reset-all-links')">全部恢复推力联动</button>
      </div>
    </details>

    <details class="panel-block" open>
      <summary>
        <span>3. 发动机尾流</span>
        <small>喷口向后 · 油门控制浓度/长度</small>
      </summary>

      <label class="switch-row">
        <span>启用尾流</span>
        <input type="checkbox" v-model="params.wake.enabled" />
      </label>

      <ParamSlider
        label="尾流基准长度"
        :model-value="params.wake.length"
        :min="10"
        :max="55"
        :step="1"
        unit="m"
        :digits="0"
        lockable
        :locked="params.locks['wake.length']"
        @update:model-value="linkedInput('wake.length', $event)"
        @reset-link="emit('reset-link', 'wake.length')"
      />
      <ParamSlider
        label="尾流颗粒数上限"
        :model-value="params.wake.particleCount"
        :min="500"
        :max="6000"
        :step="100"
        :digits="0"
        lockable
        :locked="params.locks['wake.particleCount']"
        @update:model-value="linkedInput('wake.particleCount', $event)"
        @reset-link="emit('reset-link', 'wake.particleCount')"
      />

      <div class="subgroup-title">烟雾形态</div>
      <ParamSlider label="浓度" v-model="params.wake.concentration" :min="0" :max="1.5" :step="0.01" percent />
      <ParamSlider label="扩散强度" v-model="params.wake.diffusion" :min="0" :max="2" :step="0.01" />
      <ParamSlider label="上升速度" v-model="params.wake.riseSpeed" :min="0" :max="3" :step="0.05" unit="m/s" />
      <ParamSlider label="颗粒粗细" v-model="params.wake.coarseness" :min="0" :max="1" :step="0.01" percent />

      <div class="subgroup-title">高级</div>
      <ParamSlider label="湍流扰动" v-model="params.wake.turbulence" :min="0" :max="1.5" :step="0.01" />
      <ParamSlider label="寿命缩放" v-model="params.wake.lifetimeScale" :min="0.55" :max="1.8" :step="0.05" unit="×" />
      <ParamSlider label="最大不透明度" v-model="params.wake.opacity" :min="0.05" :max="0.9" :step="0.01" percent />
    </details>

    <details class="panel-block" open>
      <summary>
        <span>4. 地面材质与扬尘</span>
        <small>接地成环 · 离地即停</small>
      </summary>

      <label class="field-label">机场地面材质版本</label>
      <div class="surface-grid">
        <button
          v-for="surface in surfaces"
          :key="surface.id"
          type="button"
          class="surface-btn"
          :class="{ active: params.surfaceId === surface.id }"
          @click="emit('surface-change', surface.id)"
        >
          <span class="color-dot" :style="{ background: surface.runwayColor }"></span>
          {{ surface.label }}
        </button>
      </div>

      <label class="switch-row">
        <span>启用地面扬尘</span>
        <input type="checkbox" v-model="params.dust.enabled" />
      </label>

      <ParamSlider label="扬尘颗粒数上限" v-model="params.dust.particleCount" :min="400" :max="6000" :step="100" :digits="0" />
      <div class="subgroup-title">烟雾形态</div>
      <ParamSlider label="浓度" v-model="params.dust.concentration" :min="0" :max="1.5" :step="0.01" percent />
      <ParamSlider label="扩散强度" v-model="params.dust.diffusion" :min="0" :max="2.2" :step="0.01" />
      <ParamSlider label="上升速度" v-model="params.dust.riseSpeed" :min="0" :max="3" :step="0.05" unit="m/s" />
      <ParamSlider label="颗粒粗细" v-model="params.dust.coarseness" :min="0" :max="1" :step="0.01" percent />

      <div class="subgroup-title">接地环 / 滑跑扬尘</div>
      <ParamSlider label="尘环半径系数" v-model="params.dust.ringRadius" :min="3" :max="13" :step="0.1" unit="m" :digits="1" />
      <ParamSlider label="径向初速度" v-model="params.dust.outwardSpeed" :min="1.5" :max="9" :step="0.1" unit="m/s" :digits="1" />
      <ParamSlider label="颗粒寿命" v-model="params.dust.lifetime" :min="1.2" :max="5" :step="0.1" unit="s" :digits="1" />
      <ParamSlider label="最大不透明度" v-model="params.dust.opacity" :min="0.05" :max="0.95" :step="0.01" percent />
    </details>

    <details class="panel-block">
      <summary>
        <span>5. 种子 / 碰撞 / 打包</span>
        <small>交给科目配置</small>
      </summary>

      <label class="field-label">确定性种子</label>
      <div class="seed-row">
        <input v-model.number="params.seed" type="number" min="0" step="1" />
        <button type="button" class="btn" @click="emit('random-seed')">换种子</button>
        <button type="button" class="btn primary" @click="emit('apply-seed')">应用并回放</button>
      </div>
      <p class="help-text">相同 seed、动作和参数会重置到同一条固定步长粒子流；只有换 seed 才改变随机形态。</p>

      <ParamSlider label="时间缩放" v-model="params.timeScale" :min="0.25" :max="2" :step="0.05" unit="×" />
      <label class="switch-row">
        <span>建筑 AABB 碰撞绕流 / 防穿模</span>
        <input type="checkbox" v-model="params.simulation.collision" />
      </label>
      <label class="switch-row">
        <span>显示碰撞盒</span>
        <input type="checkbox" v-model="params.simulation.showColliders" />
      </label>
      <label class="switch-row">
        <span>镜头跟随飞机</span>
        <input type="checkbox" v-model="params.simulation.followCamera" />
      </label>

      <div class="package-actions">
        <button type="button" class="btn primary block" @click="emit('export-current')">⬇ 导出当前特效参数包</button>
        <button type="button" class="btn block" @click="emit('export-materials')">⬇ 同种子批量导出材质版本</button>
        <button type="button" class="btn block" @click="emit('import-click')">⬆ 导入 .flightfx.json</button>
        <button type="button" class="btn danger-ghost block" @click="emit('reset-all')">恢复出厂参数</button>
      </div>
    </details>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import ParamSlider from './ParamSlider.vue'
import { SURFACE_PRESETS } from '../fx/schema.js'

const props = defineProps({
  params: { type: Object, required: true },
  telemetry: { type: Object, default: () => ({}) }
})

const emit = defineEmits([
  'replay',
  'burst',
  'reset-camera',
  'linked-input',
  'thrust-input',
  'reset-link',
  'reset-all-links',
  'surface-change',
  'random-seed',
  'apply-seed',
  'export-current',
  'export-materials',
  'import-click',
  'reset-all'
])

const profiles = [
  { id: 'takeoff', label: '起飞', desc: '油门推满 · 抬轮 · 离地' },
  { id: 'landing', label: '接地', desc: '进近 · 接地尘环 · 滑跑' },
  { id: 'touch_go', label: '连续起落', desc: '接地后推油门复飞' }
]

const surfaces = Object.values(SURFACE_PRESETS)

const throttlePreview = computed(() => {
  if (props.params.controlMode === 'manual') return props.params.flight.throttle
  return props.telemetry.throttle ?? 0
})

function syncFlightFromTelemetry() {
  const t = props.telemetry || {}
  props.params.flight.throttle = t.throttle ?? props.params.flight.throttle
  props.params.flight.airspeed = Math.round(t.airspeed ?? props.params.flight.airspeed)
  props.params.flight.altitude = Number((t.altitude ?? props.params.flight.altitude).toFixed(1))
  props.params.flight.gearDown = t.gearDown ?? props.params.flight.gearDown
  props.params.flight.weightOnWheels = t.weightOnWheels ?? props.params.flight.weightOnWheels
}

const manualMode = computed({
  get: () => props.params.controlMode === 'manual',
  set: (value) => {
    if (value) syncFlightFromTelemetry()
    props.params.controlMode = value ? 'manual' : 'sequence'
  }
})

function onThrottlePreview(value) {
  if (props.params.controlMode !== 'manual') {
    syncFlightFromTelemetry()
    props.params.controlMode = 'manual'
  }
  props.params.flight.throttle = value
}

const phaseLabels = {
  stopped: '停止',
  lineup: '试车',
  'ground-roll': '起飞滑跑',
  rotation: '抬轮',
  'initial-climb': '初始爬升',
  approach: '进近',
  flare: '拉平',
  rollout: '接地滑跑',
  touchdown: '接地',
  'touch-go-roll': '复飞滑跑',
  'touch-go-climb': '复飞爬升',
  manual: '手动挂参'
}

const phaseLabel = computed(() => phaseLabels[props.telemetry.phase] || '就绪')

function linkedInput(path, value) {
  emit('linked-input', path, value)
}

function thrustInput(value) {
  emit('thrust-input', value)
}
</script>
