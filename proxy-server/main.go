package main

import (
	"bytes"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
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
	"sync"
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
	client       *http.Client // Regular requests (30s timeout)
	uploadClient *http.Client // Upload requests (3 minute timeout)
	logger       *log.Logger
	certStore    *CertificateStore
)

// CertificateStore manages certificate fingerprints for known cameras
type CertificateStore struct {
	mu           sync.RWMutex
	fingerprints map[string]string // host -> SHA256 fingerprint
	filePath     string
}

// NewCertificateStore creates a new certificate store
func NewCertificateStore(filePath string) *CertificateStore {
	store := &CertificateStore{
		fingerprints: make(map[string]string),
		filePath:     filePath,
	}
	store.load()
	return store
}

// load reads saved fingerprints from disk
func (cs *CertificateStore) load() {
	data, err := os.ReadFile(cs.filePath)
	if err != nil {
		// File doesn't exist yet - that's okay
		return
	}

	var fingerprints map[string]string
	if err := json.Unmarshal(data, &fingerprints); err != nil {
		logger.Printf("Warning: Failed to load certificate store: %v", err)
		return
	}

	cs.mu.Lock()
	cs.fingerprints = fingerprints
	cs.mu.Unlock()

	logger.Printf("Loaded %d certificate fingerprints", len(fingerprints))
}

// save writes fingerprints to disk
func (cs *CertificateStore) save() {
	cs.mu.RLock()
	data, err := json.MarshalIndent(cs.fingerprints, "", "  ")
	cs.mu.RUnlock()

	if err != nil {
		logger.Printf("Error marshaling certificate store: %v", err)
		return
	}

	if err := os.WriteFile(cs.filePath, data, 0600); err != nil {
		logger.Printf("Error saving certificate store: %v", err)
	}
}

// GetFingerprint returns the stored fingerprint for a host
func (cs *CertificateStore) GetFingerprint(host string) (string, bool) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	fp, ok := cs.fingerprints[host]
	return fp, ok
}

// SetFingerprint stores a fingerprint for a host
func (cs *CertificateStore) SetFingerprint(host, fingerprint string) {
	cs.mu.Lock()
	cs.fingerprints[host] = fingerprint
	cs.mu.Unlock()
	cs.save()
}

// calculateCertFingerprint returns SHA256 fingerprint of certificate
func calculateCertFingerprint(cert *x509.Certificate) string {
	hash := sha256.Sum256(cert.Raw)
	return hex.EncodeToString(hash[:])
}

// generateSecureNonce generates cryptographically secure random nonce
// Returns 16 bytes (32 hex characters) of random data
func generateSecureNonce() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback to timestamp-based if crypto/rand fails (unlikely)
		logger.Printf("Warning: crypto/rand failed, using fallback nonce")
		return fmt.Sprintf("%d%d", time.Now().UnixNano(), time.Now().Unix())
	}
	return hex.EncodeToString(b)
}

// generateRandomBoundary generates a random boundary string like Electron does
// Mimics Math.random().toString(36).substring(2) from JavaScript
func generateRandomBoundary() string {
	b := make([]byte, 8)
	rand.Read(b)
	// Convert to base36-ish string (alphanumeric)
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, 16)
	for i := range result {
		result[i] = chars[b[i%len(b)]%uint8(len(chars))]
	}
	return string(result)
}

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
	masked := string(credential[0]) + strings.Repeat("*", len(credential)-2) + string(credential[len(credential)-1])
	return masked
}

// SECURITY: Allowed origins for CORS (whitelist approach)
// Only these origins can make requests to the proxy server
var allowedOrigins = map[string]bool{
	"http://localhost:5173":                               true, // Local dev server
	"http://localhost:3000":                               true, // Alternative local dev
	"https://anava-ai.web.app":                            true, // Production web app
	"http://127.0.0.1:5173":                               true, // Localhost IP variant
	"http://127.0.0.1:3000":                               true, // Localhost IP variant
	"chrome-extension://ojhdgnojgelfiejpgipjddfddgefdpfa": true, // Extension ID (from install script)
}

func init() {
	// Setup logging
	logDir := filepath.Join(os.Getenv("HOME"), "Library", "Logs")
	os.MkdirAll(logDir, 0755)

	logFile := filepath.Join(logDir, "anava-camera-proxy-server.log")
	// SECURITY: Use 0600 permissions (owner read/write only)
	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		log.Fatal("Failed to open log file:", err)
	}

	logger = log.New(f, "", log.LstdFlags)
	logger.Println("=== Camera Proxy Server started ===")

	// SECURITY: Initialize certificate store for pinning
	certStoreDir := filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Anava")
	os.MkdirAll(certStoreDir, 0700)
	certStoreFile := filepath.Join(certStoreDir, "certificate-fingerprints.json")
	certStore = NewCertificateStore(certStoreFile)

	// Create TLS config with certificate validation (shared by both clients)
	tlsConfig := &tls.Config{
		// SECURITY: Still accept self-signed, but we'll validate fingerprints
		InsecureSkipVerify: true,
		// Callback to validate certificate fingerprints
		VerifyConnection: func(cs tls.ConnectionState) error {
			if len(cs.PeerCertificates) == 0 {
				return fmt.Errorf("no peer certificates")
			}

			// Get the leaf certificate (server's cert)
			cert := cs.PeerCertificates[0]
			host := cs.ServerName
			currentFingerprint := calculateCertFingerprint(cert)

			// Check if we've seen this host before
			if storedFingerprint, exists := certStore.GetFingerprint(host); exists {
				// We've seen this host - verify fingerprint matches
				if storedFingerprint != currentFingerprint {
					// SECURITY ALERT: Certificate changed!
					logger.Printf("🚨 SECURITY ALERT: Certificate changed for %s", host)
					logger.Printf("   Stored fingerprint: %s", storedFingerprint)
					logger.Printf("   Current fingerprint: %s", currentFingerprint)
					logger.Printf("   This could indicate a Man-in-the-Middle attack!")

					// For now, we'll log but allow (to prevent breaking deployments)
					// In production, consider returning an error here
					// return fmt.Errorf("certificate fingerprint mismatch for %s", host)
				} else {
					logger.Printf("✓ Certificate validated for %s (fingerprint matches)", host)
				}
			} else {
				// First time seeing this host - store fingerprint
				logger.Printf("📌 Pinning certificate for new host: %s", host)
				logger.Printf("   Fingerprint: %s", currentFingerprint)
				certStore.SetFingerprint(host, currentFingerprint)
			}

			return nil
		},
	}

	// CRITICAL FIX: Create dialer that lets OS choose the best interface
	// This ensures we use the interface that can actually reach 192.168.x.x networks
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
		// Don't bind to specific interface - let OS routing table decide
	}

	// Create HTTP client for regular camera requests (30 second timeout)
	client = &http.Client{
		Transport: &http.Transport{
			DialContext:     dialer.DialContext,
			TLSClientConfig: tlsConfig,
		},
		Timeout: 30 * time.Second,
	}

	// Create separate HTTP client for uploads (3 minute timeout)
	// ACAP files can be several MB and cameras take time to process uploads
	uploadClient = &http.Client{
		Transport: &http.Transport{
			DialContext:     dialer.DialContext,
			TLSClientConfig: tlsConfig,
		},
		Timeout: 300 * time.Second, // 5 minutes for large file uploads (matches Electron installer)
	}
	logger.Printf("Initialized HTTP clients: regular (30s timeout), upload (300s timeout)")
}

// isOriginAllowed checks if the request origin is in the whitelist
func isOriginAllowed(origin string) bool {
	// Empty origin = same-origin or localhost direct access (allow for testing)
	if origin == "" {
		return true
	}

	// DEV MODE: Allow any chrome-extension:// origin for development
	// In production, you should whitelist specific extension IDs
	if strings.HasPrefix(origin, "chrome-extension://") {
		logger.Printf("Allowing chrome-extension origin: %s", origin)
		return true
	}

	return allowedOrigins[origin]
}

// setCORSHeaders sets appropriate CORS headers based on origin validation
func setCORSHeaders(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")

	// SECURITY: Validate origin against whitelist
	if !isOriginAllowed(origin) {
		logger.Printf("SECURITY: Blocked request from unauthorized origin: %s", origin)
		http.Error(w, "Forbidden: Origin not allowed", http.StatusForbidden)
		return false
	}

	// Set specific origin (not wildcard)
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	} else {
		// For direct localhost access (no origin header), allow localhost
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
	}

	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	return true
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
	http.HandleFunc("/upload-acap", handleUploadAcap)
	http.HandleFunc("/upload-license", handleUploadLicense)
	http.HandleFunc("/scan-network", handleScanNetwork)      // NEW: Bulk scan API
	http.HandleFunc("/scan-results", handleScanResults)      // NEW: WebSocket progress

	port := "9876"
	addr := "127.0.0.1:" + port

	logger.Printf("Starting proxy server on %s", addr)
	fmt.Printf("Camera Proxy Server listening on http://%s\n", addr)
	fmt.Println("This server bypasses Chrome's local network sandbox restrictions")
	fmt.Println("New: /scan-network endpoint for bulk scanning with WebSocket progress")

	if err := http.ListenAndServe(addr, nil); err != nil {
		logger.Fatalf("Server failed to start: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	// SECURITY: Validate origin (even for health checks)
	if !setCORSHeaders(w, r) {
		return // setCORSHeaders already sent error response
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleProxyRequest(w http.ResponseWriter, r *http.Request) {
	// SECURITY: Validate origin before processing request
	if !setCORSHeaders(w, r) {
		return // setCORSHeaders already sent error response
	}

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

	// SECURITY: Sanitize credentials in logs
	logger.Printf("Proxying request: %s %s (user: %s)", req.Method, req.URL, sanitizeCredential(req.Username))
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

	// SECURITY: Generate secure random client nonce
	cnonce := generateSecureNonce()
	nc := "00000001" // Nonce count - could be incremented for multiple requests

	var response string
	if challenge.Qop == "" {
		response = md5Hash(fmt.Sprintf("%s:%s:%s", ha1, challenge.Nonce, ha2))
	} else {
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

// handleUploadAcap handles ACAP file upload from GitHub to camera
func handleUploadAcap(w http.ResponseWriter, r *http.Request) {
	if !setCORSHeaders(w, r) {
		return
	}

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		URL      string `json:"url"`
		Username string `json:"username"`
		Password string `json:"password"`
		AcapURL  string `json:"acapUrl"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		logger.Printf("Failed to decode upload-acap request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	logger.Printf("ACAP upload started: %s -> camera", payload.AcapURL)

	// Download ACAP file from GitHub
	acapResp, err := http.Get(payload.AcapURL)
	if err != nil {
		logger.Printf("Failed to download ACAP: %v", err)
		http.Error(w, fmt.Sprintf("Failed to download ACAP: %v", err), http.StatusInternalServerError)
		return
	}
	defer acapResp.Body.Close()

	if acapResp.StatusCode != 200 {
		logger.Printf("GitHub returned error: %d", acapResp.StatusCode)
		http.Error(w, fmt.Sprintf("GitHub returned error: %d", acapResp.StatusCode), http.StatusInternalServerError)
		return
	}

	acapBytes, err := io.ReadAll(acapResp.Body)
	if err != nil {
		logger.Printf("Failed to read ACAP: %v", err)
		http.Error(w, fmt.Sprintf("Failed to read ACAP: %v", err), http.StatusInternalServerError)
		return
	}

	logger.Printf("ACAP downloaded (%.2f MB), uploading to camera...", float64(len(acapBytes))/1024/1024)

	// Create multipart form-data
	var buf bytes.Buffer
	boundary := "----WebKitFormBoundary7MA4YWxkTrZu0gW"

	buf.WriteString("--" + boundary + "\r\n")
	buf.WriteString("Content-Disposition: form-data; name=\"packfil\"; filename=\"BatonAnalytic.eap\"\r\n")
	buf.WriteString("Content-Type: application/octet-stream\r\n")
	buf.WriteString("\r\n")
	buf.Write(acapBytes)
	buf.WriteString("\r\n")
	buf.WriteString("--" + boundary + "--\r\n")

	// CRITICAL FIX: Store body bytes for reuse during authentication
	bodyBytes := buf.Bytes()

	// Upload to camera with Digest Auth
	httpReq, err := http.NewRequest("POST", payload.URL, bytes.NewReader(bodyBytes))
	if err != nil {
		logger.Printf("Failed to create upload request: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	httpReq.Header.Set("Content-Type", "multipart/form-data; boundary="+boundary)

	// Try Digest auth first (pass bodyBytes for reuse)
	// IMPORTANT: Use uploadClient (3 min timeout) instead of client (30s timeout)
	uploadResp, err := makeAuthenticatedRequestWithBodyAndClient(httpReq, payload.Username, payload.Password, bodyBytes, uploadClient)
	if err != nil {
		logger.Printf("Upload failed: %v", err)
		http.Error(w, fmt.Sprintf("Upload failed: %v", err), http.StatusInternalServerError)
		return
	}
	defer uploadResp.Body.Close()

	uploadBody, _ := io.ReadAll(uploadResp.Body)

	if uploadResp.StatusCode >= 400 {
		logger.Printf("Camera rejected upload (HTTP %d): %s", uploadResp.StatusCode, string(uploadBody))
		http.Error(w, string(uploadBody), uploadResp.StatusCode)
		return
	}

	logger.Printf("✅ ACAP upload successful")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  uploadResp.StatusCode,
		"message": "ACAP uploaded successfully",
	})
}

// handleUploadLicense handles license XML upload to camera
func handleUploadLicense(w http.ResponseWriter, r *http.Request) {
	if !setCORSHeaders(w, r) {
		return
	}

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		URL        string `json:"url"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		LicenseXML string `json:"licenseXML"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		logger.Printf("Failed to decode upload-license request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	logger.Printf("License upload started (%d bytes)", len(payload.LicenseXML))

	// Create multipart form-data with license XML
	// CRITICAL: Match EXACT format from Electron installer (cameraConfigurationService.ts lines 2424-2435)
	var buf bytes.Buffer
	// Generate random boundary like Electron does (not that it should matter, but let's match exactly)
	boundary := "----WebKitFormBoundary" + generateRandomBoundary()

	// CRITICAL: Match EXACT Electron format from cameraConfigurationService.ts
	// Array: ["--boundary", "Content-Disposition...", "Content-Type: text/xml", "", xmlContent, "--boundary--", ""]
	// .join("\r\n") produces: item0\r\nitem1\r\nitem2\r\nitem3\r\nitem4\r\nitem5\r\nitem6
	// Which means: --boundary\r\nContent-Disposition...\r\nContent-Type...\r\n\r\nxmlContent\r\n--boundary--\r\n
	buf.WriteString("--" + boundary + "\r\n")
	buf.WriteString("Content-Disposition: form-data; name=\"fileData\"; filename=\"license.xml\"\r\n")
	buf.WriteString("Content-Type: text/xml\r\n")
	buf.WriteString("\r\n") // Empty line after headers (this is the "" element)
	buf.WriteString(payload.LicenseXML)
	buf.WriteString("\r\n")                     // CRLF after content
	buf.WriteString("--" + boundary + "--\r\n") // Closing boundary + CRLF (last element "" adds no extra CRLF)

	// CRITICAL FIX: Store body bytes for reuse during authentication
	bodyBytes := buf.Bytes()

	// Upload to camera with Digest Auth
	httpReq, err := http.NewRequest("POST", payload.URL, bytes.NewReader(bodyBytes))
	if err != nil {
		logger.Printf("Failed to create upload request: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	httpReq.Header.Set("Content-Type", "multipart/form-data; boundary="+boundary)

	// Try Digest auth first (pass bodyBytes for reuse)
	// Use uploadClient for longer timeout (license upload can take time)
	uploadResp, err := makeAuthenticatedRequestWithBodyAndClient(httpReq, payload.Username, payload.Password, bodyBytes, uploadClient)
	if err != nil {
		logger.Printf("License upload failed: %v", err)
		http.Error(w, fmt.Sprintf("Upload failed: %v", err), http.StatusInternalServerError)
		return
	}
	defer uploadResp.Body.Close()

	uploadBody, _ := io.ReadAll(uploadResp.Body)

	// CRITICAL: Check for error codes in body even if HTTP 200
	bodyText := string(uploadBody)
	if strings.Contains(bodyText, "Error:") && !strings.Contains(bodyText, "Error: 0") && !strings.Contains(bodyText, "Error: 30") {
		logger.Printf("Camera returned error: %s", bodyText)
		http.Error(w, bodyText, http.StatusBadRequest)
		return
	}

	if uploadResp.StatusCode >= 400 {
		logger.Printf("Camera rejected license upload (HTTP %d): %s", uploadResp.StatusCode, string(uploadBody))
		http.Error(w, string(uploadBody), uploadResp.StatusCode)
		return
	}

	logger.Printf("✅ License upload successful")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  uploadResp.StatusCode,
		"message": "License uploaded successfully",
	})
}

// makeAuthenticatedRequest handles Digest auth for camera requests
func makeAuthenticatedRequest(req *http.Request, username, password string) (*http.Response, error) {
	// First request to get challenge
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 401 {
		return resp, nil // No auth needed or success
	}
	resp.Body.Close()

	// Parse Digest challenge
	authHeader := resp.Header.Get("WWW-Authenticate")
	challenge, err := parseDigestChallenge(authHeader)
	if err != nil {
		return nil, fmt.Errorf("failed to parse auth challenge: %w", err)
	}

	// Create new request with auth
	var bodyBytes []byte
	if req.Body != nil {
		bodyBytes, _ = io.ReadAll(req.Body)
	}

	req2, err := http.NewRequest(req.Method, req.URL.String(), bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	// Copy headers
	for k, v := range req.Header {
		req2.Header[k] = v
	}

	// Calculate and add Digest auth
	digestAuth := calculateDigestAuthFromChallenge(&ProxyRequest{
		URL:      req.URL.String(),
		Method:   req.Method,
		Username: username,
		Password: password,
	}, challenge)

	req2.Header.Set("Authorization", digestAuth)

	return client.Do(req2)
}

// makeAuthenticatedRequestWithBody handles Digest auth with pre-stored body bytes
// This avoids the body consumption bug when using bytes.Buffer
func makeAuthenticatedRequestWithBody(req *http.Request, username, password string, bodyBytes []byte) (*http.Response, error) {
	return makeAuthenticatedRequestWithBodyAndClient(req, username, password, bodyBytes, client)
}

// makeAuthenticatedRequestWithBodyAndClient handles Digest auth with custom HTTP client
// Allows using uploadClient for long-running uploads (3 min timeout)
func makeAuthenticatedRequestWithBodyAndClient(req *http.Request, username, password string, bodyBytes []byte, httpClient *http.Client) (*http.Response, error) {
	logger.Printf("Attempting authenticated request (body size: %d bytes)", len(bodyBytes))

	// First request to get challenge (send minimal request without body to save bandwidth)
	req1, err := http.NewRequest(req.Method, req.URL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create challenge request: %w", err)
	}

	resp, err := httpClient.Do(req1)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 401 {
		logger.Printf("No auth required, status: %d", resp.StatusCode)
		// Close this response and make the real request with body
		resp.Body.Close()

		req2, err := http.NewRequest(req.Method, req.URL.String(), bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, err
		}

		// Copy headers from original request
		for k, v := range req.Header {
			req2.Header[k] = v
		}

		return httpClient.Do(req2)
	}
	resp.Body.Close()

	logger.Println("Got 401, parsing auth challenge...")

	// Parse Digest challenge
	authHeader := resp.Header.Get("WWW-Authenticate")
	if authHeader == "" {
		return nil, fmt.Errorf("no WWW-Authenticate header in 401 response")
	}

	challenge, err := parseDigestChallenge(authHeader)
	if err != nil {
		return nil, fmt.Errorf("failed to parse auth challenge: %w", err)
	}

	logger.Printf("Parsed challenge: realm=%s, nonce=%s", challenge.Realm, challenge.Nonce[:10]+"...")

	// Create authenticated request with full body
	req2, err := http.NewRequest(req.Method, req.URL.String(), bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create authenticated request: %w", err)
	}

	// Copy headers from original request
	for k, v := range req.Header {
		req2.Header[k] = v
	}

	// Calculate and add Digest auth
	digestAuth := calculateDigestAuthFromChallenge(&ProxyRequest{
		URL:      req.URL.String(),
		Method:   req.Method,
		Username: username,
		Password: password,
	}, challenge)

	req2.Header.Set("Authorization", digestAuth)

	logger.Printf("Sending authenticated request with %d byte body...", len(bodyBytes))
	return httpClient.Do(req2)
}

// calculateDigestAuthFromChallenge calculates Digest auth header
func calculateDigestAuthFromChallenge(req *ProxyRequest, challenge *DigestChallenge) string {
	return calculateDigestAuth(req, challenge)
}
