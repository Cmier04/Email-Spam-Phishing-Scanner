import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const windows = process.platform === 'win32';
const npm = windows ? 'npm.cmd' : 'npm';
const electron = resolve(root, 'node_modules', '.bin', windows ? 'electron.cmd' : 'electron');
const vite = spawn(npm, ['--prefix', 'frontend', 'run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'], { cwd: root, stdio: 'inherit', shell: windows });
let desktop;
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  if (desktop && !desktop.killed) desktop.kill();
  if (!vite.killed) vite.kill();
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
vite.on('error', error => { console.error('Vite failed:', error); shutdown(); process.exitCode = 1; });
vite.on('exit', () => { if (!stopping) { shutdown(); process.exitCode = 1; } });
desktop = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', shell: windows });
desktop.on('error', error => { console.error('Electron failed:', error); shutdown(); process.exitCode = 1; });
desktop.on('exit', code => { shutdown(); process.exitCode = code || 0; });
