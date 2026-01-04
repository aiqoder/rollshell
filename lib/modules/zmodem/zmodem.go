package zmodem

import (
	"C"
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// zmodemDebugLog 调试日志函数（共享）
// 为了便于排查问题，这里**总是**写入到日志文件 `/tmp/zmodem-debug.log`，
// 不再依赖 ZMODEM_DEBUG 环境变量。
func zmodemDebugLog(format string, args ...interface{}) {
	logFile := os.Getenv("ZMODEM_LOG_FILE")
	if logFile == "" {
		logFile = "/tmp/zmodem-debug.log"
	}

	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		defer f.Close()
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		msg := fmt.Sprintf("[%s] %s\n", timestamp, fmt.Sprintf(format, args...))
		f.WriteString(msg)
		f.Sync() // 强制刷新到磁盘
	}

	// 同时输出到 stderr，方便在开发环境直接观察
	fmt.Fprintf(os.Stderr, "[ZMODEM] %s\n", fmt.Sprintf(format, args...))
}

// ZmodemImpl ZMODEM 实现接口
type ZmodemImpl struct {
	file        *os.File
	fileSize    int64
	mu          sync.Mutex
	readBuf     []byte       // 读取缓冲区
	writeBuf    []byte       // 写入缓冲区
	writePos    int          // 写入位置
	inputBuf    bytes.Buffer // 输入缓冲区（累积接收的数据）
	outputBuf   bytes.Buffer // 输出缓冲区（待发送的数据）
	state       string       // 状态：idle, receiving_header, receiving_data, sending_header, sending_data, completed
	transferred int64        // 已传输字节数
	mode        int          // 0=upload, 1=download
	parser      *FrameParser // 帧解析器
	filename    string       // 文件名（从 ZFILE 帧提取）
}

// NewZmodemImpl 创建 ZMODEM 实现实例
func NewZmodemImpl(mode int, filePath string) (*ZmodemImpl, error) {
	impl := &ZmodemImpl{
		mode:     mode,
		state:    "idle",
		parser:   NewFrameParser(),
		filename: filePath, // 初始文件名
	}
	
	// 测试日志（不依赖环境变量）
	testLogFile := "/tmp/zmodem-debug.log"
	if f, err := os.OpenFile(testLogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		msg := fmt.Sprintf("[%s] [ZMODEM] NewZmodemImpl: mode=%d, filePath=%s\n", timestamp, mode, filepath.Base(filePath))
		f.WriteString(msg)
		f.Sync()
		f.Close()
	}

	var err error
	if mode == 0 { // upload (rz) - 发送文件
		impl.file, err = os.Open(filePath)
		if err != nil {
			return nil, fmt.Errorf("打开文件失败: %w", err)
		}
		stat, err := impl.file.Stat()
		if err != nil {
			impl.file.Close()
			return nil, fmt.Errorf("获取文件信息失败: %w", err)
		}
		impl.fileSize = stat.Size()

		// 上传模式：准备发送 ZFILE 头
		impl.state = "sending_header"
		// 使用二进制格式的 ZFILE 帧
		baseFilename := filepath.Base(filePath)
		zfile := BuildZFILEFrameBinary(baseFilename, impl.fileSize)
		impl.outputBuf.Write(zfile)
		zmodemDebugLog("NewZmodemImpl: 初始 ZFILE 帧 hex=%x", zfile)
		
		// 测试日志
		if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			timestamp := time.Now().Format("2006-01-02 15:04:05.000")
			msg := fmt.Sprintf("[%s] [ZMODEM] NewZmodemImpl: 构建 ZFILE 帧，大小: %d bytes, 文件名: %s, 文件大小: %d\n", 
				timestamp, len(zfile), baseFilename, impl.fileSize)
			f.WriteString(msg)
			f.Sync()
			f.Close()
		}
	} else { // download (sz) - 接收文件
		impl.file, err = os.Create(filePath)
		if err != nil {
			return nil, fmt.Errorf("创建文件失败: %w", err)
		}
		impl.state = "receiving_header"

		// 下载模式：发送 ZRINIT 响应（使用二进制格式）
		zrinit := BuildZRINITFrame()
		impl.outputBuf.Write(zrinit)
	}

	return impl, nil
}

// Read 读取数据
func (z *ZmodemImpl) Read(p []byte) (int, error) {
	z.mu.Lock()
	defer z.mu.Unlock()
	if z.file == nil {
		return 0, io.EOF
	}
	return z.file.Read(p)
}

// Write 写入数据
func (z *ZmodemImpl) Write(p []byte) (int, error) {
	z.mu.Lock()
	defer z.mu.Unlock()
	if z.file == nil {
		return 0, fmt.Errorf("文件未打开")
	}
	return z.file.Write(p)
}

// Close 关闭文件
func (z *ZmodemImpl) Close() error {
	z.mu.Lock()
	defer z.mu.Unlock()
	if z.file != nil {
		err := z.file.Close()
		z.file = nil
		return err
	}
	return nil
}

// GetFileSize 获取文件大小
func (z *ZmodemImpl) GetFileSize() int64 {
	z.mu.Lock()
	defer z.mu.Unlock()
	return z.fileSize
}

// GetTransferred 获取已传输字节数
func (z *ZmodemImpl) GetTransferred() int64 {
	z.mu.Lock()
	defer z.mu.Unlock()
	return z.transferred
}

// GetState 获取当前状态
func (z *ZmodemImpl) GetState() string {
	z.mu.Lock()
	defer z.mu.Unlock()
	return z.state
}

// isControlChar 判断是否为控制字符或终端控制序列
func isControlChar(b byte) bool {
	// 跳过 ASCII 控制字符 (0x00-0x1F)，但保留换行符和回车符用于判断
	if b < 0x20 && b != 0x0A && b != 0x0D {
		return true
	}
	// 跳过 ANSI 转义序列开始符 (0x1B = ESC)
	if b == 0x1B {
		return true
	}
	// 跳过 ZMODEM 协议控制字符
	// ZDLE = 0x18, ZPAD = 0x2A (但 **B00 序列包含 0x2A，需要特殊处理)
	// ZPAD2 = 0x4F, ZDLEE = 0x5E
	if b == 0x18 || b == 0x4F || b == 0x5E {
		return true
	}
	return false
}

// filterControlChars 过滤控制字符，只保留可打印字符和换行回车
func filterControlChars(data []byte) []byte {
	var result []byte
	skipUntilNewline := false

	for _, b := range data {
		// 如果遇到 ESC 序列，跳过直到换行
		if b == 0x1B {
			skipUntilNewline = true
			continue
		}
		if skipUntilNewline {
			if b == 0x0A || b == 0x0D {
				skipUntilNewline = false
			}
			continue
		}

		// 保留可打印字符和换行回车
		if b >= 0x20 && b < 0x7F || b == 0x0A || b == 0x0D {
			result = append(result, b)
		} else if !isControlChar(b) {
			// 对于其他字符，如果不是明确的控制字符，也保留（可能是二进制数据）
			result = append(result, b)
		}
		// 否则跳过控制字符
	}

	return result
}

// parseZFILEFrame 解析 ZFILE 帧，提取文件名和文件信息
func (z *ZmodemImpl) parseZFILEFrame(frame *ZmodemFrame) error {
	// ZFILE 帧的数据格式：
	// 文件名（以 \0 结尾）+ 文件大小（8字节，可选）+ 其他信息（权限等）

	// 也可以从 F0-F3 字段获取信息
	// F0 可能包含文件名长度的某些信息
	// F1-F3 可能包含文件大小的高位字节

	// 方法1：从 Data 字段解析
	if len(frame.Data) > 0 {
		// 查找文件名（以第一个 \0 结尾）
		nullIdx := -1
		for i, b := range frame.Data {
			if b == 0 {
				nullIdx = i
				break
			}
		}

		if nullIdx > 0 {
			z.filename = string(frame.Data[:nullIdx])

			// 解析文件大小（如果有，在 \0 之后）
			if nullIdx+1+8 <= len(frame.Data) {
				sizeBytes := frame.Data[nullIdx+1 : nullIdx+1+8]
				size := int64(binary.BigEndian.Uint64(sizeBytes))
				if size > 0 {
					z.fileSize = size
				}
			}
		} else if len(frame.Data) > 0 {
			// 没有找到 \0，整个数据都是文件名
			z.filename = string(frame.Data)
		}
	}

	// 方法2：从 F0-F3 字段获取文件大小（如果 Data 中没有）
	if z.fileSize == 0 {
		// F0-F3 可能包含文件大小的部分信息
		// 简化：这里不解析，因为通常文件大小在 Data 字段中
	}

	// 注意：z.filename 存储的是远程文件名（用于日志等）
	// 实际文件路径已由 ZMODEMManager 在 start() 时通过对话框选择
	// 这里不需要重新创建文件，只需记录文件名信息

	return nil
}

// FeedData 输入数据（从 SSH channel 接收）
func (z *ZmodemImpl) FeedData(data []byte) error {
	z.mu.Lock()
	defer z.mu.Unlock()

	// 测试日志（不依赖环境变量）
	if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		previewLen := len(data)
		if previewLen > 32 {
			previewLen = 32
		}
		msg := fmt.Sprintf("[%s] [ZMODEM] FeedData: mode=%d, state=%s, dataLen=%d, preview: %x\n", 
			timestamp, z.mode, z.state, len(data), data[:previewLen])
		f.WriteString(msg)
		f.Sync()
		f.Close()
	}

	// 累积接收的数据
	z.inputBuf.Write(data)

	if z.mode == 1 { // download (sz) - 接收文件
		// 使用帧解析器解析 ZMODEM 帧
		z.parser.AddData(data)

		maxIterations := 100 // 防止无限循环
		iteration := 0
		for {
			iteration++
			if iteration > maxIterations {
				break // 防止无限循环
			}

			frame, err := z.parser.ParseFrame()
			if err != nil {
				// 解析错误，清理缓冲区
				z.parser.CleanupBuffer()
				// 不直接返回错误，继续尝试解析下一个帧
				break
			}

			if frame == nil {
				// 没有更多完整帧
				break
			}

			// 处理不同类型的帧
			switch frame.Type {
			case FrameZRQINIT:
				// 请求初始化（发送方）
				// 下载模式不应该收到这个，但为了兼容性处理

			case FrameZSINIT:
				// 发送方初始化
				// 发送 ZACK 响应
				zack := BuildZACKFrame(0)
				z.outputBuf.Write(zack)

			case FrameZFILE:
				// 文件信息帧
				z.parseZFILEFrame(frame)
				z.state = "receiving_data"
				// 发送 ZACK 确认（或 ZRPOS 如果支持断点续传）
				zack := BuildZACKFrame(0)
				z.outputBuf.Write(zack)

			case FrameZDATA:
				// 文件数据帧
				if z.state == "receiving_data" && z.file != nil {
					// 写入文件数据
					// frame.Data 已经过 ZDLE 转义处理，可以直接写入
					if len(frame.Data) > 0 {
						n, err := z.file.Write(frame.Data)
						if err != nil {
							return fmt.Errorf("写入文件失败: %w", err)
						}
						z.transferred += int64(n)

						// 发送确认（使用 ZRPOS 发送当前位置）
						zrpos := BuildZRPOSFrame(uint32(z.transferred))
						z.outputBuf.Write(zrpos)
					}
				} else if z.state == "receiving_header" {
					// 如果还在接收头阶段就收到数据帧，可能需要先处理
					// 这种情况不应该发生，但为了健壮性还是处理一下
					z.state = "receiving_data"
					if z.file != nil && len(frame.Data) > 0 {
						n, err := z.file.Write(frame.Data)
						if err == nil {
							z.transferred += int64(n)
						}
					}
				}

			case FrameZEOF:
				// 文件结束帧
				if z.file != nil {
					z.file.Sync() // 同步数据到磁盘
				}
				z.state = "completed"
				// 发送 ZACK 确认
				zack := BuildZACKFrame(uint32(z.transferred))
				z.outputBuf.Write(zack)
				// 发送 ZFIN 表示传输完成
				zfin := BuildZFINFrame()
				z.outputBuf.Write(zfin)

			case FrameZFIN:
				// 传输完成（另一方发送的）
				z.state = "completed"
				// 响应 ZFIN
				zfin := BuildZFINFrame()
				z.outputBuf.Write(zfin)

			case FrameZRINIT:
				// 接收方初始化（上传模式）

			case FrameZACK:
				// 确认帧（上传模式）
				if z.state == "sending_header" {
					z.state = "sending_data"
				}

			case FrameZNAK, FrameZABORT:
				// 错误或取消
				return fmt.Errorf("传输被拒绝或取消")

			default:
				// 忽略其他帧类型
			}
		}
		} else { // upload (rz) - 发送文件
		// 使用帧解析器解析响应
		zmodemDebugLog("FeedData (upload): 收到数据，长度: %d, 当前状态: %s", len(data), z.state)
		z.parser.AddData(data)

		maxIterations := 100 // 防止无限循环
		iteration := 0
		for {
			iteration++
			if iteration > maxIterations {
				break // 防止无限循环
			}

			frame, err := z.parser.ParseFrame()
			if err != nil {
				// 解析错误，清理缓冲区，但不直接返回错误
				// 因为可能是数据不完整，继续等待更多数据
			// 输出调试信息（仅在调试模式下）
			if os.Getenv("ZMODEM_DEBUG") == "1" {
				fmt.Fprintf(os.Stderr, "[ZMODEM] 帧解析错误: %v, 数据长度: %d, hex: %s\n", err, len(data), hex.EncodeToString(data[:min(64, len(data))]))
			}
				z.parser.CleanupBuffer()
				break
			}

			if frame == nil {
				// 没有更多完整帧
				zmodemDebugLog("没有更多完整帧，缓冲区大小: %d", z.parser.GetBufferSize())
				break
			}

			// 调试输出
			zmodemDebugLog("解析到帧: Type=%d (0=ZRQINIT,1=ZRINIT,2=ZSINIT,3=ZACK,4=ZFILE,5=ZSKIP,6=ZNAK,7=ZABORT,8=ZFIN,9=ZRPOS,10=ZEOF,11=ZFERR,12=ZCRC,13=ZCHALLENGE,14=ZCOMPL,15=ZCAN,16=ZFREECNT,17=ZCOMMAND,18=ZSTDERR,19=ZDATA), FrameFormat=%d, State=%s, DataLen=%d", 
				frame.Type, frame.FrameType, z.state, len(frame.Data))

			switch frame.Type {
			case FrameZRINIT:
				// 接收方初始化，可以开始发送文件头（ZFILE）
				// 如果还在 idle 或 sending_header 状态，确保 ZFILE 在输出缓冲区中
				zmodemDebugLog("收到 ZRINIT，当前状态: %s, outputBuf长度: %d", z.state, z.outputBuf.Len())
				if z.state == "idle" || z.state == "sending_header" {
					// ZFILE 应该在 NewZmodemImpl 时已经写入 outputBuf
					// 如果 outputBuf 为空，重新构建 ZFILE 帧
					if z.outputBuf.Len() == 0 {
						baseFilename := filepath.Base(z.filename)
						zfile := BuildZFILEFrameBinary(baseFilename, z.fileSize)
						z.outputBuf.Write(zfile)
						zmodemDebugLog("重新构建 ZFILE 帧，大小: %d bytes, hex=%x", len(zfile), zfile)
					}

					// 兼容部分实现：收到 ZRINIT 后即可开始发送数据
					// 标准协议通常通过 ZACK/ZRPOS 推进到 sending_data，但有些实现不会显式发送，
					// 这里在首次 ZRINIT 且仍处于 sending_header 时，直接切换到 sending_data。
					if z.state == "sending_header" {
						z.state = "sending_data"
						zmodemDebugLog("状态转换: sending_header -> sending_data (通过 ZRINIT 兼容路径)")
					}
				}

			case FrameZACK:
				// 确认，可以继续发送数据
				// ZACK 帧的数据部分可能包含位置信息（4字节）
				zmodemDebugLog("收到 ZACK，当前状态: %s, DataLen: %d", z.state, len(frame.Data))
				if len(frame.Data) >= 4 {
					// 解析位置信息（可选，用于断点续传）
					position := binary.BigEndian.Uint32(frame.Data[:4])
					zmodemDebugLog("ZACK 位置信息: %d", position)
					_ = position // 暂时不使用
				}
				if z.state == "sending_header" {
					z.state = "sending_data"
					zmodemDebugLog("状态转换: sending_header -> sending_data (通过 ZACK)")
				} else if z.state == "sending_eof" {
					// 收到 ZEOF 的确认，传输完成
					z.state = "completed"
					zmodemDebugLog("状态转换: sending_eof -> completed")
				}

			case FrameZRPOS:
				// 接收方发送位置信息（支持断点续传）
				// ZRPOS 帧的数据部分包含位置信息（4字节）
				zmodemDebugLog("收到 ZRPOS，当前状态: %s, DataLen: %d", z.state, len(frame.Data))
				if len(frame.Data) >= 4 {
					position := binary.BigEndian.Uint32(frame.Data[:4])
					zmodemDebugLog("ZRPOS 位置信息: %d", position)
					_ = position // 暂时不使用
				}
				// 如果状态还是 sending_header，说明这是对 ZFILE 的响应
				if z.state == "sending_header" {
					z.state = "sending_data"
					zmodemDebugLog("状态转换: sending_header -> sending_data (通过 ZRPOS)")
				}
				// 可以在这里实现断点续传逻辑

			case FrameZNAK, FrameZABORT:
				// 错误或取消
				return fmt.Errorf("传输被拒绝或取消")

			default:
				// 忽略其他帧
			}
		}
	}

	return nil
}

// GetOutputData 获取输出数据（需要发送到 SSH channel）
func (z *ZmodemImpl) GetOutputData(buffer []byte) (int, error) {
	z.mu.Lock()
	defer z.mu.Unlock()

	// 优先发送输出缓冲区中的数据
	if z.outputBuf.Len() > 0 {
		n, _ := z.outputBuf.Read(buffer)
		if n > 0 {
			zmodemDebugLog("GetOutputData: 从 outputBuf 读取 %d bytes, 状态: %s, 读取后 outputBuf 长度: %d", n, z.state, z.outputBuf.Len())
			return n, nil
		}
	}

	// 上传模式：发送文件头或文件数据
	if z.mode == 0 && z.file != nil {
		// 如果还在发送头阶段，优先发送 outputBuf 中的 ZFILE 帧
		if z.state == "sending_header" {
			// 如果 outputBuf 为空，说明 ZFILE 已经发送完，等待响应
			if z.outputBuf.Len() == 0 {
				return 0, nil
			}
			// 否则继续发送 outputBuf 中的数据（ZFILE 帧）
		}

		// 发送文件数据（在 sending_data 状态）
		if z.state == "sending_data" {
			// 从文件读取数据块（ZMODEM 通常使用 1024 字节的块）
			readBuf := make([]byte, 1024)
			n, err := z.file.Read(readBuf)
			if err != nil && err != io.EOF {
				return 0, fmt.Errorf("读取文件失败: %w", err)
			}

			if n > 0 {
				// 构建 ZDATA 帧（二进制格式）
				zdataFrame := BuildZDATAFrame(readBuf[:n], uint32(z.transferred))

				zmodemDebugLog("GetOutputData: 构建 ZDATA 帧，数据大小: %d bytes, 已传输: %d/%d, 帧总长: %d", n, z.transferred, z.fileSize, len(zdataFrame))

				// 检查 buffer 大小
				if len(buffer) < len(zdataFrame) {
					// Buffer 太小，写入到输出缓冲区
					z.outputBuf.Write(zdataFrame)
					// 从输出缓冲区读取部分数据
					nRead, _ := z.outputBuf.Read(buffer)
					z.transferred += int64(n)
					zmodemDebugLog("GetOutputData: buffer 较小，先写入 outputBuf 再读出 %d bytes, 当前 transferred=%d", nRead, z.transferred)
					return nRead, nil
				}

				// 直接复制到 buffer
				copy(buffer, zdataFrame)
				z.transferred += int64(n)
				zmodemDebugLog("GetOutputData: 直接写入 ZDATA 帧到 buffer，帧长=%d, 本次数据=%d, 累计 transferred=%d", len(zdataFrame), n, z.transferred)

				if err == io.EOF {
					// 文件结束，准备发送 ZEOF
					if z.outputBuf.Len() == 0 {
						zeof := BuildZEOFFrame(uint32(z.transferred))
						z.outputBuf.Write(zeof)
						z.state = "sending_eof"
						zmodemDebugLog("GetOutputData: 文件读取完成，准备发送 ZEOF，transferred=%d", z.transferred)
					}
				}

				return len(zdataFrame), nil
			}

			if err == io.EOF {
				// 文件读取完成，发送 ZEOF
				if z.outputBuf.Len() == 0 {
					if z.transferred > 0 {
						zeof := BuildZEOFFrame(uint32(z.transferred))
						z.outputBuf.Write(zeof)
					} else {
						// 空文件，也发送 ZEOF
						zeof := BuildZEOFFrame(0)
						z.outputBuf.Write(zeof)
					}
					z.state = "sending_eof"
					zmodemDebugLog("GetOutputData: EOF 后生成 ZEOF 帧，state=sending_eof, transferred=%d", z.transferred)
				}
			}
		}
	}

	zmodemDebugLog("GetOutputData: 无数据可发送，state=%s, outputBufLen=%d", z.state, z.outputBuf.Len())
	return 0, nil
}
