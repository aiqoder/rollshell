# Rollshell

一个基于 Electron + Vue 3 + TypeScript 的现代化 Shell 工具，支持 SSH 连接管理、终端会话、文件传输等功能。

## ✨ 主要特性

- 🔐 **SSH 连接管理** - 支持密码和密钥认证，连接信息持久化存储
- 💻 **终端会话** - 基于 xterm.js 的现代化终端，支持多标签页
- 📁 **文件管理** - SFTP 文件浏览和传输
- 📤 **ZMODEM 传输** - 支持 ZMODEM 协议的文件传输
- 🎨 **主题切换** - 支持亮色、暗色和系统主题
- 🖥️ **跨平台** - 支持 macOS、Windows 和 Linux

## 🛠️ 技术栈

- **框架**: Electron + Vue 3
- **语言**: TypeScript
- **构建工具**: electron-vite
- **UI 框架**: Tailwind CSS
- **状态管理**: Pinia
- **终端**: xterm.js
- **SSH/SFTP**: ssh2
- **文件传输**: ZMODEM (Go 动态库)

## 📦 安装

### 环境要求

- Node.js >= 18
- npm 或 yarn
- Go 1.19+ (用于构建 ZMODEM 动态库)

### 安装依赖

```bash
npm install
```

## 🚀 开发

### 启动开发模式

```bash
npm run dev
```

### 类型检查

```bash
npm run typecheck
```

### 代码格式化

```bash
npm run format
```

### 代码检查

```bash
npm run lint
```

## 🏗️ 构建

### 构建所有平台

```bash
# 仅构建（不打包）
npm run build

# 构建并打包为目录
npm run build:unpack
```

### 平台特定构建

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

构建产物将输出到 `dist/` 目录。

## 📝 项目结构

```
.
├── lib/              # Go ZMODEM 动态库源码
├── src/
│   ├── main/         # Electron 主进程
│   ├── preload/      # 预加载脚本
│   └── renderer/     # Vue 渲染进程
├── build/            # 构建资源（图标等）
├── resources/        # 应用资源
└── out/              # 构建输出目录
```

## 🔧 开发工具推荐

- [VSCode](https://code.visualstudio.com/)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## 📄 许可证

MIT

## 👥 作者

一个橙子 pro

## 🔗 相关链接

- [GitHub](https://github.com/aiqoder/rollshell)
