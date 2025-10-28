# Digest Auth JSON Body Fix - Summary

## Issue Fixed
Camera at 192.168.50.156 was returning JSON syntax error despite successful authentication.

## Root Cause
**Digest Authentication was not sending the JSON body in authenticated requests.**

The Digest Auth flow requires two HTTP requests:
1. **Challenge request** - Gets the WWW-Authenticate header from camera
2. **Authenticated request** - Sends Authorization header with digest response

The bug: **Only the challenge request included the JSON body, authenticated request had empty body.**

## Solution Implemented

### Code Changes
**File:** `/Users/ryanwager/anava-camera-extension/proxy-server/main.go`

1. **Enhanced logging** throughout all auth functions to track JSON body flow
2. **Fixed `tryDigestAuth()`** to send body in BOTH requests:
   - Challenge request now sends body (helps camera validate request structure)
   - Authenticated request recreates body reader (first reader was consumed)

### Key Code Pattern
```go
// Challenge request - WITH BODY
bodyBytes, _ := json.Marshal(req.Body)
bodyReader := bytes.NewReader(bodyBytes)
httpReq := http.NewRequest(req.Method, req.URL, bodyReader)
httpReq.Header.Set("Content-Type", "application/json")
httpReq.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))

// ... get WWW-Authenticate header, calculate digest ...

// Authenticated request - RECREATE BODY (reader consumed)
bodyBytes, _ = json.Marshal(req.Body)  // Marshal again
bodyReader = bytes.NewReader(bodyBytes)  // New reader
httpReq2 := http.NewRequest(req.Method, req.URL, bodyReader)
httpReq2.Header.Set("Authorization", digestAuth)
httpReq2.Header.Set("Content-Type", "application/json")
httpReq2.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
```

## Test Results

### Before Fix
```json
{
  "apiVersion": "1.3",
  "error": {
    "code": 4000,
    "message": "JSON syntax error on line 1: '[' or '{' expected near end of file"
  }
}
```

### After Fix
```json
{
  "status": 200,
  "data": {
    "apiVersion": "1.3",
    "data": {
      "propertyList": {
        "Brand": "AXIS",
        "ProdFullName": "AXIS M3215-LVE Dome Camera",
        "ProdNbr": "M3215-LVE",
        "ProdType": "Dome Camera",
        "SerialNumber": "B8A44F45D624"
      }
    }
  }
}
```

## Verified Scenarios
All tests passing with camera at 192.168.50.156:

1. ✅ HTTPS with explicit port (https://192.168.50.156:443)
2. ✅ HTTPS without port (https://192.168.50.156)
3. ✅ HTTP (http://192.168.50.156)
4. ✅ Multiple sequential requests (5 requests in ~1.9s)

## Performance
- **Average response time:** ~390ms per request
- **Overhead:** Digest auth requires 2 round trips (challenge + authenticated)
- **Logging impact:** Minimal (all logs to file, not stdout)

## Deployment Steps
```bash
cd /Users/ryanwager/anava-camera-extension/proxy-server
go build -o camera-proxy-server main.go
cp camera-proxy-server ~/Library/Application\ Support/Anava/
killall camera-proxy-server
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
```

## Enhanced Logging
New logs show complete request/response flow:

```
2025/10/28 16:17:54 Proxying request: POST https://192.168.50.156:443/... (user: anava)
2025/10/28 16:17:54 Received request body: {"apiVersion":"1.0",...}
2025/10/28 16:17:54 Step 1: Testing connection without authentication
2025/10/28 16:17:54 Marshaled JSON body (132 bytes): {"apiVersion":"1.0",...}
2025/10/28 16:17:54 Request headers - Content-Type: application/json, Content-Length: 132
2025/10/28 16:17:54 Response status: 401, body length: 0 bytes
2025/10/28 16:17:54 Step 2: 401 received, trying authentication
2025/10/28 16:17:54 HTTPS detected: Trying Basic Auth first
2025/10/28 16:17:54 Basic Auth - Marshaled JSON body (132 bytes): {"apiVersion":"1.0",...}
2025/10/28 16:17:54 Response status: 401, body length: 381 bytes
2025/10/28 16:17:54 Basic Auth failed, trying Digest Auth
2025/10/28 16:17:54 Trying Digest authentication
2025/10/28 16:17:54 Digest Auth - Challenge request with body (132 bytes)
2025/10/28 16:17:54 WWW-Authenticate header: Digest realm="AXIS_B8A44F45D624"...
2025/10/28 16:17:54 Calculated Authorization header: Digest username="anava"...
2025/10/28 16:17:54 Digest Auth - Authenticated request with body (132 bytes): {"apiVersion":"1.0",...}
2025/10/28 16:17:54 Digest Auth - Headers: Content-Type=application/json, Content-Length=132
2025/10/28 16:17:54 Response status: 200, body length: 196 bytes
```

## Key Learnings

1. **Body readers are consumable** - Once read, they're empty. Must recreate for subsequent requests.

2. **Axis cameras validate JSON early** - Even challenge requests need valid JSON structure for POST endpoints.

3. **Digest Auth is multi-step** - Both challenge AND authenticated requests need complete headers and body.

4. **Logging is essential** - Without detailed logging, this bug would have taken much longer to diagnose.

## Files Modified
- `proxy-server/main.go` - Added body handling to Digest Auth + enhanced logging

## Related Documentation
- `JSON_BODY_FIX.md` - Detailed technical analysis
- `~/Library/Logs/anava-camera-proxy-server.log` - Runtime logs

## Status
✅ **FIXED AND TESTED** - Camera authentication now works correctly for all scenarios.
