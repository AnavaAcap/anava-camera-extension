# Prompt for Web Deployer Integration Team

**Context**: We're adding camera deployment functionality to the Anava web deployer. Instead of building UI in the Chrome extension, we're putting it in the web app where we already have all the configs.

---

## 🎯 Task: Add Camera Deployment Page to Web Deployer

### What You're Building

A new page in the Anava web deployer (`anava-infrastructure-deployer`) that allows users to:
1. Scan their local network for Axis cameras
2. Select cameras to deploy
3. Deploy ACAP applications with the deployment's existing config (license key, Firebase, Gemini)

### How It Works

```
Web App (your code)
  ↓ chrome.runtime.sendMessage()
Chrome Extension (already built - just a bridge)
  ↓ Native messaging
Proxy Server (already built)
  ↓ HTTPS + Digest Auth
Cameras (local network)
```

**You don't need to worry about the extension or proxy server - they're already done.**

You just need to:
1. Create a new page/route for camera deployment
2. Use the provided helper functions to talk to the extension
3. Display results and manage deployment flow

---

## 📁 Reference Files

All architecture and code examples are in `/Users/ryanwager/anava-camera-extension/`:

1. **WEB_BASED_ARCHITECTURE.md** - Read this first (complete architecture)
2. **Extension code** (already built):
   - `manifest.json` - Extension configuration
   - `background.js` - Bridge logic (you don't need to touch this)
3. **Proxy server** (already built):
   - `proxy-server/main.go` - Handles camera communication

---

## 🚀 What You Need to Implement

### 1. Extension Bridge Helper

**File**: `src/renderer/utils/extensionBridge.ts` (create this)

```typescript
/**
 * Chrome Extension Bridge for Camera Deployment
 *
 * This helper communicates with the Anava Local Network Bridge extension
 * to perform local network operations (scanning, deploying to cameras).
 */

const EXTENSION_ID = process.env.REACT_APP_EXTENSION_ID || 'YOUR_EXTENSION_ID_HERE';

export interface ExtensionMessage {
  command: string;
  payload?: any;
}

export interface ExtensionResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: string;
}

export interface Camera {
  ip: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
  firmware: string;
  deviceType: string;
}

/**
 * Send command to Chrome extension
 */
export function sendToExtension(message: ExtensionMessage): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    // Check if Chrome extension API is available
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
      reject(new Error('Chrome extension API not available. Are you running in Chrome?'));
      return;
    }

    chrome.runtime.sendMessage(EXTENSION_ID, message, (response: ExtensionResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response) {
        reject(new Error('No response from extension. Is it installed?'));
        return;
      }

      if (!response.success) {
        reject(new Error(response.error || 'Unknown error'));
        return;
      }

      resolve(response);
    });
  });
}

/**
 * Check if extension is installed and healthy
 */
export async function checkExtensionHealth(): Promise<boolean> {
  try {
    const response = await sendToExtension({ command: 'health_check' });
    return response.success;
  } catch (error) {
    console.error('Extension health check failed:', error);
    return false;
  }
}

/**
 * Scan network for cameras
 */
export async function scanNetwork(
  subnet: string,
  credentials: { username: string; password: string },
  onProgress?: (progress: { current: number; total: number; message: string }) => void
): Promise<Camera[]> {
  const response = await sendToExtension({
    command: 'scan_network',
    payload: { subnet, credentials }
  });

  return response.data?.cameras || [];
}

/**
 * Deploy ACAP to a single camera
 */
export async function deployToCamera(
  cameraIp: string,
  config: {
    licenseKey: string;
    customerId: string;
    firebaseConfig: any;
    geminiConfig: any;
  },
  onProgress?: (stage: string, progress: number) => void
): Promise<{ success: boolean; message?: string }> {
  const response = await sendToExtension({
    command: 'deploy_acap',
    payload: { cameraIp, config }
  });

  return response.data;
}

/**
 * Get camera firmware info
 */
export async function getCameraFirmware(
  cameraIp: string,
  credentials: { username: string; password: string }
): Promise<{ version: string; os: string; architecture: string }> {
  const response = await sendToExtension({
    command: 'get_firmware_info',
    payload: { cameraIp, credentials }
  });

  return response.data;
}
```

**Save this file as**: `/Users/ryanwager/anava-infrastructure-deployer/src/renderer/utils/extensionBridge.ts`

---

### 2. Camera Deployment Page Component

**File**: `src/renderer/pages/CameraDeployment.tsx` (create this)

```typescript
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  checkExtensionHealth,
  scanNetwork,
  deployToCamera,
  Camera
} from '../utils/extensionBridge';

/**
 * Camera Deployment Page
 *
 * Allows users to scan their network and deploy ACAP to discovered cameras
 * using the configuration from their current deployment.
 */
export function CameraDeploymentPage() {
  const { deploymentId } = useParams<{ deploymentId: string }>();

  // Extension status
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [checkingExtension, setCheckingExtension] = useState(true);

  // Scan state
  const [subnet, setSubnet] = useState('192.168.50.0/24');
  const [username, setUsername] = useState('anava');
  const [password, setPassword] = useState('baton');
  const [scanning, setScanning] = useState(false);
  const [cameras, setCameras] = useState<Camera[]>([]);

  // Selection state
  const [selectedCameras, setSelectedCameras] = useState<Set<string>>(new Set());

  // Deployment state
  const [deploying, setDeploying] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<Map<string, string>>(new Map());

  // Get deployment config (you already have this data in your app)
  const deployment = useDeployment(deploymentId); // Your existing hook

  useEffect(() => {
    checkExtension();
  }, []);

  async function checkExtension() {
    setCheckingExtension(true);
    const installed = await checkExtensionHealth();
    setExtensionInstalled(installed);
    setCheckingExtension(false);
  }

  async function handleScan() {
    setScanning(true);
    setCameras([]);
    try {
      const discovered = await scanNetwork(subnet, { username, password });
      setCameras(discovered);
      if (discovered.length === 0) {
        alert('No cameras found on this network.');
      }
    } catch (error) {
      alert(`Scan failed: ${error.message}\n\nMake sure:\n1. Extension is installed\n2. Native host is running\n3. Network range is correct`);
    } finally {
      setScanning(false);
    }
  }

  function toggleCamera(ip: string) {
    const newSelected = new Set(selectedCameras);
    if (newSelected.has(ip)) {
      newSelected.delete(ip);
    } else {
      newSelected.add(ip);
    }
    setSelectedCameras(newSelected);
  }

  async function handleDeploy() {
    if (!deployment) {
      alert('Deployment configuration not loaded');
      return;
    }

    setDeploying(true);
    const newStatus = new Map<string, string>();

    for (const cameraIp of selectedCameras) {
      try {
        newStatus.set(cameraIp, 'Deploying...');
        setDeploymentStatus(new Map(newStatus));

        await deployToCamera(cameraIp, {
          licenseKey: deployment.licenseKey,
          customerId: deployment.customerId,
          firebaseConfig: deployment.firebaseConfig,
          geminiConfig: deployment.geminiConfig
        });

        newStatus.set(cameraIp, '✅ Success');
      } catch (error) {
        newStatus.set(cameraIp, `❌ Failed: ${error.message}`);
      }
      setDeploymentStatus(new Map(newStatus));
    }

    setDeploying(false);
  }

  // Extension not installed UI
  if (checkingExtension) {
    return <div className="loading">Checking for extension...</div>;
  }

  if (!extensionInstalled) {
    return (
      <div className="extension-required">
        <h1>📦 Extension Required</h1>
        <p>To deploy cameras from the browser, you need to install the Anava Local Network Bridge extension.</p>

        <div className="steps">
          <h3>Setup Steps:</h3>
          <ol>
            <li>Install the Chrome extension from the Web Store</li>
            <li>Install the native host: <code>./install-proxy.sh</code></li>
            <li>Return to this page</li>
          </ol>
        </div>

        <a href="https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID"
           className="btn btn-primary"
           target="_blank">
          Install Extension
        </a>

        <button onClick={checkExtension} className="btn btn-secondary">
          I've Installed It - Check Again
        </button>
      </div>
    );
  }

  // Main deployment UI
  return (
    <div className="camera-deployment">
      <h1>Deploy Cameras</h1>
      <p>Deployment: <strong>{deployment?.name}</strong></p>

      {/* Step 1: Scan Network */}
      <section className="scan-section">
        <h2>Step 1: Scan Network</h2>
        <div className="form-group">
          <label>Network Range (CIDR)</label>
          <input
            type="text"
            value={subnet}
            onChange={(e) => setSubnet(e.target.value)}
            placeholder="192.168.50.0/24"
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <button onClick={handleScan} disabled={scanning} className="btn btn-primary">
          {scanning ? 'Scanning...' : 'Scan Network'}
        </button>
      </section>

      {/* Step 2: Select Cameras */}
      {cameras.length > 0 && (
        <section className="select-section">
          <h2>Step 2: Select Cameras ({cameras.length} found)</h2>
          <div className="camera-list">
            {cameras.map(camera => (
              <div
                key={camera.ip}
                className={`camera-card ${selectedCameras.has(camera.ip) ? 'selected' : ''}`}
                onClick={() => toggleCamera(camera.ip)}
              >
                <div className="camera-header">
                  <input
                    type="checkbox"
                    checked={selectedCameras.has(camera.ip)}
                    onChange={() => toggleCamera(camera.ip)}
                  />
                  <strong>{camera.model}</strong>
                </div>
                <div className="camera-details">
                  <div>IP: {camera.ip}</div>
                  <div>Serial: {camera.serialNumber}</div>
                  <div>Firmware: {camera.firmware}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Step 3: Deploy */}
      {selectedCameras.size > 0 && (
        <section className="deploy-section">
          <h2>Step 3: Deploy</h2>
          <p>Ready to deploy to <strong>{selectedCameras.size}</strong> camera(s)</p>
          <p>Using configuration from deployment: <strong>{deployment?.name}</strong></p>

          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="btn btn-primary"
          >
            {deploying ? 'Deploying...' : 'Deploy to Selected Cameras'}
          </button>

          {/* Deployment Status */}
          {deploymentStatus.size > 0 && (
            <div className="deployment-status">
              <h3>Deployment Status:</h3>
              {Array.from(deploymentStatus.entries()).map(([ip, status]) => (
                <div key={ip} className="status-row">
                  <span>{ip}</span>
                  <span>{status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

**Save this file as**: `/Users/ryanwager/anava-infrastructure-deployer/src/renderer/pages/CameraDeployment.tsx`

---

### 3. Add Route

**File**: `src/renderer/App.tsx` (or wherever your routes are defined)

Add this route:

```typescript
import { CameraDeploymentPage } from './pages/CameraDeployment';

// In your router:
<Route path="/deployments/:deploymentId/cameras" element={<CameraDeploymentPage />} />
```

---

### 4. Add Navigation Link

After deployment is complete, show a link/button:

```typescript
// In your deployment success page:
<Link to={`/deployments/${deploymentId}/cameras`} className="btn btn-primary">
  Deploy Cameras
</Link>
```

---

### 5. Environment Variable

**File**: `.env`

Add the extension ID (get this after publishing to Chrome Web Store):

```bash
REACT_APP_EXTENSION_ID=abcdefghijklmnoabcdefhijklmnoabc
```

For development, you can use the unpacked extension ID (check `chrome://extensions`).

---

## 🔧 How to Test

### 1. Install the Extension

```bash
cd /Users/ryanwager/anava-camera-extension
npm run build

# Then in Chrome:
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select /Users/ryanwager/anava-camera-extension
# 5. Copy the extension ID
```

### 2. Install Native Host (Proxy Server)

```bash
cd /Users/ryanwager/anava-camera-extension
./install-proxy.sh
```

### 3. Run Your Web App

```bash
cd /Users/ryanwager/anava-infrastructure-deployer
npm run dev
```

### 4. Test the Flow

1. Navigate to `/deployments/YOUR_DEPLOYMENT_ID/cameras`
2. Should see "Extension Required" if not installed, or camera deployment UI
3. Enter network range (e.g., `192.168.50.0/24`)
4. Click "Scan Network"
5. Should discover cameras on your network
6. Select cameras
7. Click "Deploy to Selected Cameras"
8. Should see deployment progress

---

## 🐛 Debugging

### Extension Not Detected

**Check**:
```javascript
// In browser console:
console.log('Chrome API available:', typeof chrome !== 'undefined');
console.log('Extension API available:', typeof chrome?.runtime?.sendMessage);
```

If `false`, you're not in Chrome or extension isn't installed.

### "No response from extension"

**Check**:
1. Extension is installed and enabled at `chrome://extensions`
2. Extension ID in `.env` matches actual ID
3. Your web app domain is in extension's `manifest.json` → `externally_connectable`

### "Failed to connect to native host"

**Check**:
1. Native host is installed: `./install-proxy.sh`
2. Proxy server is running: `curl http://127.0.0.1:9876/health`
3. Check logs: `tail -f ~/Library/Logs/anava-camera-proxy-server.log`

### No Cameras Found

**Check**:
1. Network range is correct (should match your cameras' subnet)
2. Credentials are correct (default: `anava` / `baton`)
3. Cameras are on network and powered on
4. Cameras have HTTPS enabled on port 443

---

## 📋 API Reference

### Commands You Can Send

All commands go through `sendToExtension({ command, payload })`:

| Command | Payload | Returns |
|---------|---------|---------|
| `health_check` | `{}` | `{ success: true }` |
| `scan_network` | `{ subnet, credentials }` | `{ cameras: Camera[] }` |
| `deploy_acap` | `{ cameraIp, config }` | `{ success: true, message }` |
| `get_firmware_info` | `{ cameraIp, credentials }` | `{ version, os, architecture }` |
| `authenticate_camera` | `{ cameraIp, credentials }` | `{ success: true, deviceInfo }` |
| `activate_license` | `{ cameraIp, licenseKey }` | `{ success: true }` |
| `push_config` | `{ cameraIp, config }` | `{ success: true }` |
| `start_application` | `{ cameraIp }` | `{ success: true }` |

---

## 🎨 Styling

You can style the camera deployment page however you want. Reference your existing deployer UI patterns.

Suggested CSS classes (create your own styles):
- `.camera-deployment` - Main container
- `.camera-card` - Individual camera
- `.camera-card.selected` - Selected state
- `.deployment-status` - Status table
- `.extension-required` - Setup instructions

---

## ✅ Checklist

- [ ] Create `src/renderer/utils/extensionBridge.ts`
- [ ] Create `src/renderer/pages/CameraDeployment.tsx`
- [ ] Add route to router
- [ ] Add navigation link from deployment success page
- [ ] Add `REACT_APP_EXTENSION_ID` to `.env`
- [ ] Test with extension installed
- [ ] Test with native host running
- [ ] Test full deployment flow

---

## 🚀 When You're Done

The user should be able to:
1. Complete cloud deployment (your existing flow)
2. Click "Deploy Cameras" button
3. See camera deployment page
4. Scan network
5. Select cameras
6. Deploy with ONE click (config already available!)

**No manual config entry. No OAuth. No copy-paste. Just works.** ✨

---

## 📞 Need Help?

If you run into issues:
1. Check the browser console for errors
2. Check extension logs at `chrome://extensions` → Extension details → Inspect views: service worker
3. Check native host logs at `~/Library/Logs/anava-camera-proxy-server.log`
4. Read `/Users/ryanwager/anava-camera-extension/WEB_BASED_ARCHITECTURE.md` for detailed architecture

The extension and proxy server are already built and tested. You just need to build the UI and call the helper functions.
