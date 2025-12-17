package zmodem

import (
	"encoding/binary"
	"fmt"
)

// BuildBinaryFrame 构建二进制 ZMODEM 帧
func BuildBinaryFrame(frameType FrameType, flags uint32, f0, f1, f2, f3 uint8, data []byte, useCRC32 bool) []byte {
	// 二进制帧格式：ZPAD + ZPAD + ZDLE + frame_type_char + frame_type + flags(4) + f0-f3(4) + [data] + [ZDLE + end_marker] + CRC
	
	var frame []byte
	
	// ZPAD + ZPAD
	frame = append(frame, ZPAD, ZPAD)
	
	// ZDLE + 帧类型字符
	if useCRC32 {
		frame = append(frame, ZDLE, ZBIN32)
	} else {
		frame = append(frame, ZDLE, ZBIN)
	}
	
	// 帧类型
	frame = append(frame, byte(frameType))
	
	// 标志位（4字节，大端序）
	flagsBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(flagsBytes, flags)
	frame = append(frame, flagsBytes...)
	
	// F0-F3
	frame = append(frame, f0, f1, f2, f3)
	
	// 数据部分（如果需要 ZDLE 转义）
	if len(data) > 0 {
		for _, b := range data {
			// 需要对特殊字符进行 ZDLE 转义
			if b == ZDLE || b == '@' || (b >= 0x10 && b <= 0x1A) || b == 0x7F || b == 0x8D || b == 0x8A {
				// 转义：ZDLE + (original ^ 0x40)
				frame = append(frame, ZDLE, b^ZDLE_ESC)
			} else {
				frame = append(frame, b)
			}
		}
		
		// 添加数据结束标记（ZDLE + ZCRCE 表示子包结束）
		frame = append(frame, ZDLE, ZCRCE)
	}
	
	// 计算并添加 CRC
	crc := uint32(0)
	if useCRC32 {
		// 对帧内容（不包括 ZPAD）计算 CRC32
		crcData := frame[2:] // 跳过 ZPAD + ZPAD
		crc = CalculateCRC32(crcData)
		crcBytes := make([]byte, 4)
		binary.BigEndian.PutUint32(crcBytes, crc)
		frame = append(frame, crcBytes...)
	} else {
		// CRC16
		crcData := frame[2:]
		crc16 := CalculateCRC16(crcData)
		crcBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(crcBytes, crc16)
		frame = append(frame, crcBytes...)
	}
	
	return frame
}

// BuildZDATAFrame 构建 ZDATA 帧
func BuildZDATAFrame(data []byte, position uint32) []byte {
	// ZDATA 帧：flags 可以是位置信息，f0-f3 通常为 0
	return BuildBinaryFrame(FrameZDATA, position, 0, 0, 0, 0, data, true)
}

// BuildZFILEFrameBinary 构建 ZFILE 帧（二进制格式）
//
// 按照常见 ZMODEM 实现，ZFILE 数据子包格式为：
//   filename '\0' filesize ' ' modtime ' ' mode ' ' serial '\0'
// 这里为了兼容性，使用：
//   filename '\0' <filesize 十进制字符串> ' ' '0' ' ' '0' ' ' '0' '\0'
// 即只准确填写文件大小，其它字段用 0 占位。
func BuildZFILEFrameBinary(filename string, size int64) []byte {
	var data []byte
	data = append(data, []byte(filename)...)
	data = append(data, 0)

	// 文件大小使用 ASCII 十进制编码
	sizeStr := []byte(fmt.Sprintf("%d", size))
	data = append(data, sizeStr...)
	data = append(data, ' ')
	data = append(data, '0', ' ')
	data = append(data, '0', ' ')
	data = append(data, '0')
	data = append(data, 0)

	return BuildBinaryFrame(FrameZFILE, 0, 0, 0, 0, 0, data, true)
}

// BuildZRINITFrame 构建 ZRINIT 帧（二进制格式）
func BuildZRINITFrame() []byte {
	flags := uint32(0)
	flags |= 0x00000080 // CANFDX
	flags |= 0x00000040 // CANOVIO
	flags |= 0x00000020 // CANBRK
	flags |= 0x00000010 // CANFC32
	
	return BuildBinaryFrame(FrameZRINIT, flags, 0, 0, 0, 0, nil, true)
}

// BuildZACKFrame 构建 ZACK 帧
func BuildZACKFrame(position uint32) []byte {
	posBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(posBytes, position)
	return BuildBinaryFrame(FrameZACK, 0, 0, 0, 0, 0, posBytes, true)
}

// BuildZRPOSFrame 构建 ZRPOS 帧
func BuildZRPOSFrame(position uint32) []byte {
	posBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(posBytes, position)
	return BuildBinaryFrame(FrameZRPOS, 0, 0, 0, 0, 0, posBytes, true)
}

// BuildZEOFFrame 构建 ZEOF 帧
func BuildZEOFFrame(position uint32) []byte {
	posBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(posBytes, position)
	return BuildBinaryFrame(FrameZEOF, 0, 0, 0, 0, 0, posBytes, true)
}

// BuildZFINFrame 构建 ZFIN 帧
func BuildZFINFrame() []byte {
	return BuildBinaryFrame(FrameZFIN, 0, 0, 0, 0, 0, nil, true)
}

