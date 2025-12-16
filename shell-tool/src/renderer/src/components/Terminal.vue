<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useThemeStore } from '../stores/themeStore'

/**
 * Terminal.vue - 终端组件
 * 需求: 4.1, 4.2, 4.3
 */

// Props
const props = withDefaults(defineProps<{
  sshSessionId: string
  status?: 'connecting' | 'connected' | 'failed'
  errorMessage?: string
}>(), {
  status: 'connected',
  errorMessage: undefined
})

// Emits
const emit = defineEmits<{
  (e: 'data', data: string): void
  (e: 'resize', cols: number, rows: number): void
}>()

// Refs
const terminalRef = ref<HTMLDivElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let selectionListener: { dispose: () => void } | null = null
let dataUnsubscribe: (() => void) | null = null
let exitUnsubscribe: (() => void) | null = null
let connectingTimer: number | null = null
let connectingSeconds = 0
const themeStore = useThemeStore()
const terminalTheme = computed(() => themeStore.getTerminalTheme())
const hasSelection = ref(false)
const contextMenuState = ref<{ visible: boolean; x: number; y: number }>({
  visible: false,
  x: 0,
  y: 0
})

function startConnectingTimer(): void {
  if (!terminal) return
  stopConnectingTimer()
  connectingSeconds = 0
  terminal.writeln('\x1b[33m正在连接中...0s\x1b[0m')
  connectingTimer = window.setInterval(() => {
    connectingSeconds += 1
    if (!terminal) return
    terminal.write(`\r\x1b[2K\x1b[33m正在连接中...${connectingSeconds}s\x1b[0m`)
  }, 1000)
}

function stopConnectingTimer(): void {
  if (connectingTimer !== null) {
    window.clearInterval(connectingTimer)
    connectingTimer = null
  }
}

function printConnectResult(success: boolean, message?: string): void {
  if (!terminal) return
  stopConnectingTimer()
  const base = success
    ? '\r\n\x1b[32m连接成功\x1b[0m\r\n'
    : `\r\n\x1b[31m连接失败${message ? `: ${message}` : ''}\x1b[0m\r\n`
  terminal.write(base)
}

function setupSSHBindings(): void {
  if (!terminalRef.value || !terminal || !props.sshSessionId) return
  if (!window.shellTool?.ssh) return

  // 避免重复绑定
  if (dataUnsubscribe || exitUnsubscribe) return

  dataUnsubscribe = window.shellTool.ssh.onData((sessionId, data) => {
    if (sessionId === props.sshSessionId && terminal) {
      terminal.write(data)
    }
  })

  exitUnsubscribe = window.shellTool.ssh.onExit((sessionId, code) => {
    if (sessionId === props.sshSessionId && terminal) {
      terminal.write(`\r\n\x1b[33m[进程已退出，退出码: ${code}]\x1b[0m\r\n`)
    }
  })
}

// Initialize terminal
function initTerminal(): void {
  if (!terminalRef.value) return
  if (!window.shellTool?.ssh) {
    console.error('[Terminal] ShellTool SSH API 未注入，终端不可用')
    return
  }

  // Create terminal instance
  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: terminalTheme.value,
    allowProposedApi: true
  })

  // Create fit addon for auto-resize
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  // Open terminal in container
  terminal.open(terminalRef.value)

  // Fit terminal to container
  nextTick(() => {
    fitAddon?.fit()
    // Emit initial size
    if (terminal) {
      emit('resize', terminal.cols, terminal.rows)
      // 通知远程 SSH 调整窗口
      if (props.sshSessionId) {
        window.shellTool?.ssh?.resize(props.sshSessionId, terminal.cols, terminal.rows)
      }
    }
  })

  // Handle terminal input
  terminal.onData((data) => {
    // 仅在已连接时转发输入（远端负责回显）
    if (props.status === 'connected' && props.sshSessionId) {
      emit('data', data)
      window.shellTool?.ssh?.write(props.sshSessionId, data)
    }
  })

  // 监听选择变化以更新菜单可用状态
  selectionListener = terminal.onSelectionChange(() => {
    hasSelection.value = !!terminal?.getSelection()
  })

  // Setup resize observer for auto-fit
  resizeObserver = new ResizeObserver(() => {
    if (fitAddon && terminal) {
      fitAddon.fit()
      emit('resize', terminal.cols, terminal.rows)
      if (props.sshSessionId) {
        window.shellTool?.ssh?.resize(props.sshSessionId, terminal.cols, terminal.rows)
      }
    }
  })
  resizeObserver.observe(terminalRef.value)

  // 连接中状态提示
  if (props.status === 'connecting') {
    startConnectingTimer()
  } else if (props.status === 'connected' && props.sshSessionId) {
    setupSSHBindings()
  } else if (props.status === 'failed') {
    printConnectResult(false, props.errorMessage)
  }
}

// Cleanup terminal
function cleanupTerminal(): void {
  if (dataUnsubscribe) {
    dataUnsubscribe()
    dataUnsubscribe = null
  }
  if (selectionListener) {
    selectionListener.dispose()
    selectionListener = null
  }
  if (exitUnsubscribe) {
    exitUnsubscribe()
    exitUnsubscribe = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (terminal) {
    terminal.dispose()
    terminal = null
  }
  fitAddon = null
  stopConnectingTimer()
  pendingEcho = ''
}

function applyTerminalTheme(): void {
  if (terminal) {
    terminal.options.theme = terminalTheme.value
    terminal.refresh(0, terminal.rows - 1)
  }
}

// Focus terminal
function focus(): void {
  terminal?.focus()
}

// Expose focus method
defineExpose({ focus })

function refreshSelectionState(): void {
  hasSelection.value = !!terminal?.getSelection()
}

function hideContextMenu(): void {
  contextMenuState.value.visible = false
}

async function copySelection(): Promise<void> {
  refreshSelectionState()
  if (!hasSelection.value) return
  const text = terminal?.getSelection()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    console.error('[Terminal] 写入剪贴板失败', error)
  } finally {
    hideContextMenu()
  }
}

function sendInput(text: string): void {
  if (!text) return
  if (props.status === 'connected' && props.sshSessionId) {
    window.shellTool?.ssh?.write(props.sshSessionId, text)
  }
}

async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    sendInput(text)
  } catch (error) {
    console.error('[Terminal] 读取剪贴板失败', error)
  } finally {
    hideContextMenu()
  }
}

function pasteSelection(): void {
  refreshSelectionState()
  if (!hasSelection.value) return
  const text = terminal?.getSelection()
  if (text) {
    sendInput(text)
  }
  hideContextMenu()
}

function clearTerminal(): void {
  terminal?.clear()
  hasSelection.value = false
  if (props.status === 'connected' && props.sshSessionId) {
    window.shellTool?.ssh?.write(props.sshSessionId, 'clear\n')
  }
  hideContextMenu()
}

function handleContextMenu(event: MouseEvent): void {
  event.preventDefault()
  refreshSelectionState()
  contextMenuState.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY
  }
}

// Lifecycle
onMounted(() => {
  initTerminal()
  document.addEventListener('click', hideContextMenu)
})

onUnmounted(() => {
  cleanupTerminal()
  document.removeEventListener('click', hideContextMenu)
})

// Watch for sshSessionId changes (session switch)
watch(() => props.sshSessionId, (newId, oldId) => {
  if (newId !== oldId) {
    // 当会话真正建立（获取到 sshSessionId）且状态为 connected 时，绑定远程数据
    if (terminal && props.status === 'connected' && newId) {
      setupSSHBindings()
    }
  }
})

// Watch connection status to更新提示
watch(
  () => props.status,
  (newStatus, oldStatus) => {
    if (!terminal) return
    if (newStatus === 'connecting' && oldStatus !== 'connecting') {
      startConnectingTimer()
    } else if (newStatus === 'connected' && oldStatus !== 'connected') {
      printConnectResult(true)
      if (props.sshSessionId) {
        setupSSHBindings()
      }
    } else if (newStatus === 'failed' && oldStatus !== 'failed') {
      printConnectResult(false, props.errorMessage)
    }
  }
)

watch(terminalTheme, () => {
  applyTerminalTheme()
})
</script>

<template>
  <div class="terminal-wrapper" @contextmenu="handleContextMenu">
    <div
      ref="terminalRef"
      class="terminal-container w-full h-full"
    />

    <div
      v-if="contextMenuState.visible"
      class="terminal-context-menu"
      :style="{ top: `${contextMenuState.y}px`, left: `${contextMenuState.x}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <button class="ctx-item" :disabled="!hasSelection" @click="copySelection">复制</button>
      <button class="ctx-item" @click="pasteFromClipboard">粘贴</button>
      <button class="ctx-item" :disabled="!hasSelection" @click="pasteSelection">粘贴选中</button>
      <button class="ctx-item" @click="clearTerminal">清空缓存</button>
    </div>
  </div>
</template>

<style scoped>
.terminal-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.terminal-container {
  padding: 4px;
  background: var(--terminal-bg);
  color: var(--terminal-fg);
}

.terminal-container :deep(.xterm) {
  height: 100%;
}

.terminal-container :deep(.xterm-viewport) {
  overflow-y: auto;
}

.terminal-context-menu {
  position: fixed;
  z-index: 20;
  background: var(--color-surface, #2d2d3a);
  border: 1px solid var(--color-border-strong, #444);
  border-radius: 6px;
  padding: 6px 0;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  min-width: 140px;
}

.ctx-item {
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  color: var(--color-text-primary, #f5f5f5);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
}

.ctx-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.ctx-item:disabled {
  color: var(--color-text-muted, #7a7a84);
  cursor: not-allowed;
}
</style>
