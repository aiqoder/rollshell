#!/bin/bash

# 构建脚本：编译跨平台动态库
# 输出到 ../out/libs/ 目录

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBS_DIR="$SCRIPT_DIR/../out/libs"
LIB_DIR="$SCRIPT_DIR"

# 创建输出目录
mkdir -p "$LIBS_DIR"

echo "开始构建动态库..."

# 切换到 lib 目录
cd "$LIB_DIR"

# 检测当前平台
CURRENT_OS=$(uname -s | tr '[:upper:]' '[:lower:]')
CURRENT_ARCH=$(uname -m)

# 将架构转换为 Go 的架构名称
if [ "$CURRENT_ARCH" = "arm64" ] || [ "$CURRENT_ARCH" = "aarch64" ]; then
    GO_ARCH="arm64"
elif [ "$CURRENT_ARCH" = "x86_64" ]; then
    GO_ARCH="amd64"
else
    GO_ARCH="amd64"  # 默认
fi

echo "当前平台: $CURRENT_OS/$CURRENT_ARCH (Go: $GO_ARCH)"

# 构建当前平台的动态库
if [ "$CURRENT_OS" = "darwin" ]; then
    echo "构建 macOS 动态库..."
    CGO_ENABLED=1 GOOS=darwin GOARCH=$GO_ARCH go build -o "$LIBS_DIR/lib.dylib" -buildmode=c-shared .
    echo "✅ macOS 动态库构建成功: lib.dylib"
elif [ "$CURRENT_OS" = "linux" ]; then
    echo "构建 Linux 动态库..."
    CGO_ENABLED=1 GOOS=linux GOARCH=$GO_ARCH go build -o "$LIBS_DIR/lib.so" -buildmode=c-shared .
    echo "✅ Linux 动态库构建成功: lib.so"
fi

# 尝试构建其他平台（可选，可能失败）
echo ""
echo "尝试构建其他平台（可选）..."

# 构建 Linux (如果在非 Linux 系统上)
if [ "$CURRENT_OS" != "linux" ]; then
    echo "尝试构建 Linux 动态库..."
    CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o "$LIBS_DIR/lib.so" -buildmode=c-shared . 2>&1 || echo "⚠️  Linux 动态库构建失败（需要 Linux 系统或交叉编译工具链）"
fi

# 构建 Windows (如果在非 Windows 系统上)
if [ "$CURRENT_OS" != "mingw" ] && [ "$CURRENT_OS" != "msys" ]; then
    echo "尝试构建 Windows 动态库..."
    CGO_ENABLED=1 GOOS=windows GOARCH=amd64 go build -o "$LIBS_DIR/lib.dll" -buildmode=c-shared . 2>&1 || echo "⚠️  Windows 动态库构建失败（需要 Windows 系统或交叉编译工具链）"
fi

echo ""
echo "构建完成！"
echo "输出目录: $LIBS_DIR"
ls -lh "$LIBS_DIR" 2>/dev/null || echo "目录为空"

