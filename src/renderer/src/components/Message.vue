<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { setMessageAPI } from '../utils/message'

export interface MessageItem {
  id: number
  text: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}

const messages = ref<MessageItem[]>([])
let messageIdCounter = 0

function addMessage(text: string, type: MessageItem['type'] = 'info', duration = 3000): void {
  const id = messageIdCounter++
  const message: MessageItem = {
    id,
    text,
    type,
    duration
  }
  messages.value.push(message)

  // 自动移除
  if (duration > 0) {
    setTimeout(() => {
      removeMessage(id)
    }, duration)
  }
}

function removeMessage(id: number): void {
  const index = messages.value.findIndex((msg) => msg.id === id)
  if (index > -1) {
    messages.value.splice(index, 1)
  }
}

// 暴露 API 给工具函数
onMounted(() => {
  const api = {
    success: (text: string, duration?: number) => addMessage(text, 'success', duration),
    error: (text: string, duration?: number) => addMessage(text, 'error', duration),
    info: (text: string, duration?: number) => addMessage(text, 'info', duration),
    warning: (text: string, duration?: number) => addMessage(text, 'warning', duration)
  }
  setMessageAPI(api)
})

// 计算样式类
const getMessageClass = (type: MessageItem['type']) => {
  return {
    'message-item--success': type === 'success',
    'message-item--error': type === 'error',
    'message-item--info': type === 'info',
    'message-item--warning': type === 'warning'
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="message-container fixed top-0 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-3 pt-4">
      <TransitionGroup name="message" tag="div" class="flex flex-col items-center gap-3">
        <div
          v-for="message in messages"
          :key="message.id"
          class="message-item flex items-center gap-3 px-4 py-3 rounded shadow-lg"
          :class="getMessageClass(message.type)"
        >
          <!-- 图标 -->
          <div class="message-item__icon flex-shrink-0">
            <svg
              v-if="message.type === 'success'"
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <svg
              v-else-if="message.type === 'error'"
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <svg
              v-else-if="message.type === 'warning'"
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <!-- 文本内容 -->
          <span class="message-item__text flex-1">{{ message.text }}</span>
          <!-- 关闭按钮 -->
          <button
            class="message-item__close flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            @click="removeMessage(message.id)"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.message-container {
  pointer-events: none;
  width: 100%;
}

.message-item {
  pointer-events: auto;
  min-width: 380px;
  max-width: 500px;
  background: #ffffff;
  color: #606266;
  border: 1px solid #e4e7ed;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  font-size: 14px;
  line-height: 1.5;
  border-radius: 4px;
}

.message-item--success {
  background: #f0f9ff;
  color: #67c23a;
  border-color: #b3e19d;
}

.message-item--success .message-item__icon {
  color: #67c23a;
}

.message-item--error {
  background: #fef0f0;
  color: #f56c6c;
  border-color: #fbc4c4;
}

.message-item--error .message-item__icon {
  color: #f56c6c;
}

.message-item--info {
  background: #f4f4f5;
  color: #909399;
  border-color: #d3d4d6;
}

.message-item--info .message-item__icon {
  color: #909399;
}

.message-item--warning {
  background: #fdf6ec;
  color: #e6a23c;
  border-color: #f5dab1;
}

.message-item--warning .message-item__icon {
  color: #e6a23c;
}

.message-item__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-item__text {
  word-break: break-word;
}

.message-item__close {
  color: #909399;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.message-item__close:hover {
  color: #606266;
}

.message-item--success .message-item__close,
.message-item--error .message-item__close,
.message-item--warning .message-item__close {
  color: inherit;
  opacity: 0.7;
}

.message-item--success .message-item__close:hover,
.message-item--error .message-item__close:hover,
.message-item--warning .message-item__close:hover {
  opacity: 1;
}

/* 动画效果 - 从顶部滑入 */
.message-enter-active {
  transition: all 0.3s cubic-bezier(0.55, 0, 0.1, 1);
}

.message-leave-active {
  transition: all 0.3s cubic-bezier(0.55, 0, 0.1, 1);
}

.message-enter-from {
  opacity: 0;
  transform: translateY(-100%);
}

.message-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.message-move {
  transition: transform 0.3s cubic-bezier(0.55, 0, 0.1, 1);
}
</style>

