/**
 * Dev runner: starts the Next.js dev server.
 *
 * The auth proxy (src/proxy.ts) is auto-discovered by Next.js via file
 * convention — no separate server process needed.
 * Visit http://localhost:3000 during development.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const NEXT_PORT = process.env.NEXT_PORT ?? '3000';

console.log(`[dev] Starting Next.js on :${NEXT_PORT}`);

// Next.js dev server — src/proxy.ts is auto-discovered and loaded by Next.js
const next = spawn('npx', ['next', 'dev', '--turbopack', '-p', NEXT_PORT], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT: NEXT_PORT, HOSTNAME: '127.0.0.1' },
});

function cleanup() {
  next.kill();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

next.on('exit', (code) => {
  process.exit(code ?? 0);
});