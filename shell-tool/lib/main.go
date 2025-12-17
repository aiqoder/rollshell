package main

/*
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

// Progress 结构体（C 兼容）
typedef struct {
	int64_t transferred;
	int64_t total;
	double percent;
} ZmodemProgress;

// Status 结构体（C 兼容）
typedef struct {
	int status;      // 0=idle, 1=active, 2=completed, 3=error
	char* message;   // 错误消息（如果 status=3）
} ZmodemStatus;
*/
import "C"
import (
	"fmt"
	"os"
	"time"
	"unsafe"

	"github.com/ishell/lib/modules/zmodem"
)

// ZmodemInit 初始化 ZMODEM 会话
// mode: 0=upload (rz), 1=download (sz)
// filePath: 文件路径
// 返回: session_id (>=0) 或 -1 表示失败
//
//export ZmodemInit
func ZmodemInit(mode C.int, filePath *C.char) C.int {
	goFilePath := C.GoString(filePath)
	
	// 测试日志写入（不依赖环境变量，尝试多个位置）
	testLogFiles := []string{
		"/tmp/zmodem-debug.log",
		os.TempDir() + "/zmodem-debug.log",
		"./zmodem-debug.log",
	}
	for _, testLogFile := range testLogFiles {
		if f, err := os.OpenFile(testLogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			timestamp := time.Now().Format("2006-01-02 15:04:05.000")
			msg := fmt.Sprintf("[%s] [ZMODEM CGO] ZmodemInit: mode=%d, filePath=%s, ZMODEM_DEBUG=%s\n", 
				timestamp, mode, goFilePath, os.Getenv("ZMODEM_DEBUG"))
			f.WriteString(msg)
			f.Sync()
			f.Close()
			break // 成功写入一个就退出
		}
	}

	impl, err := zmodem.NewZmodemImpl(int(mode), goFilePath)
	if err != nil {
		return -1
	}

	session, err := zmodem.NewSession(int(mode), goFilePath, impl)
	if err != nil {
		return -1
	}

	return C.int(session.ID)
}

// ZmodemFeedData 输入数据（从 SSH channel 接收）
// sessionId: 会话 ID
// data: 数据指针
// dataLen: 数据长度
// 返回: 0=成功, -1=错误
//
//export ZmodemFeedData
func ZmodemFeedData(sessionId C.int, data *C.uint8_t, dataLen C.int) C.int {
	session := zmodem.GetSession(int(sessionId))
	if session == nil {
		return -1
	}

	// 将 C 数组转换为 Go slice
	goData := C.GoBytes(unsafe.Pointer(data), dataLen)
	
	// 调试输出到文件（总是写入，不依赖环境变量）
	testLogFile := "/tmp/zmodem-debug.log"
	if f, err := os.OpenFile(testLogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		previewLen := len(goData)
		if previewLen > 32 {
			previewLen = 32
		}
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		msg := fmt.Sprintf("[%s] [ZMODEM CGO] ZmodemFeedData: sessionId=%d, length=%d, preview: %x\n", 
			timestamp, sessionId, len(goData), goData[:previewLen])
		f.WriteString(msg)
		f.Sync()
		f.Close()
	}

	impl := session.GetImpl()
	if impl == nil {
		return -1
	}

	err := impl.FeedData(goData)
	if err != nil {
		session.SetError(err.Error())
		return -1
	}

	// 更新进度
	transferred := impl.GetTransferred()
	total := impl.GetFileSize()
	session.UpdateProgress(transferred, total)

	session.SetStatus(zmodem.StatusActive)
	return 0
}

// ZmodemGetOutputData 获取输出数据（需要发送到 SSH channel）
// sessionId: 会话 ID
// buffer: 输出缓冲区
// bufferLen: 缓冲区长度
// 返回: 实际数据长度 (>=0), 0=无数据, -1=错误
//
//export ZmodemGetOutputData
func ZmodemGetOutputData(sessionId C.int, buffer *C.uint8_t, bufferLen C.int) C.int {
	session := zmodem.GetSession(int(sessionId))
	if session == nil {
		return -1
	}

	// 分配 Go buffer
	goBuffer := make([]byte, int(bufferLen))

	impl := session.GetImpl()
	if impl == nil {
		return -1
	}

	// 调试日志：调用前
	if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		msg := fmt.Sprintf("[%s] [ZMODEM CGO] ZmodemGetOutputData: 调用前 sessionId=%d, bufferLen=%d\n",
			timestamp, sessionId, bufferLen)
		f.WriteString(msg)
		f.Sync()
		f.Close()
	}

	n, err := impl.GetOutputData(goBuffer)
	if err != nil {
		session.SetError(err.Error())
		return -1
	}

	// 调试日志：调用后
	if f, err := os.OpenFile("/tmp/zmodem-debug.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		previewLen := n
		if previewLen > 32 {
			previewLen = 32
		}
		if previewLen < 0 {
			previewLen = 0
		}
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		msg := fmt.Sprintf("[%s] [ZMODEM CGO] ZmodemGetOutputData: 调用后 sessionId=%d, 返回=%d, 预览: %x\n",
			timestamp, sessionId, n, goBuffer[:previewLen])
		f.WriteString(msg)
		f.Sync()
		f.Close()
	}

	if n > 0 {
		// 更新进度
		transferred := impl.GetTransferred()
		total := impl.GetFileSize()
		session.UpdateProgress(transferred, total)

		// 将数据复制到 C buffer
		if n > int(bufferLen) {
			n = int(bufferLen)
		}
		C.memcpy(unsafe.Pointer(buffer), unsafe.Pointer(&goBuffer[0]), C.size_t(n))
	}

	return C.int(n)
}

// ZmodemGetProgress 获取传输进度
// sessionId: 会话 ID
// 返回: Progress 结构体指针（需要调用者 free），nil 表示错误
//
//export ZmodemGetProgress
func ZmodemGetProgress(sessionId C.int) *C.ZmodemProgress {
	session := zmodem.GetSession(int(sessionId))
	if session == nil {
		return nil
	}

	// 从 impl 获取实时进度
	impl := session.GetImpl()
	var transferred, total int64
	var percent float64

	if impl != nil {
		transferred = impl.GetTransferred()
		total = impl.GetFileSize()
		if total > 0 {
			percent = float64(transferred) / float64(total) * 100
		}

		// 更新 session 的进度
		session.UpdateProgress(transferred, total)
	} else {
		progress := session.GetProgress()
		transferred = progress.Transferred
		total = progress.Total
		percent = progress.Percent
	}

	cProgress := (*C.ZmodemProgress)(C.malloc(C.size_t(unsafe.Sizeof(C.ZmodemProgress{}))))
	cProgress.transferred = C.int64_t(transferred)
	cProgress.total = C.int64_t(total)
	cProgress.percent = C.double(percent)

	return cProgress
}

// ZmodemFreeProgress 释放 Progress 结构体内存
//
//export ZmodemFreeProgress
func ZmodemFreeProgress(progress *C.ZmodemProgress) {
	if progress != nil {
		C.free(unsafe.Pointer(progress))
	}
}

// ZmodemGetStatus 获取会话状态
// sessionId: 会话 ID
// 返回: Status 结构体指针（需要调用者 free），nil 表示错误
//
//export ZmodemGetStatus
func ZmodemGetStatus(sessionId C.int) *C.ZmodemStatus {
	session := zmodem.GetSession(int(sessionId))
	if session == nil {
		return nil
	}

	// 优先根据底层实现的状态推导会话状态，保证 completed 状态能够被正确感知
	// 注意：如果会话已经标记为错误状态，则不覆盖该状态
	currentStatus := session.GetStatus()
	if currentStatus != zmodem.StatusError {
		if impl := session.GetImpl(); impl != nil {
			state := impl.GetState()
			transferred := impl.GetTransferred()
			total := impl.GetFileSize()

			switch state {
			case "completed":
				currentStatus = zmodem.StatusCompleted
			case "idle":
				currentStatus = zmodem.StatusIdle
			case "sending_eof":
				// 如果已经发送完所有数据且处于 sending_eof，则视为已完成
				if total > 0 && transferred >= total {
					currentStatus = zmodem.StatusCompleted
				} else {
					currentStatus = zmodem.StatusActive
				}
			default:
				// 只在尚未完成时将状态视为 active，避免误报 completed
				currentStatus = zmodem.StatusActive
			}

			session.SetStatus(currentStatus)
		}
	}

	errorMsg := session.GetError()

	cStatus := (*C.ZmodemStatus)(C.malloc(C.size_t(unsafe.Sizeof(C.ZmodemStatus{}))))
	cStatus.status = C.int(currentStatus)

	if errorMsg != "" {
		cStatus.message = C.CString(errorMsg)
	} else {
		cStatus.message = nil
	}

	return cStatus
}

// ZmodemFreeStatus 释放 Status 结构体内存
//
//export ZmodemFreeStatus
func ZmodemFreeStatus(status *C.ZmodemStatus) {
	if status != nil {
		if status.message != nil {
			C.free(unsafe.Pointer(status.message))
		}
		C.free(unsafe.Pointer(status))
	}
}

// ZmodemCleanup 清理会话资源
// sessionId: 会话 ID
//
//export ZmodemCleanup
func ZmodemCleanup(sessionId C.int) {
	session := zmodem.GetSession(int(sessionId))
	if session != nil {
		impl := session.GetImpl()
		if impl != nil {
			impl.Close()
		}
		zmodem.RemoveSession(int(sessionId))
	}
}

func main() {
	// 空 main，用于编译为动态库
}
