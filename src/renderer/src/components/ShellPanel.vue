<script setup lang="ts">
import { computed, ref, watch, type ComponentPublicInstance } from 'vue'
import TabBar from './TabBar.vue'
import Terminal from './Terminal.vue'
import { useSessionStore } from '../stores/sessionStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useFileStore } from '../stores'

/**
 * ShellPanel.vue - Shell 面板容器组件
 * 需求: 4.1, 4.4
 */

// Stores
const sessionStore = useSessionStore()
const connectionStore = useConnectionStore()
const fileStore = useFileStore()

// Refs
const terminalRefs = ref<Record<string, InstanceType<typeof Terminal> | null>>({})

function setTerminalRef(sessionId: string, el: Element | ComponentPublicInstance | null): void {
  const terminalInstance = el as InstanceType<typeof Terminal> | null
  if (terminalInstance) {
    terminalRefs.value[sessionId] = terminalInstance
  } else {
    delete terminalRefs.value[sessionId]
  }
}

// Computed - 获取带有连接名称的标签页
const tabsWithNames = computed(() => {
  return sessionStore.tabs.map(tab => {
    const connection = connectionStore.getConnectionById(tab.connectionId)
    return {
      ...tab,
      title: connection?.name || tab.connectionId
    }
  })
})

type SessionStatus = 'connecting' | 'connected' | 'failed' | undefined

const sessionStatusMap = computed<Record<string, SessionStatus>>(() => {
  const map: Record<string, SessionStatus> = {}
  sessionStore.sessions.forEach((session) => {
    map[session.id] = session.status
  })
  return map
})

// 获取活跃会话
const activeSession = computed(() => sessionStore.activeSession)

// 是否有活跃会话
const hasActiveSession = computed(() => !!activeSession.value)

// 所有会话列表
const sessionList = computed(() => sessionStore.sessions)

// Methods
function handleTabSelect(tabId: string): void {
  sessionStore.switchSession(tabId)
}

async function handleTabClose(tabId: string): Promise<void> {
  await sessionStore.closeSession(tabId)
}

async function handleTabDuplicate(tabId: string): Promise<void> {
  const session = sessionStore.getSessionById(tabId)
  if (!session) return
  await sessionStore.createSession(session.connectionId)
}

async function handleTabConnect(tabId: string): Promise<void> {
  const session = sessionStore.getSessionById(tabId)
  if (!session) return
  if (session.status === 'connected' || session.status === 'connecting') return

  // 重新创建会话以尝试重连
  await sessionStore.closeSession(tabId)
  await sessionStore.createSession(session.connectionId)
}

async function handleTabDisconnect(tabId: string): Promise<void> {
  await sessionStore.closeSession(tabId)
}

// Focus terminal when session changes
watch(() => sessionStore.activeSessionId, () => {
  const id = sessionStore.activeSessionId
  if (id) {
    const session = sessionStore.getSessionById(id)
    if (session) {
      fileStore.setConnection(session.connectionId, '~')
      fileStore.load(fileStore.currentPath)
      const term = terminalRefs.value[id]
      term?.focus()
    }
  } else {
    fileStore.setConnection(null)
  }
})
</script>

<template>
  <div class="shell-panel flex flex-col h-full">
    <!-- 标签栏 - 需求: 4.4 -->
    <TabBar
      :tabs="tabsWithNames"
      :active-tab-id="sessionStore.activeSessionId"
      :session-status-map="sessionStatusMap"
      @select="handleTabSelect"
      @close="handleTabClose"
      @duplicate="handleTabDuplicate"
      @connect="handleTabConnect"
      @disconnect="handleTabDisconnect"
    />

    <!-- 终端区域 - 需求: 4.1 -->
    <div class="flex-1 overflow-hidden">
      <!-- 为每个会话保留一个终端实例，切换时仅切换显示，不重建 -->
      <Terminal
        v-for="session in sessionList"
        :key="session.id"
        v-show="session.id === sessionStore.activeSessionId"
        :ssh-session-id="session.sshSessionId"
        :status="session.status"
        :error-message="session.errorMessage"
        :ref="(el) => setTerminalRef(session.id, el)"
      />

      <!-- 无会话时显示空状态 -->
      <div
        v-if="!hasActiveSession || !activeSession"
        class="empty-state flex flex-col items-center justify-center h-full"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-16 w-16 mb-4 empty-state__icon"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p class="empty-state__title text-lg mb-2">暂无终端会话</p>
        <p class="empty-state__desc text-sm">从左侧连接列表选择一个连接以打开终端</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell-panel {
  background: var(--color-surface);
  color: var(--color-text-primary);
}

.empty-state {
  color: var(--color-text-secondary);
}

.empty-state__icon {
  color: var(--color-text-muted);
}

.empty-state__desc {
  color: var(--color-text-muted);
}
</style>
