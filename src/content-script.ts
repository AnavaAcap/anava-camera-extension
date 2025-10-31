/**
 * Content Script for Anava Local Connector
 *
 * Runs on all web pages to auto-discover terraform-spa configuration.
 * Looks for .well-known/spa-connector-config.json endpoint.
 */

interface ConnectorConfig {
  version: string;
  extensionId: string;
  backendUrl: string;
  projectId: string;
  features: string[];
  customConfig?: Record<string, unknown>;
}

interface ConfigDiscoveryResult {
  success: boolean;
  config?: ConnectorConfig;
  error?: string;
  url?: string;
}

/**
 * Discover configuration from current page
 */
async function discoverConfiguration(): Promise<ConfigDiscoveryResult> {
  const configUrl = `${window.location.origin}/.well-known/spa-connector-config.json`;

  try {
    console.log('[Anava Connector] Checking for configuration at:', configUrl);

    const response = await fetch(configUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Use no-cors mode to avoid CORS preflight issues
      mode: 'cors',
      cache: 'no-cache',
    });

    if (!response.ok) {
      console.log('[Anava Connector] No configuration found (HTTP', response.status, ')');
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        url: configUrl,
      };
    }

    const config = await response.json() as ConnectorConfig;

    // Validate configuration structure
    if (!isValidConfig(config)) {
      console.error('[Anava Connector] Invalid configuration structure:', config);
      return {
        success: false,
        error: 'Invalid configuration structure',
        url: configUrl,
      };
    }

    console.log('[Anava Connector] Configuration discovered successfully:', config);

    // Store in extension storage
    chrome.storage.local.set({
      discoveredConfig: config,
      discoveryUrl: configUrl,
      discoveryTime: Date.now(),
    });

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'CONFIG_DISCOVERED',
      config,
      url: configUrl,
      origin: window.location.origin,
    });

    // Notify the page (for web app integration)
    window.postMessage({
      type: 'ANAVA_CONNECTOR_CONFIG_DISCOVERED',
      config,
    }, window.location.origin);

    return {
      success: true,
      config,
      url: configUrl,
    };

  } catch (error) {
    console.log('[Anava Connector] Configuration discovery failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      url: configUrl,
    };
  }
}

/**
 * Validate configuration structure
 */
function isValidConfig(config: unknown): config is ConnectorConfig {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const c = config as Partial<ConnectorConfig>;

  // Required fields
  if (typeof c.version !== 'string') return false;
  if (typeof c.extensionId !== 'string') return false;
  if (typeof c.backendUrl !== 'string') return false;
  if (typeof c.projectId !== 'string') return false;
  if (!Array.isArray(c.features)) return false;

  // Validate extension ID format (32 lowercase alphanumeric characters)
  if (!/^[a-p]{32}$/.test(c.extensionId)) {
    console.warn('[Anava Connector] Invalid extension ID format:', c.extensionId);
    return false;
  }

  // Validate backend URL
  try {
    new URL(c.backendUrl);
  } catch {
    console.warn('[Anava Connector] Invalid backend URL:', c.backendUrl);
    return false;
  }

  return true;
}

/**
 * Listen for messages from the page
 */
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data;

  if (message.type === 'ANAVA_CONNECTOR_REQUEST_CONFIG') {
    // Page is requesting configuration - send it if we have it
    chrome.storage.local.get(['discoveredConfig'], (result) => {
      if (result.discoveredConfig) {
        window.postMessage({
          type: 'ANAVA_CONNECTOR_CONFIG_DISCOVERED',
          config: result.discoveredConfig,
        }, window.location.origin);
      }
    });
  } else if (message.type === 'ANAVA_CONNECTOR_SCAN_CAMERAS') {
    // Forward camera scan request to background script
    chrome.runtime.sendMessage({
      type: 'SCAN_CAMERAS',
      ...message.payload,
    });
  } else if (message.type === 'ANAVA_CONNECTOR_AUTHENTICATE') {
    // Forward authentication request to background script
    chrome.runtime.sendMessage({
      type: 'AUTHENTICATE_WITH_BACKEND',
      ...message.payload,
    });
  }
});

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAMERAS_DISCOVERED') {
    // Forward camera discovery results to page
    window.postMessage({
      type: 'ANAVA_CONNECTOR_CAMERAS_DISCOVERED',
      cameras: message.cameras,
    }, window.location.origin);
  } else if (message.type === 'AUTHENTICATION_RESULT') {
    // Forward authentication result to page
    window.postMessage({
      type: 'ANAVA_CONNECTOR_AUTHENTICATION_RESULT',
      success: message.success,
      token: message.token,
      error: message.error,
    }, window.location.origin);
  } else if (message.type === 'REQUEST_CONFIG_DISCOVERY') {
    // Background script requesting config discovery
    discoverConfiguration().then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  return false;
});

/**
 * Run discovery on page load
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for page to settle before checking config
    setTimeout(discoverConfiguration, 500);
  });
} else {
  // DOM already loaded
  setTimeout(discoverConfiguration, 500);
}

/**
 * Re-check configuration when page becomes visible
 * (in case user navigated away and back)
 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Check if we need to re-discover (e.g., config older than 5 minutes)
    chrome.storage.local.get(['discoveryTime'], (result) => {
      const age = Date.now() - (result.discoveryTime || 0);
      if (age > 5 * 60 * 1000) {
        console.log('[Anava Connector] Re-discovering configuration (cache expired)');
        discoverConfiguration();
      }
    });
  }
});

console.log('[Anava Connector] Content script loaded on:', window.location.origin);
