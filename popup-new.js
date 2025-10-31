/**
 * Anava Local Network Bridge - Connection Indicator (Enhanced)
 *
 * Features:
 * - Real-time connection status monitoring
 * - User-friendly error display
 * - Proxy health monitoring
 * - Actionable error recovery
 */

// Import services (will be bundled by build process)
import { ErrorManager, ErrorTranslator, ErrorSeverity } from './src/services/ErrorManager.js';
import { ProxyHealthMonitor, ProxyStatus } from './src/services/ProxyHealthMonitor.js';

// Configuration
const WEB_APP_URL = 'https://anava-ai.web.app/';
const PROXY_HEALTH_URL = 'http://127.0.0.1:9876/health';

// DOM Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const statusDescription = document.getElementById('status-description');
const proxyStatus = document.getElementById('proxy-status');
const webAppStatus = document.getElementById('web-app-status');
const extensionIdEl = document.getElementById('extension-id');
const openWebAppBtn = document.getElementById('open-web-app');
const setupInstructions = document.getElementById('setup-instructions');
const startProxyBtn = document.getElementById('start-proxy-btn');
const startProxyText = document.getElementById('start-proxy-text');
const startProxyStatusEl = document.getElementById('start-proxy-status');

// Error banner elements
const errorBanner = document.getElementById('error-banner');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorSuggestion = document.getElementById('error-suggestion');
const errorActionBtn = document.getElementById('error-action-btn');
const errorActionLabel = document.getElementById('error-action-label');
const errorDismissBtn = document.getElementById('error-dismiss-btn');
const errorDetailsContainer = document.getElementById('error-details-container');
const errorTechnicalDetails = document.getElementById('error-technical-details');

// State
let currentErrorId = null;

/**
 * Display error in UI
 */
function displayError(errorDetails) {
  console.log('[Popup] Displaying error:', errorDetails.title);

  // Update banner styling based on severity
  errorBanner.className = 'error-banner';
  if (errorDetails.severity === ErrorSeverity.WARNING) {
    errorBanner.classList.add('severity-warning');
  } else if (errorDetails.severity === ErrorSeverity.INFO) {
    errorBanner.classList.add('severity-info');
  }

  // Update content
  errorTitle.textContent = errorDetails.title;
  errorMessage.textContent = errorDetails.message;

  // Show/hide suggestion
  if (errorDetails.suggestion) {
    errorSuggestion.textContent = errorDetails.suggestion;
    errorSuggestion.style.display = 'block';
  } else {
    errorSuggestion.style.display = 'none';
  }

  // Show/hide action button
  if (errorDetails.actionButton) {
    errorActionLabel.textContent = errorDetails.actionButton.label;
    errorActionBtn.setAttribute('data-action', errorDetails.actionButton.action);
    errorActionBtn.style.display = 'block';
  } else {
    errorActionBtn.style.display = 'none';
  }

  // Show/hide technical details
  if (errorDetails.technicalDetails) {
    errorTechnicalDetails.textContent = errorDetails.technicalDetails;
    errorDetailsContainer.style.display = 'block';
  } else {
    errorDetailsContainer.style.display = 'none';
  }

  // Store error ID for dismissal
  if (errorDetails.id) {
    currentErrorId = errorDetails.id;
  }

  // Show banner
  errorBanner.style.display = 'flex';
}

/**
 * Hide error banner
 */
function hideError() {
  errorBanner.style.display = 'none';
  if (currentErrorId) {
    ErrorManager.dismissError(currentErrorId);
    currentErrorId = null;
  }
}

/**
 * Handle error action button click
 */
async function handleErrorAction(action) {
  console.log('[Popup] Handling error action:', action);

  switch (action) {
    case 'start_proxy':
      hideError();
      await startProxyServer();
      break;

    case 'restart_proxy':
      hideError();
      await restartProxyServer();
      break;

    case 'check_proxy_status':
      hideError();
      const health = await ProxyHealthMonitor.forceCheck();
      displayProxyHealth(health);
      break;

    case 'run_diagnostics':
      hideError();
      // TODO: Open diagnostics modal
      console.log('[Popup] Diagnostics not yet implemented');
      break;

    case 'retry_scan':
      hideError();
      // Signal to web app to retry scan
      console.log('[Popup] Retry scan - handled by web app');
      break;

    case 'refresh_page':
      window.location.reload();
      break;

    case 'reload_extension':
      chrome.runtime.reload();
      break;

    default:
      console.warn('[Popup] Unknown action:', action);
  }
}

/**
 * Display proxy health info
 */
function displayProxyHealth(health) {
  if (health.isRunning) {
    const responseTime = health.responseTime || 0;
    console.log(`[Popup] Proxy is healthy (${responseTime}ms response time)`);

    // Show success message in status description
    statusDescription.textContent = `Proxy responding in ${responseTime}ms`;
    statusDescription.style.color = 'var(--status-success)';
  } else {
    console.log('[Popup] Proxy health check failed');

    const error = ErrorTranslator.translateProxyError(
      new Error('Proxy health check failed')
    );
    displayError(error);
  }
}

/**
 * Restart proxy server
 */
async function restartProxyServer() {
  try {
    console.log('[Popup] Restarting proxy server...');

    // Show loading state
    startProxyBtn.disabled = true;
    startProxyText.textContent = 'Restarting...';

    // Kill existing instances and restart
    await chrome.runtime.sendMessage({
      command: 'restart_proxy'
    });

    // Wait for restart
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if successful
    const health = await ProxyHealthMonitor.forceCheck();
    if (health.isRunning) {
      console.log('[Popup] Proxy restarted successfully');
      updateConnectionStatus(true, true); // Assume web app is still reachable
    } else {
      throw new Error('Proxy failed to restart');
    }
  } catch (error) {
    console.error('[Popup] Failed to restart proxy:', error);

    const errorDetails = ErrorTranslator.translateProxyError(error);
    displayError(errorDetails);
  } finally {
    startProxyBtn.disabled = false;
    startProxyText.textContent = 'Start Proxy Server';
  }
}

/**
 * Check if proxy server is running
 */
async function checkProxyServer() {
  try {
    const response = await fetch(PROXY_HEALTH_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    return false;
  } catch (error) {
    console.log('[Popup] Proxy server check failed:', error.message);
    return false;
  }
}

/**
 * Check if web app is reachable
 */
async function checkWebApp() {
  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: AbortSignal.timeout(5000)
    });
    return true;
  } catch (error) {
    console.log('[Popup] Web app check failed:', error.message);
    return false;
  }
}

/**
 * Update UI based on connection status
 */
function updateConnectionStatus(proxyConnected, webAppConnected) {
  // Update proxy status display
  proxyStatus.classList.remove('checking');
  if (proxyConnected) {
    proxyStatus.textContent = 'Running';
    proxyStatus.className = 'status-item-value connected';
  } else {
    proxyStatus.textContent = 'Not Running';
    proxyStatus.className = 'status-item-value disconnected';
  }

  // Update web app status display
  webAppStatus.classList.remove('checking');
  if (webAppConnected) {
    webAppStatus.textContent = 'Reachable';
    webAppStatus.className = 'status-item-value connected';
  } else {
    webAppStatus.textContent = 'Not Reachable';
    webAppStatus.className = 'status-item-value disconnected';
  }

  // Determine overall status
  const bothConnected = proxyConnected && webAppConnected;
  const partialConnection = proxyConnected || webAppConnected;

  if (bothConnected) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected';
    statusDescription.textContent = 'All systems operational';
    setupInstructions.style.display = 'none';
    openWebAppBtn.disabled = false;
    startProxyBtn.style.display = 'none';
  } else if (partialConnection) {
    statusDot.className = 'status-dot partial';
    statusText.textContent = 'Partial Connection';
    statusDescription.textContent = 'Connection incomplete';
    setupInstructions.style.display = 'block';

    const instructionsText = document.getElementById('instructions-text');
    if (!proxyConnected) {
      instructionsText.innerHTML = `
        <p><strong>Proxy server is not running.</strong> The web app is reachable, but you won't be able to deploy cameras without the local proxy.</p>
        <p>Click the button below to automatically install and start the proxy server, or run manually:</p>
        <ol style="margin: 8px 0; padding-left: 20px; font-size: 12px;">
          <li>Open Terminal</li>
          <li>Navigate to extension folder</li>
          <li>Run: <code>./install-proxy.sh</code></li>
        </ol>
      `;
      startProxyBtn.style.display = 'flex';
    } else {
      instructionsText.innerHTML = `
        <p><strong>Web app is not reachable.</strong> The proxy server is running, but you need the web interface to deploy cameras.</p>
        <ol style="margin: 8px 0; padding-left: 20px; font-size: 12px;">
          <li>Check your internet connection</li>
          <li>Try opening <a href="${WEB_APP_URL}" target="_blank">${WEB_APP_URL}</a> in a new tab</li>
        </ol>
      `;
      startProxyBtn.style.display = 'none';
    }

    openWebAppBtn.disabled = !webAppConnected;
  } else {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Not Connected';
    statusDescription.textContent = 'Unable to connect';
    setupInstructions.style.display = 'block';

    const instructionsText = document.getElementById('instructions-text');
    instructionsText.innerHTML = `
      <p><strong>Both proxy server and web app are unreachable.</strong></p>
      <p>Click the button below to automatically install the proxy server:</p>
    `;

    startProxyBtn.style.display = 'flex';
    openWebAppBtn.disabled = true;

    // Show error if proxy is down
    const error = ErrorTranslator.translateProxyError(
      new Error('Connection refused')
    );
    displayError(error);
  }
}

/**
 * Start proxy server via background script
 */
async function startProxyServer() {
  try {
    startProxyBtn.disabled = true;
    startProxyText.textContent = 'Starting...';
    startProxyStatusEl.style.display = 'block';
    startProxyStatusEl.className = 'status-message info';
    startProxyStatusEl.textContent = 'Installing proxy server...';

    const response = await chrome.runtime.sendMessage({
      command: 'install_proxy'
    });

    if (response && response.success) {
      startProxyStatusEl.className = 'status-message success';
      startProxyStatusEl.textContent = '✓ Proxy server installed and started successfully!';

      setTimeout(async () => {
        const proxyConnected = await checkProxyServer();
        if (proxyConnected) {
          const webAppConnected = await checkWebApp();
          updateConnectionStatus(proxyConnected, webAppConnected);
          hideError(); // Clear any proxy errors
        } else {
          startProxyStatusEl.className = 'status-message error';
          startProxyStatusEl.textContent = '⚠ Installation completed but proxy is not responding. Try restarting your computer.';
        }
        startProxyBtn.disabled = false;
        startProxyText.textContent = 'Start Proxy Server';
      }, 2000);
    } else {
      throw new Error(response?.error || 'Unknown error');
    }
  } catch (error) {
    console.error('[Popup] Failed to start proxy:', error);

    const errorDetails = ErrorTranslator.translateProxyError(error);
    displayError(errorDetails);

    startProxyStatusEl.className = 'status-message error';
    startProxyStatusEl.textContent = `✗ Error: ${error.message}`;
    startProxyBtn.disabled = false;
    startProxyText.textContent = 'Retry Installation';
  }
}

/**
 * Initialize popup
 */
async function initialize() {
  console.log('[Popup] Initializing...');

  // Show extension ID
  const extensionId = chrome.runtime.id;
  extensionIdEl.textContent = extensionId;

  // Set web app URL
  openWebAppBtn.href = WEB_APP_URL;

  // Subscribe to error events
  ErrorManager.onError((error) => {
    console.log('[Popup] Error event:', error.title);
    displayError(error);
  });

  // Subscribe to proxy health changes
  ProxyHealthMonitor.onHealthChange((health, status) => {
    console.log('[Popup] Proxy health changed:', status, health);

    // Update proxy status indicator
    const isRunning = status === ProxyStatus.HEALTHY || status === ProxyStatus.DEGRADED;

    proxyStatus.classList.remove('checking');
    if (isRunning) {
      proxyStatus.textContent = status === ProxyStatus.DEGRADED ? 'Slow' : 'Running';
      proxyStatus.className = `status-item-value ${status === ProxyStatus.DEGRADED ? 'warning' : 'connected'}`;
    } else {
      proxyStatus.textContent = 'Not Running';
      proxyStatus.className = 'status-item-value disconnected';
    }
  });

  // Check connections
  console.log('[Popup] Checking connections...');
  const [proxyConnected, webAppConnected] = await Promise.all([
    checkProxyServer(),
    checkWebApp()
  ]);

  console.log('[Popup] Proxy:', proxyConnected ? 'Connected' : 'Not Connected');
  console.log('[Popup] Web App:', webAppConnected ? 'Reachable' : 'Not Reachable');

  updateConnectionStatus(proxyConnected, webAppConnected);

  // Auto-refresh status every 10 seconds
  setInterval(async () => {
    const [proxy, webApp] = await Promise.all([
      checkProxyServer(),
      checkWebApp()
    ]);
    updateConnectionStatus(proxy, webApp);
  }, 10000);

  // Start proxy health monitoring
  ProxyHealthMonitor.startMonitoring();
}

/**
 * Event Listeners
 */

// Open web app button
openWebAppBtn.addEventListener('click', () => {
  console.log('[Popup] Opening web app at:', WEB_APP_URL);
});

// Start proxy button
startProxyBtn.addEventListener('click', () => {
  console.log('[Popup] User clicked start proxy button');
  startProxyServer();
});

// Error dismiss button
errorDismissBtn.addEventListener('click', () => {
  console.log('[Popup] User dismissed error');
  hideError();
});

// Error action button
errorActionBtn.addEventListener('click', () => {
  const action = errorActionBtn.getAttribute('data-action');
  console.log('[Popup] User clicked error action:', action);
  handleErrorAction(action);
});

// Initialize on load
initialize();
