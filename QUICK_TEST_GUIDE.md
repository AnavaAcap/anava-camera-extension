# QUICK TEST GUIDE - Chrome Extension with Full TypeScript Services

## Prerequisites

1. **Build Extension:**
   ```bash
   cd /Users/ryanwager/anava-camera-extension
   npm run build
   ```

2. **Start Proxy Server:**
   ```bash
   ./install-proxy.sh

   # Verify it's running
   curl http://127.0.0.1:9876/health
   # Expected: {"status":"healthy"}
   ```

## Step 1: Load Extension (30 seconds)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select folder: `/Users/ryanwager/anava-camera-extension/dist`
5. Extension should load with no errors

## Step 2: Check Service Worker (10 seconds)

1. In chrome://extensions, find the extension card
2. Click **"Inspect views: service worker"**
3. Console should show:
   ```
   [Background] Anava Local Network Bridge initialized
   ```
4. **KEEP THIS WINDOW OPEN** for test logs

## Step 3: Test from Web App (60 seconds)

### Get Extension ID
1. Copy the extension ID from chrome://extensions
2. Update web app `.env.local`:
   ```bash
   VITE_EXTENSION_ID=your-extension-id-here
   ```

### Test Health Check
In web app console (http://localhost:5173):

```javascript
chrome.runtime.sendMessage(
  'YOUR_EXTENSION_ID',
  { command: 'health_check', payload: {} },
  response => console.log(response)
);
```

**Expected:**
```javascript
{
  success: true,
  data: {
    status: 'healthy',
    proxyServer: {status: 'healthy'}
  }
}
```

### Test Network Scan
```javascript
chrome.runtime.sendMessage(
  'YOUR_EXTENSION_ID',
  {
    command: 'scan_network',
    payload: {
      subnet: '192.168.50.0/24',
      credentials: {
        username: 'anava',
        password: 'baton'
      }
    }
  },
  response => {
    console.log('Scan result:', response);
    if (response.success) {
      console.log('Cameras found:', response.data.cameras.length);
      console.table(response.data.cameras);
    }
  }
);
```

## What You'll See

All console logs for IP .156 are marked with **🎯** symbols:

```
🎯 TARGET IP FOUND IN RANGE: 192.168.50.156
✅ TARGET IP 192.168.50.156 IS IN TASK LIST
🎯 TARGET IP 192.168.50.156 IS IN THIS BATCH!
🎯🎯🎯 STARTING CHECK FOR TARGET IP: 192.168.50.156
```

Then one of:
- ✅ `🎯✅ FOUND CAMERA!` - Success
- ⚠️ `🎯⚠️ NO CAMERA FOUND` - Auth/validation failed
- ❌ `🎯❌ ERROR: [message]` - Connection error

## Copy Results

After test:
1. Right-click in console
2. Select all (Cmd+A)
3. Copy text
4. Share the output!

## What This Tells Us

The console will definitively answer:

1. **Is .156 in the IP range?** → Yes/No
2. **Is .156 in the task list?** → Yes/No
3. **Is .156 scanned?** → Yes/No
4. **What's the exact error?** → Full error details

**No more guessing! Every step is logged! 🎉**

---

See `DEBUG_TEST_INSTRUCTIONS.md` for detailed explanations.
