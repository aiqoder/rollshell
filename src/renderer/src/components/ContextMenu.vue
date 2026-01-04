<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

export interface ContextMenuItem {
  label: string
  action?: () => void | Promise<void>
  disabled?: boolean
  divider?: boolean
}

interface Props {
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  minWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  minWidth: 160
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const menuRef = ref<HTMLDivElement | null>(null)
const computedX = ref(0)
const computedY = ref(0)

// 计算菜单位置，确保不超出视口
function calculatePosition(): void {
  if (!menuRef.value || !props.visible) {
    // 如果菜单还未渲染，先使用原始位置
    computedX.value = props.x
    computedY.value = props.y
    return
  }

  // 使用 requestAnimationFrame 确保 DOM 已更新
  requestAnimationFrame(() => {
    if (!menuRef.value) return

    const menuRect = menuRef.value.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const menuWidth = menuRect.width || props.minWidth
    const menuHeight = menuRect.height || 200 // 估算高度，如果无法获取

    let x = props.x
    let y = props.y

    // 水平方向：如果超出右边界，向左调整
    if (x + menuWidth > viewportWidth) {
      x = Math.max(8, viewportWidth - menuWidth - 8)
    }
    // 如果超出左边界，向右调整
    if (x < 8) {
      x = 8
    }

    // 垂直方向：如果超出下边界，向上调整
    if (y + menuHeight > viewportHeight) {
      y = Math.max(8, viewportHeight - menuHeight - 8)
    }
    // 如果超出上边界，向下调整
    if (y < 8) {
      y = 8
    }

    computedX.value = x
    computedY.value = y
  })
}

// 监听 visible 和位置变化，重新计算位置
watch(
  () => [props.visible, props.x, props.y],
  () => {
    if (props.visible) {
      // 先设置初始位置，然后在 nextTick 中精确计算
      computedX.value = props.x
      computedY.value = props.y
      nextTick(() => {
        calculatePosition()
      })
    }
  },
  { immediate: true }
)

// 处理菜单项点击
async function handleItemClick(item: ContextMenuItem): Promise<void> {
  if (item.disabled || !item.action) return
  try {
    await item.action()
  } catch (error) {
    console.error('[ContextMenu] 菜单项操作失败:', error)
  }
  emit('close')
}

// 点击外部关闭菜单
function handleClickOutside(event: MouseEvent): void {
  if (!props.visible || !menuRef.value) return
  if (!menuRef.value.contains(event.target as Node)) {
    emit('close')
  }
}

// 监听窗口大小变化，重新计算位置
function handleResize(): void {
  if (props.visible) {
    calculatePosition()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('resize', handleResize)
  if (props.visible) {
    calculatePosition()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', handleResize)
})

// 处理菜单项，保留分隔线信息
const processedItems = computed(() => {
  return props.items.map((item, index) => ({
    ...item,
    index,
    isDivider: item.divider === true
  }))
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && items.length > 0"
      ref="menuRef"
      class="context-menu fixed z-50 rounded shadow-lg py-1"
      :style="{
        top: `${computedY}px`,
        left: `${computedX}px`,
        minWidth: `${minWidth}px`
      }"
      @contextmenu.prevent
      @click.stop
    >
      <template v-for="(item, index) in processedItems" :key="index">
        <button
          v-if="!item.isDivider"
          class="context-menu__item w-full text-left px-3 py-2 text-sm transition-colors"
          :class="{
            'context-menu__item--disabled': item.disabled
          }"
          :disabled="item.disabled"
          @click="handleItemClick(item)"
        >
          {{ item.label }}
        </button>
        <div
          v-else
          class="context-menu__divider"
        />
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  background-color: var(--color-menu-bg, var(--color-surface));
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  box-shadow: 0 12px 32px var(--color-shadow);
  backdrop-filter: blur(10px);
}

.context-menu__item {
  color: inherit;
  background: transparent;
  border: none;
  cursor: pointer;
}

.context-menu__item:hover:not(.context-menu__item--disabled) {
  background: var(--color-menu-hover, var(--color-surface-strong));
}

.context-menu__item--disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.context-menu__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--color-border);
}
</style>

