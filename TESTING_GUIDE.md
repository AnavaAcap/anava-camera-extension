# Chrome Extension Testing Guide

## Extension Status
✅ **Built and Ready** - `/Users/ryanwager/anava-camera-extension/dist/`

## Pre-Test Checklist
- [ ] Extension location: `/Users/ryanwager/anava-camera-extension/dist/`
- [ ] GCS CDN verified: https://storage.googleapis.com/anava-acaps/latest.json
- [ ] Camera accessible: 192.168.50.156
- [ ] Credentials ready: `anava` / `baton`

## Testing Steps

### 1. Load Extension in Chrome
1. Open Chrome and navigate to: `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select folder: `/Users/ryanwager/anava-camera-extension/dist/`
5. Extension should appear as "Anava Camera Discovery & Deployment v1.0.0"

**If already loaded**: Click the reload icon on the extension card

### 2. Test Camera Discovery
1. Click the extension icon in Chrome toolbar (or find in extensions menu)
2. Fill in Discovery tab:
   - Network Range: `192.168.50.0/24`
   - Username: `anava`
   - Password: `baton`
   - Intensity: Leave as "Balanced"
3. Click "Start Network Scan"
4. **Expected**: Progress bar appears, scanning through IPs
5. **Watch for**: Camera at 192.168.50.156 should be discovered
6. **Expected result**: Camera card appears with model, firmware, IP, protocol

**Debugging Discovery Issues**:
- Open Chrome DevTools: Right-click extension popup → "Inspect"
- Check Console tab for logs
- Look for HTTP fallback messages if HTTPS fails
- Verify camera responds to: `http://192.168.50.156/axis-cgi/param.cgi`

### 3. Test Complete Deployment

#### 3.1 Prepare Deployment Configs
Switch to "Deploy" tab and fill in:

**License Key**: Your Anava license key

**Firebase Config** (JSON):
```json
{
  "apiKey": "YOUR_FIREBASE_API_KEY",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "projectId": "YOUR_PROJECT_ID",
  "storageBucket": "YOUR_PROJECT.appspot.com",
  "messagingSenderId": "YOUR_MESSAGING_SENDER_ID",
  "appId": "YOUR_APP_ID",
  "databaseId": "(default)"
}
```

**Gemini Config** (JSON):
```json
{
  "vertexApiGatewayUrl": "https://YOUR_GATEWAY_URL",
  "vertexApiGatewayKey": "YOUR_API_KEY",
  "vertexGcpProjectId": "YOUR_PROJECT_ID",
  "vertexGcpRegion": "us-central1",
  "vertexGcsBucketName": "YOUR_BUCKET_NAME"
}
```

**Customer ID**: Your customer identifier

#### 3.2 Run Deployment
1. Select discovered camera(s) by clicking card
2. Click "Start Deployment"
3. **Expected**: Deployment progress cards appear for each camera

**Deployment Stages** (0-100% per stage):
1. ⏳ **Stage 1**: Fetching ACAP manifest from GCS
2. ⏳ **Stage 2**: Downloading ACAP (progress bar shows download %)
3. ⏳ **Stage 3**: Uploading ACAP to camera (progress bar shows upload %)
4. ⏳ **Stage 4**: Installing ACAP on camera
5. ⏳ **Stage 5**: Activating license
6. ⏳ **Stage 6**: Pushing configuration
7. ✅ **Stage 7**: Starting application

**Success Indicators**:
- Each stage completes with progress reaching 100%
- Status changes from "⏳ Pending" → "✅ Complete"
- Stage text updates in real-time
- No red error messages

### 4. Verify Deployment Success

#### 4.1 Check Camera Web Interface
1. Navigate to: `http://192.168.50.156`
2. Login with `anava` / `baton`
3. Go to: Settings → Apps
4. **Verify**: "BatonAnalytic" (or "Anava - Analyze") appears in app list
5. **Verify**: Status shows "Running"
6. **Verify**: License shows "Licensed"

#### 4.2 Check ACAP Endpoints
Test configuration endpoint:
```bash
curl -u anava:baton "http://192.168.50.156/local/BatonAnalytic/baton_analytic.cgi?command=getInstallerConfig"
```
**Expected**: Returns JSON with Firebase/Gemini config

#### 4.3 Check Camera Logs
1. Camera web interface → System Options → Logs
2. Look for BatonAnalytic entries
3. **Expected**: No errors, successful startup messages

## Common Issues & Solutions

### Issue: Extension doesn't load
- **Solution**: Check DevTools console for import errors
- **Check**: All .js files exist in dist/src/services/

### Issue: "Network error" during scan
- **Solution**: Verify camera is on same network as computer
- **Try**: Ping 192.168.50.156 from terminal
- **Check**: Firewall isn't blocking ports 80/443

### Issue: SSL certificate errors
- **Expected**: Extension should automatically fall back to HTTP:80
- **Check Console**: Look for "HTTPS:443 failed, trying HTTP:80"
- **Verify**: Camera responds on HTTP

### Issue: ACAP download fails
- **Solution**: Verify GCS bucket is public
- **Test**: Open in browser: https://storage.googleapis.com/anava-acaps/latest.json
- **Check**: manifest.json contains correct URLs

### Issue: Upload fails (401 Unauthorized)
- **Solution**: Verify credentials are correct
- **Try**: Test manually: `curl -u anava:baton http://192.168.50.156/axis-cgi/param.cgi`

### Issue: License activation fails
- **Check**: License key format is correct
- **Verify**: License isn't already used on another device
- **Look for**: Error codes in console (0/30=success, 1=invalid, 2=used, 31=expired)

### Issue: App doesn't start
- **Check**: Firmware version >= 11.11.0
- **Verify**: Correct ACAP architecture was selected (aarch64 vs armv7hf)
- **Check**: Camera has enough storage space

## Success Criteria

### Discovery ✅
- [ ] Camera at .156 discovered within 30 seconds
- [ ] Camera details show correct model/firmware
- [ ] Protocol detected (http or https)
- [ ] isSupported flag is true

### Deployment ✅
- [ ] All 7 deployment stages complete
- [ ] Progress bars reach 100%
- [ ] Status shows "✅ Complete"
- [ ] No error messages in DevTools console

### Verification ✅
- [ ] ACAP visible in camera web interface
- [ ] App status = "Running"
- [ ] License status = "Licensed"
- [ ] Configuration endpoint returns correct config
- [ ] Camera logs show successful startup

## Next Steps After Successful Test

1. **Document Results**: Note any issues, timing, UX feedback
2. **Test Edge Cases**:
   - Multiple cameras at once
   - Camera with wrong firmware version
   - Invalid license key
   - Network timeout scenarios
3. **UI Improvements**: Based on testing experience
4. **CI/CD Integration**: Update GitHub Actions to upload to GCS
5. **Chrome Web Store**: Package for distribution

## Files to Reference

- **Discovery Logic**: `/Users/ryanwager/anava-camera-extension/src/services/CameraDiscovery.ts`
- **Deployment Logic**: `/Users/ryanwager/anava-camera-extension/src/services/AcapDeploymentService.ts`
- **Authentication**: `/Users/ryanwager/anava-camera-extension/src/services/CameraAuthentication.ts`
- **UI Controller**: `/Users/ryanwager/anava-camera-extension/popup.js`
- **GCS Manifest**: `https://storage.googleapis.com/anava-acaps/latest.json`

## Contact for Issues

If you encounter any blocking issues during testing, provide:
1. Full DevTools console output (with timestamps)
2. Network tab showing failed requests
3. Camera firmware version and model
4. Exact step where failure occurred
5. Any error messages from camera web interface
