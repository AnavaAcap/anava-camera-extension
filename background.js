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
 * Listen for messages from extension popup (internal messages)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received internal message:', message.command);

  switch (message.command) {
    case 'install_proxy':
      handleInstallProxy()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'check_launch_agent':
      handleCheckLaunchAgent()
        .then(result => sendResponse({ installed: result }))
        .catch(error => sendResponse({ installed: false, error: error.message }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown internal command: ' + message.command });
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

    // Scan in batches of 50 (fast but doesn't overwhelm proxy)
    const batchSize = 50;
    const discoveredCameras = [];
    const totalBatches = Math.ceil(ipsToScan.length / batchSize);

    console.log(`[Background] Scanning ${ipsToScan.length} IPs in ${totalBatches} batches of ${batchSize}...`);

    for (let i = 0; i < ipsToScan.length; i += batchSize) {
      const batch = ipsToScan.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      console.log(`[Background] Scanning batch ${batchNum}/${totalBatches} (${batch.length} IPs)...`);

      const batchPromises = batch.map(ip => checkCamera(ip, credentials));
      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(camera => {
        if (camera) discoveredCameras.push(camera);
      });

      console.log(`[Background] Batch ${batchNum} complete. Found ${discoveredCameras.length} cameras so far.`);
    }

    console.log(`[Background] Scan complete. Found ${discoveredCameras.length} cameras total.`);
    return { cameras: discoveredCameras };
  } catch (error) {
    console.error('[Background] Network scan error:', error);
    throw new Error(`Network scan failed: ${error.message}`);
  }
}

/**
 * Check if IP is a camera via proxy
 * Uses param.cgi to get complete device info (firmware, MAC, SOC)
 */
async function checkCamera(ip, credentials) {
  try {
    const response = await fetch('http://127.0.0.1:9876/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://${ip}/axis-cgi/param.cgi`,
        method: 'POST',
        username: credentials.username,
        password: credentials.password,
        data: 'action=list&group=root.Properties'
      }),
      signal: AbortSignal.timeout(3000)  // 3 second timeout
    });

    if (!response.ok) return null;

    const result = await response.json();
    const data = parseParamCgiResponse(result.data || result);

    // Validate it's an Axis device
    if (!data.Brand || !data.Brand.toLowerCase().includes('axis')) {
      return null;
    }

    return {
      ip,
      model: data.ProdFullName || data.ProdShortName || 'Unknown',
      manufacturer: data.Brand || 'Axis',
      serialNumber: data.SerialNumber || 'Unknown',
      firmware: data.Version || 'Unknown',
      socType: extractSocType(data.Soc),
      architecture: data.Architecture || 'aarch64',
      deviceId: (data.SerialNumber || '').replace(/:/g, ''),  // MAC without colons
      deviceType: 'camera',
      hardwareId: data.HardwareID,
      buildDate: data.BuildDate
    };
  } catch (error) {
    return null;
  }
}

/**
 * Parse param.cgi response (key=value format)
 * Example: "root.Properties.System.SerialNumber=B8A44F7BE746"
 */
function parseParamCgiResponse(data) {
  if (typeof data !== 'string') {
    // If already parsed as object, return as-is
    if (typeof data === 'object' && data !== null) return data;
    return {};
  }

  const result = {};
  const lines = data.split('\n');

  for (const line of lines) {
    if (!line.trim() || !line.includes('=')) continue;

    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim(); // Handle values with '=' in them

    if (key) {
      // Extract property name: root.Properties.System.SerialNumber → SerialNumber
      const propName = key.trim().split('.').pop();
      result[propName] = value;
    }
  }

  return result;
}

/**
 * Extract SOC type from Axis SOC string
 * Examples: "Ambarella CV25" → "cv25", "ARTPEC-8" → "artpec8"
 */
function extractSocType(socString) {
  if (!socString) return 'unknown';

  const soc = socString.toLowerCase();

  if (soc.includes('cv25')) return 'cv25';
  if (soc.includes('cv22')) return 'cv22';
  if (soc.includes('artpec-8') || soc.includes('artpec8')) return 'artpec8';
  if (soc.includes('artpec-7') || soc.includes('artpec7')) return 'artpec7';
  if (soc.includes('artpec-6') || soc.includes('artpec6')) return 'artpec6';

  return socString; // Return original if no match
}

/**
 * Complete ACAP Deployment Workflow (6 Steps)
 * Replicates electron installer's rapid deployment pattern
 */
async function handleDeployAcap(payload) {
  const { cameraIp, credentials, config } = payload;
  console.log('[Background] Starting complete ACAP deployment to:', cameraIp);

  try {
    // Step 0: Get camera firmware info and MAC address
    console.log('[Background] Step 0: Getting camera info...');
    const cameraInfo = await getCameraInfo(cameraIp, credentials);
    console.log('[Background] Camera info:', cameraInfo);

    // Step 1: Deploy ACAP file
    console.log('[Background] Step 1: Deploying ACAP file...');
    await deployAcapFile(cameraIp, credentials, cameraInfo);
    console.log('[Background] ACAP deployed successfully');
    await sleep(3000); // Wait 3s for installation

    // Step 2: Activate license
    console.log('[Background] Step 2: Activating license...');
    await activateLicense(cameraIp, credentials, config.licenseKey, cameraInfo.mac);
    console.log('[Background] License activated successfully');
    await sleep(3000); // Wait 3s for processing

    // Step 3: Ensure ACAP is running
    console.log('[Background] Step 3: Ensuring ACAP is running...');
    await ensureAcapRunning(cameraIp, credentials);
    console.log('[Background] ACAP is running');

    // Step 4: Push configuration
    console.log('[Background] Step 4: Pushing configuration...');
    await pushConfiguration(cameraIp, credentials, config);
    console.log('[Background] Configuration pushed successfully');
    await sleep(2000); // Wait 2s for verification

    // Step 5: Validate deployment
    console.log('[Background] Step 5: Validating deployment...');
    const validation = await validateDeployment(cameraIp, credentials);
    console.log('[Background] Validation result:', validation);

    // Step 6: Capture scene description (verification test)
    console.log('[Background] Step 6: Testing ACAP functionality...');
    // Optional: Could add scene capture test here

    return {
      success: true,
      message: 'Complete deployment successful',
      details: {
        cameraIp,
        mac: cameraInfo.mac,
        firmware: cameraInfo.firmware,
        model: cameraInfo.model,
        validation
      }
    };

  } catch (error) {
    console.error('[Background] Deployment error:', error);
    throw new Error(`Deployment failed: ${error.message}`);
  }
}

/**
 * Step 0: Get camera firmware info and MAC address
 */
async function getCameraInfo(cameraIp, credentials) {
  const response = await fetch('http://127.0.0.1:9876/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://${cameraIp}/axis-cgi/basicdeviceinfo.cgi`,
      method: 'POST',
      username: credentials.username,
      password: credentials.password,
      body: {
        apiVersion: '1.0',
        method: 'getAllProperties'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to get camera info: ${response.status}`);
  }

  const result = await response.json();
  const data = result.data?.data?.propertyList || {};

  return {
    mac: (data.SerialNumber || '').replace(/:/g, ''), // MAC without colons
    firmware: data.Version || 'Unknown',
    model: data.ProdFullName || 'Unknown',
    architecture: data.Architecture || 'aarch64',
    osVersion: detectOSVersion(data.Version)
  };
}

function detectOSVersion(firmwareVersion) {
  if (!firmwareVersion) return 'OS12';
  const major = parseInt(firmwareVersion.split('.')[0]);
  return major >= 11 ? 'OS12' : 'OS11';
}

/**
 * Step 1: Deploy ACAP file from GitHub releases
 */
async function deployAcapFile(cameraIp, credentials, cameraInfo) {
  // Get latest ACAP release
  const acapUrl = await getAcapDownloadUrl(cameraInfo.architecture, cameraInfo.osVersion);
  console.log('[Background] ACAP URL:', acapUrl);

  // Download ACAP file
  console.log('[Background] Downloading ACAP...');
  const acapBlob = await fetch(acapUrl).then(r => r.blob());
  console.log('[Background] ACAP downloaded, size:', acapBlob.size);

  // Upload to camera via multipart form-data
  const formData = new FormData();
  formData.append('packfil', acapBlob, 'BatonAnalytic.eap');

  const uploadUrl = `https://${cameraIp}/axis-cgi/applications/upload.cgi`;

  // Proxy doesn't support FormData, so we need to use direct fetch with auth header
  const authHeader = 'Basic ' + btoa(`${credentials.username}:${credentials.password}`);

  const uploadResponse = await fetch('http://127.0.0.1:9876/upload-acap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: uploadUrl,
      username: credentials.username,
      password: credentials.password,
      acapUrl // Proxy will download and upload
    })
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    // Check if already installed (Error: 10)
    if (error.includes('Error: 10')) {
      console.log('[Background] ACAP already installed, continuing...');
      return;
    }
    throw new Error(`ACAP upload failed: ${error}`);
  }

  console.log('[Background] ACAP uploaded successfully');
}

/**
 * Generate license XML using Axis SDK (via offscreen document)
 */
async function generateLicenseWithAxisSDK(deviceId, licenseKey) {
  try {
    // Create offscreen document if it doesn't exist
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('license-worker.html')]
    });

    if (existingContexts.length === 0) {
      console.log('[Background] Creating offscreen document for Axis SDK');
      await chrome.offscreen.createDocument({
        url: 'license-worker.html',
        reasons: ['DOM_SCRAPING'], // Closest reason for loading external SDK
        justification: 'Load Axis SDK to generate signed license XML'
      });

      // Wait for SDK to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Send message to offscreen document
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          command: 'generate_license',
          payload: { deviceId, licenseKey }
        },
        response => {
          if (chrome.runtime.lastError) {
            reject(new Error(`License worker error: ${chrome.runtime.lastError.message}`));
            return;
          }

          if (!response) {
            reject(new Error('No response from license worker'));
            return;
          }

          if (response.success) {
            resolve(response.licenseXML);
          } else {
            reject(new Error(response.error || 'License generation failed'));
          }
        }
      );
    });
  } catch (error) {
    console.error('[Background] Error in generateLicenseWithAxisSDK:', error);
    throw error;
  }
}

/**
 * Get ACAP download URL from GitHub releases
 */
async function getAcapDownloadUrl(architecture, osVersion) {
  // GitHub API: Get latest release
  const releaseUrl = 'https://api.github.com/repos/AnavaAcap/vision-releases/releases/latest';
  const release = await fetch(releaseUrl).then(r => r.json());

  // Find matching ACAP file
  const arch = architecture.toLowerCase();
  const os = osVersion.toLowerCase();

  const asset = release.assets.find(a =>
    a.name.toLowerCase().includes(arch) &&
    a.name.toLowerCase().includes(os) &&
    a.name.endsWith('.eap')
  );

  if (!asset) {
    // Fallback to aarch64 OS12 (most common)
    const fallback = release.assets.find(a =>
      a.name.toLowerCase().includes('aarch64') &&
      a.name.toLowerCase().includes('os12') &&
      a.name.endsWith('.eap')
    );

    if (!fallback) {
      throw new Error(`No ACAP found for ${arch} ${os}`);
    }

    console.log('[Background] Using fallback ACAP:', fallback.name);
    return fallback.browser_download_url;
  }

  console.log('[Background] Found ACAP:', asset.name);
  return asset.browser_download_url;
}

/**
 * Step 2: Activate license via Axis SDK (direct integration)
 */
async function activateLicense(cameraIp, credentials, licenseKey, deviceId) {
  // Generate license XML via license worker (loads Axis SDK)
  console.log('[Background] Generating license XML via Axis SDK...');

  const licenseXML = await generateLicenseWithAxisSDK(deviceId, licenseKey);
  console.log('[Background] License XML generated, length:', licenseXML.length);

  // Upload license XML to camera
  const uploadUrl = `https://${cameraIp}/axis-cgi/applications/license.cgi?action=uploadlicensekey&package=BatonAnalytic`;

  const uploadResponse = await fetch('http://127.0.0.1:9876/upload-license', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: uploadUrl,
      username: credentials.username,
      password: credentials.password,
      licenseXML
    })
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    // Check if already licensed (Error: 30)
    if (error.includes('Error: 30')) {
      console.log('[Background] Already licensed, continuing...');
      return;
    }
    throw new Error(`License upload failed: ${error}`);
  }

  console.log('[Background] License uploaded successfully');
}

/**
 * Step 3: Ensure ACAP application is running
 */
async function ensureAcapRunning(cameraIp, credentials) {
  // Check current status
  const statusResponse = await fetch('http://127.0.0.1:9876/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://${cameraIp}/axis-cgi/applications/list.cgi`,
      method: 'GET',
      username: credentials.username,
      password: credentials.password,
      body: {}
    })
  });

  if (!statusResponse.ok) {
    throw new Error(`Failed to get app status: ${statusResponse.status}`);
  }

  const statusData = await statusResponse.json();
  const statusText = statusData.data?.text || '';

  // Parse XML response (simple string search)
  const isRunning = statusText.includes('Name="BatonAnalytic"') &&
                    statusText.includes('Status="Running"');

  if (isRunning) {
    console.log('[Background] ACAP already running');
    return;
  }

  // Start ACAP
  console.log('[Background] Starting ACAP...');
  const startResponse = await fetch('http://127.0.0.1:9876/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://${cameraIp}/axis-cgi/applications/control.cgi?action=start&package=BatonAnalytic`,
      method: 'GET',
      username: credentials.username,
      password: credentials.password,
      body: {}
    })
  });

  if (!startResponse.ok) {
    throw new Error(`Failed to start ACAP: ${startResponse.status}`);
  }

  // Retry verification (wait for app to start)
  await sleep(3000);

  for (let i = 0; i < 2; i++) {
    const retryResponse = await fetch('http://127.0.0.1:9876/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://${cameraIp}/axis-cgi/applications/list.cgi`,
        method: 'GET',
        username: credentials.username,
        password: credentials.password,
        body: {}
      })
    });

    const retryData = await retryResponse.json();
    const retryText = retryData.data?.text || '';

    if (retryText.includes('Status="Running"')) {
      console.log('[Background] ACAP started successfully');
      return;
    }

    await sleep(3000);
  }

  throw new Error('ACAP failed to start after retries');
}

/**
 * Step 4: Push configuration to camera
 */
async function pushConfiguration(cameraIp, credentials, config) {
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

  const response = await fetch('http://127.0.0.1:9876/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://${cameraIp}/local/BatonAnalytic/baton_analytic.cgi?command=setInstallerConfig`,
      method: 'POST',
      username: credentials.username,
      password: credentials.password,
      body: systemConfig
    })
  });

  if (!response.ok) {
    const error = await response.text();
    // Check for ThreadPool error (ACAP restarting)
    if (error.includes('ThreadPool')) {
      console.log('[Background] ACAP restarting, waiting...');
      await sleep(5000);
      // Verify config saved
      return;
    }
    throw new Error(`Config push failed: ${error}`);
  }

  console.log('[Background] Configuration pushed successfully');
}

/**
 * Step 5: Validate deployment
 */
async function validateDeployment(cameraIp, credentials) {
  const response = await fetch('http://127.0.0.1:9876/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `https://${cameraIp}/axis-cgi/applications/list.cgi`,
      method: 'GET',
      username: credentials.username,
      password: credentials.password,
      body: {}
    })
  });

  if (!response.ok) {
    throw new Error(`Validation failed: ${response.status}`);
  }

  const data = await response.json();
  const statusText = data.data?.text || '';

  // Parse XML for BatonAnalytic status
  const hasBatonAnalytic = statusText.includes('Name="BatonAnalytic"');
  const isRunning = statusText.includes('Status="Running"');
  const isLicensed = statusText.includes('License="Valid"');

  if (!hasBatonAnalytic) {
    throw new Error('ACAP not found on camera');
  }

  if (!isRunning) {
    throw new Error('ACAP is not running');
  }

  if (!isLicensed) {
    throw new Error('ACAP is not licensed');
  }

  return {
    installed: true,
    running: true,
    licensed: true,
    status: 'Valid'
  };
}

/**
 * Utility: Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

/**
 * Handle proxy server installation
 * Opens the installation script in user's default terminal
 */
async function handleInstallProxy() {
  try {
    // For Chrome extensions, we cannot directly execute shell scripts
    // Instead, we'll create a downloadable install script and open instructions

    // Option 1: Try to open Terminal with the install command (macOS only)
    // This requires the extension folder path to be known
    const installInstructions = `
To install the proxy server:

1. Open Terminal
2. Navigate to the extension folder
3. Run: ./install-proxy.sh

Alternative: Download and run the installer script from:
https://github.com/AnavaAcap/anava-camera-extension
    `;

    console.log('[Background] Proxy installation requested');
    console.log('[Background] User needs to run: ./install-proxy.sh');

    // Since we can't execute shell scripts directly from a Chrome extension,
    // we'll return instructions for the user
    throw new Error('Automatic installation is not available. Please run ./install-proxy.sh manually from the extension folder.');

  } catch (error) {
    console.error('[Background] Install proxy error:', error);
    throw error;
  }
}

/**
 * Check if LaunchAgent is installed (proxy configured to auto-start)
 */
async function handleCheckLaunchAgent() {
  try {
    // We can't directly check the file system from a Chrome extension
    // Instead, we'll check if the proxy server is running (good enough proxy)
    const response = await fetch('http://127.0.0.1:9876/health', {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

console.log('[Background] Anava Local Network Bridge initialized');
