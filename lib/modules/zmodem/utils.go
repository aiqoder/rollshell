package zmodem

import (
	"fmt"
	"os"
	"path/filepath"
)

// sanitizeFilename 清理文件名，移除不安全的字符
func sanitizeFilename(filename string) string {
	// 移除路径分隔符和其他不安全字符
	var result []rune
	for _, r := range filename {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			result = append(result, '_')
		} else {
			result = append(result, r)
		}
	}
	return string(result)
}

// extractBasename 从完整路径提取文件名
func extractBasename(path string) string {
	return filepath.Base(path)
}

// createSafeFile 创建安全文件名（避免覆盖系统文件）
func createSafeFile(basePath string, suggestedName string) (*os.File, string, error) {
	// 清理建议的文件名
	safeName := sanitizeFilename(suggestedName)
	if safeName == "" {
		safeName = "received_file"
	}

	fullPath := filepath.Join(basePath, safeName)
	
	// 如果文件已存在，添加序号
	counter := 1
	for {
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			break
		}
		ext := filepath.Ext(safeName)
		nameWithoutExt := safeName[:len(safeName)-len(ext)]
		fullPath = filepath.Join(basePath, fmt.Sprintf("%s_%d%s", nameWithoutExt, counter, ext))
		counter++
		if counter > 1000 {
			return nil, "", fmt.Errorf("无法创建文件：已存在太多同名文件")
		}
	}

	file, err := os.Create(fullPath)
	if err != nil {
		return nil, "", fmt.Errorf("创建文件失败: %w", err)
	}

	return file, fullPath, nil
}

