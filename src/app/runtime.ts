/**
 * Component 2: Runtime (app)
 * 
 * HTTP service that accepts chat requests and routes them through
 * the failover pool with automatic provider switching.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { FailoverPool } from './failover-pool.js';
import { Logger } from '../shared/logger.js';
import { loadConfig, type AppConfig } from '../shared/config.js';
import {
  type PoolConfig,
  type PoolProfile,
  type ChatRequest,
  type ChatResponse,
  type PoolStatus,
} from '../shared/types.js';

export class Runtime {
  private config: AppConfig;
  private logger: Logger;
  private pool: FailoverPool | null = null;
  private poolConfig: PoolConfig | null = null;
  private configMtime: number = 0;
  private hotReloadTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: AppConfig) {
    this.config = config || loadConfig();
    this.logger = new Logger('runtime', this.config.logLevel as any);
  }

  /**
   * Initialize the runtime: load pool config and set up hot-reload.
   */
  async init(): Promise<void> {
    this.logger.info('Initializing runtime', {
      poolConfigPath: this.config.poolConfigPath,
      poolStatePath: this.config.poolStatePath,
    });

    await this.loadAndCreatePool();
    this.startHotReload();
  }

  /**
   * Load pool-config.json and create the FailoverPool.
   */
  private async loadAndCreatePool(): Promise<void> {
    const configPath = path.resolve(this.config.poolConfigPath);

    if (!fs.existsSync(configPath)) {
      this.logger.error('pool-config.json not found. Run sync first.');
      throw new Error('pool-config.json not found');
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config: PoolConfig = JSON.parse(content);

    if (!config.profiles || config.profiles.length === 0) {
      this.logger.error('pool-config.json has no profiles');
      throw new Error('No profiles in pool-config.json');
    }

    this.poolConfig = config;

    // Map profiles to FailoverPool format
    const profiles = config.profiles.map(p => ({
      id: p.id,
      provider: p.provider,
      apiKey: p.apiKey,
      model: p.model,
      baseUrl: p.baseUrl || this.getDefaultBaseUrl(p.provider),
    }));

    this.pool = new FailoverPool(profiles, path.resolve(this.config.poolStatePath));

    // Track mtime for hot-reload
    const stat = fs.statSync(configPath);
    this.configMtime = stat.mtimeMs;

    this.logger.info('Pool initialized', {
      profilesCount: profiles.length,
      profileIds: profiles.map(p => p.id),
    });
  }

  /**
   * Start hot-reload: periodically check if pool-config.json changed.
   */
  private startHotReload(): void {
    this.hotReloadTimer = setInterval(async () => {
      try {
        const configPath = path.resolve(this.config.poolConfigPath);
        if (!fs.existsSync(configPath)) return;

        const stat = fs.statSync(configPath);
        if (stat.mtimeMs > this.configMtime) {
          this.logger.info('pool-config.json changed, reloading pool');
          await this.loadAndCreatePool();
        }
      } catch (err) {
        this.logger.error('Hot-reload check failed', { error: String(err) });
      }
    }, this.config.hotReloadIntervalMs);
  }

  /**
   * Stop the runtime and clean up.
   */
  shutdown(): void {
    if (this.hotReloadTimer) {
      clearInterval(this.hotReloadTimer);
      this.hotReloadTimer = null;
    }
    this.logger.info('Runtime shut down');
  }

  /**
   * Execute a chat request through the pool with failover.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.pool) {
      throw new Error('Pool not initialized');
    }

    this.logger.info('Processing chat request', {
      messageCount: request.messages.length,
    });

    const response = await this.pool.chat(request);

    this.logger.info('Chat request completed', {
      provider: response.provider,
      model: response.model,
      attempts: response.attempts,
      failedProfiles: response.failedProfiles,
      durationMs: response.durationMs,
    });

    return response;
  }

  /**
   * Get default base URL for a provider.
   */
  private getDefaultBaseUrl(provider: string): string {
    const urls: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1',
      gemini: 'https://generativelanguage.googleapis.com/v1beta',
      openrouter: 'https://openrouter.ai/api/v1',
      nvidia: 'https://integrate.api.nvidia.com/v1',
      mistral: 'https://api.mistral.ai/v1',
      cohere: 'https://api.cohere.com/v2',
      huggingface: 'https://router.huggingface.co/v1',
      cloudflare: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run',
      kilo: 'https://api.kilo.ai/api/gateway',
      zai: 'https://open.bigmodel.cn/api/paas/v4',
      ollama: 'https://ollama.com/api',
      ovhcloud: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
      siliconflow: 'https://api.siliconflow.cn/v1',
      llm7: 'https://api.llm7.io/v1',
      modelscope: 'https://api-inference.modelscope.cn/v1',
      aionlabs: 'https://api.aionlabs.ai/v1',
    };
    return urls[provider] || 'https://api.openai.com/v1';
  }

  /**
   * Get current pool status.
   */
  getStatus(): PoolStatus | null {
    if (!this.pool) return null;

    const rawStatus = this.pool.getStatus();
    return {
      profiles: rawStatus.profiles,
      totalAvailable: rawStatus.totalAvailable,
      totalInCooldown: rawStatus.totalInCooldown,
    };
  }
}

/**
 * Create and start the HTTP server.
 */
export function createServer(runtime: Runtime, config: AppConfig): http.Server {
  const logger = new Logger('server', config.logLevel as any);

  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    // Pool status
    if (req.method === 'GET' && req.url === '/status') {
      const status = runtime.getStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status || { error: 'Pool not initialized' }));
      return;
    }

    // Chat endpoint
    if (req.method === 'POST' && req.url === '/chat') {
      try {
        const body = await readBody(req);
        const request: ChatRequest = JSON.parse(body);

        if (!request.messages || !Array.isArray(request.messages)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'messages array is required' }));
          return;
        }

        const response = await runtime.chat(request);
        const duration = Date.now() - startTime;

        logger.info('Chat request completed', {
          provider: response.provider,
          model: response.model,
          attempts: response.attempts,
          failedProfiles: response.failedProfiles,
          durationMs: duration,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err) {
        const duration = Date.now() - startTime;
        logger.error('Chat request failed', { error: String(err), durationMs: duration });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use POST /chat, GET /status, or GET /health' }));
  });

  return server;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// CLI entry point
export async function startRuntime(): Promise<void> {
  const config = loadConfig();
  const runtime = new Runtime(config);
  
  try {
    await runtime.init();
  } catch (err) {
    console.error('Failed to initialize runtime:', err);
    process.exit(1);
  }

  const server = createServer(runtime, config);
  
  server.listen(config.port, () => {
    const logger = new Logger('server', config.logLevel as any);
    logger.info(`Runtime server listening on port ${config.port}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    runtime.shutdown();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    runtime.shutdown();
    server.close();
    process.exit(0);
  });
}

// Allow direct execution
if (process.argv[1]?.endsWith('runtime.ts') || process.argv[1]?.endsWith('runtime.js') ||
    process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startRuntime().catch(err => {
    console.error('Fatal runtime error:', err);
    process.exit(1);
  });
}
