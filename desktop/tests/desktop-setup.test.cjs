"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { routeFor, staticFilePath, proxyRequestOptions } = require("../routes.cjs");
const { choosePython, getBackendLaunch, findAvailablePort, isPortListening } = require("../backend.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "phislab-electron-"));

test("application protocol rejects foreign origin", () => {
  assert.equal(routeFor("phislab://app/api/history/status").isApi, true);
  assert.equal(routeFor("phislab://app/assets/site.js").isApi, false);
  assert.throws(() => routeFor("https://other.example"));
  assert.throws(() => routeFor("phislab://evil/api"));
  assert.throws(() => routeFor("phislab://user@app/api"));
});

test("assets stay inside the compiled frontend", () => {
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, "index.html"), "Hello");
    assert.equal(staticFilePath(dir, "/"), path.join(dir, "index.html"));
    assert.equal(staticFilePath(dir, "/missing.js"), null);
    assert.throws(() => staticFilePath(dir, "/%2E%2E/secret"));
    assert.throws(() => staticFilePath(dir, "/%5C%5Cwindows"));
    if (process.platform !== "win32") {
      const outside = path.join(dir, "..", "secret-target.txt");
      fs.writeFileSync(outside, "secret");
      fs.symlinkSync(outside, path.join(dir, "escape.txt"));
      assert.throws(() => staticFilePath(dir, "/escape.txt"));
      fs.unlinkSync(outside);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("proxy strips external origin/cookies and forwards existing local debug headers", () => {
  const original = new Request("https://example.test", { method: "PUT", headers: {
    "origin": "https://evil.site", "cookie": "credentials=secret", "content-type": "application/json",
    "x-phishlab-local-settings": "save", "authorization": "anything"
  }, body: "{}" });
  const opts = proxyRequestOptions(original);
  assert.equal(opts.method, "PUT");
  assert.equal(opts.headers.get("origin"), null);
  assert.equal(opts.headers.get("cookie"), null);
  assert.equal(opts.headers.get("authorization"), null);
  assert.equal(opts.headers.get("x-phishlab-local-settings"), "save");
  assert.equal(opts.redirect, "manual");
});

test("developer backend resolves Python and preserves backend cwd", () => {
  const root = tmp();
  const config = getBackendLaunch({ isPackaged: false, root, resourcesPath: "/unused", userData: "/unused", port: 8000,
    env: { PHISHLAB_PYTHON: "/py/venv/python", PHISHLAB_ENABLE_TEST_RUNNER: "1", PHISHLAB_DATABASE_URL: "sqlite:///tmp/test.db" } });
  assert.equal(config.command, "/py/venv/python");
  assert.deepEqual(config.args.slice(0, 3), ["-m", "uvicorn", "app.main:app"]);
  assert.equal(config.cwd, path.join(root, "backend"));
  assert.equal(config.env.PHISHLAB_ENABLE_TEST_RUNNER, "1");
  assert.equal(config.env.PHISHLAB_DATABASE_URL, "sqlite:///tmp/test.db");
  assert.equal(config.env.PHISHLAB_DESKTOP_SQLITE_PATH, undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

test("packaged backend is required; runtime data stays in user data", () => {
  const root = tmp();
  const binary = path.join(root, "resources", "backend", process.platform === "win32" ? "phislab-backend.exe" : "phislab-backend");
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  const userData = path.join(root, "user");
  try {
    assert.throws(() => getBackendLaunch({ isPackaged: true, root, resourcesPath: path.join(root, "resources"), userData, port: 8001, env: {} }), /missing/i);
    fs.writeFileSync(binary, "binary");
    const config = getBackendLaunch({ isPackaged: true, root, resourcesPath: path.join(root, "resources"), userData, port: 8001,
      env: { PHISHLAB_DATABASE_URL: "mysql+pymysql://localhost/db" } });
    assert.equal(config.command, binary);
    assert.equal(config.env.PHISHLAB_GMAIL_TOKEN_PATH, path.join(userData, "token.json"));
    assert.equal(config.env.PHISHLAB_AI_SETTINGS_PATH, path.join(userData, "ai-settings.json"));
    assert.equal(config.env.PHISHLAB_CLASSIFIER_MODEL_PATH, path.join(root, "resources", "models", "email_classifier.pkl"));
    assert.equal(config.env.PHISHLAB_LOCAL_AI_MODEL_PATH, path.join(root, "resources", "models", "summary-qwen.gguf"));
    assert.equal(config.env.PHISHLAB_DATABASE_URL, "mysql+pymysql://localhost/db");
    assert.equal(config.env.PHISHLAB_DESKTOP_SQLITE_PATH, undefined);
    assert.equal(config.env.PHISHLAB_ENABLE_TEST_RUNNER, "0");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("desktop dynamically allocates a local port", async () => {
  const port = await findAvailablePort();
  assert.ok(port > 1024 && port < 65536);
  assert.equal(await isPortListening(port), false);
});


test("Electron automatically provisions private persistent SQLite on fresh launch", () => {
  const root = tmp();
  const userData = path.join(root, "Application Support", "PhisLab Test");
  try {
    const options = { isPackaged: false, root, resourcesPath: "/unused", userData, port: 8000, env: {} };
    const first = getBackendLaunch(options);
    const dbFile = path.join(userData, "data", "phislab_history.db");
    assert.equal(first.env.PHISHLAB_DESKTOP_SQLITE_PATH, dbFile);
    assert.equal(first.env.PHISHLAB_DATABASE_URL, undefined);
    assert.equal(first.cwd, path.join(root, "backend"));
    assert.ok(fs.statSync(path.dirname(dbFile)).isDirectory());
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(path.dirname(dbFile)).mode & 0o777, 0o700);
    }
    assert.equal(getBackendLaunch(options).env.PHISHLAB_DESKTOP_SQLITE_PATH, dbFile);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("packaged Electron uses the same user SQLite folder without embedding the DB", () => {
  const root = tmp();
  const resourcesPath = path.join(root, "resources");
  const binary = path.join(resourcesPath, "backend", process.platform === "win32" ? "phislab-backend.exe" : "phislab-backend");
  const userData = path.join(root, "user");
  try {
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.writeFileSync(binary, "test executable placeholder");
    const config = getBackendLaunch({ isPackaged: true, root, resourcesPath, userData, port: 18001, env: {} });
    assert.equal(config.env.PHISHLAB_DESKTOP_SQLITE_PATH, path.join(userData, "data", "phislab_history.db"));
    assert.equal(config.env.PHISHLAB_DATABASE_URL, undefined);
    assert.equal(fs.existsSync(config.env.PHISHLAB_DESKTOP_SQLITE_PATH), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("explicit database URL overrides automatic SQLite even if stale desktop path is inherited", () => {
  const root = tmp();
  try {
    const config = getBackendLaunch({ isPackaged: false, root, resourcesPath: "/unused", userData: path.join(root, "user"), port: 8000,
      env: { PHISHLAB_DATABASE_URL: "mysql+pymysql://phislab:example@localhost:3306/phislab", PHISHLAB_DESKTOP_SQLITE_PATH: "/old/default.sqlite" } });
    assert.match(config.env.PHISHLAB_DATABASE_URL, /^mysql\+pymysql:\/\//);
    assert.equal(config.env.PHISHLAB_DESKTOP_SQLITE_PATH, undefined);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test("packaged app prefers user model overrides when they exist", () => {
  const root = tmp();
  try {
    const resourcesPath = path.join(root, "resources");
    const userData = path.join(root, "user");
    const binary = path.join(resourcesPath, "backend", process.platform === "win32" ? "phislab-backend.exe" : "phislab-backend");
    const model = path.join(userData, "models", "summary-qwen.gguf");
    fs.mkdirSync(path.dirname(binary), {recursive: true});
    fs.mkdirSync(path.dirname(model), {recursive: true});
    fs.writeFileSync(binary, "binary"); fs.writeFileSync(model, "custom model");
    const result = getBackendLaunch({isPackaged:true, root, resourcesPath, userData, port:8001, env:{}});
    assert.equal(result.env.PHISHLAB_LOCAL_AI_MODEL_PATH, model);
  } finally { fs.rmSync(root, {recursive: true, force:true}); }
});
