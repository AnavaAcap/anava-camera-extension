# Testing Guide

## Pre-Test Setup

### 1. Network Requirements

- Must be on same network as Axis cameras
- Network range must match camera IPs (e.g., `192.168.50.0/24`)
- Firewall must allow outbound HTTP/HTTPS
- No VPN or proxy interference

### 2. Camera Requirements

- Axis camera with firmware >= 11.11.0
- Known username and password (test with `anava` / `baton`)
- Camera must be powered on and network-connected
- Camera must have VAPIX API enabled (default)

### 3. Browser Setup

- Chrome or Chromium-based browser
- Extension loaded in Developer Mode
- Browser console open for logs (F12)

## Test Scenarios

### Test 1: Single IP Quick Scan

**Purpose**: Verify basic authentication and device detection.

**Steps**:
1. Load extension popup
2. Enter known camera IP (e.g., `192.168.50.100`)
3. Enter credentials: `anava` / `baton`
4. Click "Quick Scan"

**Expected Result**:
- Progress section appears
- "Scanning 192.168.50.100..." message
- Camera card appears in results
- Card shows: model, IP, firmware version, "Supported" status

**Console Logs** (check browser console):
```
🔐 [CameraAuth] Testing authentication for 192.168.50.100:443
✅ [CameraAuth] Authentication successful via HTTPS:443
✅ Confirmed Axis camera via authentication
✅ Camera validated and created: { ... }
```

**Failure Cases**:
- No camera found → Check IP, credentials, or network connectivity
- Unsupported firmware → Upgrade camera to >= 11.11.0
- Authentication failed → Verify credentials

### Test 2: Network Range Scan

**Purpose**: Verify full network discovery with adaptive batching.

**Steps**:
1. Enter network range: `192.168.50.0/24`
2. Enter credentials: `anava` / `baton`
3. Select intensity: "Balanced"
4. Click "Start Network Scan"

**Expected Result**:
- Progress bar animates
- Status updates: "Scanning 192.168.50.X..."
- Performance details show batch size adjustments
- All cameras on network appear in results
- Non-cameras (speakers, etc.) filtered out

**Console Logs**:
```
=== Starting network scan ===
Initialized adaptive scanner for LAN network with intensity: balanced
Scanning network 192.168.50.0/24 (192.168.50.1 - 192.168.50.254)
Starting with batch size: 30
✅ Device alive at 192.168.50.100 (TCP response time: 25ms)
✓ Found Axis device at 192.168.50.100 (HTTPS 401)
=== Checking Axis camera at 192.168.50.100 with credentials ===
✅ Camera validated and created: { ... }
Scan complete. Found 3 cameras.
```

**Performance Checks**:
- Batch size adjusts dynamically (watch console)
- Error rate stays low (<5%)
- Scan completes in 1-3 minutes for /24

### Test 3: Firmware Filtering

**Purpose**: Verify unsupported firmware detection.

**Steps**:
1. Scan network as above
2. Look for any cameras with firmware < 11.11.0

**Expected Result**:
- Unsupported cameras show red "Unsupported" badge
- Card displays reason: "Firmware X.X.X is below minimum required version 11.11.0"
- Settings tab has "Filter unsupported firmware" checkbox

**Console Logs**:
```
[CameraAuth] Firmware version: 10.12.182
❌ Firmware 10.12.182 is below minimum required version 11.11.0
```

### Test 4: Device Type Filtering

**Purpose**: Verify speakers and non-cameras are excluded.

**Setup**: Need Axis speaker on network (model starting with 'C').

**Expected Result**:
- Speaker is NOT shown in results
- Console log: "❌ Axis device is not a camera (speaker)"

**Console Logs**:
```
✅ Confirmed Axis camera via unified auth
deviceType: speaker
❌ Axis device is not a camera (speaker)
```

### Test 5: Authentication Methods

**Purpose**: Verify both Digest and Basic auth work.

**Test Digest Auth** (HTTP port 80):
```javascript
// Browser console
import { authenticateCamera } from './src/services/CameraAuthentication.js';
const result = await authenticateCamera('192.168.50.100', 'anava', 'baton', 80);
console.log('Auth method:', result.authMethod); // Should be 'digest'
```

**Test Basic Auth** (HTTPS port 443):
```javascript
const result = await authenticateCamera('192.168.50.100', 'anava', 'baton', 443);
console.log('Auth method:', result.authMethod); // Should be 'basic'
```

**Expected Result**:
- HTTP uses Digest Auth
- HTTPS uses Basic Auth
- Both return `success: true`

### Test 6: Multi-Camera Selection

**Purpose**: Verify deployment tab camera selection.

**Steps**:
1. Discover multiple cameras
2. Click on camera cards to select
3. Switch to "Deploy" tab
4. Verify selected cameras appear

**Expected Result**:
- Clicked cards turn blue/highlighted
- "Selected Cameras" count updates
- Deploy tab shows camera tags
- Deploy button enables when file + license provided

### Test 7: Settings Persistence

**Purpose**: Verify settings are saved.

**Steps**:
1. Go to Settings tab
2. Enable "Auto-save credentials"
3. Enter default network: `192.168.50.0/24`
4. Click "Save Settings"
5. Close and reopen extension

**Expected Result**:
- Settings remain checked
- Default network auto-fills
- Credentials auto-fill (if auto-save enabled)

### Test 8: Adaptive Batch Sizing

**Purpose**: Verify scanner adjusts to network conditions.

**Test Slow Network**:
1. Start scan on congested network
2. Watch console for batch size adjustments

**Expected Logs**:
```
Starting with batch size: 30
⚠️ High error rate (8.5%) detected. Reducing batch size from 30 to 15
✅ Good performance (1.2% errors, 250ms avg). Increasing batch size from 15 to 25
```

**Test Fast Network**:
1. Start scan on fast LAN
2. Watch batch size increase

**Expected Logs**:
```
Starting with batch size: 30
✅ Good performance (0.0% errors, 45ms avg). Increasing batch size from 30 to 40
✅ Good performance (0.5% errors, 52ms avg). Increasing batch size from 40 to 50
```

### Test 9: Error Handling

**Purpose**: Verify graceful error handling.

**Test Invalid Network Range**:
- Enter `192.168.999.0/24` → Alert: "Invalid network range format"

**Test Invalid IP**:
- Enter `999.999.999.999` → Alert: "Invalid IP address format"

**Test Missing Credentials**:
- Leave username blank → Alert: "Please fill in all required fields"

**Test Wrong Credentials**:
- Enter wrong password → No cameras found, console: "Authentication failed"

**Test Network Timeout**:
- Scan network with no cameras → Completes with "Found 0 cameras"

## Performance Benchmarks

### Expected Scan Times (192.168.x.0/24, 254 IPs)

**Conservative**:
- Batch size: 15-30
- Time: 3-5 minutes
- Accuracy: 100% (no missed devices)

**Balanced** (Recommended):
- Batch size: 30-80
- Time: 1-2 minutes
- Accuracy: 99%+ (rare misses)

**Aggressive**:
- Batch size: 50-150
- Time: 30-60 seconds
- Accuracy: 95%+ (may miss slow devices)

### Smaller Networks

**192.168.x.0/26** (62 IPs):
- Conservative: ~1 minute
- Balanced: ~20 seconds
- Aggressive: ~10 seconds

**192.168.x.0/27** (30 IPs):
- Conservative: ~30 seconds
- Balanced: ~10 seconds
- Aggressive: ~5 seconds

## Debugging Tips

### Enable Verbose Logging

All services use console.log extensively. Keep browser console open.

### Check Network Requests

1. Open DevTools → Network tab
2. Start scan
3. Filter by "param.cgi" or "basicdeviceinfo"
4. Check request/response headers

### Test Individual Functions

```javascript
// Import in browser console (popup.html)
import { CameraDiscoveryService } from './src/services/CameraDiscovery.js';
import { authenticateCamera } from './src/services/CameraAuthentication.js';
import { AdaptiveScanner } from './src/services/AdaptiveScanConfig.js';

// Test TCP check
const service = new CameraDiscoveryService();
const alive = await service.checkTCPConnection('192.168.50.100', 443);
console.log('TCP alive:', alive);

// Test auth
const auth = await authenticateCamera('192.168.50.100', 'anava', 'baton');
console.log('Auth result:', auth);

// Test scanner
const scanner = new AdaptiveScanner({ isLAN: true });
console.log('Batch size:', scanner.getBatchSize());
```

### Common Issues

**Issue**: "Failed to fetch" errors

**Cause**: CORS policy blocking requests

**Fix**: Verify `host_permissions` in manifest.json includes `http://*/*` and `https://*/*`

---

**Issue**: TCP checks always fail

**Cause**: Network timeout too short

**Fix**: Increase timeout in `checkTCPConnection()`:
```typescript
// CameraDiscovery.ts, line ~680
const isAlive = await this.checkTCPConnection(ip, 80, 3000); // Increase to 3000ms
```

---

**Issue**: Digest auth fails

**Cause**: MD5 hash incorrect

**Debug**: Add logs in `buildDigestAuth()`:
```typescript
console.log('ha1:', ha1);
console.log('ha2:', ha2);
console.log('response:', response);
```

---

**Issue**: No cameras found, but cameras exist

**Cause**: Wrong credentials or network misconfiguration

**Fix**:
1. Try quick scan first with known IP
2. Verify credentials on camera web UI
3. Check network range matches cameras
4. Try different intensity settings

## Test Reports

### Test Report Template

```
Date: 2025-10-28
Tester: [Your name]
Network: 192.168.50.0/24
Cameras: 3x Axis M-series

Test 1: Single IP Quick Scan
- Result: PASS
- Time: 2.5s
- Notes: Camera detected, firmware 11.11.75 supported

Test 2: Network Range Scan
- Result: PASS
- Time: 1m 45s
- Found: 3 cameras
- Missed: 0
- Notes: Adaptive batching worked well, batch size 25-40

Test 3: Firmware Filtering
- Result: PASS
- Notes: 1 camera marked unsupported (firmware 10.12.182)

[... continue for all tests]
```

### Submit Test Reports

- Create issue on GitHub with test results
- Include console logs for failures
- Attach screenshots if UI issues

## Automated Testing (Future)

### Unit Tests (TODO)

```bash
npm test
```

Tests to add:
- `CameraAuthentication.test.ts` - Auth methods, firmware checks
- `CameraDiscovery.test.ts` - IP calculations, TCP checks
- `AdaptiveScanConfig.test.ts` - Batch size adjustments

### Integration Tests (TODO)

Mock camera API responses and test full discovery flow.

### E2E Tests (TODO)

Use Puppeteer to automate UI interactions and verify results.
