import { useCallback, useEffect, useState } from "react";
import {
  CircleCheck,
  Inbox,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import Sidebar, { type AppPage } from "./components/Sidebar";
import Header from "./components/Header";
import MetricCard from "./components/MetricCard";
import EmailResultsTable from "./components/EmailResultsTable";
import EmailDetail from "./components/EmailDetail";
import SettingsPage from "./components/SettingsPage";

import { getDemoEmails } from "./api";
import type { Email } from "./data/mockEmails";

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] =
    useState<AppPage>("dashboard");
  const [selectedEmail, setSelectedEmail] =
    useState<Email | null>(null);

  // Load synthetic examples classified by the local ML model.
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const reloadEmails = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadCount((count) => count + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getDemoEmails(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setEmails(loaded);
        }
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;

        setEmails([]);
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load the demonstration emails."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadCount]);

  function navigate(page: AppPage) {
    setActivePage(page);
    setSelectedEmail(null);
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  }

  function openEmail(email: Email) {
    setSelectedEmail(email);
    window.scrollTo(0, 0);
  }

  // Statistics are calculated from returned emails.
  const legitimateCount = emails.filter(
    (email) => email.classification === "Legitimate"
  ).length;

  const threatCount = emails.filter(
    (email) => email.classification === "Potential threat"
  ).length;

  const meanConfidence =
    emails.length > 0
      ? Math.round(
          emails.reduce(
            (sum, email) => sum + email.confidence,
            0
          ) / emails.length
        )
      : null;

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#17213c]">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={navigate}
      />

      <main className="min-h-screen lg:ml-[248px]">
        {selectedEmail ? (
          <EmailDetail
            email={selectedEmail}
            onBack={() => setSelectedEmail(null)}
            onOpenMenu={() => setSidebarOpen(true)}
          />
        ) : activePage === "settings" ? (
          <SettingsPage
            onOpenMenu={() => setSidebarOpen(true)}
          />
        ) : (
          <>
            <Header
              onOpenMenu={() => setSidebarOpen(true)}
            />

            <div className="mx-auto max-w-[1280px] px-5 py-7 md:px-8 md:py-9">
              {/* Dashboard welcome section */}
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-[26px] font-bold tracking-tight text-[#17213c]">
                    Good Afternoon John Doe,
                  </h2>

                  <p className="mt-1 text-sm text-[#747e93]">
                    Explore sample emails classified by the local ML model.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-[#687288]">
                  <span className="h-2 w-2 rounded-full bg-[#94a3b8]" />
                  FastAPI demo · No Gmail connection
                </div>
              </div>

              {/* Statistics from the loaded synthetic emails. */}
              <section
                aria-label="Email statistics"
                className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              >
                <MetricCard
                  label="Emails scanned"
                  value={String(emails.length)}
                  note="synthetic examples"
                  icon={Inbox}
                  color="blue"
                />

                <MetricCard
                  label="Legitimate"
                  value={String(legitimateCount)}
                  note="model classifications"
                  icon={CircleCheck}
                  color="green"
                />

                <MetricCard
                  label="Potential threats"
                  value={String(threatCount)}
                  note="model classifications"
                  icon={TriangleAlert}
                  color="red"
                />

                <MetricCard
                  label="Avg. confidence"
                  value={
                    meanConfidence === null
                      ? "—"
                      : `${meanConfidence}%`
                  }
                  note="among loaded examples"
                  icon={ShieldCheck}
                  color="violet"
                />
              </section>

              {/* API errors and retry button */}
              {error && (
                <div
                  role="alert"
                  className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0caca] bg-[#fff7f7] p-4 text-xs text-[#9f3434]"
                >
                  <span>{error}</span>

                  <button
                    type="button"
                    onClick={reloadEmails}
                    className="font-semibold underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {loading && (
                <p
                  role="status"
                  className="mb-4 text-xs text-[#747e93]"
                >
                  Loading model-classified examples from FastAPI...
                </p>
              )}

              <EmailResultsTable
                emails={emails}
                onSelect={openEmail}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;