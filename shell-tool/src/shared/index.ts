// Shared types and utilities

/**
 * SSH 认证方式
 */
export type AuthType = 'password' | 'publickey'

/**
 * Connection - SSH 连接配置
 * 需求: 1.3, 2.3, 7.1
 */
export interface Connection {
  id: string // 唯一标识符 (UUID)
  name: string // 连接名称
  host: string // 主机地址
  port: number // 端口号（默认 22）
  username: string // 用户名
  authType: AuthType // 认证方式：密码或公钥
  password?: string // 密码（authType 为 password 时必填）
  privateKeyPath?: string // 私钥路径（authType 为 publickey 时必填）
  passphrase?: string // 私钥密码（可选）
  remark?: string // 备注
  shell?: string // Shell 路径（可选，默认使用系统 Shell）
  cwd?: string // 初始工作目录（可选）
  env?: Record<string, string> // 环境变量（可选）
  createdAt: Date // 创建时间
  updatedAt: Date // 更新时间
}

/**
 * Session - 终端会话
 * 需求: 仅远程 SSH
 */
export interface Session {
  id: string // 会话 ID
  connectionId: string // 关联的连接 ID
  sshSessionId: string // SSH 通道 ID
  cwd: string // 当前工作目录
  isActive: boolean // 是否为活跃会话
  createdAt: Date // 创建时间
  status?: 'connecting' | 'connected' | 'failed' // 连接状态（仅前端使用）
  errorMessage?: string // 错误信息（仅前端使用）
}

/**
 * Tab - 标签页
 * 需求: 4.4, 5.1
 */
export interface Tab {
  id: string
  title: string
  connectionId: string
}

// ============================================
// IPC 通道类型定义
// ============================================

/**
 * IPC 通道名称常量
 */
export const IPC_CHANNELS = {
  // SSH 相关通道
  SSH_CREATE: 'ssh:create',
  SSH_WRITE: 'ssh:write',
  SSH_RESIZE: 'ssh:resize',
  SSH_DESTROY: 'ssh:destroy',
  SSH_DATA: 'ssh:data',
  SSH_EXIT: 'ssh:exit',

  // 连接相关通道
  CONNECTION_GET_ALL: 'connection:get-all',
  CONNECTION_ADD: 'connection:add',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_DELETE: 'connection:delete',

  // 文件相关通道
  FILE_LIST: 'file:list',
  FILE_UPLOAD: 'file:upload',
  FILE_DOWNLOAD: 'file:download',
  FILE_PROGRESS: 'file:progress'
} as const

/**
 * 主进程 -> 渲染进程 事件类型
 */
export interface IPCMainToRenderer {
  'ssh:data': (sessionId: string, data: string) => void
  'ssh:exit': (sessionId: string, code: number) => void
  'file:progress': (
    connectionId: string,
    payload: { type: 'upload' | 'download'; path: string; filename: string; percent: number }
  ) => void
}

/**
 * 渲染进程 -> 主进程 调用类型
 */
export interface IPCRendererToMain {
  'ssh:create': (connectionId: string, size?: { cols: number; rows: number }) => Promise<string>
  'ssh:write': (sessionId: string, data: string) => void
  'ssh:resize': (sessionId: string, cols: number, rows: number) => void
  'ssh:destroy': (sessionId: string) => void

  'connection:get-all': () => Promise<Connection[]>
  'connection:add': (connection: Connection) => Promise<void>
  'connection:update': (id: string, data: Partial<Connection>) => Promise<void>
  'connection:delete': (id: string) => Promise<void>

  'file:list': (connectionId: string, remotePath: string) => Promise<FileItem[]>
  'file:upload': (
    connectionId: string,
    localPath: string,
    remotePath: string
  ) => Promise<void>
  'file:download': (connectionId: string, remotePath: string, localPath: string) => Promise<void>
}

export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt?: Date
}

/**
 * 连接序列化数据（用于 JSON 持久化）
 * 需求: 7.4, 7.5
 */
export interface SerializedConnection {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: AuthType
  password?: string
  privateKeyPath?: string
  passphrase?: string
  remark?: string
  shell?: string
  cwd?: string
  env?: Record<string, string>
  createdAt: string // ISO 日期字符串
  updatedAt: string // ISO 日期字符串
}

/**
 * 连接验证结果
 */
export interface ConnectionValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * 验证连接信息
 * 需求: 2.4
 */
export function validateConnection(
  connection: Partial<Connection>
): ConnectionValidationResult {
  const errors: string[] = []

  if (!connection.name || connection.name.trim() === '') {
    errors.push('连接名称不能为空')
  }

  if (!connection.host || connection.host.trim() === '') {
    errors.push('主机地址不能为空')
  }

  if (connection.port !== undefined && (connection.port < 1 || connection.port > 65535)) {
    errors.push('端口号必须在 1-65535 之间')
  }

  if (!connection.username || connection.username.trim() === '') {
    errors.push('用户名不能为空')
  }

  if (connection.authType === 'password' && (!connection.password || connection.password.trim() === '')) {
    errors.push('密码认证方式下，密码不能为空')
  }

  if (connection.authType === 'publickey' && (!connection.privateKeyPath || connection.privateKeyPath.trim() === '')) {
    errors.push('公钥认证方式下，私钥路径不能为空')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 序列化连接对象为 JSON 格式
 * 需求: 7.4
 */
export function serializeConnection(connection: Connection): SerializedConnection {
  return {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port,
    username: connection.username,
    authType: connection.authType,
    password: connection.password,
    privateKeyPath: connection.privateKeyPath,
    passphrase: connection.passphrase,
    remark: connection.remark,
    shell: connection.shell,
    cwd: connection.cwd,
    env: connection.env,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString()
  }
}

/**
 * 从 JSON 格式反序列化连接对象
 * 需求: 7.5
 */
export function deserializeConnection(data: SerializedConnection): Connection {
  return {
    id: data.id,
    name: data.name,
    host: data.host,
    port: data.port,
    username: data.username,
    authType: data.authType,
    password: data.password,
    privateKeyPath: data.privateKeyPath,
    passphrase: data.passphrase,
    remark: data.remark,
    shell: data.shell,
    cwd: data.cwd,
    env: data.env,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt)
  }
}

/**
 * 序列化连接数组
 */
export function serializeConnections(connections: Connection[]): string {
  return JSON.stringify(connections.map(serializeConnection))
}

/**
 * 反序列化连接数组
 */
export function deserializeConnections(json: string): Connection[] {
  const data: SerializedConnection[] = JSON.parse(json)
  return data.map(deserializeConnection)
}
