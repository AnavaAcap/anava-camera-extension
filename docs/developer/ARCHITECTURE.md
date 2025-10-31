# Anava Local Connector - Architecture

Technical architecture documentation for developers.

## System Overview

The Anava Local Connector enables web applications to discover and communicate with local network cameras through a secure, sandboxed Chrome extension.

```
┌──────────────────────────────────────────────────────────┐
│              Web Application (terraform-spa)             │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Camera Discovery UI                                │ │
│  │  - Network range input                              │ │
│  │  - Credential management                            │ │
│  │  - Camera list display                              │ │
│  └────────────┬───────────────────────────────────────┘ │
└───────────────┼──────────────────────────────────────────┘
                │ window.postMessage()
                │ (PKCE OAuth 2.0)
                │
┌───────────────▼──────────────────────────────────────────┐
│          Chrome Extension (Content + Background)         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Content Script                                     │ │
│  │  - Auto-discovery (.well-known/spa-connector-config)│ │
│  │  - Message relay (web app ↔ background)            │ │
│  └────────────┬───────────────────────────────────────┘ │
│               │                                           │
│  ┌────────────▼───────────────────────────────────────┐ │
│  │  Background Script (Service Worker)                 │ │
│  │  - Version checking                                 │ │
│  │  - Native messaging client                          │ │
│  │  - Update management                                │ │
│  └────────────┬───────────────────────────────────────┘ │
└───────────────┼──────────────────────────────────────────┘
                │ Native Messaging Protocol
                │ (stdin/stdout, length-prefixed JSON)
                │
┌───────────────▼──────────────────────────────────────────┐
│        Native Connector Binary (Dual-Mode Go Binary)     │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Mode 1: Native Messaging Host                     │ │
│  │  (--native-messaging flag)                         │ │
│  │  - Launched by Chrome                              │ │
│  │  - Sandboxed (localhost-only network access)       │ │
│  │  - Reads/writes length-prefixed JSON               │ │
│  │  - Forwards requests to proxy service              │ │
│  └────────────┬───────────────────────────────────────┘ │
│               │ HTTP localhost:9876                      │
│  ┌────────────▼───────────────────────────────────────┐ │
│  │  Mode 2: Proxy Service                             │ │
│  │  (--proxy-service flag)                            │ │
│  │  - User-launched (LaunchAgent/systemd)             │ │
│  │  - Full network access                             │ │
│  │  - HTTP server on localhost:9876                   │ │
│  │  - Camera discovery engine                         │ │
│  │  - HTTP Digest/Basic authentication                │ │
│  │  - TLS with self-signed cert acceptance            │ │
│  └────────────┬───────────────────────────────────────┘ │
└───────────────┼──────────────────────────────────────────┘
                │ HTTPS (Digest Auth)
                │ Self-signed certs OK
                │
┌───────────────▼──────────────────────────────────────────┐
│         Local Network Cameras (Axis ACAP)                │
│         192.168.x.x:443 (HTTPS) or :80 (HTTP)            │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Chrome Extension

**Location**: `src/`, `popup.html`, `popup.js`, `background.js`

**Purpose**: Browser integration and UI for connector status.

**Architecture**:
- **Manifest V3** (modern Chrome extension format)
- **Content Script** (`src/content-script.ts`):
  - Injected into web pages matching `externally_connectable` whitelist
  - Auto-discovers `.well-known/spa-connector-config.json`
  - Relays messages between web app and background script
- **Background Script** (`background.js`):
  - Service worker (no persistent background page)
  - Native messaging client
  - Version checking and update management
- **Popup** (`popup.html/js`):
  - Status indicator (green/red/orange)
  - Update prompts
  - Links to installation/help

**Key APIs**:
- `chrome.runtime.sendNativeMessage()` - Communicate with native binary
- `chrome.runtime.onMessageExternal` - Receive messages from whitelisted web apps
- `chrome.storage.local` - Store configuration and state

**Security**:
- `externally_connectable` restricts which domains can message the extension
- Content Security Policy prevents XSS
- Native messaging requires signed binary (macOS/Windows)

---

### 2. Native Messaging Host

**Location**: `pkg/nativehost/`

**Purpose**: Bridge between Chrome (sandboxed) and proxy service (full network access).

**Why Needed**: Chrome's sandbox prevents native messaging hosts from accessing local network. This component forwards requests to the proxy service over localhost.

**Protocol**: Chrome Native Messaging Protocol
```
Message Format (both directions):
[4 bytes: uint32 message length, little-endian]
[N bytes: JSON message]
```

**Supported Message Types**:

| Type | Direction | Purpose | Response |
|------|-----------|---------|----------|
| `GET_VERSION` | Chrome → Native | Get binary version | `{version: "2.0.0"}` |
| `HEALTH_CHECK` | Chrome → Native | Check proxy status | `{status: "ok", proxyRunning: true}` |
| `CONFIGURE` | Chrome → Native | Update config | `{success: true}` |
| `CHECK_OLD_INSTALLATION` | Chrome → Native | Detect v1.x files | `{hasOldVersion: false, oldPaths: []}` |
| `SCAN_CAMERAS` | Chrome → Native | Discover cameras | `{cameras: [...]}` |

**Implementation**:
```go
func main() {
    // Read message from stdin (4-byte length + JSON)
    length := readUint32(os.Stdin)
    messageBytes := make([]byte, length)
    io.ReadFull(os.Stdin, messageBytes)
    
    var msg Message
    json.Unmarshal(messageBytes, &msg)
    
    // Process message
    response := handleMessage(msg)
    
    // Write response to stdout (4-byte length + JSON)
    responseBytes := json.Marshal(response)
    writeUint32(os.Stdout, uint32(len(responseBytes)))
    os.Stdout.Write(responseBytes)
}
```

**Limitations**:
- NO access to 192.168.x.x (Chrome sandbox restriction)
- CAN access localhost (127.0.0.1)
- CAN access public internet (for update checks)

---

### 3. Proxy Service

**Location**: `pkg/proxy/`

**Purpose**: Long-running service with full network access for camera discovery and communication.

**Why Separate**: User-launched processes (LaunchAgent/systemd) have full network access, unlike Chrome-launched processes.

**HTTP Server**:
```
Endpoint: http://localhost:9876

GET  /health                → {status: "ok"}
GET  /version               → {version: "2.0.0"}
POST /proxy                 → Forward request to camera
POST /scan                  → Discover cameras on network
```

**Camera Discovery Algorithm**:

```go
func DiscoverCameras(networkRange string, credentials Credentials) []Camera {
    // 1. Parse CIDR (e.g., "192.168.50.0/24" → 254 IPs)
    ipRange := parseCIDR(networkRange)
    
    // 2. Adaptive batch scanning
    batchSize := 30  // Start with 30 IPs concurrently
    
    for batch := range ipRange.Batches(batchSize) {
        // 3. For each IP in batch (parallel)
        for ip := range batch {
            // 4. Try HTTPS:443 first
            if isCamera := tryCamera(ip, 443, "https", credentials); isCamera {
                cameras = append(cameras, camera)
                continue
            }
            
            // 5. Try HTTP:80 if HTTPS failed
            if isCamera := tryCamera(ip, 80, "http", credentials); isCamera {
                cameras = append(cameras, camera)
            }
        }
        
        // 6. Adjust batch size based on performance
        batchSize = adjustBatchSize(errorRate, avgResponseTime)
    }
    
    return cameras
}

func tryCamera(ip string, port int, protocol string, creds Credentials) bool {
    // Step 1: Unauthenticated request (3s timeout)
    resp, err := http.Get(protocol + "://" + ip + "/axis-cgi/basicdeviceinfo.cgi")
    
    // Fail fast if timeout or connection refused
    if isTimeoutOrRefused(err) {
        return false
    }
    
    // Step 2: If 401, try authentication
    if resp.StatusCode == 401 {
        if protocol == "https" {
            // HTTPS: Try Basic first, then Digest
            if tryBasicAuth(ip, creds) { return true }
            if tryDigestAuth(ip, creds) { return true }
        } else {
            // HTTP: Try Digest first, then Basic
            if tryDigestAuth(ip, creds) { return true }
            if tryBasicAuth(ip, creds) { return true }
        }
    }
    
    // Step 3: Validate VAPIX endpoint and device type
    if resp.StatusCode == 200 {
        deviceInfo := parseDeviceInfo(resp.Body)
        return isAxisCamera(deviceInfo)
    }
    
    return false
}
```

**Performance Optimizations**:

1. **Adaptive Batch Sizing**:
   ```
   Start: 30 IPs/batch
   Adjust every 10 batches:
   - If error rate < 2% && avg time < 1000ms: +10 IPs (max 150)
   - If error rate > 5% || timeout: -10 IPs (min 10)
   ```

2. **Fast Failure**:
   - 3-second timeout on initial request
   - Immediate rejection if timeout or connection refused
   - No auth attempt if no response

3. **Protocol Ordering**:
   - HTTPS first (most cameras use HTTPS)
   - Basic auth before Digest on HTTPS (faster)
   - Digest before Basic on HTTP (more common)

4. **Device Type Filtering**:
   - Parse `ProdNbr` field (e.g., "M3215-LVE")
   - First letter: M/P/Q = camera ✓, C = speaker ✗, I = intercom ✗

**Authentication**: HTTP Digest/Basic Auth

**Implementation** (`pkg/common/auth.go`):
```go
func DigestAuth(url, username, password string, body []byte) (*http.Response, error) {
    // Step 1: Send unauthenticated request to get challenge
    req1, _ := http.NewRequest("POST", url, bytes.NewReader(body))
    resp1, _ := client.Do(req1)
    
    if resp1.StatusCode != 401 {
        return resp1, nil
    }
    
    // Step 2: Parse WWW-Authenticate header
    authHeader := resp1.Header.Get("WWW-Authenticate")
    challenge := parseDigestChallenge(authHeader)
    
    // Step 3: Calculate response hash
    ha1 := md5(username + ":" + challenge.realm + ":" + password)
    ha2 := md5("POST:" + url)
    response := md5(ha1 + ":" + challenge.nonce + ":" + ha2)
    
    // Step 4: Send authenticated request WITH BODY
    req2, _ := http.NewRequest("POST", url, bytes.NewReader(body))
    req2.Header.Set("Authorization", 
        "Digest username=\"" + username + "\", " +
        "realm=\"" + challenge.realm + "\", " +
        "nonce=\"" + challenge.nonce + "\", " +
        "uri=\"" + url + "\", " +
        "response=\"" + response + "\"")
    
    return client.Do(req2)
}
```

**CRITICAL**: The body must be included in BOTH requests (challenge and authenticated). Missing body in step 4 causes "JSON syntax error" from camera.

**TLS/Self-Signed Certificates**:
```go
client := &http.Client{
    Transport: &http.Transport{
        TLSClientConfig: &tls.Config{
            InsecureSkipVerify: true,  // Accept self-signed certs
        },
    },
}
```

---

### 4. Common Utilities

**Location**: `pkg/common/`

**Modules**:

**auth.go** - Authentication
- `DigestAuth()` - HTTP Digest authentication
- `BasicAuth()` - HTTP Basic authentication
- `parseDigestChallenge()` - Parse WWW-Authenticate header

**config.go** - Configuration
- `LoadConfig()` - Read config file
- `SaveConfig()` - Write config file
- Default location: `~/.anava/local-connector.json`

**lockfile.go** - Single Instance
- `AcquireLock()` - Create lock file
- `ReleaseLock()` - Delete lock file
- Prevents multiple proxy service instances

**logging.go** - Structured Logging
- `NewLogger()` - Create logger with level
- Levels: DEBUG, INFO, WARN, ERROR
- Format: `[2025-01-30T10:15:30Z] [INFO] [component] message`

---

## Data Flows

### Flow 1: Camera Discovery

```
1. User enters network range in web app (e.g., 192.168.50.0/24)
   └─> Web app sends to extension via postMessage

2. Extension content script receives message
   └─> Forwards to background script via chrome.runtime.sendMessage

3. Background script sends to native host via chrome.runtime.sendNativeMessage
   Message: {
     type: "SCAN_CAMERAS",
     networkRange: "192.168.50.0/24",
     credentials: {username: "anava", password: "baton"}
   }

4. Native host forwards to proxy service via HTTP POST
   POST http://localhost:9876/scan
   Body: {networkRange: "...", credentials: {...}}

5. Proxy service scans network
   ├─> Calculate IP range (254 IPs for /24)
   ├─> Batch scan (30 IPs at a time)
   ├─> For each IP:
   │   ├─> Try HTTPS:443 with authentication
   │   └─> If fail, try HTTP:80
   └─> Return discovered cameras

6. Proxy service responds to native host
   Response: {cameras: [{ip: "192.168.50.156", model: "M3215-LVE", ...}, ...]}

7. Native host forwards to extension
   Response: {cameras: [...]}

8. Extension forwards to web app
   postMessage({type: "CAMERAS_DISCOVERED", cameras: [...]})

9. Web app displays camera list
```

**Timing**: Typically 30-60 seconds for /24 network with Aggressive intensity.

### Flow 2: Version Checking

```
1. Extension starts (user opens Chrome)
   └─> Background script wakes up

2. Background script sends GET_VERSION to native host
   Message: {type: "GET_VERSION"}

3. Native host responds
   Response: {version: "2.0.0"}

4. Background script compares versions
   Extension version: "2.0.0" (from manifest.json)
   Native version: "2.0.0" (from response)
   
   If mismatch:
   ├─> Show orange "!" badge
   ├─> Update popup to show "Update Required"
   └─> Link to download page

5. User clicks "Update Now"
   └─> Opens GitHub releases page
   └─> User downloads and installs new version

6. After installation, extension rechecks version
   └─> Badge clears if versions match
```

### Flow 3: Nonce-Based Authentication (Future)

```
1. User clicks "Connect" in web app
   └─> Backend generates 32-byte random nonce
   └─> Stores nonce in Redis (60s TTL)
   └─> Returns nonce to frontend

2. Frontend sends nonce to extension
   postMessage({type: "AUTHENTICATE", nonce: "abc123..."})

3. Extension forwards to native host
   Message: {type: "AUTHENTICATE", nonce: "abc123..."}

4. Native host calls backend API
   POST https://api.example.com/extension/authenticate
   Headers: {X-Extension-Nonce: "abc123..."}

5. Backend validates nonce
   ├─> Check if exists in Redis
   ├─> Delete nonce (single-use)
   └─> Generate session token
   └─> Return token

6. Native host stores token
   └─> Future requests include token in header

7. Backend associates token with user session
   └─> Cameras discovered are linked to user's account
```

---

## Security Model

### Threat Model

**Threats Mitigated**:
1. ✅ Malicious website accessing local network
   - **Mitigation**: `externally_connectable` whitelist
2. ✅ Unauthorized extension access
   - **Mitigation**: PKCE OAuth 2.0 authentication
3. ✅ Man-in-the-middle attacks
   - **Mitigation**: TLS between web app and backend, camera comms over HTTPS
4. ✅ Replay attacks
   - **Mitigation**: Single-use authorization codes
5. ✅ Authorization code interception
   - **Mitigation**: PKCE code verifier (RFC 7636)

**Threats NOT Mitigated**:
1. ❌ Malicious extension installed by user
   - **Out of scope**: User controls extension installation
2. ❌ Compromised camera credentials
   - **Responsibility**: User must secure credentials
3. ❌ Local malware on user's machine
   - **Out of scope**: OS-level security issue

### Extension Permissions

```json
{
  "permissions": [
    "storage",           // Store config and state
    "nativeMessaging"    // Communicate with native binary
  ],
  "host_permissions": [
    "http://localhost/*",   // Future: backend API calls
    "https://*.anava.cloud/*"
  ]
}
```

**Minimal Permissions**: No access to browsing history, tabs, or cookies.

### Native Messaging Security

**macOS**: Binary must be signed with Apple Developer ID
```bash
codesign --sign "Developer ID Application: Company Name" local-connector
```

**Windows**: Binary must be signed with code signing certificate
```powershell
signtool sign /f certificate.pfx /p password local-connector.exe
```

**Chrome Verification**: Chrome validates binary signature before launching.

### PKCE OAuth 2.0 Security (RFC 7636)

**Protocol Flow**:
```
Extension generates:
  code_verifier (128 chars random)
  code_challenge = BASE64URL(SHA256(code_verifier))

Authorization Request:
  → Send code_challenge to backend
  ← Receive authorization code

Token Exchange:
  → Send authorization code + code_verifier
  ← Backend validates: SHA256(code_verifier) == code_challenge
  ← Receive access token
```

**Properties**:
- **Entropy**: 128 characters (768 bits) random
- **Single-Use**: Authorization code deleted after first use
- **One-Way Hash**: SHA-256 prevents code_verifier reverse engineering
- **No Shared Secrets**: code_verifier never leaves extension
- **Standard Protocol**: OAuth 2.0 extension (RFC 7636)

**Attack Resistance**:
- **Authorization Code Interception**: ✅ Attacker can't use code without verifier
- **Replay Attack**: ✅ Code is single-use
- **MITM Attack**: ✅ One-way hash prevents verifier extraction
- **Brute Force**: ✅ 2^768 possibilities (infeasible)
- **Client Impersonation**: ✅ Verifier required for token exchange

**See**: `PKCE_MIGRATION.md` for complete implementation details

---

## Build & Deployment

### Development Build

```bash
# Build extension
npm run build

# Build native binary
GOOS=darwin GOARCH=arm64 go build -o build/local-connector-arm64 cmd/local-connector/main.go
GOOS=darwin GOARCH=amd64 go build -o build/local-connector-amd64 cmd/local-connector/main.go
lipo -create build/local-connector-{arm64,amd64} -output build/local-connector
```

### Release Build (CI/CD)

**Triggered by**: Git tag (e.g., `v2.0.0`)

**Workflow**: `.github/workflows/release.yml`

```yaml
1. Build extension
   - npm ci
   - npm run build
   - Zip dist/ + manifest.json → extension.zip

2. Build native binaries (matrix build)
   - macOS: ARM64, AMD64 → Universal binary
   - Windows: AMD64
   - Linux: AMD64

3. Create platform installers
   - macOS: .pkg (pkgbuild + productbuild)
   - Windows: .msi (WiX Toolset)
   - Linux: .deb, .rpm

4. Sign installers (if secrets present)
   - macOS: productsign + notarize
   - Windows: signtool

5. Create GitHub Release
   - Upload all artifacts
   - Generate release notes
```

### Versioning

**Format**: `MAJOR.MINOR.PATCH` (Semantic Versioning)

**Files to Update**:
- `manifest.json` → `version`
- `pkg/version/version.go` → `const VERSION`
- `package.json` → `version`

**Version Compatibility**:
- Extension and native binary MUST have same version
- Mismatch shows "Update Required"

---

## Performance

### Camera Discovery Performance

| Network Size | Intensity | Expected Time | IPs/Second |
|--------------|-----------|---------------|------------|
| /28 (14 IPs) | Any | 5-15s | ~1-3 |
| /26 (62 IPs) | Conservative | 1-2 min | ~0.5-1 |
| /26 (62 IPs) | Aggressive | 20-30s | ~2-3 |
| /24 (254 IPs) | Conservative | 3-5 min | ~0.8-1.4 |
| /24 (254 IPs) | Balanced | 1-2 min | ~2-4 |
| /24 (254 IPs) | Aggressive | 30-60s | ~4-8 |

**Factors**:
- Network latency
- Camera response time
- Authentication complexity
- Number of non-camera IPs

### Resource Usage

**Normal Operation**:
- CPU: <5%
- Memory: ~20 MB (native host) + ~50 MB (proxy service)
- Disk: ~10 MB (binary) + <1 MB logs/day

**During Scan**:
- CPU: 10-30%
- Memory: ~50 MB (native host) + ~100 MB (proxy service)
- Network: ~100 KB/s outbound

### Optimization Strategies

1. **Adaptive Batch Sizing**: Automatically adjusts concurrency
2. **Fast Failure**: 3s timeout, immediate rejection
3. **Protocol Ordering**: Try most common first
4. **Device Filtering**: Early rejection of non-cameras
5. **Connection Pooling**: Reuse HTTP connections

---

## Testing

### Unit Tests

**Location**: `tests/unit/`

**Run**: `cd tests && npm test`

**Coverage**: Version comparison, config validation, utilities

### Integration Tests

**Location**: `tests/integration/`

**Run**: `cd tests && npm run test:integration`

**Coverage**: Native messaging protocol, camera discovery (mock)

### Manual Testing

**Checklist**: `docs/testing/MANUAL_TEST_PLAN.md`

---

## Troubleshooting

See [TROUBLESHOOTING.md](../user/TROUBLESHOOTING.md) for user-facing issues.

### Developer Issues

**Extension not reloading**:
```
Go to chrome://extensions/
Click reload icon on Anava Local Connector
```

**Native host not connecting**:
```bash
# Test manually
echo '{"type":"GET_VERSION"}' | ./build/local-connector --native-messaging

# Should output: [4 bytes][{"version":"2.0.0"}]
```

**Proxy service not starting**:
```bash
# Check if port 9876 is in use
lsof -i :9876

# Run proxy manually
./build/local-connector --proxy-service --log-level debug
```

---

## Contributing

### Development Setup

```bash
# Clone repository
git clone https://github.com/AnavaAcap/anava-camera-extension.git
cd anava-camera-extension

# Install dependencies
npm install
cd tests && npm install && cd ..

# Build extension
npm run build

# Build binary
go build -o build/local-connector cmd/local-connector/main.go
```

### Code Style

**TypeScript**: ESLint + Prettier
```bash
npm run lint
npm run format
```

**Go**: gofmt + golint
```bash
go fmt ./...
golint ./...
```

### Pull Request Process

1. Create feature branch
2. Write tests
3. Ensure all tests pass
4. Update documentation
5. Submit PR with description

---

## References

- [Chrome Native Messaging](https://developer.chrome.com/docs/apps/nativeMessaging/)
- [Axis VAPIX API](https://www.axis.com/vapix-library/)
- [HTTP Digest Authentication (RFC 2617)](https://www.ietf.org/rfc/rfc2617.txt)
- [Semantic Versioning](https://semver.org/)

---

## Contact

- **Issues**: https://github.com/AnavaAcap/anava-camera-extension/issues
- **Email**: dev@anava.cloud
- **Documentation**: https://docs.anava.cloud
