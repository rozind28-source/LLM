#!/usr/bin/env node
/**
 * CLI entry point for the Runtime server.
 * Run with: npx tsx scripts/start.ts
 */

import { startRuntime } from '../src/app/runtime.js';

startRuntime().catch((err) => {
  console.error('Fatal runtime error:', err);
  process.exit(1);
});
