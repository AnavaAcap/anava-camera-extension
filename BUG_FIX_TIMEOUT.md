# Bug Fix: Network Scan Hanging at First Batch

## Problem
Network scan stops at 192.168.50.50 (first batch) with NO error messages. Scan hangs indefinitely with no progress.

## Root Cause
**Chrome Extension Service Worker Message Timeout Issue**

1. **Service Worker Sleep**: Chrome extension service workers can go to sleep after 30 seconds of inactivity
2. **No Message Timeout**: `chrome.runtime.sendMessage()` was called WITHOUT timeout, causing infinite hang
3. **Silent Failure**: When service worker doesn't respond, promise never resolves/rejects - it just hangs

## Code Location
- **File**: `/src/services/CameraAuthentication.ts`
- **Line**: 82 (original `chrome.runtime.sendMessage()` call)
- **Trigger**: First camera requiring Digest auth (192.168.50.156:443) sends message to background worker

## The Fix

### 1. Added `sendMessageWithTimeout()` Helper Function
```typescript
function sendMessageWithTimeout(message: any, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Background worker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response) {
        reject(new Error('No response from background worker'));
      } else {
        resolve(response);
      }
    });
  });
}
```

### 2. Added Service Worker Wake-Up Logic
Before sending auth requests, now PING the service worker to wake it up:
```typescript
// Wake up service worker first
try {
  console.log(`🔐 [CameraAuth] Waking up service worker...`);
  await sendMessageWithTimeout({ type: 'PING' }, 2000);
  console.log(`🔐 [CameraAuth] Service worker is awake`);
} catch (pingError) {
  console.error(`💥 [CameraAuth] Service worker wake-up failed:`, pingError);
  throw new Error('Background service worker not responding');
}

// Then send auth request with 10s timeout
const response = await sendMessageWithTimeout({
  type: 'AXIS_AUTH_REQUEST',
  payload: { url, username, password, body }
}, 10000);
```

### 3. Enhanced Logging
Added aggressive logging at multiple levels:
- Batch start/complete with duration tracking
- Individual IP check start/complete with timing
- Service worker wake-up success/failure
- Auth request timeout detection

**Scanner batch logging**:
```typescript
console.log(`🔍 [Scanner] Starting batch 1: IPs 192.168.50.1 - 192.168.50.50 (50 IPs)`);
console.log(`🔍 [Scanner] Starting check for 192.168.50.156...`);
console.log(`✅ [Scanner] 192.168.50.156 found camera in 1234ms`);
console.log(`✅ [Scanner] Batch completed in 5678ms`);
```

## Testing Instructions

1. **Load unpacked extension** in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `/Users/ryanwager/anava-camera-extension/dist`

2. **Start network scan**:
   - Network: `192.168.50.0/24`
   - Credentials: `anava` / `baton`
   - Intensity: `balanced`
   - Click "Start Scan"

3. **Monitor console** (right-click extension → Inspect → Console):
   - You should see batch logging for EVERY batch
   - You should see individual IP checks completing or timing out
   - **NO HANG** at 192.168.50.50 anymore

## Expected Behavior

### Before Fix
```
🔍 [Scanner] Starting batch 1: IPs 192.168.50.1 - 192.168.50.50 (50 IPs)
🔍 [Scanner] Starting check for 192.168.50.1...
⚠️ [Scanner] 192.168.50.1 no camera in 234ms
...
🔍 [Scanner] Starting check for 192.168.50.50...
[HANGS FOREVER - NO MORE LOGS]
```

### After Fix
```
🔍 [Scanner] Starting batch 1: IPs 192.168.50.1 - 192.168.50.50 (50 IPs)
🔍 [Scanner] Starting check for 192.168.50.1...
⚠️ [Scanner] 192.168.50.1 no camera in 234ms
...
🔍 [Scanner] Starting check for 192.168.50.156...
🔐 [CameraAuth] Waking up service worker...
🔐 [CameraAuth] Service worker is awake
🔐 [CameraAuth] Sending auth request to background worker...
🔐 [Background] Basic auth succeeded
✅ [Scanner] 192.168.50.156 found camera in 1456ms
...
✅ [Scanner] Batch completed in 12345ms
🔍 [Scanner] Starting batch 2: IPs 192.168.50.51 - 192.168.50.100 (50 IPs)
```

## Why This Fix Works

1. **Explicit Timeout**: `sendMessageWithTimeout()` prevents infinite hangs
2. **Service Worker Wake**: PING message wakes up sleeping worker before heavy auth work
3. **Error Visibility**: Timeout errors are now logged to console and returned to scanner
4. **Graceful Degradation**: Scanner continues even if one IP times out

## Related Files
- `/src/services/CameraAuthentication.ts` - Auth request with timeout
- `/src/services/CameraDiscovery.ts` - Enhanced batch logging
- `/background.js` - Service worker PING handler (already implemented)

## Build Status
✅ Built successfully: `npm run build`
✅ TypeScript compilation: No errors
✅ Files copied to `dist/` folder
