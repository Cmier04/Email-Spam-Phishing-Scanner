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
import LabHistoryPage from "./components/LabHistoryPage";
import HelpCenterPage from "./components/HelpCenterPage";
import StartupScreen from "./components/StartupScreen";
import ConnectionIssueDialog from "./components/ConnectionIssueDialog";

import {
  ApiError,
  connectGmail,
  disconnectGmail,
  getDemoEmails,
  getGmailStatus,
  getRecentGmailEmails,
  type GmailConnectionStatus,
  type LabSession,
} from "./api";
import type { Email } from "./data/mockEmails";
import {
  calculateEmailStats,
  emailsForMode,
  type EmailMode,
} from "./data/emailPresentation";
import { withHeaderCrossfade } from "./data/headerCrossfade";
import { greetingName } from "./data/accountGreeting";
import "./animations.css";

type BackendRetry = "startup" | "demo" | "gmail-status" | "scan" | "connect" | "disconnect";
type BackendIssue = { message: string; retry: BackendRetry };
type ScanOutcome = "success" | "gmail" | "failed";

function errorMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : "An unexpected request error occurred.";
}

// A Gmail-specific OAuth failure is NOT the same as FastAPI being offline.
// The original backend returns useful details for missing credentials and
// Google authorization errors. Keep those in the Gmail dialog.
function isBackendUnavailable(failure: unknown): failure is ApiError {
  return failure instanceof ApiError && (
    failure.status === 0 ||
    /^FastAPI returned HTTP \d+\.$/.test(failure.message) ||
    failure.message === "FastAPI returned an invalid JSON response."
  );
}

function greetingForTime(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>("dashboard");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [resumedLab, setResumedLab] = useState<LabSession | null>(null);

  const [emailMode, setEmailMode] = useState<EmailMode>("gmail");
  const [demoEmails, setDemoEmails] = useState<Email[]>([]);
  const [gmailEmails, setGmailEmails] = useState<Email[]>([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [demoLoadedAt, setDemoLoadedAt] = useState<number | null>(null);
  const [gmailScannedAt, setGmailScannedAt] = useState<number | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus | null>(null);
  const [gmailStatusChecked, setGmailStatusChecked] = useState(false);
  const [startupComplete, setStartupComplete] = useState(false);
  const [minimumStartupElapsed, setMinimumStartupElapsed] = useState(false);
  const [backendIssue, setBackendIssue] = useState<BackendIssue | null>(null);
  const [backendRetrying, setBackendRetrying] = useState(false);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailDialogDismissed, setGmailDialogDismissed] = useState(false);
  const [gmailDialogRequested, setGmailDialogRequested] = useState(false);
  const [gmailDialogError, setGmailDialogError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const gmailScanController = useRef<AbortController | null>(null);

  // The loading screen reflects real backend requests; a minimum display time
  // avoids a flash on fast machines. It does not claim any simulated progress.
  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumStartupElapsed(true), 650);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let unmounted = false;
    // Prevent an indefinitely hanging startup on inaccessible networks.
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    async function startApp() {
      const [demoResult, gmailResult] = await Promise.allSettled([
        getDemoEmails(controller.signal),
        getGmailStatus(controller.signal),
      ]);
      if (unmounted) return;
      let firstError: string | null = null;
      if (demoResult.status === "fulfilled") {
        setDemoEmails(demoResult.value);
        setDemoLoadedAt(Date.now());
      } else {
        firstError = controller.signal.aborted
          ? "FastAPI did not respond before the startup check timed out."
          : errorMessage(demoResult.reason);
      }
      if (gmailResult.status === "fulfilled") {
        setGmailStatus(gmailResult.value);
      } else if (!firstError) {
        firstError = controller.signal.aborted
          ? "The Gmail connection check timed out. Try reconnecting to FastAPI."
          : errorMessage(gmailResult.reason);
      }
      if (firstError) setBackendIssue({ message: firstError, retry: "startup" });
      setDemoLoading(false);
      setGmailStatusChecked(true);
      setStartupComplete(true);
      window.clearTimeout(timeout);
    }
    void startApp();
    return () => {
      unmounted = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => () => {
    gmailScanController.current?.abort();
    gmailScanController.current = null;
  }, []);

  const loadDemo = useCallback(async (signal?: AbortSignal) => {
    const loaded = await getDemoEmails(signal);
    if (signal?.aborted) return;
    setDemoEmails(loaded);
    setDemoLoadedAt(Date.now());
    setDemoError(null);
  }, []);

  const reloadDemoEmails = useCallback(async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      await loadDemo();
    } catch (failure) {
      if (failure instanceof ApiError) {
        setBackendIssue({ message: errorMessage(failure), retry: "demo" });
      } else {
        setDemoError(errorMessage(failure));
      }
    } finally {
      setDemoLoading(false);
    }
  }, [loadDemo]);

  const scanGmailEmails = useCallback(async (): Promise<ScanOutcome> => {
    if (gmailScanController.current) return "failed";
    const controller = new AbortController();
    gmailScanController.current = controller;
    setGmailLoading(true);
    setGmailError(null);

    try {
      const status = await getGmailStatus(controller.signal);
      if (controller.signal.aborted) return "failed";
      setGmailStatus(status);
      setGmailStatusChecked(true);
      if (!status.connected) {
        setGmailDialogRequested(true);
        setGmailDialogError(status.error);
        return "gmail";
      }
      const loaded = await getRecentGmailEmails(25, controller.signal);
      if (controller.signal.aborted) return "failed";
      setGmailEmails(loaded);
      setGmailScannedAt(Date.now());
      return "success";
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError) {
          setBackendIssue({ message: errorMessage(failure), retry: "scan" });
        } else {
          setGmailError(errorMessage(failure));
        }
      }
      return "failed";
    } finally {
      if (gmailScanController.current === controller) {
        gmailScanController.current = null;
        setGmailLoading(false);
      }
    }
  }, []);

  // The existing Gmail OAuth backend returns "connecting" while its local
  // Google browser flow is pending. Poll only during that state.
  useEffect(() => {
    if (gmailStatus?.state !== "connecting") return;
    let disposed = false;
    let busy = false;
    const poll = window.setInterval(async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        const status = await getGmailStatus();
        if (!disposed) {
          setGmailStatus(status);
          if (status.connected) {
            setGmailDialogRequested(false);
            setGmailDialogDismissed(true);
            setGmailDialogError(null);
          }
        }
      } catch (failure) {
        if (!disposed) {
          if (isBackendUnavailable(failure)) {
            setBackendIssue({ message: errorMessage(failure), retry: "gmail-status" });
          } else {
            setGmailDialogError(errorMessage(failure));
          }
        }
      } finally {
        busy = false;
      }
    }, 1200);
    return () => { disposed = true; window.clearInterval(poll); };
  }, [gmailStatus?.state]);

  // Google OAuth happens in the external browser. When the user returns to
  // PhishLab, reconcile the current authorization without re-opening OAuth.
  useEffect(() => {
    if (!startupComplete || gmailStatus?.connected || backendIssue) return;
    let disposed = false;
    let checking = false;
    const refresh = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const status = await getGmailStatus();
        if (!disposed) {
          setGmailStatus(status);
          setGmailStatusChecked(true);
          if (status.connected) {
            setGmailDialogRequested(false);
            setGmailDialogDismissed(true);
            setGmailDialogError(null);
          }
        }
      } catch (failure) {
        if (!disposed && isBackendUnavailable(failure)) {
          setBackendIssue({ message: errorMessage(failure), retry: "gmail-status" });
        }
      } finally {
        checking = false;
      }
    };
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
    };
  }, [startupComplete, gmailStatus?.connected, backendIssue]);

  const connectGmailFromDialog = useCallback(async () => {
    if (gmailConnecting) return;
    setGmailConnecting(true);
    setGmailDialogError(null);
    try {
      const status = await connectGmail();
      setGmailStatus(status);
      setGmailStatusChecked(true);
      if (status.connected) {
        setGmailDialogRequested(false);
        setGmailDialogDismissed(true);
      } else if (status.state === "failed") {
        setGmailDialogError(status.error ?? "Gmail authorization failed. Please retry.");
      }
      // The original backend opens Google's OAuth page in the system browser.
      // A 202 'connecting' response is expected; status polling handles completion.
    } catch (failure) {
      if (isBackendUnavailable(failure)) {
        setBackendIssue({ message: errorMessage(failure), retry: "connect" });
      } else {
        // A 503 (missing credentials), 403, or Gmail-specific 502 is a Gmail
        // authorization problem, not a stopped FastAPI server.
        setGmailDialogError(errorMessage(failure));
      }
    } finally {
      setGmailConnecting(false);
    }
  }, [gmailConnecting]);

  const retryBackend = useCallback(async () => {
    if (!backendIssue || backendRetrying) return;
    const retry = backendIssue.retry;
    setBackendRetrying(true);
    try {
      if (retry === "scan") {
        const outcome = await scanGmailEmails();
        if (outcome !== "failed") setBackendIssue(null);
        return;
      }
      if (retry === "connect" || retry === "disconnect") {
        const status = retry === "connect" ? await connectGmail() : await disconnectGmail();
        setGmailStatus(status);
        setGmailStatusChecked(true);
      } else if (retry === "gmail-status") {
        const status = await getGmailStatus();
        setGmailStatus(status);
        setGmailStatusChecked(true);
      } else if (retry === "demo") {
        await loadDemo();
      } else {
        // Resolve both startup dependencies before showing a Gmail prompt.
        const [loaded, status] = await Promise.all([getDemoEmails(), getGmailStatus()]);
        setDemoEmails(loaded);
        setDemoLoadedAt(Date.now());
        setDemoError(null);
        setGmailStatus(status);
        setGmailStatusChecked(true);
      }
      setBackendIssue(null);
    } catch (failure) {
      if ((retry === "connect" || retry === "disconnect") && !isBackendUnavailable(failure)) {
        setBackendIssue(null);
        setGmailDialogRequested(true);
        setGmailDialogError(errorMessage(failure));
      } else {
        setBackendIssue({ message: errorMessage(failure), retry });
      }
    } finally {
      setBackendRetrying(false);
    }
  }, [backendIssue, backendRetrying, loadDemo, scanGmailEmails]);

  const onGmailStatusChange = useCallback((status: GmailConnectionStatus) => {
    setGmailStatus(status);
    setGmailStatusChecked(true);
    if (status.connected) {
      setGmailDialogRequested(false);
      setGmailDialogDismissed(true);
      setGmailDialogError(null);
    } else {
      // Account actions in Settings should stay on Settings, not force a modal.
      setGmailDialogDismissed(true);
    }
  }, []);

  const onSettingsBackendError = useCallback((message: string, retry: "gmail-status" | "connect" | "disconnect") => {
    setBackendIssue({ message, retry });
  }, []);

  const emails = emailsForMode(emailMode, demoEmails, gmailEmails);
  const loading = emailMode === "gmail" ? gmailLoading : demoLoading;
  const error = emailMode === "gmail" ? gmailError : demoError;
  const lastLoadedAt = emailMode === "gmail" ? gmailScannedAt : demoLoadedAt;
  const reloadEmails = emailMode === "gmail" ? scanGmailEmails : reloadDemoEmails;
  const showStartup = !minimumStartupElapsed || !startupComplete;
  const showGmailDialog = !showStartup && !backendIssue && gmailStatusChecked &&
    !gmailStatus?.connected && (gmailDialogRequested || !gmailDialogDismissed);

  function dismissGmailDialog(useDemo = true) {
    setGmailDialogDismissed(true);
    setGmailDialogRequested(false);
    if (useDemo) setEmailMode("demo");
  }

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
      setResumedLab(null);
    });
    window.scrollTo(0, 0);
  }

  function openEmail(email: Email) {
    setResumedLab(null);
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
    <>
    <div className="min-h-screen bg-[#f6f8fb] text-[#17213c]">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        accountName={gmailStatus?.connected ? gmailStatus.display_name || gmailStatus.email?.split("@")[0] : null}
        accountEmail={gmailStatus?.connected ? gmailStatus.email : null}
        accountAvatar={Boolean(gmailStatus?.connected && gmailStatus.avatar_available)}
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
            resumedLab={resumedLab}
            onBack={() => withHeaderCrossfade(() => setSelectedEmail(null))}
            onOpenMenu={() => setSidebarOpen(true)}
          />
        ) : activePage === "settings" ? (
          <SettingsPage
            onOpenMenu={() => setSidebarOpen(true)}
            onGmailStatusChange={onGmailStatusChange}
            onBackendError={onSettingsBackendError}
          />
        ) : activePage === "history" ? (
          <LabHistoryPage onOpenMenu={() => setSidebarOpen(true)} onResume={(session) => {
            setResumedLab(session);
            setSelectedEmail(session.snapshot.email);
            window.scrollTo(0, 0);
          }} />
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
                      {greetingForTime(new Date(now))} {gmailStatus?.connected ? greetingName(gmailStatus.display_name, gmailStatus.email) : "there"},
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
                      emailMode === "demo" || gmailStatus?.connected
                        ? "text-[#277c58]"
                        : gmailStatus?.state === "connecting"
                          ? "text-[#a8782d]"
                          : "text-[#a8782d]"
                    }`}
                    title={emailMode === "gmail"
                      ? gmailStatus?.connected
                        ? `Connected to ${gmailStatus.email ?? "Gmail"}`
                        : "Gmail account is not connected"
                      : "Synthetic training mode"}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full ${
                        emailMode === "demo" || gmailStatus?.connected
                          ? "bg-[#31a46c]"
                          : "bg-[#e2ad4c]"
                      }`}
                    />
                    {emailMode === "demo"
                      ? "Demo mode"
                      : gmailStatus?.connected
                        ? "Connected"
                        : gmailStatus?.state === "connecting"
                          ? "Connecting..."
                          : "Not connected"}
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

    {showStartup ? (
      <StartupScreen demoChecked={!demoLoading} gmailChecked={gmailStatusChecked} />
    ) : backendIssue ? (
      <ConnectionIssueDialog
        key="backend"
        kind="backend"
        message={backendIssue.message}
        busy={backendRetrying}
        onRetry={() => { void retryBackend(); }}
        onConnect={() => {}}
        onSettings={() => {}}
        onUseDemo={() => {}}
      />
    ) : showGmailDialog ? (
      <ConnectionIssueDialog
        key="gmail"
        kind="gmail"
        gmailStatus={gmailStatus}
        message={gmailDialogError ?? undefined}
        busy={gmailConnecting}
        onRetry={() => {}}
        onConnect={() => { void connectGmailFromDialog(); }}
        onSettings={() => {
          dismissGmailDialog(false);
          navigate("settings");
        }}
        onUseDemo={() => dismissGmailDialog(true)}
      />
    ) : null}
    </>
  );
}

export default App;
