<template>
  <div ref="host" class="viewport-host"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { FlightFxScene } from '../three/FlightFxScene.js'

const props = defineProps({
  params: { type: Object, required: true }
})

const emit = defineEmits(['telemetry'])
const host = ref(null)
let scene = null

onMounted(() => {
  scene = new FlightFxScene(host.value, props.params, (telemetry) => emit('telemetry', telemetry))
})

onBeforeUnmount(() => {
  scene?.dispose()
  scene = null
})

defineExpose({
  replay: (profile) => scene?.replay(profile),
  applySeed: () => scene?.applySeed(),
  burst: () => scene?.requestTouchdownBurst(),
  resetCamera: () => scene?.resetCamera()
})
</script>

<style scoped>
.viewport-host {
  width: 100%;
  height: 100%;
  min-height: 420px;
  overflow: hidden;
  border-radius: 18px;
  background: #0b1220;
}

.viewport-host :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
