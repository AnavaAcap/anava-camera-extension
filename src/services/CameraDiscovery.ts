/**
 * Camera Discovery Service
 *
 * PORTED FROM: /src/main/services/camera/cameraDiscoveryService.ts
 *
 * Uses TCP port scanning + VAPIX endpoint validation (NOT mDNS!)
 * This is the proven method from the legacy Electron installer.
 */

import { Camera } from '../types/Camera.js';
import { authenticateCamera } from './CameraAuthentication.js';
import { AdaptiveScanner, ScanMetrics } from './AdaptiveScanConfig.js';

export interface NetworkRange {
  interface: string;
  address: string;
  netmask: string;
  network: string;
}

export interface ScanProgress {
  ip: string;
  status: 'scanning' | 'checking' | 'found';
  details?: string;
}

export class CameraDiscoveryService {
  private adaptiveScanner: AdaptiveScanner | null = null;
  private onProgress?: (progress: ScanProgress) => void;

  /**
   * DEBUG: Test a specific IP directly (bypasses network scan)
   */
  async debugTestSpecificIP(
    ip: string,
    username: string,
    password: string
  ): Promise<Camera | null> {
    console.log(`\n${'#'.repeat(80)}`);
    console.log(`🔧 DEBUG: Testing specific IP directly`);
    console.log(`🔧 IP: ${ip}`);
    console.log(`🔧 Username: ${username}`);
    console.log(`🔧 Password: ${password}`);
    console.log(`${'#'.repeat(80)}\n`);

    const result = await this.checkForCamera(ip, username, password);

    console.log(`\n${'#'.repeat(80)}`);
    if (result) {
      console.log(`🔧 DEBUG RESULT: Camera found!`, result);
    } else {
      console.log(`🔧 DEBUG RESULT: No camera found (returned null)`);
    }
    console.log(`${'#'.repeat(80)}\n`);

    return result;
  }

  /**
   * Quick scan a specific camera IP
   *
   * PORTED FROM: cameraDiscoveryService.ts:84-118
   */
  async quickScanSpecificCamera(
    ip: string,
    username: string,
    password: string,
    port?: number
  ): Promise<Camera[]> {
    try {
      console.log(`=== Quick scanning camera at ${ip} with credentials ===`);

      // If port is specified, use it directly
      if (port) {
        console.log(`Checking camera at ${ip}:${port}...`);
        const camera = await this.checkAxisCamera(ip, username, password, port);
        if (camera) {
          console.log(`✅ Found camera at ${ip}:${port}:`, camera);
          return [camera];
        }
        return [];
      }

      // No port specified - HTTPS:443 ONLY (Chrome security requirements)
      console.log(`Trying HTTPS:443 (HTTPS-only mode for browser security)...`);
      try {
        const httpsCamera = await this.checkAxisCamera(ip, username, password, 443);
        if (httpsCamera) {
          console.log(`✅ Found camera at ${ip}:443 (HTTPS)`);
          return [httpsCamera];
        }
      } catch (httpsError: any) {
        console.log(`HTTPS:443 failed: ${httpsError.message}`);
      }

      // HTTPS-only mode for browser security (Chrome blocks HTTP)
      console.log(`❌ No camera found at ${ip} - HTTPS:443 required for browser extension`);
      return [];
    } catch (error) {
      console.error(`❌ Error quick scanning camera at ${ip}:`, error);
      return [];
    }
  }

  /**
   * Scan entire network range for cameras
   *
   * PORTED FROM: cameraDiscoveryService.ts:153-209
   */
  async scanNetworkForCameras(
    networkRange: string,
    username: string,
    password: string,
    options?: {
      onProgress?: (progress: ScanProgress) => void;
      intensity?: 'conservative' | 'balanced' | 'aggressive';
    }
  ): Promise<Camera[]> {
    try {
      this.onProgress = options?.onProgress;

      console.log('=== Starting network scan ===');
      console.log('Network range:', networkRange);
      console.log('Credentials:', username, ':******');

      const cameras: Camera[] = [];

      // Parse network range (e.g., "192.168.50.0/24")
      const [baseIp, subnetStr] = networkRange.split('/');
      const subnet = parseInt(subnetStr);

      console.log(`Scanning network: ${networkRange}`);

      // Scan the network
      const networkCameras = await this.scanNetwork(baseIp, subnet, username, password, options?.intensity);
      cameras.push(...networkCameras);

      console.log(`\n=== Scan complete. Total cameras found: ${cameras.length} ===`);
      return cameras;
    } catch (error) {
      console.error('Error scanning for cameras:', error);
      throw error;
    }
  }

  /**
   * Scan a specific network range
   *
   * PORTED FROM: cameraDiscoveryService.ts:211-354
   */
  private async scanNetwork(
    baseIp: string,
    subnet: number,
    username: string,
    password: string,
    intensity?: 'conservative' | 'balanced' | 'aggressive'
  ): Promise<Camera[]> {
    const cameras: Camera[] = [];

    // Initialize adaptive scanner
    if (!this.adaptiveScanner) {
      const isLAN = AdaptiveScanner.detectNetworkType(`${baseIp}/${subnet}`);
      const scanPreferences = AdaptiveScanner.getPresetConfig(intensity || 'balanced');

      this.adaptiveScanner = new AdaptiveScanner({
        isLAN,
        ...scanPreferences
      });
      console.log(`Initialized adaptive scanner for ${isLAN ? 'LAN' : 'WAN'} network with intensity: ${intensity || 'balanced'}`);
    }

    // Calculate IP range
    const ipRange = this.calculateIPRange(baseIp, subnet);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 STARTING NETWORK SCAN`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Network: ${baseIp}/${subnet}`);
    console.log(`IP Range: ${ipRange.start} - ${ipRange.end}`);
    console.log(`Start Num: ${ipRange.startNum} (${this.numberToIP(ipRange.startNum)})`);
    console.log(`End Num: ${ipRange.endNum} (${this.numberToIP(ipRange.endNum)})`);
    console.log(`Total IPs: ${ipRange.endNum - ipRange.startNum + 1}`);
    console.log(`Batch size: ${this.adaptiveScanner.getBatchSize()}`);
    console.log(`Target IP: 192.168.50.156 = ${this.ipToNumber('192.168.50.156')}`);
    console.log(`${'='.repeat(80)}\n`);

    // Send initial progress
    this.sendProgress({ ip: `${baseIp}/${subnet}`, status: 'scanning' });

    // Create all scan tasks
    const scanTasks: Array<{ ip: string; promise: () => Promise<Camera | null> }> = [];

    console.log('📋 Building scan task list...');
    for (let i = ipRange.startNum; i <= ipRange.endNum; i++) {
      const ip = this.numberToIP(i);

      // CRITICAL: Log when we encounter .156
      if (ip === '192.168.50.156') {
        console.log(`\n${'!'.repeat(80)}`);
        console.log(`🎯 TARGET IP FOUND IN RANGE: ${ip} (index ${i})`);
        console.log(`${'!'.repeat(80)}\n`);
      }

      scanTasks.push({
        ip,
        promise: () => this.checkForCamera(ip, username, password)
      });
    }

    console.log(`✅ Created ${scanTasks.length} scan tasks`);
    console.log(`First IP: ${scanTasks[0]?.ip}`);
    console.log(`Last IP: ${scanTasks[scanTasks.length - 1]?.ip}`);

    // Verify .156 is in the task list
    const task156 = scanTasks.find(t => t.ip === '192.168.50.156');
    if (task156) {
      console.log(`✅ TARGET IP 192.168.50.156 IS IN TASK LIST`);
    } else {
      console.log(`❌ TARGET IP 192.168.50.156 IS NOT IN TASK LIST - THIS IS THE BUG!`);
    }
    console.log('');

    // Process in adaptive batches
    let scannedCount = 0;
    const totalIPs = scanTasks.length;

    for (let i = 0; i < scanTasks.length; ) {
      const batchSize = this.adaptiveScanner!.getBatchSize();
      const batchEnd = Math.min(i + batchSize, scanTasks.length);
      const batchTasks = scanTasks.slice(i, batchEnd);

      const batchNum = Math.floor(i / batchSize) + 1;
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🔍 [Scanner] BATCH ${batchNum}: IPs ${batchTasks[0].ip} - ${batchTasks[batchTasks.length - 1].ip} (${batchTasks.length} IPs)`);
      console.log(`${'='.repeat(80)}`);

      // Check if .156 is in this batch
      const has156 = batchTasks.some(t => t.ip === '192.168.50.156');
      if (has156) {
        console.log(`\n${'!'.repeat(80)}`);
        console.log(`🎯 TARGET IP 192.168.50.156 IS IN THIS BATCH!`);
        console.log(`${'!'.repeat(80)}\n`);
      }

      // Track metrics
      let successCount = 0;
      let timeoutCount = 0;
      let errorCount = 0;
      const responseTimes: number[] = [];

      // Execute batch
      const batchPromises = batchTasks.map(task => {
        const taskStartTime = Date.now();
        const is156 = task.ip === '192.168.50.156';

        if (is156) {
          console.log(`\n🎯🎯🎯 STARTING CHECK FOR TARGET IP: ${task.ip} 🎯🎯🎯`);
        } else {
          console.log(`🔍 [Scanner] Starting check for ${task.ip}...`);
        }

        return task.promise()
          .then(result => {
            const responseTime = Date.now() - taskStartTime;
            responseTimes.push(responseTime);

            if (result) {
              successCount++;
              if (is156) {
                console.log(`\n🎯✅ TARGET IP ${task.ip} FOUND CAMERA in ${responseTime}ms! 🎯✅\n`);
              } else {
                console.log(`✅ [Scanner] ${task.ip} found camera in ${responseTime}ms`);
              }
              return result;
            }

            if (is156) {
              console.log(`\n🎯⚠️ TARGET IP ${task.ip} NO CAMERA FOUND in ${responseTime}ms 🎯⚠️\n`);
            } else {
              console.log(`⚠️ [Scanner] ${task.ip} no camera in ${responseTime}ms`);
            }
            return null;
          })
          .catch((error: any) => {
            const responseTime = Date.now() - taskStartTime;
            responseTimes.push(responseTime);

            if (error.name === 'AbortError' || error.message?.includes('timeout')) {
              timeoutCount++;
              if (is156) {
                console.log(`\n🎯⏱️ TARGET IP ${task.ip} TIMEOUT after ${responseTime}ms: ${error.message} 🎯⏱️\n`);
              } else {
                console.log(`⏱️ [Scanner] ${task.ip} timeout after ${responseTime}ms`);
              }
            } else {
              errorCount++;
              if (is156) {
                console.log(`\n🎯❌ TARGET IP ${task.ip} ERROR after ${responseTime}ms: ${error.message} 🎯❌\n`);
              } else {
                console.log(`❌ [Scanner] ${task.ip} error after ${responseTime}ms: ${error.message}`);
              }
            }
            return null;
          });
      });

      console.log(`🔍 [Scanner] Waiting for batch to complete...`);
      const batchStartTime = Date.now();
      const results = await Promise.allSettled(batchPromises);
      const batchDuration = Date.now() - batchStartTime;
      console.log(`✅ [Scanner] Batch completed in ${batchDuration}ms`);

      // Collect successful cameras
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          cameras.push(result.value);
        }
      }

      // Calculate metrics
      const avgResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      const metrics: ScanMetrics = {
        successCount,
        timeoutCount,
        errorCount,
        totalAttempts: batchTasks.length,
        avgResponseTime
      };

      // Adjust batch size
      this.adaptiveScanner!.adjustBatchSize(metrics);

      scannedCount += batchTasks.length;
      i = batchEnd;

      // Send progress update for EACH IP in the batch
      for (const task of batchTasks) {
        this.sendProgress({
          ip: `${task.ip} (${scannedCount}/${totalIPs})`,
          status: 'scanning',
          details: this.adaptiveScanner!.getPerformanceSummary()
        });
      }

      // Inter-batch delay
      const delay = this.adaptiveScanner!.getInterBatchDelay();
      if (delay > 0 && i < scanTasks.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log(`Scan complete. Found ${cameras.length} cameras.`);
    console.log(`Final performance: ${this.adaptiveScanner!.getPerformanceSummary()}`);

    return cameras;
  }

  /**
   * Check if a specific IP is a camera
   *
   * PORTED FROM: cameraDiscoveryService.ts:356-444
   */
  private async checkForCamera(
    ip: string,
    username: string,
    password: string
  ): Promise<Camera | null> {
    const is156 = ip === '192.168.50.156';

    try {
      if (is156) {
        console.log(`\n${'🎯'.repeat(40)}`);
        console.log(`🎯 checkForCamera CALLED FOR TARGET IP: ${ip}`);
        console.log(`🎯 Username: ${username}, Password: ${password}`);
        console.log(`${'🎯'.repeat(40)}\n`);
      } else {
        console.log(`  Checking ${ip} for camera...`);
      }

      this.sendProgress({ ip, status: 'checking' });

      // HTTPS-only mode for browser security (Chrome blocks HTTP)
      if (is156) {
        console.log(`🎯 Trying HTTPS:443 auth for TARGET IP ${ip}...`);
      } else {
        console.log(`  Trying HTTPS:443 auth for ${ip}...`);
      }

      try {
        const httpsCamera = await this.checkAxisCamera(ip, username, password, 443);
        if (httpsCamera) {
          if (is156) {
            console.log(`\n🎯✅ FOUND CAMERA AT TARGET IP ${ip} via HTTPS:443! 🎯✅\n`);
          } else {
            console.log(`  ✓ Found camera at ${ip} via HTTPS:443`);
          }
          return httpsCamera;
        } else {
          if (is156) {
            console.log(`\n🎯⚠️ TARGET IP ${ip} returned null (not a camera or auth failed) 🎯⚠️\n`);
          } else {
            console.log(`  ⚠️ ${ip} returned null (not a camera or auth failed)`);
          }
        }
      } catch (httpsError: any) {
        if (is156) {
          console.error(`\n🎯❌ HTTPS:443 exception for TARGET IP ${ip}:`, httpsError);
          console.error(`🎯❌ Error name: ${httpsError.name}`);
          console.error(`🎯❌ Error message: ${httpsError.message}`);
          console.error(`🎯❌ Error stack:`, httpsError.stack);
          console.error(`${'🎯'.repeat(40)}\n`);
        } else {
          console.error(`  ❌ HTTPS:443 exception for ${ip}:`, httpsError);
          console.error(`  ❌ Error details: ${httpsError.message}`, httpsError.stack);
        }
      }

      return null;
    } catch (error: any) {
      if (is156) {
        console.error(`\n🎯❌ Outer error checking TARGET IP ${ip}: ${error.message} 🎯❌\n`);
      } else {
        console.error(`  ❌ Error checking ${ip}: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Authenticate and validate an Axis camera
   *
   * PORTED FROM: cameraDiscoveryService.ts:446-491
   */
  private async checkAxisCamera(
    ip: string,
    username: string,
    password: string,
    port: number = 443
  ): Promise<Camera | null> {
    try {
      console.log(`=== Checking Axis camera at ${ip} with credentials ===`);

      const authResult = await authenticateCamera(ip, username, password, port);

      console.log(`🔍 Auth result for ${ip}:`, JSON.stringify(authResult, null, 2));

      if (authResult.success && authResult.accessible && authResult.deviceType === 'camera') {
        console.log(`  ✅ Confirmed Axis camera via authentication`);

        const camera: Camera = {
          id: `camera-${ip.replace(/\./g, '-')}`,
          ip: ip,
          port: authResult.port || port,
          protocol: authResult.protocol || 'https',
          type: 'Axis Camera',
          model: authResult.model || 'Unknown Model',
          manufacturer: authResult.manufacturer || 'Axis Communications',
          mac: null, // Can't get MAC from browser
          serialNumber: authResult.serialNumber,
          deviceId: authResult.deviceId,
          deviceType: authResult.deviceType,
          capabilities: ['HTTP', 'ACAP', 'VAPIX', 'RTSP'],
          discoveredAt: new Date().toISOString(),
          status: 'accessible',
          credentials: { username, password },
          rtspUrl: `rtsp://${username}:${password}@${ip}:554/axis-media/media.amp`,
          httpUrl: `${authResult.protocol}://${ip}:${authResult.port}`,
          authenticated: true,
          firmwareVersion: authResult.firmwareVersion,
          isSupported: authResult.isSupported,
          unsupportedReason: authResult.unsupportedReason
        };

        console.log('✅ Camera validated and created:', camera);
        return camera;
      } else if (authResult.deviceType === 'speaker') {
        console.log(`  ❌ Axis device is not a camera (speaker)`);
        return null;
      }

      console.log(`❌ Device at ${ip} is not an accessible Axis camera`);
      return null;
    } catch (error: any) {
      console.error(`❌ Error checking camera at ${ip}:`, error.message);
      return null;
    }
  }

  /**
   * TCP connection check using XMLHttpRequest (prevents browser auth popup)
   * Browser equivalent of Node.js net.Socket
   *
   * CRITICAL: Includes Basic auth header to prevent browser popup
   */
  private async checkTCPConnectionXHR(
    ip: string,
    port: number,
    username: string,
    password: string,
    timeout: number = 3000
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const protocol = port === 80 ? 'http' : 'https';
      const url = `${protocol}://${ip}:${port}/axis-cgi/param.cgi`;

      const xhr = new XMLHttpRequest();
      xhr.timeout = timeout;

      xhr.onload = function() {
        // Return the status code (200 = OK, 401 = auth required but device exists)
        resolve(xhr.status);
      };

      xhr.onerror = function() {
        reject(new Error('Connection failed'));
      };

      xhr.ontimeout = function() {
        reject(new Error('Connection timeout'));
      };

      try {
        xhr.open('HEAD', url, true);
        // CRITICAL: Send Basic auth header to prevent browser popup
        const authHeader = 'Basic ' + btoa(username + ':' + password);
        xhr.setRequestHeader('Authorization', authHeader);
        xhr.send();
      } catch (error: any) {
        reject(error);
      }
    });
  }

  /**
   * Calculate IP range from base IP and subnet mask
   */
  private calculateIPRange(baseIp: string, subnet: number): {
    start: string;
    end: string;
    startNum: number;
    endNum: number;
  } {
    const hostBits = 32 - subnet;
    const numHosts = Math.pow(2, hostBits);

    const startNum = this.ipToNumber(baseIp);
    const endNum = startNum + numHosts - 1;

    return {
      start: baseIp,
      end: this.numberToIP(endNum),
      startNum: startNum + 1, // Skip network address
      endNum: endNum - 1      // Skip broadcast address
    };
  }

  /**
   * Convert IP string to number
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((num, octet) => {
      return (num << 8) + parseInt(octet);
    }, 0) >>> 0;
  }

  /**
   * Convert number to IP string
   */
  private numberToIP(num: number): string {
    return [
      (num >>> 24) & 255,
      (num >>> 16) & 255,
      (num >>> 8) & 255,
      num & 255
    ].join('.');
  }

  /**
   * Send progress update
   */
  private sendProgress(progress: ScanProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }
}
