import { Client, SFTPWrapper } from 'ssh2'
import { promises as fs } from 'fs'
import { basename } from 'path'
import type { FileItem, Connection } from '../../shared'
import { getConnectionStore } from './ConnectionStore'

interface SFTPConnection {
  client: Client
  sftp: SFTPWrapper
}

export class SFTPManager {
  private connections = new Map<string, SFTPConnection>()

  private async ensureConnection(connectionId: string): Promise<SFTPConnection> {
    const existing = this.connections.get(connectionId)
    if (existing) return existing

    const connectionStore = getConnectionStore()
    const connection = await connectionStore.getById(connectionId)
    if (!connection) {
      throw new Error(`连接不存在: ${connectionId}`)
    }

    const client = new Client()
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client
        .on('ready', () => {
          client.sftp((err, sftp) => {
            if (err) {
              reject(err)
              return
            }
            resolve(sftp)
          })
        })
        .on('error', reject)
        .connect(this.buildConfig(connection))
    })

    const conn: SFTPConnection = { client, sftp }
    this.connections.set(connectionId, conn)
    return conn
  }

  private buildConfig(connection: Connection) {
    const config: any = {
      host: connection.host,
      port: connection.port ?? 22,
      username: connection.username
    }
    if (connection.authType === 'password') {
      config.password = connection.password
    }
    return config
  }

  async list(connectionId: string, remotePath: string): Promise<FileItem[]> {
    const { sftp } = await this.ensureConnection(connectionId)
    
    // 规范化路径
    let normalizedPath = remotePath.trim()
    
    // 将 ~ 转换为根目录（SFTP 不支持 shell 扩展）
    if (normalizedPath === '~' || normalizedPath.startsWith('~/')) {
      normalizedPath = normalizedPath === '~' ? '/' : normalizedPath.replace(/^~\//, '/')
    }
    
    // 确保路径以 / 开头
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath
    }
    
    // 规范化路径分隔符（统一使用 /，移除多余的 /）
    normalizedPath = normalizedPath.replace(/\\/g, '/').replace(/\/+/g, '/')
    
    return await new Promise<FileItem[]>((resolve, reject) => {
      sftp.readdir(normalizedPath, (err, list) => {
        if (err) {
          // 如果是路径不存在错误（code: 2），尝试使用根目录作为回退
          if (err.code === 2 && normalizedPath !== '/') {
            console.warn(`[SFTPManager] 路径不存在: ${normalizedPath}, 尝试使用根目录`)
            sftp.readdir('/', (fallbackErr, fallbackList) => {
              if (fallbackErr) {
                reject(new Error(`无法访问路径 ${normalizedPath}: ${err.message}`))
                return
              }
              const items: FileItem[] = fallbackList.map((entry) => ({
                name: entry.filename,
                path: `/${entry.filename}`,
                isDirectory: entry.longname.startsWith('d'),
                size: entry.attrs.size,
                modifiedAt: entry.attrs.mtime ? new Date(entry.attrs.mtime * 1000) : undefined
              }))
              resolve(items)
            })
            return
          }
          reject(new Error(`无法访问路径 ${normalizedPath}: ${err.message}`))
          return
        }
        const items: FileItem[] = list.map((entry) => ({
          name: entry.filename,
          path: `${normalizedPath.replace(/\/$/, '')}/${entry.filename}`,
          isDirectory: entry.longname.startsWith('d'),
          size: entry.attrs.size,
          modifiedAt: entry.attrs.mtime ? new Date(entry.attrs.mtime * 1000) : undefined
        }))
        resolve(items)
      })
    })
  }

  async upload(
    connectionId: string,
    localPath: string,
    remotePath: string,
    onProgress?: (transferred: number, total: number, filename: string) => void
  ): Promise<void> {
    const { sftp } = await this.ensureConnection(connectionId)
    const stat = await fs.stat(localPath)
    const total = stat.size
    const filename = basename(localPath)

    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(localPath)
      const writeStream = sftp.createWriteStream(remotePath)
      let transferred = 0

      readStream.on('data', (chunk) => {
        transferred += chunk.length
        onProgress?.(transferred, total, filename)
      })

      writeStream.on('close', () => resolve())
      writeStream.on('error', reject)
      readStream.on('error', reject)

      readStream.pipe(writeStream)
    })
  }

  async download(
    connectionId: string,
    remotePath: string,
    localPath: string,
    onProgress?: (transferred: number, filename: string) => void
  ): Promise<void> {
    const { sftp } = await this.ensureConnection(connectionId)
    const filename = basename(remotePath)

    await new Promise<void>((resolve, reject) => {
      sftp.stat(remotePath, (err, stats) => {
        const total = !err ? stats.size : 0
        const readStream = sftp.createReadStream(remotePath)
        const writeStream = fs.createWriteStream(localPath)
        let transferred = 0

        readStream.on('data', (chunk) => {
          transferred += chunk.length
          if (total > 0) {
            onProgress?.(Math.min(transferred / total, 1), filename)
          }
        })

        writeStream.on('close', () => resolve())
        writeStream.on('error', reject)
        readStream.on('error', reject)

        readStream.pipe(writeStream)
      })
    })
  }

  destroyAll(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.sftp.end()
      } catch {}
      try {
        conn.client.end()
      } catch {}
    }
    this.connections.clear()
  }
}

let sftpManagerInstance: SFTPManager | null = null

export function getSFTPManager(): SFTPManager {
  if (!sftpManagerInstance) {
    sftpManagerInstance = new SFTPManager()
  }
  return sftpManagerInstance
}

export function resetSFTPManager(): void {
  sftpManagerInstance?.destroyAll()
  sftpManagerInstance = null
}


