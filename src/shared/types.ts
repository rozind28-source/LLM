/**
 * Shared types for the LLM Failover MVP system.
 * Defines the contract between the Synchronizer and Runtime components.
 */

// ============================================================
// Catalog types (from the GitHub JSON catalog)
// ============================================================

export interface CatalogModel {
  id: string | null;
  name: string;
  context: string;
  maxOutput: string;
  modality: string;
  rateLimit: string;
}

export interface CatalogProvider {
  name: string;
  category: string;
  country: string;
  flag: string;
  url: string;
  baseUrl: string;
  description: string;
  footnoteRef: number | null;
  models: CatalogModel[];
}

export interface CatalogData {
  lastUpdated: string;
  providers: CatalogProvider[];
  footnotes: Array<{ id: number; text: string }>;
  glossary: Array<{ abbreviation: string; meaning: string }>;
}

// ============================================================
// Pool config types (contract between sync and runtime)
// ============================================================

export interface PoolProfile {
  id: string;
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface PoolConfig {
  profiles: PoolProfile[];
  lastSynced?: string;
  catalogVersion?: string;
}

// ============================================================
// Keys file type
// ============================================================

export interface KeysConfig {
  [providerKey: string]: string;
}

// ============================================================
// Runtime types
// ============================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  profileId: string;
  attempts: number;
  failedProfiles: string[];
  durationMs: number;
}

export interface PoolStatus {
  profiles: Array<{
    id: string;
    provider: string;
    model: string;
    state: 'available' | 'cooldown' | 'disabled';
    cooldownUntil?: number;
    errorCount: number;
  }>;
  totalAvailable: number;
  totalInCooldown: number;
  unavailableReason?: string;
}

// ============================================================
// Provider mapping (catalog name -> keys.json key)
// ============================================================

export const PROVIDER_KEY_MAP: Record<string, string> = {
  'Groq': 'groq',
  'Google Gemini': 'gemini',
  'OpenRouter': 'openrouter',
  'NVIDIA NIM': 'nvidia',
  'Mistral AI': 'mistral',
  'Cohere': 'cohere',
  'Hugging Face': 'huggingface',
  'Cloudflare Workers AI': 'cloudflare',
  'Kilo Code': 'kilo',
  'Z AI (Zhipu AI)': 'zai',
  'Ollama Cloud': 'ollama',
  'OVHcloud AI Endpoints': 'ovhcloud',
  'SiliconFlow': 'siliconflow',
  'LLM7.io': 'llm7',
  'ModelScope': 'modelscope',
  'Aion Labs': 'aionlabs',
};

// Default model per provider (first available model from catalog)
export const DEFAULT_MODELS: Record<string, string> = {
  'Groq': 'openai/gpt-oss-120b',
  'Google Gemini': 'gemini-2.5-flash',
  'OpenRouter': 'nvidia/nemotron-3-super-120b-a12b:free',
  'NVIDIA NIM': 'nvidia/nemotron-3-super-120b-a12b',
  'Mistral AI': 'mistral-small-2603',
  'Cohere': 'command-r-plus-08-2024',
  'Hugging Face': 'meta-llama/Llama-3.1-8B-Instruct',
  'Cloudflare Workers AI': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  'Kilo Code': 'kilo-auto/free',
  'Z AI (Zhipu AI)': 'glm-4.7-flash',
  'Ollama Cloud': 'deepseek-v4-flash',
  'OVHcloud AI Endpoints': 'Qwen3.5-397B-A17B',
  'SiliconFlow': 'Qwen/Qwen3-8B',
  'LLM7.io': 'gpt-oss:20b',
  'ModelScope': 'Qwen/Qwen3.5-35B-A3B',
  'Aion Labs': 'aion-labs/aion-2.0',
};
