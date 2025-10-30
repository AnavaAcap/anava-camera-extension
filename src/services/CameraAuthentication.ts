/**
 * Camera Authentication Service - Chrome Extension Edition with Proxy Server
 *
 * ARCHITECTURE:
 * Uses localhost proxy server at port 9876 to handle camera authentication
 * - Proxy handles HTTPS with self-signed certs
 * - No browser auth popup
 * - Direct communication with cameras via proxy
 */

import { CameraAuthResult, getDeviceType } from '../types/Camera.js';

// Proxy server configuration
const PROXY_URL = 'http://127.0.0.1:9876/proxy';

interface ProxyRequest {
  url: string;
  method: string;
  username: string;
  password: string;
  body?: any;
}

interface ProxyResponse {
  status?: number;
  data?: any;
  error?: string;
}

/**
 * Check if proxy server is available
 */
async function isProxyAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:9876/health', {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });

    if (!response.ok) {
      console.log(`ℹ️ [Proxy] Health check failed: ${response.status}`);
      return false;
    }

    console.log(`✅ [Proxy] Server is healthy and responding`);
    return true;
  } catch (error: any) {
    console.log(`ℹ️ [Proxy] Not available: ${error.message}`);
    return false;
  }
}

/**
 * Make authenticated request via proxy server
 */
async function makeProxyRequest(
  url: string,
  method: string,
  username: string,
  password: string,
  body?: any
): Promise<ProxyResponse> {
  const request: ProxyRequest = {
    url,
    method,
    username,
    password,
    ...(body && { body })
  };

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy returned error ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error);
    }

    return result;
  } catch (error: any) {
    throw new Error(`Proxy request failed: ${error.message}`);
  }
}

/**
 * Test camera authentication - Main entry point
 * Uses proxy server for all camera communication
 */
export async function authenticateCamera(
  ip: string,
  username: string,
  password: string,
  port?: number
): Promise<CameraAuthResult> {
  console.log(`🔐 [CameraAuth] Testing authentication for ${ip}:${port || 'auto'}`);

  // Check if proxy server is available
  const hasProxy = await isProxyAvailable();
  console.log(`🔐 [CameraAuth] Proxy server available: ${hasProxy}`);

  if (!hasProxy) {
    return {
      success: false,
      accessible: false,
      authRequired: true,
      reason: 'Proxy server not available',
      error: 'Proxy server not running. Please run: ./install-proxy.sh'
    };
  }

  // Determine ports to test (HTTPS-only for browser security)
  const portsToTest = port ? [port] : [443];

  for (const testPort of portsToTest) {
    const protocol = testPort === 80 ? 'http' : 'https';
    console.log(`🔐 [CameraAuth] Testing ${protocol.toUpperCase()} on port ${testPort}`);

    try {
      const result = await testSinglePortAuthProxy(ip, testPort, protocol, username, password);

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
    error: 'Invalid username or password, or camera not accessible'
  };
}

/**
 * Test authentication via proxy server
 */
async function testSinglePortAuthProxy(
  ip: string,
  port: number,
  protocol: 'http' | 'https',
  username: string,
  password: string
): Promise<CameraAuthResult> {
  const url = `${protocol}://${ip}:${port}/axis-cgi/basicdeviceinfo.cgi`;
  console.log(`🔐 [CameraAuth] Testing URL via proxy: ${url}`);

  const body = {
    apiVersion: '1.0',
    method: 'getProperties',
    params: {
      propertyList: ['Brand', 'ProdType', 'ProdNbr', 'ProdFullName', 'SerialNumber']
    }
  };

  try {
    const response = await makeProxyRequest(url, 'POST', username, password, body);
    console.log(`🔐 [CameraAuth] Proxy response:`, response);

    if (response.status === 200 && response.data) {
      // Parse device info
      const deviceInfo = parseDeviceInfo(response.data);

      return {
        success: true,
        accessible: true,
        authRequired: true,
        authMethod: 'digest', // Proxy handles both Basic and Digest
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
    console.error(`💥 [CameraAuth] Proxy error:`, error);
    return {
      success: false,
      accessible: false,
      authRequired: false,
      protocol,
      port,
      reason: `Proxy error: ${error.message}`,
      error: error.message
    };
  }
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
