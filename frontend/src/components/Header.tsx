
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Clock3,
  LoaderCircle,
  Menu,
  RefreshCw,
} from "lucide-react";
import type { EmailMode } from "../data/emailPresentation";

type HeaderProps = {
  onOpenMenu: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  lastLoadedAt: number | null;
  emailMode: EmailMode;
  onEmailModeChange: (mode: EmailMode) => void;
  title?: string;
  subtitle?: string;
};

function Header({
  onOpenMenu,
  loading,
  error,
  onRetry,
  lastLoadedAt,
  emailMode,
  onEmailModeChange,
  title = "Dashboard",
  subtitle = "Monitor and protect your inbox",
}: HeaderProps) {
  // Any failed dashboard API request enables the retry button.
  const connectionFailed = Boolean(error);
  const [now, setNow] = useState(() => Date.now());

  // The relative timestamp updates while the page is open.
  useEffect(() => {
    if (lastLoadedAt === null) return;

    const interval = window.setInterval(
      () => setNow(Date.now()),
      30_000
    );

    return () => window.clearInterval(interval);
  }, [lastLoadedAt]);

  function relativeTime(timestamp: number): string {
    const seconds = Math.max(
      0,
      Math.floor((now - timestamp) / 1000)
    );

    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours} hr ago`;

    const days = Math.floor(hours / 24);

    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return (
    <header className="phishlab-topbar-enter flex min-h-[72px] items-center justify-between gap-3 border-b border-[#e4e8ef] bg-white px-5 py-3 md:px-8">
      <div className="flex items-center gap-3">
        {/* Mobile navigation */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="text-[#596579] lg:hidden"
        >
          <Menu size={22} />
        </button>

        <div>
          <h1 className="text-base font-bold text-[#202a44]">
            {title}
          </h1>

          <p className="hidden text-[11px] text-[#9299aa] sm:block">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          aria-label="Email data mode"
          className="flex rounded-lg bg-[#f0f2f6] p-1"
        >
          {(["gmail", "demo"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={emailMode === mode}
              onClick={() => onEmailModeChange(mode)}
              disabled={loading}
              className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:px-3 sm:text-[11px] ${
                emailMode === mode
                  ? "bg-white text-[#28334f] shadow-sm"
                  : "text-[#788197] hover:text-[#3157d5]"
              }`}
            >
              {mode === "gmail" ? "Gmail inbox" : "Training demo"}
            </button>
          ))}
        </div>

        {/* Connection status */}
        <div
          role="status"
          title={
            !connectionFailed &&
            lastLoadedAt !== null
              ? `${emailMode === "gmail" ? "Gmail scan" : "Demo results"} last loaded: ${new Date(lastLoadedAt).toLocaleString()}.`
              : error ?? undefined
          }
          className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs md:flex ${
            connectionFailed
              ? "border-[#f1c9c9] bg-[#fff4f4] text-[#c03939]"
              : "border-[#d8ebdf] bg-[#f4fbf6] text-[#277c58]"
          }`}
        >
          {connectionFailed ? (
            <AlertCircle size={14} />
          ) : (
            <Clock3 size={14} />
          )}

          <span>
            {connectionFailed
              ? "Connection failed"
              : lastLoadedAt === null
                ? emailMode === "gmail" ? "Last scanned: never" : "Demo not loaded"
                : `${emailMode === "gmail" ? "Last scanned" : "Demo loaded"}: ${relativeTime(lastLoadedAt)}`}
          </span>
        </div>

        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          title={
            error ??
            (loading
              ? emailMode === "gmail" ? "Scanning Gmail" : "Loading training demo"
              : emailMode === "gmail" ? "Scan recent Gmail messages" : "Reload training demo")
          }
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition ${
            connectionFailed
              ? "bg-[#c63d3d] hover:bg-[#a92c2c]"
              : loading
                ? "cursor-wait bg-[#8294c9]"
                : "bg-[#3157d5] hover:bg-[#294ac0]"
          }`}
        >
          {loading ? (
            <LoaderCircle
              size={14}
              className="animate-spin"
            />
          ) : (
            <RefreshCw size={14} />
          )}

          <span>
            {connectionFailed
              ? emailMode === "gmail" ? "Retry scan" : "Retry demo"
              : loading
                ? emailMode === "gmail" ? "Scanning..." : "Loading..."
                : emailMode === "gmail" ? "Scan emails" : "Reload demo"}
          </span>
        </button>
      </div>
    </header>
  );
}

export default Header;
