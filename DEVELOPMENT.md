# Development Guide

## Getting Started

### Prerequisites
- Node.js >= 18
- Chrome or Chromium-based browser
- TypeScript knowledge

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `/Users/ryanwager/anava-camera-extension` directory

### Development Workflow

1. **Watch Mode**:
   ```bash
   npm run dev
   ```
   This watches TypeScript files and rebuilds on changes.

2. **Reload Extension**:
   After code changes:
   - Go to `chrome://extensions/`
   - Click the reload icon on the extension card
   - Or use Ctrl+R in the popup

3. **Debugging**:
   - **Popup**: Right-click extension icon → "Inspect popup"
   - **Background**: `chrome://extensions/` → "Inspect views: service worker"
   - **Console Logs**: All discovery logs are in browser console

## Code Architecture

### Discovery Flow

```
User clicks "Start Network Scan"
  ↓
popup.js: Read UI inputs
  ↓
CameraDiscoveryService.scanNetworkForCameras()
  ↓
Calculate IP range (192.168.50.1 - 192.168.50.254)
  ↓
Adaptive batch processing:
  ├─ checkForCamera() for each IP
  │   ├─ checkTCPConnection() (port 80, 443, 8080, 8000)
  │   ├─ HTTPS check for /axis-cgi/param.cgi
  │   └─ checkAxisCamera() if device found
  │       └─ authenticateCamera()
  │           ├─ tryBasicAuth() or tryDigestAuth()
  │           ├─ checkFirmwareVersion()
  │           └─ Return CameraAuthResult
  └─ Adjust batch size based on performance
  ↓
Return discovered cameras to popup.js
  ↓
Display in UI with device details
```

### Authentication Flow

```
authenticateCamera(ip, username, password, port?)
  ↓
Test ports: [443, 80] (or custom port)
  ↓
For each port:
  ├─ testSinglePortAuth()
  │   ├─ Send POST to /axis-cgi/basicdeviceinfo.cgi
  │   ├─ If 401: Try auth (HTTPS→Basic first, HTTP→Digest first)
  │   ├─ If 200: Parse device info
  │   └─ If camera: checkFirmwareVersion()
  └─ Return first successful result
```

## Key Files Explained

### `src/services/CameraAuthentication.ts`

**Purpose**: Authenticate with Axis cameras using HTTP Digest or Basic auth.

**Key Functions**:
- `authenticateCamera()`: Main entry point, tries multiple ports
- `tryDigestAuth()`: MD5-based challenge-response auth
- `tryBasicAuth()`: Base64-encoded username:password
- `checkFirmwareVersion()`: Queries `/axis-cgi/param.cgi?action=list&group=Properties.Firmware.Version`
- `compareFirmwareVersions()`: Semantic version comparison

**Critical Details**:
- HTTPS prefers Basic Auth (simpler, secure over TLS)
- HTTP prefers Digest Auth (more secure than Basic over plain HTTP)
- Minimum firmware: 11.11.0 (checked via compareFirmwareVersions)
- Device type detection via model prefix (M/P/Q = camera)

### `src/services/CameraDiscovery.ts`

**Purpose**: Scan network for cameras using TCP probing.

**Key Functions**:
- `scanNetworkForCameras()`: Full network scan with adaptive batching
- `checkForCamera()`: Test single IP for camera presence
- `checkTCPConnection()`: TCP probe using fetch() with AbortController
- `calculateIPRange()`: Convert CIDR to start/end IPs

**Critical Details**:
- Uses fetch() for TCP checks (browser-friendly)
- Tries ports in order: 80, 443, 8080, 8000
- Validates Axis-specific endpoint: `/axis-cgi/param.cgi`
- Filters speakers, unsupported firmware, non-cameras

### `src/services/AdaptiveScanConfig.ts`

**Purpose**: Dynamically adjust scan batch size for optimal performance.

**Key Functions**:
- `adjustBatchSize()`: Increase/decrease based on error rates
- `getInterBatchDelay()`: Add delays when network struggles
- `detectNetworkType()`: LAN vs WAN detection (RFC 1918 ranges)
- `getPresetConfig()`: Conservative/Balanced/Aggressive presets

**Critical Details**:
- Starts with batch size 15-30 (conservative for browser)
- Reduces by half on high error rates (>5%)
- Increases by 5-10 on good performance (<2% errors)
- Inter-batch delays: 50-200ms (more when struggling)

### `popup.js`

**Purpose**: UI controller, coordinates between user and services.

**Key Handlers**:
- `startScanBtn.click`: Full network scan
- `quickScanBtn.click`: Single IP scan
- `displayCameras()`: Render camera cards
- `updateSelectedCameras()`: Manage deployment selection

**Critical Details**:
- Uses `CameraDiscoveryService` instance
- Progress callbacks update UI in real-time
- Settings stored in `chrome.storage.local`
- Credentials optionally auto-saved

## Testing on Your Network

### Test with Known Camera

```javascript
// In browser console (popup.html)
import { CameraDiscoveryService } from './src/services/CameraDiscovery.js';
const service = new CameraDiscoveryService();

// Quick scan single IP
const cameras = await service.quickScanSpecificCamera(
  '192.168.50.100',
  'anava',
  'baton',
  443
);
console.log('Found cameras:', cameras);
```

### Test Authentication

```javascript
// In browser console
import { authenticateCamera } from './src/services/CameraAuthentication.js';

const result = await authenticateCamera(
  '192.168.50.100',
  'anava',
  'baton',
  443
);
console.log('Auth result:', result);
```

### Test Network Scan

```javascript
// In browser console
const service = new CameraDiscoveryService();

const cameras = await service.scanNetworkForCameras(
  '192.168.50.0/24',
  'anava',
  'baton',
  {
    intensity: 'balanced',
    onProgress: (progress) => {
      console.log(`Progress: ${progress.ip} - ${progress.status}`);
    }
  }
);
console.log('All cameras:', cameras);
```

## Common Issues

### CORS Errors

**Problem**: fetch() blocked by CORS policy.

**Solution**: The extension has `host_permissions` for `http://*/*` and `https://*/*` in manifest.json. This bypasses CORS for camera requests.

### TCP Check Fails

**Problem**: checkTCPConnection() always returns false.

**Cause**: Network timeout too short, or camera is slow to respond.

**Solution**: Increase timeout in checkTCPConnection() call (default 1000ms for batch, 3000ms for single).

### Digest Auth Fails

**Problem**: tryDigestAuth() returns 401 even with correct credentials.

**Cause**: MD5 hash implementation issue, or WWW-Authenticate header parsing.

**Debug**:
```javascript
// Add to tryDigestAuth() after getting challenge:
console.log('WWW-Authenticate:', wwwAuth);
console.log('Realm:', realm);
console.log('Nonce:', nonce);
console.log('Auth header:', authHeader);
```

### Firmware Check Returns "Unknown"

**Problem**: checkFirmwareVersion() can't determine version.

**Cause**: Camera doesn't expose Properties.Firmware.Version parameter, or auth failed.

**Solution**: Check if camera uses different param name. Some older cameras use `root.Properties.Firmware.Version`.

## Performance Tuning

### Scan Speed vs Accuracy

**Conservative** (Slow but reliable):
- Batch size: 15-30
- Timeout: 7000ms
- Inter-batch delay: 100ms
- Best for: WAN, slow networks, congested networks

**Balanced** (Recommended):
- Batch size: 30-80
- Timeout: 5000ms
- Inter-batch delay: 50ms
- Best for: LAN, typical networks

**Aggressive** (Fast but may miss devices):
- Batch size: 50-150
- Timeout: 3000ms
- Inter-batch delay: 20ms
- Best for: Fast LAN, known stable network

### Batch Size Tuning

Adaptive scanner adjusts automatically, but you can override:

```javascript
const scanner = new AdaptiveScanner({
  currentBatchSize: 25,
  minBatchSize: 10,
  maxBatchSize: 50,
  connectionTimeout: 4000,
  interBatchDelay: 75
});
```

## Deployment (Coming Soon)

### ACAP Deployment Flow (TODO)

```
User selects cameras + uploads .eap file + enters license key
  ↓
For each selected camera:
  ├─ Pre-flight checks (firmware, space, etc.)
  ├─ Upload .eap via multipart form
  ├─ Activate license (POST to /local/{appName}/license.cgi)
  ├─ Start app (GET /axis-cgi/applications/control.cgi?action=start)
  └─ Verify app running
```

**Files to Port**:
- `acapDeploymentOrchestrator.ts` - Main deployment orchestrator
- `acapUploader.ts` - Multipart form upload logic
- `licenseActivation.ts` - License XML generation and activation

## Extension Publishing

### Build for Distribution

```bash
npm run build
cd ..
zip -r anava-camera-extension.zip anava-camera-extension \
  -x "anava-camera-extension/node_modules/*" \
  -x "anava-camera-extension/.git/*" \
  -x "anava-camera-extension/*.log"
```

### Chrome Web Store Submission

1. Create developer account: https://chrome.google.com/webstore/devconsole
2. Upload anava-camera-extension.zip
3. Fill in store listing details
4. Submit for review (typically 1-3 days)

### Private Distribution

For internal use without Chrome Web Store:
1. Build extension as above
2. Share .zip file with users
3. Users load as unpacked extension (requires Developer Mode)

## Contributing

### Code Style

- TypeScript strict mode
- ESLint rules (to be added)
- Prettier formatting (to be added)
- Clear console logging for debugging

### Commit Messages

- `feat:` New features
- `fix:` Bug fixes
- `refactor:` Code improvements
- `docs:` Documentation updates
- `test:` Test additions

### Pull Request Process

1. Create feature branch
2. Make changes with clear commits
3. Test thoroughly on real network
4. Update README if needed
5. Submit PR with description

## Resources

- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Axis VAPIX Documentation](https://www.axis.com/vapix-library/)
- [HTTP Digest Authentication RFC](https://tools.ietf.org/html/rfc2617)
