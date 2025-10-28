# Camera Proxy JSON Body Fix

## Problem
Camera at 192.168.50.156 was authenticating successfully but returning error:
```json
{
  "apiVersion": "1.3",
  "error": {
    "code": 4000,
    "message": "JSON syntax error on line 1: '[' or '{' expected near end of file"
  }
}
```

This indicated the JSON body was missing or malformed.

## Root Cause
The Digest Authentication implementation had a critical bug:

1. **Initial challenge request** sent NO body (only sent headers to get WWW-Authenticate)
2. **Authenticated request** was supposed to send the body, but:
   - If the camera returned 200 instead of 401 on the challenge, we returned early
   - The authenticated request with body was never sent

### Code Flow (BEFORE Fix)
```go
func tryDigestAuth(req *ProxyRequest) (ProxyResponse, error) {
    // First request - NO BODY
    httpReq, err := http.NewRequest(req.Method, req.URL, nil)  // ❌ nil body

    httpResp, err := client.Do(httpReq)

    if httpResp.StatusCode != 401 {
        return parseResponse(httpResp)  // ❌ Early return, never send authenticated request
    }

    // ... only reaches here if 401
    // Make authenticated request with body
}
```

## Solution
Send the JSON body in **BOTH** Digest Auth requests:

1. **Challenge request** - Send with body so camera can validate the request structure
2. **Authenticated request** - Send with body AND Authorization header

### Code Flow (AFTER Fix)
```go
func tryDigestAuth(req *ProxyRequest) (ProxyResponse, error) {
    // Marshal body ONCE for challenge request
    var bodyBytes []byte
    if req.Body != nil && len(req.Body) > 0 {
        bodyBytes, _ = json.Marshal(req.Body)  // ✅ Marshal body
        bodyReader = bytes.NewReader(bodyBytes)
    }

    // First request - WITH BODY
    httpReq, err := http.NewRequest(req.Method, req.URL, bodyReader)  // ✅ Send body
    httpReq.Header.Set("Content-Type", "application/json")
    httpReq.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))

    httpResp, err := client.Do(httpReq)

    if httpResp.StatusCode != 401 {
        return parseResponse(httpResp)  // If 200, body was valid
    }

    // Marshal body AGAIN for authenticated request (body reader consumed)
    bodyBytes = nil
    if req.Body != nil && len(req.Body) > 0 {
        bodyBytes, _ = json.Marshal(req.Body)  // ✅ Re-marshal for second request
        bodyReader = bytes.NewReader(bodyBytes)
    }

    // Second request - WITH BODY + AUTH
    httpReq2, err := http.NewRequest(req.Method, req.URL, bodyReader)  // ✅ Send body again
    httpReq2.Header.Set("Authorization", digestAuth)
    httpReq2.Header.Set("Content-Type", "application/json")
    httpReq2.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
}
```

## Enhanced Logging Added
Added detailed logging at every step to track JSON body flow:

```go
logger.Printf("Received request body: %s", string(bodyJSON))
logger.Printf("Marshaled JSON body (%d bytes): %s", len(bodyBytes), string(bodyBytes))
logger.Printf("Request headers - Content-Type: application/json, Content-Length: %d", len(bodyBytes))
logger.Printf("Digest Auth - Challenge request with body (%d bytes)", len(bodyBytes))
logger.Printf("Digest Auth - Authenticated request with body (%d bytes): %s", len(bodyBytes), string(bodyBytes))
```

## Test Results

### Before Fix
```bash
$ curl -X POST http://127.0.0.1:9876/proxy -d @test-camera-156.json
{"status":200,"data":{"apiVersion":"1.3","error":{"code":4000,"message":"JSON syntax error on line 1: '[' or '{' expected near end of file"}}}
```

**Logs showed:** No body being sent in Digest Auth requests

### After Fix
```bash
$ curl -X POST http://127.0.0.1:9876/proxy -d @test-camera-156.json
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

**Logs showed:**
```
2025/10/28 16:17:54 Received request body: {"apiVersion":"1.0","method":"getProperties",...}
2025/10/28 16:17:54 Digest Auth - Challenge request with body (132 bytes)
2025/10/28 16:17:54 WWW-Authenticate header: Digest realm="AXIS_B8A44F45D624"...
2025/10/28 16:17:54 Digest Auth - Authenticated request with body (132 bytes): {"apiVersion":"1.0",...}
2025/10/28 16:17:54 Response status: 200, body length: 196 bytes
```

## Files Modified
- `/Users/ryanwager/anava-camera-extension/proxy-server/main.go`
  - Enhanced `tryUnauthenticatedRequest()` with body logging
  - Enhanced `tryBasicAuth()` with body logging
  - **Fixed `tryDigestAuth()`** to send body in both challenge and authenticated requests
  - Added comprehensive logging throughout

## Deployment
```bash
cd /Users/ryanwager/anava-camera-extension/proxy-server
go build -o camera-proxy-server main.go
cp camera-proxy-server ~/Library/Application\ Support/Anava/
killall camera-proxy-server
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
```

## Key Learnings
1. **Digest Auth is a two-step process** - both steps need the request body for APIs
2. **Body readers are consumed** - must recreate `bytes.NewReader()` for each request
3. **Axis cameras validate JSON structure early** - they need valid JSON even in challenge requests
4. **Logging is critical** - without detailed logging, this bug would have been very hard to diagnose

## Related Issues
This fix resolves the camera authentication flow for HTTPS Digest Auth. Basic Auth was already working correctly because it sends the body in a single request with Authorization header.
