<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { validateConnection } from '../../../shared'
import type { AuthType, Connection } from '../../../shared'

/**
 * AddConnectionDialog.vue - 添加 SSH 连接对话框组件
 * 需求: 2.1, 2.2, 2.3, 2.4
 */

// Props
interface Props {
  visible: boolean
  mode?: 'create' | 'edit'
  formData?: (Partial<Connection> & { id?: string }) | null
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
const isEditMode = computed(() => props.mode === 'edit')
const dialogTitle = computed(() => (isEditMode.value ? '编辑 SSH 连接' : '添加 SSH 连接'))
const submitLabel = computed(() => {
  if (isSubmitting.value) return isEditMode.value ? '保存中...' : '添加中...'
  return isEditMode.value ? '保存' : '添加'
})

// Computed
const hasErrors = computed(() => errors.value.length > 0)
const isPasswordAuth = computed(() => authType.value === 'password')
const isPublicKeyAuth = computed(() => authType.value === 'publickey')

// Watch for dialog visibility to reset form
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      initializeForm()
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

watch(
  () => props.formData,
  (data) => {
    if (props.visible && isEditMode.value && data) {
      fillForm(data)
    }
  },
  { deep: true }
)

// Methods
function initializeForm(): void {
  if (isEditMode.value && props.formData) {
    fillForm(props.formData)
  } else {
    resetForm()
  }
}

function fillForm(data: Partial<Connection>): void {
  name.value = data.name || ''
  host.value = data.host || ''
  port.value = data.port ?? 22
  username.value = data.username || ''
  authType.value = data.authType || 'password'
  password.value = data.password || ''
  privateKeyPath.value = data.privateKeyPath || ''
  passphrase.value = data.passphrase || ''
  remark.value = data.remark || ''
  errors.value = []
  isSubmitting.value = false
}

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
    id: isEditMode.value ? props.formData?.id : undefined,
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
    id: connectionData.id,
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
      <div v-if="visible" class="dialog-wrapper fixed inset-0 z-50 flex items-start justify-center pointer-events-none">
        <!-- 对话框内容 - 需求: 2.2 -->
        <Transition name="scale">
          <div
            v-if="visible"
            class="dialog-panel rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden pointer-events-auto"
            @click.stop
          >
            <!-- 对话框头部 -->
            <div class="dialog-header flex items-center justify-between px-6 py-4 border-b">
              <h3 class="dialog-title text-lg font-semibold">{{ dialogTitle }}</h3>
              <button
                @click="handleClose"
                class="dialog-icon-btn p-1 rounded-md transition-colors"
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
                class="dialog-error p-3 rounded-md text-sm"
              >
                <ul class="list-disc list-inside space-y-1">
                  <li v-for="(error, index) in errors" :key="index">{{ error }}</li>
                </ul>
              </div>

              <!-- 连接名称（必填） -->
              <div>
                <label for="connection-name" class="form-label block text-sm font-medium mb-1">
                  连接名称 <span class="text-red-400">*</span>
                </label>
                <input
                  id="connection-name"
                  v-model="name"
                  type="text"
                  placeholder="例如：生产服务器"
                  class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @input="clearErrors"
                  autofocus
                />
              </div>

              <!-- 主机和端口 -->
              <div class="grid grid-cols-3 gap-3">
                <div class="col-span-2">
                  <label for="connection-host" class="form-label block text-sm font-medium mb-1">
                    主机 <span class="text-red-400">*</span>
                  </label>
                  <input
                    id="connection-host"
                    v-model="host"
                    type="text"
                    placeholder="例如：192.168.1.100"
                    class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    @input="clearErrors"
                  />
                </div>
                <div>
                  <label for="connection-port" class="form-label block text-sm font-medium mb-1">
                    端口 <span class="text-red-400">*</span>
                  </label>
                  <input
                    id="connection-port"
                    v-model.number="port"
                    type="number"
                    min="1"
                    max="65535"
                    class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    @input="clearErrors"
                  />
                </div>
              </div>

              <!-- 用户名（必填） -->
              <div>
                <label for="connection-username" class="form-label block text-sm font-medium mb-1">
                  用户名 <span class="text-red-400">*</span>
                </label>
                <input
                  id="connection-username"
                  v-model="username"
                  type="text"
                  placeholder="例如：root"
                  class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @input="clearErrors"
                />
              </div>

              <!-- 认证方式（必填） -->
              <div>
                <label for="connection-auth-type" class="form-label block text-sm font-medium mb-1">
                  认证方式 <span class="text-red-400">*</span>
                </label>
                <select
                  id="connection-auth-type"
                  v-model="authType"
                  class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @change="clearErrors"
                >
                  <option value="password">密码</option>
                  <option value="publickey">公钥</option>
                </select>
              </div>

              <!-- 密码（密码认证时必填） -->
              <div v-if="isPasswordAuth">
                <label for="connection-password" class="form-label block text-sm font-medium mb-1">
                  密码 <span class="text-red-400">*</span>
                </label>
                <input
                  id="connection-password"
                  v-model="password"
                  type="password"
                  placeholder="请输入密码"
                  class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @input="clearErrors"
                />
              </div>

              <!-- 私钥路径（公钥认证时必填） -->
              <div v-if="isPublicKeyAuth">
                <label for="connection-private-key" class="form-label block text-sm font-medium mb-1">
                  私钥路径 <span class="text-red-400">*</span>
                </label>
                <input
                  id="connection-private-key"
                  v-model="privateKeyPath"
                  type="text"
                  placeholder="例如：~/.ssh/id_rsa"
                  class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  @input="clearErrors"
                />
              </div>

              <!-- 私钥密码（公钥认证时可选） -->
              <div v-if="isPublicKeyAuth">
                <label for="connection-passphrase" class="form-label block text-sm font-medium mb-1">
                  私钥密码
                  <span class="form-hint font-normal text-sm">（可选）</span>
                </label>
                <input
                  id="connection-passphrase"
                  v-model="passphrase"
                  type="password"
                  placeholder="如果私钥有密码，请输入"
                  class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <!-- 备注（可选） -->
              <div>
                <label for="connection-remark" class="form-label block text-sm font-medium mb-1">
                  备注
                  <span class="form-hint text-sm font-normal">（可选）</span>
                </label>
                <textarea
                  id="connection-remark"
                  v-model="remark"
                  rows="2"
                  placeholder="添加连接备注信息"
                  class="form-input w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                ></textarea>
              </div>
            </form>

            <!-- 对话框底部按钮 -->
            <div class="dialog-footer flex justify-end gap-3 px-6 py-4 border-t">
              <button
                type="button"
                @click="handleClose"
                class="btn-secondary px-4 py-2 text-sm font-medium rounded-md transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                @click="handleSubmit"
                :disabled="isSubmitting"
                class="btn-primary px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ submitLabel }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-wrapper {
  padding-top: 48px;
  align-items: flex-start;
}

.dialog-panel {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
}

.dialog-header {
  border-color: var(--color-border);
}

.dialog-title {
  color: var(--color-text-primary);
}

.dialog-icon-btn {
  color: var(--color-text-muted);
  transition: color 0.2s ease, background-color 0.2s ease;
}

.dialog-icon-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-strong);
}

.dialog-error {
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  color: var(--color-danger-text);
}

.form-label {
  color: var(--color-text-secondary);
}

.form-hint {
  color: var(--color-text-muted);
}

.form-input {
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  color: var(--color-text-primary);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 35%, transparent);
}

.dialog-footer {
  border-color: var(--color-border);
  background: var(--color-surface-muted);
}

.btn-secondary {
  color: var(--color-text-secondary);
  background: var(--color-surface-muted);
}

.btn-secondary:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-strong);
}

.btn-primary {
  background: var(--color-primary);
  color: #ffffff;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

/* 亮色主题下使用更深的蓝色以确保对比度 */
:root:not([data-theme='dark']) .btn-primary {
  background: #1d4ed8;
}

:root:not([data-theme='dark']) .btn-primary:hover {
  background: #1e40af;
}

.btn-primary:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

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
