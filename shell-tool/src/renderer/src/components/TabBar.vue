<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { Tab } from '../../../shared'

/**
 * TabBar.vue - 标签栏组件
 * 需求: 4.4, 5.1, 5.2, 5.3, 6.1
 */

// Props
type SessionStatus = 'connecting' | 'connected' | 'failed' | undefined

interface Props {
  tabs: Tab[]
  activeTabId: string | null
  sessionStatusMap?: Record<string, SessionStatus>
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'select', tabId: string): void
  (e: 'close', tabId: string): void
  (e: 'duplicate', tabId: string): void
  (e: 'connect', tabId: string): void
  (e: 'disconnect', tabId: string): void
}>()

// Computed
const isEmpty = computed(() => props.tabs.length === 0)

// Context menu state
const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const menuTabId = ref<string | null>(null)
const menuStatus = computed<SessionStatus>(() =>
  menuTabId.value ? props.sessionStatusMap?.[menuTabId.value] : undefined
)
const canConnect = computed(() => menuStatus.value !== 'connected' && menuStatus.value !== 'connecting')
const canDisconnect = computed(() => menuStatus.value === 'connected' || menuStatus.value === 'connecting')

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

function handleConnectFromMenu(): void {
  if (!menuTabId.value || !canConnect.value) return
  emit('connect', menuTabId.value)
  hideContextMenu()
}

function handleDisconnectFromMenu(): void {
  if (!menuTabId.value || !canDisconnect.value) return
  emit('disconnect', menuTabId.value)
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
  <div class="tab-bar flex items-center border-b py-1">
    <!-- 标签页列表 - 需求: 4.4, 5.1 -->
    <div class="flex-1 flex flex-wrap items-center">
      <!-- 空状态 -->
      <div v-if="isEmpty" class="px-4 text-sm tab-empty">
        选择连接以打开终端
      </div>

      <!-- 标签页 -->
      <div
        v-for="tab in tabs"
        :key="tab.id"
        @click="handleSelect(tab.id)"
        @contextmenu="openContextMenu($event, tab.id)"
        :class="[
          'tab-item group flex items-center gap-2 px-3 h-full cursor-pointer border-r transition-colors min-w-0 select-none',
          isActive(tab.id) ? 'is-active' : ''
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
          class="tab-close p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
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
      class="context-menu fixed z-50 rounded shadow-lg w-40 py-1"
      :style="{ top: `${menuY}px`, left: `${menuX}px` }"
      @contextmenu.prevent
    >
      <button
        class="context-menu__item w-full text-left px-3 py-2 text-sm transition-colors"
        :disabled="!canConnect"
        @click="handleConnectFromMenu"
      >
        连接
      </button>
      <button
        class="context-menu__item w-full text-left px-3 py-2 text-sm transition-colors"
        :disabled="!canDisconnect"
        @click="handleDisconnectFromMenu"
      >
        断开
      </button>
      <div class="context-menu__divider" />
      <button
        class="context-menu__item w-full text-left px-3 py-2 text-sm transition-colors"
        @click="handleDuplicate"
      >
        复制标签
      </button>
      <button
        class="context-menu__item w-full text-left px-3 py-2 text-sm transition-colors"
        @click="handleCloseFromMenu"
      >
        关闭
      </button>
    </div>

  </div>
</template>

<style scoped>
.tab-bar {
  background: var(--color-surface-muted);
  border-color: var(--color-border);
  color: var(--color-text-secondary);
}

.tab-empty {
  color: var(--color-text-muted);
}

.tab-item {
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  border-color: var(--color-border);
}

.tab-item:hover {
  background: var(--color-surface-strong);
  color: var(--color-text-primary);
}

.tab-item.is-active {
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 600;
}

.tab-item .tab-close {
  color: var(--color-text-muted);
}

.tab-item .tab-close:hover {
  background: var(--color-surface-strong);
  color: var(--color-text-primary);
}

.tab-item.is-active .tab-close {
  color: var(--color-text-primary);
}

.context-menu {
  background-color: var(--color-menu-bg);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  box-shadow: 0 12px 32px var(--color-shadow);
  backdrop-filter: blur(10px);
}

.context-menu__item {
  color: inherit;
}

.context-menu__item:hover {
  background: var(--color-menu-hover);
}

.context-menu__item:disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
  background: transparent;
}

.context-menu__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--color-border);
}
</style>
