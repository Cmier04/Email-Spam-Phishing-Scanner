
export type Email = {
  id: string; // Gmail/FastAPI IDs are strings, e.g. "gmail_001".
  sender: string;
  email: string;
  initials: string; // Display-only avatar initials.
  tone: "blue" | "red" | "violet" | "amber" | "slate";
  subject: string;
  preview: string;
  time: string; // Temporary display label; derived from received_at later.
  received_at?: string;
  classification: "Legitimate" | "Potential threat";
  confidence: number; // 0-100.
  risk: "Low" | "Medium" | "High";
  threat_category?: string;
  greeting?: string;
  body?: string;
  request?: string;
  actionLabel?: string; // map FastAPI link_text here later.
  link_text?: string; // Optional raw API name for transition.
  links?: { display_text: string; url: string }[];
  attachment?: string;
  signature?: string;
  indicators?: { title: string; description: string }[];
};

export const mockEmails: Email[] = [
  {
    id: "gmail_001",
    sender: "Account Security",
    email: "security-alert@secure-mailbox.co",
    initials: "AS",
    tone: "red",
    subject: "Urgent: Your account will be suspended",
    preview: "We detected unusual activity. Verify your identity immediately.",
    time: "9:18 AM",
    received_at: "2026-10-20T09:18:00Z",
    classification: "Potential threat",
    threat_category: "phishing",
    confidence: 94,
    risk: "High",
    greeting: "Hello Alex,",
    body: "We detected unusual activity on your account.",
    request: "Please verify your identity within 24 hours.",
    actionLabel: "Verify account now",
    link_text: "Verify account now",
    links: [
      {
        display_text: "Verify account now",
        url: "https://account-services.example/verify",
      },
    ],
    attachment: "Account_Notice.pdf",
    signature: "Account Protection Team",
    indicators: [
      {
        title: "Suspicious sender",
        description: "Example indicator: the domain may not match the claimed organization.",
      },
      {
        title: "Urgent language",
        description: "Example indicator: the message pressures the recipient to act quickly.",
      },
    ],
  },
  {
    id: "gmail_002",
    sender: "Google Calendar",
    email: "calendar-notification@google.com",
    initials: "GC",
    tone: "blue",
    subject: "Reminder: Team sync in 10 minutes",
    preview: "Your weekly team sync starts soon. Join using your calendar event.",
    time: "10:42 AM",
    classification: "Legitimate",
    confidence: 98,
    risk: "Low",
    greeting: "Hello,",
    body: "Your weekly team sync starts in 10 minutes.",
    request: "Open your calendar to view the meeting details.",
  },
  {
    id: "gmail_003",
    sender: "Figma",
    email: "notifications@figma.com",
    initials: "F",
    tone: "violet",
    subject: "Maya mentioned you in Project Nova",
    preview: "Maya left a comment on the latest dashboard explorations.",
    time: "Yesterday",
    classification: "Legitimate",
    confidence: 99,
    risk: "Low",
  },
  {
    id: "gmail_004",
    sender: "Billing Support",
    email: "billing@paypaI-support.net",
    initials: "BS",
    tone: "amber",
    subject: "Invoice #8821 — payment failed",
    preview: "Your recent payment was declined. Update your payment details.",
    time: "Yesterday",
    classification: "Potential threat",
    threat_category: "phishing",
    confidence: 87,
    risk: "Medium",
    greeting: "Dear customer,",
    body: "Your recent payment was declined.",
    request: "Update your payment details to avoid account fees.",
    actionLabel: "Update payment details",
    attachment: "Invoice_8821.pdf",
    signature: "Customer Billing Department",
  },
  {
    id: "gmail_005",
    sender: "Notion",
    email: "team@notion.so",
    initials: "N",
    tone: "slate",
    subject: "Your workspace weekly digest",
    preview: "Here is what your team has been working on this week.",
    time: "May 24",
    classification: "Legitimate",
    confidence: 97,
    risk: "Low",
  },
];
