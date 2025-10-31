# Build & Test Guide

Quick reference for building and testing the Anava Local Connector v2.0.0.

---

## Quick Build Commands

### Universal Build (Recommended for Testing)

```bash
# Build unified binary for current platform
go build -o build/local-connector ./cmd/local-connector

# Test it
./build/local-connector --version
./build/local-connector --proxy-service    # Starts proxy on :9876
```

### Platform-Specific Installers

**macOS (.pkg)**:
```bash
./scripts/build-macos-pkg.sh
# Output: dist/AnavaLocalConnector-2.0.0-unsigned.pkg
# Test: sudo installer -pkg dist/AnavaLocalConnector-2.0.0-unsigned.pkg -target /
```

**Windows (.msi)**:
```bash
# Requires WiX Toolset installed
./scripts/build-windows-msi.ps1
# Output: dist/AnavaLocalConnector-2.0.0-unsigned.msi
# Test: msiexec /i dist\AnavaLocalConnector-2.0.0-unsigned.msi
```

**Linux Debian (.deb)**:
```bash
./scripts/build-linux-deb.sh
# Output: dist/anava-local-connector_2.0.0_amd64.deb
# Test: sudo dpkg -i dist/anava-local-connector_2.0.0_amd64.deb
```

**Linux Red Hat (.rpm)**:
```bash
./scripts/build-linux-rpm.sh
# Output: dist/anava-local-connector-2.0.0-1.*.x86_64.rpm
# Test: sudo rpm -i dist/anava-local-connector-2.0.0-1.*.x86_64.rpm
```

---

## Testing Native Messaging

### Test GET_VERSION Message

```bash
# Create test message
echo '{"type":"GET_VERSION"}' | ./build/local-connector --native-messaging

# Expected output:
# {"success":true,"version":"2.0.0"}
```

### Test HEALTH_CHECK Message

```bash
echo '{"type":"HEALTH_CHECK"}' | ./build/local-connector --native-messaging

# Expected output:
# {"success":true,"data":{"nativeHost":"running","proxyService":"unknown"}}
```

### Test CONFIGURE Message

```bash
cat << EOF | ./build/local-connector --native-messaging
{
  "type": "CONFIGURE",
  "backendUrl": "https://api.example.com",
  "projectId": "test-project-123",
  "nonce": "dGVzdC1ub25jZS0xMjM0NTY3ODkw"
}
EOF

# Expected: Attempts to authenticate with backend
# Will fail without backend implementation
```

---

## Testing Proxy Service

### Start Proxy Service

```bash
./build/local-connector --proxy-service
# Should output:
# Camera Proxy Server listening on http://127.0.0.1:9876
# This server bypasses Chrome's local network sandbox restrictions
```

### Test Health Endpoint

```bash
curl http://127.0.0.1:9876/health

# Expected output:
# {"status":"ok"}
```

### Test Proxy Request

```bash
curl -X POST http://127.0.0.1:9876/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://192.168.1.100/axis-cgi/basicdeviceinfo.cgi",
    "method": "POST",
    "username": "root",
    "password": "password",
    "body": {
      "apiVersion": "1.0",
      "method": "getProperties"
    }
  }'

# Expected: Attempts to connect to camera
# Will timeout if no camera at that IP
```

---

## Testing Extension Integration

### 1. Load Extension in Chrome

1. Build extension:
   ```bash
   npm run build
   ```

2. Open Chrome: `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `anava-camera-extension` directory (root, not dist/)

### 2. Check Extension ID

```bash
# In Chrome console (background service worker)
chrome.runtime.id
# Example: "ojhdgnojgelfiejpgipjddfddgefdpfa"
```

### 3. Update Native Messaging Manifest

**macOS**:
```bash
# Edit this file:
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anava.local_connector.json

# Replace PLACEHOLDER_EXTENSION_ID with actual ID from step 2
```

**Windows**:
```
%APPDATA%\Google\Chrome\NativeMessagingHosts\com.anava.local_connector.json
```

**Linux**:
```
~/.config/google-chrome/NativeMessagingHosts/com.anava.local_connector.json
```

### 4. Test Version Check

1. Open extension popup
2. Check badge (should show "!" if native host not installed)
3. Look in background service worker console:
   ```
   [Background] Checking native host version...
   [Background] Native host version: 2.0.0
   [Background] Required version: 2.0.0
   [Background] Version check passed
   ```

### 5. Test Web App Integration

Create test HTML file:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Test Extension Connector</title>
</head>
<body>
  <h1>Anava Extension Test</h1>
  <button id="test-health">Test Health Check</button>
  <button id="test-connect">Test Connection</button>
  <pre id="output"></pre>

  <script>
    const EXTENSION_ID = 'YOUR_EXTENSION_ID_HERE';

    document.getElementById('test-health').onclick = async () => {
      try {
        const response = await chrome.runtime.sendMessage(EXTENSION_ID, {
          command: 'health_check'
        });
        document.getElementById('output').textContent = JSON.stringify(response, null, 2);
      } catch (error) {
        document.getElementById('output').textContent = 'Error: ' + error.message;
      }
    };

    document.getElementById('test-connect').onclick = async () => {
      try {
        const response = await chrome.runtime.sendMessage(EXTENSION_ID, {
          command: 'INITIALIZE_CONNECTION',
          payload: {
            backendUrl: 'https://api.example.com',
            projectId: 'test-project-123',
            nonce: btoa('test-nonce-' + Date.now())
          }
        });
        document.getElementById('output').textContent = JSON.stringify(response, null, 2);
      } catch (error) {
        document.getElementById('output').textContent = 'Error: ' + error.message;
      }
    };
  </script>
</body>
</html>
```

Serve this file from `localhost:5173` or add your domain to `manifest.json` externally_connectable.

---

## Debugging

### Check Logs

**macOS**:
```bash
# Native messaging host log
tail -f ~/Library/Logs/anava-native-host.log

# Proxy service log
tail -f ~/Library/Logs/anava-proxy-service.log
```

**Windows**:
```powershell
# Native messaging host log
Get-Content "$env:LOCALAPPDATA\Logs\anava-native-host.log" -Wait

# Proxy service log
Get-Content "$env:LOCALAPPDATA\Logs\anava-proxy-service.log" -Wait
```

**Linux**:
```bash
# Native messaging host log
tail -f ~/.local/share/anava/logs/anava-native-host.log

# Proxy service log
tail -f ~/.local/share/anava/logs/anava-proxy-service.log
```

### Check Configuration

```bash
# macOS/Linux
cat ~/.config/anava/connector-config.json

# Windows
type %LOCALAPPDATA%\anava\connector-config.json
```

### Check Lock File

```bash
# macOS
cat ~/Library/Application\ Support/Anava/anava-proxy-service.lock

# Linux
cat ~/.local/share/anava/anava-proxy-service.lock

# Should contain PID of running proxy process
```

### Verify Proxy is Running

```bash
# Check process
ps aux | grep local-connector

# Check port
lsof -i :9876    # macOS/Linux
netstat -ano | findstr :9876    # Windows

# Test connection
curl http://127.0.0.1:9876/health
```

---

## Common Issues

### Issue: "Native host not found"

**Solution**:
1. Check native messaging manifest exists:
   ```bash
   # macOS
   ls -la ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/

   # Should see: com.anava.local_connector.json
   ```

2. Check binary path in manifest is correct
3. Check binary has execute permission:
   ```bash
   chmod +x ~/Applications/AnavaLocalConnector/local-connector
   ```

### Issue: "Version mismatch"

**Solution**:
1. Check installed version:
   ```bash
   ~/Applications/AnavaLocalConnector/local-connector --version
   ```

2. Rebuild and reinstall:
   ```bash
   ./scripts/build-macos-pkg.sh
   sudo installer -pkg dist/AnavaLocalConnector-2.0.0-unsigned.pkg -target /
   ```

### Issue: "Proxy already running"

**Solution**:
1. Kill existing process:
   ```bash
   # Find PID
   lsof -i :9876

   # Kill it
   kill -9 <PID>
   ```

2. Or use lock file:
   ```bash
   cat ~/Library/Application\ Support/Anava/anava-proxy-service.lock
   kill -9 <PID_FROM_LOCK_FILE>
   rm ~/Library/Application\ Support/Anava/anava-proxy-service.lock
   ```

### Issue: "Backend authentication failed"

**Solution**:
1. Check backend is running
2. Check nonce endpoint exists:
   ```bash
   curl -X POST https://api.example.com/api/extension/store-nonce \
     -H "Content-Type: application/json" \
     -d '{"projectId":"test","nonce":"test","timestamp":1234567890}'
   ```

3. Check authentication endpoint:
   ```bash
   curl -X POST https://api.example.com/api/extension/authenticate \
     -H "X-Companion-Nonce: test-nonce" \
     -H "X-Project-ID: test-project"
   ```

---

## Performance Testing

### Test Camera Scan Performance

```bash
# In browser console (extension background worker)
const startTime = Date.now();

const response = await chrome.runtime.sendMessage(EXTENSION_ID, {
  command: 'scan_network',
  payload: {
    subnet: '192.168.1.0/24',
    credentials: { username: 'root', password: 'password' }
  }
});

const duration = Date.now() - startTime;
console.log(`Scan completed in ${duration}ms`);
console.log(`Found ${response.data.cameras.length} cameras`);
```

Expected: 30-60 seconds for /24 subnet (256 IPs)

### Test Proxy Throughput

```bash
# Concurrent requests test
for i in {1..10}; do
  curl -X POST http://127.0.0.1:9876/health &
done
wait

# All should return {"status":"ok"}
```

---

## Before Committing Changes

```bash
# Format code
go fmt ./...

# Build for all platforms (if possible)
GOOS=darwin GOARCH=arm64 go build -o build/local-connector-darwin-arm64 ./cmd/local-connector
GOOS=darwin GOARCH=amd64 go build -o build/local-connector-darwin-amd64 ./cmd/local-connector
GOOS=windows GOARCH=amd64 go build -o build/local-connector-windows-amd64.exe ./cmd/local-connector
GOOS=linux GOARCH=amd64 go build -o build/local-connector-linux-amd64 ./cmd/local-connector

# Test binary works
./build/local-connector-darwin-arm64 --version
```

---

## Next Steps After Testing

Once all tests pass:

1. ✅ Update extension ID in native messaging manifests
2. ✅ Obtain code signing certificates
3. ✅ Sign installers
4. ✅ Test signed installers
5. ✅ Publish extension to Chrome Web Store (private)
6. ✅ Deploy to https://connect.anava.cloud
7. ✅ Proceed to Phase 5 (Marketplace Publishing)

See `MARKETPLACE_IMPLEMENTATION_REPORT.md` for complete details.
