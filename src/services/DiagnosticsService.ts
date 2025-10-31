/**
 * DiagnosticsService - System health diagnostics and troubleshooting
 *
 * Provides comprehensive system checks:
 * - Proxy server status
 * - Port availability
 * - Network connectivity
 * - Extension health
 * - Common configuration issues
 */

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  message: string;
  details?: string;
  fix?: {
    label: string;
    action: string;
  };
}

export interface DiagnosticReport {
  timestamp: number;
  overallStatus: 'healthy' | 'issues' | 'critical';
  checks: DiagnosticCheck[];
  systemInfo: {
    extensionVersion: string;
    browser: string;
    platform: string;
  };
}

class DiagnosticsServiceClass {
  private static instance: DiagnosticsServiceClass;

  private readonly PROXY_URL = 'http://127.0.0.1:9876';
  private readonly PROXY_PORT = 9876;

  private constructor() {}

  static getInstance(): DiagnosticsServiceClass {
    if (!DiagnosticsServiceClass.instance) {
      DiagnosticsServiceClass.instance = new DiagnosticsServiceClass();
    }
    return DiagnosticsServiceClass.instance;
  }

  /**
   * Run full diagnostic suite
   */
  async runDiagnostics(): Promise<DiagnosticReport> {
    console.log('[Diagnostics] Running full diagnostic suite...');

    const checks: DiagnosticCheck[] = [];

    // Run all checks
    checks.push(await this.checkProxyServer());
    checks.push(await this.checkProxyPort());
    checks.push(await this.checkNetworkConnectivity());
    checks.push(await this.checkExtensionHealth());
    checks.push(await this.checkStorageAccess());

    // Determine overall status
    const hasFailures = checks.some(c => c.status === 'fail');
    const hasWarnings = checks.some(c => c.status === 'warning');
    const overallStatus = hasFailures ? 'critical' : hasWarnings ? 'issues' : 'healthy';

    const report: DiagnosticReport = {
      timestamp: Date.now(),
      overallStatus,
      checks,
      systemInfo: {
        extensionVersion: chrome.runtime.getManifest().version,
        browser: this.detectBrowser(),
        platform: this.detectPlatform()
      }
    };

    console.log('[Diagnostics] Report:', report);
    return report;
  }

  /**
   * Check if proxy server is running and responding
   */
  private async checkProxyServer(): Promise<DiagnosticCheck> {
    try {
      const startTime = Date.now();
      const response = await fetch(`${this.PROXY_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();

        if (responseTime > 1000) {
          return {
            name: 'Proxy Server Response',
            status: 'warning',
            message: `Proxy server is running but slow (${responseTime}ms)`,
            details: 'Response time exceeds 1 second. This may cause delays during camera operations.'
          };
        }

        return {
          name: 'Proxy Server',
          status: 'pass',
          message: `Running (${responseTime}ms response time)`,
          details: JSON.stringify(data, null, 2)
        };
      } else {
        return {
          name: 'Proxy Server',
          status: 'fail',
          message: `Server returned HTTP ${response.status}`,
          details: 'Proxy server is reachable but returned an error response.',
          fix: {
            label: 'Restart Proxy',
            action: 'restart_proxy'
          }
        };
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        return {
          name: 'Proxy Server',
          status: 'fail',
          message: 'Timeout - proxy not responding',
          details: 'The proxy server did not respond within 3 seconds.',
          fix: {
            label: 'Restart Proxy',
            action: 'restart_proxy'
          }
        };
      }

      return {
        name: 'Proxy Server',
        status: 'fail',
        message: 'Not running',
        details: error.message || String(error),
        fix: {
          label: 'Start Proxy',
          action: 'start_proxy'
        }
      };
    }
  }

  /**
   * Check if proxy port is available or in use
   */
  private async checkProxyPort(): Promise<DiagnosticCheck> {
    try {
      // Query background script to check port status
      const response = await chrome.runtime.sendMessage({
        command: 'check_proxy_instances'
      });

      if (response && response.multipleInstances) {
        return {
          name: 'Port Availability',
          status: 'fail',
          message: `Port ${this.PROXY_PORT} has multiple processes`,
          details: `Found ${response.processCount} processes using port ${this.PROXY_PORT}. This indicates duplicate proxy instances.`,
          fix: {
            label: 'Kill Duplicates',
            action: 'kill_duplicate_proxies'
          }
        };
      }

      if (response && response.inUse) {
        return {
          name: 'Port Availability',
          status: 'pass',
          message: `Port ${this.PROXY_PORT} in use by proxy server`,
          details: 'Port is correctly occupied by the Anava proxy server.'
        };
      }

      return {
        name: 'Port Availability',
        status: 'warning',
        message: `Port ${this.PROXY_PORT} not in use`,
        details: 'No process is listening on the proxy port. The proxy server may not be running.'
      };
    } catch (error: any) {
      return {
        name: 'Port Availability',
        status: 'info',
        message: 'Unable to check port status',
        details: error.message || String(error)
      };
    }
  }

  /**
   * Check basic network connectivity
   */
  private async checkNetworkConnectivity(): Promise<DiagnosticCheck> {
    try {
      // Test connectivity to public web app
      const response = await fetch('https://anava-ai.web.app/', {
        method: 'HEAD',
        mode: 'no-cors',
        signal: AbortSignal.timeout(5000)
      });

      return {
        name: 'Network Connectivity',
        status: 'pass',
        message: 'Internet connection active',
        details: 'Successfully reached anava-ai.web.app'
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          name: 'Network Connectivity',
          status: 'warning',
          message: 'Slow internet connection',
          details: 'Connection to web app timed out after 5 seconds.'
        };
      }

      return {
        name: 'Network Connectivity',
        status: 'fail',
        message: 'No internet connection',
        details: error.message || String(error),
        fix: {
          label: 'Check Connection',
          action: 'check_network'
        }
      };
    }
  }

  /**
   * Check extension health
   */
  private async checkExtensionHealth(): Promise<DiagnosticCheck> {
    try {
      // Test communication with background script
      const response = await chrome.runtime.sendMessage({
        command: 'health_check'
      });

      if (response && response.success) {
        return {
          name: 'Extension Background',
          status: 'pass',
          message: 'Background service worker active',
          details: 'Extension background script is responding normally.'
        };
      } else {
        return {
          name: 'Extension Background',
          status: 'warning',
          message: 'Background service worker responded with error',
          details: response?.error || 'Unknown error from background script',
          fix: {
            label: 'Reload Extension',
            action: 'reload_extension'
          }
        };
      }
    } catch (error: any) {
      if (error.message?.includes('Extension context invalidated')) {
        return {
          name: 'Extension Background',
          status: 'fail',
          message: 'Extension was reloaded',
          details: 'The extension context was invalidated. Any in-progress operations were cancelled.',
          fix: {
            label: 'Refresh Page',
            action: 'refresh_page'
          }
        };
      }

      return {
        name: 'Extension Background',
        status: 'fail',
        message: 'Background service worker not responding',
        details: error.message || String(error),
        fix: {
          label: 'Reload Extension',
          action: 'reload_extension'
        }
      };
    }
  }

  /**
   * Check storage access
   */
  private async checkStorageAccess(): Promise<DiagnosticCheck> {
    try {
      // Test read access
      await chrome.storage.local.get(['test']);

      // Test write access
      const testKey = `diagnostic_test_${Date.now()}`;
      await chrome.storage.local.set({ [testKey]: 'test_value' });

      // Test delete access
      await chrome.storage.local.remove([testKey]);

      return {
        name: 'Storage Access',
        status: 'pass',
        message: 'Storage read/write working',
        details: 'Extension has proper access to chrome.storage.local'
      };
    } catch (error: any) {
      return {
        name: 'Storage Access',
        status: 'fail',
        message: 'Storage access denied',
        details: error.message || String(error),
        fix: {
          label: 'Check Permissions',
          action: 'check_permissions'
        }
      };
    }
  }

  /**
   * Detect browser name
   */
  private detectBrowser(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Edg/')) return 'Microsoft Edge';
    if (userAgent.includes('Chrome/')) return 'Google Chrome';
    if (userAgent.includes('Firefox/')) return 'Mozilla Firefox';
    if (userAgent.includes('Safari/')) return 'Safari';
    return 'Unknown';
  }

  /**
   * Detect platform
   */
  private detectPlatform(): string {
    const platform = navigator.platform;
    if (platform.includes('Mac')) return 'macOS';
    if (platform.includes('Win')) return 'Windows';
    if (platform.includes('Linux')) return 'Linux';
    return platform || 'Unknown';
  }

  /**
   * Export diagnostic report as text
   */
  exportReport(report: DiagnosticReport): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('ANAVA EXTENSION DIAGNOSTIC REPORT');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Generated: ${new Date(report.timestamp).toLocaleString()}`);
    lines.push(`Overall Status: ${report.overallStatus.toUpperCase()}`);
    lines.push('');

    lines.push('SYSTEM INFORMATION');
    lines.push('-'.repeat(60));
    lines.push(`Extension Version: ${report.systemInfo.extensionVersion}`);
    lines.push(`Browser: ${report.systemInfo.browser}`);
    lines.push(`Platform: ${report.systemInfo.platform}`);
    lines.push('');

    lines.push('DIAGNOSTIC CHECKS');
    lines.push('-'.repeat(60));

    for (const check of report.checks) {
      const statusEmoji = {
        pass: '✓',
        fail: '✗',
        warning: '⚠',
        info: 'ℹ'
      }[check.status];

      lines.push(`${statusEmoji} ${check.name}`);
      lines.push(`  Status: ${check.status.toUpperCase()}`);
      lines.push(`  Message: ${check.message}`);

      if (check.details) {
        lines.push(`  Details: ${check.details}`);
      }

      if (check.fix) {
        lines.push(`  Suggested Fix: ${check.fix.label}`);
      }

      lines.push('');
    }

    lines.push('='.repeat(60));
    lines.push('END OF REPORT');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }
}

// Singleton instance
export const DiagnosticsService = DiagnosticsServiceClass.getInstance();
