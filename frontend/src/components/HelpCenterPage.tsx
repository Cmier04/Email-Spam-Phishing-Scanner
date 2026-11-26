
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Code2,
  ChevronDown,
  Cpu,
  CircleHelp,
  FlaskConical,
  Inbox,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";

import type { AppPage } from "./Sidebar";

type HelpCenterProps = {
  onOpenMenu: () => void;
  onNavigate: (page: AppPage) => void;
};

const categories = [
  "All topics",
  "Getting started",
  "Scan results",
  "Learning Lab",
  "Settings & Gmail",
  "Privacy & history",
  "Troubleshooting",
] as const;

type HelpCategory = (typeof categories)[number];
type TopicCategory = Exclude<HelpCategory, "All topics">;

type Question = {
  id: string;
  category: TopicCategory;
  question: string;
  answer: string;
};

const questions: Question[] = [
  {
    id: "demo-mode",
    category: "Getting started",
    question: "What can PhishLab do right now?",
    answer:
      "PhishLab helps you review potential phishing messages, compare detection results, and learn the warning signs. You can explore training emails right away, or connect Gmail with read-only access to scan recent inbox messages.",
  },
  {
    id: "first-steps",
    category: "Getting started",
    question: "How do I get started?",
    answer:
      "Start with Training demo on the Dashboard, or connect Gmail from Settings. Open Scan results, select an email, and read its detailed analysis. Choose Learning Lab to experiment with a temporary copy and see how changes affect its assessment.",
  },
  {
    id: "where-results",
    category: "Scan results",
    question: "Where do the emails on Scan results come from?",
    answer:
      "Choose Training demo to explore fictional examples, or Gmail inbox to view results from an inbox you have connected and scanned. The two sources are kept separate so practice messages are not confused with your mail.",
  },
  {
    id: "classification",
    category: "Scan results",
    question: "What do Legitimate and Potential threat mean?",
    answer:
      "They are predictions from the current machine learning model. Legitimate means the model predicted the email is not malicious; Potential threat means the model predicted the malicious class. Predictions can be wrong, so do not treat them as a guarantee that an email is safe or dangerous.",
  },
  {
    id: "confidence",
    category: "Scan results",
    question: "What is the difference between confidence, malicious probability, and risk?",
    answer:
      "Confidence describes how strongly the model favors its predicted category. Malicious probability is its estimate for the potentially harmful category. A high confidence score does not always mean a high risk score. Training examples may also include illustrative risk labels.",
  },
  {
    id: "filters",
    category: "Scan results",
    question: "How can I find a specific email?",
    answer:
      "Open Scan results and search for a sender, email address, or subject. You can filter by classification, choose a sort order, and move between pages. Use Clear filters if you want to see everything again.",
  },
  {
    id: "lab-works",
    category: "Learning Lab",
    question: "How does the Learning Lab work?",
    answer:
      "Open an email, select Learning Lab, and choose a part of the message. Try a more suspicious, neutral, or less suspicious example to compare the original with a temporary copy. The app updates the learning comparison without editing, sending, or replying to the real email.",
  },
  {
    id: "lab-scores",
    category: "Learning Lab",
    question: "Why didn't the detection score change after an edit?",
    answer:
      "The detection model checks subject and body text. Display names, link labels, attachment names, signatures, and spacing are useful clues for people, but a preview-only change does not change the text being scored. Also, a wording edit may not be enough to change the predicted category.",
  },
  {
    id: "lab-reset",
    category: "Learning Lab",
    question: "How do I undo my Learning Lab changes?",
    answer:
      "Use Undo this change to remove an applied transformation, or Restore entire copy to return the experiment to its original state. These actions affect the experiment only; they do not edit or send the original email.",
  },
  {
    id: "gmail",
    category: "Settings & Gmail",
    question: "Can I connect my Gmail inbox?",
    answer:
      "Yes, when Gmail setup is available on your device. Go to Settings → Connected inbox, choose Connect Gmail, and complete Google's authorization. The app requests read-only email access. You can disconnect from the same page; disconnecting the app does not itself revoke access in your Google Account settings.",
  },
  {
    id: "settings",
    category: "Settings & Gmail",
    question: "Do Settings options control real scanning and notifications?",
    answer:
      "Interface preferences are stored on this device. Gmail scans run when you request them rather than automatically in the background. If local history storage is available and you enable it, the app can save lab sessions and scan feedback; you can also export or delete those saved records under Settings.",
  },
  {
    id: "api-down",
    category: "Troubleshooting",
    question: "What should I do if I see HTTP 502 or Connection failed?",
    answer:
      "First try reconnecting from the notification. If the issue continues, check that PhishLab's local service is running. Developers can find startup commands and diagnostics in the Developer & debugging tab above.",
  },
  {
    id: "nothing-loads",
    category: "Troubleshooting",
    question: "Why are no emails showing?",
    answer:
      "Check your connection status, select the correct source (Gmail inbox or Training demo), and clear search filters. To view real inbox results, your Gmail account must be connected and a scan must have completed. If the app cannot load training examples either, try reconnecting.",
  },
  {
    id: "reload",
    category: "Troubleshooting",
    question: "Does Retry connection scan my Gmail?",
    answer:
      "No. Retry connection only tries to restore communication with the application service. Gmail messages are scanned when you deliberately choose Scan emails while connected.",
  },
  {
    id: "details",
    category: "Scan results",
    question: "What should I check in Email Analysis?",
    answer: "Look at the full sender address, unexpected requests, link information, and any identified warning signs. The model's label is one clue, not proof of authenticity. For uncertain messages, use a trusted way to contact the organization independently.",
  },
  {
    id: "lab-directions",
    category: "Learning Lab",
    question: "What do more suspicious, neutral, and less suspicious mean?",
    answer: "These choices demonstrate how a clue may change a reader's impression and sometimes the detection score. They are learning labels, not new security verdicts. A polished message may still be fraudulent, and a rushed message is not necessarily malicious.",
  },
  {
    id: "lab-ai",
    category: "Learning Lab",
    question: "Where does the learning explanation come from?",
    answer: "Some neutral writing examples and lesson summaries use an optional on-device writing assistant. Other examples use prepared wording. AI-generated explanations may be incomplete; compare them with the original message and verified results rather than relying on them as security advice.",
  },
  {
    id: "lab-preview",
    category: "Learning Lab",
    question: "Do the link, attachment, or signature examples change the actual email?",
    answer: "No. These options only show what a different visible label or filename might look like. PhishLab does not create clickable links, open attachments, edit a stored Gmail message, or pretend that these display edits changed the classifier's text input.",
  },
  {
    id: "history-save",
    category: "Privacy & history",
    question: "How do I save and return to a Learning Lab session?",
    answer: "If local storage is available, enable Save Lab history under Settings → Data and privacy. Your applied examples and results can then be reopened from Lab history. You can remove an individual saved lab there or delete saved data from Settings.",
  },
  {
    id: "privacy",
    category: "Privacy & history",
    question: "Are my original emails edited or sent by the Learning Lab?",
    answer: "No. The Learning Lab compares temporary copies and Gmail access is read-only. Local learning sessions can contain email text if you choose to save them, so check the Data and privacy settings before enabling history on a shared device.",
  },
  {
    id: "gmail-auth",
    category: "Settings & Gmail",
    question: "What if Gmail sign-in fails or is cancelled?",
    answer: "Open Settings → Connected inbox and try connecting again. Confirm you are signed into the intended Google account and complete the authorization window. The training demo remains available without connecting Gmail; advanced setup issues are covered in Developer & debugging.",
  },
  {
    id: "false-positives",
    category: "Scan results",
    question: "Can a legitimate email be flagged as a threat?",
    answer: "Yes. Automated detection can make mistakes in either direction. Look at the message details and independently verify unexpected requests before deciding what to do.",
  },
];

const quickLinks: {
  title: string;
  description: string;
  label: string;
  destination: AppPage;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    title: "Dashboard overview",
    description: "Understand the totals and your latest example classifications.",
    label: "Open dashboard",
    destination: "dashboard",
    icon: ShieldCheck,
    tone: "bg-[#e8efff] text-[#3157d5]",
  },
  {
    title: "Browse scan results",
    description: "Search, filter, and open model-classified emails.",
    label: "View scan results",
    destination: "results",
    icon: Inbox,
    tone: "bg-[#e9f7f0] text-[#277c58]",
  },
  {
    title: "Explore Learning Lab",
    description: "Choose an email first, then compare changes to its detection score.",
    label: "Choose an email",
    destination: "results",
    icon: FlaskConical,
    tone: "bg-[#f0eafe] text-[#7050b6]",
  },
  {
    title: "Manage preferences",
    description: "Review your local settings and Gmail connection status.",
    label: "Open settings",
    destination: "settings",
    icon: Settings2,
    tone: "bg-[#fff0d9] text-[#a86115]",
  },
];

function HelpCenterPage({ onOpenMenu, onNavigate }: HelpCenterProps) {
  const [tab, setTab] = useState<"guides" | "developer">("guides");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<HelpCategory>("All topics");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredQuestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter((item) => {
      const matchesCategory = category === "All topics" || item.category === category;
      const matchesSearch =
        !query ||
        [item.question, item.answer, item.category].some((value) =>
          value.toLowerCase().includes(query),
        );
      return matchesCategory && matchesSearch;
    });
  }, [search, category]);

  function clearSearch() {
    setSearch("");
    setCategory("All topics");
    setExpandedId(null);
  }

  return (
    <>
      <header className="phishlab-topbar-enter flex min-h-[72px] items-center gap-3 border-b border-[#e4e8ef] bg-white px-5 md:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="text-[#596579] lg:hidden"
        >
          <Menu size={20} />
        </button>
        <CircleHelp size={19} className="text-[#687288]" />
        <h1 className="text-sm font-bold text-[#202a44]">Help center</h1>
      </header>

      <div className="phishlab-help-stagger mx-auto max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
        <section className="relative overflow-hidden rounded-2xl bg-[#243b76] px-6 py-9 text-white md:px-9 md:py-11">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/5" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-36 h-56 w-56 rounded-full bg-white/5" />
          <div className="relative max-w-[630px]">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/90">
              <BookOpen size={14} /> PhishLab guides and answers
            </div>
            <h2 className="text-[26px] font-bold tracking-tight md:text-[32px]">How can we help?</h2>
            <p className="mt-2 text-sm leading-6 text-[#d9e2fb]">
              Explore guides for spotting suspicious emails, comparing examples, and managing your account.
            </p>

            {tab === "guides" && <label className="relative mt-6 block">
              <span className="sr-only">Search help articles</span>
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a95ac]" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search for answers..."
                className="w-full rounded-xl border border-white/20 bg-white py-3.5 pl-11 pr-11 text-sm text-[#26314c] shadow-sm outline-none placeholder:text-[#9ba3b2] focus:ring-2 focus:ring-[#abc0ff]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear help search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#8893a6] hover:bg-[#f0f3f9] hover:text-[#26314c]"
                >
                  <X size={16} />
                </button>
              )}
            </label>}
          </div>
        </section>

        <div role="tablist" aria-label="Help center sections" className="mt-6 flex flex-wrap gap-2 border-b border-[#e1e6ee] pb-3">
          <button type="button" role="tab" aria-selected={tab === "guides"} onClick={() => setTab("guides")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold ${tab === "guides" ? "bg-[#eef2ff] text-[#3157d5]" : "text-[#657087] hover:bg-[#f2f4f9]"}`}>
            <BookOpen size={16} /> Help guides
          </button>
          <button type="button" role="tab" aria-selected={tab === "developer"} onClick={() => setTab("developer")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold ${tab === "developer" ? "bg-[#eef2ff] text-[#3157d5]" : "text-[#657087] hover:bg-[#f2f4f9]"}`}>
            <TerminalSquare size={16} /> Developer &amp; debugging
          </button>
        </div>

        {tab === "guides" ? <div role="tabpanel" className="min-w-0">
        <section aria-labelledby="quick-guides" className="mt-8">
          <div className="mb-4">
            <h3 id="quick-guides" className="text-base font-bold text-[#202a44]">Quick guides</h3>
            <p className="mt-1 text-xs text-[#8892a4]">Jump to a feature you want to explore.</p>
          </div>
          <div className="phishlab-help-cards grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map(({ title, description, label, destination, icon: Icon, tone }) => (
              <button
                key={title}
                type="button"
                onClick={() => onNavigate(destination)}
                className="group flex min-h-[190px] flex-col items-start rounded-2xl border border-[#e1e6ee] bg-white p-5 text-left shadow-sm transition-colors hover:border-[#c8d3ef] hover:bg-[#f8faff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157d5]"
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
                  <Icon size={19} />
                </span>
                <span className="mt-4 text-sm font-bold text-[#28334e]">{title}</span>
                <span className="mt-1.5 flex-1 text-[11px] leading-5 text-[#8790a2]">{description}</span>
                <span className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-[#3157d5]">
                  {label}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="mt-9">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id="faq-heading" className="text-base font-bold text-[#202a44]">Frequently asked questions</h3>
              <p className="mt-1 text-xs text-[#8892a4]">Answers for PhishLab's scanning, learning, and privacy features.</p>
            </div>
            <span className="text-[11px] font-semibold text-[#8790a2]" role="status" aria-live="polite">
              {filteredQuestions.length} {filteredQuestions.length === 1 ? "answer" : "answers"}
            </span>
          </div>

          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter help topics">
            {categories.map((topic) => (
              <button
                key={topic}
                type="button"
                aria-pressed={category === topic}
                onClick={() => { setCategory(topic); setExpandedId(null); }}
                className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${
                  category === topic
                    ? "border-[#3157d5] bg-[#eef2ff] text-[#3157d5]"
                    : "border-[#e0e5ee] bg-white text-[#69748a] hover:bg-[#f4f6fa]"
                }`}
              >
                {topic}
              </button>
            ))}
          </div>

          <div className="phishlab-help-questions overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm">
            {filteredQuestions.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <CircleHelp size={28} className="text-[#9aa7bf]" />
                <p className="mt-3 text-sm font-semibold text-[#35405a]">No matching help articles</p>
                <p className="mt-1 text-xs text-[#8892a4]">Try another search or select a different topic.</p>
                <button type="button" onClick={clearSearch} className="mt-4 text-xs font-semibold text-[#3157d5] hover:underline">
                  Clear search and filters
                </button>
              </div>
            ) : (
              filteredQuestions.map((item, index) => {
                const expanded = expandedId === item.id;
                return (
                  <div key={item.id} className={index > 0 ? "border-t border-[#edf0f4]" : ""}>
                    <h4>
                      <button
                        type="button"
                        id={`faq-button-${item.id}`}
                        aria-expanded={expanded}
                        aria-controls={`faq-panel-${item.id}`}
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        className="flex w-full items-center justify-between gap-5 px-5 py-4 text-left transition-colors hover:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#3157d5] md:px-6"
                      >
                        <span>
                          <span className="block text-[10px] font-semibold text-[#8b96aa]">{item.category}</span>
                          <span className="mt-1 block text-xs font-semibold text-[#34405c] md:text-sm">{item.question}</span>
                        </span>
                        <ChevronDown size={18} className={`shrink-0 text-[#8793a8] transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </button>
                    </h4>
                    {expanded && (
                      <div
                        id={`faq-panel-${item.id}`}
                        role="region"
                        aria-labelledby={`faq-button-${item.id}`}
                        className="border-t border-[#f0f2f6] bg-[#fafbfe] px-5 py-4 md:px-6"
                      >
                        <p className="max-w-[820px] text-xs leading-6 text-[#677288]">{item.answer}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        </div> : <div role="tabpanel" className="mt-8 space-y-6">
          <section className="rounded-2xl border border-[#e1e6ee] bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center gap-2"><Code2 size={19} className="text-[#3157d5]" /><h3 className="text-base font-bold text-[#202a44]">Local development commands</h3></div>
            <p className="mt-2 text-xs leading-6 text-[#748095]">For developers running the source version. Activate your Python environment and install project dependencies first. Run each section from the indicated folder.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                { title: "Start the backend", note: "Run from the backend folder.", command: "python -m uvicorn app.main:app --reload --port 8000" },
                { title: "Start the interface", note: "Run from the frontend folder.", command: "npm ci\nnpm run dev" },
                { title: "Set up the local writing assistant", note: "Optional. Run from backend; installs the runtime and Qwen3 4B 4-bit model.", command: "python scripts/setup_local_ai.py" },
                { title: "Run backend checks", note: "Run from backend; tests do not require a live Gmail inbox.", command: "python -m unittest discover -s tests" },
                { title: "Run frontend checks", note: "Run from frontend.", command: "npm test\nnpm run build" },
                { title: "Check API health", note: "With the backend running, open this address in a browser.", command: "http://127.0.0.1:8000/health" },
              ].map(({ title, note, command }) => (
                <div key={title} className="min-w-0 rounded-xl border border-[#e3e8f1] bg-[#fbfcff] p-4">
                  <h4 className="text-xs font-bold text-[#34405c]">{title}</h4>
                  <p className="mt-1 text-[11px] leading-5 text-[#7b8497]">{note}</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-[#1d2842] p-3 text-[11px] leading-5 text-[#f1f5ff]">{command}</pre>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-[#e1e6ee] bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center gap-2"><Cpu size={19} className="text-[#3157d5]" /><h3 className="text-base font-bold text-[#202a44]">Model and device diagnostics</h3></div>
            <p className="mt-2 text-xs leading-6 text-[#748095]">Settings → Debugging shows model availability, CPU/GPU settings, application readiness, and the optional test runner. Use Auto detect for recommended device settings; manual overrides are intended for developers.</p>
            <div className="mt-4 space-y-2 text-xs leading-6 text-[#657087]">
              <p><strong>Qwen required:</strong> Forces AI rewrites and learning explanations to use the local model. If the model is unavailable, the comparison reports an error instead of silently substituting prepared text.</p>
              <p><strong>Standard mode:</strong> Falls back to a prepared, safe learning example when AI writing is unavailable. Detection scores still come from the classifier.</p>
              <p><strong>Preview-only fields:</strong> Link labels, attachment names, and signatures are not separate classifier inputs; the app shows their effect on presentation only.</p>
              <p><strong>Privacy:</strong> Never commit OAuth tokens, client secrets, saved email content, or local runtime settings to source control.</p>
            </div>
            <button type="button" onClick={() => onNavigate("settings")} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#3157d5] hover:underline"><Settings2 size={15} /> Open debugging settings</button>
          </section>
          <section className="rounded-2xl border border-[#e1e6ee] bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center gap-2"><WifiOff size={19} className="text-[#b8493b]" /><h3 className="text-base font-bold text-[#202a44]">Troubleshooting checklist</h3></div>
            <p className="mt-3 text-xs leading-6 text-[#657087]">If the app cannot connect, verify that the backend is running and check <code>http://127.0.0.1:8000/health</code>. For an unavailable learning assistant, check the GGUF model and runtime status under Debugging. If Gmail fails, verify that a Google Desktop OAuth client is configured before reconnecting.</p>
            <p className="mt-2 text-xs leading-6 text-[#657087]">The backend also documents available routes at <code>http://127.0.0.1:8000/docs</code>. The Python test runner appears in Settings only when enabled for local development.</p>
          </section>
        </div>}
      </div>
    </>
  );
}

export default HelpCenterPage;
