<template>
  <label class="param-slider" :class="{ locked: lockable && locked }">
    <span class="param-row">
      <span class="param-label">
        {{ label }}
        <button
          v-if="lockable"
          type="button"
          class="lock-badge"
          :class="{ on: locked }"
          :title="locked ? '该值已手调保留，推力变化不会覆盖；点击恢复推力联动' : '当前跟随发动机推力联动；拖动后将保留手调值'"
          @click.prevent="$emit('reset-link')"
        >
          {{ locked ? '🔒 手调保留' : '🔗 推力联动' }}
        </button>
      </span>
      <span class="param-value">{{ displayValue }}</span>
    </span>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="$emit('update:modelValue', Number(($event.target).value))"
    />
  </label>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, required: true },
  label: { type: String, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  step: { type: Number, default: 0.01 },
  unit: { type: String, default: '' },
  percent: { type: Boolean, default: false },
  digits: { type: Number, default: 2 },
  lockable: { type: Boolean, default: false },
  locked: { type: Boolean, default: false }
})

defineEmits(['update:modelValue', 'reset-link'])

const displayValue = computed(() => {
  if (props.percent) return `${Math.round(props.modelValue * 100)}%`
  const value = Number(props.modelValue).toFixed(props.digits)
  return `${value}${props.unit ? ' ' + props.unit : ''}`
})
</script>
