
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Clock3,
  LoaderCircle,
  Menu,
  RefreshCw,
} from "lucide-react";

type HeaderProps = {
  onOpenMenu: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  lastLoadedAt: number | null;
  title?: string;
  subtitle?: string;
};

function Header({
  onOpenMenu,
  loading,
  error,
  onRetry,
  lastLoadedAt,
  title = "Dashboard",
  subtitle = "Monitor and protect your inbox",
}: HeaderProps) {
  // Any failed dashboard API request enables the retry button.
  const connectionFailed = Boolean(error);
  const [now, setNow] = useState(() => Date.now());

  // The relative timestamp updates while the page is open.
  useEffect(() => {
    if (connectionFailed || loading || lastLoadedAt === null) return;

    const interval = window.setInterval(
      () => setNow(Date.now()),
      30_000
    );

    return () => window.clearInterval(interval);
  }, [connectionFailed, loading, lastLoadedAt]);

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
    <header className="flex min-h-[72px] items-center justify-between gap-3 border-b border-[#e4e8ef] bg-white px-5 py-3 md:px-8">
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
        {/* Connection status */}
        <div
          role="status"
          title={
            !connectionFailed &&
            !loading &&
            lastLoadedAt !== null
              ? `Demo results last loaded: ${new Date(lastLoadedAt).toLocaleString()}. Gmail scanning is not connected.`
              : error ?? undefined
          }
          className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs md:flex ${
            connectionFailed
              ? "border-[#f1c9c9] bg-[#fff4f4] text-[#c03939]"
              : loading
                ? "border-[#e0e5ed] text-[#626d82]"
                : "border-[#d8ebdf] bg-[#f4fbf6] text-[#277c58]"
          }`}
        >
          {connectionFailed ? (
            <AlertCircle size={14} />
          ) : loading ? (
            <LoaderCircle
              size={14}
              className="animate-spin"
            />
          ) : (
            <Clock3 size={14} />
          )}

          <span>
            {connectionFailed
              ? "Connection failed"
              : loading
                ? "Connecting..."
                : lastLoadedAt === null
                  ? "No scan yet"
                  : `Last scanned: ${relativeTime(lastLoadedAt)}`}
          </span>
        </div>

        {/* Turns red and becomes clickable if the API fails. */}
        {/* Gmail scanning is not enabled. */}
        <button
          type="button"
          onClick={onRetry}
          disabled={!connectionFailed || loading}
          title={
            error ??
            (loading
              ? "Connecting to FastAPI"
              : "Gmail scanning is not available yet")
          }
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition ${
            connectionFailed
              ? "bg-[#c63d3d] hover:bg-[#a92c2c]"
              : loading
                ? "cursor-wait bg-[#8294c9]"
                : "cursor-not-allowed bg-[#3157d5] opacity-60"
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
              ? "Retry connection"
              : loading
                ? "Connecting..."
                : "Scan emails"}
          </span>
        </button>
      </div>
    </header>
  );
}

export default Header;
