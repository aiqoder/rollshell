/**
 * Electron 测试入口点 (ESM)
 * 在 Electron 环境中加载并运行编译后的测试脚本
 */

import { register } from 'tsx/esm/api'

// 注册 TypeScript 支持
register()

// 设置测试环境
process.env.ELECTRON_IS_TEST = 'true'
// 启用 ZMODEM 调试模式
process.env.ZMODEM_DEBUG = '1'

// 加载测试文件
await import('./zmodem-test.ts')

