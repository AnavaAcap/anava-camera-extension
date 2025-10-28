# Testing Chrome Extension v1.0.1 - HTTP Upgrade Fix

## What Was Fixed
Chrome was automatically upgrading HTTP requests to HTTPS for local IP addresses (192.168.x.x), causing SSL certificate errors and preventing camera discovery.

## Solution Applied
Added Manifest V3 `declarativeNetRequest` rules to prevent HTTP→HTTPS upgrade for private network IP ranges.

## Files Changed
1. **manifest.json**: Changed `webRequest` → `declarativeNetRequest`, added rules configuration
2. **rules.json** (NEW): Network request rules for 192.168.*, 10.*, 172.16.*
3. **package.json**: Build script now copies rules.json to dist/

## How to Test

### Step 1: Reload Extension
1. Open Chrome and go to `chrome://extensions/`
2. Find "Anava Camera Discovery & Deployment"
3. Click the **reload icon** (circular arrow)
4. Verify no errors appear in the extension card

### Step 2: Test Single Camera Discovery
1. Click the extension icon in Chrome toolbar
2. Enter test camera: `192.168.50.156:80`
3. Username: `anava`
4. Password: `baton`
5. Click "Add Camera"

### Step 3: Check Console Output
Open DevTools (F12 or right-click extension → Inspect) and look for:

**✅ GOOD - What we WANT to see:**
```
🔐 [BasicAuth] Opening XHR to: http://192.168.50.156:80/axis-cgi/basicdeviceinfo.cgi
🔐 [BasicAuth] Detected HTTP protocol - ensuring no HTTPS upgrade
🔐 [BasicAuth] Sending XHR with auth header to http://192.168.50.156:80
🔐 [BasicAuth] Response status: 200
✅ [CameraAuth] Authentication successful via HTTP:80
```

**❌ BAD - What we DON'T want to see:**
```
POST https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi net::ERR_CERT_AUTHORITY_INVALID
```

### Step 4: Verify Results
- **No browser authentication popup should appear** (critical!)
- Camera should be added to the camera list
- Camera details should show: model, serial number, firmware version

### Step 5: Test Network Scan (Optional)
1. Clear the camera list
2. Enter network range: `192.168.50.0/24`
3. Credentials: `anava` / `baton`
4. Click "Scan Network"
5. Watch progress - should scan all IPs without popups

## Expected Behavior
- ✅ No browser authentication popups
- ✅ HTTP requests stay as HTTP (not upgraded to HTTPS)
- ✅ Camera at 192.168.50.156:80 is discovered
- ✅ Camera details are displayed correctly

## If It Still Doesn't Work

### Check Extension Permissions
1. Go to `chrome://extensions/`
2. Click "Details" on the extension
3. Scroll to "Permissions" section
4. Should see: "Change data on all websites" (for declarativeNetRequest)

### Check Rules Are Loaded
1. Open DevTools on extension popup
2. Run in console:
```javascript
chrome.declarativeNetRequest.getDynamicRules().then(rules => console.log(rules));
```
3. Should return array of 3 rules (IDs 1, 2, 3)

### Alternative Test
If Chrome is still upgrading, we may need to:
1. Check Chrome flags (`chrome://flags/`) for HTTPS-First Mode
2. Add exception for local network in Chrome settings
3. Use a different approach (native messaging to Node.js helper)

## Reporting Results
Please report:
1. Did the authentication popup appear? (YES/NO)
2. Was the camera discovered? (YES/NO)
3. Console logs (copy/paste relevant errors)
4. Did you see "POST https://..." in the console? (YES/NO - indicates HTTP still being upgraded)
