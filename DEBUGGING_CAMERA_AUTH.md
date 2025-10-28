# Camera Authentication Debugging Guide

## Quick Diagnostics

### 1. Check Proxy Status
```bash
# Is proxy running?
curl -s http://127.0.0.1:9876/health
# Expected: {"status":"ok"}

# View process
ps aux | grep camera-proxy-server | grep -v grep

# View logs (live)
tail -f ~/Library/Logs/anava-camera-proxy-server.log
```

### 2. Test Camera Direct (No Proxy)
```bash
# Test if camera is reachable
ping -c 3 192.168.50.156

# Test HTTPS endpoint (should get 401)
curl -v -k https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi

# Test with Basic Auth
curl -v -k -u anava:baton \
  -X POST https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi \
  -H "Content-Type: application/json" \
  -d '{"apiVersion":"1.0","method":"getProperties","params":{"propertyList":["Brand"]}}'
```

### 3. Test Through Proxy
```bash
# Quick test
curl -X POST http://127.0.0.1:9876/proxy \
  -H "Content-Type: application/json" \
  -d @test-camera-156.json

# Run full test suite
./test-camera-auth.sh
```

## Common Issues

### Issue: "Connection refused"
**Symptoms:** Proxy returns connection refused error

**Diagnosis:**
```bash
# Check if camera IP is correct
ping 192.168.50.156

# Check if port is open
nc -zv 192.168.50.156 443
nc -zv 192.168.50.156 80
```

**Fix:**
- Verify camera IP address
- Check camera is powered on
- Verify network connectivity

### Issue: "Timeout"
**Symptoms:** Request times out after 3 seconds

**Diagnosis:**
```bash
# Check network latency
ping -c 10 192.168.50.156

# Check if firewall is blocking
telnet 192.168.50.156 443
```

**Fix:**
- Check firewall rules
- Verify camera is on same network
- Check camera load (may be busy)

### Issue: "401 Unauthorized"
**Symptoms:** Authentication fails even with correct credentials

**Diagnosis:**
```bash
# Check logs for auth flow
tail -50 ~/Library/Logs/anava-camera-proxy-server.log | grep -E "(Basic Auth|Digest Auth|Response status)"

# Test credentials directly
curl -v -k -u anava:baton https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi
```

**Fix:**
- Verify username/password are correct
- Check if account is locked (too many failed attempts)
- Verify user has API access permissions

### Issue: "JSON syntax error"
**Symptoms:** Camera returns error code 4000

**This was the bug we just fixed!**

**Diagnosis:**
```bash
# Check if body is being sent
tail -50 ~/Library/Logs/anava-camera-proxy-server.log | grep "Marshaled JSON body"
```

**Expected log pattern:**
```
Marshaled JSON body (132 bytes): {"apiVersion":"1.0",...}
Digest Auth - Challenge request with body (132 bytes)
Digest Auth - Authenticated request with body (132 bytes): {"apiVersion":"1.0",...}
```

**If body NOT being sent:**
- Rebuild proxy: `cd proxy-server && go build -o camera-proxy-server main.go`
- Redeploy: `cp camera-proxy-server ~/Library/Application\ Support/Anava/`
- Restart: `killall camera-proxy-server && launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist`

### Issue: "SSL/TLS errors"
**Symptoms:** Certificate verification errors

**Fix:** Proxy already uses `InsecureSkipVerify: true` for self-signed certs. If still failing:
```bash
# Check if HTTPS is working at all
curl -k -v https://192.168.50.156
```

## Log Patterns

### Successful HTTPS Digest Auth
```
Proxying request: POST https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi (user: anava)
Received request body: {"apiVersion":"1.0",...}
Step 1: Testing connection without authentication
Marshaled JSON body (132 bytes): {"apiVersion":"1.0",...}
Request headers - Content-Type: application/json, Content-Length: 132
Response status: 401, body length: 0 bytes
Step 2: 401 received, trying authentication
HTTPS detected: Trying Basic Auth first
Trying Basic authentication
Basic Auth - Marshaled JSON body (132 bytes): {"apiVersion":"1.0",...}
Basic Auth - Headers: Content-Type=application/json, Content-Length=132
Response status: 401, body length: 381 bytes
Basic Auth failed, trying Digest Auth
Trying Digest authentication
Digest Auth - Challenge request with body (132 bytes)
WWW-Authenticate header: Digest realm="AXIS_B8A44F45D624"...
Calculated Authorization header: Digest username="anava"...
Digest Auth - Authenticated request with body (132 bytes): {"apiVersion":"1.0",...}
Digest Auth - Headers: Content-Type=application/json, Content-Length=132
Response status: 200, body length: 196 bytes
```

### Successful HTTP Digest Auth
```
Proxying request: POST http://192.168.50.156/axis-cgi/basicdeviceinfo.cgi (user: anava)
Received request body: {"apiVersion":"1.0",...}
Step 1: Testing connection without authentication
Response status: 401, body length: 0 bytes
Step 2: 401 received, trying authentication
HTTP detected: Trying Digest Auth first
Digest Auth - Challenge request with body (132 bytes)
Digest Auth - Authenticated request with body (132 bytes): {"apiVersion":"1.0",...}
Response status: 200, body length: 196 bytes
Digest Auth succeeded
```

### Failed Authentication
```
Proxying request: POST https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi (user: wrong)
Step 1: Testing connection without authentication
Response status: 401, body length: 0 bytes
Step 2: 401 received, trying authentication
HTTPS detected: Trying Basic Auth first
Response status: 401, body length: 381 bytes
Basic Auth failed, trying Digest Auth
Response status: 401, body length: 127 bytes
Camera request failed: authenticated request failed: HTTP 401: Unauthorized
```

## Performance Benchmarks

**Expected timings:**
- Unauthenticated test: ~50-100ms
- Basic Auth: ~150-200ms (1 round trip)
- Digest Auth: ~300-400ms (2 round trips)
- Multiple requests: ~350ms average

**Performance test:**
```bash
# Time 5 requests
time for i in {1..5}; do
  curl -s -X POST http://127.0.0.1:9876/proxy \
    -H "Content-Type: application/json" \
    -d @test-camera-156.json > /dev/null
done

# Expected: ~1.5-2.0 seconds total (avg 300-400ms each)
```

**If slower than expected:**
- Check network latency to camera
- Check camera CPU usage (may be processing other requests)
- Check proxy server load

## Development Workflow

### After Code Changes
```bash
# 1. Build
cd proxy-server
go build -o camera-proxy-server main.go

# 2. Deploy
cp camera-proxy-server ~/Library/Application\ Support/Anava/

# 3. Restart
killall camera-proxy-server
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist

# 4. Verify
curl -s http://127.0.0.1:9876/health
ps aux | grep camera-proxy-server | grep -v grep

# 5. Test
./test-camera-auth.sh
```

### Viewing Logs in Real-Time
```bash
# Full log output
tail -f ~/Library/Logs/anava-camera-proxy-server.log

# Filter for errors only
tail -f ~/Library/Logs/anava-camera-proxy-server.log | grep -i error

# Filter for specific camera
tail -f ~/Library/Logs/anava-camera-proxy-server.log | grep "192.168.50.156"

# Filter for auth attempts
tail -f ~/Library/Logs/anava-camera-proxy-server.log | grep -E "(Basic Auth|Digest Auth)"
```

## Troubleshooting Checklist

- [ ] Proxy server is running (`curl http://127.0.0.1:9876/health`)
- [ ] Camera is reachable (`ping 192.168.50.156`)
- [ ] HTTPS port is open (`nc -zv 192.168.50.156 443`)
- [ ] Credentials are correct (test direct camera access)
- [ ] Request has JSON body (`grep "Received request body" logs`)
- [ ] Body is being sent in auth requests (`grep "Marshaled JSON body" logs`)
- [ ] Camera is not returning error code 4000 (JSON syntax error)
- [ ] Response status is 200 (success)

## Emergency Recovery

### Proxy Won't Start
```bash
# Check if port 9876 is in use
lsof -i :9876

# Kill any process using port
kill -9 $(lsof -ti :9876)

# Remove and recreate launchd plist
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
rm ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
./install-proxy.sh
```

### Proxy Crashes
```bash
# Check crash logs
cat ~/Library/Logs/anava-camera-proxy-server.log | grep -i "panic\|fatal"

# Restart with verbose output
killall camera-proxy-server
~/Library/Application\ Support/Anava/camera-proxy-server &

# Watch for errors
```

### Complete Reset
```bash
# Stop everything
killall camera-proxy-server
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist

# Clean up
rm ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
rm ~/Library/Application\ Support/Anava/camera-proxy-server
rm ~/Library/Logs/anava-camera-proxy-server.log

# Rebuild and reinstall
cd proxy-server
go build -o camera-proxy-server main.go
./install-proxy.sh

# Verify
./test-camera-auth.sh
```

## Contact & Support

**Log Location:** `~/Library/Logs/anava-camera-proxy-server.log`

**Test Script:** `./test-camera-auth.sh`

**Documentation:**
- `CAMERA_AUTH_FIX_README.md` - Complete fix documentation
- `JSON_BODY_FIX.md` - Technical deep dive
- `DIGEST_AUTH_BODY_FIX_SUMMARY.md` - Summary of changes

**Key Files:**
- `proxy-server/main.go` - Source code
- `test-camera-156.json` - Test request payload
- `~/Library/LaunchAgents/com.anava.camera-proxy-server.plist` - LaunchAgent config
