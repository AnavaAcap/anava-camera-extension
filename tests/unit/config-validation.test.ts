import { describe, it, expect } from 'vitest';

interface ConnectorConfig {
  version: string;
  extensionId: string;
  backendUrl: string;
  projectId: string;
  features: string[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateConfig(config: any): ValidationResult {
  const errors: string[] = [];

  if (!config.version || typeof config.version !== 'string') {
    errors.push('Missing or invalid version');
  }

  if (!config.extensionId || typeof config.extensionId !== 'string') {
    errors.push('Missing or invalid extensionId');
  }

  if (!config.backendUrl || typeof config.backendUrl !== 'string') {
    errors.push('Missing or invalid backendUrl');
  } else {
    try {
      const url = new URL(config.backendUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('backendUrl must use HTTP or HTTPS protocol');
      }
    } catch (e) {
      errors.push('backendUrl must be a valid URL');
    }
  }

  if (!config.projectId || typeof config.projectId !== 'string') {
    errors.push('Missing or invalid projectId');
  }

  if (!Array.isArray(config.features)) {
    errors.push('features must be an array');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

describe('Configuration Validation', () => {
  const validConfig: ConnectorConfig = {
    version: '1.0',
    extensionId: 'abc123',
    backendUrl: 'https://api.example.com',
    projectId: 'test-project',
    features: ['camera-discovery']
  };

  it('should validate a complete valid config', () => {
    const result = validateConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing version', () => {
    const config = { ...validConfig };
    delete (config as any).version;
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing or invalid version');
  });

  it('should reject invalid backendUrl', () => {
    const config = { ...validConfig, backendUrl: 'not-a-url' };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('valid URL'))).toBe(true);
  });

  it('should reject non-array features', () => {
    const config = { ...validConfig, features: 'not-an-array' as any };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('features must be an array');
  });
});
