/**
 * ACAP Deployment Service
 *
 * PORTED FROM: /Users/ryanwager/anava-infrastructure-deployer/src/main/services/camera/
 * - acapDeploymentService.ts
 * - cameraConfigurationService.ts
 *
 * Handles complete ACAP deployment flow:
 * 1. Fetch manifest from GCS
 * 2. Select correct ACAP variant (OS + arch)
 * 3. Download ACAP from GCS
 * 4. Upload to camera
 * 5. Activate license
 * 6. Push config
 * 7. Start application
 */

import { Camera } from '../types/Camera.js';
import { authenticateCamera } from './CameraAuthentication.js';

/**
 * ACAP Manifest structure from GCS
 */
export interface AcapManifest {
  version: string;
  appName: string;
  releaseDate: string;
  files: AcapFile[];
}

export interface AcapFile {
  name: string;
  os: 'OS11' | 'OS12';
  architecture: 'armv7hf' | 'aarch64';
  url: string;
  size: number;
  checksum: string;
}

/**
 * Deployment configuration
 */
export interface DeploymentConfig {
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    databaseId: string;
  };
  geminiConfig: {
    vertexApiGatewayUrl: string;
    vertexApiGatewayKey: string;
    vertexGcpProjectId: string;
    vertexGcpRegion: string;
    vertexGcsBucketName: string;
  };
  anavaKey: string;
  customerId: string;
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  success: boolean;
  cameraId: string;
  ip: string;
  message: string;
  error?: string;
  stage?: string;
}

/**
 * Deployment progress callback
 */
export type ProgressCallback = (stage: string, percent: number) => void;

/**
 * ACAP Deployment Service
 */
export class AcapDeploymentService {
  private manifestUrl = 'https://storage.googleapis.com/anava-acaps/latest.json';

  /**
   * Fetch available ACAP variants from GCS
   */
  async getAvailableAcaps(): Promise<AcapManifest> {
    try {
      console.log('[AcapDeploy] Fetching manifest from GCS...');
      const response = await fetch(this.manifestUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
      }

      const manifest: AcapManifest = await response.json();
      console.log('[AcapDeploy] Manifest fetched:', manifest);

      return manifest;
    } catch (error: any) {
      console.error('[AcapDeploy] Error fetching manifest:', error);
      throw new Error(`Failed to fetch ACAP manifest: ${error.message}`);
    }
  }

  /**
   * Select correct ACAP variant based on camera OS and architecture
   */
  async selectAcap(camera: Camera, manifest: AcapManifest): Promise<AcapFile> {
    try {
      console.log('[AcapDeploy] Selecting ACAP variant for camera:', camera.ip);

      // Get firmware version and architecture
      const firmwareInfo = await this.getFirmwareInfo(camera);
      console.log('[AcapDeploy] Firmware info:', firmwareInfo);

      // Find matching ACAP file
      const acapFile = manifest.files.find(file =>
        file.os === firmwareInfo.os &&
        file.architecture === firmwareInfo.architecture
      );

      if (!acapFile) {
        throw new Error(
          `No ACAP variant found for ${firmwareInfo.os} / ${firmwareInfo.architecture}`
        );
      }

      console.log('[AcapDeploy] Selected ACAP:', acapFile.name);
      return acapFile;
    } catch (error: any) {
      console.error('[AcapDeploy] Error selecting ACAP:', error);
      throw new Error(`Failed to select ACAP variant: ${error.message}`);
    }
  }

  /**
   * Get firmware info (OS version and architecture)
   */
  private async getFirmwareInfo(camera: Camera): Promise<{
    os: 'OS11' | 'OS12';
    architecture: 'armv7hf' | 'aarch64';
  }> {
    const credentials = camera.credentials;
    if (!credentials) {
      throw new Error('Camera credentials are required');
    }

    // Get firmware version
    const firmwareVersion = await this.getFirmwareVersion(camera);
    const os = this.isOS12Firmware(firmwareVersion) ? 'OS12' : 'OS11';

    // Get architecture
    const architecture = await this.getArchitecture(camera);

    return { os, architecture };
  }

  /**
   * Get firmware version from camera
   */
  private async getFirmwareVersion(camera: Camera): Promise<string> {
    try {
      const url = `${camera.protocol}://${camera.ip}:${camera.port}/axis-cgi/param.cgi?action=list&group=Properties.Firmware.Version`;
      const authHeader = 'Basic ' + btoa(`${camera.credentials!.username}:${camera.credentials!.password}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        headers: { 'Authorization': authHeader },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.text();
      const versionMatch = data.match(/Properties\.Firmware\.Version=([^\r\n]+)/);

      if (versionMatch) {
        return versionMatch[1].trim();
      }

      throw new Error('Firmware version not found in response');
    } catch (error: any) {
      console.error('[AcapDeploy] Error getting firmware version:', error);
      throw new Error(`Failed to get firmware version: ${error.message}`);
    }
  }

  /**
   * Check if firmware is OS12 (12.x)
   */
  private isOS12Firmware(version: string): boolean {
    const majorVersion = parseInt(version.split('.')[0]);
    return majorVersion >= 12;
  }

  /**
   * Get camera architecture (armv7hf or aarch64)
   */
  private async getArchitecture(camera: Camera): Promise<'armv7hf' | 'aarch64'> {
    try {
      // Try Method 1: Direct architecture property
      const archUrl = `${camera.protocol}://${camera.ip}:${camera.port}/axis-cgi/param.cgi?action=list&group=Properties.System.Architecture`;
      const authHeader = 'Basic ' + btoa(`${camera.credentials!.username}:${camera.credentials!.password}`);

      const response = await fetch(archUrl, {
        headers: { 'Authorization': authHeader }
      });

      if (response.ok) {
        const data = await response.text();
        const archMatch = data.match(/Properties\.System\.Architecture=([^\r\n]+)/);

        if (archMatch) {
          const arch = archMatch[1].toLowerCase().trim();
          return this.normalizeArchitecture(arch);
        }
      }

      // Try Method 2: Infer from SOC
      const socUrl = `${camera.protocol}://${camera.ip}:${camera.port}/axis-cgi/param.cgi?action=list&group=Properties.System`;
      const socResponse = await fetch(socUrl, {
        headers: { 'Authorization': authHeader }
      });

      if (socResponse.ok) {
        const data = await socResponse.text();
        const socMatch = data.match(/Properties\.System\.Soc=([^\r\n]+)/);

        if (socMatch) {
          const soc = socMatch[1].toUpperCase();
          console.log('[AcapDeploy] SOC detected:', soc);

          // SOC-based inference
          if (soc.includes('CV25') || soc.includes('CV52') || soc.includes('CV') ||
              soc.includes('ARTPEC-8') || soc.includes('ARTPEC8') ||
              soc.includes('AMBARELLA') || soc.includes('S5L')) {
            return 'aarch64';
          }

          if (soc.includes('ARTPEC-7') || soc.includes('ARTPEC7') ||
              soc.includes('ARTPEC-6') || soc.includes('ARTPEC6') ||
              soc.includes('HI3516') || soc.includes('HI3519')) {
            return 'armv7hf';
          }
        }
      }

      // Default to aarch64 for newer cameras
      console.warn('[AcapDeploy] Could not detect architecture, defaulting to aarch64');
      return 'aarch64';
    } catch (error: any) {
      console.warn('[AcapDeploy] Error detecting architecture, defaulting to aarch64:', error);
      return 'aarch64';
    }
  }

  /**
   * Normalize architecture name
   */
  private normalizeArchitecture(arch: string): 'armv7hf' | 'aarch64' {
    arch = arch.toLowerCase().trim();

    if (arch.includes('aarch64') || arch.includes('arm64') || arch === 'arm' || arch.includes('a64')) {
      return 'aarch64';
    }

    if (arch.includes('armv7') || arch.includes('arm7') || arch.includes('v7')) {
      return 'armv7hf';
    }

    return 'aarch64'; // Default
  }

  /**
   * Download ACAP from GCS with progress tracking
   */
  async downloadAcap(
    url: string,
    onProgress: (percent: number) => void
  ): Promise<Blob> {
    try {
      console.log('[AcapDeploy] Downloading ACAP from:', url);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body!.getReader();
      const contentLength = parseInt(response.headers.get('Content-Length') || '0');

      if (!contentLength) {
        throw new Error('Content-Length header missing');
      }

      let receivedLength = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const percent = (receivedLength / contentLength) * 100;
        onProgress(percent);
      }

      console.log('[AcapDeploy] Download complete:', receivedLength, 'bytes');

      // Cast to BlobPart[] for type compatibility
      return new Blob(chunks as BlobPart[]);
    } catch (error: any) {
      console.error('[AcapDeploy] Error downloading ACAP:', error);
      throw new Error(`Failed to download ACAP: ${error.message}`);
    }
  }

  /**
   * Upload ACAP to camera with progress tracking
   * Uses XMLHttpRequest to support upload progress (fetch doesn't support it)
   */
  async uploadAcap(
    camera: Camera,
    acapBlob: Blob,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[AcapDeploy] Uploading ACAP to camera:', camera.ip);

        const formData = new FormData();
        formData.append('file', acapBlob, 'app.eap');

        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            onProgress(percent);
          }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 204) {
            console.log('[AcapDeploy] Upload complete');
            resolve();
          } else {
            reject(new Error(`Upload failed: HTTP ${xhr.status}`));
          }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed: Network error'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload aborted'));
        });

        // Open connection
        const url = `${camera.protocol}://${camera.ip}:${camera.port}/axis-cgi/applications/upload.cgi`;
        xhr.open('POST', url);

        // Add authentication
        if (camera.credentials) {
          const auth = btoa(`${camera.credentials.username}:${camera.credentials.password}`);
          xhr.setRequestHeader('Authorization', `Basic ${auth}`);
        }

        // Send request
        xhr.send(formData);
      } catch (error: any) {
        reject(error);
      }
    });
  }

  /**
   * Activate license on camera
   *
   * PORTED FROM: cameraConfigurationService.ts activateLicenseKey
   */
  async activateLicense(
    camera: Camera,
    licenseKey: string,
    appName: string
  ): Promise<void> {
    try {
      console.log('[AcapDeploy] Activating license for app:', appName);

      // Build license activation XML
      const licenseXml = this.buildLicenseXml(licenseKey, camera.deviceId || '');

      // POST to license endpoint
      const url = `${camera.protocol}://${camera.ip}:${camera.port}/local/${appName}/license.cgi`;
      const authHeader = 'Basic ' + btoa(`${camera.credentials!.username}:${camera.credentials!.password}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: licenseXml,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.text();
      console.log('[AcapDeploy] License activation response:', result);

      // Parse result for error codes
      const errorMatch = result.match(/error\s*=\s*(\d+)/i);
      if (errorMatch) {
        const errorCode = parseInt(errorMatch[1]);

        // Error 0 or 30 = SUCCESS (30 = already licensed)
        if (errorCode !== 0 && errorCode !== 30) {
          const errorMsg = this.getLicenseErrorMessage(errorCode);
          throw new Error(`License activation failed: ${errorMsg} (code ${errorCode})`);
        }
      }

      console.log('[AcapDeploy] License activated successfully');
    } catch (error: any) {
      console.error('[AcapDeploy] Error activating license:', error);
      throw new Error(`Failed to activate license: ${error.message}`);
    }
  }

  /**
   * Build license activation XML
   */
  private buildLicenseXml(licenseKey: string, deviceId: string): string {
    return `licensekey=${encodeURIComponent(licenseKey)}&deviceid=${encodeURIComponent(deviceId)}`;
  }

  /**
   * Get human-readable license error message
   */
  private getLicenseErrorMessage(errorCode: number): string {
    const errorMessages: { [key: number]: string } = {
      0: 'Success',
      1: 'Invalid license key',
      2: 'License already used on another device',
      30: 'Already licensed',
      31: 'License expired',
      32: 'License not valid for this product'
    };

    return errorMessages[errorCode] || 'Unknown error';
  }

  /**
   * Push camera configuration (SystemConfig)
   *
   * PORTED FROM: cameraConfigurationService.ts pushCameraSettings
   */
  async pushConfig(
    camera: Camera,
    config: DeploymentConfig,
    appName: string
  ): Promise<void> {
    try {
      console.log('[AcapDeploy] Pushing configuration...');

      const systemConfig = {
        firebase: config.firebaseConfig,
        gemini: config.geminiConfig,
        anavaKey: config.anavaKey,
        customerId: config.customerId
      };

      const url = `${camera.protocol}://${camera.ip}:${camera.port}/local/${appName}/baton_analytic.cgi?command=setInstallerConfig`;
      const authHeader = 'Basic ' + btoa(`${camera.credentials!.username}:${camera.credentials!.password}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(systemConfig),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('[AcapDeploy] Configuration pushed successfully');
    } catch (error: any) {
      console.error('[AcapDeploy] Error pushing config:', error);
      throw new Error(`Failed to push configuration: ${error.message}`);
    }
  }

  /**
   * Start ACAP application
   */
  async startAcap(camera: Camera, appName: string): Promise<void> {
    try {
      console.log('[AcapDeploy] Starting application:', appName);

      const url = `${camera.protocol}://${camera.ip}:${camera.port}/axis-cgi/applications/control.cgi?action=start&package=${appName}`;
      const authHeader = 'Basic ' + btoa(`${camera.credentials!.username}:${camera.credentials!.password}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.text();
      console.log('[AcapDeploy] Start application response:', result);

      // Check for OK status
      if (!result.includes('OK')) {
        throw new Error('Application start did not return OK status');
      }

      console.log('[AcapDeploy] Application started successfully');
    } catch (error: any) {
      console.error('[AcapDeploy] Error starting application:', error);
      throw new Error(`Failed to start application: ${error.message}`);
    }
  }

  /**
   * Complete deployment flow
   * Orchestrates all steps: download → upload → license → config → start
   */
  async deployCameraComplete(
    camera: Camera,
    licenseKey: string,
    config: DeploymentConfig,
    onProgress: ProgressCallback
  ): Promise<DeploymentResult> {
    try {
      console.log('[AcapDeploy] Starting complete deployment for:', camera.ip);

      // Stage 1: Fetch manifest (5%)
      onProgress('Fetching ACAP variants', 5);
      const manifest = await this.getAvailableAcaps();

      // Stage 2: Select ACAP (10%)
      onProgress('Selecting ACAP variant', 10);
      const acapFile = await this.selectAcap(camera, manifest);

      // Stage 3: Download ACAP (15-40%)
      onProgress('Downloading ACAP', 15);
      const acapBlob = await this.downloadAcap(acapFile.url, (downloadPercent) => {
        const stagePercent = 15 + (downloadPercent * 0.25); // 15% → 40%
        onProgress('Downloading ACAP', stagePercent);
      });

      // Stage 4: Upload to camera (40-70%)
      onProgress('Uploading to camera', 40);
      await this.uploadAcap(camera, acapBlob, (uploadPercent) => {
        const stagePercent = 40 + (uploadPercent * 0.30); // 40% → 70%
        onProgress('Uploading to camera', stagePercent);
      });

      // Stage 5: Activate license (70-80%)
      onProgress('Activating license', 70);
      await this.activateLicense(camera, licenseKey, manifest.appName);

      // Stage 6: Push configuration (80-90%)
      onProgress('Pushing configuration', 80);
      await this.pushConfig(camera, config, manifest.appName);

      // Stage 7: Start application (90-100%)
      onProgress('Starting application', 90);
      await this.startAcap(camera, manifest.appName);

      onProgress('Complete', 100);

      console.log('[AcapDeploy] Deployment complete:', camera.ip);

      return {
        success: true,
        cameraId: camera.id,
        ip: camera.ip,
        message: 'Deployment successful'
      };
    } catch (error: any) {
      console.error('[AcapDeploy] Deployment failed:', error);

      return {
        success: false,
        cameraId: camera.id,
        ip: camera.ip,
        message: 'Deployment failed',
        error: error.message
      };
    }
  }
}
