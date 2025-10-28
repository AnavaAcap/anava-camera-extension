# Quick Start Guide

## 5-Minute Setup

### 1. Install Extension

```bash
cd /Users/ryanwager/anava-camera-extension
npm install
npm run build
```

### 2. Load in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select `/Users/ryanwager/anava-camera-extension`

### 3. Test on Your Network

1. Click the extension icon in Chrome toolbar
2. Enter network range: `192.168.50.0/24`
3. Enter credentials:
   - Username: `anava`
   - Password: `baton`
4. Click **"Start Network Scan"**

### 4. Results

You should see:
- Progress bar with scanning status
- List of discovered cameras with:
  - Model name
  - IP address and port
  - Firmware version
  - Support status (green = supported, red = unsupported)

### 5. Select Cameras

1. Click camera cards to select them (cards turn blue)
2. Switch to **"Deploy"** tab
3. See selected cameras listed

## Next Steps

- Read [TESTING.md](TESTING.md) for detailed test scenarios
- Read [DEVELOPMENT.md](DEVELOPMENT.md) for code architecture
- Read [README.md](README.md) for full documentation

## Troubleshooting

### No cameras found?

1. **Verify network range**: Check your router settings, most common:
   - `192.168.1.0/24`
   - `192.168.0.0/24`
   - `192.168.50.0/24`

2. **Try quick scan first**: Enter a known camera IP in "Quick Scan Single IP" section

3. **Check credentials**: Default Axis is `root:pass`, Anava cameras use `anava:baton`

4. **Check browser console** (F12): Look for detailed error messages

### Extension won't load?

1. **Check Node version**: Requires Node >= 18
2. **Rebuild**: `npm run build`
3. **Check manifest.json**: Must be valid JSON
4. **Check errors**: Chrome shows errors on `chrome://extensions/` page

### Cameras show "Unsupported"?

- Firmware < 11.11.0 is not supported
- Upgrade camera firmware to OS11 (11.11+) or OS12
- Or uncheck "Filter unsupported firmware" in Settings tab

## What This Extension Does

### Discovery Method (NOT mDNS!)

The extension uses the **proven TCP scanning method** from the Anava Vision Electron installer:

1. Calculate IP range from CIDR (e.g., 192.168.50.1 - 192.168.50.254)
2. TCP probe each IP on ports: 80, 443, 8080, 8000
3. If alive, check for Axis-specific endpoint: `/axis-cgi/param.cgi`
4. If Axis device, authenticate with credentials
5. Get device info: model, firmware, type
6. Filter out speakers, unsupported firmware, non-cameras
7. Return only supported cameras

### Why TCP Scanning is Better Than mDNS

- ✅ Works on ANY network configuration
- ✅ No firewall interference
- ✅ HTTP/HTTPS always allowed
- ✅ No multicast UDP issues
- ✅ Pure browser implementation (no native host!)
- ✅ Can scan specific IP ranges
- ✅ Returns actual device info immediately

### Adaptive Batching

The scanner automatically adjusts batch size based on network performance:

- **High error rate** → Reduce batch size (more reliable)
- **Good performance** → Increase batch size (faster scan)
- **Timeouts** → Add inter-batch delays (network breathing room)

## Key Features

### Firmware Checking ✅

- Minimum required: 11.11.0 (OS11)
- Automatically filters unsupported cameras
- Shows firmware version on each camera card

### Device Type Detection ✅

- **Cameras** (M, P, Q series): ✅ Shown
- **Speakers** (C series): ❌ Filtered out
- **Intercoms** (I series): ❌ Filtered out
- **Access Control** (A series): ❌ Filtered out

### Authentication Methods ✅

- **HTTP Digest Auth**: MD5-based challenge-response
- **Basic Auth**: Base64-encoded (HTTPS only)
- **Protocol-specific**: HTTPS prefers Basic, HTTP prefers Digest
- **Automatic fallback**: Tries both methods

### Settings Persistence ✅

- Auto-save credentials (optional)
- Default network range
- Filter unsupported firmware
- Saved in `chrome.storage.local`

## Performance

### Typical Scan Times

**Network: 192.168.x.0/24 (254 IPs)**

- **Conservative**: 3-5 minutes (100% accuracy)
- **Balanced**: 1-2 minutes (99%+ accuracy) ← **Recommended**
- **Aggressive**: 30-60 seconds (95%+ accuracy)

**Smaller networks scan faster**:
- `/26` (62 IPs): 10-60 seconds
- `/27` (30 IPs): 5-30 seconds
- `/28` (14 IPs): 3-15 seconds

### Optimization Tips

1. **Use smaller network ranges** if you know camera IPs are clustered
2. **Start with balanced intensity** and adjust if needed
3. **Use quick scan** for known IPs (2-5 seconds per camera)
4. **Check console logs** to see batch size adjustments

## Common Networks

### Home Networks

- `192.168.1.0/24` - Most common router default
- `192.168.0.0/24` - Secondary common default
- `192.168.2.0/24` - Some ISP routers
- `10.0.0.0/24` - Apple routers

### Office Networks

- `192.168.10.0/24` - Common office setup
- `192.168.100.0/24` - Large office segment
- `10.0.1.0/24` - Corporate network segment
- `172.16.0.0/24` - VPN or isolated network

### Test Networks (Anava)

- `192.168.50.0/24` - Anava test lab
- Credentials: `anava` / `baton`
- Typical cameras: 3-10 Axis M-series

## Console Commands (Advanced)

Open browser console (F12) in popup window:

```javascript
// Import services
import { CameraDiscoveryService } from './src/services/CameraDiscovery.js';
import { authenticateCamera } from './src/services/CameraAuthentication.js';

// Test single camera auth
const auth = await authenticateCamera('192.168.50.100', 'anava', 'baton');
console.log(auth);

// Test TCP check
const service = new CameraDiscoveryService();
const alive = await service.checkTCPConnection('192.168.50.100', 443);
console.log('Alive:', alive);

// Quick scan
const cameras = await service.quickScanSpecificCamera('192.168.50.100', 'anava', 'baton');
console.log('Cameras:', cameras);
```

## File Structure

```
anava-camera-extension/
├── manifest.json              # Chrome extension config
├── popup.html                 # Main UI
├── popup.css                  # Styling
├── popup.js                   # UI controller
├── background.js              # Service worker
├── package.json               # NPM config
├── tsconfig.json              # TypeScript config
├── src/
│   ├── services/              # Core logic (ported from Electron)
│   │   ├── CameraAuthentication.ts
│   │   ├── CameraDiscovery.ts
│   │   └── AdaptiveScanConfig.ts
│   └── types/
│       └── Camera.ts          # TypeScript interfaces
├── icons/                     # Extension icons (16, 48, 128px)
├── README.md                  # Full documentation
├── QUICKSTART.md             # This file
├── TESTING.md                # Test scenarios and debugging
└── DEVELOPMENT.md            # Code architecture and contributing
```

## What's Next?

### Implemented ✅

- Network scanning with TCP probing
- Camera authentication (Digest + Basic)
- Firmware version checking
- Device type filtering
- Adaptive batch sizing
- Settings persistence
- Multi-camera selection UI

### TODO 🚧

- ACAP deployment (upload .eap file)
- License activation
- Multi-camera deployment progress
- Camera configuration backup/restore
- RTSP stream preview

See [README.md](README.md) for full TODO list.

## Getting Help

1. **Check console logs** (F12) - most issues show detailed errors
2. **Read TESTING.md** - covers common issues and solutions
3. **Read DEVELOPMENT.md** - explains code architecture
4. **Check GitHub issues** - search for similar problems
5. **Contact Anava AI team** - for internal support

## Success Criteria

After running quick start, you should have:

- ✅ Extension loaded in Chrome
- ✅ Discovered at least one camera (if cameras exist)
- ✅ Camera card showing model, IP, firmware
- ✅ Can select cameras for deployment
- ✅ Console logs show successful authentication

If all above are ✅, the extension is working correctly!

## Known Limitations

1. **No mDNS discovery** - Uses TCP scanning only (intentional, more reliable)
2. **No MAC address** - Browser can't access ARP table
3. **No native host** - Pure browser implementation
4. **ACAP deployment not yet implemented** - Coming soon
5. **Icons are placeholders** - Need proper Anava branding

## Version History

- **v1.0.0** (2025-10-28) - Initial release
  - Camera discovery via TCP scanning
  - HTTP Digest + Basic authentication
  - Firmware checking and device filtering
  - Adaptive batch sizing
  - Multi-camera selection UI

---

**Happy Scanning! 📡📹**
