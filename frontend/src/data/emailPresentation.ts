import type { GmailConnectionStatus, GmailMessageResponse } from "../api";
import type { Email } from "./mockEmails";

export type EmailMode = "gmail" | "demo";

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Gmail is not connected. Connect an account from Settings, then scan again.");
    this.name = "GmailNotConnectedError";
  }
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function senderParts(value: string): { name: string; address: string } {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (match) {
    const address = match[2].trim();
    const name = match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
    return { name: name || address, address };
  }

  const normalized = value.trim();
  return {
    name: normalized || "Unknown sender",
    address: normalized,
  };
}

function initialsFor(value: string): string {
  const initials = value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "?";
}

function dateFields(value: string): { received_at?: string; time: string } {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return { time: value.trim() || "Date unavailable" };
  }

  const date = new Date(timestamp);
  return {
    received_at: date.toISOString(),
    time: date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

export function mapGmailMessageToEmail(message: GmailMessageResponse): Email {
  const sender = senderParts(message.sender);
  const dates = dateFields(message.date);
  const threat = message.classification === "Potential threat";
  const previewSource = compactText(message.snippet || message.body);

  return {
    id: message.id,
    source: "gmail",
    sender: sender.name,
    email: sender.address,
    initials: initialsFor(sender.name),
    tone: threat ? "red" : "blue",
    subject: message.subject.trim() || "(No subject)",
    preview: previewSource.slice(0, 180),
    time: dates.time,
    received_at: dates.received_at,
    classification: message.classification,
    confidence: message.confidence,
    risk: threat
      ? message.confidence >= 90
        ? "High"
        : "Medium"
      : "Low",
    body: message.body,
  };
}

export function emailsForMode(
  mode: EmailMode,
  demoEmails: Email[],
  gmailEmails: Email[]
): Email[] {
  return mode === "gmail" ? gmailEmails : demoEmails;
}

export function calculateEmailStats(emails: Email[]) {
  const legitimate = emails.filter(
    (email) => email.classification === "Legitimate"
  ).length;
  const threats = emails.length - legitimate;
  const meanConfidence = emails.length
    ? Math.round(
        emails.reduce((total, email) => total + email.confidence, 0) /
          emails.length
      )
    : null;

  return { total: emails.length, legitimate, threats, meanConfidence };
}

export async function loadConnectedGmailEmails(
  getStatus: () => Promise<GmailConnectionStatus>,
  getEmails: () => Promise<Email[]>
): Promise<Email[]> {
  const status = await getStatus();
  if (!status.connected) {
    if (status.state === "connecting") {
      throw new Error(
        "Gmail authorization is still pending. Complete it in the browser, then scan again."
      );
    }
    if (status.error) throw new Error(status.error);
    throw new GmailNotConnectedError();
  }
  return getEmails();
}
