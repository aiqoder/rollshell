import { EventEmitter } from 'events'
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import { promises as fs } from 'fs'
import { join } from 'path'
import { getConnectionStore } from './ConnectionStore'

interface SSHSession {
  id: string
  connectionId: string
  client: Client
  channel: ClientChannel
  zmodemState: 'normal' | 'detecting' | 'active'
  zmodemBuffer: Buffer
  zmodemManager?: any // ZMODEMManager - 使用 any 避免循环依赖
}

/**
 * SSHManager - 远程 SSH 会话管理
 */
export class SSHManager extends EventEmitter {
  private sessions: Map<string, SSHSession> = new Map()
  private idCounter = 0

  private generateId(): string {
    return `ssh-${Date.now()}-${++this.idCounter}`
  }

  /**
   * 创建远程 SSH 会话并打开 shell
   */
  async create(
    connectionId: string,
    size?: { cols: number; rows: number }
  ): Promise<string> {
    const connectionStore = getConnectionStore()
    const connection = await connectionStore.getById(connectionId)
    if (!connection) {
      throw new Error(`连接不存在: ${connectionId}`)
    }

    const client = new Client()
    const sessionId = this.generateId()

    const config: ConnectConfig = {
      host: connection.host,
      port: connection.port ?? 22,
      username: connection.username,
      tryKeyboard: false
    }

    if (connection.authType === 'password') {
      config.password = connection.password
    } else if (connection.authType === 'publickey' && connection.privateKeyPath) {
      const keyPath = connection.privateKeyPath.startsWith('~')
        ? join(process.env.HOME || '', connection.privateKeyPath.slice(1))
        : connection.privateKeyPath
      config.privateKey = await fs.readFile(keyPath)
      if (connection.passphrase) {
        config.passphrase = connection.passphrase
      }
    }

    await new Promise<void>((resolve, reject) => {
      client
        .on('ready', () => {
          client.shell(
            {
              term: 'xterm-256color',
              cols: size?.cols ?? 80,
              rows: size?.rows ?? 24
            },
            (err, stream) => {
              if (err) {
                reject(err)
                return
              }

              const sshSession: SSHSession = {
                id: sessionId,
                connectionId,
                client,
                channel: stream,
                zmodemState: 'normal',
                zmodemBuffer: Buffer.alloc(0)
              }

              this.sessions.set(sessionId, sshSession)

              stream.on('data', (data: Buffer) => {
                this.handleSessionData(sessionId, data)
              })

              stream.on('close', (code: number) => {
                this.emit('exit', sessionId, code ?? 0)
                this.destroy(sessionId)
              })

              client.on('error', () => {
                this.emit('exit', sessionId, 255)
                this.destroy(sessionId)
              })

              resolve()
            }
          )
        })
        .on('error', reject)
        .connect(config)
    })

    return sessionId
  }

  /**
   * 处理会话数据，检测 ZMODEM 启动序列
   */
  private handleSessionData(sessionId: string, data: Buffer): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.warn(`[SSHManager] 会话不存在: ${sessionId}`)
      return
    }

    // 如果已经在 ZMODEM 模式下，直接转发给 ZMODEMManager
    if (session.zmodemState === 'active' && session.zmodemManager) {
      console.log(`[SSHManager] [${sessionId}] ZMODEM 活跃模式，转发数据到 Manager (${data.length} bytes)`)

      const manager: any = session.zmodemManager

      // 直接模式（ZMODEMManager）：handleData(data)
      if (typeof manager.handleData === 'function') {
        manager.handleData(data)
      } else {
        console.warn(`[SSHManager] [${sessionId}] zmodemManager 不支持 handleData，类型: ${typeof manager}`)
      }
      return
    }

    // 检测 ZMODEM 启动序列
    const detected = this.detectZMODEMSequence(session, data)
    if (detected) {
      console.log(`[SSHManager] [${sessionId}] ========== ZMODEM 序列检测成功 ==========`)
      console.log(`[SSHManager] [${sessionId}] 模式: ${detected.mode === 'upload' ? '上传 (rz)' : '下载 (sz)'}`)
      console.log(`[SSHManager] [${sessionId}] 当前状态: ${session.zmodemState}`)
      console.log(`[SSHManager] [${sessionId}] 检测到的数据 (hex): ${data.toString('hex').substring(0, 32)}...`)
      console.log(`[SSHManager] [${sessionId}] 缓冲区大小: ${session.zmodemBuffer.length} bytes`)
      
      session.zmodemState = 'active'
      console.log(`[SSHManager] [${sessionId}] 状态切换: ${session.zmodemState}`)
      
      // 直接模式（ZMODEMManager）：通过 Go 动态库处理 ZMODEM 协议
      const importStartTime = Date.now()
      import('./ZMODEMManager').then(({ ZMODEMManager }) => {
        const importTime = Date.now() - importStartTime
        console.log(`[SSHManager] [${sessionId}] ZMODEMManager 导入成功 (耗时: ${importTime}ms)`)
        console.log(`[SSHManager] [${sessionId}] 开始创建 ZMODEMManager 实例`)
        
        session.zmodemManager = new ZMODEMManager(sessionId, detected.mode)
        console.log(`[SSHManager] [${sessionId}] ZMODEMManager 实例创建成功`)
        
        const startTime = Date.now()
        session.zmodemManager.start().then(() => {
          const startTimeElapsed = Date.now() - startTime
          console.log(`[SSHManager] [${sessionId}] ZMODEM Manager 启动成功 (耗时: ${startTimeElapsed}ms)`)
        }).catch((err) => {
          const startTimeElapsed = Date.now() - startTime
          console.error(`[SSHManager] [${sessionId}] ZMODEM 启动失败 (耗时: ${startTimeElapsed}ms):`, err)
          console.error(`[SSHManager] [${sessionId}] 错误堆栈:`, err instanceof Error ? err.stack : '无堆栈信息')
          this.exitZMODEM(sessionId)
        })
      }).catch((err) => {
        const importTime = Date.now() - importStartTime
        console.error(`[SSHManager] [${sessionId}] ZMODEMManager 导入失败 (耗时: ${importTime}ms):`, err)
        console.error(`[SSHManager] [${sessionId}] 错误堆栈:`, err instanceof Error ? err.stack : '无堆栈信息')
        this.exitZMODEM(sessionId)
      })
      // 不将 ZMODEM 启动序列显示在终端
      return
    }

    // 正常模式：转为字符串给终端显示
    // 在测试环境中减少日志输出
    const isTestMode = process.env.ELECTRON_IS_TEST === 'true'
    if (!isTestMode && session.zmodemState === 'normal' && session.zmodemBuffer.length > 0) {
      const hasSuspiciousChars = data.includes(0x2a) || data.includes(0x18) // 包含 '*' 或 CAN
      if (hasSuspiciousChars) {
        try {
          console.log(`[SSHManager] [${sessionId}] 正常模式，发现可疑字符，缓冲区大小: ${session.zmodemBuffer.length} bytes`)
        } catch (e: any) {
          // 忽略 EPIPE 错误
          if (e.code !== 'EPIPE') throw e
        }
      }
    }
    this.emit('data', sessionId, data.toString())
  }

  /**
   * 检测 ZMODEM 启动序列
   * @returns 如果检测到，返回模式 ('upload' | 'download')，否则返回 null
   */
  private detectZMODEMSequence(session: SSHSession, data: Buffer): { mode: 'upload' | 'download' } | null {
    // ZMODEM 启动序列：
    // sz (下载，远程→本地): **B00 (ASCII: 0x2A 0x2A 0x42 0x30 0x30)
    // rz (上传，本地→远程): **B01 (ASCII: 0x2A 0x2A 0x42 0x30 0x31)
    // 注意：有些实现可能使用 **\x18B00/10，但常见的是直接的 ASCII 字符串

    // const prevBufferSize = session.zmodemBuffer.length // 用于调试日志，当前已禁用
    
    // 维护一个滑动窗口缓冲区（最多保留最近 256 字节用于检测，避免序列被分割）
    const MAX_BUFFER_SIZE = 256
    session.zmodemBuffer = Buffer.concat([session.zmodemBuffer, data])
    if (session.zmodemBuffer.length > MAX_BUFFER_SIZE) {
      const removedBytes = session.zmodemBuffer.length - MAX_BUFFER_SIZE
      session.zmodemBuffer = session.zmodemBuffer.slice(-MAX_BUFFER_SIZE)
      console.log(`[SSHManager] [检测] 缓冲区溢出，移除前 ${removedBytes} 字节，保留最后 ${MAX_BUFFER_SIZE} 字节`)
    }

    const buffer = session.zmodemBuffer
    
    // 检测不同的 ZMODEM 序列格式
    // 格式1: ASCII 格式（最常见）
    const szPattern = Buffer.from('**B00', 'ascii') // sz (下载): **B00
    const rzPattern = Buffer.from('**B01', 'ascii') // rz (上传): **B01
    
    // 格式2: 双星号 + 0x18 变体
    const szPatternAlt1 = Buffer.from([0x2a, 0x2a, 0x18, 0x42, 0x30, 0x30]) // **\x18B00
    const rzPatternAlt1 = Buffer.from([0x2a, 0x2a, 0x18, 0x42, 0x31, 0x30]) // **\x18B10
    
    // 格式3: 单星号 + 0x18（实际发现的格式）
    const szPatternAlt2 = Buffer.from([0x2a, 0x18, 0x42, 0x30, 0x30]) // *\x18B00
    const rzPatternAlt2 = Buffer.from([0x2a, 0x18, 0x42, 0x30, 0x31]) // *\x18B01

    // 查找所有可能的模式
    const szIndex = buffer.indexOf(szPattern)
    const rzIndex = buffer.indexOf(rzPattern)
    const szIndexAlt1 = buffer.indexOf(szPatternAlt1)
    const rzIndexAlt1 = buffer.indexOf(rzPatternAlt1)
    const szIndexAlt2 = buffer.indexOf(szPatternAlt2)
    const rzIndexAlt2 = buffer.indexOf(rzPatternAlt2)

    // 检查是否包含可能的 ZMODEM 序列开头
    const hasPotentialStart = buffer.includes(0x2a) && buffer.includes(0x42) // 包含 '*' 和 'B'
    
    // 详细日志：仅在非测试环境且确实检测到模式时输出
    const isTestMode = process.env.ELECTRON_IS_TEST === 'true'
    const hasDetectedPattern = szIndex !== -1 || rzIndex !== -1 || szIndexAlt1 !== -1 || rzIndexAlt1 !== -1 || szIndexAlt2 !== -1 || rzIndexAlt2 !== -1
    
    if (!isTestMode && (hasDetectedPattern || (hasPotentialStart && buffer.length >= 5))) {
      // 安全的日志函数，捕获 EPIPE 错误
      const safeLog = (msg: string) => {
        try {
          console.log(msg)
        } catch (e: any) {
          // 忽略 EPIPE 等写入错误
          if (e.code !== 'EPIPE') {
            // 其他错误可以选择记录或忽略
          }
        }
      }

      if (hasDetectedPattern) {
        safeLog(`[SSHManager] [检测] ✓ 检测到 ZMODEM 序列`)
      } else if (hasPotentialStart) {
        // 只在有潜在序列时输出简要信息
        safeLog(`[SSHManager] [检测] 缓冲区: ${buffer.length} bytes, 包含可能的 ZMODEM 序列开头`)
      }
    }

    // 优先检测 ASCII 格式，然后检测各种变体格式
    if (szIndex !== -1 || szIndexAlt1 !== -1 || szIndexAlt2 !== -1) {
      // 检测到 sz (下载)
      let matchType = 'Unknown'
      let matchPos = -1
      if (szIndex !== -1) {
        matchType = 'ASCII'
        matchPos = szIndex
      } else if (szIndexAlt1 !== -1) {
        matchType = 'Alt1 (**\\x18B00)'
        matchPos = szIndexAlt1
      } else if (szIndexAlt2 !== -1) {
        matchType = 'Alt2 (*\\x18B00)'
        matchPos = szIndexAlt2
      }
      console.log(`[SSHManager] [检测] ✓ 检测到 sz (下载) 序列，类型: ${matchType}，位置: ${matchPos}`)
      session.zmodemBuffer = Buffer.alloc(0) // 清空缓冲区
      return { mode: 'download' }
    }

    if (rzIndex !== -1 || rzIndexAlt1 !== -1 || rzIndexAlt2 !== -1) {
      // 检测到 rz (上传)
      let matchType = 'Unknown'
      let matchPos = -1
      if (rzIndex !== -1) {
        matchType = 'ASCII'
        matchPos = rzIndex
      } else if (rzIndexAlt1 !== -1) {
        matchType = 'Alt1 (**\\x18B10)'
        matchPos = rzIndexAlt1
      } else if (rzIndexAlt2 !== -1) {
        matchType = 'Alt2 (*\\x18B01)'
        matchPos = rzIndexAlt2
      }
      console.log(`[SSHManager] [检测] ✓ 检测到 rz (上传) 序列，类型: ${matchType}，位置: ${matchPos}`)
      session.zmodemBuffer = Buffer.alloc(0) // 清空缓冲区
      return { mode: 'upload' }
    }

    return null
  }

  /**
   * 退出 ZMODEM 模式，恢复正常终端模式
   */
  exitZMODEM(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.warn(`[SSHManager] [${sessionId}] exitZMODEM: 会话不存在`)
      return
    }

    console.log(`[SSHManager] [${sessionId}] ========== 退出 ZMODEM 模式 ==========`)
    console.log(`[SSHManager] [${sessionId}] 当前状态: ${session.zmodemState}`)

    if (session.zmodemManager) {
      console.log(`[SSHManager] [${sessionId}] 销毁 ZMODEM Manager`)
      const manager: any = session.zmodemManager

      // Worker 模式：调用 cleanup(sessionId)
      if (manager.isWorkerManager && typeof manager.cleanup === 'function') {
        manager.cleanup(sessionId)
      }
      // 直接模式：调用 destroy()
      else if (typeof manager.destroy === 'function') {
        manager.destroy()
      }

      session.zmodemManager = undefined
    }

    session.zmodemState = 'normal'
    session.zmodemBuffer = Buffer.alloc(0)
    console.log(`[SSHManager] [${sessionId}] 状态已恢复为: ${session.zmodemState}`)
  }

  /**
   * 获取会话的 ZMODEM 状态（供外部使用）
   */
  getZMODEMState(sessionId: string): 'normal' | 'detecting' | 'active' | null {
    const session = this.sessions.get(sessionId)
    return session?.zmodemState || null
  }

  write(sessionId: string, data: string | Buffer): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`SSH 会话不存在: ${sessionId}`)
    
    const dataSize = data instanceof Buffer ? data.length : Buffer.byteLength(String(data), 'utf8')
    
    // 如果在 ZMODEM 模式下，直接写入二进制数据到 channel
    // 注意：ZMODEMManager 会通过此方法发送数据到 SSH
    if (session.zmodemState === 'active') {
      console.log(`[SSHManager] [${sessionId}] ZMODEM 模式写入数据: ${dataSize} bytes`)
      const buffer = data instanceof Buffer ? data : Buffer.from(String(data), 'utf8')
      session.channel.write(buffer)
    } else {
      // 正常模式：写入字符串
      const str = data instanceof Buffer ? data.toString() : data
      session.channel.write(str)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`SSH 会话不存在: ${sessionId}`)
    session.channel.setWindow(rows, cols)
  }

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    
    // 清理 ZMODEM 管理器
    this.exitZMODEM(sessionId)
    
    try {
      session.channel.close()
    } catch {}
    try {
      session.client.end()
    } catch {}
    this.sessions.delete(sessionId)
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroy(id)
    }
  }
}

let sshManagerInstance: SSHManager | null = null

export function getSSHManager(): SSHManager {
  if (!sshManagerInstance) {
    sshManagerInstance = new SSHManager()
  }
  return sshManagerInstance
}

export function resetSSHManager(): void {
  sshManagerInstance?.destroyAll()
  sshManagerInstance = null
}

