
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { Email } from "../data/mockEmails";

type EmailFilter = "All emails" | Email["classification"];

type EmailResultsTableProps = {
  emails: Email[];
};

const filters: EmailFilter[] = [
  "All emails",
  "Legitimate",
  "Potential threat",
];

const toneStyles: Record<Email["tone"], string> = {
  blue: "bg-[#e8f0ff] text-[#315fbd]",
  red: "bg-[#ffe9e5] text-[#c84d3e]",
  violet: "bg-[#f0eafe] text-[#7050b6]",
  amber: "bg-[#fff0d9] text-[#a86115]",
  slate: "bg-[#edf0f4] text-[#485366]",
};

const riskStyles: Record<Email["risk"], string> = {
  Low: "bg-[#eef2f6] text-[#596579]",
  Medium: "bg-[#fff1dc] text-[#a9671e]",
  High: "bg-[#ffebe7] text-[#b8493b]",
};

function EmailResultsTable({ emails }: EmailResultsTableProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EmailFilter>("All emails");

  // Display only emails that match the selected filter and search.
  const visibleEmails = emails.filter((email) => {
    const matchesFilter =
      filter === "All emails" ||
      email.classification === filter;

    const query = search.trim().toLowerCase();

    const matchesSearch =
      email.sender.toLowerCase().includes(query) ||
      email.email.toLowerCase().includes(query) ||
      email.subject.toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7eaf0] px-5 py-5 md:px-6">
        <div>
          <h2 className="text-base font-bold text-[#202a44]">
            Recent Scan Analysis
          </h2>

          <p className="mt-1 text-xs text-[#8a92a4]">
            Messages analyzed in your lastest scans
          </p>
        </div>

        <button
          type="button"
          disabled
          title="Full results page will be added later"
          className="flex cursor-not-allowed items-center gap-1 text-xs font-semibold text-[#3157d5] opacity-50"
        >
          View all results
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Search and classification filters */}
      <div className="flex flex-wrap gap-3 border-b border-[#edf0f4] px-5 py-4 md:px-6">
        <div className="relative min-w-[220px] flex-1 md:max-w-[320px]">
          <Search
            size={16}
            className="absolute left-3 top-2.5 text-[#9aa2b2]"
          />

          <input
            type="search"
            aria-label="Search emails"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sender or subject"
            className="w-full rounded-lg border border-[#dfe4eb] py-2 pl-9 pr-3 text-xs outline-none focus:border-[#8ca2e7] focus:ring-2 focus:ring-[#e7ebfa]"
          />
        </div>

        <div className="flex rounded-lg bg-[#f2f4f7] p-1">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                filter === item
                  ? "bg-white text-[#28334f] shadow-sm"
                  : "text-[#788197] hover:text-[#475269]"
              }`}
            >
              {item === "Potential threat" ? "Threats" : item}
            </button>
          ))}
        </div>
      </div>

      {/* Email results table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] border-collapse">
          <thead>
            <tr className="border-b border-[#e9ecf1] bg-[#fafbfc] text-left text-[10px] font-bold uppercase tracking-wide text-[#9299a9]">
              <th className="px-6 py-3">Sender</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Classification</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Risk</th>
            </tr>
          </thead>

          <tbody>
            {visibleEmails.map((email) => {
              const legitimate =
                email.classification === "Legitimate";

              return (
                <tr
                  key={email.id}
                  className="border-b border-[#eef0f4] last:border-0"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${toneStyles[email.tone]}`}
                      >
                        {email.initials}
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-[#2b354f]">
                          {email.sender}
                        </p>
                        <p className="mt-1 max-w-[170px] truncate text-[10px] text-[#939baa]">
                          {email.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="max-w-[250px] px-4 py-4">
                    <p className="truncate text-xs font-medium text-[#3b465e]">
                      {email.subject}
                    </p>
                    <p className="mt-1 text-[10px] text-[#99a0af]">
                      {email.time}
                    </p>
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        legitimate
                          ? "bg-[#e9f7f0] text-[#277c58]"
                          : "bg-[#ffebe7] text-[#b8493b]"
                      }`}
                    >
                      {email.classification}
                    </span>
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#edf0f4]">
                        <div
                          className={`h-full rounded-full ${
                            legitimate
                              ? "bg-[#50b487]"
                              : "bg-[#e27465]"
                          }`}
                          style={{
                            width: `${email.confidence}%`,
                          }}
                        />
                      </div>

                      <span className="text-[11px] font-semibold text-[#647086]">
                        {email.confidence}%
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold ${riskStyles[email.risk]}`}
                    >
                      {email.risk}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visibleEmails.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm font-semibold text-[#4c566c]">
              No matching emails
            </p>
            <p className="mt-1 text-xs text-[#9198a8]">
              Try changing your search or filter.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-[#e9ecf1] px-6 py-4 text-[11px] text-[#8a92a4]">
        Showing {visibleEmails.length} of {emails.length} mock emails
      </div>
    </section>
  );
}

export default EmailResultsTable;
