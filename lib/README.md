# Go 动态库说明

本目录包含用于 ZMODEM 文件传输的 Go 动态库源码。

## 目录结构

```
lib/
  main.go                  # C API 入口，导出函数
  go.mod                   # Go 模块定义
  modules/
    zmodem/                # ZMODEM 模块
      zmodem.go           # ZMODEM 协议实现
      session.go          # 会话管理
  build.sh                # 构建脚本
```

## 集成 Go ZMODEM 库

当前代码提供了基础框架，但还需要集成实际的 Go ZMODEM 库。

### 推荐的库

1. **github.com/anyliker/zmodem** - 一个 Go 语言的 ZMODEM 实现
2. **github.com/xiwh/zmodem** - 另一个可选实现

### 集成步骤

1. 在 `go.mod` 中添加依赖：
   ```bash
   cd lib
   go get github.com/anyliker/zmodem
   # 或
   go get github.com/xiwh/zmodem
   ```

2. 在 `modules/zmodem/zmodem.go` 中实现：
   - `FeedData()` - 解析 ZMODEM 协议数据
   - `GetOutputData()` - 生成 ZMODEM 协议数据
   - 集成实际的 ZMODEM 库进行文件传输

3. 构建动态库：
   ```bash
   cd lib
   ./build.sh
   ```

   这将生成：
   - `../libs/lib.dylib` (macOS)
   - `../libs/lib.so` (Linux)
   - `../libs/lib.dll` (Windows)

## C API 说明

导出的 C 函数：

- `ZmodemInit(mode, filePath)` - 初始化会话
- `ZmodemFeedData(sessionId, data, len)` - 输入数据
- `ZmodemGetOutputData(sessionId, buffer, len)` - 获取输出数据
- `ZmodemGetProgress(sessionId)` - 获取进度
- `ZmodemFreeProgress(progress)` - 释放进度结构体
- `ZmodemGetStatus(sessionId)` - 获取状态
- `ZmodemFreeStatus(status)` - 释放状态结构体
- `ZmodemCleanup(sessionId)` - 清理会话

## 注意事项

1. Go 动态库需要使用 `buildmode=c-shared` 编译
2. 确保导出的函数符合 C 调用约定
3. 内存管理：C 字符串和结构体需要在 Go 端分配，Node.js 端负责释放
4. 线程安全：确保会话管理是线程安全的

