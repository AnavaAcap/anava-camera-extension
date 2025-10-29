package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

// Request represents the incoming message from Chrome extension
type Request struct {
	URL      string                 `json:"url"`
	Method   string                 `json:"method"`
	Username string                 `json:"username"`
	Password string                 `json:"password"`
	Body     map[string]interface{} `json:"body,omitempty"`
}

// Response represents the outgoing message to Chrome extension
type Response struct {
	Status int                    `json:"status,omitempty"`
	Data   map[string]interface{} `json:"data,omitempty"`
	Error  string                 `json:"error,omitempty"`
}

var logger *log.Logger

const proxyServerURL = "http://127.0.0.1:9876/proxy"

// sanitizeCredential redacts sensitive credential information for logging
// Shows first and last character only, e.g., "anava" -> "a***a"
func sanitizeCredential(credential string) string {
	if len(credential) == 0 {
		return "[empty]"
	}
	if len(credential) == 1 {
		return "*"
	}
	if len(credential) == 2 {
		return string(credential[0]) + "*"
	}
	// Show first and last char, mask the rest
	masked := string(credential[0])
	for i := 1; i < len(credential)-1; i++ {
		masked += "*"
	}
	masked += string(credential[len(credential)-1])
	return masked
}

func init() {
	// Setup logging
	logDir := filepath.Join(os.Getenv("HOME"), "Library", "Logs")
	os.MkdirAll(logDir, 0755)

	logFile := filepath.Join(logDir, "anava-native-host.log")
	// SECURITY: Use 0600 permissions (owner read/write only)
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		log.Fatal("Failed to open log file:", err)
	}

	logger = log.New(f, "", log.LstdFlags)
	logger.Println("=== Native messaging host started (proxy client) ===")
}

func main() {
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
		sendError(fmt.Sprintf("Failed to read message: %v", err))
		return
	}

	// SECURITY: Sanitize credentials in logs
	logger.Printf("Received request: method=%s url=%s username=%s", req.Method, req.URL, sanitizeCredential(req.Username))

	// Forward to local proxy server
	resp, err := forwardToProxy(req)
	if err != nil {
		logger.Printf("Error forwarding to proxy: %v", err)
		sendError(fmt.Sprintf("Proxy request failed: %v", err))
		return
	}

	// Send response back to Chrome
	if err := sendMessage(resp); err != nil {
		logger.Printf("Error sending response: %v", err)
		return
	}

	logger.Println("Request completed successfully")
}

func readMessage() (*Request, error) {
	var length uint32
	if err := binary.Read(os.Stdin, binary.LittleEndian, &length); err != nil {
		return nil, fmt.Errorf("failed to read message length: %w", err)
	}

	logger.Printf("Reading message of length: %d", length)

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

	logger.Printf("Sending response: %s", string(msgBytes))

	length := uint32(len(msgBytes))
	if err := binary.Write(os.Stdout, binary.LittleEndian, length); err != nil {
		return fmt.Errorf("failed to write message length: %w", err)
	}

	if _, err := os.Stdout.Write(msgBytes); err != nil {
		return fmt.Errorf("failed to write message body: %w", err)
	}

	return nil
}

func sendError(errMsg string) {
	resp := Response{Error: errMsg}
	if err := sendMessage(resp); err != nil {
		logger.Printf("Failed to send error message: %v", err)
	}
}

func forwardToProxy(req *Request) (Response, error) {
	// Create request body
	bodyBytes, err := json.Marshal(req)
	if err != nil {
		return Response{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	logger.Printf("Forwarding to proxy server: %s", proxyServerURL)

	// Make HTTP POST to local proxy server
	httpReq, err := http.NewRequest("POST", proxyServerURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return Response{}, fmt.Errorf("failed to create HTTP request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	// Execute request
	client := &http.Client{}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		return Response{}, fmt.Errorf("proxy server request failed (is proxy server running?): %w", err)
	}
	defer httpResp.Body.Close()

	// Parse response
	var resp Response
	if err := json.NewDecoder(httpResp.Body).Decode(&resp); err != nil {
		return Response{}, fmt.Errorf("failed to decode proxy response: %w", err)
	}

	logger.Printf("Proxy response: status=%d", resp.Status)
	return resp, nil
}
