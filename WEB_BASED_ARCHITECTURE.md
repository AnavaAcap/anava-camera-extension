# Web-Based Architecture: Extension as Bridge

## Executive Summary

**NEW APPROACH**: Extension is just a tiny bridge. All UI, logic, and state management happens in the web deployer.

**Why This Is Better**:
- ✅ No complex OAuth flow (web app already has configs)
- ✅ Instant updates (just deploy web app, no Chrome Web Store review)
- ✅ Full browser window UI (not limited to 600x500 popup)
- ✅ Per-customer branding possible
- ✅ Extension becomes tiny (~100 lines) and generic
- ✅ State management is normal web app (no chrome.storage complexity)

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  Web Deployer (app.anava.com or localhost:5173)             │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ New Page: Camera Deployment                           │ │
│  │                                                         │ │
│  │  [Step 1: Scan Network]                               │ │
│  │  Network: 192.168.50.0/24  [Scan] ←─────────┐         │ │
│  │                                               │         │ │
│  │  [Step 2: Select Cameras]                    │         │ │
│  │  ☑ Camera 1 (192.168.50.156)                │         │ │
│  │  ☐ Camera 2 (192.168.50.157)                │         │ │
│  │                                               │         │ │
│  │  [Step 3: Deploy]                            │         │ │
│  │  Config: Already available! ─────────────────┤         │ │
│  │  (from current deployment)                   │         │ │
│  │                                               │         │ │
│  │  [Deploy to Selected Cameras]                │         │ │
│  └───────────────────────────────────────────────┼─────────┘ │
│                                                   │           │
└───────────────────────────────────────────────────┼───────────┘
                                                    │
                    chrome.runtime.sendMessage()    │
                                                    ↓
┌──────────────────────────────────────────────────────────────┐
│  Chrome Extension (TINY - just a bridge)                    │
│                                                              │
│  background.js (100 lines):                                 │
│  - Listens for messages from app.anava.com ONLY            │
│  - Validates commands                                       │
│  - Forwards to native host                                  │
│  - Returns results to web app                               │
└──────────────────────────────────────────────────┼───────────┘
                                                    │
                    chrome.runtime.connectNative()  │
                                                    ↓
┌──────────────────────────────────────────────────────────────┐
│  Native Host → Proxy Server (unchanged)                     │
│  - Network scanning                                          │
│  - Camera authentication                                     │
│  - ACAP deployment                                           │
└──────────────────────────────────────────────────┼───────────┘
                                                    │
                    HTTPS + Digest Auth             │
                                                    ↓
                                            Cameras (192.168.x.x)
```

## Comparison: Old vs New

| Aspect | OLD (Extension UI) | NEW (Web UI) |
|--------|-------------------|--------------|
| **Where is the UI?** | Extension popup (600×500px) | Web app (full browser window) |
| **Where are configs?** | Need OAuth to import | Already in web app! |
| **How to update UI?** | Chrome Web Store review (2-4 weeks) | Git push + deploy (instant) |
| **State persistence** | chrome.storage.session complexity | Normal cookies/localStorage |
| **Customer branding** | Generic only | Can customize per deployment |
| **Testing** | Reload extension every change | Just refresh page |
| **Extension size** | Large (10+ files, UI code) | Tiny (2 files, ~100 lines) |
| **Chrome Web Store** | Full review of UI/logic | Just reviews bridge (easier) |

## New Extension Code (MINIMAL)

### File 1: manifest.json

```json
{
  "manifest_version": 3,
  "name": "Anava Local Network Bridge",
  "version": "1.0.0",
  "description": "Provides local network access for Anava Camera Deployer. Required for camera discovery and configuration.",

  "background": {
    "service_worker": "background.js"
  },

  "externally_connectable": {
    "matches": [
      "https://app.anava.com/*",
      "http://localhost:5173/*",
      "http://localhost:3000/*"
    ]
  },

  "permissions": [
    "nativeMessaging"
  ],

  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
```

**Key Points**:
- `externally_connectable`: Only these domains can talk to extension
- `nativeMessaging`: Only permission needed
- NO `storage`, NO `identity`, NO popup UI

### File 2: background.js

```javascript
/**
 * Anava Local Network Bridge
 *
 * This extension acts as a secure bridge between the Anava web app
 * and the local network. It validates incoming commands and forwards
 * them to the native host (proxy server).
 */

const NATIVE_HOST_NAME = 'com.anava.camera_proxy';
const ALLOWED_ORIGINS = [
  'https://app.anava.com',
  'http://localhost:5173',
  'http://localhost:3000'
];

// Valid commands the extension will accept
const VALID_COMMANDS = [
  'scan_network',
  'authenticate_camera',
  'deploy_acap',
  'get_firmware_info',
  'activate_license',
  'push_config',
  'start_application',
  'health_check'
];

/**
 * Listen for messages from the web app
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('📨 Received message from:', sender.url);

  // SECURITY: Verify sender origin
  const senderOrigin = new URL(sender.url).origin;
  if (!ALLOWED_ORIGINS.includes(senderOrigin)) {
    console.warn('❌ Rejected message from untrusted origin:', senderOrigin);
    sendResponse({
      success: false,
      error: 'Unauthorized origin'
    });
    return;
  }

  // SECURITY: Validate message structure
  if (!message || typeof message.command !== 'string') {
    console.error('❌ Invalid message format:', message);
    sendResponse({
      success: false,
      error: 'Invalid message format'
    });
    return;
  }

  // SECURITY: Validate command is allowed
  if (!VALID_COMMANDS.includes(message.command)) {
    console.error('❌ Unknown command:', message.command);
    sendResponse({
      success: false,
      error: `Unknown command: ${message.command}`
    });
    return;
  }

  console.log('✅ Valid command:', message.command);

  // Forward to native host
  forwardToNativeHost(message, sendResponse);

  // Return true to indicate async response
  return true;
});

/**
 * Forward message to native host and handle response
 */
function forwardToNativeHost(message, sendResponse) {
  const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  let responseSent = false;

  // Listen for response from native host
  port.onMessage.addListener((response) => {
    if (!responseSent) {
      console.log('📬 Response from native host:', response);
      sendResponse(response);
      responseSent = true;
      port.disconnect();
    }
  });

  // Handle native host disconnection
  port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError && !responseSent) {
      const errorMsg = chrome.runtime.lastError.message;
      console.error('❌ Native host error:', errorMsg);

      sendResponse({
        success: false,
        error: 'Failed to connect to native host. Please ensure it is installed.',
        details: errorMsg
      });
      responseSent = true;
    }
  });

  // Send message to native host
  console.log('📤 Forwarding to native host:', message);
  port.postMessage(message);
}

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('🎉 Anava Local Network Bridge installed');

    // Open setup instructions
    chrome.tabs.create({
      url: 'https://app.anava.com/extension/setup'
    });
  }
});

console.log('🚀 Anava Local Network Bridge running');
```

**That's it! Just 2 files, ~100 lines total.**

## Web App Integration

### New Page: Camera Deployment

**Location**: `src/renderer/pages/CameraDeployment.tsx` (or similar)

This page is added to the existing web deployer as a new route, accessible after cloud deployment is complete.

### Step 1: Check Extension Installed

```typescript
import React, { useEffect, useState } from 'react';

const EXTENSION_ID = 'abcdefghijklmnoabcdefhijklmnoabc'; // From Chrome Web Store

export function CameraDeploymentPage() {
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkExtension();
  }, []);

  async function checkExtension() {
    try {
      const response = await sendToExtension({ command: 'health_check' });
      setExtensionInstalled(response.success);
    } catch (error) {
      setExtensionInstalled(false);
    } finally {
      setChecking(false);
    }
  }

  if (checking) {
    return <div>Checking for extension...</div>;
  }

  if (!extensionInstalled) {
    return (
      <div className="extension-required">
        <h2>📦 Extension Required</h2>
        <p>To deploy cameras from the browser, you need to install the Anava Local Network Bridge extension.</p>
        <a href={`https://chrome.google.com/webstore/detail/${EXTENSION_ID}`}
           className="btn btn-primary">
          Install Extension
        </a>
        <button onClick={checkExtension} className="btn btn-secondary">
          I've installed it - Check Again
        </button>
      </div>
    );
  }

  return <CameraDeploymentFlow />;
}
```

### Step 2: Communication Helper

```typescript
// utils/extensionBridge.ts

const EXTENSION_ID = process.env.REACT_APP_EXTENSION_ID || 'abcdefghijklmnoabcdefhijklmnoabc';

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

/**
 * Send command to Chrome extension
 */
export function sendToExtension(message: ExtensionMessage): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    // @ts-ignore - chrome.runtime exists when extension is installed
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error('Chrome extension API not available'));
      return;
    }

    chrome.runtime.sendMessage(EXTENSION_ID, message, (response: ExtensionResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
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
 * Scan network for cameras
 */
export async function scanNetwork(subnet: string, credentials: { username: string; password: string }) {
  const response = await sendToExtension({
    command: 'scan_network',
    payload: { subnet, credentials }
  });

  return response.data.cameras || [];
}

/**
 * Deploy ACAP to camera
 */
export async function deployToCamera(cameraIp: string, config: any) {
  const response = await sendToExtension({
    command: 'deploy_acap',
    payload: { cameraIp, config }
  });

  return response.data;
}
```

### Step 3: Full Deployment Flow

```typescript
// components/CameraDeploymentFlow.tsx

import { scanNetwork, deployToCamera } from '../utils/extensionBridge';
import { useDeployment } from '../hooks/useDeployment'; // Existing hook

export function CameraDeploymentFlow() {
  const deployment = useDeployment(); // Get current deployment (has all configs!)
  const [cameras, setCameras] = useState([]);
  const [selectedCameras, setSelectedCameras] = useState(new Set());
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    setScanning(true);
    try {
      const discovered = await scanNetwork(
        '192.168.50.0/24',
        { username: 'anava', password: 'baton' }
      );
      setCameras(discovered);
    } catch (error) {
      alert(`Scan failed: ${error.message}`);
    } finally {
      setScanning(false);
    }
  }

  async function handleDeploy() {
    for (const cameraIp of selectedCameras) {
      try {
        await deployToCamera(cameraIp, {
          licenseKey: deployment.licenseKey, // Already available!
          customerId: deployment.customerId,
          firebaseConfig: deployment.firebaseConfig,
          geminiConfig: deployment.geminiConfig
        });
        console.log(`✅ Deployed to ${cameraIp}`);
      } catch (error) {
        console.error(`❌ Failed to deploy to ${cameraIp}:`, error);
      }
    }
  }

  return (
    <div className="camera-deployment">
      <h1>Deploy Cameras</h1>

      {/* Step 1: Scan */}
      <section>
        <h2>Step 1: Scan Network</h2>
        <input type="text" placeholder="192.168.50.0/24" />
        <button onClick={handleScan} disabled={scanning}>
          {scanning ? 'Scanning...' : 'Scan Network'}
        </button>
      </section>

      {/* Step 2: Select */}
      {cameras.length > 0 && (
        <section>
          <h2>Step 2: Select Cameras ({cameras.length} found)</h2>
          {cameras.map(camera => (
            <CameraCard
              key={camera.ip}
              camera={camera}
              selected={selectedCameras.has(camera.ip)}
              onToggle={() => toggleCamera(camera.ip)}
            />
          ))}
        </section>
      )}

      {/* Step 3: Deploy */}
      {selectedCameras.size > 0 && (
        <section>
          <h2>Step 3: Deploy</h2>
          <p>Ready to deploy to {selectedCameras.size} camera(s)</p>
          <p><strong>Config:</strong> Using deployment "{deployment.name}"</p>
          <button onClick={handleDeploy}>
            Deploy to Selected Cameras
          </button>
        </section>
      )}
    </div>
  );
}
```

## Native Host Changes (MINIMAL)

The native host (proxy server) needs to accept commands in a slightly different format, but the core logic stays the same.

### Old Format (from extension popup):
```json
{
  "url": "https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "anava",
  "password": "baton",
  "body": {...}
}
```

### New Format (from web app via extension):
```json
{
  "command": "scan_network",
  "payload": {
    "subnet": "192.168.50.0/24",
    "credentials": {
      "username": "anava",
      "password": "baton"
    }
  }
}
```

**Native host just needs a command dispatcher**:

```go
// main.go (native host)

type Command struct {
    Command string                 `json:"command"`
    Payload map[string]interface{} `json:"payload"`
}

func handleCommand(cmd Command) Response {
    switch cmd.Command {
    case "scan_network":
        return handleScanNetwork(cmd.Payload)
    case "deploy_acap":
        return handleDeployAcap(cmd.Payload)
    case "health_check":
        return Response{Success: true, Data: map[string]string{"status": "ok"}}
    default:
        return Response{Success: false, Error: "Unknown command"}
    }
}
```

## Security Checklist

- ✅ **externally_connectable** limits to app.anava.com only
- ✅ **Command whitelist** in extension (only 8 valid commands)
- ✅ **Origin validation** in extension background script
- ✅ **Message format validation** before forwarding
- ✅ **Native host allowed_origins** set to extension ID only
- ✅ **No persistent storage** needed (extension is stateless)
- ✅ **User consent** on extension install (setup flow)

## Chrome Web Store Submission

### Justification for nativeMessaging Permission

> "Our web application configures on-premise Axis cameras. Web browsers cannot directly scan local networks or communicate with local devices due to security sandboxing. This extension acts as a secure bridge, allowing our authenticated web application to discover and configure cameras on the user's local network via a native companion application. The extension validates all commands and only accepts messages from our authorized web application domain."

### Single Purpose Statement

> "Provides secure local network access for the Anava Camera Deployment web application."

### Privacy Policy

> "This extension acts as a communication bridge between the Anava web application and a native companion application. It does not collect, store, or transmit any user data. All network scanning and camera configuration is performed by the native application and controlled through the Anava web interface. Data transmitted through this bridge includes network configuration commands and camera credentials provided by the user through the web application."

## Migration Path

### Phase 1: Build New Web UI (1 week)
- Add Camera Deployment page to web deployer
- Implement extension bridge helper
- Test with development extension

### Phase 2: Simplify Extension (2 days)
- Strip down to just background.js + manifest.json
- Remove all UI code
- Remove popup HTML/CSS/JS
- Update native host message format

### Phase 3: Testing (3 days)
- Test full flow: web app → extension → native host → camera
- Security testing (try unauthorized origins)
- Error handling (extension not installed, native host not running)

### Phase 4: Deploy (1 week)
- Submit simplified extension to Chrome Web Store
- Deploy web app updates
- Update documentation

## Benefits Summary

1. **Faster Development** - Update web UI instantly, no extension review
2. **Better UX** - Full browser window, not cramped popup
3. **Simpler Code** - Extension is 100 lines, web app is normal React
4. **No OAuth Complexity** - Config already in web app
5. **Customer Branding** - Each deployment can have custom UI
6. **Easier Testing** - Just refresh page, not reload extension
7. **Smaller Extension** - Easier Chrome Web Store approval
8. **State Management** - Normal web app patterns, not chrome.storage

## Next Steps

See `WEB_BASED_IMPLEMENTATION_PLAN.md` for detailed tasks.
