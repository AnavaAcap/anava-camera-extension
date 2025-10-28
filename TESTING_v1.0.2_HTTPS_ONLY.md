# Testing Chrome Extension v1.0.2 - HTTPS-Only Mode

## Major Change: HTTPS-Only Support

The extension now **ONLY supports cameras accessible via HTTPS:443** due to Chrome's security restrictions on HTTP requests.

## Why HTTPS-Only?
- Chrome automatically upgrades HTTP→HTTPS causing certificate errors
- Modern browser security blocks mixed content (HTTPS extension → HTTP camera)
- **Best practice**: Cameras should use HTTPS anyway for security

## Before Testing: Enable HTTPS on Camera

### Option 1: Check if Camera Already Has HTTPS
1. Open browser, navigate to: `https://192.168.50.156`
2. If you see certificate warning, click "Advanced" → "Proceed" (self-signed cert is OK)
3. If you can access camera web interface, HTTPS is enabled ✅

### Option 2: Enable HTTPS on Camera
1. Login to camera web interface (HTTP is OK for now): `http://192.168.50.156`
2. Go to: **System** → **Security** → **HTTPS**
3. Enable HTTPS
4. Install/Create a certificate (self-signed is fine)
5. Test by accessing: `https://192.168.50.156`

## How to Test

### Step 1: Accept Camera's Self-Signed Certificate
**CRITICAL**: You must accept the camera's certificate in Chrome BEFORE using the extension

1. Open new Chrome tab
2. Navigate to: `https://192.168.50.156`
3. You'll see: "Your connection is not private"
4. Click "Advanced"
5. Click "Proceed to 192.168.50.156 (unsafe)"
6. You should see the camera's web interface
7. **Now Chrome trusts this camera's certificate**

### Step 2: Reload Extension
1. Go to `chrome://extensions/`
2. Find "Anava Camera Discovery & Deployment"
3. Click **reload icon** (circular arrow)

### Step 3: Test Single Camera
1. Click extension icon
2. Enter camera: `192.168.50.156` (port will default to 443)
3. Username: `anava`
4. Password: `baton`
5. Click "Add Camera"

### Step 4: Check Console Output
Open DevTools (F12) and look for:

**✅ SUCCESS - What we expect:**
```
🔐 [CameraAuth] Testing URL: https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi
🔐 [CameraAuth] Using Basic Auth for HTTPS
🔐 [BasicAuth] Opening XHR to: https://192.168.50.156:443/...
🔐 [BasicAuth] Response status: 200
✅ [CameraAuth] Authentication successful via HTTPS:443
✅ Found camera at 192.168.50.156 via HTTPS:443
```

**❌ FAILURE - Certificate not accepted:**
```
net::ERR_CERT_AUTHORITY_INVALID
```
→ **Fix**: Go back to Step 1, accept certificate in browser first

**❌ FAILURE - Authentication popup:**
→ This should NOT happen with HTTPS + XMLHttpRequest

### Step 5: Verify Results
- ✅ No browser authentication popup
- ✅ Camera appears in list with details (model, serial, firmware)
- ✅ Camera shows HTTPS:443 protocol

## Expected Behavior

### What Works ✅
- HTTPS cameras with self-signed certificates (after accepting in browser)
- HTTPS cameras with valid certificates
- Basic Auth over HTTPS
- Digest Auth over HTTPS
- Network scanning (HTTPS:443 only)

### What Doesn't Work ❌
- HTTP:80 cameras (no longer supported)
- Cameras without HTTPS enabled
- Cameras behind firewalls blocking HTTPS:443

## Troubleshooting

### "No camera found"
1. **Check HTTPS is enabled**: Open `https://192.168.50.156` in browser
2. **Accept certificate**: Must click "Proceed" on certificate warning
3. **Check credentials**: Verify username/password are correct
4. **Check port 443**: Camera must respond on HTTPS:443

### "net::ERR_CERT_AUTHORITY_INVALID"
- **Fix**: Open `https://192.168.50.156` in new tab, accept certificate warning

### Authentication popup still appears
- **Report immediately**: This should NOT happen with HTTPS

### Camera uses HTTP:80 only
- **Upgrade camera**: Enable HTTPS in camera settings
- **Alternative**: Use the Electron installer (supports both HTTP and HTTPS)

## Reporting Results

Please report:
1. Did HTTPS work on `https://192.168.50.156`? (YES/NO)
2. Did you accept the certificate in browser first? (YES/NO)
3. Was camera discovered by extension? (YES/NO)
4. Did authentication popup appear? (YES/NO - should be NO)
5. Console logs (copy/paste any errors)

## Known Limitations

- ⚠️ **HTTPS-only**: HTTP cameras not supported in browser extension
- ⚠️ **Certificate acceptance required**: Must accept self-signed certs in browser first
- ⚠️ **Port 443 only**: Extension doesn't try other HTTPS ports

## Alternative: Electron Installer

If you have HTTP-only cameras or need full protocol support, use the **Anava Vision Electron installer** which supports:
- HTTP:80 and HTTPS:443
- Custom ports
- Automatic protocol detection
- No certificate acceptance needed
