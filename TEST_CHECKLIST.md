# Digest Authentication Fix - Test Checklist

## Test Environment

- **Camera IP**: 192.168.50.156
- **Camera Port**: 443 (HTTPS)
- **Credentials**: anava / baton
- **Expected Auth**: Digest (camera returns 401 with Digest challenge)

## Pre-Test Setup

- [ ] Extension built successfully: `npm run build`
- [ ] Extension loaded in Chrome: `chrome://extensions/` → Load unpacked → `dist/` folder
- [ ] Service worker active (check in extension details)
- [ ] Camera accessible: `ping 192.168.50.156`

## Test 1: No Browser Popup (CRITICAL)

**Objective**: Verify browser authentication dialog DOES NOT appear

### Steps:
1. [ ] Open extension popup (click extension icon)
2. [ ] Enter camera details:
   - IP: `192.168.50.156`
   - Port: `443`
   - Username: `anava`
   - Password: `baton`
3. [ ] Open browser console (F12)
4. [ ] Click "Test Connection" button
5. [ ] **WATCH FOR POPUP** (should NOT appear!)

### Expected Results:
- [ ] NO browser authentication dialog appears ✅
- [ ] Console shows authentication flow logs
- [ ] Success message displayed in UI
- [ ] Camera device info shown (Model, Serial, Type)

### Console Output Expected:
```
🔐 [CameraAuth] Testing authentication for 192.168.50.156:443
🔐 [CameraAuth] Sending auth request to background worker...
🔐 [Background] Received auth request
🔐 [Background] Attempting Basic auth first...
🔐 [Background] Basic auth failed (401), trying Digest auth...
✅ [Background] Digest auth succeeded
✅ [CameraAuth] Authentication successful via HTTPS:443
```

### FAILURE Criteria:
- ❌ Browser shows native authentication dialog (HTTP Basic/Digest popup)
- ❌ Console shows "Background worker error"
- ❌ No device info returned

---

## Test 2: Invalid Credentials

**Objective**: Verify error handling works correctly

### Steps:
1. [ ] Enter camera details with WRONG password:
   - IP: `192.168.50.156`
   - Port: `443`
   - Username: `anava`
   - Password: `wrongpassword`
2. [ ] Click "Test Connection"

### Expected Results:
- [ ] NO browser popup appears (even with wrong credentials)
- [ ] Error message displayed: "Invalid credentials" or similar
- [ ] Console shows authentication failure logs
- [ ] UI shows red error state

---

## Test 3: Multiple Authentication Attempts

**Objective**: Verify repeated authentications work without issues

### Steps:
1. [ ] Authenticate successfully (correct credentials)
2. [ ] Wait 5 seconds
3. [ ] Authenticate again with same credentials
4. [ ] Repeat 3 more times (total 5 authentications)

### Expected Results:
- [ ] All 5 attempts succeed
- [ ] NO popup appears on any attempt
- [ ] No browser caching interferes
- [ ] Service worker remains responsive

---

## Test 4: HTTP Port 80 (If Available)

**Objective**: Test Basic Auth fallback on HTTP

### Steps:
1. [ ] Change port to `80` (HTTP)
2. [ ] Enter correct credentials
3. [ ] Click "Test Connection"

### Expected Results:
- [ ] NO popup appears
- [ ] Either Basic or Digest auth succeeds
- [ ] Device info returned correctly

---

## Test 5: curl Verification

**Objective**: Confirm camera actually requires Digest auth

### Commands:
```bash
# Test 401 challenge
curl -v https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi \
  -k \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"apiVersion":"1.0","method":"getProperties","params":{"propertyList":["Brand","ProdNbr","SerialNumber"]}}'
```

### Expected:
- [ ] Returns `401 Unauthorized`
- [ ] `WWW-Authenticate: Digest realm="AXIS_..."` header present

```bash
# Test successful Digest auth
curl --digest -u anava:baton \
  https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi \
  -k \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"apiVersion":"1.0","method":"getProperties","params":{"propertyList":["Brand","ProdNbr","SerialNumber"]}}'
```

### Expected:
- [ ] Returns `200 OK`
- [ ] JSON response with device info:
  ```json
  {
    "data": {
      "propertyList": {
        "Brand": "AXIS",
        "ProdNbr": "M3086-V",
        "SerialNumber": "ACCC8EA27231"
      }
    }
  }
  ```

---

## Test 6: Extension Reload

**Objective**: Verify extension persists after reload

### Steps:
1. [ ] Authenticate successfully (verify no popup)
2. [ ] Close extension popup
3. [ ] Reload extension in `chrome://extensions/` (click reload icon)
4. [ ] Re-open extension popup
5. [ ] Authenticate again

### Expected Results:
- [ ] Extension reloads without errors
- [ ] Background service worker restarts
- [ ] Authentication still works without popup
- [ ] No loss of functionality

---

## Test 7: Service Worker Logs

**Objective**: Inspect background service worker directly

### Steps:
1. [ ] Go to `chrome://extensions/`
2. [ ] Find "Anava Camera Extension"
3. [ ] Click "service worker" link (opens DevTools)
4. [ ] Go to Console tab
5. [ ] Perform authentication test

### Expected Logs:
```
🔐 [Background] Received auth request: https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi
🔐 [Background] Attempting Basic auth first...
🔐 [Background] Basic auth failed (401), trying Digest auth...
🔐 [Background] Parsing Digest challenge...
🔐 [Background] Digest params: { realm: "AXIS_ACCC8EA27231", qop: "auth", nonce: "..." }
🔐 [Background] Sending Digest auth request...
✅ [Background] Digest auth succeeded
```

---

## Success Criteria Summary

### MUST PASS:
- ✅ Test 1: NO browser popup appears during authentication
- ✅ Test 2: Invalid credentials handled gracefully (no popup)
- ✅ Test 5: curl confirms camera requires Digest auth
- ✅ Test 7: Service worker logs show successful Digest flow

### SHOULD PASS:
- ✅ Test 3: Multiple authentications work reliably
- ✅ Test 6: Extension reload doesn't break functionality

### NICE TO HAVE:
- ✅ Test 4: HTTP port 80 works (if camera supports)

---

## Troubleshooting

### If browser popup appears:
1. Check extension is loaded from `dist/` folder (not `src/`)
2. Verify service worker is active in extension details
3. Check console for "Background worker error" messages
4. Reload extension and retry

### If authentication fails:
1. Verify credentials with `curl --digest` command
2. Check camera is accessible: `ping 192.168.50.156`
3. Inspect service worker logs directly
4. Check for CORS or network errors in console

### If service worker not responding:
1. Go to `chrome://extensions/`
2. Click "service worker" link to wake it up
3. Reload extension
4. Check for JavaScript errors in service worker console

---

## Test Results Template

**Date**: __________
**Tester**: __________
**Chrome Version**: __________
**Extension Version**: 1.0.0

| Test | Pass/Fail | Notes |
|------|-----------|-------|
| Test 1: No Popup | ☐ Pass ☐ Fail | |
| Test 2: Invalid Creds | ☐ Pass ☐ Fail | |
| Test 3: Multiple Attempts | ☐ Pass ☐ Fail | |
| Test 4: HTTP Port 80 | ☐ Pass ☐ Fail ☐ N/A | |
| Test 5: curl Verification | ☐ Pass ☐ Fail | |
| Test 6: Extension Reload | ☐ Pass ☐ Fail | |
| Test 7: Service Worker Logs | ☐ Pass ☐ Fail | |

**Overall Result**: ☐ PASS ☐ FAIL

**Critical Issues Found**:
-
-

**Notes**:
-
-

---

## Camera Test Configuration

```json
{
  "camera": {
    "ip": "192.168.50.156",
    "port": 443,
    "protocol": "https",
    "username": "anava",
    "password": "baton"
  },
  "expectedBehavior": {
    "authMethod": "Digest",
    "popupShown": false,
    "deviceInfo": {
      "brand": "AXIS",
      "model": "M3086-V",
      "serialNumber": "ACCC8EA27231"
    }
  }
}
```

---

## Sign-Off

**Tested By**: ____________________
**Date**: ____________________
**Signature**: ____________________

**Approved By**: ____________________
**Date**: ____________________
**Signature**: ____________________
