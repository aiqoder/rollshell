package zmodem

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"os"
	"time"
)

// ZMODEM 协议常量
const (
	ZPAD  = 0x2A // Padding character
	ZDLE  = 0x18 // Data Link Escape
	ZDLEE = 0x5E // ZDLE encoded as itself (ZDLE ^ 0x40)

	// ZDLE 转义字符定义
	ZDLE_ESC = 0x40 // XOR mask for ZDLE encoding

	// 帧格式标识
	ZHEX   = 0x30 // Hex frame indicator
	ZBIN   = 0x31 // Binary frame indicator
	ZBIN32 = 0x32 // Binary 32-bit CRC frame

	// 数据子包结束标记
	ZCRCE = 0x68 // CRC next, frame ends, header follows
	ZCRCG = 0x69 // CRC next, frame continues nonstop
	ZCRCQ = 0x6A // CRC next, frame continues, ZACK expected
	ZCRCW = 0x6B // CRC next, frame continues, ZACK expected, frame ends
)

// FrameType 帧类型
type FrameType uint8

const (
	FrameZRINIT     FrameType = 0
	FrameZRQINIT    FrameType = 1
	FrameZSINIT     FrameType = 2
	FrameZACK       FrameType = 3
	FrameZFILE      FrameType = 4
	FrameZSKIP      FrameType = 5
	FrameZNAK       FrameType = 6
	FrameZABORT     FrameType = 7
	FrameZFIN       FrameType = 8
	FrameZRPOS      FrameType = 9
	FrameZDATA      FrameType = 10
	FrameZEOF       FrameType = 11
	FrameZFERR      FrameType = 12
	FrameZCRC       FrameType = 13
	FrameZCHALLENGE FrameType = 14
	FrameZCOMPL     FrameType = 15
	FrameZCAN       FrameType = 16
	FrameZFREECNT   FrameType = 17
	FrameZCOMMAND   FrameType = 18
	FrameZSTDERR    FrameType = 19
)

// ZmodemFrame ZMODEM 帧结构
type ZmodemFrame struct {
	Type      FrameType
	Flags     uint32
	F0        uint8
	F1        uint8
	F2        uint8
	F3        uint8
	Data      []byte // 帧数据部分
	CRC       uint32 // CRC 校验值
	FrameType byte   // 帧类型标识：ZHEX, ZBIN, ZBIN32
}

// FrameParser ZMODEM 帧解析器
type FrameParser struct {
	buffer       []byte
	state        string // "idle", "waiting_pad", "waiting_zdle", "reading_frame"
	frameType    byte   // ZHEX, ZBIN, ZBIN32
	expectingHex bool   // 是否期望十六进制帧
	frameBuffer  []byte // 当前正在解析的帧数据
}

// NewFrameParser 创建新的帧解析器
func NewFrameParser() *FrameParser {
	return &FrameParser{
		buffer:       make([]byte, 0, 8192), // 增大缓冲区
		state:        "idle",
		expectingHex: false,
		frameBuffer:  make([]byte, 0, 4096),
	}
}

// AddData 添加数据到解析器
func (p *FrameParser) AddData(data []byte) {
	p.buffer = append(p.buffer, data...)
}

// Reset 重置解析器
func (p *FrameParser) Reset() {
	p.buffer = p.buffer[:0]
	p.state = "idle"
	p.frameType = 0
	p.expectingHex = false
}

// ParseFrame 解析一个完整的帧
func (p *FrameParser) ParseFrame() (*ZmodemFrame, error) {
	// 测试日志
	if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		msg := fmt.Sprintf("[%s] [FrameParser] ParseFrame: 缓冲区大小: %d, 状态: %s, frameType: %d\n", 
			timestamp, len(p.buffer), p.state, p.frameType)
		f.WriteString(msg)
		f.Sync()
		f.Close()
	}
	
	for len(p.buffer) > 0 {
		switch p.state {
		case "idle":
			// 查找帧开始：ZPAD + ZPAD
			if len(p.buffer) < 2 {
				return nil, nil // 数据不足
			}

			// 查找 ZPAD ZPAD 序列
			found := false
			startIdx := 0
			for i := 0; i < len(p.buffer)-1; i++ {
				if p.buffer[i] == ZPAD && p.buffer[i+1] == ZPAD {
					found = true
					startIdx = i
					break
				}
			}

			if !found {
				// 没有找到帧开始，清除前面的数据（可能是终端输出）
				if len(p.buffer) > 1024 {
					// 保留最后 256 字节用于查找帧开始
					p.buffer = p.buffer[len(p.buffer)-256:]
				}
				return nil, nil
			}

			// 跳过 ZPAD ZPAD
			p.buffer = p.buffer[startIdx+2:]
			p.state = "waiting_zdle"

		case "waiting_zdle":
			if len(p.buffer) < 1 {
				// 测试日志
				if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
					timestamp := time.Now().Format("2006-01-02 15:04:05.000")
					msg := fmt.Sprintf("[%s] [FrameParser] waiting_zdle: 数据不足\n", timestamp)
					f.WriteString(msg)
					f.Sync()
					f.Close()
				}
				return nil, nil
			}

			b := p.buffer[0]
			
			// 测试日志
			if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
				timestamp := time.Now().Format("2006-01-02 15:04:05.000")
				msg := fmt.Sprintf("[%s] [FrameParser] waiting_zdle: 收到字节 0x%02x ('%c'), 缓冲区大小: %d\n", 
					timestamp, b, b, len(p.buffer))
				f.WriteString(msg)
				f.Sync()
				f.Close()
			}
			if b == ZDLE {
				// 跳过 ZDLE，下一个字节应该是帧类型
				p.buffer = p.buffer[1:]
				// 继续等待帧类型字节
				if len(p.buffer) < 1 {
					return nil, nil
				}
				nextByte := p.buffer[0]
				if nextByte == ZHEX || nextByte == ZBIN || nextByte == ZBIN32 {
					p.frameType = nextByte
					p.buffer = p.buffer[1:]
					p.state = "reading_frame"
					zmodemDebugLog("FrameParser: 找到 ZDLE+帧类型 0x%02x，进入 reading_frame 状态", nextByte)
				} else if nextByte == 'B' || nextByte == 0x42 {
					// 'B' 可能是十六进制帧的标识（某些实现使用 'B' 表示二进制帧，但数据是十六进制编码）
					// 检查后续数据是否是十六进制字符串
					if len(p.buffer) >= 2 {
						// 检查第二个字符是否是十六进制字符
						secondByte := p.buffer[1]
						if (secondByte >= '0' && secondByte <= '9') || (secondByte >= 'a' && secondByte <= 'f') || (secondByte >= 'A' && secondByte <= 'F') {
							// 看起来是十六进制帧，但使用 'B' 作为标识
							// 实际上，这可能是 ZBIN32 帧，但数据是十六进制编码的
							// 我们将其视为十六进制帧处理
							p.frameType = ZHEX
							// 跳过 'B'，因为它不是数据的一部分，只是标识符
							p.buffer = p.buffer[1:] // 跳过 'B'
							p.state = "reading_frame"
							
							// 测试日志
							if f, err2 := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err2 == nil {
								timestamp := time.Now().Format("2006-01-02 15:04:05.000")
								previewLen := len(p.buffer)
								if previewLen > 32 {
									previewLen = 32
								}
								msg := fmt.Sprintf("[%s] [FrameParser] ZDLE 后找到 'B'，后续是十六进制数据，使用 ZHEX 格式，跳过 'B' 后缓冲区: %x\n", 
									timestamp, p.buffer[:previewLen])
								f.WriteString(msg)
								f.Sync()
								f.Close()
							}
							zmodemDebugLog("FrameParser: ZDLE 后找到 'B'，后续是十六进制数据，使用 ZHEX 格式")
						} else {
							// 不是十六进制数据，使用默认
							p.frameType = ZBIN32
							p.buffer = p.buffer[1:]
							p.state = "reading_frame"
							zmodemDebugLog("FrameParser: ZDLE 后找到 'B'，但后续不是十六进制，使用 ZBIN32")
						}
					} else {
						// 数据不足，等待更多
						return nil, nil
					}
				} else {
					// 可能是其他格式，尝试作为帧类型处理
					p.frameType = ZBIN32 // 默认
					p.state = "reading_frame"
					zmodemDebugLog("FrameParser: ZDLE 后未识别帧类型 0x%02x ('%c')，默认使用 ZBIN32", nextByte, nextByte)
				}
			} else if b == ZHEX || b == ZBIN || b == ZBIN32 {
				// 直接是帧类型（某些变体，没有 ZDLE）
				p.frameType = b
				p.buffer = p.buffer[1:]
				p.state = "reading_frame"
				zmodemDebugLog("FrameParser: 直接找到帧类型: 0x%02x，进入 reading_frame 状态", b)
			} else {
				// 不是 ZDLE，也不是标准帧类型
				// 重置，重新查找帧开始
				zmodemDebugLog("FrameParser: waiting_zdle 状态收到未识别字符: 0x%02x ('%c')，重置到 idle", b, b)
				p.state = "idle"
			}

		case "reading_frame":
			// 测试日志
			if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
				timestamp := time.Now().Format("2006-01-02 15:04:05.000")
				previewLen := len(p.buffer)
				if previewLen > 32 {
					previewLen = 32
				}
				msg := fmt.Sprintf("[%s] [FrameParser] reading_frame: frameType=%d (0x%02x), 缓冲区大小: %d, 预览: %x\n", 
					timestamp, p.frameType, p.frameType, len(p.buffer), p.buffer[:previewLen])
				f.WriteString(msg)
				f.Sync()
				f.Close()
			}
			
			if p.frameType == 0 {
				// 还未确定帧类型
				if len(p.buffer) < 1 {
					return nil, nil
				}

				b := p.buffer[0]
				if b == ZHEX || b == ZBIN || b == ZBIN32 {
					p.frameType = b
					p.buffer = p.buffer[1:]
					zmodemDebugLog("FrameParser: 确定帧类型: 0x%02x", b)
				} else {
					// 默认使用二进制帧
					p.frameType = ZBIN32
					zmodemDebugLog("FrameParser: 未识别帧类型 0x%02x，默认使用 ZBIN32", b)
				}
			}

			// 解析帧
			frame, consumed, err := p.parseFrameData()
			if err != nil {
				// 测试日志
				if f, err2 := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err2 == nil {
					timestamp := time.Now().Format("2006-01-02 15:04:05.000")
					msg := fmt.Sprintf("[%s] [FrameParser] parseFrameData 错误: %v\n", timestamp, err)
					f.WriteString(msg)
					f.Sync()
					f.Close()
				}
				p.Reset()
				return nil, err
			}

			if frame != nil {
				// 成功解析一个帧
				zmodemDebugLog("FrameParser: 成功解析帧: Type=%d, Format=0x%02x, 消耗 %d 字节", frame.Type, frame.FrameType, consumed)
				p.buffer = p.buffer[consumed:]
				p.state = "idle"
				return frame, nil
			}

			// 数据不足，等待更多数据
			// 测试日志
			if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
				timestamp := time.Now().Format("2006-01-02 15:04:05.000")
				msg := fmt.Sprintf("[%s] [FrameParser] reading_frame: parseFrameData 返回 nil，数据不足，等待更多数据\n", timestamp)
				f.WriteString(msg)
				f.Sync()
				f.Close()
			}
			return nil, nil
		}
	}

	return nil, nil
}

// parseFrameData 解析帧数据部分
func (p *FrameParser) parseFrameData() (*ZmodemFrame, int, error) {
	if p.frameType == ZHEX {
		return p.parseHexFrame()
	} else {
		return p.parseBinaryFrame()
	}
}

// parseHexFrame 解析十六进制帧（rz 使用 ASCII hex 编码的 ZRINIT 头）
//
// 观察到的缓冲区内容（去掉前面的 **\x18B）:
//   30313030303030303233626535300d8a11
//   对应 ASCII: "0100000023be50\r\x8a\x11"
// 先用 hex.DecodeString 解码成真实字节序列，再从中解析 Type 和 Flags，
// 避免对 ASCII '0' '1' 直接按十六进制数值解析导致 Type=0x30 的错误。
func (p *FrameParser) parseHexFrame() (*ZmodemFrame, int, error) {
	zmodemDebugLog("FrameParser: 解析十六进制帧（decodeString），缓冲区大小: %d, 内容: %s (hex: %x)",
		len(p.buffer), string(p.buffer[:min(50, len(p.buffer))]), p.buffer[:min(32, len(p.buffer))])

	if len(p.buffer) == 0 {
		return nil, 0, nil
	}

	// 1. 找到连续的 ASCII hex 字符串 [startIdx, hexEnd)
	startIdx := 0
	first := p.buffer[0]
	isHex := (first >= '0' && first <= '9') ||
		(first >= 'a' && first <= 'f') ||
		(first >= 'A' && first <= 'F')
	if !isHex {
		zmodemDebugLog("FrameParser: 第一个字符不是十六进制: 0x%02x ('%c')，跳过", first, first)
		startIdx = 1
		if len(p.buffer) <= startIdx {
			return nil, 0, nil
		}
	}

	hexEnd := startIdx
	for hexEnd < len(p.buffer) {
		c := p.buffer[hexEnd]
		if (c >= '0' && c <= '9') ||
			(c >= 'a' && c <= 'f') ||
			(c >= 'A' && c <= 'F') {
			hexEnd++
		} else {
			break
		}
	}
	hexLen := hexEnd - startIdx

	// 至少需要 2(类型) + 8(flags) = 10 个十六进制字符才能解析出基本头
	if hexLen < 10 {
		zmodemDebugLog("FrameParser: 十六进制头数据不足，需要至少 10 字符，当前: %d", hexLen)
		return nil, 0, nil
	}

	hexStr := string(p.buffer[startIdx:hexEnd])
	decoded, err := hex.DecodeString(hexStr)
	if err != nil || len(decoded) < 5 {
		zmodemDebugLog("FrameParser: hex.DecodeString 失败: %v, hexStr=%s, decodedLen=%d",
			err, hexStr, len(decoded))
		return nil, 0, fmt.Errorf("解析十六进制帧失败: %w", err)
	}

	// 解析 Type + Flags
	frameTypeByte := decoded[0]
	flags := binary.BigEndian.Uint32(decoded[1:5])

	// ZMODEM 标准: 0=ZRQINIT, 1=ZRINIT, 2=ZSINIT, 3=ZACK, 4=ZFILE, 5=ZSKIP,
	// 6=ZNAK, 7=ZABORT, 8=ZFIN, 9=ZRPOS, 10=ZDATA, 11=ZEOF ...
	// 而我们在本包中的常量定义是 FrameZRINIT=0, FrameZRQINIT=1 等，顺序与协议不完全一致。
	// 这里根据实际的 type 字节做一层**映射**，确保收到的 ZRINIT/ZACK/ZRPOS 能正确落到对应 case 上。
	var frameType FrameType
	switch frameTypeByte {
	case 0x01: // ZRINIT
		frameType = FrameZRINIT
	case 0x03: // ZACK
		frameType = FrameZACK
	case 0x09: // ZRPOS
		frameType = FrameZRPOS
	default:
		frameType = FrameType(frameTypeByte)
	}

	frame := &ZmodemFrame{
		Type:      frameType,
		Flags:     flags,
		F0:        0,
		F1:        0,
		F2:        0,
		F3:        0,
		FrameType: ZHEX,
		Data:      make([]byte, 0),
	}

	// 计算消费的字节数：所有连续 hex，再顺带吞掉结尾的 CR/LF
	consumed := hexEnd
	for consumed < len(p.buffer) && (p.buffer[consumed] == 0x0D || p.buffer[consumed] == 0x0A) {
		consumed++
	}

	zmodemDebugLog("FrameParser: 解析十六进制帧成功: Type=%d, Flags=0x%08x, 消耗 %d 字节 (hexLen=%d, decodedLen=%d)",
		frame.Type, frame.Flags, consumed, hexLen, len(decoded))

	return frame, consumed, nil
}

// min 辅助函数
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// parseBinaryFrame 解析二进制帧
func (p *FrameParser) parseBinaryFrame() (*ZmodemFrame, int, error) {
	// 二进制帧格式：
	// frame_type(1) + flags(4) + f0-f3(4) + [data] + CRC(2 or 4)

	// 检查是否有 ZDLE 转义
	pos := 0

	// 读取帧类型（可能有 ZDLE 转义）
	frameTypeByte, consumed, err := p.readZDLEEscapedByte(pos)
	if err != nil {
		return nil, 0, err
	}
	if consumed == 0 {
		return nil, 0, nil // 数据不足
	}
	pos += consumed

	// 读取标志位（4字节，可能有 ZDLE 转义）
	flagsBytes, consumed, err := p.readZDLEEscapedBytes(pos, 4)
	if err != nil {
		return nil, 0, err
	}
	if consumed == 0 {
		return nil, 0, nil // 数据不足
	}
	pos += consumed
	flags := binary.BigEndian.Uint32(flagsBytes)

	// 读取 F0-F3（4字节，可能有 ZDLE 转义）
	fBytes, consumed, err := p.readZDLEEscapedBytes(pos, 4)
	if err != nil {
		return nil, 0, err
	}
	if consumed == 0 {
		return nil, 0, nil // 数据不足
	}
	pos += consumed

	frame := &ZmodemFrame{
		Type:      FrameType(frameTypeByte),
		Flags:     flags,
		F0:        fBytes[0],
		F1:        fBytes[1],
		F2:        fBytes[2],
		F3:        fBytes[3],
		FrameType: p.frameType,
		Data:      make([]byte, 0),
	}

	// 对于某些帧类型，数据在 F0-F3 字段中
	// 对于 ZDATA 帧，需要读取可变长度的数据
	// 简化处理：对于有数据的帧，尝试读取到 CRC 之前的所有内容

	// 查找 CRC 起始位置（简化：读取剩余数据直到找到可能的 CRC 模式）
	// 更准确的方法：根据帧类型确定数据长度

	// 暂时：对于 ZDATA 帧，尝试读取数据直到遇到结束标志
	// 对于其他帧，数据可能在 F0-F3 中

	frameType := FrameType(frameTypeByte)
	if frameType == FrameZDATA {
		// ZDATA 帧：数据长度可变
		// 数据子包以 ZDLE + ZCRCE/ZCRCG/ZCRCQ/ZCRCW 结束
		// 读取数据直到遇到子包结束标记

		crcSize := 2
		if p.frameType == ZBIN32 {
			crcSize = 4
		}

		// 需要至少保留 CRC 的空间
		maxDataPos := len(p.buffer) - crcSize

		for pos < maxDataPos {
			// 检查是否是 ZDLE（可能是转义或结束标记）
			if p.buffer[pos] == ZDLE {
				// 检查下一个字节是否是结束标记
				if pos+1 < len(p.buffer) {
					next := p.buffer[pos+1]
					if next == ZCRCE || next == ZCRCG || next == ZCRCQ || next == ZCRCW {
						// 找到子包结束标记，停止读取数据
						pos += 2 // 跳过 ZDLE + 结束标记
						break
					}

					// 检查是否是转义的 ZDLE（ZDLE + ZDLEE）
					if next == ZDLEE {
						// 这是 ZDLE 字符本身（转义后）
						frame.Data = append(frame.Data, ZDLE)
						pos += 2
						continue
					}
				}

				// 是 ZDLE 转义，读取转义后的字节
				if pos+1 >= len(p.buffer) {
					return nil, 0, nil // 数据不足
				}
				escaped := p.buffer[pos+1]
				// 某些控制字符也需要转义（如 0x0D, 0x8D 等）
				original := escaped ^ ZDLE_ESC
				frame.Data = append(frame.Data, original)
				pos += 2
			} else {
				// 普通字节，但需要检查是否是特殊字符
				b := p.buffer[pos]
				// 某些字符在 ZMODEM 中需要转义（如 ZDLE, @, 0x8D, 0x8A 等）
				if b == '@' || b == 0x8D || b == 0x8A || (b >= 0x10 && b <= 0x1A) || b == 0x7F {
					// 这些字符如果出现在数据中可能需要转义
					// 但如果没有 ZDLE 前缀，可能是普通数据
					frame.Data = append(frame.Data, b)
					pos++
				} else {
					frame.Data = append(frame.Data, b)
					pos++
				}
			}
		}

		// 如果已经读取了结束标记，pos 已经前进
		// 现在需要读取 CRC
	} else if frameType == FrameZFILE {
		// ZFILE 帧：数据在 F0-F3 之后，以 \0 结尾的字符串
		// 尝试读取直到找到 \0 或遇到 CRC
		for pos < len(p.buffer) {
			b, consumed, err := p.readZDLEEscapedByte(pos)
			if err != nil || consumed == 0 {
				break
			}
			pos += consumed
			if b == 0 {
				// 找到结束符
				break
			}
			frame.Data = append(frame.Data, b)
		}
		// 如果找到 \0，pos 已经前进
	} else if frameType == FrameZACK || frameType == FrameZRPOS {
		// ZACK 和 ZRPOS 帧：数据部分包含位置信息（4字节）
		// 尝试读取 4 字节的位置信息
		for pos < len(p.buffer) && len(frame.Data) < 4 {
			b, consumed, err := p.readZDLEEscapedByte(pos)
			if err != nil || consumed == 0 {
				break
			}
			pos += consumed
			frame.Data = append(frame.Data, b)
		}
		// 如果数据不足 4 字节，继续等待（不强制要求）
	}

	// 读取 CRC（2字节或4字节）
	var crcBytes []byte
	if p.frameType == ZBIN32 {
		// 32位 CRC
		if pos >= len(p.buffer) {
			return nil, 0, nil // 数据不足
		}
		crcBytes, consumed, err = p.readZDLEEscapedBytes(pos, 4)
		if err != nil || consumed == 0 {
			return nil, 0, nil // 数据不足
		}
		frame.CRC = binary.BigEndian.Uint32(crcBytes)
		pos += consumed
	} else {
		// 16位 CRC
		if pos >= len(p.buffer) {
			return nil, 0, nil // 数据不足
		}
		crcBytes, consumed, err = p.readZDLEEscapedBytes(pos, 2)
		if err != nil || consumed == 0 {
			return nil, 0, nil // 数据不足
		}
		frame.CRC = uint32(binary.BigEndian.Uint16(crcBytes))
		pos += consumed
	}

	// 消耗已解析的数据
	return frame, pos, nil
}

// readZDLEEscapedByte 读取一个字节（处理 ZDLE 转义）
func (p *FrameParser) readZDLEEscapedByte(startPos int) (byte, int, error) {
	if startPos >= len(p.buffer) {
		return 0, 0, fmt.Errorf("缓冲区越界")
	}

	b := p.buffer[startPos]
	if b == ZDLE {
		// 需要读取转义后的字节
		if startPos+1 >= len(p.buffer) {
			return 0, 0, nil // 数据不足
		}
		escaped := p.buffer[startPos+1]
		// ZDLE 转义：原始字节 = 转义字节 ^ 0x40
		original := escaped ^ ZDLE_ESC
		return original, 2, nil
	}

	return b, 1, nil
}

// readZDLEEscapedBytes 读取多个字节（处理 ZDLE 转义）
func (p *FrameParser) readZDLEEscapedBytes(startPos int, count int) ([]byte, int, error) {
	result := make([]byte, count)
	pos := startPos

	for i := 0; i < count; i++ {
		b, consumed, err := p.readZDLEEscapedByte(pos)
		if err != nil {
			return nil, 0, err
		}
		if consumed == 0 {
			// 数据不足
			return nil, 0, nil
		}
		result[i] = b
		pos += consumed
	}

	return result, pos - startPos, nil
}

// FindNextFrameStart 查找下一个帧的开始位置
func (p *FrameParser) FindNextFrameStart() int {
	for i := 0; i < len(p.buffer)-1; i++ {
		if p.buffer[i] == ZPAD && p.buffer[i+1] == ZPAD {
			return i
		}
	}
	return -1
}

// GetBufferSize 获取当前缓冲区大小
func (p *FrameParser) GetBufferSize() int {
	return len(p.buffer)
}

// CleanupBuffer 清理缓冲区，移除非帧数据
func (p *FrameParser) CleanupBuffer() {
	// 保留最后一部分数据，以防帧被分割
	const keepSize = 512
	if len(p.buffer) > keepSize {
		p.buffer = p.buffer[len(p.buffer)-keepSize:]
	}
}
