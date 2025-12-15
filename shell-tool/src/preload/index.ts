import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS, type Connection } from '../shared'

/**
 * Shell Tool API
 * 暴露给渲染进程的安全 IPC 调用接口
 * 需求: 4.2, 6.3, 7.1
 */
const shellToolAPI = {
  ssh: {
    create: (connectionId: string, size?: { cols: number; rows: number }): Promise<string> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SSH_CREATE, connectionId, size)
    },
    write: (sessionId: string, data: string): void => {
      ipcRenderer.send(IPC_CHANNELS.SSH_WRITE, sessionId, data)
    },
    resize: (sessionId: string, cols: number, rows: number): void => {
      ipcRenderer.send(IPC_CHANNELS.SSH_RESIZE, sessionId, cols, rows)
    },
    destroy: (sessionId: string): void => {
      ipcRenderer.send(IPC_CHANNELS.SSH_DESTROY, sessionId)
    },
    onData: (callback: (sessionId: string, data: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string): void =>
        callback(sessionId, data)
      ipcRenderer.on(IPC_CHANNELS.SSH_DATA, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH_DATA, handler)
    },
    onExit: (callback: (sessionId: string, code: number) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string, code: number): void =>
        callback(sessionId, code)
      ipcRenderer.on(IPC_CHANNELS.SSH_EXIT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH_EXIT, handler)
    }
  },

  /**
   * 连接管理相关 API
   * 需求: 7.1, 7.2, 7.3
   */
  connection: {
    /**
     * 获取所有连接
     */
    getAll: (): Promise<Connection[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET_ALL)
    },

    /**
     * 添加连接
     */
    add: (connection: Connection): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_ADD, connection)
    },

    /**
     * 更新连接
     */
    update: (id: string, data: Partial<Connection>): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_UPDATE, id, data)
    },

    /**
     * 删除连接
     */
    delete: (id: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_DELETE, id)
    }
  }
}

// 导出 API 类型供渲染进程使用
export type ShellToolAPI = typeof shellToolAPI

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('shellTool', shellToolAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.shellTool = shellToolAPI
}
