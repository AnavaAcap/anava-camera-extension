# License Worker Fix - Version 2.0.3

## Problem

Chrome extension was failing during ACAP deployment with error:
```
[Background] ❌ Step 2 failed: License worker error: Could not establish connection. Receiving end does not exist.
```

This occurred at line 512 in `background.js` during the `handleDeployAcap` function when trying to generate license XML.

## Root Cause

**The service worker was sending messages to the offscreen document before it was fully initialized.**

The previous fix changed the path to `'dist/license-worker.html'` and added message routing, but it still used a fixed 3-second wait for SDK initialization. This was insufficient because:

1. **HTML load time**: Offscreen document needs to load
2. **External SDK load time**: Axis SDK loads from `https://www.axis.com/app/acap/sdk.js`
3. **Network variability**: External script load time varies by network speed
4. **Message listener registration**: Chrome needs time to register the message handler

**3 seconds was not enough time on slower networks.**

## Solution

Implemented **polling-based readiness check** instead of fixed timeout:

### 1. License Worker Ping Handler (`license-worker.html`)

Added a ping handler to check SDK readiness:

```javascript
// Handle ping requests (used to check if worker is ready)
if (message && message.command === 'ping_license_worker') {
  console.log('[License Worker] Responding to ping with ready status:', sdkReady);
  sendResponse({ ready: sdkReady });
  return false; // Synchronous response
}
```

### 2. Background Worker Polling (`background.js`)

Replaced fixed 3-second wait with polling loop:

```javascript
// Wait for SDK to initialize using polling with timeout
console.log('[Background] Waiting for Axis SDK to load...');
const maxWaitTime = 15000; // 15 seconds max
const startTime = Date.now();
let sdkReady = false;

while (!sdkReady && (Date.now() - startTime) < maxWaitTime) {
  try {
    // Try to ping the offscreen document
    const pingResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { command: 'ping_license_worker' },
        (response) => {
          // Ignore errors, just check if we get a response
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        }
      );
      // Add timeout to prevent hanging
      setTimeout(() => resolve(null), 1000);
    });

    if (pingResponse && pingResponse.ready) {
      console.log('[Background] ✅ License worker is ready');
      sdkReady = true;
      break;
    }
  } catch (e) {
    // Ignore errors, continue polling
  }

  // Wait 500ms before next check
  await new Promise(resolve => setTimeout(resolve, 500));
}

if (!sdkReady) {
  throw new Error('License worker did not become ready within 15 seconds');
}
```

## Benefits

1. **Robust initialization**: Waits for actual SDK load, not arbitrary timeout
2. **Fast on good networks**: Checks every 500ms, so minimal wait on fast networks
3. **Tolerant of slow networks**: Up to 15 seconds for SDK to load
4. **Clear error messages**: Explicit timeout error if SDK fails to load
5. **Better logging**: Shows exact moment when worker becomes ready

## Version Update

- **Manifest version**: `2.0.2` → `2.0.3`
- **Build**: Successfully built with `npm run build`
- **Files updated**:
  - `/Users/ryanwager/anava-camera-extension/background.js` (lines 663-766)
  - `/Users/ryanwager/anava-camera-extension/license-worker.html` (lines 93-133)
  - `/Users/ryanwager/anava-camera-extension/manifest.json` (version field)

## Testing Instructions

1. **Rebuild extension**:
   ```bash
   npm run build
   ```

2. **Reload extension in Chrome**:
   - Go to `chrome://extensions/`
   - Find "Anava Local Connector"
   - Click reload button
   - Verify version shows `2.0.3`

3. **Test license generation**:
   - Deploy ACAP to a camera
   - Watch browser console for these log messages:
     ```
     [Background] Creating offscreen document for Axis SDK
     [Background] Waiting for Axis SDK to load...
     [License Worker] Responding to ping with ready status: false
     [License Worker] Responding to ping with ready status: false
     [License Worker] Axis SDK loaded successfully
     [License Worker] Responding to ping with ready status: true
     [Background] ✅ License worker is ready
     [Background] Sending license generation request to offscreen document
     [License Worker] Processing license generation request
     [Background] License XML received from worker
     ```

4. **Verify no errors**:
   - Should NOT see: "Could not establish connection. Receiving end does not exist."
   - Should see: "✅ License worker is ready" followed by successful license generation

## Expected Behavior

**Fast networks (< 1 second SDK load)**:
- 1-2 polling attempts (~500-1000ms wait)
- Quick transition to license generation

**Slow networks (3-5 second SDK load)**:
- 6-10 polling attempts (~3-5 seconds wait)
- Eventually becomes ready and proceeds

**Network failures (SDK never loads)**:
- 30 polling attempts over 15 seconds
- Clear error: "License worker did not become ready within 15 seconds"

## Files Modified

```
/Users/ryanwager/anava-camera-extension/
├── background.js (lines 663-766: polling-based readiness check)
├── license-worker.html (lines 93-133: ping handler added)
├── manifest.json (version 2.0.2 → 2.0.3)
└── dist/ (all rebuilt files)
```

## Rollback Instructions

If this fix causes issues, rollback to v2.0.2:

```bash
git checkout HEAD~1 -- background.js license-worker.html manifest.json
npm run build
```

## Success Criteria

✅ Extension builds without errors
✅ Manifest version is 2.0.3
✅ Offscreen document loads successfully
✅ SDK readiness polling works
✅ License generation completes without "Receiving end does not exist" error
✅ Deployment succeeds through all 6 steps
