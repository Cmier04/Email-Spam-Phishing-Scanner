"use strict";
// Build-time validation; the INSTALLER bundles all application dependencies.
// End users never run Python, pip, npm, or a database daemon.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const packagedBackend = path.join(root, "desktop", "dist-backend", "phislab-backend");
const executable = path.join(packagedBackend, process.platform === "win32" ? "phislab-backend.exe" : "phislab-backend");
if (!fs.existsSync(executable)) throw new Error("Missing bundled FastAPI executable. Run npm run backend:bundle using the correct Python environment.");
const staging = path.join(root, "desktop", "release-assets", "models");
fs.mkdirSync(staging, {recursive:true, mode:0o700});
for (const [name, minBytes] of [["email_classifier.pkl", 100], ["summary-qwen.gguf", 10_000_000]]) {
  const source = path.join(root, "backend", "model", name);
  if (!fs.existsSync(source) || fs.statSync(source).size < minBytes)
    throw new Error(`Missing ${name} in backend/model/. Provide the trusted trained classifier and verified Qwen GGUF before preparing an installer.`);
  fs.copyFileSync(source, path.join(staging, name));
  console.log(`Staged ${name} (${Math.round(fs.statSync(source).size / 1024 / 1024)} MiB)`);
}
// Gmail OAuth configuration is intentionally opt-in. If you want new users to
// connect Gmail, supply an OAuth desktop-client file in release-assets/google/.
// Never include token.json or a user's credentials.
const oauthDir = path.join(root, "desktop", "release-assets", "google");
fs.mkdirSync(oauthDir, {recursive:true});
const oauthFile = path.join(oauthDir, "credentials.json");
if (!fs.existsSync(oauthFile)) console.warn("No bundled Google OAuth desktop client. Gmail sign-in will require separate configuration.");
console.log("Release assets ready; check model redistribution permissions before publishing.");
