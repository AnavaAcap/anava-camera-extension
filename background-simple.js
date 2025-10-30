/**
 * Anava Local Network Bridge - Background Service Worker
 * Simplified version without ES module imports
 */

// Allowed origins for security
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://anava-ai.web.app'
];

/**
 * Listen for messages from web app (externally_connectable)
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received external message:', message.command, 'from:', sender.origin);

  // Verify sender origin
  if (!ALLOWED_ORIGINS.includes(sender.origin)) {
    console.error('[Background] Unauthorized origin:', sender.origin);
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return false;
  }

  // Route commands to appropriate handlers
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

    case 'get_firmware_info':
      handleGetFirmwareInfo(message.payload)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown command: ' + message.command });
      return false;
  }
});

/**
 * Health check - verify proxy server is running
 */
async function handleHealthCheck() {
  try {
    const response = await fetch('http://127.0.0.1:9876/health');
    if (!response.ok) {
      throw new Error('Proxy server returned error: ' + response.status);
    }
    const data = await response.json();
    console.log('[Background] Health check response:', data);
    return { status: 'healthy', proxyServer: data };
  } catch (error) {
    console.error('[Background] Health check failed:', error);
    throw new Error('Proxy server not responding. Please run: ./install-proxy.sh');
  }
}

/**
 * Scan network for cameras
 */
async function handleScanNetwork(payload) {
  const { subnet, credentials } = payload;
  console.log('[Background] Scanning network:', subnet);

  try {
    // Parse CIDR
    const { baseIp, count } = parseCIDR(subnet);
    console.log(`[Background] Scanning ${count} IPs starting from ${baseIp}`);

    // Generate IPs
    const ipsToScan = generateIpRange(baseIp, count);
    console.log(`[Background] Generated ${ipsToScan.length} IPs to scan`);

    // Scan in batches - FAST: 50 concurrent requests
    const discoveredCameras = [];
    const batchSize = 50;

    for (let i = 0; i < ipsToScan.length; i += batchSize) {
      const batch = ipsToScan.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(ipsToScan.length / batchSize);
      const percentComplete = Math.round((i / ipsToScan.length) * 100);

      console.log(`[Background] Scanning batch ${batchNum}/${totalBatches} (${percentComplete}% complete, ${discoveredCameras.length} cameras found)`);

      const batchPromises = batch.map(ip => checkCamera(ip, credentials));
      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(camera => {
        if (camera) {
          discoveredCameras.push(camera);
          console.log(`[Background] 📹 Found camera: ${camera.ip} - ${camera.model}`);
        }
      });
    }

    console.log(`[Background] Scan complete. Found ${discoveredCameras.length} cameras`);
    return { cameras: discoveredCameras };
  } catch (error) {
    console.error('[Background] Network scan error:', error);
    throw new Error(`Network scan failed: ${error.message}`);
  }
}

/**
 * Check if IP is a camera via proxy
 * Uses 3 second timeout for fast failure
 */
async function checkCamera(ip, credentials) {
  try {
    // Race between fetch and 3-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('http://127.0.0.1:9876/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        url: `https://${ip}/axis-cgi/basicdeviceinfo.cgi`,
        method: 'POST',
        username: credentials.username,
        password: credentials.password,
        body: {
          apiVersion: '1.0',
          method: 'getProperties',
          params: {
            propertyList: ['Brand', 'ProdType', 'ProdNbr', 'ProdFullName', 'SerialNumber']
          }
        }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const result = await response.json();
    if (!result || result.status >= 400) return null;

    // Parse response
    const data = result.data || result;
    return {
      ip,
      model: data.ProdFullName || 'Unknown',
      manufacturer: data.Brand || 'Axis',
      serialNumber: data.SerialNumber || 'Unknown',
      firmware: 'Unknown',
      deviceType: 'camera'
    };
  } catch (error) {
    return null;
  }
}

/**
 * Deploy configuration to camera
 */
async function handleDeployAcap(payload) {
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
  } catch (error) {
    console.error('[Background] Deployment error:', error);
    throw new Error(`Failed to deploy to camera: ${error.message}`);
  }
}

/**
 * Get camera firmware info
 */
async function handleGetFirmwareInfo(payload) {
  const { cameraIp, credentials } = payload;

  try {
    const response = await fetch('http://127.0.0.1:9876/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://${cameraIp}/axis-cgi/basicdeviceinfo.cgi`,
        method: 'GET',
        username: credentials.username,
        password: credentials.password,
        body: {}
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get firmware info');
    }

    const result = await response.json();
    return result.data || result;
  } catch (error) {
    throw new Error('Failed to get firmware info: ' + error.message);
  }
}

/**
 * Parse CIDR notation
 */
function parseCIDR(cidr) {
  const [baseIp, prefixLength] = cidr.split('/');
  const prefix = parseInt(prefixLength, 10);
  const count = Math.pow(2, 32 - prefix);
  return { baseIp, count };
}

/**
 * Generate IP range
 */
function generateIpRange(baseIp, count) {
  const parts = baseIp.split('.').map(Number);
  const ips = [];
  let ipNum = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];

  for (let i = 0; i < Math.min(count, 256); i++) {
    const currentIp = ipNum + i;
    const ip = [
      (currentIp >> 24) & 255,
      (currentIp >> 16) & 255,
      (currentIp >> 8) & 255,
      currentIp & 255
    ].join('.');
    ips.push(ip);
  }

  return ips;
}

console.log('[Background] Anava Local Network Bridge initialized');
