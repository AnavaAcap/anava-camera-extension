/**
 * Camera interface - matches Electron installer types
 */
export interface Camera {
  id: string;
  ip: string;
  port: number;
  protocol: 'http' | 'https';
  type: string;
  model: string;
  manufacturer: string;
  mac: string | null;
  serialNumber?: string;
  deviceId?: string; // For license activation
  deviceType?: 'camera' | 'speaker' | 'intercom' | 'access-control' | 'system-device' | 'bodyworn' | 'mounting-hardware' | 'other' | 'unknown';
  capabilities: string[];
  discoveredAt: string;
  status: 'accessible' | 'requires_auth';
  credentials?: {
    username: string;
    password: string;
  };
  rtspUrl?: string;
  httpUrl: string;
  authenticated?: boolean;
  // Firmware support tracking
  firmwareVersion?: string;
  isSupported?: boolean;
  unsupportedReason?: string;
}

/**
 * Camera authentication result - matches Electron installer types
 */
export interface CameraAuthResult {
  success: boolean;
  accessible: boolean;
  authRequired: boolean;
  authMethod?: 'basic' | 'digest';
  deviceType?: 'camera' | 'speaker' | 'intercom' | 'access-control' | 'system-device' | 'bodyworn' | 'mounting-hardware' | 'other' | 'unknown';
  model?: string;
  manufacturer?: string;
  productType?: string;
  serialNumber?: string;
  deviceId?: string;
  protocol?: 'http' | 'https';
  port?: number;
  reason?: string;
  error?: string;
  // Firmware support information
  firmwareVersion?: string;
  isSupported?: boolean;
  unsupportedReason?: string;
}

/**
 * Device type detection based on model prefix
 * Ported from Electron installer: fastNetworkScanner.ts
 */
export function getDeviceType(prodNbr: string): Camera['deviceType'] {
  if (!prodNbr) return 'unknown';

  const prefix = prodNbr.charAt(0).toUpperCase();

  // M, P, Q = Camera
  if (['M', 'P', 'Q'].includes(prefix)) return 'camera';

  // C = Speaker
  if (prefix === 'C') return 'speaker';

  // I = Intercom
  if (prefix === 'I') return 'intercom';

  // A = Access Control
  if (prefix === 'A') return 'access-control';

  return 'unknown';
}
