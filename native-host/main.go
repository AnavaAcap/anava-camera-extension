package main

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
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

var (
	client *http.Client
	logger *log.Logger
)

func init() {
	// Setup logging to file FIRST
	logDir := filepath.Join(os.Getenv("HOME"), "Library", "Logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		log.Fatal("Failed to create log directory:", err)
	}

	logFile := filepath.Join(logDir, "anava-camera-proxy.log")
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Fatal("Failed to open log file:", err)
	}

	logger = log.New(f, "", log.LstdFlags)
	logger.Println("=== Native messaging host started ===")

	// Log network diagnostics
	logNetworkDiagnostics()

	// Create HTTP client with custom dialer for diagnostics
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	client = &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				logger.Printf("🔌 Attempting to dial: network=%s addr=%s", network, addr)
				conn, err := dialer.DialContext(ctx, network, addr)
				if err != nil {
					logger.Printf("❌ Dial failed: %v", err)
					return nil, err
				}
				logger.Printf("✅ Dial successful to %s", addr)
				return conn, nil
			},
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
		Timeout: 30 * time.Second,
	}
}

func logNetworkDiagnostics() {
	logger.Println("=== Network Diagnostics ===")

	// Log all network interfaces
	interfaces, err := net.Interfaces()
	if err != nil {
		logger.Printf("Failed to get network interfaces: %v", err)
		return
	}

	for _, iface := range interfaces {
		logger.Printf("Interface: %s (flags: %v)", iface.Name, iface.Flags)
		addrs, err := iface.Addrs()
		if err != nil {
			logger.Printf("  Failed to get addresses: %v", err)
			continue
		}
		for _, addr := range addrs {
			logger.Printf("  Address: %s", addr.String())
		}
	}

	// Test DNS resolution for target IP
	targetIP := "192.168.50.156"
	logger.Printf("Testing network connectivity to %s...", targetIP)

	// Try to resolve (even though it's an IP, checks DNS)
	ips, err := net.LookupIP(targetIP)
	if err != nil {
		logger.Printf("⚠️ DNS lookup failed: %v", err)
	} else {
		logger.Printf("✅ DNS lookup succeeded: %v", ips)
	}

	// Try TCP dial to port 443
	conn, err := net.DialTimeout("tcp", targetIP+":443", 5*time.Second)
	if err != nil {
		logger.Printf("❌ TCP dial to %s:443 failed: %v", targetIP, err)
	} else {
		logger.Printf("✅ TCP dial to %s:443 succeeded", targetIP)
		conn.Close()
	}

	logger.Println("=== End Network Diagnostics ===")
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

	logger.Printf("Received request: method=%s url=%s username=%s", req.Method, req.URL, req.Username)

	// Make HTTP request with authentication
	resp, err := makeRequest(req)
	if err != nil {
		logger.Printf("Error making request: %v", err)
		sendError(fmt.Sprintf("Request failed: %v", err))
		return
	}

	// Send response back to Chrome
	if err := sendMessage(resp); err != nil {
		logger.Printf("Error sending response: %v", err)
		return
	}

	logger.Println("Request completed successfully")
}

// readMessage reads a Chrome native messaging protocol message from stdin
func readMessage() (*Request, error) {
	// Read 4-byte length prefix
	var length uint32
	if err := binary.Read(os.Stdin, binary.LittleEndian, &length); err != nil {
		return nil, fmt.Errorf("failed to read message length: %w", err)
	}

	logger.Printf("Reading message of length: %d", length)

	// Read JSON message
	msgBytes := make([]byte, length)
	if _, err := io.ReadFull(os.Stdin, msgBytes); err != nil {
		return nil, fmt.Errorf("failed to read message body: %w", err)
	}

	logger.Printf("Message body: %s", string(msgBytes))

	// Parse JSON
	var req Request
	if err := json.Unmarshal(msgBytes, &req); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return &req, nil
}

// sendMessage sends a Chrome native messaging protocol message to stdout
func sendMessage(resp Response) error {
	// Marshal response to JSON
	msgBytes, err := json.Marshal(resp)
	if err != nil {
		return fmt.Errorf("failed to marshal response: %w", err)
	}

	logger.Printf("Sending response: %s", string(msgBytes))

	// Write 4-byte length prefix
	length := uint32(len(msgBytes))
	if err := binary.Write(os.Stdout, binary.LittleEndian, length); err != nil {
		return fmt.Errorf("failed to write message length: %w", err)
	}

	// Write JSON message
	if _, err := os.Stdout.Write(msgBytes); err != nil {
		return fmt.Errorf("failed to write message body: %w", err)
	}

	return nil
}

// sendError sends an error response to Chrome
func sendError(errMsg string) {
	resp := Response{Error: errMsg}
	if err := sendMessage(resp); err != nil {
		logger.Printf("Failed to send error message: %v", err)
	}
}

// makeRequest performs the HTTP request with Basic or Digest authentication
func makeRequest(req *Request) (Response, error) {
	// First try Basic auth
	resp, err := tryBasicAuth(req)
	if err == nil && resp.Status != 401 {
		return resp, nil
	}

	logger.Println("Basic auth failed or not supported, trying Digest auth")

	// If Basic failed with 401, try Digest auth
	return tryDigestAuth(req)
}

// tryBasicAuth attempts Basic authentication with retry logic
func tryBasicAuth(req *Request) (Response, error) {
	logger.Println("Trying Basic authentication")

	// Retry logic for network issues
	maxRetries := 3
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			waitTime := time.Duration(attempt) * time.Second
			logger.Printf("Retry attempt %d/%d after %v", attempt, maxRetries, waitTime)
			time.Sleep(waitTime)
		}

		// Create HTTP request
		var bodyReader io.Reader
		if req.Body != nil && len(req.Body) > 0 {
			bodyBytes, err := json.Marshal(req.Body)
			if err != nil {
				return Response{}, fmt.Errorf("failed to marshal request body: %w", err)
			}
			bodyReader = bytes.NewReader(bodyBytes)
		}

		httpReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
		if err != nil {
			return Response{}, fmt.Errorf("failed to create request: %w", err)
		}

		// Set Basic auth
		httpReq.SetBasicAuth(req.Username, req.Password)

		if req.Body != nil {
			httpReq.Header.Set("Content-Type", "application/json")
		}

		// Execute request
		httpResp, err := client.Do(httpReq)
		if err != nil {
			lastErr = err
			logger.Printf("❌ Attempt %d failed: %v", attempt, err)

			// Check if it's a "no route to host" error - retry these
			if strings.Contains(err.Error(), "no route to host") ||
			   strings.Contains(err.Error(), "connection refused") {
				continue
			}
			// For other errors, fail immediately
			return Response{}, fmt.Errorf("request execution failed: %w", err)
		}
		defer httpResp.Body.Close()

		logger.Printf("✅ Request succeeded on attempt %d", attempt)
		return parseResponse(httpResp)
	}

	return Response{}, fmt.Errorf("request execution failed after %d attempts: %w", maxRetries, lastErr)
}

// tryDigestAuth attempts Digest authentication with retry logic
func tryDigestAuth(req *Request) (Response, error) {
	logger.Println("Trying Digest authentication")

	// First request to get WWW-Authenticate header (with retry logic)
	maxRetries := 3
	var httpResp *http.Response
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			waitTime := time.Duration(attempt) * time.Second
			logger.Printf("Retry attempt %d/%d after %v", attempt, maxRetries, waitTime)
			time.Sleep(waitTime)
		}

		httpReq, err := http.NewRequest(req.Method, req.URL, nil)
		if err != nil {
			return Response{}, fmt.Errorf("failed to create initial request: %w", err)
		}

		httpResp, err = client.Do(httpReq)
		if err != nil {
			lastErr = err
			logger.Printf("❌ Digest challenge attempt %d failed: %v", attempt, err)

			// Retry on network errors
			if strings.Contains(err.Error(), "no route to host") ||
			   strings.Contains(err.Error(), "connection refused") {
				continue
			}
			return Response{}, fmt.Errorf("initial request failed: %w", err)
		}
		break
	}

	if httpResp == nil {
		return Response{}, fmt.Errorf("initial request failed after %d attempts: %w", maxRetries, lastErr)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != 401 {
		logger.Printf("Expected 401 for Digest challenge, got %d", httpResp.StatusCode)
		return parseResponse(httpResp)
	}

	// Parse WWW-Authenticate header
	authHeader := httpResp.Header.Get("WWW-Authenticate")
	if authHeader == "" {
		return Response{}, fmt.Errorf("no WWW-Authenticate header in response")
	}

	logger.Printf("WWW-Authenticate header: %s", authHeader)

	// Parse Digest challenge
	challenge, err := parseDigestChallenge(authHeader)
	if err != nil {
		return Response{}, fmt.Errorf("failed to parse Digest challenge: %w", err)
	}

	// Calculate Digest response
	digestAuth := calculateDigestAuth(req, challenge)
	logger.Printf("Calculated Authorization header: %s", digestAuth)

	// Make authenticated request
	var bodyReader io.Reader
	if req.Body != nil && len(req.Body) > 0 {
		bodyBytes, err := json.Marshal(req.Body)
		if err != nil {
			return Response{}, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	httpReq2, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		return Response{}, fmt.Errorf("failed to create authenticated request: %w", err)
	}

	httpReq2.Header.Set("Authorization", digestAuth)
	if req.Body != nil {
		httpReq2.Header.Set("Content-Type", "application/json")
	}

	httpResp2, err := client.Do(httpReq2)
	if err != nil {
		return Response{}, fmt.Errorf("authenticated request failed: %w", err)
	}
	defer httpResp2.Body.Close()

	return parseResponse(httpResp2)
}

// DigestChallenge represents parsed Digest authentication challenge
type DigestChallenge struct {
	Realm     string
	Nonce     string
	Opaque    string
	Algorithm string
	Qop       string
}

// parseDigestChallenge parses the WWW-Authenticate Digest header
func parseDigestChallenge(header string) (*DigestChallenge, error) {
	if !strings.HasPrefix(header, "Digest ") {
		return nil, fmt.Errorf("not a Digest challenge")
	}

	challenge := &DigestChallenge{
		Algorithm: "MD5", // Default algorithm
	}

	// Parse key="value" pairs
	re := regexp.MustCompile(`(\w+)="([^"]+)"`)
	matches := re.FindAllStringSubmatch(header, -1)

	for _, match := range matches {
		key := match[1]
		value := match[2]

		switch strings.ToLower(key) {
		case "realm":
			challenge.Realm = value
		case "nonce":
			challenge.Nonce = value
		case "opaque":
			challenge.Opaque = value
		case "algorithm":
			challenge.Algorithm = value
		case "qop":
			challenge.Qop = value
		}
	}

	if challenge.Realm == "" || challenge.Nonce == "" {
		return nil, fmt.Errorf("missing required Digest parameters")
	}

	return challenge, nil
}

// calculateDigestAuth calculates the Digest Authorization header
func calculateDigestAuth(req *Request, challenge *DigestChallenge) string {
	// Extract URI path from full URL
	uri := req.URL
	if idx := strings.Index(uri, "://"); idx != -1 {
		uri = uri[idx+3:]
		if idx := strings.Index(uri, "/"); idx != -1 {
			uri = uri[idx:]
		} else {
			uri = "/"
		}
	}

	// Calculate HA1 = MD5(username:realm:password)
	ha1 := md5Hash(fmt.Sprintf("%s:%s:%s", req.Username, challenge.Realm, req.Password))
	logger.Printf("HA1 = MD5(%s:%s:%s) = %s", req.Username, challenge.Realm, req.Password, ha1)

	// Calculate HA2 = MD5(method:uri)
	ha2 := md5Hash(fmt.Sprintf("%s:%s", req.Method, uri))
	logger.Printf("HA2 = MD5(%s:%s) = %s", req.Method, uri, ha2)

	var response string
	if challenge.Qop == "" {
		// RFC 2069 compatibility (no qop)
		response = md5Hash(fmt.Sprintf("%s:%s:%s", ha1, challenge.Nonce, ha2))
		logger.Printf("Response = MD5(%s:%s:%s) = %s", ha1, challenge.Nonce, ha2, response)
	} else {
		// RFC 2617 with qop
		nc := "00000001"
		cnonce := "0a4f113b"
		response = md5Hash(fmt.Sprintf("%s:%s:%s:%s:%s:%s", ha1, challenge.Nonce, nc, cnonce, challenge.Qop, ha2))
		logger.Printf("Response = MD5(%s:%s:%s:%s:%s:%s) = %s", ha1, challenge.Nonce, nc, cnonce, challenge.Qop, ha2, response)
	}

	// Build Authorization header
	auth := fmt.Sprintf(`Digest username="%s", realm="%s", nonce="%s", uri="%s", response="%s"`,
		req.Username, challenge.Realm, challenge.Nonce, uri, response)

	if challenge.Opaque != "" {
		auth += fmt.Sprintf(`, opaque="%s"`, challenge.Opaque)
	}

	if challenge.Algorithm != "" {
		auth += fmt.Sprintf(`, algorithm=%s`, challenge.Algorithm)
	}

	if challenge.Qop != "" {
		nc := "00000001"
		cnonce := "0a4f113b"
		auth += fmt.Sprintf(`, qop=%s, nc=%s, cnonce="%s"`, challenge.Qop, nc, cnonce)
	}

	return auth
}

// md5Hash calculates MD5 hash of input string
func md5Hash(input string) string {
	hash := md5.Sum([]byte(input))
	return fmt.Sprintf("%x", hash)
}

// parseResponse parses HTTP response and converts to Response struct
func parseResponse(httpResp *http.Response) (Response, error) {
	bodyBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return Response{}, fmt.Errorf("failed to read response body: %w", err)
	}

	logger.Printf("Response status: %d, body length: %d bytes", httpResp.StatusCode, len(bodyBytes))

	resp := Response{
		Status: httpResp.StatusCode,
		Data:   make(map[string]interface{}),
	}

	// Try to parse as JSON
	if len(bodyBytes) > 0 {
		var jsonData map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &jsonData); err == nil {
			resp.Data = jsonData
		} else {
			// If not valid JSON, store as text
			resp.Data["text"] = string(bodyBytes)
		}
	}

	// If status is an error, also populate Error field
	if httpResp.StatusCode >= 400 {
		if msg, ok := resp.Data["error"].(string); ok {
			resp.Error = msg
		} else if text, ok := resp.Data["text"].(string); ok {
			resp.Error = text
		} else {
			resp.Error = fmt.Sprintf("HTTP %d: %s", httpResp.StatusCode, httpResp.Status)
		}
	}

	return resp, nil
}
