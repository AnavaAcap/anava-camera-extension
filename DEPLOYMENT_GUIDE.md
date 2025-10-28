# Anava Camera Extension - Deployment Guide

## Overview

The Anava Camera Extension is a Chrome extension that discovers Axis cameras on your network and deploys the Anava ACAP application with complete configuration in a single click.

## Features

✅ **Network Discovery**: Scans entire network ranges for Axis cameras
✅ **HTTP/HTTPS Detection**: Automatically tries HTTPS:443 → HTTP:80 fallback
✅ **Automatic ACAP Download**: Fetches correct ACAP variant from GCS based on camera OS + architecture
✅ **License Activation**: Activates Anava license on camera
✅ **Configuration Push**: Injects Firebase + Gemini/Vertex AI config
✅ **Application Start**: Ensures ACAP is running after deployment
✅ **Real-Time Progress**: Visual progress bars per camera

## Architecture

```
Extension
  ├─ Discovery Service: Network scanning + authentication
  ├─ Deployment Service: Complete ACAP deployment flow
  └─ UI: Real-time progress tracking

GCS Bucket (gs://anava-acaps/)
  ├─ latest.json (manifest)
  └─ ACAP variants:
      ├─ BatonAnalytic_1_12_0_aarch64_OS11.eap
      ├─ BatonAnalytic_1_12_0_aarch64_OS12.eap
      ├─ BatonAnalytic_1_12_0_armv7hf_OS11.eap
      └─ BatonAnalytic_1_12_0_armv7hf_OS12.eap

Camera Deployment Flow:
  1. Fetch manifest from GCS
  2. Detect camera firmware + architecture
  3. Download correct ACAP variant
  4. Upload ACAP to camera
  5. Activate license
  6. Push SystemConfig (Firebase + Gemini)
  7. Start ACAP application
```

## Installation

### 1. Load Extension in Chrome

```bash
cd /Users/ryanwager/anava-camera-extension
npm run build  # Compile TypeScript → JavaScript

# Open Chrome → Extensions → Enable Developer Mode → Load Unpacked
# Select: /Users/ryanwager/anava-camera-extension/dist
```

### 2. Verify Extension is Loaded

- Extension icon should appear in Chrome toolbar
- Click icon to open popup UI

## Usage

### Step 1: Discover Cameras

1. Open extension popup
2. Go to **"Discover"** tab
3. Enter credentials:
   - **Network Range**: `192.168.50.0/24` (CIDR notation)
   - **Username**: `root`
   - **Password**: `baton`
4. Click **"Start Network Scan"**

**Quick Scan Single Camera**:
- Enter IP address (e.g., `192.168.50.156`)
- Click **"Quick Scan"**

### Step 2: Select Cameras for Deployment

- Discovered cameras appear in the results
- Click on cameras to select them (highlighted blue)
- Selected cameras show in the **"Deploy"** tab

### Step 3: Configure Deployment

Switch to **"Deploy"** tab and enter:

#### License Key (Anava Key)
```
YOUR_ANAVA_LICENSE_KEY
```

#### Customer ID
```
netflix
```

#### Firebase Config (JSON)
```json
{
  "apiKey": "AIzaSyC...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc123",
  "databaseId": "(default)"
}
```

#### Gemini/Vertex AI Config (JSON)
```json
{
  "vertexApiGatewayUrl": "https://your-gateway-xyz.gateway.dev",
  "vertexApiGatewayKey": "YOUR_API_GATEWAY_KEY",
  "vertexGcpProjectId": "your-project",
  "vertexGcpRegion": "us-central1",
  "vertexGcsBucketName": "your-project-anava-analytics"
}
```

### Step 4: Deploy

1. Click **"Deploy to Selected Cameras"**
2. Watch real-time progress:
   - ⏳ Fetching ACAP variants
   - ⏳ Downloading ACAP (0-100%)
   - ⏳ Uploading to camera (0-100%)
   - ⏳ Activating license
   - ⏳ Pushing configuration
   - ⏳ Starting application
   - ✅ Complete!

## Technical Details

### ACAP Manifest (GCS)

```json
{
  "version": "1.12.0",
  "appName": "BatonAnalytic",
  "releaseDate": "2025-01-15",
  "files": [
    {
      "name": "BatonAnalytic_1_12_0_aarch64_OS11.eap",
      "os": "OS11",
      "architecture": "aarch64",
      "url": "https://storage.googleapis.com/anava-acaps/BatonAnalytic_1_12_0_aarch64_OS11.eap",
      "size": 15728640,
      "checksum": "abc123..."
    },
    ...
  ]
}
```

### Architecture Detection

The extension detects camera architecture using multiple methods:

1. **Direct Property**: `Properties.System.Architecture`
2. **SOC Inference**: Maps `Properties.System.Soc` to architecture
   - `CV25`, `CV52`, `ARTPEC-8`, `Ambarella` → `aarch64`
   - `ARTPEC-7`, `ARTPEC-6`, `HI3516` → `armv7hf`
3. **Default**: `aarch64` (newer cameras)

### OS Version Detection

```
Firmware 11.x.x → OS11
Firmware 12.x.x → OS12
```

### SystemConfig Schema

The config pushed to the camera:

```json
{
  "firebase": {
    "apiKey": "...",
    "authDomain": "...",
    "projectId": "...",
    "storageBucket": "...",
    "messagingSenderId": "...",
    "appId": "...",
    "databaseId": "(default)"
  },
  "gemini": {
    "vertexApiGatewayUrl": "...",
    "vertexApiGatewayKey": "...",
    "vertexGcpProjectId": "...",
    "vertexGcpRegion": "us-central1",
    "vertexGcsBucketName": "..."
  },
  "anavaKey": "YOUR_LICENSE_KEY",
  "customerId": "YOUR_CUSTOMER_ID"
}
```

## Troubleshooting

### Camera Not Discovered

- **Check credentials**: Ensure username/password are correct
- **Check network**: Verify camera is on same network
- **Try HTTP**: Some cameras only use HTTP:80
- **Check firewall**: Ensure no firewall blocking extension

### ACAP Upload Fails

- **Check firmware**: Minimum 11.11.0 required
- **Check architecture**: Verify correct ACAP variant selected
- **Check storage**: Ensure camera has enough storage

### License Activation Fails

- **Error 0 or 30**: Success (30 = already licensed)
- **Error 1**: Invalid license key
- **Error 2**: License already used on another device
- **Error 31**: License expired
- **Error 32**: License not valid for this product

### Config Push Fails

- **Check JSON syntax**: Validate Firebase/Gemini config
- **Check ACAP running**: Must activate license first
- **Check endpoint**: Verify `/local/BatonAnalytic/baton_analytic.cgi` exists

## Development

### File Structure

```
anava-camera-extension/
├── src/
│   ├── services/
│   │   ├── CameraDiscovery.ts          # Network scanning
│   │   ├── CameraAuthentication.ts     # HTTP Digest/Basic auth
│   │   ├── AcapDeploymentService.ts    # Complete deployment flow
│   │   └── AdaptiveScanConfig.ts       # Adaptive batch scanning
│   └── types/
│       └── Camera.ts                   # Type definitions
├── popup.html                          # Extension UI
├── popup.css                           # Styles
├── popup.js                            # UI controller
├── manifest.json                       # Extension manifest
└── dist/                               # Compiled output

Key Methods:

CameraDiscoveryService:
- scanNetworkForCameras(): Scans CIDR range
- quickScanSpecificCamera(): Scans single IP
- checkForCamera(): HTTPS → HTTP fallback

AcapDeploymentService:
- getAvailableAcaps(): Fetch manifest from GCS
- selectAcap(): Choose correct variant
- downloadAcap(): Download with progress
- uploadAcap(): Upload via XMLHttpRequest
- activateLicense(): POST license XML
- pushConfig(): POST SystemConfig JSON
- startAcap(): GET control.cgi
- deployCameraComplete(): Orchestrate all steps
```

### Building

```bash
npm install
npm run build
```

### Testing

```bash
# Test discovery
1. Open extension
2. Enter network range: 192.168.50.0/24
3. Enter credentials: root / baton
4. Click "Start Network Scan"

# Test deployment
1. Select discovered cameras
2. Enter license key + configs
3. Click "Deploy to Selected Cameras"
4. Watch progress bars
```

## Production Checklist

- ✅ ACAP files uploaded to GCS
- ✅ Manifest (`latest.json`) is public
- ✅ Extension compiled and loaded
- ✅ Camera credentials configured
- ✅ Firebase config obtained from GCP console
- ✅ Vertex AI gateway URL + key configured
- ✅ Customer ID matches project naming

## Support

For issues or questions, check:
- Chrome DevTools Console (for extension errors)
- Network tab (for HTTP requests)
- Camera logs (for ACAP issues)

## License

Proprietary - Anava AI
