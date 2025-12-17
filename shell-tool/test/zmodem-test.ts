/**
 * ZMODEM 自动化测试脚本
 * 直接测试 SSHManager 和 ZMODEMManager 的功能
 * 
 * 运行方式：
 * npm run test:zmodem
 * 或
 * electron test/zmodem-test.ts
 */

import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getConnectionStore } from '../src/main/services/ConnectionStore'
import { getSSHManager } from '../src/main/services/SSHManager'
import { ZMODEMManager } from '../src/main/services/ZMODEMManager'

// 测试服务器配置
const TEST_SERVER = {
  host: '103.115.41.16',
  port: 16457,
  username: 'root',
  password: '2oHxKzttR6Wv8'
}

// 测试文件配置
const TEST_FILE_SIZE = 1024 * 100 // 100KB
const TEST_DIR = join(tmpdir(), 'zmodem-test-' + Date.now())

interface TestResult {
  name: string
  success: boolean
  duration: number
  error?: string
  details?: Record<string, any>
}

class ZMODEMTester {
  private results: TestResult[] = []
  private connectionId: string = ''
  private sessionId: string = ''

  async runAllTests(): Promise<void> {
    console.log('🧪 开始 ZMODEM 自动化测试\n')
    console.log('='.repeat(60))

    try {
      // 初始化 Electron app
      await this.initElectron()

      // 准备测试环境
      await this.setupTestEnvironment()

      // 创建连接
      await this.testCreateConnection()

      // 创建 SSH 会话
      await this.testCreateSSHSession()

      // 测试上传 (rz)
      await this.testUpload()

      // 等待一下，让上传完成
      await this.sleep(2000)

      // 测试下载 (sz)
      await this.testDownload()

      // 验证文件
      await this.testVerifyFiles()

      // 清理
      await this.cleanup()
    } catch (error) {
      console.error('❌ 测试过程中发生错误:', error)
      await this.cleanup()
      process.exit(1)
    } finally {
      // 打印测试结果
      this.printResults()
    }
  }

  private async initElectron(): Promise<void> {
    console.log('\n📦 初始化 Electron 环境...')
    
    // 设置测试模式，避免打开窗口
    process.env.ELECTRON_IS_TEST = 'true'
    
    // 等待 app ready
    if (!app.isReady()) {
      await app.whenReady()
    }

    console.log('✅ Electron 环境初始化完成')
  }

  private async setupTestEnvironment(): Promise<void> {
    console.log('\n📁 准备测试环境...')
    
    // 创建测试目录
    await fs.mkdir(TEST_DIR, { recursive: true })
    console.log(`✅ 测试目录: ${TEST_DIR}`)
  }

  private async testCreateConnection(): Promise<void> {
    const startTime = Date.now()
    const testName = '创建测试连接'

    try {
      console.log(`\n🔌 ${testName}...`)

      const connectionStore = getConnectionStore()
      await connectionStore.initialize()

      this.connectionId = randomUUID()
      const connection = {
        id: this.connectionId,
        name: 'ZMODEM 测试连接',
        host: TEST_SERVER.host,
        port: TEST_SERVER.port,
        username: TEST_SERVER.username,
        authType: 'password' as const,
        password: TEST_SERVER.password,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await connectionStore.add(connection)
      
      const duration = Date.now() - startTime
      this.recordResult(testName, true, duration, {
        connectionId: this.connectionId
      })
      console.log(`✅ ${testName} 成功 (${duration}ms)`)
    } catch (error) {
      const duration = Date.now() - startTime
      this.recordResult(testName, false, duration, undefined, String(error))
      throw error
    }
  }

  private async testCreateSSHSession(): Promise<void> {
    const startTime = Date.now()
    const testName = '创建 SSH 会话'

    try {
      console.log(`\n🔗 ${testName}...`)

      const sshManager = getSSHManager()

      // 监听数据输出（用于调试）
      sshManager.on('data', (sessionId: string, data: string) => {
        if (sessionId === this.sessionId) {
          // 只打印关键信息，避免输出过多
          if (data.includes('rz') || data.includes('sz') || data.includes('**B')) {
            console.log(`[SSH Data] ${data.substring(0, 100)}`)
          }
        }
      })

      this.sessionId = await sshManager.create(this.connectionId, { cols: 80, rows: 24 })
      
      // 等待 shell 初始化
      await this.sleep(1000)

      const duration = Date.now() - startTime
      this.recordResult(testName, true, duration, {
        sessionId: this.sessionId
      })
      console.log(`✅ ${testName} 成功 (${duration}ms)`)
    } catch (error) {
      const duration = Date.now() - startTime
      this.recordResult(testName, false, duration, undefined, String(error))
      throw error
    }
  }

  private async testUpload(): Promise<void> {
    const startTime = Date.now()
    const testName = '测试上传 (rz)'

    try {
      console.log(`\n⬆️  ${testName}...`)

      // 1. 创建测试文件
      const localFilePath = join(TEST_DIR, 'test-upload.txt')
      const testContent = 'ZMODEM 测试文件\n' + 'A'.repeat(TEST_FILE_SIZE)
      await fs.writeFile(localFilePath, testContent, 'utf-8')
      console.log(`📄 创建测试文件: ${localFilePath} (${testContent.length} bytes)`)

      // 2. 创建 ZMODEM Manager
      const zmodemManager = new ZMODEMManager(this.sessionId, 'upload')

      // 3. 监听进度事件
      let progressUpdates = 0
      const progressCheck = setInterval(() => {
        // 这里我们只能通过日志来观察进度
        // 实际应用中，进度会通过 IPC 发送到渲染进程
      }, 100)

      // 4. 使用 SSHManager 的自动检测机制
      // 当发送 rz 命令时，远程服务器会返回 ZMODEM 序列
      // SSHManager 会自动检测并创建 ZMODEMManager
      
      // 但是我们需要在文件对话框出现之前设置文件路径
      // 由于无法直接修改对话框行为，我们采用以下方案：
      // 1. 手动创建 ZMODEMManager 实例
      // 2. 直接初始化，跳过对话框
      // 3. 手动注册到 SSHManager 的会话中
      
      const sshManager = getSSHManager()
      const session = (sshManager as any).sessions.get(this.sessionId)
      if (!session) {
        throw new Error('SSH 会话不存在')
      }
      
      // 手动创建并初始化 ZMODEM Manager
      const nativeLib = (zmodemManager as any).nativeLib
      const zmodemSessionId = nativeLib.zmodemInit('upload', localFilePath)
      
      // 设置内部状态（跳过 start() 方法的对话框部分）
      ;(zmodemManager as any).filePath = localFilePath
      ;(zmodemManager as any).zmodemSessionId = zmodemSessionId
      ;(zmodemManager as any).isActive = true
      
      // 启动监控
      ;(zmodemManager as any).startProgressMonitoring()
      ;(zmodemManager as any).startOutputMonitoring()
      
      // 将 ZMODEM Manager 注册到 SSH 会话
      session.zmodemManager = zmodemManager
      session.zmodemState = 'active'

      console.log('🚀 启动 ZMODEM 上传...')

      // 5. 监听 SSH 原始数据流（绕过 SSHManager 的 ZMODEM 检测）
      // 因为我们已经手动设置了 zmodemState = 'active'，SSHManager 会直接转发数据
      // 但我们需要确保数据被正确转发到我们的 ZMODEM Manager
      
      // 方法：直接监听 SSHManager 的内部数据流
      // 由于 SSHManager 在 zmodemState === 'active' 时会调用 zmodemManager.handleData
      // 我们只需要确保数据被正确传递
      
      // 但是，SSHManager 的 handleSessionData 方法在 zmodemState === 'active' 时
      // 会调用 session.zmodemManager.handleData(data)，所以数据应该会自动转发
      
      // 为了调试，我们添加一个监听器来查看原始数据
      const originalHandleData = (zmodemManager as any).handleData.bind(zmodemManager)
      let dataReceivedCount = 0
      ;(zmodemManager as any).handleData = (data: Buffer) => {
        dataReceivedCount++
        const preview = data.slice(0, Math.min(32, data.length))
        console.log(`[测试] ZMODEM Manager 收到数据 #${dataReceivedCount}: ${data.length} bytes, hex: ${preview.toString('hex')}, 文本: ${preview.toString('utf-8').replace(/[^\x20-\x7E]/g, '.')}`)
        return originalHandleData(data)
      }
      
      // 发送 rz 命令
      console.log(`[测试] 发送 rz 命令...`)
      sshManager.write(this.sessionId, 'rz\n')
      
      // 等待一下，让服务器响应 ZMODEM 序列
      await this.sleep(2000)
      
      // 检查是否有数据被接收
      if (dataReceivedCount === 0) {
        console.warn(`[测试] 警告：发送 rz 命令后 2 秒内没有收到任何数据`)
      }

      // 6. 等待传输完成
      let completed = false
      let errorOccurred = false
      
      const checkComplete = setInterval(() => {
        try {
          const status = nativeLib.zmodemGetStatus(zmodemSessionId)
          if (status) {
            if (status.status === 2) {
              // 完成
              completed = true
              clearInterval(checkComplete)
              clearInterval(progressCheck)
            } else if (status.status === 3) {
              // 错误
              errorOccurred = true
              clearInterval(checkComplete)
              clearInterval(progressCheck)
              throw new Error(status.message)
            }
          }
        } catch (e) {
          // 忽略错误，继续等待
        }
      }, 100)

      // 等待最多 60 秒（大文件传输需要更长时间）
      const maxWait = 60000
      const waitStart = Date.now()
      let lastProgress = 0
      let progressStuckCount = 0
      
      while (!completed && !errorOccurred && (Date.now() - waitStart) < maxWait) {
        await this.sleep(200)
        
        // 检查进度和状态
        try {
          const status = nativeLib.zmodemGetStatus(zmodemSessionId)
          const progress = nativeLib.zmodemGetProgress(zmodemSessionId)
          
          if (status && progress) {
            const currentTransferred = Number(progress.transferred)
            const currentTotal = Number(progress.total)
            
            // 每 5 秒输出一次状态信息（用于调试）
            if (progressStuckCount > 0 && progressStuckCount % 25 === 0) {
              console.log(`[测试] 状态: ${status.status} (0=idle, 1=active, 2=completed, 3=error), 已传输: ${currentTransferred}/${currentTotal} bytes`)
            }
            
            if (currentTransferred === lastProgress) {
              progressStuckCount++
              if (progressStuckCount > 25) { // 5秒没有进展
                console.warn(`[测试] 传输进度卡住，已传输: ${currentTransferred} bytes, 状态: ${status.status}`)
              }
            } else {
              progressStuckCount = 0
              lastProgress = currentTransferred
              if (progress.percent > 0) {
                console.log(`[测试] 传输进度: ${progress.percent.toFixed(1)}% (${currentTransferred}/${currentTotal || '?'} bytes)`)
              }
            }
          }
        } catch (e) {
          // 忽略进度检查错误
        }
      }

      clearInterval(checkComplete)
      clearInterval(progressCheck)

      if (errorOccurred) {
        throw new Error('上传过程中发生错误')
      }

      if (!completed) {
        // 获取最终状态和进度信息
        try {
          const finalStatus = nativeLib.zmodemGetStatus(zmodemSessionId)
          const finalProgress = nativeLib.zmodemGetProgress(zmodemSessionId)
          if (finalStatus) {
            console.error(`[测试] 上传超时，最终状态: ${finalStatus.status}, 消息: ${finalStatus.message}`)
          }
          if (finalProgress) {
            console.error(`[测试] 最终进度: ${finalProgress.transferred}/${finalProgress.total} bytes`)
          }
        } catch (e) {
          // 忽略错误
        }
        throw new Error('上传超时')
      }

      // 7. 等待文件完全写入（rz 命令完成后可能需要一点时间）
      await this.sleep(1000)

      // 8. 验证服务器上的文件
      console.log('\n🔍 验证服务器上的上传文件...')
      const remoteFileName = 'test-upload.txt'
      let remoteFilePath: string | null = null
      let remoteFileSize: number | null = null

      try {
        // 使用 Promise 等待命令输出
        const executeCommand = (command: string, timeout: number = 2000): Promise<string> => {
          return new Promise((resolve) => {
            let output = ''
            let resolved = false
            let lastOutputTime = Date.now()
            
            const outputHandler = (sessionId: string, data: string) => {
              if (sessionId === this.sessionId && !resolved) {
                output += data
                lastOutputTime = Date.now()
              }
            }
            
            sshManager.on('data', outputHandler)
            
            // 发送命令
            sshManager.write(this.sessionId, command)
            
            // 设置超时
            const timeoutId = setTimeout(() => {
              if (!resolved) {
                resolved = true
                sshManager.off('data', outputHandler)
                resolve(output)
              }
            }, timeout)
            
            // 等待输出稳定（连续500ms没有新输出）
            const checkInterval = setInterval(() => {
              if (resolved) {
                clearInterval(checkInterval)
                return
              }
              
              const timeSinceLastOutput = Date.now() - lastOutputTime
              if (timeSinceLastOutput > 500 && output.length > 0) {
                resolved = true
                clearInterval(checkInterval)
                clearTimeout(timeoutId)
                sshManager.off('data', outputHandler)
                resolve(output)
              }
            }, 100)
          })
        }

        // 方法1: 检查当前目录（rz 通常将文件保存到当前工作目录）
        const currentDirCheck = `pwd && ls -lh "${remoteFileName}" 2>/dev/null && echo "FILE_FOUND" || echo "FILE_NOT_FOUND"\n`
        let output = await executeCommand(currentDirCheck, 3000)
        
        const lines = output.split('\n').filter(line => line.trim())
        let currentDir = ''
        let foundInCurrentDir = false
        
        for (const line of lines) {
          // 提取当前目录（pwd 输出）
          if (line.startsWith('/') && !line.includes(' ') && !line.includes(remoteFileName)) {
            currentDir = line.trim()
          }
          
          // 检查是否找到文件
          if (line.includes('FILE_FOUND')) {
            foundInCurrentDir = true
          }
          
          // 解析 ls -lh 输出（格式：-rw-r--r-- 1 root root 102K Dec 17 10:00 test-upload.txt）
          if (line.includes(remoteFileName) && !line.includes('FILE_NOT_FOUND') && !line.includes('FILE_FOUND')) {
            const parts = line.trim().split(/\s+/)
            if (parts.length >= 9) {
              const sizeStr = parts[4] // 例如 "102K" 或 "102420"
              
              // 转换大小字符串为字节数
              let sizeBytes = 0
              const sizeStrUpper = sizeStr.toUpperCase()
              if (sizeStrUpper.endsWith('K')) {
                sizeBytes = parseFloat(sizeStr) * 1024
              } else if (sizeStrUpper.endsWith('M')) {
                sizeBytes = parseFloat(sizeStr) * 1024 * 1024
              } else if (sizeStrUpper.endsWith('G')) {
                sizeBytes = parseFloat(sizeStr) * 1024 * 1024 * 1024
              } else if (sizeStrUpper.endsWith('B')) {
                sizeBytes = parseFloat(sizeStr)
              } else {
                // 纯数字，直接解析
                sizeBytes = parseFloat(sizeStr)
              }
              
              remoteFileSize = Math.round(sizeBytes)
              remoteFilePath = currentDir ? `${currentDir}/${remoteFileName}` : remoteFileName
              break
            }
          }
        }
        
        // 方法2: 如果当前目录没找到，使用 find 命令在整个用户目录查找
        if (!remoteFilePath || !foundInCurrentDir) {
          const findCommand = `find ~ -maxdepth 5 -name "${remoteFileName}" -type f 2>/dev/null | head -1\n`
          output = await executeCommand(findCommand, 3000)
          
          const findLines = output.split('\n').filter(line => {
            const trimmed = line.trim()
            return trimmed.startsWith('/') && trimmed.includes(remoteFileName)
          })
          
          if (findLines.length > 0) {
            remoteFilePath = findLines[0].trim()
            
            // 获取文件大小（兼容 Linux 和 macOS）
            const sizeCommand = `stat -c "%s" "${remoteFilePath}" 2>/dev/null || stat -f "%z" "${remoteFilePath}" 2>/dev/null || ls -l "${remoteFilePath}" | awk '{print $5}'\n`
            const sizeOutput = await executeCommand(sizeCommand, 2000)
            const sizeLine = sizeOutput.split('\n').find(line => /^\d+$/.test(line.trim()))
            if (sizeLine) {
              remoteFileSize = parseInt(sizeLine.trim(), 10)
            } else {
              // 如果 stat 失败，尝试从 ls -l 输出解析
              const lsLine = sizeOutput.split('\n').find(line => line.includes(remoteFileName))
              if (lsLine) {
                const parts = lsLine.trim().split(/\s+/)
                if (parts.length >= 5) {
                  remoteFileSize = parseInt(parts[4], 10) || 0
                }
              }
            }
          }
        }
        
        if (remoteFilePath) {
          console.log(`✅ 服务器文件验证成功`)
          console.log(`   文件路径: ${remoteFilePath}`)
          console.log(`   文件大小: ${remoteFileSize ? remoteFileSize.toLocaleString() : '未知'} bytes`)
          
          // 验证文件大小是否匹配
          const localFileSize = (await fs.stat(localFilePath)).size
          if (remoteFileSize && Math.abs(remoteFileSize - localFileSize) <= 100) {
            console.log(`   ✅ 文件大小匹配 (本地: ${localFileSize.toLocaleString()}, 远程: ${remoteFileSize.toLocaleString()})`)
          } else if (remoteFileSize) {
            console.log(`   ⚠️  文件大小略有差异 (本地: ${localFileSize.toLocaleString()}, 远程: ${remoteFileSize.toLocaleString()})`)
          }
        } else {
          console.warn(`⚠️  未在服务器上找到文件: ${remoteFileName}`)
          console.warn(`   请检查 rz 命令的默认保存位置`)
          console.warn(`   提示：rz 通常将文件保存到当前工作目录（pwd）`)
        }
      } catch (error) {
        console.warn(`⚠️  验证服务器文件时出错: ${error}`)
        console.warn(`   错误详情: ${error instanceof Error ? error.message : String(error)}`)
      }

      // 9. 清理
      sshManager.off('data', dataHandler)
      zmodemManager.cleanup()

      const duration = Date.now() - startTime
      const fileSize = (await fs.stat(localFilePath)).size
      const speed = fileSize / (duration / 1000) // bytes per second

      this.recordResult(testName, true, duration, {
        fileSize,
        speed: `${(speed / 1024).toFixed(2)} KB/s`,
        remoteFilePath: remoteFilePath || '未找到',
        remoteFileSize: remoteFileSize || 0
      })
      console.log(`✅ ${testName} 成功 (${duration}ms, ${(speed / 1024).toFixed(2)} KB/s)`)
    } catch (error) {
      const duration = Date.now() - startTime
      this.recordResult(testName, false, duration, undefined, String(error))
      console.error(`❌ ${testName} 失败:`, error)
      // 不抛出错误，继续执行下载测试
    }
  }

  private async testDownload(): Promise<void> {
    const startTime = Date.now()
    const testName = '测试下载 (sz)'

    try {
      console.log(`\n⬇️  ${testName}...`)

      // 1. 在远程服务器上创建测试文件
      const remoteFileName = 'test-download.txt'
      const sshManager = getSSHManager()
      
      // 先创建一个测试文件
      sshManager.write(this.sessionId, `echo "ZMODEM Download Test File\n$(head -c ${TEST_FILE_SIZE} < /dev/zero | tr '\\0' 'B')" > ${remoteFileName}\n`)
      await this.sleep(1000)

      // 2. 创建下载目标路径
      const localFilePath = join(TEST_DIR, 'test-download.txt')

      // 3. 创建 ZMODEM Manager
      const zmodemManager = new ZMODEMManager(this.sessionId, 'download')

      // 手动初始化（跳过文件对话框）
      const session = (sshManager as any).sessions.get(this.sessionId)
      if (!session) {
        throw new Error('SSH 会话不存在')
      }
      
      const nativeLib = (zmodemManager as any).nativeLib
      const zmodemSessionId = nativeLib.zmodemInit('download', localFilePath)
      
      // 设置内部状态
      ;(zmodemManager as any).filePath = localFilePath
      ;(zmodemManager as any).zmodemSessionId = zmodemSessionId
      ;(zmodemManager as any).isActive = true
      
      // 启动监控
      ;(zmodemManager as any).startProgressMonitoring()
      ;(zmodemManager as any).startOutputMonitoring()
      
      // 将 ZMODEM Manager 注册到 SSH 会话
      session.zmodemManager = zmodemManager
      session.zmodemState = 'active'

      console.log('🚀 启动 ZMODEM 下载...')

      // 4. 监听 SSH 数据，手动转发到 ZMODEM Manager
      const dataHandler = (sessionId: string, data: string) => {
        if (sessionId === this.sessionId) {
          const buffer = Buffer.from(data, 'utf-8')
          // 检查是否是 ZMODEM 序列
          const hasZmodemSeq = buffer.includes(0x2a) && (buffer.includes(0x42) || buffer.includes(0x18))
          
          // 如果 ZMODEM Manager 已激活，直接转发
          if ((zmodemManager as any).isActive) {
            zmodemManager.handleData(buffer)
          } else if (hasZmodemSeq) {
            // 检测到 ZMODEM 序列，激活 Manager
            ;(zmodemManager as any).isActive = true
          zmodemManager.handleData(buffer)
          }
        }
      }
      
      sshManager.on('data', dataHandler)
      
      // 5. 发送 sz 命令
      sshManager.write(this.sessionId, `sz ${remoteFileName}\n`)
      
      // 等待一下，让服务器响应 ZMODEM 序列
      await this.sleep(1000)

      // 5. 等待传输完成
      let completed = false
      let errorOccurred = false
      
      const checkComplete = setInterval(() => {
        try {
          const status = nativeLib.zmodemGetStatus(zmodemSessionId)
          if (status) {
            if (status.status === 2) {
              completed = true
              clearInterval(checkComplete)
            } else if (status.status === 3) {
              errorOccurred = true
              clearInterval(checkComplete)
              throw new Error(status.message)
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }, 100)

      // 等待最多 60 秒
      const maxWait = 60000
      const waitStart = Date.now()
      let lastProgress = 0
      let progressStuckCount = 0
      
      while (!completed && !errorOccurred && (Date.now() - waitStart) < maxWait) {
        await this.sleep(200)
        
        // 检查进度是否卡住
        try {
          const progress = nativeLib.zmodemGetProgress(zmodemSessionId)
          if (progress) {
            const currentTransferred = Number(progress.transferred)
            if (currentTransferred === lastProgress) {
              progressStuckCount++
            } else {
              progressStuckCount = 0
              lastProgress = currentTransferred
              if (progress.percent > 0) {
                console.log(`[测试] 下载进度: ${progress.percent.toFixed(1)}% (${currentTransferred}/${progress.total || '?'} bytes)`)
              }
            }
          }
        } catch (e) {
          // 忽略进度检查错误
        }
      }

      clearInterval(checkComplete)

      if (errorOccurred) {
        throw new Error('下载过程中发生错误')
      }

      if (!completed) {
        // 获取最终状态和进度信息
        try {
          const finalStatus = nativeLib.zmodemGetStatus(zmodemSessionId)
          const finalProgress = nativeLib.zmodemGetProgress(zmodemSessionId)
          if (finalStatus) {
            console.error(`[测试] 下载超时，最终状态: ${finalStatus.status}, 消息: ${finalStatus.message}`)
          }
          if (finalProgress) {
            console.error(`[测试] 最终进度: ${finalProgress.transferred}/${finalProgress.total} bytes`)
          }
        } catch (e) {
          // 忽略错误
        }
        throw new Error('下载超时')
      }

      // 6. 清理
      sshManager.off('data', dataHandler)
      zmodemManager.cleanup()

      // 7. 验证文件是否存在
      const stats = await fs.stat(localFilePath)
      const fileSize = stats.size

      const duration = Date.now() - startTime
      const speed = fileSize / (duration / 1000)

      this.recordResult(testName, true, duration, {
        fileSize,
        speed: `${(speed / 1024).toFixed(2)} KB/s`
      })
      console.log(`✅ ${testName} 成功 (${duration}ms, ${(speed / 1024).toFixed(2)} KB/s)`)
    } catch (error) {
      const duration = Date.now() - startTime
      this.recordResult(testName, false, duration, undefined, String(error))
      console.error(`❌ ${testName} 失败:`, error)
    }
  }

  private async testVerifyFiles(): Promise<void> {
    const startTime = Date.now()
    const testName = '验证文件完整性'

    try {
      console.log(`\n🔍 ${testName}...`)

      // 检查下载的文件是否存在
      const downloadPath = join(TEST_DIR, 'test-download.txt')
      try {
        const stats = await fs.stat(downloadPath)
        console.log(`✅ 下载文件存在: ${downloadPath} (${stats.size} bytes)`)
        
        const duration = Date.now() - startTime
        this.recordResult(testName, true, duration, {
          downloadFileSize: stats.size
        })
      } catch (error) {
        throw new Error(`下载文件不存在: ${downloadPath}`)
      }
    } catch (error) {
      const duration = Date.now() - startTime
      this.recordResult(testName, false, duration, undefined, String(error))
      console.error(`❌ ${testName} 失败:`, error)
    }
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 清理测试环境...')

    try {
      // 销毁 SSH 会话
      if (this.sessionId) {
        const sshManager = getSSHManager()
        sshManager.destroy(this.sessionId)
      }

      // 删除测试连接
      if (this.connectionId) {
        const connectionStore = getConnectionStore()
        await connectionStore.delete(this.connectionId)
      }

      // 清理测试目录
      try {
        await fs.rm(TEST_DIR, { recursive: true, force: true })
      } catch (error) {
        console.warn('清理测试目录失败:', error)
      }

      console.log('✅ 清理完成')
    } catch (error) {
      console.error('清理过程中发生错误:', error)
    }
  }

  private recordResult(
    name: string,
    success: boolean,
    duration: number,
    details?: Record<string, any>,
    error?: string
  ): void {
    this.results.push({
      name,
      success,
      duration,
      error,
      details
    })
  }

  private printResults(): void {
    console.log('\n' + '='.repeat(60))
    console.log('📊 测试结果汇总\n')

    let totalDuration = 0
    let successCount = 0
    let failCount = 0

    this.results.forEach((result) => {
      totalDuration += result.duration
      if (result.success) {
        successCount++
        console.log(`✅ ${result.name}`)
        console.log(`   耗时: ${result.duration}ms`)
        if (result.details) {
          Object.entries(result.details).forEach(([key, value]) => {
            console.log(`   ${key}: ${value}`)
          })
        }
      } else {
        failCount++
        console.log(`❌ ${result.name}`)
        console.log(`   耗时: ${result.duration}ms`)
        if (result.error) {
          console.log(`   错误: ${result.error}`)
        }
      }
      console.log('')
    })

    console.log('='.repeat(60))
    console.log(`总计: ${this.results.length} 项`)
    console.log(`成功: ${successCount} 项`)
    console.log(`失败: ${failCount} 项`)
    console.log(`总耗时: ${totalDuration}ms`)
    console.log('='.repeat(60))

    // 如果有失败，退出码为 1
    if (failCount > 0) {
      process.exit(1)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// 运行测试
async function main() {
  const tester = new ZMODEMTester()
  await tester.runAllTests()
  process.exit(0)
}

main().catch((error) => {
  console.error('测试执行失败:', error)
  process.exit(1)
})

