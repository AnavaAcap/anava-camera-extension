# TEST NOW - Quick Test Guide

## What Changed
ALL authentication moved to background service worker - this prevents browser popup.

## How to Test (2 minutes)

### Step 1: Reload Extension
1. Go to `chrome://extensions/`
2. Find "Anava Camera Discovery & Deployment"
3. Click **Reload** button (circular arrow)

### Step 2: Open Service Worker Console
1. Still on `chrome://extensions/`
2. Find your extension
3. Click **"service worker"** link (blue text)
4. This opens the background worker's console (you MUST watch this)

### Step 3: Test Camera
1. Click extension icon in Chrome toolbar
2. Enter camera IP: `192.168.50.156`
3. Username: `anava`
4. Password: `baton`
5. Click "Add Camera" button

### Step 4: Watch BOTH Consoles

**Service Worker Console (from Step 2):**
```
🔧 [Background] Received auth request: https://192.168.50.156:443/...
🔐 [Background] Attempting Basic auth first...
🔐 [Background] Basic auth failed (401), trying Digest auth...
✅ [Background] Digest auth succeeded
```

**Popup Console (F12 on extension popup):**
```
🔐 [CameraAuth] Sending auth request to background worker...
🔐 [CameraAuth] Background worker response: { success: true, data: {...} }
✅ [CameraAuth] Authentication successful via HTTPS:443
```

## Expected Results

✅ **NO BROWSER POPUP** - The authentication dialog should NOT appear
✅ **Camera discovered** - Shows in camera list
✅ **Device info displayed** - Model, serial number, firmware

## If It Fails

### Service worker shows "Inactive"
- Click "service worker" link again to wake it up
- Extension should auto-wake on message, but sometimes needs manual wake

### Console shows "Error communicating with background worker"
- Service worker crashed or isn't registered
- Reload extension completely
- Check for errors in service worker console

### Still getting popup
- **You're testing in the wrong place!**
- Popup = WRONG (will trigger popup)
- Service worker = RIGHT (no popup)
- Make sure auth code is actually running in background.js

## Success Criteria

1. No authentication popup appears ✅
2. Service worker console shows Digest auth flow ✅
3. Camera is added to list with details ✅

If all 3 pass, the fix works!
