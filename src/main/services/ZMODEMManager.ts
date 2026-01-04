import { BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS, type ZMODEMProgress } from '../../shared'
import { getSSHManager } from './SSHManager'
import { getNativeLibManager } from './NativeLibManager'

/**
 * ZMODEM Manager - 管理 ZMODEM 文件传输
 * 通过 NativeLibManager 调用 Go 动态库实现 ZMODEM 协议
 */
export class ZMODEMManager {
  private sessionId: string
  private mode: 'upload' | 'download' // rz=upload, sz=download
  private webContentsId: number | null = null
  private filePath: string | null = null
  private zmodemSessionId: number | null = null
  private nativeLib: ReturnType<typeof getNativeLibManager>
  private progressInterval: NodeJS.Timeout | null = null
  private outputCheckInterval: NodeJS.Timeout | null = null
  private isActive: boolean = false

  constructor(sessionId: string, mode: 'upload' | 'download') {
    this.sessionId = sessionId
    this.mode = mode
    this.nativeLib = getNativeLibManager()
  }

  /**
   * 启动 ZMODEM 传输
   */
  async start(): Promise<void> {
    try {
      console.log(`[ZMODEMManager] 启动 ZMODEM 传输，模式: ${this.mode}, 会话ID: ${this.sessionId}`)

      // 1. 根据模式显示文件对话框
      if (this.mode === 'upload') {
        // rz: 用户选择本地文件上传到远程
        console.log('[ZMODEMManager] 显示文件选择对话框（上传）')
        const windows = BrowserWindow.getAllWindows()
        const targetWindow = windows.length > 0 ? windows[0] : undefined
        console.log(`[ZMODEMManager] 找到窗口数: ${windows.length}`)

        const dialogOptions: Electron.OpenDialogOptions = {
          title: '选择要上传的文件',
          properties: ['openFile']
        }
        const result = targetWindow
          ? await dialog.showOpenDialog(targetWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions)

        console.log('[ZMODEMManager] 文件选择结果:', result)
        if (result.canceled || !result.filePaths[0]) {
          throw new Error('用户取消了文件选择')
        }

        this.filePath = result.filePaths[0]
        console.log(`[ZMODEMManager] 选择的文件: ${this.filePath}`)
      } else {
        // sz: 远程文件下载到本地，需要选择保存位置
        const windows = BrowserWindow.getAllWindows()
        const targetWindow = windows.length > 0 ? windows[0] : undefined
        const result = targetWindow
          ? await dialog.showSaveDialog(targetWindow, { title: '保存文件' })
          : await dialog.showSaveDialog({ title: '保存文件' })

        if (result.canceled || !result.filePath) {
          throw new Error('用户取消了保存位置选择')
        }

        this.filePath = result.filePath
        console.log(`[ZMODEMManager] 保存路径: ${this.filePath}`)
      }

      // 2. 获取当前窗口的 webContentsId
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        this.webContentsId = windows[0].webContents.id
      }

      // 3. 初始化 ZMODEM 会话
      if (!this.filePath) {
        throw new Error('文件路径未设置')
      }

      console.log(`[ZMODEMManager] [${this.sessionId}] 初始化 ZMODEM 会话`)
      this.zmodemSessionId = this.nativeLib.zmodemInit(this.mode, this.filePath)
      console.log(`[ZMODEMManager] [${this.sessionId}] ZMODEM 会话ID: ${this.zmodemSessionId}`)

      this.isActive = true

      // 4. 启动进度检查和输出数据检查
      this.startProgressMonitoring()
      this.startOutputMonitoring()

      console.log(`[ZMODEMManager] [${this.sessionId}] ZMODEM 传输已启动`)
    } catch (error) {
      console.error('[ZMODEMManager] 启动失败:', error)
      this.sendError(error instanceof Error ? error.message : String(error))
      this.cleanup()
      throw error
    }
  }

  /**
   * 启动进度监控
   */
  private startProgressMonitoring(): void {
    // 每 100ms 检查一次进度
    this.progressInterval = setInterval(() => {
      if (!this.isActive || this.zmodemSessionId === null) {
        return
      }

      try {
        const progress = this.nativeLib.zmodemGetProgress(this.zmodemSessionId)
        if (progress) {
          const zmodemProgress: ZMODEMProgress = {
            mode: this.mode,
            filename: this.filePath ? this.filePath.split('/').pop() || this.filePath : '',
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total
          }
          this.sendProgress(zmodemProgress)
        }
      } catch (error) {
        console.error(`[ZMODEMManager] 获取进度失败:`, error)
      }
    }, 100)
  }

  /**
   * 启动输出数据监控（轮询需要发送的数据）
   * 作为事件驱动的后备机制，确保不会遗漏任何数据
   */
  private startOutputMonitoring(): void {
    // 每 10ms 检查一次（更快，作为事件驱动的补充）
    // 主要用于上传模式下，当没有输入数据时需要主动读取文件并发送
    this.outputCheckInterval = setInterval(() => {
      if (!this.isActive || this.zmodemSessionId === null) {
        return
      }

      try {
        this.checkAndSendOutput()
      } catch (error) {
        console.error(`[ZMODEMManager] 轮询检查输出数据失败:`, error)
      }
    }, 10)
  }

  /**
   * 检查并发送输出数据（事件驱动）
   * 立即检查输出缓冲区并发送所有可用数据
   */
  private checkAndSendOutput(): void {
    if (!this.isActive || this.zmodemSessionId === null) {
      return
    }

    try {
      const sshManager = getSSHManager()
      let totalSent = 0
      const maxIterations = 100 // 防止无限循环
      let iteration = 0

      // 循环获取并发送所有可用数据
      while (iteration < maxIterations) {
        iteration++
        const outputData = this.nativeLib.zmodemGetOutputData(this.zmodemSessionId, 8192)
        
        if (!outputData || outputData.length === 0) {
          // 没有更多数据
          break
        }

        // 发送数据到 SSH
        sshManager.write(this.sessionId, outputData)
        totalSent += outputData.length

        // 如果读取的数据少于缓冲区大小，说明已经读取完毕
        if (outputData.length < 8192) {
          break
        }
      }

      if (totalSent > 0) {
        console.log(`[ZMODEMManager] [${this.sessionId}] 立即发送数据: ${totalSent} bytes`)
      }

      // 检查状态
      const status = this.nativeLib.zmodemGetStatus(this.zmodemSessionId)
      if (status) {
        if (status.status === 2) {
          // 完成
          console.log(`[ZMODEMManager] [${this.sessionId}] 传输完成`)
          this.sendComplete()
          this.cleanup()
        } else if (status.status === 3) {
          // 错误
          console.error(`[ZMODEMManager] [${this.sessionId}] 传输错误: ${status.message}`)
          this.sendError(status.message)
          this.cleanup()
        }
      }
    } catch (error) {
      console.error(`[ZMODEMManager] [${this.sessionId}] 检查输出数据失败:`, error)
    }
  }

  /**
   * 处理从 SSH Channel 收到的数据
   */
  handleData(data: Buffer): void {
    if (!this.isActive || this.zmodemSessionId === null) {
      console.warn(`[ZMODEMManager] [${this.sessionId}] handleData: 会话未激活，忽略数据`)
      return
    }

    // 验证数据有效性
    if (!data || !Buffer.isBuffer(data)) {
      console.error(`[ZMODEMManager] [${this.sessionId}] handleData: 收到无效数据:`, data)
      return
    }

    // 测试环境中减少日志输出
    const isTestMode = process.env.ELECTRON_IS_TEST === 'true'
    if (!isTestMode) {
      console.log(`[ZMODEMManager] [${this.sessionId}] 收到 SSH 数据: ${data.length} bytes`)
      console.log(`[ZMODEMManager] [${this.sessionId}] 数据预览 (hex): ${data.toString('hex').substring(0, 32)}${data.length > 16 ? '...' : ''}`)
    }

    try {
      // 测试环境中输出调试信息
      const isTestMode = process.env.ELECTRON_IS_TEST === 'true'
      if (isTestMode) {
        const preview = data.slice(0, Math.min(32, data.length))
        console.log(`[ZMODEMManager] [${this.sessionId}] 调用 zmodemFeedData: ${data.length} bytes, hex: ${preview.toString('hex')}`)
      }
      
      const result = this.nativeLib.zmodemFeedData(this.zmodemSessionId, data)
      
      if (isTestMode) {
        console.log(`[ZMODEMManager] [${this.sessionId}] zmodemFeedData 返回: ${result}`)
      }
      
      if (result < 0) {
        console.error(`[ZMODEMManager] [${this.sessionId}] ZmodemFeedData 返回错误: ${result}`)
        const status = this.nativeLib.zmodemGetStatus(this.zmodemSessionId)
        if (status && status.status === 3) {
          this.sendError(status.message)
          this.cleanup()
        }
        return
      }

      // ⚡ 事件驱动：立即检查并发送输出数据
      // 这样可以在接收到数据后立即发送响应，而不是等待轮询
      this.checkAndSendOutput()
    } catch (error) {
      console.error(`[ZMODEMManager] [${this.sessionId}] 处理数据失败:`, error)
      this.sendError(error instanceof Error ? error.message : String(error))
      this.cleanup()
    }
  }

  /**
   * 发送进度信息给渲染进程
   */
  private sendProgress(progress: ZMODEMProgress): void {
    const windows = BrowserWindow.getAllWindows()
    const targetWindow = windows.find((w) => w.webContents.id === this.webContentsId)
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(IPC_CHANNELS.ZMODEM_PROGRESS, this.sessionId, progress)
    }
  }

  /**
   * 发送完成信息给渲染进程
   */
  private sendComplete(): void {
    const windows = BrowserWindow.getAllWindows()
    const targetWindow = windows.find((w) => w.webContents.id === this.webContentsId)
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(IPC_CHANNELS.ZMODEM_COMPLETE, this.sessionId)
    }
    // 完成后恢复 SSH 会话状态
    const sshManager = getSSHManager()
    sshManager.exitZMODEM(this.sessionId)
  }

  /**
   * 发送错误信息给渲染进程
   */
  private sendError(error: string): void {
    const windows = BrowserWindow.getAllWindows()
    const targetWindow = windows.find((w) => w.webContents.id === this.webContentsId)
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(IPC_CHANNELS.ZMODEM_ERROR, this.sessionId, error)
    }
    // 错误后恢复 SSH 会话状态
    const sshManager = getSSHManager()
    sshManager.exitZMODEM(this.sessionId)
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    console.log(`[ZMODEMManager] [${this.sessionId}] 开始清理资源`)
    this.isActive = false

    // 清除定时器
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }

    if (this.outputCheckInterval) {
      clearInterval(this.outputCheckInterval)
      this.outputCheckInterval = null
    }

    // 清理 ZMODEM 会话
    if (this.zmodemSessionId !== null) {
      try {
        this.nativeLib.zmodemCleanup(this.zmodemSessionId)
        console.log(`[ZMODEMManager] [${this.sessionId}] ZMODEM 会话已清理`)
      } catch (error) {
        console.error(`[ZMODEMManager] [${this.sessionId}] 清理 ZMODEM 会话失败:`, error)
      }
      this.zmodemSessionId = null
    }

    console.log(`[ZMODEMManager] [${this.sessionId}] 资源清理完成`)
  }

  /**
   * 销毁 ZMODEM Manager
   */
  destroy(): void {
    this.cleanup()
  }
}
