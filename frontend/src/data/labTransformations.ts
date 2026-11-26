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
export type ChangeDirection = "More suspicious" | "Neutral" | "Less suspicious";

export type LabChange = {
  id: string;
  part: EmailPart;
  title: string;
  description: string;
  value: string;
  direction: ChangeDirection;
  kind: ChangeKind;
  scope: ChangeScope;
};

const API_PARTS: Record<EmailPart, string> = {
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

export function toApiPart(part: EmailPart): string {
  return API_PARTS[part];
}

export function getOriginalPartValue(email: Email, part: EmailPart): string {
  switch (part) {
    case "senderName": return email.sender;
    case "senderAddress": return email.email;
    case "subject": return email.subject;
    case "greeting": return email.greeting ?? "";
    case "body": return email.body ?? email.preview;
    case "request": return email.request ?? "";
    case "link": return email.link_text ?? email.actionLabel ?? "";
    case "attachment": return email.attachment ?? "";
    case "signature": return email.signature ?? "";
    case "formatting": return "normal";
  }
}

// Three controlled, non-sendable learning examples per component. Only the
// existing neutral subject/body/request options use Qwen; the other examples
// are predictable, reserved-domain or display-only educational comparisons.
export function getLabOptions(part: EmailPart, email: Email): LabChange[] {
  const add = (
    id: string, title: string, description: string, value: string,
    direction: ChangeDirection, kind: ChangeKind, scope: ChangeScope,
  ): LabChange => ({ id, part, title, description, value, direction, kind, scope });

  switch (part) {
    case "senderName":
      return [
        add("sender-unverified", "Use an unverified sender label", "See how an unfamiliar display name changes the impression.", "Unverified Account Desk", "More suspicious", "Meaning-changing", "Metadata only"),
        add("sender-label", "Use a neutral sender label", "Replace the display name with an example organization.", "Example Account Services", "Neutral", "Meaning-changing", "Metadata only"),
        add("sender-friendly", "Use a customer support label", "Compare a professional-looking name; it still does not verify the sender.", "Example Customer Support", "Less suspicious", "Meaning-changing", "Metadata only"),
      ];
    case "senderAddress":
      return [
        add("sender-unusual-domain", "Use an unfamiliar example domain", "Practice noticing unfamiliar sender domains. Example addresses cannot receive mail.", "notice@unverified-alerts.example", "More suspicious", "Meaning-changing", "Metadata only"),
        add("sender-domain", "Use a neutral example address", "Compare a reserved example address without contacting anyone.", "notice@account-services.example", "Neutral", "Meaning-changing", "Metadata only"),
        add("sender-support-domain", "Use a support-style example address", "A familiar-looking address can still be misleading.", "support@service-help.example", "Less suspicious", "Meaning-changing", "Metadata only"),
      ];
    case "subject":
      return [
        add("subject-urgent", "Add an urgency cue", "Compare how time pressure in a training subject affects the assessment.", "Action requested today: account notice", "More suspicious", "Meaning-changing", "Message text"),
        add("subject-wording", "Use neutral subject wording", "Create a calm, email-specific subject without pressure or threats.", "A note about your account", "Neutral", "Meaning-changing", "Message text"),
        add("subject-informative", "Use a straightforward update", "Compare an informational subject without a call to action.", "Account information for your records", "Less suspicious", "Meaning-changing", "Message text"),
      ];
    case "greeting":
      return [
        add("greeting-impersonal", "Use an impersonal greeting", "A generic greeting can be a warning sign, but is not proof of phishing.", "Dear Customer,", "More suspicious", "Meaning-changing", "Message text"),
        add("greeting-generic", "Use a simple greeting", "Replace the opening without changing the main request.", "Hello,", "Neutral", "Meaning-changing", "Message text"),
        add("greeting-friendly", "Use a friendly greeting", "Compare a welcoming tone without claiming to know the recipient.", "Hello there,", "Less suspicious", "Meaning-changing", "Message text"),
      ];
    case "body":
      return [
        add("body-pressure", "Highlight pressure in the message", "Explore the effect of urgency in a harmless training example.", "This example account notice asks for quick attention. Unexpected requests should always be checked through a trusted source.", "More suspicious", "Meaning-changing", "Message text"),
        add("body-rephrase", "Rewrite the body neutrally", "Create a calmer example that keeps the email's general topic.", "We noticed a recent change associated with your account. Review your account through the service you normally use.", "Neutral", "Meaning-changing", "Message text"),
        add("body-reassuring", "Use a low-pressure explanation", "See how a calmer, informational message changes the assessment.", "This is a sample account update for your records. If it was unexpected, check directly with the service you normally use.", "Less suspicious", "Meaning-changing", "Message text"),
      ];
    case "request":
      return [
        add("request-pressure", "Add a time-pressure cue", "Explore why a rushed request deserves closer inspection.", "Please review this unexpected notice promptly, and verify it independently.", "More suspicious", "Meaning-changing", "Message text"),
        add("request-rephrase", "Remove the immediate deadline", "Replace one identified request with calm independent-verification advice.", "If this activity was unexpected, review your account using the official service.", "Neutral", "Meaning-changing", "Message text"),
        add("request-independent", "Suggest a trusted verification step", "Show a request that avoids links and encourages independent checking.", "If you have questions, contact the service using contact details you already trust.", "Less suspicious", "Meaning-changing", "Message text"),
      ];
    case "link":
      return [
        add("link-pressure", "Show a pushy action label", "Preview a label that creates pressure. No clickable link is created.", "Act now (example label only)", "More suspicious", "Meaning-changing", "Metadata only"),
        add("link-placeholder", "Use a neutral action label", "Preview a neutral label without opening or modifying any URL.", "View information (example label)", "Neutral", "Meaning-changing", "Metadata only"),
        add("link-independent", "Show an independent access reminder", "Preview text that reminds readers to navigate on their own.", "Open the official service yourself", "Less suspicious", "Meaning-changing", "Metadata only"),
      ];
    case "attachment":
      return [
        add("attachment-urgent", "Use a pressure-filled filename", "Compare a warning-sign filename. No attachment is created or opened.", "URGENT_notice_example.zip", "More suspicious", "Meaning-changing", "Metadata only"),
        add("attachment-label", "Use a neutral sample filename", "Preview a generic name; the actual file is never modified.", "sample-document.pdf", "Neutral", "Meaning-changing", "Metadata only"),
        add("attachment-descriptive", "Use a descriptive sample filename", "A clearer filename is easier to understand, but not proof of safety.", "account-information-example.txt", "Less suspicious", "Meaning-changing", "Metadata only"),
      ];
    case "signature":
      return [
        add("signature-pressure", "Use an urgent-looking signature", "Compare an authority cue without representing a real organization.", "Example Urgent Response Desk", "More suspicious", "Meaning-changing", "Metadata only"),
        add("signature-fictional", "Use a neutral example signature", "Preview a fictional signature on the temporary copy.", "Example Support Team", "Neutral", "Meaning-changing", "Metadata only"),
        add("signature-friendly", "Use a friendly support signature", "Compare a friendly sign-off; signatures alone do not verify identity.", "Example Customer Care", "Less suspicious", "Meaning-changing", "Metadata only"),
      ];
    case "formatting":
      return [
        add("layout-compact", "Use dense spacing", "Compare a more crowded presentation without changing any words.", "compact", "More suspicious", "Meaning-preserving", "Visual only"),
        add("layout-normal", "Use standard spacing", "Return the preview to ordinary paragraph spacing.", "normal", "Neutral", "Meaning-preserving", "Visual only"),
        add("layout-spacing", "Increase spacing", "Make the sample easier to read without changing the wording.", "spacious", "Less suspicious", "Meaning-preserving", "Visual only"),
      ];
  }
}

/** Keep older saved Lab sessions readable without adding a fourth visible option. */
export function getSavedLabOption(part: EmailPart, id: string, email: Email): LabChange | undefined {
  const current = getLabOptions(part, email).find((option) => option.id === id);
  if (current) return current;
  if (part === "subject" && id === "subject-format") {
    return {
      id, part, title: "Normalize capitalization (saved example)",
      description: "A change from a previous learning session.",
      value: email.subject.toLowerCase(), direction: "Neutral",
      kind: "Meaning-preserving", scope: "Message text",
    };
  }
  return undefined;
}

export type WhatIfRequest = {
  include_summary?: boolean;
  ai_mode?: "automatic" | "require_qwen";
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
