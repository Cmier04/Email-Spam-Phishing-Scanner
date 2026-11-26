import { useEffect, useState } from "react";
import {
  getAISettings,
  getLocalAIStatus,
  getSystemReadiness,
  getPythonTests,
  runPythonTest,
  setAISettings,
  type AIConfigValues,
  type AISettingsResponse,
  type LocalAIStatus,
  type SystemReadiness,
  type PythonTestEntry,
  type PythonTestResult,
} from "../api";
import {
  FORCE_QWEN_CHANGED_EVENT,
  FORCE_QWEN_STORAGE_KEY,
  readForceQwenPreference,
  saveForceQwenPreference,
} from "../data/forceQwenPreference";

const NUMERIC: Array<{ key: keyof Omit<AIConfigValues, "enabled">; label: string; min: number; max: number }> = [
  { key: "gpu_layers", label: "GPU layers (-1 = all supported)", min: -1, max: 200 },
  { key: "threads", label: "CPU threads", min: 1, max: 32 },
  { key: "context_size", label: "Context tokens", min: 1024, max: 8192 },
  { key: "batch_size", label: "Batch size", min: 32, max: 1024 },
  { key: "generation_timeout_seconds", label: "Generation timeout (seconds)", min: 5, max: 180 },
];

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "The backend request failed.";
}

function initialValues(settings: AISettingsResponse): AIConfigValues {
  return {
    enabled: settings.enabled,
    gpu_layers: settings.gpu_layers,
    threads: settings.threads,
    context_size: settings.context_size,
    batch_size: settings.batch_size,
    generation_timeout_seconds: settings.generation_timeout_seconds,
  };
}

export default function DebuggingSettings() {
  const [forceQwen, setForceQwen] = useState(readForceQwenPreference);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<LocalAIStatus | null>(null);
  const [aiStatusError, setAiStatusError] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState(0);
  const [settings, setSettings] = useState<AISettingsResponse | null>(null);
  const [draft, setDraft] = useState<AIConfigValues | null>(null);
  const [message, setMessage] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<PythonTestEntry[]>([]);
  const [testEnabled, setTestEnabled] = useState(false);
  const [testId, setTestId] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PythonTestResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getAISettings(controller.signal).then((value) => {
      if (!controller.signal.aborted) {
        setSettings(value);
        setDraft(initialValues(value));
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setMessage(displayError(error));
    });
    getPythonTests(controller.signal).then((value) => {
      if (!controller.signal.aborted && value.enabled && value.tests.length) {
        setFiles(value.tests);
        setTestEnabled(true);
        setTestId(value.tests[0].id);
      }
    }).catch(() => {
      // Intentionally hidden on non-local or non-developer backend deployments.
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const synchronize = () => setForceQwen(readForceQwenPreference());
    const onStorage = (event: StorageEvent) => {
      if (event.key === FORCE_QWEN_STORAGE_KEY || event.key === null) synchronize();
    };
    window.addEventListener(FORCE_QWEN_CHANGED_EVENT, synchronize);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FORCE_QWEN_CHANGED_EVENT, synchronize);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getSystemReadiness(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setReadiness(value);
          setReadinessError(null);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setReadinessError(displayError(error));
      });
    getLocalAIStatus(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setAiStatus(value);
          setAiStatusError(null);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setAiStatusError(displayError(error));
      });
    return () => controller.abort();
  }, [refreshStatus]);

  const testOptions = files.flatMap((file) => [
    { id: file.id, label: `File: ${file.name}` },
    ...file.functions.map((fn) => ({ id: fn.id, label: `  ${fn.name}` })),
  ]);

  async function updateMode(mode: "auto" | "manual") {
    if (!settings || !draft) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await setAISettings(mode === "auto" ? { mode: "auto" } : { mode, ...draft });
      setSettings(updated);
      setDraft(initialValues(updated));
      setMessage(mode === "auto" ? "Device-detected defaults restored." : "Manual AI override saved.");
    } catch (error) {
      setMessage(displayError(error));
    } finally {
      setSaving(false);
    }
  }

  async function runSelectedTest() {
    if (!testId) return;
    setRunning(true);
    setResult(null);
    try {
      setResult(await runPythonTest(testId));
    } catch (error) {
      setResult({ test_id: testId, status: "failed", output: displayError(error), duration_ms: 0, truncated: false });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm" aria-label="Debugging settings">
      <div className="border-b border-[#e8ebf1] px-5 py-4 md:px-6">
        <h2 className="text-sm font-bold text-[#202a44]">Debugging</h2>
        <p className="mt-1 text-xs text-[#8a92a4]">Local AI device settings and development diagnostics.</p>
      </div>
      <div className="space-y-5 px-5 py-5 md:px-6">
        <div className="space-y-2 rounded-xl border border-[#dce3f5] bg-[#f8faff] p-4" aria-label="Application readiness">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#202a44]">Application readiness</h3>
            <button type="button" onClick={() => setRefreshStatus((n) => n + 1)} className="text-xs font-semibold text-[#3157d5]">Refresh</button>
          </div>
          {readinessError && <p role="status" className="text-xs text-[#a33a3a]">{readinessError}</p>}
          {!readiness && !readinessError && <p className="text-xs text-[#68758b]">Checking local components...</p>}
          {readiness && <div className="space-y-1 text-xs text-[#4a566d]" aria-live="polite">
            <p><strong>Status:</strong> {readiness.status === "ready" ? "Classifier ready" : "Setup required"}</p>
            <p><strong>Classifier:</strong> {readiness.classifier_ready ? "Ready" : "Missing or unavailable"}</p>
            <p><strong>Qwen:</strong> {readiness.qwen_enabled && readiness.qwen_model_available ? "Configured" : "Optional AI not ready"}</p>
            <p><strong>Gmail OAuth configuration:</strong> {readiness.gmail_credentials_configured ? "Present" : "Not configured (optional)"}</p>
            <p className="text-[11px] text-[#68758b]">{readiness.message}</p>
          </div>}
        </div>
        <div className="space-y-3 rounded-xl border border-[#dce3f5] bg-[#f8faff] p-4">
          <h3 className="text-xs font-bold text-[#202a44]">Learning Lab AI behavior</h3>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={forceQwen}
              onChange={(event) => saveForceQwenPreference(event.target.checked)}
              className="mt-0.5 accent-[#3157d5]" />
            <span>
              <span className="block text-xs font-semibold text-[#35415c]">Force Qwen (no fixed-text fallback)</span>
              <span className="mt-1 block text-[11px] leading-5 text-[#68758b]">
                Applies to subject/body/request AI rewrites and learning explanations. If Qwen fails, the experiment stops with an error instead of using fixed wording. Other options, such as capitalization and sender-label edits, remain rule-based. Switching resets old comparisons.
              </span>
            </span>
          </label>
          <p className="text-[11px] text-[#7e8799]">Saved in this browser. AI generation still requires a working local Qwen model and an enabled backend.</p>
        </div>
        <div className="space-y-2 text-[11px] leading-5 text-[#657087]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#202a44]">Local Qwen configuration</h3>
            <button type="button" onClick={() => setRefreshStatus((n) => n + 1)} className="font-semibold text-[#3157d5]">Refresh</button>
          </div>
          {aiStatusError && <p role="status" className="text-[#a33a3a]">{aiStatusError}</p>}
          {!aiStatus && !aiStatusError && <p>Checking FastAPI configuration...</p>}
          {aiStatus && (
            <div className="space-y-1" aria-live="polite">
              <p>Backend AI: <strong>{aiStatus.enabled ? "enabled" : "disabled"}</strong> · GGUF file: <strong>{aiStatus.model_file_available ? "found" : "missing"}</strong> · Runtime: <strong>{aiStatus.runtime_available ? "installed" : "missing"}</strong></p>
              <p>Model: {aiStatus.model_filename} · GPU layers: {aiStatus.gpu_layers} ({aiStatus.configured_for_gpu ? "offload requested" : "CPU only"})</p>
              <p>Threads: {aiStatus.threads} · Context: {aiStatus.context_size} · Batch: {aiStatus.batch_size} · Timeout: {aiStatus.generation_timeout_seconds}s</p>
              {aiStatus.disabled_reason && <p role="status" className="rounded-lg bg-[#fff5e7] px-3 py-2 text-[#995a20]">{aiStatus.disabled_reason} Install Qwen using the developer setup before packaging, then choose Auto detect if a previous override disabled it.</p>}
              <p className="text-[#9096a6]">GPU offload must be verified on the real Mac/CUDA host; this displays configured values only.</p>
            </div>
          )}
        </div>
        <div className="border-t border-[#e8ebf1]" />
        {settings && draft ? (
          <>
            <div className="text-xs leading-6 text-[#4a566d]">
              <p><strong>Detected device:</strong> {settings.detected.device}</p>
              <p><strong>Recommended profile:</strong> {settings.detected.profile} ({settings.detected.install_backend})</p>
              <p>{settings.detected.note}</p>
              <p><strong>Device-detected defaults:</strong> Qwen {settings.detected_defaults.enabled ? "on" : "off"}, GPU layers {settings.detected_defaults.gpu_layers}, threads {settings.detected_defaults.threads}, context {settings.detected_defaults.context_size}, batch {settings.detected_defaults.batch_size}, timeout {settings.detected_defaults.generation_timeout_seconds}s.</p>
              <p><strong>Current mode:</strong> {settings.mode === "auto" ? "Automatic (device-detected)" : "Manual override"}</p>
              {settings.environment_overrides.length > 0 && (
                <p>Environment settings detected: {settings.environment_overrides.join(", ")}. Manual overrides take precedence.</p>
              )}
            </div>
            <fieldset className="flex flex-wrap gap-4 text-xs text-[#35405a]">
              <legend className="mb-2 font-semibold">AI configuration</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="ai-settings-mode" checked={settings.mode === "auto"} disabled={saving}
                  onChange={() => void updateMode("auto")} /> Auto detect
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="ai-settings-mode" checked={settings.mode === "manual"} disabled={saving}
                  onChange={() => void updateMode("manual")} /> Manual override
              </label>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-xs text-[#35405a] sm:col-span-2">
                <input type="checkbox" checked={draft.enabled} disabled={settings.mode !== "manual" || saving}
                  onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Enable local Qwen
              </label>
              {NUMERIC.map(({ key, label, min, max }) => (
                <label key={key} className="flex flex-col gap-1 text-xs text-[#35405a]">
                  {label}
                  <input className="rounded-md border border-[#dfe4eb] px-2 py-2" type="number"
                    disabled={settings.mode !== "manual" || saving} min={min} max={max} step={1}
                    value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} />
                </label>
              ))}
            </div>
            {settings.mode === "manual" && (
              <button type="button" onClick={() => void updateMode("manual")} disabled={saving}
                className="rounded-lg bg-[#3157d5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {saving ? "Saving..." : "Save manual settings"}
              </button>
            )}
            <p className="text-[11px] text-[#7e8799]">AI changes affect subsequent local requests. Installing native Metal/CUDA support or downloading the model requires running the one-time setup script on the backend machine; the app never installs native code through the browser.</p>
          </>
        ) : (
          <p className="text-xs text-[#8a92a4]">Loading device-detected AI settings...</p>
        )}
        {message && <p role="status" className="text-xs text-[#a34337]">{message}</p>}
        {testEnabled && (
          <div className="space-y-3 border-t border-[#e8ebf1] pt-4">
            <h3 className="text-xs font-bold text-[#202a44]">Python test runner (local development only)</h3>
            <p className="text-[11px] text-[#8a92a4]">Only discovered project tests are allowed. Runs use the existing unittest setup and time out after 90 seconds.</p>
            <label className="block text-xs text-[#35405a]">
              Available test files and functions
              <select value={testId} onChange={(event) => setTestId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-[#dfe4eb] bg-white px-3 py-2 text-xs">
                {testOptions.map((test) => <option value={test.id} key={test.id}>{test.label}</option>)}
              </select>
            </label>
            <button type="button" disabled={!testId || running} onClick={() => void runSelectedTest()}
              className="rounded-lg bg-[#3157d5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {running ? "Running test..." : "Run selected test"}
            </button>
            {result && (
              <div className="space-y-2" role="status">
                <p className="text-xs font-semibold text-[#35405a]">Result: {result.status} · {result.duration_ms} ms{result.truncated ? " · output truncated" : ""}</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#101828] p-3 text-[11px] text-[#e8eef9]">{result.output || "Test completed without output."}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
