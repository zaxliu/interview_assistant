import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = new Set();
let shuttingDown = false;

function startProcess(name, args, { required = true } = {}) {
  const child = spawn(npmCmd, args, {
    stdio: 'inherit',
    env: process.env,
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;

    const normalizedCode = code ?? 1;
    if (!required) {
      console.error(
        `[dev-local] ${name} exited (${signal || normalizedCode}), Wintalent 导入功能可能不可用。`
      );
      return;
    }
    console.error(`[dev-local] ${name} exited (${signal || normalizedCode})`);
    shutdown(normalizedCode);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    child.kill('SIGTERM');
  }

  setTimeout(() => {
    for (const child of children) {
      child.kill('SIGKILL');
    }
    process.exit(exitCode);
  }, 1500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

startProcess('wintalent-proxy', ['run', 'proxy:wintalent'], { required: false });
startProcess('vite', ['run', 'dev:vite']);
