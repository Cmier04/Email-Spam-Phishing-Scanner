import type { Email } from "./mockEmails";

export type EmailPart =
  | "senderName"
  | "senderAddress"
  | "subject"
  | "greeting"
  | "body"
  | "request"
  | "link"
  | "attachment"
  | "signature"
  | "formatting";

export type ChangeKind = "Meaning-preserving" | "Meaning-changing";
export type ChangeScope = "Message text" | "Metadata only" | "Visual only";

export type LabChange = {
  id: string;
  part: EmailPart;
  title: string;
  description: string;
  value: string;
  kind: ChangeKind;
  scope: ChangeScope;
  apiStatus: "Example contract" | "Proposed";
};

// Keep display-field names separate from the proposed backend contract.
export function toApiPart(part: EmailPart): string {
  const mapping: Record<EmailPart, string> = {
    senderName: "sender_name",
    senderAddress: "sender_address",
    subject: "subject",
    greeting: "greeting",
    body: "body",
    request: "request",
    link: "link_text",
    attachment: "attachment",
    signature: "signature",
    formatting: "formatting",
  };
  return mapping[part];
}

export function getOriginalPartValue(email: Email, part: EmailPart): string {
  switch (part) {
    case "senderName": return email.sender;
    case "senderAddress": return email.email;
    case "subject": return email.subject;
    case "greeting": return email.greeting ?? "Hello,";
    case "body": return email.body ?? email.preview;
    case "request": return email.request ?? "";
    case "link": return email.link_text ?? email.actionLabel ?? "";
    case "attachment": return email.attachment ?? "";
    case "signature": return email.signature ?? "";
    case "formatting": return "normal";
  }
}

// IDs for subject-wording and request-rephrase match the example API request.
export function getLabOptions(part: EmailPart, email: Email): LabChange[] {
  const add = (
    id: string,
    title: string,
    description: string,
    value: string,
    kind: ChangeKind,
    scope: ChangeScope,
    apiStatus: LabChange["apiStatus"] = "Proposed"
  ): LabChange => ({ id, part, title, description, value, kind, scope, apiStatus });

  switch (part) {
    case "senderName":
      return [add("sender-label", "Use a fictional sender label", "Test a different display name.", "Example Account Services", "Meaning-changing", "Metadata only")];
    case "senderAddress":
      return [add("sender-domain", "Use an example sender domain", "Use an inert, reserved example domain.", "notice@account-services.example", "Meaning-changing", "Metadata only")];
    case "subject":
      return [
        add("subject-format", "Normalize capitalization", "Change letter case without changing the words.", email.subject.toLowerCase(), "Meaning-preserving", "Message text"),
        add("subject-wording", "Use neutral subject wording", "Remove urgency from the subject line.", "A note about your account", "Meaning-changing", "Message text", "Example contract"),
      ];
    case "greeting":
      return [add("greeting-generic", "Use a generic greeting", "Replace the greeting while keeping the main request.", "Hello,", "Meaning-changing", "Message text")];
    case "body":
      return [add("body-rephrase", "Rephrase the body", "Replace the body with a less urgent account message.", "We noticed a recent change associated with your account. Review your account through the service you normally use.", "Meaning-changing", "Message text")];
    case "request":
      return [add("request-rephrase", "Remove the immediate deadline", "Recommend opening the official service independently.", "If this activity was unexpected, review your account using the official service.", "Meaning-changing", "Message text", "Example contract")];
    case "link":
      return [add("link-placeholder", "Use a neutral action label", "Only the displayed text changes. No real URL is opened.", "[Open the official service independently]", "Meaning-changing", "Metadata only")];
    case "attachment":
      return [add("attachment-label", "Use a sanitized filename", "Change only the example attachment filename.", "sample-document.pdf", "Meaning-preserving", "Metadata only")];
    case "signature":
      return [add("signature-fictional", "Use a fictional signature", "Replace the claimed organization details.", "Example Support Team", "Meaning-changing", "Metadata only")];
    case "formatting":
      return [
        add("layout-spacing", "Increase spacing", "Change the appearance, not the words.", "spacious", "Meaning-preserving", "Visual only"),
        add("layout-compact", "Use compact spacing", "Reduce spacing without changing the words.", "compact", "Meaning-preserving", "Visual only"),
      ];
  }
}

// Matches the proposed POST /api/what-if body.
export type WhatIfRequest = {
  email_id: string;
  transformations: { part: string; transformation_id: string }[];
};

export function buildWhatIfRequest(emailId: string, changes: LabChange[]): WhatIfRequest {
  return {
    email_id: emailId,
    transformations: changes.map((change) => ({
      part: toApiPart(change.part),
      transformation_id: change.id,
    })),
  };
}
