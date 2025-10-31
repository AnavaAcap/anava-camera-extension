# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NEW ARCHITECTURE (v2.0+)**: Chrome extension is now a **simple bridge** between the web app and local network. All UI, deployment logic, and state management happens in the Anava web deployer (anava-infrastructure-deployer).

**Extension Purpose**: Connection indicator + link to web app. Shows green/red status based on proxy server availability.

## Build & Development Commands

```bash
# Build extension (compiles TypeScript + copies static files)
npm run build

# Watch mode for development
npm run watch
# or
npm run dev

# Load extension in Chrome
# 1. Build first: npm run build
# 2. Navigate to chrome://extensions/
# 3. Enable "Developer mode"
# 4. Click "Load unpacked"
# 5. Select the anava-camera-extension directory (NOT the dist/ folder)
```

**CRITICAL**: The extension loads from the root directory, NOT from `dist/`. The manifest.json in the root references scripts in `dist/`.

## Proxy Server Architecture (CRITICAL)

**THE SOLUTION TO CHROME SANDBOX RESTRICTIONS**:

Chrome's sandbox prevents native messaging hosts from accessing local network devices. The working solution uses a **two-tier proxy architecture**:

```
Chrome Extension (sandboxed)
  ↓ Native Messaging (stdio)
Native Host (sandboxed, localhost-only)
  ↓ HTTP (127.0.0.1:9876/proxy)
Proxy Server (user-launched, full network access)
  ↓ HTTPS + Digest Auth
Camera (192.168.x.x)
```

### Setup Commands

```bash
# ONE-TIME INSTALL (builds proxy binary)
./install-proxy.sh

# Start/Stop Proxy (Manual Control)
./start-proxy.sh   # Start proxy in background
./stop-proxy.sh    # Stop proxy

# Why manual instead of LaunchAgent?
# macOS LaunchAgent processes have network restrictions that prevent
# them from accessing local network devices (192.168.x.x). The proxy
# works perfectly when launched manually from Terminal.
# See NETWORK_ISSUE_RESOLVED.md for technical details.

# Verify proxy is running
curl http://127.0.0.1:9876/health   # Should return {"status":"ok"}

# Test with specific camera
curl -X POST http://127.0.0.1:9876/proxy \
  -H "Content-Type: application/json" \
  -d '{"url":"https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi","method":"POST","username":"anava","password":"baton","body":{"apiVersion":"1.0","method":"getProperties","params":{"propertyList":["Brand"]}}}'

# Check logs
tail -f ~/Library/Logs/anava-camera-proxy-server.log

# Check proxy PID
cat ~/Library/Application\ Support/Anava/proxy.pid
```

### Why This Architecture?

**Chrome Sandbox Limitation**: Native messaging hosts launched by Chrome CANNOT access local network (192.168.x.x), even though they can reach public internet (httpbin.org).

**Solution**: Proxy server runs as user-launched process (via LaunchAgent), which has full network access. Native host connects to localhost:9876, which is allowed by Chrome.

## Architecture

### Discovery Flow: TCP Scanning (NOT mDNS)

```
1. Calculate IP range from CIDR (e.g., 192.168.50.0/24)
2. TCP port scan (HTTPS:443 only for browser security)
3. VAPIX endpoint validation (/axis-cgi/basicdeviceinfo.cgi)
4. HTTP Digest authentication
5. Firmware version check (>= 11.11.0)
6. Device type detection (cameras only, filter speakers/intercoms)
```

**Key Files**:
- `src/services/CameraDiscovery.ts` - Network scanning + VAPIX validation
- `src/services/CameraAuthentication.ts` - Dual-mode auth (native host → background worker)
- `src/services/AdaptiveScanConfig.ts` - Dynamic batch sizing based on network performance
- `src/types/Camera.ts` - Camera interfaces + device type detection

### Authentication Pattern (CRITICAL - Ported from Electron)

**Source**: `/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/cameraAuthentication.ts`

The proxy server (`proxy-server/main.go`) implements the EXACT authentication pattern from the Electron app:

**Step 1**: ONE unauthenticated request first (3s timeout)
```go
// Fast test - if timeout/refused, not a camera
resp, err := tryUnauthenticatedRequest(req)
if isTimeoutError(err) || isConnectionRefusedError(err) {
    return error  // Fail fast - saves 10-18x time vs trying auth
}
```

**Step 2**: Protocol-based auth ONLY if 401 received
```go
if resp.Status == 401 {
    if protocol == "https" {
        // HTTPS: Try Basic first, then Digest
        tryBasicAuth() -> tryDigestAuth()
    } else {
        // HTTP: Try Digest first, then Basic
        tryDigestAuth() -> tryBasicAuth()
    }
}
```

**CRITICAL FIX**: Digest auth must send JSON body in BOTH requests:
1. Challenge request (to get WWW-Authenticate header)
2. Authenticated request (with Authorization header + **body**)

Missing body in step 2 caused "JSON syntax error" from camera.

### UI Flow (popup.js) - NEW SIMPLIFIED VERSION

**Connection Indicator Only**:
1. Shows **green dot** if proxy server responds to `/health` endpoint
2. Shows **red dot** if proxy server is not running
3. Displays clickable link to web app (default: http://localhost:5173)
4. Auto-refreshes status every 5 seconds
5. Shows setup instructions if not connected

**No deployment UI** - all camera scanning, selection, and deployment happens in the web app.

### Components

**1. Proxy Server** (`proxy-server/main.go`)
- User-launched process with full network access
- Listens on `127.0.0.1:9876/proxy`
- Implements exact Electron authentication pattern
- Handles self-signed certificates with `InsecureSkipVerify`

**2. Native Messaging Host** (`native-host-proxy/main.go`)
- Chrome-launched, sandboxed (localhost-only)
- Forwards requests to proxy server via HTTP
- Simple passthrough - no auth logic

**3. Extension** (`src/services/CameraAuthentication.ts`)
- Sends requests via Native Messaging
- Parses device info from responses
- Filters by device type (cameras only)

**Message Format** (Chrome → Native Host → Proxy):
```json
{
  "url": "https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "anava",
  "password": "baton",
  "body": {
    "apiVersion": "1.0",
    "method": "getProperties",
    "params": {
      "propertyList": ["Brand", "ProdType", "ProdNbr", "ProdFullName", "SerialNumber"]
    }
  }
}
```

## Ported Code Reference

All code ported from:
```
/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/
├── cameraAuthentication.ts (lines 58-581)
├── cameraDiscoveryService.ts (lines 84-631)
├── adaptiveScanConfig.ts (lines 1-232)
└── fastNetworkScanner.ts (getDeviceType function)
```

**Key Differences from Electron Version**:
- Browser security: HTTPS-only (Chrome blocks HTTP by default)
- No Node.js net.Socket: Uses fetch() + XMLHttpRequest
- Native messaging host replaces Electron's TLS bypass
- No mDNS: TCP scanning only (works in any browser)

## Scan Performance

**Adaptive Batch Sizing** (automatically adjusts based on network performance):

| Intensity    | Initial Batch | Max Batch | Timeout | Inter-batch Delay |
|-------------|---------------|-----------|---------|-------------------|
| Conservative | 15            | 30        | 7000ms  | 100ms            |
| Balanced     | 30            | 80        | 5000ms  | 50ms             |
| Aggressive   | 50            | 150       | 3000ms  | 20ms             |

**Typical Scan Times** (192.168.x.0/24 = 254 IPs):
- Conservative: ~3-5 minutes
- Balanced: ~1-2 minutes
- Aggressive: ~30-60 seconds

**Batch size adjusts based on**:
- Error rate (reduces size if > 5%)
- Timeout rate (reduces size immediately)
- Response time (increases if < 1000ms and < 2% errors)

## Device Type Detection

Based on Axis model number prefix:

```typescript
// src/types/Camera.ts - getDeviceType()
M, P, Q = Camera ✅
C = Speaker ❌
I = Intercom ❌
A = Access Control ❌
```

Only cameras are returned from discovery.

## Firmware Support

**Minimum**: 11.11.0 (OS11)

- ✅ Firmware 11.x >= 11.11.0 (OS11)
- ✅ Firmware 12.x (OS12)
- ❌ Firmware 10.x (OS10) - UNSUPPORTED
- ❌ Firmware 11.x < 11.11.0 - UNSUPPORTED

Unsupported cameras are filtered during discovery.

## ACAP Deployment (In Progress)

**File**: `src/services/AcapDeploymentService.ts`

**Flow** (ported from Electron installer):
1. Fetch manifest from GCS (version + download URLs)
2. Select correct ACAP variant (OS11/OS12 + armv7hf/aarch64)
3. Download ACAP file (.eap)
4. Upload to camera via VAPIX
5. Activate license key
6. Push SystemConfig (Firebase + Gemini config)
7. Start application

**TODO**: Complete deployment implementation (currently stubs)

## TypeScript Configuration

- **Target**: ES2020
- **Module**: ES2020 (ESM)
- **Output**: `dist/`
- **Types**: Chrome extension API types (`@types/chrome`)

**Important**: All imports must use `.js` extension (even though source is `.ts`):
```typescript
import { Camera } from '../types/Camera.js'; // ✅ Correct
import { Camera } from '../types/Camera.ts'; // ❌ Wrong
```

## Debugging

### Browser Console Logs

Enable verbose logging:
```javascript
// In popup.js or background.js
console.log('[CameraAuth] ...') // Authentication logs
console.log('[Scanner] ...') // Network scanning logs
console.log('🎯 TARGET IP ...') // Special IP tracking
```

### Common Issues

**No cameras found**:
1. Verify network range matches your subnet
2. Check credentials (default: `anava`/`baton`)
3. Ensure cameras are HTTPS-enabled (port 443)
4. Check browser console for certificate errors
5. Install native host if seeing TLS errors

**Native host not working**:
1. Run `./install.sh` to install
2. Verify extension ID matches in manifest
3. Check logs: `~/Library/Logs/anava-camera-proxy.log`
4. Reload extension at `chrome://extensions`

**Scan too slow**:
1. Increase intensity to "Aggressive"
2. Use smaller network range (/26 or /27)
3. Use quick scan for known IPs

**Service worker timeout**:
- Background worker sleeps after 30 seconds
- `sendMessageWithTimeout()` wakes it up before auth requests
- Check background.js logs in extension service worker console

## Testing Single Camera

```javascript
// In browser console with extension popup open
// Test specific IP directly (bypasses full network scan)
const testIp = '192.168.50.156';
const camera = await discoveryService.debugTestSpecificIP(
  testIp,
  'anava',
  'baton'
);
```

Or use "Debug: Test .156" button in UI.

## File Structure

```
anava-camera-extension/
├── manifest.json                    # Chrome extension manifest v3
├── package.json                     # NPM scripts + dependencies
├── tsconfig.json                    # TypeScript configuration
├── popup.html/css/js                # Extension UI
├── background.js                    # Service worker
├── install-local-connector.sh       # ONE-TIME INSTALL (recommended)
├── test-proxy.sh                    # Test suite for proxy validation
├── com.anava.local-connector-extension.plist  # LaunchAgent configuration
├── src/
│   ├── services/
│   │   ├── CameraAuthentication.ts  # Native messaging client
│   │   ├── CameraDiscovery.ts       # TCP scanning + VAPIX
│   │   ├── AdaptiveScanConfig.ts    # Dynamic batch sizing
│   │   └── AcapDeploymentService.ts # ACAP deployment (WIP)
│   └── types/
│       └── Camera.ts                # Camera interfaces + device type detection
├── proxy-server/
│   ├── main.go                      # LOCAL PROXY (full network access)
│   └── go.mod                       # Go dependencies
├── native-host-proxy/
│   ├── main.go                      # CHROME NATIVE HOST (localhost-only)
│   └── (no go.mod - single file)
└── dist/                            # Build output (git ignored)
```

## Extension Loading

**CRITICAL**: Load the ROOT directory in Chrome, NOT `dist/`:
- Chrome loads `manifest.json` from root
- Manifest references scripts in `dist/` (created by build)
- TypeScript source in `src/` is compiled to `dist/`
- Static files (HTML/CSS/background.js) are copied to `dist/`

## Troubleshooting Common Issues

### Proxy Server Not Starting

**Symptom**: `curl http://127.0.0.1:9876/health` fails or returns connection refused

**Solutions**:
1. Check if another process is using port 9876: `lsof -i :9876`
2. Check error logs: `tail -20 ~/Library/Logs/anava-local-connector-error.log`
3. Verify binary exists: `ls -lh build/local-connector`
4. Try manual start: `./build/local-connector` (should print "listening on...")
5. Reinstall: `./install-local-connector.sh`

### Camera Scanning Returns 0 Cameras

**Symptom**: Network scan completes but finds no cameras

**Solutions**:
1. **Verify proxy is running**: `./test-proxy.sh`
2. **Check network range**: Are cameras on the same subnet you're scanning?
   - Find your Mac's IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - Example: If Mac is 192.168.50.10, scan 192.168.50.0/24
3. **Test specific camera**: `./test-proxy.sh 192.168.50.156 anava baton`
4. **Check camera connectivity**: `ping 192.168.50.156`
5. **Verify credentials**: Default is `anava`/`baton`
6. **Check proxy logs**: `tail -f ~/Library/Logs/anava-local-connector.log`
   - Look for "no route to host" (wrong network)
   - Look for "timeout" (camera offline)
   - Look for "401" (wrong credentials)

### HTTP 500 Errors During Scan

**Symptom**: Background console shows "HTTP 500" errors

**Root Cause**: Proxy is forwarding camera connection errors (timeouts, refused connections)

**Solutions**:
1. These are EXPECTED for IPs without cameras
2. Only worry if ALL IPs return 500
3. Check proxy logs to see actual camera errors
4. If many "no route to host": wrong network range
5. If many "timeout": cameras may be on different subnet

### Extension Shows Red Dot (Disconnected)

**Symptom**: Extension popup shows red status indicator

**Solutions**:
1. Run installation: `./install-local-connector.sh`
2. Reload extension at chrome://extensions
3. Check LaunchAgent: `launchctl list | grep anava`
4. Verify proxy health: `curl http://127.0.0.1:9876/health`

### LaunchAgent Not Loading

**Symptom**: `launchctl list | grep anava` returns nothing

**Solutions**:
1. Check plist exists: `ls ~/Library/LaunchAgents/com.anava.local-connector-extension.plist`
2. Validate plist: `plutil ~/Library/LaunchAgents/com.anava.local-connector-extension.plist`
3. Check permissions: plist should be readable
4. Manual load: `launchctl load ~/Library/LaunchAgents/com.anava.local-connector-extension.plist`
5. Check logs for LaunchAgent errors: `tail ~/Library/Logs/anava-local-connector-error.log`

### Proxy Crashes or Restarts Frequently

**Symptom**: PID keeps changing, logs show crashes

**Solutions**:
1. Check error log: `tail -50 ~/Library/Logs/anava-local-connector-error.log`
2. Look for Go panics or fatal errors
3. Verify Go version: `go version` (should be 1.19+)
4. Rebuild proxy: `cd proxy-server && go build -o ../build/local-connector main.go`
5. Check system resources: `top` (memory/CPU issues)

## Key Learnings (For Future Sessions)

### 1. Chrome Sandbox Restriction
- Native messaging hosts launched by Chrome CANNOT access local network (192.168.x.x)
- They CAN access public internet (httpbin.org)
- Solution: User-launched proxy server on localhost

### 2. Authentication Pattern Must Match Electron EXACTLY
- Source: `/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/cameraAuthentication.ts`
- Step 1: ONE unauthenticated request (3s timeout) - fail fast if no response
- Step 2: Protocol-based auth only if 401 (HTTPS→Basic first, HTTP→Digest first)
- Performance: 10-18x faster than trying all auth methods on every IP

### 3. Digest Auth Body Handling
- **CRITICAL**: Must send JSON body in BOTH challenge AND authenticated requests
- Challenge request gets WWW-Authenticate header
- Authenticated request must include same body + Authorization header
- Missing body causes "JSON syntax error" from camera

### 4. Device Type Detection
- Parse `ProdNbr` field from camera response (e.g., "M3215-LVE")
- First letter determines type: M/P/Q=camera, C=speaker, I=intercom, A=access-control
- Filter non-cameras before returning results

### 5. Testing
```bash
# Test proxy directly
curl -X POST http://127.0.0.1:9876/proxy -H "Content-Type: application/json" \
  -d '{"url":"https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi","method":"POST","username":"anava","password":"baton","body":{"apiVersion":"1.0","method":"getProperties","params":{"propertyList":["Brand","ProdType","ProdNbr","ProdFullName","SerialNumber"]}}}'

# Should return HTTP 200 with camera details, NOT "JSON syntax error"
```

## Next Development Tasks

- Complete ACAP deployment implementation
- License activation flow
- Camera configuration (Firebase + Gemini config push)
- Batch deployment progress tracking
- Enhanced camera management (save/export/import)
