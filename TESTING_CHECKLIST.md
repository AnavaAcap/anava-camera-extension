# Testing Checklist - Camera Deployment System

## Pre-Testing Setup

- [ ] Extension built: `npm run build` ✅
- [ ] Extension loaded in Chrome (Developer Mode → Load Unpacked → `dist/`)
- [ ] GCS bucket verified: `https://storage.googleapis.com/anava-acaps/latest.json` accessible
- [ ] Camera available: `192.168.50.156` (or other test camera)
- [ ] Credentials ready: `root` / `baton`

## Test 1: Camera Discovery (HTTPS → HTTP Fallback)

### Quick Scan Single IP
- [ ] Open extension popup
- [ ] Navigate to "Discover" tab
- [ ] Enter IP: `192.168.50.156`
- [ ] Enter credentials: `root` / `baton`
- [ ] Click "Quick Scan"
- [ ] **Expected**: Camera found with:
  - Model name (e.g., AXIS M3057)
  - Firmware version (e.g., 11.11.73)
  - Protocol (HTTP or HTTPS)
  - Port (80 or 443)
  - "Supported" status (green if >= 11.11.0)

### Network Range Scan
- [ ] Enter network: `192.168.50.0/24`
- [ ] Enter credentials: `root` / `baton`
- [ ] Select intensity: "Balanced"
- [ ] Click "Start Network Scan"
- [ ] **Expected**:
  - Progress bar animates
  - Status text updates: "Scanning 192.168.50.X..."
  - Cameras appear in results section
  - Count shown: "Discovered Cameras (N)"

### HTTP Fallback Verification
- [ ] Look at console logs (DevTools)
- [ ] **Expected**: See logs like:
  ```
  ✓ Found Axis device at 192.168.50.156 (HTTP:80 401)
  ```
  OR
  ```
  ✓ Found Axis device at 192.168.50.156 (HTTPS:443 401)
  ```

## Test 2: ACAP Architecture Detection

- [ ] Open DevTools Console
- [ ] Run quick scan on camera
- [ ] Look for logs:
  ```
  [AcapDeploy] Firmware info: {os: "OS11", architecture: "aarch64"}
  ```
- [ ] Verify correct OS (11 or 12)
- [ ] Verify correct architecture (aarch64 or armv7hf)

## Test 3: Manifest Fetching

- [ ] Click on discovered camera to select it
- [ ] Go to "Deploy" tab
- [ ] Open DevTools Network tab
- [ ] Enter dummy configs (see below)
- [ ] Click "Deploy to Selected Cameras"
- [ ] **Expected** in Network tab:
  - Request to `https://storage.googleapis.com/anava-acaps/latest.json`
  - Status: 200 OK
  - Response contains ACAP files array

## Test 4: Complete Deployment Flow

### Setup Config Data

**License Key**:
```
YOUR_ANAVA_LICENSE_KEY
```

**Customer ID**:
```
test-customer
```

**Firebase Config** (example - use real values):
```json
{
  "apiKey": "AIzaSyC...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc123",
  "databaseId": "(default)"
}
```

**Gemini Config** (example - use real values):
```json
{
  "vertexApiGatewayUrl": "https://your-gateway-xyz.gateway.dev",
  "vertexApiGatewayKey": "YOUR_API_KEY",
  "vertexGcpProjectId": "your-project",
  "vertexGcpRegion": "us-central1",
  "vertexGcsBucketName": "your-project-anava-analytics"
}
```

### Deployment Steps

- [ ] Select camera(s) in Discover tab
- [ ] Go to Deploy tab
- [ ] Verify selected cameras show in "Selected Cameras" section
- [ ] Paste all config values
- [ ] Verify "Deploy" button is enabled
- [ ] Click "Deploy to Selected Cameras"

### Expected Progress (per camera)

Watch the deployment card for each camera:

**Stage 1: Fetching (5%)**
```
⏳ Pending
────────░░░░░░░░░░░░░░░░░░ 5%
Fetching ACAP variants
```

**Stage 2: Selecting (10%)**
```
⏳ In Progress
██──────░░░░░░░░░░░░░░░░░░ 10%
Selecting ACAP variant
```

**Stage 3: Downloading (15% → 40%)**
```
⏳ In Progress
████████────░░░░░░░░░░░░░░ 35%
Downloading ACAP
```

**Stage 4: Uploading (40% → 70%)**
```
⏳ In Progress
██████████████──░░░░░░░░░░ 65%
Uploading to camera
```

**Stage 5: License (70% → 80%)**
```
⏳ In Progress
████████████████░░░░░░░░░░ 75%
Activating license
```

**Stage 6: Config (80% → 90%)**
```
⏳ In Progress
██████████████████░░░░░░░░ 85%
Pushing configuration
```

**Stage 7: Start (90% → 100%)**
```
⏳ In Progress
███████████████████░░░░░░░ 95%
Starting application
```

**Complete**
```
✅ Complete
████████████████████████ 100%
Deployment successful!
```

### Verify Deployment Success

- [ ] Extension shows: ✅ Complete (green)
- [ ] Alert: "Deployment complete!"
- [ ] Check camera logs for ACAP running
- [ ] SSH into camera (if possible):
  ```bash
  ssh root@192.168.50.156
  journalctl -u baton_analytic -f  # Check logs
  ```

## Test 5: Error Scenarios

### Invalid License Key
- [ ] Deploy with fake license: `INVALID_KEY_12345`
- [ ] **Expected**: Error shown in card
  ```
  ❌ Failed
  License activation failed: Invalid license key (code 1)
  ```

### Already Licensed Camera
- [ ] Deploy to already-licensed camera
- [ ] **Expected**: Success (code 30 = already licensed)
  ```
  ✅ Complete
  Deployment successful!
  ```

### Wrong Credentials
- [ ] Try to scan with wrong password
- [ ] **Expected**: No cameras found
  ```
  No cameras found
  ```

### Network Error
- [ ] Disconnect from network
- [ ] Try deployment
- [ ] **Expected**:
  ```
  ❌ Error
  Failed to fetch ACAP manifest: Network error
  ```

## Test 6: Multi-Camera Deployment

- [ ] Select 2-3 cameras
- [ ] Click "Deploy to Selected Cameras"
- [ ] **Expected**:
  - All cameras show deployment cards
  - Progress bars update independently
  - Some may finish before others
  - Final alert shows after all complete

## Test 7: Console Logs Verification

Open DevTools Console and look for:

```
[AcapDeploy] Starting complete deployment for: 192.168.50.156
[AcapDeploy] Fetching manifest from GCS...
[AcapDeploy] Manifest fetched: {version: "1.12.0", ...}
[AcapDeploy] Selecting ACAP variant for camera: 192.168.50.156
[AcapDeploy] Firmware info: {os: "OS11", architecture: "aarch64"}
[AcapDeploy] Selected ACAP: BatonAnalytic_1_12_0_aarch64_OS11.eap
[AcapDeploy] Downloading ACAP from: https://storage.googleapis.com/...
[AcapDeploy] Download complete: 15728640 bytes
[AcapDeploy] Uploading ACAP to camera: 192.168.50.156
[AcapDeploy] Upload complete
[AcapDeploy] Activating license for app: BatonAnalytic
[AcapDeploy] License activation response: error=0
[AcapDeploy] License activated successfully
[AcapDeploy] Pushing configuration...
[AcapDeploy] Configuration pushed successfully
[AcapDeploy] Starting application: BatonAnalytic
[AcapDeploy] Application started successfully
[AcapDeploy] Deployment complete: 192.168.50.156
```

## Test 8: Network Tab Verification

Open DevTools Network tab and verify these requests:

1. **Manifest Fetch**
   ```
   GET https://storage.googleapis.com/anava-acaps/latest.json
   Status: 200
   ```

2. **ACAP Download**
   ```
   GET https://storage.googleapis.com/anava-acaps/BatonAnalytic_1_12_0_aarch64_OS11.eap
   Status: 200
   Size: ~15 MB
   ```

3. **Firmware Check**
   ```
   GET http://192.168.50.156/axis-cgi/param.cgi?action=list&group=Properties.Firmware.Version
   Status: 200
   ```

4. **Architecture Check**
   ```
   GET http://192.168.50.156/axis-cgi/param.cgi?action=list&group=Properties.System.Architecture
   Status: 200
   ```

5. **ACAP Upload**
   ```
   POST http://192.168.50.156/axis-cgi/applications/upload.cgi
   Status: 200
   Content-Type: multipart/form-data
   ```

6. **License Activation**
   ```
   POST http://192.168.50.156/local/BatonAnalytic/license.cgi
   Status: 200
   ```

7. **Config Push**
   ```
   POST http://192.168.50.156/local/BatonAnalytic/baton_analytic.cgi?command=setInstallerConfig
   Status: 200
   Content-Type: application/json
   ```

8. **Start ACAP**
   ```
   GET http://192.168.50.156/axis-cgi/applications/control.cgi?action=start&package=BatonAnalytic
   Status: 200
   ```

## Performance Benchmarks

Record actual times:

- Discovery time (single camera): _____ seconds
- Discovery time (full subnet): _____ seconds
- ACAP download time: _____ seconds
- ACAP upload time: _____ seconds
- Total deployment time: _____ seconds

**Expected Times**:
- Discovery (single): 2-5 seconds
- Discovery (subnet): 30-120 seconds (depending on size)
- ACAP download: 15-30 seconds
- ACAP upload: 30-60 seconds
- Total deployment: 60-90 seconds per camera

## Final Checklist

- [ ] All stages complete without errors
- [ ] Progress bars reached 100%
- [ ] Success status shown (✅ Complete)
- [ ] Camera logs show ACAP running
- [ ] Camera can be accessed via VAPIX API
- [ ] SystemConfig verified on camera

## Common Issues & Solutions

### Issue: Camera not discovered
**Solution**: Try HTTP:80 explicitly, verify credentials

### Issue: ACAP download fails
**Solution**: Check GCS bucket public access, verify manifest URL

### Issue: ACAP upload fails
**Solution**: Check camera storage space, verify camera authentication

### Issue: License activation fails
**Solution**: Verify license key, check if already licensed (error 30 = OK)

### Issue: Config push fails
**Solution**: Verify JSON syntax, ensure ACAP is running

### Issue: Progress stuck at X%
**Solution**: Check console for errors, verify network connectivity

---

## Success Criteria

✅ **PASS**: All 8 tests complete without critical errors
✅ **PASS**: Deployment completes in < 2 minutes per camera
✅ **PASS**: Multi-camera deployment works simultaneously
✅ **PASS**: Error handling shows descriptive messages
✅ **PASS**: UI remains responsive during deployment

**Status**: Ready for production testing
