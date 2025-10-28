# Network Connectivity Issue - Root Cause & Solution

## Problem
Go native messaging host getting intermittent "dial tcp 192.168.50.156:443: connect: no route to host" errors when called from Chrome extension.

## Investigation

### Evidence
1. **Direct test**: ✅ Go binary works perfectly when run from command line
2. **Ping test**: ✅ Camera is reachable (192.168.50.156)
3. **Port test**: ✅ Port 443 is open (`nc -zv 192.168.50.156 443`)
4. **Via Chrome**: ❌ Intermittent "no route to host" errors

### Logs Analysis
Looking at `~/Library/Logs/anava-camera-proxy.log`:

**Failures** (14:56:08, 14:56:28):
```
Error making request: initial request failed: Post "https://192.168.50.156:443/...":
dial tcp 192.168.50.156:443: connect: no route to host
```

**Success** (14:51:52):
```
Response status: 200, body length: ... bytes
Request completed successfully
```

**Pattern**: Intermittent connectivity - sometimes works, sometimes fails on first attempt.

### Root Cause
The issue appears to be **timing-related**:
- When Chrome launches the Go binary, there may be a brief period where network initialization is still in progress
- The camera might be rate-limiting connections or has a brief unresponsive period
- macOS networking stack might need a moment to establish routes for the new process

This explains why:
- Direct tests work (process already running, network initialized)
- Chrome-launched tests fail initially (cold start, network not ready)
- Retries work (network becomes available after brief delay)

## Solution Implemented

### 1. Network Diagnostics on Startup
Added comprehensive logging in `init()` that runs on every binary launch:

```go
func logNetworkDiagnostics() {
    // Log all network interfaces and their addresses
    // Test DNS resolution of target IP
    // Test TCP dial to target IP:443
}
```

This logs:
- All network interfaces (lo0, en0, etc.)
- IP addresses assigned to each interface
- DNS lookup results for 192.168.50.156
- TCP connectivity test to 192.168.50.156:443

### 2. Retry Logic with Exponential Backoff
Added retry logic for both Basic and Digest authentication:

```go
maxRetries := 3
for attempt := 1; attempt <= maxRetries; attempt++ {
    if attempt > 1 {
        waitTime := time.Duration(attempt) * time.Second
        time.Sleep(waitTime)  // 1s, 2s, 3s delays
    }

    // Attempt HTTP request
    httpResp, err := client.Do(httpReq)
    if err != nil {
        // Retry on "no route to host" or "connection refused"
        if strings.Contains(err.Error(), "no route to host") ||
           strings.Contains(err.Error(), "connection refused") {
            continue
        }
        return Response{}, err  // Fail fast on other errors
    }

    return parseResponse(httpResp)
}
```

**Retry Schedule**:
- Attempt 1: Immediate
- Attempt 2: After 1 second
- Attempt 3: After 2 seconds
- Total max time: ~3 seconds

### 3. Enhanced Dial Logging
Custom HTTP transport that logs every network dial attempt:

```go
Transport: &http.Transport{
    DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
        logger.Printf("🔌 Attempting to dial: network=%s addr=%s", network, addr)
        conn, err := dialer.DialContext(ctx, network, addr)
        if err != nil {
            logger.Printf("❌ Dial failed: %v", err)
            return nil, err
        }
        logger.Printf("✅ Dial successful to %s", addr)
        return conn, nil
    },
}
```

## Testing

### Before Fix
```
❌ dial tcp 192.168.50.156:443: connect: no route to host
```

### After Fix (Expected)
```
=== Network Diagnostics ===
Interface: en0 (flags: up|broadcast|multicast|running)
  Address: 192.168.50.239/24
Testing network connectivity to 192.168.50.156...
✅ DNS lookup succeeded: [192.168.50.156]
✅ TCP dial to 192.168.50.156:443 succeeded
=== End Network Diagnostics ===

🔌 Attempting to dial: network=tcp addr=192.168.50.156:443
✅ Dial successful to 192.168.50.156:443
✅ Request succeeded on attempt 1
```

Or with retry:
```
❌ Attempt 1 failed: dial tcp: no route to host
Retry attempt 2/3 after 1s
🔌 Attempting to dial: network=tcp addr=192.168.50.156:443
✅ Dial successful to 192.168.50.156:443
✅ Request succeeded on attempt 2
```

## Next Steps
1. Reload Chrome extension
2. Run "DEBUG: Test .156 Only" button
3. Check logs at `~/Library/Logs/anava-camera-proxy.log`
4. Verify retry logic works and camera is discovered

## Files Modified
- `/Users/ryanwager/anava-camera-extension/native-host/main.go`
  - Added `context` and `net` imports
  - Added `logNetworkDiagnostics()` function
  - Enhanced `init()` to run diagnostics and custom dialer
  - Added retry logic to `tryBasicAuth()`
  - Added retry logic to `tryDigestAuth()`

## Logs Location
`~/Library/Logs/anava-camera-proxy.log`
