<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ConnectionList from './components/ConnectionList.vue'
import AddConnectionDialog from './components/AddConnectionDialog.vue'
import ShellPanel from './components/ShellPanel.vue'
import { useConnectionStore } from './stores/connectionStore'
import { useSessionStore } from './stores/sessionStore'

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

// State
const showAddDialog = ref(false)
const addDialogSubmitResult = ref<{ success: boolean; errors?: string[] } | null>(null)

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
  console.info('[App] 关闭添加连接对话框')
}

/**
 * 处理添加连接提交
 * 需求: 2.3
 */
async function handleAddConnectionSubmit(data: {
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
  const result = await connectionStore.addConnection(data)
  addDialogSubmitResult.value = result
  if (result.success) {
    showAddDialog.value = false
    console.info('[App] 添加连接成功')
  } else {
    console.error('[App] 添加连接失败', result.errors)
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

// ============================================
// 生命周期
// ============================================

onMounted(async () => {
  // 加载保存的连接 - 需求: 7.2
  await connectionStore.loadConnections()
})
</script>

<template>
  <!-- 主布局容器 - 需求: 1.1 -->
  <div class="app-container flex h-screen w-screen overflow-hidden bg-gray-900">
    <!-- 左侧连接列表面板 - 需求: 1.1 -->
    <aside class="connection-sidebar w-64 shrink-0 border-r border-gray-700">
      <ConnectionList
        :connections="connectionStore.connections"
        :selected-id="connectionStore.selectedConnectionId"
        @select="handleConnectionSelect"
        @open="handleConnectionOpen"
        @add="handleAddConnection"
        @delete="handleDeleteConnection"
      />
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
}

/* 连接侧边栏样式 */
.connection-sidebar {
  min-width: 200px;
  max-width: 300px;
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
