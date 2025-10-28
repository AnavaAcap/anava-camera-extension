# Anava Camera Proxy - Installation & Usage Guide

## Quick Start

### 1. Install Native Messaging Host

The native messaging host enables the Chrome extension to communicate with cameras using self-signed certificates.

```bash
cd /Users/ryanwager/anava-camera-extension
./install.sh
```

The installer will:
- ✅ Auto-detect your Chrome extension ID
- ✅ Build Go binary for your system (Intel or Apple Silicon)
- ✅ Install to `~/Library/Application Support/Anava/camera-proxy`
- ✅ Create native messaging manifest
- ✅ Test the installation

### 2. Reload Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode" (toggle in top-right)
3. Click the reload icon on "Anava Camera Discovery & Deployment"

### 3. Test with Camera

1. Open the extension popup
2. The extension will automatically detect the native host
3. Try authenticating with a camera (e.g., 192.168.50.156)
4. Check logs if you encounter issues

## What This Solves

### Problem: Browser Certificate Validation
Chrome blocks HTTPS requests to cameras with self-signed certificates, showing `NET::ERR_CERT_AUTHORITY_INVALID` errors.

### Solution: Native Messaging Host
A Go binary that:
- Runs outside the browser sandbox
- Bypasses certificate validation (`InsecureSkipVerify: true`)
- Handles Digest authentication automatically
- Communicates with extension via Chrome's native messaging protocol

### Architecture
```
Chrome Extension
  ↓ Native Messaging (stdio)
Go Binary
  ↓ HTTPS (self-signed cert OK)
Camera
```

## Files Created

### 1. Go Binary
**Location**: `~/Library/Application Support/Anava/camera-proxy`

Production binary that handles authentication requests. Built for your architecture (amd64 or arm64).

### 2. Native Messaging Manifest
**Location**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json`

Tells Chrome how to launch the binary and which extensions can use it.

```json
{
  "name": "com.anava.camera_proxy",
  "description": "Anava Camera Authentication Proxy",
  "path": "/Users/YOUR_USERNAME/Library/Application Support/Anava/camera-proxy",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

### 3. Log File
**Location**: `~/Library/Logs/anava-camera-proxy.log`

All requests and responses are logged here. Useful for debugging.

## Verification

### Check Installation Status

```bash
# Check if binary exists and is executable
ls -lh ~/Library/Application\ Support/Anava/camera-proxy

# Check if manifest exists
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json

# View recent logs
tail -20 ~/Library/Logs/anava-camera-proxy.log
```

### Run Test Suite

```bash
cd /Users/ryanwager/anava-camera-extension
./test-native-host.sh
```

This tests:
- Binary executable status
- HTTP request handling
- Camera authentication (optional)
- Log file creation

### Test in Chrome DevTools

Open the extension popup, then open DevTools (right-click → Inspect) and run:

```javascript
// Test native host connectivity
chrome.runtime.sendNativeMessage(
  'com.anava.camera_proxy',
  {
    url: 'https://192.168.50.156:443/axis-cgi/param.cgi?action=list&group=Properties.System',
    method: 'GET',
    username: 'anava',
    password: 'baton'
  },
  (response) => {
    console.log('Response:', response);
  }
);
```

Expected output:
```javascript
{
  status: 200,
  data: {
    text: "root.Properties.System.Architecture=aarch64\nroot.Properties.System.SerialNumber=B8A44FF53CB2\n..."
  }
}
```

## Troubleshooting

### "Native host not found"

**Cause**: Manifest file not found or extension ID mismatch

**Fix**:
1. Get your extension ID from `chrome://extensions` (enable Developer mode)
2. Edit manifest:
   ```bash
   nano ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json
   ```
3. Update `allowed_origins` with your actual extension ID
4. Reload extension in Chrome

### "Permission denied" when running binary

**Cause**: Binary not executable

**Fix**:
```bash
chmod +x ~/Library/Application\ Support/Anava/camera-proxy
```

### Wrong architecture binary

**Cause**: Installer detected wrong CPU architecture

**Fix**:
```bash
cd /Users/ryanwager/anava-camera-extension/native-host

# For Apple Silicon (M1/M2/M3)
GOOS=darwin GOARCH=arm64 go build -o ~/Library/Application\ Support/Anava/camera-proxy main.go

# For Intel Macs
GOOS=darwin GOARCH=amd64 go build -o ~/Library/Application\ Support/Anava/camera-proxy main.go

chmod +x ~/Library/Application\ Support/Anava/camera-proxy
```

### Authentication still failing

**Causes**:
- Wrong credentials
- Camera not accessible on network
- Firewall blocking connection

**Debug**:
1. Check logs:
   ```bash
   tail -f ~/Library/Logs/anava-camera-proxy.log
   ```

2. Test with curl:
   ```bash
   curl --digest -u anava:baton https://192.168.50.156:443/axis-cgi/param.cgi?action=list -k -v
   ```

3. Verify camera IP and port:
   ```bash
   ping 192.168.50.156
   nc -zv 192.168.50.156 443
   ```

### Extension shows "Using background worker"

**Cause**: Native host not responding or manifest issue

**Debug**:
1. Check if native host is available:
   ```javascript
   // In extension DevTools console
   chrome.runtime.sendNativeMessage(
     'com.anava.camera_proxy',
     { url: 'https://httpbin.org/get', method: 'GET', username: 'test', password: 'test' },
     (response) => {
       if (chrome.runtime.lastError) {
         console.error('Native host error:', chrome.runtime.lastError);
       } else {
         console.log('Native host available:', response);
       }
     }
   );
   ```

2. Verify manifest path is correct:
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json | grep path
   ```

3. Test binary directly:
   ```bash
   echo '{"url":"https://httpbin.org/get","method":"GET","username":"test","password":"test"}' | \
     python3 -c "import sys, struct; msg = sys.stdin.read().encode(); sys.stdout.buffer.write(struct.pack('<I', len(msg)) + msg)" | \
     ~/Library/Application\ Support/Anava/camera-proxy | \
     python3 -c "import sys, struct, json; length_bytes = sys.stdin.buffer.read(4); length = struct.unpack('<I', length_bytes)[0]; data = sys.stdin.buffer.read(length); print(json.dumps(json.loads(data), indent=2))"
   ```

## Uninstallation

To completely remove the native messaging host:

```bash
# Remove binary
rm ~/Library/Application\ Support/Anava/camera-proxy
rmdir ~/Library/Application\ Support/Anava  # If empty

# Remove manifest
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json

# Remove logs (optional)
rm ~/Library/Logs/anava-camera-proxy.log
```

## Development

### Building from Source

```bash
cd /Users/ryanwager/anava-camera-extension/native-host

# Build for current architecture
go build -o camera-proxy main.go

# Build for specific architecture
GOOS=darwin GOARCH=arm64 go build -o camera-proxy-arm64 main.go
GOOS=darwin GOARCH=amd64 go build -o camera-proxy-amd64 main.go

# Test build
./camera-proxy < test-input.bin > test-output.bin
```

### Adding Logging

The binary logs to `~/Library/Logs/anava-camera-proxy.log`. To add more logging:

1. Edit `/Users/ryanwager/anava-camera-extension/native-host/main.go`
2. Add log statements:
   ```go
   logger.Printf("Debug: %s", someValue)
   ```
3. Rebuild and reinstall

### Protocol Details

Chrome Native Messaging Protocol uses stdio with a 4-byte length prefix:

**Input** (stdin):
```
[4 bytes: little-endian uint32 message length]
[N bytes: JSON message]
```

**Output** (stdout):
```
[4 bytes: little-endian uint32 message length]
[N bytes: JSON response]
```

**Message Format**:
```json
// Request
{
  "url": "https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "anava",
  "password": "baton",
  "body": {
    "apiVersion": "1.0",
    "method": "getProperties"
  }
}

// Response (success)
{
  "status": 200,
  "data": {
    "apiVersion": "1.3",
    "data": {
      "propertyList": {
        "Brand": "AXIS",
        "ProdType": "Network Camera"
      }
    }
  }
}

// Response (error)
{
  "status": 401,
  "error": "HTTP 401: Unauthorized"
}
```

## Security Considerations

### Certificate Validation Bypass

The binary uses `InsecureSkipVerify: true` to allow self-signed certificates. This is acceptable because:

- ✅ Cameras are on private network (192.168.x.x)
- ✅ Alternative would require installing each camera's cert
- ✅ Communication is still encrypted (HTTPS)
- ❌ **DO NOT** use for public internet requests

### Extension ID Whitelist

Only your specific extension ID can communicate with the native host. Other extensions cannot use it.

### Credential Handling

- Credentials passed in request, not stored
- Transmitted over localhost only (Chrome ↔ binary)
- Used for immediate authentication, then discarded
- Passwords never logged (only username logged)

## Additional Resources

- **Full Documentation**: [NATIVE_MESSAGING_SETUP.md](/Users/ryanwager/anava-camera-extension/NATIVE_MESSAGING_SETUP.md)
- **Chrome Native Messaging**: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- **HTTP Digest Auth**: https://datatracker.ietf.org/doc/html/rfc2617
- **Axis VAPIX API**: https://www.axis.com/vapix-library/

## Support

If you encounter issues:

1. **Check logs**: `~/Library/Logs/anava-camera-proxy.log`
2. **Run test suite**: `./test-native-host.sh`
3. **Test with curl**: Verify camera is accessible
4. **Check manifest**: Ensure extension ID is correct
5. **Rebuild binary**: `./install.sh` to reinstall

For more detailed troubleshooting, see [NATIVE_MESSAGING_SETUP.md](NATIVE_MESSAGING_SETUP.md).
