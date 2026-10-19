#!/usr/bin/env node
/**
 * CLI entry point for the Synchronizer.
 * Run with: npx tsx scripts/sync.ts
 */

import { runSync } from '../src/sync/synchronizer.js';

runSync().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
