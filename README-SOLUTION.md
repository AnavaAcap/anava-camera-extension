# Anava Camera Extension - Working Solution

## Overview

Chrome extension for authenticating with Axis cameras on local networks. Uses a local HTTP proxy to bypass Chrome's native messaging sandbox restrictions on macOS.

## Problem Solved

Chrome native messaging hosts on macOS cannot access local networks (RFC1918 addresses) due to:
1. Chrome's sandboxing of child processes
2. macOS network restrictions on background services

**Solution**: Local HTTP proxy server that runs with full network access, allowing the Chrome extension to communicate with cameras via localhost.

## Architecture

```
Chrome Extension (UI)
     ↓ Native Messaging (stdio)
Native Messaging Host (sandboxed, localhost only)
     ↓ HTTP POST (http://127.0.0.1:9876/proxy)
Local Proxy Server (full network access)
     ↓ HTTPS + Digest Auth
Axis Camera (192.168.50.156:443)
```

## Installation

```bash
# 1. Install and build components
./install-proxy.sh

# This will:
# - Build native messaging host
# - Build proxy server
# - Install to ~/Library/Application Support/Anava/
# - Configure Chrome native messaging manifest
```

## Usage

### Start Proxy Server

```bash
./start-proxy.sh
```

This starts the proxy server in the background. You'll see:
```
✓ Proxy server started successfully (PID: XXXX)
```

### Load Chrome Extension

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select this directory

### Test Camera Authentication

1. Click the extension icon
2. Extension will connect to localhost proxy
3. Proxy forwards requests to camera
4. Authentication succeeds!

### Stop Proxy Server

```bash
./stop-proxy.sh
```

## Components

### 1. Proxy Server (`proxy-server/main.go`)
- HTTP server on localhost:9876
- Accepts camera requests from native host
- Implements Basic and Digest authentication
- Has full network access (no sandbox)

### 2. Native Messaging Host (`native-host-proxy/main.go`)
- Launched by Chrome
- Connects to localhost proxy only
- Forwards messages between extension and proxy

### 3. Chrome Extension
- UI for camera discovery/authentication
- Communicates via Chrome native messaging
- No network restrictions (localhost allowed)

## Testing

### Test Proxy Server Health
```bash
curl http://127.0.0.1:9876/health
# Should return: {"status":"ok"}
```

### Test Camera Connection
```bash
curl -X POST http://127.0.0.1:9876/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://192.168.50.156/axis-cgi/param.cgi?action=list",
    "method": "GET",
    "username": "anava",
    "password": "baton"
  }'
```

## Logs

- Proxy Server: `~/Library/Logs/anava-camera-proxy-server.log`
- Native Host: `~/Library/Logs/anava-native-host.log`

## Troubleshooting

### Proxy server won't start
```bash
# Check if port is already in use
lsof -i :9876

# View logs
tail -f ~/Library/Logs/anava-camera-proxy-server.log
```

### Chrome extension can't connect
1. Verify proxy is running: `curl http://127.0.0.1:9876/health`
2. Check extension ID matches manifest: `chrome://extensions/`
3. Look at Chrome DevTools console in extension popup

### Camera authentication fails
1. Verify camera is reachable: `ping 192.168.50.156`
2. Test with curl (see Testing section above)
3. Check credentials are correct

## Technical Details

### Why This Approach?

**Attempted Solutions:**
1. ❌ Direct native messaging host → Blocked by Chrome sandbox
2. ❌ LaunchAgent background service → Blocked by macOS network restrictions
3. ✅ User-launched proxy server → Full network access, works!

**Key Insight:** Processes launched directly by users have full network access, while background services (LaunchAgent) and Chrome child processes are sandboxed.

### Alternative Solutions

1. **Code Signing with Network Entitlements** (requires Apple Developer account $99/year):
   - Sign binary with `com.apple.security.network.client` entitlement
   - Can use LaunchAgent for automatic startup
   - Professional solution for distribution

2. **Electron App** (already exists and works):
   - Located at: `/Users/ryanwager/anava-infrastructure-deployer`
   - No sandboxing issues
   - Full network access
   - Larger app size but better UX

3. **Safari Extension**:
   - Different sandbox model
   - May allow local network with proper entitlements
   - Would require extension rewrite

## Status

✅ **Working Solution Implemented**

- Proxy server successfully connects to cameras
- Native messaging host communicates with proxy
- Chrome extension UI functional
- Authentication (Basic + Digest) implemented
- Easy start/stop scripts provided

## Files

- `proxy-server/main.go` - Local HTTP proxy with camera auth
- `native-host-proxy/main.go` - Chrome native messaging client
- `install-proxy.sh` - Installation script
- `start-proxy.sh` - Start proxy server
- `stop-proxy.sh` - Stop proxy server
- `SOLUTION.md` - Detailed technical analysis
- `HANDOFF.md` - Session history and debugging notes

## Next Steps

1. **For Development**: Use `./start-proxy.sh` before testing extension
2. **For Distribution**: Consider code signing with network entitlements
3. **For Production**: May want to use existing Electron app instead

## See Also

- `SOLUTION.md` - Complete technical analysis of the problem and solutions
- `HANDOFF.md` - Debugging history and root cause analysis
- Working Electron implementation: `/Users/ryanwager/anava-infrastructure-deployer`
