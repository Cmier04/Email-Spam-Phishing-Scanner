
import { useCallback, useEffect, useRef, useState } from "react";
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

import {
  getDemoEmails,
  getGmailStatus,
  getRecentGmailEmails,
} from "./api";
import type { Email } from "./data/mockEmails";
import {
  calculateEmailStats,
  emailsForMode,
  loadConnectedGmailEmails,
  type EmailMode,
} from "./data/emailPresentation";
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

  const [emailMode, setEmailMode] = useState<EmailMode>("gmail");
  const [demoEmails, setDemoEmails] = useState<Email[]>([]);
  const [gmailEmails, setGmailEmails] = useState<Email[]>([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [demoReloadCount, setDemoReloadCount] = useState(0);
  const [demoLoadedAt, setDemoLoadedAt] = useState<number | null>(null);
  const [gmailScannedAt, setGmailScannedAt] = useState<number | null>(null);
  const gmailScanController = useRef<AbortController | null>(null);

  const reloadDemoEmails = useCallback(() => {
    setDemoLoading(true);
    setDemoError(null);
    setDemoReloadCount((count) => count + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getDemoEmails(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setDemoEmails(loaded);
          setDemoError(null);
          setDemoLoadedAt(Date.now());
        }
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;

        setDemoEmails([]);
        setDemoError(
          failure instanceof Error
            ? failure.message
            : "Could not load the demonstration emails."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDemoLoading(false);
        }
      });

    return () => controller.abort();
  }, [demoReloadCount]);

  useEffect(() => () => {
    gmailScanController.current?.abort();
    gmailScanController.current = null;
  }, []);

  const scanGmailEmails = useCallback(async () => {
    if (gmailScanController.current) return;

    const controller = new AbortController();
    gmailScanController.current = controller;
    setGmailLoading(true);
    setGmailError(null);

    try {
      const loaded = await loadConnectedGmailEmails(
        () => getGmailStatus(controller.signal),
        () => getRecentGmailEmails(25, controller.signal)
      );
      if (!controller.signal.aborted) {
        setGmailEmails(loaded);
        setGmailScannedAt(Date.now());
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setGmailError(
          failure instanceof Error
            ? failure.message
            : "The Gmail scan could not be completed."
        );
      }
    } finally {
      if (gmailScanController.current === controller) {
        gmailScanController.current = null;
        setGmailLoading(false);
      }
    }
  }, []);

  const emails = emailsForMode(emailMode, demoEmails, gmailEmails);
  const loading = emailMode === "gmail" ? gmailLoading : demoLoading;
  const error = emailMode === "gmail" ? gmailError : demoError;
  const lastLoadedAt = emailMode === "gmail" ? gmailScannedAt : demoLoadedAt;
  const reloadEmails = emailMode === "gmail" ? scanGmailEmails : reloadDemoEmails;

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

  function changeEmailMode(mode: EmailMode) {
    if (mode === emailMode) return;
    withHeaderCrossfade(() => setEmailMode(mode));
  }

  // Keep existing results visible during refresh; skeletons are only for the first load.
  const showInitialSkeletons = loading && emails.length === 0;

  const stats = calculateEmailStats(emails);

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
              emailMode={emailMode}
              onEmailModeChange={changeEmailMode}
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

            {error && (
              <div
                role="alert"
                className="mx-auto mt-5 max-w-[1280px] rounded-xl border border-[#f1c9c9] bg-[#fff4f4] px-5 py-3 text-xs font-medium text-[#a92c2c] md:px-6"
              >
                {error}
              </div>
            )}

            {activePage === "results" ? (
              <ScanResultsPage
                key={emailMode}
                emails={emails}
                loading={loading}
                error={error}
                onSelect={openEmail}
                emailMode={emailMode}
                hasLoaded={lastLoadedAt !== null}
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
                      {emailMode === "gmail"
                        ? "Scan recent Gmail messages with the local ML model."
                        : "Explore synthetic training emails classified by the local ML model."}
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
                      (emailMode === "gmail"
                        ? "Live Gmail scan mode"
                        : "Synthetic training mode")
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
                        : emailMode === "gmail"
                          ? lastLoadedAt === null
                            ? "Gmail mode · Ready to scan"
                            : "Gmail mode · Scan complete"
                          : "Demo mode"}
                  </div>
                </div>

                {/* Statistics are calculated only from the active data mode. */}
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
                        value={String(stats.total)}
                        note={emailMode === "gmail" ? "recent Gmail messages" : "synthetic examples"}
                        icon={Inbox}
                        color="blue"
                      />

                      <MetricCard
                        label="Legitimate"
                        value={String(stats.legitimate)}
                        note="model classifications"
                        icon={CircleCheck}
                        color="green"
                      />

                      <MetricCard
                        label="Potential threats"
                        value={String(stats.threats)}
                        note="model classifications"
                        icon={TriangleAlert}
                        color="red"
                      />

                      <MetricCard
                        label="Avg. confidence"
                        value={
                          stats.meanConfidence === null
                            ? "—"
                            : `${stats.meanConfidence}%`
                        }
                        note={emailMode === "gmail" ? "among scanned messages" : "among loaded examples"}
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
                    {emailMode === "gmail"
                      ? "Scanning recent Gmail messages..."
                      : "Loading model-classified training examples..."}
                  </p>
                )}

                <EmailResultsTable
                  key={emailMode}
                  emails={emails}
                  loading={loading}
                  emailMode={emailMode}
                  hasLoaded={lastLoadedAt !== null}
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
