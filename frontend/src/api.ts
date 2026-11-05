import type { Email } from "./data/mockEmails";
import type { WhatIfRequest } from "./data/labTransformations";

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
};

export type AppliedTransformation = {
  part: string;
  transformation_id: string;
  applied: boolean;
  affects_classifier: boolean;
  message: string;
};

export type WhatIfResponse = {
  email_id: string;
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
      "Cannot reach FastAPI. Start the backend on http://127.0.0.1:8000 and try again.",
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
    typeof value.request === "string"
  );
}

function isWhatIfResponse(value: unknown): value is WhatIfResponse {
  if (!isRecord(value)) return false;

  const applications = value.applied_transformations;

  return (
    typeof value.email_id === "string" &&
    (value.source === "demo" || value.source === "gmail") &&
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
    Array.isArray(applications) &&
    applications.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.part === "string" &&
        typeof item.transformation_id === "string" &&
        typeof item.applied === "boolean" &&
        typeof item.affects_classifier === "boolean" &&
        typeof item.message === "string"
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