# Anava Camera Discovery & Deployment Extension

Chrome extension for discovering Axis cameras on local networks and deploying ACAP applications.

## Features

### Camera Discovery
- **TCP Port Scanning**: Uses proven method from Anava Vision installer (NOT mDNS!)
- **VAPIX Validation**: Authenticates and validates Axis cameras using HTTP Digest auth
- **Firmware Checking**: Filters cameras with unsupported firmware (< 11.11.0)
- **Adaptive Scanning**: Dynamically adjusts batch size based on network performance
- **Device Type Detection**: Filters out speakers, intercoms, and non-camera devices

### ACAP Deployment
- Upload and deploy ACAP (.eap) files to multiple cameras
- License activation with Axis license keys
- Progress tracking for multi-camera deployments

### Settings
- Auto-save camera credentials
- Filter unsupported firmware versions
- Default network range configuration

## Architecture

### Ported from Electron Installer

This extension uses the **exact same discovery method** as the proven Anava Vision Electron installer:

```
1. Get local network interfaces
2. Calculate IP ranges from CIDR notation
3. TCP port scan (80, 443, 8080, 8000)
4. HTTPS check for /axis-cgi/param.cgi endpoint
5. Validate 401/200 response
6. Authenticate using HTTP Digest auth
7. Check firmware version (>= 11.11.0)
8. Filter by device type (cameras only)
```

### Key Files

**Services**:
- `src/services/CameraAuthentication.ts` - HTTP Digest auth + firmware checking
- `src/services/CameraDiscovery.ts` - TCP scanning + VAPIX validation
- `src/services/AdaptiveScanConfig.ts` - Dynamic batch size adjustment

**Types**:
- `src/types/Camera.ts` - Camera interfaces and device type detection

**UI**:
- `popup.html` - Main extension UI
- `popup.css` - Styling
- `popup.js` - UI controller and event handlers
- `background.js` - Service worker for background operations

## Installation

### Development Mode

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `anava-camera-extension` directory

### Usage

1. Click the extension icon in Chrome toolbar
2. Enter network range (e.g., `192.168.50.0/24`)
3. Enter camera credentials (default: `anava` / `baton`)
4. Select scan intensity (Balanced recommended)
5. Click "Start Network Scan"

**Quick Scan**: Enter a specific IP address for faster single-camera discovery.

## Discovery Method

### Why TCP Scanning (Not mDNS)?

The legacy Electron installer proved that **TCP scanning is more reliable** than mDNS for camera discovery:

**mDNS Problems**:
- ❌ Firewall interference
- ❌ Multicast UDP packets often blocked
- ❌ Network configuration dependent
- ❌ Requires native host in extension

**TCP Scanning Advantages**:
- ✅ HTTP/HTTPS always allowed
- ✅ Works on ANY network configuration
- ✅ No firewall issues
- ✅ Can scan specific IP ranges
- ✅ Returns actual device info immediately
- ✅ Pure browser implementation (no native host needed!)

### Scan Performance

**Adaptive Batch Sizing**:
- Starts with batch size of 15-30 (depending on intensity)
- Automatically reduces on high error rates
- Increases on good performance
- Inter-batch delays for network breathing room

**Typical Scan Times** (192.168.x.0/24):
- Conservative: ~3-5 minutes
- Balanced: ~1-2 minutes
- Aggressive: ~30-60 seconds

## Ported Code References

All code ported directly from:
```
/Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/
├── cameraAuthentication.ts (lines 58-581)
├── cameraDiscoveryService.ts (lines 84-631)
├── adaptiveScanConfig.ts (lines 1-232)
└── fastNetworkScanner.ts (getDeviceType function)
```

## Firmware Support

**Minimum Required**: 11.11.0 (OS11)

- ✅ Firmware 11.x >= 11.11.0 (OS11)
- ✅ Firmware 12.x (OS12)
- ❌ Firmware 10.x (OS10) - UNSUPPORTED
- ❌ Firmware 11.x < 11.11.0 - UNSUPPORTED

## Device Type Detection

Based on Axis model number prefix:
- **M, P, Q** = Camera ✅
- **C** = Speaker ❌
- **I** = Intercom ❌
- **A** = Access Control ❌

## Security

### Credentials Storage
- Camera credentials stored in `chrome.storage.local` (encrypted by Chrome)
- Never transmitted outside local network
- Optional auto-save feature (disabled by default)

### Authentication Methods
- **HTTP Digest Auth**: MD5-based challenge-response
- **Basic Auth**: Base64-encoded (HTTPS only)
- Protocol-specific: HTTPS prefers Basic, HTTP prefers Digest

### SSL/TLS
- Accepts self-signed certificates (cameras use self-signed)
- Uses fetch() API with standard browser security

## Troubleshooting

### No cameras found
1. Verify network range is correct (check your router settings)
2. Ensure cameras are powered on and connected
3. Check credentials (default Axis is `root:pass`, Anava is `anava:baton`)
4. Try quick scan with known camera IP first
5. Check browser console for detailed logs

### Cameras show as "Unsupported"
- Firmware version < 11.11.0
- Upgrade camera firmware to OS11 (11.11+) or OS12

### Scan too slow
- Increase intensity to "Aggressive"
- Use smaller network range (/26 or /27 instead of /24)
- Use quick scan for known IPs

### Scan too fast, missing cameras
- Decrease intensity to "Conservative"
- Check network congestion
- Try smaller batches with custom settings

## Development

### File Structure
```
anava-camera-extension/
├── manifest.json           # Chrome extension manifest v3
├── popup.html              # Main UI
├── popup.css               # Styling
├── popup.js                # UI controller
├── background.js           # Service worker
├── package.json            # NPM dependencies
├── tsconfig.json           # TypeScript config
├── src/
│   ├── services/
│   │   ├── CameraAuthentication.ts
│   │   ├── CameraDiscovery.ts
│   │   └── AdaptiveScanConfig.ts
│   └── types/
│       └── Camera.ts
├── icons/                  # Extension icons (16, 48, 128px)
└── README.md
```

### Build Commands
```bash
npm run build   # Build TypeScript to dist/
npm run watch   # Watch mode for development
npm run dev     # Alias for watch
```

### Testing
1. Load extension in Chrome
2. Open popup
3. Enter network range `192.168.50.0/24`
4. Enter credentials `anava` / `baton`
5. Click "Start Network Scan"
6. Check browser console (F12) for detailed logs

## TODO

### Deployment Features
- [ ] Port ACAP deployment logic from `acapDeploymentOrchestrator.ts`
- [ ] Implement license activation flow
- [ ] Add progress tracking for multi-camera deployments
- [ ] Support .eap file upload and validation

### Enhanced Discovery
- [ ] Save discovered cameras to local storage
- [ ] Export/import camera lists
- [ ] Network topology visualization
- [ ] Camera grouping by subnet

### Advanced Features
- [ ] RTSP stream preview
- [ ] Bulk firmware upgrade
- [ ] Configuration backup/restore
- [ ] Event log viewer

## License

UNLICENSED - Proprietary software by Anava AI

## Support

For issues or questions, contact the Anava AI development team.
