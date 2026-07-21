import { exec, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const TARGET_PORT = 4444;
const HOST = 'localhost';
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const parsePidsFromNetstat = (stdout) => {
  const lines = stdout.split('\n');
  const pids = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/\s+(\d+)\s*$/);
    if (match) {
      pids.add(match[1]);
    }
  }

  return Array.from(pids);
};

const getPidsOnPort = async (port) => {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const pids = parsePidsFromNetstat(stdout);
      return pids.filter(Boolean);
    }

    const { stdout } = await execAsync(`lsof -i :${port} -t`);
    return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
};

const killPids = async (pids) => {
  for (const pid of pids) {
    try {
      if (Number(pid) === process.pid) {
        continue;
      }

      if (process.platform === 'win32') {
        await execAsync(`taskkill /F /PID ${pid}`);
      } else {
        await execAsync(`kill -9 ${pid}`);
      }
    } catch {
      // Ignore kill errors for non-existent processes.
    }
  }
};

const runAstro = () => {
  // Avoid spawn('npx'): on Windows that fails with ENOENT (npx is npx.cmd and
  // spawn without shell does not resolve .cmd). Run Astro via the local package.
  const astroCli = path.join(ROOT_DIR, 'node_modules', 'astro', 'bin', 'astro.mjs');
  const child = spawn(
    process.execPath,
    [astroCli, 'dev', '--host', HOST, '--port', `${TARGET_PORT}`],
    {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env,
    },
  );

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
};

const main = async () => {
  const pids = await getPidsOnPort(TARGET_PORT);
  if (pids.length > 0) {
    await killPids(pids);
    // Wait briefly for socket release.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  runAstro();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
