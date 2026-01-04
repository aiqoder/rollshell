<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { SystemStats } from '../../../shared'

const props = defineProps<{
  active: boolean
}>()

const cpu = ref(0)
const memory = ref(0)
const swap = ref(0)

let timer: number | null = null

async function fetchStats(): Promise<void> {
  if (!window.shellTool?.system?.getStats) return
  try {
    const stats: SystemStats = await window.shellTool.system.getStats()
    cpu.value = stats.cpu ?? 0
    memory.value = stats.memory ?? 0
    swap.value = stats.swap ?? 0
  } catch (error) {
    console.error('[LoadInfo] 获取系统负载失败', error)
  }
}

function start(): void {
  stop()
  fetchStats()
  timer = window.setInterval(fetchStats, 5000)
}

function stop(): void {
  if (timer) {
    window.clearInterval(timer)
    timer = null
  }
}

watch(
  () => props.active,
  (val) => {
    if (val) start()
    else stop()
  },
  { immediate: true }
)

onMounted(() => {
  if (props.active) start()
})

onUnmounted(() => {
  stop()
})
</script>

<template>
  <div class="load-info px-3 py-2 text-[11px] space-y-1">
    <div class="load-row">
      <span class="load-row__label">CPU</span>
      <div class="load-row__progress">
        <div class="load-row__bar load-row__bar--cpu" :style="{ width: `${cpu}%` }" />
      </div>
      <span class="load-row__percent load-row__percent--cpu">{{ cpu }}%</span>
    </div>
    <div class="load-row">
      <span class="load-row__label">内存</span>
      <div class="load-row__progress">
        <div class="load-row__bar load-row__bar--memory" :style="{ width: `${memory}%` }" />
      </div>
      <span class="load-row__percent load-row__percent--memory">{{ memory }}%</span>
    </div>
    <div class="load-row">
      <span class="load-row__label">交换</span>
      <div class="load-row__progress">
        <div class="load-row__bar load-row__bar--swap" :style="{ width: `${swap}%` }" />
      </div>
      <span class="load-row__percent load-row__percent--swap">{{ swap }}%</span>
    </div>
  </div>
</template>

<style scoped>
.load-info {
  background: var(--color-surface);
  color: var(--color-text-primary);
}

.load-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.load-row__label {
  width: 48px;
  color: var(--color-text-secondary);
}

.load-row__progress {
  flex: 1;
  height: 12px;
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
}

.load-row__bar {
  height: 100%;
  transition: width 0.2s ease;
}

.load-row__bar--cpu {
  background: #22c55e; /* 绿色 */
}

.load-row__bar--memory {
  background: #3b82f6; /* 蓝色 */
}

.load-row__bar--swap {
  background: #f97316; /* 橙色 */
}

.load-row__percent {
  min-width: 44px;
  font-size: 11px;
  line-height: 1.2;
  text-align: right;
  color: var(--color-text-primary);
}

.load-row__percent--cpu {
  color: #16a34a;
}

.load-row__percent--memory {
  color: #2563eb;
}

.load-row__percent--swap {
  color: #ea580c;
}
</style>
