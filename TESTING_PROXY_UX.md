# Testing Proxy UX Improvements - Quick Guide

## Setup

1. **Load Updated Extension:**
   ```bash
   cd /Users/ryanwager/anava-camera-extension
   npm run build
   ```

2. **Install in Chrome:**
   - Go to `chrome://extensions`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select `/Users/ryanwager/anava-camera-extension/dist/`

## Test Scenarios

### Scenario 1: Proxy Not Running (Most Common First-Time User)

**Setup:**
```bash
# Stop proxy if running
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist 2>/dev/null

# Verify it's stopped
curl http://127.0.0.1:9876/health
# Should fail with "Connection refused"
```

**Test:**
1. Click extension icon in Chrome toolbar
2. **Expected:** RED status dot, "Not Connected"
3. **Expected:** Message: "Both proxy server and web app are unreachable"
4. **Expected:** Blue "Start Proxy Server" button visible
5. Click "Start Proxy Server" button
6. **Expected:** Button text changes to "Starting..."
7. **Expected:** Info message: "Installing proxy server..."
8. Wait 2 seconds
9. **Expected:** Error message with instructions

**Result:** User gets clear guidance to run `./install-proxy.sh`

---

### Scenario 2: Manual Installation After Button Click

**Continue from Scenario 1:**

1. Open Terminal
2. Run installation:
   ```bash
   cd /Users/ryanwager/anava-camera-extension
   ./install-proxy.sh
   ```
3. Wait for installation to complete (~10 seconds)
4. **No need to reload extension** - auto-refresh happens every 5 seconds
5. **Expected:** Status changes to GREEN automatically
6. **Expected:** "Start Proxy Server" button disappears
7. **Expected:** "Open Anava Deployer" button is enabled

**Result:** Seamless transition from error state to working state

---

### Scenario 3: Proxy Already Running (Happy Path)

**Setup:**
```bash
# Ensure proxy is running
launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist 2>/dev/null

# Verify it's running
curl http://127.0.0.1:9876/health
# Should return: {"status":"ok"}
```

**Test:**
1. Click extension icon
2. **Expected:** GREEN status dot, "Connected"
3. **Expected:** "All systems operational"
4. **Expected:** No warning banner
5. **Expected:** No "Start Proxy Server" button
6. **Expected:** "Open Anava Deployer" button is enabled

**Result:** Clean, positive experience for returning users

---

### Scenario 4: Web App Down (Network Issue)

**Setup:**
```bash
# Ensure proxy is running
curl http://127.0.0.1:9876/health

# Disconnect from internet or block anava-ai.web.app in hosts file
```

**Test:**
1. Click extension icon
2. **Expected:** YELLOW status dot, "Partial Connection"
3. **Expected:** "Proxy Server: Running" (green)
4. **Expected:** "Web App: Not Reachable" (red)
5. **Expected:** Message about checking internet connection
6. **Expected:** No "Start Proxy Server" button (proxy is fine)

**Result:** User understands it's a network issue, not a proxy issue

---

### Scenario 5: Auto-Refresh Behavior

**Test:**
1. Open extension popup (leave it open)
2. In Terminal, stop the proxy:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
   ```
3. Wait 5 seconds
4. **Expected:** Status automatically changes to RED/YELLOW
5. In Terminal, start the proxy:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
   ```
6. Wait 5 seconds
7. **Expected:** Status automatically changes to GREEN

**Result:** Real-time status updates without manual refresh

---

### Scenario 6: Button States During Action

**Test:**
1. Stop proxy (if running)
2. Open extension popup
3. Click "Start Proxy Server"
4. **During execution:**
   - Button text: "Starting..."
   - Button disabled: ✓
   - Status message: "Installing proxy server..." (blue/info)
5. **After error:**
   - Button text: "Retry Installation"
   - Button enabled: ✓
   - Status message: Error with instructions (red)

**Result:** Clear visual feedback during async operations

---

## Visual Verification

### Status Indicators

| State | Dot Color | Text | Button Visible? |
|-------|-----------|------|----------------|
| Both Connected | 🟢 Green | "Connected" | No |
| Partial | 🟡 Yellow | "Partial Connection" | Maybe |
| Not Connected | 🔴 Red | "Not Connected" | Yes |

### Button Styling

- **Primary button** ("Open Anava Deployer"): Purple gradient, full width
- **Secondary button** ("Start Proxy Server"): White with blue border, transforms to filled on hover
- **Disabled state**: Gray, no hover effects

### Status Messages

| Type | Background | Border | Text Color |
|------|-----------|--------|-----------|
| Info | Light blue | Blue | Dark blue |
| Success | Light green | Green | Dark green |
| Error | Light red | Red | Dark red |

---

## Performance Checks

### Health Check Timeouts

1. **Proxy health check:** 3 seconds max
   ```bash
   # Measure response time
   time curl http://127.0.0.1:9876/health
   ```
   Expected: <100ms when running

2. **Web app check:** 5 seconds max
   ```bash
   # Measure response time
   time curl -I https://anava-ai.web.app
   ```
   Expected: <1s with good connection

### Auto-Refresh Interval

- Opens popup → Status checks immediately
- Every 5 seconds → Checks again
- Console should log: "Checking connections..." every 5 seconds

---

## Debugging

### Check Extension Console

1. Go to `chrome://extensions`
2. Find "Anava Local Network Bridge"
3. Click "Inspect views: service worker"
4. Look for logs:
   ```
   [Background] Anava Local Network Bridge initialized
   [Background] Received internal message: install_proxy
   [Background] Proxy installation requested
   ```

### Check Popup Console

1. Right-click extension icon
2. Select "Inspect"
3. Look for logs:
   ```
   Checking connections...
   Proxy server: Connected
   Web app: Reachable
   User clicked start proxy button
   ```

### Check Proxy Server Logs

```bash
# View proxy server logs
tail -f ~/Library/Logs/anava-camera-proxy-server.log

# Should see:
# === Camera Proxy Server started ===
# Starting proxy server on 127.0.0.1:9876
```

---

## Expected Issues & Solutions

### Issue: Button Click Does Nothing

**Symptom:** Click "Start Proxy Server" but nothing happens

**Debug:**
1. Check popup console for errors
2. Check background script console for message receipt
3. Verify message listener is registered

**Solution:** Reload extension (circular arrow in chrome://extensions)

---

### Issue: Status Stuck on "Checking..."

**Symptom:** Status indicators never resolve

**Debug:**
1. Check network tab for fetch requests
2. Verify proxy server is accessible: `curl http://127.0.0.1:9876/health`
3. Check for CORS errors

**Solution:**
- If proxy down: Start proxy
- If fetch blocked: Check Chrome security settings

---

### Issue: Auto-Refresh Not Working

**Symptom:** Status doesn't update after 5 seconds

**Debug:**
1. Check if `setInterval` is running (popup console)
2. Verify popup stays open (if closed, interval stops)

**Solution:** Keep popup open for 10+ seconds to observe

---

## Success Criteria

### Must Pass:
- ✅ Fresh installation → Shows clear error message
- ✅ After install → Green status appears within 5 seconds
- ✅ Button click → Shows visual feedback (disabled + loading text)
- ✅ Error message → Contains actionable instructions

### Nice to Have:
- ✅ Smooth animations (button hover, status transitions)
- ✅ Consistent branding (Anava colors, fonts)
- ✅ Accessible focus states (keyboard navigation)

---

## Cleanup After Testing

```bash
# Stop proxy if running
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist

# Start proxy again
launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist

# Verify final state
curl http://127.0.0.1:9876/health
```

---

**Ready to Test?**

Start with **Scenario 1** (proxy not running) as this is the most common first-time user experience.
