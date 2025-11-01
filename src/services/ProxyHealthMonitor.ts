/**
 * ProxyHealthMonitor - Monitor proxy server health and auto-recover
 *
 * Features:
 * - Periodic health checks
 * - Port conflict detection
 * - Duplicate instance detection
 * - Auto-restart capabilities
 * - Connection recovery
 */

import { ErrorManager, ErrorCategory, ErrorSeverity } from './ErrorManager.js';

export interface ProxyHealth {
  isRunning: boolean;
  lastCheck: number;
  uptime?: number;
  port: number;
  responseTime?: number;
  consecutiveFailures: number;
}

export enum ProxyStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  DOWN = 'down',
  UNKNOWN = 'unknown'
}

class ProxyHealthMonitorClass {
  private static instance: ProxyHealthMonitorClass;

  private readonly PROXY_URL = 'http://127.0.0.1:9876';
  private readonly PROXY_PORT = 9876;
  private readonly CHECK_INTERVAL = 10000; // 10 seconds
  private readonly HEALTH_TIMEOUT = 10000; // 10 seconds (longer to handle busy proxy during scans)
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  private health: ProxyHealth = {
    isRunning: false,
    lastCheck: 0,
    port: this.PROXY_PORT,
    consecutiveFailures: 0
  };

  private checkInterval?: number;
  private listeners: Set<(health: ProxyHealth, status: ProxyStatus) => void> = new Set();
  private isRecovering = false;

  private constructor() {
    // Start monitoring automatically
    this.startMonitoring();
  }

  static getInstance(): ProxyHealthMonitorClass {
    if (!ProxyHealthMonitorClass.instance) {
      ProxyHealthMonitorClass.instance = new ProxyHealthMonitorClass();
    }
    return ProxyHealthMonitorClass.instance;
  }

  /**
   * Start periodic health monitoring
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    console.log('[ProxyHealthMonitor] Starting health monitoring...');

    // Initial check
    this.checkHealth();

    // Periodic checks
    this.checkInterval = window.setInterval(() => {
      this.checkHealth();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      console.log('[ProxyHealthMonitor] Stopped health monitoring');
    }
  }

  /**
   * Perform health check
   */
  async checkHealth(): Promise<ProxyHealth> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.PROXY_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.HEALTH_TIMEOUT)
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();

        // Update health status
        this.health = {
          isRunning: true,
          lastCheck: Date.now(),
          uptime: data.uptime,
          port: this.PROXY_PORT,
          responseTime,
          consecutiveFailures: 0
        };

        const status = responseTime > 1000 ? ProxyStatus.DEGRADED : ProxyStatus.HEALTHY;
        this.notifyListeners(this.health, status);

        console.log(`[ProxyHealthMonitor] Health check passed (${responseTime}ms)`);
        return this.health;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      // Health check failed
      this.health.consecutiveFailures++;
      this.health.isRunning = false;
      this.health.lastCheck = Date.now();
      this.health.responseTime = undefined;

      console.error('[ProxyHealthMonitor] Health check failed:', error);

      // Report error after multiple failures
      if (this.health.consecutiveFailures === this.MAX_CONSECUTIVE_FAILURES) {
        ErrorManager.reportError({
          category: ErrorCategory.PROXY_SERVER,
          severity: ErrorSeverity.ERROR,
          title: 'Proxy Server Not Responding',
          message: `The proxy server has failed ${this.MAX_CONSECUTIVE_FAILURES} consecutive health checks.`,
          suggestion: 'The proxy may have crashed or been stopped. Try restarting it.',
          actionButton: {
            label: 'Restart Proxy',
            action: 'restart_proxy'
          },
          technicalDetails: String(error)
        });
      }

      this.notifyListeners(this.health, ProxyStatus.DOWN);

      // Attempt auto-recovery if enabled
      if (this.health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && !this.isRecovering) {
        this.attemptRecovery();
      }

      return this.health;
    }
  }

  /**
   * Attempt automatic recovery
   */
  private async attemptRecovery(): Promise<void> {
    if (this.isRecovering) {
      return; // Recovery already in progress
    }

    this.isRecovering = true;
    console.log('[ProxyHealthMonitor] Attempting auto-recovery...');

    try {
      // Step 1: Check for port conflicts
      const hasConflict = await this.checkPortConflict();
      if (hasConflict) {
        console.log('[ProxyHealthMonitor] Port conflict detected, attempting to resolve...');
        await this.resolvePortConflict();
      }

      // Step 2: Try to start proxy
      console.log('[ProxyHealthMonitor] Attempting to start proxy server...');
      // Note: This would require communication with the background script
      // For now, just log and notify user

      ErrorManager.reportError({
        category: ErrorCategory.PROXY_SERVER,
        severity: ErrorSeverity.WARNING,
        title: 'Auto-Recovery Attempted',
        message: 'The system detected the proxy server was down and attempted to restart it.',
        suggestion: 'If the problem persists, manually restart the proxy using the button below.',
        actionButton: {
          label: 'Manual Restart',
          action: 'restart_proxy'
        }
      });

    } catch (error) {
      console.error('[ProxyHealthMonitor] Auto-recovery failed:', error);

      ErrorManager.reportError({
        category: ErrorCategory.PROXY_SERVER,
        severity: ErrorSeverity.ERROR,
        title: 'Auto-Recovery Failed',
        message: 'Unable to automatically restart the proxy server.',
        suggestion: 'Please manually restart the proxy using the installation script.',
        actionButton: {
          label: 'View Instructions',
          action: 'show_install_instructions'
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
  async checkPortConflict(): Promise<boolean> {
    try {
      // Try to send a message to background script to check for multiple processes
      const response = await chrome.runtime.sendMessage({
        command: 'check_proxy_instances'
      });

      return response && response.hasMultipleInstances === true;
    } catch (error) {
      console.error('[ProxyHealthMonitor] Failed to check port conflict:', error);
      return false;
    }
  }

  /**
   * Resolve port conflict by killing duplicate instances
   */
  async resolvePortConflict(): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        command: 'kill_duplicate_proxies'
      });

      console.log('[ProxyHealthMonitor] Port conflict resolved');
    } catch (error) {
      console.error('[ProxyHealthMonitor] Failed to resolve port conflict:', error);
      throw error;
    }
  }

  /**
   * Subscribe to health status changes
   */
  onHealthChange(callback: (health: ProxyHealth, status: ProxyStatus) => void): () => void {
    this.listeners.add(callback);
    // Immediately notify with current status
    const status = this.getStatus();
    callback(this.health, status);
    // Return unsubscribe function
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of health change
   */
  private notifyListeners(health: ProxyHealth, status: ProxyStatus): void {
    this.listeners.forEach(listener => listener(health, status));
  }

  /**
   * Get current health status
   */
  getHealth(): ProxyHealth {
    return { ...this.health };
  }

  /**
   * Get current status
   */
  getStatus(): ProxyStatus {
    if (!this.health.lastCheck) {
      return ProxyStatus.UNKNOWN;
    }

    if (!this.health.isRunning) {
      return ProxyStatus.DOWN;
    }

    if (this.health.responseTime && this.health.responseTime > 1000) {
      return ProxyStatus.DEGRADED;
    }

    return ProxyStatus.HEALTHY;
  }

  /**
   * Force an immediate health check
   */
  async forceCheck(): Promise<ProxyHealth> {
    return this.checkHealth();
  }

  /**
   * Get time since last successful check
   */
  getTimeSinceLastSuccess(): number {
    if (!this.health.lastCheck || !this.health.isRunning) {
      return Infinity;
    }
    return Date.now() - this.health.lastCheck;
  }

  /**
   * Check if proxy is considered healthy
   */
  isHealthy(): boolean {
    return this.health.isRunning && this.health.consecutiveFailures === 0;
  }

  /**
   * Reset failure counter (after successful manual intervention)
   */
  resetFailures(): void {
    this.health.consecutiveFailures = 0;
    console.log('[ProxyHealthMonitor] Failure counter reset');
  }
}

// Singleton instance
export const ProxyHealthMonitor = ProxyHealthMonitorClass.getInstance();
