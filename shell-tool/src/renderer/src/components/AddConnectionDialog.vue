<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { validateConnection } from '../../../shared'
import type { AuthType } from '../../../shared'

/**
 * AddConnectionDialog.vue - 添加 SSH 连接对话框组件
 * 需求: 2.1, 2.2, 2.3, 2.4
 */

// Props
interface Props {
  visible: boolean
  submitResult?: {
    success: boolean
    errors?: string[]
  } | null
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: {
    name: string
    host: string
    port: number
    username: string
    authType: AuthType
    password?: string
    privateKeyPath?: string
    passphrase?: string
    remark?: string
  }): void
}>()

// Form state
const name = ref('')
const host = ref('')
const port = ref(22)
const username = ref('')
const authType = ref<AuthType>('password')
const password = ref('')
const privateKeyPath = ref('')
const passphrase = ref('')
const remark = ref('')
const errors = ref<string[]>([])
const isSubmitting = ref(false)

// Computed
const hasErrors = computed(() => errors.value.length > 0)
const isPasswordAuth = computed(() => authType.value === 'password')
const isPublicKeyAuth = computed(() => authType.value === 'publickey')

// Watch for dialog visibility to reset form
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      resetForm()
    }
  }
)

watch(
  () => props.submitResult,
  (result) => {
    if (!result) return
    isSubmitting.value = false
    if (result.success) {
      console.info('[AddConnectionDialog] 收到提交成功状态')
      return
    }
    const resultErrors = result.errors && result.errors.length > 0 ? result.errors : ['添加连接失败，请稍后重试']
    errors.value = resultErrors
    console.warn('[AddConnectionDialog] 收到提交失败状态', resultErrors)
  }
)

// Methods
function resetForm(): void {
  name.value = ''
  host.value = ''
  port.value = 22
  username.value = ''
  authType.value = 'password'
  password.value = ''
  privateKeyPath.value = ''
  passphrase.value = ''
  remark.value = ''
  errors.value = []
  isSubmitting.value = false
}

function handleClose(): void {
  emit('close')
}

function handleSubmit(): void {
  // 构建连接数据
  const connectionData = {
    name: name.value.trim(),
    host: host.value.trim(),
    port: port.value,
    username: username.value.trim(),
    authType: authType.value,
    password: authType.value === 'password' ? password.value : undefined,
    privateKeyPath: authType.value === 'publickey' ? privateKeyPath.value.trim() : undefined,
    passphrase: authType.value === 'publickey' && passphrase.value ? passphrase.value : undefined,
    remark: remark.value.trim() || undefined
  }

  const logPayload = {
    name: connectionData.name,
    host: connectionData.host,
    port: connectionData.port,
    username: connectionData.username,
    authType: connectionData.authType
  }
  console.info('[AddConnectionDialog] 即将提交连接', logPayload)

  // 验证表单 - 需求: 2.4
  const validation = validateConnection(connectionData)
  if (!validation.valid) {
    errors.value = validation.errors
    console.warn('[AddConnectionDialog] 表单校验失败', {
      errors: validation.errors,
      ...logPayload
    })
    return
  }

  errors.value = []
  isSubmitting.value = true

  console.info('[AddConnectionDialog] 表单校验通过，发起 submit 事件', logPayload)
  emit('submit', connectionData)
}

function clearErrors(): void {
  errors.value = []
}
</script>

<template>
  <!-- 对话框遮罩层 -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      >
        <!-- 对话框内容 - 需求: 2.2 -->
        <Transition name="scale">
          <div
            v-if="visible"
            class="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
            @click.stop
          >
            <!-- 对话框头部 -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h3 class="text-lg font-semibold text-white">添加 SSH 连接</h3>
              <button
                @click="handleClose"
                class="p-1 rounded-md hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                aria-label="关闭"
              >
                <svg
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
              </button>
            </div>

            <!-- 对话框表单 -->
            <form @submit.prevent="handleSubmit" class="px-6 py-4 space-y-4">
              <!-- 错误提示 - 需求: 2.4 -->
              <div
                v-if="hasErrors"
                class="p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm"
              >
                <ul class="list-disc list-inside space-y-1">
                  <li v-for="(error, index) in errors" :key="index">{{ error }}</li>
                </ul>
              </div>

              <!-- 连接名称（必填） -->
              <div>
                <label for="connection-name" class="block text-sm font-medium text-gray-300 mb-1">
                  连接名称 <span class="text-red-400">*</span>
                </label>
                <input
                  id="connection-name"
                  v-model="name"
                  type="text"
                  placeholder="例如：生产服务器"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @input="clearErrors"
                  autofocus
                />
              </div>

              <!-- 主机和端口 -->
              <div class="grid grid-cols-3 gap-3">
                <div class="col-span-2">
                  <label for="connection-host" class="block text-sm font-medium text-gray-300 mb-1">
                    主机 <span class="text-red-400">*</span>
                  </label>
                  <input
                    id="connection-host"
                    v-model="host"
                    type="text"
                    placeholder="例如：192.168.1.100"
                    class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    @input="clearErrors"
                  />
                </div>
                <div>
                  <label for="connection-port" class="block text-sm font-medium text-gray-300 mb-1">
                    端口 <span class="text-red-400">*</span>
                  </label>
                  <input
                    id="connection-port"
                    v-model.number="port"
                    type="number"
                    min="1"
                    max="65535"
                    class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    @input="clearErrors"
                  />
                </div>
              </div>

              <!-- 用户名（必填） -->
              <div>
                <label for="connection-username" class="block text-sm font-medium text-gray-300 mb-1">
                  用户名 <span class="text-red-400">*</span>
                </label>
                <input
                  id="connection-username"
                  v-model="username"
                  type="text"
                  placeholder="例如：root"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @input="clearErrors"
                />
              </div>

              <!-- 认证方式（必填） -->
              <div>
                <label for="connection-auth-type" class="block text-sm font-medium text-gray-300 mb-1">
                  认证方式 <span class="text-red-400">*</span>
                </label>
                <select
                  id="connection-auth-type"
                  v-model="authType"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @change="clearErrors"
                >
                  <option value="password">密码</option>
                  <option value="publickey">公钥</option>
                </select>
              </div>

              <!-- 密码（密码认证时必填） -->
              <div v-if="isPasswordAuth">
                <label for="connection-password" class="block text-sm font-medium text-gray-300 mb-1">
                  密码 <span class="text-red-400">*</span>
                </label>
                <input
                  id="connection-password"
                  v-model="password"
                  type="password"
                  placeholder="请输入密码"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @input="clearErrors"
                />
              </div>

              <!-- 私钥路径（公钥认证时必填） -->
              <div v-if="isPublicKeyAuth">
                <label for="connection-private-key" class="block text-sm font-medium text-gray-300 mb-1">
                  私钥路径 <span class="text-red-400">*</span>
                </label>
                <input
                  id="connection-private-key"
                  v-model="privateKeyPath"
                  type="text"
                  placeholder="例如：~/.ssh/id_rsa"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @input="clearErrors"
                />
              </div>

              <!-- 私钥密码（公钥认证时可选） -->
              <div v-if="isPublicKeyAuth">
                <label for="connection-passphrase" class="block text-sm font-medium text-gray-300 mb-1">
                  私钥密码
                  <span class="text-gray-500 font-normal">（可选）</span>
                </label>
                <input
                  id="connection-passphrase"
                  v-model="passphrase"
                  type="password"
                  placeholder="如果私钥有密码，请输入"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <!-- 备注（可选） -->
              <div>
                <label for="connection-remark" class="block text-sm font-medium text-gray-300 mb-1">
                  备注
                  <span class="text-gray-500 font-normal">（可选）</span>
                </label>
                <textarea
                  id="connection-remark"
                  v-model="remark"
                  rows="2"
                  placeholder="添加连接备注信息"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                ></textarea>
              </div>
            </form>

            <!-- 对话框底部按钮 -->
            <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-700 bg-gray-850">
              <button
                type="button"
                @click="handleClose"
                class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                @click="handleSubmit"
                :disabled="isSubmitting"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ isSubmitting ? '添加中...' : '添加' }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 缩放动画 */
.scale-enter-active,
.scale-leave-active {
  transition: all 0.2s ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
