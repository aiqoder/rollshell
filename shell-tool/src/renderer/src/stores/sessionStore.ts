import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, Tab } from '../../../shared'

/**
 * 会话状态管理 Store
 * 需求: 3.2, 3.3, 4.4, 5.1, 5.2, 5.3
 */
export const useSessionStore = defineStore('session', () => {
  // ============================================
  // State
  // ============================================

  /** 会话列表 */
  const sessions = ref<Session[]>([])

  /** 活跃会话 ID */
  const activeSessionId = ref<string | null>(null)

  /** 错误信息 */
  const error = ref<string | null>(null)

  function getSSHAPI() {
    if (!window.shellTool?.ssh) {
      console.error('[sessionStore] ShellTool SSH API 未注入')
      return null
    }
    return window.shellTool.ssh
  }

  // ============================================
  // Getters
  // ============================================

  /** 获取活跃会话 */
  const activeSession = computed(() => {
    if (!activeSessionId.value) return null
    return sessions.value.find((s) => s.id === activeSessionId.value) || null
  })

  /** 会话数量 */
  const sessionCount = computed(() => sessions.value.length)

  /** 标签页列表 - 需求: 4.4, 5.1 */
  const tabs = computed<Tab[]>(() => {
    return sessions.value.map((session) => ({
      id: session.id,
      title: session.connectionId, // 可以后续改为连接名称
      connectionId: session.connectionId
    }))
  })

  /** 检查连接是否已有会话 - 需求: 3.3 */
  const hasSessionForConnection = computed(() => {
    return (connectionId: string) => sessions.value.some((s) => s.connectionId === connectionId)
  })


  /** 根据连接 ID 获取会话 */
  const getSessionByConnectionId = computed(() => {
    return (connectionId: string) => sessions.value.find((s) => s.connectionId === connectionId)
  })

  // ============================================
  // Actions
  // ============================================

  /**
   * 创建新会话
   * 需求: 3.2
   */
  async function createSession(connectionId: string): Promise<Session | null> {
    const sshAPI = getSSHAPI()
    if (!sshAPI) {
      error.value = 'ShellTool API 未注入，无法创建会话'
      return null
    }

    // 先创建本地会话，状态为 connecting，立即显示终端窗口
    const sessionId = crypto.randomUUID()
    const now = new Date()
    const newSession: Session = {
      id: sessionId,
      connectionId,
      sshSessionId: '',
      cwd: '/',
      isActive: true,
      createdAt: now,
      status: 'connecting'
    }

    sessions.value.push(newSession)
    activeSessionId.value = sessionId

    try {
      const sshSessionId = await sshAPI.create(connectionId)

      // 更新会话为已连接状态
      const target = sessions.value.find((s) => s.id === sessionId)
      if (target) {
        target.sshSessionId = sshSessionId
        target.status = 'connected'
        target.errorMessage = undefined
      }

      return target ?? null
    } catch (e) {
      const message = e instanceof Error ? e.message : '创建会话失败'
      error.value = message

      const target = sessions.value.find((s) => s.id === sessionId)
      if (target) {
        target.status = 'failed'
        target.errorMessage = message
      }

      return null
    }
  }

  /**
   * 选择或创建会话（防止重复会话）
   * 需求: 3.2, 3.3
   */
  async function selectOrCreateSession(connectionId: string): Promise<Session | null> {
    // 检查是否已存在该连接的会话 - 需求: 3.3
    const existingSession = sessions.value.find((s) => s.connectionId === connectionId)
    if (existingSession) {
      // 聚焦到已存在的会话
      activeSessionId.value = existingSession.id
      return existingSession
    }

    // 创建新会话 - 需求: 3.2
    return createSession(connectionId)
  }


  /**
   * 切换活跃会话
   * 需求: 5.2
   */
  function switchSession(sessionId: string): void {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session) {
      activeSessionId.value = sessionId
    }
  }

  /**
   * 关闭会话
   * 需求: 5.3
   */
  async function closeSession(sessionId: string): Promise<boolean> {
    const sessionIndex = sessions.value.findIndex((s) => s.id === sessionId)
    if (sessionIndex === -1) {
      return false
    }

    const session = sessions.value[sessionIndex]

    const sshAPI = getSSHAPI()
    if (!sshAPI) {
      error.value = 'ShellTool API 未注入，无法关闭会话'
      return false
    }

    try {
      // 销毁 PTY 实例
      sshAPI.destroy(session.sshSessionId)

      // 从列表中移除会话
      sessions.value.splice(sessionIndex, 1)

      // 如果关闭的是活跃会话，切换到其他会话
      if (activeSessionId.value === sessionId) {
        if (sessions.value.length > 0) {
          // 切换到最后一个会话
          activeSessionId.value = sessions.value[sessions.value.length - 1].id
        } else {
          activeSessionId.value = null
        }
      }

      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '关闭会话失败'
      return false
    }
  }

  /**
   * 更新会话工作目录
   * 需求: 6.5
   */
  function updateSessionCwd(sessionId: string, cwd: string): void {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session) {
      session.cwd = cwd
    }
  }

  function getSessionById(sessionId: string): Session | undefined {
    return sessions.value.find((s) => s.id === sessionId)
  }

  return {
    // State
    sessions,
    activeSessionId,
    error,
    // Getters
    activeSession,
    sessionCount,
    tabs,
    hasSessionForConnection,
    getSessionByConnectionId,
    // Actions
    createSession,
    selectOrCreateSession,
    switchSession,
    closeSession,
    updateSessionCwd,
    getSessionById
  }
})
