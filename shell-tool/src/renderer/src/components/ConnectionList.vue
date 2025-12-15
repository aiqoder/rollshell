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
  <div class="connection-list flex flex-col h-full bg-gray-900 text-white">
    <!-- 头部：标题和添加按钮 -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
      <h2 class="text-sm font-semibold text-gray-300">连接列表</h2>
      <!-- 添加按钮 - 需求: 2.1 -->
      <button
        @click="handleAdd"
        class="p-1.5 rounded-md hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
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
        class="flex flex-col items-center justify-center h-full px-4 py-8 text-center"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-12 w-12 text-gray-600 mb-3"
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
        <p class="text-gray-500 text-sm mb-2">暂无连接</p>
        <p class="text-gray-600 text-xs">点击上方 + 按钮添加新连接</p>
      </div>

      <!-- 连接列表 - 需求: 1.3 -->
      <ul v-else class="py-2">
        <li
          v-for="connection in connections"
          :key="connection.id"
          @click="handleSelect(connection.id)"
          @dblclick="handleOpen(connection.id)"
          :class="[
            'group flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors',
            isSelected(connection.id)
              ? 'bg-blue-600 text-white'
              : 'hover:bg-gray-800 text-gray-300'
          ]"
        >
          <!-- 连接图标和名称 -->
          <div class="flex items-center gap-3 min-w-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4 flex-shrink-0"
              :class="isSelected(connection.id) ? 'text-white' : 'text-gray-500'"
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
            <span class="truncate text-sm">{{ connection.name }}</span>
          </div>

          <!-- 删除按钮 -->
          <button
            @click="handleDelete(connection.id, $event)"
            class="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            :class="
              isSelected(connection.id)
                ? 'hover:bg-blue-500 text-white'
                : 'hover:bg-gray-700 text-gray-500 hover:text-gray-300'
            "
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
