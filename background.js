/**
 * Anava Local Network Bridge - Background Service Worker
 * Simplified version without ES module imports
 */

// Version requirements
const REQUIRED_NATIVE_VERSION = "2.0.0";
const NATIVE_HOST_ID = "com.anava.local_connector";

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
    case 'INITIALIZE_CONNECTION':
      handleInitializeConnection(message.payload)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'health_check':
      handleHealthCheck()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'scan_network':
      handleScanNetwork(message.payload, sender)
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
 * Listen for messages from extension popup and content scripts (internal messages)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received internal message:', message.type || message.command);

  // Handle messages by type (from content script)
  if (message.type) {
    switch (message.type) {
      case 'CONFIG_DISCOVERED':
        handleConfigDiscovered(message.config, message.origin)
          .then(result => sendResponse({ success: true, data: result }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'SCAN_CAMERAS':
        handleScanNetwork(message, sender)
          .then(result => sendResponse({ success: true, data: result }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'AUTHENTICATE_WITH_BACKEND':
        handleAuthenticateWithBackend(message)
          .then(result => sendResponse({ success: true, data: result }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'REQUEST_CONFIG_DISCOVERY':
        // Content script is asking if we want config discovery
        sendResponse({ success: true, shouldDiscover: true });
        return false;

      default:
        break;
    }
  }

  // Handle messages by command (from popup)
  switch (message.command) {
    case 'install_proxy':
      handleInstallProxy()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'restart_proxy':
      handleRestartProxy()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'check_proxy_instances':
      handleCheckProxyInstances()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'kill_duplicate_proxies':
      handleKillDuplicateProxies()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'check_launch_agent':
      handleCheckLaunchAgent()
        .then(result => sendResponse({ installed: result }))
        .catch(error => sendResponse({ installed: false, error: error.message }));
      return true;

    case 'generate_license':
      // This message is for the offscreen document (license-worker.html)
      // Don't handle it here - let it pass through to the offscreen document
      console.log('[Background] Ignoring generate_license - will be handled by offscreen document');
      return false;

    default:
      sendResponse({ success: false, error: 'Unknown internal command: ' + (message.command || message.type) });
      return false;
  }
});

/**
 * Initialize connection from web app
 * Web app provides backend URL, project ID, and nonce for authentication
 */
async function handleInitializeConnection(payload) {
  const { backendUrl, projectId, nonce } = payload;

  console.log('[Background] Initializing connection for project:', projectId);

  try {
    // Store configuration in local storage
    await chrome.storage.local.set({
      backendUrl,
      projectId,
      nonce,
      connectedAt: Date.now()
    });

    console.log('[Background] Configuration stored');

    // Forward configuration to native host
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_ID,
        {
          type: 'CONFIGURE',
          backendUrl,
          projectId,
          nonce
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        }
      );
    });

    console.log('[Background] Native host configured:', response);

    return {
      configured: true,
      projectId,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error('[Background] Failed to initialize connection:', error);
    throw new Error(`Connection initialization failed: ${error.message}`);
  }
}

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
 * Ensure proxy server is ready before operations
 * Retries up to 3 times with 2 second delays
 */
async function ensureProxyReady() {
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://127.0.0.1:9876/health', {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[Background] ✅ Proxy server is ready:', data);
        return true;
      } else {
        console.warn(`[Background] Proxy health check returned HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn(`[Background] Proxy check attempt ${i+1}/${maxRetries} failed:`, error.message);

      if (i < maxRetries - 1) {
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  throw new Error('Local connector not responding. Please ensure the proxy server is running by running: ./install-local-connector.sh');
}

/**
 * Scan network for cameras
 */
async function handleScanNetwork(payload, sender) {
  const { subnet, credentials } = payload;
  console.log('[Background] Scanning network:', subnet);

  try {
    // CRITICAL: Verify proxy is ready before scanning
    console.log('[Background] Verifying proxy server is ready...');
    await ensureProxyReady();
    console.log('[Background] Proxy verified - starting network scan');

    // Parse CIDR
    const { baseIp, count } = parseCIDR(subnet);
    console.log(`[Background] Scanning ${count} IPs starting from ${baseIp}`);

    // Generate IPs
    const ipsToScan = generateIpRange(baseIp, count);
    console.log(`[Background] Generated ${ipsToScan.length} IPs to scan`);

    // Scan in batches of 50 (fast but doesn't overwhelm proxy)
    const batchSize = 50;
    const discoveredCameras = [];
    const discoveredAxisDevices = [];
    const totalIPs = ipsToScan.length;
    const totalBatches = Math.ceil(totalIPs / batchSize);

    console.log(`[Background] Scanning ${totalIPs} IPs in ${totalBatches} batches of ${batchSize}...`);

    // Helper to broadcast progress to web app (if it's an external message)
    const broadcastProgress = async (scannedIPs) => {
      if (sender && sender.origin) {
        // External message from web app - send progress back via tabs
        try {
          const tabs = await chrome.tabs.query({ url: sender.origin + '/*' });
          console.log(`[Background] Broadcasting progress to ${tabs.length} tabs:`, {
            scannedIPs,
            totalIPs,
            cameras: discoveredCameras.length
          });

          if (tabs && tabs.length > 0) {
            for (const tab of tabs) {
              if (tab && tab.id) {
                try {
                  await chrome.tabs.sendMessage(tab.id, {
                    type: 'scan_progress',
                    data: {
                      scannedIPs,
                      totalIPs,
                      axisDevices: discoveredAxisDevices.length,
                      cameras: discoveredCameras.length,
                      percentComplete: (scannedIPs / totalIPs) * 100
                    }
                  });
                } catch (err) {
                  // Silently ignore - tab may have closed or content script not injected yet
                  console.log(`[Background] Failed to send to tab ${tab.id}:`, err.message);
                }
              }
            }
          } else {
            console.warn('[Background] No tabs found for origin:', sender.origin);
          }
        } catch (error) {
          console.error('[Background] Failed to query tabs:', error);
        }
      }
    };

    for (let i = 0; i < ipsToScan.length; i += batchSize) {
      const batch = ipsToScan.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      console.log(`[Background] Scanning batch ${batchNum}/${totalBatches} (${batch.length} IPs)...`);

      const batchPromises = batch.map(ip => checkCamera(ip, credentials));
      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(camera => {
        if (camera) {
          discoveredAxisDevices.push(camera);
          if (camera.deviceType === 'camera') {
            discoveredCameras.push(camera);
          }
        }
      });

      // Broadcast progress after each batch
      await broadcastProgress(i + batch.length);

      console.log(`[Background] Batch ${batchNum} complete. Found ${discoveredCameras.length} cameras so far.`);
    }

    // Final progress update
    await broadcastProgress(totalIPs);

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
      }),
      signal: AbortSignal.timeout(3000)  // 3 second timeout
    });

    if (!response.ok) {
      // Log first few failures to understand network issues
      if (Math.random() < 0.02) { // Log 2% of failures
        const errorText = await response.text().catch(() => 'Unable to read error');
        console.log(`[Background] ${ip} returned HTTP ${response.status}:`, errorText.substring(0, 100));
      }
      return null;
    }

    const result = await response.json();

    // Parse basicdeviceinfo.cgi response: result.data.data.propertyList
    const data = result.data?.data?.propertyList || {};

    // Validate it's an Axis device
    if (!data.Brand || !data.Brand.toLowerCase().includes('axis')) {
      return null;
    }

    console.log(`[Background] ✅ Found camera at ${ip}: ${data.ProdFullName}`);

    return {
      ip,
      model: data.ProdFullName || data.ProdShortName || data.ProdNbr || 'Unknown',
      manufacturer: data.Brand || 'Axis',
      serialNumber: data.SerialNumber || 'Unknown',
      productNumber: data.ProdNbr,
      productType: data.ProdType,
      deviceId: data.SerialNumber,
      deviceType: 'camera'
    };
  } catch (error) {
    // Log first few errors to see what's failing
    if (Math.random() < 0.01) { // Log 1% of errors
      console.error(`[Background] ${ip} error:`, error.message);
    }
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
 * Complete ACAP Deployment Workflow (4 Steps)
 * CRITICAL: Matches Electron installer's exact license activation sequence
 * Step 2 now includes app start (was previously Step 3)
 */
async function handleDeployAcap(payload) {
  const { cameraIp, credentials, config } = payload;
  console.log('[Background] ========================================');
  console.log('[Background] Starting ACAP deployment to:', cameraIp);
  console.log('[Background] Credentials:', { username: credentials.username, password: '***' });
  console.log('[Background] Config keys:', Object.keys(config));
  console.log('[Background] ========================================');

  try {
    // Verify proxy is ready
    console.log('[Background] Verifying proxy server is ready...');
    await ensureProxyReady();

    // Step 0: Get camera firmware info and MAC address
    console.log('[Background] Step 0: Getting camera info...');
    const cameraInfo = await getCameraInfo(cameraIp, credentials);
    console.log('[Background] ✅ Camera info:', cameraInfo);

    // Step 1: Deploy ACAP file
    console.log('[Background] Step 1: Deploying ACAP file...');
    try {
      await deployAcapFile(cameraIp, credentials, cameraInfo);
      console.log('[Background] ✅ ACAP deployed successfully');
    } catch (error) {
      console.error('[Background] ❌ Step 1 failed:', error.message);
      throw new Error(`Step 1 (Deploy ACAP): ${error.message}`);
    }
    await sleep(3000); // Wait 3s for installation

    // Step 2: Activate license (this now includes starting the app)
    console.log('[Background] Step 2: Activating license...');
    try {
      await activateLicense(cameraIp, credentials, config.licenseKey, cameraInfo.mac);
      console.log('[Background] ✅ License activated and app started successfully');
    } catch (error) {
      console.error('[Background] ❌ Step 2 failed:', error.message);
      throw new Error(`Step 2 (Activate License): ${error.message}`);
    }
    await sleep(2000); // Wait 2s for app to stabilize

    // Step 3: Push configuration
    console.log('[Background] Step 3: Pushing configuration...');
    try {
      await pushConfiguration(cameraIp, credentials, config);
      console.log('[Background] ✅ Configuration pushed successfully');
    } catch (error) {
      console.error('[Background] ❌ Step 3 failed:', error.message);
      throw new Error(`Step 3 (Push Config): ${error.message}`);
    }
    await sleep(2000); // Wait 2s for verification

    // Step 4: Validate deployment
    console.log('[Background] Step 4: Validating deployment...');
    try {
      const validation = await validateDeployment(cameraIp, credentials);
      console.log('[Background] ✅ Validation result:', validation);

      console.log('[Background] ========================================');
      console.log('[Background] 🎉 DEPLOYMENT SUCCESSFUL!');
      console.log('[Background] ========================================');

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
      console.error('[Background] ❌ Step 4 failed:', error.message);
      throw new Error(`Step 4 (Validate): ${error.message}`);
    }

  } catch (error) {
    console.error('[Background] ========================================');
    console.error('[Background] ❌ DEPLOYMENT FAILED');
    console.error('[Background] Error:', error.message);
    console.error('[Background] Stack:', error.stack);
    console.error('[Background] ========================================');
    throw error; // Re-throw original error to preserve stack
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
  if (!firmwareVersion) return 'os12';
  const major = parseInt(firmwareVersion.split('.')[0]);

  // Firmware version mapping (lowercase to match actual file names):
  // 10.x and below → os10 (unsupported)
  // 11.x → os11
  // 12.x and above → os12
  if (major >= 12) return 'os12';
  if (major >= 11) return 'os11';
  return 'os10'; // Unsupported
}

/**
 * Step 1: Deploy ACAP file from GitHub releases
 */
async function deployAcapFile(cameraIp, credentials, cameraInfo) {
  // Get latest ACAP release
  const acapUrl = await getAcapDownloadUrl(cameraInfo.architecture, cameraInfo.osVersion);
  console.log('[Background] ACAP URL:', acapUrl);

  // Upload to camera via proxy (proxy will download from GitHub and upload to camera)
  const uploadUrl = `https://${cameraIp}/axis-cgi/applications/upload.cgi`;

  console.log('[Background] Uploading ACAP via proxy...');
  console.log('[Background] This may take 60-120 seconds for large files...');
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
    }),
    signal: AbortSignal.timeout(320000) // 320 second timeout (allow buffer beyond proxy's 300s)
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
      documentUrls: [chrome.runtime.getURL('dist/license-worker.html')]
    });

    if (existingContexts.length === 0) {
      console.log('[Background] Creating offscreen document for Axis SDK');
      await chrome.offscreen.createDocument({
        url: 'dist/license-worker.html',
        reasons: ['DOM_SCRAPING'], // Closest reason for loading external SDK
        justification: 'Load Axis SDK to generate signed license XML'
      });

      // Wait for SDK to initialize using polling with timeout
      console.log('[Background] Waiting for Axis SDK to load...');
      const maxWaitTime = 15000; // 15 seconds max
      const startTime = Date.now();
      let sdkReady = false;

      while (!sdkReady && (Date.now() - startTime) < maxWaitTime) {
        try {
          // Try to ping the offscreen document
          const pingResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { command: 'ping_license_worker' },
              (response) => {
                // Ignore errors, just check if we get a response
                if (chrome.runtime.lastError) {
                  resolve(null);
                } else {
                  resolve(response);
                }
              }
            );
            // Add timeout to prevent hanging
            setTimeout(() => resolve(null), 1000);
          });

          if (pingResponse && pingResponse.ready) {
            console.log('[Background] ✅ License worker is ready');
            sdkReady = true;
            break;
          }
        } catch (e) {
          // Ignore errors, continue polling
        }

        // Wait 500ms before next check
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!sdkReady) {
        throw new Error('License worker did not become ready within 15 seconds');
      }
    } else {
      console.log('[Background] Offscreen document already exists');
    }

    // Send message to ALL extension contexts (including offscreen)
    // Use chrome.runtime.sendMessage without target - it broadcasts to all contexts
    console.log('[Background] Sending license generation request to offscreen document');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('License generation timed out after 30 seconds'));
      }, 30000);

      chrome.runtime.sendMessage(
        {
          command: 'generate_license',
          payload: { deviceId, licenseKey }
        },
        response => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            reject(new Error(`License worker error: ${chrome.runtime.lastError.message}`));
            return;
          }

          if (!response) {
            reject(new Error('No response from license worker - offscreen document may not be loaded'));
            return;
          }

          if (response.success) {
            console.log('[Background] License XML received from worker');
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
 * Actual file format: signed_Anava_-_Analyze_7.4.6_aarch64_os11.eap
 */
async function getAcapDownloadUrl(architecture, osVersion) {
  try {
    // Use the correct GitHub repo (not vision-releases!)
    const releaseUrl = 'https://api.github.com/repos/AnavaAcap/acap-releases/releases/latest';
    console.log('[Background] Fetching ACAP releases from GitHub:', releaseUrl);

    const response = await fetch(releaseUrl);
    console.log('[Background] GitHub API response status:', response.status);

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
    }

    const release = await response.json();
    console.log('[Background] Release data:', release.tag_name, 'with', release.assets?.length, 'assets');

    // Normalize inputs to match actual file naming convention
    const arch = architecture.toLowerCase(); // aarch64 or armv7hf
    const os = osVersion.toLowerCase(); // os11 or os12 (lowercase!)

    console.log(`[Background] Looking for ACAP: architecture=${arch}, osVersion=${os}`);

    // List all available ACAP files for debugging
    const acapFiles = release.assets.filter(a => a.name.endsWith('.eap') || a.name.endsWith('.acap'));
    console.log('[Background] Available ACAP files:', acapFiles.map(a => a.name));

    // Match files that contain both architecture AND OS version
    // Example: signed_Anava_-_Analyze_7.4.6_aarch64_os11.eap
    const matches = acapFiles.filter(a => {
      const name = a.name.toLowerCase();
      return name.includes(arch) && name.includes(os);
    });

    console.log('[Background] Found', matches.length, 'matching ACAP files');

    if (matches.length === 0) {
      // No matches - throw detailed error
      throw new Error(
        `No ACAP found for architecture=${arch} osVersion=${os}. ` +
        `Available files: ${acapFiles.map(a => a.name).join(', ')}`
      );
    }

    // If multiple matches, prefer the latest (they should be sorted by version)
    const selectedAcap = matches[0];
    console.log(`[Background] ✅ Selected ACAP: ${selectedAcap.name}`);
    console.log(`[Background] Download URL: ${selectedAcap.browser_download_url}`);

    return selectedAcap.browser_download_url;
  } catch (error) {
    console.error('[Background] Error in getAcapDownloadUrl:', error);
    throw new Error(`Failed to get ACAP download URL: ${error.message}`);
  }
}

/**
 * Step 2: Activate license via Axis SDK (direct integration)
 * CRITICAL: Matches Electron installer's exact sequence (cameraConfigurationService.ts lines 1354-1726)
 */
async function activateLicense(cameraIp, credentials, licenseKey, deviceId) {
  console.log('[Background] ========================================');
  console.log('[Background] LICENSE ACTIVATION STARTED');
  console.log('[Background] Camera IP:', cameraIp);
  console.log('[Background] Device ID:', deviceId);
  console.log('[Background] License Key:', licenseKey.substring(0, 10) + '...');
  console.log('[Background] ========================================');

  // First, check if the application is already licensed (Electron pattern)
  console.log('[Background] Checking if ACAP is already licensed...');
  const checkResponse = await fetch('http://127.0.0.1:9876/proxy', {
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

  if (checkResponse.ok) {
    const checkData = await checkResponse.json();
    const checkText = checkData.data?.text || '';

    // Check if already licensed (same regex as Electron line 1436-1438)
    const licenseMatch = checkText.match(/Name="BatonAnalytic"[^>]*License="([^"]*)"/i);

    if (licenseMatch && licenseMatch[1] === 'Valid') {
      console.log('[Background] BatonAnalytic is already licensed, starting app and returning...');

      // Even if licensed, ensure app is running (Electron lines 1446-1465)
      await ensureAcapRunning(cameraIp, credentials);

      console.log('[Background] ========================================');
      console.log('[Background] ✅ ALREADY LICENSED - SKIPPING LICENSE ACTIVATION');
      console.log('[Background] ========================================');
      return;
    }
  }

  // Not licensed yet - proceed with activation
  console.log('[Background] Generating license XML via Axis SDK...');
  const licenseXML = await generateLicenseWithAxisSDK(deviceId, licenseKey);
  console.log('[Background] ✅ License XML generated, length:', licenseXML.length);
  console.log('[Background] License XML (first 200 chars):', licenseXML.substring(0, 200));

  // Upload license XML to camera
  const uploadUrl = `https://${cameraIp}/axis-cgi/applications/license.cgi?action=uploadlicensekey&package=BatonAnalytic`;
  console.log('[Background] Upload URL:', uploadUrl);

  console.log('[Background] Uploading license to camera...');
  const uploadResponse = await fetch('http://127.0.0.1:9876/upload-license', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: uploadUrl,
      username: credentials.username,
      password: credentials.password,
      licenseXML
    }),
    signal: AbortSignal.timeout(320000) // 320 second timeout (allow buffer beyond proxy's 300s)
  });

  console.log('[Background] Upload response status:', uploadResponse.status);
  console.log('[Background] Upload response ok:', uploadResponse.ok);

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    console.error('[Background] ❌ License upload failed with status:', uploadResponse.status);
    console.error('[Background] Error response:', error);

    // Check if already licensed (Error: 30)
    if (error.includes('Error: 30')) {
      console.log('[Background] Already licensed (Error: 30), continuing to verification...');
      // Still verify even if already licensed
    } else {
      throw new Error(`License upload failed (HTTP ${uploadResponse.status}): ${error}`);
    }
  } else {
    const responseData = await uploadResponse.json();
    console.log('[Background] ✅ License upload accepted by camera');
    console.log('[Background] Response data:', responseData);
  }

  // CRITICAL: Wait for camera to process the license (Electron line 1589)
  console.log('[Background] Waiting 3 seconds for camera to process license...');
  await sleep(3000);

  // CRITICAL: Verify the license is actually active (Electron lines 1592-1629)
  console.log('[Background] Verifying license status...');
  const verifyResponse = await fetch('http://127.0.0.1:9876/proxy', {
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

  if (!verifyResponse.ok) {
    console.warn('[Background] ⚠️ Could not verify license status (HTTP', verifyResponse.status, ')');
    throw new Error(`License verification failed: HTTP ${verifyResponse.status}`);
  }

  const verifyData = await verifyResponse.json();
  const verifyText = verifyData.data?.text || '';

  console.log('[Background] License verification response (first 1000 chars):');
  console.log(verifyText.substring(0, 1000));

  // Check specifically for BatonAnalytic's license status (not other apps!)
  // Match: Name="BatonAnalytic" ... License="Valid" (allowing any content between)
  const batonAnalyticMatch = verifyText.match(/Name="BatonAnalytic"[^>]*License="([^"]*)"/);
  const batonAnalyticLicense = batonAnalyticMatch ? batonAnalyticMatch[1] : null;

  console.log('[Background] BatonAnalytic license status:', batonAnalyticLicense);

  if (batonAnalyticLicense === 'Valid') {
    console.log('[Background] ✅ LICENSE VERIFIED AS ACTIVE!');
    console.log('[Background] License="Valid" found in camera response');
  } else {
    console.error('[Background] ❌ LICENSE NOT ACTIVE ON CAMERA');
    console.error('[Background] Expected: License="Valid"');
    console.error('[Background] Found: License="' + batonAnalyticLicense + '"');
    throw new Error('License upload accepted but license is NOT active on camera. Check camera web interface for details.');
  }

  // CRITICAL: Now start the application after license activation (Electron lines 1636-1659)
  console.log('[Background] Starting BatonAnalytic application after license activation...');
  await ensureAcapRunning(cameraIp, credentials);

  console.log('[Background] ========================================');
  console.log('[Background] ✅ LICENSE ACTIVATION COMPLETE');
  console.log('[Background] Application is running and licensed');
  console.log('[Background] ========================================');
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
    console.log('[Background] Proxy installation requested');
    console.log('[Background] User needs to run: ./install-proxy.sh');

    // Chrome extensions cannot execute shell scripts directly
    // Return instructions for manual installation
    throw new Error('Automatic installation is not available. Please run ./install-proxy.sh manually from the extension folder.');

  } catch (error) {
    console.error('[Background] Install proxy error:', error);
    throw error;
  }
}

/**
 * Handle proxy server restart
 * Kills existing instances and starts a new one
 */
async function handleRestartProxy() {
  try {
    console.log('[Background] Restarting proxy server...');

    // Step 1: Kill existing proxy instances
    await handleKillDuplicateProxies();

    // Step 2: Wait a moment for processes to terminate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Start proxy (in practice, user needs to run install script)
    // We can't start processes from Chrome extension, so just verify it's running
    const response = await fetch('http://127.0.0.1:9876/health', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      console.log('[Background] Proxy server restarted successfully');
      return { restarted: true };
    } else {
      throw new Error('Proxy server not responding after restart attempt');
    }

  } catch (error) {
    console.error('[Background] Restart proxy error:', error);
    throw new Error('Unable to restart proxy automatically. Please run: ./start-proxy.sh');
  }
}

/**
 * Check for multiple proxy server instances (port conflicts)
 */
async function handleCheckProxyInstances() {
  try {
    console.log('[Background] Checking for multiple proxy instances...');

    // Check if port 9876 is in use
    const response = await fetch('http://127.0.0.1:9876/health', {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });

    if (response.ok) {
      // Port is in use by a responsive process
      return {
        inUse: true,
        multipleInstances: false, // Can't detect multiple instances from Chrome
        processCount: 1
      };
    } else {
      return {
        inUse: true,
        multipleInstances: false,
        processCount: 0
      };
    }

  } catch (error) {
    // Port not in use or not responding
    return {
      inUse: false,
      multipleInstances: false,
      processCount: 0
    };
  }
}

/**
 * Kill duplicate proxy server instances
 */
async function handleKillDuplicateProxies() {
  try {
    console.log('[Background] Killing duplicate proxy instances...');

    // Chrome extensions cannot execute shell commands
    // User needs to manually run: pkill -f camera-proxy-server
    console.log('[Background] User needs to manually kill processes: pkill -f camera-proxy-server');

    throw new Error('Cannot kill processes from Chrome extension. Please run: pkill -f camera-proxy-server');

  } catch (error) {
    console.error('[Background] Kill duplicates error:', error);
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

/**
 * Handle configuration discovered from terraform-spa site
 */
async function handleConfigDiscovered(config, origin) {
  console.log('[Background] Configuration discovered from:', origin);
  console.log('[Background] Config:', config);

  // Validate the extension ID matches (if we're published)
  const ourExtensionId = chrome.runtime.id;
  if (config.extensionId !== 'PLACEHOLDER_EXTENSION_ID' && config.extensionId !== ourExtensionId) {
    console.warn('[Background] Extension ID mismatch:', config.extensionId, 'vs', ourExtensionId);
    return { validated: false, reason: 'Extension ID mismatch' };
  }

  // Store the configuration
  await chrome.storage.local.set({
    discoveredConfig: config,
    discoveryOrigin: origin,
    discoveryTime: Date.now()
  });

  // Update badge to show we're connected to a project
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }); // Green

  return {
    validated: true,
    projectId: config.projectId,
    features: config.features
  };
}

/**
 * Handle authentication with backend using nonce
 */
async function handleAuthenticateWithBackend(payload) {
  const { nonce, backendUrl } = payload;

  try {
    // Get discovered config if not provided
    let apiUrl = backendUrl;
    if (!apiUrl) {
      const storage = await chrome.storage.local.get(['discoveredConfig']);
      if (storage.discoveredConfig) {
        apiUrl = storage.discoveredConfig.backendUrl;
      }
    }

    if (!apiUrl) {
      throw new Error('No backend URL available');
    }

    // Forward to native host for authentication
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_ID,
        {
          type: 'AUTHENTICATE',
          nonce,
          backendUrl: apiUrl
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        }
      );
    });

    return {
      success: true,
      token: response.token,
      authenticated: true
    };

  } catch (error) {
    console.error('[Background] Authentication failed:', error);
    throw error;
  }
}

/**
 * Check native host version
 */
async function checkNativeVersion() {
  try {
    console.log('[Background] Checking native host version...');

    // Send GET_VERSION message to native host
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_ID,
        { type: 'GET_VERSION' },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        }
      );
    });

    if (!response || !response.version) {
      throw new Error('No version in response');
    }

    const nativeVersion = response.version;
    console.log('[Background] Native host version:', nativeVersion);
    console.log('[Background] Required version:', REQUIRED_NATIVE_VERSION);

    if (nativeVersion !== REQUIRED_NATIVE_VERSION) {
      console.warn('[Background] Version mismatch detected!');

      // Set badge to indicate update needed
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' }); // Orange

      // Store version mismatch info
      chrome.storage.local.set({
        nativeVersionMismatch: true,
        currentNativeVersion: nativeVersion,
        requiredNativeVersion: REQUIRED_NATIVE_VERSION
      });

      return false;
    }

    // Version matches - clear any previous warnings
    chrome.action.setBadgeText({ text: '' });
    chrome.storage.local.set({
      nativeVersionMismatch: false,
      currentNativeVersion: nativeVersion
    });

    console.log('[Background] Version check passed');
    return true;

  } catch (error) {
    console.error('[Background] Native host not responding:', error.message);

    // Native host not installed or not responding
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' }); // Red

    chrome.storage.local.set({
      nativeNotInstalled: true,
      nativeVersionMismatch: false
    });

    return false;
  }
}

/**
 * Listen for extension installation/update
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed/updated:', details.reason);

  // DISABLED: Native host version check not needed for proxy-based deployment
  // checkNativeVersion();
});

/**
 * Listen for browser startup
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Browser started');

  // DISABLED: Native host version check not needed for proxy-based deployment
  // checkNativeVersion();
});

/**
 * Periodic version check (every 5 minutes)
 * DISABLED: Native host not required for camera deployment via proxy server
 */
// setInterval(() => {
//   checkNativeVersion();
// }, 5 * 60 * 1000); // 5 minutes

// DISABLED: Initial version check on script load
// Native host not required - camera deployment uses HTTP proxy on port 9876
// checkNativeVersion();

console.log('[Background] Anava Local Network Bridge initialized');
