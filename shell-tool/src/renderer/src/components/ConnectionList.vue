<script setup lang="ts">
import { computed } from 'vue'
import type { Connection } from '../../../shared'

/**
 * ConnectionList.vue - 连接列表组件
 * 需求: 1.1, 1.2, 1.3, 3.1
 */

// Props
interface Props {
  connections: Connection[]
  selectedId: string | null
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'open', id: string): void
  (e: 'add'): void
  (e: 'delete', id: string): void
}>()

// Computed
const isEmpty = computed(() => props.connections.length === 0)

// Methods
function handleSelect(id: string): void {
  emit('select', id)
}

function handleOpen(id: string): void {
  emit('open', id)
}

function handleAdd(): void {
  emit('add')
}

function handleDelete(id: string, event: Event): void {
  event.stopPropagation()
  emit('delete', id)
}

function isSelected(id: string): boolean {
  return props.selectedId === id
}
</script>

<template>
  <div class="connection-list flex flex-col h-full">
    <!-- 头部：标题和添加按钮 -->
    <div class="connection-list__header flex items-center justify-between px-4 py-3 border-b">
      <h2 class="text-sm font-semibold">连接列表</h2>
      <!-- 添加按钮 - 需求: 2.1 -->
      <button
        @click="handleAdd"
        class="connection-list__add p-1.5 rounded-md transition-colors"
        title="添加连接"
        aria-label="添加连接"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>

    <!-- 连接列表内容 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 空状态提示 - 需求: 1.2 -->
      <div
        v-if="isEmpty"
        class="connection-list__empty flex flex-col items-center justify-center h-full px-4 py-8 text-center"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-12 w-12 mb-3 connection-list__empty-icon"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p class="text-sm mb-2 connection-list__empty-title">暂无连接</p>
        <p class="text-xs connection-list__empty-desc">点击上方 + 按钮添加新连接</p>
      </div>

      <!-- 连接列表 - 需求: 1.3 -->
      <ul v-else class="py-2">
        <li
          v-for="connection in connections"
          :key="connection.id"
          @click="handleSelect(connection.id)"
          @dblclick.stop="handleOpen(connection.id)"
          :class="[
            'connection-item group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors',
            isSelected(connection.id) ? 'is-active' : ''
          ]"
        >
          <!-- 连接图标和名称 -->
          <div class="flex items-center gap-3 min-w-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 flex-shrink-0 connection-item__icon"
              :class="isSelected(connection.id) ? 'is-active' : ''"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span class="truncate text-sm connection-item__name">{{ connection.name }}</span>
          </div>

          <!-- 删除按钮 -->
          <button
            @click="handleDelete(connection.id, $event)"
            class="connection-item__delete p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            :class="isSelected(connection.id) ? 'is-active' : ''"
            title="删除连接"
            aria-label="删除连接"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.connection-list {
  background: var(--color-surface-muted);
  color: var(--color-text-primary);
}

.connection-list__header {
  border-color: var(--color-border);
  color: var(--color-text-secondary);
}

.connection-list__add {
  color: var(--color-text-muted);
}

.connection-list__add:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-strong);
}

.connection-list__empty {
  color: var(--color-text-secondary);
}

.connection-list__empty-icon {
  color: var(--color-text-muted);
}

.connection-list__empty-desc {
  color: var(--color-text-muted);
}

.connection-item {
  color: var(--color-text-secondary);
  border-radius: 0.5rem;
}

.connection-item:hover {
  background: var(--color-surface-strong);
  color: var(--color-text-primary);
}

.connection-item.is-active {
  background: var(--color-primary);
  color: #ffffff;
}

/* 亮色主题下使用更深的蓝色以确保对比度 */
:root:not([data-theme='dark']) .connection-item.is-active {
  background: #1d4ed8;
  color: #ffffff;
}

.connection-item__icon {
  color: var(--color-text-muted);
}

.connection-item__icon.is-active {
  color: #ffffff;
}

.connection-item__name {
  color: inherit;
}

.connection-item.is-active .connection-item__name {
  color: #ffffff;
}

.connection-item__delete {
  color: var(--color-text-muted);
}

.connection-item__delete:hover {
  background: var(--color-surface-strong);
  color: var(--color-text-primary);
}

.connection-item__delete.is-active:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}
</style>
