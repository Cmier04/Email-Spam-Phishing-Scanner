"use strict";

const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");

function choosePython(root, custom = process.env.PHISHLAB_PYTHON, platform = process.platform) {
  if (custom) return custom;
  const candidates = platform === "win32"
    ? [path.join(root, "backend", ".venv", "Scripts", "python.exe")]
    : [path.join(root, "backend", ".venv", "bin", "python")];
  return candidates.find(p => fs.existsSync(p)) || (platform === "win32" ? "python" : "python3");
}

function getBackendLaunch({ isPackaged, root, resourcesPath, userData, port, env = process.env }) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid backend port");
  const config = { ...env, PHISHLAB_DESKTOP_PORT: String(port), PHISHLAB_ENABLE_TEST_RUNNER: isPackaged ? "0" : (env.PHISHLAB_ENABLE_TEST_RUNNER || "0") };
  // Electron owns a persistent private SQLite location on every platform.
  // An explicit database URL wins, allowing an advanced MySQL configuration.
  if (!config.PHISHLAB_DATABASE_URL?.trim()) {
    const data = path.join(userData, "data");
    fs.mkdirSync(data, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") fs.chmodSync(data, 0o700);
    // A filesystem path (not a SQLAlchemy URL) handles special path characters safely.
    config.PHISHLAB_DESKTOP_SQLITE_PATH = path.join(data, "phislab_history.db");
    delete config.PHISHLAB_DATABASE_URL;
  } else {
    // Never allow an inherited desktop default to shadow an explicit override.
    delete config.PHISHLAB_DESKTOP_SQLITE_PATH;
  }
  let command;
  let args;
  let cwd;
  if (isPackaged) {
    const binary = path.join(resourcesPath, "backend", process.platform === "win32" ? "phislab-backend.exe" : "phislab-backend");
    if (!fs.existsSync(binary)) throw new Error("Bundled Python backend is missing. Rebuild using npm run backend:bundle.");
    command = binary;
    args = [];
    cwd = path.dirname(binary);
    const models = path.join(userData, "models");
    fs.mkdirSync(models, { recursive: true, mode: 0o700 });
    // Explicit user environment variables are retained, including the MySQL URL.
    const bundledOAuth = path.join(resourcesPath, "google", "credentials.json");
    config.PHISHLAB_GMAIL_CREDENTIALS_PATH ||= fs.existsSync(path.join(userData, "credentials.json"))
      ? path.join(userData, "credentials.json") : bundledOAuth;
    config.PHISHLAB_GMAIL_TOKEN_PATH ||= path.join(userData, "token.json");
    config.PHISHLAB_AI_SETTINGS_PATH ||= path.join(userData, "ai-settings.json");
    for (const [envName, filename] of [["PHISHLAB_CLASSIFIER_MODEL_PATH", "email_classifier.pkl"], ["PHISHLAB_LOCAL_AI_MODEL_PATH", "summary-qwen.gguf"]]) {
      if (!config[envName]) {
        const local = path.join(models, filename);
        const bundled = path.join(resourcesPath, "models", filename);
        // A user-installed model takes precedence; otherwise use the verified
        // model the developer included in this platform's installer.
        config[envName] = fs.existsSync(local) ? local : bundled;
      }
    }
  } else {
    cwd = path.join(root, "backend");
    command = choosePython(root, env.PHISHLAB_PYTHON);
    args = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)];
  }
  return { command, args, cwd, env: config };
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function isPortListening(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(700);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForBackend(port, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.spawnError) throw new Error(`Python backend could not be launched: ${child.spawnError.message}`);
    if (child.exitCode !== null || child.signalCode) throw new Error("Python backend exited during startup.");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 750);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal, cache: "no-store" });
        if (response.ok && (await response.json()).status === "ok") return;
      } finally { clearTimeout(timer); }
    } catch { /* backend still starting */ }
    await delay(250);
  }
  throw new Error("Python backend did not become ready. Check its dependencies and startup logs.");
}

function startBackend(config, onLog = () => {}) {
  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.once("error", error => { child.spawnError = error; });
  child.stdout.on("data", buf => onLog(`backend: ${buf.toString()}`));
  child.stderr.on("data", buf => onLog(`backend: ${buf.toString()}`));
  return child;
}

function stopBackend(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  try {
    if (process.platform === "win32") child.kill();
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    try { child.kill(); } catch { /* process already exited */ }
  }
}

module.exports = { choosePython, getBackendLaunch, findAvailablePort, isPortListening, waitForBackend, startBackend, stopBackend };
