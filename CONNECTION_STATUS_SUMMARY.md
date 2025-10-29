# Connection Status Logic - Updated

## Three-State System

### 🟢 GREEN - Fully Connected
**Condition**: Both proxy server AND web app are reachable

**Indicators**:
- Green pulsing dot
- Status text: "Connected"
- Proxy Server: "Running" (green text)
- Web App: "Reachable" (green text)
- "Open Anava Deployer" button: ENABLED
- Setup instructions: HIDDEN

**Meaning**: Ready to deploy cameras. Both local proxy and web interface are working.

---

### 🟡 YELLOW - Partial Connection
**Condition**: ONLY proxy server OR web app is reachable (but not both)

**Indicators**:
- Yellow pulsing dot
- Status text: "Partial Connection"
- One service shows green, one shows red
- "Open Anava Deployer" button: ENABLED if web app reachable, DISABLED otherwise
- Setup instructions: SHOWN (with specific guidance based on what's missing)

**Scenarios**:

1. **Web app reachable, proxy NOT running**:
   - Proxy Server: "Not Running" (red)
   - Web App: "Reachable" (green)
   - Button: ENABLED
   - Instructions: "Install and start proxy server"

2. **Proxy running, web app NOT reachable**:
   - Proxy Server: "Running" (green)
   - Web App: "Not Reachable" (red)
   - Button: DISABLED
   - Instructions: "Check internet connection"

---

### 🔴 RED - Not Connected
**Condition**: NEITHER proxy server NOR web app is reachable

**Indicators**:
- Red pulsing dot
- Status text: "Not Connected"
- Proxy Server: "Not Running" (red text)
- Web App: "Not Reachable" (red text)
- "Open Anava Deployer" button: DISABLED
- Setup instructions: SHOWN (guidance for both issues)

**Meaning**: Cannot deploy cameras. Need to fix both proxy and internet connection.

---

## Configuration

### Web App URL
Updated to production: `https://anava-ai.web.app/`

### Health Checks

1. **Proxy Server**: `GET http://127.0.0.1:9876/health`
   - Timeout: 3 seconds
   - Success: Response contains `{"status":"ok"}`

2. **Web App**: `HEAD https://anava-ai.web.app/`
   - Mode: `no-cors` (to avoid CORS issues)
   - Timeout: 5 seconds
   - Success: Fetch completes without error

### Auto-Refresh
Checks both services every 5 seconds and updates UI accordingly.

---

## Testing

### Test Green (Both Connected)
```bash
# 1. Ensure proxy running
curl http://127.0.0.1:9876/health

# 2. Ensure internet connection working
curl -I https://anava-ai.web.app/

# 3. Click extension icon → Should show GREEN
```

### Test Yellow (Partial - Proxy Only)
```bash
# 1. Ensure proxy running
./start-proxy.sh

# 2. Simulate no internet (e.g., turn off WiFi or block domain)

# 3. Click extension icon → Should show YELLOW
# Message: "Web app is not reachable"
```

### Test Yellow (Partial - Web App Only)
```bash
# 1. Stop proxy
./stop-proxy.sh

# 2. Ensure internet connection working

# 3. Click extension icon → Should show YELLOW
# Message: "Proxy server is not running"
```

### Test Red (Neither Connected)
```bash
# 1. Stop proxy
./stop-proxy.sh

# 2. Disable internet connection

# 3. Click extension icon → Should show RED
# Message: "Both proxy server and web app are unreachable"
```

---

## UI Changes Made

1. **popup.js**: Added `checkWebApp()` function and dual-state logic
2. **popup.html**: Added "Web App" status row
3. **popup.css**: Added `.status-dot.partial` for yellow color
4. **manifest.json**: Updated externally_connectable to include `https://anava-ai.web.app/*`

---

## Files Updated

- `popup.js` - Dual connection checking (proxy + web app)
- `popup.html` - Added web app status display
- `popup.css` - Added yellow/partial state styling
- `manifest.json` - Updated web app URL in externally_connectable

**Status**: ✅ Ready to test
