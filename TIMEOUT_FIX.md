# ACAP Upload Timeout Fix

## Problem
ACAP deployment was failing at Step 1 with timeout error:
```
Step 1 (Deploy ACAP): ACAP upload failed: Upload failed: Post "https://192.168.50.156/axis-cgi/applications/upload.cgi": context deadline exceeded (Client.Timeout exceeded while awaiting headers)
```

**Root Cause:**
- ACAP files are several MB in size
- Cameras take 60-120 seconds to process uploads
- Proxy server had 30-second timeout for ALL requests
- Upload endpoint was using same HTTP client as regular requests

## Solution Implemented

### 1. Created Separate HTTP Client for Uploads
**File:** `proxy-server/main.go`

```go
var (
	client       *http.Client // Regular requests (30s timeout)
	uploadClient *http.Client // Upload requests (3 minute timeout)
	logger       *log.Logger
	certStore    *CertificateStore
)
```

**Initialization:**
```go
// Regular client (30s timeout)
client = &http.Client{
	Transport: &http.Transport{TLSClientConfig: tlsConfig},
	Timeout:   30 * time.Second,
}

// Upload client (3 min timeout)
uploadClient = &http.Client{
	Transport: &http.Transport{TLSClientConfig: tlsConfig},
	Timeout:   180 * time.Second, // 3 minutes for large file uploads
}
```

### 2. Created New Authentication Function
**Function:** `makeAuthenticatedRequestWithBodyAndClient()`
- Accepts custom HTTP client as parameter
- Allows using `uploadClient` for long-running uploads
- Maintains same digest auth logic as original

### 3. Updated Upload Handlers
Both `/upload-acap` and `/upload-license` endpoints now:
- Use `uploadClient` (3 min timeout) instead of `client` (30s timeout)
- Include detailed progress logging
- Show file sizes in MB for clarity

### 4. Enhanced Logging
**ACAP Upload Progress:**
```
========================================
ACAP UPLOAD STARTED
Source: https://github.com/...
Target: https://192.168.50.156/...
========================================
Step 1/3: Downloading ACAP from GitHub...
✅ ACAP downloaded successfully (X bytes = X.XX MB)
Step 2/3: Creating multipart form data...
✅ Multipart form-data created (total size: X bytes = X.XX MB)
Step 3/3: Uploading to camera (this may take 60-120 seconds)...
Sending authenticated request with X byte body...
========================================
✅ ACAP UPLOAD SUCCESSFUL!
========================================
```

## Deployment

### Rebuild Proxy Server
```bash
cd /Users/ryanwager/anava-camera-extension/proxy-server
go build -o ../camera-proxy-server main.go
```

### Restart Proxy
```bash
cd /Users/ryanwager/anava-camera-extension
./stop-proxy.sh
./start-proxy.sh
```

### Verify
```bash
# Check logs for timeout initialization
tail ~/Library/Logs/anava-camera-proxy-server.log
# Should see: "Initialized HTTP clients: regular (30s timeout), upload (180s timeout)"

# Check health
curl http://127.0.0.1:9876/health
# Should return: {"status":"ok"}
```

## Expected Results

### Before Fix
- ❌ ACAP uploads timeout after 30 seconds
- ❌ Large files (>5 MB) always fail
- ❌ No progress visibility during upload

### After Fix
- ✅ ACAP uploads have 3 minute timeout
- ✅ Large files upload successfully
- ✅ Detailed progress logging with file sizes
- ✅ Regular requests still have fast 30s timeout (not affected)

## Code Changes Summary

### Files Modified
1. **proxy-server/main.go**
   - Added `uploadClient` variable (line 42)
   - Created shared TLS config (lines 184-224)
   - Initialized both clients (lines 226-242)
   - Enhanced `handleUploadAcap()` logging (lines 784-871)
   - Enhanced `handleUploadLicense()` logging (lines 903-964)
   - Created `makeAuthenticatedRequestWithBodyAndClient()` (lines 1011-1084)

### Lines Changed
- **Added:** ~60 lines of new code
- **Modified:** ~40 lines of existing code
- **Total Impact:** ~100 lines

### Backward Compatibility
- ✅ Regular proxy requests unchanged (still 30s timeout)
- ✅ Existing authentication logic preserved
- ✅ API endpoints unchanged
- ✅ No breaking changes to extension code

## Testing

### Manual Test
```bash
# Test ACAP upload with longer timeout
curl -X POST http://127.0.0.1:9876/upload-acap \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://CAMERA_IP/axis-cgi/applications/upload.cgi",
    "username": "anava",
    "password": "baton",
    "acapUrl": "https://github.com/AnavaAcap/acap-releases/releases/download/..."
  }' \
  --max-time 200  # Allow 200s for test
```

### Extension Test
Deploy ACAP from web app and verify:
1. Step 1 completes without timeout
2. Check proxy logs show progress
3. ACAP installs successfully

## Monitoring

Check proxy server logs during deployment:
```bash
tail -f ~/Library/Logs/anava-camera-proxy-server.log
```

Look for:
- ✅ "ACAP UPLOAD STARTED"
- ✅ File download progress
- ✅ Upload progress with size
- ✅ "ACAP UPLOAD SUCCESSFUL!"

## Rollback

If issues occur:
```bash
cd /Users/ryanwager/anava-camera-extension
git checkout proxy-server/main.go
go build -o camera-proxy-server proxy-server/main.go
./stop-proxy.sh && ./start-proxy.sh
```

## Performance Impact

- **Regular requests:** No change (still 30s timeout)
- **Upload requests:** Can now take up to 3 minutes (vs 30s before)
- **Memory:** Negligible (two HTTP clients vs one)
- **CPU:** No difference

## Future Improvements

1. **Dynamic timeout based on file size**
   - Small files (<1 MB): 60s
   - Medium files (1-5 MB): 120s
   - Large files (>5 MB): 180s

2. **Upload progress streaming**
   - Send progress updates back to extension
   - Show upload percentage in UI

3. **Retry logic**
   - Auto-retry failed uploads with exponential backoff
   - Handle transient network errors

## Related Issues

- Timeout error in Step 1 deployment
- ACAP files are typically 5-10 MB
- Cameras process uploads synchronously (can take 60-120s)
