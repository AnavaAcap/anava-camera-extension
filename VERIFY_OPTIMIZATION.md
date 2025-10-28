# Verify Proxy Optimization is Working

## Quick Verification

Run the test script:
```bash
./test-proxy-performance.sh
```

You should see:
```
✓ Fast timeout (expected ~3s)
✓ New authentication pattern detected in logs
```

## Manual Testing

### Test 1: Non-existent IP (Fast Failure)

```bash
# This should complete in ~3 seconds (not 30+)
time curl -X POST http://127.0.0.1:9876/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://192.168.50.99:443/axis-cgi/basicdeviceinfo.cgi",
    "method": "POST",
    "username": "root",
    "password": "pass",
    "body": {
      "apiVersion": "1.0",
      "method": "getProperties",
      "params": {"propertyList": ["Brand"]}
    }
  }'
```

**Expected output:**
```json
{
  "error": "Request failed: device not responding: Post \"https://192.168.50.99:443/axis-cgi/basicdeviceinfo.cgi\": context deadline exceeded (Client.Timeout exceeded while awaiting headers)"
}
```

**Expected time:** ~3 seconds ✅

### Test 2: Check Live Logs

```bash
tail -f ~/Library/Logs/anava-camera-proxy-server.log
```

While running the test above, you should see:
```
Step 1: Testing connection without authentication
Trying unauthenticated request (3s timeout)
Device not responding (timeout/refused) - not a camera
```

## Compare Before/After

### Before Optimization
```
Scanning 192.168.50.0/24 (254 IPs)
├─ Each non-existent IP: 30-60 seconds
├─ Total time: 2-4 hours
└─ Requests per IP: 2 (Basic + Digest)
```

### After Optimization
```
Scanning 192.168.50.0/24 (254 IPs)
├─ Each non-existent IP: 3 seconds
├─ Total time: 12-15 minutes
└─ Requests per IP: 1 (Unauthenticated test)
```

## Real Camera Test

If you have a real camera on your network:

```bash
# Replace with your camera's IP and credentials
curl -X POST http://127.0.0.1:9876/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://YOUR_CAMERA_IP:443/axis-cgi/basicdeviceinfo.cgi",
    "method": "POST",
    "username": "root",
    "password": "your_password",
    "body": {
      "apiVersion": "1.0",
      "method": "getProperties",
      "params": {
        "propertyList": ["Brand", "ProdType", "ProdNbr"]
      }
    }
  }' | jq .
```

**Expected flow in logs:**
```
Step 1: Testing connection without authentication
Trying unauthenticated request (3s timeout)
Step 2: 401 received, trying authentication
HTTPS detected: Trying Basic Auth first
Basic Auth succeeded
```

## Chrome Extension Scanner Test

1. Open Chrome extension
2. Start a network scan
3. Monitor proxy logs: `tail -f ~/Library/Logs/anava-camera-proxy-server.log`
4. You should see the new pattern for each IP:
   - Step 1: Unauthenticated test
   - Step 2: Auth only if 401 received

## Performance Metrics

### Key Indicators of Success

1. **Non-camera IPs fail in 3-4 seconds** (not 30+)
2. **Logs show "Step 1" and "Step 2"** for each request
3. **Network scans complete in minutes** (not hours)
4. **Only ONE request to non-existent IPs** (not 2+)

### Log Patterns to Look For

✅ **Good (Optimized):**
```
Step 1: Testing connection without authentication
Trying unauthenticated request (3s timeout)
Device not responding (timeout/refused) - not a camera
```

❌ **Bad (Old pattern):**
```
Trying Basic authentication
Basic auth failed or not supported, trying Digest auth
Trying Digest authentication
```

## Troubleshooting

### If scans are still slow:

1. **Check proxy is running new version:**
   ```bash
   # Should show recent timestamp
   ls -lh ~/Library/Application\ Support/Anava/camera-proxy-server
   ```

2. **Verify new pattern in logs:**
   ```bash
   grep "Step 1" ~/Library/Logs/anava-camera-proxy-server.log
   ```

   If no "Step 1" found, rebuild and restart:
   ```bash
   ./stop-proxy.sh
   cd proxy-server && go build -o camera-proxy-server main.go
   cp camera-proxy-server ~/Library/Application\ Support/Anava/
   ./start-proxy.sh
   ```

3. **Check Chrome extension is using proxy:**
   - Extension should be making requests to `http://127.0.0.1:9876/proxy`
   - Not directly to camera IPs

### If timeouts are too short:

The 3-second timeout works for local networks. If scanning across VPN or slower networks:

1. Edit `tryUnauthenticatedRequest()` in `proxy-server/main.go`
2. Change `Timeout: 3 * time.Second` to `Timeout: 5 * time.Second`
3. Rebuild and restart

## Expected Results

After optimization, a typical home network scan (192.168.1.0/24):

- **Before:** 2-4 hours (most IPs timing out after 30-60s each)
- **After:** 10-15 minutes (non-existent IPs fail in 3s)
- **Improvement:** 10-18x faster ⚡

## Success Criteria

✅ Non-existent IP test completes in ~3 seconds
✅ Logs show "Step 1" and "Step 2" pattern
✅ Only ONE request sent to non-cameras
✅ Protocol-based auth strategy (HTTPS=Basic first, HTTP=Digest first)
✅ Scanner completes typical network in 10-15 minutes

## Next Steps

Once verified:
1. Test full network scan with Chrome extension
2. Monitor performance on various network sizes
3. Adjust timeout if needed for specific network conditions
4. Document any edge cases discovered during testing
