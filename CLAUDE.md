# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension for discovering Axis cameras on local networks and deploying ACAP applications. Uses TCP port scanning (NOT mDNS) - proven method ported from the Anava Vision Electron installer.

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
# ONE-TIME INSTALL (builds both binaries + sets up LaunchAgent)
./install-proxy.sh

# Manual control (if needed)
./start-proxy.sh   # Start proxy server
./stop-proxy.sh    # Stop proxy server

# Verify running
curl http://127.0.0.1:9876/health   # Should return {"status":"ok"}
ps aux | grep camera-proxy-server   # Check process

# Check logs
tail -f ~/Library/Logs/anava-camera-proxy-server.log  # Proxy server
tail -f ~/Library/Logs/anava-native-host.log          # Native messaging host
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

### UI Flow (popup.js)

Single-page flow with 4 steps:
1. **Scan** - Configure network range + credentials
2. **Select** - Choose discovered cameras
3. **Configure** - Enter license key + Firebase/Gemini config
4. **Deploy** - Upload ACAP + activate + configure

**CRITICAL UI FIX**: Inline `style="display: none;"` in HTML overrides CSS classes. The `goToStep()` function MUST explicitly set `style.display = 'block'` or `'none'` instead of relying on CSS `.active` class. CSS specificity fails when inline styles are present.

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
├── install-proxy.sh                 # ONE-TIME INSTALL (recommended)
├── start-proxy.sh / stop-proxy.sh   # Manual proxy control
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
