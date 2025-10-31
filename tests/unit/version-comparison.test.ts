import { describe, it, expect } from 'vitest';

/**
 * Compare two semver version strings
 * @param a First version (e.g., "2.0.0")
 * @param b Second version (e.g., "1.9.0")
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (aParts[i] < bParts[i]) return -1;
    if (aParts[i] > bParts[i]) return 1;
  }
  return 0;
}

/**
 * Check if an update is required
 * @param required Required version
 * @param actual Actual installed version
 * @returns true if actual < required (update needed)
 */
function isUpdateRequired(required: string, actual: string): boolean {
  return compareVersions(actual, required) < 0;
}

/**
 * Parse version string and validate format
 * @param version Version string to parse
 * @returns Parsed version object or null if invalid
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3])
  };
}

describe('Version Comparison', () => {
  describe('compareVersions', () => {
    it('should correctly compare major versions', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    });

    it('should correctly compare minor versions', () => {
      expect(compareVersions('1.5.0', '1.3.0')).toBe(1);
      expect(compareVersions('1.3.0', '1.5.0')).toBe(-1);
      expect(compareVersions('1.5.0', '1.5.0')).toBe(0);
    });

    it('should correctly compare patch versions', () => {
      expect(compareVersions('1.0.5', '1.0.3')).toBe(1);
      expect(compareVersions('1.0.3', '1.0.5')).toBe(-1);
      expect(compareVersions('1.0.5', '1.0.5')).toBe(0);
    });

    it('should handle complex comparisons', () => {
      expect(compareVersions('2.1.0', '1.9.9')).toBe(1);
      expect(compareVersions('1.9.9', '2.0.0')).toBe(-1);
      expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
      expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    });

    it('should handle zero versions', () => {
      expect(compareVersions('0.1.0', '0.0.9')).toBe(1);
      expect(compareVersions('0.0.1', '0.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    });
  });

  describe('isUpdateRequired', () => {
    it('should detect when update is required', () => {
      expect(isUpdateRequired('2.0.0', '1.9.0')).toBe(true);
      expect(isUpdateRequired('2.0.0', '1.0.0')).toBe(true);
      expect(isUpdateRequired('2.1.0', '2.0.9')).toBe(true);
      expect(isUpdateRequired('1.0.1', '1.0.0')).toBe(true);
    });

    it('should detect when update is not required', () => {
      expect(isUpdateRequired('2.0.0', '2.0.0')).toBe(false);
      expect(isUpdateRequired('2.0.0', '2.1.0')).toBe(false);
      expect(isUpdateRequired('2.0.0', '3.0.0')).toBe(false);
      expect(isUpdateRequired('1.5.0', '1.5.1')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isUpdateRequired('0.0.0', '0.0.0')).toBe(false);
      expect(isUpdateRequired('999.999.999', '1.0.0')).toBe(true);
      expect(isUpdateRequired('1.0.0', '999.999.999')).toBe(false);
    });
  });

  describe('parseVersion', () => {
    it('should parse valid version strings', () => {
      expect(parseVersion('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
      expect(parseVersion('2.5.3')).toEqual({ major: 2, minor: 5, patch: 3 });
      expect(parseVersion('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
    });

    it('should reject invalid version strings', () => {
      expect(parseVersion('1.0')).toBeNull();
      expect(parseVersion('1.0.0.0')).toBeNull();
      expect(parseVersion('v1.0.0')).toBeNull();
      expect(parseVersion('1.0.0-beta')).toBeNull();
      expect(parseVersion('abc')).toBeNull();
      expect(parseVersion('')).toBeNull();
    });

    it('should handle large version numbers', () => {
      expect(parseVersion('999.999.999')).toEqual({ major: 999, minor: 999, patch: 999 });
    });
  });
});
