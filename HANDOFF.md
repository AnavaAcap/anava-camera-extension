# Chrome Extension Camera Authentication - Session Handoff

## Current Status: BLOCKED - Network Connectivity Issue

### Problem
Chrome extension cannot authenticate with Axis camera at 192.168.50.156:443 despite having a working Go native messaging host.

**Critical Error**: `dial tcp 192.168.50.156:443: connect: no route to host`

This occurs ONLY when Chrome launches the Go binary - direct execution works perfectly.

## What Works ✅
1. **Direct Go binary test**:
   ```bash
   cd /Users/ryanwager/anava-camera-extension
   ./test-camera-direct.sh
   # Result: ✅ 200 OK with Digest auth
   ```

2. **Network connectivity**:
   ```bash
   ping 192.168.50.156          # ✅ Works
   nc -zv 192.168.50.156 443    # ✅ Port open
   ```

3. **Legacy Electron installer**: `/Users/ryanwager/anava-infrastructure-deployer` successfully authenticates with same camera using:
   - File: `src/main/services/camera/cameraService.ts`
   - Uses Axios with `httpsAgent` that has `rejectUnauthorized: false`
   - Implements Digest auth fallback

## What Doesn't Work ❌
When Chrome extension calls the Go binary via native messaging, it gets "no route to host" despite:
- Network diagnostics showing camera is reachable in `init()`
- Retry logic (3 attempts with exponential backoff)
- Custom HTTP dialer with detailed logging
- Same credentials (anava/baton)

## Key Evidence from Logs

### Startup Diagnostics (15:01:51)
```
Interface: en0 (flags: up|broadcast|multicast|running)
  Address: 192.168.50.239/24
Testing network connectivity to 192.168.50.156...
✅ DNS lookup succeeded: [192.168.50.156]
❌ TCP dial to 192.168.50.156:443 failed: dial tcp 192.168.50.156:443: connect: no route to host
```

**THE ISSUE**: Network diagnostic test ITSELF fails with "no route to host" when binary starts via Chrome.

### All Retry Attempts Fail (15:01:51 - 15:02:01)
- Basic auth attempt 1: ❌ no route to host
- Basic auth attempt 2 (after 2s): ❌ no route to host
- Basic auth attempt 3 (after 3s): ❌ no route to host
- Digest auth attempt 1: ❌ no route to host
- Digest auth attempt 2 (after 2s): ❌ no route to host
- Digest auth attempt 3 (after 3s): ❌ no route to host

Total timeout: ~10 seconds (matches Chrome extension timeout)

## Root Cause Theory
**Chrome sandboxes or restricts native messaging host network access on macOS.**

Evidence:
1. Same binary works when run directly from terminal
2. Same binary can reach httpbin.org (external internet) when launched by Chrome
3. Same binary CANNOT reach 192.168.50.156 (local network) when launched by Chrome

This suggests **local network access is being blocked** when Chrome launches the binary, but internet access is allowed.

## Why This Matters
The entire fucking point was to avoid Electron. But Chrome extensions appear to have a fundamental limitation accessing local network devices via native messaging hosts on macOS.

## Comparison with Working Electron Implementation

### Electron Installer (WORKS)
Location: `/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/cameraService.ts`

**Key code**:
```typescript
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,  // Accept self-signed certs
  timeout: 10000
});

const axiosInstance = axios.create({
  httpsAgent,
  timeout: 10000,
  validateStatus: () => true  // Don't throw on any status
});

// Tries Basic auth first
let response = await axiosInstance.post(url, body, {
  auth: { username, password }
});

// Falls back to Digest auth if 401
if (response.status === 401) {
  const authHeader = response.headers['www-authenticate'];
  const digestAuth = calculateDigestAuth(username, password, authHeader, method, path);
  response = await axiosInstance.post(url, body, {
    headers: { 'Authorization': digestAuth }
  });
}
```

**Why it works**: Electron main process has full Node.js access, no sandboxing.

### Chrome Extension + Go Binary (FAILS)
- Chrome launches Go binary via native messaging
- Go binary has `InsecureSkipVerify: true` for TLS
- Go binary implements same Digest auth logic
- **But cannot connect to local network device**

## Possible Solutions (Not Tried Yet)

### Option 1: macOS Permissions
Check if Go binary needs explicit network permissions:
```bash
# Check if binary is blocked by macOS firewall
/usr/libexec/ApplicationFirewall/socketfilterfw --getblockall

# Check app-specific firewall rules
/usr/libexec/ApplicationFirewall/socketfilterfw --getappblocked ~/Library/Application\ Support/Anava/camera-proxy
```

### Option 2: Chrome Native Messaging Permissions
Research if Chrome requires manifest permissions for native host to access local network.

### Option 3: Network Routing Issue
Investigate if Chrome uses different network routing table for child processes. The feth3857 interface shows 192.168.114.137/23 - maybe routing conflict?

### Option 4: Just Use Fucking Electron
The Electron installer works perfectly. Stop trying to reinvent the wheel with Chrome extensions.

## Files to Review

### Working Electron Implementation
- `/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/cameraService.ts` - Main camera service
- `/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/digestAuth.ts` - Digest auth implementation
- `/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/cameraDiscovery.ts` - Network scanning

### Chrome Extension (Not Working)
- `/Users/ryanwager/anava-camera-extension/native-host/main.go` - Go native messaging host
- `/Users/ryanwager/anava-camera-extension/src/services/CameraAuthentication.ts` - Auth logic
- `/Users/ryanwager/anava-camera-extension/src/services/CameraDiscovery.ts` - Discovery logic
- `/Users/ryanwager/anava-camera-extension/manifest.json` - Extension permissions

### Test Scripts
- `/Users/ryanwager/anava-camera-extension/test-camera-direct.sh` - Tests Go binary directly (WORKS)
- `/Users/ryanwager/anava-camera-extension/install.sh` - Installs native messaging host

## Logs
- Go binary logs: `~/Library/Logs/anava-camera-proxy.log`
- Chrome extension console: DevTools on popup.html

## Camera Details
- IP: 192.168.50.156
- Port: 443 (HTTPS with self-signed cert)
- Auth: Digest (username: anava, password: baton)
- Endpoint: `/axis-cgi/basicdeviceinfo.cgi`
- Network: 192.168.50.0/24
- Dev machine IP: 192.168.50.239

## Extension Details
- Extension ID: `ojhdgnojgelfiejpgipjddfddgefdpfa`
- Native host: `com.anava.camera_proxy`
- Binary location: `~/Library/Application Support/Anava/camera-proxy`
- Manifest location: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json`

## Next Session Should
1. **Debug macOS firewall settings** - Check if Go binary is being blocked
2. **Compare network access** - Why can Go binary reach httpbin.org but not 192.168.50.156?
3. **Research Chrome sandboxing** - Does Chrome restrict local network access for native messaging hosts?
4. **Consider alternatives**:
   - Electron app (already works)
   - Safari extension (different sandboxing model)
   - Web app with native companion app
5. **If all else fails**: Accept that Chrome extensions cannot reliably access local network devices via native messaging on macOS

## User Frustration Level
🔥🔥🔥🔥🔥 **MAXIMUM**

User has working Electron implementation right fucking there in `/Users/ryanwager/anava-infrastructure-deployer` but wanted Chrome extension for convenience. After hours of debugging, Chrome's sandboxing appears to be a fundamental blocker.

**Key user quote**: "you obviously can't figure out how to authenticate to these cameras even though the fucking electron app literally shows you how"

**Reality**: The authentication logic is identical. The problem is network access, not authentication.
