<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useFileStore } from '../stores'
import ContextMenu, { type ContextMenuItem } from './ContextMenu.vue'
import { message } from '../utils/message'

const fileStore = useFileStore()
const selectedPath = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// 右键菜单状态
const showContextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuPath = ref<string | null>(null)
const contextMenuItem = ref<{ isDirectory: boolean; path: string } | null>(null)

// 权限设置对话框状态
const showPermissionDialog = ref(false)
const permissionMode = ref('755')
const permissionDialogPath = ref<string | null>(null)

let unsubscribeProgress: (() => void) | null = null

const canGoParent = computed(() => fileStore.currentPath !== '/')

onMounted(() => {
  if (!unsubscribeProgress && window.shellTool?.file.onProgress) {
    unsubscribeProgress = window.shellTool.file.onProgress(fileStore.handleProgress)
  }
})

onUnmounted(() => {
  if (unsubscribeProgress) {
    unsubscribeProgress()
    unsubscribeProgress = null
  }
})

function handleRefresh(): void {
  fileStore.load()
}

function handleGoParent(): void {
  fileStore.goParent()
  selectedPath.value = null
}

function handleRowDblClick(item: { isDirectory: boolean; path: string }): void {
  if (item.isDirectory) {
    fileStore.load(item.path)
    selectedPath.value = null
  } else {
    selectedPath.value = item.path
    handleDownload()
  }
}

function handleSelect(path: string): void {
  selectedPath.value = path
}

function triggerUpload(): void {
  fileInput.value?.click()
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const file = input.files[0]
  const remotePath = `${fileStore.currentPath.replace(/[/\\]$/, '')}/${file.name}`
  const filePath = (file as any).path as string | undefined
  if (!filePath) {
    console.error('[FilePanel] 选中文件缺少 path 属性，无法上传')
    input.value = ''
    return
  }
  fileStore.upload(filePath, remotePath)
  input.value = ''
}

async function handleDownload(): Promise<void> {
  if (!selectedPath.value) return
  const filename = selectedPath.value.split('/').pop()
  const result = await fileStore.download(selectedPath.value, filename)
  if (result.success) {
    message.success(result.message)
  } else {
    message.error(result.message)
  }
}

function openContextMenu(event: MouseEvent, item: { isDirectory: boolean; path: string }): void {
  event.preventDefault()
  contextMenuPath.value = item.path
  contextMenuItem.value = item
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  showContextMenu.value = true
}

function hideContextMenu(): void {
  showContextMenu.value = false
  contextMenuPath.value = null
  contextMenuItem.value = null
}

// 右键菜单项计算
const contextMenuItems = computed<ContextMenuItem[]>(() => {
  if (!contextMenuPath.value || !contextMenuItem.value) return []

  const items: ContextMenuItem[] = []
  const item = contextMenuItem.value

  // 只有文件才显示下载
  if (!item.isDirectory) {
    items.push({
      label: '下载',
      action: async () => {
        if (!contextMenuPath.value) return
        const filename = contextMenuPath.value.split('/').pop()
        const result = await fileStore.download(contextMenuPath.value, filename)
        if (result.success) {
          message.success(result.message)
        } else {
          message.error(result.message)
        }
      }
    })
  }

  items.push({
    label: '权限设置',
    action: () => {
      if (!contextMenuPath.value) return
      permissionDialogPath.value = contextMenuPath.value
      permissionMode.value = '755'
      showPermissionDialog.value = true
    }
  })

  items.push({ label: '', divider: true })

  items.push({
    label: '删除',
    action: async () => {
      if (!contextMenuPath.value || !contextMenuItem.value) return
      const deleteItem = contextMenuItem.value
      const itemName = deleteItem.path.split('/').pop() || deleteItem.path
      const confirmMessage = `确定要删除 ${deleteItem.isDirectory ? '目录' : '文件'} "${itemName}" 吗？`
      if (!window.confirm(confirmMessage)) {
        return
      }
      const result = await fileStore.deleteFile(contextMenuPath.value)
      if (result.success) {
        message.success(result.message)
      } else {
        message.error(result.message)
      }
    }
  })

  return items
})

async function handlePermissionSubmit(): Promise<void> {
  if (!permissionDialogPath.value) return
  const result = await fileStore.chmod(permissionDialogPath.value, permissionMode.value)
  if (result.success) {
    message.success(result.message)
  } else {
    message.error(result.message)
  }
  showPermissionDialog.value = false
  permissionDialogPath.value = null
}

function handlePermissionCancel(): void {
  showPermissionDialog.value = false
  permissionDialogPath.value = null
}


onUnmounted(() => {
  if (unsubscribeProgress) {
    unsubscribeProgress()
    unsubscribeProgress = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', hideContextMenu)
  }
})
</script>

<template>
  <div class="file-panel h-full w-full flex flex-col text-xs">
    <!-- 顶部工具栏 -->
    <div class="file-panel__toolbar flex items-center justify-between px-3 py-1 border-b">
      <div class="flex flex-col">
        <span class="file-panel__title text-[11px]">远程文件</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="file-panel__btn px-1.5 py-0.5 rounded border text-[11px]"
          @click="handleRefresh"
        >
          刷新
        </button>
        <button
          class="file-panel__btn px-1.5 py-0.5 rounded border text-[11px]"
          :disabled="!fileStore.hasConnection"
          @click="triggerUpload"
        >
          上传
        </button>
        <input ref="fileInput" type="file" class="hidden" @change="onFileChange" />
      </div>
    </div>

    <!-- 进度条 -->
    <div v-if="fileStore.transferProgress" class="file-panel__progress px-3 py-1 border-b">
      <div class="flex justify-between text-[11px] file-panel__progress-text mb-1">
        <span>
          {{ fileStore.transferProgress.type === 'upload' ? '上传' : '下载' }}中：
          {{ fileStore.transferProgress.filename }}
        </span>
        <span>{{ Math.round(fileStore.transferProgress.percent * 100) }}%</span>
      </div>
      <div class="file-panel__progress-outer h-1.5 rounded">
        <div
          class="file-panel__progress-inner h-full rounded"
          :style="{ width: `${Math.round(fileStore.transferProgress.percent * 100)}%` }"
        />
      </div>
    </div>

    <!-- 文件列表 -->
    <div class="file-panel__list flex-1 text-xs">
      <div v-if="!fileStore.hasConnection" class="file-panel__tip h-full flex items-center justify-center">
        未选择会话
      </div>
      <div
        v-else-if="fileStore.items.length === 0 && !fileStore.loading"
        class="file-panel__tip h-full flex items-center justify-center"
      >
        当前目录为空
      </div>
      <table v-else class="w-full border-collapse">
        <thead class="file-panel__head text-[11px]">
          <tr>
            <th class="px-3 py-1 text-left font-normal">名称</th>
            <th class="px-2 py-1 w-24 text-right font-normal">修改时间</th>
          </tr>
        </thead>
        <tbody>
          <!-- 上级目录行 -->
          <tr
            v-if="canGoParent"
            class="file-row cursor-default"
            @click="handleGoParent"
          >
            <td class="px-3 py-1">
              <span class="mr-2 text-[11px] file-row__icon w-4 inline-block text-center">📁</span>
              <span class="truncate align-middle">..</span>
            </td>
            <td class="px-2 py-1 text-right text-[11px] file-row__meta" />
          </tr>
          <tr
            v-for="item in fileStore.items"
            :key="item.path"
            :class="['file-row cursor-default', selectedPath === item.path ? 'is-selected' : '']"
            @click="handleSelect(item.path)"
            @dblclick="handleRowDblClick(item)"
            @contextmenu="openContextMenu($event, item)"
          >
            <td class="px-3 py-1">
              <span class="mr-2 text-[11px] file-row__icon w-4 inline-block text-center">
                {{ item.isDirectory ? '📁' : '📄' }}
              </span>
              <span
                class="file-row__name truncate align-middle"
                :title="item.path"
              >
                {{ item.name }}
              </span>
            </td>
            <td class="px-2 py-1 text-right text-[11px] file-row__meta">
              <span v-if="item.modifiedAt">
                {{ new Date(item.modifiedAt).toLocaleDateString() }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- 底部路径行 -->
    <div
      v-if="fileStore.hasConnection"
      class="file-panel__path-bar px-3 py-1 border-t text-[11px]"
    >
      <span
        class="file-panel__path-bottom"
        :title="fileStore.currentPath"
      >
        {{ fileStore.currentPath }}
      </span>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu
      :visible="showContextMenu"
      :x="contextMenuX"
      :y="contextMenuY"
      :items="contextMenuItems"
      @close="hideContextMenu"
    />

    <!-- 权限设置对话框 -->
    <div
      v-if="showPermissionDialog"
      class="file-permission-dialog fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="handlePermissionCancel"
    >
      <div class="file-permission-dialog__content rounded shadow-lg p-4 min-w-[300px]">
        <h3 class="file-permission-dialog__title text-sm font-semibold mb-3">设置权限</h3>
        <div class="mb-3">
          <label class="block text-xs mb-1">权限值（如：755）</label>
          <input
            v-model="permissionMode"
            type="text"
            class="file-permission-dialog__input w-full px-2 py-1 border rounded text-xs"
            placeholder="755"
            pattern="[0-7]{3,4}"
            maxlength="4"
          />
        </div>
        <div class="flex justify-end gap-2">
          <button
            class="file-permission-dialog__btn px-3 py-1 rounded text-xs"
            @click="handlePermissionCancel"
          >
            取消
          </button>
          <button
            class="file-permission-dialog__btn file-permission-dialog__btn--primary px-3 py-1 rounded text-xs"
            @click="handlePermissionSubmit"
          >
            确定
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.file-panel {
  background: var(--color-surface);
  color: var(--color-text-primary);
}

.file-panel__toolbar {
  border-color: var(--color-border);
  background: var(--color-surface);
}

.file-panel__title {
  color: var(--color-text-secondary);
}

.file-panel__path {
  color: var(--color-text-muted);
}

.file-panel__btn {
  background: transparent;
  border-color: transparent;
  color: var(--color-text-secondary);
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.file-panel__btn:hover {
  color: var(--color-text-primary);
  border-color: var(--color-border);
  background: var(--color-surface-muted);
}

.file-panel__btn:disabled {
  cursor: not-allowed;
}

.file-panel__progress {
  border-color: var(--color-border);
}

.file-panel__progress-text {
  color: var(--color-text-secondary);
}

.file-panel__progress-outer {
  background: var(--color-surface-muted);
}

.file-panel__progress-inner {
  background: var(--color-primary);
}

.file-panel__tip {
  color: var(--color-text-muted);
}

.file-panel__list {
  overflow-y: auto;
  overflow-x: hidden;
}

.file-panel__list table {
  width: 100%;
  table-layout: fixed;
}

.file-panel__head {
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
}

.file-row {
  color: var(--color-text-primary);
}

.file-row:hover {
  background: var(--color-surface-strong);
}

.file-row.is-selected {
  background: var(--color-primary);
  color: #ffffff;
}

/* 亮色主题下使用更深的蓝色以确保对比度 */
:root:not([data-theme='dark']) .file-row.is-selected {
  background: #1d4ed8;
  color: #ffffff;
}

.file-row__icon {
  color: var(--color-text-muted);
}

.file-row__meta {
  color: var(--color-text-muted);
}

.file-row.is-selected .file-row__icon,
.file-row.is-selected .file-row__meta {
  color: #f1f5f9;
}

.file-row__name {
  display: inline-block;
  max-width: calc(100% - 20px);
}

.file-panel__path-bar {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.file-panel__path-bottom {
  display: block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}


.file-permission-dialog__content {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.file-permission-dialog__title {
  color: var(--color-text-primary);
}

.file-permission-dialog__input {
  background: var(--color-surface-muted);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.file-permission-dialog__input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.file-permission-dialog__btn {
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  transition: background-color 0.2s ease, color 0.2s ease;
}

.file-permission-dialog__btn:hover {
  background: var(--color-surface-strong);
  color: var(--color-text-primary);
}

.file-permission-dialog__btn--primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #ffffff;
}

.file-permission-dialog__btn--primary:hover {
  background: var(--color-primary);
  opacity: 0.9;
}
</style>

