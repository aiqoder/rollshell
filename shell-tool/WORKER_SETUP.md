# ZMODEM Worker 设置说明

## 问题

Worker 文件路径找不到的问题，需要确保 electron-vite 正确构建 Worker 文件。

## 解决方案

### 1. electron-vite.config.ts 配置

已在 `electron.vite.config.ts` 中添加了 Worker 文件的构建配置：

```typescript
input: {
  index: resolve(__dirname, 'src/main/index.ts'),
  'workers/zmodem.worker': resolve(__dirname, 'src/main/workers/zmodem.worker.ts')
},
output: {
  entryFileNames: (chunkInfo) => {
    if (chunkInfo.name === 'workers/zmodem.worker') {
      return 'workers/zmodem.worker.js'
    }
    return '[name].js'
  }
}
```

### 2. Worker 文件路径查找

`ZMODEMWorkerManager.ts` 会尝试多个可能的路径：

1. `out/main/workers/zmodem.worker.js` (相对路径，从 out/main/services)
2. `out/main/workers/zmodem.worker.js` (从 src/main/services)
3. 其他备用路径

### 3. 构建后验证

构建完成后，检查文件是否存在：

```bash
ls -la out/main/workers/zmodem.worker.js
```

### 4. 如果构建失败

如果 Worker 文件没有正确构建，可以：

1. **检查构建日志**: 查看 electron-vite 构建输出
2. **手动构建 Worker**: 如果自动构建失败，可以手动编译 TypeScript
3. **使用直接模式**: 设置 `ZMODEM_USE_WORKER=false` 使用原来的 ZMODEMManager

### 5. 开发环境 vs 生产环境

- **开发环境**: Worker 文件应该在 `out/main/workers/zmodem.worker.js`
- **生产环境**: electron-builder 会自动打包 Worker 文件

### 6. 调试技巧

如果遇到路径问题，查看日志：

```
[ZMODEMWorkerManager] Worker 文件不存在，尝试的路径:
[ZMODEMWorkerManager]   ......
[ZMODEMWorkerManager] __dirname: ...
```

根据实际路径调整代码中的路径查找逻辑。

