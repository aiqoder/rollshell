import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Connection } from '../../../shared'
import { validateConnection } from '../../../shared'

/**
 * 连接状态管理 Store
 * 需求: 1.3, 2.3, 3.1, 3.2
 */

function maskSensitiveFields(connection: Partial<Connection>): Partial<Connection> {
  return {
    ...connection,
    password: connection.password ? '***' : undefined,
    passphrase: connection.passphrase ? '***' : undefined
  }
}

function getConnectionAPI() {
  if (!window.shellTool?.connection) {
    console.error('[connectionStore] ShellTool API 未注入')
    return null
  }
  return window.shellTool.connection
}

export const useConnectionStore = defineStore('connection', () => {
  // ============================================
  // State
  // ============================================

  /** 连接列表 */
  const connections = ref<Connection[]>([])

  /** 选中的连接 ID */
  const selectedConnectionId = ref<string | null>(null)

  /** 加载状态 */
  const isLoading = ref(false)

  /** 错误信息 */
  const error = ref<string | null>(null)

  // ============================================
  // Getters
  // ============================================

  /** 获取选中的连接 */
  const selectedConnection = computed(() => {
    if (!selectedConnectionId.value) return null
    return connections.value.find((c) => c.id === selectedConnectionId.value) || null
  })

  /** 连接数量 */
  const connectionCount = computed(() => connections.value.length)

  /** 是否为空列表 */
  const isEmpty = computed(() => connections.value.length === 0)

  // ============================================
  // Actions
  // ============================================

  /**
   * 从持久化存储加载所有连接
   * 需求: 7.2
   */
  async function loadConnections(): Promise<void> {
    isLoading.value = true
    error.value = null
    console.info('[connectionStore] 开始加载连接列表')

    const connectionAPI = getConnectionAPI()
    if (!connectionAPI) {
      const apiError = 'ShellTool API 未注入，无法加载连接'
      error.value = apiError
      isLoading.value = false
      return
    }

    try {
      const loadedConnections = await connectionAPI.getAll()
      connections.value = loadedConnections
      console.info('[connectionStore] 加载连接成功', { count: loadedConnections.length })
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载连接失败'
      connections.value = []
      console.error('[connectionStore] 加载连接失败', e)
    } finally {
      isLoading.value = false
    }
  }


  /**
   * 添加新连接
   * 需求: 2.3
   */
  async function addConnection(
    connectionData: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ success: boolean; errors: string[] }> {
    const connectionAPI = getConnectionAPI()
    if (!connectionAPI) {
      const apiError = 'ShellTool API 未注入，无法添加连接'
      console.error('[connectionStore] 添加连接失败 - API 不可用')
      return { success: false, errors: [apiError] }
    }

    // 验证连接信息
    const validation = validateConnection(connectionData)
    if (!validation.valid) {
      console.warn('[connectionStore] 添加连接校验失败', {
        errors: validation.errors,
        payload: maskSensitiveFields(connectionData)
      })
      return { success: false, errors: validation.errors }
    }

    const now = new Date()
    const newConnection: Connection = {
      ...connectionData,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    }

    try {
      console.info('[connectionStore] 发送添加连接请求', maskSensitiveFields(newConnection))
      await connectionAPI.add(newConnection)
      connections.value.push(newConnection)
      console.info('[connectionStore] 添加连接成功', { id: newConnection.id })
      return { success: true, errors: [] }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '添加连接失败'
      console.error('[connectionStore] 添加连接异常', {
        error: errorMsg,
        payload: maskSensitiveFields(newConnection)
      })
      return { success: false, errors: [errorMsg] }
    }
  }

  /**
   * 删除连接
   * 需求: 7.3
   */
  async function deleteConnection(id: string): Promise<boolean> {
    const connectionAPI = getConnectionAPI()
    if (!connectionAPI) {
      const apiError = 'ShellTool API 未注入，无法删除连接'
      error.value = apiError
      console.error('[connectionStore] 删除连接失败 - API 不可用')
      return false
    }

    try {
      console.info('[connectionStore] 删除连接请求', { id })
      await connectionAPI.delete(id)
      const index = connections.value.findIndex((c) => c.id === id)
      if (index !== -1) {
        connections.value.splice(index, 1)
      }
      // 如果删除的是当前选中的连接，清除选中状态
      if (selectedConnectionId.value === id) {
        selectedConnectionId.value = null
      }
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '删除连接失败'
      console.error('[connectionStore] 删除连接失败', { id, error: error.value })
      return false
    }
  }

  /**
   * 选择连接
   * 需求: 3.1
   */
  function selectConnection(id: string | null): void {
    selectedConnectionId.value = id
  }

  /**
   * 根据 ID 获取连接
   */
  function getConnectionById(id: string): Connection | undefined {
    return connections.value.find((c) => c.id === id)
  }

  /**
   * 检查连接是否存在
   */
  function hasConnection(id: string): boolean {
    return connections.value.some((c) => c.id === id)
  }

  return {
    // State
    connections,
    selectedConnectionId,
    isLoading,
    error,
    // Getters
    selectedConnection,
    connectionCount,
    isEmpty,
    // Actions
    loadConnections,
    addConnection,
    deleteConnection,
    selectConnection,
    getConnectionById,
    hasConnection
  }
})
