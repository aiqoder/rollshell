# ZMODEM Worker 与 Go 库对接说明

## 架构概述

实现了 ZMODEM Worker 模式，将 ZMODEM 协议处理与主进程解耦，提升性能和稳定性。

### 组件结构

```
┌─────────────────────────────────────────────────────────┐
│                   主进程 (Main Process)                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │          SSHManager                              │   │
│  │  - 检测 ZMODEM 序列                              │   │
│  │  - 创建 ZMODEMWorkerManager 或 ZMODEMManager    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │     ZMODEMWorkerManager                          │   │
│  │  - 管理 Worker 生命周期                          │   │
│  │  - 调用 NativeLibManager (Go 库)                 │   │
│  │  - 处理文件对话框和窗口通信                      │   │
│  └──────────────────────────────────────────────────┘   │
│           ↕ postMessage                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │     NativeLibManager                             │   │
│  │  - 加载 Go 动态库                                │   │
│  │  - 调用 Go ZMODEM 函数                          │   │
│  └──────────────────────────────────────────────────┘   │
│           ↕ FFI (koffi)                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │     Go 动态库 (lib.dylib)                        │   │
│  │  - ZMODEM 协议实现                               │   │
│  │  - 帧解析和构建                                  │   │
│  │  - 文件 I/O                                      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                              ↕ postMessage
┌─────────────────────────────────────────────────────────┐
│              Worker 线程 (Worker Thread)                │
│  ┌──────────────────────────────────────────────────┐   │
│  │     zmodem.worker.ts                            │   │
│  │  - 数据处理和状态管理                            │   │
│  │  - 进度跟踪                                      │   │
│  │  - 请求主进程调用 Go 库                          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 工作流程

### 1. 初始化流程

1. **SSHManager** 检测到 ZMODEM 序列 (`**B00` 或 `**B01`)
2. **SSHManager** 创建 **ZMODEMWorkerManager** 实例
3. **ZMODEMWorkerManager** 显示文件对话框（上传/下载）
4. **ZMODEMWorkerManager** 调用 **NativeLibManager** 初始化 Go 库会话
5. **ZMODEMWorkerManager** 创建 Worker 线程
6. **Worker** 发送初始化消息给主进程

### 2. 数据传输流程（上传 rz）

1. 用户选择文件后，Worker 初始化完成
2. 远程服务器发送 `ZRINIT` 帧
3. **SSHManager** 收到数据，转发给 **ZMODEMWorkerManager**
4. **ZMODEMWorkerManager** 转发数据到 Worker
5. **Worker** 请求主进程调用 `zmodemFeedData`
6. **主进程** 调用 Go 库处理数据，Go 库解析 `ZRINIT`，准备 `ZFILE` 帧
7. **Worker** 请求主进程获取输出数据 (`zmodemGetOutputData`)
8. **主进程** 获取 Go 库输出数据，发送给 Worker
9. **Worker** 转发输出数据给主进程，主进程写入 SSH channel
10. 重复步骤 3-9，直到文件传输完成

### 3. 状态管理

- **Worker** 定期请求主进程获取进度 (`zmodemGetProgress`)
- **Worker** 定期请求主进程获取状态 (`zmodemGetStatus`)
- 当状态变为 `completed` 或 `error` 时，Worker 通知主进程
- **主进程** 清理资源并通知渲染进程

## 通信协议

### Worker → 主进程消息

```typescript
{
  type: 'init' | 'feed-data' | 'get-output' | 'get-progress' | 'get-status' | 'cleanup' | 'output-data' | 'complete' | 'error',
  sessionId?: string,
  zmodemSessionId?: number,
  data?: Buffer | string,
  bufferSize?: number,
  callbackId?: string,
  error?: string
}
```

### 主进程 → Worker 消息

```typescript
{
  type: 'data' | 'output-data' | 'progress' | 'status' | 'error' | 'complete' | 'cleanup',
  sessionId?: string,
  zmodemSessionId?: number,
  data?: Buffer | string,
  progress?: { transferred: number, total: number, percent: number },
  status?: { status: number, message: string },
  error?: string,
  callbackId?: string
}
```

## 使用方式

### 启用 Worker 模式（默认）

Worker 模式默认启用，无需配置。

### 禁用 Worker 模式（使用直接模式）

设置环境变量：

```bash
ZMODEM_USE_WORKER=false npm run dev
```

## 优势

1. **性能提升**: Worker 线程处理数据处理，不阻塞主进程
2. **稳定性**: Worker 崩溃不影响主进程
3. **可维护性**: 代码解耦，便于调试和维护
4. **可扩展性**: 易于添加新的处理逻辑

## 注意事项

1. **Go 库调用必须在主进程**: koffi (FFI) 不支持在 Worker 中使用
2. **文件对话框在主进程**: Electron 对话框 API 必须在主进程调用
3. **窗口通信在主进程**: IPC 通信必须在主进程进行
4. **数据序列化**: Worker 和主进程之间的 Buffer 数据会自动序列化

## 调试

### 查看 Worker 日志

Worker 日志会显示在控制台，带有 `[ZMODEM Worker]` 前缀。

### 查看主进程日志

主进程日志会显示在控制台，带有 `[ZMODEMWorkerManager]` 前缀。

### 测试

运行测试脚本：

```bash
npm run test:zmodem
```

测试脚本会自动测试上传和下载功能。

