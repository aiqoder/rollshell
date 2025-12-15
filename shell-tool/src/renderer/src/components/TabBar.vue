<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { Tab } from '../../../shared'

/**
 * TabBar.vue - 标签栏组件
 * 需求: 4.4, 5.1, 5.2, 5.3, 6.1
 */

// Props
interface Props {
  tabs: Tab[]
  activeTabId: string | null
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'select', tabId: string): void
  (e: 'close', tabId: string): void
  (e: 'duplicate', tabId: string): void
}>()

// Computed
const isEmpty = computed(() => props.tabs.length === 0)

// Context menu state
const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const menuTabId = ref<string | null>(null)

function openContextMenu(event: MouseEvent, tabId: string): void {
  event.preventDefault()
  menuTabId.value = tabId
  menuX.value = event.clientX
  menuY.value = event.clientY
  showMenu.value = true
}

function hideContextMenu(): void {
  showMenu.value = false
  menuTabId.value = null
}

function handleDuplicate(): void {
  if (!menuTabId.value) return
  emit('duplicate', menuTabId.value)
  hideContextMenu()
}

function handleCloseFromMenu(): void {
  if (!menuTabId.value) return
  emit('close', menuTabId.value)
  hideContextMenu()
}

function handleGlobalClick(): void {
  if (showMenu.value) {
    hideContextMenu()
  }
}

onMounted(() => {
  window.addEventListener('click', handleGlobalClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick)
})

// Methods
function handleSelect(tabId: string): void {
  emit('select', tabId)
}

function handleClose(tabId: string, event: Event): void {
  event.stopPropagation()
  emit('close', tabId)
}

function isActive(tabId: string): boolean {
  return props.activeTabId === tabId
}
</script>

<template>
  <div class="tab-bar flex items-center bg-gray-800 border-b border-gray-700 py-1">
    <!-- 标签页列表 - 需求: 4.4, 5.1 -->
    <div class="flex-1 flex flex-wrap items-center">
      <!-- 空状态 -->
      <div v-if="isEmpty" class="px-4 text-sm text-gray-500">
        选择连接以打开终端
      </div>

      <!-- 标签页 -->
      <div
        v-for="tab in tabs"
        :key="tab.id"
        @click="handleSelect(tab.id)"
        @contextmenu="openContextMenu($event, tab.id)"
        :class="[
          'group flex items-center gap-2 px-3 h-full cursor-pointer border-r border-gray-700 transition-colors min-w-0 select-none',
          isActive(tab.id)
            ? 'bg-gray-900 text-white'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-750 hover:text-gray-300'
        ]"
      >
        <!-- 终端图标 -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>

        <!-- 标签标题 -->
        <span class="text-sm break-all">{{ tab.title }}</span>

        <!-- 关闭按钮 - 需求: 5.3 -->
        <button
          @click="handleClose(tab.id, $event)"
          class="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600"
          :class="isActive(tab.id) ? 'opacity-100' : ''"
          title="关闭标签页"
          aria-label="关闭标签页"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="showMenu && menuTabId"
      class="fixed z-50 bg-gray-800 text-gray-100 rounded shadow-lg border border-gray-700 w-36 py-1"
      :style="{ top: `${menuY}px`, left: `${menuX}px` }"
      @contextmenu.prevent
    >
      <button
        class="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors"
        @click="handleDuplicate"
      >
        复制标签
      </button>
      <button
        class="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors"
        @click="handleCloseFromMenu"
      >
        关闭
      </button>
    </div>

  </div>
</template>
