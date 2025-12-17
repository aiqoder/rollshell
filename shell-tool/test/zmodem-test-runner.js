/**
 * Electron 测试运行器
 * 用于在 Electron 环境中运行 TypeScript 测试脚本
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 使用 electron 以 Node.js 模式运行 tsx，加载 TypeScript 测试文件
const testFile = join(__dirname, 'zmodem-test.ts')

// 设置环境变量
process.env.ELECTRON_IS_TEST = 'true'

// 使用 electron 运行，但以 Node.js 模式执行 tsx 来加载 TypeScript
const electron = spawn('npx', ['electron', '--eval', `
  process.env.ELECTRON_IS_TEST = 'true';
  require('tsx/cjs/api').register();
  require(${JSON.stringify(testFile)});
`], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  },
  shell: true
})

electron.on('error', (error) => {
  console.error('❌ 启动测试失败:', error)
  process.exit(1)
})

electron.on('exit', (code) => {
  process.exit(code || 0)
})

