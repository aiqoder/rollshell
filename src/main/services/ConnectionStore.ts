import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import {
  Connection,
  serializeConnections,
  deserializeConnections,
  validateConnection
} from '../../shared'

/**
 * ConnectionStore - 连接存储服务
 * 负责连接数据的持久化存储
 * 需求: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export class ConnectionStore {
  private connections: Connection[] = []
  private storagePath: string
  private initialized = false

  constructor(storagePath?: string) {
    // 使用用户数据目录存储连接数据
    this.storagePath = storagePath ?? join(app.getPath('userData'), 'connections.json')
    console.info('[ConnectionStore] 初始化存储路径', this.storagePath)
  }

  /**
   * 初始化存储，从文件加载连接数据
   * 需求: 7.2
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.info('[ConnectionStore] 开始加载本地连接数据')
      const data = await fs.readFile(this.storagePath, 'utf-8')
      this.connections = deserializeConnections(data)
      console.info('[ConnectionStore] 连接数据加载完成', { count: this.connections.length })
    } catch (error) {
      // 文件不存在或解析失败，使用空列表
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to load connections:', error)
      }
      this.connections = []
    }

    this.initialized = true
  }

  /**
   * 获取所有连接
   * 需求: 7.2
   */
  async getAll(): Promise<Connection[]> {
    await this.ensureInitialized()
    return [...this.connections]
  }

  /**
   * 根据 ID 获取连接
   */
  async getById(id: string): Promise<Connection | null> {
    await this.ensureInitialized()
    return this.connections.find((c) => c.id === id) ?? null
  }

  /**
   * 添加新连接
   * 需求: 7.1
   */
  async add(connection: Connection): Promise<void> {
    await this.ensureInitialized()

    // 验证连接信息
    const validation = validateConnection(connection)
    if (!validation.valid) {
      throw new Error(`Invalid connection: ${validation.errors.join(', ')}`)
    }

    // 检查 ID 是否已存在
    if (this.connections.some((c) => c.id === connection.id)) {
      throw new Error(`Connection with id ${connection.id} already exists`)
    }

    console.info('[ConnectionStore] 添加连接', this.getConnectionSummary(connection))
    this.connections.push(connection)
    await this.persist()
  }

  /**
   * 更新连接
   */
  async update(id: string, data: Partial<Connection>): Promise<void> {
    await this.ensureInitialized()

    const index = this.connections.findIndex((c) => c.id === id)
    if (index === -1) {
      throw new Error(`Connection with id ${id} not found`)
    }

    const mergedConnection: Connection = {
      ...this.connections[index],
      ...data,
      updatedAt: new Date()
    }

    // 使用合并后的数据进行完整校验，避免缺少字段导致的误报
    const validation = validateConnection(mergedConnection)
    if (!validation.valid) {
      throw new Error(`Invalid connection: ${validation.errors.join(', ')}`)
    }

    this.connections[index] = mergedConnection

    console.info('[ConnectionStore] 更新连接', { id })
    await this.persist()
  }

  /**
   * 删除连接
   * 需求: 7.3
   */
  async delete(id: string): Promise<void> {
    await this.ensureInitialized()

    const index = this.connections.findIndex((c) => c.id === id)
    if (index === -1) {
      throw new Error(`Connection with id ${id} not found`)
    }

    console.info('[ConnectionStore] 删除连接', { id })
    this.connections.splice(index, 1)
    await this.persist()
  }

  /**
   * 序列化连接数组为 JSON 字符串
   * 需求: 7.4
   */
  serialize(connections: Connection[]): string {
    return serializeConnections(connections)
  }

  /**
   * 从 JSON 字符串反序列化连接数组
   * 需求: 7.5
   */
  deserialize(json: string): Connection[] {
    return deserializeConnections(json)
  }

  /**
   * 确保存储已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * 持久化连接数据到文件
   * 需求: 7.1
   */
  private async persist(): Promise<void> {
    const data = this.serialize(this.connections)
    await fs.writeFile(this.storagePath, data, 'utf-8')
    console.info('[ConnectionStore] 数据已持久化', { count: this.connections.length })
  }

  private getConnectionSummary(connection: Connection): Record<string, unknown> {
    return {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      authType: connection.authType
    }
  }
}

// 单例实例
let connectionStoreInstance: ConnectionStore | null = null

/**
 * 获取 ConnectionStore 单例实例
 */
export function getConnectionStore(): ConnectionStore {
  if (!connectionStoreInstance) {
    connectionStoreInstance = new ConnectionStore()
  }
  return connectionStoreInstance
}

/**
 * 重置 ConnectionStore 实例（用于测试）
 */
export function resetConnectionStore(): void {
  connectionStoreInstance = null
}
