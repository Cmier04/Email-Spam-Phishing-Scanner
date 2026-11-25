
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  ShieldAlert,
  ClipboardList,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";

import type { Email } from "../data/mockEmails";
import type { EmailMode } from "../data/emailPresentation";
import AnimatedNumber from "./AnimatedNumber";

type ClassificationFilter = "All" | Email["classification"];
type SortOrder = "newest" | "oldest" | "confidence-high" | "confidence-low";

type ScanResultsPageProps = {
  emails: Email[];
  loading: boolean;
  error: string | null;
  emailMode: EmailMode;
  hasLoaded: boolean;
  onSelect: (email: Email) => void;
};

const PAGE_SIZE = 8;
const toneStyles: Record<Email["tone"], string> = {
  blue: "bg-[#e8f0ff] text-[#315fbd]",
  red: "bg-[#ffe9e5] text-[#c84d3e]",
  violet: "bg-[#f0eafe] text-[#7050b6]",
  amber: "bg-[#fff0d9] text-[#a86115]",
  slate: "bg-[#edf0f4] text-[#485366]",
};

function receivedTimestamp(email: Email): number {
  if (!email.received_at) return 0;
  const timestamp = Date.parse(email.received_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function displayDate(email: Email): string {
  const timestamp = receivedTimestamp(email);
  if (timestamp === 0) return email.time;
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ScanResultsPage({
  emails,
  loading,
  error,
  emailMode,
  hasLoaded,
  onSelect,
}: ScanResultsPageProps) {
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState<ClassificationFilter>("All");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [page, setPage] = useState(1);
  const [exportNotice, setExportNotice] = useState<"success" | "error" | null>(null);
  const [exportedCount, setExportedCount] = useState(0);
  const showSkeleton = loading && emails.length === 0;

  useEffect(() => {
    if (!exportNotice) return;
    const timer = window.setTimeout(() => setExportNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [exportNotice, exportedCount]);

  const threatCount = emails.filter(
    (email) => email.classification === "Potential threat",
  ).length;
  // High-confidence model-flagged threats are a presentation priority, not a new classification.
  const needsReviewCount = emails.filter(
    (email) => email.classification === "Potential threat" && email.confidence >= 85,
  ).length;
  const threatPercentage = emails.length > 0
    ? ((threatCount / emails.length) * 100).toFixed(1)
    : "0.0";

  const filteredEmails = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = emails.filter((email) => {
      const matchesClassification =
        classification === "All" || email.classification === classification;
      const matchesSearch =
        !query ||
        [email.sender, email.email, email.subject, email.preview]
          .some((value) => value.toLowerCase().includes(query));
      return matchesClassification && matchesSearch;
    });

    return [...matches].sort((a, b) => {
      switch (sortOrder) {
        case "oldest":
          return receivedTimestamp(a) - receivedTimestamp(b);
        case "confidence-high":
          return b.confidence - a.confidence;
        case "confidence-low":
          return a.confidence - b.confidence;
        case "newest":
        default:
          return receivedTimestamp(b) - receivedTimestamp(a);
      }
    });
  }, [emails, search, classification, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageEmails = filteredEmails.slice(startIndex, startIndex + PAGE_SIZE);

  // Export the currently filtered rows.
  function exportResults() {
    if (!filteredEmails.length || loading) return;
    let url: string | null = null;
    try {
      const csvCell = (value: string | number | undefined): string => {
        const raw = String(value ?? "");
        // Protect spreadsheet users from formulas embedded in untrusted email text.
        const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const header = ["Sender", "Sender address", "Subject", "Received", "Classification", "Confidence (%)", "Malicious probability (%)"];
      const rows = filteredEmails.map((email) => [
        email.sender,
        email.email,
        email.subject,
        email.received_at ?? email.time,
        email.classification,
        email.confidence.toFixed(1),
        email.maliciousProbability?.toFixed(1) ?? "",
      ]);
      const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `phishlab-scan-results-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      const downloadUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
      setExportedCount(filteredEmails.length);
      setExportNotice("success");
    } catch {
      if (url) URL.revokeObjectURL(url);
      setExportNotice("error");
    }
  }

  function clearFilters() {
    setSearch("");
    setClassification("All");
    setSortOrder("newest");
    setPage(1);
  }

  return (
    <div className="phishlab-scan-stagger mx-auto max-w-[1280px] px-5 py-7 md:px-8 md:py-9">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight text-[#17213c]">
            All scan results
          </h2>
          <p className="mt-1 text-sm text-[#747e93]">
            Review emails classified by your local machine learning model.
          </p>
        </div>

        <button
          type="button"
          onClick={exportResults}
          disabled={loading || filteredEmails.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-[#dce2ec] bg-white px-4 py-2.5 text-xs font-semibold text-[#485672] transition hover:bg-[#f1f4f9] disabled:cursor-not-allowed disabled:opacity-50"
          title="Download the currently filtered results as CSV"
        >
          <Download size={15} />
          Export Results
        </button>
      </div>

      {/* Compact, data-driven statistics with distinct icons. */}
      <section
        aria-label="Scan result statistics"
        className="phishlab-scan-metrics mb-6 grid gap-3 md:grid-cols-3 lg:gap-4"
      >
        <div className="rounded-2xl border border-[#e0e5ee] bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-[#858ea5]">Total scanned</p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#edf2fc] text-[#476ca7]">
              <Inbox size={17} aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[29px] font-bold leading-none tracking-tight tabular-nums text-[#26314d]">
              {showSkeleton ? (
                <span aria-label="Loading" className="phishlab-skeleton inline-block h-7 w-16 rounded" />
              ) : <AnimatedNumber value={emails.length.toLocaleString()} />}
            </span>
            <span className="text-[11px] font-medium text-[#959eb2]">
              {emailMode === "gmail" ? "Current Gmail scan" : "Current demo batch"}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e0e5ee] bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-[#858ea5]">Potential threats</p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fff0ed] text-[#c65343]">
              <ShieldAlert size={17} aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[29px] font-bold leading-none tracking-tight tabular-nums text-[#c65343]">
              {showSkeleton ? (
                <span aria-label="Loading" className="phishlab-skeleton inline-block h-7 w-16 rounded" />
              ) : <AnimatedNumber value={threatCount.toLocaleString()} />}
            </span>
            <span className="text-[11px] font-medium text-[#959eb2]">
              {showSkeleton ? "Loading..." : `${threatPercentage}% of messages`}
            </span>
          </div>
        </div>

        <div
          title="Potential threats with at least 85% classification confidence."
          className="rounded-2xl border border-[#e0e5ee] bg-white px-5 py-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-[#858ea5]">Needs review</p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fff5e6] text-[#b47c28]">
              <ClipboardList size={17} aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[29px] font-bold leading-none tracking-tight tabular-nums text-[#26314d]">
              {showSkeleton ? (
                <span aria-label="Loading" className="phishlab-skeleton inline-block h-7 w-16 rounded" />
              ) : <AnimatedNumber value={needsReviewCount.toLocaleString()} />}
            </span>
            <span className="text-[11px] font-medium text-[#959eb2]">High confidence first</span>
          </div>
        </div>
      </section>

      <section aria-busy={showSkeleton} className="phishlab-scan-table overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e7eaf0] px-5 py-5 md:px-6">
          <div>
            <h3 className="text-base font-bold text-[#202a44]">Email classifications</h3>
            <p className="mt-1 text-xs text-[#8a92a4]">
              {emailMode === "gmail"
                ? "Current results are recent Gmail messages classified by the local model."
                : "Current results are synthetic training messages from FastAPI's demo endpoint."}
            </p>
          </div>
          <span className="rounded-full bg-[#eef2ff] px-3 py-1.5 text-[11px] font-semibold text-[#3157d5]">
            {showSkeleton ? "Loading..." : `${filteredEmails.length} results`}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-[#edf0f4] px-5 py-4 md:px-6">
          <label className="min-w-[220px] flex-1 md:max-w-[360px]">
            <span className="mb-1.5 block text-[11px] font-semibold text-[#687288]">Search emails</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-[#9aa2b2]" />
              <input
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Sender, address, or subject"
                className="w-full rounded-lg border border-[#dfe4eb] py-2 pl-9 pr-3 text-xs outline-none focus:border-[#8ca2e7] focus:ring-2 focus:ring-[#e7ebfa]"
              />
            </span>
          </label>

          <label className="min-w-[150px] flex-1 sm:flex-none">
            <span className="mb-1.5 block text-[11px] font-semibold text-[#687288]">Classification</span>
            <select
              value={classification}
              onChange={(event) => { setClassification(event.target.value as ClassificationFilter); setPage(1); }}
              className="w-full rounded-lg border border-[#dfe4eb] bg-white px-3 py-2 text-xs text-[#475269] outline-none focus:border-[#8ca2e7]"
            >
              <option value="All">All classifications</option>
              <option value="Legitimate">Legitimate</option>
              <option value="Potential threat">Potential threats</option>
            </select>
          </label>

          <label className="min-w-[155px] flex-1 sm:flex-none">
            <span className="mb-1.5 block text-[11px] font-semibold text-[#687288]">Sort by</span>
            <select
              value={sortOrder}
              onChange={(event) => { setSortOrder(event.target.value as SortOrder); setPage(1); }}
              className="w-full rounded-lg border border-[#dfe4eb] bg-white px-3 py-2 text-xs text-[#475269] outline-none focus:border-[#8ca2e7]"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="confidence-high">Highest confidence</option>
              <option value="confidence-low">Lowest confidence</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-[#e9ecf1] bg-[#fafbfc] text-left text-[10px] font-bold uppercase tracking-wide text-[#9299a9]">
                <th scope="col" className="px-6 py-3">Sender</th>
                <th scope="col" className="px-4 py-3">Subject</th>
                <th scope="col" className="px-4 py-3">Classification</th>
                <th scope="col" className="px-4 py-3">Confidence</th>
                <th scope="col" className="px-4 py-3">Malicious prob.</th>
                <th scope="col" className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {showSkeleton && Array.from({ length: 5 }, (_, index) => (
                <tr key={`loading-${index}`} aria-hidden="true" className="border-b border-[#eef0f4] last:border-0">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="phishlab-skeleton h-8 w-8 shrink-0 rounded-lg" />
                      <span className="space-y-2">
                        <span className="phishlab-skeleton block h-3 w-24 rounded" />
                        <span className="phishlab-skeleton block h-2 w-32 rounded" />
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4"><span className="phishlab-skeleton block h-3 w-40 rounded" /></td>
                  <td className="px-4 py-4"><span className="phishlab-skeleton block h-5 w-24 rounded-full" /></td>
                  <td className="px-4 py-4"><span className="phishlab-skeleton block h-2 w-20 rounded-full" /></td>
                  <td className="px-4 py-4"><span className="phishlab-skeleton block h-3 w-12 rounded" /></td>
                  <td className="px-4 py-4"><span className="phishlab-skeleton block h-4 w-4 rounded" /></td>
                </tr>
              ))}
              {!showSkeleton && pageEmails.map((email, index) => {
                const legitimate = email.classification === "Legitimate";
                return (
                  <tr
                    key={`${email.id}-${search.trim().toLowerCase()}-${classification}-${sortOrder}-${currentPage}`}
                    style={{ animationDelay: `${Math.min(index, 7) * 22}ms` }}
                    onClick={() => onSelect(email)}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onSelect(email);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`View analysis for ${email.subject}`}
                    className="phishlab-table-row-enter group cursor-pointer border-b border-[#eef0f4] transition-colors duration-150 hover:bg-[#f2f4f7] focus-visible:bg-[#eef2ff] focus-visible:outline-2 focus-visible:outline-[#3157d5] last:border-0"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${toneStyles[email.tone]}`}>
                          {email.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#2b354f]">{email.sender}</p>
                          <p className="mt-1 max-w-[170px] truncate text-[10px] text-[#939baa]">{email.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-4">
                      <p className="truncate text-xs font-medium text-[#3b465e]">{email.subject}</p>
                      <p className="mt-1 text-[10px] text-[#99a0af]">{displayDate(email)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${legitimate ? "bg-[#e9f7f0] text-[#277c58]" : "bg-[#ffebe7] text-[#b8493b]"}`}>
                        {email.classification}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#edf0f4]">
                          <div className={`h-full rounded-full ${legitimate ? "bg-[#50b487]" : "bg-[#e27465]"}`} style={{ width: `${email.confidence}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold text-[#647086]">{email.confidence.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[11px] font-semibold text-[#647086]">
                      {email.maliciousProbability === undefined ? "—" : `${email.maliciousProbability.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        aria-label={`View analysis for ${email.subject}`}
                        onClick={(event) => { event.stopPropagation(); onSelect(email); }}
                        className="rounded-md p-1 text-[#abb1be] transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-[#3157d5] hover:bg-[#e5e9f1] focus-visible:outline-2 focus-visible:outline-[#3157d5]"
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!showSkeleton && !pageEmails.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <p className="text-sm font-semibold text-[#4c566c]">
                      {loading
                        ? "Loading scan results..."
                        : error
                          ? "Results unavailable"
                          : emailMode === "gmail" && !hasLoaded
                            ? "No Gmail scan yet"
                            : emailMode === "gmail" && emails.length === 0
                              ? "No Gmail messages found"
                              : "No matching emails"}
                    </p>
                    <p className="mt-1 text-xs text-[#9198a8]">
                      {loading
                        ? emailMode === "gmail" ? "Scanning recent Gmail messages." : "Fetching training examples from FastAPI."
                        : error
                          ? error
                          : emailMode === "gmail" && !hasLoaded
                            ? "Select Scan emails in the top bar to retrieve recent inbox messages."
                            : emailMode === "gmail" && emails.length === 0
                              ? "The recent inbox query returned no messages."
                              : "Try changing the filters or your search."}
                    </p>
                    {!loading && !error && (search || classification !== "All") && (
                      <button type="button" onClick={clearFilters} className="mt-3 text-xs font-semibold text-[#3157d5] hover:underline">
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e9ecf1] px-5 py-4 md:px-6">
          <div>
            <p className="text-[11px] text-[#8a92a4]">
              {showSkeleton
                ? "Loading scan results..."
                : `Showing ${filteredEmails.length ? startIndex + 1 : 0}–${Math.min(startIndex + PAGE_SIZE, filteredEmails.length)} of ${filteredEmails.length} results`}
            </p>
            <p className="mt-1 text-[10px] text-[#9aa2b2]">
              Classification and confidence come from the local model. {emailMode === "gmail" ? "Data comes from the connected Gmail inbox." : "Data is synthetic."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="rounded-lg border border-[#dfe4eb] bg-white p-2 text-[#647086] transition hover:bg-[#f5f7fb] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[70px] text-center text-[11px] font-semibold text-[#647086]">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="rounded-lg border border-[#dfe4eb] bg-white p-2 text-[#647086] transition hover:bg-[#f5f7fb] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Confirms a requested CSV export without claiming the browser saved the file. */}
      {exportNotice && (
        <div
          role={exportNotice === "error" ? "alert" : "status"}
          className="phishlab-toast fixed bottom-5 right-5 z-40 flex max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-xl border border-[#e0e5ee] bg-white p-4 shadow-lg sm:max-w-[360px]"
        >
          {exportNotice === "success" ? (
            <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-[#277c58]" aria-hidden="true" />
          ) : (
            <AlertCircle size={19} className="mt-0.5 shrink-0 text-[#c03939]" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#26314c]">
              {exportNotice === "success" ? "CSV export started" : "Could not export results"}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-[#788197]">
              {exportNotice === "success"
                ? `Requested a CSV download with ${exportedCount} filtered ${exportedCount === 1 ? "email" : "emails"}.`
                : "Please try exporting your results again."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            aria-label="Dismiss export notification"
            className="rounded p-1 text-[#8992a3] transition hover:bg-[#f2f4f7] hover:text-[#26314c]"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default ScanResultsPage;
