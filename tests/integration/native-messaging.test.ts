import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('Native Messaging Protocol Integration', () => {
  let nativeHost: ChildProcess | null = null;
  const binaryPath = path.resolve(__dirname, '../../build/local-connector');

  beforeAll(() => {
    // Check if binary exists
    if (!fs.existsSync(binaryPath)) {
      throw new Error(
        `Binary not found at ${binaryPath}. Run: go build -o build/local-connector cmd/local-connector/main.go`
      );
    }
  });

  afterAll(() => {
    if (nativeHost) {
      nativeHost.kill();
      nativeHost = null;
    }
  });

  function startNativeHost(): ChildProcess {
    return spawn(binaryPath, ['--native-messaging'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  function sendMessage(host: ChildProcess, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message);
      const messageLength = Buffer.byteLength(messageStr);
      const header = Buffer.alloc(4);
      header.writeUInt32LE(messageLength, 0);

      const timeout = setTimeout(() => {
        reject(new Error('Response timeout after 5 seconds'));
      }, 5000);

      let receivedLength = false;
      let expectedLength = 0;
      let receivedData = Buffer.alloc(0);

      host.stdout?.on('data', (data: Buffer) => {
        if (!receivedLength) {
          // First 4 bytes = message length
          expectedLength = data.readUInt32LE(0);
          receivedData = data.slice(4);
          receivedLength = true;

          if (receivedData.length >= expectedLength) {
            clearTimeout(timeout);
            try {
              const jsonData = receivedData.slice(0, expectedLength).toString();
              resolve(JSON.parse(jsonData));
            } catch (e) {
              reject(new Error('Invalid JSON response'));
            }
          }
        } else {
          receivedData = Buffer.concat([receivedData, data]);
          if (receivedData.length >= expectedLength) {
            clearTimeout(timeout);
            try {
              const jsonData = receivedData.slice(0, expectedLength).toString();
              resolve(JSON.parse(jsonData));
            } catch (e) {
              reject(new Error('Invalid JSON response'));
            }
          }
        }
      });

      host.stderr?.on('data', (data: Buffer) => {
        console.error('Native host stderr:', data.toString());
      });

      host.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Send message
      host.stdin?.write(header);
      host.stdin?.write(messageStr);
    });
  }

  it('should start successfully', () => {
    nativeHost = startNativeHost();
    expect(nativeHost).toBeTruthy();
    expect(nativeHost.pid).toBeGreaterThan(0);
  });

  it('should respond to GET_VERSION', async () => {
    nativeHost = startNativeHost();
    
    const response = await sendMessage(nativeHost, { type: 'GET_VERSION' });
    
    expect(response).toHaveProperty('version');
    expect(typeof response.version).toBe('string');
    expect(response.version).toMatch(/^\d+\.\d+\.\d+$/);
    
    nativeHost.kill();
    nativeHost = null;
  });

  it('should respond to HEALTH_CHECK', async () => {
    nativeHost = startNativeHost();
    
    const response = await sendMessage(nativeHost, { type: 'HEALTH_CHECK' });
    
    expect(response).toHaveProperty('status');
    expect(response.status).toBe('ok');
    expect(response).toHaveProperty('proxyRunning');
    expect(typeof response.proxyRunning).toBe('boolean');
    
    nativeHost.kill();
    nativeHost = null;
  });

  it('should handle unknown message types gracefully', async () => {
    nativeHost = startNativeHost();
    
    const response = await sendMessage(nativeHost, { type: 'UNKNOWN_TYPE' });
    
    expect(response).toHaveProperty('error');
    expect(typeof response.error).toBe('string');
    
    nativeHost.kill();
    nativeHost = null;
  });

  it('should handle malformed JSON', async () => {
    nativeHost = startNativeHost();

    await expect(async () => {
      // Send invalid JSON by writing raw bytes
      const invalidMessage = '{ invalid json }';
      const messageLength = Buffer.byteLength(invalidMessage);
      const header = Buffer.alloc(4);
      header.writeUInt32LE(messageLength, 0);

      nativeHost?.stdin?.write(header);
      nativeHost?.stdin?.write(invalidMessage);

      // Wait for response (should be error)
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('No response')), 2000);
        nativeHost?.stdout?.once('data', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });
    }).rejects.toThrow();

    nativeHost.kill();
    nativeHost = null;
  });

  it('should handle multiple sequential messages', async () => {
    nativeHost = startNativeHost();
    
    const response1 = await sendMessage(nativeHost, { type: 'GET_VERSION' });
    expect(response1).toHaveProperty('version');
    
    const response2 = await sendMessage(nativeHost, { type: 'HEALTH_CHECK' });
    expect(response2).toHaveProperty('status');
    
    const response3 = await sendMessage(nativeHost, { type: 'GET_VERSION' });
    expect(response3).toHaveProperty('version');
    
    nativeHost.kill();
    nativeHost = null;
  });
});
