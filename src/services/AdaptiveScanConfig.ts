/**
 * Adaptive Network Scanner Configuration
 *
 * PORTED FROM: /src/main/services/camera/adaptiveScanConfig.ts
 *
 * Provides:
 * 1. Dynamic batch size adjustment based on network performance
 * 2. User-configurable scan intensity
 * 3. Separate settings for LAN vs WAN scanning
 */

export interface ScanMetrics {
  successCount: number;
  timeoutCount: number;
  errorCount: number;
  totalAttempts: number;
  avgResponseTime: number;
}

export interface AdaptiveScanConfig {
  // Current batch size (dynamically adjusted)
  currentBatchSize: number;

  // User-configured limits
  minBatchSize: number;
  maxBatchSize: number;

  // Network type detection
  isLAN: boolean;

  // Performance thresholds
  maxErrorRate: number;
  targetErrorRate: number;

  // Timing configuration
  connectionTimeout: number;
  interBatchDelay: number;
}

export class AdaptiveScanner {
  private config: AdaptiveScanConfig;
  private performanceHistory: ScanMetrics[] = [];

  constructor(userPreferences?: Partial<AdaptiveScanConfig>) {
    // Default configuration - conservative for browser environment
    this.config = {
      currentBatchSize: 15,   // Start smaller for browser
      minBatchSize: 5,
      maxBatchSize: 30,       // Lower limit for browser
      isLAN: true,
      maxErrorRate: 0.05,     // 5% error rate triggers reduction
      targetErrorRate: 0.02,  // 2% error rate is ideal
      connectionTimeout: 3000,
      interBatchDelay: 200,   // More breathing room
      ...userPreferences
    };

    // Adjust initial batch size based on network type
    if (!this.config.isLAN) {
      this.config.currentBatchSize = Math.min(20, this.config.currentBatchSize);
    }
  }

  /**
   * Analyze scan results and adjust batch size
   */
  adjustBatchSize(metrics: ScanMetrics): number {
    this.performanceHistory.push(metrics);

    const errorRate = (metrics.errorCount + metrics.timeoutCount) / metrics.totalAttempts;
    const previousBatchSize = this.config.currentBatchSize;

    if (metrics.timeoutCount > 0 || errorRate > this.config.maxErrorRate) {
      // Network is struggling - reduce batch size
      this.config.currentBatchSize = Math.max(
        this.config.minBatchSize,
        Math.floor(this.config.currentBatchSize / 2)
      );

      console.log(`⚠️ High error rate (${(errorRate * 100).toFixed(1)}%) detected. Reducing batch size from ${previousBatchSize} to ${this.config.currentBatchSize}`);

    } else if (errorRate < this.config.targetErrorRate && metrics.avgResponseTime < 1000) {
      // Network is handling it well - increase batch size
      const increase = this.config.isLAN ? 10 : 5;
      this.config.currentBatchSize = Math.min(
        this.config.maxBatchSize,
        this.config.currentBatchSize + increase
      );

      if (this.config.currentBatchSize > previousBatchSize) {
        console.log(`✅ Good performance (${(errorRate * 100).toFixed(1)}% errors, ${metrics.avgResponseTime.toFixed(0)}ms avg). Increasing batch size from ${previousBatchSize} to ${this.config.currentBatchSize}`);
      }
    }

    return this.config.currentBatchSize;
  }

  /**
   * Get current batch size
   */
  getBatchSize(): number {
    return this.config.currentBatchSize;
  }

  /**
   * Get delay between batches (in ms)
   */
  getInterBatchDelay(): number {
    // Increase delay if we're seeing errors
    const recentMetrics = this.performanceHistory.slice(-3);
    if (recentMetrics.length > 0) {
      const avgErrorRate = recentMetrics.reduce((sum, m) =>
        sum + (m.errorCount + m.timeoutCount) / m.totalAttempts, 0
      ) / recentMetrics.length;

      if (avgErrorRate > this.config.maxErrorRate) {
        return this.config.interBatchDelay * 3;
      }
    }

    return this.config.interBatchDelay;
  }

  /**
   * Detect if we're scanning a LAN or WAN
   */
  static detectNetworkType(networkRange: string): boolean {
    // RFC 1918 private IP ranges
    const privateRanges = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
      /^192\.168\./               // 192.168.0.0/16
    ];

    const [baseIp] = networkRange.split('/');
    return privateRanges.some(regex => regex.test(baseIp));
  }

  /**
   * Get recommended configuration based on user preference level
   */
  static getPresetConfig(intensity: 'conservative' | 'balanced' | 'aggressive' | 'custom', customBatchSize?: number): Partial<AdaptiveScanConfig> {
    switch (intensity) {
      case 'conservative':
        return {
          currentBatchSize: 15,
          maxBatchSize: 30,
          maxErrorRate: 0.02,
          connectionTimeout: 7000,
          interBatchDelay: 100
        };

      case 'balanced':
        return {
          currentBatchSize: 30,
          maxBatchSize: 80,
          maxErrorRate: 0.05,
          connectionTimeout: 5000,
          interBatchDelay: 50
        };

      case 'aggressive':
        return {
          currentBatchSize: 50,
          maxBatchSize: 150,
          maxErrorRate: 0.10,
          connectionTimeout: 3000,
          interBatchDelay: 20
        };

      case 'custom':
        if (!customBatchSize || customBatchSize < 5 || customBatchSize > 200) {
          throw new Error('Custom batch size must be between 5 and 200');
        }
        return {
          currentBatchSize: customBatchSize,
          maxBatchSize: Math.min(200, customBatchSize * 2),
          minBatchSize: Math.max(5, Math.floor(customBatchSize / 3))
        };

      default:
        return {};
    }
  }

  /**
   * Get performance summary for display
   */
  getPerformanceSummary(): string {
    if (this.performanceHistory.length === 0) {
      return 'No scan data available yet';
    }

    const recent = this.performanceHistory.slice(-5);
    const avgErrorRate = recent.reduce((sum, m) =>
      sum + (m.errorCount + m.timeoutCount) / m.totalAttempts, 0
    ) / recent.length;

    const avgResponseTime = recent.reduce((sum, m) => sum + m.avgResponseTime, 0) / recent.length;
    const totalScanned = recent.reduce((sum, m) => sum + m.totalAttempts, 0);

    return `Batch size: ${this.config.currentBatchSize} | Error rate: ${(avgErrorRate * 100).toFixed(1)}% | Avg response: ${avgResponseTime.toFixed(0)}ms | Devices scanned: ${totalScanned}`;
  }
}
