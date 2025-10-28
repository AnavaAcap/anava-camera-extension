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

## Native Messaging Host Setup

The extension requires a native messaging host for HTTPS camera authentication (bypasses self-signed certificate issues).

```bash
# Install native messaging host (macOS only)
./install.sh

# Verify installation
ls ~/Library/Application\ Support/Anava/camera-proxy
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json

# Check logs
tail -f ~/Library/Logs/anava-camera-proxy.log
```

**Why Native Host is Required**:
- Chrome blocks HTTPS requests to self-signed certificates
- Background service worker shows NET::ERR_CERT_AUTHORITY_INVALID
- Native host (Go binary) bypasses browser TLS validation
- Falls back to background worker if native host unavailable

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

### Authentication Architecture

**Dual-mode authentication** (with automatic fallback):

```
1. Try native messaging host (preferred)
   ├─ Bypasses browser TLS validation
   ├─ No certificate errors
   └─ Direct Go → camera HTTP requests

2. Fallback to background service worker
   ├─ Uses fetch() with self-signed cert warnings
   ├─ May show NET::ERR_CERT_AUTHORITY_INVALID
   └─ HTTP Digest auth implementation in JavaScript
```

**Implementation**: `src/services/CameraAuthentication.ts`
- `isNativeHostAvailable()` - Checks for native host
- `makeNativeRequest()` - Native messaging communication
- `testSinglePortAuthBackground()` - Fallback method

### UI Flow (popup.js)

Single-page flow with 4 steps:
1. **Scan** - Configure network range + credentials
2. **Select** - Choose discovered cameras
3. **Configure** - Enter license key + Firebase/Gemini config
4. **Deploy** - Upload ACAP + activate + configure

### Native Host (Go Binary)

**Location**: `native-host/main.go`

**Purpose**: Proxy for HTTPS requests with self-signed certificates
- Accepts messages via Chrome Native Messaging (stdio)
- Makes HTTP/HTTPS requests with custom TLS config
- Returns status + response data to extension

**Message Format**:
```json
{
  "url": "https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "anava",
  "password": "baton",
  "body": { ... }
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
├── manifest.json              # Chrome extension manifest v3
├── package.json               # NPM scripts + dependencies
├── tsconfig.json              # TypeScript configuration
├── popup.html/css/js          # Extension UI
├── background.js              # Service worker (auth handling)
├── install.sh                 # Native host installer (macOS)
├── src/
│   ├── services/
│   │   ├── CameraAuthentication.ts   # Dual-mode auth
│   │   ├── CameraDiscovery.ts        # TCP scanning + VAPIX
│   │   ├── AdaptiveScanConfig.ts     # Dynamic batch sizing
│   │   └── AcapDeploymentService.ts  # ACAP deployment (WIP)
│   └── types/
│       └── Camera.ts                  # Camera interfaces
├── native-host/
│   ├── main.go                # Native messaging host (Go)
│   └── go.mod                 # Go dependencies
└── dist/                      # Build output (git ignored)
```

## Extension Loading

**CRITICAL**: Load the ROOT directory in Chrome, NOT `dist/`:
- Chrome loads `manifest.json` from root
- Manifest references scripts in `dist/` (created by build)
- TypeScript source in `src/` is compiled to `dist/`
- Static files (HTML/CSS/background.js) are copied to `dist/`

## Next Development Tasks

See README.md TODO section for:
- Complete ACAP deployment implementation
- License activation flow
- Camera configuration (Firebase + Gemini config push)
- Batch deployment progress tracking
- Enhanced camera management (save/export/import)
