package common

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
)

const LockFileName = "anava-proxy-service.lock"

// LockFile manages a lock file to prevent multiple proxy instances
type LockFile struct {
	path string
	file *os.File
}

// NewLockFile creates a new lock file manager
func NewLockFile() (*LockFile, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	// macOS: ~/Library/Application Support/Anava/
	// Linux: ~/.local/share/anava/
	// Windows: %APPDATA%\Anava\
	var lockDir string
	switch {
	case fileExists(filepath.Join(homeDir, "Library")): // macOS
		lockDir = filepath.Join(homeDir, "Library", "Application Support", "Anava")
	default: // Linux/Windows
		lockDir = filepath.Join(homeDir, ".local", "share", "anava")
	}

	if err := os.MkdirAll(lockDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create lock directory: %w", err)
	}

	return &LockFile{
		path: filepath.Join(lockDir, LockFileName),
	}, nil
}

// TryLock attempts to acquire the lock file
// Returns error if another instance is already running
func (lf *LockFile) TryLock() error {
	// Check if lock file exists
	if _, err := os.Stat(lf.path); err == nil {
		// Lock file exists - check if process is still running
		data, err := os.ReadFile(lf.path)
		if err == nil {
			pid, err := strconv.Atoi(string(data))
			if err == nil {
				// Check if process is still running
				process, err := os.FindProcess(pid)
				if err == nil {
					// On Unix, FindProcess always succeeds, so we need to send signal 0
					err = process.Signal(syscall.Signal(0))
					if err == nil {
						return fmt.Errorf("proxy service already running (PID %d)", pid)
					}
				}
			}
		}
		// Stale lock file - remove it
		os.Remove(lf.path)
	}

	// Create lock file with current PID
	file, err := os.OpenFile(lf.path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("failed to create lock file: %w", err)
	}

	lf.file = file

	// Write current PID
	pid := os.Getpid()
	if _, err := file.WriteString(strconv.Itoa(pid)); err != nil {
		file.Close()
		os.Remove(lf.path)
		return fmt.Errorf("failed to write PID to lock file: %w", err)
	}

	return nil
}

// Unlock releases the lock file
func (lf *LockFile) Unlock() error {
	if lf.file != nil {
		lf.file.Close()
	}
	return os.Remove(lf.path)
}
