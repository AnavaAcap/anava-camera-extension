/**
 * Axis License Worker - Loads Axis SDK and generates signed license XML
 *
 * This hidden page runs in the Chrome extension context and provides
 * license generation functionality without requiring a Cloud Function.
 */

console.log('[License Worker] Initializing...');

// Wait for Axis SDK to load
let sdkReady = false;
const SDK_TIMEOUT = 10000; // 10 seconds

const waitForSDK = new Promise((resolve, reject) => {
  const checkInterval = setInterval(() => {
    if (typeof window.ACAP !== 'undefined') {
      console.log('[License Worker] Axis SDK loaded successfully');
      sdkReady = true;
      clearInterval(checkInterval);
      clearTimeout(timeout);
      resolve();
    }
  }, 100);

  const timeout = setTimeout(() => {
    clearInterval(checkInterval);
    reject(new Error('Axis SDK failed to load within timeout'));
  }, SDK_TIMEOUT);
});

/**
 * Generate signed license XML using Axis SDK
 *
 * @param {string} deviceId - Camera MAC address (12 hex chars, no colons)
 * @param {string} licenseKey - Anava license key
 * @returns {Promise<string>} Signed license XML
 */
async function generateLicenseXML(deviceId, licenseKey) {
  // Ensure SDK is loaded
  if (!sdkReady) {
    await waitForSDK;
  }

  console.log('[License Worker] Generating license for device:', deviceId);

  return new Promise((resolve, reject) => {
    try {
      // Axis ACAP Application ID for Anava
      const applicationId = '415129';

      console.log('[License Worker] Calling ACAP.registerLicenseKey');

      // Axis SDK uses callback pattern, not promises
      window.ACAP.registerLicenseKey(
        {
          applicationId: applicationId,
          deviceId: deviceId,
          licenseCode: licenseKey
        },
        (result) => {
          console.log('[License Worker] Received result:', result);

          if (result.data && result.data.licenseKey && result.data.licenseKey.xml) {
            const xml = result.data.licenseKey.xml;
            console.log('[License Worker] License XML generated, length:', xml.length);
            resolve(xml);
          } else if (result.error) {
            console.error('[License Worker] Axis SDK error:', result.error);
            reject(new Error(`Axis SDK error: ${result.error.message || result.error.errorId}`));
          } else {
            console.error('[License Worker] Unexpected response format:', result);
            reject(new Error('Unexpected response format from Axis SDK'));
          }
        }
      );
    } catch (error) {
      console.error('[License Worker] Exception calling SDK:', error);
      reject(error);
    }
  });
}

/**
 * Message handler for license generation requests
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[License Worker] Received message:', message);
  console.log('[License Worker] Message command:', message?.command);
  console.log('[License Worker] Sender:', sender);

  // Handle ping requests (used to check if worker is ready)
  if (message && message.command === 'ping_license_worker') {
    console.log('[License Worker] Responding to ping with ready status:', sdkReady);
    sendResponse({ ready: sdkReady });
    return false; // Synchronous response
  }

  if (message && message.command === 'generate_license') {
    console.log('[License Worker] Processing license generation request');
    const { deviceId, licenseKey } = message.payload || {};

    if (!deviceId || !licenseKey) {
      console.error('[License Worker] Missing deviceId or licenseKey');
      sendResponse({ success: false, error: 'Missing deviceId or licenseKey' });
      return false;
    }

    generateLicenseXML(deviceId, licenseKey)
      .then(licenseXML => {
        console.log('[License Worker] Successfully generated license XML');
        sendResponse({ success: true, licenseXML });
      })
      .catch(error => {
        console.error('[License Worker] Error generating license:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }

  // Don't handle other messages
  return false;
});

// Notify that worker is ready
waitForSDK
  .then(() => {
    console.log('[License Worker] Ready to generate licenses');
  })
  .catch(error => {
    console.error('[License Worker] Initialization failed:', error);
  });
