# License Activation Fix - Version 2.0.7

## Problem Summary

Camera showed: `Status="Running" License="Missing"`

The ACAP was already running before license upload, which prevented the license from taking effect.

## Root Cause

**Extension's Original Sequence (WRONG):**
```
Step 1: Deploy ACAP file
Step 2: Activate license (upload XML)
Step 3: Ensure ACAP is running ← Started app BEFORE license
Step 4: Push configuration
Step 5: Validate
```

**Electron Installer's Sequence (CORRECT):**
```
Step 1: Deploy ACAP file
Step 2: Activate license (upload XML + START APP AFTER)
Step 3: Push configuration
Step 4: Validate
```

## The Critical Difference

### Electron Pattern (cameraConfigurationService.ts lines 1354-1726)

1. **Check if already licensed** (lines 1440-1465)
   - If `License="Valid"` → Start app and return early

2. **Generate license XML** (lines 1536-1556)

3. **Upload license XML** (lines 1565-1574)

4. **Wait 3 seconds** for camera to process (line 1589)

5. **Verify license is active** (lines 1592-1629)

6. **START THE APPLICATION** (lines 1636-1659) ← KEY STEP!
   ```typescript
   // Now start the application after license activation...
   console.log("[CameraConfig] Starting BatonAnalytic application after license activation...");
   const startResult = await this.startApplication(
     ip, username, password, "BatonAnalytic", port
   );
   ```

### Why This Matters

The camera behavior appears to be:
- If ACAP is already running when you upload a license → License upload is accepted BUT NOT APPLIED
- You must START the app AFTER license upload for the license to take effect

## Changes Made

### background.js - activateLicense() function

**Added early license check (Electron pattern):**
```javascript
// First, check if the application is already licensed
console.log('[Background] Checking if ACAP is already licensed...');
const checkResponse = await fetch('http://127.0.0.1:9876/proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: `https://${cameraIp}/axis-cgi/applications/list.cgi`,
    method: 'GET',
    username: credentials.username,
    password: credentials.password,
    body: {}
  })
});

if (checkResponse.ok) {
  const checkData = await checkResponse.json();
  const checkText = checkData.data?.text || '';

  // Check if already licensed (same regex as Electron line 1436-1438)
  const licenseMatch = checkText.match(/Name="BatonAnalytic"[^>]*License="([^"]*)"/i);

  if (licenseMatch && licenseMatch[1] === 'Valid') {
    console.log('[Background] BatonAnalytic is already licensed, starting app and returning...');

    // Even if licensed, ensure app is running (Electron lines 1446-1465)
    await ensureAcapRunning(cameraIp, credentials);

    console.log('[Background] ✅ ALREADY LICENSED - SKIPPING LICENSE ACTIVATION');
    return;
  }
}
```

**Added app start AFTER license activation (critical fix):**
```javascript
// CRITICAL: Now start the application after license activation (Electron lines 1636-1659)
console.log('[Background] Starting BatonAnalytic application after license activation...');
await ensureAcapRunning(cameraIp, credentials);

console.log('[Background] ✅ LICENSE ACTIVATION COMPLETE');
console.log('[Background] Application is running and licensed');
```

### background.js - handleDeployAcap() function

**Removed redundant Step 3:**
```javascript
// OLD (6 steps):
Step 1: Deploy ACAP
Step 2: Activate license
Step 3: Ensure ACAP running ← REMOVED (now part of Step 2)
Step 4: Push config
Step 5: Validate

// NEW (4 steps):
Step 1: Deploy ACAP
Step 2: Activate license (includes starting app)
Step 3: Push config
Step 4: Validate
```

## Testing Instructions

1. **Build the extension:**
   ```bash
   npm run build
   ```

2. **Reload extension in Chrome:**
   - Navigate to `chrome://extensions/`
   - Click "Reload" on Anava Local Network Bridge

3. **Test on camera 192.168.50.156:**
   - Run deployment from web app
   - Check logs show: `✅ LICENSE ACTIVATION COMPLETE`
   - Verify final validation shows: `Status="Running" License="Valid"`

4. **Expected log sequence:**
   ```
   [Background] Step 1: Deploying ACAP file...
   [Background] ✅ ACAP deployed successfully
   [Background] Step 2: Activating license...
   [Background] Checking if ACAP is already licensed...
   [Background] Generating license XML via Axis SDK...
   [Background] ✅ License XML generated
   [Background] Uploading license to camera...
   [Background] ✅ License upload accepted by camera
   [Background] Waiting 3 seconds for camera to process license...
   [Background] Verifying license status...
   [Background] ✅ LICENSE VERIFIED AS ACTIVE!
   [Background] Starting BatonAnalytic application after license activation...
   [Background] ACAP already running
   [Background] ✅ LICENSE ACTIVATION COMPLETE
   [Background] Application is running and licensed
   [Background] ✅ License activated and app started successfully
   ```

## Version History

- **v2.0.6**: Original implementation with broken license flow
- **v2.0.7**: Fixed to match Electron installer's exact sequence

## Files Modified

1. `/Users/ryanwager/anava-camera-extension/background.js`
   - `activateLicense()` function: Added early check + app start after license
   - `handleDeployAcap()` function: Removed Step 3 (now part of Step 2)

2. `/Users/ryanwager/anava-camera-extension/package.json`
   - Version bumped to 2.0.7

## Key Learnings

1. **Camera license behavior**: Licenses must be uploaded BEFORE the ACAP is started
2. **Electron pattern is correct**: Always check if already licensed, start app after upload
3. **Timing matters**: 3 second wait after upload is critical for camera processing
4. **Verification is essential**: Always verify `License="Valid"` after upload

## References

- Electron source: `/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/cameraConfigurationService.ts`
- Specifically: `activateLicenseKey()` function (lines 1354-1726)
