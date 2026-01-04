/**
 * ZMODEM Worker - 处理 ZMODEM 协议的数据和状态管理
 * 
 * 架构说明：
 * - Worker 负责：数据处理、状态管理、进度跟踪
 * - 主进程负责：调用 Go 动态库（通过 NativeLibManager）、文件对话框、窗口通信
 * 
 * 通信流程：
 * 1. 主进程 → Worker: 初始化、数据输入、控制命令
 * 2. Worker → 主进程: 请求调用 Go 库、状态更新、进度信息、错误
 */

import { parentPort, workerData } from 'worker_threads'

interface WorkerData {
  sessionId: string
  mode: 'upload' | 'download'
  filePath: string
  zmodemSessionId: number
}

interface WorkerToMainMessage {
  type: 'init' | 'feed-data' | 'get-output' | 'get-progress' | 'get-status' | 'cleanup' | 'output-data' | 'complete' | 'error'
  sessionId?: string
  zmodemSessionId?: number
  data?: Buffer | string
  bufferSize?: number
  callbackId?: string
  error?: string
}

interface MainToWorkerMessage {
  type: 'init' | 'data' | 'output-data' | 'progress' | 'status' | 'error' | 'complete' | 'cleanup'
  sessionId?: string
  zmodemSessionId?: number
  data?: Buffer | string
  progress?: {
    transferred: number
    total: number
    percent: number
  }
  status?: {
    status: number
    message: string
  }
  error?: string
  callbackId?: string
}

class ZMODEMWorker {
  private sessionId: string
  private mode: 'upload' | 'download'
  private zmodemSessionId: number
  private isActive: boolean = false
  private dataQueue: Buffer[] = []
  private outputBuffer: Buffer = Buffer.alloc(0)

  constructor(workerData: WorkerData) {
    this.sessionId = workerData.sessionId
    this.mode = workerData.mode
    this.zmodemSessionId = workerData.zmodemSessionId
    console.log(`[ZMODEM Worker] 初始化: sessionId=${this.sessionId}, mode=${this.mode}, zmodemSessionId=${this.zmodemSessionId}, filePath=${workerData.filePath}`)
  }

  start(): void {
    this.isActive = true
    console.log(`[ZMODEM Worker] Worker 启动成功`)

    // 请求主进程初始化 ZMODEM 会话
    this.sendToMain({
      type: 'init',
      sessionId: this.sessionId,
      zmodemSessionId: this.zmodemSessionId
    })
  }

  /**
   * 处理从主进程收到的数据
   */
  handleData(data: Buffer | string): void {
    if (!this.isActive) {
      console.warn(`[ZMODEM Worker] 收到数据但 Worker 未激活`)
      return
    }

    // 转换为 Buffer
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf-8')
    
    // 将数据加入队列
    this.dataQueue.push(buffer)

    // 请求主进程处理数据
    this.sendToMain({
      type: 'feed-data',
      sessionId: this.sessionId,
      zmodemSessionId: this.zmodemSessionId,
      data: buffer,
      callbackId: `feed-${Date.now()}`
    })

    // 检查输出数据
    this.checkOutput()
  }

  /**
   * 检查是否有输出数据需要发送
   */
  checkOutput(): void {
    if (!this.isActive) {
      return
    }

    // 请求主进程获取输出数据
    this.sendToMain({
      type: 'get-output',
      sessionId: this.sessionId,
      zmodemSessionId: this.zmodemSessionId,
      bufferSize: 8192,
      callbackId: `output-${Date.now()}`
    })

    // 检查进度和状态
    this.checkProgress()
    this.checkStatus()
  }

  /**
   * 检查传输进度
   */
  checkProgress(): void {
    if (!this.isActive) {
      return
    }

    this.sendToMain({
      type: 'get-progress',
      sessionId: this.sessionId,
      zmodemSessionId: this.zmodemSessionId,
      callbackId: `progress-${Date.now()}`
    })
  }

  /**
   * 检查传输状态
   */
  checkStatus(): void {
    if (!this.isActive) {
      return
    }

    this.sendToMain({
      type: 'get-status',
      sessionId: this.sessionId,
      zmodemSessionId: this.zmodemSessionId,
      callbackId: `status-${Date.now()}`
    })
  }

  /**
   * 处理来自主进程的消息
   */
  handleMainMessage(message: MainToWorkerMessage): void {
    switch (message.type) {
      case 'output-data':
        // 收到输出数据，需要发送到 SSH
        if (message.data) {
          const data = Buffer.isBuffer(message.data) ? message.data : Buffer.from(String(message.data), 'utf-8')
          this.outputBuffer = Buffer.concat([this.outputBuffer, data])
          
          // 通知主进程有数据需要发送
          this.sendToMain({
            type: 'output-data',
            sessionId: this.sessionId,
            data: this.outputBuffer
          })
          
          // 清空输出缓冲区
          this.outputBuffer = Buffer.alloc(0)
        }
        break

      case 'progress':
        // 进度信息已由主进程处理，这里可以记录日志
        if (message.progress) {
          // 可以在这里进行进度相关的处理或验证
        }
        break

      case 'status':
        if (message.status) {
          
          if (message.status.status === 2) {
            // 传输完成
            console.log(`[ZMODEM Worker] 传输完成`)
            this.isActive = false
            this.sendToMain({
              type: 'complete',
              sessionId: this.sessionId
            })
          } else if (message.status.status === 3) {
            // 传输错误
            console.error(`[ZMODEM Worker] 传输错误: ${message.status.message}`)
            this.isActive = false
            this.sendToMain({
              type: 'error',
              sessionId: this.sessionId,
              error: message.status.message
            })
          }
        }
        break

      case 'error':
        console.error(`[ZMODEM Worker] 收到错误: ${message.error}`)
        this.isActive = false
        break

      case 'complete':
        console.log(`[ZMODEM Worker] 传输完成`)
        this.isActive = false
        break

      case 'cleanup':
        this.cleanup()
        break

      default:
        console.warn(`[ZMODEM Worker] 未知消息类型: ${(message as any).type}`)
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    console.log(`[ZMODEM Worker] 开始清理资源`)
    this.isActive = false
    this.dataQueue = []
    this.outputBuffer = Buffer.alloc(0)
    
    // 请求主进程清理
    this.sendToMain({
      type: 'cleanup',
      sessionId: this.sessionId,
      zmodemSessionId: this.zmodemSessionId
    })
  }

  /**
   * 发送消息到主进程
   */
  private sendToMain(message: WorkerToMainMessage): void {
    if (parentPort) {
      parentPort.postMessage(message)
    } else {
      console.error(`[ZMODEM Worker] parentPort 不存在`)
    }
  }
}

// Worker 主逻辑
if (parentPort && workerData) {
  try {
    const worker = new ZMODEMWorker(workerData as WorkerData)
    
    // 监听来自主进程的消息
    parentPort.on('message', (message: MainToWorkerMessage) => {
      try {
        worker.handleMainMessage(message)
      } catch (error) {
        console.error(`[ZMODEM Worker] 处理消息失败:`, error)
        parentPort?.postMessage({
          type: 'error',
          sessionId: workerData.sessionId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })

    // 启动 Worker
    worker.start()

    // 定期检查输出数据（作为轮询机制）
    const checkInterval = setInterval(() => {
      if (worker['isActive']) {
        worker['checkOutput']()
      } else {
        clearInterval(checkInterval)
      }
    }, 10) // 每 10ms 检查一次

    console.log(`[ZMODEM Worker] Worker 初始化完成`)
  } catch (error) {
    console.error(`[ZMODEM Worker] Worker 初始化失败:`, error)
    if (parentPort) {
      parentPort.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
} else {
  console.error(`[ZMODEM Worker] Worker 初始化失败: parentPort 或 workerData 不存在`)
}
