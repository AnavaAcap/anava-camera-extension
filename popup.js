/**
 * Anava Local Network Bridge - Connection Indicator
 *
 * Connection Status:
 * - GREEN = Both proxy server AND web app are reachable
 * - YELLOW = Only proxy OR web app is reachable (partial connection)
 * - RED = Neither proxy nor web app is reachable
 */

// Configuration
const WEB_APP_URL = 'https://anava-ai.web.app/';
const PROXY_HEALTH_URL = 'http://127.0.0.1:9876/health';

// DOM Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const proxyStatus = document.getElementById('proxy-status');
const webAppStatus = document.getElementById('web-app-status');
const extensionIdEl = document.getElementById('extension-id');
const openWebAppBtn = document.getElementById('open-web-app');
const setupInstructions = document.getElementById('setup-instructions');

/**
 * Check if proxy server is running
 */
async function checkProxyServer() {
  try {
    const response = await fetch(PROXY_HEALTH_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    return false;
  } catch (error) {
    console.log('Proxy server check failed:', error.message);
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
      mode: 'no-cors', // Avoid CORS issues
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    // With no-cors, we can't read the response, but if fetch succeeds, site is reachable
    return true;
  } catch (error) {
    console.log('Web app check failed:', error.message);
    return false;
  }
}

/**
 * Update UI based on connection status
 *
 * @param {boolean} proxyConnected - Is proxy server reachable?
 * @param {boolean} webAppConnected - Is web app reachable?
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

  // Determine overall status based on both connections
  const bothConnected = proxyConnected && webAppConnected;
  const partialConnection = proxyConnected || webAppConnected;
  const neitherConnected = !proxyConnected && !webAppConnected;

  // Update status description
  const statusDescription = document.getElementById('status-description');

  if (bothConnected) {
    // GREEN - Full connection
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected';
    statusDescription.textContent = 'All systems operational';
    setupInstructions.style.display = 'none';
    openWebAppBtn.disabled = false;
  } else if (partialConnection) {
    // YELLOW - Partial connection
    statusDot.className = 'status-dot partial';
    statusText.textContent = 'Partial Connection';
    statusDescription.textContent = 'Connection incomplete';
    setupInstructions.style.display = 'block';

    // Update instructions based on what's missing
    const instructionsText = document.getElementById('instructions-text');
    if (!proxyConnected) {
      instructionsText.innerHTML = `
        <p><strong>Proxy server is not running.</strong> The web app is reachable, but you won't be able to deploy cameras without the local proxy.</p>
        <ol>
          <li>Run: <code>./install-proxy.sh</code></li>
          <li>Verify: <code>curl http://127.0.0.1:9876/health</code></li>
        </ol>
      `;
    } else {
      instructionsText.innerHTML = `
        <p><strong>Web app is not reachable.</strong> The proxy server is running, but you need the web interface to deploy cameras.</p>
        <ol>
          <li>Check your internet connection</li>
          <li>Try opening <a href="${WEB_APP_URL}" target="_blank">${WEB_APP_URL}</a> in a new tab</li>
        </ol>
      `;
    }

    openWebAppBtn.disabled = !webAppConnected; // Enable button only if web app is reachable
  } else {
    // RED - Not connected
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Not Connected';
    statusDescription.textContent = 'Unable to connect';
    setupInstructions.style.display = 'block';

    const instructionsText = document.getElementById('instructions-text');
    instructionsText.innerHTML = `
      <p><strong>Both proxy server and web app are unreachable.</strong></p>
      <ol>
        <li>Check your internet connection</li>
        <li>Install proxy: <code>./install-proxy.sh</code></li>
        <li>Verify proxy: <code>curl http://127.0.0.1:9876/health</code></li>
        <li>Try opening <a href="${WEB_APP_URL}" target="_blank">${WEB_APP_URL}</a></li>
      </ol>
    `;

    openWebAppBtn.disabled = true;
  }
}

/**
 * Initialize popup
 */
async function initialize() {
  // Show extension ID
  const extensionId = chrome.runtime.id;
  extensionIdEl.textContent = extensionId;

  // Set web app URL
  openWebAppBtn.href = WEB_APP_URL;

  // Check both proxy server and web app
  console.log('Checking connections...');
  const [proxyConnected, webAppConnected] = await Promise.all([
    checkProxyServer(),
    checkWebApp()
  ]);

  console.log('Proxy server:', proxyConnected ? 'Connected' : 'Not Connected');
  console.log('Web app:', webAppConnected ? 'Reachable' : 'Not Reachable');

  updateConnectionStatus(proxyConnected, webAppConnected);

  // Auto-refresh status every 5 seconds
  setInterval(async () => {
    const [proxy, webApp] = await Promise.all([
      checkProxyServer(),
      checkWebApp()
    ]);
    updateConnectionStatus(proxy, webApp);
  }, 5000);
}

/**
 * Handle open web app button click
 */
openWebAppBtn.addEventListener('click', (e) => {
  console.log('Opening web app at:', WEB_APP_URL);
});

// Initialize on load
initialize();
