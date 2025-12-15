import { EventEmitter } from 'events'
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { Connection } from '../../shared'
import { getConnectionStore } from './ConnectionStore'

interface SSHSession {
  id: string
  connectionId: string
  client: Client
  channel: ClientChannel
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
                channel: stream
              }

              this.sessions.set(sessionId, sshSession)

              stream.on('data', (data: Buffer) => {
                this.emit('data', sessionId, data.toString())
              })

              stream.on('close', (code: number) => {
                this.emit('exit', sessionId, code ?? 0)
                this.destroy(sessionId)
              })

              client.on('error', (e) => {
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

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`SSH 会话不存在: ${sessionId}`)
    session.channel.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`SSH 会话不存在: ${sessionId}`)
    session.channel.setWindow(rows, cols)
  }

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
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

