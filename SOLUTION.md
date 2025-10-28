# Chrome Extension Camera Authentication - Solution

## Problem Identified

Chrome native messaging hosts on macOS are restricted by **TWO layers of sandboxing**:

1. **Chrome's sandbox** - Blocks native messaging hosts from accessing local network (RFC1918 addresses)
2. **macOS LaunchAgent sandbox** - Background processes launched by LaunchAgents have network restrictions

## Evidence

### What Works ✅
- Go binary run directly from terminal: **Can access camera**
- curl from terminal: **Can access camera**
- Simple test programs: **Can access camera**

### What Fails ❌
- Native messaging host launched by Chrome: **No route to host**
- Go binary launched via LaunchAgent: **No route to host**

### Key Discovery
When the proxy server binary is run **directly from terminal** (not LaunchAgent), it successfully connects to the camera and returns HTTP 200.

## Root Cause

macOS applies network sandboxing to processes launched by LaunchAgents. This is by design to limit what background services can access.

## Solution Options

### Option A: Use Direct Launch (Not LaunchAgent) ✅ RECOMMENDED
Instead of LaunchAgent, have the user start the proxy server manually:
1. Create a shell script wrapper the user runs at login
2. Or create a proper macOS app with network entitlements

**Pros:**
- Works immediately (already tested)
- No code signing required
- Simple to implement

**Cons:**
- User must manually start proxy server
- Not as "invisible" as LaunchAgent

### Option B: Sign with Network Entitlements
Sign the binary with Apple Developer credentials and add:
```xml
<key>com.apple.security.network.client</key>
<true/>
<key>com.apple.security.network.server</key>
<true/>
```

**Pros:**
- Works with LaunchAgent
- Professional solution

**Cons:**
- Requires paid Apple Developer account ($99/year)
- Notarization required for distribution
- More complex build process

### Option C: Use Electron (Already Works)
The existing Electron app at `/Users/ryanwager/anava-infrastructure-deployer` has full network access and works perfectly.

**Pros:**
- Already implemented and tested
- No sandboxing issues
- Professional UI framework

**Cons:**
- Larger app size than Chrome extension
- Separate application (not browser-integrated)

### Option D: Safari Extension
Safari extensions use different sandbox model, may allow local network with proper entitlements.

**Pros:**
- May have better local network access than Chrome
- Native macOS integration

**Cons:**
- Requires rewrite of extension
- Smaller user base than Chrome
- Still may require entitlements

## Recommended Implementation

**Immediate Solution (No Code Signing):**

1. Replace LaunchAgent with login script
2. User runs proxy server on demand or at login
3. Chrome extension connects to localhost proxy
4. Proxy forwards to cameras (unrestricted)

**Long-term Solution (Professional):**

1. Get Apple Developer account
2. Sign binary with network entitlements
3. Use LaunchAgent for automatic startup
4. Submit for notarization

## Implementation Status

### Completed ✅
- Proxy server that bypasses Chrome sandbox (works when run directly)
- Native messaging host that connects to localhost proxy
- Installation script with LaunchAgent setup
- Comprehensive testing and diagnosis

### What Needs to Change
The LaunchAgent approach needs to be replaced with:

1. **Startup Script** (`start-proxy.sh`):
```bash
#!/bin/bash
~/Library/Application\ Support/Anava/camera-proxy-server &
echo "Camera Proxy Server started"
```

2. **Stop Script** (`stop-proxy.sh`):
```bash
#!/bin/bash
pkill -f camera-proxy-server
echo "Camera Proxy Server stopped"
```

3. **User Instructions**:
- Run `./start-proxy.sh` before using Chrome extension
- Run `./stop-proxy.sh` to stop background server
- Or: Add to "Login Items" in System Settings

## Architecture (Final)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Chrome Extension UI (popup.html)                      │
│                                                         │
│  ↓ Native Messaging Protocol (stdio)                  │
│                                                         │
│  Native Messaging Host (~/Library/.../camera-proxy)    │
│  - Launched by Chrome (sandboxed)                      │
│  - Can only access localhost                           │
│                                                         │
│  ↓ HTTP POST to http://127.0.0.1:9876/proxy           │
│                                                         │
│  Local Proxy Server (camera-proxy-server)              │
│  - Run directly by user (NOT LaunchAgent)              │
│  - Full network access                                 │
│  - Implements Digest auth                              │
│                                                         │
│  ↓ HTTPS to camera (192.168.50.156:443)               │
│                                                         │
│  Axis Camera                                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Testing Results

### Test 1: Proxy Server Direct Launch ✅
```bash
~/Library/Application\ Support/Anava/camera-proxy-server &
curl -X POST http://127.0.0.1:9876/proxy -d @test.json
# Result: HTTP 200, successful connection to camera
```

### Test 2: Via LaunchAgent ❌
```bash
launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
curl -X POST http://127.0.0.1:9876/proxy -d @test.json
# Result: "dial tcp 192.168.50.156:443: connect: no route to host"
```

### Test 3: Simple Go Program ✅
```go
client := &http.Client{
    Transport: &http.Transport{
        TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
    },
}
resp, _ := client.Get("https://192.168.50.156/")
// Result: HTTP 200, connection successful
```

## Conclusion

**Chrome native messaging hosts on macOS cannot reliably access local networks** due to Chrome's sandboxing AND macOS LaunchAgent restrictions.

**Viable paths forward:**

1. **Quick Fix**: User-launched proxy server (works now, no signing needed)
2. **Professional Fix**: Code signing with network entitlements (requires Apple Dev account)
3. **Alternative**: Use the existing Electron app (already works perfectly)

## User Decision Point

The user should choose based on priorities:

- **Fast and working**: Use direct launch proxy (implemented, works)
- **Professional product**: Get Apple Dev account, sign with entitlements
- **Best UX**: Stick with Electron (already works, no limitations)

All three approaches have the same core authentication logic - the only difference is how the network sandbox is handled.
