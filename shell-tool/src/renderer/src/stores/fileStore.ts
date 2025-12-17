import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FileItem } from '../../../shared'

interface TransferProgress {
  type: 'upload' | 'download'
  path: string
  filename: string
  percent: number
}

export const useFileStore = defineStore('file', () => {
  const currentConnectionId = ref<string | null>(null)
  const currentPath = ref<string>('/')
  const connectionPaths = ref<Record<string, string>>({})
  const items = ref<FileItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const transferProgress = ref<TransferProgress | null>(null)

  const hasConnection = computed(() => !!currentConnectionId.value)

  function setConnection(connectionId: string | null, basePath: string = '/'): void {
    currentConnectionId.value = connectionId
    if (connectionId) {
      currentPath.value = connectionPaths.value[connectionId] ?? basePath
    } else {
      currentPath.value = basePath
      items.value = []
      transferProgress.value = null
    }
  }

  async function load(path?: string): Promise<void> {
    if (!currentConnectionId.value) {
      items.value = []
      return
    }
    const targetPath = path ?? currentPath.value
    loading.value = true
    error.value = null
    try {
      const list = await window.shellTool?.file.list(currentConnectionId.value, targetPath)
      items.value = list ?? []
      currentPath.value = targetPath
      connectionPaths.value[currentConnectionId.value] = targetPath
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载文件列表失败'
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function upload(localPath: string, remotePath: string): Promise<void> {
    if (!currentConnectionId.value) return
    transferProgress.value = {
      type: 'upload',
      path: remotePath,
      filename: localPath.split(/[\\/]/).pop() || localPath,
      percent: 0
    }
    try {
      await window.shellTool?.file.upload(currentConnectionId.value, localPath, remotePath)
      await load()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '上传失败'
    } finally {
      transferProgress.value = null
    }
  }

  async function download(remotePath: string, suggestedName?: string): Promise<{ success: boolean; message: string }> {
    if (!currentConnectionId.value) {
      return { success: false, message: '未选择连接' }
    }
    transferProgress.value = {
      type: 'download',
      path: remotePath,
      filename: suggestedName || remotePath.split('/').pop() || remotePath,
      percent: 0
    }
    try {
      await window.shellTool?.file.download(
        currentConnectionId.value,
        remotePath,
        suggestedName
      )
      return { success: true, message: '下载成功' }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '下载失败'
      error.value = errorMsg
      return { success: false, message: errorMsg }
    } finally {
      transferProgress.value = null
    }
  }

  async function deleteFile(remotePath: string): Promise<{ success: boolean; message: string }> {
    if (!currentConnectionId.value) {
      return { success: false, message: '未选择连接' }
    }
    try {
      await window.shellTool?.file.delete(currentConnectionId.value, remotePath)
      await load()
      return { success: true, message: '删除成功' }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '删除失败'
      error.value = errorMsg
      return { success: false, message: errorMsg }
    }
  }

  async function chmod(remotePath: string, mode: string): Promise<{ success: boolean; message: string }> {
    if (!currentConnectionId.value) {
      return { success: false, message: '未选择连接' }
    }
    try {
      // 将字符串模式转换为数字（例如 "755" -> 493）
      const modeNum = parseInt(mode, 8)
      await window.shellTool?.file.chmod(currentConnectionId.value, remotePath, modeNum)
      return { success: true, message: '权限设置成功' }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '权限设置失败'
      error.value = errorMsg
      return { success: false, message: errorMsg }
    }
  }

  function handleProgress(
    connectionId: string,
    payload: { type: 'upload' | 'download'; path: string; filename: string; percent: number }
  ): void {
    if (!currentConnectionId.value || connectionId !== currentConnectionId.value) return
    transferProgress.value = payload
  }

  function goParent(): void {
    if (!currentPath.value || currentPath.value === '/') return
    const segments = currentPath.value.split('/').filter(Boolean)
    segments.pop()
    const parent = '/' + segments.join('/')
    load(parent === '//' ? '/' : parent || '/')
  }

  return {
    currentConnectionId,
    currentPath,
    connectionPaths,
    items,
    loading,
    error,
    transferProgress,
    hasConnection,
    setConnection,
    load,
    upload,
    download,
    deleteFile,
    chmod,
    handleProgress,
    goParent
  }
})


