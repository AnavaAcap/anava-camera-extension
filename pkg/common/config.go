package common

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config represents the configuration stored on disk
type Config struct {
	BackendURL   string `json:"backendUrl"`
	ProjectID    string `json:"projectId"`
	SessionToken string `json:"sessionToken"`
}

// ConfigStorage handles persistent configuration
type ConfigStorage struct {
	filePath string
}

// NewConfigStorage creates a new config storage instance
func NewConfigStorage() (*ConfigStorage, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	configDir := filepath.Join(homeDir, ".config", "anava")
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create config directory: %w", err)
	}

	return &ConfigStorage{
		filePath: filepath.Join(configDir, "connector-config.json"),
	}, nil
}

// Load reads configuration from disk
func (cs *ConfigStorage) Load() (*Config, error) {
	data, err := os.ReadFile(cs.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{}, nil // Return empty config if file doesn't exist
		}
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	return &config, nil
}

// Save writes configuration to disk
func (cs *ConfigStorage) Save(config *Config) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(cs.filePath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}
