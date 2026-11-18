
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  FlaskConical,
  Inbox,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
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
      "PhishLab currently loads synthetic example emails from FastAPI and classifies their subject and body using a local machine learning model. You can review scan results, open an email analysis, experiment in the Learning Lab, and save interface preferences. Live Gmail inbox scanning is not connected to this demo interface.",
  },
  {
    id: "first-steps",
    category: "Getting started",
    question: "How do I get started?",
    answer:
      "Open Dashboard to see an overview of the loaded examples. Select Scan results to search and filter all available examples. Click an email row or its arrow to open Email Analysis. From there, open Learning Lab to see how supported changes affect the classifier.",
  },
  {
    id: "where-results",
    category: "Scan results",
    question: "Where do the emails on Scan results come from?",
    answer:
      "The page requests GET /api/demo/emails from your local FastAPI backend. These are demonstration emails evaluated by the saved classifier, not messages from a connected Gmail account or a database of past scans.",
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
      "Confidence describes the model's confidence in its predicted class. Malicious probability is the model's estimated probability of the malicious class. For example, a confident Legitimate prediction can have a low malicious probability. The Low, Medium, and High risk labels in this demo are example metadata, not another prediction made by the model.",
  },
  {
    id: "filters",
    category: "Scan results",
    question: "How can I find a specific email?",
    answer:
      "Open Scan results and use the search field to look up a sender, address, or subject. You can also filter by classification and demo risk, change the sort order, and move between pages. If no emails match, adjust the filters or use Clear filters.",
  },
  {
    id: "lab-works",
    category: "Learning Lab",
    question: "How does the Learning Lab work?",
    answer:
      "Select an example email, open Learning Lab, choose an editable part, and apply a supported transformation. The app sends an isolated modified copy to POST /api/what-if. FastAPI returns the model's original and modified predictions and malicious probabilities. Your original example remains unchanged.",
  },
  {
    id: "lab-scores",
    category: "Learning Lab",
    question: "Why didn't the detection score change after an edit?",
    answer:
      "The classifier primarily uses subject and body text. Some changes only affect presentation or metadata, so they may not change the model's input or prediction. Review any warnings in the Learning Lab, and try a supported subject or body transformation to compare the results.",
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
      "Not through the current demo interface. The Settings page shows Gmail as not connected, and the Connect Gmail button is disabled until the sign-in and syncing workflow is integrated. The dashboard's Scan emails button does not start a real Gmail scan.",
  },
  {
    id: "settings",
    category: "Settings & Gmail",
    question: "Do Settings options control real scanning and notifications?",
    answer:
      "The current switches and retention selection are saved as local interface preferences. They do not start background scanning, send alerts, or automatically delete scan history. Export and Delete also need a connected history-storage implementation.",
  },
  {
    id: "api-down",
    category: "Troubleshooting",
    question: "What should I do if I see HTTP 502 or Connection failed?",
    answer:
      "A 502 or connection error can occur when the frontend cannot get a valid response from FastAPI. Verify that the backend is running on 127.0.0.1:8000, check the backend terminal for errors, then use the red Retry connection button. The frontend's Vite proxy must point /api requests to that backend address.",
  },
  {
    id: "nothing-loads",
    category: "Troubleshooting",
    question: "Why are no emails showing?",
    answer:
      "First check for a connection error and start FastAPI if needed. You can test the endpoint at http://127.0.0.1:8000/api/demo/emails. If the endpoint returns data, refresh the results and clear any active search or filters. If it returns an error, inspect the FastAPI terminal.",
  },
  {
    id: "reload",
    category: "Troubleshooting",
    question: "Does Retry connection scan my Gmail?",
    answer:
      "No. Retry connection repeats the demo-email request to FastAPI. It only reloads the local demonstration data and does not access a Gmail inbox.",
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
      <header className="flex min-h-[72px] items-center gap-3 border-b border-[#e4e8ef] bg-white px-5 md:px-8">
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

      <div className="mx-auto max-w-[1100px] px-5 py-7 md:px-8 md:py-9">
        <section className="relative overflow-hidden rounded-2xl bg-[#243b76] px-6 py-9 text-white md:px-9 md:py-11">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/5" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-36 h-56 w-56 rounded-full bg-white/5" />
          <div className="relative max-w-[630px]">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/90">
              <BookOpen size={14} /> PhishLab guides and answers
            </div>
            <h2 className="text-[26px] font-bold tracking-tight md:text-[32px]">How can we help?</h2>
            <p className="mt-2 text-sm leading-6 text-[#d9e2fb]">
              Learn how to review scan results, use the Learning Lab, and troubleshoot connection issues.
            </p>

            <label className="relative mt-6 block">
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
            </label>
          </div>
        </section>

        <section aria-labelledby="quick-guides" className="mt-8">
          <div className="mb-4">
            <h3 id="quick-guides" className="text-base font-bold text-[#202a44]">Quick guides</h3>
            <p className="mt-1 text-xs text-[#8892a4]">Jump to a feature you want to explore.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <p className="mt-1 text-xs text-[#8892a4]">Answers based on PhishLab's current demo features.</p>
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

          <div className="overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm">
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

        <section aria-labelledby="connection-guide" className="mt-8 rounded-2xl border border-[#e1e6ee] bg-white px-5 py-5 shadow-sm md:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff0ed] text-[#b8493b]">
              <WifiOff size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="connection-guide" className="text-sm font-bold text-[#28334e]">Having trouble connecting to FastAPI?</h3>
              <p className="mt-1.5 text-xs leading-6 text-[#788398]">
                Check that the backend is running, then retry the connection from the Dashboard or Scan Results page.
              </p>
              <div className="mt-3 overflow-x-auto rounded-lg bg-[#f3f5f9] px-3 py-3 font-mono text-[11px] text-[#44516a]">
                python -m uvicorn app.main:app --reload --port 8000
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[#9098a8]">
                Run the command inside the backend folder with its Python virtual environment activated. Check /health or /docs at http://127.0.0.1:8000 to confirm the API is available.
              </p>
              <button
                type="button"
                onClick={() => onNavigate("dashboard")}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3157d5] hover:underline"
              >
                Return to dashboard <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export default HelpCenterPage;
