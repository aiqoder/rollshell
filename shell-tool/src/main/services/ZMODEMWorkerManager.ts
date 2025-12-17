/**
 * ZMODEM Worker Manager - 管理 ZMODEM Worker 和主进程之间的通信
 * 
 * 职责：
 * - 创建和管理 ZMODEM Worker
 * - 在主进程和 Worker 之间转发消息
 * - 调用 NativeLibManager 执行 Go 库操作
 * - 处理文件对话框和窗口通信
 */

import { Worker } from 'worker_threads'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS, type ZMODEMProgress } from '../../shared'
import { getSSHManager } from './SSHManager'
import { getNativeLibManager } from './NativeLibManager'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface WorkerToMainMessage {
  type: 'init' | 'feed-data' | 'get-output' | 'get-progress' | 'get-status' | 'cleanup' | 'output-data' | 'complete' | 'error'
  sessionId?: string
  zmodemSessionId?: number
  data?: Buffer | string
  bufferSize?: number
  callbackId?: string
  error?: string
}

interface WorkerInstance {
  worker: Worker
  sessionId: string
  zmodemSessionId: number
  mode: 'upload' | 'download'
  filePath: string
  webContentsId: number | null
  isActive: boolean
}

/**
 * ZMODEM Worker Manager - 单例模式
 */
export class ZMODEMWorkerManager {
  // 标记这是 Worker Manager，方便 SSHManager 做类型区分
  public readonly isWorkerManager: boolean = true
  private static instance: ZMODEMWorkerManager | null = null
  private workers: Map<string, WorkerInstance> = new Map()
  private nativeLib: ReturnType<typeof getNativeLibManager>

  private constructor() {
    this.nativeLib = getNativeLibManager()
  }

  static getInstance(): ZMODEMWorkerManager {
    if (!ZMODEMWorkerManager.instance) {
      ZMODEMWorkerManager.instance = new ZMODEMWorkerManager()
    }
    return ZMODEMWorkerManager.instance
  }

  /**
   * 启动 ZMODEM 传输（使用 Worker）
   */
  async start(
    sessionId: string,
    mode: 'upload' | 'download',
    webContentsId: number | null = null
  ): Promise<void> {
    try {
      console.log(`[ZMODEMWorkerManager] 启动 ZMODEM 传输，模式: ${mode}, 会话ID: ${sessionId}`)

      // 1. 根据模式显示文件对话框
      let filePath: string
      if (mode === 'upload') {
        const windows = BrowserWindow.getAllWindows()
        const targetWindow = windows.length > 0 ? windows[0] : undefined
        const result = targetWindow
          ? await dialog.showOpenDialog(targetWindow, {
              title: '选择要上传的文件',
              properties: ['openFile']
            })
          : await dialog.showOpenDialog({
              title: '选择要上传的文件',
              properties: ['openFile']
            })

        if (result.canceled || !result.filePaths[0]) {
          throw new Error('用户取消了文件选择')
        }
        filePath = result.filePaths[0]
      } else {
        const windows = BrowserWindow.getAllWindows()
        const targetWindow = windows.length > 0 ? windows[0] : undefined
        const result = targetWindow
          ? await dialog.showSaveDialog(targetWindow, { title: '保存文件' })
          : await dialog.showSaveDialog({ title: '保存文件' })

        if (result.canceled || !result.filePath) {
          throw new Error('用户取消了保存位置选择')
        }
        filePath = result.filePath
      }

      // 2. 初始化 ZMODEM 会话（在主进程中调用 Go 库）
      const zmodemSessionId = this.nativeLib.zmodemInit(mode, filePath)
      console.log(`[ZMODEMWorkerManager] ZMODEM 会话初始化成功: sessionId=${zmodemSessionId}`)

      // 3. 创建 Worker
      // 构建后的路径：out/main/workers/zmodem.worker.js
      // 开发环境：__dirname 指向 out/main/services，向上到 out/main/workers/zmodem.worker.js
      // 尝试多个可能的路径
      const possiblePaths = [
        join(__dirname, '../workers/zmodem.worker.js'), // 构建后的相对路径
        join(__dirname, '../../out/main/workers/zmodem.worker.js'), // 从 src/main/services 到 out/main/workers
        join(__dirname, '../../../out/main/workers/zmodem.worker.js'), // 备用路径
        resolve(__dirname, '../../../out/main/workers/zmodem.worker.js') // 绝对路径
      ]
      
      let workerPath: string | null = null
      for (const path of possiblePaths) {
        if (existsSync(path)) {
          workerPath = path
          break
        }
      }
      
      if (!workerPath) {
        console.error(`[ZMODEMWorkerManager] Worker 文件不存在，尝试的路径:`)
        possiblePaths.forEach((p, i) => {
          console.error(`[ZMODEMWorkerManager]   ${i + 1}. ${p} (${existsSync(p) ? '存在' : '不存在'})`)
        })
        console.error(`[ZMODEMWorkerManager] __dirname: ${__dirname}`)
        throw new Error(`Worker 文件不存在，请确保已运行 npm run build`)
      }
      
      console.log(`[ZMODEMWorkerManager] 使用 Worker 文件: ${workerPath}`)
      const worker = new Worker(workerPath, {
        workerData: {
          sessionId,
          mode,
          filePath,
          zmodemSessionId
        }
      })

      // 4. 设置 Worker 消息处理
      worker.on('message', (message: WorkerToMainMessage) => {
        this.handleWorkerMessage(sessionId, message)
      })

      worker.on('error', (error) => {
        console.error(`[ZMODEMWorkerManager] Worker 错误:`, error)
        this.sendError(sessionId, error.message)
        this.cleanup(sessionId)
      })

      worker.on('exit', (code) => {
        console.log(`[ZMODEMWorkerManager] Worker 退出，退出码: ${code}`)
        this.workers.delete(sessionId)
      })

      // 5. 保存 Worker 实例
      const instance: WorkerInstance = {
        worker,
        sessionId,
        zmodemSessionId,
        mode,
        filePath,
        webContentsId,
        isActive: true
      }
      this.workers.set(sessionId, instance)

      console.log(`[ZMODEMWorkerManager] ZMODEM Worker 启动成功`)
    } catch (error) {
      console.error('[ZMODEMWorkerManager] 启动失败:', error)
      throw error
    }
  }

  /**
   * 处理来自 Worker 的消息
   */
  private handleWorkerMessage(sessionId: string, message: WorkerToMainMessage): void {
    const instance = this.workers.get(sessionId)
    if (!instance) {
      console.warn(`[ZMODEMWorkerManager] 收到消息但实例不存在: ${sessionId}`)
      return
    }

    switch (message.type) {
      case 'init':
        // Worker 请求初始化，已经在 start() 中完成
        break

      case 'feed-data':
        // Worker 请求处理输入数据
        if (message.data && message.zmodemSessionId !== undefined) {
          const data = Buffer.isBuffer(message.data) ? message.data : Buffer.from(String(message.data), 'utf-8')
          try {
            const result = this.nativeLib.zmodemFeedData(message.zmodemSessionId, data)
            if (result < 0) {
              this.sendError(sessionId, `ZmodemFeedData 返回错误: ${result}`)
            }
          } catch (error) {
            this.sendError(sessionId, error instanceof Error ? error.message : String(error))
          }
        }
        break

      case 'get-output':
        // Worker 请求获取输出数据
        if (message.zmodemSessionId !== undefined) {
          try {
            const outputData = this.nativeLib.zmodemGetOutputData(
              message.zmodemSessionId,
              message.bufferSize || 8192
            )
            if (outputData && outputData.length > 0) {
              // 发送输出数据到 Worker
              instance.worker.postMessage({
                type: 'output-data',
                data: outputData
              })

              // 同时发送到 SSH
              const sshManager = getSSHManager()
              sshManager.write(sessionId, outputData)
            }
          } catch (error) {
            console.error(`[ZMODEMWorkerManager] 获取输出数据失败:`, error)
          }
        }
        break

      case 'get-progress':
        // Worker 请求获取进度
        if (message.zmodemSessionId !== undefined) {
          try {
            const progress = this.nativeLib.zmodemGetProgress(message.zmodemSessionId)
            if (progress) {
              instance.worker.postMessage({
                type: 'progress',
                progress: {
                  transferred: progress.transferred,
                  total: progress.total,
                  percent: progress.percent
                }
              })

              // 同时发送到渲染进程
              this.sendProgress(sessionId, {
                mode: instance.mode,
                filename: instance.filePath.split('/').pop() || instance.filePath,
                percent: progress.percent,
                transferred: progress.transferred,
                total: progress.total
              })
            }
          } catch (error) {
            console.error(`[ZMODEMWorkerManager] 获取进度失败:`, error)
          }
        }
        break

      case 'get-status':
        // Worker 请求获取状态
        if (message.zmodemSessionId !== undefined) {
          try {
            const status = this.nativeLib.zmodemGetStatus(message.zmodemSessionId)
            if (status) {
              instance.worker.postMessage({
                type: 'status',
                status: {
                  status: status.status,
                  message: status.message
                }
              })
            }
          } catch (error) {
            console.error(`[ZMODEMWorkerManager] 获取状态失败:`, error)
          }
        }
        break

      case 'output-data':
        // Worker 有输出数据需要发送到 SSH
        if (message.data) {
          const data = Buffer.isBuffer(message.data) ? message.data : Buffer.from(String(message.data), 'utf-8')
          const sshManager = getSSHManager()
          sshManager.write(sessionId, data)
        }
        break

      case 'complete':
        // Worker 通知传输完成
        this.sendComplete(sessionId)
        this.cleanup(sessionId)
        break

      case 'error':
        // Worker 通知错误
        this.sendError(sessionId, message.error || '未知错误')
        this.cleanup(sessionId)
        break

      case 'cleanup':
        // Worker 请求清理
        this.cleanup(sessionId)
        break

      default:
        console.warn(`[ZMODEMWorkerManager] 未知消息类型: ${(message as any).type}`)
    }
  }

  /**
   * 处理从 SSH Channel 收到的数据
   */
  handleData(sessionId: string, data: Buffer): void {
    const instance = this.workers.get(sessionId)
    if (!instance || !instance.isActive) {
      console.warn(`[ZMODEMWorkerManager] 收到数据但 Worker 未激活: ${sessionId}`)
      return
    }

    // 转发数据到 Worker
    instance.worker.postMessage({
      type: 'data',
      data: data
    })
  }

  /**
   * 发送进度信息给渲染进程
   */
  private sendProgress(sessionId: string, progress: ZMODEMProgress): void {
    const instance = this.workers.get(sessionId)
    if (!instance || instance.webContentsId === null) {
      return
    }

    const windows = BrowserWindow.getAllWindows()
    const targetWindow = windows.find((w) => w.webContents.id === instance.webContentsId)
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(IPC_CHANNELS.ZMODEM_PROGRESS, sessionId, progress)
    }
  }

  /**
   * 发送完成信息给渲染进程
   */
  private sendComplete(sessionId: string): void {
    const instance = this.workers.get(sessionId)
    if (!instance) {
      return
    }

    const windows = BrowserWindow.getAllWindows()
    const targetWindow = instance.webContentsId
      ? windows.find((w) => w.webContents.id === instance.webContentsId)
      : undefined
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(IPC_CHANNELS.ZMODEM_COMPLETE, sessionId)
    }

    // 恢复 SSH 会话状态
    const sshManager = getSSHManager()
    sshManager.exitZMODEM(sessionId)
  }

  /**
   * 发送错误信息给渲染进程
   */
  private sendError(sessionId: string, error: string): void {
    const instance = this.workers.get(sessionId)
    if (!instance) {
      return
    }

    const windows = BrowserWindow.getAllWindows()
    const targetWindow = instance.webContentsId
      ? windows.find((w) => w.webContents.id === instance.webContentsId)
      : undefined
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(IPC_CHANNELS.ZMODEM_ERROR, sessionId, error)
    }

    // 恢复 SSH 会话状态
    const sshManager = getSSHManager()
    sshManager.exitZMODEM(sessionId)
  }

  /**
   * 清理资源
   */
  cleanup(sessionId: string): void {
    const instance = this.workers.get(sessionId)
    if (!instance) {
      return
    }

    console.log(`[ZMODEMWorkerManager] 清理 Worker: ${sessionId}`)
    instance.isActive = false

    // 清理 Go 库会话
    try {
      this.nativeLib.zmodemCleanup(instance.zmodemSessionId)
    } catch (error) {
      console.error(`[ZMODEMWorkerManager] 清理 Go 库会话失败:`, error)
    }

    // 终止 Worker
    instance.worker.terminate()
    this.workers.delete(sessionId)
  }

  /**
   * 销毁所有 Worker
   */
  destroyAll(): void {
    const sessionIds = Array.from(this.workers.keys())
    for (const sessionId of sessionIds) {
      this.cleanup(sessionId)
    }
  }
}

/**
 * 获取 ZMODEM Worker Manager 单例实例
 */
export function getZMODEMWorkerManager(): ZMODEMWorkerManager {
  return ZMODEMWorkerManager.getInstance()
}

