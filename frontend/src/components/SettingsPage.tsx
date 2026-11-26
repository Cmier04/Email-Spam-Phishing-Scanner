
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  Bell,
  BookOpen,
  Mail,
  Menu,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import {
  ApiError,
  connectGmail,
  disconnectGmail,
  getGmailStatus,
  type GmailConnectionStatus,
} from "../api";

import DebuggingSettings from "./DebuggingSettings";
import HistoryDataSettings from "./HistoryDataSettings";

import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type SettingsPreferences,
} from "../data/settingsPreferences";

type SettingsPageProps = {
  onOpenMenu: () => void;
  onGmailStatusChange?: (status: GmailConnectionStatus) => void;
  onBackendError?: (message: string, retry: "gmail-status" | "connect" | "disconnect") => void;
};

// Preserve the teammate's original Gmail error handling. A configured
// FastAPI backend may still reject Gmail OAuth for Gmail-specific reasons.
function isBackendUnavailable(error: unknown): error is ApiError {
  return error instanceof ApiError && (
    error.status === 0 ||
    /^FastAPI returned HTTP \d+\.$/.test(error.message) ||
    error.message === "FastAPI returned an invalid JSON response."
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm">
      <div className="border-b border-[#e8ebf1] px-5 py-4 md:px-6">
        <h2 className="text-sm font-bold text-[#202a44]">
          {title}
        </h2>

        <p className="mt-1 text-xs text-[#8a92a4]">
          {description}
        </p>
      </div>

      <div className="px-5 py-2 md:px-6">
        {children}
      </div>
    </section>
  );
}

function SettingToggle({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#edf0f4] py-4 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f3f8] text-[#687288]">
          <Icon size={17} />
        </span>

        <div>
          <p className="text-xs font-semibold text-[#35405a]">
            {title}
          </p>

          <p className="mt-1 text-[11px] leading-5 text-[#8a92a4]">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={title}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157d5] ${
          enabled ? "bg-[#3157d5]" : "bg-[#cdd3de]"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
            enabled ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function SettingsPage({
  onOpenMenu,
  onGmailStatusChange,
  onBackendError,
}: SettingsPageProps) {
  // Preferences are saved locally, not to FastAPI.
  const [preferences, setPreferences] =
    useState<SettingsPreferences>(loadSettings);
  const [gmailStatus, setGmailStatus] =
    useState<GmailConnectionStatus | null>(null);
  const [gmailActionPending, setGmailActionPending] = useState(false);
  const [gmailUiError, setGmailUiError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getGmailStatus(controller.signal)
      .then((status) => {
        if (!controller.signal.aborted) {
          setGmailStatus(status);
          onGmailStatusChange?.(status);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          if (isBackendUnavailable(error) && onBackendError) {
            onBackendError(error.message, "gmail-status");
            return;
          }
          setGmailUiError(
            error instanceof Error
              ? error.message
              : "Could not check the Gmail connection."
          );
        }
      });

    return () => controller.abort();
  }, [onGmailStatusChange, onBackendError]);

  useEffect(() => {
    if (gmailStatus?.state !== "connecting") return;

    const controller = new AbortController();
    const poll = window.setInterval(() => {
      getGmailStatus(controller.signal)
        .then((status) => {
          if (!controller.signal.aborted) {
            setGmailStatus(status);
            onGmailStatusChange?.(status);
            if (status.state !== "connecting") {
              setGmailActionPending(false);
            }
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setGmailActionPending(false);
            if (isBackendUnavailable(error) && onBackendError) {
              onBackendError(error.message, "gmail-status");
              return;
            }
            setGmailUiError(
              error instanceof Error
                ? error.message
                : "Could not check Gmail authorization."
            );
          }
        });
    }, 1000);

    return () => {
      controller.abort();
      window.clearInterval(poll);
    };
  }, [gmailStatus?.state, onGmailStatusChange, onBackendError]);

  async function handleGmailAction() {
    const disconnecting = Boolean(gmailStatus?.connected || gmailStatus?.state === "connecting");
    setGmailActionPending(true);
    setGmailUiError(null);
    try {
      const status = disconnecting
        ? await disconnectGmail()
        : await connectGmail();
      setGmailStatus(status);
      onGmailStatusChange?.(status);
    } catch (error) {
      if (isBackendUnavailable(error) && onBackendError) {
        onBackendError(error.message, disconnecting ? "disconnect" : "connect");
      } else {
        setGmailUiError(
          error instanceof Error
            ? error.message
            : "The Gmail account action failed."
        );
      }
    } finally {
      setGmailActionPending(false);
    }
  }

  function updatePreferences(next: SettingsPreferences) {
    setPreferences(next);
    saveSettings(next);
  }

  function toggle(
    key:
      | "automaticScanning"
      | "showLearningSuggestions"
      | "threatAlerts"
      | "weeklyDigest"
  ) {
    updatePreferences({
      ...preferences,
      [key]: !preferences[key],
    });
  }

  return (
    <>
      {/* Settings header */}
      <header className="phishlab-topbar-enter flex min-h-[72px] items-center gap-3 border-b border-[#e4e8ef] bg-white px-5 md:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="text-[#596579] lg:hidden"
        >
          <Menu size={20} />
        </button>

        <Settings2 size={19} className="text-[#687288]" />

        <h1 className="text-sm font-bold text-[#202a44]">
          Settings
        </h1>
      </header>

      <div className="phishlab-settings-stagger mx-auto max-w-[920px] px-5 py-7 md:px-8 md:py-9">
        {/* Page title */}
        <div className="mb-7">
          <h2 className="text-[26px] font-bold tracking-tight text-[#17213c]">
            Account settings
          </h2>

          <p className="mt-1 text-sm text-[#747e93]">
            Manage your preferences and review which features are available.
          </p>
        </div>

        <div className="phishlab-settings-sections space-y-5">
          {/* Connected inbox */}
          <SettingsSection
            title="Connected inbox"
            description="View the email service connected to PhishLab."
          >
            <div className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8efff] text-[#3157d5]">
                  <Mail size={19} />
                </span>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-[#35405a]">
                      Gmail
                    </p>

                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        gmailStatus?.connected
                          ? "bg-[#e6f5ed] text-[#277c58]"
                          : gmailStatus?.state === "connecting"
                            ? "bg-[#fff5db] text-[#9a6a16]"
                            : gmailStatus?.state === "failed"
                              ? "bg-[#fff0ed] text-[#b84b3e]"
                              : "bg-[#edf0f4] text-[#677287]"
                      }`}
                    >
                      {gmailStatus?.connected
                        ? "Connected"
                        : gmailStatus?.state === "connecting"
                          ? "Connecting"
                          : gmailStatus?.state === "failed"
                            ? "Connection failed"
                            : "Not connected"}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-[#8a92a4]">
                    {gmailStatus?.connected
                      ? gmailStatus.email ?? "Connected Gmail account"
                      : gmailStatus?.state === "connecting"
                        ? "Complete authorization in the browser window."
                        : gmailStatus?.state === "cancelled"
                          ? "Gmail connection was cancelled."
                          : gmailStatus === null && !gmailUiError
                            ? "Checking Gmail connection..."
                            : "Connect Gmail with read-only inbox access."}
                  </p>

                  {(gmailUiError || gmailStatus?.error) && (
                    <p role="alert" className="mt-1 text-[11px] text-[#c03939]">
                      {gmailUiError ?? gmailStatus?.error}
                    </p>
                  )}

                  {gmailStatus && !gmailStatus.credentials_configured && (
                    <p className="mt-1 text-[11px] text-[#9a6a16]">
                      Gmail OAuth credentials are not configured in the backend.
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleGmailAction}
                disabled={gmailActionPending || gmailStatus === null}
                className={`rounded-lg border px-3.5 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  gmailStatus?.connected || gmailStatus?.state === "connecting"
                    ? "border-[#f0d0ca] bg-[#fff8f7] text-[#b84b3e] hover:bg-[#fff0ed]"
                    : "border-[#d9e1f2] bg-[#3157d5] text-white hover:bg-[#294bc0]"
                }`}
              >
                {gmailActionPending
                  ? "Please wait..."
                  : gmailStatus?.state === "connecting"
                    ? "Cancel connection"
                    : gmailStatus?.connected
                      ? "Disconnect Gmail"
                      : "Connect Gmail"}
              </button>
            </div>
          </SettingsSection>

          {/* Scanning preferences */}
          <SettingsSection
            title="Scanning preferences"
            description="Choose how you would like email scanning to work when connected."
          >
            <SettingToggle
              icon={ScanLine}
              title="Automatic scanning"
              description="Preference for automatically analyzing new emails once backend scanning is available."
              enabled={preferences.automaticScanning}
              onToggle={() => toggle("automaticScanning")}
            />

            <SettingToggle
              icon={BookOpen}
              title="Show learning suggestions"
              description="Preference for displaying educational suggestions next to email results."
              enabled={preferences.showLearningSuggestions}
              onToggle={() => toggle("showLearningSuggestions")}
            />


          </SettingsSection>

          {/* Notifications */}
          <SettingsSection
            title="Notifications"
            description="Set your preferred alerts for when notification delivery becomes available."
          >
            <SettingToggle
              icon={ShieldAlert}
              title="Threat alerts"
              description="Preference for notifications when a potentially harmful email is detected."
              enabled={preferences.threatAlerts}
              onToggle={() => toggle("threatAlerts")}
            />

            <SettingToggle
              icon={Bell}
              title="Weekly protection digest"
              description="Preference for a weekly summary of scans and detected threats."
              enabled={preferences.weeklyDigest}
              onToggle={() => toggle("weeklyDigest")}
            />
          </SettingsSection>

          <DebuggingSettings />

          {/* Saved scan history and privacy controls */}
          <HistoryDataSettings />
        </div>

        {/* Reset preferences */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() =>
              updatePreferences({ ...defaultSettings })
            }
            className="flex items-center gap-2 rounded-lg border border-[#dfe4eb] bg-white px-3 py-2 text-xs font-semibold text-[#596579] transition hover:bg-[#f7f9fc]"
          >
            <RotateCcw size={14} />
            Reset preferences
          </button>
        </div>
      </div>
    </>
  );
}

export default SettingsPage;
