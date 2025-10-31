/**
 * Example: Web App Connector for Anava Local Connector Extension
 *
 * This demonstrates how a terraform-spa web application can integrate
 * with the Anava Local Connector Chrome extension for camera deployment.
 *
 * Usage in your web app:
 * ```typescript
 * import { ExtensionConnector } from './web-app-connector';
 *
 * const connector = new ExtensionConnector('YOUR_EXTENSION_ID');
 *
 * // Initialize connection
 * await connector.connectToExtension({
 *   backendUrl: 'https://api.example.com',
 *   projectId: 'my-project-123'
 * });
 *
 * // Scan network for cameras
 * const cameras = await connector.scanNetwork({
 *   subnet: '192.168.1.0/24',
 *   credentials: { username: 'admin', password: 'password' }
 * });
 *
 * // Deploy ACAP to camera
 * await connector.deployAcap({
 *   cameraIp: '192.168.1.100',
 *   credentials: { username: 'admin', password: 'password' },
 *   config: { ... }
 * });
 * ```
 */

export interface ExtensionConfig {
  backendUrl: string;
  projectId: string;
}

export interface ScanNetworkParams {
  subnet: string;
  credentials: {
    username: string;
    password: string;
  };
}

export interface DeployAcapParams {
  cameraIp: string;
  credentials: {
    username: string;
    password: string;
  };
  config: {
    licenseKey: string;
    customerId: string;
    firebaseConfig: any;
    geminiConfig: any;
  };
}

export class ExtensionConnector {
  private extensionId: string;
  private connected: boolean = false;

  constructor(extensionId: string) {
    this.extensionId = extensionId;
  }

  /**
   * Connect to the extension and initialize authentication
   *
   * This method:
   * 1. Generates a secure nonce
   * 2. Stores the nonce in your backend (for verification)
   * 3. Sends nonce to extension
   * 4. Extension forwards nonce to native host
   * 5. Native host authenticates with backend using nonce
   * 6. Backend verifies nonce and issues session token
   */
  async connectToExtension(config: ExtensionConfig): Promise<void> {
    console.log('[ExtensionConnector] Connecting to extension:', this.extensionId);

    // Step 1: Generate secure nonce
    const nonce = this.generateNonce();
    console.log('[ExtensionConnector] Generated nonce');

    // Step 2: Store nonce in backend (for verification)
    await this.storeNonce(config.backendUrl, config.projectId, nonce);
    console.log('[ExtensionConnector] Nonce stored in backend');

    // Step 3: Send INITIALIZE_CONNECTION message to extension
    const response = await this.sendMessage({
      command: 'INITIALIZE_CONNECTION',
      payload: {
        backendUrl: config.backendUrl,
        projectId: config.projectId,
        nonce: nonce
      }
    });

    if (!response.success) {
      throw new Error(`Failed to initialize connection: ${response.error}`);
    }

    this.connected = true;
    console.log('[ExtensionConnector] Connected successfully');
  }

  /**
   * Check if extension is installed and responding
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.sendMessage({
        command: 'health_check'
      });
      return response.success;
    } catch (error) {
      console.error('[ExtensionConnector] Health check failed:', error);
      return false;
    }
  }

  /**
   * Scan network for cameras
   */
  async scanNetwork(params: ScanNetworkParams): Promise<any[]> {
    this.ensureConnected();

    const response = await this.sendMessage({
      command: 'scan_network',
      payload: params
    });

    if (!response.success) {
      throw new Error(`Network scan failed: ${response.error}`);
    }

    return response.data.cameras || [];
  }

  /**
   * Deploy ACAP to a camera
   */
  async deployAcap(params: DeployAcapParams): Promise<any> {
    this.ensureConnected();

    const response = await this.sendMessage({
      command: 'deploy_acap',
      payload: params
    });

    if (!response.success) {
      throw new Error(`ACAP deployment failed: ${response.error}`);
    }

    return response.data;
  }

  /**
   * Get firmware info for a camera
   */
  async getFirmwareInfo(cameraIp: string, credentials: any): Promise<any> {
    this.ensureConnected();

    const response = await this.sendMessage({
      command: 'get_firmware_info',
      payload: { cameraIp, credentials }
    });

    if (!response.success) {
      throw new Error(`Failed to get firmware info: ${response.error}`);
    }

    return response.data;
  }

  /**
   * Send message to extension via chrome.runtime.sendMessage
   *
   * NOTE: This only works from domains whitelisted in the extension's
   * manifest.json "externally_connectable" section
   */
  private async sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        reject(new Error('Chrome extension API not available. Are you running in a browser with the extension installed?'));
        return;
      }

      chrome.runtime.sendMessage(
        this.extensionId,
        message,
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            reject(new Error('No response from extension'));
            return;
          }

          resolve(response);
        }
      );
    });
  }

  /**
   * Generate cryptographically secure nonce
   * Returns base64-encoded 32-byte random value
   */
  private generateNonce(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }

  /**
   * Store nonce in backend for verification
   *
   * Your backend should:
   * 1. Store the nonce with projectId and timestamp
   * 2. Mark it as unused
   * 3. Set expiration (e.g., 5 minutes)
   *
   * When native host authenticates with the nonce:
   * 1. Verify nonce exists and hasn't been used
   * 2. Verify it hasn't expired
   * 3. Mark as used (prevent replay attacks)
   * 4. Issue session token
   */
  private async storeNonce(backendUrl: string, projectId: string, nonce: string): Promise<void> {
    const response = await fetch(`${backendUrl}/api/extension/store-nonce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectId,
        nonce,
        timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to store nonce: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`Failed to store nonce: ${result.error}`);
    }
  }

  /**
   * Ensure connection is initialized before making requests
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected. Call connectToExtension() first.');
    }
  }
}

/**
 * Example backend endpoint implementations (Express.js)
 *
 * Place these in your backend API:
 */

/*
// Store nonce endpoint
app.post('/api/extension/store-nonce', async (req, res) => {
  const { projectId, nonce, timestamp } = req.body;

  // Store in database with 5-minute expiration
  await db.nonces.create({
    projectId,
    nonce,
    timestamp,
    used: false,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  });

  res.json({ success: true });
});

// Authenticate with nonce endpoint
app.post('/api/extension/authenticate', async (req, res) => {
  const nonce = req.headers['x-companion-nonce'];
  const projectId = req.headers['x-project-id'];

  // Verify nonce
  const nonceRecord = await db.nonces.findOne({ projectId, nonce });

  if (!nonceRecord) {
    return res.status(401).json({ success: false, error: 'Invalid nonce' });
  }

  if (nonceRecord.used) {
    return res.status(401).json({ success: false, error: 'Nonce already used' });
  }

  if (new Date() > nonceRecord.expiresAt) {
    return res.status(401).json({ success: false, error: 'Nonce expired' });
  }

  // Mark nonce as used (prevent replay attacks)
  await db.nonces.update({ _id: nonceRecord._id }, { used: true });

  // Generate session token
  const sessionToken = generateSecureToken(); // Your implementation

  // Store session
  await db.sessions.create({
    projectId,
    sessionToken,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  });

  res.json({
    success: true,
    sessionToken
  });
});
*/
