/**
 * Component 1: Synchronizer (sync)
 * 
 * Loads the catalog from GitHub, reads local keys.json,
 * and generates pool-config.json for the runtime.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../shared/logger.js';
import { loadConfig, type AppConfig } from '../shared/config.js';
import {
  type CatalogData,
  type CatalogProvider,
  type KeysConfig,
  type PoolConfig,
  type PoolProfile,
  PROVIDER_KEY_MAP,
  DEFAULT_MODELS,
  NO_KEY_PROVIDERS,
} from '../shared/types.js';

export class Synchronizer {
  private config: AppConfig;
  private logger: Logger;

  constructor(config?: AppConfig) {
    this.config = config || loadConfig();
    this.logger = new Logger('sync', this.config.logLevel as any);
  }

  /**
   * Main sync entry point.
   * Returns true if sync succeeded, false otherwise.
   */
  async sync(): Promise<boolean> {
    this.logger.info('Starting synchronization', {
      catalogUrl: this.config.catalogUrl,
      keysPath: this.config.keysPath,
      poolConfigPath: this.config.poolConfigPath,
    });

    // Step 1: Load catalog
    let catalog: CatalogData;
    try {
      catalog = await this.fetchCatalog();
    } catch (err) {
      this.logger.error('Failed to fetch catalog', { error: String(err) });
      return this.handleCatalogFailure();
    }

    // Step 2: Validate catalog structure
    if (!this.validateCatalog(catalog)) {
      this.logger.error('Invalid catalog structure');
      return this.handleCatalogFailure();
    }

    // Step 3: Load keys (optional - system works without keys too)
    let keys: KeysConfig = {};
    try {
      keys = this.loadKeys();
    } catch (err) {
      this.logger.warn('keys.json not found or invalid — using only anonymous providers', { error: String(err) });
      // Continue with empty keys - anonymous providers will still work
    }

    // Step 4: Build pool config
    const poolConfig = this.buildPoolConfig(catalog, keys);

    // Step 5: Write pool config
    try {
      this.writePoolConfig(poolConfig);
      this.logger.info('Synchronization complete', {
        profilesCount: poolConfig.profiles.length,
        lastSynced: poolConfig.lastSynced,
      });
      return true;
    } catch (err) {
      this.logger.error('Failed to write pool-config.json', { error: String(err) });
      return false;
    }
  }

  /**
   * Fetch the catalog JSON from the remote URL.
   */
  async fetchCatalog(): Promise<CatalogData> {
    this.logger.debug('Fetching catalog', { url: this.config.catalogUrl });
    
    const response = await fetch(this.config.catalogUrl, {
      signal: AbortSignal.timeout(30000),
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    let data: CatalogData;
    
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON in catalog response');
    }

    return data;
  }

  /**
   * Validate that the catalog has the expected structure.
   */
  validateCatalog(catalog: unknown): catalog is CatalogData {
    if (!catalog || typeof catalog !== 'object') return false;
    const c = catalog as Record<string, unknown>;
    if (!Array.isArray(c.providers)) return false;
    if (c.providers.length === 0) return false;
    
    // Check first provider has required fields
    const first = c.providers[0] as Record<string, unknown>;
    if (!first.name || !first.baseUrl || !Array.isArray(first.models)) {
      return false;
    }
    
    return true;
  }

  /**
   * Load keys from keys.json file.
   */
  loadKeys(): KeysConfig {
    const keysPath = path.resolve(this.config.keysPath);
    
    if (!fs.existsSync(keysPath)) {
      throw new Error(`keys.json not found at ${keysPath}`);
    }

    const content = fs.readFileSync(keysPath, 'utf-8');
    const keys: KeysConfig = JSON.parse(content);

    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) {
      throw new Error('keys.json must be a JSON object');
    }

    // Log count without revealing keys
    const keyNames = Object.keys(keys);
    this.logger.info('Loaded keys.json', { providersWithKeys: keyNames.length });

    return keys;
  }

  /**
   * Build pool configuration by matching catalog providers with available keys.
   * Also adds providers that work WITHOUT API keys (anonymous access).
   */
  buildPoolConfig(catalog: CatalogData, keys: KeysConfig): PoolConfig {
    const profiles: PoolProfile[] = [];
    let matched = 0;
    let skipped = 0;
    let noKeyAdded = 0;
    const skipReasons: string[] = [];

    // Step 1: Add providers WITH keys
    for (const provider of catalog.providers) {
      const keyName = PROVIDER_KEY_MAP[provider.name];
      
      if (!keyName) {
        skipped++;
        skipReasons.push(`${provider.name}: no key mapping defined`);
        continue;
      }

      const apiKey = keys[keyName];
      if (!apiKey) {
        skipped++;
        skipReasons.push(`${provider.name}: no key provided (expected key "${keyName}")`);
        continue;
      }

      // Find the first valid model for this provider
      const model = this.selectModel(provider);
      if (!model) {
        skipped++;
        skipReasons.push(`${provider.name}: no valid models in catalog`);
        continue;
      }

      const profile: PoolProfile = {
        id: `${keyName}-1`,
        provider: keyName,
        apiKey,
        model,
        baseUrl: provider.baseUrl,
      };

      profiles.push(profile);
      matched++;
    }

    // Step 2: Add providers that work WITHOUT keys (anonymous access)
    for (const noKeyProvider of NO_KEY_PROVIDERS) {
      // Check if this provider is already in the pool (with a key)
      const alreadyExists = profiles.some(p => 
        p.provider === PROVIDER_KEY_MAP[noKeyProvider.name] ||
        p.baseUrl === noKeyProvider.baseUrl
      );
      
      if (alreadyExists) {
        this.logger.debug(`Skipping ${noKeyProvider.name} - already in pool with key`);
        continue;
      }

      // Add anonymous profile
      const profile: PoolProfile = {
        id: `${PROVIDER_KEY_MAP[noKeyProvider.name] || noKeyProvider.name.toLowerCase().replace(/\s+/g, '-')}-anon`,
        provider: PROVIDER_KEY_MAP[noKeyProvider.name] || noKeyProvider.name.toLowerCase().replace(/\s+/g, '-'),
        apiKey: 'anonymous', // Placeholder - not used for these providers
        model: noKeyProvider.model,
        baseUrl: noKeyProvider.baseUrl,
      };

      profiles.push(profile);
      noKeyAdded++;
      this.logger.info(`Added anonymous provider: ${noKeyProvider.name}`, {
        model: noKeyProvider.model,
        baseUrl: noKeyProvider.baseUrl,
      });
    }

    this.logger.info('Pool config built', {
      matched,
      noKeyAdded,
      skipped,
      totalProfiles: profiles.length,
      skipReasons: skipReasons.slice(0, 5), // Limit log size
    });

    return {
      profiles,
      lastSynced: new Date().toISOString(),
      catalogVersion: catalog.lastUpdated,
    };
  }

  /**
   * Select the best model for a provider.
   * Uses DEFAULT_MODELS if available, otherwise picks the first valid model.
   */
  private selectModel(provider: CatalogProvider): string | null {
    // Check if we have a default model for this provider
    const defaultModel = DEFAULT_MODELS[provider.name];
    if (defaultModel) {
      // Verify it exists in the catalog
      const exists = provider.models.some(m => m.id === defaultModel);
      if (exists) return defaultModel;
    }

    // Fall back to first model with a valid id
    const firstValid = provider.models.find(m => m.id !== null && m.id !== undefined);
    return firstValid?.id || null;
  }

  /**
   * Write pool config to disk.
   */
  writePoolConfig(config: PoolConfig): void {
    const configPath = path.resolve(this.config.poolConfigPath);
    const dir = path.dirname(configPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write atomically: write to temp file, then rename
    const tmpPath = configPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
    fs.renameSync(tmpPath, configPath);
  }

  /**
   * Handle catalog fetch failure — preserve existing config.
   */
  private handleCatalogFailure(): boolean {
    const configPath = path.resolve(this.config.poolConfigPath);
    
    if (fs.existsSync(configPath)) {
      this.logger.warn('Preserving existing pool-config.json due to catalog failure');
      return false;
    }
    
    this.logger.error('No existing pool-config.json to preserve');
    return false;
  }
}

// CLI entry point
export async function runSync(): Promise<void> {
  const sync = new Synchronizer();
  const success = await sync.sync();
  
  if (!success) {
    process.exitCode = 1;
  }
}

// Allow direct execution
if (process.argv[1]?.endsWith('sync.ts') || process.argv[1]?.endsWith('sync.js')) {
  runSync().catch(err => {
    console.error('Fatal sync error:', err);
    process.exit(1);
  });
}
