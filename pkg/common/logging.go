package common

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// InitLogger creates a logger that writes to the specified log file
func InitLogger(mode string) (*log.Logger, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	// macOS: ~/Library/Logs/
	// Linux: ~/.local/share/anava/logs/
	// Windows: %APPDATA%\Anava\logs\
	var logDir string
	switch {
	case fileExists(filepath.Join(homeDir, "Library")): // macOS
		logDir = filepath.Join(homeDir, "Library", "Logs")
	default: // Linux/Windows
		logDir = filepath.Join(homeDir, ".local", "share", "anava", "logs")
	}

	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create log directory: %w", err)
	}

	// Determine log file name based on mode
	var logFileName string
	switch mode {
	case "native-messaging":
		logFileName = "anava-native-host.log"
	case "proxy-service":
		logFileName = "anava-proxy-service.log"
	default:
		logFileName = "anava-local-connector.log"
	}

	logFile := filepath.Join(logDir, logFileName)

	// SECURITY: Use 0600 permissions (owner read/write only)
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return nil, fmt.Errorf("failed to open log file: %w", err)
	}

	logger := log.New(f, "", log.LstdFlags)
	logger.Printf("=== Anava Local Connector started (mode: %s) ===", mode)

	return logger, nil
}

// fileExists checks if a file or directory exists
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
