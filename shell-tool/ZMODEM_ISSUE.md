# ZMODEM 实现问题说明

## 问题描述

当前的 ZMODEM 协议实现过于简化，导致：
1. **协议控制字符被写入文件**：ZMODEM 协议的控制字符（如 ZDLE, ZPAD 等）被当作文件数据写入
2. **终端控制序列被写入**：ANSI 转义序列和终端控制字符也被写入文件
3. **文件名解析错误**：文件名包含乱码，因为协议头信息被当作文件名的一部分

## 根本原因

当前的 `ExtractZmodemData` 函数只是简单地跳过前16字节和后4字节，这不能正确解析 ZMODEM 协议格式。ZMODEM 协议使用二进制帧格式：
- ZPAD + ZPAD + ZDLE + frame_type + data + CRC16/CRC32

需要正确识别和解析这些帧才能提取真正的文件数据。

## 解决方案

### 方案1：使用系统 lrzsz 工具（推荐 ⭐）

**优点**：
- 实现简单，只需调用系统命令
- 稳定可靠，经过大量实践验证
- 无需实现完整的协议解析

**实现方式**：
```go
// 在 zmodem.go 中，直接调用系统 rz/sz 命令
cmd := exec.Command("rz") // 或 "sz filename"
cmd.Stdin = os.Stdin
cmd.Stdout = os.Stdout
cmd.Stderr = os.Stderr
```

### 方案2：集成成熟的 Go ZMODEM 库

寻找现有的 Go 语言 ZMODEM 实现库，如：
- `github.com/anyliker/zmodem`（如果存在）
- `github.com/xiwh/zmodem`（如果存在）

### 方案3：完善协议实现（工作量大）

需要实现：
1. ZMODEM 二进制帧解析器
2. ZPAD/ZDLE 识别和处理
3. 帧类型识别（ZFILE, ZDATA, ZEOF 等）
4. CRC 校验
5. 文件名提取
6. 数据提取和重组

## 临时处理

已临时禁用自动数据写入（download 模式），避免产生更多乱码文件。

## 建议

**优先采用方案1**，使用系统的 `lrzsz` 工具。这是最快速、最可靠的解决方案。

