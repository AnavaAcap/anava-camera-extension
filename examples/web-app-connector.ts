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
   * Connect to the extension and initialize PKCE OAuth authentication
   *
   * This method:
   * 1. Requests PKCE parameters from extension (code_challenge)
   * 2. Initiates OAuth authorization with code_challenge
   * 3. User authorizes (OAuth consent)
   * 4. Receives authorization code
   * 5. Extension exchanges code + code_verifier for access token
   * 6. Backend validates code_verifier against stored code_challenge
   *
   * See: RFC 7636 (PKCE) and PKCE_MIGRATION.md
   */
  async connectToExtension(config: ExtensionConfig): Promise<void> {
    console.log('[ExtensionConnector] Connecting to extension:', this.extensionId);

    // Step 1: Request PKCE parameters from extension
    const pkceResponse = await this.sendMessage({
      command: 'INITIALIZE_CONNECTION',
      payload: {
        backendUrl: config.backendUrl,
        projectId: config.projectId
      }
    });

    if (!pkceResponse.success) {
      throw new Error(`Failed to initialize connection: ${pkceResponse.error}`);
    }

    const { codeChallenge, codeChallengeMethod } = pkceResponse.data;
    console.log('[ExtensionConnector] Received PKCE challenge from extension');

    // Step 2: Initiate OAuth authorization flow
    const state = this.generateState();
    const authUrl = this.buildAuthorizationUrl(config.backendUrl, {
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      state,
      project_id: config.projectId
    });

    // Step 3: Open OAuth consent window
    const authWindow = window.open(
      authUrl,
      'OAuth Authorization',
      'width=500,height=600'
    );

    // Step 4: Wait for authorization code
    const authCode = await this.waitForAuthorizationCode(state);
    console.log('[ExtensionConnector] Received authorization code');

    // Step 5: Send authorization code to extension for token exchange
    const tokenResponse = await this.sendMessage({
      command: 'EXCHANGE_CODE',
      payload: {
        authorizationCode: authCode,
        backendUrl: config.backendUrl
      }
    });

    if (!tokenResponse.success) {
      throw new Error(`Token exchange failed: ${tokenResponse.error}`);
    }

    this.connected = true;
    console.log('[ExtensionConnector] Connected successfully with PKCE');
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
   * Generate cryptographically secure state parameter for OAuth
   * Prevents CSRF attacks
   */
  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Build OAuth authorization URL with PKCE parameters
   */
  private buildAuthorizationUrl(backendUrl: string, params: {
    code_challenge: string;
    code_challenge_method: string;
    state: string;
    project_id: string;
  }): string {
    const url = new URL(`${backendUrl}/oauth/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', 'anava-local-connector');
    url.searchParams.set('redirect_uri', 'http://localhost:9876/oauth/callback');
    url.searchParams.set('code_challenge', params.code_challenge);
    url.searchParams.set('code_challenge_method', params.code_challenge_method);
    url.searchParams.set('state', params.state);
    url.searchParams.set('project_id', params.project_id);
    return url.toString();
  }

  /**
   * Wait for OAuth callback with authorization code
   * Listens for postMessage from OAuth callback page
   */
  private async waitForAuthorizationCode(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        reject(new Error('OAuth authorization timeout (5 minutes)'));
      }, 5 * 60 * 1000); // 5 minutes

      const messageHandler = (event: MessageEvent) => {
        // Verify origin
        if (!event.origin.match(/^https?:\/\/(localhost|.*\.anava\.cloud)/)) {
          return;
        }

        if (event.data.type === 'OAUTH_CALLBACK') {
          clearTimeout(timeout);
          window.removeEventListener('message', messageHandler);

          // Verify state parameter (CSRF protection)
          if (event.data.state !== expectedState) {
            reject(new Error('Invalid OAuth state parameter'));
            return;
          }

          if (event.data.error) {
            reject(new Error(`OAuth error: ${event.data.error}`));
            return;
          }

          resolve(event.data.code);
        }
      };

      window.addEventListener('message', messageHandler);
    });
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
 * Example backend OAuth endpoint implementations (Express.js + PKCE)
 *
 * Place these in your backend API:
 */

/*
import crypto from 'crypto';
import { promisify } from 'util';

const randomBytes = promisify(crypto.randomBytes);

// OAuth Authorization Endpoint
app.get('/oauth/authorize', async (req, res) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    state,
    project_id
  } = req.query;

  // Validate parameters
  if (response_type !== 'code') {
    return res.status(400).json({ error: 'unsupported_response_type' });
  }

  if (code_challenge_method !== 'S256') {
    return res.status(400).json({ error: 'invalid_request',
      error_description: 'code_challenge_method must be S256' });
  }

  if (client_id !== 'anava-local-connector') {
    return res.status(400).json({ error: 'invalid_client' });
  }

  // Generate authorization code
  const authCode = (await randomBytes(32)).toString('base64url');

  // Store code_challenge with authorization code (10 minute expiration)
  await db.authCodes.create({
    code: authCode,
    project_id,
    code_challenge,
    code_challenge_method,
    redirect_uri,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000)
  });

  // Redirect to consent page (or auto-approve for trusted clients)
  // For demo, we'll auto-approve and redirect with code
  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set('code', authCode);
  callbackUrl.searchParams.set('state', state);

  res.redirect(callbackUrl.toString());
});

// OAuth Token Endpoint (PKCE Validation)
app.post('/oauth/token', async (req, res) => {
  const {
    grant_type,
    code,
    code_verifier,
    client_id,
    redirect_uri
  } = req.body;

  // Validate grant type
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  // Get stored authorization code
  const authCodeRecord = await db.authCodes.findOne({ code });

  if (!authCodeRecord) {
    return res.status(400).json({ error: 'invalid_grant' });
  }

  // Check expiration
  if (new Date() > authCodeRecord.expires_at) {
    await db.authCodes.deleteOne({ code });
    return res.status(400).json({ error: 'invalid_grant',
      error_description: 'Authorization code expired' });
  }

  // Verify PKCE code_verifier
  const computedChallenge = crypto
    .createHash('sha256')
    .update(code_verifier)
    .digest('base64url');

  if (computedChallenge !== authCodeRecord.code_challenge) {
    return res.status(400).json({ error: 'invalid_grant',
      error_description: 'Invalid code_verifier' });
  }

  // Verify redirect_uri matches
  if (redirect_uri !== authCodeRecord.redirect_uri) {
    return res.status(400).json({ error: 'invalid_grant',
      error_description: 'Redirect URI mismatch' });
  }

  // Delete authorization code (single-use)
  await db.authCodes.deleteOne({ code });

  // Generate access token and refresh token
  const accessToken = (await randomBytes(32)).toString('base64url');
  const refreshToken = (await randomBytes(32)).toString('base64url');

  // Store tokens
  await db.tokens.create({
    access_token: accessToken,
    refresh_token: refreshToken,
    project_id: authCodeRecord.project_id,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour
  });

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 3600 // 1 hour
  });
});

// OAuth Callback Page (HTML)
// Served at http://localhost:9876/oauth/callback
// This page receives the authorization code and posts it back to the parent window
app.get('/oauth/callback', (req, res) => {
  const { code, state, error } = req.query;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authorization Complete</title>
    </head>
    <body>
      <h2>Authorization ${error ? 'Failed' : 'Successful'}</h2>
      <p>${error ? 'Error: ' + error : 'You can close this window.'}</p>
      <script>
        // Send code back to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'OAUTH_CALLBACK',
            code: '${code}',
            state: '${state}',
            error: '${error || ''}'
          }, '*');

          // Close window after 2 seconds
          setTimeout(() => window.close(), 2000);
        }
      </script>
    </body>
    </html>
  `);
});

// Protected API endpoint (validates access token)
app.get('/api/protected-resource', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const accessToken = authHeader.substring(7);

  // Validate token
  const tokenRecord = await db.tokens.findOne({ access_token: accessToken });

  if (!tokenRecord) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  if (new Date() > tokenRecord.expires_at) {
    return res.status(401).json({ error: 'token_expired' });
  }

  // Token is valid
  res.json({
    success: true,
    project_id: tokenRecord.project_id,
    data: { ... }
  });
});
*/
