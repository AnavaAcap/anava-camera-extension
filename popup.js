"use strict";
(() => {
  // src/services/ErrorManager.ts
  var ErrorManagerClass = class _ErrorManagerClass {
    // Keep last 100 errors
    constructor() {
      this.errorLog = [];
      this.listeners = /* @__PURE__ */ new Set();
      this.maxLogSize = 100;
      this.loadErrorLog();
    }
    static getInstance() {
      if (!_ErrorManagerClass.instance) {
        _ErrorManagerClass.instance = new _ErrorManagerClass();
      }
      return _ErrorManagerClass.instance;
    }
    /**
     * Load error log from storage
     */
    async loadErrorLog() {
      try {
        const result = await chrome.storage.local.get(["errorLog"]);
        if (result.errorLog && Array.isArray(result.errorLog)) {
          this.errorLog = result.errorLog;
        }
      } catch (error) {
        console.error("[ErrorManager] Failed to load error log:", error);
      }
    }
    /**
     * Save error log to storage
     */
    async saveErrorLog() {
      try {
        const trimmedLog = this.errorLog.slice(-this.maxLogSize);
        await chrome.storage.local.set({ errorLog: trimmedLog });
        this.errorLog = trimmedLog;
      } catch (error) {
        console.error("[ErrorManager] Failed to save error log:", error);
      }
    }
    /**
     * Report an error with context
     */
    reportError(details) {
      const errorLog = {
        ...details,
        id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        dismissed: false
      };
      console.error(`[ErrorManager] ${details.category}:`, details.title, details.message);
      if (details.technicalDetails) {
        console.error("[ErrorManager] Technical details:", details.technicalDetails);
      }
      this.errorLog.push(errorLog);
      this.saveErrorLog();
      this.listeners.forEach((listener) => listener(errorLog));
    }
    /**
     * Subscribe to error events
     */
    onError(callback) {
      this.listeners.add(callback);
      return () => this.listeners.delete(callback);
    }
    /**
     * Get recent errors
     */
    getRecentErrors(count = 10) {
      return this.errorLog.slice(-count).reverse();
    }
    /**
     * Get undismissed errors
     */
    getActiveErrors() {
      return this.errorLog.filter((e) => !e.dismissed).slice(-10);
    }
    /**
     * Dismiss an error
     */
    async dismissError(errorId) {
      const error = this.errorLog.find((e) => e.id === errorId);
      if (error) {
        error.dismissed = true;
        await this.saveErrorLog();
      }
    }
    /**
     * Clear all errors
     */
    async clearAllErrors() {
      this.errorLog = [];
      await this.saveErrorLog();
    }
    /**
     * Export error log as JSON (for support/debugging)
     */
    exportErrorLog() {
      return JSON.stringify({
        version: chrome.runtime.getManifest().version,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        errors: this.errorLog
      }, null, 2);
    }
  };
  var ErrorManager = ErrorManagerClass.getInstance();
  var ErrorTranslator = class {
    /**
     * Translate proxy server errors
     */
    static translateProxyError(error) {
      const errorMessage2 = error.message || String(error);
      if (errorMessage2.includes("ECONNREFUSED") || errorMessage2.includes("Failed to fetch")) {
        return {
          category: "proxy_server" /* PROXY_SERVER */,
          severity: "error" /* ERROR */,
          title: "Proxy Server Not Running",
          message: "The local proxy server is not responding. Camera deployment requires the proxy to be running.",
          suggestion: 'Click "Start Proxy Server" below to automatically install and start the proxy.',
          actionButton: {
            label: "Start Proxy Server",
            action: "start_proxy"
          },
          technicalDetails: errorMessage2,
          timestamp: Date.now()
        };
      }
      if (errorMessage2.includes("EADDRINUSE") || errorMessage2.includes("port already in use")) {
        return {
          category: "proxy_server" /* PROXY_SERVER */,
          severity: "warning" /* WARNING */,
          title: "Proxy Server Port Conflict",
          message: "Another process is using port 9876. This may be a duplicate proxy server.",
          suggestion: "Run diagnostics to detect and fix port conflicts.",
          actionButton: {
            label: "Run Diagnostics",
            action: "run_diagnostics"
          },
          technicalDetails: errorMessage2,
          timestamp: Date.now()
        };
      }
      if (errorMessage2.includes("timeout") || errorMessage2.includes("AbortError")) {
        return {
          category: "proxy_server" /* PROXY_SERVER */,
          severity: "warning" /* WARNING */,
          title: "Proxy Server Timeout",
          message: "The proxy server is taking too long to respond.",
          suggestion: "Check if the proxy server is running and restart if needed.",
          actionButton: {
            label: "Check Status",
            action: "check_proxy_status"
          },
          technicalDetails: errorMessage2,
          timestamp: Date.now()
        };
      }
      return {
        category: "proxy_server" /* PROXY_SERVER */,
        severity: "error" /* ERROR */,
        title: "Proxy Server Error",
        message: "The local proxy server encountered an unexpected error.",
        suggestion: "Try restarting the proxy server.",
        actionButton: {
          label: "Restart Proxy",
          action: "restart_proxy"
        },
        technicalDetails: errorMessage2,
        timestamp: Date.now()
      };
    }
    /**
     * Translate network scan errors
     */
    static translateScanError(error, context) {
      const errorMessage2 = error.message || String(error);
      if (errorMessage2.includes("no cameras") || errorMessage2.toLowerCase().includes("0 cameras")) {
        return {
          category: "network_scan" /* NETWORK_SCAN */,
          severity: "warning" /* WARNING */,
          title: "No Cameras Found",
          message: context?.subnet ? `No cameras were found on network ${context.subnet}.` : "No cameras were found on the network.",
          suggestion: "Verify cameras are powered on, connected to the network, and the network range is correct.",
          actionButton: {
            label: "Retry Scan",
            action: "retry_scan"
          },
          technicalDetails: errorMessage2,
          context,
          timestamp: Date.now()
        };
      }
      if (errorMessage2.includes("401") || errorMessage2.includes("authentication") || errorMessage2.includes("credentials")) {
        return {
          category: "camera_auth" /* CAMERA_AUTH */,
          severity: "error" /* ERROR */,
          title: "Camera Authentication Failed",
          message: "Unable to authenticate with cameras. Check username and password.",
          suggestion: "Verify the camera credentials are correct.",
          actionButton: {
            label: "Update Credentials",
            action: "update_credentials"
          },
          technicalDetails: errorMessage2,
          context,
          timestamp: Date.now()
        };
      }
      if (errorMessage2.includes("proxy") || errorMessage2.includes("ECONNREFUSED")) {
        return {
          category: "network_scan" /* NETWORK_SCAN */,
          severity: "error" /* ERROR */,
          title: "Scan Failed - Proxy Unavailable",
          message: "The network scan failed because the proxy server stopped responding.",
          suggestion: "Ensure the proxy server is running before scanning.",
          actionButton: {
            label: "Check Proxy Status",
            action: "check_proxy_status"
          },
          technicalDetails: errorMessage2,
          context,
          timestamp: Date.now()
        };
      }
      return {
        category: "network_scan" /* NETWORK_SCAN */,
        severity: "error" /* ERROR */,
        title: "Network Scan Error",
        message: context?.scannedCount ? `Scan failed after checking ${context.scannedCount} IP addresses.` : "The network scan encountered an unexpected error.",
        suggestion: "Try scanning again with a smaller network range.",
        actionButton: {
          label: "Retry Scan",
          action: "retry_scan"
        },
        technicalDetails: errorMessage2,
        context,
        timestamp: Date.now()
      };
    }
    /**
     * Translate deployment errors
     */
    static translateDeploymentError(error, context) {
      const errorMessage2 = error.message || String(error);
      if (errorMessage2.includes("Step 1") || errorMessage2.includes("Deploy ACAP")) {
        return {
          category: "deployment" /* DEPLOYMENT */,
          severity: "error" /* ERROR */,
          title: "ACAP Installation Failed",
          message: context?.cameraIp ? `Failed to install ACAP on camera ${context.cameraIp}.` : "Failed to install the ACAP application on the camera.",
          suggestion: "Verify the camera has enough storage space and firmware is compatible.",
          actionButton: {
            label: "Retry Deployment",
            action: "retry_deployment"
          },
          technicalDetails: errorMessage2,
          context,
          timestamp: Date.now()
        };
      }
      if (errorMessage2.includes("Step 2") || errorMessage2.includes("License")) {
        return {
          category: "deployment" /* DEPLOYMENT */,
          severity: "error" /* ERROR */,
          title: "License Activation Failed",
          message: "The camera license could not be activated.",
          suggestion: "Verify the license key is valid and not already in use.",
          actionButton: {
            label: "Check License",
            action: "check_license"
          },
          technicalDetails: errorMessage2,
          context,
          timestamp: Date.now()
        };
      }
      if (errorMessage2.includes("Step 3") || errorMessage2.includes("Start ACAP")) {
        return {
          category: "deployment" /* DEPLOYMENT */,
          severity: "error" /* ERROR */,
          title: "ACAP Failed to Start",
          message: "The ACAP application was installed but failed to start.",
          suggestion: "Check camera logs for errors. The camera may need to be rebooted.",
          actionButton: {
            label: "Retry Start",
            action: "retry_start_acap"
          },
          technicalDetails: errorMessage2,
          context,
          timestamp: Date.now()
        };
      }
      if (errorMessage2.includes("Step 4") || errorMessage2.includes("Config")) {
        return {
          category: "deployment" /* DEPLOYMENT */,
          severity: "error" /* ERROR */,
          title: "Configuration Push Failed",
          message: "Unable to push configuration to the camera.",
          suggestion: "Ensure the ACAP is running and the camera is reachable.",
          actionButton: {
            label: "Retry Configuration",
            action: "retry_config"
          },
          technicalDetails: errorMessage2,
          context,
          timestamp: Date.now()
        };
      }
      return {
        category: "deployment" /* DEPLOYMENT */,
        severity: "error" /* ERROR */,
        title: "Deployment Failed",
        message: context?.cameraIp ? `Failed to deploy to camera ${context.cameraIp}.` : "Camera deployment encountered an error.",
        suggestion: "Review error details and ensure camera is accessible.",
        actionButton: {
          label: "Retry Deployment",
          action: "retry_deployment"
        },
        technicalDetails: errorMessage2,
        context,
        timestamp: Date.now()
      };
    }
    /**
     * Translate system errors
     */
    static translateSystemError(error) {
      const errorMessage2 = error.message || String(error);
      if (errorMessage2.includes("Extension context invalidated")) {
        return {
          category: "system" /* SYSTEM */,
          severity: "warning" /* WARNING */,
          title: "Extension Reloaded",
          message: "The extension was reloaded. Any in-progress operations were cancelled.",
          suggestion: "Refresh the page and try again.",
          actionButton: {
            label: "Refresh Page",
            action: "refresh_page"
          },
          technicalDetails: errorMessage2,
          timestamp: Date.now()
        };
      }
      if (errorMessage2.includes("chrome.runtime")) {
        return {
          category: "system" /* SYSTEM */,
          severity: "error" /* ERROR */,
          title: "Extension Communication Error",
          message: "Unable to communicate with the extension background service.",
          suggestion: "Try reloading the extension or restarting your browser.",
          actionButton: {
            label: "Reload Extension",
            action: "reload_extension"
          },
          technicalDetails: errorMessage2,
          timestamp: Date.now()
        };
      }
      return {
        category: "system" /* SYSTEM */,
        severity: "error" /* ERROR */,
        title: "System Error",
        message: "An unexpected system error occurred.",
        suggestion: "Try restarting the browser or reinstalling the extension.",
        technicalDetails: errorMessage2,
        timestamp: Date.now()
      };
    }
  };

  // src/services/ProxyHealthMonitor.ts
  var ProxyHealthMonitorClass = class _ProxyHealthMonitorClass {
    constructor() {
      this.PROXY_URL = "http://127.0.0.1:9876";
      this.PROXY_PORT = 9876;
      this.CHECK_INTERVAL = 1e4;
      // 10 seconds
      this.HEALTH_TIMEOUT = 3e3;
      // 3 seconds
      this.MAX_CONSECUTIVE_FAILURES = 3;
      this.health = {
        isRunning: false,
        lastCheck: 0,
        port: this.PROXY_PORT,
        consecutiveFailures: 0
      };
      this.listeners = /* @__PURE__ */ new Set();
      this.isRecovering = false;
      this.startMonitoring();
    }
    static getInstance() {
      if (!_ProxyHealthMonitorClass.instance) {
        _ProxyHealthMonitorClass.instance = new _ProxyHealthMonitorClass();
      }
      return _ProxyHealthMonitorClass.instance;
    }
    /**
     * Start periodic health monitoring
     */
    startMonitoring() {
      if (this.checkInterval) {
        return;
      }
      console.log("[ProxyHealthMonitor] Starting health monitoring...");
      this.checkHealth();
      this.checkInterval = window.setInterval(() => {
        this.checkHealth();
      }, this.CHECK_INTERVAL);
    }
    /**
     * Stop monitoring
     */
    stopMonitoring() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = void 0;
        console.log("[ProxyHealthMonitor] Stopped health monitoring");
      }
    }
    /**
     * Perform health check
     */
    async checkHealth() {
      const startTime = Date.now();
      try {
        const response = await fetch(`${this.PROXY_URL}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(this.HEALTH_TIMEOUT)
        });
        const responseTime = Date.now() - startTime;
        if (response.ok) {
          const data = await response.json();
          this.health = {
            isRunning: true,
            lastCheck: Date.now(),
            uptime: data.uptime,
            port: this.PROXY_PORT,
            responseTime,
            consecutiveFailures: 0
          };
          const status = responseTime > 1e3 ? "degraded" /* DEGRADED */ : "healthy" /* HEALTHY */;
          this.notifyListeners(this.health, status);
          console.log(`[ProxyHealthMonitor] Health check passed (${responseTime}ms)`);
          return this.health;
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        this.health.consecutiveFailures++;
        this.health.isRunning = false;
        this.health.lastCheck = Date.now();
        this.health.responseTime = void 0;
        console.error("[ProxyHealthMonitor] Health check failed:", error);
        if (this.health.consecutiveFailures === this.MAX_CONSECUTIVE_FAILURES) {
          ErrorManager.reportError({
            category: "proxy_server" /* PROXY_SERVER */,
            severity: "error" /* ERROR */,
            title: "Proxy Server Not Responding",
            message: `The proxy server has failed ${this.MAX_CONSECUTIVE_FAILURES} consecutive health checks.`,
            suggestion: "The proxy may have crashed or been stopped. Try restarting it.",
            actionButton: {
              label: "Restart Proxy",
              action: "restart_proxy"
            },
            technicalDetails: String(error)
          });
        }
        this.notifyListeners(this.health, "down" /* DOWN */);
        if (this.health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && !this.isRecovering) {
          this.attemptRecovery();
        }
        return this.health;
      }
    }
    /**
     * Attempt automatic recovery
     */
    async attemptRecovery() {
      if (this.isRecovering) {
        return;
      }
      this.isRecovering = true;
      console.log("[ProxyHealthMonitor] Attempting auto-recovery...");
      try {
        const hasConflict = await this.checkPortConflict();
        if (hasConflict) {
          console.log("[ProxyHealthMonitor] Port conflict detected, attempting to resolve...");
          await this.resolvePortConflict();
        }
        console.log("[ProxyHealthMonitor] Attempting to start proxy server...");
        ErrorManager.reportError({
          category: "proxy_server" /* PROXY_SERVER */,
          severity: "warning" /* WARNING */,
          title: "Auto-Recovery Attempted",
          message: "The system detected the proxy server was down and attempted to restart it.",
          suggestion: "If the problem persists, manually restart the proxy using the button below.",
          actionButton: {
            label: "Manual Restart",
            action: "restart_proxy"
          }
        });
      } catch (error) {
        console.error("[ProxyHealthMonitor] Auto-recovery failed:", error);
        ErrorManager.reportError({
          category: "proxy_server" /* PROXY_SERVER */,
          severity: "error" /* ERROR */,
          title: "Auto-Recovery Failed",
          message: "Unable to automatically restart the proxy server.",
          suggestion: "Please manually restart the proxy using the installation script.",
          actionButton: {
            label: "View Instructions",
            action: "show_install_instructions"
          },
          technicalDetails: String(error)
        });
      } finally {
        this.isRecovering = false;
      }
    }
    /**
     * Check for port conflicts (multiple instances)
     */
    async checkPortConflict() {
      try {
        const response = await chrome.runtime.sendMessage({
          command: "check_proxy_instances"
        });
        return response && response.hasMultipleInstances === true;
      } catch (error) {
        console.error("[ProxyHealthMonitor] Failed to check port conflict:", error);
        return false;
      }
    }
    /**
     * Resolve port conflict by killing duplicate instances
     */
    async resolvePortConflict() {
      try {
        await chrome.runtime.sendMessage({
          command: "kill_duplicate_proxies"
        });
        console.log("[ProxyHealthMonitor] Port conflict resolved");
      } catch (error) {
        console.error("[ProxyHealthMonitor] Failed to resolve port conflict:", error);
        throw error;
      }
    }
    /**
     * Subscribe to health status changes
     */
    onHealthChange(callback) {
      this.listeners.add(callback);
      const status = this.getStatus();
      callback(this.health, status);
      return () => this.listeners.delete(callback);
    }
    /**
     * Notify all listeners of health change
     */
    notifyListeners(health, status) {
      this.listeners.forEach((listener) => listener(health, status));
    }
    /**
     * Get current health status
     */
    getHealth() {
      return { ...this.health };
    }
    /**
     * Get current status
     */
    getStatus() {
      if (!this.health.lastCheck) {
        return "unknown" /* UNKNOWN */;
      }
      if (!this.health.isRunning) {
        return "down" /* DOWN */;
      }
      if (this.health.responseTime && this.health.responseTime > 1e3) {
        return "degraded" /* DEGRADED */;
      }
      return "healthy" /* HEALTHY */;
    }
    /**
     * Force an immediate health check
     */
    async forceCheck() {
      return this.checkHealth();
    }
    /**
     * Get time since last successful check
     */
    getTimeSinceLastSuccess() {
      if (!this.health.lastCheck || !this.health.isRunning) {
        return Infinity;
      }
      return Date.now() - this.health.lastCheck;
    }
    /**
     * Check if proxy is considered healthy
     */
    isHealthy() {
      return this.health.isRunning && this.health.consecutiveFailures === 0;
    }
    /**
     * Reset failure counter (after successful manual intervention)
     */
    resetFailures() {
      this.health.consecutiveFailures = 0;
      console.log("[ProxyHealthMonitor] Failure counter reset");
    }
  };
  var ProxyHealthMonitor = ProxyHealthMonitorClass.getInstance();

  // popup-new.js
  var WEB_APP_URL = "https://anava-ai.web.app/";
  var PROXY_HEALTH_URL = "http://127.0.0.1:9876/health";
  var statusDot = document.getElementById("status-dot");
  var statusText = document.getElementById("status-text");
  var statusDescription = document.getElementById("status-description");
  var proxyStatus = document.getElementById("proxy-status");
  var webAppStatus = document.getElementById("web-app-status");
  var extensionIdEl = document.getElementById("extension-id");
  var openWebAppBtn = document.getElementById("open-web-app");
  var setupInstructions = document.getElementById("setup-instructions");
  var startProxyBtn = document.getElementById("start-proxy-btn");
  var startProxyText = document.getElementById("start-proxy-text");
  var startProxyStatusEl = document.getElementById("start-proxy-status");
  var errorBanner = document.getElementById("error-banner");
  var errorTitle = document.getElementById("error-title");
  var errorMessage = document.getElementById("error-message");
  var errorSuggestion = document.getElementById("error-suggestion");
  var errorActionBtn = document.getElementById("error-action-btn");
  var errorActionLabel = document.getElementById("error-action-label");
  var errorDismissBtn = document.getElementById("error-dismiss-btn");
  var errorDetailsContainer = document.getElementById("error-details-container");
  var errorTechnicalDetails = document.getElementById("error-technical-details");
  var currentErrorId = null;
  function displayError(errorDetails) {
    console.log("[Popup] Displaying error:", errorDetails.title);
    errorBanner.className = "error-banner";
    if (errorDetails.severity === "warning" /* WARNING */) {
      errorBanner.classList.add("severity-warning");
    } else if (errorDetails.severity === "info" /* INFO */) {
      errorBanner.classList.add("severity-info");
    }
    errorTitle.textContent = errorDetails.title;
    errorMessage.textContent = errorDetails.message;
    if (errorDetails.suggestion) {
      errorSuggestion.textContent = errorDetails.suggestion;
      errorSuggestion.style.display = "block";
    } else {
      errorSuggestion.style.display = "none";
    }
    if (errorDetails.actionButton) {
      errorActionLabel.textContent = errorDetails.actionButton.label;
      errorActionBtn.setAttribute("data-action", errorDetails.actionButton.action);
      errorActionBtn.style.display = "block";
    } else {
      errorActionBtn.style.display = "none";
    }
    if (errorDetails.technicalDetails) {
      errorTechnicalDetails.textContent = errorDetails.technicalDetails;
      errorDetailsContainer.style.display = "block";
    } else {
      errorDetailsContainer.style.display = "none";
    }
    if (errorDetails.id) {
      currentErrorId = errorDetails.id;
    }
    errorBanner.style.display = "flex";
  }
  function hideError() {
    errorBanner.style.display = "none";
    if (currentErrorId) {
      ErrorManager.dismissError(currentErrorId);
      currentErrorId = null;
    }
  }
  async function handleErrorAction(action) {
    console.log("[Popup] Handling error action:", action);
    switch (action) {
      case "start_proxy":
        hideError();
        await startProxyServer();
        break;
      case "restart_proxy":
        hideError();
        await restartProxyServer();
        break;
      case "check_proxy_status":
        hideError();
        const health = await ProxyHealthMonitor.forceCheck();
        displayProxyHealth(health);
        break;
      case "run_diagnostics":
        hideError();
        console.log("[Popup] Diagnostics not yet implemented");
        break;
      case "retry_scan":
        hideError();
        console.log("[Popup] Retry scan - handled by web app");
        break;
      case "refresh_page":
        window.location.reload();
        break;
      case "reload_extension":
        chrome.runtime.reload();
        break;
      default:
        console.warn("[Popup] Unknown action:", action);
    }
  }
  function displayProxyHealth(health) {
    if (health.isRunning) {
      const responseTime = health.responseTime || 0;
      console.log(`[Popup] Proxy is healthy (${responseTime}ms response time)`);
      statusDescription.textContent = `Proxy responding in ${responseTime}ms`;
      statusDescription.style.color = "var(--status-success)";
    } else {
      console.log("[Popup] Proxy health check failed");
      const error = ErrorTranslator.translateProxyError(
        new Error("Proxy health check failed")
      );
      displayError(error);
    }
  }
  async function restartProxyServer() {
    try {
      console.log("[Popup] Restarting proxy server...");
      startProxyBtn.disabled = true;
      startProxyText.textContent = "Restarting...";
      await chrome.runtime.sendMessage({
        command: "restart_proxy"
      });
      await new Promise((resolve) => setTimeout(resolve, 3e3));
      const health = await ProxyHealthMonitor.forceCheck();
      if (health.isRunning) {
        console.log("[Popup] Proxy restarted successfully");
        updateConnectionStatus(true, true);
      } else {
        throw new Error("Proxy failed to restart");
      }
    } catch (error) {
      console.error("[Popup] Failed to restart proxy:", error);
      const errorDetails = ErrorTranslator.translateProxyError(error);
      displayError(errorDetails);
    } finally {
      startProxyBtn.disabled = false;
      startProxyText.textContent = "Start Proxy Server";
    }
  }
  async function checkProxyServer() {
    try {
      const response = await fetch(PROXY_HEALTH_URL, {
        method: "GET",
        signal: AbortSignal.timeout(3e3)
      });
      if (response.ok) {
        const data = await response.json();
        return data.status === "ok";
      }
      return false;
    } catch (error) {
      console.log("[Popup] Proxy server check failed:", error.message);
      return false;
    }
  }
  async function checkWebApp() {
    try {
      const response = await fetch(WEB_APP_URL, {
        method: "HEAD",
        mode: "no-cors",
        signal: AbortSignal.timeout(5e3)
      });
      return true;
    } catch (error) {
      console.log("[Popup] Web app check failed:", error.message);
      return false;
    }
  }
  function updateConnectionStatus(proxyConnected, webAppConnected) {
    proxyStatus.classList.remove("checking");
    if (proxyConnected) {
      proxyStatus.textContent = "Running";
      proxyStatus.className = "status-item-value connected";
    } else {
      proxyStatus.textContent = "Not Running";
      proxyStatus.className = "status-item-value disconnected";
    }
    webAppStatus.classList.remove("checking");
    if (webAppConnected) {
      webAppStatus.textContent = "Reachable";
      webAppStatus.className = "status-item-value connected";
    } else {
      webAppStatus.textContent = "Not Reachable";
      webAppStatus.className = "status-item-value disconnected";
    }
    const bothConnected = proxyConnected && webAppConnected;
    const partialConnection = proxyConnected || webAppConnected;
    if (bothConnected) {
      statusDot.className = "status-dot connected";
      statusText.textContent = "Connected";
      statusDescription.textContent = "All systems operational";
      setupInstructions.style.display = "none";
      openWebAppBtn.disabled = false;
      startProxyBtn.style.display = "none";
    } else if (partialConnection) {
      statusDot.className = "status-dot partial";
      statusText.textContent = "Partial Connection";
      statusDescription.textContent = "Connection incomplete";
      setupInstructions.style.display = "block";
      const instructionsText = document.getElementById("instructions-text");
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
        startProxyBtn.style.display = "flex";
      } else {
        instructionsText.innerHTML = `
        <p><strong>Web app is not reachable.</strong> The proxy server is running, but you need the web interface to deploy cameras.</p>
        <ol style="margin: 8px 0; padding-left: 20px; font-size: 12px;">
          <li>Check your internet connection</li>
          <li>Try opening <a href="${WEB_APP_URL}" target="_blank">${WEB_APP_URL}</a> in a new tab</li>
        </ol>
      `;
        startProxyBtn.style.display = "none";
      }
      openWebAppBtn.disabled = !webAppConnected;
    } else {
      statusDot.className = "status-dot disconnected";
      statusText.textContent = "Not Connected";
      statusDescription.textContent = "Unable to connect";
      setupInstructions.style.display = "block";
      const instructionsText = document.getElementById("instructions-text");
      instructionsText.innerHTML = `
      <p><strong>Both proxy server and web app are unreachable.</strong></p>
      <p>Click the button below to automatically install the proxy server:</p>
    `;
      startProxyBtn.style.display = "flex";
      openWebAppBtn.disabled = true;
      const error = ErrorTranslator.translateProxyError(
        new Error("Connection refused")
      );
      displayError(error);
    }
  }
  async function startProxyServer() {
    try {
      startProxyBtn.disabled = true;
      startProxyText.textContent = "Starting...";
      startProxyStatusEl.style.display = "block";
      startProxyStatusEl.className = "status-message info";
      startProxyStatusEl.textContent = "Installing proxy server...";
      const response = await chrome.runtime.sendMessage({
        command: "install_proxy"
      });
      if (response && response.success) {
        startProxyStatusEl.className = "status-message success";
        startProxyStatusEl.textContent = "\u2713 Proxy server installed and started successfully!";
        setTimeout(async () => {
          const proxyConnected = await checkProxyServer();
          if (proxyConnected) {
            const webAppConnected = await checkWebApp();
            updateConnectionStatus(proxyConnected, webAppConnected);
            hideError();
          } else {
            startProxyStatusEl.className = "status-message error";
            startProxyStatusEl.textContent = "\u26A0 Installation completed but proxy is not responding. Try restarting your computer.";
          }
          startProxyBtn.disabled = false;
          startProxyText.textContent = "Start Proxy Server";
        }, 2e3);
      } else {
        throw new Error(response?.error || "Unknown error");
      }
    } catch (error) {
      console.error("[Popup] Failed to start proxy:", error);
      const errorDetails = ErrorTranslator.translateProxyError(error);
      displayError(errorDetails);
      startProxyStatusEl.className = "status-message error";
      startProxyStatusEl.textContent = `\u2717 Error: ${error.message}`;
      startProxyBtn.disabled = false;
      startProxyText.textContent = "Retry Installation";
    }
  }
  async function initialize() {
    console.log("[Popup] Initializing...");
    const extensionId = chrome.runtime.id;
    extensionIdEl.textContent = extensionId;
    openWebAppBtn.href = WEB_APP_URL;
    ErrorManager.onError((error) => {
      console.log("[Popup] Error event:", error.title);
      displayError(error);
    });
    ProxyHealthMonitor.onHealthChange((health, status) => {
      console.log("[Popup] Proxy health changed:", status, health);
      const isRunning = status === "healthy" /* HEALTHY */ || status === "degraded" /* DEGRADED */;
      proxyStatus.classList.remove("checking");
      if (isRunning) {
        proxyStatus.textContent = status === "degraded" /* DEGRADED */ ? "Slow" : "Running";
        proxyStatus.className = `status-item-value ${status === "degraded" /* DEGRADED */ ? "warning" : "connected"}`;
      } else {
        proxyStatus.textContent = "Not Running";
        proxyStatus.className = "status-item-value disconnected";
      }
    });
    console.log("[Popup] Checking connections...");
    const [proxyConnected, webAppConnected] = await Promise.all([
      checkProxyServer(),
      checkWebApp()
    ]);
    console.log("[Popup] Proxy:", proxyConnected ? "Connected" : "Not Connected");
    console.log("[Popup] Web App:", webAppConnected ? "Reachable" : "Not Reachable");
    updateConnectionStatus(proxyConnected, webAppConnected);
    setInterval(async () => {
      const [proxy, webApp] = await Promise.all([
        checkProxyServer(),
        checkWebApp()
      ]);
      updateConnectionStatus(proxy, webApp);
    }, 1e4);
    ProxyHealthMonitor.startMonitoring();
  }
  openWebAppBtn.addEventListener("click", () => {
    console.log("[Popup] Opening web app at:", WEB_APP_URL);
  });
  startProxyBtn.addEventListener("click", () => {
    console.log("[Popup] User clicked start proxy button");
    startProxyServer();
  });
  errorDismissBtn.addEventListener("click", () => {
    console.log("[Popup] User dismissed error");
    hideError();
  });
  errorActionBtn.addEventListener("click", () => {
    const action = errorActionBtn.getAttribute("data-action");
    console.log("[Popup] User clicked error action:", action);
    handleErrorAction(action);
  });
  initialize();
})();
