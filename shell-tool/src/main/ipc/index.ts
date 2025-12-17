/**
 * IPC 处理器模块
 * 负责注册所有主进程 IPC 处理器
 * 需求: 4.2, 6.3, 7.1, 7.2, 7.3
 */
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS, type Connection, type FileItem } from '../../shared'
import { getSSHManager, getConnectionStore, getSFTPManager } from '../services'

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
  registerFileHandlers()
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

/**
 * 注册文件相关 IPC 处理器
 */
function registerFileHandlers(): void {
  const sftpManager = getSFTPManager()

  // 列表
  ipcMain.handle(
    IPC_CHANNELS.FILE_LIST,
    async (_event, connectionId: string, remotePath: string): Promise<FileItem[]> => {
      try {
        return await sftpManager.list(connectionId, remotePath)
      } catch (error) {
        console.error('[IPC] file:list 错误:', error)
        throw error
      }
    }
  )

  // 上传
  ipcMain.handle(
    IPC_CHANNELS.FILE_UPLOAD,
    async (event, connectionId: string, localPath: string, remotePath: string) => {
      const webContents = event.sender
      await sftpManager.upload(
        connectionId,
        localPath,
        remotePath,
        (transferred, total, filename) => {
          const percent = total > 0 ? transferred / total : 0
          webContents.send(IPC_CHANNELS.FILE_PROGRESS, connectionId, {
            type: 'upload',
            path: remotePath,
            filename,
            percent
          })
        }
      )
    }
  )

  // 下载：主进程负责展示保存对话框
  ipcMain.handle(
    IPC_CHANNELS.FILE_DOWNLOAD,
    async (event, connectionId: string, remotePath: string, suggestedName?: string) => {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      const dialogOptions: Electron.SaveDialogOptions = {
        defaultPath: suggestedName ?? undefined
      }
      const result = browserWindow
        ? await dialog.showSaveDialog(browserWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions)
      if (result.canceled || !result.filePath) return

      const localPath = result.filePath
      const webContents = event.sender
      await sftpManager.download(
        connectionId,
        remotePath,
        localPath,
        (percent, filename) => {
          webContents.send(IPC_CHANNELS.FILE_PROGRESS, connectionId, {
            type: 'download',
            path: remotePath,
            filename,
            percent
          })
        }
      )
    }
  )

  // 删除
  ipcMain.handle(
    IPC_CHANNELS.FILE_DELETE,
    async (_event, connectionId: string, remotePath: string) => {
      try {
        await sftpManager.delete(connectionId, remotePath)
      } catch (error) {
        console.error('[IPC] file:delete 错误:', error)
        throw error
      }
    }
  )

  // 修改权限
  ipcMain.handle(
    IPC_CHANNELS.FILE_CHMOD,
    async (_event, connectionId: string, remotePath: string, mode: number) => {
      try {
        await sftpManager.chmod(connectionId, remotePath, mode)
      } catch (error) {
        console.error('[IPC] file:chmod 错误:', error)
        throw error
      }
    }
  )
}
