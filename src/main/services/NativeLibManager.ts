import koffi from 'koffi'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// C 结构体类型定义
interface ZmodemProgress {
  transferred: bigint
  total: bigint
  percent: number
}

interface ZmodemStatus {
  status: number // 0=idle, 1=active, 2=completed, 3=error
  message: string | null
}

/**
 * NativeLibManager - 统一管理动态库调用
 * 单例模式，负责加载 Go 动态库并提供类型安全的 API
 */
export class NativeLibManager {
  private static instance: NativeLibManager | null = null
  private lib: any = null
  private isLoaded: boolean = false
  private libPath: string | null = null

  // 结构体类型（用于 decode 指针返回值）
  private ZmodemProgressType: any = null
  private ZmodemStatusType: any = null

  // C API 函数指针
  private ZmodemInit: ((mode: number, filePath: string) => number) | null = null
  private ZmodemFeedData: ((sessionId: number, data: Buffer, dataLen: number) => number) | null = null
  private ZmodemGetOutputData: ((sessionId: number, buffer: Buffer, bufferLen: number) => number) | null = null
  private ZmodemGetProgress: ((sessionId: number) => ZmodemProgress | null) | null = null
  private ZmodemFreeProgress: ((progress: ZmodemProgress | null) => void) | null = null
  private ZmodemGetStatus: ((sessionId: number) => ZmodemStatus | null) | null = null
  private ZmodemFreeStatus: ((status: ZmodemStatus | null) => void) | null = null
  private ZmodemCleanup: ((sessionId: number) => void) | null = null

  private constructor() {
    // 私有构造函数，确保单例
  }

  /**
   * 获取单例实例
   */
  static getInstance(): NativeLibManager {
    if (!NativeLibManager.instance) {
      NativeLibManager.instance = new NativeLibManager()
    }
    return NativeLibManager.instance
  }

  /**
   * 获取动态库路径
   */
  private getLibPath(): string {
    if (this.libPath) {
      return this.libPath
    }

    const platform = process.platform
    let libName: string

    if (platform === 'darwin') {
      libName = 'lib.dylib'
    } else if (platform === 'win32') {
      libName = 'lib.dll'
    } else {
      libName = 'lib.so'
    }

    const candidateBases: string[] = []

    if (is.dev) {
      // 开发环境
      // 1. 原有逻辑：从 out/main/services 或 src/main/services 回到 out/libs
      candidateBases.push(join(__dirname, '../../libs'))

      // 2. 项目根目录 libs（适配直接用 tsx 跑 src/*.ts 的场景）
      //    __dirname 可能是：
      //    - <project>/src/main/services
      //    - <project>/out/main/services
      //    向上三级可以回到项目根目录
      const projectRoot = join(__dirname, '../../../')
      candidateBases.push(join(projectRoot, 'libs'))

      // 3. 基于 appPath 的兜底（有些环境下 appPath 就是项目根）
      try {
        const appPath = app.getAppPath()
        candidateBases.push(join(appPath, 'out', 'libs'))
        candidateBases.push(join(appPath, 'libs'))
      } catch {
        // app 可能尚未就绪，这里忽略错误
      }
    } else {
      // 生产环境：从打包后的资源目录加载
      // electron-builder 会将 out/libs/ 复制到 resources 目录
      // 由于配置了 asarUnpack，动态库会在 app.asar.unpacked/out/libs/ 中
      const appPath = app.getAppPath()
      candidateBases.push(join(appPath, 'out', 'libs'))

      const resourcesPath = process.resourcesPath
      if (resourcesPath) {
        candidateBases.push(join(resourcesPath, 'app', 'out', 'libs'))
      }
    }

    // 依次尝试候选路径，找到第一个存在的动态库文件
    for (const base of candidateBases) {
      const fullPath = join(base, libName)
      if (existsSync(fullPath)) {
        console.log(`[NativeLibManager] 动态库路径: ${fullPath}`)
        this.libPath = fullPath
        return fullPath
      }
    }

    // 没有找到时，给出更详细的错误信息，便于排查
    console.error('[NativeLibManager] 未找到可用的动态库路径，已尝试的目录:', candidateBases)
    const fallbackFullPath = candidateBases.length > 0 ? join(candidateBases[0], libName) : join(__dirname, libName)
    throw new Error(`动态库文件不存在: ${fallbackFullPath}`)
  }

  /**
   * 加载动态库
   */
  private loadLibrary(): void {
    if (this.isLoaded && this.lib) {
      return
    }

    try {
      const libPath = this.getLibPath()
      console.log(`[NativeLibManager] 正在加载动态库: ${libPath}`)

      this.lib = koffi.load(libPath)
      this.isLoaded = true

      // 注册结构体类型（需要在函数定义之前）
      this.ZmodemProgressType = koffi.struct('ZmodemProgress', {
        transferred: 'int64',
        total: 'int64',
        percent: 'double'
      })

      this.ZmodemStatusType = koffi.struct('ZmodemStatus', {
        status: 'int',
        message: 'str'
      })

      // 定义 C API 函数签名
      this.ZmodemInit = this.lib.func('ZmodemInit', 'int', ['int', 'str'])
      this.ZmodemFeedData = this.lib.func('ZmodemFeedData', 'int', ['int', 'void*', 'int'])
      this.ZmodemGetOutputData = this.lib.func('ZmodemGetOutputData', 'int', ['int', 'void*', 'int'])
      this.ZmodemGetProgress = this.lib.func('ZmodemGetProgress', koffi.pointer(this.ZmodemProgressType), ['int'])
      this.ZmodemFreeProgress = this.lib.func('ZmodemFreeProgress', 'void', [koffi.pointer(this.ZmodemProgressType)])
      this.ZmodemGetStatus = this.lib.func('ZmodemGetStatus', koffi.pointer(this.ZmodemStatusType), ['int'])
      this.ZmodemFreeStatus = this.lib.func('ZmodemFreeStatus', 'void', [koffi.pointer(this.ZmodemStatusType)])
      this.ZmodemCleanup = this.lib.func('ZmodemCleanup', 'void', ['int'])

      console.log(`[NativeLibManager] 动态库加载成功`)
    } catch (error) {
      console.error(`[NativeLibManager] 加载动态库失败:`, error)
      throw new Error(`加载动态库失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 确保库已加载
   */
  private ensureLoaded(): void {
    if (!this.isLoaded) {
      this.loadLibrary()
    }
  }

  /**
   * ZMODEM: 初始化会话
   */
  zmodemInit(mode: 'upload' | 'download', filePath: string): number {
    this.ensureLoaded()

    if (!this.ZmodemInit) {
      throw new Error('ZmodemInit 函数未加载')
    }

    const modeInt = mode === 'upload' ? 0 : 1
    const sessionId = this.ZmodemInit(modeInt, filePath)

    if (sessionId < 0) {
      throw new Error('ZMODEM 会话初始化失败')
    }

    console.log(`[NativeLibManager] ZMODEM 会话初始化成功: sessionId=${sessionId}, mode=${mode}, filePath=${filePath}`)
    return sessionId
  }

  /**
   * ZMODEM: 输入数据（从 SSH channel 接收）
   */
  zmodemFeedData(sessionId: number, data: Buffer): number {
    this.ensureLoaded()

    if (!this.ZmodemFeedData) {
      throw new Error('ZmodemFeedData 函数未加载')
    }

    return this.ZmodemFeedData(sessionId, data, data.length)
  }

  /**
   * ZMODEM: 获取输出数据（需要发送到 SSH channel）
   */
  zmodemGetOutputData(sessionId: number, bufferSize: number = 8192): Buffer | null {
    this.ensureLoaded()

    if (!this.ZmodemGetOutputData) {
      throw new Error('ZmodemGetOutputData 函数未加载')
    }

    const buffer = Buffer.allocUnsafe(bufferSize)
    const result = this.ZmodemGetOutputData(sessionId, buffer, bufferSize)

    if (result < 0) {
      return null // 错误
    }

    if (result === 0) {
      return null // 无数据
    }

    // 返回实际数据部分
    return buffer.slice(0, result)
  }

  /**
   * ZMODEM: 获取传输进度
   */
  zmodemGetProgress(sessionId: number): { transferred: number; total: number; percent: number } | null {
    this.ensureLoaded()

    if (!this.ZmodemGetProgress || !this.ZmodemFreeProgress) {
      throw new Error('ZmodemGetProgress 函数未加载')
    }

    if (!this.ZmodemProgressType) {
      throw new Error('ZmodemProgressType 未初始化')
    }

    const progress = this.ZmodemGetProgress(sessionId)
    if (!progress) {
      return null
    }

    try {
      // progress 是一个指针，这里通过 koffi.decode 按 ZmodemProgressType 结构体解析
      const decoded = koffi.decode(progress, this.ZmodemProgressType) as {
        transferred: bigint | number
        total: bigint | number
        percent: number
      }

      const result = {
        transferred: Number(decoded.transferred),
        total: Number(decoded.total),
        percent: decoded.percent
      }

      // 释放 C 内存
      this.ZmodemFreeProgress(progress)

      return result
    } catch (error) {
      console.error(`[NativeLibManager] 获取进度失败:`, error)
      if (progress) {
        this.ZmodemFreeProgress(progress)
      }
      return null
    }
  }

  /**
   * ZMODEM: 获取会话状态
   */
  zmodemGetStatus(sessionId: number): { status: number; message: string } | null {
    this.ensureLoaded()

    if (!this.ZmodemGetStatus || !this.ZmodemFreeStatus) {
      throw new Error('ZmodemGetStatus 函数未加载')
    }

    if (!this.ZmodemStatusType) {
      throw new Error('ZmodemStatusType 未初始化')
    }

    const status = this.ZmodemGetStatus(sessionId)
    if (!status) {
      return null
    }

    try {
      const decoded = koffi.decode(status, this.ZmodemStatusType) as {
        status: number
        message: string | null
      }

      const result = {
        status: decoded.status,
        message: decoded.message || ''
      }

      // 释放 C 内存
      this.ZmodemFreeStatus(status)

      return result
    } catch (error) {
      console.error(`[NativeLibManager] 获取状态失败:`, error)
      if (status) {
        this.ZmodemFreeStatus(status)
      }
      return null
    }
  }

  /**
   * ZMODEM: 清理会话资源
   */
  zmodemCleanup(sessionId: number): void {
    this.ensureLoaded()

    if (!this.ZmodemCleanup) {
      throw new Error('ZmodemCleanup 函数未加载')
    }

    this.ZmodemCleanup(sessionId)
    console.log(`[NativeLibManager] ZMODEM 会话已清理: sessionId=${sessionId}`)
  }
}

/**
 * 获取 NativeLibManager 单例实例
 */
export function getNativeLibManager(): NativeLibManager {
  return NativeLibManager.getInstance()
}

