package zmodem

import (
	"C"
	"sync"
)

// SessionStatus 会话状态
type SessionStatus int

const (
	StatusIdle SessionStatus = iota
	StatusActive
	StatusCompleted
	StatusError
)

// Progress 传输进度
type Progress struct {
	Transferred int64
	Total       int64
	Percent     float64
}

// Session 会话信息
type Session struct {
	ID       int
	Mode     int // 0=upload, 1=download
	FilePath string
	Status   SessionStatus
	Progress Progress
	ErrorMsg string
	mu       sync.RWMutex
	impl     *ZmodemImpl
}

// SessionManager 会话管理器
type SessionManager struct {
	sessions map[int]*Session
	nextID   int
	mu       sync.RWMutex
}

var sessionManager = &SessionManager{
	sessions: make(map[int]*Session),
	nextID:   1,
}

// NewSession 创建新会话
func NewSession(mode int, filePath string, impl *ZmodemImpl) (*Session, error) {
	sessionManager.mu.Lock()
	defer sessionManager.mu.Unlock()

	id := sessionManager.nextID
	sessionManager.nextID++

	session := &Session{
		ID:       id,
		Mode:     mode,
		FilePath: filePath,
		Status:   StatusIdle,
		impl:     impl,
	}

	sessionManager.sessions[id] = session
	return session, nil
}

// GetSession 获取会话
func GetSession(id int) *Session {
	sessionManager.mu.RLock()
	defer sessionManager.mu.RUnlock()
	return sessionManager.sessions[id]
}

// RemoveSession 移除会话
func RemoveSession(id int) {
	sessionManager.mu.Lock()
	defer sessionManager.mu.Unlock()
	delete(sessionManager.sessions, id)
}

// UpdateProgress 更新进度
func (s *Session) UpdateProgress(transferred, total int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Progress.Transferred = transferred
	s.Progress.Total = total
	if total > 0 {
		s.Progress.Percent = float64(transferred) / float64(total) * 100
	}
}

// SetStatus 设置状态
func (s *Session) SetStatus(status SessionStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Status = status
}

// SetError 设置错误
func (s *Session) SetError(msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Status = StatusError
	s.ErrorMsg = msg
}

// GetStatus 获取状态
func (s *Session) GetStatus() SessionStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Status
}

// GetProgress 获取进度
func (s *Session) GetProgress() Progress {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Progress
}

// GetError 获取错误消息
func (s *Session) GetError() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ErrorMsg
}

// GetImpl 获取 ZmodemImpl 实例（用于跨包访问）
func (s *Session) GetImpl() *ZmodemImpl {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.impl
}
