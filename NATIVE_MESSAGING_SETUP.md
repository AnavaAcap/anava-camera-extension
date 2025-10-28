# Anava Camera Proxy - Native Messaging Setup Guide

## Overview

The Anava Camera Proxy is a Go-based native messaging host that enables Chrome extensions to communicate with Axis cameras using self-signed certificates, which would otherwise be blocked by browser security policies.

## Architecture

```
Chrome Extension (UI)
  ↓ chrome.runtime.sendNativeMessage('com.anava.camera_proxy', {...})
Go Binary (Native Messaging Host)
  ↓ HTTP/HTTPS with InsecureSkipVerify + Digest Auth
Axis Cameras (192.168.x.x with self-signed certs)
```

## Components

### 1. Go Binary (`native-host/main.go`)
- **Location**: `~/Library/Application Support/Anava/camera-proxy`
- **Function**: HTTP/HTTPS proxy with certificate validation bypass
- **Features**:
  - Chrome native messaging protocol (4-byte length prefix + JSON)
  - Basic and Digest authentication
  - MD5 hash calculation for Digest auth
  - Graceful error handling
  - Comprehensive logging

### 2. Native Messaging Manifest
- **Location**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json`
- **Function**: Tells Chrome how to launch the native host
- **Contains**: Binary path, extension ID whitelist

### 3. Installation Script (`install.sh`)
- Auto-detects extension ID from Chrome profile
- Builds Go binary for both amd64 and arm64
- Creates required directories
- Generates manifest with correct paths
- Tests binary installation
- Provides detailed feedback

## Installation

### Prerequisites
- Go 1.21 or later installed
- Chrome extension installed and visible in `chrome://extensions`
- macOS (Linux/Windows support can be added)

### Steps

1. **Run the installer**:
   ```bash
   cd /Users/ryanwager/anava-camera-extension
   chmod +x install.sh
   ./install.sh
   ```

2. **Reload Chrome extension**:
   - Go to `chrome://extensions`
   - Click the reload icon on "Anava Camera Manager"

3. **Test with a camera**:
   - Open the extension popup
   - Check native host status indicator
   - Try authenticating with a camera

## How It Works

### Message Flow

1. **Chrome Extension Request**:
   ```javascript
   chrome.runtime.sendNativeMessage('com.anava.camera_proxy', {
     url: 'https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi',
     method: 'GET',
     username: 'anava',
     password: 'baton'
   }, (response) => {
     if (response.error) {
       console.error('Error:', response.error);
     } else {
       console.log('Success:', response.data);
     }
   });
   ```

2. **Native Host Processing**:
   - Reads message from stdin (4-byte length + JSON)
   - Attempts Basic authentication first
   - Falls back to Digest authentication if 401
   - Parses WWW-Authenticate header
   - Calculates MD5 response hash
   - Makes authenticated request
   - Returns response via stdout

3. **Digest Authentication**:
   ```
   HA1 = MD5(username:realm:password)
   HA2 = MD5(method:uri)
   Response = MD5(HA1:nonce:HA2)
   Authorization: Digest username="...", realm="...", nonce="...", uri="...", response="..."
   ```

### Chrome Native Messaging Protocol

**Input Format** (stdin):
```
[4 bytes: message length (little-endian uint32)]
[N bytes: JSON message]
```

**Output Format** (stdout):
```
[4 bytes: message length (little-endian uint32)]
[N bytes: JSON response]
```

**Example**:
```
// Input (18 bytes JSON)
12 00 00 00  {"test":"value"}

// Output (25 bytes JSON)
19 00 00 00  {"status":200,"data":{}}
```

## Logging

### Log Location
- **macOS**: `~/Library/Logs/anava-camera-proxy.log`
- **Format**: Timestamped entries with request/response details

### Log Contents
- Startup messages
- Request details (method, URL, username)
- Authentication method used (Basic vs Digest)
- Digest challenge parsing
- MD5 hash calculations
- Response status and body length
- Errors and panics

### Viewing Logs
```bash
# View latest logs
tail -f ~/Library/Logs/anava-camera-proxy.log

# View last 50 lines
tail -50 ~/Library/Logs/anava-camera-proxy.log

# Search for errors
grep -i error ~/Library/Logs/anava-camera-proxy.log
```

## Troubleshooting

### Extension ID Mismatch
**Symptom**: Native host not found error in extension

**Solution**:
1. Get extension ID from `chrome://extensions` (enable Developer mode)
2. Update manifest:
   ```bash
   nano ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json
   ```
3. Change `allowed_origins` to match your extension ID

### Binary Not Executable
**Symptom**: Permission denied errors

**Solution**:
```bash
chmod +x ~/Library/Application\ Support/Anava/camera-proxy
```

### Wrong Architecture
**Symptom**: Binary won't run or crashes

**Solution**:
```bash
cd /Users/ryanwager/anava-camera-extension/native-host
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  GOOS=darwin GOARCH=arm64 go build -o ~/Library/Application\ Support/Anava/camera-proxy main.go
else
  GOOS=darwin GOARCH=amd64 go build -o ~/Library/Application\ Support/Anava/camera-proxy main.go
fi
```

### Digest Authentication Failing
**Symptom**: 401 Unauthorized after native host request

**Solution**:
1. Check logs for MD5 calculation details
2. Verify camera supports Digest authentication:
   ```bash
   curl -I https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi -k
   ```
3. Compare with working curl command:
   ```bash
   curl --digest -u anava:baton https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi -k -v
   ```

### Extension Can't Connect to Native Host
**Symptom**: "Native host not found" error

**Checklist**:
- [ ] Binary exists at path in manifest
- [ ] Binary is executable (`chmod +x`)
- [ ] Manifest exists in NativeMessagingHosts directory
- [ ] Extension ID matches in manifest
- [ ] Chrome extension reloaded after installation
- [ ] No typos in manifest JSON

## Testing

### Test Native Host Directly
```bash
# Create test input file
echo -n '{"url":"https://httpbin.org/get","method":"GET","username":"test","password":"test"}' | \
  python3 -c "import sys, struct; msg = sys.stdin.buffer.read(); sys.stdout.buffer.write(struct.pack('I', len(msg)) + msg)" | \
  ~/Library/Application\ Support/Anava/camera-proxy | \
  python3 -c "import sys, struct, json; length = struct.unpack('I', sys.stdin.buffer.read(4))[0]; print(json.dumps(json.loads(sys.stdin.buffer.read(length)), indent=2))"
```

### Test with Real Camera
```javascript
// In Chrome DevTools console (on extension popup page)
chrome.runtime.sendNativeMessage('com.anava.camera_proxy', {
  url: 'https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi',
  method: 'GET',
  username: 'anava',
  password: 'baton'
}, (response) => {
  console.log('Response:', response);
});
```

### Test Digest Authentication
```bash
# Working curl command for comparison
curl --digest -u anava:baton https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi -k -v
```

## Development

### Building Manually
```bash
cd /Users/ryanwager/anava-camera-extension/native-host

# macOS Intel
GOOS=darwin GOARCH=amd64 go build -o camera-proxy-amd64 main.go

# macOS Apple Silicon
GOOS=darwin GOARCH=arm64 go build -o camera-proxy-arm64 main.go

# Linux
GOOS=linux GOARCH=amd64 go build -o camera-proxy-linux main.go

# Windows
GOOS=windows GOARCH=amd64 go build -o camera-proxy.exe main.go
```

### Code Structure
```go
main()
  ├─ readMessage() - Parse Chrome native messaging input
  ├─ makeRequest()
  │  ├─ tryBasicAuth() - Attempt Basic authentication
  │  └─ tryDigestAuth() - Parse challenge and calculate Digest response
  │     ├─ parseDigestChallenge() - Extract realm, nonce, qop, etc.
  │     └─ calculateDigestAuth() - MD5 hash calculations
  └─ sendMessage() - Write Chrome native messaging output
```

### Key Functions

**readMessage()**:
- Reads 4-byte length prefix (little-endian)
- Reads N bytes of JSON
- Parses into Request struct

**tryDigestAuth()**:
- Makes initial request to get WWW-Authenticate header
- Parses Digest challenge (realm, nonce, algorithm, qop, opaque)
- Calculates HA1 = MD5(username:realm:password)
- Calculates HA2 = MD5(method:uri)
- Calculates response = MD5(HA1:nonce:HA2) or with qop/nc/cnonce
- Builds Authorization header
- Makes authenticated request

**sendMessage()**:
- Marshals Response struct to JSON
- Writes 4-byte length prefix (little-endian)
- Writes N bytes of JSON

## Security Considerations

### Certificate Validation Bypass
The binary uses `InsecureSkipVerify: true` to allow self-signed certificates. This is acceptable because:
- Cameras are on local network (192.168.x.x)
- Alternative would require installing each camera's cert in system trust store
- Communication is still encrypted (HTTPS)

**DO NOT** use this proxy for public internet requests.

### Extension ID Whitelist
The manifest's `allowed_origins` field restricts which extensions can use the native host. Only your specific extension ID can communicate with it.

### Credential Handling
- Credentials are passed in request, not stored
- Transmitted over localhost (Chrome <-> binary)
- Used for immediate authentication, then discarded
- Logged as username only (password never logged)

## Chrome Extension Integration

### manifest.json
```json
{
  "permissions": [
    "nativeMessaging"
  ]
}
```

### Usage Example
```typescript
interface NativeRequest {
  url: string;
  method: string;
  username: string;
  password: string;
  body?: any;
}

interface NativeResponse {
  status?: number;
  data?: any;
  error?: string;
}

async function makeAuthenticatedRequest(
  url: string,
  method: string,
  username: string,
  password: string,
  body?: any
): Promise<any> {
  return new Promise((resolve, reject) => {
    const request: NativeRequest = {
      url,
      method,
      username,
      password,
      ...(body && { body })
    };

    chrome.runtime.sendNativeMessage(
      'com.anava.camera_proxy',
      request,
      (response: NativeResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        resolve(response.data);
      }
    );
  });
}

// Usage
try {
  const result = await makeAuthenticatedRequest(
    'https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi',
    'GET',
    'anava',
    'baton'
  );
  console.log('Camera info:', result);
} catch (error) {
  console.error('Request failed:', error);
}
```

## References

- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [HTTP Digest Authentication (RFC 2617)](https://datatracker.ietf.org/doc/html/rfc2617)
- [Axis Camera VAPIX API](https://www.axis.com/vapix-library/)

## Support

For issues or questions:
1. Check logs: `~/Library/Logs/anava-camera-proxy.log`
2. Review this documentation
3. Test with curl command to verify camera accessibility
4. Check Chrome's native messaging errors in extension DevTools
