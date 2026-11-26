"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, protocol, net, session } = require("electron");
const { APP_URL, FRONTEND_DEV_URL, CSP, routeFor, staticFilePath, proxyRequestOptions } = require("./routes.cjs");
const { getBackendLaunch, findAvailablePort, isPortListening, waitForBackend, startBackend, stopBackend } = require("./backend.cjs");

const preview = process.argv.includes("--preview");
const development = !app.isPackaged && !preview;
const root = path.resolve(__dirname, "..");
const frontendDist = path.join(root, "frontend", "dist");
let backendProcess = null;
let shuttingDown = false;

protocol.registerSchemesAsPrivileged([{ scheme: "phislab", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

async function waitForFrontend(timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(FRONTEND_DEV_URL, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch { /* Vite still compiling */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error("Vite did not start at http://127.0.0.1:5173. Run npm run desktop:dev from the project root.");
}

function registerAppProtocol(port) {
  protocol.handle("phislab", async request => {
    let route;
    try { route = routeFor(request.url); }
    catch { return new Response("Forbidden", { status: 403 }); }
    if (route.isApi) {
      try {
        return await net.fetch(`http://127.0.0.1:${port}${route.pathname}${route.search}`, proxyRequestOptions(request));
      } catch {
        return new Response(JSON.stringify({ detail: "Local backend unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    try {
      const file = staticFilePath(frontendDist, route.pathname);
      if (!file) return new Response("Not found", { status: 404 });
      const result = await net.fetch(pathToFileURL(file).toString());
      if (route.pathname === "/") {
        const headers = new Headers(result.headers);
        headers.set("content-security-policy", CSP);
        return new Response(result.body, { status: result.status, headers });
      }
      return result;
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300, height: 850, minWidth: 950, minHeight: 640,
    show: false,
    title: "PhishLab",
    icon: path.join(root, "desktop", "assets", "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  win.once("ready-to-show", () => win.show());
  const permitted = development ? new URL(FRONTEND_DEV_URL).origin : null;
  win.webContents.on("will-navigate", (event, target) => {
    // A custom scheme has URL.origin = "null": check host and scheme explicitly.
    try {
      const url = new URL(target);
      if (development && url.origin === permitted) return;
      if (!development && url.protocol === "phislab:" && url.hostname === "app" && !url.username && !url.password && !url.port) return;
    } catch { /* deny */ }
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return win;
}

async function boot() {
  try {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    const port = development ? 8000 : await findAvailablePort();
    if (await isPortListening(port)) throw new Error(`Loopback port ${port} is already in use. Close the process using it and relaunch PhishLab.`);
    const config = getBackendLaunch({ isPackaged: app.isPackaged, root, resourcesPath: process.resourcesPath, userData: app.getPath("userData"), port });
    backendProcess = startBackend(config, line => process.stderr.write(line));
    // Spawn errors happen asynchronously; detect them without crashing the main process.
    let spawnError;
    backendProcess.once("error", error => { spawnError = error; });
    await waitForBackend(port, backendProcess);
    if (spawnError) throw spawnError;
    if (development) await waitForFrontend();
    else registerAppProtocol(port);
    const win = createWindow();
    await win.loadURL(development ? FRONTEND_DEV_URL : APP_URL);
  } catch (error) {
    dialog.showErrorBox("PhishLab could not start", `${error.message}\n\nIn development, confirm Python dependencies and npm packages are installed. See ELECTRON_SETUP.md.`);
    app.quit();
  }
}

// Keep user data in the legacy location so an upgrade does not hide saved labs or OAuth tokens.
// This is an internal path only; the visible application name is PhishLab.
app.setName("PhishLab");
app.setPath("userData", path.join(app.getPath("appData"), "PhisLab"));
app.whenReady().then(boot);
app.on("before-quit", () => { shuttingDown = true; stopBackend(backendProcess); });
app.on("window-all-closed", () => app.quit());
app.on("activate", () => { if (!shuttingDown && BrowserWindow.getAllWindows().length === 0) createWindow().loadURL(development ? FRONTEND_DEV_URL : APP_URL); });
