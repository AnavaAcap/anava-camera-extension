# Chrome Extension Marketplace Implementation Plan

**Version**: 2.0 (Marketplace-Ready)
**Status**: Ready for Implementation
**AI Collaboration**: Gemini Deep Analysis + Requirements Planning

---

## Executive Summary

Transform the Anava Chrome extension from a developer tool requiring terminal commands into a professional, one-click installable Chrome Web Store product that works with ANY terraform-spa project.

**Key Deliverables**:
1. Unified native binary (replaces separate native-host + proxy-server)
2. Cross-platform signed installers (macOS .pkg, Windows .msi, Linux .deb/.rpm)
3. Extension-driven update mechanism (zero user friction)
4. terraform-spa integration (generic, not Anava-specific)
5. Backward compatibility migration path

**Timeline**: 4-6 weeks for full implementation

---

## Architecture Overview

### Current State (v1.x - Developer Tool)
```
Chrome Extension (manual load)
  ↓ Native Messaging
Native Host (install-proxy.sh)
  ↓ HTTP localhost:9876
Proxy Server (install-proxy.sh)
  ↓ HTTPS + Digest Auth
Camera (192.168.x.x)
```

### Target State (v2.0 - Marketplace Product)
```
Chrome Extension (Chrome Web Store)
  ↓ externally_connectable
Web App (terraform-spa)
  ↓ Nonce-based handshake
Chrome Extension
  ↓ Native Messaging
Unified Local Connector (signed installer)
  ↓ HTTPS + Digest Auth
Camera (192.168.x.x)
```

---

## Phase 1: Unified Binary Architecture

### 1.1 Merge Native Host + Proxy Server

**Current**:
- `native-host-proxy/main.go` - Chrome-launched, forwards to proxy
- `proxy-server/main.go` - User-launched, has network access

**Target**:
- Single binary: `local-connector` with dual-mode operation

**Implementation**:

```go
// cmd/local-connector/main.go
package main

import (
    "flag"
    "log"
    "os"
)

const VERSION = "2.0.0"

func main() {
    var (
        nativeMode = flag.Bool("native-messaging", false, "Run as Chrome Native Messaging host")
        proxyMode  = flag.Bool("proxy-service", false, "Run as background proxy service")
        version    = flag.Bool("version", false, "Print version and exit")
    )
    flag.Parse()

    if *version {
        log.Printf("Local Connector v%s\n", VERSION)
        os.Exit(0)
    }

    if *nativeMode {
        // Start native messaging host (stdin/stdout JSON protocol)
        runNativeMessagingHost()
    } else if *proxyMode {
        // Start long-running proxy service
        runProxyService()
    } else {
        log.Fatal("Must specify either --native-messaging or --proxy-service")
    }
}
```

**Tasks**:
- [ ] Create new project structure: `cmd/local-connector/`
- [ ] Implement dual-mode entry point with command-line flags
- [ ] Port native messaging logic from `native-host-proxy/main.go`
- [ ] Port proxy service logic from `proxy-server/main.go`
- [ ] Add version command for handshake protocol
- [ ] Implement lock file mechanism to prevent multiple proxy service instances
- [ ] Add logging to separate files (native-messaging.log, proxy-service.log)

**Acceptance Criteria**:
- Single binary can run in both modes
- Native messaging mode reads/writes JSON over stdin/stdout
- Proxy service mode listens on localhost:9876
- Only one proxy service instance can run at a time
- Version handshake works correctly

---

## Phase 2: Extension-Driven Update Mechanism

### 2.1 Version Handshake Protocol

**Flow**:
1. Extension starts → sends `GET_VERSION` to native host
2. Native host responds with `{"version": "2.0.0"}`
3. Extension compares with required version in manifest
4. If mismatch → redirect to installation page

**Implementation**:

```javascript
// background.js
const REQUIRED_NATIVE_VERSION = "2.0.0";
const NATIVE_HOST_ID = "com.anava.local_connector";

chrome.runtime.onStartup.addListener(checkNativeVersion);
chrome.runtime.onInstalled.addListener(checkNativeVersion);

async function checkNativeVersion() {
  try {
    const response = await sendNativeMessage({ type: "GET_VERSION" });

    if (!response || response.version !== REQUIRED_NATIVE_VERSION) {
      // Version mismatch or not installed
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });

      // Open installation page
      chrome.tabs.create({
        url: `https://connect.anava.cloud/install?reason=update_required&current=${response?.version || 'none'}`
      });
    } else {
      // All good
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setIcon({ path: "icons/connected-128.png" });
    }
  } catch (error) {
    console.error("[VersionCheck] Failed:", error);
    showNotInstalledState();
  }
}

function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_ID, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}
```

```go
// In native messaging host handler
func handleMessage(msg map[string]interface{}) map[string]interface{} {
    msgType, ok := msg["type"].(string)
    if !ok {
        return errorResponse("Invalid message format")
    }

    switch msgType {
    case "GET_VERSION":
        return map[string]interface{}{
            "version": VERSION, // "2.0.0"
        }
    case "HEALTH_CHECK":
        return map[string]interface{}{
            "status": "ok",
            "proxyRunning": isProxyServiceRunning(),
        }
    // ... other message types
    default:
        return errorResponse("Unknown message type")
    }
}
```

**Tasks**:
- [ ] Add version constant to unified binary
- [ ] Implement GET_VERSION message handler
- [ ] Add version check to extension startup
- [ ] Create installation page redirect logic
- [ ] Add badge indicator for update status
- [ ] Store last successful version check in chrome.storage

**Acceptance Criteria**:
- Extension detects missing native host on startup
- Extension detects version mismatch
- User redirected to installation page with reason parameter
- Badge shows update status visually

---

## Phase 3: Cross-Platform Installers

### 3.1 macOS .pkg Installer

**Requirements**:
- Signed with Developer ID Installer certificate
- Notarized by Apple (required for macOS 10.15+)
- Installs to user space (no admin required if possible)
- Registers native messaging host manifest
- Installs LaunchAgent for auto-start

**Installation Locations**:
```
~/Applications/AnawaLocalConnector/
  └── local-connector          # The unified binary

~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
  └── com.anava.local_connector.json

~/Library/LaunchAgents/
  └── com.anava.local_connector.plist
```

**Native Messaging Manifest** (`com.anava.local_connector.json`):
```json
{
  "name": "com.anava.local_connector",
  "description": "Anava Local Connector for camera network access",
  "path": "/Users/USERNAME/Applications/AnawaLocalConnector/local-connector",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID_HERE/"
  ]
}
```

**LaunchAgent** (`com.anava.local_connector.plist`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.anava.local_connector</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/USERNAME/Applications/AnawaLocalConnector/local-connector</string>
        <string>--proxy-service</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/USERNAME/Library/Logs/anava-local-connector.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/USERNAME/Library/Logs/anava-local-connector.log</string>
</dict>
</plist>
```

**Post-Install Script**:
```bash
#!/bin/bash
# postinstall script for .pkg

# Get the current user (not root, since we're installing to user space)
CURRENT_USER=$USER
USER_HOME=$(eval echo ~$CURRENT_USER)

# Replace USERNAME placeholder in manifest
sed -i '' "s|/Users/USERNAME|$USER_HOME|g" \
  "$USER_HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anava.local_connector.json"

# Replace USERNAME placeholder in LaunchAgent
sed -i '' "s|/Users/USERNAME|$USER_HOME|g" \
  "$USER_HOME/Library/LaunchAgents/com.anava.local_connector.plist"

# Load the LaunchAgent
launchctl load "$USER_HOME/Library/LaunchAgents/com.anava.local_connector.plist"

exit 0
```

**Tasks**:
- [ ] Create .pkg build script using `pkgbuild` and `productbuild`
- [ ] Set up Apple Developer account for code signing
- [ ] Obtain Developer ID Installer certificate
- [ ] Implement postinstall script
- [ ] Set up notarization workflow with `xcrun notarytool`
- [ ] Test on clean macOS 11, 12, 13, 14 VMs
- [ ] Create uninstaller script

**Build Command**:
```bash
# Build the binary
GOOS=darwin GOARCH=arm64 go build -o local-connector-arm64 cmd/local-connector/main.go
GOOS=darwin GOARCH=amd64 go build -o local-connector-amd64 cmd/local-connector/main.go

# Create universal binary
lipo -create local-connector-arm64 local-connector-amd64 -output local-connector

# Build package
pkgbuild --root ./installer-root \
  --scripts ./installer-scripts \
  --identifier com.anava.local-connector \
  --version 2.0.0 \
  --install-location / \
  AnawaLocalConnector.pkg

# Sign package
productsign --sign "Developer ID Installer: Your Name (TEAM_ID)" \
  AnavaLocalConnector.pkg \
  AnavaLocalConnector-signed.pkg

# Notarize
xcrun notarytool submit AnavaLocalConnector-signed.pkg \
  --keychain-profile "AC_PASSWORD" \
  --wait

# Staple
xcrun stapler staple AnavaLocalConnector-signed.pkg
```

### 3.2 Windows .msi Installer

**Requirements**:
- Signed with Authenticode certificate
- Installs to %LOCALAPPDATA% (no admin required)
- Registers native messaging host via registry
- Installs as Windows service or startup program

**Installation Locations**:
```
%LOCALAPPDATA%\Anava\LocalConnector\
  └── local-connector.exe

Registry:
HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.anava.local_connector
  (Default) = %LOCALAPPDATA%\Anava\LocalConnector\com.anava.local_connector.json

Startup:
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
  AnavaLocalConnector = "%LOCALAPPDATA%\Anava\LocalConnector\local-connector.exe --proxy-service"
```

**WiX Configuration** (`installer.wxs`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="Anava Local Connector" Language="1033" Version="2.0.0"
           Manufacturer="Anava" UpgradeCode="YOUR-GUID-HERE">
    <Package InstallerVersion="200" Compressed="yes" InstallScope="perUser" />

    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="LocalAppDataFolder">
        <Directory Id="ANAVADIR" Name="Anava">
          <Directory Id="INSTALLDIR" Name="LocalConnector">
            <Component Id="MainExecutable" Guid="YOUR-GUID-HERE">
              <File Id="LocalConnector" Source="local-connector.exe" KeyPath="yes" />
              <File Id="Manifest" Source="com.anava.local_connector.json" />

              <!-- Native Messaging Registry -->
              <RegistryKey Root="HKCU" Key="SOFTWARE\Google\Chrome\NativeMessagingHosts\com.anava.local_connector">
                <RegistryValue Type="string" Value="[INSTALLDIR]com.anava.local_connector.json" />
              </RegistryKey>

              <!-- Startup Registry -->
              <RegistryKey Root="HKCU" Key="Software\Microsoft\Windows\CurrentVersion\Run">
                <RegistryValue Name="AnavaLocalConnector" Type="string"
                  Value="&quot;[INSTALLDIR]local-connector.exe&quot; --proxy-service" />
              </RegistryKey>
            </Component>
          </Directory>
        </Directory>
      </Directory>
    </Directory>

    <Feature Id="Complete" Level="1">
      <ComponentRef Id="MainExecutable" />
    </Feature>
  </Product>
</Wix>
```

**Tasks**:
- [ ] Install WiX Toolset
- [ ] Create WiX configuration file
- [ ] Set up code signing certificate
- [ ] Implement Windows build script
- [ ] Test on Windows 10 and 11
- [ ] Create uninstaller

**Build Command**:
```bash
# Build binary
GOOS=windows GOARCH=amd64 go build -o local-connector.exe cmd/local-connector/main.go

# Build MSI
candle.exe installer.wxs
light.exe -out AnavaLocalConnector.msi installer.wixobj

# Sign
signtool.exe sign /f certificate.pfx /p PASSWORD /tr http://timestamp.digicert.com AnavaLocalConnector.msi
```

### 3.3 Linux .deb/.rpm Packages

**Requirements**:
- Install to user space or system location
- Register native messaging host
- Install systemd user service

**Installation Locations**:
```
/opt/anava/local-connector/
  └── local-connector

~/.config/google-chrome/NativeMessagingHosts/
  └── com.anava.local_connector.json

~/.config/systemd/user/
  └── anava-local-connector.service
```

**systemd User Service**:
```ini
[Unit]
Description=Anava Local Connector
After=network.target

[Service]
Type=simple
ExecStart=/opt/anava/local-connector/local-connector --proxy-service
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
```

**Debian Package Control**:
```
Package: anava-local-connector
Version: 2.0.0
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Anava <support@anava.cloud>
Description: Anava Local Connector for camera network access
 Enables Chrome extension to access local network cameras
 through a secure proxy service.
```

**Tasks**:
- [ ] Create .deb build script using `dpkg-deb`
- [ ] Create .rpm build script using `rpmbuild`
- [ ] Implement postinstall scripts for both formats
- [ ] Test on Ubuntu 20.04, 22.04, Fedora 38
- [ ] Set up GPG signing for packages

---

## Phase 4: Security Architecture

### 4.1 Nonce-Based Handshake

**Flow**:
```
1. User clicks "Connect" in web app (terraform-spa)
2. Web app generates nonce, stores in Redis (60s TTL)
3. Web app sends nonce to extension via chrome.runtime.sendMessage
4. Extension forwards nonce to native host
5. Native host includes nonce in first API call
6. Backend validates nonce, deletes it, establishes session
```

**Web App Implementation** (terraform-spa):
```typescript
// src/services/ExtensionConnector.ts
export class ExtensionConnector {
  private extensionId: string;

  async connectToExtension() {
    // Generate nonce
    const nonce = this.generateNonce();

    // Store in backend
    await this.storeNonce(nonce);

    // Send to extension
    chrome.runtime.sendMessage(
      this.extensionId,
      {
        type: 'INITIALIZE_CONNECTION',
        backendUrl: import.meta.env.VITE_API_URL,
        projectId: import.meta.env.VITE_PROJECT_ID,
        nonce: nonce
      },
      (response) => {
        if (response?.success) {
          console.log('Extension connected successfully');
        }
      }
    );
  }

  private generateNonce(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }

  private async storeNonce(nonce: string) {
    await fetch('/api/extension/store-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce })
    });
  }
}
```

**Extension Implementation**:
```javascript
// background.js
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (message.type === 'INITIALIZE_CONNECTION') {
      const { backendUrl, projectId, nonce } = message;

      // Store configuration
      chrome.storage.local.set({
        backendUrl,
        projectId,
        nonce,
        connectedAt: Date.now()
      });

      // Forward to native host
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_ID,
        {
          type: 'CONFIGURE',
          backendUrl,
          projectId,
          nonce
        },
        (response) => {
          sendResponse(response);
        }
      );

      return true; // Keep channel open for async response
    }
  }
);
```

**Native Host Implementation**:
```go
// In native messaging handler
type ConfigMessage struct {
    Type       string `json:"type"`
    BackendURL string `json:"backendUrl"`
    ProjectID  string `json:"projectId"`
    Nonce      string `json:"nonce"`
}

func handleConfigureMessage(msg ConfigMessage) {
    // Store configuration
    config := Config{
        BackendURL: msg.BackendURL,
        ProjectID:  msg.ProjectID,
        Nonce:      msg.Nonce,
    }
    saveConfig(config)

    // Make first authenticated request to backend
    err := authenticateWithBackend(config)
    if err != nil {
        sendResponse(map[string]interface{}{
            "success": false,
            "error": err.Error(),
        })
        return
    }

    sendResponse(map[string]interface{}{
        "success": true,
    })
}

func authenticateWithBackend(config Config) error {
    req, _ := http.NewRequest("POST", config.BackendURL+"/api/extension/authenticate", nil)
    req.Header.Set("X-Companion-Nonce", config.Nonce)
    req.Header.Set("X-Project-ID", config.ProjectID)

    client := &http.Client{Timeout: 10 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        return fmt.Errorf("authentication failed: %d", resp.StatusCode)
    }

    // Store session token from response
    var result struct {
        SessionToken string `json:"sessionToken"`
    }
    json.NewDecoder(resp.Body).Decode(&result)

    config.SessionToken = result.SessionToken
    saveConfig(config)

    return nil
}
```

**Backend Implementation** (Lambda/API Gateway):
```typescript
// lambda/extension-auth.ts
export async function handler(event: APIGatewayProxyEvent) {
  const nonce = event.headers['x-companion-nonce'];
  const projectId = event.headers['x-project-id'];

  if (!nonce || !projectId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing authentication headers' })
    };
  }

  // Get user session from cookie
  const sessionId = parseSessionCookie(event.headers.cookie);

  // Validate nonce
  const storedNonce = await redis.get(`user:${sessionId}:nonce`);

  if (storedNonce !== nonce) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid nonce' })
    };
  }

  // Delete nonce (single-use)
  await redis.del(`user:${sessionId}:nonce`);

  // Generate session token for native host
  const sessionToken = generateSecureToken();
  await redis.set(
    `extension:${sessionToken}`,
    JSON.stringify({ userId: sessionId, projectId }),
    'EX',
    86400 // 24 hours
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ sessionToken })
  };
}
```

**Tasks**:
- [ ] Implement nonce generation in web app
- [ ] Add Redis storage for nonces
- [ ] Implement externally_connectable in extension manifest
- [ ] Add message handler for web app → extension communication
- [ ] Implement nonce forwarding in native host
- [ ] Create backend Lambda for nonce validation
- [ ] Add session token management
- [ ] Test replay attack prevention

---

## Phase 5: terraform-spa Integration

### 5.1 Well-Known Configuration Endpoint

**Purpose**: Allow extension to auto-discover project configuration

**Implementation**:
```typescript
// terraform-spa module adds this endpoint
// .well-known/spa-connector-config.json

{
  "version": "1.0",
  "extensionId": "YOUR_EXTENSION_ID",
  "backendUrl": "https://api.your-project.com",
  "projectId": "your-project-123",
  "features": ["camera-discovery", "acap-deployment"]
}
```

**Extension Implementation**:
```javascript
// content-script.js (runs on terraform-spa pages)
async function discoverConfiguration() {
  try {
    const response = await fetch('/.well-known/spa-connector-config.json');
    if (!response.ok) {
      console.log('No connector config found on this site');
      return null;
    }

    const config = await response.json();

    // Store in extension
    chrome.storage.local.set({ discoveredConfig: config });

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'CONFIG_DISCOVERED',
      config
    });

    return config;
  } catch (error) {
    console.error('Failed to discover config:', error);
    return null;
  }
}

// Run on page load
discoverConfiguration();
```

### 5.2 Terraform Module Changes

**File**: `modules/spa-connector/main.tf`

```hcl
variable "enable_spa_connector" {
  type        = bool
  description = "Enable Chrome extension connector features"
  default     = false
}

variable "extension_id" {
  type        = string
  description = "Chrome extension ID to whitelist"
  default     = ""
}

resource "aws_s3_object" "connector_config" {
  count  = var.enable_spa_connector ? 1 : 0
  bucket = var.website_bucket_id
  key    = ".well-known/spa-connector-config.json"

  content = jsonencode({
    version      = "1.0"
    extensionId  = var.extension_id
    backendUrl   = var.api_gateway_url
    projectId    = var.project_id
    features     = ["camera-discovery", "acap-deployment"]
  })

  content_type = "application/json"

  # Make publicly readable
  acl = "public-read"
}
```

**Tasks**:
- [ ] Create terraform-spa connector module
- [ ] Add well-known config resource
- [ ] Update CloudFront to serve .well-known directory
- [ ] Add CORS headers for connector endpoints
- [ ] Create installation page template
- [ ] Document module usage

---

## Phase 6: Backward Compatibility

### 6.1 Migration Detection

**Extension Logic**:
```javascript
// background.js
async function detectOldInstallation() {
  // Try to connect to old native host ID
  const oldHostId = 'com.anava.proxy'; // Old ID

  try {
    const response = await sendNativeMessage(oldHostId, { type: 'PING' });
    if (response) {
      // Old installation detected
      return {
        hasOldVersion: true,
        version: response.version
      };
    }
  } catch (error) {
    // Old version not installed
  }

  // Check for old files via new native host
  try {
    const response = await sendNativeMessage(
      'com.anava.local_connector',
      { type: 'CHECK_OLD_INSTALLATION' }
    );

    return response;
  } catch (error) {
    return { hasOldVersion: false };
  }
}
```

**Native Host Logic**:
```go
// Handle CHECK_OLD_INSTALLATION message
func checkOldInstallation() map[string]interface{} {
    oldPaths := []string{
        "~/.local/bin/proxy-server",
        "~/.local/bin/native-host-proxy",
        "~/.config/anava/proxy.conf",
    }

    foundPaths := []string{}

    for _, path := range oldPaths {
        expandedPath := expandHome(path)
        if _, err := os.Stat(expandedPath); err == nil {
            foundPaths = append(foundPaths, path)
        }
    }

    return map[string]interface{}{
        "hasOldVersion": len(foundPaths) > 0,
        "oldPaths": foundPaths,
    }
}
```

### 6.2 Migration UI

**Popup.html**:
```html
<div id="migration-required" style="display: none;">
  <h3>⚠️ Upgrade Required</h3>
  <p>An older version of the Anava Local Connector was detected.</p>
  <p>Please upgrade to the new version for improved stability and automatic updates.</p>

  <button id="upgrade-now">Upgrade Now</button>

  <details>
    <summary>Manual cleanup (optional)</summary>
    <p>The old version can be safely removed by running:</p>
    <pre>curl -sSL https://connect.anava.cloud/uninstall-old.sh | bash</pre>
  </details>
</div>
```

### 6.3 Uninstall Script for Old Version

**File**: `uninstall-old.sh`

```bash
#!/bin/bash
# Uninstall old version of Anava Local Connector

echo "Uninstalling old Anava Local Connector..."

# Stop and remove LaunchAgent (macOS)
if [ -f ~/Library/LaunchAgents/com.anava.proxy.plist ]; then
  launchctl unload ~/Library/LaunchAgents/com.anava.proxy.plist
  rm ~/Library/LaunchAgents/com.anava.proxy.plist
  echo "✓ Removed LaunchAgent"
fi

# Remove binaries
rm -f ~/.local/bin/proxy-server
rm -f ~/.local/bin/native-host-proxy
echo "✓ Removed binaries"

# Remove config
rm -rf ~/.config/anava
echo "✓ Removed configuration"

# Remove old native messaging manifest
rm -f ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.proxy.json
echo "✓ Removed native messaging manifest"

echo ""
echo "✓ Old version uninstalled successfully!"
echo "You can now install the new version from the Chrome extension."
```

**Tasks**:
- [ ] Implement old installation detection
- [ ] Create migration UI in popup
- [ ] Write uninstall script
- [ ] Host uninstall script on CDN
- [ ] Test migration on systems with old version

---

## Phase 7: CI/CD Pipeline

### 7.1 GitHub Actions Workflow

**File**: `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build-binaries:
    strategy:
      matrix:
        include:
          - os: macos-latest
            goos: darwin
            goarch: arm64
            output: local-connector-darwin-arm64
          - os: macos-latest
            goos: darwin
            goarch: amd64
            output: local-connector-darwin-amd64
          - os: windows-latest
            goos: windows
            goarch: amd64
            output: local-connector-windows-amd64.exe
          - os: ubuntu-latest
            goos: linux
            goarch: amd64
            output: local-connector-linux-amd64

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: '1.21'

      - name: Build binary
        env:
          GOOS: ${{ matrix.goos }}
          GOARCH: ${{ matrix.goarch }}
        run: |
          go build -o ${{ matrix.output }} \
            -ldflags="-s -w -X main.VERSION=${{ github.ref_name }}" \
            cmd/local-connector/main.go

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.output }}
          path: ${{ matrix.output }}

  build-macos-installer:
    needs: build-binaries
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - name: Download binaries
        uses: actions/download-artifact@v4
        with:
          pattern: local-connector-darwin-*

      - name: Create universal binary
        run: |
          lipo -create \
            local-connector-darwin-arm64/local-connector-darwin-arm64 \
            local-connector-darwin-amd64/local-connector-darwin-amd64 \
            -output local-connector

      - name: Build package
        run: |
          chmod +x scripts/build-macos-pkg.sh
          ./scripts/build-macos-pkg.sh ${{ github.ref_name }}

      - name: Sign and notarize
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CERT_P12: ${{ secrets.APPLE_CERT_P12 }}
          CERT_PASSWORD: ${{ secrets.APPLE_CERT_PASSWORD }}
        run: |
          chmod +x scripts/sign-and-notarize-macos.sh
          ./scripts/sign-and-notarize-macos.sh AnavaLocalConnector.pkg

      - name: Upload installer
        uses: actions/upload-artifact@v4
        with:
          name: macos-installer
          path: AnavaLocalConnector-signed.pkg

  build-windows-installer:
    needs: build-binaries
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4

      - name: Download binary
        uses: actions/download-artifact@v4
        with:
          name: local-connector-windows-amd64.exe

      - name: Install WiX
        run: |
          choco install wixtoolset

      - name: Build MSI
        run: |
          ./scripts/build-windows-msi.ps1 ${{ github.ref_name }}

      - name: Sign installer
        env:
          CERT_P12: ${{ secrets.WINDOWS_CERT_P12 }}
          CERT_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
        run: |
          ./scripts/sign-windows-msi.ps1

      - name: Upload installer
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: AnavaLocalConnector.msi

  build-linux-packages:
    needs: build-binaries
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Download binary
        uses: actions/download-artifact@v4
        with:
          name: local-connector-linux-amd64

      - name: Build DEB package
        run: |
          chmod +x scripts/build-linux-deb.sh
          ./scripts/build-linux-deb.sh ${{ github.ref_name }}

      - name: Build RPM package
        run: |
          chmod +x scripts/build-linux-rpm.sh
          ./scripts/build-linux-rpm.sh ${{ github.ref_name }}

      - name: Upload packages
        uses: actions/upload-artifact@v4
        with:
          name: linux-packages
          path: |
            anava-local-connector_*.deb
            anava-local-connector-*.rpm

  create-release:
    needs:
      - build-macos-installer
      - build-windows-installer
      - build-linux-packages
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            macos-installer/AnavaLocalConnector-signed.pkg
            windows-installer/AnavaLocalConnector.msi
            linux-packages/*.deb
            linux-packages/*.rpm
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Tasks**:
- [ ] Create GitHub Actions workflow
- [ ] Set up secrets for code signing certificates
- [ ] Implement build scripts for each platform
- [ ] Test CI/CD pipeline with test tags
- [ ] Set up automatic Chrome Web Store publishing

---

## Phase 8: Extension Updates for Marketplace

### 8.1 Manifest v3 Updates

**File**: `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Anava Local Connector",
  "version": "2.0.0",
  "description": "Connect to local network cameras from your browser",

  "permissions": [
    "storage",
    "nativeMessaging"
  ],

  "host_permissions": [
    "http://localhost:9876/*"
  ],

  "externally_connectable": {
    "matches": [
      "https://*.anava.cloud/*",
      "http://localhost:5173/*"
    ]
  },

  "background": {
    "service_worker": "dist/background.js",
    "type": "module"
  },

  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },

  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },

  "content_scripts": [
    {
      "matches": ["https://*.anava.cloud/*", "http://localhost:5173/*"],
      "js": ["dist/content-script.js"]
    }
  ]
}
```

### 8.2 Chrome Web Store Listing

**Title**: Anava Local Connector

**Short Description** (132 chars max):
Connect to local network cameras from your browser. Requires companion app installation.

**Detailed Description**:
```
Anava Local Connector enables secure access to cameras on your local network from web applications.

IMPORTANT: This extension requires installing a companion app on your computer. The extension will guide you through the one-time setup process.

Features:
• Auto-discovery of Axis cameras on your local network
• Secure communication with HTTPS and Digest Authentication
• Automatic updates for the companion app
• Works with any Anava-powered web application

How it works:
1. Install this extension from the Chrome Web Store
2. Click the extension icon and follow the installation guide
3. Download and install the companion app for your operating system
4. Connect to your Anava-powered web application

Privacy & Security:
• All camera communication stays on your local network
• No data is sent to external servers
• Open source: https://github.com/AnavaAcap/anava-camera-extension

Support:
Visit https://docs.anava.cloud for documentation and troubleshooting.
```

**Screenshots**:
- Extension popup showing connection status
- Installation guide screen
- Camera discovery in web app
- Configuration screen

**Privacy Policy**: Required - create at https://connect.anava.cloud/privacy

**Tasks**:
- [ ] Create professional icons (16x16, 48x48, 128x128)
- [ ] Take screenshots for Chrome Web Store listing
- [ ] Write privacy policy
- [ ] Create support documentation
- [ ] Set up Chrome Web Store developer account ($5 one-time fee)
- [ ] Submit extension for review

---

## Phase 9: Testing & Quality Assurance

### 9.1 Test Plan

**Platforms to Test**:
- macOS 11, 12, 13, 14 (Intel + Apple Silicon)
- Windows 10, 11
- Ubuntu 20.04, 22.04, Fedora 38

**Test Scenarios**:

1. **Fresh Installation**
   - [ ] Install extension from Chrome Web Store
   - [ ] See "not installed" state
   - [ ] Click installation link
   - [ ] Download correct installer for OS
   - [ ] Run installer
   - [ ] Verify native host registered
   - [ ] Verify proxy service running
   - [ ] Extension detects successful installation

2. **Version Handshake**
   - [ ] Extension checks version on startup
   - [ ] Correct version shows connected state
   - [ ] Mismatched version shows update prompt
   - [ ] Update flow works correctly

3. **Nonce Authentication**
   - [ ] Web app generates nonce
   - [ ] Extension receives nonce
   - [ ] Native host authenticates with backend
   - [ ] Invalid nonce rejected
   - [ ] Replay attack prevented

4. **Camera Discovery**
   - [ ] Native host can scan local network
   - [ ] Cameras discovered and authenticated
   - [ ] Device type filtering works
   - [ ] Results returned to web app

5. **Update Flow**
   - [ ] Extension updates from Chrome Web Store
   - [ ] Version mismatch detected
   - [ ] Update prompt shown
   - [ ] User downloads new installer
   - [ ] New version installs over old version
   - [ ] Service restarts with new version

6. **Migration from Old Version**
   - [ ] Old installation detected
   - [ ] Migration prompt shown
   - [ ] New version installed
   - [ ] Old files cleaned up

### 9.2 Automated Testing

**File**: `tests/integration/version-handshake.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { NativeHostClient } from '../src/services/NativeHostClient';

describe('Version Handshake', () => {
  it('should get version from native host', async () => {
    const client = new NativeHostClient('com.anava.local_connector');
    const response = await client.sendMessage({ type: 'GET_VERSION' });

    expect(response).toHaveProperty('version');
    expect(response.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should detect version mismatch', async () => {
    const requiredVersion = '2.0.0';
    const actualVersion = '1.9.0';

    const needsUpdate = isUpdateRequired(requiredVersion, actualVersion);
    expect(needsUpdate).toBe(true);
  });
});
```

**Tasks**:
- [ ] Write unit tests for version comparison
- [ ] Write integration tests for native messaging
- [ ] Set up E2E tests with Playwright
- [ ] Create test environments for each platform
- [ ] Implement automated testing in CI/CD

---

## Phase 10: Documentation

### 10.1 User Documentation

**File**: `docs/installation-guide.md`

```markdown
# Installation Guide

## Step 1: Install Chrome Extension

1. Visit the [Chrome Web Store](https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID)
2. Click "Add to Chrome"
3. Click "Add extension" in the confirmation dialog

## Step 2: Install Companion App

1. Click the Anava extension icon in your Chrome toolbar
2. Click "Download Companion App"
3. Download the installer for your operating system:
   - **macOS**: AnavaLocalConnector.pkg
   - **Windows**: AnavaLocalConnector.msi
   - **Linux**: anava-local-connector.deb or .rpm

4. Run the installer:
   - **macOS**: Double-click the .pkg file and follow the prompts
   - **Windows**: Double-click the .msi file and follow the prompts
   - **Linux**:
     - Ubuntu/Debian: `sudo dpkg -i anava-local-connector_2.0.0_amd64.deb`
     - Fedora/CentOS: `sudo rpm -i anava-local-connector-2.0.0.x86_64.rpm`

5. Return to Chrome and reload the extension

## Step 3: Connect to Your Application

1. Navigate to your Anava-powered web application
2. The extension will automatically detect the application
3. Click "Connect" in the application
4. Grant permissions when prompted
5. You're ready to discover cameras!

## Troubleshooting

### Extension shows "Not Connected"

1. Make sure the companion app is installed
2. Check if the service is running:
   - **macOS**: `launchctl list | grep anava`
   - **Windows**: Open Task Manager and look for "AnavaLocalConnector"
   - **Linux**: `systemctl --user status anava-local-connector`

3. Try restarting the service:
   - **macOS**: `launchctl stop com.anava.local_connector && launchctl start com.anava.local_connector`
   - **Windows**: Restart from Task Manager
   - **Linux**: `systemctl --user restart anava-local-connector`

### Extension shows "Update Required"

1. Click the update prompt
2. Download the latest installer
3. Run the installer (it will automatically update)
4. Reload the extension

For more help, visit https://docs.anava.cloud
```

### 10.2 Developer Documentation

**File**: `docs/developer-guide.md`

```markdown
# Developer Guide

## Architecture

The Anava Local Connector consists of three components:

1. **Chrome Extension**: UI and orchestration
2. **Native Host**: Chrome native messaging protocol handler
3. **Proxy Service**: Long-running service with network access

These are combined into a single binary that runs in dual-mode.

## Building from Source

### Prerequisites

- Go 1.21+
- Node.js 18+
- npm or yarn

### Build Steps

```bash
# Clone the repository
git clone https://github.com/AnavaAcap/anava-camera-extension.git
cd anava-camera-extension

# Build the extension
npm install
npm run build

# Build the native binary
cd cmd/local-connector
go build -o local-connector main.go
```

## Adding to Your terraform-spa Project

### 1. Enable Connector in Terraform

```hcl
module "spa" {
  source = "AnavaAcap/spa/aws"

  # ... other config ...

  enable_spa_connector = true
  extension_id         = "YOUR_EXTENSION_ID"
}
```

### 2. Add Connection UI

```typescript
import { ExtensionConnector } from '@anava/extension-connector';

const connector = new ExtensionConnector('YOUR_EXTENSION_ID');

function ConnectButton() {
  const handleConnect = async () => {
    await connector.connectToExtension();
  };

  return <button onClick={handleConnect}>Connect to Local Network</button>;
}
```

### 3. Receive Camera Data

```typescript
connector.on('cameras-discovered', (cameras) => {
  console.log('Found cameras:', cameras);
});

connector.scanForCameras('192.168.1.0/24', {
  username: 'admin',
  password: 'password'
});
```

## API Reference

See [API.md](./API.md) for complete API documentation.
```

**Tasks**:
- [ ] Write installation guide
- [ ] Write developer guide
- [ ] Create API reference documentation
- [ ] Write troubleshooting guide
- [ ] Create video walkthrough
- [ ] Translate to Spanish, French (optional)

---

## Phase 11: Launch Checklist

### Pre-Launch

- [ ] All tests passing on all platforms
- [ ] Code signing certificates obtained and working
- [ ] Chrome Web Store developer account set up
- [ ] Privacy policy published
- [ ] Support documentation published
- [ ] GitHub releases working
- [ ] CI/CD pipeline tested end-to-end

### Launch Day

- [ ] Submit extension to Chrome Web Store
- [ ] Upload all installers to GitHub Releases
- [ ] Update website with installation links
- [ ] Publish blog post announcement
- [ ] Send email to beta users
- [ ] Monitor error logs

### Post-Launch

- [ ] Monitor Chrome Web Store reviews
- [ ] Respond to support requests
- [ ] Track installation analytics
- [ ] Collect user feedback
- [ ] Plan version 2.1 features

---

## Success Metrics

**Week 1**:
- 100+ installs from Chrome Web Store
- <5% installation failure rate
- Average setup time < 5 minutes

**Month 1**:
- 1000+ installs
- 4+ star rating on Chrome Web Store
- <10 support tickets

**Month 3**:
- 5000+ installs
- Featured on Chrome Web Store
- Integration with 10+ terraform-spa projects

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|-----------|
| Apple notarization delays | Medium | High | Start notarization setup early, have backup timeline |
| Chrome Web Store rejection | Low | High | Follow all policies strictly, prepare appeal documentation |
| Code signing cert issues | Medium | Medium | Purchase certs early, test signing process |
| User confusion during setup | High | Medium | Create clear video walkthrough, add in-app guidance |
| Native host version skew | Medium | High | Implement strict version checking, auto-update prompts |
| LaunchAgent/Service fails | Low | High | Add health checks, auto-restart logic |

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Unified Binary | 1 week | - |
| Phase 2: Version Handshake | 3 days | Phase 1 |
| Phase 3: Installers | 2 weeks | Phase 1, Code signing setup |
| Phase 4: Security | 1 week | Phase 2 |
| Phase 5: terraform-spa Integration | 1 week | Phase 4 |
| Phase 6: Migration | 3 days | Phase 1, 2 |
| Phase 7: CI/CD | 1 week | Phase 3 |
| Phase 8: Extension Updates | 3 days | Phase 2, 4 |
| Phase 9: Testing | 1 week | All phases |
| Phase 10: Documentation | 1 week | All phases |
| Phase 11: Launch | 3 days | All phases |

**Total**: 6-8 weeks (with buffer for certificate approval delays)

---

## Next Steps

1. **Immediate**: Review and approve this plan
2. **Week 1**: Start Phase 1 (unified binary) and code signing setup
3. **Week 2**: Begin installer development while notarization processes
4. **Week 3**: Implement security architecture
5. **Week 4-5**: Complete terraform-spa integration and testing
6. **Week 6**: Documentation and Chrome Web Store submission
7. **Week 7-8**: Review period and launch preparation

---

## Questions & Decisions Needed

Before starting implementation:

1. **Extension ID**: Reserve extension ID from Chrome Web Store (needed for manifests)
2. **Code Signing**: Approve budget for Apple Developer ($99/year) + Windows cert ($200-400/year)
3. **Domain**: Decide on installation page domain (connect.anava.cloud?)
4. **Support**: Set up support email/ticketing system
5. **Analytics**: Choose analytics tool for tracking installations

---

## References

- [Chrome Extension Manifest v3](https://developer.chrome.com/docs/extensions/mv3/)
- [Native Messaging Protocol](https://developer.chrome.com/docs/apps/nativeMessaging/)
- [Apple Code Signing](https://developer.apple.com/support/code-signing/)
- [Windows Authenticode](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/authenticode)
- [WiX Toolset Documentation](https://wixtoolset.org/documentation/)
- [systemd User Services](https://www.freedesktop.org/software/systemd/man/systemd.service.html)

---

**Document Version**: 1.0
**Last Updated**: 2025-01-30
**Authors**: Claude Code + Gemini AI Collaboration
