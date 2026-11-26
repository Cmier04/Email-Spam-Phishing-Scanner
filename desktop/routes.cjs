"use strict";

const path = require("node:path");
const fs = require("node:fs");

const APP_URL = "phislab://app/";
const FRONTEND_DEV_URL = "http://127.0.0.1:5173/";
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";

function routeFor(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "phislab:" || url.hostname !== "app" || url.username || url.password || url.port) {
    throw new Error("Invalid application origin");
  }
  return { pathname: url.pathname, search: url.search, isApi: url.pathname.startsWith("/api/") };
}

function staticFilePath(distRoot, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new Error("Malformed asset URL"); }
  if (!decoded.startsWith("/") || decoded.includes("\0") || decoded.includes("\\") || decoded.split("/").includes("..")) {
    throw new Error("Invalid asset path");
  }
  const relative = decoded === "/" ? "index.html" : decoded.slice(1);
  const root = fs.realpathSync(distRoot);
  const full = path.resolve(root, relative);
  const rel = path.relative(root, full);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Asset path escapes the application bundle");
  }
  if (!fs.statSync(full, { throwIfNoEntry: false })?.isFile()) {
    return null;
  }
  if (!fs.realpathSync(full).startsWith(root + path.sep)) {
    throw new Error("Asset symlink escapes the application bundle");
  }
  return full;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
const FORWARDED_HEADERS = new Set(["accept", "content-type", "x-phishlab-local-tests", "x-phishlab-local-settings"]);

function proxyRequestOptions(request) {
  if (!ALLOWED_METHODS.has(request.method)) throw new Error("Unsupported API method");
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (FORWARDED_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  }
  const options = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    options.body = request.body;
    options.duplex = "half";
  }
  return options;
}

module.exports = { APP_URL, FRONTEND_DEV_URL, CSP, routeFor, staticFilePath, proxyRequestOptions };
