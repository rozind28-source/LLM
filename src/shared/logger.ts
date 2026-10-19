/**
 * Structured JSON logger with level filtering.
 * Masks API keys in all log output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Mask an API key: show first 4 and last 4 characters.
 * Example: "gsk_abcdef1234567890" → "gsk_...7890"
 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Recursively mask any field that looks like an API key in an object.
 */
export function sanitizeForLog(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // Mask strings that look like API keys (long alphanumeric with underscores)
    if (/^[A-Za-z0-9_\-]{20,}$/.test(obj)) {
      return maskApiKey(obj);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForLog);
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes('apikey') || key.toLowerCase().includes('api_key') || key.toLowerCase().includes('secret')) {
        result[key] = typeof value === 'string' ? maskApiKey(value) : '****';
      } else {
        result[key] = sanitizeForLog(value);
      }
    }
    return result;
  }
  return obj;
}

export class Logger {
  private level: LogLevel;
  private component: string;

  constructor(component: string, level: LogLevel = 'info') {
    this.component = component;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
    };
    if (data !== undefined) {
      entry.data = sanitizeForLog(data);
    }
    return JSON.stringify(entry);
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data));
    }
  }
}
