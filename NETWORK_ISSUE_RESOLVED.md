# Network Routing Issue - RESOLVED

## Problem
Go proxy server launched by macOS LaunchAgent couldn't reach cameras on local network (192.168.50.x), returning "dial tcp: connect: no route to host" error.

## Root Cause
macOS LaunchAgent processes have **network sandboxing restrictions** that prevent them from accessing local network devices, even though:
- The binary works perfectly when run manually
- The Mac can reach cameras via ping/curl
- Go's net.Dial() works in standalone programs
- The routing table is correct

## Evidence
1. **Manual execution**: ✅ Works perfectly
   ```bash
   /Applications/AnavaLocalConnector/local-connector
   # Returns: {"status":200,"data":...}
   ```

2. **LaunchAgent execution**: ❌ Fails with "no route to host"
   ```bash
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.anava.local_connector.plist
   # Returns: {"error":"...no route to host"}
   ```

3. **Test at 11:24:59**: Proxy worked when run directly, logged successful connection to camera
4. **Test at 11:46:54**: Same binary launched by LaunchAgent failed to reach camera

## Solution
**Do NOT use LaunchAgent for the proxy server**. Instead:

1. User launches proxy manually when needed
2. OR: Start proxy from shell script (has full network access)
3. OR: Build macOS app bundle with proper network entitlements

## Technical Details
- **Affected component**: Local connector proxy (`/Applications/AnavaLocalConnector/local-connector`)
- **Network**: Mac IP = 192.168.50.239 (en0), Camera IP = 192.168.50.156
- **Binary**: Universal binary (arm64 + amd64), built with Go 1.x
- **Confirmed working**: When launched directly from Terminal or background process

## Files Updated
- `proxy-server/main.go` - Added explicit net.Dialer (doesn't fix LaunchAgent issue, but improves reliability)
- Binaries rebuilt: `build/local-connector*`

## Next Steps
1. Remove LaunchAgent or update entitlements
2. Create user-facing "Start Proxy" script
3. Consider packaging as proper macOS app with network entitlements
## Summary

**ISSUE RESOLVED** ✅

### Root Cause
macOS LaunchAgent processes cannot access local network (192.168.x.x) due to network sandboxing.

### Solution  
Use manual proxy startup instead of LaunchAgent:
- `./start-proxy.sh` - Start proxy
- `./stop-proxy.sh` - Stop proxy

### Verification
```bash
curl http://127.0.0.1:9876/health
# Returns: {"status":"ok"}

# Test camera connection
curl -X POST http://127.0.0.1:9876/proxy -H "Content-Type: application/json" \
  -d '{"url":"https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi","method":"POST","username":"anava","password":"baton","body":{"apiVersion":"1.0","method":"getProperties","params":{"propertyList":["Brand","ProdFullName"]}}}'
# Returns: {"status":200,"data":{..."Brand":"AXIS","ProdFullName":"AXIS M3215-LVE Dome Camera"...}}
```

### Files Updated
- `proxy-server/main.go` - Added explicit net.Dialer  
- `build/local-connector*` - Rebuilt binaries (universal binary for macOS)
- `start-proxy.sh` - New manual start script
- `stop-proxy.sh` - New manual stop script
- `CLAUDE.md` - Updated setup commands
- `NETWORK_ISSUE_RESOLVED.md` - Full technical documentation

### Next Steps
Camera scanning should now work end-to-end. The proxy has full network access when launched manually.
