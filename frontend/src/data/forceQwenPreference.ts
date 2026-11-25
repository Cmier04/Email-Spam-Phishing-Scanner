/** A browser-local preference shared by Settings and Learning Lab. */
export const FORCE_QWEN_STORAGE_KEY = "phislab_debug_force_qwen";
export const FORCE_QWEN_CHANGED_EVENT = "phislab:force-qwen-changed";

// Private browsing can disallow storage; retain the choice for this page session.
let sessionValue: boolean | null = null;

export function readForceQwenPreference(): boolean {
  if (typeof window === "undefined") return sessionValue ?? false;
  try {
    const stored = window.localStorage.getItem(FORCE_QWEN_STORAGE_KEY);
    return stored === null ? (sessionValue ?? false) : stored === "1";
  } catch {
    return sessionValue ?? false;
  }
}

export function saveForceQwenPreference(enabled: boolean): void {
  sessionValue = enabled;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FORCE_QWEN_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // The choice still applies for the current session.
  }
  window.dispatchEvent(new Event(FORCE_QWEN_CHANGED_EVENT));
}
