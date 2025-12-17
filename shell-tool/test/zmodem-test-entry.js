/**
 * Electron 测试入口点
 * 在 Electron 环境中加载并运行 TypeScript 测试脚本
 */

// 设置测试环境
process.env.ELECTRON_IS_TEST = 'true'

// 使用 tsx 注册器加载 TypeScript
import('tsx/esm/api').then((tsx) => {
  // 加载测试文件
  return import('./zmodem-test.ts')
}).catch((error) => {
  console.error('❌ 加载测试文件失败:', error)
  process.exit(1)
})

