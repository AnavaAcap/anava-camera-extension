# Anava Camera Extension - Setup Guide

## Quick Start (3 Steps)

### 1. Install Local Connector

```bash
./install-local-connector.sh
```

This script will:
- Stop any existing proxy processes
- Clean up old LaunchAgents
- Build the proxy server binary
- Install LaunchAgent (auto-starts on boot)
- Verify everything is working

### 2. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `anava-camera-extension` directory (this folder)
5. Verify extension appears in extensions list

### 3. Verify Connection

1. Click the extension icon in Chrome toolbar
2. You should see a **green dot** - proxy is running!
3. If red dot appears, run troubleshooting steps below

## Architecture Overview

```
Web App (localhost:5173)
    ↓ postMessage
Chrome Extension (bridge)
    ↓ background.js
Proxy Server (localhost:9876)
    ↓ HTTPS + Digest Auth
Cameras (192.168.x.x)
```

**Key Point**: The Chrome extension is just a bridge. The proxy server (`local-connector`) does the heavy lifting and has full network access.

## Testing

### Run Full Test Suite

```bash
./test-proxy.sh
```

### Test with Specific Camera

```bash
./test-proxy.sh 192.168.50.156 anava baton
```

This will verify:
- Health check endpoint
- Proxy process is running
- Port 9876 is listening
- LaunchAgent is loaded
- Camera authentication (if IP provided)

## Troubleshooting

### Extension Shows Red Dot

**Problem**: Proxy server not running

**Solutions**:
```bash
# Reinstall
./install-local-connector.sh

# Check status
curl http://127.0.0.1:9876/health

# View logs
tail -f ~/Library/Logs/anava-local-connector.log
```

### Camera Scan Returns 0 Cameras

**Problem**: Wrong network or cameras offline

**Solutions**:
```bash
# Find your Mac's IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# If your Mac is 192.168.50.10, scan 192.168.50.0/24
# Test specific camera first
./test-proxy.sh 192.168.50.156

# Ping camera directly
ping 192.168.50.156

# Check proxy logs for errors
tail -f ~/Library/Logs/anava-local-connector.log
# Look for: "no route to host" (wrong network)
#           "timeout" (camera offline)
#           "401" (wrong credentials)
```

### HTTP 500 Errors During Scan

**This is NORMAL** - Proxy returns 500 for IPs without cameras.

**Only worry if**:
- ALL IPs return 500 (proxy may be down)
- Scan finds 0 cameras (wrong network range)

**To debug**:
```bash
# Watch proxy logs during scan
tail -f ~/Library/Logs/anava-local-connector.log

# Test proxy directly
curl http://127.0.0.1:9876/health
```

### Proxy Crashes/Restarts

**Problem**: Check error logs for Go panics

**Solutions**:
```bash
# Check error log
tail -50 ~/Library/Logs/anava-local-connector-error.log

# Rebuild proxy
cd proxy-server
go build -o ../build/local-connector main.go
cd ..

# Restart LaunchAgent
launchctl unload ~/Library/LaunchAgents/com.anava.local-connector-extension.plist
launchctl load ~/Library/LaunchAgents/com.anava.local-connector-extension.plist
```

## Management Commands

### Check Status

```bash
# Health check
curl http://127.0.0.1:9876/health

# LaunchAgent status
launchctl list | grep anava

# Process status
ps aux | grep local-connector

# Port check
lsof -i :9876
```

### View Logs

```bash
# Main log (requests, auth, scanning)
tail -f ~/Library/Logs/anava-local-connector.log

# Error log (crashes, panics)
tail -f ~/Library/Logs/anava-local-connector-error.log

# Show last 50 lines
tail -50 ~/Library/Logs/anava-local-connector.log
```

### Stop/Start Proxy

```bash
# Stop
launchctl unload ~/Library/LaunchAgents/com.anava.local-connector-extension.plist

# Start
launchctl load ~/Library/LaunchAgents/com.anava.local-connector-extension.plist

# Restart (stop then start)
launchctl unload ~/Library/LaunchAgents/com.anava.local-connector-extension.plist
launchctl load ~/Library/LaunchAgents/com.anava.local-connector-extension.plist
```

### Manual Start (Development)

```bash
# Run proxy in foreground (see live logs)
./build/local-connector

# Press Ctrl+C to stop
```

## Development

### Build Extension

```bash
npm run build
```

This compiles TypeScript and copies files to `dist/`.

### Watch Mode

```bash
npm run watch
```

Auto-rebuilds on file changes.

### Rebuild Proxy

```bash
cd proxy-server
go build -o ../build/local-connector main.go
cd ..
```

### Reload Extension

After making changes:
1. Run `npm run build`
2. Go to `chrome://extensions`
3. Click reload icon on extension card
4. Test changes

## File Structure

```
anava-camera-extension/
├── manifest.json                    # Chrome extension manifest
├── background.js                    # Service worker (camera scanning)
├── popup.html/css/js                # Extension UI (status indicator)
├── install-local-connector.sh       # Installation script
├── test-proxy.sh                    # Test suite
├── com.anava.local-connector-extension.plist  # LaunchAgent config
├── build/
│   └── local-connector             # Proxy server binary
├── proxy-server/
│   └── main.go                     # Proxy server source
└── src/
    ├── services/                   # TypeScript services
    └── types/                      # TypeScript types
```

## Network Scanning

### How It Works

1. Extension sends scan request to background.js
2. Background.js verifies proxy is running
3. Generates IP range from CIDR (e.g., 192.168.50.0/24 = 254 IPs)
4. Scans in batches of 50 IPs (parallel requests to proxy)
5. Proxy makes HTTPS requests to each camera
6. Returns camera info for successful connections

### Expected Behavior

- **254 IPs**: Takes ~30-60 seconds
- **Many HTTP 500s**: NORMAL (IPs without cameras)
- **0 cameras found**: Wrong network or cameras offline
- **Some cameras found**: SUCCESS!

### Network Range Tips

- Your Mac: `ifconfig | grep "inet " | grep -v 127.0.0.1`
- Same subnet: If Mac is `192.168.50.10`, scan `192.168.50.0/24`
- Smaller range: Use `/26` (64 IPs) or `/27` (32 IPs) for faster scans
- Specific IP: Use `/32` (1 IP) to test single camera

## Security Notes

### Certificate Pinning

The proxy implements certificate fingerprint pinning:
- First connection to camera: Stores SHA256 fingerprint
- Subsequent connections: Verifies fingerprint matches
- Changed certificate: Logs security alert (possible MITM attack)

### CORS Protection

Proxy only accepts requests from:
- `http://localhost:5173` (dev)
- `http://localhost:3000` (dev)
- `https://anava-ai.web.app` (production)
- `chrome-extension://*` (extension)

### Credential Handling

- Credentials sent via POST body (not URL)
- Proxy logs sanitize passwords (`anava` → `a***a`)
- No credentials stored on disk

## Common Issues & Solutions

| Problem | Cause | Solution |
|---------|-------|----------|
| Red dot in extension | Proxy not running | `./install-local-connector.sh` |
| 0 cameras found | Wrong network | Check Mac's IP, adjust scan range |
| HTTP 500 errors | Expected for non-cameras | Check proxy logs for actual errors |
| Port 9876 in use | Another process | `lsof -i :9876`, kill process |
| LaunchAgent won't load | Plist error | `plutil ~/Library/LaunchAgents/com.anava.local-connector-extension.plist` |
| Proxy crashes | Go panic | Check error log, rebuild proxy |

## Support

### Logs Location

- Main: `~/Library/Logs/anava-local-connector.log`
- Error: `~/Library/Logs/anava-local-connector-error.log`

### Diagnostic Commands

```bash
# Full diagnostic output
echo "=== Proxy Status ===" && \
curl -s http://127.0.0.1:9876/health && \
echo -e "\n=== Process ===" && \
ps aux | grep -v grep | grep local-connector && \
echo -e "\n=== LaunchAgent ===" && \
launchctl list | grep anava && \
echo -e "\n=== Port ===" && \
lsof -i :9876 && \
echo -e "\n=== Recent Logs ===" && \
tail -20 ~/Library/Logs/anava-local-connector.log
```

## Next Steps

After successful installation:

1. **Verify green dot** in extension popup
2. **Open web app** (click link in popup)
3. **Start camera scan** from web app
4. **Deploy ACAP** to discovered cameras

For detailed developer information, see [CLAUDE.md](CLAUDE.md).
