# Testing Guide - Extension v2.0

## Quick Start

### 1. Build the Extension
```bash
npm run build
```

### 2. Load Extension in Chrome
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `anava-camera-extension` directory (NOT `dist/`)

### 3. Test Connection Status

**Green (Connected)**:
- Green pulsing dot
- "Connected" text
- Button enabled

**Red (Not Connected)**:
- Red pulsing dot
- "Not Connected" text
- Button disabled
- Setup instructions shown

## Troubleshooting

```bash
# Rebuild if icons missing
npm run build

# Check proxy server
curl http://127.0.0.1:9876/health

# Start proxy if needed
./install-proxy.sh
```
