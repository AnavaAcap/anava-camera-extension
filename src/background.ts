/**
 * Anava Local Network Bridge - Background Service Worker
 * Uses full TypeScript services from Electron app
 */

import { CameraDiscoveryService } from './services/CameraDiscovery.js';

// Allowed origins for security
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://anava-ai.web.app'
];

// Initialize discovery service
const discoveryService = new CameraDiscoveryService();

console.log('[Background] Anava Local Network Bridge initialized');

/**
 * Listen for messages from web app
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received external message:', message.command, 'from:', sender.origin);

  // Verify sender origin
  if (!ALLOWED_ORIGINS.includes(sender.origin)) {
    console.error('[Background] Unauthorized origin:', sender.origin);
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return false;
  }

  // Route commands
  switch (message.command) {
    case 'health_check':
      handleHealthCheck()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'scan_network':
      handleScanNetwork(message.payload)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'deploy_acap':
      handleDeployAcap(message.payload)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown command: ' + message.command });
      return false;
  }
});

/**
 * Health check
 */
async function handleHealthCheck() {
  try {
    const response = await fetch('http://127.0.0.1:9876/health');
    if (!response.ok) {
      throw new Error('Proxy server returned error: ' + response.status);
    }
    const data = await response.json();
    return { status: 'healthy', proxyServer: data };
  } catch (error: any) {
    throw new Error('Proxy server not responding. Please run: ./install-proxy.sh');
  }
}

/**
 * Scan network using full CameraDiscoveryService
 * This includes all the Electron app optimizations:
 * - Fast-fail unauthenticated request first
 * - Adaptive batch sizing
 * - Device type filtering
 * - Firmware validation
 */
async function handleScanNetwork(payload: any) {
  const { subnet, credentials } = payload;
  console.log('[Background] Scanning network with full discovery service:', subnet);

  // Track progress
  let scannedIPs = 0;
  let axisDevicesFound = 0;
  let camerasFound = 0;

  // Calculate total IPs from CIDR (approximate for progress)
  const totalIPs = calculateSubnetSize(subnet);

  try {
    // Use the full discovery service (PUBLIC METHOD: scanNetworkForCameras)
    const cameras = await discoveryService.scanNetworkForCameras(
      subnet,
      credentials.username,
      credentials.password,
      {
        intensity: 'balanced', // conservative, balanced, or aggressive
        onProgress: (progress) => {
          console.log(`[Background] Scan progress: ${progress.ip} - ${progress.status}`);

          // Update counters
          scannedIPs++;

          // If this is an Axis device (has status beyond unreachable)
          if (progress.status !== 'unreachable' && progress.status !== 'timeout') {
            axisDevicesFound++;
          }

          // If this is a camera (status is accessible or authenticated)
          if (progress.status === 'accessible' || progress.status === 'authenticated') {
            camerasFound++;
          }

          // Send progress update to web app via chrome.runtime.sendMessage
          // This will be received by the onMessage listener in extensionBridge.ts
          chrome.runtime.sendMessage({
            type: 'scan_progress',
            data: {
              scannedIPs,
              totalIPs,
              axisDevices: axisDevicesFound,
              cameras: camerasFound,
              percentComplete: Math.round((scannedIPs / totalIPs) * 100)
            }
          }).catch(err => {
            // Ignore errors - web app may not be listening
            console.debug('[Background] Progress update failed (web app may not be listening):', err);
          });
        }
      }
    );

    console.log(`[Background] Scan complete. Found ${cameras.length} cameras`);

    // Convert to simplified format for web app
    const simplifiedCameras = cameras.map(camera => ({
      ip: camera.ip,
      model: camera.model || 'Unknown',
      manufacturer: camera.manufacturer || 'Axis',
      serialNumber: camera.serialNumber || 'Unknown',
      firmware: camera.firmwareVersion || 'Unknown',
      deviceType: camera.deviceType || 'camera'
    }));

    return { cameras: simplifiedCameras };
  } catch (error: any) {
    console.error('[Background] Network scan error:', error);
    throw new Error(`Network scan failed: ${error.message}`);
  }
}

/**
 * Calculate approximate number of IPs in subnet
 */
function calculateSubnetSize(subnet: string): number {
  const [, maskBits] = subnet.split('/');
  const hostBits = 32 - parseInt(maskBits, 10);
  return Math.pow(2, hostBits) - 2; // Exclude network and broadcast addresses
}

/**
 * Deploy configuration to camera
 */
async function handleDeployAcap(payload: any) {
  const { cameraIp, credentials, config } = payload;
  console.log('[Background] Deploying config to camera:', cameraIp);

  try {
    const systemConfig = {
      firebase: config.firebaseConfig,
      gemini: {
        vertexApiGatewayUrl: config.geminiConfig.vertexApiGatewayUrl || config.geminiConfig.vertex_api_gateway_url,
        vertexApiGatewayKey: config.geminiConfig.vertexApiGatewayKey || config.geminiConfig.vertex_api_gateway_key,
        vertexGcpProjectId: config.geminiConfig.vertexGcpProjectId || config.geminiConfig.vertex_gcp_project_id,
        vertexGcpRegion: config.geminiConfig.vertexGcpRegion || config.geminiConfig.vertex_gcp_region || 'us-central1',
        vertexGcsBucketName: config.geminiConfig.vertexGcsBucketName || config.geminiConfig.vertex_gcs_bucket_name
      },
      anavaKey: config.licenseKey,
      customerId: config.customerId
    };

    const vapixUrl = `https://${cameraIp}/local/BatonAnalytic/baton_analytic.cgi?command=setInstallerConfig`;

    const response = await fetch('http://127.0.0.1:9876/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: vapixUrl,
        method: 'POST',
        username: credentials.username,
        password: credentials.password,
        body: systemConfig
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy returned error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('[Background] Config pushed successfully to', cameraIp);

    if (result.status >= 400) {
      throw new Error(`Camera returned error ${result.status}`);
    }

    return {
      success: true,
      message: 'Configuration deployed successfully'
    };
  } catch (error: any) {
    console.error('[Background] Deployment error:', error);
    throw new Error(`Failed to deploy to camera: ${error.message}`);
  }
}
