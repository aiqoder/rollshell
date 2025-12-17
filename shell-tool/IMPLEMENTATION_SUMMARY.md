# ZMODEM 实现总结

## 已完成的工作

### 1. Go 动态库架构 ✅
- 创建了模块化的 Go 动态库结构（`lib/` 目录）
- 实现了 C API 接口（`lib/main.go`）
- 实现了会话管理（`lib/modules/zmodem/session.go`）
- 实现了基础的文件 I/O 框架（`lib/modules/zmodem/zmodem.go`）
- 创建了跨平台构建脚本（`lib/build.sh`）

### 2. NativeLibManager 服务 ✅
- 实现了单例模式的动态库管理器
- 支持跨平台动态库加载（macOS/Linux/Windows）
- 提供了类型安全的 ZMODEM API 封装
- 集成了 koffi FFI 库

### 3. ZMODEMManager 重构 ✅
- 移除了对 zmodem-ts 和 Worker 的依赖
- 通过 NativeLibManager 直接调用 Go 动态库
- 在主进程中实现数据流处理和进度监控
- 使用定时器轮询机制获取进度和输出数据

### 4. 配置更新 ✅
- `package.json`: 移除 `zmodem-ts`，添加 `koffi`，添加 `build:lib` 脚本
- `electron.vite.config.ts`: 配置动态库资源处理
- `electron-builder.yml`: 确保动态库被包含在打包中
- `src/main/services/index.ts`: 导出 NativeLibManager

## 架构说明

### 数据流
```
SSH Channel (Buffer)
  ↓
SSHManager.handleSessionData()
  ↓
ZMODEMManager.handleData()
  ↓
NativeLibManager.zmodemFeedData() (通过 koffi)
  ↓
Go Dynamic Library (lib.dylib/lib.so/lib.dll)
  ↓
modules/zmodem (ZMODEM 协议处理)
  ↓
File System (read/write)
```

### 关键组件

1. **NativeLibManager** (`src/main/services/NativeLibManager.ts`)
   - 单例模式
   - 负责加载和管理 Go 动态库
   - 提供类型安全的 API

2. **ZMODEMManager** (`src/main/services/ZMODEMManager.ts`)
   - 管理 ZMODEM 传输会话
   - 处理文件对话框
   - 监控进度和状态

3. **Go 动态库** (`lib/`)
   - `main.go`: C API 入口
   - `modules/zmodem/zmodem.go`: ZMODEM 协议实现
   - `modules/zmodem/session.go`: 会话管理

## 下一步工作

### 1. 集成 Go ZMODEM 库
需要在 `lib/modules/zmodem/zmodem.go` 中集成实际的 ZMODEM 协议实现：

```bash
cd lib
go get github.com/anyliker/zmodem  # 或其他可用的库
```

然后在 `FeedData()` 和 `GetOutputData()` 方法中实现协议解析。

### 2. 构建动态库
```bash
cd lib
./build.sh
```

这将生成：
- `../libs/lib.dylib` (macOS)
- `../libs/lib.so` (Linux)
- `../libs/lib.dll` (Windows)

### 3. 安装依赖并测试
```bash
npm install        # 安装 koffi
npm run dev        # 启动开发服务器
```

### 4. 测试 ZMODEM 功能
- 测试上传（rz）功能
- 测试下载（sz）功能
- 验证进度报告
- 验证错误处理

## 注意事项

1. **动态库路径**: NativeLibManager 会根据开发/生产环境自动选择正确的路径
2. **内存管理**: Go 端分配的内存，Node.js 端负责释放（通过 `FreeProgress` 和 `FreeStatus`）
3. **线程安全**: Go 代码中的会话管理是线程安全的
4. **打包**: 确保 `libs/` 目录在打包时被正确包含（已配置在 `electron-builder.yml`）

## 故障排除

### 动态库加载失败
- 检查 `libs/` 目录是否存在对应的动态库文件
- 检查路径是否正确（开发环境 vs 生产环境）
- 检查动态库的架构是否匹配（amd64/arm64）

### koffi 导入错误
- 确保已运行 `npm install`
- 检查 Node.js 版本是否兼容

### Go 编译错误
- 确保已安装 Go 1.21+
- 运行 `cd lib && go mod tidy`
- 检查 CGO 是否启用

