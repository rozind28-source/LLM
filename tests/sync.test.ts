/**
 * Tests for the Synchronizer component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Synchronizer } from '../src/sync/synchronizer.js';
import type { CatalogData, KeysConfig, PoolConfig } from '../src/shared/types.js';

// Mock catalog data (subset)
const mockCatalog: CatalogData = {
  lastUpdated: '2026-10-05',
  providers: [
    {
      name: 'Groq',
      category: 'inference_provider',
      country: 'US',
      flag: '🇺🇸',
      url: 'https://console.groq.com/keys',
      baseUrl: 'https://api.groq.com/openai/v1',
      description: 'Free tier',
      footnoteRef: null,
      models: [
        { id: 'openai/gpt-oss-120b', name: 'gpt-oss-120b', context: '131K', maxOutput: '65K', modality: 'Text', rateLimit: '30 RPM' },
        { id: 'qwen/qwen3.8-27b', name: 'qwen3.8-27b', context: '131K', maxOutput: '16K', modality: 'Text', rateLimit: '30 RPM' },
      ],
    },
    {
      name: 'Google Gemini',
      category: 'provider_api',
      country: 'US',
      flag: '🇺🇸',
      url: 'https://aistudio.google.com/app/apikey',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      description: 'Free tier',
      footnoteRef: null,
      models: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: '1M', maxOutput: '65K', modality: 'Text', rateLimit: '15 RPM' },
      ],
    },
    {
      name: 'OpenRouter',
      category: 'inference_provider',
      country: 'US',
      flag: '🇺🇸',
      url: 'https://openrouter.ai/keys',
      baseUrl: 'https://openrouter.ai/api/v1',
      description: 'Free models',
      footnoteRef: null,
      models: [
        { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'nemotron', context: '262K', maxOutput: '262K', modality: 'Text', rateLimit: '20 RPM' },
      ],
    },
    {
      name: 'Unknown Provider',
      category: 'provider_api',
      country: 'XX',
      flag: '🏴',
      url: 'https://example.com',
      baseUrl: 'https://api.example.com/v1',
      description: 'Not in our mapping',
      footnoteRef: null,
      models: [
        { id: 'some-model', name: 'Some Model', context: '32K', maxOutput: '4K', modality: 'Text', rateLimit: '10 RPM' },
      ],
    },
  ],
  footnotes: [],
  glossary: [],
};

describe('Synchronizer', () => {
  const tmpDir = path.join(process.cwd(), '.test-tmp');
  const keysPath = path.join(tmpDir, 'keys.json');
  const poolConfigPath = path.join(tmpDir, 'pool-config.json');
  const catalogPath = path.join(tmpDir, 'catalog.json');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('buildPoolConfig', () => {
    it('should match providers with keys and create profiles', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      const keys: KeysConfig = {
        groq: 'gsk_test1234567890abcdef',
        gemini: 'AIza_test1234567890abcdef',
      };

      const config = sync.buildPoolConfig(mockCatalog, keys);

      expect(config.profiles).toHaveLength(2);
      expect(config.profiles[0].provider).toBe('groq');
      expect(config.profiles[0].model).toBe('openai/gpt-oss-120b');
      expect(config.profiles[0].baseUrl).toBe('https://api.groq.com/openai/v1');
      expect(config.profiles[1].provider).toBe('gemini');
      expect(config.profiles[1].model).toBe('gemini-2.5-flash');
    });

    it('should skip providers without keys', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      const keys: KeysConfig = {
        groq: 'gsk_test1234567890abcdef',
        // No gemini key
      };

      const config = sync.buildPoolConfig(mockCatalog, keys);

      expect(config.profiles).toHaveLength(1);
      expect(config.profiles[0].provider).toBe('groq');
    });

    it('should skip providers not in the key mapping', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      const keys: KeysConfig = {
        groq: 'gsk_test1234567890abcdef',
      };

      const config = sync.buildPoolConfig(mockCatalog, keys);

      // "Unknown Provider" should be skipped (no mapping)
      const providers = config.profiles.map(p => p.provider);
      expect(providers).not.toContain('unknown');
    });

    it('should include lastSynced timestamp', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      const keys: KeysConfig = { groq: 'gsk_test1234567890abcdef' };
      const config = sync.buildPoolConfig(mockCatalog, keys);

      expect(config.lastSynced).toBeDefined();
      expect(config.catalogVersion).toBe('2026-10-05');
    });
  });

  describe('validateCatalog', () => {
    it('should accept valid catalog', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      expect(sync.validateCatalog(mockCatalog)).toBe(true);
    });

    it('should reject null', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      expect(sync.validateCatalog(null)).toBe(false);
    });

    it('should reject missing providers array', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      expect(sync.validateCatalog({})).toBe(false);
    });

    it('should reject empty providers array', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      expect(sync.validateCatalog({ providers: [] })).toBe(false);
    });

    it('should reject provider missing required fields', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      const badCatalog = { providers: [{ name: 'Test' }] };
      expect(sync.validateCatalog(badCatalog)).toBe(false);
    });
  });

  describe('loadKeys', () => {
    it('should load valid keys file', () => {
      fs.writeFileSync(keysPath, JSON.stringify({ groq: 'gsk_test123' }));

      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      const keys = sync.loadKeys();
      expect(keys.groq).toBe('gsk_test123');
    });

    it('should throw if keys.json not found', () => {
      const sync = new Synchronizer({
        keysPath: path.join(tmpDir, 'nonexistent.json'),
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      expect(() => sync.loadKeys()).toThrow('not found');
    });

    it('should throw if keys.json is not an object', () => {
      fs.writeFileSync(keysPath, JSON.stringify(['not', 'an', 'object']));

      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      expect(() => sync.loadKeys()).toThrow('must be a JSON object');
    });
  });

  describe('writePoolConfig', () => {
    it('should write pool config atomically', () => {
      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: '',
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      const config: PoolConfig = {
        profiles: [{ id: 'groq-1', provider: 'groq', apiKey: 'gsk_test', model: 'test-model' }],
        lastSynced: '2026-01-01T00:00:00Z',
      };

      sync.writePoolConfig(config);

      const written = JSON.parse(fs.readFileSync(poolConfigPath, 'utf-8'));
      expect(written.profiles).toHaveLength(1);
      expect(written.profiles[0].id).toBe('groq-1');
    });
  });

  describe('sync (integration)', () => {
    it('should handle catalog fetch failure gracefully', async () => {
      // Write an existing pool-config to verify it's preserved
      const existingConfig: PoolConfig = {
        profiles: [{ id: 'old-1', provider: 'old', apiKey: 'old-key', model: 'old-model' }],
      };
      fs.writeFileSync(poolConfigPath, JSON.stringify(existingConfig));

      const sync = new Synchronizer({
        keysPath,
        poolConfigPath,
        catalogUrl: 'http://localhost:99999/nonexistent', // Will fail
        poolStatePath: '',
        logLevel: 'error',
        port: 3001,
        hotReloadIntervalMs: 5000,
      });

      const result = await sync.sync();
      expect(result).toBe(false);

      // Verify existing config is preserved
      const preserved = JSON.parse(fs.readFileSync(poolConfigPath, 'utf-8'));
      expect(preserved.profiles[0].id).toBe('old-1');
    });
  });
});
