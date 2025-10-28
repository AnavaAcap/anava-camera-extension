package main

import (
	"bytes"
	"crypto/md5"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Request represents incoming proxy request
type ProxyRequest struct {
	URL      string                 `json:"url"`
	Method   string                 `json:"method"`
	Username string                 `json:"username"`
	Password string                 `json:"password"`
	Body     map[string]interface{} `json:"body,omitempty"`
}

// Response represents proxy response
type ProxyResponse struct {
	Status int                    `json:"status,omitempty"`
	Data   map[string]interface{} `json:"data,omitempty"`
	Error  string                 `json:"error,omitempty"`
}

var (
	client *http.Client
	logger *log.Logger
)

func init() {
	// Setup logging
	logDir := filepath.Join(os.Getenv("HOME"), "Library", "Logs")
	os.MkdirAll(logDir, 0755)

	logFile := filepath.Join(logDir, "anava-camera-proxy-server.log")
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Fatal("Failed to open log file:", err)
	}

	logger = log.New(f, "", log.LstdFlags)
	logger.Println("=== Camera Proxy Server started ===")

	// Create HTTP client for camera connections (NOT sandboxed)
	// Note: We override timeout per-request for the unauthenticated test
	client = &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
		Timeout: 30 * time.Second,
	}
}

// tryUnauthenticatedRequest makes ONE request without auth (3 second timeout)
// This is Step 1 of the Electron pattern - quickly detect non-cameras
func tryUnauthenticatedRequest(req *ProxyRequest) (ProxyResponse, error) {
	logger.Println("Trying unauthenticated request (3s timeout)")

	var bodyReader io.Reader
	var bodyBytes []byte
	if req.Body != nil && len(req.Body) > 0 {
		var err error
		bodyBytes, err = json.Marshal(req.Body)
		if err != nil {
			return ProxyResponse{}, fmt.Errorf("failed to marshal request body: %w", err)
		}
		logger.Printf("Marshaled JSON body (%d bytes): %s", len(bodyBytes), string(bodyBytes))
		bodyReader = bytes.NewReader(bodyBytes)
	} else {
		logger.Println("WARNING: No body to send (req.Body is nil or empty)")
	}

	httpReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "AnaVision/1.0")
	httpReq.Header.Set("X-Requested-With", "XMLHttpRequest")

	if bodyBytes != nil {
		httpReq.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
		logger.Printf("Request headers - Content-Type: application/json, Content-Length: %d", len(bodyBytes))
	}

	// Use 3 second timeout for this test (same as Electron)
	testClient := &http.Client{
		Transport: client.Transport,
		Timeout:   3 * time.Second,
	}

	httpResp, err := testClient.Do(httpReq)
	if err != nil {
		return ProxyResponse{}, err
	}
	defer httpResp.Body.Close()

	return parseResponse(httpResp)
}

// isTimeoutError checks if error is a timeout
func isTimeoutError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "timeout") ||
		strings.Contains(err.Error(), "ETIMEDOUT") ||
		strings.Contains(err.Error(), "context deadline exceeded")
}

// isConnectionRefusedError checks if error is connection refused
func isConnectionRefusedError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "connection refused") ||
		strings.Contains(err.Error(), "ECONNREFUSED")
}

func main() {
	// Start HTTP server on localhost only (Chrome can access localhost)
	http.HandleFunc("/proxy", handleProxyRequest)
	http.HandleFunc("/health", handleHealth)

	port := "9876"
	addr := "127.0.0.1:" + port

	logger.Printf("Starting proxy server on %s", addr)
	fmt.Printf("Camera Proxy Server listening on http://%s\n", addr)
	fmt.Println("This server bypasses Chrome's local network sandbox restrictions")

	if err := http.ListenAndServe(addr, nil); err != nil {
		logger.Fatalf("Server failed to start: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleProxyRequest(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for Chrome extension
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request
	var req ProxyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.Printf("Failed to decode request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	logger.Printf("Proxying request: %s %s (user: %s)", req.Method, req.URL, req.Username)
	if req.Body != nil && len(req.Body) > 0 {
		bodyJSON, _ := json.Marshal(req.Body)
		logger.Printf("Received request body: %s", string(bodyJSON))
	} else {
		logger.Println("WARNING: Received request with no body field")
	}

	// Make request to camera (NOT affected by Chrome sandbox)
	resp, err := makeCameraRequest(&req)
	if err != nil {
		logger.Printf("Camera request failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ProxyResponse{
			Error: fmt.Sprintf("Request failed: %v", err),
		})
		return
	}

	// Send response back to Chrome extension
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func makeCameraRequest(req *ProxyRequest) (ProxyResponse, error) {
	// CRITICAL: Follow Electron pattern exactly
	// Step 1: Try ONE unauthenticated request first (3 second timeout)
	logger.Println("Step 1: Testing connection without authentication")

	resp, err := tryUnauthenticatedRequest(req)

	// On timeout/connection refused, return immediately (not a camera)
	if err != nil {
		if isTimeoutError(err) || isConnectionRefusedError(err) {
			logger.Printf("Device not responding (timeout/refused) - not a camera")
			return ProxyResponse{}, fmt.Errorf("device not responding: %w", err)
		}
		return ProxyResponse{}, err
	}

	// If 200, no auth needed - success!
	if resp.Status == 200 {
		logger.Println("Success: No authentication required")
		return resp, nil
	}

	// If not 401, unexpected response
	if resp.Status != 401 {
		logger.Printf("Unexpected response status: %d", resp.Status)
		return resp, nil
	}

	// Step 2: Only if 401, try auth based on protocol
	logger.Println("Step 2: 401 received, trying authentication")

	// Determine protocol from URL
	isHTTPS := strings.HasPrefix(req.URL, "https://")

	if isHTTPS {
		// HTTPS: Try Basic first, then Digest
		logger.Println("HTTPS detected: Trying Basic Auth first")
		resp, err := tryBasicAuth(req)
		if err == nil && resp.Status == 200 {
			logger.Println("Basic Auth succeeded")
			return resp, nil
		}

		logger.Println("Basic Auth failed, trying Digest Auth")
		return tryDigestAuth(req)
	} else {
		// HTTP: Try Digest first, then Basic
		logger.Println("HTTP detected: Trying Digest Auth first")
		resp, err := tryDigestAuth(req)
		if err == nil && resp.Status == 200 {
			logger.Println("Digest Auth succeeded")
			return resp, nil
		}

		logger.Println("Digest Auth failed, trying Basic Auth")
		return tryBasicAuth(req)
	}
}

func tryBasicAuth(req *ProxyRequest) (ProxyResponse, error) {
	logger.Println("Trying Basic authentication")

	var bodyReader io.Reader
	var bodyBytes []byte
	if req.Body != nil && len(req.Body) > 0 {
		var err error
		bodyBytes, err = json.Marshal(req.Body)
		if err != nil {
			return ProxyResponse{}, fmt.Errorf("failed to marshal request body: %w", err)
		}
		logger.Printf("Basic Auth - Marshaled JSON body (%d bytes): %s", len(bodyBytes), string(bodyBytes))
		bodyReader = bytes.NewReader(bodyBytes)
	} else {
		logger.Println("Basic Auth - WARNING: No body to send")
	}

	httpReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.SetBasicAuth(req.Username, req.Password)
	if req.Body != nil {
		httpReq.Header.Set("Content-Type", "application/json")
		if bodyBytes != nil {
			httpReq.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
			logger.Printf("Basic Auth - Headers: Content-Type=application/json, Content-Length=%d", len(bodyBytes))
		}
	}

	httpResp, err := client.Do(httpReq)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("request execution failed: %w", err)
	}
	defer httpResp.Body.Close()

	return parseResponse(httpResp)
}

func tryDigestAuth(req *ProxyRequest) (ProxyResponse, error) {
	logger.Println("Trying Digest authentication")

	// First request to get challenge (send body for Axis cameras that process it)
	var bodyBytes []byte
	var bodyReader io.Reader
	if req.Body != nil && len(req.Body) > 0 {
		var err error
		bodyBytes, err = json.Marshal(req.Body)
		if err != nil {
			return ProxyResponse{}, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
		logger.Printf("Digest Auth - Challenge request with body (%d bytes)", len(bodyBytes))
	}

	httpReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("failed to create initial request: %w", err)
	}

	if bodyBytes != nil {
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
	}

	httpResp, err := client.Do(httpReq)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("initial request failed: %w", err)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != 401 {
		logger.Printf("Digest Auth - Unexpected response %d (expected 401)", httpResp.StatusCode)
		return parseResponse(httpResp)
	}

	// Parse WWW-Authenticate header
	authHeader := httpResp.Header.Get("WWW-Authenticate")
	if authHeader == "" {
		return ProxyResponse{}, fmt.Errorf("no WWW-Authenticate header in response")
	}

	logger.Printf("WWW-Authenticate header: %s", authHeader)

	// Parse Digest challenge
	challenge, err := parseDigestChallenge(authHeader)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("failed to parse Digest challenge: %w", err)
	}

	// Calculate Digest response
	digestAuth := calculateDigestAuth(req, challenge)
	logger.Printf("Calculated Authorization header: %s", digestAuth)

	// Make authenticated request (recreate body bytes for second request)
	bodyBytes = nil
	bodyReader = nil
	if req.Body != nil && len(req.Body) > 0 {
		var err error
		bodyBytes, err = json.Marshal(req.Body)
		if err != nil {
			return ProxyResponse{}, fmt.Errorf("failed to marshal request body: %w", err)
		}
		logger.Printf("Digest Auth - Authenticated request with body (%d bytes): %s", len(bodyBytes), string(bodyBytes))
		bodyReader = bytes.NewReader(bodyBytes)
	} else {
		logger.Println("Digest Auth - WARNING: No body to send in authenticated request")
	}

	httpReq2, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("failed to create authenticated request: %w", err)
	}

	httpReq2.Header.Set("Authorization", digestAuth)
	if req.Body != nil {
		httpReq2.Header.Set("Content-Type", "application/json")
		if bodyBytes != nil {
			httpReq2.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
			logger.Printf("Digest Auth - Headers: Content-Type=application/json, Content-Length=%d", len(bodyBytes))
		}
	}

	httpResp2, err := client.Do(httpReq2)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("authenticated request failed: %w", err)
	}
	defer httpResp2.Body.Close()

	return parseResponse(httpResp2)
}

type DigestChallenge struct {
	Realm     string
	Nonce     string
	Opaque    string
	Algorithm string
	Qop       string
}

func parseDigestChallenge(header string) (*DigestChallenge, error) {
	if !strings.HasPrefix(header, "Digest ") {
		return nil, fmt.Errorf("not a Digest challenge")
	}

	challenge := &DigestChallenge{
		Algorithm: "MD5",
	}

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

func calculateDigestAuth(req *ProxyRequest, challenge *DigestChallenge) string {
	uri := req.URL
	if idx := strings.Index(uri, "://"); idx != -1 {
		uri = uri[idx+3:]
		if idx := strings.Index(uri, "/"); idx != -1 {
			uri = uri[idx:]
		} else {
			uri = "/"
		}
	}

	ha1 := md5Hash(fmt.Sprintf("%s:%s:%s", req.Username, challenge.Realm, req.Password))
	ha2 := md5Hash(fmt.Sprintf("%s:%s", req.Method, uri))

	var response string
	if challenge.Qop == "" {
		response = md5Hash(fmt.Sprintf("%s:%s:%s", ha1, challenge.Nonce, ha2))
	} else {
		nc := "00000001"
		cnonce := "0a4f113b"
		response = md5Hash(fmt.Sprintf("%s:%s:%s:%s:%s:%s", ha1, challenge.Nonce, nc, cnonce, challenge.Qop, ha2))
	}

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

func md5Hash(input string) string {
	hash := md5.Sum([]byte(input))
	return fmt.Sprintf("%x", hash)
}

func parseResponse(httpResp *http.Response) (ProxyResponse, error) {
	bodyBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("failed to read response body: %w", err)
	}

	logger.Printf("Response status: %d, body length: %d bytes", httpResp.StatusCode, len(bodyBytes))

	resp := ProxyResponse{
		Status: httpResp.StatusCode,
		Data:   make(map[string]interface{}),
	}

	if len(bodyBytes) > 0 {
		var jsonData map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &jsonData); err == nil {
			resp.Data = jsonData
		} else {
			resp.Data["text"] = string(bodyBytes)
		}
	}

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
