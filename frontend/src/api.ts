
import type { Email, EmailSecurityAnalysis } from "./data/mockEmails";
import type { WhatIfRequest } from "./data/labTransformations";
import { mapGmailMessageToEmail } from "./data/emailPresentation";

// Browser requests use Vite's same-origin /api proxy during development.
// VITE_API_BASE_URL may override this for a separately hosted API;
// never store secrets in VITE_*.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type DemoEmailResponse = {
  id: string;
  source: "demo";
  sender: string;
  sender_address: string;
  subject: string;
  preview: string;
  received_at: string;
  classification: "Legitimate" | "Potential threat";
  confidence: number;
  malicious_probability: number;
  risk: "Low" | "Medium" | "High";
  threat_category?: string | null;
  greeting: string;
  body: string;
  request: string;
  action_label?: string | null;
  attachment?: string | null;
  signature?: string | null;
  security_analysis?: EmailSecurityAnalysis;
};

export type GmailMessageResponse = {
  id: string;
  thread_id: string;
  sender: string;
  sender_name?: string;
  sender_address?: string;
  reply_to?: string;
  recipient: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  greeting?: string;
  request?: string;
  link_text?: string;
  links?: { display_text: string; url: string }[];
  attachment?: string;
  attachments?: { filename: string; mime_type: string; size: number }[];
  signature?: string;
  security_analysis?: EmailSecurityAnalysis;
  classification: "Legitimate" | "Potential threat";
  confidence: number;
};

export type AppliedTransformation = {
  part: string;
  transformation_id: string;
  applied: boolean;
  affects_classifier: boolean;
  message: string;
  generation_method?: "deterministic" | "local_ai" | "fallback";
  ai_duration_ms?: number | null;
  fallback_reason?: "disabled" | "local_model_unavailable" | "invalid_ai_response" | "generation_timeout" | "generation_failed" | null;
};

export type GmailConnectionStatus = {
  state: "disconnected" | "connecting" | "connected" | "failed" | "cancelled";
  connected: boolean;
  email: string | null;
  display_name?: string | null;
  avatar_available?: boolean;
  error: string | null;
  credentials_configured: boolean;
};

export type GmailDisconnectResult = GmailConnectionStatus & {
  google_permission_revoked: false;
};

// All three fields can be generated in the backend without changing the classifier model.
export type BackendLearningSummary = {
  source?: "dynamic" | "local_ai";
  fallback_reason?: "disabled" | "local_model_unavailable" | "invalid_ai_response" | "generation_timeout" | "generation_failed" | null;
  changes_made: string[];
  ai_duration_ms?: number | null;
  why_it_mattered: string;
  what_you_should_learn: string;
};

// Matches the existing FastAPI response.
export type WhatIfResponse = {
  email_id: string;
  ai_mode?: "automatic" | "require_qwen";
  source: "gmail" | "demo";
  original_classification: string;
  original_confidence: number;
  original_malicious_probability: number;
  modified_classification: string;
  modified_confidence: number;
  modified_malicious_probability: number;
  score_change: number;
  decision_changed: boolean;
  applied_transformations: AppliedTransformation[];
  modified_subject: string;
  modified_body: string;
  modified_values: Record<string, string>;
  warnings: string[];
  learning_summary?: BackendLearningSummary | null;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;

    throw new ApiError(
      "Cannot reach the PhishLab backend. In the desktop app, check whether its local service started successfully.",
      0
    );
  }

  if (!response.ok) {
    let detail = `FastAPI returned HTTP ${response.status}.`;

    try {
      const payload: unknown = await response.json();

      if (
        payload &&
        typeof payload === "object" &&
        "detail" in payload
      ) {
        const errorDetail = payload.detail;

        if (typeof errorDetail === "string") {
          detail = errorDetail;
        } else if (Array.isArray(errorDetail)) {
          detail = `Request validation failed (HTTP ${response.status}).`;
        }
      }
    } catch {
      // Keep the HTTP status if the error response is not JSON.
    }

    if (response.status === 502 && !detail.includes("HTTP 502")) {
      detail = `FastAPI returned HTTP 502. ${detail}`;
    }
    throw new ApiError(detail, response.status);
  }

  try {
    return await response.json() as unknown;
  } catch {
    throw new ApiError(
      "FastAPI returned an invalid JSON response.",
      response.status
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isProbability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

function isClassification(
  value: unknown
): value is "Legitimate" | "Potential threat" {
  return value === "Legitimate" || value === "Potential threat";
}

function isGmailConnectionStatus(
  value: unknown
): value is GmailConnectionStatus {
  if (!isRecord(value)) return false;

  return (
    (
      value.state === "disconnected" ||
      value.state === "connecting" ||
      value.state === "connected" ||
      value.state === "failed" ||
      value.state === "cancelled"
    ) &&
    typeof value.connected === "boolean" &&
    (value.email === null || typeof value.email === "string") &&
    (value.error === null || typeof value.error === "string") &&
    typeof value.credentials_configured === "boolean"
  );
}

function requireGmailConnectionStatus(
  payload: unknown
): GmailConnectionStatus {
  if (!isGmailConnectionStatus(payload)) {
    throw new ApiError(
      "The Gmail connection response doesn't match the FastAPI contract.",
      200
    );
  }
  return payload;
}

export async function getGmailStatus(
  signal?: AbortSignal
): Promise<GmailConnectionStatus> {
  return requireGmailConnectionStatus(
    await requestJson("/api/gmail/status", { signal })
  );
}

export async function importGmailOAuthClient(file: File): Promise<GmailConnectionStatus> {
  // Desktop OAuth client config is metadata, not a Google account token. It
  // stays in the local FastAPI app-data directory, never browser localStorage.
  if (file.size > 16384) throw new ApiError("Google OAuth JSON must be under 16 KB.", 413);
  const contents = await file.text();
  return requireGmailConnectionStatus(await requestJson("/api/gmail/oauth-client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: contents,
  }));
}

export async function connectGmail(): Promise<GmailConnectionStatus> {
  return requireGmailConnectionStatus(
    await requestJson("/api/gmail/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
  );
}

export async function disconnectGmail(): Promise<GmailDisconnectResult> {
  const payload = await requestJson("/api/gmail/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (
    !isRecord(payload) ||
    payload.google_permission_revoked !== false ||
    !isGmailConnectionStatus(payload)
  ) {
    throw new ApiError(
      "The Gmail disconnect response doesn't match the FastAPI contract.",
      200
    );
  }
  return payload as GmailDisconnectResult;
}

function isDemoEmail(value: unknown): value is DemoEmailResponse {
  if (!isRecord(value)) return false;

  return (
    value.source === "demo" &&
    typeof value.id === "string" &&
    typeof value.sender === "string" &&
    typeof value.sender_address === "string" &&
    typeof value.subject === "string" &&
    typeof value.preview === "string" &&
    typeof value.received_at === "string" &&
    isClassification(value.classification) &&
    isProbability(value.confidence) &&
    isProbability(value.malicious_probability) &&
    (
      value.risk === "Low" ||
      value.risk === "Medium" ||
      value.risk === "High"
    ) &&
    typeof value.greeting === "string" &&
    typeof value.body === "string" &&
    typeof value.request === "string" &&
    (value.security_analysis === undefined || isSecurityAnalysis(value.security_analysis))
  );
}

function isSecurityAnalysis(value: unknown): value is EmailSecurityAnalysis {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.indicators) || !Array.isArray(value.recommendations)) return false;
  if (typeof value.note !== "string") return false;
  return value.recommendations.every((item) => typeof item === "string") &&
    value.indicators.every((item) =>
      isRecord(item) &&
      typeof item.code === "string" &&
      (item.category === "language" || item.category === "identity" || item.category === "link" || item.category === "attachment") &&
      (item.severity === "caution" || item.severity === "elevated") &&
      typeof item.title === "string" &&
      typeof item.description === "string" &&
      typeof item.evidence === "string" &&
      typeof item.recommendation === "string"
    );
}

function isGmailMessage(value: unknown): value is GmailMessageResponse {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.thread_id === "string" &&
    typeof value.sender === "string" &&
    typeof value.recipient === "string" &&
    typeof value.subject === "string" &&
    typeof value.date === "string" &&
    typeof value.snippet === "string" &&
    typeof value.body === "string" &&
    isClassification(value.classification) &&
    isProbability(value.confidence) &&
    (value.security_analysis === undefined || isSecurityAnalysis(value.security_analysis))
  );
}

export async function getRecentGmailEmails(
  limit = 25,
  signal?: AbortSignal
): Promise<Email[]> {
  const payload = await requestJson(
    `/api/gmail/recent?limit=${encodeURIComponent(String(limit))}`,
    { signal }
  );

  if (!Array.isArray(payload) || !payload.every(isGmailMessage)) {
    throw new ApiError(
      "The Gmail scan response doesn't match the FastAPI contract.",
      200
    );
  }

  return payload.map(mapGmailMessageToEmail);
}

function isLearningSummary(
  value: unknown
): value is BackendLearningSummary {
  if (!isRecord(value)) return false;

  return (
    (value.source === undefined || value.source === "dynamic" || value.source === "local_ai") &&
    (value.fallback_reason === undefined || value.fallback_reason === null ||
      value.fallback_reason === "disabled" ||
      value.fallback_reason === "local_model_unavailable" ||
      value.fallback_reason === "invalid_ai_response" ||
      value.fallback_reason === "generation_timeout" ||
      value.fallback_reason === "generation_failed") &&
    Array.isArray(value.changes_made) &&
    value.changes_made.every(
      (item) => typeof item === "string"
    ) &&
    typeof value.why_it_mattered === "string" &&
    typeof value.what_you_should_learn === "string"
  );
}

function isWhatIfResponse(value: unknown): value is WhatIfResponse {
  if (!isRecord(value)) return false;

  const applications = value.applied_transformations;

  return (
    typeof value.email_id === "string" &&
    (value.source === "demo" || value.source === "gmail") &&
    (value.ai_mode === undefined || value.ai_mode === "automatic" || value.ai_mode === "require_qwen") &&
    isClassification(value.original_classification) &&
    isClassification(value.modified_classification) &&
    isProbability(value.original_confidence) &&
    isProbability(value.modified_confidence) &&
    isProbability(value.original_malicious_probability) &&
    isProbability(value.modified_malicious_probability) &&
    typeof value.score_change === "number" &&
    Number.isFinite(value.score_change) &&
    typeof value.decision_changed === "boolean" &&
    typeof value.modified_subject === "string" &&
    typeof value.modified_body === "string" &&
    isRecord(value.modified_values) &&
    Object.values(value.modified_values).every(
      (field) => typeof field === "string"
    ) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(
      (warning) => typeof warning === "string"
    ) &&
    (
      value.learning_summary === undefined ||
      value.learning_summary === null ||
      isLearningSummary(value.learning_summary)
    ) &&
    Array.isArray(applications) &&
    applications.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.part === "string" &&
        typeof item.transformation_id === "string" &&
        typeof item.applied === "boolean" &&
        typeof item.affects_classifier === "boolean" &&
        typeof item.message === "string" &&
        (item.ai_duration_ms === undefined || item.ai_duration_ms === null || (typeof item.ai_duration_ms === "number" && item.ai_duration_ms >= 0)) &&
        (item.generation_method === undefined || ["deterministic", "local_ai", "fallback"].includes(String(item.generation_method))) &&
        (item.fallback_reason === undefined || item.fallback_reason === null ||
          ["disabled", "local_model_unavailable", "invalid_ai_response", "generation_timeout", "generation_failed"].includes(String(item.fallback_reason)))
    )
  );
}

export async function getDemoEmails(
  signal?: AbortSignal
): Promise<Email[]> {
  const payload = await requestJson("/api/demo/emails", {
    signal,
  });

  if (!Array.isArray(payload) || !payload.every(isDemoEmail)) {
    throw new ApiError(
      "The demo emails response doesn't match the FastAPI contract.",
      200
    );
  }

  return payload.map((email) => ({
    id: email.id,
    source: email.source,
    sender: email.sender,
    email: email.sender_address,
    initials: email.sender
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    tone:
      email.classification === "Potential threat"
        ? "red" as const
        : "blue" as const,
    subject: email.subject,
    preview: email.preview,
    time: "Synthetic demo",
    received_at: email.received_at,
    classification: email.classification,
    confidence: email.confidence,
    maliciousProbability: email.malicious_probability,
    risk: email.risk,
    threat_category: email.threat_category ?? undefined,
    greeting: email.greeting,
    body: email.body,
    request: email.request,
    actionLabel: email.action_label ?? undefined,
    attachment: email.attachment ?? undefined,
    signature: email.signature ?? undefined,
    securityAnalysis: email.security_analysis,
  }));
}

export async function runWhatIf(
  request: WhatIfRequest,
  signal?: AbortSignal
): Promise<WhatIfResponse> {
  const payload = await requestJson("/api/what-if", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (
    !isWhatIfResponse(payload) ||
    payload.email_id !== request.email_id
  ) {
    throw new ApiError(
      "The What-If response doesn't match the FastAPI contract.",
      200
    );
  }

  return payload;
}


export type LocalAIStatus = {
  enabled: boolean;
  model_file_available: boolean;
  runtime_available?: boolean;
  disabled_reason?: string | null;
  configured_for_gpu: boolean;
  gpu_layers: number;
  threads: number;
  context_size: number;
  batch_size: number;
  generation_timeout_seconds: number;
  model_filename: string;
  note: string;
};

export async function getLocalAIStatus(signal?: AbortSignal): Promise<LocalAIStatus> {
  const status = await requestJson("/api/ai-status", { signal });
  if (!isRecord(status) || typeof status.enabled !== "boolean" ||
      typeof status.model_file_available !== "boolean" ||
      typeof status.configured_for_gpu !== "boolean" ||
      typeof status.gpu_layers !== "number" ||
      typeof status.threads !== "number" ||
      typeof status.context_size !== "number" ||
      typeof status.batch_size !== "number" ||
      typeof status.generation_timeout_seconds !== "number" ||
      typeof status.model_filename !== "string" ||
      typeof status.note !== "string") {
    throw new ApiError("The local AI status response is incompatible.", 200);
  }
  return status as LocalAIStatus;
}

// Configuration belongs to the machine hosting FastAPI; browser GPU detection
// is deliberately not used because the browser may run on a different device.
export type AIConfigValues = {
  enabled: boolean;
  gpu_layers: number;
  threads: number;
  context_size: number;
  batch_size: number;
  generation_timeout_seconds: number;
};

export type AISettingsResponse = AIConfigValues & {
  mode: "auto" | "manual";
  detected: {
    profile: string;
    device: string;
    install_backend: string;
    note: string;
  };
  detected_defaults: AIConfigValues;
  environment_overrides: string[];
};

export type PythonTestEntry = {
  id: string;
  name: string;
  functions: { id: string; name: string }[];
};

export type PythonTestResult = {
  test_id: string;
  status: "passed" | "failed" | "timeout";
  output: string;
  duration_ms: number;
  truncated: boolean;
};

export function getAISettings(signal?: AbortSignal): Promise<AISettingsResponse> {
  return requestJson("/api/debug/ai-settings", { signal }) as Promise<AISettingsResponse>;
}

export function setAISettings(
  values: { mode: "auto" } | (AIConfigValues & { mode: "manual" })
): Promise<AISettingsResponse> {
  return requestJson("/api/debug/ai-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-PhishLab-Local-Settings": "save" },
    body: JSON.stringify(values),
  }) as Promise<AISettingsResponse>;
}

export function getPythonTests(signal?: AbortSignal): Promise<{ enabled: boolean; tests: PythonTestEntry[] }> {
  return requestJson("/api/debug/python-tests", { signal }) as Promise<{ enabled: boolean; tests: PythonTestEntry[] }>;
}

export function runPythonTest(testId: string): Promise<PythonTestResult> {
  return requestJson("/api/debug/python-tests/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-PhishLab-Local-Tests": "run" },
    body: JSON.stringify({ test_id: testId }),
  }) as Promise<PythonTestResult>;
}


// Setup/readiness diagnostics are deliberately non-sensitive: no OAuth tokens,
// email content, filesystem paths, or model internals are included.
export type SystemReadiness = {
  status: "ready" | "setup_required";
  classifier_ready: boolean;
  qwen_enabled: boolean;
  qwen_model_available: boolean;
  gmail_credentials_configured: boolean;
  message: string;
};

export async function getSystemReadiness(signal?: AbortSignal): Promise<SystemReadiness> {
  const value = await requestJson("/api/system/status", { signal });
  if (!isRecord(value) ||
    (value.status !== "ready" && value.status !== "setup_required") ||
    typeof value.classifier_ready !== "boolean" ||
    typeof value.qwen_enabled !== "boolean" ||
    typeof value.qwen_model_available !== "boolean" ||
    typeof value.gmail_credentials_configured !== "boolean" ||
    typeof value.message !== "string") {
    throw new ApiError("The system readiness response is incompatible.", 200);
  }
  return value as SystemReadiness;
}

// Local, opt-in scan history. These APIs never return stored email bodies,
// attachment contents, OAuth credentials, or raw Gmail message identifiers.
export type ScanHistoryStatus = {
  configured: boolean;
  available: boolean;
  backend: "mysql" | "sqlite" | null;
  enabled: boolean;
  retention_days: 30 | 90 | 365;
  entry_count: number;
};

export type ScanHistoryEntry = {
  id: number;
  source: "gmail" | "demo";
  sender: string;
  subject: string;
  classification: "Legitimate" | "Potential threat";
  confidence: number;
  malicious_probability: number;
  scan_count: number;
  first_scanned_at: string;
  last_scanned_at: string;
  feedback_verdict: "correct" | "incorrect" | "unsure" | null;
  feedback_note: string;
};

function isScanHistoryStatus(value: unknown): value is ScanHistoryStatus {
  return isRecord(value) && typeof value.configured === "boolean" &&
    typeof value.available === "boolean" && typeof value.enabled === "boolean" &&
    (value.backend === "mysql" || value.backend === "sqlite" || value.backend === null) &&
    [30, 90, 365].includes(Number(value.retention_days)) &&
    typeof value.entry_count === "number";
}

function isScanHistoryEntry(value: unknown): value is ScanHistoryEntry {
  return isRecord(value) && typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0 &&
    (value.source === "gmail" || value.source === "demo") &&
    typeof value.sender === "string" && typeof value.subject === "string" &&
    isClassification(value.classification) && isProbability(value.confidence) &&
    isProbability(value.malicious_probability) &&
    typeof value.scan_count === "number" &&
    typeof value.first_scanned_at === "string" &&
    typeof value.last_scanned_at === "string" &&
    (value.feedback_verdict === null || ["correct", "incorrect", "unsure"].includes(String(value.feedback_verdict))) &&
    typeof value.feedback_note === "string";
}

export async function getHistoryStatus(signal?: AbortSignal): Promise<ScanHistoryStatus> {
  const result = await requestJson("/api/history/status", { signal });
  if (!isScanHistoryStatus(result)) throw new ApiError("Invalid history status response.", 200);
  return result;
}

export async function updateHistorySettings(enabled: boolean, retention_days: 30 | 90 | 365): Promise<ScanHistoryStatus> {
  const result = await requestJson("/api/history/settings", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, retention_days }),
  });
  if (!isScanHistoryStatus(result)) throw new ApiError("Invalid history settings response.", 200);
  return result;
}

export async function getHistoryScans(limit = 50, offset = 0, signal?: AbortSignal): Promise<{ items: ScanHistoryEntry[]; total: number }> {
  const result = await requestJson(`/api/history/scans?limit=${limit}&offset=${offset}`, { signal });
  if (!isRecord(result) || !Array.isArray(result.items) || !result.items.every(isScanHistoryEntry) ||
      typeof result.total !== "number") throw new ApiError("Invalid scan history response.", 200);
  return result as { items: ScanHistoryEntry[]; total: number };
}

export async function saveScanFeedback(scanId: number, verdict: "correct" | "incorrect" | "unsure", note: string): Promise<void> {
  await requestJson(`/api/history/scans/${scanId}/feedback`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verdict, note }),
  });
}

export async function deleteHistoryScan(scanId: number): Promise<void> {
  await requestJson(`/api/history/scans/${scanId}`, { method: "DELETE" });
}

export async function clearScanHistory(): Promise<void> {
  await requestJson("/api/history/scans", { method: "DELETE" });
}

export async function exportScanHistory(): Promise<number> {
  const all: ScanHistoryEntry[] = [];
  let total = 0;
  do {
    const page = await getHistoryScans(100, all.length);
    total = page.total;
    all.push(...page.items);
    if (page.items.length === 0) break;
    if (all.length >= 10000 && all.length < total) {
      throw new ApiError("History exceeds 10,000 records. Reduce retention or export in smaller groups.", 400);
    }
  } while (all.length < total);
  const labs: LabSession[] = [];
  const summaries: LabSessionSummary[] = [];
  let labTotal = 0;
  do {
    const page = await getLabSessions(100, summaries.length);
    labTotal = page.total;
    summaries.push(...page.items);
    if (!page.items.length) break;
    if (summaries.length >= 10000 && summaries.length < labTotal)
      throw new ApiError("Lab history exceeds 10,000 records. Export a smaller set.", 400);
  } while (summaries.length < labTotal);
  for (const item of summaries) labs.push(await getLabSession(item.id));
  const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), scans: all, labs }, null, 2)], {
    type: "application/json",
  });
  const address = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = address;
  link.download = `phislab-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(address), 1000);
  return all.length;
}


// Lab History saves explicitly opted-in educational copies locally; it never
// edits the message in Gmail and does not include OAuth tokens or live URLs.
export type LabSessionSnapshot = {
  email: Email;
  experiment: WhatIfResponse;
  changes: { part: string; id: string }[];
  selected_part: string;
};
export type LabSessionSummary = {
  id: number; source: "gmail" | "demo"; subject: string; sender: string;
  updated_at: string; revision: number;
};
export type LabSession = {id: number; updated_at: string; revision: number; snapshot: LabSessionSnapshot};

export async function getLabSessions(limit = 40, offset = 0): Promise<{items: LabSessionSummary[]; total: number}> {
  return await requestJson(`/api/history/labs?limit=${limit}&offset=${offset}`) as {items: LabSessionSummary[]; total: number};
}
export async function getLabSession(id: number): Promise<LabSession> {
  return await requestJson(`/api/history/labs/${id}`) as LabSession;
}
export async function saveLabSession(snapshot: LabSessionSnapshot): Promise<{saved: boolean; id: number}> {
  return await requestJson("/api/history/labs", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(snapshot)}) as {saved: boolean; id: number};
}
export async function deleteLabSession(id: number): Promise<void> {
  await requestJson(`/api/history/labs/${id}`, {method: "DELETE"});
}
export async function saveEmailFeedback(source: "gmail" | "demo", emailId: string,
  verdict: "correct" | "incorrect" | "unsure", note: string): Promise<void> {
  await requestJson("/api/history/feedback/by-email", {method: "POST",
    headers: {"Content-Type": "application/json"}, body: JSON.stringify({source, email_id: emailId, verdict, note})});
}
