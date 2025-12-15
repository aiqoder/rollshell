/**
 * IPC 处理器模块
 * 负责注册所有主进程 IPC 处理器
 * 需求: 4.2, 6.3, 7.1, 7.2, 7.3
 */
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS, type Connection } from '../../shared'
import { getSSHManager, getConnectionStore } from '../services'

function sanitizeConnectionPayload(connection: Partial<Connection>): Record<string, unknown> {
  return {
    ...connection,
    password: connection.password ? '***' : undefined,
    passphrase: connection.passphrase ? '***' : undefined
  }
}

/**
 * 注册所有 IPC 处理器
 */
export function registerIPCHandlers(): void {
  registerSSHHandlers()
  registerConnectionHandlers()
}

/**
 * 注册 SSH 相关 IPC 处理器
 */
function registerSSHHandlers(): void {
  const sshManager = getSSHManager()

  ipcMain.handle(
    IPC_CHANNELS.SSH_CREATE,
    async (_event, connectionId: string, size?: { cols: number; rows: number }) => {
      const sessionId = await sshManager.create(connectionId, size)

      const sender = _event.sender
      const webContentsId = sender.id

      const dataHandler = (id: string, data: string): void => {
        if (id === sessionId) {
          const windows = BrowserWindow.getAllWindows()
          const targetWindow = windows.find((w) => w.webContents.id === webContentsId)
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send(IPC_CHANNELS.SSH_DATA, sessionId, data)
          }
        }
      }

      const exitHandler = (id: string, code: number): void => {
        if (id === sessionId) {
          const windows = BrowserWindow.getAllWindows()
          const targetWindow = windows.find((w) => w.webContents.id === webContentsId)
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send(IPC_CHANNELS.SSH_EXIT, sessionId, code)
          }
          sshManager.off('data', dataHandler)
          sshManager.off('exit', exitHandler)
        }
      }

      sshManager.on('data', dataHandler)
      sshManager.on('exit', exitHandler)

      return sessionId
    }
  )

  ipcMain.on(IPC_CHANNELS.SSH_WRITE, (_event, sessionId: string, data: string) => {
    try {
      sshManager.write(sessionId, data)
    } catch (error) {
      console.error('SSH write error:', error)
    }
  })

  ipcMain.on(IPC_CHANNELS.SSH_RESIZE, (_event, sessionId: string, cols: number, rows: number) => {
    try {
      sshManager.resize(sessionId, cols, rows)
    } catch (error) {
      console.error('SSH resize error:', error)
    }
  })

  ipcMain.on(IPC_CHANNELS.SSH_DESTROY, (_event, sessionId: string) => {
    sshManager.destroy(sessionId)
  })
}

/**
 * 注册连接相关 IPC 处理器
 * 需求: 7.1, 7.2, 7.3
 */
function registerConnectionHandlers(): void {
  const connectionStore = getConnectionStore()

  // 获取所有连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_GET_ALL, async () => {
    console.info('[IPC][connection:get-all] 收到渲染进程请求')
    const connections = await connectionStore.getAll()
    console.info('[IPC][connection:get-all] 返回结果', { count: connections.length })
    return connections
  })

  // 添加连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_ADD, async (_event, connection: Connection) => {
    console.info('[IPC][connection:add] 收到请求', sanitizeConnectionPayload(connection))
    try {
      await connectionStore.add(connection)
      console.info('[IPC][connection:add] 持久化成功', { id: connection.id })
    } catch (error) {
      console.error('[IPC][connection:add] 持久化失败', error)
      throw error
    }
  })

  // 更新连接
  ipcMain.handle(
    IPC_CHANNELS.CONNECTION_UPDATE,
    async (_event, id: string, data: Partial<Connection>) => {
      console.info('[IPC][connection:update] 收到请求', {
        id,
        payload: sanitizeConnectionPayload(data)
      })
      try {
        await connectionStore.update(id, data)
        console.info('[IPC][connection:update] 更新成功', { id })
      } catch (error) {
        console.error('[IPC][connection:update] 更新失败', { id, error })
        throw error
      }
    }
  )

  // 删除连接
  ipcMain.handle(IPC_CHANNELS.CONNECTION_DELETE, async (_event, id: string) => {
    console.info('[IPC][connection:delete] 收到请求', { id })
    try {
      await connectionStore.delete(id)
      console.info('[IPC][connection:delete] 删除成功', { id })
    } catch (error) {
      console.error('[IPC][connection:delete] 删除失败', { id, error })
      throw error
    }
  })
}
