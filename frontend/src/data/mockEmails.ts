
export type Email = {
  id: number;
  sender: string;
  email: string;
  initials: string;
  tone: "blue" | "red" | "violet" | "amber" | "slate";
  subject: string;
  preview: string;
  time: string;
  classification: "Legitimate" | "Potential threat";
  confidence: number;
  risk: "Low" | "Medium" | "High";
  greeting?: string;
  body?: string;
  request?: string;
  actionLabel?: string;
  attachment?: string;
  signature?: string;
};

// Example records used while the backend is still under development.
export const mockEmails: Email[] = [
  {
    id: 1,
    sender: "Google Calendar",
    email: "calendar-notification@google.com",
    initials: "GC",
    tone: "blue",
    subject: "Reminder: Team sync in 10 minutes",
    preview: "Your weekly team sync starts soon.",
    time: "10:42 AM",
    classification: "Legitimate",
    confidence: 98,
    risk: "Low",
  },
  {
    id: 2,
    sender: "Account Security",
    email: "security-alert@secure-mailbox.co",
    initials: "AS",
    tone: "red",
    subject: "Urgent: Your account will be suspended",
    preview: "Verify your identity immediately.",
    time: "9:18 AM",
    classification: "Potential threat",
    confidence: 94,
    risk: "High",
    greeting: "Hello,",
    body: "We detected unusual activity associated with your account. Your access may be restricted if this issue is not reviewed.",
    request: "Review your account using the official service rather than following an unexpected email link.",
    actionLabel: "Verify account now",
    attachment: "Account_Notice.pdf",
    signature: "Account Protection Team",
  },
  {
    id: 3,
    sender: "Figma",
    email: "notifications@figma.com",
    initials: "F",
    tone: "violet",
    subject: "Maya mentioned you in Project Nova",
    preview: "Maya left a comment on your design.",
    time: "Yesterday",
    classification: "Legitimate",
    confidence: 99,
    risk: "Low",
  },
  {
    id: 4,
    sender: "Billing Support",
    email: "billing@paypaI-support.net",
    initials: "BS",
    tone: "amber",
    subject: "Invoice #8821 — payment failed",
    preview: "Your recent payment was declined.",
    time: "Yesterday",
    classification: "Potential threat",
    confidence: 87,
    risk: "Medium",
  },
  {
    id: 5,
    sender: "Notion",
    email: "team@notion.so",
    initials: "N",
    tone: "slate",
    subject: "Your workspace weekly digest",
    preview: "Here is what your team has been working on.",
    time: "May 24",
    classification: "Legitimate",
    confidence: 97,
    risk: "Low",
  },
];
