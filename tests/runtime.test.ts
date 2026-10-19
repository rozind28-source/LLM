/**
 * Tests for the Runtime component.
 * Includes mock provider HTTP server for integration testing.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Runtime, createServer } from '../src/app/runtime.js';
import { classifyError, FailoverError } from 'llm-failover';
import type { PoolConfig, ChatRequest } from '../src/shared/types.js';

// ============================================================
// Error classification tests
// ============================================================

describe('Error Classification', () => {
  it('should classify 429 as rate_limit', () => {
    const error = new Error('Too many requests') as Error & { status?: number };
    error.status = 429;
    const reason = classifyError(error);
    expect(reason).toBe('rate_limit');
  });

  it('should classify 401 as auth', () => {
    const error = new Error('Unauthorized') as Error & { status?: number };
    error.status = 401;
    const reason = classifyError(error);
    expect(reason).toBe('auth');
  });

  it('should classify 403 as auth_permanent', () => {
    const error = new Error('Forbidden') as Error & { status?: number };
    error.status = 403;
    const reason = classifyError(error);
    expect(reason).toBe('auth_permanent');
  });

  it('should classify 500 as unknown', () => {
    const error = new Error('Internal Server Error') as Error & { status?: number };
    error.status = 500;
    const reason = classifyError(error);
    expect(reason).toBe('unknown');
  });

  it('should classify FailoverError with explicit reason', () => {
    const error = new FailoverError('Rate limited', { reason: 'rate_limit' });
    const reason = classifyError(error);
    expect(reason).toBe('rate_limit');
  });
});

// ============================================================
// Mock Provider Server
// ============================================================

interface MockBehavior {
  statusCode: number;
  responseBody: object;
  delay?: number;
}

class MockProvider {
  private server: http.Server;
  private behaviors: MockBehavior[] = [];
  private callCount = 0;
  port: number;

  constructor(behaviors: MockBehavior[]) {
    this.behaviors = behaviors;
    this.server = http.createServer((req, res) => {
      const behavior = this.behaviors[this.callCount] || this.behaviors[this.behaviors.length - 1];
      this.callCount++;

      if (behavior.delay) {
        setTimeout(() => {
          res.writeHead(behavior.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(behavior.responseBody));
        }, behavior.delay);
      } else {
        res.writeHead(behavior.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(behavior.responseBody));
      }
    });
    this.port = 0;
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address() as any;
        this.port = addr.port;
        resolve(this.port);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }
}

// ============================================================
// Runtime Integration Tests
// ============================================================

describe('Runtime Integration', () => {
  const tmpDir = path.join(process.cwd(), '.test-tmp-runtime');
  const poolConfigPath = path.join(tmpDir, 'pool-config.json');
  const poolStatePath = path.join(tmpDir, 'pool-state.json');
  
  let mockProvider1: MockProvider;
  let mockProvider2: MockProvider;
  let port1: number;
  let port2: number;

  beforeAll(async () => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Start two mock providers
    mockProvider1 = new MockProvider([
      { statusCode: 200, responseBody: { choices: [{ message: { content: 'Response from provider 1' } }] } },
    ]);
    mockProvider2 = new MockProvider([
      { statusCode: 200, responseBody: { choices: [{ message: { content: 'Response from provider 2' } }] } },
    ]);

    port1 = await mockProvider1.start();
    port2 = await mockProvider2.start();
  });

  afterAll(async () => {
    await mockProvider1.stop();
    await mockProvider2.stop();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    mockProvider1.resetCallCount();
    mockProvider2.resetCallCount();
  });

  function writePoolConfig(profiles: Array<{ id: string; provider: string; apiKey: string; model: string; baseUrl: string }>) {
    const config: PoolConfig = {
      profiles,
      lastSynced: new Date().toISOString(),
    };
    fs.writeFileSync(poolConfigPath, JSON.stringify(config, null, 2));
  }

  it('should successfully call first provider', async () => {
    writePoolConfig([
      { id: 'test-1', provider: 'test1', apiKey: 'key1', model: 'model1', baseUrl: `http://127.0.0.1:${port1}` },
      { id: 'test-2', provider: 'test2', apiKey: 'key2', model: 'model2', baseUrl: `http://127.0.0.1:${port2}` },
    ]);

    const runtime = new Runtime({
      keysPath: '',
      poolConfigPath,
      catalogUrl: '',
      poolStatePath,
      logLevel: 'error',
      port: 3002,
      hotReloadIntervalMs: 60000,
    });

    await runtime.init();

    const request: ChatRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const response = await runtime.chat(request);
    
    expect(response.content).toBe('Response from provider 1');
    expect(response.attempts).toBe(1);
    expect(response.failedProfiles).toHaveLength(0);

    runtime.shutdown();
  });

  it('should failover to second provider on 429', async () => {
    // Provider 1 returns 429, Provider 2 returns success
    const failProvider = new MockProvider([
      { statusCode: 429, responseBody: { error: 'Rate limit exceeded' } },
    ]);
    const successProvider = new MockProvider([
      { statusCode: 200, responseBody: { choices: [{ message: { content: 'Fallback response' } }] } },
    ]);

    const failPort = await failProvider.start();
    const successPort = await successProvider.start();

    writePoolConfig([
      { id: 'fail-1', provider: 'fail', apiKey: 'key1', model: 'model1', baseUrl: `http://127.0.0.1:${failPort}` },
      { id: 'success-1', provider: 'success', apiKey: 'key2', model: 'model2', baseUrl: `http://127.0.0.1:${successPort}` },
    ]);

    // Clean state
    if (fs.existsSync(poolStatePath)) {
      fs.unlinkSync(poolStatePath);
    }

    const runtime = new Runtime({
      keysPath: '',
      poolConfigPath,
      catalogUrl: '',
      poolStatePath,
      logLevel: 'error',
      port: 3002,
      hotReloadIntervalMs: 60000,
    });

    await runtime.init();

    const request: ChatRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const response = await runtime.chat(request);
    
    expect(response.content).toBe('Fallback response');
    expect(response.attempts).toBeGreaterThanOrEqual(2);
    expect(response.failedProfiles).toContain('fail-1');

    runtime.shutdown();
    await failProvider.stop();
    await successProvider.stop();
  });

  it('should mark profile as invalid on 401', async () => {
    const authFailProvider = new MockProvider([
      { statusCode: 401, responseBody: { error: 'Invalid API key' } },
    ]);
    const successProvider = new MockProvider([
      { statusCode: 200, responseBody: { choices: [{ message: { content: 'Success after auth fail' } }] } },
    ]);

    const authPort = await authFailProvider.start();
    const successPort = await successProvider.start();

    writePoolConfig([
      { id: 'auth-fail-1', provider: 'authfail', apiKey: 'bad-key', model: 'model1', baseUrl: `http://127.0.0.1:${authPort}` },
      { id: 'success-2', provider: 'success2', apiKey: 'good-key', model: 'model2', baseUrl: `http://127.0.0.1:${successPort}` },
    ]);

    // Clean state
    if (fs.existsSync(poolStatePath)) {
      fs.unlinkSync(poolStatePath);
    }

    const runtime = new Runtime({
      keysPath: '',
      poolConfigPath,
      catalogUrl: '',
      poolStatePath,
      logLevel: 'error',
      port: 3002,
      hotReloadIntervalMs: 60000,
    });

    await runtime.init();

    const request: ChatRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    const response = await runtime.chat(request);
    
    expect(response.content).toBe('Success after auth fail');
    expect(response.failedProfiles).toContain('auth-fail-1');

    // Check that auth-fail profile is now disabled/in cooldown
    const status = runtime.getStatus();
    const authFailProfile = status?.profiles.find(p => p.id === 'auth-fail-1');
    expect(authFailProfile?.state).toBe('disabled');

    runtime.shutdown();
    await authFailProvider.stop();
    await successProvider.stop();
  });

  it('should return pool status', async () => {
    writePoolConfig([
      { id: 'status-1', provider: 'test1', apiKey: 'key1', model: 'model1', baseUrl: `http://127.0.0.1:${port1}` },
      { id: 'status-2', provider: 'test2', apiKey: 'key2', model: 'model2', baseUrl: `http://127.0.0.1:${port2}` },
    ]);

    // Clean state
    if (fs.existsSync(poolStatePath)) {
      fs.unlinkSync(poolStatePath);
    }

    const runtime = new Runtime({
      keysPath: '',
      poolConfigPath,
      catalogUrl: '',
      poolStatePath,
      logLevel: 'error',
      port: 3002,
      hotReloadIntervalMs: 60000,
    });

    await runtime.init();

    const status = runtime.getStatus();
    expect(status).not.toBeNull();
    expect(status!.profiles).toHaveLength(2);
    expect(status!.totalAvailable).toBe(2);
    expect(status!.totalInCooldown).toBe(0);

    runtime.shutdown();
  });
});

// ============================================================
// HTTP Server Tests
// ============================================================

describe('HTTP Server', () => {
  const tmpDir = path.join(process.cwd(), '.test-tmp-server');
  const poolConfigPath = path.join(tmpDir, 'pool-config.json');
  const poolStatePath = path.join(tmpDir, 'pool-state.json');

  let server: http.Server;
  let serverPort: number;
  let mockProvider: MockProvider;
  let mockPort: number;

  beforeAll(async () => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    mockProvider = new MockProvider([
      { statusCode: 200, responseBody: { choices: [{ message: { content: 'Server test response' } }] } },
    ]);
    mockPort = await mockProvider.start();

    const config: PoolConfig = {
      profiles: [
        { id: 'srv-1', provider: 'srvtest', apiKey: 'key1', model: 'model1', baseUrl: `http://127.0.0.1:${mockPort}` },
      ],
      lastSynced: new Date().toISOString(),
    };
    fs.writeFileSync(poolConfigPath, JSON.stringify(config, null, 2));

    const runtime = new Runtime({
      keysPath: '',
      poolConfigPath,
      catalogUrl: '',
      poolStatePath,
      logLevel: 'error',
      port: 0,
      hotReloadIntervalMs: 60000,
    });

    await runtime.init();
    server = createServer(runtime, {
      keysPath: '',
      poolConfigPath,
      catalogUrl: '',
      poolStatePath,
      logLevel: 'error',
      port: 0,
      hotReloadIntervalMs: 60000,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mockProvider.stop();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should respond to health check', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('should respond to status endpoint', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profiles).toBeDefined();
    expect(data.totalAvailable).toBe(1);
  });

  it('should handle chat request', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe('Server test response');
    expect(data.attempts).toBe(1);
  });

  it('should return 400 for invalid chat request', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: true }),
    });

    expect(res.status).toBe(400);
  });

  it('should return 404 for unknown routes', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/unknown`);
    expect(res.status).toBe(404);
  });
});
