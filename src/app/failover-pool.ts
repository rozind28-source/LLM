/**
 * Simple failover pool for OpenAI-compatible providers.
 * No external dependencies - pure implementation.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PoolProfile {
  id: string;
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface PoolState {
  cooldowns: Record<string, number>; // profileId -> cooldownUntil timestamp
  disabled: Record<string, boolean>; // profileId -> disabled
  errorCounts: Record<string, number>;
}

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

export class FailoverPool {
  private profiles: PoolProfile[];
  private state: PoolState;
  private statePath: string;

  constructor(profiles: PoolProfile[], statePath: string) {
    this.profiles = profiles;
    this.statePath = statePath;
    this.state = this.loadState();
  }

  private loadState(): PoolState {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Failed to load pool state:', err);
    }
    return { cooldowns: {}, disabled: {}, errorCounts: {} };
  }

  private saveState(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('Failed to save pool state:', err);
    }
  }

  private getAvailableProfiles(): PoolProfile[] {
    const now = Date.now();
    return this.profiles.filter(p => {
      // Check if disabled
      if (this.state.disabled[p.id]) return false;
      // Check if in cooldown
      const cooldownUntil = this.state.cooldowns[p.id];
      if (cooldownUntil && now < cooldownUntil) return false;
      return true;
    });
  }

  private applyCooldown(profileId: string, statusCode: number): void {
    const now = Date.now();
    const errorCount = (this.state.errorCounts[profileId] || 0) + 1;
    this.state.errorCounts[profileId] = errorCount;

    if (statusCode === 429) {
      // Rate limit: exponential backoff
      const baseDelay = 60 * 1000; // 1 minute
      const delay = baseDelay * Math.pow(5, Math.min(errorCount - 1, 3));
      this.state.cooldowns[profileId] = now + delay;
    } else if (statusCode === 401 || statusCode === 403) {
      // Auth error: disable permanently
      this.state.disabled[profileId] = true;
    } else if (statusCode >= 500) {
      // Server error: shorter cooldown
      const baseDelay = 60 * 1000;
      const delay = baseDelay * Math.pow(5, Math.min(errorCount - 1, 3));
      this.state.cooldowns[profileId] = now + delay;
    }

    this.saveState();
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const failedProfiles: string[] = [];
    let attempts = 0;

    const availableProfiles = this.getAvailableProfiles();
    
    if (availableProfiles.length === 0) {
      throw new Error('No available profiles in pool');
    }

    for (const profile of availableProfiles) {
      attempts++;
      try {
        const response = await this.callProvider(profile, request);
        return {
          content: response.content,
          provider: profile.provider,
          model: profile.model,
          profileId: profile.id,
          attempts,
          failedProfiles,
          durationMs: Date.now() - startTime,
        };
      } catch (err) {
        const error = err as any;
        const statusCode = error.statusCode || error.status || 0;
        
        failedProfiles.push(profile.id);
        this.applyCooldown(profile.id, statusCode);
        
        // If auth error, stop trying this profile
        if (statusCode === 401 || statusCode === 403) {
          continue;
        }
        
        // For other errors, continue to next profile
        continue;
      }
    }

    throw new Error(`All ${attempts} profiles failed`);
  }

  private async callProvider(
    profile: PoolProfile,
    request: ChatRequest
  ): Promise<{ content: string }> {
    const url = `${profile.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (profile.apiKey && profile.apiKey !== 'anonymous') {
      headers['Authorization'] = `Bearer ${profile.apiKey}`;
    }

    const body = {
      model: request.model || profile.model,
      messages: request.messages,
      max_tokens: request.max_tokens || 1024,
      temperature: request.temperature ?? 0.7,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const error = new Error(`HTTP ${response.status}: ${errorText}`) as any;
      error.statusCode = response.status;
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    return { content };
  }

  getStatus() {
    const now = Date.now();
    return {
      profiles: this.profiles.map(p => {
        const isDisabled = this.state.disabled[p.id] || false;
        const cooldownUntil = this.state.cooldowns[p.id];
        const inCooldown = cooldownUntil && now < cooldownUntil;
        const errorCount = this.state.errorCounts[p.id] || 0;

        return {
          id: p.id,
          provider: p.provider,
          model: p.model,
          state: (isDisabled ? 'disabled' : inCooldown ? 'cooldown' : 'available') as 'available' | 'cooldown' | 'disabled',
          cooldownUntil,
          errorCount,
        };
      }),
      totalAvailable: this.getAvailableProfiles().length,
      totalInCooldown: this.profiles.filter(p => {
        const cooldownUntil = this.state.cooldowns[p.id];
        return cooldownUntil && now < cooldownUntil;
      }).length,
    };
  }
}
