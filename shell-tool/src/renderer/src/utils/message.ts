/**
 * Message 工具函数
 * 提供函数式调用的消息提示 API
 */

export type MessageType = 'success' | 'error' | 'info' | 'warning'

interface MessageAPI {
  success: (text: string, duration?: number) => void
  error: (text: string, duration?: number) => void
  info: (text: string, duration?: number) => void
  warning: (text: string, duration?: number) => void
}

let messageAPI: MessageAPI | null = null

/**
 * 获取 Message API
 * 如果组件还未挂载，返回一个延迟执行的函数
 */
function getMessageAPI(): MessageAPI {
  if (messageAPI) {
    return messageAPI
  }

  // 如果还未挂载，返回一个会在下次事件循环中重试的函数
  return {
    success: (text: string, duration?: number) => {
      setTimeout(() => {
        const api = getMessageAPI()
        if (api) {
          api.success(text, duration)
        }
      }, 0)
    },
    error: (text: string, duration?: number) => {
      setTimeout(() => {
        const api = getMessageAPI()
        if (api) {
          api.error(text, duration)
        }
      }, 0)
    },
    info: (text: string, duration?: number) => {
      setTimeout(() => {
        const api = getMessageAPI()
        if (api) {
          api.info(text, duration)
        }
      }, 0)
    },
    warning: (text: string, duration?: number) => {
      setTimeout(() => {
        const api = getMessageAPI()
        if (api) {
          api.warning(text, duration)
        }
      }, 0)
    }
  }
}

/**
 * 设置 Message API（由 Message 组件调用）
 */
export function setMessageAPI(api: MessageAPI): void {
  messageAPI = api
}

/**
 * 显示成功消息
 */
export function messageSuccess(text: string, duration = 3000): void {
  getMessageAPI().success(text, duration)
}

/**
 * 显示错误消息
 */
export function messageError(text: string, duration = 3000): void {
  getMessageAPI().error(text, duration)
}

/**
 * 显示信息消息
 */
export function messageInfo(text: string, duration = 3000): void {
  getMessageAPI().info(text, duration)
}

/**
 * 显示警告消息
 */
export function messageWarning(text: string, duration = 3000): void {
  getMessageAPI().warning(text, duration)
}

/**
 * Message 对象，提供更简洁的调用方式
 */
export const message = {
  success: messageSuccess,
  error: messageError,
  info: messageInfo,
  warning: messageWarning
}

