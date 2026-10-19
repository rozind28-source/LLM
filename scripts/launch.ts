#!/usr/bin/env node
/**
 * One-click launcher: starts sync + runtime server + opens dashboard.
 * Run with: npx tsx scripts/launch.ts
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const children: ChildProcess[] = [];

function log(msg: string) {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`\x1b[36m[${time}]\x1b[0m \x1b[1m[launcher]\x1b[0m ${msg}`);
}

function spawnProcess(name: string, script: string, env: Record<string, string> = {}): ChildProcess {
  log(`Starting ${name}...`);
  // Use node --import tsx/esm for cross-platform TypeScript execution
  const child = spawn('node', ['--import', 'tsx/esm', script], {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      console.log(`\x1b[90m[${name}]\x1b[0m ${line}`);
    }
  });

  child.stderr?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      console.log(`\x1b[33m[${name}:err]\x1b[0m ${line}`);
    }
  });

  child.on('exit', (code) => {
    log(`${name} exited with code ${code}`);
  });

  children.push(child);
  return child;
}

async function waitForPort(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null);
      if (response?.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

async function main() {
  console.log('');
  console.log('\x1b[1m\x1b[35m╔══════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[35m║          🚀 LLM Failover MVP — One-Click Launch         ║\x1b[0m');
  console.log('\x1b[1m\x1b[35m╚══════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('');

  // Step 1: Check keys.json
  const keysPath = path.join(rootDir, 'keys.json');
  if (!fs.existsSync(keysPath)) {
    log('⚠️  keys.json not found. Copying from example...');
    const examplePath = path.join(rootDir, 'keys.json.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, keysPath);
      log('📋 Created keys.json from example. Please edit it with your real API keys!');
      log('   Then restart the launcher.');
      process.exit(1);
    }
  }

  // Step 2: Run sync
  log('📡 Running synchronization...');
  const syncProcess = spawnProcess('sync', 'scripts/sync.ts');
  
  await new Promise<void>((resolve) => {
    syncProcess.on('exit', () => resolve());
    setTimeout(() => resolve(), 15000); // Timeout after 15s
  });

  // Check if pool-config.json was created
  const poolConfigPath = path.join(rootDir, 'pool-config.json');
  if (!fs.existsSync(poolConfigPath)) {
    log('❌ pool-config.json not created. Check your keys.json and try again.');
    process.exit(1);
  }
  log('✅ Sync complete');

  // Step 3: Start runtime server
  const runtimeProcess = spawnProcess('runtime', 'scripts/start.ts', {
    PORT: '3001',
    FORCE_COLOR: '1',
  });

  log('⏳ Waiting for runtime server...');
  try {
    await waitForPort(3001);
    log('✅ Runtime server ready on http://localhost:3001');
  } catch {
    log('⚠️  Runtime server may not be ready yet, continuing...');
  }

  // Step 4: Start Vite dev server
  log('Starting dashboard...');
  const viteProcess = spawn('npx', ['vite', '--port', '3000', '--host', '0.0.0.0'], {
    cwd: rootDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  
  viteProcess.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      console.log(`\x1b[90m[dashboard]\x1b[0m ${line}`);
    }
  });

  viteProcess.stderr?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      console.log(`\x1b[33m[dashboard:err]\x1b[0m ${line}`);
    }
  });

  children.push(viteProcess);

  log('⏳ Waiting for dashboard...');
  try {
    await waitForPort(3000, 15000);
    log('✅ Dashboard ready on http://localhost:3000');
  } catch {
    log('⚠️  Dashboard may not be ready yet');
  }

  // Step 5: Open browser
  console.log('');
  console.log('\x1b[1m\x1b[32m═══════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m\x1b[32m  ✅ All systems are GO!\x1b[0m');
  console.log('');
  console.log(`  \x1b[1m📊 Dashboard:\x1b[0m  http://localhost:3000`);
  console.log(`  \x1b[1m🔌 API:\x1b[0m        http://localhost:3001`);
  console.log(`  \x1b[1m💚 Health:\x1b[0m      http://localhost:3001/health`);
  console.log('');
  console.log('\x1b[1m\x1b[32m═══════════════════════════════════════════════════════════\x1b[0m');
  console.log('');
  console.log('\x1b[90mPress Ctrl+C to stop all services\x1b[0m');
  console.log('');

  // Try to open browser
  try {
    const { exec } = await import('child_process');
    const platform = process.platform;
    const openCmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCmd} http://localhost:3000`);
  } catch {
    log('Could not open browser automatically. Please open http://localhost:3000');
  }

  // Handle shutdown
  const cleanup = () => {
    log('Shutting down all services...');
    for (const child of children) {
      child.kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('Launch failed:', err);
  process.exit(1);
});
