#!/usr/bin/env node
/**
 * Libera un puerto TCP en desarrollo (Windows/Linux).
 * Uso: node scripts/free-port.mjs 3030
 */
import { execSync } from 'node:child_process';

const port = Number.parseInt(process.argv[2] ?? '3030', 10);
if (!Number.isFinite(port) || port <= 0) process.exit(0);

function pidsOnPortWin() {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number.parseInt(parts[parts.length - 1] ?? '', 10);
      if (pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function pidsOnPortUnix() {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out
      .split(/\r?\n/)
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => n > 0);
  } catch {
    return [];
  }
}

const pids = process.platform === 'win32' ? pidsOnPortWin() : pidsOnPortUnix();
const self = process.pid;

for (const pid of pids) {
  if (pid === self) continue;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    console.log(`[free-port] liberado :${port} (PID ${pid})`);
  } catch {
    /* ignore */
  }
}
