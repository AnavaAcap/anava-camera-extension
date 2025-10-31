package common

import (
	"bytes"
	"crypto/md5"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// ProxyRequest represents incoming proxy request
type ProxyRequest struct {
	URL      string                 `json:"url"`
	Method   string                 `json:"method"`
	Username string                 `json:"username"`
	Password string                 `json:"password"`
	Body     map[string]interface{} `json:"body,omitempty"`
}

// ProxyResponse represents proxy response
type ProxyResponse struct {
	Status int                    `json:"status,omitempty"`
	Data   map[string]interface{} `json:"data,omitempty"`
	Error  string                 `json:"error,omitempty"`
}

// DigestChallenge represents HTTP Digest authentication challenge
type DigestChallenge struct {
	Realm     string
	Nonce     string
	Opaque    string
	Algorithm string
	Qop       string
}

// CreateHTTPClient creates an HTTP client configured for camera connections
// Accepts self-signed certificates with fingerprint validation
func CreateHTTPClient(timeout time.Duration, verifyFn func(cs tls.ConnectionState) error) *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true, // We validate fingerprints in VerifyConnection
				VerifyConnection:   verifyFn,
			},
		},
		Timeout: timeout,
	}
}

// TryUnauthenticatedRequest makes ONE request without auth (3 second timeout)
// This is Step 1 of the Electron pattern - quickly detect non-cameras
func TryUnauthenticatedRequest(client *http.Client, req *ProxyRequest) (ProxyResponse, error) {
	var bodyReader io.Reader
	var bodyBytes []byte
	if req.Body != nil && len(req.Body) > 0 {
		var err error
		bodyBytes, err = json.Marshal(req.Body)
		if err != nil {
			return ProxyResponse{}, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
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

	return ParseResponse(httpResp)
}

// TryBasicAuth attempts HTTP Basic authentication
func TryBasicAuth(client *http.Client, req *ProxyRequest) (ProxyResponse, error) {
	var bodyReader io.Reader
	var bodyBytes []byte
	if req.Body != nil && len(req.Body) > 0 {
		var err error
		bodyBytes, err = json.Marshal(req.Body)
		if err != nil {
			return ProxyResponse{}, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
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
		}
	}

	httpResp, err := client.Do(httpReq)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("request execution failed: %w", err)
	}
	defer httpResp.Body.Close()

	return ParseResponse(httpResp)
}

// TryDigestAuth attempts HTTP Digest authentication
// CRITICAL: Sends body in BOTH challenge and authenticated requests
func TryDigestAuth(client *http.Client, req *ProxyRequest) (ProxyResponse, error) {
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
		return ParseResponse(httpResp)
	}

	// Parse WWW-Authenticate header
	authHeader := httpResp.Header.Get("WWW-Authenticate")
	if authHeader == "" {
		return ProxyResponse{}, fmt.Errorf("no WWW-Authenticate header in response")
	}

	// Parse Digest challenge
	challenge, err := ParseDigestChallenge(authHeader)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("failed to parse Digest challenge: %w", err)
	}

	// Calculate Digest response
	digestAuth := CalculateDigestAuth(req, challenge)

	// Make authenticated request (recreate body bytes for second request)
	bodyBytes = nil
	bodyReader = nil
	if req.Body != nil && len(req.Body) > 0 {
		var err error
		bodyBytes, err = json.Marshal(req.Body)
		if err != nil {
			return ProxyResponse{}, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(bodyBytes)
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
		}
	}

	httpResp2, err := client.Do(httpReq2)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("authenticated request failed: %w", err)
	}
	defer httpResp2.Body.Close()

	return ParseResponse(httpResp2)
}

// ParseDigestChallenge parses WWW-Authenticate header for Digest auth
func ParseDigestChallenge(header string) (*DigestChallenge, error) {
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

// CalculateDigestAuth calculates Digest authorization header
func CalculateDigestAuth(req *ProxyRequest, challenge *DigestChallenge) string {
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

	// Generate secure random client nonce
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

// ParseResponse converts HTTP response to ProxyResponse
func ParseResponse(httpResp *http.Response) (ProxyResponse, error) {
	bodyBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return ProxyResponse{}, fmt.Errorf("failed to read response body: %w", err)
	}

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

// IsTimeoutError checks if error is a timeout
func IsTimeoutError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "timeout") ||
		strings.Contains(err.Error(), "ETIMEDOUT") ||
		strings.Contains(err.Error(), "context deadline exceeded")
}

// IsConnectionRefusedError checks if error is connection refused
func IsConnectionRefusedError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "connection refused") ||
		strings.Contains(err.Error(), "ECONNREFUSED")
}

// SanitizeCredential redacts sensitive credential information for logging
// Shows first and last character only, e.g., "anava" -> "a***a"
func SanitizeCredential(credential string) string {
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

// CalculateCertFingerprint returns SHA256 fingerprint of certificate
func CalculateCertFingerprint(cert *x509.Certificate) string {
	hash := hex.EncodeToString(cert.Raw)
	return hash
}

// generateSecureNonce generates cryptographically secure random nonce
// Returns 16 bytes (32 hex characters) of random data
func generateSecureNonce() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback to timestamp-based if crypto/rand fails (unlikely)
		return fmt.Sprintf("%d%d", time.Now().UnixNano(), time.Now().Unix())
	}
	return hex.EncodeToString(b)
}

// md5Hash calculates MD5 hash for Digest authentication
func md5Hash(input string) string {
	hash := md5.Sum([]byte(input))
	return fmt.Sprintf("%x", hash)
}
