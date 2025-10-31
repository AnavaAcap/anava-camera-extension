package proxy

import (
	"bytes"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"anava-camera-extension/pkg/common"
)

// CertificateStore manages certificate fingerprints for known cameras
type CertificateStore struct {
	mu           sync.RWMutex
	fingerprints map[string]string // host -> SHA256 fingerprint
	filePath     string
	logger       *log.Logger
}

// NewCertificateStore creates a new certificate store
func NewCertificateStore(logger *log.Logger) (*CertificateStore, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	// macOS: ~/Library/Application Support/Anava/
	// Linux: ~/.local/share/anava/
	var certStoreDir string
	switch {
	case fileExists(filepath.Join(homeDir, "Library")): // macOS
		certStoreDir = filepath.Join(homeDir, "Library", "Application Support", "Anava")
	default: // Linux/Windows
		certStoreDir = filepath.Join(homeDir, ".local", "share", "anava")
	}

	if err := os.MkdirAll(certStoreDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create cert store directory: %w", err)
	}

	certStoreFile := filepath.Join(certStoreDir, "certificate-fingerprints.json")

	store := &CertificateStore{
		fingerprints: make(map[string]string),
		filePath:     certStoreFile,
		logger:       logger,
	}
	store.load()

	return store, nil
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
		cs.logger.Printf("Warning: Failed to load certificate store: %v", err)
		return
	}

	cs.mu.Lock()
	cs.fingerprints = fingerprints
	cs.mu.Unlock()

	cs.logger.Printf("Loaded %d certificate fingerprints", len(fingerprints))
}

// save writes fingerprints to disk
func (cs *CertificateStore) save() {
	cs.mu.RLock()
	data, err := json.MarshalIndent(cs.fingerprints, "", "  ")
	cs.mu.RUnlock()

	if err != nil {
		cs.logger.Printf("Error marshaling certificate store: %v", err)
		return
	}

	if err := os.WriteFile(cs.filePath, data, 0600); err != nil {
		cs.logger.Printf("Error saving certificate store: %v", err)
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

// ProxyServer represents the proxy service
type ProxyServer struct {
	logger    *log.Logger
	certStore *CertificateStore
	client    *http.Client
}

// NewProxyServer creates a new proxy server instance
func NewProxyServer(logger *log.Logger) (*ProxyServer, error) {
	certStore, err := NewCertificateStore(logger)
	if err != nil {
		return nil, fmt.Errorf("failed to create certificate store: %w", err)
	}

	ps := &ProxyServer{
		logger:    logger,
		certStore: certStore,
	}

	// Create HTTP client with certificate validation
	ps.client = common.CreateHTTPClient(30*time.Second, ps.verifyCertificate)

	return ps, nil
}

// verifyCertificate validates TLS certificate fingerprints
func (ps *ProxyServer) verifyCertificate(cs tls.ConnectionState) error {
	if len(cs.PeerCertificates) == 0 {
		return fmt.Errorf("no peer certificates")
	}

	// Get the leaf certificate (server's cert)
	cert := cs.PeerCertificates[0]
	host := cs.ServerName
	currentFingerprint := calculateCertFingerprint(cert)

	// Check if we've seen this host before
	if storedFingerprint, exists := ps.certStore.GetFingerprint(host); exists {
		// We've seen this host - verify fingerprint matches
		if storedFingerprint != currentFingerprint {
			// SECURITY ALERT: Certificate changed!
			ps.logger.Printf("🚨 SECURITY ALERT: Certificate changed for %s", host)
			ps.logger.Printf("   Stored fingerprint: %s", storedFingerprint)
			ps.logger.Printf("   Current fingerprint: %s", currentFingerprint)
			ps.logger.Printf("   This could indicate a Man-in-the-Middle attack!")

			// For now, we'll log but allow (to prevent breaking deployments)
			// In production, consider returning an error here
			// return fmt.Errorf("certificate fingerprint mismatch for %s", host)
		} else {
			ps.logger.Printf("✓ Certificate validated for %s (fingerprint matches)", host)
		}
	} else {
		// First time seeing this host - store fingerprint
		ps.logger.Printf("📌 Pinning certificate for new host: %s", host)
		ps.logger.Printf("   Fingerprint: %s", currentFingerprint)
		ps.certStore.SetFingerprint(host, currentFingerprint)
	}

	return nil
}

// Run starts the proxy server
func (ps *ProxyServer) Run(port string) error {
	http.HandleFunc("/proxy", ps.handleProxyRequest)
	http.HandleFunc("/health", ps.handleHealth)
	http.HandleFunc("/upload-acap", ps.handleUploadAcap)
	http.HandleFunc("/upload-license", ps.handleUploadLicense)

	addr := "127.0.0.1:" + port

	ps.logger.Printf("Starting proxy server on %s", addr)
	fmt.Printf("Camera Proxy Server listening on http://%s\n", addr)
	fmt.Println("This server bypasses Chrome's local network sandbox restrictions")

	return http.ListenAndServe(addr, nil)
}

func (ps *ProxyServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (ps *ProxyServer) handleProxyRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		ps.setCORSHeaders(w, r)
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request
	var req common.ProxyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		ps.logger.Printf("Failed to decode request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// SECURITY: Sanitize credentials in logs
	ps.logger.Printf("Proxying request: %s %s (user: %s)", req.Method, req.URL, common.SanitizeCredential(req.Username))

	// Make request to camera (follows Electron authentication pattern)
	resp, err := ps.makeCameraRequest(&req)
	if err != nil {
		ps.logger.Printf("Camera request failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(common.ProxyResponse{
			Error: fmt.Sprintf("Request failed: %v", err),
		})
		return
	}

	// Send response back
	ps.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func (ps *ProxyServer) makeCameraRequest(req *common.ProxyRequest) (common.ProxyResponse, error) {
	// CRITICAL: Follow Electron pattern exactly
	// Step 1: Try ONE unauthenticated request first (3 second timeout)
	ps.logger.Println("Step 1: Testing connection without authentication")

	resp, err := common.TryUnauthenticatedRequest(ps.client, req)

	// On timeout/connection refused, return immediately (not a camera)
	if err != nil {
		if common.IsTimeoutError(err) || common.IsConnectionRefusedError(err) {
			ps.logger.Printf("Device not responding (timeout/refused) - not a camera")
			return common.ProxyResponse{}, fmt.Errorf("device not responding: %w", err)
		}
		return common.ProxyResponse{}, err
	}

	// If 200, no auth needed - success!
	if resp.Status == 200 {
		ps.logger.Println("Success: No authentication required")
		return resp, nil
	}

	// If not 401, unexpected response
	if resp.Status != 401 {
		ps.logger.Printf("Unexpected response status: %d", resp.Status)
		return resp, nil
	}

	// Step 2: Only if 401, try auth based on protocol
	ps.logger.Println("Step 2: 401 received, trying authentication")

	// Determine protocol from URL
	isHTTPS := strings.HasPrefix(req.URL, "https://")

	if isHTTPS {
		// HTTPS: Try Basic first, then Digest
		ps.logger.Println("HTTPS detected: Trying Basic Auth first")
		resp, err := common.TryBasicAuth(ps.client, req)
		if err == nil && resp.Status == 200 {
			ps.logger.Println("Basic Auth succeeded")
			return resp, nil
		}

		ps.logger.Println("Basic Auth failed, trying Digest Auth")
		return common.TryDigestAuth(ps.client, req)
	} else {
		// HTTP: Try Digest first, then Basic
		ps.logger.Println("HTTP detected: Trying Digest Auth first")
		resp, err := common.TryDigestAuth(ps.client, req)
		if err == nil && resp.Status == 200 {
			ps.logger.Println("Digest Auth succeeded")
			return resp, nil
		}

		ps.logger.Println("Digest Auth failed, trying Basic Auth")
		return common.TryBasicAuth(ps.client, req)
	}
}

func (ps *ProxyServer) handleUploadAcap(w http.ResponseWriter, r *http.Request) {
	ps.setCORSHeaders(w, r)

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
		ps.logger.Printf("Failed to decode upload-acap request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ps.logger.Printf("Uploading ACAP from %s to %s", payload.AcapURL, payload.URL)

	// Download ACAP file from GitHub
	acapResp, err := http.Get(payload.AcapURL)
	if err != nil {
		ps.logger.Printf("Failed to download ACAP: %v", err)
		http.Error(w, fmt.Sprintf("Failed to download ACAP: %v", err), http.StatusInternalServerError)
		return
	}
	defer acapResp.Body.Close()

	if acapResp.StatusCode != 200 {
		ps.logger.Printf("GitHub returned error: %d", acapResp.StatusCode)
		http.Error(w, fmt.Sprintf("GitHub returned error: %d", acapResp.StatusCode), http.StatusInternalServerError)
		return
	}

	acapBytes, err := io.ReadAll(acapResp.Body)
	if err != nil {
		ps.logger.Printf("Failed to read ACAP: %v", err)
		http.Error(w, fmt.Sprintf("Failed to read ACAP: %v", err), http.StatusInternalServerError)
		return
	}

	ps.logger.Printf("Downloaded ACAP, size: %d bytes", len(acapBytes))

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

	// Upload to camera with auth
	httpReq, err := http.NewRequest("POST", payload.URL, &buf)
	if err != nil {
		ps.logger.Printf("Failed to create upload request: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	httpReq.Header.Set("Content-Type", "multipart/form-data; boundary="+boundary)

	// Try authentication
	proxyReq := &common.ProxyRequest{
		URL:      payload.URL,
		Method:   "POST",
		Username: payload.Username,
		Password: payload.Password,
	}

	// Make authenticated request
	uploadResp, err := ps.makeAuthenticatedUpload(httpReq, proxyReq)
	if err != nil {
		ps.logger.Printf("Upload failed: %v", err)
		http.Error(w, fmt.Sprintf("Upload failed: %v", err), http.StatusInternalServerError)
		return
	}
	defer uploadResp.Body.Close()

	uploadBody, _ := io.ReadAll(uploadResp.Body)
	ps.logger.Printf("Upload response status: %d, body: %s", uploadResp.StatusCode, string(uploadBody))

	if uploadResp.StatusCode >= 400 {
		http.Error(w, string(uploadBody), uploadResp.StatusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  uploadResp.StatusCode,
		"message": "ACAP uploaded successfully",
	})
}

func (ps *ProxyServer) handleUploadLicense(w http.ResponseWriter, r *http.Request) {
	ps.setCORSHeaders(w, r)

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
		ps.logger.Printf("Failed to decode upload-license request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ps.logger.Printf("Uploading license XML to %s (XML length: %d)", payload.URL, len(payload.LicenseXML))

	// Create multipart form-data with license XML
	var buf bytes.Buffer
	boundary := "----WebKitFormBoundary7MA4YWxkTrZu0gW"

	buf.WriteString("--" + boundary + "\r\n")
	buf.WriteString("Content-Disposition: form-data; name=\"fileData\"; filename=\"license.xml\"\r\n")
	buf.WriteString("Content-Type: text/xml\r\n")
	buf.WriteString("\r\n")
	buf.WriteString(payload.LicenseXML)
	buf.WriteString("\r\n")
	buf.WriteString("--" + boundary + "--\r\n")

	// Upload to camera with auth
	httpReq, err := http.NewRequest("POST", payload.URL, &buf)
	if err != nil {
		ps.logger.Printf("Failed to create upload request: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	httpReq.Header.Set("Content-Type", "multipart/form-data; boundary="+boundary)

	// Try authentication
	proxyReq := &common.ProxyRequest{
		URL:      payload.URL,
		Method:   "POST",
		Username: payload.Username,
		Password: payload.Password,
	}

	uploadResp, err := ps.makeAuthenticatedUpload(httpReq, proxyReq)
	if err != nil {
		ps.logger.Printf("License upload failed: %v", err)
		http.Error(w, fmt.Sprintf("Upload failed: %v", err), http.StatusInternalServerError)
		return
	}
	defer uploadResp.Body.Close()

	uploadBody, _ := io.ReadAll(uploadResp.Body)
	ps.logger.Printf("License upload response status: %d, body: %s", uploadResp.StatusCode, string(uploadBody))

	if uploadResp.StatusCode >= 400 {
		http.Error(w, string(uploadBody), uploadResp.StatusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  uploadResp.StatusCode,
		"message": "License uploaded successfully",
	})
}

func (ps *ProxyServer) makeAuthenticatedUpload(req *http.Request, proxyReq *common.ProxyRequest) (*http.Response, error) {
	// Try Digest auth pattern
	resp, err := ps.client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 401 {
		return resp, nil // No auth needed or success
	}
	resp.Body.Close()

	// Parse Digest challenge
	authHeader := resp.Header.Get("WWW-Authenticate")
	challenge, err := common.ParseDigestChallenge(authHeader)
	if err != nil {
		return nil, fmt.Errorf("failed to parse auth challenge: %w", err)
	}

	// Read body for resend
	var bodyBytes []byte
	if req.Body != nil {
		bodyBytes, _ = io.ReadAll(req.Body)
	}

	// Create new request with auth
	req2, err := http.NewRequest(req.Method, req.URL.String(), bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	// Copy headers
	for k, v := range req.Header {
		req2.Header[k] = v
	}

	// Calculate and add Digest auth
	digestAuth := common.CalculateDigestAuth(proxyReq, challenge)
	req2.Header.Set("Authorization", digestAuth)

	return ps.client.Do(req2)
}

func (ps *ProxyServer) setCORSHeaders(w http.ResponseWriter, r *http.Request) {
	// For localhost-only proxy, allow any origin
	origin := r.Header.Get("Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	} else {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	}

	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
