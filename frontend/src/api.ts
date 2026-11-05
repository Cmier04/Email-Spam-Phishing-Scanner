import type { Email } from "./data/mockEmails";
import type { WhatIfRequest } from "./data/labTransformations";

const API_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

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
  original_classification: "Legitimate" | "Potential threat";
  original_confidence: number;
  original_malicious_probability: number;
  modified_classification: "Legitimate" | "Potential threat";
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

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, options);
  } catch {
    throw new ApiError(
      `Cannot reach the backend at ${API_URL}. Start FastAPI and try again.`,
      0,
    );
  }

  if (!response.ok) {
    let message = `Backend request failed (${response.status}).`;
    try {
      const errorBody = await response.json() as { detail?: string };
      if (typeof errorBody.detail === "string") message = errorBody.detail;
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export async function getDemoEmails(): Promise<Email[]> {
  const emails = await requestJson<DemoEmailResponse[]>("/api/demo/emails");
  return emails.map((email) => ({
    id: email.id,
    source: email.source,
    sender: email.sender,
    email: email.sender_address,
    initials: email.sender
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    tone: email.classification === "Potential threat" ? "red" : "blue",
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

export function runWhatIf(request: WhatIfRequest): Promise<WhatIfResponse> {
  return requestJson<WhatIfResponse>("/api/what-if", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}
