<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useFileStore } from '../stores'

const fileStore = useFileStore()
const selectedPath = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

let unsubscribeProgress: (() => void) | null = null

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
  fileStore.upload(file.path, remotePath)
  input.value = ''
}

function handleDownload(): void {
  if (!selectedPath.value) return
  const filename = selectedPath.value.split('/').pop()
  fileStore.download(selectedPath.value, filename)
}
</script>

<template>
  <div class="file-panel h-full w-full flex flex-col text-xs">
    <!-- 顶部工具栏 -->
    <div class="file-panel__toolbar flex items-center justify-between px-3 py-1 border-b">
      <div class="flex flex-col">
        <span class="file-panel__title text-[11px]">远程文件</span>
        <span class="file-panel__path text-[11px] truncate max-w-[180px]">
          {{ fileStore.currentPath }}
        </span>
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
          @click="fileStore.goParent"
        >
          上级
        </button>
        <button
          class="file-panel__btn px-1.5 py-0.5 rounded border text-[11px]"
          :disabled="!fileStore.hasConnection"
          @click="triggerUpload"
        >
          上传
        </button>
        <button
          class="file-panel__btn px-1.5 py-0.5 rounded border text-[11px] disabled:opacity-50"
          :disabled="!selectedPath"
          @click="handleDownload"
        >
          下载
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
    <div class="flex-1 overflow-auto text-xs">
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
            <th class="px-2 py-1 w-20 text-right font-normal">大小</th>
            <th class="px-2 py-1 w-24 text-right font-normal">修改时间</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in fileStore.items"
            :key="item.path"
            :class="['file-row cursor-default', selectedPath === item.path ? 'is-selected' : '']"
            @click="handleSelect(item.path)"
            @dblclick="handleRowDblClick(item)"
          >
            <td class="px-3 py-1">
              <span class="mr-2 text-[11px] file-row__icon w-4 inline-block text-center">
                {{ item.isDirectory ? '📁' : '📄' }}
              </span>
              <span class="truncate align-middle">{{ item.name }}</span>
            </td>
            <td class="px-2 py-1 text-right tabular-nums">
              <span v-if="!item.isDirectory">
                {{ item.size }}
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
</style>

