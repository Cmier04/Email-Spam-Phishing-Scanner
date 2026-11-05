import {
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import {
  Bell,
  BookOpen,
  CalendarDays,
  Download,
  Info,
  Mail,
  Menu,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldAlert,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type RetentionPeriod,
  type SettingsPreferences,
} from "../data/settingsPreferences";

type SettingsPageProps = {
  onOpenMenu: () => void;
};

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
}: SettingsPageProps) {
  // Settings are saved locally, not to FastAPI.
  const [preferences, setPreferences] =
    useState<SettingsPreferences>(loadSettings);

  const [storageAvailable, setStorageAvailable] =
    useState(true);

  function updatePreferences(next: SettingsPreferences) {
    setPreferences(next);
    setStorageAvailable(saveSettings(next));
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
      <header className="flex min-h-[72px] items-center gap-3 border-b border-[#e4e8ef] bg-white px-5 md:px-8">
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

      <div className="mx-auto max-w-[920px] px-5 py-7 md:px-8 md:py-9">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[26px] font-bold tracking-tight text-[#17213c]">
              Account settings
            </h2>

            <p className="mt-1 text-sm text-[#747e93]">
              Manage your preferences and review which features are available.
            </p>
          </div>

          <span className="rounded-full bg-[#eef1f6] px-3 py-1.5 text-[11px] font-semibold text-[#677287]">
            Frontend preview
          </span>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#dce3f5] bg-[#f8f9ff] p-4">
          <Info
            size={17}
            className="mt-0.5 shrink-0 text-[#3157d5]"
          />

          <div>
            <p className="text-xs font-semibold text-[#35415c]">
              Preferences are local to this browser
            </p>

            <p className="mt-1 text-xs leading-5 text-[#657087]">
              Switches and retention choices are saved as prototype preferences only.
              They do not start Gmail scanning, send notifications, or delete stored emails.
            </p>

            {!storageAvailable && (
              <p className="mt-2 text-xs font-semibold text-[#b8493b]">
                Browser storage is unavailable, so changes may be lost after a refresh.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <SettingsSection
            title="Connected inbox"
            description="View the email service connected to InboxGuard."
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

                    <span className="rounded-full bg-[#edf0f4] px-2 py-1 text-[10px] font-semibold text-[#677287]">
                      Not connected
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-[#8a92a4]">
                    Gmail sign-in and syncing require backend integration.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled
                title="Available after Gmail authentication is implemented"
                className="cursor-not-allowed rounded-lg border border-[#dfe4eb] bg-[#f7f8fa] px-3.5 py-2 text-[11px] font-semibold text-[#9aa2b0]"
              >
                Connect Gmail · Coming later
              </button>
            </div>
          </SettingsSection>

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

            <div className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f3f8] text-[#687288]">
                  <CalendarDays size={17} />
                </span>

                <div>
                  <label
                    htmlFor="retention-period"
                    className="text-xs font-semibold text-[#35405a]"
                  >
                    Scan history retention
                  </label>

                  <p className="mt-1 text-[11px] leading-5 text-[#8a92a4]">
                    Saved preference only; automatic deletion is not active.
                  </p>
                </div>
              </div>

              <select
                id="retention-period"
                value={preferences.retentionDays}
                onChange={(
                  event: ChangeEvent<HTMLSelectElement>
                ) =>
                  updatePreferences({
                    ...preferences,
                    retentionDays:
                      event.target.value as RetentionPeriod,
                  })
                }
                className="rounded-lg border border-[#dfe4eb] bg-white px-3 py-2 text-xs font-medium text-[#596579] outline-none focus:border-[#8097df] focus:ring-2 focus:ring-[#e7ebfa]"
              >
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </select>
            </div>
          </SettingsSection>

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

          <SettingsSection
            title="Data and privacy"
            description="Data management will become available after backend integration."
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#edf0f4] py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f3f8] text-[#687288]">
                  <Download size={17} />
                </span>

                <div>
                  <p className="text-xs font-semibold text-[#35405a]">
                    Export scan history
                  </p>

                  <p className="mt-1 text-[11px] text-[#8a92a4]">
                    Download analyzed records when history storage is connected.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-[#dfe4eb] bg-[#f7f8fa] px-3.5 py-2 text-[11px] font-semibold text-[#9aa2b0]"
              >
                Export · Coming later
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fff0ed] text-[#c55243]">
                  <Trash2 size={17} />
                </span>

                <div>
                  <p className="text-xs font-semibold text-[#35405a]">
                    Delete scan history
                  </p>

                  <p className="mt-1 text-[11px] text-[#8a92a4]">
                    Deleting server records will require confirmation and backend support.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-[#f0d0ca] bg-[#fff8f7] px-3.5 py-2 text-[11px] font-semibold text-[#d09b92]"
              >
                Delete · Coming later
              </button>
            </div>
          </SettingsSection>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#9299aa]">
            {storageAvailable
              ? "Preferences are stored in this browser when changed."
              : "Preferences are temporary in this session."}
          </p>

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