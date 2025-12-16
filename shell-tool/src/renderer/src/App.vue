<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import ConnectionList from './components/ConnectionList.vue'
import FilePanel from './components/FilePanel.vue'
import AddConnectionDialog from './components/AddConnectionDialog.vue'
import ShellPanel from './components/ShellPanel.vue'
import { useConnectionStore } from './stores/connectionStore'
import { useSessionStore } from './stores/sessionStore'
import { useThemeStore } from './stores/themeStore'
import { ServerIcon, FolderIcon } from '@heroicons/vue/24/outline'
import type { Connection } from '../shared'

/**
 * App.vue - 主布局组件
 * 需求: 1.1, 4.1, 6.1
 * 
 * 布局结构:
 * - 左侧: 连接列表面板
 * - 右侧: Shell 面板 (包含标签栏和终端)
 * - 可展开: 文件浏览面板
 */

// Stores
const connectionStore = useConnectionStore()
const sessionStore = useSessionStore()
const themeStore = useThemeStore()
const { themePreference } = storeToRefs(themeStore)

// State
const showAddDialog = ref(false)
const addDialogSubmitResult = ref<{ success: boolean; errors?: string[] } | null>(null)
const dialogMode = ref<'create' | 'edit'>('create')
const dialogFormData = ref<Partial<Connection> & { id?: string } | null>(null)
const activeSidePanel = ref<'connections' | 'files'>('connections')

const themeLabel = computed(() => {
  if (themePreference.value === 'dark') return '暗色'
  if (themePreference.value === 'system') return '系统'
  return '亮色'
})

const themeIcon = computed(() => {
  if (themePreference.value === 'dark') return '🌙'
  if (themePreference.value === 'system') return '🖥️'
  return '☀️'
})

function sanitizeConnectionPayload<T extends { password?: string; passphrase?: string }>(data: T): T {
  return {
    ...data,
    password: data.password ? '***' : undefined,
    passphrase: data.passphrase ? '***' : undefined
  }
}

// ============================================
// 连接管理 - 需求: 1.3, 2.3, 3.1, 3.2
// ============================================

/**
 * 处理连接选择
 * 需求: 3.1, 3.2
 */
async function handleConnectionSelect(connectionId: string): Promise<void> {
  // 单击只选中，不自动创建会话
  connectionStore.selectConnection(connectionId)
}

/**
 * 双击打开连接并创建/聚焦会话
 */
async function handleConnectionOpen(connectionId: string): Promise<void> {
  connectionStore.selectConnection(connectionId)
  const connection = connectionStore.getConnectionById(connectionId)
  if (!connection) return
  await sessionStore.selectOrCreateSession(connectionId)
}

/**
 * 处理添加连接按钮点击
 * 需求: 2.1
 */
function handleAddConnection(): void {
  dialogMode.value = 'create'
  dialogFormData.value = null
  showAddDialog.value = true
  addDialogSubmitResult.value = null
  console.info('[App] 打开添加连接对话框')
}

/**
 * 处理添加连接对话框关闭
 */
function handleAddDialogClose(): void {
  showAddDialog.value = false
  addDialogSubmitResult.value = null
  dialogFormData.value = null
  dialogMode.value = 'create'
  console.info('[App] 关闭添加连接对话框')
}

/**
 * 处理添加连接提交
 * 需求: 2.3
 */
async function handleAddConnectionSubmit(data: {
  id?: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'publickey'
  password?: string
  privateKeyPath?: string
  passphrase?: string
  remark?: string
}): Promise<void> {
  addDialogSubmitResult.value = null
  console.info('[App] 收到添加连接请求', sanitizeConnectionPayload(data))
  let result
  if (data.id) {
    const { id, ...payload } = data
    result = await connectionStore.updateConnection(id, payload)
    console.info('[App] 更新连接请求完成', { id, success: result.success })
  } else {
    result = await connectionStore.addConnection(data)
  }
  addDialogSubmitResult.value = result
  if (result.success) {
    showAddDialog.value = false
    dialogFormData.value = null
    dialogMode.value = 'create'
    console.info('[App] 连接保存成功')
  } else {
    console.error('[App] 保存连接失败', result.errors)
  }
}

/**
 * 处理删除连接
 * 需求: 7.3
 */
async function handleDeleteConnection(connectionId: string): Promise<void> {
  // 如果该连接有活跃会话，先关闭会话
  const session = sessionStore.getSessionByConnectionId(connectionId)
  if (session) {
    await sessionStore.closeSession(session.id)
  }
  
  await connectionStore.deleteConnection(connectionId)
}

function handleEditConnection(connectionId: string): void {
  const connection = connectionStore.getConnectionById(connectionId)
  if (!connection) return
  dialogMode.value = 'edit'
  dialogFormData.value = { ...connection }
  showAddDialog.value = true
  addDialogSubmitResult.value = null
  console.info('[App] 打开编辑连接对话框', { id: connectionId })
}

// ============================================
// 生命周期
// ============================================

onMounted(async () => {
  themeStore.initTheme()
  // 加载保存的连接 - 需求: 7.2
  await connectionStore.loadConnections()
})

function handleThemeToggle(): void {
  themeStore.cycleThemePreference()
}
</script>

<template>
  <!-- 主布局容器 - 需求: 1.1 -->
  <div class="app-container flex h-screen w-screen overflow-hidden theme-app">
    <!-- 左侧侧边栏区域 -->
    <aside class="connection-sidebar flex shrink-0 border-r theme-border-strong">
      <!-- 图标菜单栏 -->
      <div class="sidebar-icon-column">
        <div class="sidebar-icon-stack">
          <button
            class="icon-button"
            :class="activeSidePanel === 'connections' ? 'icon-button-active' : ''"
            title="连接"
            @click="activeSidePanel = 'connections'"
          >
            <ServerIcon class="nav-icon" aria-hidden="true" />
          </button>
          <button
            class="icon-button"
            :class="activeSidePanel === 'files' ? 'icon-button-active' : ''"
            title="文件"
            @click="activeSidePanel = 'files'"
          >
            <FolderIcon class="nav-icon" aria-hidden="true" />
          </button>
        </div>
        <button
          class="icon-button theme-toggle-button"
          title="切换主题"
          :aria-label="`当前主题：${themeLabel}`"
          @click="handleThemeToggle"
        >
          <span class="theme-toggle-icon">{{ themeIcon }}</span>
          <span class="theme-toggle-label">{{ themeLabel }}</span>
        </button>
      </div>

      <!-- 面板区域 -->
      <div class="w-64 max-w-xs sidebar-panel">
        <ConnectionList
          v-if="activeSidePanel === 'connections'"
          :connections="connectionStore.connections"
          :selected-id="connectionStore.selectedConnectionId"
          @select="handleConnectionSelect"
          @open="handleConnectionOpen"
          @add="handleAddConnection"
          @delete="handleDeleteConnection"
          @edit="handleEditConnection"
        />
        <FilePanel v-else />
      </div>
    </aside>

    <!-- 右侧主内容区域 -->
    <main class="main-content flex-1 flex overflow-hidden">
      <!-- Shell 面板 -->
      <div class="shell-area flex-1 overflow-hidden">
        <ShellPanel />
      </div>
    </main>

    <!-- 添加连接对话框 - 需求: 2.1, 2.2 -->
    <AddConnectionDialog
      :visible="showAddDialog"
      :mode="dialogMode"
      :form-data="dialogFormData"
      :submit-result="addDialogSubmitResult"
      @close="handleAddDialogClose"
      @submit="handleAddConnectionSubmit"
    />
  </div>
</template>

<style scoped>

/* 确保应用占满整个视口 */
.app-container {
  min-height: 100vh;
  min-width: 100vw;
  user-select: none;
  background: var(--color-app-bg);
  color: var(--color-text-primary);
}

/* 连接侧边栏样式 */
.connection-sidebar {
  min-width: 220px;
  max-width: 320px;
  background: var(--color-surface-muted);
  border-color: var(--color-border-strong);
}

.sidebar-icon-column {
  width: 3rem;
  background: var(--color-surface-strong);
  border-right: 1px solid var(--color-border-strong);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 0.35rem 0.25rem 0.5rem;
  gap: 0.5rem;
}

.sidebar-icon-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.sidebar-panel {
  background: var(--color-surface-muted);
}

.icon-button {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  border: 1px solid transparent;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.nav-icon {
  width: 18px;
  height: 18px;
}

.icon-button:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-strong);
}

.icon-button-active {
  color: var(--color-text-primary);
  background: var(--color-surface-strong);
  border-color: var(--color-border-strong);
}

.icon-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: currentColor;
}

.theme-toggle-button {
  width: 100%;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.35rem 0.15rem;
  font-size: 12px;
  line-height: 1;
  text-align: center;
}

.theme-toggle-icon {
  font-size: 14px;
}

.theme-toggle-label {
  color: var(--color-text-secondary);
}

/* 主内容区域 */
.main-content {
  min-width: 0; /* 允许 flex 子元素收缩 */
}

/* Shell 区域 */
.shell-area {
  min-width: 400px;
}
</style>
