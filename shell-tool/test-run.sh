#!/bin/bash

# ZMODEM 自动化测试运行脚本

echo "🧪 准备运行 ZMODEM 自动化测试..."
echo ""

# 检查动态库是否存在
if [ ! -f "out/libs/lib.dylib" ]; then
    echo "⚠️  动态库不存在，正在构建..."
    npm run build:lib
    if [ $? -ne 0 ]; then
        echo "❌ 动态库构建失败"
        exit 1
    fi
fi

echo "✅ 动态库已就绪"
echo ""
echo "🚀 开始运行测试..."
echo ""

# 运行测试
npm run test:zmodem

