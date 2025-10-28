/**
 * Camera Authentication Service - Chrome Extension Edition with Native Messaging
 *
 * ARCHITECTURE:
 * 1. Try native messaging host (bypasses certificate issues)
 * 2. Fallback to background service worker (legacy method)
 *
 * CRITICAL: Native messaging host allows HTTPS with self-signed certs
 * - Solves NET::ERR_CERT_AUTHORITY_INVALID issues
 * - No browser auth popup
 * - Direct communication with cameras
 */

import { CameraAuthResult, getDeviceType } from '../types/Camera.js';

// Native messaging host configuration
const NATIVE_HOST_NAME = 'com.anava.camera_proxy';

interface NativeRequest {
  url: string;
  method: string;
  username: string;
  password: string;
  body?: any;
}

interface NativeResponse {
  status?: number;
  data?: any;
  error?: string;
}

/**
 * Check if native messaging host is available
 */
async function isNativeHostAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { url: 'https://httpbin.org/status/200', method: 'GET', username: 'test', password: 'test' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log(`ℹ️ [NativeHost] Not available: ${chrome.runtime.lastError.message}`);
            resolve(false);
          } else {
            console.log(`✅ [NativeHost] Available and responding`);
            resolve(true);
          }
        }
      );
    } catch (error) {
      console.log(`ℹ️ [NativeHost] Check failed:`, error);
      resolve(false);
    }
  });
}

/**
 * Make authenticated request via native messaging host
 */
async function makeNativeRequest(
  url: string,
  method: string,
  username: string,
  password: string,
  body?: any
): Promise<NativeResponse> {
  return new Promise((resolve, reject) => {
    const request: NativeRequest = {
      url,
      method,
      username,
      password,
      ...(body && { body })
    };

    const timeout = setTimeout(() => {
      reject(new Error('Native host timeout after 10 seconds'));
    }, 10000);

    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      request,
      (response: NativeResponse) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error('No response from native host'));
          return;
        }

        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        resolve(response);
      }
    );
  });
}

/**
 * Test camera authentication - Main entry point
 * Tries native messaging first, falls back to background worker
 */
export async function authenticateCamera(
  ip: string,
  username: string,
  password: string,
  port?: number
): Promise<CameraAuthResult> {
  console.log(`🔐 [CameraAuth] Testing authentication for ${ip}:${port || 'auto'}`);

  // Check if native host is available
  const hasNativeHost = await isNativeHostAvailable();
  console.log(`🔐 [CameraAuth] Native host available: ${hasNativeHost}`);

  // Determine ports to test
  const portsToTest = port ? [port] : [443, 80];

  for (const testPort of portsToTest) {
    const protocol = testPort === 80 ? 'http' : 'https';
    console.log(`🔐 [CameraAuth] Testing ${protocol.toUpperCase()} on port ${testPort}`);

    try {
      let result: CameraAuthResult;

      if (hasNativeHost) {
        // Try native messaging first
        console.log(`🔐 [CameraAuth] Using native messaging host...`);
        result = await testSinglePortAuthNative(ip, testPort, protocol, username, password);
      } else {
        // Fall back to background worker
        console.log(`🔐 [CameraAuth] Using background worker (native host not available)...`);
        result = await testSinglePortAuthBackground(ip, testPort, protocol, username, password);
      }

      if (result.success) {
        console.log(`✅ [CameraAuth] Authentication successful via ${protocol.toUpperCase()}:${testPort}`);
        return result;
      } else {
        console.log(`❌ [CameraAuth] Authentication failed on ${protocol.toUpperCase()}:${testPort}: ${result.reason}`);
      }
    } catch (error: any) {
      console.log(`💥 [CameraAuth] Error testing ${protocol.toUpperCase()}:${testPort}: ${error.message}`);
    }
  }

  return {
    success: false,
    accessible: false,
    authRequired: true,
    reason: 'Authentication failed on all tested ports',
    error: hasNativeHost
      ? 'Invalid username or password'
      : 'Native host not installed. Please run install.sh to enable HTTPS support.'
  };
}

/**
 * Test authentication via native messaging host
 */
async function testSinglePortAuthNative(
  ip: string,
  port: number,
  protocol: 'http' | 'https',
  username: string,
  password: string
): Promise<CameraAuthResult> {
  const url = `${protocol}://${ip}:${port}/axis-cgi/basicdeviceinfo.cgi`;
  console.log(`🔐 [CameraAuth] Testing URL via native host: ${url}`);

  const body = {
    apiVersion: '1.0',
    method: 'getProperties',
    params: {
      propertyList: ['Brand', 'ProdType', 'ProdNbr', 'ProdFullName', 'SerialNumber']
    }
  };

  try {
    const response = await makeNativeRequest(url, 'POST', username, password, body);
    console.log(`🔐 [CameraAuth] Native host response:`, response);

    if (response.status === 200 && response.data) {
      // Parse device info
      const deviceInfo = parseDeviceInfo(response.data);

      return {
        success: true,
        accessible: true,
        authRequired: true,
        authMethod: 'digest', // Native host handles both Basic and Digest
        protocol,
        port,
        ...deviceInfo
      };
    } else {
      return {
        success: false,
        accessible: false,
        authRequired: true,
        protocol,
        port,
        reason: `HTTP ${response.status}: ${response.error || 'Authentication failed'}`,
        error: response.error
      };
    }
  } catch (error: any) {
    console.error(`💥 [CameraAuth] Native host error:`, error);
    return {
      success: false,
      accessible: false,
      authRequired: false,
      protocol,
      port,
      reason: `Native host error: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Test authentication on a single port via background worker (legacy method)
 * Sends request to background service worker to avoid browser auth popup
 */
async function testSinglePortAuthBackground(
  ip: string,
  port: number,
  protocol: 'http' | 'https',
  username: string,
  password: string
): Promise<CameraAuthResult> {
  const url = `${protocol}://${ip}:${port}/axis-cgi/basicdeviceinfo.cgi`;
  console.log(`🔐 [CameraAuth] Testing URL via background worker: ${url}`);

  const body = {
    apiVersion: '1.0',
    method: 'getProperties',
    params: {
      propertyList: ['Brand', 'ProdType', 'ProdNbr', 'ProdFullName', 'SerialNumber']
    }
  };

  try {
    // CRITICAL: Wake up service worker first
    try {
      console.log(`🔐 [CameraAuth] Waking up service worker...`);
      await sendMessageWithTimeout({ type: 'PING' }, 2000);
      console.log(`🔐 [CameraAuth] Service worker is awake`);
    } catch (pingError) {
      console.error(`💥 [CameraAuth] Service worker wake-up failed:`, pingError);
      throw new Error('Background service worker not responding');
    }

    // Send auth request with aggressive 10-second timeout
    const response = await sendMessageWithTimeout({
      type: 'AXIS_AUTH_REQUEST',
      payload: {
        url,
        username,
        password,
        body
      }
    }, 10000);

    console.log(`🔐 [CameraAuth] Background worker response:`, response);

    if (response.success) {
      // Parse device info from background response
      const deviceInfo = parseDeviceInfo(response.data);

      return {
        success: true,
        accessible: true,
        authRequired: true,
        authMethod: 'digest',
        protocol,
        port,
        ...deviceInfo
      };
    } else {
      return {
        success: false,
        accessible: false,
        authRequired: true,
        protocol,
        port,
        reason: response.error || 'Authentication failed',
        error: response.error
      };
    }
  } catch (error: any) {
    console.error(`💥 [CameraAuth] Error communicating with background worker:`, error);
    return {
      success: false,
      accessible: false,
      authRequired: false,
      protocol,
      port,
      reason: `Background worker error: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Send message to background worker with timeout
 * Prevents infinite hangs when service worker is unresponsive
 */
function sendMessageWithTimeout(message: any, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Background worker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response) {
        reject(new Error('No response from background worker'));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Parse device info from API response
 */
function parseDeviceInfo(data: any): Partial<CameraAuthResult> {
  try {
    const props = data.data?.propertyList || {};

    const prodNbr = props.ProdNbr || 'Unknown';
    const deviceType = getDeviceType(prodNbr);

    return {
      deviceType,
      model: props.ProdFullName || props.ProdType || 'Unknown Model',
      manufacturer: props.Brand || 'Axis Communications',
      productType: props.ProdType,
      serialNumber: props.SerialNumber,
      deviceId: props.SerialNumber // Use serial number as device ID
    };
  } catch (error) {
    console.error('[CameraAuth] Error parsing device info:', error);
    return {
      deviceType: 'unknown',
      model: 'Unknown Model',
      manufacturer: 'Axis Communications'
    };
  }
}
