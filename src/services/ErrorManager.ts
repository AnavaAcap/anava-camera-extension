/**
 * ErrorManager - Centralized error handling and user-friendly error messages
 *
 * This module provides:
 * - Error categorization and severity levels
 * - User-friendly error messages (no technical jargon)
 * - Error logging with context
 * - Actionable recovery suggestions
 */

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  PROXY_SERVER = 'proxy_server',
  NETWORK_SCAN = 'network_scan',
  CAMERA_AUTH = 'camera_auth',
  DEPLOYMENT = 'deployment',
  CONNECTION = 'connection',
  SYSTEM = 'system'
}

export interface ErrorDetails {
  category: ErrorCategory;
  severity: ErrorSeverity;
  title: string;
  message: string;
  technicalDetails?: string;
  suggestion?: string;
  actionButton?: {
    label: string;
    action: string; // Action ID to be handled by UI
  };
  timestamp: number;
  context?: Record<string, any>;
}

export interface ErrorLog extends ErrorDetails {
  id: string;
  dismissed: boolean;
}

class ErrorManagerClass {
  private static instance: ErrorManagerClass;
  private errorLog: ErrorLog[] = [];
  private listeners: Set<(error: ErrorLog) => void> = new Set();
  private maxLogSize = 100; // Keep last 100 errors

  private constructor() {
    this.loadErrorLog();
  }

  static getInstance(): ErrorManagerClass {
    if (!ErrorManagerClass.instance) {
      ErrorManagerClass.instance = new ErrorManagerClass();
    }
    return ErrorManagerClass.instance;
  }

  /**
   * Load error log from storage
   */
  private async loadErrorLog(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['errorLog']);
      if (result.errorLog && Array.isArray(result.errorLog)) {
        this.errorLog = result.errorLog;
      }
    } catch (error) {
      console.error('[ErrorManager] Failed to load error log:', error);
    }
  }

  /**
   * Save error log to storage
   */
  private async saveErrorLog(): Promise<void> {
    try {
      // Keep only last N errors
      const trimmedLog = this.errorLog.slice(-this.maxLogSize);
      await chrome.storage.local.set({ errorLog: trimmedLog });
      this.errorLog = trimmedLog;
    } catch (error) {
      console.error('[ErrorManager] Failed to save error log:', error);
    }
  }

  /**
   * Report an error with context
   */
  reportError(details: Omit<ErrorDetails, 'timestamp'>): void {
    const errorLog: ErrorLog = {
      ...details,
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      dismissed: false
    };

    console.error(`[ErrorManager] ${details.category}:`, details.title, details.message);
    if (details.technicalDetails) {
      console.error('[ErrorManager] Technical details:', details.technicalDetails);
    }

    this.errorLog.push(errorLog);
    this.saveErrorLog();

    // Notify all listeners
    this.listeners.forEach(listener => listener(errorLog));
  }

  /**
   * Subscribe to error events
   */
  onError(callback: (error: ErrorLog) => void): () => void {
    this.listeners.add(callback);
    // Return unsubscribe function
    return () => this.listeners.delete(callback);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(count: number = 10): ErrorLog[] {
    return this.errorLog.slice(-count).reverse();
  }

  /**
   * Get undismissed errors
   */
  getActiveErrors(): ErrorLog[] {
    return this.errorLog.filter(e => !e.dismissed).slice(-10);
  }

  /**
   * Dismiss an error
   */
  async dismissError(errorId: string): Promise<void> {
    const error = this.errorLog.find(e => e.id === errorId);
    if (error) {
      error.dismissed = true;
      await this.saveErrorLog();
    }
  }

  /**
   * Clear all errors
   */
  async clearAllErrors(): Promise<void> {
    this.errorLog = [];
    await this.saveErrorLog();
  }

  /**
   * Export error log as JSON (for support/debugging)
   */
  exportErrorLog(): string {
    return JSON.stringify({
      version: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      errors: this.errorLog
    }, null, 2);
  }
}

// Singleton instance
export const ErrorManager = ErrorManagerClass.getInstance();

/**
 * Error Translator - Convert technical errors to user-friendly messages
 */
export class ErrorTranslator {

  /**
   * Translate proxy server errors
   */
  static translateProxyError(error: any): ErrorDetails {
    const errorMessage = error.message || String(error);

    // Connection refused
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Failed to fetch')) {
      return {
        category: ErrorCategory.PROXY_SERVER,
        severity: ErrorSeverity.ERROR,
        title: 'Proxy Server Not Running',
        message: 'The local proxy server is not responding. Camera deployment requires the proxy to be running.',
        suggestion: 'Click "Start Proxy Server" below to automatically install and start the proxy.',
        actionButton: {
          label: 'Start Proxy Server',
          action: 'start_proxy'
        },
        technicalDetails: errorMessage,
        timestamp: Date.now()
      };
    }

    // Port already in use
    if (errorMessage.includes('EADDRINUSE') || errorMessage.includes('port already in use')) {
      return {
        category: ErrorCategory.PROXY_SERVER,
        severity: ErrorSeverity.WARNING,
        title: 'Proxy Server Port Conflict',
        message: 'Another process is using port 9876. This may be a duplicate proxy server.',
        suggestion: 'Run diagnostics to detect and fix port conflicts.',
        actionButton: {
          label: 'Run Diagnostics',
          action: 'run_diagnostics'
        },
        technicalDetails: errorMessage,
        timestamp: Date.now()
      };
    }

    // Timeout
    if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      return {
        category: ErrorCategory.PROXY_SERVER,
        severity: ErrorSeverity.WARNING,
        title: 'Proxy Server Timeout',
        message: 'The proxy server is taking too long to respond.',
        suggestion: 'Check if the proxy server is running and restart if needed.',
        actionButton: {
          label: 'Check Status',
          action: 'check_proxy_status'
        },
        technicalDetails: errorMessage,
        timestamp: Date.now()
      };
    }

    // Generic proxy error
    return {
      category: ErrorCategory.PROXY_SERVER,
      severity: ErrorSeverity.ERROR,
      title: 'Proxy Server Error',
      message: 'The local proxy server encountered an unexpected error.',
      suggestion: 'Try restarting the proxy server.',
      actionButton: {
        label: 'Restart Proxy',
        action: 'restart_proxy'
      },
      technicalDetails: errorMessage,
      timestamp: Date.now()
    };
  }

  /**
   * Translate network scan errors
   */
  static translateScanError(error: any, context?: { subnet?: string; scannedCount?: number }): ErrorDetails {
    const errorMessage = error.message || String(error);

    // No cameras found
    if (errorMessage.includes('no cameras') || errorMessage.toLowerCase().includes('0 cameras')) {
      return {
        category: ErrorCategory.NETWORK_SCAN,
        severity: ErrorSeverity.WARNING,
        title: 'No Cameras Found',
        message: context?.subnet
          ? `No cameras were found on network ${context.subnet}.`
          : 'No cameras were found on the network.',
        suggestion: 'Verify cameras are powered on, connected to the network, and the network range is correct.',
        actionButton: {
          label: 'Retry Scan',
          action: 'retry_scan'
        },
        technicalDetails: errorMessage,
        context,
        timestamp: Date.now()
      };
    }

    // Authentication failed
    if (errorMessage.includes('401') || errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
      return {
        category: ErrorCategory.CAMERA_AUTH,
        severity: ErrorSeverity.ERROR,
        title: 'Camera Authentication Failed',
        message: 'Unable to authenticate with cameras. Check username and password.',
        suggestion: 'Verify the camera credentials are correct.',
        actionButton: {
          label: 'Update Credentials',
          action: 'update_credentials'
        },
        technicalDetails: errorMessage,
        context,
        timestamp: Date.now()
      };
    }

    // Proxy not responding during scan
    if (errorMessage.includes('proxy') || errorMessage.includes('ECONNREFUSED')) {
      return {
        category: ErrorCategory.NETWORK_SCAN,
        severity: ErrorSeverity.ERROR,
        title: 'Scan Failed - Proxy Unavailable',
        message: 'The network scan failed because the proxy server stopped responding.',
        suggestion: 'Ensure the proxy server is running before scanning.',
        actionButton: {
          label: 'Check Proxy Status',
          action: 'check_proxy_status'
        },
        technicalDetails: errorMessage,
        context,
        timestamp: Date.now()
      };
    }

    // Generic scan error
    return {
      category: ErrorCategory.NETWORK_SCAN,
      severity: ErrorSeverity.ERROR,
      title: 'Network Scan Error',
      message: context?.scannedCount
        ? `Scan failed after checking ${context.scannedCount} IP addresses.`
        : 'The network scan encountered an unexpected error.',
      suggestion: 'Try scanning again with a smaller network range.',
      actionButton: {
        label: 'Retry Scan',
        action: 'retry_scan'
      },
      technicalDetails: errorMessage,
      context,
      timestamp: Date.now()
    };
  }

  /**
   * Translate deployment errors
   */
  static translateDeploymentError(error: any, context?: { cameraIp?: string; step?: string }): ErrorDetails {
    const errorMessage = error.message || String(error);

    // Step-specific errors
    if (errorMessage.includes('Step 1') || errorMessage.includes('Deploy ACAP')) {
      return {
        category: ErrorCategory.DEPLOYMENT,
        severity: ErrorSeverity.ERROR,
        title: 'ACAP Installation Failed',
        message: context?.cameraIp
          ? `Failed to install ACAP on camera ${context.cameraIp}.`
          : 'Failed to install the ACAP application on the camera.',
        suggestion: 'Verify the camera has enough storage space and firmware is compatible.',
        actionButton: {
          label: 'Retry Deployment',
          action: 'retry_deployment'
        },
        technicalDetails: errorMessage,
        context,
        timestamp: Date.now()
      };
    }

    if (errorMessage.includes('Step 2') || errorMessage.includes('License')) {
      return {
        category: ErrorCategory.DEPLOYMENT,
        severity: ErrorSeverity.ERROR,
        title: 'License Activation Failed',
        message: 'The camera license could not be activated.',
        suggestion: 'Verify the license key is valid and not already in use.',
        actionButton: {
          label: 'Check License',
          action: 'check_license'
        },
        technicalDetails: errorMessage,
        context,
        timestamp: Date.now()
      };
    }

    if (errorMessage.includes('Step 3') || errorMessage.includes('Start ACAP')) {
      return {
        category: ErrorCategory.DEPLOYMENT,
        severity: ErrorSeverity.ERROR,
        title: 'ACAP Failed to Start',
        message: 'The ACAP application was installed but failed to start.',
        suggestion: 'Check camera logs for errors. The camera may need to be rebooted.',
        actionButton: {
          label: 'Retry Start',
          action: 'retry_start_acap'
        },
        technicalDetails: errorMessage,
        context,
        timestamp: Date.now()
      };
    }

    if (errorMessage.includes('Step 4') || errorMessage.includes('Config')) {
      return {
        category: ErrorCategory.DEPLOYMENT,
        severity: ErrorSeverity.ERROR,
        title: 'Configuration Push Failed',
        message: 'Unable to push configuration to the camera.',
        suggestion: 'Ensure the ACAP is running and the camera is reachable.',
        actionButton: {
          label: 'Retry Configuration',
          action: 'retry_config'
        },
        technicalDetails: errorMessage,
        context,
        timestamp: Date.now()
      };
    }

    // Generic deployment error
    return {
      category: ErrorCategory.DEPLOYMENT,
      severity: ErrorSeverity.ERROR,
      title: 'Deployment Failed',
      message: context?.cameraIp
        ? `Failed to deploy to camera ${context.cameraIp}.`
        : 'Camera deployment encountered an error.',
      suggestion: 'Review error details and ensure camera is accessible.',
      actionButton: {
        label: 'Retry Deployment',
        action: 'retry_deployment'
      },
      technicalDetails: errorMessage,
      context,
      timestamp: Date.now()
    };
  }

  /**
   * Translate system errors
   */
  static translateSystemError(error: any): ErrorDetails {
    const errorMessage = error.message || String(error);

    // Extension context invalidated
    if (errorMessage.includes('Extension context invalidated')) {
      return {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.WARNING,
        title: 'Extension Reloaded',
        message: 'The extension was reloaded. Any in-progress operations were cancelled.',
        suggestion: 'Refresh the page and try again.',
        actionButton: {
          label: 'Refresh Page',
          action: 'refresh_page'
        },
        technicalDetails: errorMessage,
        timestamp: Date.now()
      };
    }

    // Chrome runtime error
    if (errorMessage.includes('chrome.runtime')) {
      return {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.ERROR,
        title: 'Extension Communication Error',
        message: 'Unable to communicate with the extension background service.',
        suggestion: 'Try reloading the extension or restarting your browser.',
        actionButton: {
          label: 'Reload Extension',
          action: 'reload_extension'
        },
        technicalDetails: errorMessage,
        timestamp: Date.now()
      };
    }

    // Generic system error
    return {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.ERROR,
      title: 'System Error',
      message: 'An unexpected system error occurred.',
      suggestion: 'Try restarting the browser or reinstalling the extension.',
      technicalDetails: errorMessage,
      timestamp: Date.now()
    };
  }
}
