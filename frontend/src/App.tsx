
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
import ScanResultsPage from "./components/ScanResultsPage";
import EmailDetail from "./components/EmailDetail";
import SettingsPage from "./components/SettingsPage";
import HelpCenterPage from "./components/HelpCenterPage";

import { getDemoEmails } from "./api";
import type { Email } from "./data/mockEmails";
import { withHeaderCrossfade } from "./data/headerCrossfade";
import "./animations.css";

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Controls whether the desktop sidebar is expanded or icon-only.
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(false);

  const [activePage, setActivePage] =
    useState<AppPage>("dashboard");
  const [selectedEmail, setSelectedEmail] =
    useState<Email | null>(null);

  // Synthetic examples are fetched from FastAPI, which runs the local classifier.
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  // Last successful demo result fetch, not a Gmail scan timestamp.
  const [lastLoadedAt, setLastLoadedAt] =
    useState<number | null>(null);

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
          setError(null);
          setLastLoadedAt(Date.now());
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
    // Close the mobile navigation menu.
    setSidebarOpen(false);

    // Clicking the page you're already on toggles the sidebar.
    if (page === activePage && selectedEmail === null) {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setSidebarCollapsed((collapsed) => !collapsed);
      }

      return;
    }

    // Navigate to another page without changing
    // whether the sidebar is collapsed or expanded.
    withHeaderCrossfade(() => {
      setActivePage(page);
      setSelectedEmail(null);
    });
    window.scrollTo(0, 0);
  }

  function openEmail(email: Email) {
    withHeaderCrossfade(() => setSelectedEmail(email));
    window.scrollTo(0, 0);
  }

  // Keep existing results visible during refresh; skeletons are only for the first load.
  const showInitialSkeletons = loading && emails.length === 0;

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
        collapsed={sidebarCollapsed}
      />

      {/* Main content adjusts when the sidebar collapses. */}
      <main
        key={selectedEmail ? `email-${selectedEmail.id}` : activePage}
        className={`min-h-screen transition-[margin-left] duration-300 ${
          sidebarCollapsed
            ? "lg:ml-[72px]"
            : "lg:ml-[248px]"
        }`}
      >
        {selectedEmail ? (
          <EmailDetail
            email={selectedEmail}
            onBack={() => withHeaderCrossfade(() => setSelectedEmail(null))}
            onOpenMenu={() => setSidebarOpen(true)}
          />
        ) : activePage === "settings" ? (
          <SettingsPage
            onOpenMenu={() => setSidebarOpen(true)}
          />
        ) : activePage === "help" ? (
          <HelpCenterPage
            onOpenMenu={() => setSidebarOpen(true)}
            onNavigate={navigate}
          />
        ) : (
          <>
            <Header
              onOpenMenu={() => setSidebarOpen(true)}
              loading={loading}
              error={error}
              onRetry={reloadEmails}
              lastLoadedAt={lastLoadedAt}
              title={
                activePage === "results"
                  ? "Scan results"
                  : "Dashboard"
              }
              subtitle={
                activePage === "results"
                  ? "Review email classifications"
                  : "Monitor and protect your inbox"
              }
            />

            {activePage === "results" ? (
              <ScanResultsPage
                emails={emails}
                loading={loading}
                error={error}
                onSelect={openEmail}
              />
            ) : (
              <div className="phishlab-dashboard-stagger mx-auto max-w-[1280px] px-5 py-7 md:px-8 md:py-9">
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

                  <div
                    role="status"
                    className={`flex items-center gap-2 text-xs font-semibold ${
                      error
                        ? "text-[#c03939]"
                        : loading
                          ? "text-[#818b9e]"
                          : "text-[#277c58]"
                    }`}
                    title={
                      error ??
                      "Local FastAPI demo connection; Gmail scanning is not enabled."
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full ${
                        error
                          ? "bg-[#cf4545]"
                          : loading
                            ? "bg-[#e2ad4c]"
                            : "bg-[#31a46c]"
                      }`}
                    />
                    {error
                      ? "Offline · Connection failed"
                      : loading
                        ? "Connecting..."
                        : "Connected"}
                  </div>
                </div>

                {/* Statistics from the loaded synthetic emails. */}
                <section
                  aria-label="Email statistics"
                  className="phishlab-dashboard-metrics mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                >
                  {showInitialSkeletons ? (
                    Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        aria-hidden="true"
                        className="rounded-2xl border border-[#e2e6ed] bg-white p-5 shadow-sm"
                      >
                        <div className="mb-5 flex items-start justify-between">
                          <span className="phishlab-skeleton h-3 w-24 rounded" />
                          <span className="phishlab-skeleton h-8 w-8 rounded-lg" />
                        </div>
                        <div className="phishlab-skeleton h-8 w-16 rounded" />
                        <div className="phishlab-skeleton mt-3 h-2.5 w-28 rounded" />
                      </div>
                    ))
                  ) : (
                    <>
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
                    </>
                  )}
                </section>

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
                  loading={loading}
                  onSelect={openEmail}
                  onViewAll={() => navigate("results")}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
