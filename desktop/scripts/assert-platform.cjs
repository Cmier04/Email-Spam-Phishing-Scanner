"use strict";
// PyInstaller bundles the host OS's Python executable and native GPU DLLs.
// Do not let electron-builder cross-package an incompatible backend binary.
const allowed = new Set(["darwin", "win32", "linux"]);
function assertNativeBuild(target, host = process.platform) {
  if (!allowed.has(target)) throw new Error("Unsupported target platform");
  if (target !== host) {
    throw new Error(`Cannot package ${target} from ${host}: build the native Python backend on the target OS.`);
  }
  return true;
}
if (require.main === module) {
  try { assertNativeBuild(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { assertNativeBuild };
