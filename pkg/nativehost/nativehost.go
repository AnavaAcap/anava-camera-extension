package nativehost

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"anava-camera-extension/pkg/common"
)

const VERSION = "2.0.0"

// Message types
const (
	TypeProxyRequest = "PROXY_REQUEST"
	TypeGetVersion   = "GET_VERSION"
	TypeHealthCheck  = "HEALTH_CHECK"
	TypeConfigure    = "CONFIGURE"
)

// Request represents incoming message from Chrome extension
type Request struct {
	Type     string                 `json:"type"`
	URL      string                 `json:"url,omitempty"`
	Method   string                 `json:"method,omitempty"`
	Username string                 `json:"username,omitempty"`
	Password string                 `json:"password,omitempty"`
	Body     map[string]interface{} `json:"body,omitempty"`
	// For CONFIGURE message
	BackendURL string `json:"backendUrl,omitempty"`
	ProjectID  string `json:"projectId,omitempty"`
	Nonce      string `json:"nonce,omitempty"`
}

// Response represents outgoing message to Chrome extension
type Response struct {
	Success bool                   `json:"success"`
	Version string                 `json:"version,omitempty"`
	Status  int                    `json:"status,omitempty"`
	Data    map[string]interface{} `json:"data,omitempty"`
	Error   string                 `json:"error,omitempty"`
}

const proxyServerURL = "http://127.0.0.1:9876/proxy"

// Run starts the native messaging host
func Run(logger *log.Logger) error {
	defer func() {
		if r := recover(); r != nil {
			logger.Printf("Panic recovered: %v", r)
			sendError(fmt.Sprintf("Internal error: %v", r))
		}
	}()

	// Read message from Chrome
	req, err := readMessage()
	if err != nil {
		logger.Printf("Error reading message: %v", err)
		return sendError(fmt.Sprintf("Failed to read message: %v", err))
	}

	logger.Printf("Received message type: %s", req.Type)

	// Handle different message types
	switch req.Type {
	case TypeGetVersion:
		return handleGetVersion(logger)

	case TypeHealthCheck:
		return handleHealthCheck(logger)

	case TypeConfigure:
		return handleConfigure(logger, req)

	case TypeProxyRequest, "": // Empty type defaults to proxy request for backwards compatibility
		return handleProxyRequest(logger, req)

	default:
		logger.Printf("Unknown message type: %s", req.Type)
		return sendError(fmt.Sprintf("Unknown message type: %s", req.Type))
	}
}

func handleGetVersion(logger *log.Logger) error {
	logger.Printf("Handling GET_VERSION request")
	resp := Response{
		Success: true,
		Version: VERSION,
	}
	return sendMessage(resp)
}

func handleHealthCheck(logger *log.Logger) error {
	logger.Printf("Handling HEALTH_CHECK request")

	// Check if proxy service is running
	// TODO: Implement actual health check to proxy service
	resp := Response{
		Success: true,
		Data: map[string]interface{}{
			"nativeHost":   "running",
			"proxyService": "unknown", // Will be implemented with actual check
		},
	}
	return sendMessage(resp)
}

func handleConfigure(logger *log.Logger, req *Request) error {
	logger.Printf("Handling CONFIGURE request for project: %s", req.ProjectID)

	// Validate input
	if req.BackendURL == "" || req.ProjectID == "" || req.Nonce == "" {
		return sendError("Missing required fields: backendUrl, projectId, nonce")
	}

	// Authenticate with backend using nonce
	logger.Printf("Authenticating with backend: %s", req.BackendURL)
	sessionToken, err := authenticateWithBackend(logger, req.BackendURL, req.ProjectID, req.Nonce)
	if err != nil {
		logger.Printf("Backend authentication failed: %v", err)
		return sendError(fmt.Sprintf("Backend authentication failed: %v", err))
	}

	logger.Printf("Backend authentication successful, received session token")

	// Store configuration
	configStorage, err := common.NewConfigStorage()
	if err != nil {
		logger.Printf("Failed to create config storage: %v", err)
		return sendError(fmt.Sprintf("Failed to create config storage: %v", err))
	}

	config := &common.Config{
		BackendURL:   req.BackendURL,
		ProjectID:    req.ProjectID,
		SessionToken: sessionToken,
	}

	if err := configStorage.Save(config); err != nil {
		logger.Printf("Failed to save config: %v", err)
		return sendError(fmt.Sprintf("Failed to save config: %v", err))
	}

	logger.Printf("Configuration saved successfully")
	resp := Response{
		Success: true,
		Data: map[string]interface{}{
			"configured":   true,
			"projectId":    req.ProjectID,
			"authenticated": true,
		},
	}
	return sendMessage(resp)
}

// authenticateWithBackend authenticates with the backend using the provided nonce
func authenticateWithBackend(logger *log.Logger, backendURL, projectID, nonce string) (string, error) {
	// Prepare authentication request
	authURL := fmt.Sprintf("%s/api/extension/authenticate", backendURL)

	httpReq, err := http.NewRequest("POST", authURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create auth request: %w", err)
	}

	// Set authentication headers
	httpReq.Header.Set("X-Companion-Nonce", nonce)
	httpReq.Header.Set("X-Project-ID", projectID)
	httpReq.Header.Set("Content-Type", "application/json")

	// Make request
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	httpResp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("auth request failed: %w", err)
	}
	defer httpResp.Body.Close()

	// Check response status
	if httpResp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(httpResp.Body)
		return "", fmt.Errorf("auth failed with status %d: %s", httpResp.StatusCode, string(bodyBytes))
	}

	// Parse response
	var authResp struct {
		Success      bool   `json:"success"`
		SessionToken string `json:"sessionToken"`
		Error        string `json:"error"`
	}

	if err := json.NewDecoder(httpResp.Body).Decode(&authResp); err != nil {
		return "", fmt.Errorf("failed to parse auth response: %w", err)
	}

	if !authResp.Success || authResp.SessionToken == "" {
		return "", fmt.Errorf("authentication failed: %s", authResp.Error)
	}

	return authResp.SessionToken, nil
}

func handleProxyRequest(logger *log.Logger, req *Request) error {
	// SECURITY: Sanitize credentials in logs
	logger.Printf("Handling proxy request: method=%s url=%s username=%s",
		req.Method, req.URL, common.SanitizeCredential(req.Username))

	// Forward to local proxy server
	proxyReq := &common.ProxyRequest{
		URL:      req.URL,
		Method:   req.Method,
		Username: req.Username,
		Password: req.Password,
		Body:     req.Body,
	}

	resp, err := forwardToProxy(logger, proxyReq)
	if err != nil {
		logger.Printf("Error forwarding to proxy: %v", err)
		return sendError(fmt.Sprintf("Proxy request failed: %v", err))
	}

	// Convert ProxyResponse to Response
	response := Response{
		Success: resp.Status < 400,
		Status:  resp.Status,
		Data:    resp.Data,
		Error:   resp.Error,
	}

	// Send response back to Chrome
	if err := sendMessage(response); err != nil {
		logger.Printf("Error sending response: %v", err)
		return err
	}

	logger.Println("Request completed successfully")
	return nil
}

func readMessage() (*Request, error) {
	var length uint32
	if err := binary.Read(os.Stdin, binary.LittleEndian, &length); err != nil {
		return nil, fmt.Errorf("failed to read message length: %w", err)
	}

	msgBytes := make([]byte, length)
	if _, err := io.ReadFull(os.Stdin, msgBytes); err != nil {
		return nil, fmt.Errorf("failed to read message body: %w", err)
	}

	var req Request
	if err := json.Unmarshal(msgBytes, &req); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return &req, nil
}

func sendMessage(resp Response) error {
	msgBytes, err := json.Marshal(resp)
	if err != nil {
		return fmt.Errorf("failed to marshal response: %w", err)
	}

	length := uint32(len(msgBytes))
	if err := binary.Write(os.Stdout, binary.LittleEndian, length); err != nil {
		return fmt.Errorf("failed to write message length: %w", err)
	}

	if _, err := os.Stdout.Write(msgBytes); err != nil {
		return fmt.Errorf("failed to write message body: %w", err)
	}

	return nil
}

func sendError(errMsg string) error {
	resp := Response{
		Success: false,
		Error:   errMsg,
	}
	return sendMessage(resp)
}

func forwardToProxy(logger *log.Logger, req *common.ProxyRequest) (common.ProxyResponse, error) {
	// Create request body
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return common.ProxyResponse{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	logger.Printf("Forwarding to proxy server: %s", proxyServerURL)

	// Make HTTP POST to local proxy server
	httpReq, err := http.NewRequest("POST", proxyServerURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return common.ProxyResponse{}, fmt.Errorf("failed to create HTTP request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	// Execute request
	client := &http.Client{}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		return common.ProxyResponse{}, fmt.Errorf("proxy server request failed (is proxy server running?): %w", err)
	}
	defer httpResp.Body.Close()

	// Parse response
	var resp common.ProxyResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&resp); err != nil {
		return common.ProxyResponse{}, fmt.Errorf("failed to decode proxy response: %w", err)
	}

	logger.Printf("Proxy response: status=%d", resp.Status)
	return resp, nil
}
