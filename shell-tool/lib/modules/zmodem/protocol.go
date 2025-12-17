package zmodem

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

// ZMODEM 协议常量
const (
	// 协议头类型
	ZRINIT     = 0  // Receiver initial header
	ZRQINIT    = 1  // Request receiver to initiate
	ZSINIT     = 2  // Sender initial header
	ZACK       = 3  // Acknowledge
	ZFILE      = 4  // File header
	ZSKIP      = 5  // Skip this file
	ZNAK       = 6  // Negative acknowledge
	ZABORT     = 7  // Abort transfer
	ZFIN       = 8  // Finish
	ZRPOS      = 9  // Resume position
	ZDATA      = 10 // Data subpacket
	ZEOF       = 11 // End of file
	ZFERR      = 12 // File error
	ZCRC       = 13 // CRC request
	ZCHALLENGE = 14 // Challenge
	ZCOMPL     = 15 // Complete
	ZCAN       = 16 // Cancel
	ZFREECNT   = 17 // Free count
	ZCOMMAND   = 18 // Command
	ZSTDERR    = 19 // Stderr

	// ZMODEM 帧标志
	ZF0 = 0x00000000
	ZF1 = 0x00000100
	ZF2 = 0x00000200
	ZF3 = 0x00000300

	// CRC 多项式
	CRC16_POLY = 0x1021
	CRC32_POLY = 0xEDB88320
)

// ZmodemHeader ZMODEM 协议头
type ZmodemHeader struct {
	Type  uint8
	Flags uint32
	F0    uint8
	F1    uint8
	F2    uint8
	F3    uint8
}

// ParseZmodemHeader 解析 ZMODEM 协议头
// ZMODEM 头格式：16进制（4字节类型 + 4字节标志 + 4字节数据）
func ParseZmodemHeader(data []byte) (*ZmodemHeader, error) {
	if len(data) < 16 {
		return nil, fmt.Errorf("数据太短，不足以包含完整的 ZMODEM 头")
	}

	// ZMODEM 头是 16 字节，使用 HEX 编码（每个字节表示为两个十六进制字符）
	// 格式：12345678 12345678 12345678 12345678
	hexStr := string(data[:16])

	var header ZmodemHeader
	var err error

	// 解析类型（前 4 个十六进制字符）
	if len(hexStr) >= 8 {
		header.Flags, err = parseHexUint32(hexStr[0:8])
		if err != nil {
			return nil, fmt.Errorf("解析标志失败: %w", err)
		}
		header.Type = uint8(header.Flags & 0xFF)
	}

	return &header, nil
}

// parseHexUint32 解析十六进制字符串为 uint32
func parseHexUint32(hexStr string) (uint32, error) {
	var result uint32
	_, err := fmt.Sscanf(hexStr, "%x", &result)
	return result, err
}

// BuildZmodemHeader 构建 ZMODEM 协议头（HEX 格式）
func BuildZmodemHeader(headerType uint8, flags uint32) []byte {
	// ZMODEM 头是 16 字节 HEX 编码
	// 格式：FFFFFFFF F0F1F2F3 00000000 00000000
	header := make([]byte, 16)

	// 第一个 4 字节：类型和标志
	flagsWithType := (uint32(headerType) & 0xFF) | (flags & 0xFFFFFF00)

	// 使用二进制格式（实际传输中可能需要 HEX 编码，但这里先使用二进制）
	binary.BigEndian.PutUint32(header[0:4], flagsWithType)
	binary.BigEndian.PutUint32(header[4:8], 0)   // F0-F3 (通常为 0)
	binary.BigEndian.PutUint32(header[8:12], 0)  // 预留
	binary.BigEndian.PutUint32(header[12:16], 0) // 预留

	return header
}

// CalculateCRC16 计算 CRC16 校验和
func CalculateCRC16(data []byte) uint16 {
	crc := uint16(0)
	for _, b := range data {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if crc&0x8000 != 0 {
				crc = (crc << 1) ^ CRC16_POLY
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}

// CalculateCRC32 计算 CRC32 校验和
func CalculateCRC32(data []byte) uint32 {
	crc := uint32(0xFFFFFFFF)
	for _, b := range data {
		crc ^= uint32(b)
		for i := 0; i < 8; i++ {
			if crc&1 != 0 {
				crc = (crc >> 1) ^ CRC32_POLY
			} else {
				crc >>= 1
			}
		}
	}
	return crc ^ 0xFFFFFFFF
}

// IsZmodemSequence 检测是否为 ZMODEM 启动序列
// ZMODEM 序列可以是：
// - **B00 (sz - 下载)
// - **B01 (rz - 上传)
// - **\x18B00
// - *\x18B01 等
func IsZmodemSequence(data []byte) (bool, bool) {
	// isUpload: true=上传(rz), false=下载(sz)
	if len(data) < 3 {
		return false, false
	}

	// 检测 **B00 或 **B01
	if len(data) >= 5 {
		if data[0] == 0x2A && data[1] == 0x2A {
			if data[2] == 0x42 && data[3] == 0x30 && data[4] == 0x30 {
				return true, false // sz (下载)
			}
			if data[2] == 0x42 && data[3] == 0x30 && data[4] == 0x31 {
				return true, true // rz (上传)
			}
		}
	}

	// 检测 **\x18B00 或 **\x18B10
	if len(data) >= 6 {
		if data[0] == 0x2A && data[1] == 0x2A && data[2] == 0x18 {
			if data[3] == 0x42 && data[4] == 0x30 && data[5] == 0x30 {
				return true, false // sz (下载)
			}
			if data[3] == 0x42 && data[4] == 0x31 && data[5] == 0x30 {
				return true, true // rz (上传)
			}
		}
	}

	// 检测 *\x18B00 或 *\x18B01
	if len(data) >= 5 {
		if data[0] == 0x2A && data[1] == 0x18 {
			if data[2] == 0x42 && data[3] == 0x30 && data[4] == 0x30 {
				return true, false // sz (下载)
			}
			if data[2] == 0x42 && data[3] == 0x30 && data[4] == 0x31 {
				return true, true // rz (上传)
			}
		}
	}

	return false, false
}

// ExtractZmodemData 从数据中提取 ZMODEM 数据部分
// ZMODEM 数据包格式：协议头 + 数据 + CRC
func ExtractZmodemData(data []byte) ([]byte, error) {
	// 简化实现：尝试提取实际数据
	// ZMODEM 数据包通常以协议头开始（16字节），然后是数据，最后是CRC（4字节）
	if len(data) < 20 {
		// 数据太短，可能不包含完整的包
		return data, nil
	}

	// 跳过协议头（前16字节）
	dataStart := 16
	// 跳过CRC（后4字节）
	dataEnd := len(data) - 4

	if dataEnd > dataStart {
		return data[dataStart:dataEnd], nil
	}

	// 如果无法解析，返回原始数据
	return data, nil
}

// BuildZmodemResponse 构建 ZMODEM 响应
func BuildZmodemResponse(headerType uint8, data []byte) []byte {
	header := BuildZmodemHeader(headerType, 0)
	response := append(header, data...)

	// 添加 CRC
	crc := CalculateCRC32(response)
	crcBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(crcBytes, crc)
	response = append(response, crcBytes...)

	return response
}

// BuildZRINIT 构建 ZRINIT 响应（接收方初始化）
func BuildZRINIT() []byte {
	// ZRINIT 标志
	flags := uint32(0)
	flags |= 0x00000080 // CANFDX - 全双工
	flags |= 0x00000040 // CANOVIO - 覆盖 I/O
	flags |= 0x00000020 // CANBRK - Break
	flags |= 0x00000010 // CANFC32 - 32位 CRC
	
	// ZRINIT 帧：ZBIN32 格式，flags 在帧头中
	header := BuildZmodemHeader(ZRINIT, flags)
	return header
}

// BuildZRPOS 构建 ZRPOS 响应（恢复位置）
func BuildZRPOS(position uint32) []byte {
	posBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(posBytes, position)
	return BuildZmodemResponse(ZRPOS, posBytes)
}

// BuildZACK 构建 ZACK 响应（确认）
func BuildZACK(position uint32) []byte {
	posBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(posBytes, position)
	return BuildZmodemResponse(ZACK, posBytes)
}

// BuildZFILE 构建 ZFILE 响应（文件信息）
func BuildZFILE(filename string, size int64) []byte {
	// ZFILE 格式：文件名 + 0 + 文件大小 + 0 + 权限等
	var buf bytes.Buffer
	buf.WriteString(filename)
	buf.WriteByte(0)

	sizeBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(sizeBytes, uint64(size))
	buf.Write(sizeBytes)

	buf.WriteByte(0)
	buf.WriteString("0644") // 权限
	buf.WriteByte(0)

	return BuildZmodemResponse(ZFILE, buf.Bytes())
}
